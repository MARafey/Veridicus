# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Python / uv)

```bash
uv sync                  # Install / sync dependencies
uv run main.py           # Start FastAPI on :8000 (with hot-reload)
uv add <package>         # Add a new Python dependency
uv run python -c "..."   # Run a one-liner in the venv
```

### Frontend (Next.js / npm)

```bash
cd frontend
npm install              # Install Node dependencies
npm run dev              # Start Next.js dev server on :3000
npm run build            # Production build
npm run lint             # ESLint check
```

### Setup checklist

1. Copy `.env.example` → `.env` and fill in your API key(s)
2. `uv sync` — install Python deps
3. `uv run playwright install chromium` — download browser for scraper
4. `cd frontend && npm install` — install Node deps
5. `uv run main.py` + `cd frontend && npm run dev` — start both servers

## Project Overview

**Veridicus** is a multi-agent system that authenticates whether a candidate's resume claims match their actual technical proficiency. It parses a resume, researches the claimed skills using live web sources and PDFs, generates targeted technical questions from that material, then evaluates the candidate's answers against the sourced ground truth.

## Architecture

### Stack

- **Backend**: Python + FastAPI (synchronous routes, SQLite has no true async I/O)
- **Agent Orchestration**: LangGraph state graph (`backend/agents/pipeline.py`)
- **Web Scraping**: Playwright (Bing search) + httpx (PDF download) + pdfplumber (text extraction)
- **Database**: SQLite via SQLModel ORM (`backend/database.py`, `backend/models/`)
- **Frontend**: Next.js 14 App Router + Ant Design v5 with Glassmorphism theme

### LangGraph Agent Pipeline

```
Resume Upload → extraction_node → scraper_node → question_generator_node → END
                                                                           ↓
                                              (per-answer) evaluate_answer()
```

1. **extraction_node** (`backend/agents/extraction_agent.py`) – Parses resume → structured JSON → saves Claims to DB
2. **scraper_node** (`backend/agents/scraper_agent.py`) – Bing search for `{skill} filetype:pdf`, downloads PDFs via httpx, extracts text via pdfplumber, saves SourceDocuments to DB
3. **question_generator_node** (`backend/agents/question_generator_agent.py`) – Generates 3–5 questions per skill from PDF content, saves Assessments to DB
4. **evaluate_answer** (`backend/agents/evaluation_agent.py`) – Standalone fn called per answer submission; scores 0–100 against expected context

### Database Schema (SQLite / SQLModel)

| Table | Key columns |
|---|---|
| `candidates` | id, name, email, resume_text |
| `claims` | id, candidate_id, skill_name, context |
| `source_documents` | id, claim_id, document_title, document_url, local_path, extracted_text |
| `assessments` | id, candidate_id, question_text, user_answer, expected_answer_context, score, feedback |

### API Endpoints

| Method | Route | Description |
|---|---|---|
| POST | `/api/candidates/upload` | Multipart form upload, triggers pipeline |
| GET | `/api/candidates/` | List all candidates (dashboard) |
| GET | `/api/candidates/{id}` | Candidate + claims |
| GET | `/api/candidates/{id}/status?job_id=…` | Poll pipeline status |
| GET | `/api/assessments/{candidate_id}` | All questions for a candidate |
| POST | `/api/assessments/{id}/answer` | Submit answer → returns score + feedback |

### Frontend Views

- **`/`** — Dashboard: candidate cards with skill tags + avg score
- **`/upload`** — Drag-and-drop resume upload + pipeline progress Steps
- **`/assessment/[id]`** — Interrogation Room: 120s timer wizard, one question at a time

### Key Files

```
backend/
  config.py               ← pydantic-settings (reads .env)
  database.py             ← SQLModel engine + get_session()
  models/                 ← Candidate, Claim, SourceDocument, Assessment
  agents/
    state.py              ← PolygraphState TypedDict
    llm_factory.py        ← get_llm() → ChatAnthropic or ChatOpenAI
    extraction_agent.py
    scraper_agent.py
    question_generator_agent.py
    evaluation_agent.py   ← standalone evaluate_answer()
    pipeline.py           ← StateGraph + run_pipeline()
  services/
    job_store.py          ← thread-safe in-memory job status
    pdf_service.py        ← extract_pdf_text() via pdfplumber
    resume_parser.py      ← PDF/TXT bytes → plain text
  api/
    app.py                ← FastAPI factory + CORS + startup
    routes/
      candidates.py
      assessments.py

frontend/src/
  app/
    layout.tsx            ← AntdRegistry + ConfigProvider
    globals.css           ← body gradient + .glass-card utility
    page.tsx              ← Dashboard
    upload/page.tsx
    assessment/[id]/page.tsx
  components/
    GlassCard.tsx
    ResumeUploader.tsx
    PipelineStatus.tsx    ← 2s polling, auto-redirects on ready
    QuestionWizard.tsx    ← 120s timer per question
    ScoreDisplay.tsx
  lib/
    api.ts                ← axios wrappers
    types.ts              ← TS interfaces
  theme/
    antdTheme.ts          ← Ant Design v5 token overrides
```

## Environment Variables (.env)

| Key | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | — | Required if provider=anthropic |
| `ANTHROPIC_MODEL` | `claude-opus-4-6` | |
| `OPENAI_API_KEY` | — | Required if provider=openai |
| `OPENAI_MODEL` | `gpt-4o` | |
| `DATABASE_URL` | `sqlite:///./polygraph.db` | Auto-created on startup |
| `DOWNLOADS_DIR` | `./downloads` | Where PDFs are saved |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated |
| `GITHUB_TOKEN` | `""` | Optional; raises GitHub API limit to 5000 req/hour |
