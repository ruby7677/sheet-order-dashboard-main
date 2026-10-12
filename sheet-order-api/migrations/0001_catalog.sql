-- One versioned document keeps this small catalog and delivery rules in one snapshot.
CREATE TABLE IF NOT EXISTS catalog_state (
 id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>0),
 payload TEXT NOT NULL CHECK(json_valid(payload)), updated_at TEXT NOT NULL,
 write_ready INTEGER NOT NULL DEFAULT 0 CHECK(write_ready IN (0,1))
);
CREATE TABLE IF NOT EXISTS catalog_mutations (
 id TEXT PRIMARY KEY, expected_revision INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
 kind TEXT NOT NULL, actor TEXT NOT NULL, details TEXT NOT NULL CHECK(json_valid(details)), created_at TEXT NOT NULL,
 guard INTEGER NOT NULL CHECK(guard=1)
);
CREATE TABLE IF NOT EXISTS stock_reservations (
 id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, quantities TEXT NOT NULL CHECK(json_valid(quantities)),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), state TEXT NOT NULL CHECK(state IN ('reserved','submitting','confirmed','released')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reservations_state ON stock_reservations(state,created_at);
