from typing import Optional, TYPE_CHECKING
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .claim import Claim


class SourceDocument(SQLModel, table=True):
    __tablename__ = "source_documents"

    id: Optional[int] = Field(default=None, primary_key=True)
    claim_id: int = Field(foreign_key="claims.id")
    document_title: str
    document_url: str
    local_path: str = ""
    extracted_text: str = ""

    claim: Optional["Claim"] = Relationship(back_populates="source_documents")
