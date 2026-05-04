import shutil
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, text

from backend.auth import get_current_org
from backend.config import settings
from backend.database import get_session
from backend.mail import send_invite_email, DEFAULT_INVITE_HTML, DEFAULT_INVITE_SUBJECT
from backend.models import Assessment, Candidate, Claim
from backend.models.github_verification import GitHubVerification
from backend.models.interrogation_session import InterrogationSession
from backend.models.skill_confidence import SkillConfidence
from backend.models.tenant import Invitation, Organization
from backend.schemas.tenant import (
    InviteItemResponse,
    InviteRequest,
    InviteResponse,
    OrgCreateRequest,
    OrgResponse,
    OrgStatsResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# ──────────────────────────────────────────────
# Organisation management
# ──────────────────────────────────────────────

@router.post("/orgs", response_model=OrgResponse, status_code=201)
def create_org(body: OrgCreateRequest, session: Session = Depends(get_session)):
    """Create or return an existing org (called after first Google login)."""
    existing = session.exec(
        select(Organization).where(Organization.google_sub == body.google_sub)
    ).first()
    if existing:
        return OrgResponse(
            id=existing.id,
            name=existing.name,
            admin_email=existing.admin_email,
            created_at=existing.created_at,
        )

    org = Organization(
        name=body.name,
        admin_email=body.admin_email,
        google_sub=body.google_sub,
    )
    session.add(org)
    session.commit()
    session.refresh(org)
    return OrgResponse(id=org.id, name=org.name, admin_email=org.admin_email, created_at=org.created_at)


@router.get("/orgs/me", response_model=OrgResponse)
def get_my_org(org: Organization = Depends(get_current_org)):
    return OrgResponse(
        id=org.id,
        name=org.name,
        admin_email=org.admin_email,
        created_at=org.created_at,
    )


@router.get("/orgs/me/stats", response_model=OrgStatsResponse)
def get_org_stats(
    org: Organization = Depends(get_current_org),
    session: Session = Depends(get_session),
):
    candidates = session.exec(
        select(Candidate).where(Candidate.org_id == org.id)
    ).all()
    candidate_ids = [c.id for c in candidates]

    # Average score
    all_scores: List[float] = []
    flagged = 0
    for cid in candidate_ids:
        assessments = session.exec(
            select(Assessment).where(Assessment.candidate_id == cid)
        ).all()
        scored = [a.score for a in assessments if a.score is not None]
        if scored:
            all_scores.extend(scored)

        sess_row = session.exec(
            select(InterrogationSession).where(InterrogationSession.candidate_id == cid)
        ).first()
        if sess_row and (sess_row.tab_switch_count >= 3 or sess_row.integrity_status == "fail"):
            flagged += 1

    avg = sum(all_scores) / len(all_scores) if all_scores else None

    pending = session.exec(
        select(Invitation).where(Invitation.org_id == org.id, Invitation.status == "pending")
    ).all()
    completed = session.exec(
        select(Invitation).where(Invitation.org_id == org.id, Invitation.status == "completed")
    ).all()

    return OrgStatsResponse(
        total_candidates=len(candidates),
        avg_veridicus_score=avg,
        flagged_count=flagged,
        pending_invites=len(pending),
        completed_invites=len(completed),
    )


# ──────────────────────────────────────────────
# Invite management
# ──────────────────────────────────────────────

@router.post("/invite", response_model=InviteResponse)
def send_invites(
    body: InviteRequest,
    org: Organization = Depends(get_current_org),
    session: Session = Depends(get_session),
):
    expires_at = datetime.utcnow() + timedelta(days=body.expires_in_days)
    tokens: List[str] = []
    items: List[InviteItemResponse] = []
    sent = 0

    for email in body.emails:
        email = email.strip().lower()
        if not email:
            continue

        invite = Invitation(
            org_id=org.id,
            candidate_email=email,
            expires_at=expires_at,
        )
        session.add(invite)
        session.commit()
        session.refresh(invite)

        tokens.append(invite.token)
        items.append(
            InviteItemResponse(
                token=invite.token,
                candidate_email=invite.candidate_email,
                status=invite.status,
                expires_at=invite.expires_at,
                created_at=invite.created_at,
            )
        )

        try:
            send_invite_email(
                to=email,
                org_name=org.name,
                token=invite.token,
                base_url=settings.PUBLIC_BASE_URL,
                smtp_user=body.smtp_user,
                smtp_password=body.smtp_password,
                smtp_host=body.smtp_host,
                smtp_port=body.smtp_port,
                html_template=body.email_html,
                subject_template=body.email_subject,
            )
            sent += 1
        except Exception:
            # Don't fail the whole request if email sending fails
            pass

    return InviteResponse(tokens=tokens, sent=sent, invitations=items)


@router.get("/invites", response_model=List[InviteItemResponse])
def list_invites(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(get_current_org),
    session: Session = Depends(get_session),
):
    invites = session.exec(
        select(Invitation).where(Invitation.org_id == org.id).offset(offset).limit(limit)
    ).all()
    return [
        InviteItemResponse(
            token=inv.token,
            candidate_email=inv.candidate_email,
            status=inv.status,
            expires_at=inv.expires_at,
            created_at=inv.created_at,
        )
        for inv in invites
    ]


@router.get("/invite-template")
def get_invite_template(_org: Organization = Depends(get_current_org)):
    """Return the default invite email template so the frontend can pre-populate the editor."""
    return {"html": DEFAULT_INVITE_HTML, "subject": DEFAULT_INVITE_SUBJECT}


# ──────────────────────────────────────────────
# Legacy admin utilities
# ──────────────────────────────────────────────

@router.post("/flush", status_code=200)
def flush_database(
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    """Delete every row from every table and remove all downloaded PDFs."""
    tables = [
        "assessments",
        "interrogation_sessions",
        "skill_confidences",
        "source_documents",
        "github_verifications",
        "claims",
        "invitations",
        "knowledge_records",
        "candidates",
        "organizations",
    ]
    for table in tables:
        try:
            session.exec(text(f"DELETE FROM {table}"))  # type: ignore[call-overload]
        except Exception:
            pass
    session.commit()

    downloads = Path(settings.DOWNLOADS_DIR)
    if downloads.exists():
        for f in downloads.iterdir():
            if f.is_file():
                f.unlink(missing_ok=True)

    return {"flushed": True}


@router.get("/report/{candidate_id}")
def get_candidate_report(
    candidate_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
) -> Dict[str, Any]:
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if candidate.org_id and candidate.org_id != org.id:
        raise HTTPException(status_code=403, detail="Access denied")

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
        "candidate": {"id": candidate.id, "name": candidate.name, "email": candidate.email},
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
