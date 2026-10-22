import { Hono } from 'hono';
import { eligibility, requireSession } from '../auth';
import type { AppBindings } from '../auth';
import { readConfig } from '../config';
import { apiError, readJsonObject } from '../http';
import { loadExtras, loadModelBySlug, serializeModel } from '../models';
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

    const cooldownMs = config.voteCooldownHours * 3_600_000;
    const cooldownError = (nextVoteAt: number) =>
      apiError(
        c,
        429,
        'VOTE_COOLDOWN',
        'This account already voted on this model within the cooldown window.',
        { next_vote_at: new Date(nextVoteAt).toISOString() },
        { 'Retry-After': String(Math.max(1, Math.ceil((nextVoteAt - now) / 1000))) },
      );

    // Cheap pre-check first: a user in cooldown gets a 429 without burning a single-use captcha
    // token. The INSERT below is still the authoritative gate, so parallel requests cannot both
    // pass this read.
    const latest = await c.env.DB.prepare(
      'SELECT created_at FROM votes WHERE account_id = ? AND model_id = ? ORDER BY created_at DESC LIMIT 1',
    )
      .bind(account.id, row.id)
      .first<{ created_at: string }>();
    if (latest) {
      const nextVoteAt = Date.parse(latest.created_at) + cooldownMs;
      if (now < nextVoteAt) return cooldownError(nextVoteAt);
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

    const nowIso = new Date(now).toISOString();
    const cutoffIso = new Date(now - cooldownMs).toISOString();

    // Single-statement conditional insert: D1 serialises writes, so the NOT EXISTS sees any vote
    // committed by a racing request. Without this, N parallel calls all passed the SELECT above.
    const inserted = await c.env.DB.prepare(
      `INSERT INTO votes (account_id, model_id, value, created_at)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM votes
         WHERE account_id = ? AND model_id = ? AND created_at > ?
       )`,
    )
      .bind(account.id, row.id, value, nowIso, account.id, row.id, cutoffIso)
      .run();
    if ((inserted.meta.changes ?? 0) === 0) {
      const raced = await c.env.DB.prepare(
        'SELECT created_at FROM votes WHERE account_id = ? AND model_id = ? ORDER BY created_at DESC LIMIT 1',
      )
        .bind(account.id, row.id)
        .first<{ created_at: string }>();
      return cooldownError(
        raced ? Date.parse(raced.created_at) + cooldownMs : now + cooldownMs,
      );
    }

    // Fold the vote into the fast-path row in one UPDATE. Computing the decay from the row's own
    // computed_at (instead of a value read in JS) keeps concurrent votes for the same model from
    // overwriting each other's contribution.
    const halfLifeMs = config.halfLifeHours * 3_600_000;
    const scoreSql = `UPDATE model_scores
       SET net = net * pow(2, -((julianday(?) - julianday(computed_at)) * 86400000.0) / ?) + ?,
           weight = weight * pow(2, -((julianday(?) - julianday(computed_at)) * 86400000.0) / ?) + 1,
           up = up + ?,
           down = down + ?,
           computed_at = ?
       WHERE model_id = ?
       RETURNING net, weight, up, down, computed_at`;
    const bindScore = (statement: D1PreparedStatement) =>
      statement.bind(
        nowIso,
        halfLifeMs,
        value,
        nowIso,
        halfLifeMs,
        value === 1 ? 1 : 0,
        value === -1 ? 1 : 0,
        nowIso,
        row.id,
      );
    interface ScoredRow {
      net: number;
      weight: number;
      up: number;
      down: number;
      computed_at: string;
    }
    let scored = await bindScore(c.env.DB.prepare(scoreSql)).first<ScoredRow>();
    if (!scored) {
      // A registry row inserted outside the admin route may lack its score row; create the zero
      // baseline, then fold the vote into it.
      await c.env.DB.prepare(
        `INSERT INTO model_scores (model_id, net, weight, up, down, computed_at)
         VALUES (?, 0, 0, 0, 0, ?) ON CONFLICT(model_id) DO NOTHING`,
      )
        .bind(row.id, nowIso)
        .run();
      scored = await bindScore(c.env.DB.prepare(scoreSql)).first<ScoredRow>();
    }
    if (!scored) return apiError(c, 500, 'INTERNAL', 'Could not update the score row.');

    const fresh = {
      net: scored.net,
      weight: scored.weight,
      up: scored.up,
      down: scored.down,
      computedAt: Date.parse(scored.computed_at),
    };

    const extras = await loadExtras(c.env.DB, row.id, now, config, account.id);
    return c.json({ model: serializeModel(row, fresh, extras, now, config) });
  });
}
