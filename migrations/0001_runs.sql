CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,            -- queued | running | done | error
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  cost_usd REAL,
  video_key TEXT,
  result TEXT                      -- JSON: turns, usage, verdicts, cost lines
);
CREATE INDEX IF NOT EXISTS runs_created ON runs (created_at DESC);
CREATE INDEX IF NOT EXISTS runs_workflow ON runs (workflow, created_at DESC);
