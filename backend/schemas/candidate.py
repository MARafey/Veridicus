from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class ClaimResponse(BaseModel):
    id: int
    skill_name: str
    context: str


class CandidateResponse(BaseModel):
    id: int
    name: str
    email: str
    claims: List[ClaimResponse] = []
    average_score: Optional[float] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    error: Optional[str] = None


class UploadResponse(BaseModel):
    candidate_id: int
    job_id: str


class MatchedRepoResponse(BaseModel):
    repo_name: str
    branch: str
    matched_claim: str
    url: str
    language: str = ""
    match_type: str = "project_match"
    audit_languages: List[str] = []
    audit_resources: List[str] = []


class GitHubVerificationResponse(BaseModel):
    github_username: str
    matched_repos: List[MatchedRepoResponse]
    verification_summary: str
    github_skipped: bool
