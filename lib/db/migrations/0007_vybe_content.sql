BEGIN;

ALTER TABLE vybe_creations
  ADD COLUMN IF NOT EXISTS models text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS negative_prompt text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS style text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS aspect_ratio text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scene text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS motion text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS camera_instructions text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS video_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS poster_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS visual_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS example_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS refinement_instructions text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS builder_instructions text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tools text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS demo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verification_details text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS experience_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS experience_controls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS featured_position integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS vybe_creations_type_idx
  ON vybe_creations (content_type);
CREATE INDEX IF NOT EXISTS vybe_creations_public_order_idx
  ON vybe_creations (status, published_at);
CREATE INDEX IF NOT EXISTS vybe_creations_featured_order_idx
  ON vybe_creations (featured, featured_position);

COMMIT;
