import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone


def db_path() -> str:
    return os.environ.get("STYLEDESK_DB", os.path.join(os.path.dirname(__file__), "..", "styledesk.db"))


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client TEXT, created_at TEXT NOT NULL, last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS voices (
    id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    stats TEXT, profile TEXT, stats_updated_at TEXT, profile_updated_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY, voice_id INTEGER NOT NULL REFERENCES voices(id) ON DELETE CASCADE,
    title TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY, voice_id INTEGER NOT NULL REFERENCES voices(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('prefer', 'ban', 'note')),
    term TEXT, replacement TEXT, reason TEXT,
    case_sensitive INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voices_workspace ON voices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_samples_voice ON samples(voice_id);
CREATE INDEX IF NOT EXISTS idx_rules_voice ON rules(voice_id);
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


