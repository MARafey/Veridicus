from celery import Celery
from .config import settings

celery_app = Celery(
    "veridicus",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["backend.worker"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Retry failed tasks once after 60 s
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)
