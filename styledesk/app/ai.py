"""Claude-powered voice learning, review and rewriting.

Optional: without an API key the app still learns and checks with the deterministic
learner/checker; only the AI voice profile, AI review and rewriting need Claude."""
from __future__ import annotations

import json
import os
from typing import Literal

from pydantic import BaseModel, Field

MODEL = os.environ.get("STYLEDESK_MODEL", "claude-opus-5-5")
# Server-side refusal fallback: if the model declines, the API retries on a fallback model.
BETAS = ["server-side-fallback-2026-07-01"]
# Keep requests well inside the context window; very large sample sets are trimmed (newest first).
MAX_SAMPLE_CHARS = 1_500_000
MAX_REWRITE_CHARS = 30_000


class Trait(BaseModel):
    aspect: str = Field(description="e.g. Sentence rhythm, Word choice, Openings, Endings, Humour, Formality, Structure, Point of view")
    description: str = Field(description="A concrete, checkable description of what this writer does")
    example: str = Field(description="A short quote from the samples that shows it")


class VoiceProfile(BaseModel):
    summary: str = Field(description="2-4 sentences describing how this person writes")
    tone: list[str] = Field(description="3-6 single words or short phrases describing the tone")
    traits: list[Trait]
    signature_phrases: list[str] = Field(description="Words or phrasings this writer actually uses repeatedly")
    never_does: list[str] = Field(description="Things that would sound unlike this writer")


class ReviewIssue(BaseModel):
    category: Literal["Tone", "Word choice", "Sentence rhythm", "Structure", "Formality", "Sounds like AI", "Point of view", "Other"]
    severity: Literal["error", "warning", "suggestion"]
    quote: str = Field(description="Exact text copied verbatim from the text being checked")
    explanation: str = Field(description="Why this doesn't sound like the writer, in one or two sentences")


class Review(BaseModel):
    match_score: int = Field(description="0-100: how much the whole text sounds like this writer")
    summary: str = Field(description="2-3 sentences on how the text compares with the writer's voice")
    issues: list[ReviewIssue]


class SpanRewrite(BaseModel):
    id: int
    text: str


class SpanRewrites(BaseModel):
    rewrites: list[SpanRewrite]


class FullRewrite(BaseModel):
    text: str


class AIUnavailable(Exception):
    pass


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _call(system: str | list, user: str, schema: type[BaseModel], effort: str):
    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise AIUnavailable("anthropic package not installed") from e
    if not available():
        raise AIUnavailable("AI features need an Anthropic API key on the server (ANTHROPIC_API_KEY).")
    client = anthropic.Anthropic()
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
        raise AIUnavailable("The AI response was incomplete; try a shorter text.")
    return resp.parsed_output


# ---------- shared voice context (cached across calls for the same voice) ----------
def _voice_block(name: str, profile: dict | None, stats: dict | None, rules: list[dict], examples: list[dict]) -> str:
    parts = [f"<voice name={json.dumps(name)}>"]
    if profile:
        parts.append("Summary: " + profile.get("summary", ""))
        parts.append("Tone: " + ", ".join(profile.get("tone", [])))
        parts += [f"- [{t['aspect']}] {t['description']} (e.g. \"{t['example']}\")" for t in profile.get("traits", [])]
        if profile.get("signature_phrases"):
            parts.append("Signature phrases: " + "; ".join(profile["signature_phrases"]))
        if profile.get("never_does"):
            parts.append("Never does: " + "; ".join(profile["never_does"]))
    if stats:
        parts.append("Measured habits: " + json.dumps({k: v["preferred"] for k, v in stats.get("preferences", {}).items()}))
        parts.append("Measured fingerprint: " + json.dumps(stats.get("fingerprint", {})))
    if rules:
        parts.append("Writer's own rules:\n" + "\n".join(
            f"- {r['kind']}: {r.get('term') or ''}{(' -> ' + r['replacement']) if r.get('replacement') else ''} {r.get('reason') or ''}".rstrip()
            for r in rules))
    if examples:
        parts.append("Examples of the writer's own writing:")
        parts += [f"<sample>\n{e['body']}\n</sample>" for e in examples]
    parts.append("</voice>")
    return "\n".join(parts)


def _pick_examples(samples: list[dict], limit_chars: int = 12_000) -> list[dict]:
    out, used = [], 0
    for s in samples:
        if used + len(s["body"]) > limit_chars and out:
            break
        out.append(s)
        used += len(s["body"])
    return out


def _system(task: str, voice_block: str) -> list[dict]:
    # Voice first (stable, cached), task instructions after it.
    return [
        {"type": "text", "text": voice_block, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": task},
    ]


# ---------- learning ----------
def distill_profile(samples: list[dict], stats: dict, rules: list[dict]) -> tuple[VoiceProfile, int]:
    chunks, used = [], 0
    for s in samples:
        block = f"<sample>\n<title>{s.get('title') or ''}</title>\n{s['body']}\n</sample>"
        if used + len(block) > MAX_SAMPLE_CHARS:
            break
        chunks.append(block)
        used += len(block)
    notes = [r for r in rules if r["kind"] == "note"]
    user = (
        f"Here are {len(chunks)} samples of one person's writing.\n\n" + "\n\n".join(chunks) +
        f"\n\nMeasured statistics:\n{json.dumps(stats.get('fingerprint', {}))}\n"
        f"{json.dumps({k: v['preferred'] for k, v in stats.get('preferences', {}).items()})}\n\n"
        + ("The writer's own notes about their style (these take precedence):\n" +
           "\n".join(f"- {n['reason']}" for n in notes) + "\n\n" if notes else "")
        + "Describe this writer's voice so that someone else could check whether a new text sounds like them, "
        "and rewrite text to sound like them. Cover tone, sentence rhythm, word choice, how they open and close, "
        "point of view, formality, humour, structure and punctuation habits. Only include what the samples "
        "support, and quote real examples. Aim for 10-25 traits."
    )
    system = "You are an editor who studies writers' voices closely and describes them precisely."
    return _call(system, user, VoiceProfile, effort="high"), len(chunks)


# ---------- review ----------
def review(name: str, text: str, profile: dict | None, stats: dict | None, rules: list[dict], samples: list[dict]) -> Review:
    task = (
        "You check whether a text sounds like the writer described in <voice>. The text may have been drafted by "
        "an AI or by someone else. Flag passages whose tone, word choice, rhythm, formality, structure or point of "
        "view don't match the writer, including phrasing typical of AI-generated text that this writer wouldn't use. "
        "Each issue's quote must be copied exactly from the text, and should be the smallest passage that shows the "
        "problem (a phrase or a sentence, not a whole paragraph). Ignore spelling variants and spacing; another "
        "checker handles those. Don't flag facts, names, numbers or direct quotations. "
        "If the text already sounds like the writer, return a high score and few or no issues."
    )
    vb = _voice_block(name, profile, stats, rules, [] if profile else _pick_examples(samples))
    return _call(_system(task, vb), f"<text>\n{text}\n</text>", Review, effort="medium")


# ---------- rewriting ----------
_REWRITE_RULES = (
    "Keep the meaning, facts, names, numbers and any direct quotations exactly as they are. "
    "Don't add new claims or information. Match the writer's tone, rhythm, vocabulary, formality, point of view "
    "and punctuation habits, and follow the writer's own rules."
)


def rewrite_spans(name: str, text: str, spans: list[dict], profile, stats, rules, samples) -> dict[int, str]:
    """spans: [{"id", "start", "end", "reason"}], non-overlapping. Returns {id: new text}."""
    marked, pos = [], 0
    for sp in sorted(spans, key=lambda s: s["start"]):
        marked.append(text[pos:sp["start"]])
        marked.append(f"⟦{sp['id']}⟧{text[sp['start']:sp['end']]}⟦/{sp['id']}⟧")
        pos = sp["end"]
    marked.append(text[pos:])
    reasons = "\n".join(f"{sp['id']}: {sp.get('reason') or 'Does not sound like the writer.'}" for sp in spans)
    task = (
        "You rewrite marked passages of a text so they sound like the writer described in <voice>. "
        "Passages are marked ⟦n⟧like this⟦/n⟧. For each marked passage, return replacement text "
        "for exactly that passage: it must read naturally with the unmarked text around it (which stays as it is), "
        "keep the same role in its sentence or paragraph, and must not include the markers. " + _REWRITE_RULES
    )
    vb = _voice_block(name, profile, stats, rules, _pick_examples(samples, 8_000))
    user = f"<text>\n{''.join(marked)}\n</text>\n\nWhy each passage was flagged:\n{reasons}"
    out = _call(_system(task, vb), user, SpanRewrites, effort="medium")
    valid = {sp["id"] for sp in spans}
    return {r.id: r.text for r in out.rewrites if r.id in valid}


def rewrite_all(name: str, text: str, profile, stats, rules, samples) -> str:
    task = (
        "You rewrite a whole text so it sounds like the writer described in <voice>, as if they had written it "
        "themselves. Keep roughly the same length and structure unless the writer's habits call for shorter "
        "sentences or paragraphs. Return only the rewritten text. " + _REWRITE_RULES
    )
    vb = _voice_block(name, profile, stats, rules, _pick_examples(samples, 8_000))
    return _call(_system(task, vb), f"<text>\n{text}\n</text>", FullRewrite, effort="medium").text
