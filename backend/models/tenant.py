from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlmodel import Field, SQLModel


class Organization(SQLModel, table=True):
    __tablename__ = "organizations"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    name: str
    admin_email: str = Field(unique=True, index=True)
    google_sub: str = Field(unique=True, index=True)  # Google OAuth subject claim
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Invitation(SQLModel, table=True):
    __tablename__ = "invitations"

    token: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    org_id: str = Field(foreign_key="organizations.id", index=True)
    candidate_email: str
    status: str = Field(default="pending")  # pending | started | completed
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)


class KnowledgeRecord(SQLModel, table=True):
    __tablename__ = "knowledge_records"

    candidate_id: int = Field(foreign_key="candidates.id", primary_key=True)
    graph_data: str  # JSON blob — snapshot of PolygraphState
    last_updated: datetime = Field(default_factory=datetime.utcnow)
