"""AI voice learning, review and rewriting, with Anthropic (Claude) or OpenAI as the provider.

Optional: without an API key the app still learns and checks with the deterministic
learner/checker; only the AI voice profile, AI review and rewriting need a model.

Provider selection: STYLEDESK_AI_PROVIDER=anthropic|openai, otherwise whichever key is set
(ANTHROPIC_API_KEY first, then OPENAI_API_KEY)."""
from __future__ import annotations

import hashlib
import json
import os
from typing import Literal

from pydantic import BaseModel, Field

ANTHROPIC_MODEL = os.environ.get("STYLEDESK_MODEL", "claude-opus-5-5")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-6-astra")
# Anthropic server-side refusal fallback: if the model declines, the API retries on a fallback model.
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


def provider() -> str | None:
    chosen = os.environ.get("STYLEDESK_AI_PROVIDER", "").strip().lower()
    has_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))
    has_openai = bool(os.environ.get("OPENAI_API_KEY"))
    if chosen == "anthropic":
        return "anthropic" if has_anthropic else None
    if chosen == "openai":
        return "openai" if has_openai else None
    return "anthropic" if has_anthropic else "openai" if has_openai else None


def available() -> bool:
    return provider() is not None


def model_name() -> str | None:
    return {"anthropic": ANTHROPIC_MODEL, "openai": OPENAI_MODEL}.get(provider())


def _call(system: str | list, user: str, schema: type[BaseModel], effort: str):
    p = provider()
    if p is None:
        raise AIUnavailable("AI features need an API key on the server (OPENAI_API_KEY or ANTHROPIC_API_KEY).")
    return _call_openai(system, user, schema, effort) if p == "openai" else _call_anthropic(system, user, schema, effort)


def _call_openai(system: str | list, user: str, schema: type[BaseModel], effort: str):
    try:
        import openai
    except ImportError as e:  # pragma: no cover
        raise AIUnavailable("openai package not installed (pip install openai)") from e
    instructions = system if isinstance(system, str) else "\n\n".join(b["text"] for b in system)
    client = openai.OpenAI()
    try:
        # Streamed so long reasoning doesn't hit idle-connection timeouts in proxies or hosts
        # (a silent non-streamed request is cut off after ~30s in some networks). Reasoning
        # summaries keep events flowing while the model thinks; we don't show them.
        with client.responses.stream(
            model=OPENAI_MODEL,
            # Voice description comes first in the instructions, so OpenAI's automatic prompt
            # caching reuses it across checks; the cache key groups requests for the same voice.
            instructions=instructions,
            input=[{"role": "user", "content": user}],
            text_format=schema,
            reasoning={"effort": effort, "summary": "auto"},
            max_output_tokens=32000,
            prompt_cache_key="styledesk-" + hashlib.sha256(instructions[:4000].encode()).hexdigest()[:24],
            store=False,
        ) as stream:
            for _ in stream:
                pass
            resp = stream.get_final_response()
    except openai.AuthenticationError as e:
        raise AIUnavailable("The OpenAI API key was rejected.") from e
    except openai.RateLimitError as e:
        raise AIUnavailable("Rate limited or out of credit on the OpenAI API; try again shortly.") from e
    except openai.APIConnectionError as e:
        raise AIUnavailable("Could not reach the OpenAI API.") from e
    except openai.APIStatusError as e:
        msg = getattr(e, "message", "") or str(e)
        raise AIUnavailable(f"OpenAI API error ({e.status_code}): {msg}") from e

    for item in resp.output or []:
        for part in getattr(item, "content", None) or []:
            if getattr(part, "type", "") == "refusal":
                raise AIUnavailable("The model declined to process this text.")
    if resp.status == "incomplete" or resp.output_parsed is None:
        raise AIUnavailable("The AI response was incomplete; try a shorter text.")
    return resp.output_parsed


def _call_anthropic(system: str | list, user: str, schema: type[BaseModel], effort: str):
    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise AIUnavailable("anthropic package not installed") from e
    client = anthropic.Anthropic()
    try:
        resp = client.beta.messages.parse(
            model=ANTHROPIC_MODEL,
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
    "Don't add new claims, and never invent experiences, anecdotes or details about the writer. "
    "Match the writer's tone, rhythm, vocabulary, formality, point of view and punctuation habits, "
    "and follow the writer's own rules. Restructure sentences freely when that is what the writer would do: "
    "a rewrite that keeps the original's sentence shapes with a few words swapped is not good enough."
)


def _avoid(stats: dict | None) -> str:
    """Phrasings typical of AI text that this writer doesn't use, so rewrites don't reintroduce them."""
    from .learner import AI_TELLS
    used = set((stats or {}).get("ai_phrases_used") or [])
    phrases = [pid for pid, _, _ in AI_TELLS if pid not in used]
    fp = (stats or {}).get("fingerprint") or {}
    extra = []
    if fp.get("em_dashes_per_1kw", 99) < 0.5:
        extra.append("em dashes")
    if fp.get("exclamations_per_1kw", 99) < 0.5:
        extra.append("exclamation marks")
    if fp.get("semicolons_per_1kw", 99) < 0.5:
        extra.append("semicolons")
    out = ("Never use these phrasings, which this writer doesn't use and which read as AI-written: "
           + "; ".join(phrases) + ". Also avoid the same ideas in disguise: contrast templates like "
           "\"it's not (just) X, it's Y\" or \"not only X but Y\" in any wording, audience lists like "
           "\"whether you're X or Y\", rhetorical roadmaps (\"here are three ways\"), and grand closing morals.")
    if extra:
        out += " This writer doesn't use " + ", ".join(extra) + "."
    return out


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
        + " " + _avoid(stats)
    )
    vb = _voice_block(name, profile, stats, rules, _pick_examples(samples, 8_000))
    user = f"<text>\n{''.join(marked)}\n</text>\n\nWhy each passage was flagged:\n{reasons}"
    out = _call(_system(task, vb), user, SpanRewrites, effort="medium")
    valid = {sp["id"] for sp in spans}
    return {r.id: r.text for r in out.rewrites if r.id in valid}


def rewrite_all(name: str, text: str, profile, stats, rules, samples, add_prompts: bool = False) -> str:
    task = (
        "You rewrite a whole text so it sounds like the writer described in <voice>, as if they had written it "
        "themselves. Keep roughly the same length and structure unless the writer's habits call for shorter "
        "sentences or paragraphs. Return only the rewritten text. " + _REWRITE_RULES + " " + _avoid(stats) +
        " Where it fits the writer and doesn't create a false claim, prefer their usual point of view and "
        "contraction habits."
    )
    if add_prompts:
        task += (
            " This writer's voice may rely on personal details, experiences or concrete examples that the text "
            "doesn't contain. Where those details belong, add one or two short bracketed prompts for the writer to "
            "fill in, for example [add a moment from your own week]. Never invent the details yourself."
        )
    vb = _voice_block(name, profile, stats, rules, _pick_examples(samples, 8_000))
    return _call(_system(task, vb), f"<text>\n{text}\n</text>", FullRewrite, effort="medium").text
