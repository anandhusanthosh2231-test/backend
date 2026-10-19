BEGIN;

CREATE TABLE IF NOT EXISTS recipe_audiences (
  recipe_id integer NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  audience_id integer NOT NULL REFERENCES audiences(id) ON DELETE CASCADE,
  CONSTRAINT recipe_audiences_pkey PRIMARY KEY (recipe_id, audience_id)
);

CREATE INDEX IF NOT EXISTS recipe_audiences_audience_idx
  ON recipe_audiences (audience_id);

INSERT INTO recipe_audiences (recipe_id, audience_id)
SELECT id, audience_id
FROM recipes
ON CONFLICT DO NOTHING;

COMMIT;
