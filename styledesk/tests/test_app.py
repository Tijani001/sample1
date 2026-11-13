import glob
import os

import pytest
from fastapi.testclient import TestClient

HERE = os.path.dirname(__file__)
SAMPLES = os.path.join(HERE, "..", "samples")


def _load(voice):
    out = []
    for f in sorted(glob.glob(os.path.join(SAMPLES, "voices", voice, "*.txt"))):
        title, _, body = open(f, encoding="utf-8").read().strip().partition("\n")
        out.append({"title": title, "body": body.strip()})
    return out


AI_DRAFT = open(os.path.join(SAMPLES, "ai-draft.txt"), encoding="utf-8").read().partition("\n")[2].strip()
BLOG_LIKE = ("I tried a new coffee place this week. It's tiny. Four tables, one guy behind the counter. "
             "I'm not sure why I liked it so much. Maybe it was the quiet. Maybe it was the cake. "
             "Either way, I've been back three times now and I don't regret a single visit. "
             "Will it last? Probably not. But I'm enjoying it while it does.")


def _signup(app, email, name="Ada Writer"):
    c = TestClient(app)
    r = c.post("/api/auth/register", json={"name": name, "email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    c.headers["Authorization"] = "Bearer " + r.json()["token"]
    return c


@pytest.fixture()
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("STYLEDESK_DB", str(tmp_path / "t.db"))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("STYLEDESK_AI_PROVIDER", raising=False)
    import importlib

    from app import db, main
    importlib.reload(db)
    importlib.reload(main)
    return main.app


@pytest.fixture()
def client(app):
    return _signup(app, "ada@example.com")


def _voice(client, name="My blog", samples="personal-blog"):
    vid = client.post("/api/voices", json={"name": name}).json()["id"]
    if samples:
        client.post(f"/api/voices/{vid}/samples", json=_load(samples))
    return vid


# ---------- learning ----------
def test_learner_fingerprint_separates_human_and_ai_text():
    from app import learner
    blog = learner.learn(_load("personal-blog"))
    fp_ai = learner.fingerprint(AI_DRAFT)
    assert blog["fingerprint"]["em_dashes_per_1kw"] == 0
    assert blog["fingerprint"]["first_person_per_100w"] > 5
    assert fp_ai["em_dashes_per_1kw"] > 5
    assert fp_ai["sentence_words_avg"] > blog["fingerprint"]["sentence_words_avg"] * 1.5


def test_learner_keeps_news_habits():
    from app import learner
    p = learner.learn(_load("news-reporting"))["preferences"]
    assert p["percent"]["preferred"] == "per cent"
    assert p["honorific_period"]["preferred"] == "Mr"


def test_learner_does_not_invent_preferences_from_mixed_evidence():
    from app import learner
    arts = [{"title": "", "body": "Rates rose 5 percent. Costs rose 6 per cent. Pay rose 7 percent. Tax rose 8 per cent."}]
    assert "percent" not in learner.learn(arts)["preferences"]


# ---------- checking ----------
def test_ai_draft_scores_low_and_is_flagged(client):
    vid = _voice(client)
    r = client.post("/api/check", json={"voice_id": vid, "text": AI_DRAFT}).json()
    cats = {i["category"] for i in r["issues"]}
    assert {"Sounds like AI", "Punctuation", "Tone"} <= cats
    assert {d["aspect"] for d in r["differences"]} >= {"Sentence length", "Point of view", "Punctuation"}
    assert r["match_score"] < 40 and r["match_source"] == "estimate"
    for i in r["issues"]:
        if i["start"] is not None:
            assert AI_DRAFT[i["start"]:i["end"]] == i["excerpt"]


def test_writing_in_the_voice_scores_high(client):
    vid = _voice(client)
    r = client.post("/api/check", json={"voice_id": vid, "text": BLOG_LIKE}).json()
    assert r["differences"] == []
    assert r["match_score"] >= 80


def test_writers_own_ai_words_are_not_flagged(client):
    vid = _voice(client, samples=None)
    body = "Furthermore, I delve into gardening every weekend. " * 40
    client.post(f"/api/voices/{vid}/samples", json=[{"title": "", "body": body}])
    r = client.post("/api/check", json={"voice_id": vid, "text": "Furthermore, we delve into it."}).json()
    assert not [i for i in r["issues"] if i["category"] == "Sounds like AI"]


def test_rules_apply(client):
    vid = _voice(client)
    client.post(f"/api/voices/{vid}/rules", json={"kind": "prefer", "term": "utilize", "replacement": "use"})
    r = client.post("/api/check", json={"voice_id": vid, "text": "We utilize this daily."}).json()
    rule = next(i for i in r["issues"] if i["category"] == "Your rule")
    assert rule["replacement"] == "use" and rule["excerpt"] == "utilize"


def test_ai_review_issues_are_located(client, monkeypatch):
    from app import ai
    vid = _voice(client)
    fake = ai.Review(match_score=22, summary="Formal and generic.", issues=[
        ai.ReviewIssue(category="Tone", severity="warning", quote="easy to overlook", explanation="Too formal."),
    ])
    monkeypatch.setattr(ai, "review", lambda *a, **k: fake)
    r = client.post("/api/check", json={"voice_id": vid, "text": AI_DRAFT, "use_ai": True}).json()
    it = next(i for i in r["issues"] if i["source"] == "ai")
    assert AI_DRAFT[it["start"]:it["end"]] == "easy to overlook" and it["rewritable"]
    assert r["match_score"] == 22 and r["match_source"] == "ai"


# ---------- rewriting ----------
def test_rewrite_spans_merges_overlaps_and_splices(client, monkeypatch):
    from app import ai
    vid = _voice(client)
    seen = {}

    def fake(name, text, spans, *rest):
        seen["spans"] = spans
        return {sp["id"]: f"<{sp['id']}>" for sp in spans}

    monkeypatch.setattr(ai, "rewrite_spans", fake)
    text = "Alpha beta gamma. Delta epsilon."
    r = client.post("/api/rewrite", json={"voice_id": vid, "text": text, "spans": [
        {"start": 0, "end": 10, "reason": "a"}, {"start": 6, "end": 16, "reason": "b"}, {"start": 18, "end": 23}]}).json()
    # Flagged words are widened to whole sentences, then overlapping passages are merged.
    assert [(s["start"], s["end"]) for s in seen["spans"]] == [(0, 17), (18, 32)]
    assert r["text"] == "<1> <2>"
    for ch in r["changes"]:
        assert r["text"][ch["start"]:ch["end"]] == ch["rewrite"]
        assert text[ch["original_start"]:ch["original_end"]] == ch["original"]
    assert [c["original"] for c in r["changes"]] == ["Alpha beta gamma.", "Delta epsilon."]


def test_sentence_widening_respects_paragraphs():
    from app.main import _to_sentence
    text = "First one. Second has delve in it! Third.\n\nNew para word here"
    i = text.index("delve")
    assert text[slice(*_to_sentence(text, i, i + 5))] == "Second has delve in it!"
    j = text.index("word")
    assert text[slice(*_to_sentence(text, j, j + 4))] == "New para word here"


def test_rewrite_all_and_errors(client, monkeypatch):
    from app import ai
    vid = _voice(client)
    assert client.post("/api/rewrite", json={"voice_id": vid, "text": "Hi there.", "mode": "all"}).status_code == 503
    monkeypatch.setattr(ai, "rewrite_all", lambda name, text, *a, **k: "Hey.")
    assert client.post("/api/rewrite", json={"voice_id": vid, "text": "Hi there.", "mode": "all"}).json()["text"] == "Hey."
    empty = _voice(client, "Empty", samples=None)
    assert client.post("/api/rewrite", json={"voice_id": empty, "text": "Hi.", "mode": "all"}).status_code == 400


# ---------- accounts & sharing ----------
def test_auth_required_and_login(app, client):
    anon = TestClient(app)
    assert anon.post("/api/check", json={"voice_id": 1, "text": "x"}).status_code == 401
    assert anon.post("/api/auth/login", json={"email": "ada@example.com", "password": "nope-nope"}).status_code == 401
    ok = anon.post("/api/auth/login", json={"email": "ADA@example.com", "password": "password123", "client": "chrome-extension"})
    assert ok.status_code == 200 and ok.json()["user"]["role"] == "owner"
    assert client.post("/api/auth/register", json={"name": "X", "email": "ada@example.com", "password": "password123"}).status_code == 409


def test_workspaces_are_private(app, client):
    vid = _voice(client)
    other = _signup(app, "bob@example.com", "Bob")
    assert other.get("/api/voices").json() == []
    assert other.post("/api/check", json={"voice_id": vid, "text": "Hello there."}).status_code == 404
    assert other.get(f"/api/voices/{vid}/samples").status_code == 404


def test_team_members_share_voices_but_cannot_edit_others(app, client):
    vid = _voice(client, "House style", "news-reporting")
    code = client.get("/api/me").json()["invite_code"]
    m = TestClient(app)
    tok = m.post("/api/auth/join", json={"invite_code": code, "name": "Sam", "email": "sam@example.com",
                                         "password": "password123"}).json()["token"]
    m.headers["Authorization"] = "Bearer " + tok
    assert [v["name"] for v in m.get("/api/voices").json()] == ["House style"]
    assert m.post("/api/check", json={"voice_id": vid, "text": "Rents rose 4 percent."}).status_code == 200
    assert m.post(f"/api/voices/{vid}/samples", json=[{"body": "x"}]).status_code == 403
    assert m.delete(f"/api/voices/{vid}").status_code == 403
    assert m.post("/api/workspace/invite/rotate").status_code == 403
    own = m.post("/api/voices", json={"name": "Sam's notes"}).json()["id"]
    assert m.post(f"/api/voices/{own}/samples", json=[{"body": "My own words here."}]).status_code == 200
    assert client.delete(f"/api/voices/{own}").status_code == 200  # owner can manage everything


def test_logout_revokes_token(client):
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/me").status_code == 401


def test_ai_provider_selection(monkeypatch):
    from app import ai
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "STYLEDESK_AI_PROVIDER"):
        monkeypatch.delenv(k, raising=False)
    assert ai.provider() is None and not ai.available()
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert ai.provider() == "openai" and ai.model_name() == ai.OPENAI_MODEL
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    assert ai.provider() == "anthropic"
    monkeypatch.setenv("STYLEDESK_AI_PROVIDER", "openai")
    assert ai.provider() == "openai"
    monkeypatch.delenv("OPENAI_API_KEY")
    assert ai.provider() is None  # explicitly chosen provider without its key
