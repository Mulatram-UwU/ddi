import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { readConfig } from './config';
import type { Config } from './config';
import type { Env } from './env';
import { apiError, randomToken, readJsonObject, sha256Hex } from './http';

export interface AccountRow {
  id: number;
  github_id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  github_created_at: string;
  created_at: string;
  last_login_at: string;
}

export interface SessionContext {
  tokenHash: string;
  account: AccountRow;
}

export interface AppBindings {
  Bindings: Env;
  Variables: { session: SessionContext };
}

const STATE_COOKIE = 'ddi_oauth_state';

/** Mirrors `scripts/dev-stub-accounts.sql`: one votable account and one below the 90-day gate. */
const DEV_ACCOUNTS: Record<string, { githubId: number; login: string; ageDays: number }> = {
  old: { githubId: 900000001, login: 'dev-old', ageDays: 730 },
  new: { githubId: 900000002, login: 'dev-new', ageDays: 10 },
};

export async function resolveSession(
  db: D1Database,
  authorization: string | undefined,
  now: number,
): Promise<SessionContext | null> {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1]);
  const row = await db
    .prepare(
      `SELECT s.expires_at AS expires_at,
              a.id AS id, a.github_id AS github_id, a.login AS login, a.name AS name,
              a.avatar_url AS avatar_url, a.github_created_at AS github_created_at,
              a.created_at AS created_at, a.last_login_at AS last_login_at
       FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{
      expires_at: string;
      id: number;
      github_id: number;
      login: string;
      name: string | null;
      avatar_url: string | null;
      github_created_at: string;
      created_at: string;
      last_login_at: string;
    }>();
  if (!row) return null;
  if (Date.parse(row.expires_at) <= now) return null;
  return {
    tokenHash,
    account: {
      id: row.id,
      github_id: row.github_id,
      login: row.login,
      name: row.name,
      avatar_url: row.avatar_url,
      github_created_at: row.github_created_at,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    },
  };
}

export const requireSession = createMiddleware<AppBindings>(async (c, next) => {
  const session = await resolveSession(c.env.DB, c.req.header('Authorization'), Date.now());
  if (!session) {
    return apiError(c, 401, 'UNAUTHORIZED', 'Missing or invalid session token.');
  }
  c.set('session', session);
  await next();
});

export function isAdmin(account: AccountRow, config: Config): boolean {
  return config.adminGithubIds.includes(account.github_id);
}

export const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const session = await resolveSession(c.env.DB, c.req.header('Authorization'), Date.now());
  if (!session) {
    return apiError(c, 401, 'UNAUTHORIZED', 'Missing or invalid session token.');
  }
  if (!isAdmin(session.account, readConfig(c.env))) {
    return apiError(c, 403, 'NOT_ADMIN', 'This account is not a DDI administrator.');
  }
  c.set('session', session);
  await next();
});

export function eligibility(
  account: AccountRow,
  config: Config,
  now: number,
): { canVote: boolean; reason: 'ACCOUNT_TOO_NEW' | null; ageEligibleAt: string | null } {
  const eligibleAt =
    Date.parse(account.github_created_at) + config.minGithubAgeDays * 86_400_000;
  if (now < eligibleAt) {
    return {
      canVote: false,
      reason: 'ACCOUNT_TOO_NEW',
      ageEligibleAt: new Date(eligibleAt).toISOString(),
    };
  }
  return { canVote: true, reason: null, ageEligibleAt: null };
}

export function authRoutes(app: Hono<AppBindings>): void {
  /**
   * Local-only sign-in shortcut so the OAuth round trip is not required to click through the site.
   * Double-gated: the variable must be set AND the Worker origin must be plain http, so a deployed
   * Worker can never expose it even if the variable leaks into production config.
   */
  app.post('/api/auth/dev-login', async (c) => {
    const config = readConfig(c.env);
    if (!config.devLoginEnabled) {
      return apiError(c, 404, 'MODEL_NOT_FOUND', 'No route for POST /api/auth/dev-login.');
    }
    const body = await readJsonObject(c);
    const account = DEV_ACCOUNTS[typeof body?.account === 'string' ? body.account : 'old'];
    if (!account) {
      return apiError(c, 400, 'INVALID_BODY', 'account must be "old" or "new".');
    }
    console.warn(JSON.stringify({ msg: 'dev_login_used', githubId: account.githubId }));

    const now = new Date();
    const nowIso = now.toISOString();
    const row = await c.env.DB.prepare(
      `INSERT INTO accounts (github_id, login, name, avatar_url, github_created_at, created_at, last_login_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?)
       ON CONFLICT(github_id) DO UPDATE SET last_login_at = excluded.last_login_at
       RETURNING id`,
    )
      .bind(
        account.githubId,
        account.login,
        account.login,
        new Date(now.getTime() - account.ageDays * 86_400_000).toISOString(),
        nowIso,
        nowIso,
      )
      .first<{ id: number }>();
    if (!row) return apiError(c, 500, 'INTERNAL', 'Could not create the dev account.');

    const token = randomToken();
    await c.env.DB.prepare(
      'INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
      .bind(
        await sha256Hex(token),
        row.id,
        nowIso,
        new Date(now.getTime() + config.sessionTtlDays * 86_400_000).toISOString(),
      )
      .run();
    return c.json({ token, login: account.login });
  });

  app.get('/api/auth/github/start', (c) => {
    const config = readConfig(c.env);
    const clientId = (c.env.GITHUB_CLIENT_ID ?? '').trim();
    // An unset/placeholder client id makes GitHub answer with its own "page not found", which is
    // indistinguishable from a broken link. Bounce back to the app with a clear error instead.
    if (clientId.length === 0 || clientId === 'local-dev-placeholder' || clientId.startsWith('REPLACE')) {
      console.error(
        JSON.stringify({ msg: 'oauth_not_configured', hint: 'set GITHUB_CLIENT_ID in .dev.vars' }),
      );
      return c.redirect(`${config.webOrigin}/#auth_error=OAUTH_FAILED`, 302);
    }
    const state = randomToken();
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      secure: config.workerOrigin.startsWith('https://'),
      sameSite: 'Lax',
      path: '/api/auth',
      maxAge: 600,
    });
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${config.workerOrigin}/api/auth/github/callback`);
    url.searchParams.set('scope', 'read:user');
    url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  });

  app.get('/api/auth/github/callback', async (c) => {
    const config = readConfig(c.env);
    const fail = (reason: string) => c.redirect(`${config.webOrigin}/#auth_error=${reason}`, 302);

    const code = c.req.query('code');
    const state = c.req.query('state');
    const cookieState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: '/api/auth' });
    if (!code || !state || !cookieState || state !== cookieState) return fail('OAUTH_FAILED');

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenPayload = (await tokenResponse.json()) as { access_token?: string; error?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      console.error(
        JSON.stringify({
          msg: 'oauth_token_exchange_failed',
          status: tokenResponse.status,
          error: tokenPayload.error ?? null,
        }),
      );
      return fail('OAUTH_FAILED');
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ddi',
      },
    });
    if (!userResponse.ok) return fail('OAUTH_FAILED');
    const user = (await userResponse.json()) as {
      id?: number;
      login?: string;
      name?: string | null;
      avatar_url?: string | null;
      created_at?: string;
    };
    if (typeof user.id !== 'number' || !user.login || !user.created_at) return fail('OAUTH_FAILED');

    const now = new Date();
    const nowIso = now.toISOString();
    const account = await c.env.DB.prepare(
      `INSERT INTO accounts (github_id, login, name, avatar_url, github_created_at, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(github_id) DO UPDATE SET
         login = excluded.login, name = excluded.name, avatar_url = excluded.avatar_url,
         last_login_at = excluded.last_login_at
       RETURNING id`,
    )
      .bind(
        user.id,
        user.login,
        user.name ?? null,
        user.avatar_url ?? null,
        new Date(user.created_at).toISOString(),
        nowIso,
        nowIso,
      )
      .first<{ id: number }>();
    if (!account) return fail('OAUTH_FAILED');

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare(
      'INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
      .bind(
        tokenHash,
        account.id,
        nowIso,
        new Date(now.getTime() + config.sessionTtlDays * 86_400_000).toISOString(),
      )
      .run();

    return c.redirect(`${config.webOrigin}/#token=${token}`, 302);
  });

  app.post('/api/auth/logout', requireSession, async (c) => {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(c.get('session').tokenHash)
      .run();
    return c.body(null, 204);
  });
}
