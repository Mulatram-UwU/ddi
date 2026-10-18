-- Score snapshots for trend charts.
-- `taken_at` is the ONLY integer-epoch-seconds column in this database: the trend query buckets
-- with integer division ((taken_at / :b) * :b), which needs an integer. Every other table uses
-- ISO8601 text, and worker/src/scoring.ts works in epoch MILLISECONDS.

CREATE TABLE score_snapshots (
  model_id  INTEGER NOT NULL REFERENCES models(id),
  taken_at  INTEGER NOT NULL,
  score     REAL    NOT NULL,
  net       REAL    NOT NULL,
  weight    REAL    NOT NULL,
  up        INTEGER NOT NULL,
  down      INTEGER NOT NULL,
  PRIMARY KEY (model_id, taken_at)
);
CREATE INDEX idx_snapshots_time ON score_snapshots(taken_at);
