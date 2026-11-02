CREATE TABLE films (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  video_key TEXT NOT NULL,
  poster_key TEXT NOT NULL,
  bg_key TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  duration REAL NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  embed_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A single row holding the site's text and where each film appears.
CREATE TABLE site (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
