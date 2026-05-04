import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

from alembic import context

# Make sure backend package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import settings  # noqa: E402

# Alembic Config object
alembic_config = context.config

# Set the database URL from our settings (overrides alembic.ini value)
alembic_config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if alembic_config.config_file_name is not None:
    fileConfig(alembic_config.config_file_name)

# Import ALL models so SQLModel registers them in metadata before autogenerate
from backend.models import (  # noqa: F401, E402
    Candidate, Claim, SourceDocument, Assessment,
    GitHubVerification, InterrogationSession, SkillConfidence,
)
from backend.models.tenant import Organization, Invitation, KnowledgeRecord  # noqa: F401, E402

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    url = alembic_config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        alembic_config.get_section(alembic_config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
