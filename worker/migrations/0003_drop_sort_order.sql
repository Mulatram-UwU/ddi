-- Ordering is `score` desc -> `weight` desc -> `name` asc. The administrator-maintained
-- `sort_order` column was a second way to spell "alphabetical" (it only ever decided between
-- models the data could not separate), so it is gone rather than left as a dead column.
ALTER TABLE models DROP COLUMN sort_order;
