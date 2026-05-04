from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr


class OrgCreateRequest(BaseModel):
    name: str
    google_sub: str
    admin_email: str


class OrgResponse(BaseModel):
    id: str
    name: str
    admin_email: str
    created_at: datetime


class InviteRequest(BaseModel):
    emails: List[str]
    expires_in_days: int = 7
    smtp_user: str
    smtp_password: str
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    email_html: Optional[str] = None   # {org_name} and {invite_url} placeholders
    email_subject: Optional[str] = None


class InviteItemResponse(BaseModel):
    token: str
    candidate_email: str
    status: str
    expires_at: datetime
    created_at: datetime


class InviteResponse(BaseModel):
    tokens: List[str]
    sent: int
    invitations: List[InviteItemResponse]


class PublicInviteResponse(BaseModel):
    org_name: str
    candidate_email: str
    valid: bool
    expired: bool = False


class InviteStartRequest(BaseModel):
    name: str
    github_username: Optional[str] = None


class InviteStartResponse(BaseModel):
    candidate_id: int
    job_id: str


class OrgStatsResponse(BaseModel):
    total_candidates: int
    avg_veridicus_score: Optional[float]
    flagged_count: int
    pending_invites: int
    completed_invites: int
