"""Newsroom Style Desk: learns a newsroom's house style and checks submitted stories."""
from __future__ import annotations

import json
import os
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import ai, checker, db, learner

STATIC = os.path.join(os.path.dirname(__file__), "static")
MAX_STORY_CHARS = 100_000

app = FastAPI(title="Newsroom Style Desk")
db.init()


# ---------- models ----------
class ArticleIn(BaseModel):
    title: str = ""
    body: str = Field(min_length=1)


class RuleIn(BaseModel):
    kind: Literal["prefer", "ban", "note"]
    term: str = ""
    replacement: str = ""
    reason: str = ""
    case_sensitive: bool = False


class StoryIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    byline: str = ""
    body: str = Field(min_length=1, max_length=MAX_STORY_CHARS)
    use_ai: bool = True


class ReviewDecision(BaseModel):
    status: Literal["submitted", "needs changes", "approved"]
    editor_note: str = ""


class GuideIn(BaseModel):
    guide: ai.StyleGuide


# ---------- helpers ----------
def _house_rules():
    return db.rows("SELECT * FROM house_rules ORDER BY id")


def _relearn_stats():
    arts = db.rows("SELECT title, body FROM articles ORDER BY id DESC")
    stats = learner.learn(arts) if arts else None
    db.execute("UPDATE profile SET stats = ?, stats_updated_at = ? WHERE id = 1",
               (json.dumps(stats) if stats else None, db.now()))
    return stats


def _locate(body: str, quote: str) -> tuple[int | None, int | None]:
    if not quote:
        return None, None
    i = body.find(quote)
    if i < 0:
        i = body.lower().find(quote.lower())
    return (i, i + len(quote)) if i >= 0 else (None, None)


def _run_checks(title: str, body: str, use_ai: bool) -> dict:
    prof = db.get_profile()
    rules = _house_rules()
    issues = checker.check_headline(title, prof["stats"]) + checker.check(title, body, prof["stats"], rules)
    report = {"ai": None, "ai_error": None, "learned_from": (prof["stats"] or {}).get("article_count", 0)}
    if use_ai:
        try:
            r = ai.review(title, body, prof["guide"], prof["stats"], rules)
            report["ai"] = {"readiness": r.readiness, "summary": r.summary}
            for it in r.issues:
                start, end = _locate(body, it.quote)
                issues.append({
                    "source": "ai", "category": it.category, "severity": it.severity,
                    "start": start, "end": end, "excerpt": it.quote, "message": it.explanation,
                    "replacement": it.suggestion or None,
                })
        except ai.AIUnavailable as e:
            report["ai_error"] = str(e)
    issues.sort(key=lambda x: (x["start"] is None, x["start"] or 0))
    for i, it in enumerate(issues):
        it["id"] = i
    counts = {s: sum(1 for it in issues if it["severity"] == s) for s in ("error", "warning", "suggestion")}
    report.update(issues=issues, counts=counts)
    return report


# ---------- style learning ----------
@app.get("/api/status")
def status():
    prof = db.get_profile()
    return {
        "ai_enabled": ai.available(),
        "model": ai.MODEL,
        "article_count": db.rows("SELECT COUNT(*) n FROM articles")[0]["n"],
        "has_guide": prof["guide"] is not None,
    }


@app.get("/api/articles")
def list_articles():
    return db.rows("SELECT id, title, substr(body, 1, 200) AS preview, length(body) AS chars, created_at "
                   "FROM articles ORDER BY id DESC")


@app.post("/api/articles")
def add_articles(items: list[ArticleIn]):
    for a in items:
        db.execute("INSERT INTO articles (title, body, created_at) VALUES (?, ?, ?)",
                   (a.title.strip(), a.body.strip(), db.now()))
    _relearn_stats()
    return {"added": len(items)}


@app.post("/api/articles/upload")
async def upload_articles(files: list[UploadFile] = File(...)):
    """Each .txt/.md file is one article; its first line is the headline."""
    added = 0
    for f in files:
        raw = (await f.read()).decode("utf-8", errors="replace").strip()
        if not raw:
            continue
        head, _, rest = raw.partition("\n")
        title, body = (head.lstrip("# ").strip(), rest.strip()) if rest.strip() else ("", head)
        db.execute("INSERT INTO articles (title, body, created_at) VALUES (?, ?, ?)", (title, body, db.now()))
        added += 1
    _relearn_stats()
    return {"added": added}


@app.delete("/api/articles/{article_id}")
def delete_article(article_id: int):
    db.execute("DELETE FROM articles WHERE id = ?", (article_id,))
    _relearn_stats()
    return {"ok": True}


@app.get("/api/profile")
def get_profile():
    return db.get_profile()


@app.post("/api/profile/learn")
def learn_guide():
    arts = db.rows("SELECT title, body FROM articles ORDER BY id DESC")
    if not arts:
        raise HTTPException(400, "Add some published articles first.")
    stats = _relearn_stats()
    try:
        guide, used = ai.distill_guide(arts, _house_rules(), stats)
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    db.execute("UPDATE profile SET guide = ?, guide_updated_at = ? WHERE id = 1",
               (guide.model_dump_json(), db.now()))
    return {"guide": guide.model_dump(), "articles_used": used}


@app.put("/api/profile/guide")
def save_guide(payload: GuideIn):
    """Editors can correct or extend the learned guide."""
    db.execute("UPDATE profile SET guide = ?, guide_updated_at = ? WHERE id = 1",
               (payload.guide.model_dump_json(), db.now()))
    return {"ok": True}


@app.get("/api/rules")
def list_rules():
    return _house_rules()


@app.post("/api/rules")
def add_rule(r: RuleIn):
    if r.kind in ("prefer", "ban") and not r.term.strip():
        raise HTTPException(400, "A term is required.")
    if r.kind == "prefer" and not r.replacement.strip():
        raise HTTPException(400, "A preferred replacement is required.")
    if r.kind == "note" and not r.reason.strip():
        raise HTTPException(400, "Write the guidance in the note.")
    rid = db.execute(
        "INSERT INTO house_rules (kind, term, replacement, reason, case_sensitive, created_at) VALUES (?,?,?,?,?,?)",
        (r.kind, r.term.strip(), r.replacement.strip(), r.reason.strip(), int(r.case_sensitive), db.now()))
    return {"id": rid}


@app.delete("/api/rules/{rule_id}")
def delete_rule(rule_id: int):
    db.execute("DELETE FROM house_rules WHERE id = ?", (rule_id,))
    return {"ok": True}


# ---------- stories ----------
@app.post("/api/check")
def check_story(story: StoryIn):
    """Check without submitting (a reporter's self-check)."""
    return _run_checks(story.title, story.body, story.use_ai)


@app.post("/api/submissions")
def submit_story(story: StoryIn):
    report = _run_checks(story.title, story.body, story.use_ai)
    sid = db.execute(
        "INSERT INTO submissions (title, byline, body, report, created_at, updated_at) VALUES (?,?,?,?,?,?)",
        (story.title, story.byline, story.body, json.dumps(report), db.now(), db.now()))
    return {"id": sid, "report": report}


@app.get("/api/submissions")
def list_submissions(status: str | None = None):
    sql = "SELECT id, title, byline, status, report, editor_note, created_at, updated_at FROM submissions"
    params: tuple = ()
    if status:
        sql += " WHERE status = ?"
        params = (status,)
    out = []
    for r in db.rows(sql + " ORDER BY id DESC", params):
        rep = json.loads(r.pop("report") or "{}")
        r["counts"] = rep.get("counts", {})
        r["readiness"] = (rep.get("ai") or {}).get("readiness")
        out.append(r)
    return out


@app.get("/api/submissions/{sid}")
def get_submission(sid: int):
    r = db.rows("SELECT * FROM submissions WHERE id = ?", (sid,))
    if not r:
        raise HTTPException(404, "Not found")
    r = r[0]
    r["report"] = json.loads(r["report"] or "{}")
    return r


@app.post("/api/submissions/{sid}/decision")
def decide(sid: int, d: ReviewDecision):
    if not db.rows("SELECT id FROM submissions WHERE id = ?", (sid,)):
        raise HTTPException(404, "Not found")
    db.execute("UPDATE submissions SET status = ?, editor_note = ?, updated_at = ? WHERE id = ?",
               (d.status, d.editor_note, db.now(), sid))
    return {"ok": True}


@app.post("/api/submissions/{sid}/promote")
def promote(sid: int):
    """Add an approved story to the training archive so the style model keeps learning."""
    r = db.rows("SELECT title, body, status FROM submissions WHERE id = ?", (sid,))
    if not r:
        raise HTTPException(404, "Not found")
    if r[0]["status"] != "approved":
        raise HTTPException(400, "Only approved stories can be added to the archive.")
    db.execute("INSERT INTO articles (title, body, created_at) VALUES (?, ?, ?)", (r[0]["title"], r[0]["body"], db.now()))
    _relearn_stats()
    return {"ok": True}


app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))
