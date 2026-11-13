"""Accounts, workspaces and bearer tokens shared by every client (web, extension, apps)."""
from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import Depends, Header, HTTPException

from . import db


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return hmac.compare_digest(digest.hex(), digest_hex)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_token(user_id: int, client: str) -> str:
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO tokens (token_hash, user_id, client, created_at) VALUES (?, ?, ?, ?)",
               (_token_hash(token), user_id, client[:40], db.now()))
    return token


def revoke_token(token: str):
    db.execute("DELETE FROM tokens WHERE token_hash = ?", (_token_hash(token),))


def new_invite_code() -> str:
    return secrets.token_urlsafe(6).replace("-", "x").replace("_", "y").upper()


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in required.")
    return authorization[7:].strip()


def current_user(authorization: str | None = Header(default=None)) -> dict:
    token = _bearer(authorization)
    user = db.one(
        "SELECT u.id, u.name, u.email, u.role, u.workspace_id, w.name AS workspace_name "
        "FROM tokens t JOIN users u ON u.id = t.user_id JOIN workspaces w ON w.id = u.workspace_id "
        "WHERE t.token_hash = ?", (_token_hash(token),))
    if not user:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    db.execute("UPDATE tokens SET last_used_at = ? WHERE token_hash = ?", (db.now(), _token_hash(token)))
    user["token"] = token
    return user


def owner(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "owner":
        raise HTTPException(403, "Only the workspace owner can do this.")
    return user
