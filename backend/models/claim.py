from typing import Optional, List, TYPE_CHECKING
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .candidate import Candidate
    from .source_document import SourceDocument


class Claim(SQLModel, table=True):
    __tablename__ = "claims"

    id: Optional[int] = Field(default=None, primary_key=True)
    candidate_id: int = Field(foreign_key="candidates.id")
    skill_name: str
    context: str = ""

    candidate: Optional["Candidate"] = Relationship(back_populates="claims")
    source_documents: List["SourceDocument"] = Relationship(back_populates="claim")
