"""Style Desk API: learns each newsroom's house style and checks stories from any client
(web app, browser extension, desktop/mobile apps, keyboards)."""
from __future__ import annotations

import json
import os
from typing import Literal

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

from . import ai, checker, db, learner
from .auth import (current_user, editor, hash_password, issue_token, new_invite_code,
                   revoke_token, verify_password)

STATIC = os.path.join(os.path.dirname(__file__), "static")
MAX_STORY_CHARS = 100_000

app = FastAPI(title="Style Desk")
db.init()


# ---------- models ----------
class RegisterIn(BaseModel):
    newsroom_name: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    client: str = "web"


class JoinIn(BaseModel):
    invite_code: str = Field(min_length=4)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    client: str = "web"


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    client: str = "web"


class ArticleIn(BaseModel):
    title: str = ""
    body: str = Field(min_length=1)


class RuleIn(BaseModel):
    kind: Literal["prefer", "ban", "note"]
    term: str = ""
    replacement: str = ""
    reason: str = ""
    case_sensitive: bool = False


class CheckIn(BaseModel):
    """Used by every client. Title is optional so extensions/keyboards can check any text."""
    title: str = Field(default="", max_length=300)
    body: str = Field(min_length=1, max_length=MAX_STORY_CHARS)
    use_ai: bool = False


class StoryIn(CheckIn):
    title: str = Field(min_length=1, max_length=300)
    byline: str = ""
    use_ai: bool = True


class ReviewDecision(BaseModel):
    status: Literal["submitted", "needs changes", "approved"]
    editor_note: str = ""


class GuideIn(BaseModel):
    guide: ai.StyleGuide


# ---------- helpers ----------
def _house_rules(nid: int):
    return db.rows("SELECT * FROM house_rules WHERE newsroom_id = ? ORDER BY id", (nid,))


def _relearn_stats(nid: int):
    arts = db.rows("SELECT title, body FROM articles WHERE newsroom_id = ? ORDER BY id DESC", (nid,))
    stats = learner.learn(arts) if arts else None
    db.save_profile(nid, stats=json.dumps(stats) if stats else None, stats_updated_at=db.now())
    return stats


def _locate(body: str, quote: str) -> tuple[int | None, int | None]:
    if not quote:
        return None, None
    i = body.find(quote)
    if i < 0:
        i = body.lower().find(quote.lower())
    return (i, i + len(quote)) if i >= 0 else (None, None)


def _run_checks(nid: int, title: str, body: str, use_ai: bool) -> dict:
    prof = db.get_profile(nid)
    rules = _house_rules(nid)
    issues = (checker.check_headline(title, prof["stats"]) if title else []) + \
        checker.check(title, body, prof["stats"], rules)
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


def _session(user_id: int, client: str) -> dict:
    token = issue_token(user_id, client)
    u = db.one("SELECT u.id, u.name, u.email, u.role, n.name AS newsroom_name FROM users u "
               "JOIN newsrooms n ON n.id = u.newsroom_id WHERE u.id = ?", (user_id,))
    return {"token": token, "user": u}


def _email_free(email: str):
    if db.one("SELECT id FROM users WHERE email = ?", (email,)):
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")


# ---------- accounts ----------
@app.post("/api/auth/register")
def register(r: RegisterIn):
    """Create a new newsroom; the person creating it becomes its first editor."""
    _email_free(r.email)
    nid = db.execute("INSERT INTO newsrooms (name, invite_code, created_at) VALUES (?, ?, ?)",
                     (r.newsroom_name.strip(), new_invite_code(), db.now()))
    uid = db.execute("INSERT INTO users (newsroom_id, name, email, password_hash, role, created_at) "
                     "VALUES (?, ?, ?, ?, 'editor', ?)",
                     (nid, r.name.strip(), r.email, hash_password(r.password), db.now()))
    return _session(uid, r.client)


@app.post("/api/auth/join")
def join(j: JoinIn):
    """Join an existing newsroom as a reporter using the invite code an editor shares."""
    n = db.one("SELECT id FROM newsrooms WHERE invite_code = ?", (j.invite_code.strip().upper(),))
    if not n:
        raise HTTPException(404, "That invite code isn't valid. Ask your editor for the current one.")
    _email_free(j.email)
    uid = db.execute("INSERT INTO users (newsroom_id, name, email, password_hash, role, created_at) "
                     "VALUES (?, ?, ?, ?, 'reporter', ?)",
                     (n["id"], j.name.strip(), j.email, hash_password(j.password), db.now()))
    return _session(uid, j.client)


@app.post("/api/auth/login")
def login(r: LoginIn):
    u = db.one("SELECT id, password_hash FROM users WHERE email = ?", (r.email,))
    if not u or not verify_password(r.password, u["password_hash"]):
        raise HTTPException(401, "Wrong email or password.")
    return _session(u["id"], r.client)


@app.post("/api/auth/logout")
def logout(user=Depends(current_user)):
    revoke_token(user["token"])
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(current_user)):
    out = {k: user[k] for k in ("id", "name", "email", "role", "newsroom_name")}
    if user["role"] == "editor":
        out["invite_code"] = db.one("SELECT invite_code FROM newsrooms WHERE id = ?", (user["newsroom_id"],))["invite_code"]
        out["members"] = db.rows("SELECT id, name, email, role FROM users WHERE newsroom_id = ? ORDER BY role, name",
                                 (user["newsroom_id"],))
    return out


@app.post("/api/newsroom/invite/rotate")
def rotate_invite(user=Depends(editor)):
    code = new_invite_code()
    db.execute("UPDATE newsrooms SET invite_code = ? WHERE id = ?", (code, user["newsroom_id"]))
    return {"invite_code": code}


@app.get("/api/status")
def status(user=Depends(current_user)):
    nid = user["newsroom_id"]
    return {
        "ai_enabled": ai.available(),
        "model": ai.MODEL,
        "article_count": db.one("SELECT COUNT(*) n FROM articles WHERE newsroom_id = ?", (nid,))["n"],
        "has_guide": db.get_profile(nid)["guide"] is not None,
    }


# ---------- style learning (editors) ----------
@app.get("/api/articles")
def list_articles(user=Depends(editor)):
    return db.rows("SELECT id, title, length(body) AS chars, created_at FROM articles "
                   "WHERE newsroom_id = ? ORDER BY id DESC", (user["newsroom_id"],))


@app.post("/api/articles")
def add_articles(items: list[ArticleIn], user=Depends(editor)):
    for a in items:
        db.execute("INSERT INTO articles (newsroom_id, title, body, created_at) VALUES (?, ?, ?, ?)",
                   (user["newsroom_id"], a.title.strip(), a.body.strip(), db.now()))
    _relearn_stats(user["newsroom_id"])
    return {"added": len(items)}


@app.post("/api/articles/upload")
async def upload_articles(files: list[UploadFile] = File(...), user=Depends(editor)):
    """Each .txt/.md file is one article; its first line is the headline."""
    added = 0
    for f in files:
        raw = (await f.read()).decode("utf-8", errors="replace").strip()
        if not raw:
            continue
        head, _, rest = raw.partition("\n")
        title, body = (head.lstrip("# ").strip(), rest.strip()) if rest.strip() else ("", head)
        db.execute("INSERT INTO articles (newsroom_id, title, body, created_at) VALUES (?, ?, ?, ?)",
                   (user["newsroom_id"], title, body, db.now()))
        added += 1
    _relearn_stats(user["newsroom_id"])
    return {"added": added}


@app.delete("/api/articles/{article_id}")
def delete_article(article_id: int, user=Depends(editor)):
    db.execute("DELETE FROM articles WHERE id = ? AND newsroom_id = ?", (article_id, user["newsroom_id"]))
    _relearn_stats(user["newsroom_id"])
    return {"ok": True}


@app.get("/api/profile")
def get_profile(user=Depends(current_user)):
    return db.get_profile(user["newsroom_id"])


@app.post("/api/profile/learn")
def learn_guide(user=Depends(editor)):
    nid = user["newsroom_id"]
    arts = db.rows("SELECT title, body FROM articles WHERE newsroom_id = ? ORDER BY id DESC", (nid,))
    if not arts:
        raise HTTPException(400, "Add some published articles first.")
    stats = _relearn_stats(nid)
    try:
        guide, used = ai.distill_guide(arts, _house_rules(nid), stats)
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    db.save_profile(nid, guide=guide.model_dump_json(), guide_updated_at=db.now())
    return {"guide": guide.model_dump(), "articles_used": used}


@app.put("/api/profile/guide")
def save_guide(payload: GuideIn, user=Depends(editor)):
    db.save_profile(user["newsroom_id"], guide=payload.guide.model_dump_json(), guide_updated_at=db.now())
    return {"ok": True}


@app.get("/api/rules")
def list_rules(user=Depends(current_user)):
    return _house_rules(user["newsroom_id"])


@app.post("/api/rules")
def add_rule(r: RuleIn, user=Depends(editor)):
    if r.kind in ("prefer", "ban") and not r.term.strip():
        raise HTTPException(400, "A term is required.")
    if r.kind == "prefer" and not r.replacement.strip():
        raise HTTPException(400, "A preferred replacement is required.")
    if r.kind == "note" and not r.reason.strip():
        raise HTTPException(400, "Write the guidance in the note.")
    rid = db.execute(
        "INSERT INTO house_rules (newsroom_id, kind, term, replacement, reason, case_sensitive, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (user["newsroom_id"], r.kind, r.term.strip(), r.replacement.strip(), r.reason.strip(),
         int(r.case_sensitive), db.now()))
    return {"id": rid}


@app.delete("/api/rules/{rule_id}")
def delete_rule(rule_id: int, user=Depends(editor)):
    db.execute("DELETE FROM house_rules WHERE id = ? AND newsroom_id = ?", (rule_id, user["newsroom_id"]))
    return {"ok": True}


# ---------- checking (all clients) ----------
@app.post("/api/check")
def check_text(payload: CheckIn, user=Depends(current_user)):
    """Check any text against the newsroom's style. Fast by default; set use_ai for a deep review."""
    return _run_checks(user["newsroom_id"], payload.title, payload.body, payload.use_ai)


# ---------- submissions ----------
@app.post("/api/submissions")
def submit_story(story: StoryIn, user=Depends(current_user)):
    nid = user["newsroom_id"]
    report = _run_checks(nid, story.title, story.body, story.use_ai)
    sid = db.execute(
        "INSERT INTO submissions (newsroom_id, reporter_id, title, byline, body, report, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (nid, user["id"], story.title, story.byline or user["name"], story.body, json.dumps(report), db.now(), db.now()))
    return {"id": sid, "report": report}


def _visible(user) -> tuple[str, tuple]:
    if user["role"] == "editor":
        return "newsroom_id = ?", (user["newsroom_id"],)
    return "newsroom_id = ? AND reporter_id = ?", (user["newsroom_id"], user["id"])


@app.get("/api/submissions")
def list_submissions(status: str | None = None, user=Depends(current_user)):
    where, params = _visible(user)
    if status:
        where += " AND status = ?"
        params += (status,)
    out = []
    for r in db.rows(f"SELECT id, title, byline, status, report, editor_note, created_at, updated_at "
                     f"FROM submissions WHERE {where} ORDER BY id DESC", params):
        rep = json.loads(r.pop("report") or "{}")
        r["counts"] = rep.get("counts", {})
        r["readiness"] = (rep.get("ai") or {}).get("readiness")
        out.append(r)
    return out


def _get_submission(sid: int, user) -> dict:
    where, params = _visible(user)
    r = db.one(f"SELECT * FROM submissions WHERE id = ? AND {where}", (sid, *params))
    if not r:
        raise HTTPException(404, "Not found")
    return r


@app.get("/api/submissions/{sid}")
def get_submission(sid: int, user=Depends(current_user)):
    r = _get_submission(sid, user)
    r["report"] = json.loads(r["report"] or "{}")
    return r


@app.post("/api/submissions/{sid}/decision")
def decide(sid: int, d: ReviewDecision, user=Depends(editor)):
    _get_submission(sid, user)
    db.execute("UPDATE submissions SET status = ?, editor_note = ?, updated_at = ? WHERE id = ?",
               (d.status, d.editor_note, db.now(), sid))
    return {"ok": True}


@app.post("/api/submissions/{sid}/promote")
def promote(sid: int, user=Depends(editor)):
    """Add an approved story to the training archive so the style model keeps learning."""
    r = _get_submission(sid, user)
    if r["status"] != "approved":
        raise HTTPException(400, "Only approved stories can be added to the archive.")
    db.execute("INSERT INTO articles (newsroom_id, title, body, created_at) VALUES (?, ?, ?, ?)",
               (user["newsroom_id"], r["title"], r["body"], db.now()))
    _relearn_stats(user["newsroom_id"])
    return {"ok": True}


# ---------- web app (installable PWA) ----------
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(os.path.join(STATIC, "manifest.webmanifest"), media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    # Served from the root so it can control the whole app.
    return FileResponse(os.path.join(STATIC, "sw.js"), media_type="text/javascript")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))
