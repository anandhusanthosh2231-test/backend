CREATE TABLE IF NOT EXISTS vybe_creations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Images',
  content_type TEXT NOT NULL DEFAULT 'image',
  model TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  trending BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS vybe_creations_status_idx ON vybe_creations (status);
CREATE INDEX IF NOT EXISTS vybe_creations_category_idx ON vybe_creations (category);
CREATE INDEX IF NOT EXISTS vybe_creations_featured_idx ON vybe_creations (featured);
CREATE INDEX IF NOT EXISTS vybe_creations_published_idx ON vybe_creations (published_at);
