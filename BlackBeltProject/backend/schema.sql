CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	username TEXT UNIQUE,
	created_at TEXT NOT NULL,
	salt TEXT,
	password_hash TEXT
);

CREATE TABLE IF NOT EXISTS vault_entries (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	id DOUBLE PRECISION NOT NULL,
	name TEXT NOT NULL,
	username TEXT NOT NULL,
	password TEXT NOT NULL,
	website TEXT NOT NULL,
	category TEXT NOT NULL,
	color TEXT NOT NULL,
	notes TEXT NOT NULL DEFAULT '',
	created_at TEXT,
	last_edited_at TEXT,
	PRIMARY KEY (user_id, id)
);
