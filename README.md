# Veridicus

A multi-agent system that authenticates resume claims by researching skills via live web PDFs, auditing a candidate's actual GitHub code, and generating targeted technical assessments.

Upload a resume → AI extracts skills + GitHub username → scrapes technical PDFs → audits real repos → generates deep-dive questions (from both documentation and actual code) → scores your answers.

---

## Demo

### Interrogation Room

> The timed assessment experience — one question at a time, 120s per question, questions tagged by source (Code Verified / Documentation).

<div align="center">
  <video src="videos/Interogation%20Room.mp4" width="100%" controls>
    Your browser does not support the video tag.
  </video>
</div>

---

### Knowledge Graph

> Interactive React Flow canvas — visualises extracted skills, GitHub repos, and PDF sources as a 3-level hierarchy: Candidate → Repo → Language/Skill → Resource.

<!-- Add knowledge graph walkthrough video here -->
<div align="center">
  <video src="videos/Veridicus%20-%20KG.mp4" width="100%" controls>
    Your browser does not support the video tag.
  </video>
</div>
---

### Admin Panel

> Upload proprietary PDFs, manage assessments, trigger GitHub re-verification, and view candidate reports.

<!-- Add admin panel walkthrough video here -->
<div align="center">
  <video src="videos/Veridicus%20-%20Admin.mp4" width="100%" controls>
    Your browser does not support the video tag.
  </video>
</div>

---

## Stack

| Layer               | Technology                                                   |
| ------------------- | ------------------------------------------------------------ |
| Backend             | Python 3.10 + FastAPI                                        |
| Agent Orchestration | LangGraph state graph                                        |
| Web Scraping        | Playwright (Bing search) + httpx (PDF download + GitHub API) |
| PDF Extraction      | pdfplumber                                                   |
| Database            | SQLite via SQLModel ORM                                      |
| Frontend            | Next.js 14 App Router                                        |
| UI                  | Ant Design v5 + Glassmorphism theme                          |
| LLM                 | Anthropic Claude, OpenAI GPT-4o, or Ollama (local)           |

---

## How It Works

```
Resume Upload
     │
     ▼
Extraction Agent      ←  LLM parses resume → extracts top skills + GitHub username
     │
     ▼
Scraper Agent         ←  Playwright searches Bing for "{skill} filetype:pdf"
                          httpx downloads PDFs → pdfplumber extracts text
     │
     ▼
Code Verification     ←  GitHub REST API fetches public repos
Agent                     LLM matches repos to resume claims (project_match or skill_match)
                          Reads key source files (up to 5 per repo, 5 repos max)
                          Audits code alignment + seniority vs. claims
                          Generates code-specific questions referencing real files/functions
     │
     ▼
Question Generator    ←  LLM generates 3–5 deep technical questions per skill from PDFs
     │
     ▼
Interrogation Room    ←  120s timer per question, one at a time
                          Questions tagged "Code Verified" (GitHub) or "Documentation" (PDF)
     │
     ▼
Evaluation Agent      ←  LLM scores answer 0–100% against knowledge base
     │
     ▼
Dashboard             ←  Candidate cards with skill tags + aggregate score

─── Additional Routes ────────────────────────────────────────────────────────

/knowledge-graph        ←  Interactive React Flow canvas — visualises extracted
                            skills, GitHub repos, and PDF sources as a graph

/admin/upload-knowledge ←  Admin panel — inject proprietary PDFs as ground-truth
                            knowledge for a specific job role / tag set
```

---

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- One of: an [Anthropic API key](https://console.anthropic.com/), an [OpenAI API key](https://platform.openai.com/), or [Ollama](https://ollama.com/) running locally
- (Optional) A [GitHub personal access token](https://github.com/settings/tokens) — raises API limit from 60 to 5000 req/hour

### 1. Clone & configure

```bash
git clone <repo-url>
cd "AI Polygraph"
cp .env.example .env
# Edit .env — set LLM_PROVIDER and the corresponding key/model
# Optionally add GITHUB_TOKEN for higher GitHub API rate limits
```

### 2. Backend

```bash
uv sync                            # Install Python dependencies
uv run playwright install chromium # Download headless browser
uv run main.py                     # Start FastAPI on http://localhost:8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                        # Start Next.js on http://localhost:3000
```

---

## Environment Variables

| Variable            | Default                    | Description                                         |
| ------------------- | -------------------------- | --------------------------------------------------- |
| `LLM_PROVIDER`      | `anthropic`                | `anthropic`, `openai`, or `ollama`                  |
| `ANTHROPIC_API_KEY` | —                          | Required if using Anthropic                         |
| `ANTHROPIC_MODEL`   | `claude-opus-4-6`          | Model ID                                            |
| `OPENAI_API_KEY`    | —                          | Required if using OpenAI                            |
| `OPENAI_MODEL`      | `gpt-4o`                   | Model ID                                            |
| `OLLAMA_MODEL`      | `llama3.2`                 | Any model pulled via `ollama pull`                  |
| `OLLAMA_BASE_URL`   | `http://localhost:11434`   | Ollama server URL                                   |
| `DATABASE_URL`      | `sqlite:///./polygraph.db` | Auto-created on first run                           |
| `DOWNLOADS_DIR`     | `./downloads`              | Where scraped PDFs are saved                        |
| `CORS_ORIGINS`      | `http://localhost:3000`    | Comma-separated allowed origins                     |
| `GITHUB_TOKEN`      | `""`                       | Optional — raises GitHub API limit to 5000 req/hour |

### GitHub token (optional but recommended)

Without a token, the Code Verification Agent still runs but is limited to 60 GitHub API requests per hour. The token only needs public read access (no scopes required for public repos).

```bash
# In .env:
GITHUB_TOKEN=ghp_...
```

If no GitHub URL is found in the resume, the agent gracefully skips code verification and the assessment runs documentation-only.

### Using Ollama (free, local)

```bash
# Install Ollama from https://ollama.com, then:
ollama pull llama3.2        # or mistral, gemma2, qwen2.5, etc.

# In .env:
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434
```

---

## API Reference

| Method | Endpoint                                   | Description                                        |
| ------ | ------------------------------------------ | -------------------------------------------------- |
| `POST` | `/api/candidates/upload`                   | Upload resume (multipart: `name`, `email`, `file`) |
| `GET`  | `/api/candidates/`                         | List all candidates                                |
| `GET`  | `/api/candidates/{id}`                     | Get candidate + claims                             |
| `GET`  | `/api/candidates/{id}/status?job_id=…`     | Poll pipeline status                               |
| `GET`  | `/api/candidates/{id}/github-verification` | Get GitHub audit results                           |
| `GET`  | `/api/assessments/{candidate_id}`          | Get all questions                                  |
| `POST` | `/api/assessments/{id}/answer`             | Submit answer → returns score + feedback           |

Interactive docs available at `http://localhost:8000/docs`.

---

## Frontend Routes

| URL                                              | Description                                                   |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `http://localhost:3000/`                         | Dashboard — all candidates with skill tags and avg score      |
| `http://localhost:3000/upload`                   | Upload a resume and watch the pipeline run                    |
| `http://localhost:3000/assessment/{id}`          | Interrogation Room for a specific candidate                   |
| `http://localhost:3000/knowledge-graph`          | Interactive graph of skills, repos, and PDF sources           |
| `http://localhost:3000/admin/upload-knowledge`   | Admin — inject proprietary PDFs into the knowledge base       |
| `http://localhost:3000/admin/manage-assessments` | Admin — view all candidates and bulk-delete their assessments |

---

## Project Structure

```
Veridicus/
├── .env                        ← your keys (gitignored)
├── .env.example                ← template
├── main.py                     ← uvicorn entrypoint
├── downloads/                  ← scraped PDFs (gitignored)
│
├── backend/
│   ├── config.py               ← pydantic-settings (incl. GITHUB_TOKEN)
│   ├── database.py             ← SQLModel engine
│   ├── models/
│   │   ├── candidate.py
│   │   ├── claim.py
│   │   ├── source_document.py
│   │   ├── assessment.py       ← includes source field ("pdf" | "github")
│   │   └── github_verification.py ← matched repos + audit summary
│   ├── agents/
│   │   ├── state.py            ← PolygraphState TypedDict
│   │   ├── llm_factory.py      ← provider abstraction
│   │   ├── extraction_agent.py ← extracts skills + github_username
│   │   ├── scraper_agent.py
│   │   ├── code_verification_agent.py ← GitHub audit + code questions
│   │   ├── question_generator_agent.py
│   │   ├── evaluation_agent.py ← standalone per-answer scoring
│   │   └── pipeline.py         ← LangGraph graph
│   ├── services/
│   │   ├── job_store.py        ← thread-safe status tracking
│   │   ├── github_service.py   ← GitHub REST API wrapper (30-call budget)
│   │   ├── pdf_service.py
│   │   └── resume_parser.py
│   └── api/
│       ├── app.py
│       └── routes/
│           ├── candidates.py   ← incl. /github-verification endpoint
│           └── assessments.py
│
└── frontend/
    └── src/
        ├── app/
        │   ├── layout.tsx          ← AntdRegistry + ConfigProvider
        │   ├── page.tsx            ← Dashboard
        │   ├── upload/page.tsx     ← Upload + pipeline status
        │   ├── assessment/[id]/page.tsx  ← Interrogation Room
        │   ├── knowledge-graph/page.tsx  ← Interactive skill/repo/PDF graph
        │   └── admin/upload-knowledge/page.tsx ← Admin PDF ingestion panel
        ├── components/
        │   ├── GlassCard.tsx
        │   ├── ResumeUploader.tsx
        │   ├── PipelineStatus.tsx  ← 5-step progress incl. Verifying
        │   ├── QuestionWizard.tsx  ← 120s timer + source badge per question
        │   ├── GitHubVerificationBanner.tsx ← matched repos + audit summary
        │   └── ScoreDisplay.tsx
        ├── lib/
        │   ├── api.ts              ← axios wrappers
        │   └── types.ts
        └── theme/
            └── antdTheme.ts        ← glassmorphism token overrides
```
