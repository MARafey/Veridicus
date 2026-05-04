"""Job status store backed by Redis.

Uses Redis key-value pairs so both the FastAPI process and Celery workers
share the same state. Falls back to an in-memory dict if Redis is unavailable
(e.g. during local dev without Redis running).
"""
import json
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

_JOB_TTL = 3600  # 1 hour — jobs are ephemeral


class RedisJobStore:
    def __init__(self):
        self._redis = None
        self._fallback: Dict[str, Dict] = {}
        self._use_fallback = False

    def _get_client(self):
        if self._use_fallback:
            return None
        if self._redis is None:
            try:
                import redis as redis_lib
                from backend.config import settings
                self._redis = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
                self._redis.ping()
            except Exception as exc:
                logger.warning("Redis unavailable, falling back to in-memory job store: %s", exc)
                self._use_fallback = True
                return None
        return self._redis

    def set_status(self, job_id: str, status: str, error: Optional[str] = None) -> None:
        payload = json.dumps({"status": status, "error": error})
        client = self._get_client()
        if client:
            try:
                client.setex(f"job:{job_id}", _JOB_TTL, payload)
                return
            except Exception as exc:
                logger.error("Redis write failed for job %s: %s", job_id, exc)
        # fallback
        self._fallback[job_id] = {"status": status, "error": error}

    def get_status(self, job_id: str) -> Optional[Dict]:
        client = self._get_client()
        if client:
            try:
                raw = client.get(f"job:{job_id}")
                if raw is None:
                    return None
                return json.loads(raw)
            except Exception as exc:
                logger.error("Redis read failed for job %s: %s", job_id, exc)
        return self._fallback.get(job_id)


job_store = RedisJobStore()
