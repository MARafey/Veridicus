from typing import Optional
from sqlmodel import Column, Field, Integer, ForeignKey, SQLModel


class InterrogationSession(SQLModel, table=True):
    __tablename__ = "interrogation_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    candidate_id: int = Field(
        sa_column=Column(Integer, ForeignKey("candidates.id"), unique=True, nullable=False)
    )
    session_status: str = Field(default="active")  # active | terminated_success | terminated_fail | terminated_limit
    current_confidence: float = Field(default=0.0)
    question_count: int = Field(default=0)
    final_report: Optional[str] = Field(default=None)
    created_at: str = Field(default="")
    updated_at: str = Field(default="")
    current_stage: str = Field(default="breadth")   # "breadth" | "deepdive"
    tab_switch_count: int = Field(default=0)
    integrity_status: str = Field(default="pass")  # "pass" | "fail"
    started_at: Optional[str] = Field(default=None)
    completed_at: Optional[str] = Field(default=None)
    invite_token_used: Optional[str] = Field(default=None)
