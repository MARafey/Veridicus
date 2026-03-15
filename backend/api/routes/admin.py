import shutil
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, text

from backend.config import settings
from backend.database import get_session
from backend.models import Assessment, Candidate, Claim
from backend.models.github_verification import GitHubVerification
from backend.models.interrogation_session import InterrogationSession

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/flush", status_code=200)
def flush_database(session: Session = Depends(get_session)):
    """Delete every row from every table and remove all downloaded PDFs."""

    # Delete in FK-safe order (children before parents)
    tables = [
        "assessments",
        "interrogation_sessions",
        "source_documents",
        "github_verifications",
        "claims",
        "candidates",
    ]
    for table in tables:
        session.exec(text(f"DELETE FROM {table}"))  # type: ignore[call-overload]
    session.commit()

    # Reset SQLite auto-increment counters (table may not exist if no AUTOINCREMENT was ever used)
    try:
        for table in tables:
            session.exec(text(f"DELETE FROM sqlite_sequence WHERE name='{table}'"))  # type: ignore[call-overload]
        session.commit()
    except Exception:
        pass

    # Remove all downloaded PDFs
    downloads = Path(settings.DOWNLOADS_DIR)
    if downloads.exists():
        for f in downloads.iterdir():
            if f.is_file():
                f.unlink(missing_ok=True)

    return {"flushed": True}


@router.get("/report/{candidate_id}")
def get_candidate_report(candidate_id: int, session: Session = Depends(get_session)) -> Dict[str, Any]:
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    claims = session.exec(select(Claim).where(Claim.candidate_id == candidate_id)).all()

    session_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()

    gh = session.exec(
        select(GitHubVerification).where(GitHubVerification.candidate_id == candidate_id)
    ).first()

    assessments: List[Assessment] = []
    if session_row:
        assessments = list(
            session.exec(
                select(Assessment)
                .where(Assessment.session_id == session_row.id)
                .order_by(Assessment.question_number)  # type: ignore[arg-type]
            ).all()
        )

    return {
        "candidate": {
            "id": candidate.id,
            "name": candidate.name,
            "email": candidate.email,
        },
        "claims": [{"skill_name": c.skill_name, "context": c.context} for c in claims],
        "session": {
            "status": session_row.session_status if session_row else None,
            "confidence": session_row.current_confidence if session_row else None,
            "question_count": session_row.question_count if session_row else 0,
            "final_report": session_row.final_report if session_row else None,
        },
        "github": {
            "username": gh.github_username if gh else None,
            "skipped": gh.github_skipped if gh else True,
            "matched_repos": gh.matched_repos if gh else "[]",
            "verification_summary": gh.verification_summary if gh else None,
        },
        "assessments": [
            {
                "question_number": a.question_number,
                "question_type": a.question_type,
                "question_text": a.question_text,
                "user_answer": a.user_answer,
                "score": a.score,
                "feedback": a.feedback,
                "source": a.source,
            }
            for a in assessments
        ],
    }
