"use client";

import { useEffect, useRef, useState } from "react";

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

type CoverLetterResult = {
  cover_letter: string;
};

type HistoryEntry = {
  id: number;
  date: string;
  fileName: string;
  score: number;
  role: string;
  jdMatch: number | null;
};

const HISTORY_KEY = "resumeiq_history";

const ANALYZE_MESSAGES = [
  "Reading your resume…",
  "Checking ATS formatting…",
  "Matching keywords…",
  "Scoring your resume…",
];

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
  const [editableMarkdown, setEditableMarkdown] = useState("");
  const [improveError, setImproveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  const [generatingCover, setGeneratingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [editableCover, setEditableCover] = useState("");
  const [coverDone, setCoverDone] = useState(false);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    if (!loading) {
      setStatusIdx(0);
      return;
    }
    const id = setInterval(() => setStatusIdx((i) => (i + 1) % ANALYZE_MESSAGES.length), 2500);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "dark" || current === "light") setTheme(current);
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved) as HistoryEntry[]);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  function saveToHistory(r: AnalysisResult) {
    const entry: HistoryEntry = {
      id: Date.now(),
      date: new Date().toISOString(),
      fileName: file?.name ?? "resume",
      score: r.ats_score,
      role: r.detected_role,
      jdMatch: r.jd_match_percent,
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 20);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function clearHistory() {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
  }

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
    setEditableCover("");
    setCoverDone(false);
    setCoverError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (jd.trim()) form.append("job_description", jd.trim());

      const res = await fetch(`${API_URL}/analyze`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as AnalysisResult;
      setResult(data);
      saveToHistory(data);
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
      const data = (await res.json()) as ImproveResult;
      setImproved(data);
      setEditableMarkdown(data.improved_markdown);
    } catch (e) {
      setImproveError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setImproving(false);
    }
  }

  async function download(markdown: string, format: "pdf" | "docx", base: string) {
    if (!markdown.trim()) return;
    setExporting(format);
    try {
      const res = await fetch(`${API_URL}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, filename: base, format }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setExporting(null);
    }
  }

  async function generateCover() {
    if (!file) return;
    setGeneratingCover(true);
    setCoverError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (jd.trim()) form.append("job_description", jd.trim());

      const res = await fetch(`${API_URL}/cover-letter`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as CoverLetterResult;
      setEditableCover(data.cover_letter);
      setCoverDone(true);
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setGeneratingCover(false);
    }
  }

  return (
    <main className="container">
      <div className="header-row">
        <div className="brand">
          Resume<span>IQ</span>
        </div>
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
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
            {loading ? <>Analyzing<span className="dots" /></> : "Analyze Resume →"}
          </button>
        </div>

        {loading && (
          <>
            <div className="progress" role="progressbar" aria-label="Analyzing" />
            <p className="spinner">{ANALYZE_MESSAGES[statusIdx]}</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {loading && <ResultsSkeleton />}

      {result && <Results result={result} />}

      {result && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Next steps</h3>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
            Rewrite your resume to be ATS-friendly, or generate a matching cover letter — both use only your real facts.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={improve} disabled={improving}>
              {improving ? (
                <>Rewriting<span className="dots" /></>
              ) : improved ? (
                "✨ Re-improve resume"
              ) : (
                "✨ Improve my resume"
              )}
            </button>
            <button className="btn-tonal" onClick={generateCover} disabled={generatingCover}>
              {generatingCover ? (
                <>Writing<span className="dots" /></>
              ) : coverDone ? (
                "✍️ Rewrite cover letter"
              ) : (
                "✍️ Write a cover letter"
              )}
            </button>
          </div>

          {improving && (
            <>
              <div className="progress" role="progressbar" aria-label="Rewriting" />
              <TextSkeleton />
            </>
          )}
          {improveError && <p className="error">{improveError}</p>}

          {improved && !improving && (
            <div style={{ marginTop: 20 }}>
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
              <h4 style={{ marginBottom: 2 }}>Improved resume</h4>
              <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px" }}>
                Edit anything below before downloading — this text is what gets exported.
              </p>
              <textarea
                className="improved"
                value={editableMarkdown}
                onChange={(e) => setEditableMarkdown(e.target.value)}
                spellCheck={false}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => download(editableMarkdown, "pdf", "resume_improved")} disabled={exporting !== null}>
                  {exporting === "pdf" ? "Preparing…" : "⬇ Download PDF"}
                </button>
                <button className="btn-tonal" onClick={() => download(editableMarkdown, "docx", "resume_improved")} disabled={exporting !== null}>
                  {exporting === "docx" ? "Preparing…" : "⬇ Download .docx"}
                </button>
              </div>
            </div>
          )}

          {generatingCover && (
            <>
              <div className="progress" role="progressbar" aria-label="Writing cover letter" />
              <TextSkeleton />
            </>
          )}
          {coverError && <p className="error">{coverError}</p>}

          {coverDone && !generatingCover && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ marginBottom: 2 }}>Cover letter</h4>
              <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px" }}>
                Edit anything below before downloading.
              </p>
              <textarea
                className="improved"
                value={editableCover}
                onChange={(e) => setEditableCover(e.target.value)}
                spellCheck={false}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => download(editableCover, "pdf", "cover_letter")} disabled={exporting !== null}>
                  {exporting === "pdf" ? "Preparing…" : "⬇ Download PDF"}
                </button>
                <button className="btn-tonal" onClick={() => download(editableCover, "docx", "cover_letter")} disabled={exporting !== null}>
                  {exporting === "docx" ? "Preparing…" : "⬇ Download .docx"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {result && <IssuesCard result={result} />}
      {history.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Your history</h3>
            <button className="link-btn" onClick={clearHistory}>
              Clear
            </button>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
            Saved in your browser only — watch your score improve over time.
          </p>
          {history.map((h) => (
            <div key={h.id} className="history-item">
              <div>
                <div style={{ fontWeight: 600 }}>{h.fileName}</div>
                <div className="history-meta">
                  {new Date(h.date).toLocaleString()} · {h.role}
                  {h.jdMatch != null && <> · JD {h.jdMatch}%</>}
                </div>
              </div>
              <div className="history-score" style={{ color: scoreColor(h.score) }}>
                {h.score}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * circumference;
  const color = scoreColor(score);
  return (
    <div className="gauge">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`ATS score ${score} of 100`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-container)" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 70 70)"
          className="gauge-arc"
        />
        <text x="70" y="68" textAnchor="middle" dominantBaseline="central" className="gauge-num" fill={color}>
          {score}
        </text>
        <text x="70" y="92" textAnchor="middle" className="gauge-label">
          / 100
        </text>
      </svg>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="score-header">
        <div className="skeleton skel-gauge" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="skeleton skel-line" style={{ width: "92%" }} />
          <div className="skeleton skel-line" style={{ width: "78%" }} />
          <div className="skeleton skel-line" style={{ width: "45%" }} />
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skel-bar" />
        ))}
      </div>
    </div>
  );
}

function TextSkeleton() {
  const widths = ["95%", "88%", "92%", "70%", "85%", "60%"];
  return (
    <div style={{ marginTop: 12 }} aria-hidden="true">
      {widths.map((w, i) => (
        <div key={i} className="skeleton skel-line" style={{ width: w }} />
      ))}
    </div>
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
    <div className="card">
      <div className="score-header">
        <ScoreGauge score={result.ats_score} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ marginTop: 0 }}>{result.summary}</p>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 0 }}>
            Detected role: <strong>{result.detected_role}</strong>
            {result.jd_match_percent != null && <> · JD match: <strong>{result.jd_match_percent}%</strong></>}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
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
    </div>
  );
}

function IssuesCard({ result }: { result: AnalysisResult }) {
  return (
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
  );
}
