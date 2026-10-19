-- PiK's Digital Lab — Neon Postgres schema
-- Jalankan sekali di Neon SQL Editor (atau otomatis saat server start).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Multi-tenant (P2 scaffolding + P3 UNIQUE per workspace)
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO workspaces (id, name)
VALUES ('default', 'Default')
ON CONFLICT (id) DO NOTHING;

-- P3: UNIQUE (workspace_id, platform) — BUKAN UNIQUE(platform) global.
-- Breaking change vs skema lama: drop constraint accounts_platform_key jika masih ada
-- (dilakukan otomatis di db-postgres.js migrateAccountsTenantSchema).
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_workspace_platform
  ON accounts (workspace_id, platform);
CREATE INDEX IF NOT EXISTS idx_accounts_workspace_id ON accounts (workspace_id);
CREATE INDEX IF NOT EXISTS idx_accounts_connected ON accounts (connected);

-- brandMemory, autonomy overrides: di accounts.data JSONB
-- workspaceId juga di-mirror ke data->>'workspaceId' untuk kompatibilitas JSON path

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT,
  publish_date TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_posts_status_publish ON posts (status, publish_date);

-- Job/brief AI (Tim Konten) — otak tetap Cursor di luar server
-- Status: queued | needs_info | publishing | awaiting_approval | done | failed
-- Extra fields di data JSONB: structuredBrief, draftHistory, decisionLog, lastError, roleId, …
CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  brief TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs (status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_created ON ai_jobs (created_at DESC);

-- Settings global Tim Konten (otonomi, emergencyPause, dailyPostCap, stubs Fase 2)
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT,
  action TEXT,
  target TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
