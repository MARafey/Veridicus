import json
import re

from langchain_core.messages import HumanMessage, SystemMessage
from sqlmodel import Session

from backend.agents.llm_factory import get_llm
from backend.database import engine
from backend.models import Assessment

EVAL_SYSTEM = """You are an expert technical evaluator. Given a question, the expected answer context,
and a candidate's actual answer, score the answer from 0 to 100.
Return ONLY valid JSON:
{
  "score": 75,
  "feedback": "Your answer correctly identified X but missed Y..."
}
Be fair but rigorous. 0 = completely wrong/blank, 100 = expert-level answer."""


def evaluate_answer(assessment_id: int, user_answer: str) -> dict:
    with Session(engine) as session:
        assessment = session.get(Assessment, assessment_id)
        if not assessment:
            return {"score": 0, "feedback": "Assessment not found."}

        llm = get_llm(temperature=0.1)
        messages = [
            SystemMessage(content=EVAL_SYSTEM),
            HumanMessage(
                content=(
                    f"Question: {assessment.question_text}\n\n"
                    f"Expected answer context: {assessment.expected_answer_context}\n\n"
                    f"Candidate's answer: {user_answer}"
                )
            ),
        ]

        response = llm.invoke(messages)
        content = response.content
        if isinstance(content, list):
            raw = next((b["text"] for b in content if isinstance(b, dict) and b.get("type") == "text"), "")
        else:
            raw = content
        raw = raw.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        # Find the first JSON object in the response (handles extra prose)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            raw = raw[start:end]

        try:
            data = json.loads(raw)
            score = float(data.get("score", 0))
            feedback = data.get("feedback", "Could not parse evaluation response.")
        except json.JSONDecodeError:
            # Regex fallback — don't penalise candidate for LLM parse error
            score_match = re.search(r'"score"\s*:\s*(\d+(?:\.\d+)?)', raw)
            feedback_match = re.search(r'"feedback"\s*:\s*"([^"]+)"', raw)
            if score_match:
                score = float(score_match.group(1))
                feedback = feedback_match.group(1) if feedback_match else "Partial evaluation."
            else:
                score = 50.0  # neutral — don't penalise candidate for LLM parse error
                feedback = "Response noted — detailed feedback unavailable."

        assessment.user_answer = user_answer
        assessment.score = score
        assessment.feedback = feedback
        session.add(assessment)
        session.commit()
        session.refresh(assessment)

        return {"score": score, "feedback": feedback}
