"""Claude-powered learning and review. Optional: the app works without an API key,
falling back to the deterministic learner/checker only."""
from __future__ import annotations

import json
import os
from typing import Literal

from pydantic import BaseModel, Field

MODEL = os.environ.get("NEWSROOM_MODEL", "claude-opus-5-5")
# Server-side refusal fallback: if the model declines, the API retries on a fallback model.
BETAS = ["server-side-fallback-2026-07-01"]
# Keep the request well inside the context window; very large archives are sampled.
MAX_CORPUS_CHARS = 1_500_000


class GuideRule(BaseModel):
    category: str = Field(description="e.g. Voice, Attribution, Numbers, Names & titles, Structure, Word choice")
    rule: str = Field(description="One concrete, checkable instruction a copy editor would enforce")
    example: str = Field(description="A short example drawn from or modelled on the archive")


class StyleGuide(BaseModel):
    voice_summary: str = Field(description="2-4 sentences describing the newsroom's voice and tone")
    rules: list[GuideRule]


class AIIssue(BaseModel):
    category: str
    severity: Literal["error", "warning", "suggestion"]
    quote: str = Field(description="Exact text copied verbatim from the story that the issue is about")
    explanation: str
    suggestion: str = Field(description="Rewritten text that fixes the issue, or empty if not applicable")


class Review(BaseModel):
    readiness: Literal["ready", "minor edits", "needs work"]
    summary: str = Field(description="2-3 sentence note to the reporter")
    issues: list[AIIssue]


class AIUnavailable(Exception):
    pass


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _client():
    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise AIUnavailable("anthropic package not installed") from e
    if not available():
        raise AIUnavailable("Set ANTHROPIC_API_KEY to enable AI style learning and review.")
    return anthropic.Anthropic()


def _call(system: str | list, user: str, schema: type[BaseModel], effort: str):
    import anthropic

    client = _client()
    try:
        resp = client.beta.messages.parse(
            model=MODEL,
            max_tokens=16000,
            betas=BETAS,
            fallbacks="default",
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema,
            output_config={"effort": effort},
        )
    except anthropic.AuthenticationError as e:
        raise AIUnavailable("The Anthropic API key was rejected.") from e
    except anthropic.RateLimitError as e:
        raise AIUnavailable("Rate limited by the Anthropic API; try again shortly.") from e
    except anthropic.APIConnectionError as e:
        raise AIUnavailable("Could not reach the Anthropic API.") from e
    except anthropic.APIStatusError as e:
        raise AIUnavailable(f"Anthropic API error ({e.status_code}): {e.message}") from e

    if resp.stop_reason == "refusal":
        raise AIUnavailable("The model declined to process this text.")
    if resp.stop_reason == "max_tokens" or resp.parsed_output is None:
        raise AIUnavailable("The AI response was incomplete; try again.")
    return resp.parsed_output


def _sample_corpus(articles: list[dict]) -> tuple[str, int]:
    """Most recent articles first, until the character budget is reached."""
    chunks, used = [], 0
    for a in articles:
        block = f"<article>\n<headline>{a.get('title') or ''}</headline>\n{a['body']}\n</article>"
        if used + len(block) > MAX_CORPUS_CHARS:
            break
        chunks.append(block)
        used += len(block)
    return "\n\n".join(chunks), len(chunks)


def distill_guide(articles: list[dict], house_rules: list[dict], stats: dict) -> tuple[StyleGuide, int]:
    corpus, used = _sample_corpus(articles)
    notes = [r for r in house_rules if r["kind"] == "note"]
    user = (
        f"Here are {used} articles this newsroom has published.\n\n{corpus}\n\n"
        f"Measured statistics from the full archive:\n{json.dumps(stats.get('preferences', {}), indent=1)}\n"
        f"{json.dumps(stats.get('metrics', {}), indent=1)}\n\n"
        + (f"Editors' written guidance:\n" + "\n".join(f"- {n['reason']}" for n in notes) + "\n\n" if notes else "")
        + "Write this newsroom's house style guide as it is actually practised in these articles. "
        "Capture the conventions a new reporter would need to match: voice and tone, how ledes are built, "
        "attribution and quote handling, names and titles on first and later reference, numbers, dates, "
        "abbreviations, and recurring word choices. Only include conventions the evidence supports; "
        "where editors' written guidance exists it takes precedence. Aim for 15-40 rules."
    )
    system = "You are a senior copy chief who documents newsroom style guides from published work."
    return _call(system, user, StyleGuide, effort="high"), used


def review(title: str, body: str, guide: dict | None, profile: dict | None, house_rules: list[dict]) -> Review:
    guide_text = ""
    if guide:
        guide_text = "Voice: " + guide.get("voice_summary", "") + "\n" + "\n".join(
            f"- [{r['category']}] {r['rule']} (e.g. {r['example']})" for r in guide.get("rules", [])
        )
    rules_text = "\n".join(
        f"- {r['kind']}: {r.get('term') or ''} {('-> ' + r['replacement']) if r.get('replacement') else ''} {r.get('reason') or ''}".strip()
        for r in house_rules
    )
    # Stable content first so it is cached across every story checked against this guide.
    system = [{
        "type": "text",
        "text": (
            "You are the copy desk for a newsroom. You check reporters' stories against the newsroom's "
            "house style before they reach an editor.\n\n"
            f"<house_style_guide>\n{guide_text or '(no learned guide yet; use the house rules and general news-writing practice)'}\n</house_style_guide>\n\n"
            f"<house_rules>\n{rules_text or '(none)'}\n</house_rules>\n\n"
            f"<measured_preferences>\n{json.dumps((profile or {}).get('preferences', {}))}\n</measured_preferences>\n\n"
            "Report style problems: deviations from the guide, voice and tone mismatches, attribution, "
            "unclear or buried ledes, inconsistent names or titles, jargon, and grammar. Also flag claims "
            "that need attribution or a source, but do not assert facts are false. "
            "Each issue's quote must be copied exactly from the story so it can be highlighted. "
            "Skip trivial spacing and spelling-variant issues; a separate checker handles those. "
            "If the story is clean, return few or no issues."
        ),
        "cache_control": {"type": "ephemeral"},
    }]
    user = f"<story>\n<headline>{title}</headline>\n{body}\n</story>"
    return _call(system, user, Review, effort="medium")
