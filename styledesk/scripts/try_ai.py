"""Live test of the AI features against a sample voice (uses real API calls; costs a few cents).

    cd styledesk
    export ANTHROPIC_API_KEY=...
    python scripts/try_ai.py                       # blog voice vs. samples/ai-draft.txt
    python scripts/try_ai.py samples/voices/news-reporting path/to/draft.txt

Prints the learned voice profile, the review of the draft, and both kinds of rewrite,
plus the rule-based score of each rewrite so you can see whether it moved toward the voice.
"""
import glob
import os
import sys
import textwrap
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import ai, checker, learner  # noqa: E402
from app.main import _merge, _to_sentence  # noqa: E402


def load(folder):
    out = []
    for f in sorted(glob.glob(os.path.join(folder, "*.txt"))):
        head, _, rest = open(f, encoding="utf-8").read().strip().partition("\n")
        out.append({"title": head, "body": rest.strip()})
    return out


def score(text, stats):
    issues = checker.check("", text, stats, [])
    fp, diffs = checker.compare(text, stats)
    return checker.heuristic_match(issues, diffs, fp["words"]), issues, diffs


def show(title, body=""):
    print(f"\n=== {title} " + "=" * max(0, 60 - len(title)))
    if body:
        print(textwrap.fill(body, 100) if "\n" not in body else body)


def main():
    voice_dir = sys.argv[1] if len(sys.argv) > 1 else "samples/voices/personal-blog"
    draft_path = sys.argv[2] if len(sys.argv) > 2 else "samples/ai-draft.txt"
    if not ai.available():
        sys.exit("Set ANTHROPIC_API_KEY first.")
    samples = load(voice_dir)
    title, _, draft = open(draft_path, encoding="utf-8").read().strip().partition("\n")
    draft = draft.strip()
    stats = learner.learn(samples)
    name = os.path.basename(voice_dir.rstrip("/"))

    t = time.time()
    profile, used = ai.distill_profile(samples, stats, [])
    show(f"Voice profile ({used} samples, {time.time() - t:.0f}s)", profile.summary)
    print("Tone:", ", ".join(profile.tone))
    for tr in profile.traits[:8]:
        print(f"  - [{tr.aspect}] {tr.description}")
    p = profile.model_dump()

    before, issues, _ = score(draft, stats)
    t = time.time()
    review = ai.review(name, draft, p, stats, [], samples)
    show(f"Review of the draft ({time.time() - t:.0f}s)",
         f"AI match score {review.match_score}/100 (rule estimate {before}/100). {review.summary}")
    for it in review.issues:
        print(f"  - [{it.category}] “{it.quote[:70]}”: {it.explanation}")

    # Same span logic as the API: everything flagged, widened to sentences and merged.
    spans = [{"start": i["start"], "end": i["end"], "reason": i["message"]} for i in issues if i["start"] is not None]
    for it in review.issues:
        k = draft.find(it.quote)
        if k >= 0:
            spans.append({"start": k, "end": k + len(it.quote), "reason": it.explanation})
    for sp in spans:
        sp["start"], sp["end"] = _to_sentence(draft, sp["start"], sp["end"])
    spans = _merge(spans)
    for i, sp in enumerate(spans):
        sp["id"] = i + 1
    t = time.time()
    rewrites = ai.rewrite_spans(name, draft, spans, p, stats, [], samples)
    out, pos = [], 0
    for sp in spans:
        out += [draft[pos:sp["start"]], rewrites.get(sp["id"], draft[sp["start"]:sp["end"]])]
        pos = sp["end"]
    flagged = "".join(out) + draft[pos:]
    s1, _, d1 = score(flagged, stats)
    show(f"Rewrite of flagged parts ({len(spans)} passages, {time.time() - t:.0f}s), rule estimate {s1}/100", flagged)
    for d in d1:
        print("  still differs:", d["message"])

    t = time.time()
    full = ai.rewrite_all(name, draft, p, stats, [], samples)
    s2, _, d2 = score(full, stats)
    show(f"Whole-text rewrite ({time.time() - t:.0f}s), rule estimate {s2}/100", full)
    for d in d2:
        print("  still differs:", d["message"])

    check = ai.review(name, full, p, stats, [], samples)
    show("Re-review of the whole-text rewrite", f"AI match score {check.match_score}/100. {check.summary}")


if __name__ == "__main__":
    main()
