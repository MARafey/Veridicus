"""Celery tasks for background pipeline processing."""
from __future__ import annotations

from .celery_app import celery_app
from .services.job_store import job_store


@celery_app.task(bind=True, max_retries=1, default_retry_delay=30)
def run_pipeline_task(
    self,
    candidate_id: int,
    resume_text: str,
    candidate_name: str,
    candidate_email: str,
    job_id: str,
    github_username: str | None = None,
    invite_token: str | None = None,
) -> None:
    """Run the LangGraph pipeline for a newly uploaded resume."""
    from .agents.pipeline import run_pipeline

    try:
        run_pipeline(
            candidate_id=candidate_id,
            resume_text=resume_text,
            candidate_name=candidate_name,
            candidate_email=candidate_email,
            job_id=job_id,
            github_username=github_username,
            invite_token=invite_token,
        )
    except Exception as exc:
        job_store.set_status(job_id, "error", error=str(exc))
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=1, default_retry_delay=30)
def run_re_verification_task(
    self,
    candidate_id: int,
    github_username: str,
    job_id: str,
) -> None:
    """Re-run GitHub code verification for an existing candidate."""
    from sqlmodel import Session, select

    from .agents.code_verification_agent import code_verification_node
    from .agents.state import ExtractedSkill
    from .database import engine
    from .models import Assessment, Claim
    from .models.github_verification import GitHubVerification

    try:
        job_store.set_status(job_id, "verifying")

        with Session(engine) as session:
            old_verification = session.exec(
                select(GitHubVerification).where(GitHubVerification.candidate_id == candidate_id)
            ).first()
            if old_verification:
                session.delete(old_verification)

            github_assessments = session.exec(
                select(Assessment).where(
                    Assessment.candidate_id == candidate_id,
                    Assessment.source == "github",
                )
            ).all()
            for a in github_assessments:
                session.delete(a)
            session.commit()

            claims = session.exec(select(Claim).where(Claim.candidate_id == candidate_id)).all()
            extracted_skills = [
                ExtractedSkill(skill_name=c.skill_name, context=c.context or "") for c in claims
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
        raise self.retry(exc=exc)
