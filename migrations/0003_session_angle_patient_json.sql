-- Adds joint-angle analysis and patient metadata payloads to saved gait sessions.
--
-- These columns MUST live in their own migration rather than being appended to
-- 0002: scripts/migrate.mjs records applied filenames in _migrations and skips
-- them on subsequent runs, so editing an already-applied file means the change
-- never reaches any existing database. It would appear to work only where the
-- schema is rebuilt from scratch (local PGLite), and silently fail in
-- production against the real Postgres.

ALTER TABLE gait_sessions ADD COLUMN IF NOT EXISTS angle_analysis_json JSONB;
ALTER TABLE gait_sessions ADD COLUMN IF NOT EXISTS patient_meta_json JSONB;
