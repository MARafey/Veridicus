from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import text
from .config import settings

engine = create_engine(settings.DATABASE_URL, echo=False)


def _run_migrations(engine) -> None:
    migrations = [
        "ALTER TABLE interrogation_sessions ADD COLUMN current_stage TEXT NOT NULL DEFAULT 'breadth'",
        "ALTER TABLE assessments ADD COLUMN stage TEXT",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as exc:
                if "duplicate column name" in str(exc).lower():
                    pass
                else:
                    raise


def create_db_and_tables():
    # Import models so SQLModel registers them before creating tables
    from .models import Candidate, Claim, SourceDocument, Assessment, GitHubVerification, InterrogationSession  # noqa: F401
    SQLModel.metadata.create_all(engine)
    _run_migrations(engine)


def get_session():
    with Session(engine) as session:
        yield session
