from sqlmodel import SQLModel, Session, create_engine
from .config import settings

# connect_args only needed for SQLite (prevents threading errors)
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, echo=False, connect_args=connect_args)


def create_db_and_tables():
    """Create all tables on startup (used in dev/SQLite mode).
    In production with PostgreSQL, Alembic handles schema migrations instead.
    """
    from .models import (  # noqa: F401
        Candidate, Claim, SourceDocument, Assessment,
        GitHubVerification, InterrogationSession, SkillConfidence,
    )
    from .models.tenant import Organization, Invitation, KnowledgeRecord  # noqa: F401
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
