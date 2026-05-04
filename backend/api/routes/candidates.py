import json
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.auth import get_current_org
from backend.database import get_session, engine
from backend.models import Assessment, Candidate, Claim
from backend.models.github_verification import GitHubVerification
from backend.models.interrogation_session import InterrogationSession
from backend.models.skill_confidence import SkillConfidence
from backend.models.source_document import SourceDocument
from backend.models.tenant import Organization
from backend.schemas.candidate import (
    CandidateResponse,
    ClaimResponse,
    GitHubVerificationResponse,
    JobStatusResponse,
    MatchedRepoResponse,
    SkillConfidenceResponse,
    UploadResponse,
)
from backend.services.job_store import job_store
from backend.services.resume_parser import parse_resume_bytes

router = APIRouter(prefix="/candidates", tags=["candidates"])

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def _get_skill_data(candidate_id: int, session: Session) -> tuple[list[SkillConfidenceResponse], int, str]:
    """Return (skill_confidences, tab_switch_count, integrity_status) for a candidate."""
    session_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if not session_row:
        return [], 0, "pass"
    scs = session.exec(
        select(SkillConfidence).where(SkillConfidence.session_id == session_row.id)
    ).all()
    skill_confidences = [
        SkillConfidenceResponse(
            skill_name=sc.skill_name,
            confidence=sc.confidence,
            status=sc.status or "evaluating",
            question_count=sc.question_count,
        )
        for sc in scs
    ]
    return skill_confidences, session_row.tab_switch_count, session_row.integrity_status or "pass"


def _assert_owns_candidate(candidate: Candidate, org: Organization) -> None:
    """Raise 403 if the candidate doesn't belong to this org."""
    if candidate.org_id and candidate.org_id != org.id:
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("/upload", response_model=UploadResponse)
def upload_resume(
    name: str = Form(...),
    email: str = Form(...),
    file: UploadFile = File(...),
    github_username: str = Form(default=""),
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    from backend.worker import run_pipeline_task

    content = file.file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Resume file too large (max 10 MB)")
    try:
        resume_text = parse_resume_bytes(content, file.filename or "resume.pdf")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    candidate = Candidate(name=name, email=email, resume_text=resume_text, org_id=org.id)
    session.add(candidate)
    session.commit()
    session.refresh(candidate)

    job_id = str(uuid.uuid4())
    job_store.set_status(job_id, "extracting")

    run_pipeline_task.delay(
        candidate_id=candidate.id,
        resume_text=resume_text,
        candidate_name=name,
        candidate_email=email,
        job_id=job_id,
        github_username=github_username.strip() or None,
    )

    return UploadResponse(candidate_id=candidate.id, job_id=job_id)


@router.get("/", response_model=List[CandidateResponse])
def list_candidates(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    candidates = session.exec(
        select(Candidate).where(Candidate.org_id == org.id).offset(offset).limit(limit)
    ).all()
    result = []
    for c in candidates:
        claims = session.exec(select(Claim).where(Claim.candidate_id == c.id)).all()
        assessments = session.exec(
            select(Assessment).where(Assessment.candidate_id == c.id)
        ).all()
        scored = [a.score for a in assessments if a.score is not None]
        avg = sum(scored) / len(scored) if scored else None
        skill_confidences, tab_switch_count, integrity_status = _get_skill_data(c.id, session)
        result.append(
            CandidateResponse(
                id=c.id,
                name=c.name,
                email=c.email,
                claims=[ClaimResponse(id=cl.id, skill_name=cl.skill_name, context=cl.context) for cl in claims],
                average_score=avg,
                skill_confidences=skill_confidences,
                tab_switch_count=tab_switch_count,
                integrity_status=integrity_status,
            )
        )
    return result


@router.get("/{candidate_id}", response_model=CandidateResponse)
def get_candidate(
    candidate_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_owns_candidate(candidate, org)
    claims = session.exec(select(Claim).where(Claim.candidate_id == candidate_id)).all()
    assessments = session.exec(
        select(Assessment).where(Assessment.candidate_id == candidate_id)
    ).all()
    scored = [a.score for a in assessments if a.score is not None]
    avg = sum(scored) / len(scored) if scored else None
    skill_confidences, tab_switch_count, integrity_status = _get_skill_data(candidate_id, session)
    return CandidateResponse(
        id=candidate.id,
        name=candidate.name,
        email=candidate.email,
        claims=[ClaimResponse(id=cl.id, skill_name=cl.skill_name, context=cl.context) for cl in claims],
        average_score=avg,
        skill_confidences=skill_confidences,
        tab_switch_count=tab_switch_count,
        integrity_status=integrity_status,
    )


@router.get("/{candidate_id}/status", response_model=JobStatusResponse)
def get_status(
    candidate_id: int,
    job_id: str,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    # Verify candidate belongs to this org
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_owns_candidate(candidate, org)

    status_data = job_store.get_status(job_id)
    if not status_data:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=job_id,
        status=status_data["status"],
        error=status_data.get("error"),
    )


@router.get("/{candidate_id}/github-verification", response_model=GitHubVerificationResponse)
def get_github_verification(
    candidate_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_owns_candidate(candidate, org)

    row = session.exec(
        select(GitHubVerification).where(GitHubVerification.candidate_id == candidate_id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="No GitHub verification found")

    try:
        repos_raw = json.loads(row.matched_repos) if row.matched_repos else []
    except Exception:
        repos_raw = []

    matched_repos = [
        MatchedRepoResponse(
            repo_name=r.get("repo_name", ""),
            branch=r.get("branch", "main"),
            matched_claim=r.get("matched_claim", ""),
            url=r.get("url", ""),
            language=r.get("language", ""),
            match_type=r.get("match_type", "project_match"),
            audit_languages=r.get("audit_languages", []),
            audit_resources=r.get("audit_resources", []),
        )
        for r in repos_raw
    ]

    return GitHubVerificationResponse(
        github_username=row.github_username,
        matched_repos=matched_repos,
        verification_summary=row.verification_summary,
        github_skipped=row.github_skipped,
    )


class ReVerifyRequest(BaseModel):
    github_username: Optional[str] = None


@router.post("/{candidate_id}/re-verify-github")
def re_verify_github(
    candidate_id: int,
    body: ReVerifyRequest,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_owns_candidate(candidate, org)

    github_username = (body.github_username or "").strip()
    if not github_username:
        existing = session.exec(
            select(GitHubVerification).where(GitHubVerification.candidate_id == candidate_id)
        ).first()
        if existing:
            github_username = existing.github_username

    if not github_username:
        raise HTTPException(status_code=400, detail="No GitHub username available. Provide one in the request body.")

    from backend.worker import run_re_verification_task

    job_id = str(uuid.uuid4())
    job_store.set_status(job_id, "verifying")
    run_re_verification_task.delay(candidate_id, github_username, job_id)

    return {"job_id": job_id, "candidate_id": candidate_id}


@router.get("/{candidate_id}/sources")
def get_sources(
    candidate_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_owns_candidate(candidate, org)

    claims = session.exec(select(Claim).where(Claim.candidate_id == candidate_id)).all()
    result = []
    for claim in claims:
        docs = session.exec(
            select(SourceDocument).where(SourceDocument.claim_id == claim.id)
        ).all()
        for doc in docs:
            result.append({
                "id": doc.id,
                "claim_id": doc.claim_id,
                "skill_name": claim.skill_name,
                "document_title": doc.document_title,
                "document_url": doc.document_url,
            })
    return result
