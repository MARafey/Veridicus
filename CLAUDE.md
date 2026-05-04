# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Python / uv)

```bash
uv sync                             # Install / sync dependencies
uv run main.py                      # Start FastAPI on :8000 (with hot-reload)
uv add <package>                    # Add a new Python dependency
uv run playwright install chromium  # Download browser for scraper (first-time setup)
uv run python -c "..."              # Run a one-liner in the venv

# Alembic migrations (PostgreSQL)
uv run alembic upgrade head                          # Apply all migrations
uv run alembic revision --autogenerate -m "desc"    # Generate new migration from model changes
uv run alembic downgrade -1                          # Roll back one migration

# Celery worker (required for pipeline jobs)
uv run celery -A backend.celery_app worker --loglevel=info
```

### Frontend (Next.js / npm)

```bash
cd frontend
npm install        # Install Node dependencies
npm run dev        # Start Next.js dev server on :3000
npm run build      # Production build (catches TypeScript errors)
npm run lint       # ESLint check
npx tsc --noEmit   # Type-check without building
```

### Setup checklist

1. Copy `.env.example` → `.env` and fill in API keys + `DATABASE_URL` + `REDIS_URL`
2. Copy `frontend/.env.local.example` → `frontend/.env.local` and fill in `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
3. `uv sync`
4. `uv run playwright install chromium`
5. Start PostgreSQL and Redis (e.g. `docker compose up postgres redis`)
6. `uv run alembic upgrade head`
7. `cd frontend && npm install`
8. Run all three processes: `uv run main.py` + `uv run celery -A backend.celery_app worker` + `cd frontend && npm run dev`

## Project Overview

**Veridicus** is a multi-tenant SaaS resume authentication platform. Organizations (Admins) sign in via Google, invite candidates by email, and view aggregated dashboards. Each candidate receives a unique signed URL, uploads their resume, and is put through an adaptive AI interrogation that scores their claimed skills in real time.

## Architecture

### Stack

- **Backend**: Python + FastAPI (synchronous routes; psycopg2 for PostgreSQL)
- **Database**: PostgreSQL via SQLModel ORM; schema migrations managed by **Alembic** (`alembic/`)
- **Task Queue**: **Celery + Redis** — pipeline jobs run as Celery tasks (`backend/worker.py`), decoupled from the FastAPI process
- **Agent Orchestration**: LangGraph `StateGraph` (`backend/agents/pipeline.py`)
- **Web Scraping**: Playwright headless Chromium + DuckDuckGo → httpx PDF download → pdfplumber text extraction
- **Auth**: **NextAuth.js v4** (Google provider) on the frontend; FastAPI verifies HS256 JWTs signed by `NEXTAUTH_SECRET` via `backend/auth.py`
- **Email**: **Resend** via `backend/mail.py` (falls back to console log if `RESEND_API_KEY` is unset)
- **Frontend**: Next.js 14 App Router + Ant Design v5 + Glassmorphism design system (`globals.css`)

### Multi-Tenancy Model

Soft multi-tenancy: shared database, `org_id` column on `candidates` filters all queries.

- `Organization` — created automatically on first Google sign-in via the `signIn` callback in `frontend/src/lib/auth.ts`
- `Invitation` — UUID token sent by email; candidates access `/invite/{token}` without logging in
- `get_current_org()` in `backend/auth.py` is the FastAPI dependency that extracts the org from the JWT and is injected into all org-scoped routes

### LangGraph Pipeline (run as Celery task on upload)

```
Resume Upload / Invite Start
  └─► extraction_node        parse resume → skills + projects + GitHub username
  └─► scraper_node           DuckDuckGo PDF search per skill → download → extract text
  └─► code_verification_node GitHub API → repo mapping → file audit → question generation
  └─► session_init_node      pre-warm dynamic interrogator with first question
  └─► END  (status = "ready")
```

Each node has a `_safe_*` wrapper in `pipeline.py` that catches exceptions and sets `pipeline_status` so the graph continues gracefully. Pipeline status is tracked in `job_store` (in-memory, per-process) and polled by the frontend every 2 s. `job_store` is lost on restart — this is acceptable because Celery workers are separate processes.

### Adaptive Interview Engine (post-pipeline, on-demand)

The interview is **not** pre-generated. Each question is created in real time by `generate_next_question()` (`backend/agents/dynamic_interrogator_agent.py`):

1. **SkillConfidence rows** are seeded once per session (one row per claimed skill, confidence 0–100).
2. The **target skill** is the unevaluated skill with the fewest questions asked (breadth-first rotation).
3. The LLM receives: stage block, target skill, resume claims, PDF evidence (≤ 8000 chars), GitHub summary (≤ 2000 chars), Q&A history (≤ 4000 chars), previously asked question list.
4. After the candidate answers, `evaluate_answer()` scores 0–100 and updates the target skill's EMA confidence (`weight = 0.5` first question, `0.35` thereafter).
5. A skill is marked **"evaluated"** when confidence ≥ 85 %. All evaluated → `TERMINATE_SUCCESS`.

**Interview stages:** `breadth` (first 2–4 Qs: MCQ or FILL_BLANK) → `deepdive` (remaining: TROUBLESHOOT or WHAT_IF).

**Safety guards:** Jaccard dedup (0.55), answer-contamination check (0.45), bracket-placeholder detector, FILL_BLANK `___` validator, indexed fallback generator.

**Termination:** all skills ≥ 85 % → success; consecutive low-score streak → fail; 15 questions hard cap → limit.

### Database Schema (PostgreSQL / SQLModel)

| Table | Key columns |
|---|---|
| `organizations` | id (UUID), name, admin_email, google_sub |
| `invitations` | token (UUID PK), org_id, candidate_email, status (pending\|started\|completed), expires_at |
| `knowledge_records` | candidate_id (PK), graph_data (JSON), last_updated |
| `candidates` | id, name, email, resume_text, **org_id** (FK → organizations) |
| `claims` | id, candidate_id, skill_name, context |
| `source_documents` | id, claim_id, document_title, document_url, local_path, extracted_text |
| `github_verifications` | id, candidate_id, github_username, matched_repos (JSON), verification_summary, github_skipped |
| `interrogation_sessions` | id, candidate_id, session_status, current_confidence, question_count, current_stage, tab_switch_count, integrity_status, final_report, started_at, completed_at, invite_token_used |
| `assessments` | id, candidate_id, session_id, question_text, user_answer, score, feedback, question_type, options (JSON), question_number, stage, skill_name, time_taken_seconds |
| `skill_confidences` | id, session_id, skill_name, confidence, status ("evaluating"\|"evaluated"), question_count |

**Migration pattern**: all schema changes go through Alembic (`uv run alembic revision --autogenerate`). Never use `create_all` to add columns in production; never use the old `_run_migrations()` pattern.

### API Routes

All routes are prefixed `/api`. Four routers: `candidates`, `assessments`, `admin`, `public`.

**Org-authenticated routes** (require `Authorization: Bearer <NextAuth JWT>`):

| Method | Route | Description |
|---|---|---|
| POST | `/api/admin/orgs` | Create or return org (called on first sign-in) |
| GET | `/api/admin/orgs/me` | Current org details |
| GET | `/api/admin/orgs/me/stats` | Aggregate dashboard stats |
| POST | `/api/admin/invite` | Send invitations to a list of emails |
| GET | `/api/admin/invites` | List org's invitations |
| POST | `/api/candidates/upload` | Manual resume upload (org context via `org_id` form field) |
| GET | `/api/candidates/` | List org's candidates |
| GET | `/api/candidates/{id}/status?job_id=…` | Poll Celery pipeline job |
| POST | `/api/assessments/{candidate_id}/next-question` | Generate next question |
| POST | `/api/assessments/{assessment_id}/answer` | Submit answer → score |
| GET | `/api/assessments/{candidate_id}/session` | Session status |
| GET | `/api/assessments/{candidate_id}/report` | Final markdown report |
| POST | `/api/assessments/{candidate_id}/tab-switch` | Log tab-switch event |
| POST | `/api/assessments/{candidate_id}/terminate` | Force-terminate session |

**Public routes** (no auth — candidate-facing):

| Method | Route | Description |
|---|---|---|
| GET | `/api/public/invite/{token}` | Validate token, return org name + candidate email |
| POST | `/api/public/invite/{token}/start` | Create candidate, trigger pipeline, return `{candidate_id, job_id}` |

### Frontend Structure

```
frontend/src/
  app/
    page.tsx                          ← Landing page (hero + Google sign-in)
    dashboard/page.tsx                ← Org dashboard (stats, skill heatmap, invite modal, candidate grid)
    upload/page.tsx                   ← Manual resume upload + pipeline progress
    invite/[token]/page.tsx           ← Public candidate portal (no login required)
    invite/[token]/complete/page.tsx  ← Thank-you screen with confirmation code
    assessment/[id]/page.tsx          ← Interrogation Room wrapper
    assessment/[id]/terminated/       ← Integrity-violation termination screen
    api/auth/[...nextauth]/route.ts   ← NextAuth v4 handler
  components/
    QuestionWizard.tsx    ← Core interview UI: timer, MCQ/fill-blank/open, score display
    PipelineStatus.tsx    ← 2 s polling; accepts optional onReady callback; auto-redirects on "ready"
    ResumeUploader.tsx    ← Form with name/email/GitHub/file
    GlassCard.tsx         ← Glassmorphism card wrapper (variant: default|elevated|subtle)
    Providers.tsx         ← Client-side SessionProvider wrapper (used in root layout)
  hooks/
    useAntiCheat.ts       ← Right-click block, devtool key block, 3-strike tab-switch, AI extension scan
  lib/
    api.ts                ← Axios wrappers; includes auth interceptor (attaches Bearer token) + tenant APIs
    auth.ts               ← NextAuth v4 authOptions (Google provider, JWT/session callbacks, auto org-create)
    types.ts              ← TypeScript interfaces (Candidate, Organization, Invitation, OrgStats, …)
  middleware.ts           ← Protects /dashboard, /upload, /assessment, /admin; redirects authed users from /
```

**CSS variables** are defined in `globals.css`: `--text-primary`, `--text-secondary`, `--text-body`, `--text-muted`, `--blue-*`, `--glass-bg`. Always use these — never hardcode colours in component styles.

**Anti-cheat** (`useAntiCheat`): active only on the assessment page. Tracks `visibilitychange` events; strikes 1–2 show a warning modal, strike 3 calls `POST /terminate` and redirects to `/assessment/[id]/terminated`.

**Timer safety**: `QuestionWizard` stores `handleSubmit` in a `handleSubmitRef` that is kept current each render, so the `setInterval` callback always calls the latest version without stale-closure bugs.

### LLM Provider Configuration

`get_llm()` in `backend/agents/llm_factory.py` switches on `LLM_PROVIDER`:

| Value | Provider | Key env vars |
|---|---|---|
| `anthropic` (default) | Claude via `langchain_anthropic` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| `openai` | OpenAI via `langchain_openai` | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| `ollama` | Local Ollama | `OLLAMA_MODEL`, `OLLAMA_BASE_URL` |
| `cerebras` | Cerebras (OpenAI-compat) | `CEREBRAS_API_KEY`, `CEREBRAS_MODEL` |
| `arliai` | ArliAI (OpenAI-compat) | `ARLIAI_API_KEY`, `ARLIAI_MODEL` |
| `nvidia` | NVIDIA NIM (OpenAI-compat) | `NVIDIA_API_KEY`, `NVIDIA_MODEL` |

All LLM calls go through `get_llm(temperature=…)`. Never import a provider SDK directly in agent files.

### Key Conventions

- **`PolygraphState`** (`backend/agents/state.py`) is the LangGraph shared state TypedDict; only pipeline nodes read/write it. The interview engine uses direct DB queries instead.
- **`job_store`** is an in-memory dict (thread-safe within a process). The Celery worker and the FastAPI process share nothing in memory — the worker updates `job_store` in its own process. The FastAPI process has its own `job_store` that gets updated via the worker's direct call to `job_store.set_status`. This works because both share the same Python process on a single machine; for true multi-process deployments, `job_store` should be moved to Redis.
- **Report generation** (`report_generator_agent.py`) is called inline at session termination — it builds a programmatic markdown header (skill matrix table, behavioural metadata) then appends an LLM-generated strengths/weaknesses/recommendation analysis.
- **`question_generator_agent.py`** is a legacy file used during the pipeline phase to pre-seed `github`-sourced assessment rows. The live interview uses `dynamic_interrogator_agent.py` instead.
- **Schemas** live in `backend/schemas/` (Pydantic `BaseModel`), separate from SQLModel ORM models in `backend/models/`. Always update both when adding fields, then generate an Alembic migration.
- **`NEXTAUTH_SECRET`** must be identical in `backend/.env` and `frontend/.env.local` — the backend uses it to verify JWTs that NextAuth signs.
