-- Agrega la preferencia de tema (claro/oscuro/sistema) al perfil.
-- Idempotente.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme_preference text
    CHECK (theme_preference IN ('light', 'dark', 'system'))
    DEFAULT 'system';

-- Backfill explícito por si el default no aplica a filas previas.
UPDATE profiles SET theme_preference = 'system' WHERE theme_preference IS NULL;

ALTER TABLE profiles
  ALTER COLUMN theme_preference SET NOT NULL;
