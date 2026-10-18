import { Hono } from 'hono';
import { eligibility, requireSession } from '../auth';
import type { AppBindings } from '../auth';
import { readConfig } from '../config';
import { apiError, readJsonObject } from '../http';
import { loadAggregate, loadExtras, loadModelBySlug, serializeModel } from '../models';
import { decayTo } from '../scoring';
import { verifyTurnstile } from '../turnstile';

export function voteRoutes(app: Hono<AppBindings>): void {
  app.post('/api/models/:slug/vote', requireSession, async (c) => {
    const config = readConfig(c.env);
    const now = Date.now();
    const account = c.get('session').account;
    const slug = c.req.param('slug');

    const body = await readJsonObject(c);
    const value = body?.value;
    if (value !== 1 && value !== -1) {
      return apiError(c, 400, 'INVALID_BODY', 'Body must be {"value": 1} or {"value": -1}.');
    }

    const row = await loadModelBySlug(c.env.DB, slug);
    if (!row) return apiError(c, 404, 'MODEL_NOT_FOUND', `No active model with slug "${slug}".`);

    const seat = eligibility(account, config, now);
    if (!seat.canVote) {
      return apiError(c, 403, 'ACCOUNT_TOO_NEW', 'GitHub account is too new to vote.', {
        age_eligible_at: seat.ageEligibleAt,
      });
    }

    const latest = await c.env.DB.prepare(
      'SELECT created_at FROM votes WHERE account_id = ? AND model_id = ? ORDER BY created_at DESC LIMIT 1',
    )
      .bind(account.id, row.id)
      .first<{ created_at: string }>();
    if (latest) {
      const nextVoteAt = Date.parse(latest.created_at) + config.voteCooldownHours * 3_600_000;
      if (now < nextVoteAt) {
        return apiError(
          c,
          429,
          'VOTE_COOLDOWN',
          'This account already voted on this model within the cooldown window.',
          { next_vote_at: new Date(nextVoteAt).toISOString() },
          { 'Retry-After': String(Math.ceil((nextVoteAt - now) / 1000)) },
        );
      }
    }

    // Captcha sits between the cooldown gate and the write: a user who is in cooldown gets the 429
    // they deserve instead of burning a single-use Turnstile token on a rejected vote.
    if (config.turnstileRequired) {
      const captchaToken = typeof body?.captcha_token === 'string' ? body.captcha_token : '';
      if (captchaToken.length === 0) {
        return apiError(c, 403, 'CAPTCHA_FAILED', 'Missing captcha token.', { reason: 'missing' });
      }
      const result = await verifyTurnstile(
        c.env.TURNSTILE_SECRET_KEY ?? '',
        captchaToken,
        c.req.header('CF-Connecting-IP') ?? null,
      );
      if (!result.success) {
        console.error(JSON.stringify({ msg: 'captcha_failed', codes: result.errorCodes }));
        return apiError(c, 403, 'CAPTCHA_FAILED', 'Captcha verification failed.', {
          reason: result.errorCodes.join(','),
        });
      }
    }

    const previous = await loadAggregate(c.env.DB, row.id);
    const decayed = decayTo(previous, now, config.halfLifeHours);
    const fresh = {
      net: decayed.net + value,
      weight: decayed.weight + 1,
      up: previous.up + (value === 1 ? 1 : 0),
      down: previous.down + (value === -1 ? 1 : 0),
      computedAt: now,
    };
    const nowIso = new Date(now).toISOString();

    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO votes (account_id, model_id, value, created_at) VALUES (?, ?, ?, ?)',
      ).bind(account.id, row.id, value, nowIso),
      c.env.DB.prepare(
        `INSERT INTO model_scores (model_id, net, weight, up, down, computed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(model_id) DO UPDATE SET
           net = excluded.net, weight = excluded.weight, up = excluded.up,
           down = excluded.down, computed_at = excluded.computed_at`,
      ).bind(row.id, fresh.net, fresh.weight, fresh.up, fresh.down, nowIso),
    ]);

    const extras = await loadExtras(c.env.DB, row.id, now, config, account.id);
    return c.json({ model: serializeModel(row, fresh, extras, now, config) });
  });
}
