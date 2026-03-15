import operator
from dataclasses import dataclass, field
from typing import Annotated, List, Optional
from typing_extensions import TypedDict


@dataclass
class ExtractedSkill:
    skill_name: str
    years_experience: Optional[float] = None
    context: str = ""


@dataclass
class ScrapedDocument:
    skill_name: str
    claim_id: int
    document_title: str
    document_url: str
    local_path: str
    extracted_text: str


@dataclass
class ExtractedProject:
    project_name: str
    tech_stack: str       # comma-separated technologies used
    description: str      # what the project does + architectural choices mentioned


@dataclass
class GeneratedQuestion:
    question_text: str
    expected_answer_context: str
    candidate_id: int


class PolygraphState(TypedDict):
    candidate_id: int
    resume_text: str
    job_id: str
    pipeline_status: str  # extracting | scraping | verifying | generating | ready | error
    candidate_name: str
    candidate_email: str
    extracted_skills: List[ExtractedSkill]
    extracted_projects: List[ExtractedProject]
    scraped_documents: Annotated[List[ScrapedDocument], operator.add]
    generated_questions: Annotated[List[GeneratedQuestion], operator.add]
    error_message: Optional[str]
    github_username: Optional[str]   # extracted from resume; None if not found
    github_verified: bool            # set by code_verification_node
