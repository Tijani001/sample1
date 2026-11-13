"""Learns a writer's measurable style from samples of their own writing.

Everything here is deterministic and runs without an API key:
- habits: competing variants ("per cent" vs "percent", "said" vs "says", UK vs US spelling),
  recorded only when one clearly dominates, so we never enforce a habit the writer doesn't have;
- a fingerprint: rates and averages (sentence length, contractions, em dashes, first person...)
  used to say how a new text differs in tone and rhythm;
- which "AI-sounding" phrases the writer genuinely uses, so we don't flag their own words.
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
# this writer uses; the checker flags the other.
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


# Phrases that are far more common in AI-generated text than in most people's writing.
# (id, regex, simple replacement or None). Flagged only if the writer's own samples never use them.
AI_TELLS: list[tuple[str, str, str | None]] = [
    ("in today's fast-paced world", r"\bin today'?s (?:fast-paced|digital|modern|ever-changing) world\b", None),
    ("delve", r"\bdelv(?:e|es|ed|ing)(?: into| deeper)?\b", "look at"),
    ("tapestry", r"\b(?:rich )?tapestry\b", None),
    ("testament to", r"\b(?:a |is a )?testament to\b", None),
    ("navigate the complexities", r"\bnavigat(?:e|ing) the (?:complexities|intricacies|challenges)\b", None),
    ("ever-evolving", r"\bever-(?:evolving|changing) landscape\b|\bever-evolving\b", None),
    ("landscape", r"\bthe (?:digital|business|modern|current) landscape\b", None),
    ("game-changer", r"\bgame[- ]changer\b", None),
    ("unlock", r"\bunlock(?:s|ing)? (?:the|your|its|a) (?:full )?(?:potential|power)\b", None),
    ("journey", r"\b(?:embark on|the journey (?:toward|towards|to)|on this journey)\b", None),
    ("seamless", r"\bseamless(?:ly)?\b", None),
    ("holistic", r"\bholistic\b", None),
    ("pivotal", r"\bpivotal\b", "key"),
    ("crucial role", r"\bplays? an? (?:crucial|pivotal|vital|key) role\b", None),
    ("underscore", r"\bunderscor(?:e|es|ed|ing)\b", "shows"),
    ("elevate", r"\belevat(?:e|es|ed|ing) (?:your|the|our)\b", None),
    ("foster", r"\bfoster(?:s|ed|ing)?\b", "encourage"),
    ("leverage", r"\bleverag(?:e|es|ed|ing)\b", "use"),
    ("utilize", r"\butili[sz](?:e|es|ed|ing)\b", "use"),
    ("furthermore", r"\bfurthermore\b", "also"),
    ("moreover", r"\bmoreover\b", "also"),
    ("additionally", r"\badditionally\b", "also"),
    ("it's important to note", r"\bit(?:'s| is) (?:important|worth) (?:to note|noting) that\s*", ""),
    ("in conclusion", r"\bin (?:conclusion|summary)\b,?", None),
    ("ultimately", r"\bultimately\b,?", None),
    ("not just X, it's Y", r"\b(?:it'?s|it is|this is) not (?:just|only|merely) [^.!?\n]{1,60}?(?:[,;]|\u2014|\u2013| -) ?(?:it'?s|it is|but)\b", None),
    ("whether you're", r"\bwhether you'?re an? [^.!?\n]{1,40} or an? \b", None),
    ("let's dive in", r"\blet'?s (?:dive|jump) (?:in|into)\b", None),
    ("realm", r"\b(?:the )?realm of\b", None),
    ("transformative", r"\btransformative\b", None),
    ("embrace", r"\bembrac(?:e|es|ed|ing)\b", None),
    ("remarkable", r"\bremarkabl[ey]\b", None),
    ("meticulous", r"\bmeticulous(?:ly)?\b", "careful"),
    ("robust", r"\brobust\b", "strong"),
    ("vibrant", r"\bvibrant\b", None),
    ("bustling", r"\bbustling\b", "busy"),
    ("showcase", r"\bshowcas(?:e|es|ed|ing)\b", "show"),
    ("comprehensive", r"\bcomprehensive\b", "full"),
    ("myriad", r"\b(?:a )?myriad(?: of)?\b", "many"),
    ("synergy", r"\bsynerg(?:y|ies|istic)\b", None),
]

_CONTRACTION = r"\b\w+(?:n['\u2019]t|['\u2019](?:re|ve|ll|m|d))\b|\b(?:it|that|there|here|what|who|let|he|she|where|how)['\u2019]s\b"
_EM_DASH = r"\u2014|\s--\s|\s\u2013\s"
_FIRST_PERSON = r"\b(?:I|me|my|mine|myself|we|our|ours|ourselves)\b"


def _syllables(word: str) -> int:
    w = word.lower().strip("'\u2019")
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
        n -= 1
    return max(1, n)


def fingerprint(text: str) -> dict:
    """Rates and averages that describe how a piece of writing reads."""
    w = words(text)
    n = max(1, len(w))
    sents = [s for s in sentences(text) if words(s)]
    ns = max(1, len(sents))
    sent_lens = [len(words(s)) for s in sents]
    syl = sum(_syllables(x) for x in w)
    lw = [x.lower() for x in w]
    windows = [len(set(lw[i:i + 50])) / 50 for i in range(0, max(1, len(lw) - 49), 25)] if len(lw) >= 50 else [len(set(lw)) / n]
    per100 = lambda c: round(100 * c / n, 2)
    per1k = lambda c: round(1000 * c / n, 2)
    return {
        "words": len(w),
        "sentence_words_avg": round(sum(sent_lens) / ns, 1),
        "sentence_words_sd": round(statistics.pstdev(sent_lens), 1) if len(sent_lens) > 1 else 0,
        "word_length_avg": round(sum(len(x) for x in w) / n, 2),
        "reading_ease": round(206.835 - 1.015 * (n / ns) - 84.6 * (syl / n), 1),
        "vocabulary_variety": round(sum(windows) / len(windows), 3),
        "contractions_per_100w": per100(len(re.findall(_CONTRACTION, text, flags=re.I))),
        "first_person_per_100w": per100(len(re.findall(_FIRST_PERSON, text))),
        "second_person_per_100w": per100(len(re.findall(r"\byou(?:r|rs|rself|'re|'ve|'ll)?\b", text, flags=re.I))),
        "em_dashes_per_1kw": per1k(len(re.findall(_EM_DASH, text))),
        "semicolons_per_1kw": per1k(text.count(";")),
        "exclamations_per_1kw": per1k(text.count("!")),
        "questions_per_1kw": per1k(text.count("?")),
    }


def learn(articles: list[dict]) -> dict:
    """Build a style profile from writing samples: [{"title": str, "body": str}, ...]."""
    corpus = "\n\n".join(a["body"] for a in articles)
    profile: dict = {"sample_count": len(articles), "word_count": len(words(corpus)), "preferences": {}}

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

    profile["fingerprint"] = fingerprint(corpus)
    profile["ai_phrases_used"] = [pid for pid, rx, _ in AI_TELLS if re.search(rx, corpus, flags=re.IGNORECASE)]
    return profile
