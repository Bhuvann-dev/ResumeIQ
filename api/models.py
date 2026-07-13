"""Pydantic schemas for the analysis contract.

These types are the API's response shape AND the structured-output schema the
AI engine is forced to return, so the two can never drift.
"""

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["critical", "warning", "suggestion"]
Dimension = Literal["format", "keyword", "content", "structure", "contact"]


class Issue(BaseModel):
    category: Category = Field(description="Severity of the issue")
    dimension: Dimension = Field(description="Which area of the resume this concerns")
    title: str = Field(description="Short label for the issue")
    message: str = Field(description="What is wrong and why it matters for ATS")
    suggestion: str = Field(description="Concrete, actionable fix")


class DimensionScores(BaseModel):
    format: int = Field(ge=0, le=100, description="Parseability / ATS-friendliness")
    keywords: int = Field(ge=0, le=100, description="Keyword coverage")
    content: int = Field(ge=0, le=100, description="Bullet quality, metrics, verbs")
    structure: int = Field(ge=0, le=100, description="Sections and ordering")


class AnalysisResult(BaseModel):
    ats_score: int = Field(ge=0, le=100, description="Overall ATS readiness score")
    summary: str = Field(description="One or two sentence verdict for the fresher")
    dimension_scores: DimensionScores
    detected_role: str = Field(description="Best guess at the target role, e.g. 'SDE Fresher'")
    jd_match_percent: int | None = Field(
        default=None, ge=0, le=100, description="Match % against the job description, if one was provided"
    )
    missing_keywords: list[str] = Field(
        default_factory=list, description="Keywords from the JD absent in the resume"
    )
    issues: list[Issue] = Field(description="Categorized, actionable findings")


class ImproveResult(BaseModel):
    improved_markdown: str = Field(
        description="The full rewritten, ATS-friendly resume in simple markdown "
        "(# name, ## sections, - bullets)"
    )
    key_changes: list[str] = Field(
        description="Short bullets summarizing the main improvements made"
    )
