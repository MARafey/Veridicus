from typing import List, Optional
from pydantic import BaseModel


class AssessmentResponse(BaseModel):
    id: int
    candidate_id: int
    question_text: str
    user_answer: str
    score: Optional[float]
    feedback: str
    source: str = "pdf"


class AnswerSubmission(BaseModel):
    answer: str


class NextQuestionResponse(BaseModel):
    assessment_id: int
    assessment_status: str        # CONTINUE | TERMINATE_SUCCESS | TERMINATE_FAIL | TERMINATE_LIMIT
    current_confidence_score: float
    question_number: int
    question_type: str
    question_text: str
    options: Optional[List[str]] = None   # non-null only for MCQ
    source: str
    session_status: str
    current_stage: str = "breadth"   # "breadth" | "deepdive"


class SessionResponse(BaseModel):
    session_id: int
    candidate_id: int
    session_status: str
    current_confidence: float
    question_count: int
    final_report: Optional[str] = None
