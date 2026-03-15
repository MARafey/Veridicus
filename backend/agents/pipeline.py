from typing import Any, Dict

from langgraph.graph import END, START, StateGraph

from backend.agents.code_verification_agent import code_verification_node
from backend.agents.extraction_agent import extraction_node
from backend.agents.session_init_agent import session_init_node
from backend.agents.scraper_agent import scraper_node
from backend.agents.state import PolygraphState
from backend.config import settings
from backend.services.job_store import job_store


def _preflight_llm() -> str | None:
    """Return a human-readable error string if the LLM provider is unreachable, else None."""
    try:
        from backend.agents.llm_factory import get_llm
        llm = get_llm(temperature=0)
        llm.invoke("ping")
        return None
    except Exception as e:
        msg = str(e)
        provider = settings.LLM_PROVIDER
        if provider == "ollama":
            return (
                f"Cannot reach Ollama at {settings.OLLAMA_BASE_URL}. "
                "Make sure Ollama is running ('ollama serve') and the model is pulled "
                f"('ollama pull {settings.OLLAMA_MODEL}'). Original error: {msg}"
            )
        if provider == "anthropic" and ("your-key" in settings.ANTHROPIC_API_KEY or not settings.ANTHROPIC_API_KEY):
            return "ANTHROPIC_API_KEY is not set in your .env file."
        if provider == "openai" and ("your-key" in settings.OPENAI_API_KEY or not settings.OPENAI_API_KEY):
            return "OPENAI_API_KEY is not set in your .env file."
        return f"LLM provider '{provider}' is unreachable: {msg}"


def _safe_extraction(state: PolygraphState) -> Dict[str, Any]:
    try:
        return extraction_node(state)
    except Exception as e:
        return {"pipeline_status": "error", "error_message": str(e), "extracted_skills": [], "extracted_projects": []}


def _safe_scraping(state: PolygraphState) -> Dict[str, Any]:
    job_store.set_status(state["job_id"], "scraping")
    try:
        return scraper_node(state)
    except Exception as e:
        return {"pipeline_status": "verifying", "scraped_documents": [], "error_message": str(e)}


def _safe_code_verification(state: PolygraphState) -> Dict[str, Any]:
    job_store.set_status(state["job_id"], "verifying")
    try:
        return code_verification_node(state)
    except Exception as e:
        return {"pipeline_status": "generating", "github_verified": False, "error_message": str(e)}


def _safe_session_init(state: PolygraphState) -> Dict[str, Any]:
    job_store.set_status(state["job_id"], "generating")
    try:
        return session_init_node(state)
    except Exception:
        return {"pipeline_status": "ready", "generated_questions": []}


def _should_continue(state: PolygraphState) -> str:
    if state.get("pipeline_status") == "error":
        return END
    return "scraping"


def build_graph() -> StateGraph:
    graph = StateGraph(PolygraphState)
    graph.add_node("extraction", _safe_extraction)
    graph.add_node("scraping", _safe_scraping)
    graph.add_node("code_verification", _safe_code_verification)
    graph.add_node("session_init", _safe_session_init)

    graph.add_edge(START, "extraction")
    graph.add_conditional_edges("extraction", _should_continue, {"scraping": "scraping", END: END})
    graph.add_edge("scraping", "code_verification")
    graph.add_edge("code_verification", "session_init")
    graph.add_edge("session_init", END)

    return graph.compile()


_compiled_graph = build_graph()


def run_pipeline(
    candidate_id: int,
    resume_text: str,
    candidate_name: str,
    candidate_email: str,
    job_id: str,
    github_username: str | None = None,
) -> None:
    job_store.set_status(job_id, "extracting")

    preflight_error = _preflight_llm()
    if preflight_error:
        job_store.set_status(job_id, "error", preflight_error)
        return

    initial_state: PolygraphState = {
        "candidate_id": candidate_id,
        "resume_text": resume_text,
        "job_id": job_id,
        "pipeline_status": "extracting",
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "extracted_skills": [],
        "extracted_projects": [],
        "scraped_documents": [],
        "generated_questions": [],
        "error_message": None,
        "github_username": github_username,  # hint; extraction node may override or keep this
        "github_verified": False,
    }

    try:
        final_state = _compiled_graph.invoke(initial_state)
        final_status = final_state.get("pipeline_status", "ready")
        error_msg = final_state.get("error_message") if final_status == "error" else None
        job_store.set_status(job_id, final_status, error_msg)
    except Exception as e:
        job_store.set_status(job_id, "error", str(e))
