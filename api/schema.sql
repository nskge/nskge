-- Only pseudonymous IDs; no raw IP/MAC.
CREATE TABLE IF NOT EXISTS visits(
id INTEGER PRIMARY KEY AUTOINCREMENT, visitor_id TEXT NOT NULL,
time_utc TEXT NOT NULL, minute_epoch INTEGER NOT NULL, ip_hash TEXT NOT NULL,
country TEXT NOT NULL, os TEXT NOT NULL, browser TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_visits_time ON visits(minute_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor_id,minute_epoch);
CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits(ip_hash,minute_epoch);
CREATE TABLE IF NOT EXISTS marks(
id INTEGER PRIMARY KEY AUTOINCREMENT, visitor_id TEXT NOT NULL,
time_utc TEXT NOT NULL, minute_epoch INTEGER NOT NULL, ip_hash TEXT NOT NULL,
country TEXT NOT NULL, os TEXT NOT NULL, browser TEXT NOT NULL,
name TEXT NOT NULL DEFAULT 'anônimo' CHECK(length(name) BETWEEN 1 AND 32),
message TEXT NOT NULL, drawing TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_marks_time ON marks(minute_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_marks_ip ON marks(ip_hash,minute_epoch);
CREATE INDEX IF NOT EXISTS idx_marks_visitor ON marks(visitor_id,minute_epoch);
