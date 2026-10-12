CREATE TABLE IF NOT EXISTS order_operations (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, expected_hash TEXT NOT NULL,
 fingerprint TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL,
 before_fields TEXT NOT NULL CHECK(json_valid(before_fields)), after_fields TEXT NOT NULL CHECK(json_valid(after_fields)),
 phase TEXT NOT NULL CHECK(phase IN ('prepared','sheet_submitting','completed','pending','rejected')),
 result TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(result)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS operations_order ON order_operations(order_id,created_at);
CREATE INDEX IF NOT EXISTS operations_phase ON order_operations(phase,created_at);
CREATE TABLE IF NOT EXISTS order_operation_effects (
 operation_id TEXT PRIMARY KEY,effect TEXT NOT NULL CHECK(effect IN ('completed','rejected')),
 actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_inventory (
 order_id TEXT PRIMARY KEY, proof TEXT NOT NULL CHECK(json_valid(proof)), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_write_lease (
 id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_request_limits (
 identity TEXT NOT NULL,bucket TEXT NOT NULL,window_start INTEGER NOT NULL,count INTEGER NOT NULL,
 PRIMARY KEY(identity,bucket,window_start)
);
