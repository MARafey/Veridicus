import json
from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, SystemMessage
from sqlmodel import Session, select

from backend.agents.llm_factory import get_llm
from backend.database import engine
from backend.models import Assessment, Claim, SourceDocument
from backend.models.github_verification import GitHubVerification
from backend.models.interrogation_session import InterrogationSession

_INTERROGATOR_SYSTEM = """You are an expert technical interrogator for resume verification. Your job is to assess a candidate's true technical proficiency by generating targeted, adaptive questions based on their Q&A history and claimed skills.

## Question Types
- **MCQ**: Multiple-choice with exactly 4 options (A–D). Use for fundamental concepts, definitions, and factual knowledge.
- **TROUBLESHOOT**: Describe a broken/failing system and ask how they'd diagnose/fix it. Use for practical experience validation.
- **FILL_BLANK**: Complete a code snippet or technical statement by filling in the missing piece. The `prompt` MUST contain exactly one `___` (three underscores) marking the blank. The blank must represent a single specific value: an API name, decorator, command flag, function call, or keyword — NOT an explanation or description. Example: "In FastAPI, the decorator used to define a POST endpoint is `@app.___`." or "The pdfplumber method to extract text from a page is `page.___`."
- **WHAT_IF**: Hypothetical systems-design or architectural trade-off question. Use for senior-level depth assessment.

## Confidence Score (0–100)
- Reflects your cumulative confidence that the candidate genuinely has the claimed skills.
- Start near 0 and update after each answer based on score quality and pattern.
- Increase faster for consistently strong answers; decrease or stagnate for weak/timeout answers.

## Termination Conditions
- **TERMINATE_SUCCESS**: confidence ≥ 90 — candidate has demonstrated sufficient proficiency.
- **TERMINATE_FAIL**: consistent failure pattern (multiple consecutive very low scores) — candidate is unlikely to improve.
- **TERMINATE_LIMIT**: question_count + 1 >= 15 — safety cap reached.
- **CONTINUE**: none of the above — generate the next question.

## Output Format
Return ONLY valid JSON — no prose, no markdown fences:
{
  "assessment_status": "CONTINUE",
  "current_confidence_score": 45,
  "question_data": {
    "type": "MCQ",
    "context": "On your resume you mentioned React hooks...",
    "prompt": "The exact question shown to the candidate",
    "options": ["A. First option", "B. Second option", "C. Third option", "D. Fourth option"],
    "expected_answer_logic": "Correct answer is B because..."
  }
}
- `options` is required when type == MCQ; omit it for other types.
- Always include `question_data` even on termination (for audit purposes).
- Pick question types strategically — vary them; don't repeat the same type consecutively unless necessary.

## CRITICAL — Specificity required
- Every question MUST reference specific details from the candidate's resume context, PDF evidence, or GitHub repos provided below.
- Name the actual skill, project, tool, repo, file, or scenario — never ask generic questions like "Describe a challenge with your skills" or "What is X?".
- NEVER use bracket placeholders such as [specific problem], [X], [example], [insert here], [tool name], or any unfilled template text in the `prompt` field.
- If you don't have enough detail for a fully concrete question, pick a real skill from the claims list and ask a specific open-ended question about it using its context — do not fall back to vague language.

## CRITICAL — No Repeated Questions
- Review the Q&A History carefully. NEVER generate a question whose wording or topic is identical or highly similar to a question already listed in Q&A History.
- If the candidate answered poorly on a topic, ask about a DIFFERENT ASPECT of that topic, not the same question again.
- Scores marked "(evaluation error)" in the history are unreliable — do not treat them as evidence of failure.

## Interview Stage
The current interview stage and its specific rules are injected at the top of the human prompt.
You MUST follow the stage-specific question type restrictions and depth rules exactly.
Do not override or ignore stage instructions — they are mandatory guardrails, not suggestions.
"""


def _word_overlap(a: str, b: str) -> float:
    """Jaccard similarity between word sets of two strings."""
    import re as _re
    wa = set(_re.sub(r'[^\w\s]', '', a.lower()).split())
    wb = set(_re.sub(r'[^\w\s]', '', b.lower()).split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def _build_fallback_prompt(claims: list, gh: "GitHubVerification | None", index: int = 0) -> str:
    """Build a specific fallback TROUBLESHOOT question. `index` rotates through claims to avoid repeats."""
    if not claims:
        return "Walk me through a significant technical challenge from your work experience and how you resolved it."

    # Rotate through claims sorted by richest context so index=0 keeps original behaviour
    sorted_claims = sorted(claims, key=lambda c: len(c.context or ""), reverse=True)
    claim = sorted_claims[index % len(sorted_claims)]
    skill = claim.skill_name
    ctx = (claim.context or "").strip()

    # Pull matched repo names if available
    repo_names: list = []
    if gh and not gh.github_skipped and gh.matched_repos:
        try:
            repos = json.loads(gh.matched_repos)
            repo_names = [r.get("repo_name", "") for r in repos if r.get("repo_name")]
        except (json.JSONDecodeError, TypeError):
            pass

    # Vary the question template with index so even the same skill/repo produces a different sentence
    _templates_with_repo_ctx = [
        lambda s, c, r: (
            f"Your resume mentions: \"{c[:200]}\". "
            f"In the context of your {s} work on {r}, describe a specific technical problem you ran into, "
            f"how you diagnosed the root cause, and the steps you took to fix it."
        ),
        lambda s, c, r: (
            f"On your {s} project {r} your resume states: \"{c[:180]}\". "
            f"Walk me through a failure or edge-case you encountered and how you resolved it."
        ),
        lambda s, c, r: (
            f"Considering your {s} experience on {r} (\"{c[:160]}\"), "
            f"describe the most difficult debugging session you had and the root cause you found."
        ),
    ]
    _templates_repo_only = [
        lambda s, r: (
            f"Walk me through a concrete technical challenge you encountered in your {s} work on {r}. "
            f"What went wrong, how did you identify the cause, and how did you resolve it?"
        ),
        lambda s, r: (
            f"On your {s} repo {r}, describe a time something broke unexpectedly. "
            f"How did you diagnose it and what was the fix?"
        ),
    ]
    _templates_ctx_only = [
        lambda s, c: (
            f"Your resume states: \"{c[:200]}\". "
            f"Describe a specific technical problem you encountered while doing this {s} work, "
            f"and explain step by step how you diagnosed and resolved it."
        ),
        lambda s, c: (
            f"Regarding your {s} work (\"{c[:180]}\"), walk me through the hardest bug you debugged "
            f"and what the root cause turned out to be."
        ),
    ]
    _templates_generic = [
        lambda s: (
            f"Describe a real technical challenge you faced while working with {s}. "
            f"Be specific about what broke or failed, how you investigated it, and what your fix was."
        ),
        lambda s: (
            f"Tell me about a time your {s} code behaved unexpectedly in production or during testing. "
            f"How did you isolate the issue and fix it?"
        ),
    ]

    if repo_names and ctx:
        repo_str = ", ".join(f"`{r}`" for r in repo_names[:2])
        tmpl = _templates_with_repo_ctx[index % len(_templates_with_repo_ctx)]
        return tmpl(skill, ctx, repo_str)
    elif repo_names:
        repo_str = ", ".join(f"`{r}`" for r in repo_names[:2])
        tmpl = _templates_repo_only[index % len(_templates_repo_only)]
        return tmpl(skill, repo_str)
    elif ctx:
        tmpl = _templates_ctx_only[index % len(_templates_ctx_only)]
        return tmpl(skill, ctx)
    else:
        tmpl = _templates_generic[index % len(_templates_generic)]
        return tmpl(skill)


def _build_breadth_fallback(claims: list, asked_texts: list[str], index: int = 0) -> tuple[str, str]:
    """Return (question_type, prompt) for a breadth-stage fallback — always FILL_BLANK, unique per skill."""
    if not claims:
        return (
            "FILL_BLANK",
            "The cloud platform widely used for scalable compute and object storage is `___`.",
        )

    # Prefer a skill whose name doesn't appear in any already-asked question
    asked_lower = " ".join(asked_texts).lower()
    uncovered = [c for c in claims if c.skill_name.lower() not in asked_lower]
    pool = uncovered if uncovered else claims
    claim = pool[index % len(pool)]

    skill = claim.skill_name
    ctx = (claim.context or "").strip()

    _templates_with_ctx = [
        lambda s, c: (
            f"Your resume describes your {s} experience as: \"{c[:120]}\". "
            f"The specific tool, service, or method central to this {s} task is `___`."
        ),
        lambda s, c: (
            f"In your {s} work (\"{c[:100]}\"), the core library or service you would use is `___`."
        ),
        lambda s, c: (
            f"Based on your resume's {s} description (\"{c[:100]}\"), "
            f"the primary command or API call that drives this workflow is `___`."
        ),
    ]
    _templates_no_ctx = [
        lambda s: f"In {s}, the primary built-in method or service used for the core operation is `___`.",
        lambda s: f"The main tool or command in {s} that handles the fundamental operation is `___`.",
        lambda s: f"When working with {s}, the standard entry-point function or service is called `___`.",
    ]

    if ctx:
        tmpl = _templates_with_ctx[index % len(_templates_with_ctx)]
        return ("FILL_BLANK", tmpl(skill, ctx))
    else:
        tmpl = _templates_no_ctx[index % len(_templates_no_ctx)]
        return ("FILL_BLANK", tmpl(skill))


def _safe_fallback(
    current_stage: str,
    claims: list,
    gh: "GitHubVerification | None",
    prev_questions: list[str],
    prev_answers: list[str],
) -> tuple[str, str, list | None]:
    """
    Return (q_type, q_prompt, q_options) for a safe fallback that is not a duplicate
    and not contaminated by previous answers. Tries indexed variants until one passes.
    """
    max_tries = max(len(claims), 1) * 4 + 2
    for idx in range(max_tries):
        if current_stage == "breadth":
            q_type, q_prompt = _build_breadth_fallback(claims, prev_questions, index=idx)
            q_options = None
        else:
            q_prompt = _build_fallback_prompt(claims, gh, index=idx)
            q_type = "TROUBLESHOOT"
            q_options = None

        is_dup = any(_word_overlap(q_prompt, pq) > 0.55 for pq in prev_questions)
        is_cont = any(_word_overlap(q_prompt, pa) > 0.45 for pa in prev_answers)
        if not is_dup and not is_cont:
            return q_type, q_prompt, q_options

    # Absolute last resort — generic sentence unlikely to match any prior question
    return (
        "TROUBLESHOOT",
        "Walk me through the most technically challenging project on your resume and explain the core problem you solved.",
        None,
    )


def generate_next_question(candidate_id: int) -> dict:
    with Session(engine) as session:
        # Get or create session row
        session_row = session.exec(
            select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
        ).first()

        if not session_row:
            now = datetime.now(timezone.utc).isoformat()
            session_row = InterrogationSession(
                candidate_id=candidate_id,
                session_status="active",
                current_confidence=0.0,
                question_count=0,
                created_at=now,
                updated_at=now,
            )
            session.add(session_row)
            session.commit()
            session.refresh(session_row)

        # Double-call protection: if last question is unanswered, return it
        if session_row.question_count > 0:
            last_assessment = session.exec(
                select(Assessment)
                .where(Assessment.session_id == session_row.id)
                .order_by(Assessment.question_number.desc())  # type: ignore[arg-type]
            ).first()
            if last_assessment and last_assessment.score is None and last_assessment.user_answer is None:
                options = None
                if last_assessment.options:
                    try:
                        options = json.loads(last_assessment.options)
                    except json.JSONDecodeError:
                        options = None
                return {
                    "assessment_id": last_assessment.id,
                    "assessment_status": "CONTINUE",
                    "current_confidence_score": session_row.current_confidence,
                    "question_number": last_assessment.question_number,
                    "question_type": last_assessment.question_type,
                    "question_text": last_assessment.question_text,
                    "options": options,
                    "source": last_assessment.source,
                    "session_status": session_row.session_status,
                    "current_stage": getattr(last_assessment, "stage", None) or session_row.current_stage,
                }

        # Assemble context
        claims = session.exec(
            select(Claim).where(Claim.candidate_id == candidate_id)
        ).all()

        claims_text = "\n".join(f"- {c.skill_name}: {c.context}" for c in claims)

        # PDF evidence (cap each doc at 2000 chars, total at 8000)
        pdf_parts = []
        pdf_total = 0
        for claim in claims:
            if pdf_total >= 8000:
                break
            docs = session.exec(
                select(SourceDocument).where(SourceDocument.claim_id == claim.id)
            ).all()
            for doc in docs:
                if pdf_total >= 8000:
                    break
                snippet = doc.extracted_text[:2000]
                pdf_parts.append(f"[{doc.document_title}]\n{snippet}")
                pdf_total += len(snippet)
        pdf_context = "\n\n".join(pdf_parts) if pdf_parts else "No PDF documents available."

        # GitHub summary
        gh = session.exec(
            select(GitHubVerification).where(GitHubVerification.candidate_id == candidate_id)
        ).first()
        github_summary = "No GitHub data."
        if gh and not gh.github_skipped:
            github_summary = gh.verification_summary[:2000]

        # Q&A history
        history_assessments = session.exec(
            select(Assessment)
            .where(Assessment.session_id == session_row.id)
            .order_by(Assessment.question_number)  # type: ignore[arg-type]
        ).all()

        history_parts = []
        history_total = 0
        consecutive_fails = 0
        _streak = 0
        for a in history_assessments:
            answer_text = a.user_answer if a.user_answer else "(timeout)"
            if a.feedback and "Could not parse" in a.feedback:
                score_str = "0/100 (evaluation error — score unreliable)"
            else:
                score_str = f"{a.score}/100" if a.score is not None else "unscored"
            entry = f"Q{a.question_number} [{a.question_type}]: {a.question_text}\nAnswer: {answer_text}\nScore: {score_str}"
            history_parts.append(entry)
            history_total += len(entry)
            if history_total > 4000:
                break
            # Track consecutive fail streak
            if a.score is not None and a.score < 25:
                _streak += 1
            else:
                _streak = 0
            consecutive_fails = _streak

        history_text = "\n\n".join(history_parts) if history_parts else "No questions answered yet."

        prev_question_texts = "\n".join(
            f"- {a.question_text[:120]}" for a in history_assessments
        ) or "None yet."

        # ── Stage transition ──────────────────────────────────────────────────────────
        breadth_limit = min(max(len(claims), 2), 4)
        current_stage = session_row.current_stage   # "breadth" or "deepdive"
        weak_skills: list[str] = []

        if current_stage == "breadth" and session_row.question_count >= breadth_limit:
            breadth_assessments = [
                a for a in history_assessments if getattr(a, "stage", None) == "breadth"
            ]
            skill_scores: dict[str, list[float]] = {c.skill_name: [] for c in claims}
            for a in breadth_assessments:
                if a.score is not None:
                    for claim in claims:
                        if claim.skill_name.lower() in (a.question_text or "").lower():
                            skill_scores[claim.skill_name].append(a.score)
                            break
            for skill_name, scores in skill_scores.items():
                if not scores or (sum(scores) / len(scores)) < 60:
                    weak_skills.append(skill_name)
            current_stage = "deepdive"
            session_row.current_stage = "deepdive"
        # ── End stage transition ──────────────────────────────────────────────────────

        # LLM call
        llm = get_llm(temperature=0.5)

        if current_stage == "breadth":
            stage_block = (
                "## Current Stage: BREADTH SCAN\n"
                "Generate 1 surface-level question for a skill NOT yet covered in the Q&A History. "
                "You MUST use question type MCQ or FILL_BLANK. "
                "Do NOT ask deep architecture, system-design, or trade-off questions. "
                "Goal: verify general familiarity only."
            )
        else:
            weak_list_str = ", ".join(weak_skills) if weak_skills else "all claimed skills"
            stage_block = (
                "## Current Stage: DEEP DIVE\n"
                f"Weak skills from breadth scan: {weak_list_str}. "
                "Focus exclusively on these weak skills. "
                "You MUST use question type TROUBLESHOOT or WHAT_IF. "
                "Push into constraints, failure scenarios, and architectural trade-offs. "
                "Do NOT ask simple factual or definition questions."
            )

        human_content = f"""{stage_block}

## Candidate Profile
Claims/Skills:
{claims_text}

## PDF Evidence
{pdf_context[:8000]}

## GitHub Summary
{github_summary}

## Session Progress
Question {session_row.question_count}/15 | Confidence: {session_row.current_confidence:.0f}% | Consecutive fails: {consecutive_fails} | Stage: {current_stage.upper()}

## Q&A History
{history_text}

## Previously Asked Questions — DO NOT REPEAT
{prev_question_texts}

---
Generate question #{session_row.question_count + 1} for this candidate.
Rules:
- Be adaptive — probe weak areas, vary question types, skip topics where confidence is proven.
- Your question MUST be grounded in the specific resume claims, PDF excerpts, or GitHub repos shown above. Name the actual skill/project/tool/repo — do NOT ask generic questions.
- If the candidate has GitHub repos listed, reference a specific repo name or matched claim in the question.
- If PDF evidence exists, draw the question from actual content in those docs.
Return valid JSON only."""

        messages = [
            SystemMessage(content=_INTERROGATOR_SYSTEM),
            HumanMessage(content=human_content),
        ]

        try:
            response = llm.invoke(messages)
            content = response.content
            if isinstance(content, list):
                raw = next((b["text"] for b in content if isinstance(b, dict) and b.get("type") == "text"), "")
            else:
                raw = content
            raw = raw.strip()

            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            raw = raw.strip()

            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start != -1 and end > start:
                raw = raw[start:end]

            data = json.loads(raw)
        except Exception:
            data = {}

        # Pre-compute prev lists used by guards below
        prev_questions = [a.question_text for a in history_assessments]
        prev_answers = [a.user_answer for a in history_assessments if a.user_answer]

        # Extract question data with stage-aware fallback
        q = data.get("question_data", {})
        if not q or not q.get("prompt"):
            fb_type, fb_prompt, fb_opts = _safe_fallback(
                current_stage, list(claims), gh, prev_questions, prev_answers
            )
            q = {
                "type": fb_type,
                "context": "Fallback — LLM parse failed.",
                "prompt": fb_prompt,
                "expected_answer_logic": "Open-ended; evaluate depth of understanding and problem-solving process.",
            }
            if fb_opts:
                q["options"] = fb_opts
            data["assessment_status"] = data.get("assessment_status", "CONTINUE")
            data["current_confidence_score"] = data.get("current_confidence_score", session_row.current_confidence)

        assessment_status = data.get("assessment_status", "CONTINUE")
        new_confidence = float(data.get("current_confidence_score", session_row.current_confidence))
        q_type = q.get("type", "TROUBLESHOOT")
        q_prompt = q.get("prompt", "")
        q_options = q.get("options") if q_type == "MCQ" else None
        q_expected = q.get("expected_answer_logic", "")

        import re as _re

        # Safety net: bracket placeholders like [specific problem] → stage-aware fallback
        if _re.search(r"\[[^\]]{1,60}\]", q_prompt):
            q_type, q_prompt, q_options = _safe_fallback(
                current_stage, list(claims), gh, prev_questions, prev_answers
            )

        # FILL_BLANK safety: malformed (missing ___) → stage-aware fallback
        if q_type == "FILL_BLANK" and "___" not in q_prompt:
            q_type, q_prompt, q_options = _safe_fallback(
                current_stage, list(claims), gh, prev_questions, prev_answers
            )

        # Guard A — Question deduplication (Jaccard similarity)
        if any(_word_overlap(q_prompt, pq) > 0.55 for pq in prev_questions):
            q_type, q_prompt, q_options = _safe_fallback(
                current_stage, list(claims), gh, prev_questions, prev_answers
            )

        # Guard B — Answer-contamination detection
        if any(_word_overlap(q_prompt, pa) > 0.45 for pa in prev_answers):
            q_type, q_prompt, q_options = _safe_fallback(
                current_stage, list(claims), gh, prev_questions, prev_answers
            )

        # Belt-and-suspenders 15-question cap
        if session_row.question_count + 1 >= 15 and assessment_status == "CONTINUE":
            assessment_status = "TERMINATE_LIMIT"

        # Determine source
        source = "pdf"
        if gh and not gh.github_skipped:
            context_text = q.get("context", "") + q_prompt
            try:
                matched_repos = json.loads(gh.matched_repos) if gh.matched_repos else []
            except json.JSONDecodeError:
                matched_repos = []
            for repo_entry in matched_repos:
                repo_name = repo_entry.get("repo_name", repo_entry.get("repo", ""))
                if repo_name and repo_name.lower() in context_text.lower():
                    source = "github"
                    break

        # DB writes
        new_assessment = Assessment(
            candidate_id=candidate_id,
            question_text=q_prompt,
            expected_answer_context=q_expected,
            source=source,
            question_type=q_type,
            options=json.dumps(q_options) if q_options else None,
            question_number=session_row.question_count + 1,
            session_id=session_row.id,
            stage=current_stage,    # NEW
        )
        session.add(new_assessment)
        session.commit()
        session.refresh(new_assessment)

        session_row.current_confidence = new_confidence
        session_row.question_count += 1
        session_row.updated_at = datetime.now(timezone.utc).isoformat()

        # Handle termination
        status_map = {
            "TERMINATE_SUCCESS": "terminated_success",
            "TERMINATE_FAIL": "terminated_fail",
            "TERMINATE_LIMIT": "terminated_limit",
        }
        if assessment_status in status_map:
            session_row.session_status = status_map[assessment_status]
            session.add(session_row)
            session.commit()
            session.refresh(session_row)

            # Generate report inline
            from backend.agents.report_generator_agent import generate_report
            report = generate_report(candidate_id)
            session_row.final_report = report
            session.add(session_row)
            session.commit()
        else:
            session.add(session_row)
            session.commit()

        return {
            "assessment_id": new_assessment.id,
            "assessment_status": assessment_status,
            "current_confidence_score": new_confidence,
            "question_number": session_row.question_count,
            "question_type": q_type,
            "question_text": q_prompt,
            "options": q_options,
            "source": source,
            "session_status": session_row.session_status,
            "current_stage": current_stage,
        }
