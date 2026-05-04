import json
from typing import Any, Dict

from langchain_core.messages import HumanMessage, SystemMessage
from sqlmodel import Session

from backend.agents.llm_factory import get_llm
from backend.agents.state import ExtractedProject, ExtractedSkill, PolygraphState
from backend.database import engine
from backend.models import Claim


EXTRACTION_SYSTEM = """You are a resume parser. Extract technical skills AND projects from the resume.
Return ONLY valid JSON with this exact structure:
{
  "skills": [
    {"skill_name": "Python", "years_experience": 3.0, "context": "Used for backend APIs"}
  ],
  "projects": [
    {
      "project_name": "E-commerce Platform",
      "tech_stack": "React, Node.js, PostgreSQL, AWS",
      "description": "Built a scalable e-commerce platform. Chose microservices over monolith for independent deployability. Used PostgreSQL for ACID compliance."
    }
  ],
  "github_username": "johndoe"
}
For skills: include programming languages, frameworks, databases, cloud platforms, tools, methodologies. Limit to 5 most prominent.
For projects: extract every project/work experience mentioned. Capture the tech stack and any architecture/design decisions the candidate describes.
For github_username: look for GitHub profile URLs in ANY of these formats:
  - github.com/username
  - https://github.com/username
  - GitHub: username
  - A username shown next to a GitHub icon or label
  Extract just the username part (not the full URL). Set to null if not found."""


def _parse_raw(raw: str) -> dict:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    start, end = raw.find("{"), raw.rfind("}") + 1
    if start != -1 and end > start:
        raw = raw[start:end]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def extraction_node(state: PolygraphState) -> Dict[str, Any]:
    llm = get_llm(temperature=0.1)
    messages = [
        SystemMessage(content=EXTRACTION_SYSTEM),
        HumanMessage(content=f"Resume:\n\n{state['resume_text']}"),
    ]

    response = llm.invoke(messages)
    content = response.content
    if isinstance(content, list):
        raw_text = next((b["text"] for b in content if isinstance(b, dict) and b.get("type") == "text"), "")
    else:
        raw_text = content
    data = _parse_raw(raw_text.strip())

    extracted_skills = [
        ExtractedSkill(
            skill_name=s["skill_name"],
            years_experience=s.get("years_experience"),
            context=s.get("context", ""),
        )
        for s in data.get("skills", [])
    ]

    extracted_projects = [
        ExtractedProject(
            project_name=p.get("project_name", ""),
            tech_stack=p.get("tech_stack", ""),
            description=p.get("description", ""),
        )
        for p in data.get("projects", [])
    ]

    # Persist Claims to DB
    with Session(engine) as session:
        for skill in extracted_skills:
            claim = Claim(
                candidate_id=state["candidate_id"],
                skill_name=skill.skill_name,
                context=skill.context,
            )
            session.add(claim)
        session.commit()

    # Use LLM-extracted username; fall back to the hint supplied at upload time
    github_username = data.get("github_username") or state.get("github_username")

    return {
        "extracted_skills": extracted_skills,
        "extracted_projects": extracted_projects,
        "github_username": github_username,
        "pipeline_status": "scraping",
    }
