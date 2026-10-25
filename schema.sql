PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS players (
 id INTEGER PRIMARY KEY, nickname TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(length(nickname) BETWEEN 1 AND 40),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS textbooks (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, edition TEXT NOT NULL DEFAULT '', grade TEXT NOT NULL DEFAULT '',
 volume TEXT NOT NULL DEFAULT '', archived_at TEXT
);
CREATE TABLE IF NOT EXISTS word_lists (
 id INTEGER PRIMARY KEY, textbook_id INTEGER REFERENCES textbooks(id), name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', archived_at TEXT
);
CREATE TABLE IF NOT EXISTS words (id INTEGER PRIMARY KEY, text TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS word_list_items (
 list_id INTEGER NOT NULL REFERENCES word_lists(id), word_id INTEGER NOT NULL REFERENCES words(id),
 meaning TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL, PRIMARY KEY(list_id, word_id)
);
CREATE TABLE IF NOT EXISTS game_sessions (
 id INTEGER PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES players(id), mode TEXT NOT NULL CHECK(mode IN ('standard','practice')),
 status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','interrupted')),
 outcome TEXT, started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), ended_at TEXT,
 duration_ms INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, kills INTEGER NOT NULL DEFAULT 0,
 max_combo INTEGER NOT NULL DEFAULT 0, total_keys INTEGER NOT NULL DEFAULT 0, correct_keys INTEGER NOT NULL DEFAULT 0,
 practice_range TEXT, vocabulary_source TEXT NOT NULL, vocabulary_fingerprint TEXT NOT NULL,
 hint_mode TEXT NOT NULL, hint_config TEXT NOT NULL DEFAULT '{}', ruleset_version TEXT NOT NULL, context_key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_word_lists (
 session_id INTEGER NOT NULL REFERENCES game_sessions(id), list_id INTEGER REFERENCES word_lists(id),
 name_snapshot TEXT NOT NULL, textbook_snapshot TEXT NOT NULL, PRIMARY KEY(session_id, list_id)
);
CREATE TABLE IF NOT EXISTS session_words (
 session_id INTEGER NOT NULL REFERENCES game_sessions(id), text TEXT NOT NULL, meaning TEXT NOT NULL,
 PRIMARY KEY(session_id, text)
);
CREATE INDEX IF NOT EXISTS session_player_time ON game_sessions(player_id, id DESC);
CREATE INDEX IF NOT EXISTS session_ranking ON game_sessions(context_key, status, score DESC);

