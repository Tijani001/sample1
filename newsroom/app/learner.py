"""Learns measurable house-style preferences from a corpus of published articles.

Everything here is deterministic and runs without an API key. Each detector counts
competing variants (e.g. "per cent" vs "percent") across the corpus and records a
preference only when one variant clearly dominates, so the checker never enforces a
"rule" the newsroom doesn't actually follow.
"""
from __future__ import annotations

import re
import statistics
from collections import Counter

from .textutil import paragraphs, sentences, words

# A preference is recorded only if the winning variant reaches this share...
DOMINANCE = 0.8
# ...and has been seen at least this many times in total.
MIN_EVIDENCE = 3

# (rule id, human label, {variant name: regex}). Regexes are case-insensitive.
VARIANT_GROUPS: list[tuple[str, str, dict[str, str]]] = [
    ("percent", "Percent style", {
        "per cent": r"\bper cent\b",
        "percent": r"\bpercent\b",
        "%": r"\d\s?%",
    }),
    ("attribution", "Attribution verb tense", {
        "said": r"\bsaid\b",
        "says": r"\bsays\b",
    }),
    ("honorific_period", "Honorific punctuation", {
        "Mr.": r"\b(?:Mr|Mrs|Ms|Dr)\.",
        "Mr": r"\b(?:Mr|Mrs|Ms|Dr)\b(?!\.)",
    }),
    ("time_style", "Time of day style", {
        "a.m.": r"\d\s?[ap]\.m\.",
        "am": r"\d\s?[ap]m\b",
    }),
    ("oxford_comma", "Serial (Oxford) comma", {
        "with serial comma": r"\b\w+, \w+(?: \w+)?, (?:and|or) \w+",
        "without serial comma": r"\b\w+, \w+(?: \w+)? (?:and|or) \w+",
    }),
    ("quote_marks", "Quotation marks", {
        "double quotes": r"[\"“”]",
        "single quotes": r"(?<![A-Za-z])[‘'](?=[A-Z])",
    }),
    ("numbers_small", "Numbers one to nine", {
        # "two people" vs "2 people" (plural count nouns; "one" is too ambiguous to count)
        "spelled out": r"\b(?:two|three|four|five|six|seven|eight|nine) [a-z]+s\b",
        "numerals": r"(?<![\d.,$£€:/-])\b[2-9] [a-z]+s\b",
    }),
]

# Word-level spelling variants: (US form, UK form). The learner decides which one
# this newsroom uses; the checker flags the other.
SPELLING_PAIRS: list[tuple[str, str]] = [
    ("organization", "organisation"), ("organize", "organise"), ("organized", "organised"),
    ("realize", "realise"), ("realized", "realised"), ("recognize", "recognise"),
    ("recognized", "recognised"), ("criticize", "criticise"), ("criticized", "criticised"),
    ("apologize", "apologise"), ("emphasize", "emphasise"), ("prioritize", "prioritise"),
    ("color", "colour"), ("favor", "favour"), ("favorite", "favourite"), ("honor", "honour"),
    ("labor", "labour"), ("neighbor", "neighbour"), ("behavior", "behaviour"),
    ("center", "centre"), ("theater", "theatre"), ("meter", "metre"), ("liter", "litre"),
    ("defense", "defence"), ("offense", "offence"), ("license", "licence"),
    ("program", "programme"), ("traveled", "travelled"), ("traveling", "travelling"),
    ("canceled", "cancelled"), ("modeling", "modelling"), ("analyze", "analyse"),
    ("analyzed", "analysed"), ("catalog", "catalogue"), ("dialog", "dialogue"),
    ("gray", "grey"), ("aluminum", "aluminium"), ("fetus", "foetus"), ("jewelry", "jewellery"),
    ("check", "cheque"), ("tire", "tyre"), ("judgment", "judgement"), ("toward", "towards"),
    ("afterward", "afterwards"), ("enroll", "enrol"), ("fulfill", "fulfil"),
]


def _count(pattern: str, text: str) -> int:
    return len(re.findall(pattern, text, flags=re.IGNORECASE))


def _preference(counts: dict[str, int]) -> dict | None:
    total = sum(counts.values())
    if total < MIN_EVIDENCE:
        return None
    winner, n = max(counts.items(), key=lambda kv: kv[1])
    share = n / total
    if share < DOMINANCE:
        return None
    return {"preferred": winner, "share": round(share, 3), "evidence": total, "counts": counts}


def _pct(values: list[int], q: float) -> float:
    if not values:
        return 0
    s = sorted(values)
    k = min(len(s) - 1, max(0, round(q * (len(s) - 1))))
    return s[k]


def _headline_case(title: str) -> str | None:
    tokens = [w for w in re.findall(r"[A-Za-z][A-Za-z'’-]*", title)]
    if len(tokens) < 3:
        return None
    small = {"a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "by", "with", "as", "is", "from"}
    rest = tokens[1:]
    caps = sum(1 for w in rest if w[0].isupper() and w.lower() not in small)
    lower_content = sum(1 for w in rest if w[0].islower() and w.lower() not in small)
    if caps + lower_content == 0:
        return None
    return "title case" if caps > lower_content else "sentence case"


def learn(articles: list[dict]) -> dict:
    """Build a style profile from [{"title": str, "body": str}, ...]."""
    corpus = "\n\n".join(a["body"] for a in articles)
    profile: dict = {"article_count": len(articles), "word_count": len(words(corpus)), "preferences": {}}

    for rule_id, label, variants in VARIANT_GROUPS:
        counts = {name: _count(rx, corpus) for name, rx in variants.items()}
        pref = _preference(counts)
        if pref:
            profile["preferences"][rule_id] = {"label": label, **pref}

    spelling: dict[str, str] = {}
    us_total = uk_total = 0
    for us, uk in SPELLING_PAIRS:
        us_n = _count(rf"\b{us}\b", corpus)
        uk_n = _count(rf"\b{uk}\b", corpus)
        us_total += us_n
        uk_total += uk_n
        if us_n and not uk_n:
            spelling[uk] = us
        elif uk_n and not us_n:
            spelling[us] = uk
    dialect = _preference({"US": us_total, "UK": uk_total})
    if dialect:
        # Apply the dominant dialect to every known pair, not just the words we saw.
        for us, uk in SPELLING_PAIRS:
            if dialect["preferred"] == "US":
                spelling.setdefault(uk, us)
            else:
                spelling.setdefault(us, uk)
        profile["preferences"]["spelling_dialect"] = {"label": "Spelling dialect", **dialect}
    profile["spelling_map"] = spelling  # wrong form -> house form

    sent_lens = [len(words(s)) for s in sentences(corpus) if words(s)]
    para_lens = []
    for a in articles:
        para_lens += [len(sentences(p)) for p in paragraphs(a["body"])]
    first_para_words = [len(words(paragraphs(a["body"])[0])) for a in articles if paragraphs(a["body"])]
    profile["metrics"] = {
        "sentence_words_median": statistics.median(sent_lens) if sent_lens else 0,
        "sentence_words_p90": _pct(sent_lens, 0.9),
        "sentence_words_max_ok": max(25, _pct(sent_lens, 0.97)),
        "paragraph_sentences_median": statistics.median(para_lens) if para_lens else 0,
        "paragraph_sentences_max_ok": max(2, _pct(para_lens, 0.95)),
        "lede_words_median": statistics.median(first_para_words) if first_para_words else 0,
        "lede_words_max_ok": max(30, _pct(first_para_words, 0.9)),
    }

    cases = Counter(c for a in articles if (c := _headline_case(a.get("title") or "")))
    pref = _preference(dict(cases))
    if pref:
        profile["preferences"]["headline_case"] = {"label": "Headline capitalisation", **pref}

    return profile
