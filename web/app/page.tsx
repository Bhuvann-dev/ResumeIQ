"use client";

import { useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Issue = {
  category: "critical" | "warning" | "suggestion";
  dimension: string;
  title: string;
  message: string;
  suggestion: string;
};

type AnalysisResult = {
  ats_score: number;
  summary: string;
  dimension_scores: { format: number; keywords: number; content: number; structure: number };
  detected_role: string;
  jd_match_percent: number | null;
  missing_keywords: string[];
  issues: Issue[];
};

type ImproveResult = {
  improved_markdown: string;
  key_changes: string[];
};

const scoreColor = (n: number) =>
  n >= 75 ? "var(--success)" : n >= 50 ? "var(--warning)" : "var(--danger)";

const catColor: Record<Issue["category"], string> = {
  critical: "var(--danger)",
  warning: "var(--warning)",
  suggestion: "var(--accent)",
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [improving, setImproving] = useState(false);
  const [improved, setImproved] = useState<ImproveResult | null>(null);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  function pick(f: File | null) {
    setError(null);
    if (!f) return;
    if (!/\.(pdf|docx)$/i.test(f.name)) {
      setError("Please choose a PDF or DOCX file.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File must be under 5 MB.");
      return;
    }
    setFile(f);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setImproved(null);
    setImproveError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (jd.trim()) form.append("job_description", jd.trim());

      const res = await fetch(`${API_URL}/analyze`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      setResult((await res.json()) as AnalysisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function improve() {
    if (!file) return;
    setImproving(true);
    setImproveError(null);
    setImproved(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (jd.trim()) form.append("job_description", jd.trim());

      const res = await fetch(`${API_URL}/improve`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      setImproved((await res.json()) as ImproveResult);
    } catch (e) {
      setImproveError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setImproving(false);
    }
  }

  async function download() {
    if (!improved) return;
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: improved.improved_markdown, filename: "resume_improved" }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resume_improved.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setImproveError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="container">
      <div className="brand">
        Resume<span>IQ</span>
      </div>
      <p className="tagline">Beat the ATS. Land the interview. Free resume analysis for freshers.</p>

      <div className="card">
        <div
          className={`dropzone${drag ? " drag" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <div>
            ⬆ Drag &amp; drop your resume, or <strong>browse</strong>
          </div>
          <div className="file-name">PDF or DOCX · max 5 MB</div>
          {file && <div className="file-name">✓ {file.name}</div>}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx"
            hidden
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>

        <label htmlFor="jd">Target job description (optional)</label>
        <textarea
          id="jd"
          placeholder="Paste a job description to get a keyword-match score…"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
        />

        <div style={{ marginTop: 16 }}>
          <button onClick={analyze} disabled={!file || loading}>
            {loading ? "Analyzing…" : "Analyze Resume →"}
          </button>
        </div>

        {loading && <p className="spinner">Parsing your resume and scoring it — this takes a few seconds.</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {result && <Results result={result} />}

      {result && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Improve &amp; download</h3>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
            Let AI rewrite your resume into a clean, ATS-friendly version — using only your real facts — then download it as a .docx.
          </p>
          {!improved && (
            <button onClick={improve} disabled={improving}>
              {improving ? "Rewriting…" : "✨ Improve my resume"}
            </button>
          )}
          {improving && <p className="spinner">Rewriting your resume — this takes a few seconds.</p>}
          {improveError && <p className="error">{improveError}</p>}

          {improved && (
            <>
              {improved.key_changes.length > 0 && (
                <>
                  <h4 style={{ marginBottom: 6 }}>What changed</h4>
                  <ul style={{ marginTop: 0, fontSize: 14 }}>
                    {improved.key_changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
              <h4 style={{ marginBottom: 6 }}>Improved resume</h4>
              <pre className="improved">{improved.improved_markdown}</pre>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button onClick={download} disabled={exporting}>
                  {exporting ? "Preparing…" : "⬇ Download .docx"}
                </button>
                <button onClick={improve} disabled={improving} style={{ background: "var(--muted)" }}>
                  Re-run
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function Results({ result }: { result: AnalysisResult }) {
  const dims: [string, number][] = [
    ["Format", result.dimension_scores.format],
    ["Keywords", result.dimension_scores.keywords],
    ["Content", result.dimension_scores.content],
    ["Structure", result.dimension_scores.structure],
  ];

  return (
    <>
      <div className="card">
        <div className="score-ring">
          <span className="score-num" style={{ color: scoreColor(result.ats_score) }}>
            {result.ats_score}
          </span>
          <span style={{ color: "var(--muted)" }}>/ 100 ATS score</span>
        </div>
        <p>{result.summary}</p>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          Detected role: <strong>{result.detected_role}</strong>
          {result.jd_match_percent != null && <> · JD match: <strong>{result.jd_match_percent}%</strong></>}
        </p>

        {dims.map(([name, n]) => (
          <div key={name}>
            <div className="dim-row">
              <span>{name}</span>
              <span>{n}</span>
            </div>
            <div className="bar">
              <div style={{ width: `${n}%`, background: scoreColor(n) }} />
            </div>
          </div>
        ))}

        {result.missing_keywords.length > 0 && (
          <p style={{ fontSize: 14 }}>
            <strong>Missing keywords:</strong> {result.missing_keywords.join(", ")}
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Issues ({result.issues.length})</h3>
        {result.issues.map((issue, i) => (
          <div key={i} className="issue" style={{ borderLeftColor: catColor[issue.category] }}>
            <h4>
              <span className="tag" style={{ background: catColor[issue.category], color: "#fff" }}>
                {issue.category}
              </span>
              {issue.title}
            </h4>
            <p>{issue.message}</p>
            <p className="fix">
              <strong>Fix:</strong> {issue.suggestion}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
