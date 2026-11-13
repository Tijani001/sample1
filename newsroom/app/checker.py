"""Fast, deterministic checks of a story against the learned profile and house rules."""
from __future__ import annotations

import re

from .learner import VARIANT_GROUPS, _headline_case
from .textutil import paragraphs, sentences, words


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
                    f"Your newsroom uses “{pref['preferred']}” "
                    f"({round(pref['share'] * 100)}% of {pref['evidence']} uses in the archive).",
                    _replacement(rule_id, pref["preferred"], m.group(0)),
                ))

    # 2. Spelling dialect
    for wrong, right in (profile.get("spelling_map") or {}).items():
        for m in re.finditer(rf"\b{re.escape(wrong)}\b", body, flags=re.IGNORECASE):
            fixed = right.capitalize() if m.group(0)[0].isupper() else right
            issues.append(_issue("learned", "Spelling", "warning", m.start(), m.end(), body,
                                 f"House spelling is “{right}”.", fixed))

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
            issues.append(_issue("house", "House rule", "error", m.start(), m.end(), body, msg, repl))

    # 4. Structure measured against the archive
    metrics = profile.get("metrics") or {}
    max_sent = metrics.get("sentence_words_max_ok", 35)
    max_para = metrics.get("paragraph_sentences_max_ok", 4)
    max_lede = metrics.get("lede_words_max_ok", 40)
    paras = paragraphs(body)
    cursor = 0
    for i, para in enumerate(paras):
        p_start = body.find(para, cursor)
        cursor = p_start + len(para)
        sents = sentences(para)
        if i == 0 and len(words(para)) > max_lede:
            issues.append(_issue("learned", "Lede", "suggestion", p_start, p_start + len(para), body,
                                 f"Intro is {len(words(para))} words; your published ledes usually stay under {int(max_lede)}."))
        if len(sents) > max_para:
            issues.append(_issue("learned", "Paragraph length", "suggestion", p_start, p_start + len(para), body,
                                 f"{len(sents)} sentences in one paragraph; house paragraphs rarely exceed {int(max_para)}."))
        s_cursor = p_start
        for s in sents:
            s_start = body.find(s, s_cursor)
            if s_start < 0:
                continue
            s_cursor = s_start + len(s)
            n = len(words(s))
            if n > max_sent:
                issues.append(_issue("learned", "Sentence length", "suggestion", s_start, s_start + len(s), body,
                                     f"{n}-word sentence; consider splitting (archive norm tops out around {int(max_sent)})."))

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
            "message": f"Headline looks like {actual}; your newsroom writes headlines in {pref['preferred']}.",
        }]
    return []
