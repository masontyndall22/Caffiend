-- Kyle Energy database (Cloudflare D1, which is SQLite).
-- Fresh install only (an existing database uses migrations/ instead).
-- Apply with: npx wrangler d1 execute kyle-energy --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS ratings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  brand       TEXT    NOT NULL,                 -- display spelling, e.g. "Red Bull"
  flavor      TEXT    NOT NULL,
  brand_key   TEXT    NOT NULL,                 -- lower-case, single-spaced, for matching
  flavor_key  TEXT    NOT NULL,
  score10     INTEGER NOT NULL CHECK (score10 BETWEEN 0 AND 100),  -- 8.6 is stored as 86, no float drift
  rated_on    TEXT    NOT NULL,                 -- YYYY-MM-DD, when first rated
  note        TEXT    NOT NULL DEFAULT '',
  updated_at  TEXT    NOT NULL,
  caffeine_mg INTEGER CHECK (caffeine_mg IS NULL OR caffeine_mg BETWEEN 0 AND 1000),  -- mg per can, optional
  UNIQUE (brand_key, flavor_key)                -- the database itself refuses duplicates
);

CREATE INDEX IF NOT EXISTS ratings_brand ON ratings (brand_key);

CREATE TABLE IF NOT EXISTS likes (
  rating_id   INTEGER NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  liker       TEXT    NOT NULL,
  liker_key   TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  PRIMARY KEY (rating_id, liker_key)
);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint    TEXT PRIMARY KEY,                 -- the browser's push URL
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
