# ResumeIQ — System Architecture

**Status:** Draft v1 · **Last updated:** 2026-07-11

This document describes how ResumeIQ fits together, layer by layer. It reflects the intended design; sections marked _(planned)_ are not yet implemented. Rationale for the technology choices lives in [decisions.md](decisions.md).

---

## 1. Design Principles

1. **Guest-first.** The core flow (upload → analyze → download) requires no login. Friction kills fresher adoption.
2. **Stateless API.** The API tier holds no session state, so it scales horizontally during placement-season traffic spikes.
3. **Async for heavy work.** Parsing and AI calls run as queued jobs, keeping the API responsive and resilient to slow AI responses.
4. **Privacy-first.** Resumes are PII. Raw files are transient, encrypted, never logged, and auto-deleted after processing.
5. **Model-agnostic AI.** The LLM sits behind an abstraction so the model can be swapped or upgraded without touching business logic.

---

## 2. System Overview

```mermaid
graph TB
    subgraph Client["Client Layer"]
        WEB["Web App — Next.js + React"]
    end

    subgraph Edge["Edge / Gateway"]
        CDN["CDN + Static Assets"]
        GW["API Gateway — HTTPS · Rate Limit · Auth"]
    end

    subgraph App["Application Layer"]
        API["Backend API — FastAPI (stateless)"]
        PARSE["Parsing Service — PDF/DOCX → text"]
        AI["AI Analysis Service — score + rewrite"]
        EXPORT["Export Service — → PDF/DOCX"]
        QUEUE["Job Queue — Redis + Celery"]
    end

    subgraph Data["Data Layer"]
        DB[("PostgreSQL — users · analyses")]
        CACHE[("Redis Cache")]
        BLOB["Object Storage — temp resumes (auto-delete)"]
    end

    subgraph External["External"]
        LLM["OpenAI API — GPT"]
        AUTHP["Auth Provider — OAuth / JWT"]
    end

    WEB --> CDN
    WEB --> GW
    GW --> API
    API --> PARSE
    API --> QUEUE
    QUEUE --> AI
    API --> EXPORT
    PARSE --> BLOB
    AI --> LLM
    API --> DB
    API --> CACHE
    API --> AUTHP
    EXPORT --> BLOB
```

---

## 3. Frontend

Next.js (App Router) + TypeScript + Tailwind. Guest-first, mobile-responsive, with polling for async analysis progress.

```mermaid
graph TD
    ROUTER["App Router"] --> PAGES["Screens: Landing · Upload · Analysis · History · Settings · Profile · Pricing"]
    PAGES --> COMPS["Shared UI Kit: Dropzone · ScoreRing · IssueCard · DiffView · DataTable"]
    COMPS --> STATE["State: API client · React Query (polling) · Auth context · UI store"]
    STATE --> GW["→ API Gateway"]
```

Key decisions: server state via React Query with polling for the queued analysis job; a themeable design-token system for light/dark mode.

---

## 4. Backend

A modular FastAPI application (a modular monolith that can be split into services later). Requests pass through middleware (auth, rate limiting, validation, logging) into a service layer, which talks to data via a repository layer. Heavy work is handed to a Celery worker via a Redis queue.

```mermaid
graph TD
    GW["API Gateway"] --> MW["Middleware — Auth · RateLimit · Validation · Logging"]
    MW --> SVC["Service Layer — Upload · Parsing · Analysis · Export · History"]
    SVC --> REPO["Repository Layer"]
    REPO --> DB[("PostgreSQL")]
    REPO --> CACHE[("Redis")]
    SVC --> QP["Queue Producer"] --> QUEUE["Redis Queue"] --> WORKER["Celery Worker — parse + AI"]
    WORKER --> LLM["OpenAI API"]
    SVC --> BLOB["Object Storage"]
```

---

## 5. AI Service

The intelligence core, isolated behind a single `analyzer` module so the model or provider can change without touching the rest of the app.

```mermaid
graph TD
    IN["Structured resume text (+ optional JD)"] --> PB["Prompt Builder — role + rubric + resume + JD"]
    PB --> GUARD["Guardrails — no fabrication · PII-safe"]
    GUARD --> CALL["AI Client (OpenAI, env-configurable model)"]
    CALL --> MODEL["GPT — structured-output call"]
    MODEL --> PARSEOUT["Response parser → structured JSON"]
    PARSEOUT --> VALID["Schema validation — score · issues · rewrites"]
    VALID --> OUT["Analysis result"]
```

- **Structured output:** the model is forced to return validated JSON (score, issues, rewrites) via OpenAI structured outputs — no fragile text parsing.
- **One schema, no drift:** the same Pydantic model is the API contract *and* the AI output schema (see [decisions.md](decisions.md) ADR-005).
- **Swappable:** the provider lives in one module and the model id is an env var, so switching model/provider is a localized change.
- **Guardrails:** scores real content only — no invented experience.
- **Cost control:** token caps + caching of identical requests (planned).

---

## 6. Data Layer

- **PostgreSQL** — users, analyses, issues, rewrites, exports, job matches. Structured results, not raw files. Full schema in _docs/database.md (planned)_.
- **Redis** — cache + job queue broker.
- **Object Storage (S3/GCS)** — transient resume uploads and generated exports, accessed via short-TTL signed URLs, with lifecycle auto-delete.

---

## 7. Authentication

Guest-first; OAuth (Google) + JWT for users who want saved history.

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant GW as API Gateway
    participant AUTH as Auth Provider
    participant API as Backend
    participant DB as PostgreSQL

    Note over U,FE: Core flow works in guest mode — no login required

    alt Optional sign-in
        U->>FE: Sign in with Google
        FE->>AUTH: OAuth redirect
        AUTH-->>FE: ID token
        FE->>GW: POST /auth/login (token)
        GW->>API: verify
        API->>DB: upsert user
        API-->>FE: JWT (access + refresh)
    end

    U->>FE: Upload resume
    FE->>GW: request + JWT (or guest)
    GW->>API: forward (user_id or null)
```

---

## 8. End-to-End Request Flow

The full happy path with async analysis:

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as Backend API
    participant BLOB as Object Storage
    participant Q as Queue
    participant W as Worker
    participant LLM as OpenAI API
    participant DB as PostgreSQL

    U->>FE: Upload resume (+ optional JD)
    FE->>API: POST /analyses (file)
    API->>BLOB: store temp file
    API->>DB: create analysis (status=queued)
    API->>Q: enqueue job
    API-->>FE: 202 { analysis_id }

    loop poll ~2s
        FE->>API: GET /analyses/{id}
        API-->>FE: status: processing
    end

    Q->>W: dispatch
    W->>BLOB: fetch file
    W->>W: parse → structured text
    W->>LLM: prompt (resume + JD + rubric)
    LLM-->>W: JSON (score, issues, rewrites)
    W->>DB: save results (status=done)
    W->>BLOB: delete temp file

    FE->>API: GET /analyses/{id}
    API-->>FE: status: done + results
    U->>FE: Accept fixes → Download
    FE->>API: POST /analyses/{id}/export
    API->>BLOB: store export + signed URL
    API-->>FE: download URL
```

---

## 9. Deployment _(planned)_

```mermaid
graph TB
    BROWSER["Browser / Mobile"] --> VERCEL["Vercel — Next.js + CDN"]
    VERCEL --> LB["Load Balancer + Gateway (HTTPS, WAF)"]
    LB --> API["FastAPI (autoscaling)"]
    API --> REDIS[("Redis — cache + queue")]
    API --> PG[("Managed PostgreSQL")]
    API --> S3["Object Storage"]
    REDIS --> WORKERS["Celery Workers (autoscaling)"]
    WORKERS --> LLM["OpenAI API"]
    API --> SENTRY["Sentry + metrics"]
```

| Concern | Approach |
|---------|----------|
| Frontend | Vercel (CDN, preview deploys) |
| API / workers | Containers on a managed platform → orchestrated at scale |
| Scaling | Stateless API + workers scale on CPU / queue depth |
| Data | Managed Postgres (backups, replica), managed Redis |
| Security | HTTPS, WAF, secrets manager, least-privilege IAM |
| CI/CD | Push → build → test → deploy (rolling) |
| Monitoring | Sentry + funnel & latency metrics |

---

## 10. Data Lifecycle & Privacy

```mermaid
flowchart LR
    A["Upload → file in storage + pointer row"] --> B["Worker parses → structured text in DB"]
    B --> C["Analysis done — results saved"]
    C --> D["Raw file deleted from storage"]
    C --> E["Guest analysis: expires_at set"]
    E --> F["Cleanup job deletes expired rows (cascade)"]
```

Raw resume files are transient; only structured results persist. Guest data expires automatically. No raw PII is written to logs.
