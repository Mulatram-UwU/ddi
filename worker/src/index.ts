import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './auth';
import type { AppBindings } from './auth';
import { readConfig } from './config';
import type { Env } from './env';
import { apiError } from './http';
import { adminRoutes } from './routes/admin';
import { publicRoutes } from './routes/public';
import { voteRoutes } from './routes/votes';
import { snapshotAll } from './snapshot';

const app = new Hono<AppBindings>();

app.use('*', async (c, next) => {
  await next();
  const headers = c.res.headers;
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (c.req.path.startsWith('/api/')) headers.set('Cache-Control', 'no-store');
  if (new URL(c.req.url).protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

// Bearer tokens travel in the Authorization header (frontend and API live on different
// registrable domains), so no credentials and no cookie CORS is needed. Hono's cors middleware
// also emits `Vary: Origin`, so it is not set by hand.
app.use(
  '*',
  cors({
    origin: (origin, c) => (readConfig(c.env).allowedOrigins.includes(origin) ? origin : undefined),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86_400,
  }),
);

authRoutes(app);
publicRoutes(app);
voteRoutes(app);
adminRoutes(app);

app.notFound((c) => apiError(c, 404, 'MODEL_NOT_FOUND', `No route for ${c.req.method} ${c.req.path}.`));

app.onError((err, c) => {
  console.error(JSON.stringify({ msg: 'unhandled_error', error: String(err) }));
  return apiError(c, 500, 'INTERNAL', 'Unexpected server error.');
});

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  scheduled: async (event: ScheduledController, env: Env, _ctx: ExecutionContext) => {
    try {
      const result = await snapshotAll(env.DB, Math.floor(Date.now() / 1000), readConfig(env));
      console.log(JSON.stringify({ msg: 'snapshot', cron: event.cron, ...result }));
    } catch (error) {
      // Never rethrow: a failed snapshot must not turn into a cron retry storm.
      console.error(JSON.stringify({ msg: 'snapshot_failed', error: String(error) }));
    }
  },
};
