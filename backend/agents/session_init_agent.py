from typing import Any, Dict

from backend.agents.state import PolygraphState


def session_init_node(state: PolygraphState) -> Dict[str, Any]:
    try:
        from backend.agents.dynamic_interrogator_agent import generate_next_question
        generate_next_question(state["candidate_id"])
    except Exception:
        pass  # Non-fatal: frontend will retry lazily on first next-question call

    return {"pipeline_status": "ready", "generated_questions": []}
