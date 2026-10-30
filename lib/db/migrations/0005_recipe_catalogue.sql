BEGIN;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS catalogue text NOT NULL DEFAULT 'TASKBAKE';

CREATE INDEX IF NOT EXISTS recipes_catalogue_status_updated_idx
  ON recipes (catalogue, status, updated_at DESC);

COMMIT;
