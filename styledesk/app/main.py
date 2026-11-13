"""Style Desk API: learn anyone's writing voice from their own samples, check any text
(for example an AI draft) against it, and rewrite what doesn't sound like them."""
from __future__ import annotations

import json
import os
import re
from typing import Literal

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

from . import ai, checker, db, learner
from .auth import (current_user, hash_password, issue_token, new_invite_code, owner,
                   revoke_token, verify_password)

STATIC = os.path.join(os.path.dirname(__file__), "static")
MAX_TEXT_CHARS = 100_000
MAX_SPANS = 60
# Protects the AI key on a public server: if set, creating a new account needs this code.
SIGNUP_CODE = os.environ.get("STYLEDESK_SIGNUP_CODE", "").strip()
# AI calls (deep check, learn voice, rewrite) allowed per user per UTC day. 0 = unlimited.
AI_DAILY_LIMIT = int(os.environ.get("STYLEDESK_AI_DAILY_LIMIT", "40"))

app = FastAPI(title="Style Desk")
db.init()


# ---------- models ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    client: str = "web"
    signup_code: str = ""


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


class VoiceIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)


class VoicePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)


class SampleIn(BaseModel):
    title: str = ""
    body: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)


class RuleIn(BaseModel):
    kind: Literal["prefer", "ban", "note"]
    term: str = ""
    replacement: str = ""
    reason: str = ""
    case_sensitive: bool = False


class CheckIn(BaseModel):
    voice_id: int
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    title: str = Field(default="", max_length=300)
    use_ai: bool = False


class Span(BaseModel):
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    reason: str = ""


class RewriteIn(BaseModel):
    voice_id: int
    text: str = Field(min_length=1, max_length=ai.MAX_REWRITE_CHARS)
    mode: Literal["spans", "all"] = "spans"
    spans: list[Span] = []
    add_prompts: bool = False  # mode=all: leave [notes] where the writer's own details should go


class ProfileIn(BaseModel):
    profile: ai.VoiceProfile


# ---------- helpers ----------
def _voice(vid: int, user: dict, write: bool = False) -> dict:
    v = db.one("SELECT * FROM voices WHERE id = ? AND workspace_id = ?", (vid, user["workspace_id"]))
    if not v:
        raise HTTPException(404, "Voice not found.")
    if write and user["role"] != "owner" and v["created_by"] != user["id"]:
        raise HTTPException(403, "Only the person who created this voice, or the workspace owner, can change it.")
    v["stats"] = json.loads(v["stats"]) if v["stats"] else None
    v["profile"] = json.loads(v["profile"]) if v["profile"] else None
    return v


def _rules(vid: int):
    return db.rows("SELECT * FROM rules WHERE voice_id = ? ORDER BY id", (vid,))


def _samples(vid: int):
    return db.rows("SELECT title, body FROM samples WHERE voice_id = ? ORDER BY id DESC", (vid,))


def _relearn(vid: int):
    samples = _samples(vid)
    stats = learner.learn(samples) if samples else None
    db.execute("UPDATE voices SET stats = ?, stats_updated_at = ? WHERE id = ?",
               (json.dumps(stats) if stats else None, db.now(), vid))
    return stats


def _voice_summary(v: dict) -> dict:
    stats = v["stats"] or {}
    return {
        "id": v["id"], "name": v["name"], "description": v["description"],
        "sample_count": stats.get("sample_count", 0), "word_count": stats.get("word_count", 0),
        "has_profile": v["profile"] is not None, "created_by": v["created_by"],
    }


def _locate(body: str, quote: str, taken: list[tuple[int, int]]) -> tuple[int | None, int | None]:
    """Find an AI-quoted passage in the text, preferring an occurrence not already flagged."""
    if not quote:
        return None, None
    hay, needle = body, quote
    i = hay.find(needle)
    if i < 0:
        hay, needle = body.lower(), quote.lower()
        i = hay.find(needle)
    first = i
    while i >= 0 and any(s == i for s, _ in taken):
        i = hay.find(needle, i + 1)
    i = i if i >= 0 else first
    return (i, i + len(quote)) if i >= 0 else (None, None)


_SENT_END = re.compile(r"[.!?][\"'\u201d\u2019)]*(?=\s|$)|\n\s*\n")


def _to_sentence(text: str, start: int, end: int) -> tuple[int, int]:
    """Widen a flagged passage to whole sentences so the rewrite can restructure it naturally."""
    s = 0
    for m in _SENT_END.finditer(text, 0, start):
        s = m.end()
    while s < start and text[s].isspace():
        s += 1
    m = _SENT_END.search(text, max(end - 1, start))
    e = m.end() if m and not m.group(0).isspace() else (m.start() if m else len(text))
    return s, max(e, end)


def _today() -> str:
    return db.now()[:10]


def _ai_used(user) -> int:
    r = db.one("SELECT count FROM ai_usage WHERE user_id = ? AND day = ?", (user["id"], _today()))
    return r["count"] if r else 0


def _charge_ai(user):
    """Count one AI call against the user's daily allowance, or refuse."""
    if AI_DAILY_LIMIT and _ai_used(user) >= AI_DAILY_LIMIT:
        raise HTTPException(429, f"You've used today's {AI_DAILY_LIMIT} AI checks and rewrites. "
                                 "Rule-based checks still work; AI resets at midnight UTC.")
    db.execute("INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1) "
               "ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1", (user["id"], _today()))


def _refund_ai(user):
    db.execute("UPDATE ai_usage SET count = MAX(0, count - 1) WHERE user_id = ? AND day = ?", (user["id"], _today()))


def _merge(spans: list[dict]) -> list[dict]:
    out: list[dict] = []
    for sp in sorted(spans, key=lambda s: (s["start"], -s["end"])):
        if out and sp["start"] < out[-1]["end"]:
            out[-1]["end"] = max(out[-1]["end"], sp["end"])
            if sp.get("reason") and sp["reason"] not in out[-1]["reason"]:
                out[-1]["reason"] = (out[-1]["reason"] + " " + sp["reason"]).strip()
        else:
            out.append(dict(sp))
    return out


# ---------- accounts ----------
def _session(user_id: int, client: str) -> dict:
    token = issue_token(user_id, client)
    u = db.one("SELECT u.id, u.name, u.email, u.role, w.name AS workspace_name FROM users u "
               "JOIN workspaces w ON w.id = u.workspace_id WHERE u.id = ?", (user_id,))
    return {"token": token, "user": u}


def _email_free(email: str):
    if db.one("SELECT id FROM users WHERE email = ?", (email,)):
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")


@app.post("/api/auth/register")
def register(r: RegisterIn):
    """Anyone can sign up (with the signup code, if the server has one); they get their own workspace."""
    if SIGNUP_CODE and r.signup_code.strip() != SIGNUP_CODE:
        raise HTTPException(403, "This Style Desk is invite-only. Enter the signup code you were given.")
    _email_free(r.email)
    first = r.name.strip().split()[0]
    wid = db.execute("INSERT INTO workspaces (name, invite_code, created_at) VALUES (?, ?, ?)",
                     (f"{first}'s workspace", new_invite_code(), db.now()))
    uid = db.execute("INSERT INTO users (workspace_id, name, email, password_hash, role, created_at) "
                     "VALUES (?, ?, ?, ?, 'owner', ?)",
                     (wid, r.name.strip(), r.email, hash_password(r.password), db.now()))
    return _session(uid, r.client)


@app.post("/api/auth/join")
def join(j: JoinIn):
    """Join someone's team workspace (for example a newsroom) with their invite code."""
    w = db.one("SELECT id FROM workspaces WHERE invite_code = ?", (j.invite_code.strip().upper(),))
    if not w:
        raise HTTPException(404, "That invite code isn't valid. Ask for the current one.")
    _email_free(j.email)
    uid = db.execute("INSERT INTO users (workspace_id, name, email, password_hash, role, created_at) "
                     "VALUES (?, ?, ?, ?, 'member', ?)",
                     (w["id"], j.name.strip(), j.email, hash_password(j.password), db.now()))
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
    out = {k: user[k] for k in ("id", "name", "email", "role", "workspace_name")}
    out["ai_enabled"] = ai.available()
    out["ai_daily_limit"] = AI_DAILY_LIMIT
    out["ai_used_today"] = _ai_used(user)
    out["ai_provider"] = ai.provider()
    out["ai_model"] = ai.model_name()
    if user["role"] == "owner":
        out["invite_code"] = db.one("SELECT invite_code FROM workspaces WHERE id = ?", (user["workspace_id"],))["invite_code"]
    out["members"] = db.rows("SELECT id, name, email, role FROM users WHERE workspace_id = ? ORDER BY role DESC, name",
                             (user["workspace_id"],))
    return out


@app.post("/api/workspace/invite/rotate")
def rotate_invite(user=Depends(owner)):
    code = new_invite_code()
    db.execute("UPDATE workspaces SET invite_code = ? WHERE id = ?", (code, user["workspace_id"]))
    return {"invite_code": code}


@app.patch("/api/workspace")
def rename_workspace(body: VoicePatch, user=Depends(owner)):
    if body.name:
        db.execute("UPDATE workspaces SET name = ? WHERE id = ?", (body.name.strip(), user["workspace_id"]))
    return {"ok": True}


# ---------- voices ----------
@app.get("/api/voices")
def list_voices(user=Depends(current_user)):
    vs = db.rows("SELECT * FROM voices WHERE workspace_id = ? ORDER BY name COLLATE NOCASE", (user["workspace_id"],))
    for v in vs:
        v["stats"] = json.loads(v["stats"]) if v["stats"] else None
        v["profile"] = json.loads(v["profile"]) if v["profile"] else None
    return [_voice_summary(v) for v in vs]


@app.post("/api/voices")
def create_voice(body: VoiceIn, user=Depends(current_user)):
    vid = db.execute("INSERT INTO voices (workspace_id, created_by, name, description, created_at) VALUES (?,?,?,?,?)",
                     (user["workspace_id"], user["id"], body.name.strip(), body.description.strip(), db.now()))
    return {"id": vid}


@app.get("/api/voices/{vid}")
def get_voice(vid: int, user=Depends(current_user)):
    v = _voice(vid, user)
    out = _voice_summary(v)
    out.update(stats=v["stats"], profile=v["profile"], profile_updated_at=v["profile_updated_at"],
               can_edit=user["role"] == "owner" or v["created_by"] == user["id"])
    return out


@app.patch("/api/voices/{vid}")
def update_voice(vid: int, body: VoicePatch, user=Depends(current_user)):
    _voice(vid, user, write=True)
    if body.name is not None:
        db.execute("UPDATE voices SET name = ? WHERE id = ?", (body.name.strip(), vid))
    if body.description is not None:
        db.execute("UPDATE voices SET description = ? WHERE id = ?", (body.description.strip(), vid))
    return {"ok": True}


@app.delete("/api/voices/{vid}")
def delete_voice(vid: int, user=Depends(current_user)):
    _voice(vid, user, write=True)
    db.execute("DELETE FROM voices WHERE id = ?", (vid,))
    return {"ok": True}


# ---------- training ----------
@app.get("/api/voices/{vid}/samples")
def list_samples(vid: int, user=Depends(current_user)):
    _voice(vid, user)
    return db.rows("SELECT id, title, substr(body, 1, 160) AS preview, length(body) AS chars, created_at "
                   "FROM samples WHERE voice_id = ? ORDER BY id DESC", (vid,))


@app.post("/api/voices/{vid}/samples")
def add_samples(vid: int, items: list[SampleIn], user=Depends(current_user)):
    _voice(vid, user, write=True)
    for s in items:
        db.execute("INSERT INTO samples (voice_id, title, body, created_at) VALUES (?, ?, ?, ?)",
                   (vid, s.title.strip(), s.body.strip(), db.now()))
    _relearn(vid)
    return {"added": len(items)}


@app.post("/api/voices/{vid}/samples/upload")
async def upload_samples(vid: int, files: list[UploadFile] = File(...), user=Depends(current_user)):
    """Each .txt/.md file is one sample; a short first line followed by a blank line is treated as its title."""
    _voice(vid, user, write=True)
    added = 0
    for f in files:
        raw = (await f.read()).decode("utf-8", errors="replace").strip()
        if not raw:
            continue
        head, _, rest = raw.partition("\n")
        if rest.strip() and len(head) <= 150 and not head.rstrip().endswith((".", "?", "!")):
            title, body = head.lstrip("# ").strip(), rest.strip()
        else:
            title, body = "", raw
        db.execute("INSERT INTO samples (voice_id, title, body, created_at) VALUES (?, ?, ?, ?)",
                   (vid, title, body, db.now()))
        added += 1
    _relearn(vid)
    return {"added": added}


@app.delete("/api/voices/{vid}/samples/{sid}")
def delete_sample(vid: int, sid: int, user=Depends(current_user)):
    _voice(vid, user, write=True)
    db.execute("DELETE FROM samples WHERE id = ? AND voice_id = ?", (sid, vid))
    _relearn(vid)
    return {"ok": True}


@app.get("/api/voices/{vid}/rules")
def list_rules(vid: int, user=Depends(current_user)):
    _voice(vid, user)
    return _rules(vid)


@app.post("/api/voices/{vid}/rules")
def add_rule(vid: int, r: RuleIn, user=Depends(current_user)):
    _voice(vid, user, write=True)
    if r.kind in ("prefer", "ban") and not r.term.strip():
        raise HTTPException(400, "A word or phrase is required.")
    if r.kind == "prefer" and not r.replacement.strip():
        raise HTTPException(400, "Say what to use instead.")
    if r.kind == "note" and not r.reason.strip():
        raise HTTPException(400, "Write the note.")
    rid = db.execute(
        "INSERT INTO rules (voice_id, kind, term, replacement, reason, case_sensitive, created_at) VALUES (?,?,?,?,?,?,?)",
        (vid, r.kind, r.term.strip(), r.replacement.strip(), r.reason.strip(), int(r.case_sensitive), db.now()))
    return {"id": rid}


@app.delete("/api/voices/{vid}/rules/{rid}")
def delete_rule(vid: int, rid: int, user=Depends(current_user)):
    _voice(vid, user, write=True)
    db.execute("DELETE FROM rules WHERE id = ? AND voice_id = ?", (rid, vid))
    return {"ok": True}


@app.post("/api/voices/{vid}/learn")
def learn_profile(vid: int, user=Depends(current_user)):
    """Have Claude read the samples and describe the voice (tone, rhythm, word choice...)."""
    _voice(vid, user, write=True)
    samples = _samples(vid)
    if not samples:
        raise HTTPException(400, "Add some writing samples first.")
    stats = _relearn(vid)
    _charge_ai(user)
    try:
        profile, used = ai.distill_profile(samples, stats, _rules(vid))
    except ai.AIUnavailable as e:
        _refund_ai(user)
        raise HTTPException(503, str(e))
    db.execute("UPDATE voices SET profile = ?, profile_updated_at = ? WHERE id = ?",
               (profile.model_dump_json(), db.now(), vid))
    return {"profile": profile.model_dump(), "samples_used": used}


@app.put("/api/voices/{vid}/profile")
def save_profile(vid: int, body: ProfileIn, user=Depends(current_user)):
    """Let the writer correct the learned description of their voice."""
    _voice(vid, user, write=True)
    db.execute("UPDATE voices SET profile = ?, profile_updated_at = ? WHERE id = ?",
               (body.profile.model_dump_json(), db.now(), vid))
    return {"ok": True}


# ---------- check & rewrite (all clients) ----------
@app.post("/api/check")
def check_text(payload: CheckIn, user=Depends(current_user)):
    """Check any text against a voice. Fast rules by default; use_ai adds a tone/voice review."""
    v = _voice(payload.voice_id, user)
    text, stats, rules = payload.text, v["stats"], _rules(v["id"])
    issues = (checker.check_headline(payload.title, stats) if payload.title else []) + \
        checker.check(payload.title, text, stats, rules)
    fp, differences = checker.compare(text, stats)
    report = {
        "voice": {"id": v["id"], "name": v["name"], "sample_count": (stats or {}).get("sample_count", 0),
                  "word_count": (stats or {}).get("word_count", 0)},
        "fingerprint": fp, "differences": differences, "ai": None, "ai_error": None,
    }
    if payload.use_ai and ai.available():
        _charge_ai(user)
    if payload.use_ai:
        try:
            r = ai.review(v["name"], text, v["profile"], stats, rules, _samples(v["id"]))
            report["ai"] = {"match_score": max(0, min(100, r.match_score)), "summary": r.summary}
            taken: list[tuple[int, int]] = []
            for it in r.issues:
                start, end = _locate(text, it.quote, taken)
                if start is not None:
                    taken.append((start, end))
                issues.append({"source": "ai", "category": it.category, "severity": it.severity,
                               "start": start, "end": end, "excerpt": it.quote, "message": it.explanation,
                               "replacement": None})
        except ai.AIUnavailable as e:
            if ai.available():
                _refund_ai(user)
            report["ai_error"] = str(e)
    issues.sort(key=lambda x: (x["start"] is None, x["start"] or 0))
    for i, it in enumerate(issues):
        it["id"] = i
        it["rewritable"] = it["start"] is not None
    report["issues"] = issues
    report["counts"] = {s: sum(1 for it in issues if it["severity"] == s) for s in ("error", "warning", "suggestion")}
    report["match_score"] = report["ai"]["match_score"] if report["ai"] else \
        checker.heuristic_match(issues, differences, fp["words"])
    report["match_source"] = "ai" if report["ai"] else "estimate"
    return report


@app.post("/api/rewrite")
def rewrite(payload: RewriteIn, user=Depends(current_user)):
    """Rewrite flagged passages (mode=spans) or the whole text (mode=all) in the voice."""
    v = _voice(payload.voice_id, user)
    text = payload.text
    args = (v["name"], v["profile"], v["stats"], _rules(v["id"]), _samples(v["id"]))
    if not args[4] and not args[1]:
        raise HTTPException(400, "Train this voice with some writing samples first.")
    if not ai.available():
        raise HTTPException(503, "AI features need an API key on the server (OPENAI_API_KEY or ANTHROPIC_API_KEY).")
    if payload.mode == "spans" and not any(s.end <= len(text) and s.start < s.end for s in payload.spans):
        raise HTTPException(400, "Nothing to rewrite.")
    _charge_ai(user)
    try:
        if payload.mode == "all":
            new = ai.rewrite_all(v["name"], text, *args[1:], add_prompts=payload.add_prompts)
            return {"text": new, "changes": [{"start": 0, "end": len(new), "original_start": 0,
                                              "original_end": len(text), "original": text, "rewrite": new}]}
        spans = [s.model_dump() for s in payload.spans if s.end <= len(text) and s.start < s.end]
        if not spans:
            raise HTTPException(400, "Nothing to rewrite.")
        for sp in spans:
            sp["start"], sp["end"] = _to_sentence(text, sp["start"], sp["end"])
        spans = _merge(spans)[:MAX_SPANS]
        for i, sp in enumerate(spans):
            sp["id"] = i + 1
        rewrites = ai.rewrite_spans(v["name"], text, spans, *args[1:])
    except ai.AIUnavailable as e:
        _refund_ai(user)
        raise HTTPException(503, str(e))
    out, pos, changes = [], 0, []
    for sp in spans:
        new = rewrites.get(sp["id"])
        out.append(text[pos:sp["start"]])
        start_new = sum(len(x) for x in out)
        if new is None:
            out.append(text[sp["start"]:sp["end"]])
        else:
            out.append(new)
            changes.append({"start": start_new, "end": start_new + len(new),
                            "original_start": sp["start"], "original_end": sp["end"],
                            "original": text[sp["start"]:sp["end"]], "rewrite": new})
        pos = sp["end"]
    out.append(text[pos:])
    return {"text": "".join(out), "changes": changes}


# ---------- web app (installable PWA) ----------
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(os.path.join(STATIC, "manifest.webmanifest"), media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    return FileResponse(os.path.join(STATIC, "sw.js"), media_type="text/javascript")


@app.get("/api/config")
def public_config():
    """What the sign-in screen needs to know before anyone is signed in."""
    return {"signup_code_required": bool(SIGNUP_CODE)}


@app.get("/healthz")
def healthz():
    db.one("SELECT 1 AS ok")
    return {"ok": True}


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))
