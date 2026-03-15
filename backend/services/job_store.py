import threading
from typing import Dict, Optional


class JobStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._jobs: Dict[str, Dict] = {}

    def set_status(self, job_id: str, status: str, error: Optional[str] = None):
        with self._lock:
            self._jobs[job_id] = {"status": status, "error": error}

    def get_status(self, job_id: str) -> Optional[Dict]:
        with self._lock:
            return self._jobs.get(job_id)


job_store = JobStore()
