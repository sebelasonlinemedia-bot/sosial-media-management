-- PiK's Digital Lab — Neon Postgres schema
-- Jalankan sekali di Neon SQL Editor (atau otomatis saat server start).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- brandMemory, autonomy overrides: disimpan di accounts.data JSONB
-- contoh: data->>'brandMemory', data->'aiAutonomy'

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
CREATE INDEX IF NOT EXISTS idx_accounts_connected ON accounts (connected);

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
