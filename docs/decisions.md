# Architecture Decision Records (ADRs)

This document records the **why** behind ResumeIQ's major technical choices — the tradeoffs considered and the reasoning, not just the outcome. Each record is dated and has a status.

> Format: each ADR states the **context**, the **options** weighed, the **decision**, and the **consequences** (including what we give up).

---

## ADR-001 — PostgreSQL over MongoDB

**Status:** Accepted · **Date:** 2026-07-11

### Context
ResumeIQ's core data is relational: a user has many analyses; an analysis has many issues, rewrites, and exports, plus an optional job match. We frequently query "all analyses for a user, newest first" and rely on cascading deletes for privacy cleanup.

### Options
- **PostgreSQL** — relational, strong constraints, `JSONB` for flexible fields, transactional integrity.
- **MongoDB** — document model, flexible schema, easy to start.

### Decision
**PostgreSQL.**

### Reasoning
- The data is genuinely relational. Foreign keys with `ON DELETE CASCADE` give us **automatic, correct privacy cleanup** — when a guest analysis expires, all its children vanish in one operation. Emulating that in MongoDB means application-level bookkeeping and risk of orphaned PII.
- Postgres `JSONB` covers the one place we need flexibility (parsed resume sections, keyword arrays), so we don't lose document-style ergonomics.
- Strong constraints (`CHECK` on score 0–100, enum-like status values) push correctness into the database instead of trusting every code path.
- Managed Postgres is ubiquitous, cheap, and well-understood.

### Consequences
- We manage schema migrations deliberately (a feature, not a bug — it documents evolution).
- We give up MongoDB's schema-free speed for early prototyping, but the relational integrity is worth it for PII-bearing data.

---

## ADR-002 — FastAPI (Python) over Node/Express or NestJS

**Status:** Accepted · **Date:** 2026-07-11

### Context
The heart of the product is AI analysis and document parsing. The backend must talk to LLMs, parse PDF/DOCX, and run async jobs.

### Options
- **FastAPI (Python)** — async, typed via Pydantic, first-class AI/ML and document ecosystem.
- **Express (Node)** — minimal, huge ecosystem, but unopinionated (bring your own everything).
- **NestJS (Node)** — structured/opinionated, but heavier and still in the JS document/AI ecosystem.

### Decision
**FastAPI.**

### Reasoning
- **The document + AI ecosystem lives in Python.** PDF/DOCX parsing (PyMuPDF, pdfplumber, python-docx) and AI tooling are more mature and battle-tested here than in Node. This is the single biggest factor — our hardest problems are Python's strong suit.
- **Pydantic** gives request/response validation and typed LLM output parsing out of the box — exactly what we need to validate structured AI responses.
- Native `async`/`await` handles concurrent I/O (LLM calls, storage) cleanly.
- Auto-generated OpenAPI docs give us a live API contract for free, which feeds `docs/api-spec.md`.

### Reasoning against the alternatives
- **Express** is fast to start but unopinionated; we'd assemble validation, structure, and docs ourselves, and still be in the weaker ecosystem for parsing/AI.
- **NestJS** brings welcome structure but doesn't solve the ecosystem problem — parsing and AI would still be second-class compared to Python.

### Consequences
- A polyglot repo (TypeScript frontend + Python backend). Acceptable: the boundary is a clean HTTP contract, and each side uses the best tool for its job.

---

## ADR-003 — Async job queue (Redis + Celery) over synchronous requests

**Status:** Accepted · **Date:** 2026-07-11

### Context
An analysis involves parsing plus one or more LLM calls, which can take several seconds and occasionally stall. Doing this inside the HTTP request risks timeouts and ties up API workers.

### Options
- **Synchronous** — do everything in the request; simplest.
- **Async queue (Redis + Celery)** — enqueue a job, return immediately, poll for the result.

### Decision
**Async queue.** The API accepts an upload, returns `202` with an `analysis_id`, and a Celery worker does the heavy lifting. The client polls for status.

### Reasoning
- Keeps the API **responsive and stateless**, so it scales independently of slow AI calls.
- Isolates failures: a stuck LLM call kills a worker job, not the API tier.
- During placement season, we scale workers on queue depth without over-provisioning the API.

### Consequences
- More moving parts (broker + workers) and a polling UX. Worth it for reliability and scale; a synchronous MVP would buckle under a slow provider.

---

## ADR-004 — Guest-first auth with OAuth + JWT, no auth on the critical path

**Status:** Accepted · **Date:** 2026-07-11

### Context
Our users are freshers who bounce at any friction. But we also want optional accounts for saved history, and we handle PII.

### Options
- **Login required** — simplest data model, but adds friction to the core value.
- **Guest-first + optional OAuth/JWT** — anyone can analyze; sign in only to save history.
- **Managed auth service (e.g. a hosted provider)** — fastest to wire, but adds cost/lock-in for a feature we barely need at MVP.

### Decision
**Guest-first.** The upload → analyze → download flow needs no account. `analyses.user_id` is nullable. Optional Google OAuth issues JWTs for users who want history.

### Reasoning
- The product's value must be reachable in under two minutes — a signup wall directly undermines the core metric.
- OAuth + JWT is a well-understood, low-cost pattern; we control it and avoid vendor lock-in for something this simple.
- A nullable `user_id` plus expiring guest analyses keeps the schema simple and privacy clean.

### Consequences
- We handle token issuance/refresh ourselves rather than offloading to a managed service. Acceptable given the narrow scope; revisit if auth needs grow (SSO, teams for the B2B/campus tier).

---

## ADR-005 — OpenAI (GPT) for the AI engine, behind a swappable abstraction

**Status:** Accepted · **Date:** 2026-07-11 · **Supersedes:** an earlier draft that specified Claude

### Context
AI is the core of the product. Models change fast and cost varies, so we need a provider that's a good fit today without locking the design to it. For ATS scoring — a structured-extraction task — the leading providers are close to interchangeable in quality.

### Options
- **OpenAI (GPT)** — mature Python SDK, first-class structured outputs, and the credits/access the builder already has.
- **Anthropic (Claude)** — comparable quality and structured outputs; would require separate API billing to set up.

### Decision
Use the **OpenAI API** (GPT), called through a single `analyzer` module that forces **structured JSON output** validated against the shared Pydantic schema. The model id is env-configurable (`OPENAI_MODEL`), and the provider is isolated in one module so it can be swapped later.

### Reasoning
- **Practical access wins when quality is a wash.** ATS scoring doesn't need a specific frontier model; both providers handle it well. The deciding factor is that the builder already has OpenAI API access, so there's no reason to add a second billing relationship.
- **Structured, validated output** (`client.chat.completions.parse` + a Pydantic schema) makes responses reliable to consume and lets the model be constrained to exactly our schema — no fragile text parsing.
- **Isolation** keeps the provider in one file. The Pydantic schema *is* both the API contract and the AI output schema, so swapping providers later means editing `analyzer.py` only — the rest of the app doesn't know or care who serves the model.
- **Guardrails** in the prompt enforce a hard product rule: base scoring on real content, never fabricate experience.

### Consequences
- A ChatGPT subscription does **not** grant API access — the API is separately billed pay-as-you-go. This is documented in the setup instructions so it isn't a surprise at deploy time.
- We keep a thin abstraction and prompt discipline. Cheap insurance: if a better/cheaper model or provider appears, only `analyzer.py` changes.

---

## ADR-006 — Transient file storage with auto-delete, not permanent resume storage

**Status:** Accepted · **Date:** 2026-07-11

### Context
Resumes are dense PII (name, contact, history). Storing them indefinitely is a liability with little product benefit — we need the *structured results*, not the original file.

### Decision
Store uploads in object storage **temporarily**, delete the raw file immediately after parsing, access everything via **short-TTL signed URLs**, and apply **lifecycle auto-delete** rules. Guest analyses carry an `expires_at` and are purged by a cleanup job. Persist only structured results in Postgres.

### Reasoning
- **Minimize PII exposure by default.** The safest data is data you don't keep.
- Signed URLs mean files are never publicly reachable and links expire quickly.
- Supports GDPR / India DPDP alignment and a credible privacy story for users.

### Consequences
- Re-analysis requires re-upload rather than pulling a stored original. An acceptable, deliberate privacy tradeoff.

---

## ADR-007 — Next.js + TypeScript + Tailwind for the frontend

**Status:** Accepted · **Date:** 2026-07-11

### Context
We need a fast, responsive, guest-friendly web app with a polished dashboard and light/dark theming.

### Decision
**Next.js + TypeScript + Tailwind CSS**, with React Query for server state.

### Reasoning
- Next.js gives routing, SSR/SSG, and a great deploy story (Vercel) with minimal setup.
- TypeScript keeps a growing component/state surface safe and self-documenting.
- Tailwind + design tokens make consistent theming and dark mode straightforward.
- React Query cleanly models the **poll-for-async-result** pattern the analysis flow needs.

### Consequences
- Some Tailwind verbosity in markup; mitigated by extracting a component UI kit.

---

## Superseded / revisited decisions

_None yet. When a decision is reversed, the old ADR is marked **Superseded by ADR-NNN** and kept for history — the trail of reasoning is part of the value._
