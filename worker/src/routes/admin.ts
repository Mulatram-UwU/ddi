import { Hono } from 'hono';
import { requireAdmin } from '../auth';
import type { AppBindings } from '../auth';
import { readConfig } from '../config';
import { apiError, readJsonObject } from '../http';
import { loadModelBySlug, loadModels } from '../models';
import type { ModelRow } from '../models';
import { foldVotes } from '../scoring';
import type { VoteEvent } from '../scoring';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function flag(value: unknown, fallback: number): number {
  if (value === 0 || value === false || value === '0' || value === 'false') return 0;
  if (value === 1 || value === true || value === '1' || value === 'true') return 1;
  return fallback;
}

export function adminRoutes(app: Hono<AppBindings>): void {
  // Not in the original contract table, but the admin table has to list deactivated models too,
  // otherwise is_active = 0 is invisible and cannot be undone from the UI.
  app.get('/api/admin/models', requireAdmin, async (c) => {
    const rows = await loadModels(c.env.DB, { includeInactive: true });
    return c.json({ models: rows });
  });

  app.post('/api/admin/models', requireAdmin, async (c) => {
    const body = await readJsonObject(c);
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const provider = typeof body?.provider === 'string' ? body.provider.trim() : '';
    if (!SLUG_RE.test(slug)) {
      return apiError(c, 400, 'INVALID_BODY', 'slug must match ^[a-z0-9][a-z0-9-]{1,63}$.');
    }
    if (name.length === 0 || provider.length === 0) {
      return apiError(c, 400, 'INVALID_BODY', 'name and provider are required.');
    }

    const now = new Date().toISOString();
    const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Number(body?.sort_order) : 0;
    try {
      const created = await c.env.DB.prepare(
        `INSERT INTO models (slug, name, provider, description, homepage_url, is_active, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
        .bind(
          slug,
          name,
          provider,
          textOrNull(body?.description),
          textOrNull(body?.homepage_url),
          flag(body?.is_active, 1),
          sortOrder,
          now,
        )
        .first<{ id: number }>();
      if (!created) return apiError(c, 500, 'INTERNAL', 'Model insert returned no id.');
      await c.env.DB.prepare(
        `INSERT INTO model_scores (model_id, net, weight, up, down, computed_at)
         VALUES (?, 0, 0, 0, 0, ?) ON CONFLICT(model_id) DO NOTHING`,
      )
        .bind(created.id, now)
        .run();
      const row = await loadModelBySlug(c.env.DB, slug, { includeInactive: true });
      return c.json({ model: row }, 201);
    } catch (error) {
      if (String(error).includes('UNIQUE')) {
        return apiError(c, 409, 'INVALID_BODY', `Model "${slug}" already exists.`);
      }
      throw error;
    }
  });

  app.patch('/api/admin/models/:slug', requireAdmin, async (c) => {
    const slug = c.req.param('slug');
    const existing = await loadModelBySlug(c.env.DB, slug, { includeInactive: true });
    if (!existing) return apiError(c, 404, 'MODEL_NOT_FOUND', `No model with slug "${slug}".`);
    const body = await readJsonObject(c);
    if (!body) return apiError(c, 400, 'INVALID_BODY', 'Body must be a JSON object.');

    const next: ModelRow = {
      ...existing,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name,
      provider:
        typeof body.provider === 'string' && body.provider.trim()
          ? body.provider.trim()
          : existing.provider,
      description: 'description' in body ? textOrNull(body.description) : existing.description,
      homepage_url: 'homepage_url' in body ? textOrNull(body.homepage_url) : existing.homepage_url,
      is_active: flag(body.is_active, existing.is_active),
      sort_order: Number.isFinite(Number(body.sort_order))
        ? Number(body.sort_order)
        : existing.sort_order,
    };

    await c.env.DB.prepare(
      `UPDATE models SET name = ?, provider = ?, description = ?, homepage_url = ?,
         is_active = ?, sort_order = ? WHERE id = ?`,
    )
      .bind(
        next.name,
        next.provider,
        next.description,
        next.homepage_url,
        next.is_active,
        next.sort_order,
        next.id,
      )
      .run();

    const row = await loadModelBySlug(c.env.DB, slug, { includeInactive: true });
    return c.json({ model: row });
  });

  app.delete('/api/admin/models/:slug', requireAdmin, async (c) => {
    const slug = c.req.param('slug');
    const existing = await loadModelBySlug(c.env.DB, slug, { includeInactive: true });
    if (!existing) return apiError(c, 404, 'MODEL_NOT_FOUND', `No model with slug "${slug}".`);
    await c.env.DB.prepare('UPDATE models SET is_active = 0 WHERE id = ?').bind(existing.id).run();
    return c.body(null, 204);
  });

  app.post('/api/admin/rescore', requireAdmin, async (c) => {
    const config = readConfig(c.env);
    const now = Date.now();
    const result = await c.env.DB.prepare(
      'SELECT model_id, value, created_at FROM votes ORDER BY model_id ASC, created_at ASC',
    ).all<{ model_id: number; value: number; created_at: string }>();

    const grouped = new Map<number, VoteEvent[]>();
    const counters = new Map<number, { up: number; down: number }>();
    for (const vote of result.results ?? []) {
      let events = grouped.get(vote.model_id);
      if (!events) {
        events = [];
        grouped.set(vote.model_id, events);
      }
      events.push({ value: vote.value === 1 ? 1 : -1, createdAt: Date.parse(vote.created_at) });
      let counter = counters.get(vote.model_id);
      if (!counter) {
        counter = { up: 0, down: 0 };
        counters.set(vote.model_id, counter);
      }
      if (vote.value === 1) counter.up += 1;
      else counter.down += 1;
    }

    const nowIso = new Date(now).toISOString();
    // A full rebuild must also clear models that no longer have any votes, so reset every row first.
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(
        'UPDATE model_scores SET net = 0, weight = 0, up = 0, down = 0, computed_at = ?',
      ).bind(nowIso),
    ];
    for (const [modelId, events] of grouped) {
      const folded = foldVotes(events, now, config.halfLifeHours);
      const counter = counters.get(modelId) ?? { up: 0, down: 0 };
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO model_scores (model_id, net, weight, up, down, computed_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(model_id) DO UPDATE SET
             net = excluded.net, weight = excluded.weight, up = excluded.up,
             down = excluded.down, computed_at = excluded.computed_at`,
        ).bind(modelId, folded.net, folded.weight, counter.up, counter.down, nowIso),
      );
    }
    for (let i = 0; i < statements.length; i += 100) {
      await c.env.DB.batch(statements.slice(i, i + 100));
    }
    return c.json({ models: grouped.size });
  });
}
