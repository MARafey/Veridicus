from typing import Optional, List, TYPE_CHECKING
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .claim import Claim
    from .assessment import Assessment


class Candidate(SQLModel, table=True):
    __tablename__ = "candidates"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str
    resume_text: str
    org_id: Optional[str] = Field(default=None, foreign_key="organizations.id", index=True)

    claims: List["Claim"] = Relationship(back_populates="candidate")
    assessments: List["Assessment"] = Relationship(back_populates="candidate")
