"""Fast, deterministic checks of any text against a learned voice and its rules."""
from __future__ import annotations

import re

from .learner import _CONTRACTION, _EM_DASH, AI_TELLS, VARIANT_GROUPS, _headline_case, fingerprint
from .textutil import paragraphs, sentences, words

# Rate-based habits ("never uses em dashes") need enough writing to be trusted.
MIN_WORDS_FOR_RATES = 300

_EXPAND = {
    "don't": "do not", "doesn't": "does not", "didn't": "did not", "can't": "cannot", "won't": "will not",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not", "it's": "it is",
    "that's": "that is", "there's": "there is", "i'm": "I am", "i've": "I have", "i'll": "I will", "i'd": "I would",
    "you're": "you are", "you've": "you have", "you'll": "you will", "we're": "we are", "we've": "we have",
    "they're": "they are", "let's": "let us", "couldn't": "could not", "wouldn't": "would not", "shouldn't": "should not",
    "haven't": "have not", "hasn't": "has not", "what's": "what is", "here's": "here is",
}


def _issue(source, category, severity, start, end, text, message, replacement=None):
    return {
        "source": source,
        "category": category,
        "severity": severity,
        "start": start,
        "end": end,
        "excerpt": text[start:end],
        "message": message,
        "replacement": replacement,
    }


def _replacement(rule_id: str, preferred: str, found: str) -> str | None:
    if rule_id == "percent":
        if preferred == "%":
            return None
        return re.sub(r"(\d)\s?%", rf"\1 {preferred}", found) if "%" in found else preferred
    if rule_id == "attribution":
        return preferred
    if rule_id == "honorific_period":
        return found + "." if preferred == "Mr." else found.rstrip(".")
    if rule_id == "time_style":
        if preferred == "a.m.":
            return re.sub(r"([ap])m\b", r"\1.m.", found, flags=re.I)
        return re.sub(r"([ap])\.m\.", r"\1m", found, flags=re.I)
    return None


def check(title: str, body: str, profile: dict | None, house_rules: list[dict]) -> list[dict]:
    profile = profile or {}
    issues: list[dict] = []
    prefs = profile.get("preferences", {})

    # 1. Learned variant preferences
    for rule_id, label, variants in VARIANT_GROUPS:
        pref = prefs.get(rule_id)
        if not pref or rule_id == "quote_marks":
            continue
        for name, rx in variants.items():
            if name == pref["preferred"]:
                continue
            for m in re.finditer(rx, body, flags=re.IGNORECASE):
                issues.append(_issue(
                    "learned", label, "warning", m.start(), m.end(), body,
                    f"You write “{pref['preferred']}” "
                    f"({round(pref['share'] * 100)}% of {pref['evidence']} uses in your samples).",
                    _replacement(rule_id, pref["preferred"], m.group(0)),
                ))

    # 2. Spelling dialect
    for wrong, right in (profile.get("spelling_map") or {}).items():
        for m in re.finditer(rf"\b{re.escape(wrong)}\b", body, flags=re.IGNORECASE):
            fixed = right.capitalize() if m.group(0)[0].isupper() else right
            issues.append(_issue("learned", "Spelling", "warning", m.start(), m.end(), body,
                                 f"You spell it “{right}”.", fixed))

    # 3. Editor-defined house rules
    for rule in house_rules:
        term = (rule.get("term") or "").strip()
        if not term or rule["kind"] == "note":
            continue
        rx = rf"(?<!\w){re.escape(term)}(?!\w)"
        flags = 0 if rule.get("case_sensitive") else re.IGNORECASE
        for m in re.finditer(rx, body, flags=flags):
            if rule["kind"] == "prefer":
                msg = f"Use “{rule['replacement']}”, not “{m.group(0)}”."
                repl = rule["replacement"]
            else:
                msg = f"Avoid “{m.group(0)}”."
                repl = rule.get("replacement") or None
            if rule.get("reason"):
                msg += " " + rule["reason"]
            issues.append(_issue("rule", "Your rule", "error", m.start(), m.end(), body, msg, repl))

    # 3b. Phrases typical of AI-generated text that this writer never uses
    used = set(profile.get("ai_phrases_used") or [])
    for pid, rx, repl in AI_TELLS:
        if pid in used:
            continue
        for m in re.finditer(rx, body, flags=re.IGNORECASE):
            fixed = repl
            if repl and m.group(0)[:1].isupper():
                fixed = repl[:1].upper() + repl[1:]
            issues.append(_issue("learned", "Sounds like AI", "warning", m.start(), m.end(), body,
                                 "Common in AI-generated text, and not something you write.", fixed))

    # 3c. Punctuation and tone habits measured from the samples
    fp = profile.get("fingerprint") or {}
    if profile.get("word_count", 0) >= MIN_WORDS_FOR_RATES:
        if fp.get("em_dashes_per_1kw", 99) < 0.5:
            for m in re.finditer(_EM_DASH, body):
                issues.append(_issue("learned", "Punctuation", "warning", m.start(), m.end(), body,
                                     "You don't use dashes like this in your writing.", None))
        if fp.get("exclamations_per_1kw", 99) < 0.5:
            for m in re.finditer(r"!", body):
                issues.append(_issue("learned", "Tone", "suggestion", m.start(), m.end(), body,
                                     "You don't use exclamation marks.", "."))
        if fp.get("semicolons_per_1kw", 99) < 0.5:
            for m in re.finditer(r";", body):
                issues.append(_issue("learned", "Punctuation", "suggestion", m.start(), m.end(), body,
                                     "You don't use semicolons.", None))
        if fp.get("contractions_per_100w", 99) < 0.2:
            for m in re.finditer(_CONTRACTION, body, flags=re.IGNORECASE):
                exp = _EXPAND.get(m.group(0).lower().replace("\u2019", "'"))
                if exp and m.group(0)[:1].isupper():
                    exp = exp[:1].upper() + exp[1:]
                issues.append(_issue("learned", "Formality", "suggestion", m.start(), m.end(), body,
                                     "You don't use contractions.", exp))

    # 4. Structure measured against the samples
    metrics = profile.get("metrics") or {}
    max_sent = metrics.get("sentence_words_max_ok", 35)
    max_para = metrics.get("paragraph_sentences_max_ok", 4)
    max_lede = metrics.get("lede_words_max_ok", 40)
    fp_avg = (profile.get("fingerprint") or {}).get("sentence_words_avg")
    paras = paragraphs(body)
    cursor = 0
    for i, para in enumerate(paras):
        p_start = body.find(para, cursor)
        cursor = p_start + len(para)
        sents = sentences(para)
        if i == 0 and len(words(para)) > max_lede:
            issues.append(_issue("learned", "Opening", "suggestion", p_start, p_start + len(para), body,
                                 f"Opening paragraph is {len(words(para))} words; yours usually stay under {int(max_lede)}."))
        if len(sents) > max_para:
            issues.append(_issue("learned", "Paragraph length", "suggestion", p_start, p_start + len(para), body,
                                 f"{len(sents)} sentences in one paragraph; yours rarely go past {int(max_para)}."))
        s_cursor = p_start
        for s in sents:
            s_start = body.find(s, s_cursor)
            if s_start < 0:
                continue
            s_cursor = s_start + len(s)
            n = len(words(s))
            if n > max_sent:
                avg = f" (you average {fp_avg:g})" if fp_avg else ""
                issues.append(_issue("learned", "Sentence length", "suggestion", s_start, s_start + len(s), body,
                                     f"{n}-word sentence; yours rarely go past {int(max_sent)}{avg}."))

    # 5. Mechanical slips
    for m in re.finditer(r"\b(\w+)\s+\1\b", body, flags=re.IGNORECASE):
        if m.group(1).lower() not in {"had", "that"}:
            issues.append(_issue("mechanical", "Repeated word", "error", m.start(), m.end(), body,
                                 "Repeated word.", m.group(1)))
    for m in re.finditer(r"(?<=\S)  +(?=\S)", body):
        issues.append(_issue("mechanical", "Spacing", "suggestion", m.start(), m.end(), body,
                             "Double space.", " "))

    issues.sort(key=lambda x: (x["start"], x["end"]))
    return issues


def check_headline(title: str, profile: dict | None) -> list[dict]:
    pref = ((profile or {}).get("preferences") or {}).get("headline_case")
    actual = _headline_case(title or "")
    if pref and actual and actual != pref["preferred"]:
        return [{
            "source": "learned", "category": "Headline", "severity": "warning", "start": None, "end": None,
            "excerpt": title, "replacement": None,
            "message": f"Title looks like {actual}; you write titles in {pref['preferred']}.",
        }]
    return []


# (fingerprint key, label, how to describe a difference, relative threshold, absolute floor)
_COMPARE = [
    ("sentence_words_avg", "Sentence length", "words per sentence"),
    ("word_length_avg", "Word choice", "letters per word"),
    ("reading_ease", "Readability", "reading-ease score"),
    ("contractions_per_100w", "Formality", "contractions per 100 words"),
    ("first_person_per_100w", "Point of view", "first-person words (I, my, we) per 100 words"),
    ("second_person_per_100w", "Point of view", "uses of \u201cyou\u201d per 100 words"),
    ("questions_per_1kw", "Tone", "questions per 1,000 words"),
    ("exclamations_per_1kw", "Tone", "exclamation marks per 1,000 words"),
    ("em_dashes_per_1kw", "Punctuation", "dashes per 1,000 words"),
]


def _differs(key: str, mine: float, theirs: float, n_words: int) -> bool:
    if key == "reading_ease":
        return abs(mine - theirs) >= 15
    if key in ("sentence_words_avg", "word_length_avg"):
        lo, hi = sorted([max(mine, 0.1), max(theirs, 0.1)])
        return hi / lo >= (1.35 if key == "sentence_words_avg" else 1.15)
    floor = 1.0 if key.endswith("_100w") else 3.0  # ignore tiny absolute differences
    if abs(mine - theirs) < floor:
        return False
    # In short texts a single "?" or "!" swings a rate a lot; need at least ~2 occurrences of difference.
    per = 100 if key.endswith("_100w") else 1000
    if abs(mine - theirs) * n_words / per < 2:
        return False
    lo, hi = sorted([mine, theirs])
    return lo == 0 or hi / lo >= 2


def compare(body: str, profile: dict | None) -> tuple[dict, list[dict]]:
    """How this text's rhythm and tone differ from the writer's samples."""
    fp_text = fingerprint(body)
    fp_voice = (profile or {}).get("fingerprint")
    if not fp_voice or (profile or {}).get("word_count", 0) < 150 or fp_text["words"] < 40:
        return fp_text, []
    out = []
    for key, aspect, unit in _COMPARE:
        mine, theirs = fp_voice.get(key, 0), fp_text.get(key, 0)
        if not _differs(key, mine, theirs, fp_text["words"]):
            continue
        if key == "reading_ease":
            msg = f"This is {'harder' if theirs < mine else 'easier'} to read than your writing (score {theirs:g} vs your {mine:g})."
        else:
            msg = f"{theirs:g} {unit} here; you average {mine:g}."
        out.append({"aspect": aspect, "key": key, "yours": mine, "this_text": theirs, "message": msg})
    return fp_text, out


def heuristic_match(issues: list[dict], differences: list[dict], n_words: int) -> int:
    """Rough 0-100 estimate of how much a text sounds like the writer, without AI."""
    weight = {"error": 4, "warning": 3, "suggestion": 1}
    density = sum(weight.get(i["severity"], 1) for i in issues) / max(1, n_words / 100)
    score = 100 - 8 * len(differences) - 6 * density
    return int(max(0, min(100, round(score))))
