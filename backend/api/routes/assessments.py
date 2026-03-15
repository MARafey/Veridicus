from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.agents.dynamic_interrogator_agent import generate_next_question
from backend.agents.evaluation_agent import evaluate_answer
from backend.database import get_session
from backend.models import Assessment, Candidate
from backend.models.interrogation_session import InterrogationSession
from backend.schemas.assessment import (
    AnswerSubmission,
    AssessmentResponse,
    NextQuestionResponse,
    SessionResponse,
)

router = APIRouter(prefix="/assessments", tags=["assessments"])


@router.get("/{candidate_id}", response_model=List[AssessmentResponse])
def get_assessments(candidate_id: int, session: Session = Depends(get_session)):
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
):
    assessment = session.get(Assessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    result = evaluate_answer(assessment_id, body.answer)

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
def next_question(candidate_id: int, session: Session = Depends(get_session)):
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Check if session already terminated
    session_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if session_row and session_row.session_status != "active":
        raise HTTPException(
            status_code=409,
            detail={
                "session_status": session_row.session_status,
                "final_report": session_row.final_report,
                "current_confidence": session_row.current_confidence,
                "question_count": session_row.question_count,
            },
        )

    result = generate_next_question(candidate_id)
    return NextQuestionResponse(**result)


@router.get("/{candidate_id}/session", response_model=SessionResponse)
def get_session_info(candidate_id: int, session: Session = Depends(get_session)):
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
    )


@router.delete("/{assessment_id}", status_code=204)
def delete_assessment(assessment_id: int, session: Session = Depends(get_session)):
    assessment = session.get(Assessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    session.delete(assessment)
    session.commit()


@router.delete("/candidate/{candidate_id}/all", status_code=204)
def delete_all_assessments(candidate_id: int, session: Session = Depends(get_session)):
    # Delete all assessment rows for this candidate
    assessments = session.exec(
        select(Assessment).where(Assessment.candidate_id == candidate_id)
    ).all()
    for a in assessments:
        session.delete(a)

    # Also remove the interrogation session so the candidate can be re-assessed cleanly
    interrogation_session = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if interrogation_session:
        session.delete(interrogation_session)

    session.commit()


@router.get("/{candidate_id}/report")
def get_report(candidate_id: int, session: Session = Depends(get_session)):
    session_row = session.exec(
        select(InterrogationSession).where(InterrogationSession.candidate_id == candidate_id)
    ).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="No session found for this candidate")
    if session_row.session_status == "active":
        raise HTTPException(status_code=202, detail="Report not yet available — session still active")
    return {"report": session_row.final_report}
