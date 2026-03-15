import json
import uuid
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.agents.pipeline import run_pipeline
from backend.database import get_session, engine
from backend.models import Assessment, Candidate, Claim
from backend.models.github_verification import GitHubVerification
from backend.models.source_document import SourceDocument
from backend.schemas.candidate import (
    CandidateResponse,
    ClaimResponse,
    GitHubVerificationResponse,
    JobStatusResponse,
    MatchedRepoResponse,
    UploadResponse,
)
from backend.services.job_store import job_store
from backend.services.resume_parser import parse_resume_bytes

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.post("/upload", response_model=UploadResponse)
def upload_resume(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    email: str = Form(...),
    file: UploadFile = File(...),
    github_username: str = Form(default=""),
    session: Session = Depends(get_session),
):
    content = file.file.read()
    try:
        resume_text = parse_resume_bytes(content, file.filename or "resume.pdf")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    candidate = Candidate(name=name, email=email, resume_text=resume_text)
    session.add(candidate)
    session.commit()
    session.refresh(candidate)

    job_id = str(uuid.uuid4())
    job_store.set_status(job_id, "extracting")

    background_tasks.add_task(
        run_pipeline,
        candidate_id=candidate.id,
        resume_text=resume_text,
        candidate_name=name,
        candidate_email=email,
        job_id=job_id,
        github_username=github_username.strip() or None,
    )

    return UploadResponse(candidate_id=candidate.id, job_id=job_id)


@router.get("/", response_model=List[CandidateResponse])
def list_candidates(session: Session = Depends(get_session)):
    candidates = session.exec(select(Candidate)).all()
    result = []
    for c in candidates:
        claims = session.exec(select(Claim).where(Claim.candidate_id == c.id)).all()
        assessments = session.exec(
            select(Assessment).where(Assessment.candidate_id == c.id)
        ).all()
        scored = [a.score for a in assessments if a.score is not None]
        avg = sum(scored) / len(scored) if scored else None
        result.append(
            CandidateResponse(
                id=c.id,
                name=c.name,
                email=c.email,
                claims=[ClaimResponse(id=cl.id, skill_name=cl.skill_name, context=cl.context) for cl in claims],
                average_score=avg,
            )
        )
    return result


@router.get("/{candidate_id}", response_model=CandidateResponse)
def get_candidate(candidate_id: int, session: Session = Depends(get_session)):
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    claims = session.exec(select(Claim).where(Claim.candidate_id == candidate_id)).all()
    assessments = session.exec(
        select(Assessment).where(Assessment.candidate_id == candidate_id)
    ).all()
    scored = [a.score for a in assessments if a.score is not None]
    avg = sum(scored) / len(scored) if scored else None
    return CandidateResponse(
        id=candidate.id,
        name=candidate.name,
        email=candidate.email,
        claims=[ClaimResponse(id=cl.id, skill_name=cl.skill_name, context=cl.context) for cl in claims],
        average_score=avg,
    )


@router.get("/{candidate_id}/status", response_model=JobStatusResponse)
def get_status(candidate_id: int, job_id: str, session: Session = Depends(get_session)):
    status_data = job_store.get_status(job_id)
    if not status_data:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=job_id,
        status=status_data["status"],
        error=status_data.get("error"),
    )


@router.get("/{candidate_id}/github-verification", response_model=GitHubVerificationResponse)
def get_github_verification(candidate_id: int, session: Session = Depends(get_session)):
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


def _run_re_verification(candidate_id: int, github_username: str, job_id: str) -> None:
    """Background task: delete old GitHub data and re-run code_verification_node."""
    from backend.agents.code_verification_agent import code_verification_node
    from backend.agents.state import ExtractedSkill, ExtractedProject

    try:
        job_store.set_status(job_id, "verifying")

        with Session(engine) as session:
            # Delete old verification row
            old_verification = session.exec(
                select(GitHubVerification).where(GitHubVerification.candidate_id == candidate_id)
            ).first()
            if old_verification:
                session.delete(old_verification)

            # Delete GitHub-sourced assessments only
            github_assessments = session.exec(
                select(Assessment).where(
                    Assessment.candidate_id == candidate_id,
                    Assessment.source == "github",
                )
            ).all()
            for a in github_assessments:
                session.delete(a)

            session.commit()

            # Reconstruct skills from Claims
            claims = session.exec(
                select(Claim).where(Claim.candidate_id == candidate_id)
            ).all()
            extracted_skills = [
                ExtractedSkill(skill_name=c.skill_name, context=c.context or "")
                for c in claims
            ]

        state = {
            "candidate_id": candidate_id,
            "github_username": github_username,
            "extracted_skills": extracted_skills,
            "extracted_projects": [],
        }

        code_verification_node(state)
        job_store.set_status(job_id, "ready")

    except Exception as exc:
        job_store.set_status(job_id, "error", error=str(exc))


@router.post("/{candidate_id}/re-verify-github")
def re_verify_github(
    candidate_id: int,
    body: ReVerifyRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Resolve github_username: use body override, else fall back to stored value
    github_username = (body.github_username or "").strip()
    if not github_username:
        existing = session.exec(
            select(GitHubVerification).where(GitHubVerification.candidate_id == candidate_id)
        ).first()
        if existing:
            github_username = existing.github_username

    if not github_username:
        raise HTTPException(status_code=400, detail="No GitHub username available. Provide one in the request body.")

    job_id = str(uuid.uuid4())
    job_store.set_status(job_id, "verifying")
    background_tasks.add_task(_run_re_verification, candidate_id, github_username, job_id)

    return {"job_id": job_id, "candidate_id": candidate_id}


@router.get("/{candidate_id}/sources")
def get_sources(candidate_id: int, session: Session = Depends(get_session)):
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
