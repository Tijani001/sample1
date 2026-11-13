import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone


def db_path() -> str:
    return os.environ.get("NEWSROOM_DB", os.path.join(os.path.dirname(__file__), "..", "newsroom.db"))


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS newsrooms (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    newsroom_id INTEGER NOT NULL REFERENCES newsrooms(id),
    name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('editor', 'reporter')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client TEXT, created_at TEXT NOT NULL, last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY, newsroom_id INTEGER NOT NULL REFERENCES newsrooms(id),
    title TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS house_rules (
    id INTEGER PRIMARY KEY, newsroom_id INTEGER NOT NULL REFERENCES newsrooms(id),
    kind TEXT NOT NULL CHECK (kind IN ('prefer', 'ban', 'note')),
    term TEXT, replacement TEXT, reason TEXT,
    case_sensitive INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
    newsroom_id INTEGER PRIMARY KEY REFERENCES newsrooms(id),
    stats TEXT, guide TEXT, stats_updated_at TEXT, guide_updated_at TEXT
);
CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY, newsroom_id INTEGER NOT NULL REFERENCES newsrooms(id),
    reporter_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL, byline TEXT, body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'needs changes', 'approved')),
    report TEXT, editor_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_newsroom ON articles(newsroom_id);
CREATE INDEX IF NOT EXISTS idx_rules_newsroom ON house_rules(newsroom_id);
CREATE INDEX IF NOT EXISTS idx_submissions_newsroom ON submissions(newsroom_id, status);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def conn():
    c = sqlite3.connect(db_path())
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init():
    with conn() as c:
        c.executescript(SCHEMA)


def rows(sql, params=()):
    with conn() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def one(sql, params=()):
    r = rows(sql, params)
    return r[0] if r else None


def execute(sql, params=()):
    with conn() as c:
        return c.execute(sql, params).lastrowid


def get_profile(newsroom_id: int) -> dict:
    r = one("SELECT * FROM profiles WHERE newsroom_id = ?", (newsroom_id,)) or {}
    return {
        "stats": json.loads(r["stats"]) if r.get("stats") else None,
        "guide": json.loads(r["guide"]) if r.get("guide") else None,
        "stats_updated_at": r.get("stats_updated_at"),
        "guide_updated_at": r.get("guide_updated_at"),
    }


def save_profile(newsroom_id: int, **fields):
    execute("INSERT OR IGNORE INTO profiles (newsroom_id) VALUES (?)", (newsroom_id,))
    sets = ", ".join(f"{k} = ?" for k in fields)
    execute(f"UPDATE profiles SET {sets} WHERE newsroom_id = ?", (*fields.values(), newsroom_id))
