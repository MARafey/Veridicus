import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.agents.dynamic_interrogator_agent import generate_next_question
from backend.agents.evaluation_agent import evaluate_answer
from backend.auth import get_current_org
from backend.database import get_session
from backend.models import Assessment, Candidate
from backend.models.interrogation_session import InterrogationSession
from backend.models.tenant import Invitation, Organization
from backend.schemas.assessment import (
    AnswerSubmission,
    AssessmentResponse,
    NextQuestionResponse,
    SessionResponse,
)


class TabSwitchBody(BaseModel):
    count: int
    timestamp: str


class TerminateBody(BaseModel):
    reason: str


router = APIRouter(prefix="/assessments", tags=["assessments"])


def _get_candidate_verified(
    candidate_id: int,
    session: Session,
    org: Organization,
) -> Candidate:
    """Fetch candidate and verify org ownership. Raises 404/403 as appropriate."""
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if candidate.org_id and candidate.org_id != org.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return candidate


def _mark_invite_completed(candidate: Candidate, session: Session) -> None:
    """If a candidate arrived via an invite token, mark the invitation completed."""
    sess_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate.id)
    ).first()
    if sess_row and sess_row.invite_token_used:
        invite = session.get(Invitation, sess_row.invite_token_used)
        if invite and invite.status != "completed":
            invite.status = "completed"
            session.add(invite)
            sess_row.completed_at = datetime.utcnow().isoformat()
            session.add(sess_row)
            session.commit()


@router.get("/{candidate_id}", response_model=List[AssessmentResponse])
def get_assessments(
    candidate_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    _get_candidate_verified(candidate_id, session, org)
    assessments = session.exec(
        select(Assessment).where(Assessment.candidate_id == candidate_id)
    ).all()
    return [
        AssessmentResponse(
            id=a.id,
            candidate_id=a.candidate_id,
            question_text=a.question_text,
            user_answer=a.user_answer,
            score=a.score,
            feedback=a.feedback,
            source=a.source,
        )
        for a in assessments
    ]


@router.post("/{assessment_id}/answer", response_model=AssessmentResponse)
def submit_answer(
    assessment_id: int,
    body: AnswerSubmission,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    assessment = session.get(Assessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    # Verify org owns the candidate this assessment belongs to
    _get_candidate_verified(assessment.candidate_id, session, org)

    result = evaluate_answer(assessment_id, body.answer)

    if body.time_taken_seconds is not None:
        assessment.time_taken_seconds = body.time_taken_seconds
        session.add(assessment)
        session.commit()

    session.refresh(assessment)
    return AssessmentResponse(
        id=assessment.id,
        candidate_id=assessment.candidate_id,
        question_text=assessment.question_text,
        user_answer=assessment.user_answer,
        score=result["score"],
        feedback=result["feedback"],
        source=assessment.source,
    )


@router.post("/{candidate_id}/next-question", response_model=NextQuestionResponse)
def next_question(
    candidate_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    _get_candidate_verified(candidate_id, session, org)

    session_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if session_row and session_row.session_status != "active":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Session already terminated: {session_row.session_status}. "
                f"Confidence: {session_row.current_confidence:.0f}%"
            ),
        )

    result = generate_next_question(candidate_id)
    return NextQuestionResponse(**result)


@router.get("/{candidate_id}/session", response_model=SessionResponse)
def get_session_info(
    candidate_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    _get_candidate_verified(candidate_id, session, org)
    session_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="No session found for this candidate")
    return SessionResponse(
        session_id=session_row.id,
        candidate_id=session_row.candidate_id,
        session_status=session_row.session_status,
        current_confidence=session_row.current_confidence,
        question_count=session_row.question_count,
        final_report=session_row.final_report,
        tab_switch_count=session_row.tab_switch_count,
        integrity_status=session_row.integrity_status,
    )


@router.post("/{candidate_id}/tab-switch")
def log_tab_switch(
    candidate_id: int,
    body: TabSwitchBody,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    _get_candidate_verified(candidate_id, session, org)
    session_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="No session found for this candidate")
    session_row.tab_switch_count = body.count
    session.add(session_row)
    session.commit()
    return {"tab_switch_count": session_row.tab_switch_count}


@router.post("/{candidate_id}/terminate")
def terminate_session(
    candidate_id: int,
    body: TerminateBody,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    candidate = _get_candidate_verified(candidate_id, session, org)
    session_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="No session found for this candidate")
    if session_row.session_status != "active":
        return {"session_status": session_row.session_status}

    session_row.session_status = "terminated_fail"
    if body.reason == "integrity_violation":
        session_row.integrity_status = "fail"
    session.add(session_row)
    session.commit()

    from backend.agents.report_generator_agent import generate_report
    report = generate_report(candidate_id)
    session_row.final_report = report
    session.add(session_row)
    session.commit()

    _mark_invite_completed(candidate, session)

    return {"session_status": session_row.session_status}


@router.delete("/{assessment_id}", status_code=204)
def delete_assessment(
    assessment_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    assessment = session.get(Assessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    _get_candidate_verified(assessment.candidate_id, session, org)
    session.delete(assessment)
    session.commit()


@router.delete("/candidate/{candidate_id}/all", status_code=204)
def delete_all_assessments(
    candidate_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    _get_candidate_verified(candidate_id, session, org)
    assessments = session.exec(
        select(Assessment).where(Assessment.candidate_id == candidate_id)
    ).all()
    for a in assessments:
        session.delete(a)

    interrogation_session = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if interrogation_session:
        session.delete(interrogation_session)

    session.commit()


@router.get("/{candidate_id}/report")
def get_report(
    candidate_id: int,
    session: Session = Depends(get_session),
    org: Organization = Depends(get_current_org),
):
    _get_candidate_verified(candidate_id, session, org)
    session_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="No session found for this candidate")
    if session_row.session_status == "active":
        raise HTTPException(status_code=202, detail="Report not yet available — session still active")
    return {"report": session_row.final_report}
