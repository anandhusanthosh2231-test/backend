BEGIN;

CREATE TABLE IF NOT EXISTS imagekit_media_assets (
  file_id text PRIMARY KEY,
  file_path text NOT NULL UNIQUE,
  url text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  size integer NOT NULL,
  alt text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS imagekit_media_assets_created_idx
  ON imagekit_media_assets (created_at);

CREATE INDEX IF NOT EXISTS imagekit_media_assets_tags_idx
  ON imagekit_media_assets USING gin (tags);

COMMIT;
