from typing import Optional
from sqlmodel import Field, SQLModel


class SkillConfidence(SQLModel, table=True):
    __tablename__ = "skill_confidences"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="interrogation_sessions.id", nullable=False)
    skill_name: str
    confidence: float = Field(default=0.0)    # 0–100
    status: str = Field(default="evaluating")  # "evaluating" | "evaluated"
    question_count: int = Field(default=0)
