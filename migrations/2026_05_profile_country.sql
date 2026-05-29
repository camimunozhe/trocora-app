-- TROC-29 — País del usuario (prepara multi-país; por ahora solo Chile).
-- Idempotente. Backfill de usuarios existentes a 'CL'.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'CL';
