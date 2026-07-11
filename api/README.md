# ResumeIQ API

FastAPI backend for the MVP slice: **upload → parse → AI score**.

## Run locally

```bash
cd api
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then paste your OPENAI_API_KEY into .env
# load .env into your shell (or use a tool like python-dotenv / direnv), then:
uvicorn main:app --reload
```

Open http://localhost:8000/docs for the interactive API docs.

## Endpoints

- `GET /health` → `{ "status": "ok", "ai_configured": true|false }`
- `POST /analyze` (multipart) → `AnalysisResult` JSON. See [../docs/api-spec.md](../docs/api-spec.md).

## Notes

- Resume bytes are read into memory and never written to disk.
- Analysis is **synchronous** for the slice; the async queue (Redis + Celery)
  arrives in a later milestone per [../docs/architecture.md](../docs/architecture.md).
