import { Hono } from 'hono';
import type { AppBindings } from '../auth';
import { eligibility, isAdmin, requireSession, resolveSession } from '../auth';
import { publicConfig, readConfig } from '../config';
import { apiError } from '../http';
import { buildLeaderboard, loadAggregate, loadExtras, loadModelBySlug, serializeModel } from '../models';
import { round1 } from '../scoring';

const RANGES: Record<string, { windowSec: number; bucketSec: number }> = {
  '24h': { windowSec: 86_400, bucketSec: 600 },
  '7d': { windowSec: 604_800, bucketSec: 3_600 },
  '30d': { windowSec: 2_592_000, bucketSec: 10_800 },
  '90d': { windowSec: 7_776_000, bucketSec: 86_400 },
};

export function publicRoutes(app: Hono<AppBindings>): void {
  app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

  app.get('/api/config', (c) => c.json(publicConfig(readConfig(c.env))));

  app.get('/api/models', async (c) => {
    const now = Date.now();
    const config = readConfig(c.env);
    const session = await resolveSession(c.env.DB, c.req.header('Authorization'), now);
    const { models } = await buildLeaderboard(c.env.DB, now, config, session?.account.id ?? null);
    return c.json({ models, generated_at: new Date(now).toISOString() });
  });

  app.get('/api/models/:slug', async (c) => {
    const now = Date.now();
    const config = readConfig(c.env);
    const slug = c.req.param('slug');
    const row = await loadModelBySlug(c.env.DB, slug);
    if (!row) return apiError(c, 404, 'MODEL_NOT_FOUND', `No active model with slug "${slug}".`);
    const session = await resolveSession(c.env.DB, c.req.header('Authorization'), now);
    const accountId = session?.account.id ?? null;
    const [agg, extras] = await Promise.all([
      loadAggregate(c.env.DB, row.id),
      loadExtras(c.env.DB, row.id, now, config, accountId),
    ]);
    return c.json({ model: serializeModel(row, agg, extras, now, config) });
  });

  app.get('/api/models/:slug/history', async (c) => {
    const now = Date.now();
    const range = c.req.query('range') ?? '24h';
    const spec = RANGES[range];
    if (!spec) {
      return apiError(c, 400, 'INVALID_BODY', `Unsupported range "${range}".`, {
        allowed: Object.keys(RANGES),
      });
    }
    const slug = c.req.param('slug');
    const row = await loadModelBySlug(c.env.DB, slug);
    if (!row) return apiError(c, 404, 'MODEL_NOT_FOUND', `No active model with slug "${slug}".`);

    const since = Math.floor(now / 1000) - spec.windowSec;
    const result = await c.env.DB.prepare(
      `SELECT (taken_at / ?) * ? AS bucket, AVG(score) AS score
       FROM score_snapshots
       WHERE model_id = ? AND taken_at >= ?
       GROUP BY bucket ORDER BY bucket`,
    )
      .bind(spec.bucketSec, spec.bucketSec, row.id, since)
      .all<{ bucket: number; score: number }>();

    return c.json({
      slug: row.slug,
      range,
      bucket_seconds: spec.bucketSec,
      points: (result.results ?? []).map((point) => ({
        t: point.bucket,
        score: round1(point.score),
      })),
    });
  });

  app.get('/api/me', requireSession, (c) => {
    const config = readConfig(c.env);
    const now = Date.now();
    const account = c.get('session').account;
    const seat = eligibility(account, config, now);
    return c.json({
      id: account.id,
      login: account.login,
      name: account.name,
      avatar_url: account.avatar_url,
      is_admin: isAdmin(account, config),
      can_vote: seat.canVote,
      vote_blocked_reason: seat.reason,
      age_eligible_at: seat.ageEligibleAt,
    });
  });
}

