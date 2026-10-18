-- DDI initial schema. Applied once; never edited afterwards (add new migrations instead).
-- All timestamps are ISO8601 UTC strings with a Z suffix, e.g. 2026-10-18T12:34:56.789Z,
-- EXCEPT score_snapshots.taken_at (see 0002_snapshots.sql).

CREATE TABLE accounts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id          INTEGER NOT NULL UNIQUE,
  login              TEXT    NOT NULL,
  name               TEXT,
  avatar_url         TEXT,
  github_created_at  TEXT    NOT NULL,
  created_at         TEXT    NOT NULL,
  last_login_at      TEXT    NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_account ON sessions(account_id);

CREATE TABLE models (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  provider     TEXT    NOT NULL,
  description  TEXT,
  homepage_url TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);

CREATE TABLE votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  model_id    INTEGER NOT NULL REFERENCES models(id),
  value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at  TEXT    NOT NULL
);
CREATE INDEX idx_votes_account_model ON votes(account_id, model_id, created_at DESC);
CREATE INDEX idx_votes_model_time    ON votes(model_id, created_at);
CREATE INDEX idx_votes_time          ON votes(created_at);

-- Read fast-path. Source of truth is `votes`; rebuild with POST /api/admin/rescore.
CREATE TABLE model_scores (
  model_id    INTEGER PRIMARY KEY REFERENCES models(id),
  net         REAL NOT NULL DEFAULT 0,
  weight      REAL NOT NULL DEFAULT 0,
  up          INTEGER NOT NULL DEFAULT 0,
  down        INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL
);
