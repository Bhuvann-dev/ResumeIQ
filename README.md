<div align="center">

# 🎯 ResumeIQ

### AI Resume Analyzer that helps freshers beat the ATS and land more interviews.

*Upload a resume → get an ATS score and specific fixes → download an interview-ready version. Under 2 minutes.*

[![Status](https://img.shields.io/badge/status-in%20development-yellow)]()
[![Frontend](https://img.shields.io/badge/frontend-Next.js%20%2B%20TypeScript-black)]()
[![Backend](https://img.shields.io/badge/backend-FastAPI-009688)]()
[![Database](https://img.shields.io/badge/database-PostgreSQL-336791)]()
[![AI](https://img.shields.io/badge/AI-OpenAI-10a37f)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

<!-- Replace with a real link once deployed -->
**[ Live Demo (coming soon) ]()** · **[PRD](docs/prd.md)** · **[Architecture](docs/architecture.md)** · **[Decisions](docs/decisions.md)**

</div>

---

## The Problem

Freshers apply to hundreds of jobs and hear nothing back. The hidden reason usually isn't their skills — it's that **most resumes are filtered out by ATS (Applicant Tracking Systems) before a human ever reads them.** Freshers don't know whether their resume is machine-readable, which keywords a role expects, or why their phrasing and formatting hurt them. They also can't afford career coaches or paid resume services.

**ResumeIQ gives every fresher a free, AI-powered resume co-pilot.**

## What It Does

| Step | What happens |
|------|--------------|
| **1. Upload** | Drop a PDF or DOCX. No signup required. |
| **2. Analyze** | AI scores the resume 0–100 on ATS-readiness and finds concrete issues. |
| **3. Understand** | Feedback is categorized (Critical / Warning / Suggestion) with *what's wrong, why it matters, how to fix.* |
| **4. Improve** | AI rewrites weak bullets — using your real facts, never invented ones. |
| **5. Download** | Export a clean, ATS-friendly version as PDF or DOCX. |

Optionally paste a **job description** to get a keyword-match score and gap analysis.

## Screenshots

> _Coming soon — UI in development. Placeholder frames below._

| Dashboard | Analysis | Upload |
|-----------|----------|--------|
| _(screenshot)_ | _(screenshot)_ | _(screenshot)_ |

## Architecture at a Glance

```
Client (Next.js)  →  API Gateway  →  FastAPI (stateless)
                                        ├─ Parsing Service   (PDF/DOCX → text)
                                        ├─ Job Queue         (Redis + Celery)
                                        │     └─ AI Service   (OpenAI: score + rewrite)
                                        ├─ Export Service    (→ PDF/DOCX)
                                        ├─ PostgreSQL        (users · analyses · results)
                                        └─ Object Storage    (temp resumes, auto-deleted)
```

Full breakdown with diagrams → **[docs/architecture.md](docs/architecture.md)**.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Backend | FastAPI (Python) |
| Async | Redis + Celery |
| Database | PostgreSQL |
| AI | OpenAI (GPT) via structured outputs, behind a swappable client |
| Storage | S3 / GCS with lifecycle auto-delete |
| Auth | OAuth (Google) + JWT, guest-first |
| Hosting | Vercel (web) + containerized API/workers |

Why each of these? → **[docs/decisions.md](docs/decisions.md)**.

## Documentation

This repo is documented like a real product, not a code dump:

- 📄 **[docs/prd.md](docs/prd.md)** — the problem, users, requirements, and success metrics.
- 🏛️ **[docs/architecture.md](docs/architecture.md)** — how the system fits together, with diagrams.
- 🧭 **[docs/decisions.md](docs/decisions.md)** — the *why* behind every major technical choice (ADRs).
- 🔌 **[docs/api-spec.md](docs/api-spec.md)** — the API contract (live `/analyze` endpoint + planned routes).
- 🗄️ **docs/database.md** — schema and relationships _(added alongside migrations)_.

## Getting Started

The MVP slice runs as two apps — a FastAPI backend and a Next.js frontend.

```bash
git clone https://github.com/Bhuvann-dev/ResumeIQ.git && cd ResumeIQ

# 1. Backend (needs an OpenAI API key)
cd api
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # paste your ANTHROPIC_API_KEY into .env, then load it
uvicorn main:app --reload   # http://localhost:8000/docs

# 2. Frontend (in a second terminal)
cd web
npm install
cp .env.example .env.local  # points at http://localhost:8000 by default
npm run dev                 # http://localhost:3000
```

See [api/README.md](api/README.md) for backend details.

## Roadmap

- [x] Product definition (PRD)
- [x] System architecture
- [x] Architecture Decision Records
- [x] MVP vertical slice: upload → parse → AI score (FastAPI + Next.js)
- [x] AI rewrite + download improved resume (DOCX)
- [ ] Deployed public demo
- [ ] Analysis dashboard UI
- [ ] Accounts, history, and settings
- [ ] Pricing & freemium limits

See the full breakdown in [GitHub Issues](../../issues).

## Status

🚧 **In active development.** Built as a portfolio-grade project — planning and documentation first, then a thin deployed slice, then features.

## License

MIT © 2026 Arpitha N
