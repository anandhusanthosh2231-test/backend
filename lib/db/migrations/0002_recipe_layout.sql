BEGIN;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS layout_mode text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS layout_config jsonb;

COMMIT;