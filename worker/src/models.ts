import type { Config } from './config';
import { ddiScore, decayTo, round1 } from './scoring';

export interface ModelRow {
  id: number;
  slug: string;
  name: string;
  provider: string;
  description: string | null;
  homepage_url: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
}

export interface ModelScoreRow {
  net: number;
  weight: number;
  up: number;
  down: number;
  computedAt: number; // epoch ms
}

export interface MyVoteJson {
  value: number;
  created_at: string;
  next_vote_at: string;
}

export interface ModelExtras {
  recentUp: number;
  recentDown: number;
  lastVoteAt: string | null;
  sparkline: number[];
  myVote: MyVoteJson | null;
}

export interface ModelJson {
  id: number;
  slug: string;
  name: string;
  provider: string;
  description: string | null;
  homepage_url: string | null;
  sort_order: number;
  score: number;
  net: number;
  weight: number;
  up: number;
  down: number;
  recent_up: number;
  recent_down: number;
  sparkline: number[];
  change_24h: number | null;
  last_vote_at: string | null;
  my_vote: MyVoteJson | null;
}

export const EMPTY_AGGREGATE: ModelScoreRow = { net: 0, weight: 0, up: 0, down: 0, computedAt: 0 };

export async function loadModels(
  db: D1Database,
  opts: { includeInactive?: boolean } = {},
): Promise<ModelRow[]> {
  const where = opts.includeInactive ? '' : 'WHERE is_active = 1';
  const result = await db
    .prepare(`SELECT * FROM models ${where} ORDER BY sort_order ASC, name ASC`)
    .all<ModelRow>();
  return result.results ?? [];
}

export async function loadModelBySlug(
  db: D1Database,
  slug: string,
  opts: { includeInactive?: boolean } = {},
): Promise<ModelRow | null> {
  const where = opts.includeInactive ? '' : 'AND is_active = 1';
  const row = await db
    .prepare(`SELECT * FROM models WHERE slug = ? ${where}`)
    .bind(slug)
    .first<ModelRow>();
  return row ?? null;
}

export async function loadAggregates(db: D1Database): Promise<Map<number, ModelScoreRow>> {
  const result = await db
    .prepare('SELECT model_id, net, weight, up, down, computed_at FROM model_scores')
    .all<{
      model_id: number;
      net: number;
      weight: number;
      up: number;
      down: number;
      computed_at: string;
    }>();
  const map = new Map<number, ModelScoreRow>();
  for (const row of result.results ?? []) {
    map.set(row.model_id, {
      net: row.net,
      weight: row.weight,
      up: row.up,
      down: row.down,
      computedAt: Date.parse(row.computed_at),
    });
  }
  return map;
}

export async function loadAggregate(
  db: D1Database,
  modelId: number,
): Promise<ModelScoreRow> {
  const row = await db
    .prepare('SELECT net, weight, up, down, computed_at FROM model_scores WHERE model_id = ?')
    .bind(modelId)
    .first<{ net: number; weight: number; up: number; down: number; computed_at: string }>();
  if (!row) return { ...EMPTY_AGGREGATE };
  return {
    net: row.net,
    weight: row.weight,
    up: row.up,
    down: row.down,
    computedAt: Date.parse(row.computed_at),
  };
}

interface RecentRow {
  model_id: number;
  value: number;
  c: number;
  last_at: string;
}

interface BucketRow {
  model_id: number;
  bucket: number;
  score: number;
}

export function scoreOf(agg: ModelScoreRow, now: number, config: Config): number {
  return ddiScore(agg, now, {
    halfLifeHours: config.halfLifeHours,
    alpha: config.scoreAlpha,
    kMin: config.kMin,
  });
}

export function serializeModel(
  row: ModelRow,
  agg: ModelScoreRow,
  extras: ModelExtras,
  now: number,
  config: Config,
): ModelJson {
  const score = scoreOf(agg, now, config);
  // net/weight are reported after the same read-time decay as `score`, so the two never disagree
  // about "how much signal is left right now". up/down stay cumulative by design.
  const decayed = decayTo(agg, now, config.halfLifeHours);
  const first = extras.sparkline.length > 0 ? extras.sparkline[0] : null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    description: row.description,
    homepage_url: row.homepage_url,
    sort_order: row.sort_order,
    score,
    net: Math.round(decayed.net * 10000) / 10000,
    weight: Math.round(decayed.weight * 10000) / 10000,
    up: agg.up,
    down: agg.down,
    recent_up: extras.recentUp,
    recent_down: extras.recentDown,
    sparkline: extras.sparkline,
    change_24h: first === null ? null : round1(score - first),
    last_vote_at: extras.lastVoteAt,
    my_vote: extras.myVote,
  };
}

export function sortModels(models: ModelJson[]): ModelJson[] {
  return models.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.weight !== a.weight) return b.weight - a.weight;
    // The administrator's curated order decides between models the data cannot separate (every
    // score is 0.0 on an empty registry), so `sort_order` must land before the name tie-break.
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
}

export interface Leaderboard {
  models: ModelJson[];
  generatedAt: number;
}

export async function buildLeaderboard(
  db: D1Database,
  now: number,
  config: Config,
  accountId: number | null,
): Promise<Leaderboard> {
  const sinceIso = new Date(now - 24 * 3_600_000).toISOString();
  const sinceSec = Math.floor(now / 1000) - 86_400;

  const [rows, aggregates, recent, buckets, myVotes] = await Promise.all([
    loadModels(db),
    loadAggregates(db),
    db
      .prepare(
        `SELECT model_id, value, COUNT(*) AS c, MAX(created_at) AS last_at
         FROM votes WHERE created_at > ? GROUP BY model_id, value`,
      )
      .bind(sinceIso)
      .all<RecentRow>(),
    db
      .prepare(
        `SELECT model_id, (taken_at / 3600) * 3600 AS bucket, AVG(score) AS score
         FROM score_snapshots WHERE taken_at >= ? GROUP BY model_id, bucket
         ORDER BY model_id, bucket`,
      )
      .bind(sinceSec)
      .all<BucketRow>(),
    accountId === null
      ? Promise.resolve({ results: [] as { model_id: number; value: number; created_at: string }[] })
      : db
          .prepare(
            `SELECT model_id, value, created_at FROM votes
             WHERE account_id = ? AND id IN (SELECT MAX(id) FROM votes WHERE account_id = ? GROUP BY model_id)`,
          )
          .bind(accountId, accountId)
          .all<{ model_id: number; value: number; created_at: string }>(),
  ]);

  const extras = groupExtras(recent.results ?? [], buckets.results ?? [], myVotes.results ?? [], config);

  const models = sortModels(
    rows.map((row) =>
      serializeModel(
        row,
        aggregates.get(row.id) ?? { ...EMPTY_AGGREGATE },
        extras.get(row.id) ?? emptyExtras(),
        now,
        config,
      ),
    ),
  );
  return { models, generatedAt: now };
}

export function emptyExtras(): ModelExtras {
  return { recentUp: 0, recentDown: 0, lastVoteAt: null, sparkline: [], myVote: null };
}

export function groupExtras(
  recent: RecentRow[],
  buckets: BucketRow[],
  myVotes: { model_id: number; value: number; created_at: string }[],
  config: Config,
): Map<number, ModelExtras> {
  const map = new Map<number, ModelExtras>();
  const get = (id: number): ModelExtras => {
    let extras = map.get(id);
    if (!extras) {
      extras = emptyExtras();
      map.set(id, extras);
    }
    return extras;
  };

  for (const row of recent) {
    const extras = get(row.model_id);
    if (row.value > 0) extras.recentUp += row.c;
    else extras.recentDown += row.c;
    if (extras.lastVoteAt === null || row.last_at > extras.lastVoteAt) extras.lastVoteAt = row.last_at;
  }
  for (const row of buckets) {
    get(row.model_id).sparkline.push(round1(row.score));
  }
  for (const row of myVotes) {
    get(row.model_id).myVote = {
      value: row.value,
      created_at: row.created_at,
      next_vote_at: new Date(
        Date.parse(row.created_at) + config.voteCooldownHours * 3_600_000,
      ).toISOString(),
    };
  }
  return map;
}

/** Extras for exactly one model (used by the vote endpoint to answer with a fresh row). */
export async function loadExtras(
  db: D1Database,
  modelId: number,
  now: number,
  config: Config,
  accountId: number | null,
): Promise<ModelExtras> {
  const sinceIso = new Date(now - 24 * 3_600_000).toISOString();
  const sinceSec = Math.floor(now / 1000) - 86_400;
  const [recent, buckets, myVotes] = await Promise.all([
    db
      .prepare(
        `SELECT model_id, value, COUNT(*) AS c, MAX(created_at) AS last_at
         FROM votes WHERE created_at > ? AND model_id = ? GROUP BY model_id, value`,
      )
      .bind(sinceIso, modelId)
      .all<RecentRow>(),
    db
      .prepare(
        `SELECT model_id, (taken_at / 3600) * 3600 AS bucket, AVG(score) AS score
         FROM score_snapshots WHERE taken_at >= ? AND model_id = ? GROUP BY model_id, bucket
         ORDER BY model_id, bucket`,
      )
      .bind(sinceSec, modelId)
      .all<BucketRow>(),
    accountId === null
      ? Promise.resolve({ results: [] as { model_id: number; value: number; created_at: string }[] })
      : db
          .prepare(
            `SELECT model_id, value, created_at FROM votes
             WHERE account_id = ? AND model_id = ? ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(accountId, modelId)
          .all<{ model_id: number; value: number; created_at: string }>(),
  ]);
  return (
    groupExtras(recent.results ?? [], buckets.results ?? [], myVotes.results ?? [], config).get(
      modelId,
    ) ?? emptyExtras()
  );
}
