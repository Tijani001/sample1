import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.environ.get("NEWSROOM_DB", os.path.join(os.path.dirname(__file__), "..", "newsroom.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY, title TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS house_rules (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('prefer', 'ban', 'note')),
    term TEXT, replacement TEXT, reason TEXT,
    case_sensitive INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    stats TEXT, guide TEXT, stats_updated_at TEXT, guide_updated_at TEXT
);
CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, byline TEXT, body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'needs changes', 'approved')),
    report TEXT, editor_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init():
    with conn() as c:
        c.executescript(SCHEMA)
        c.execute("INSERT OR IGNORE INTO profile (id) VALUES (1)")


def rows(sql, params=()):
    with conn() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def execute(sql, params=()):
    with conn() as c:
        cur = c.execute(sql, params)
        return cur.lastrowid


def get_profile():
    r = rows("SELECT * FROM profile WHERE id = 1")[0]
    return {
        "stats": json.loads(r["stats"]) if r["stats"] else None,
        "guide": json.loads(r["guide"]) if r["guide"] else None,
        "stats_updated_at": r["stats_updated_at"],
        "guide_updated_at": r["guide_updated_at"],
    }
