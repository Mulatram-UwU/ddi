export interface Env {
  DB: D1Database;

  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;

  /** Set with `wrangler secret put TURNSTILE_SECRET_KEY`; absent = captcha disabled. */
  TURNSTILE_SECRET_KEY?: string;

  DDI_TURNSTILE_SITE_KEY: string;
  /** Local-only sign-in shortcut. Ignored unless the Worker origin is plain http. */
  DDI_DEV_LOGIN_ENABLED?: string;
  DDI_HALF_LIFE_HOURS: string;
  DDI_SCORE_ALPHA: string;
  DDI_K_MIN: string;
  DDI_VOTE_COOLDOWN_HOURS: string;
  DDI_MIN_GITHUB_AGE_DAYS: string;
  DDI_SESSION_TTL_DAYS: string;
  DDI_SNAPSHOT_BUCKET_MINUTES: string;
  DDI_SNAPSHOT_RETENTION_DAYS: string;
  DDI_SOFTMAX_TEMP: string;
  DDI_WORKER_ORIGIN: string;
  DDI_WEB_ORIGIN: string;
  DDI_ALLOWED_ORIGINS: string;
  DDI_ADMIN_GITHUB_IDS: string;
}
