from typing import Optional, TYPE_CHECKING
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .candidate import Candidate


class Assessment(SQLModel, table=True):
    __tablename__ = "assessments"

    id: Optional[int] = Field(default=None, primary_key=True)
    candidate_id: int = Field(foreign_key="candidates.id")
    question_text: str
    user_answer: str = ""
    expected_answer_context: str = ""
    score: Optional[float] = None
    feedback: str = ""
    source: str = Field(default="pdf")  # "pdf" | "github"
    question_type: str = Field(default="OPEN")  # MCQ | TROUBLESHOOT | FILL_BLANK | WHAT_IF | OPEN(legacy)
    options: Optional[str] = Field(default=None)  # JSON string ["A. ...", "B. ...", "C. ...", "D. ..."] — MCQ only
    question_number: Optional[int] = Field(default=None)
    session_id: Optional[int] = Field(default=None, foreign_key="interrogation_sessions.id")
    stage: Optional[str] = Field(default=None)   # "breadth" | "deepdive" | None (legacy rows)

    candidate: Optional["Candidate"] = Relationship(back_populates="assessments")
