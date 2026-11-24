-- One-time upgrade for an existing Caffiend database. Keeps every rating; only adds things.
-- Run once:  npx wrangler d1 execute kyle-energy --remote --file=migrations/0002_caffeine_and_likes.sql
-- (Running it a second time fails on the ALTER TABLE line with "duplicate column name" and changes nothing.)

ALTER TABLE ratings ADD COLUMN caffeine_mg INTEGER CHECK (caffeine_mg IS NULL OR caffeine_mg BETWEEN 0 AND 1000);

CREATE TABLE IF NOT EXISTS likes (
  rating_id   INTEGER NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  liker       TEXT    NOT NULL,                 -- display name as typed, e.g. "Kyle"
  liker_key   TEXT    NOT NULL,                 -- lower-case for matching
  created_at  TEXT    NOT NULL,
  PRIMARY KEY (rating_id, liker_key)
);
