-- Existing marks keep their original anonymous attribution.
ALTER TABLE marks ADD COLUMN name TEXT NOT NULL DEFAULT 'anônimo' CHECK(length(name) BETWEEN 1 AND 32);
