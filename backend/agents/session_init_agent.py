from typing import Any, Dict

from backend.agents.state import PolygraphState


def session_init_node(state: PolygraphState) -> Dict[str, Any]:
    candidate_id = state["candidate_id"]
    invite_token = state.get("invite_token")

    try:
        from backend.agents.dynamic_interrogator_agent import generate_next_question
        generate_next_question(candidate_id)
    except Exception:
        pass  # Non-fatal: frontend will retry lazily on first next-question call

    # Persist invite_token on the session row if one was provided
    if invite_token:
        try:
            from sqlmodel import Session, select
            from backend.database import engine
            from backend.models.interrogation_session import InterrogationSession

            with Session(engine) as session:
                sess_row = session.exec(
                    select(InterrogationSession).where(
                        InterrogationSession.candidate_id == candidate_id
                    )
                ).first()
                if sess_row and not sess_row.invite_token_used:
                    sess_row.invite_token_used = invite_token
                    session.add(sess_row)
                    session.commit()
        except Exception:
            pass  # Non-fatal

    return {"pipeline_status": "ready", "generated_questions": []}
