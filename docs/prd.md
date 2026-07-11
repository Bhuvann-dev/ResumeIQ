# ResumeIQ — Product Requirements Document (PRD)

**Author:** Arpitha N · **Status:** Draft v1 (MVP) · **Last updated:** 2026-07-11

---

## 1. Problem Statement

Freshers apply to hundreds of jobs but rarely hear back. The hidden reason is often **not** their skills — it's that a large share of resumes are filtered out by **ATS (Applicant Tracking Systems)** before a human ever reads them. Freshers typically don't know:

- Whether their resume is even machine-readable.
- Which keywords the target role expects.
- Why their formatting, sections, or phrasing hurt them.

They lack access to career coaches and can't afford paid resume services. The result is silent rejection with no feedback loop.

## 2. Goal & Vision

**Goal (MVP):** Let a fresher upload a resume, get an AI-powered ATS analysis with concrete fixes, and download an improved version — in under two minutes.

**Vision:** Become the default free "resume co-pilot" that turns a fresher's raw resume into an interview-winning one, tailored to any job.

## 3. Target User

| Attribute | Detail |
|-----------|--------|
| **Primary** | Final-year students & fresh graduates (0–2 yrs), especially software/IT. |
| **Context** | Applying online; resume rejected silently; no feedback. |
| **Tech comfort** | Enough to upload a PDF; low patience for complexity. |
| **Willingness to pay** | Low initially → freemium later. |

**Core user story (MVP):**

> As a fresher, I upload my resume → the AI analyzes it → it tells me what's wrong → I improve it → I download the improved version.

## 4. Success Metrics

| Metric | Target (MVP) |
|--------|--------------|
| Time to first analysis | < 2 min |
| Analysis completion rate | > 80% of uploads |
| Users who download improved resume | > 40% |
| Avg. ATS score improvement (before → after) | +25 points |
| Week-1 retention | > 20% |

---

## 5. Functional Requirements

### FR-1 — Resume Upload
- Accept **PDF and DOCX** (max ~5 MB).
- Drag-and-drop + file picker.
- Validate file type/size with clear errors.
- Parse text reliably, preserving section structure.

### FR-2 — Resume Parsing & Section Detection
- Extract raw text from the file.
- Auto-detect standard sections: Contact, Summary, Skills, Experience, Projects, Education, Certifications.
- Flag missing or unrecognized sections.

### FR-3 — AI Analysis Engine
- Produce an **ATS Readiness Score (0–100)**.
- Evaluate across dimensions:
  - **Formatting / parseability** (tables, columns, images, fonts that break ATS).
  - **Keyword coverage** (against a target role or pasted job description).
  - **Content quality** (weak verbs, no metrics, buzzwords, length).
  - **Structure** (missing sections, ordering).
  - **Contact & links** (email, phone, LinkedIn, GitHub).
- Return **specific, actionable feedback** per issue — not generic tips.

### FR-4 — Optional Job Description Matching
- User can paste a JD (optional in MVP).
- AI computes keyword/skill gap and a match percentage.

### FR-5 — Results Dashboard
- Show score prominently, with color coding.
- Categorized issues: **Critical / Warning / Suggestion**.
- Each issue → *what's wrong* + *why it matters* + *how to fix*.
- Before/after comparison where relevant.

### FR-6 — Resume Improvement
- AI generates rewritten bullet points / sections the user can accept.
- Preserve the user's real facts — **no fabricated experience.**

### FR-7 — Download Improved Resume
- Export an ATS-friendly version as **PDF and/or DOCX**.
- Clean, single-column, machine-readable template.

### FR-8 — Lightweight Accounts (MVP-optional)
- Guest mode works with no login.
- Optional sign-in to save history (can defer post-MVP).

---

## 6. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Full analysis returns in < 15 s (P95). |
| **Scalability** | Handle bursts (placement season); stateless API tier scales horizontally. |
| **Reliability** | 99.5% uptime; graceful degradation if the AI provider is slow. |
| **Security** | HTTPS everywhere; validate/sanitize uploads; scan for malicious files. |
| **Privacy** | Resumes contain PII — encrypt in transit and at rest; auto-delete files after processing; clear retention policy; GDPR/India DPDP-aware. |
| **Cost control** | Cap AI token usage per request; cache parsing results. |
| **Usability** | Mobile-responsive; understandable by a non-technical fresher; WCAG AA basics. |
| **Observability** | Logging, error tracking, and funnel metrics. |
| **Maintainability** | Modular services; prompt logic isolated so models can be swapped. |

---

## 7. Scope

### In Scope (MVP)
Upload → parse → AI analysis → categorized feedback → AI rewrite → download. Optional JD matching. Guest-first usage.

### Out of Scope (MVP)
- Job application / auto-apply.
- Payments / subscriptions.
- Multi-language support.
- Native mobile apps.
- Recruiter-side platform.

---

## 8. Future Scope

**Near-term:** saved history & version tracking, multiple ATS templates, JD-tailored resume variants, LinkedIn import.

**Mid-term:** cover-letter generator, live editor with real-time ATS score, role-specific benchmarks, recruiter-view simulation.

**Long-term / monetization:** freemium (free scan, paid deep rewrite), B2B for colleges & placement cells, interview-prep integration, multi-language, embeddable API for job portals.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| AI fabricates experience | Constrain prompts to rewrite only existing facts; user confirms edits. |
| PII/privacy breach | Auto-delete files, encryption, no PII in logs, clear policy. |
| AI cost at scale | Use a cheaper model for bulk, cap tokens, cache parsing. |
| "ATS score" credibility | Base scoring on documented ATS best practices; be transparent about method. |
| Parsing failures on odd formats | Graceful fallback + manual text-paste option. |

---

## 10. Success Definition

The MVP is successful if a fresher can, unaided and in under two minutes, upload a resume, understand exactly what's wrong with it, and download a measurably improved, ATS-friendly version.
