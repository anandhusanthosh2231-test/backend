BEGIN;

CREATE TABLE IF NOT EXISTS vybe_csv_import_jobs (
  id SERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  strategy TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vybe_csv_import_jobs_created_idx
  ON vybe_csv_import_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS vybe_csv_import_jobs_status_idx
  ON vybe_csv_import_jobs (status);

COMMIT;
