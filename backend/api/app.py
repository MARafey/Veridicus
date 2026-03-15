from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import create_db_and_tables
from backend.api.routes.candidates import router as candidates_router
from backend.api.routes.assessments import router as assessments_router
from backend.api.routes.admin import router as admin_router


def create_app() -> FastAPI:
    app = FastAPI(title="Veridicus", version="1.0.0")

    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def on_startup():
        create_db_and_tables()

    app.include_router(candidates_router, prefix="/api")
    app.include_router(assessments_router, prefix="/api")
    app.include_router(admin_router, prefix="/api")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
