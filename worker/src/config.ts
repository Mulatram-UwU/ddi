import type { Env } from './env';

export interface Config {
  halfLifeHours: number;
  scoreAlpha: number;
  kMin: number;
  voteCooldownHours: number;
  minGithubAgeDays: number;
  sessionTtlDays: number;
  snapshotBucketMinutes: number;
  snapshotRetentionDays: number;
  softmaxTemp: number;
  workerOrigin: string;
  webOrigin: string;
  allowedOrigins: string[];
  adminGithubIds: number[];
  turnstileSiteKey: string;
  /** Captcha is enforced only when both keys look real; a half-configured deploy can still vote. */
  turnstileRequired: boolean;
  /**
   * Local-only sign-in shortcut (never available over https, so a deployed Worker cannot enable it
   * even by setting the variable).
   */
  devLoginEnabled: boolean;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== undefined && value !== '' ? parsed : fallback;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const PLACEHOLDER_RE = /^(|REPLACE.*|local-dev-placeholder)$/;

export function readConfig(env: Env): Config {
  const turnstileSiteKey = (env.DDI_TURNSTILE_SITE_KEY ?? '').trim();
  const turnstileSecret = (env.TURNSTILE_SECRET_KEY ?? '').trim();
  const workerOrigin = (env.DDI_WORKER_ORIGIN ?? '').replace(/\/+$/, '');
  return {
    halfLifeHours: num(env.DDI_HALF_LIFE_HOURS, 8),
    scoreAlpha: num(env.DDI_SCORE_ALPHA, 3),
    kMin: num(env.DDI_K_MIN, 3),
    voteCooldownHours: num(env.DDI_VOTE_COOLDOWN_HOURS, 24),
    minGithubAgeDays: num(env.DDI_MIN_GITHUB_AGE_DAYS, 90),
    sessionTtlDays: num(env.DDI_SESSION_TTL_DAYS, 30),
    snapshotBucketMinutes: num(env.DDI_SNAPSHOT_BUCKET_MINUTES, 10),
    snapshotRetentionDays: num(env.DDI_SNAPSHOT_RETENTION_DAYS, 90),
    softmaxTemp: num(env.DDI_SOFTMAX_TEMP, 10),
    workerOrigin,
    webOrigin: (env.DDI_WEB_ORIGIN ?? '').replace(/\/+$/, ''),
    allowedOrigins: list(env.DDI_ALLOWED_ORIGINS).map((origin) => origin.replace(/\/+$/, '')),
    adminGithubIds: list(env.DDI_ADMIN_GITHUB_IDS)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id)),
    turnstileSiteKey,
    turnstileRequired: !PLACEHOLDER_RE.test(turnstileSiteKey) && !PLACEHOLDER_RE.test(turnstileSecret),
    devLoginEnabled:
      (env.DDI_DEV_LOGIN_ENABLED ?? '').trim() === 'true' && !workerOrigin.startsWith('https://'),
  };
}

export function publicConfig(config: Config): Record<string, number | string | boolean> {
  return {
    half_life_hours: config.halfLifeHours,
    score_alpha: config.scoreAlpha,
    k_min: config.kMin,
    vote_cooldown_hours: config.voteCooldownHours,
    min_github_age_days: config.minGithubAgeDays,
    session_ttl_days: config.sessionTtlDays,
    snapshot_bucket_minutes: config.snapshotBucketMinutes,
    snapshot_retention_days: config.snapshotRetentionDays,
    softmax_temp: config.softmaxTemp,
    turnstile_site_key: config.turnstileSiteKey,
    turnstile_required: config.turnstileRequired,
    dev_login_enabled: config.devLoginEnabled,
  };
}
