from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, SystemMessage
from sqlmodel import Session, select

from backend.agents.llm_factory import get_llm
from backend.database import engine
from backend.models import Assessment, Candidate
from backend.models.github_verification import GitHubVerification
from backend.models.interrogation_session import InterrogationSession

_REPORT_SYSTEM = """You are a technical hiring analyst. Given a transcript of a technical interview, write three Markdown sections:

## Strengths
- 2–4 bullet points of competencies the candidate genuinely demonstrated.

## Weaknesses / Gaps
- 2–4 bullet points of clear gaps or areas where the candidate struggled.

## Hiring Recommendation
One direct sentence (e.g., "Recommend for hire" or "Do not recommend" or "Recommend with reservations") followed by a brief justification.

Write only these three sections. No preamble, no additional headers."""


def generate_report(candidate_id: int) -> str:
    try:
        with Session(engine) as session:
            candidate = session.get(Candidate, candidate_id)
            if not candidate:
                return "Report generation failed: candidate not found."

            session_row = session.exec(
                select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
            ).first()
            if not session_row:
                return "Report generation failed: no session found."

            assessments = session.exec(
                select(Assessment)
                .where(Assessment.session_id == session_row.id)
                .order_by(Assessment.question_number)  # type: ignore[arg-type]
            ).all()

            gh = session.exec(
                select(GitHubVerification).where(GitHubVerification.candidate_id == candidate_id)
            ).first()

            # Programmatic header
            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            outcome_label = {
                "terminated_success": "High Confidence Achieved",
                "terminated_fail": "Insufficient Proficiency Detected",
                "terminated_limit": "Session Limit Reached",
            }.get(session_row.session_status, session_row.session_status)

            lines = [
                "# Veridicus — Interrogation Report",
                "",
                f"**Candidate:** {candidate.name} ({candidate.email})",
                f"**Date:** {now}",
                f"**Outcome:** {outcome_label}",
                f"**Final Confidence:** {session_row.current_confidence:.0f}%",
                f"**Questions Asked:** {session_row.question_count}",
                "",
            ]

            if gh and not gh.github_skipped:
                lines += [
                    "## GitHub Verification",
                    gh.verification_summary[:1000] if gh.verification_summary else "No summary available.",
                    "",
                ]

            lines += ["## Q&A Transcript", ""]

            transcript_parts = []
            for a in assessments:
                answer_text = a.user_answer if a.user_answer else "(timeout)"
                score_text = f"{a.score:.0f}/100" if a.score is not None else "N/A"
                part = (
                    f"**Q{a.question_number} [{a.question_type}]:** {a.question_text}\n"
                    f"**Answer:** {answer_text}\n"
                    f"**Score:** {score_text} | **Feedback:** {a.feedback}"
                )
                transcript_parts.append(part)

            lines += ["\n\n---\n\n".join(transcript_parts), ""]

            programmatic_report = "\n".join(lines)

            # LLM-generated analysis
            transcript_for_llm = []
            total = 0
            for a in assessments:
                answer_text = a.user_answer if a.user_answer else "(timeout)"
                score_text = f"{a.score:.0f}/100" if a.score is not None else "N/A"
                entry = f"Q{a.question_number} [{a.question_type}]: {a.question_text}\nAnswer: {answer_text}\nScore: {score_text}\nFeedback: {a.feedback}"
                transcript_for_llm.append(entry)
                total += len(entry)
                if total > 8000:
                    break

            llm = get_llm(temperature=0.3)
            messages = [
                SystemMessage(content=_REPORT_SYSTEM),
                HumanMessage(
                    content=f"Interview transcript for {candidate.name}:\n\n" + "\n\n".join(transcript_for_llm)
                ),
            ]
            try:
                response = llm.invoke(messages)
                content = response.content
                if isinstance(content, list):
                    llm_sections = next((b["text"] for b in content if isinstance(b, dict) and b.get("type") == "text"), "")
                else:
                    llm_sections = content
                llm_sections = llm_sections.strip()
            except Exception:
                llm_sections = "Report generation failed."

            return programmatic_report + "\n" + llm_sections
    except Exception as e:
        return f"Report generation failed: {e}"
