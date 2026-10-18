import type { Config } from './config';
import { EMPTY_AGGREGATE, loadAggregates, loadModels } from './models';
import { ddiScore, decayTo } from './scoring';

export function bucketStart(epochSec: number, bucketMinutes: number): number {
  return Math.floor(epochSec / 60 / bucketMinutes) * 60 * bucketMinutes;
}

const BATCH_SIZE = 100;

export interface SnapshotResult {
  written: number;
  pruned: number;
}

/**
 * Writes one snapshot per active model for the bucket that `nowSec` falls into, then drops
 * buckets older than the retention window. Computing at the truncated bucket time (not at
 * `nowSec`) makes repeated runs inside the same bucket produce identical values, so the
 * upsert is idempotent.
 */
export async function snapshotAll(
  db: D1Database,
  nowSec: number,
  config: Config,
): Promise<SnapshotResult> {
  const tB = bucketStart(nowSec, config.snapshotBucketMinutes);
  const nowMs = tB * 1000; // scoring.ts is epoch-ms; taken_at is epoch-seconds

  const [rows, aggregates] = await Promise.all([loadModels(db, {}), loadAggregates(db)]);

  const statements = rows.map((row) => {
    const stored = aggregates.get(row.id) ?? EMPTY_AGGREGATE;
    const agg = decayTo(stored, nowMs, config.halfLifeHours);
    const score = ddiScore(agg, nowMs, {
      halfLifeHours: config.halfLifeHours,
      alpha: config.scoreAlpha,
      kMin: config.kMin,
    });
    return db
      .prepare(
        `INSERT INTO score_snapshots (model_id, taken_at, score, net, weight, up, down)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(model_id, taken_at) DO UPDATE SET
           score = excluded.score, net = excluded.net, weight = excluded.weight,
           up = excluded.up, down = excluded.down`,
      )
      .bind(row.id, tB, score, agg.net, agg.weight, stored.up, stored.down);
  });

  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await db.batch(statements.slice(i, i + BATCH_SIZE));
  }

  const cutoff = tB - config.snapshotRetentionDays * 86_400;
  const pruned = await db
    .prepare('DELETE FROM score_snapshots WHERE taken_at < ?')
    .bind(cutoff)
    .run();

  return { written: rows.length, pruned: pruned.meta?.changes ?? 0 };
}
