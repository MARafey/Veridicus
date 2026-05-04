"""Public routes — no authentication required.

These are accessed by candidates via their invite link.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from sqlmodel import Session, select

from backend.database import get_session
from backend.models import Candidate
from backend.models.tenant import Invitation, Organization
from backend.schemas.tenant import InviteStartResponse, PublicInviteResponse
from backend.services.job_store import job_store
from backend.services.resume_parser import parse_resume_bytes

router = APIRouter(prefix="/public", tags=["public"])

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


@router.get("/invite/{token}", response_model=PublicInviteResponse)
def get_invite(token: str, session: Session = Depends(get_session)):
    invite = session.get(Invitation, token)
    if not invite:
        return PublicInviteResponse(org_name="", candidate_email="", valid=False)

    if invite.expires_at < datetime.utcnow():
        return PublicInviteResponse(
            org_name="", candidate_email=invite.candidate_email, valid=False, expired=True
        )

    # Treat "started" invites as still valid so candidate can reload the page
    if invite.status == "completed":
        return PublicInviteResponse(
            org_name="", candidate_email=invite.candidate_email, valid=False
        )

    org = session.get(Organization, invite.org_id)
    if not org:
        return PublicInviteResponse(org_name="", candidate_email=invite.candidate_email, valid=False)

    return PublicInviteResponse(
        org_name=org.name,
        candidate_email=invite.candidate_email,
        valid=True,
    )


@router.post("/invite/{token}/start", response_model=InviteStartResponse)
def start_invite(
    token: str,
    name: str = Form(...),
    file: UploadFile = File(...),
    github_username: str = Form(default=""),
    session: Session = Depends(get_session),
):
    from backend.worker import run_pipeline_task

    invite = session.get(Invitation, token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Invite link has expired")
    if invite.status in ("started", "completed"):
        raise HTTPException(
            status_code=409,
            detail="This invite has already been used" if invite.status == "completed" else "This invite is already in progress",
        )

    content = file.file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Resume file too large (max 10 MB)")
    try:
        resume_text = parse_resume_bytes(content, file.filename or "resume.pdf")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    candidate = Candidate(
        name=name,
        email=invite.candidate_email,
        resume_text=resume_text,
        org_id=invite.org_id,
    )
    session.add(candidate)
    # Use SELECT FOR UPDATE semantics: mark started atomically before commit
    invite.status = "started"
    session.add(invite)
    session.commit()
    session.refresh(candidate)

    job_id = str(uuid.uuid4())
    job_store.set_status(job_id, "extracting")

    # Pass the invite token so the session can store it and mark "completed" on finish
    run_pipeline_task.delay(
        candidate_id=candidate.id,
        resume_text=resume_text,
        candidate_name=name,
        candidate_email=invite.candidate_email,
        job_id=job_id,
        github_username=github_username.strip() or None,
        invite_token=token,
    )

    return InviteStartResponse(candidate_id=candidate.id, job_id=job_id)
