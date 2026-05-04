from typing import Optional
from sqlmodel import Field, SQLModel


class GitHubVerification(SQLModel, table=True):
    __tablename__ = "github_verifications"

    id: Optional[int] = Field(default=None, primary_key=True)
    candidate_id: int = Field(foreign_key="candidates.id")
    github_username: str
    matched_repos: str = ""  # JSON string: [{repo, branch, resume_claim, url}]
    verification_summary: str = ""  # LLM narrative: alignment analysis + red flags
    github_skipped: bool = False  # True if no username found in resume
