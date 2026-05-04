"""Code Verification Agent — audits a candidate's public GitHub repos against resume claims."""
import json
from typing import Any, Dict, List

from langchain_core.messages import HumanMessage, SystemMessage
from sqlmodel import Session

from backend.agents.llm_factory import get_llm
from backend.agents.state import PolygraphState
from backend.database import engine
from backend.models import Assessment
from backend.models.github_verification import GitHubVerification
from backend.services import github_service

# ---------------------------------------------------------------------------
# LLM prompt templates
# ---------------------------------------------------------------------------

_REPO_MAPPING_SYSTEM = """You are a technical recruiter assistant. Given a candidate's resume
claims and a list of their GitHub repositories (name, description, README snippet), identify
which repos best match each claim.

Return ONLY valid JSON:
{
  "matches": [
    {
      "repo_name": "my-fastapi-app",
      "branch_to_use": "main",
      "matched_claim": "FastAPI",
      "match_type": "project_match",
      "confidence": "high"
    }
  ]
}

Rules:
- Return at most 5 matches (highest confidence ones).
- match_type must be "project_match" (repo name/description directly corresponds to a
  named resume project) or "skill_match" (repo demonstrates a claimed language/skill
  but wasn't an explicitly named project).
- confidence must be "high", "medium", or "low".
- Only include matches where the repo genuinely demonstrates the claimed skill.
- branch_to_use: always set to "main" — the pipeline will validate the real branch later."""


_FILE_PICKER_SYSTEM = """You are a senior code reviewer. Given a repository file tree and a
resume claim context, pick the 5 most relevant source files to read for a technical audit.

Return ONLY valid JSON:
{"files": ["src/main.py", "src/services/auth.py", "tests/test_auth.py"]}

Prefer:
- Core application logic files
- Complex algorithms or data processing
- Architecture-defining files (routers, services, models)
- Test files that reveal design decisions
Avoid: lock files, auto-generated code, images, markdown docs."""


_AUDIT_SYSTEM = """You are a senior software engineer performing a technical audit.
Given a candidate's resume claim and the actual code from their repository, assess alignment.

Return ONLY valid JSON:
{
  "alignment": "strong",
  "red_flags": ["No error handling", "Hardcoded secrets"],
  "seniority_assessment": "The code shows junior-level patterns...",
  "languages": ["Python", "FastAPI", "SQLAlchemy"],
  "resources": ["JWT authentication", "async route handlers", "dependency injection"]
}

alignment must be one of: "strong", "partial", "weak", "missing".
languages: the actual programming languages and frameworks visible in the audited files.
resources: specific implementations, libraries, or architectural patterns found in the code (3-6 items)."""


_SKILL_AUDIT_SYSTEM = """You are a senior software engineer auditing a candidate's proficiency
in a specific programming language or technology based on their actual code.

Focus on:
- Idiomatic usage of the language (not just "it works", but "it's written well")
- Design patterns typical for this language/ecosystem
- Code quality indicators: error handling, naming, structure, testing
- Any anti-patterns or signs of copy-paste / surface-level understanding

Return ONLY valid JSON:
{
  "alignment": "strong",
  "red_flags": ["Uses global state antipattern", "No type hints despite claiming Python expertise"],
  "seniority_assessment": "Demonstrates solid Python idioms...",
  "languages": ["Python", "asyncio"],
  "resources": ["dataclasses", "context managers", "list comprehensions", "pytest fixtures"]
}

alignment must be one of: "strong", "partial", "weak", "missing".
languages: actual languages/frameworks seen in the code.
resources: idiomatic patterns, standard library modules, or ecosystem tools observed."""


_SKILL_QUESTION_SYSTEM = """You are a senior technical interviewer who has audited a candidate's
code to assess their proficiency in a specific language or technology.

Generate probing questions that reference SPECIFIC files, functions, or patterns you observed.

Guidelines:
- Ask about language-level decisions: why this pattern over another, what trade-offs were considered
- Reference actual file names and function names from the code
- Probe for depth: edge cases, performance implications, language-specific pitfalls
- Include at least one question about an anti-pattern or area for improvement you observed

NEVER use bracket placeholders. Every question must name real files, functions, or patterns
you actually saw in the code.

Return ONLY valid JSON:
{
  "questions": [
    {
      "question_text": "...",
      "expected_answer_context": "..."
    }
  ]
}

Generate 3-5 questions."""


_QUESTION_SYSTEM = """You are a senior technical interviewer who has just audited a candidate's
actual code. Generate probing questions that reference SPECIFIC files, functions, or
architectural decisions you observed.

Guidelines:
- Reference exact filenames and function names from the code
- Ask about WHY decisions were made, not just what the code does
- Probe for depth: edge cases, trade-offs, scalability
- Include at least one question about a potential weakness or improvement area
- Do NOT ask generic textbook questions

DO ask: "In your file `auth/jwt.py`, the `create_token()` function uses HS256. Why did you
choose symmetric over asymmetric signing, and what are the security implications?"

DON'T ask: "What is JWT and how does it work?"

NEVER use bracket placeholders such as [specific problem], [X], [example], [filename], [function name],
or any unfilled template text. Every question must name real files, functions, and patterns you
actually saw in the code provided. If a detail is not available, ask directly about the skill — never leave brackets.

Return ONLY valid JSON:
{
  "questions": [
    {
      "question_text": "...",
      "expected_answer_context": "..."
    }
  ]
}

Generate 3-5 questions."""


# ---------------------------------------------------------------------------
# Node implementation
# ---------------------------------------------------------------------------

def code_verification_node(state: PolygraphState) -> Dict[str, Any]:
    candidate_id = state["candidate_id"]
    github_username = state.get("github_username")
    llm = get_llm(temperature=0.2)

    # Phase 1 — skip if no GitHub username
    if not github_username:
        with Session(engine) as session:
            verification = GitHubVerification(
                candidate_id=candidate_id,
                github_username="",
                github_skipped=True,
            )
            session.add(verification)
            session.commit()
        return {"pipeline_status": "generating", "github_verified": False}

    calls = [0]  # mutable counter passed by reference

    # Phase 2 — Targeted repo search using resume skills + project names
    skill_terms = [s.skill_name for s in state.get("extracted_skills", [])]
    project_terms = [p.project_name for p in state.get("extracted_projects", [])]
    # Combine skills + project names as search terms; project names may be multi-word so split them
    raw_terms = skill_terms + [word for name in project_terms for word in name.split()]
    # Deduplicate and drop very short/generic words
    _seen: set = set()
    search_terms: List[str] = []
    for t in raw_terms:
        t_clean = t.strip()
        if len(t_clean) > 2 and t_clean.lower() not in _seen:
            _seen.add(t_clean.lower())
            search_terms.append(t_clean)

    repos = github_service.search_user_repos(github_username, search_terms, calls)

    # Secondary: language-qualified searches for top skill terms
    # Use only skill names that could be programming languages (> 2 chars, no spaces)
    lang_candidates = [s for s in skill_terms if " " not in s][:3]  # cap at 3 extra calls
    seen_names = {r["name"] for r in repos}
    for lang in lang_candidates:
        lang_repos = github_service.search_repos_by_language(github_username, lang, calls)
        for r in lang_repos:
            if r["name"] not in seen_names:
                repos.append(r)
                seen_names.add(r["name"])

    if not repos:
        with Session(engine) as session:
            verification = GitHubVerification(
                candidate_id=candidate_id,
                github_username=github_username,
                verification_summary="No public repositories found or GitHub API unreachable.",
                github_skipped=False,
            )
            session.add(verification)
            session.commit()
        return {"pipeline_status": "generating", "github_verified": False}

    # Fetch READMEs for the already-filtered repos (up to 10)
    repo_summaries = []
    for repo in repos[:10]:
        readme = github_service.get_readme(github_username, repo["name"], calls)
        repo_summaries.append({
            "name": repo["name"],
            "description": repo.get("description") or "",
            "readme_snippet": readme[:500],
            "language": repo.get("language") or "",
            "default_branch": repo.get("default_branch", "main"),
        })

    skills_context = "\n".join(
        f"- {s.skill_name}: {s.context}" for s in state.get("extracted_skills", [])
    )

    mapping_response = llm.invoke([
        SystemMessage(content=_REPO_MAPPING_SYSTEM),
        HumanMessage(content=(
            f"Resume claims:\n{skills_context}\n\n"
            f"Repositories:\n{json.dumps(repo_summaries, indent=2)}"
        )),
    ])
    mapping_raw = _strip_fences(mapping_response.content)

    try:
        mapping_data = json.loads(mapping_raw)
        matches = mapping_data.get("matches", [])[:5]
    except Exception:
        matches = []

    if not matches:
        with Session(engine) as session:
            verification = GitHubVerification(
                candidate_id=candidate_id,
                github_username=github_username,
                matched_repos="[]",
                verification_summary="No repositories matched the resume claims.",
            )
            session.add(verification)
            session.commit()
        return {"pipeline_status": "generating", "github_verified": False}

    # Validate / resolve branches for each match
    matched_repos_meta = []
    for match in matches:
        repo_name = match["repo_name"]
        branches = github_service.get_branches(github_username, repo_name, calls)
        # Prefer dev/staging/feature branches; fall back to default_branch
        default_branch = next(
            (r["default_branch"] for r in repos if r["name"] == repo_name), "main"
        )
        preferred = ["dev", "develop", "staging"]
        chosen_branch = default_branch
        for b in branches:
            if b in preferred or b.startswith("feature/"):
                chosen_branch = b
                break
        matched_repos_meta.append({
            "repo_name": repo_name,
            "branch": chosen_branch,
            "matched_claim": match.get("matched_claim", ""),
            "match_type": match.get("match_type", "project_match"),
            "url": f"https://github.com/{github_username}/{repo_name}",
            "language": next((r["language"] for r in repo_summaries if r["name"] == repo_name), ""),
        })

    # Phase 3 — Code audit per repo
    all_audit_summaries: List[str] = []
    all_questions: List[Dict[str, str]] = []

    for repo_meta in matched_repos_meta:
        repo_name = repo_meta["repo_name"]
        branch = repo_meta["branch"]
        claim = repo_meta["matched_claim"]

        file_tree = github_service.get_file_tree(github_username, repo_name, branch, calls)
        if not file_tree:
            continue

        # Pick relevant files
        tree_str = "\n".join(file_tree[:200])  # cap tree size
        picker_response = llm.invoke([
            SystemMessage(content=_FILE_PICKER_SYSTEM),
            HumanMessage(content=(
                f"Claim: {claim}\n\nFile tree for {repo_name}:\n{tree_str}"
            )),
        ])
        picker_raw = _strip_fences(picker_response.content)

        try:
            picker_data = json.loads(picker_raw)
            chosen_files = picker_data.get("files", [])[:5]
        except Exception:
            chosen_files = []

        # Fetch file contents
        file_contents: List[str] = []
        for fpath in chosen_files:
            content = github_service.get_file_content(
                github_username, repo_name, fpath, branch, calls
            )
            if content:
                file_contents.append(f"### {fpath}\n\n```\n{content}\n```")

        if not file_contents:
            continue

        audit_context = "\n\n".join(file_contents)
        # Cap total audit context
        if len(audit_context) > 12000:
            audit_context = audit_context[:12000] + "\n\n[...truncated...]"

        match_type = repo_meta.get("match_type", "project_match")

        # Audit pass — select system prompt by match type
        audit_system = _SKILL_AUDIT_SYSTEM if match_type == "skill_match" else _AUDIT_SYSTEM
        audit_response = llm.invoke([
            SystemMessage(content=audit_system),
            HumanMessage(content=(
                f"Resume claim: {claim}\n\nCode:\n\n{audit_context}"
            )),
        ])
        audit_raw = _strip_fences(audit_response.content)
        try:
            audit_data = json.loads(audit_raw)
        except Exception:
            audit_data = {"alignment": "unknown", "red_flags": [], "seniority_assessment": "",
                          "languages": [], "resources": []}

        audit_languages = audit_data.get("languages", [])
        audit_resources = audit_data.get("resources", [])

        # Store language/resource data back into meta for JSON serialisation
        repo_meta["audit_languages"] = audit_languages
        repo_meta["audit_resources"] = audit_resources

        audit_summary = (
            f"Repo: {repo_name} | Claim: {claim} | "
            f"Alignment: {audit_data.get('alignment', 'unknown')}\n"
            f"Seniority: {audit_data.get('seniority_assessment', '')}\n"
            f"Red flags: {'; '.join(audit_data.get('red_flags', []))}"
        )
        all_audit_summaries.append(audit_summary)

        # Phase 4 — Question generation — select system prompt by match type
        q_system = _SKILL_QUESTION_SYSTEM if match_type == "skill_match" else _QUESTION_SYSTEM
        q_response = llm.invoke([
            SystemMessage(content=q_system),
            HumanMessage(content=(
                f"Repository: {repo_name} (branch: {branch})\n"
                f"Resume claim: {claim}\n\n"
                f"Code I audited:\n\n{audit_context}"
            )),
        ])
        q_raw = _strip_fences(q_response.content)
        try:
            q_data = json.loads(q_raw)
            all_questions.extend(q_data.get("questions", []))
        except Exception:
            pass

    # Persist to DB
    verification_summary = "\n\n---\n\n".join(all_audit_summaries) if all_audit_summaries else (
        "GitHub repositories found but no auditable code was accessible."
    )
    matched_repos_json = json.dumps(matched_repos_meta)

    with Session(engine) as session:
        verification = GitHubVerification(
            candidate_id=candidate_id,
            github_username=github_username,
            matched_repos=matched_repos_json,
            verification_summary=verification_summary,
        )
        session.add(verification)

        for q in all_questions:
            assessment = Assessment(
                candidate_id=candidate_id,
                question_text=q.get("question_text", ""),
                expected_answer_context=q.get("expected_answer_context", ""),
                source="github",
            )
            session.add(assessment)

        session.commit()

    return {"pipeline_status": "generating", "github_verified": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_fences(raw) -> str:
    """Accept str or list-of-blocks (claude-opus-4-6 content format)."""
    if isinstance(raw, list):
        raw = next((b["text"] for b in raw if isinstance(b, dict) and b.get("type") == "text"), "")
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        if len(parts) >= 3:
            raw = parts[1]
            if raw.startswith("json"):
                raw = raw[4:]
    return raw.strip()
