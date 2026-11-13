import glob
import os

import pytest
from fastapi.testclient import TestClient

HERE = os.path.dirname(__file__)
ARCHIVE = sorted(glob.glob(os.path.join(HERE, "..", "samples", "archive", "*.txt")))

OFF_STYLE = (
    "The mayor has unveiled a cycling strategy. Cycling rose 12 percent last year, "
    "the organization behind it says.\n\n\"We are committed,\" Mrs. Haddad says over the the phone."
)


def _load_archive():
    out = []
    for f in ARCHIVE:
        title, _, body = open(f, encoding="utf-8").read().strip().partition("\n")
        out.append({"title": title, "body": body.strip()})
    return out


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NEWSROOM_DB", str(tmp_path / "t.db"))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    import importlib

    from app import db, main
    importlib.reload(db)
    importlib.reload(main)
    c = TestClient(main.app)
    r = c.post("/api/auth/register", json={"newsroom_name": "Daily Test", "name": "Ed Itor",
                                           "email": "ed@example.com", "password": "password123"})
    c.headers["Authorization"] = "Bearer " + r.json()["token"]
    return c


def _reporter(client, email="rep@example.com"):
    code = client.get("/api/me").json()["invite_code"]
    from fastapi.testclient import TestClient as TC
    rc = TC(client.app)
    r = rc.post("/api/auth/join", json={"invite_code": code, "name": "Rep", "email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    rc.headers["Authorization"] = "Bearer " + r.json()["token"]
    return rc


def test_learner_picks_up_house_preferences():
    from app import learner
    p = learner.learn(_load_archive())
    prefs = p["preferences"]
    assert prefs["percent"]["preferred"] == "per cent"
    assert prefs["attribution"]["preferred"] == "said"
    assert prefs["honorific_period"]["preferred"] == "Mr"
    assert prefs["headline_case"]["preferred"] == "sentence case"
    assert p["spelling_map"].get("organization") == "organisation"


def test_learner_does_not_invent_preferences_from_mixed_evidence():
    from app import learner
    arts = [{"title": "", "body": "Rates rose 5 percent. Costs rose 6 per cent. Pay rose 7 percent. Tax rose 8 per cent."}]
    assert "percent" not in learner.learn(arts)["preferences"]


def test_check_flags_off_style_story(client):
    client.post("/api/articles", json=_load_archive())
    client.post("/api/rules", json={"kind": "ban", "term": "unveiled", "replacement": "announced"})
    r = client.post("/api/check", json={"title": "Mayor Unveils Cycling Plan For City", "body": OFF_STYLE, "use_ai": True}).json()
    cats = {i["category"] for i in r["issues"]}
    assert {"Percent style", "Attribution verb tense", "Spelling", "Honorific punctuation",
            "House rule", "Repeated word", "Headline"} <= cats
    for i in r["issues"]:
        if i["start"] is not None:
            assert OFF_STYLE[i["start"]:i["end"]] == i["excerpt"]
    assert "ANTHROPIC_API_KEY" in r["ai_error"]


def test_clean_story_has_no_learned_warnings(client):
    client.post("/api/articles", json=_load_archive())
    body = "The council approved the plan on Monday.\n\nRents will rise by 3 per cent, Ms Okafor said."
    r = client.post("/api/check", json={"title": "Council approves housing plan", "body": body, "use_ai": False}).json()
    assert r["counts"] == {"error": 0, "warning": 0, "suggestion": 0}


def test_submission_workflow(client):
    client.post("/api/articles", json=_load_archive())
    rep = _reporter(client)
    sid = rep.post("/api/submissions", json={"title": "Test story", "byline": "A Reporter", "body": OFF_STYLE, "use_ai": False}).json()["id"]
    queue = client.get("/api/submissions?status=submitted").json()
    assert [s["id"] for s in queue] == [sid]
    assert client.post(f"/api/submissions/{sid}/promote").status_code == 400
    client.post(f"/api/submissions/{sid}/decision", json={"status": "approved", "editor_note": "Fine"})
    assert client.get(f"/api/submissions/{sid}").json()["status"] == "approved"
    before = client.get("/api/status").json()["article_count"]
    client.post(f"/api/submissions/{sid}/promote")
    assert client.get("/api/status").json()["article_count"] == before + 1


def test_ai_review_issues_are_located(client, monkeypatch):
    from app import ai

    fake = ai.Review(readiness="minor edits", summary="Tighten the intro.", issues=[
        ai.AIIssue(category="Lede", severity="warning", quote="unveiled a cycling strategy",
                   explanation="Journalese.", suggestion="announced a cycling plan"),
    ])
    monkeypatch.setattr(ai, "review", lambda *a, **k: fake)
    r = client.post("/api/check", json={"title": "T", "body": OFF_STYLE, "use_ai": True}).json()
    ai_issue = next(i for i in r["issues"] if i["source"] == "ai")
    assert OFF_STYLE[ai_issue["start"]:ai_issue["end"]] == "unveiled a cycling strategy"
    assert r["ai"]["readiness"] == "minor edits"


def test_learn_guide_requires_key(client):
    client.post("/api/articles", json=_load_archive())
    r = client.post("/api/profile/learn")
    assert r.status_code == 503


def test_auth_required_and_wrong_password(client):
    from fastapi.testclient import TestClient as TC
    anon = TC(client.app)
    assert anon.post("/api/check", json={"body": "x"}).status_code == 401
    assert anon.post("/api/auth/login", json={"email": "ed@example.com", "password": "nope-nope"}).status_code == 401
    ok = anon.post("/api/auth/login", json={"email": "ED@example.com", "password": "password123", "client": "extension"})
    assert ok.status_code == 200 and ok.json()["user"]["role"] == "editor"


def test_reporter_permissions(client):
    rep = _reporter(client)
    assert rep.post("/api/articles", json=[{"title": "x", "body": "y"}]).status_code == 403
    assert rep.post("/api/rules", json={"kind": "ban", "term": "x"}).status_code == 403
    sid = rep.post("/api/submissions", json={"title": "Mine", "body": "Text.", "use_ai": False}).json()["id"]
    assert rep.post(f"/api/submissions/{sid}/decision", json={"status": "approved"}).status_code == 403
    other = _reporter(client, "rep2@example.com")
    assert other.get(f"/api/submissions/{sid}").status_code == 404
    assert other.get("/api/submissions").json() == []
    assert [s["id"] for s in client.get("/api/submissions").json()] == [sid]


def test_newsrooms_are_isolated(client):
    from fastapi.testclient import TestClient as TC
    client.post("/api/articles", json=_load_archive())
    client.post("/api/rules", json={"kind": "ban", "term": "unveiled"})
    other = TC(client.app)
    tok = other.post("/api/auth/register", json={"newsroom_name": "Other Paper", "name": "B",
                                                 "email": "b@example.com", "password": "password123"}).json()["token"]
    other.headers["Authorization"] = "Bearer " + tok
    assert other.get("/api/status").json()["article_count"] == 0
    r = other.post("/api/check", json={"body": "The mayor unveiled a plan, she says."}).json()
    assert r["issues"] == []


def test_logout_revokes_token(client):
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/me").status_code == 401
