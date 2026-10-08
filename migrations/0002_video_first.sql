-- Video-first gallery: the recording's shape, its poster frame, and votes.
ALTER TABLE runs ADD COLUMN layout TEXT;                 -- vertical | wide (NULL = wide, before 2026-10-08)
ALTER TABLE runs ADD COLUMN poster_key TEXT;             -- R2 key of a JPEG frame
ALTER TABLE runs ADD COLUMN votes INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS votes (
  run_id TEXT NOT NULL,
  voter TEXT NOT NULL,          -- random id in a first-party cookie, one vote per browser
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, voter)
);
CREATE INDEX IF NOT EXISTS votes_voter ON votes (voter, created_at);
CREATE INDEX IF NOT EXISTS runs_votes ON runs (votes DESC, created_at DESC);
