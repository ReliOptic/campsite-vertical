-- Campsite Core schema (SQLite / Cloudflare D1). R6.0.
-- All timestamps are ISO-8601 UTC strings. Ownership is always checked through workspace_id.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id, expires_at);

-- One workspace per account. runtime_id names the account's WorkspaceRuntime (Durable Object id / local runtime key).
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  runtime_id TEXT NOT NULL UNIQUE,
  r2_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entitlements (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
  plan TEXT NOT NULL CHECK (plan IN ('free','plus','pro')),
  updated_at TEXT NOT NULL
);

-- User-owned model connection (BYOK). key_ciphertext = base64(iv||AES-GCM(key)); never returned to clients.
CREATE TABLE IF NOT EXISTS model_connections (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
  provider TEXT NOT NULL CHECK (provider IN ('openrouter')),
  model_id TEXT NOT NULL,
  key_ciphertext TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  verified_at TEXT,
  connected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  interval_min INTEGER,
  schedule_enabled INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT,
  last_run_at TEXT,
  origin_channel_id TEXT,
  origin_workspace_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS channels_workspace ON channels(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS channels_due ON channels(schedule_enabled, next_run_at);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  prompt TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('initial','manual','scheduled','fork')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','CLAIMED','RUNNING','VALIDATING','READY','FAILED','SKIPPED')),
  phase TEXT NOT NULL CHECK (phase IN ('QUEUED','SEARCHING','DRAFTING','VERIFYING','DONE')),
  attempt INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL,
  node_id TEXT,
  lease_until TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  fail_code TEXT,
  vista_id TEXT,
  schedule_slot TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_queue ON runs(status, priority, created_at);
CREATE INDEX IF NOT EXISTS runs_lease ON runs(node_id, lease_until);
CREATE INDEX IF NOT EXISTS runs_channel ON runs(channel_id, created_at);
-- One scheduled run per channel per slot, so duplicate scheduler ticks cannot enqueue twice.
CREATE UNIQUE INDEX IF NOT EXISTS runs_schedule_slot ON runs(channel_id, schedule_slot) WHERE schedule_slot IS NOT NULL;

CREATE TABLE IF NOT EXISTS runner_nodes (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  version TEXT,
  host_cpus REAL,
  host_mem_mb REAL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS staged_files (
  run_id TEXT NOT NULL REFERENCES runs(id),
  attempt INTEGER NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  PRIMARY KEY (run_id, attempt, path)
);

CREATE TABLE IF NOT EXISTS vistas (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  latest_revision_id TEXT NOT NULL,
  access_version INTEGER NOT NULL DEFAULT 1,
  origin_vista_id TEXT,
  origin_channel_id TEXT,
  origin_workspace_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vistas_channel ON vistas(channel_id, created_at);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  vista_id TEXT NOT NULL REFERENCES vistas(id),
  run_id TEXT UNIQUE,
  manifest_json TEXT NOT NULL,
  artifact_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feed_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  vista_id TEXT NOT NULL REFERENCES vistas(id),
  revision_id TEXT NOT NULL UNIQUE REFERENCES revisions(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feed_workspace ON feed_entries(workspace_id, created_at, id);

-- Explicit publication of one Vista to Discovery. Unpublish deletes the row and bumps vistas.access_version.
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  vista_id TEXT NOT NULL UNIQUE REFERENCES vistas(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  revision_id TEXT NOT NULL REFERENCES revisions(id),
  published_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publications_recent ON publications(published_at, id);

CREATE TABLE IF NOT EXISTS subscriptions (
  subscriber_workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  subscribed_at TEXT NOT NULL,
  PRIMARY KEY (subscriber_workspace_id, channel_id)
);

CREATE TABLE IF NOT EXISTS forks (
  id TEXT PRIMARY KEY,
  origin_vista_id TEXT NOT NULL REFERENCES vistas(id),
  fork_vista_id TEXT NOT NULL UNIQUE REFERENCES vistas(id),
  fork_workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS forks_origin ON forks(origin_vista_id);

-- Per-viewer portable semantic state of a Vista (Duo continuity, re-entry).
CREATE TABLE IF NOT EXISTS vista_states (
  vista_id TEXT NOT NULL REFERENCES vistas(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  state_revision INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL DEFAULT '{}',
  last_idempotency_key TEXT,
  updated_at TEXT,
  PRIMARY KEY (vista_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS quota_usage (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  usage_date TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, usage_date)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  workspace_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, scope, key)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at TEXT NOT NULL
);
