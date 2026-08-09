-- Gait sessions schema for storing video gait analysis sessions and metrics.

CREATE TABLE IF NOT EXISTS gait_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  session_name TEXT NOT NULL DEFAULT 'Gait Session',
  task_mode TEXT NOT NULL DEFAULT 'single' CHECK (task_mode IN ('single', 'dual')),
  overall_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  stability_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  rhythm_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  symmetry_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  mobility_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  automaticity_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  cadence_spm DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  step_count INTEGER NOT NULL DEFAULT 0,
  duration_sec DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  view_angle TEXT NOT NULL DEFAULT 'unknown',
  symmetry_angle DOUBLE PRECISION,
  harmonic_ratio DOUBLE PRECISION,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  guesses_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  dual_task_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS gait_sessions_user_id_idx ON gait_sessions (user_id);
CREATE INDEX IF NOT EXISTS gait_sessions_user_created_idx ON gait_sessions (user_id, created_at DESC);
