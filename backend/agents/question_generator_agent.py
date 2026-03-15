import json
from typing import Any, Dict, List

from langchain_core.messages import HumanMessage, SystemMessage
from sqlmodel import Session

from backend.agents.llm_factory import get_llm
from backend.agents.state import ExtractedProject, GeneratedQuestion, PolygraphState, ScrapedDocument
from backend.database import engine
from backend.models import Assessment

QUESTION_SYSTEM = """You are a senior technical interviewer conducting a deep technical assessment.
You have access to:
1. Technical documentation about a skill
2. The candidate's actual projects that use this skill

Generate 6-8 questions spread across ALL four categories below. Each category MUST have at least 1 question.

CATEGORIES:
- TECHNICAL: Deep understanding questions from the documentation. Non-trivial, specific.
- ARCHITECTURE: Questions about design decisions made IN the candidate's actual projects.
  E.g. "In your [project], why did you choose [tech] over alternatives? What trade-offs did you consider?"
- WHAT_IF_SCENARIO: Hypothetical changes to the candidate's actual projects.
  E.g. "If [project] needed to handle 100x more traffic, how would the architecture change?"
  E.g. "If you had to rebuild [project] today, what would you do differently and why?"
- WHAT_IF_STACK: Technology substitution / addition questions tied to the candidate's projects.
  E.g. "How would [project] change if you replaced [current tech] with [alternative]?"
  E.g. "If you were to add blockchain to [project] for data integrity, how would you architect that?"
  E.g. "If [project] had to be rebuilt in [different language], what patterns would change?"

Return ONLY valid JSON:
{
  "questions": [
    {
      "question_text": "...",
      "expected_answer_context": "The answer should cover...",
      "category": "TECHNICAL"
    }
  ]
}"""


def _parse_raw(raw: str) -> dict:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    start, end = raw.find("{"), raw.rfind("}") + 1
    if start != -1 and end > start:
        raw = raw[start:end]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _format_projects(projects: List[ExtractedProject], skill_name: str) -> str:
    if not projects:
        return "No specific projects mentioned."
    lines = []
    for p in projects:
        # Include all projects — the LLM will pick relevant ones
        lines.append(
            f"- {p.project_name} | Stack: {p.tech_stack} | {p.description}"
        )
    return "\n".join(lines)


def _generate_for_skill(
    doc: ScrapedDocument,
    projects: List[ExtractedProject],
    candidate_id: int,
) -> List[GeneratedQuestion]:
    llm = get_llm(temperature=0.5)
    context_snippet = doc.extracted_text[:8000]
    project_context = _format_projects(projects, doc.skill_name)

    messages = [
        SystemMessage(content=QUESTION_SYSTEM),
        HumanMessage(
            content=(
                f"Skill being assessed: {doc.skill_name}\n\n"
                f"Candidate's projects:\n{project_context}\n\n"
                f"Technical documentation / reference material:\n{context_snippet}\n\n"
                "Generate 6-8 questions covering all four categories (TECHNICAL, ARCHITECTURE, WHAT_IF_SCENARIO, WHAT_IF_STACK). "
                "Reference the candidate's actual projects by name in ARCHITECTURE and WHAT_IF questions."
            )
        ),
    ]

    response = llm.invoke(messages)
    data = _parse_raw(response.content.strip())

    questions = []
    for q in data.get("questions", []):
        questions.append(
            GeneratedQuestion(
                question_text=q["question_text"],
                expected_answer_context=q.get("expected_answer_context", ""),
                candidate_id=candidate_id,
            )
        )
    return questions


def question_generator_node(state: PolygraphState) -> Dict[str, Any]:
    all_questions: List[GeneratedQuestion] = []
    projects = state.get("extracted_projects", [])

    docs = state.get("scraped_documents", [])

    # Fallback: generate from resume text if no docs were scraped
    if not docs:
        for skill in state.get("extracted_skills", [])[:3]:
            doc = ScrapedDocument(
                skill_name=skill.skill_name,
                claim_id=0,
                document_title="resume context",
                document_url="",
                local_path="",
                extracted_text=state["resume_text"][:8000],
            )
            docs.append(doc)

    seen_skills = set()
    for doc in docs:
        if doc.skill_name in seen_skills:
            continue
        seen_skills.add(doc.skill_name)
        try:
            questions = _generate_for_skill(doc, projects, state["candidate_id"])
            all_questions.extend(questions)
        except Exception:
            continue

    # Persist to DB
    with Session(engine) as session:
        for q in all_questions:
            assessment = Assessment(
                candidate_id=q.candidate_id,
                question_text=q.question_text,
                expected_answer_context=q.expected_answer_context,
            )
            session.add(assessment)
        session.commit()

    return {
        "generated_questions": all_questions,
        "pipeline_status": "ready",
    }
