# DDI — Democratic Devified Index

A votable, transparent index of LLM quality, meant as an alternative to fixed-benchmark gaming and
opaque leaderboards. Any eligible developer account can vote 👍/👎 once per model per rolling 24
hours; the score is the half-life-decayed weighted net vote compressed through `tanh` into
`[−100, +100]`.

```
S(m,t) = Σ vᵢ · 2^(−(t−tᵢ)/H)          # half-life weighted net vote
W(m,t) = Σ      2^(−(t−tᵢ)/H)          # half-life weighted sample size
K(m,t) = max(K_min, α · √W(m,t))       # scale, so growing population does not saturate
DDI(m,t) = 100 · tanh( S(m,t) / K(m,t) )
pᵢ = exp(DDIᵢ / T) / Σⱼ exp(DDIⱼ / T)  # homepage "mind share" pie
```

- API: Cloudflare Workers + D1 (Hono router, raw SQL, no ORM).
- Frontend: static site for GitHub Pages (Vite + vanilla TypeScript, hash routing, no runtime deps).
- Auth: GitHub OAuth. Accounts younger than 90 days may sign in and browse but cannot vote.
- Model registry: administrator-only (`DDI_ADMIN_GITHUB_IDS`), no roles table.
- Snapshots: one cron run every 10 minutes stores each model's score for the 24h sparkline and the
  detail-page trend chart (24h / 7d / 30d / 90d). Snapshots are required, not an optimisation:
  scores decay with time, so history cannot be reconstructed after the fact.
- i18n: `zh-CN` and `en-US` in the frontend only; the API returns error *codes* and never localized
  text. Adding a language = one file in `web/src/locales/` plus one line in `locales/index.ts`.

## Layout

```
package.json            npm workspaces ["worker", "web"]
worker/                 Cloudflare Worker + D1
  src/{index,env,config,http,auth,models,scoring,snapshot}.ts
  src/routes/{public,votes,admin}.ts
  migrations/0001_init.sql, 0002_snapshots.sql
  scripts/seed-models.sql, dev-stub-accounts.sql
  wrangler.toml, .dev.vars.example
web/                    static frontend
  src/{main,api,session,i18n,softmax,chart,util,dom,types,app-context}.ts
  src/locales/{en-US,zh-CN,index}.ts
  src/views/{leaderboard,model,admin,about}.ts
  src/style.css, index.html, vite.config.ts
.github/workflows/      deploy-worker.yml, deploy-pages.yml
```

## Local development

Requires Node 22+.

On npm 12+, `esbuild` and `workerd` postinstall scripts are blocked by default, which breaks
`vite` and `wrangler`. Approve them once after the first install:

```bash
npm install
npm install-scripts approve esbuild workerd && npm rebuild esbuild workerd
```

Then:

```bash
cd worker
npx wrangler d1 migrations apply ddi --local
npx wrangler d1 execute ddi --local --file scripts/seed-models.sql
npx wrangler d1 execute ddi --local --file scripts/dev-stub-accounts.sql
cp .dev.vars.example .dev.vars        # fill in GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
npx wrangler dev --test-scheduled     # http://localhost:8787
```

`.dev.vars` ships with placeholder OAuth credentials, so GitHub sign-in does not work out of the
box — GitHub answers an unknown client id with its own **page not found** at `/login/oauth/authorize`.

**Two ways to get a usable session locally:**

**1. Dev sign-in (no setup).** With `DDI_DEV_LOGIN_ENABLED=true` (the default in `.dev.vars`) the
header shows `Dev sign-in · 730d` / `Dev sign-in · 10d`. They mint a normal session for the two stub
accounts, so voting, the admin page and the 90-day gate are all clickable immediately. The route is
double-gated: it returns 404 unless the variable is set **and** `DDI_WORKER_ORIGIN` is plain `http`,
so a deployed Worker can never expose it.

**2. Real GitHub OAuth.** Create an OAuth App (GitHub → Settings → Developer settings → OAuth Apps →
New OAuth App):

| field | value |
| --- | --- |
| Homepage URL | `http://localhost:5173/` |
| Authorization callback URL | `http://localhost:8787/api/auth/github/callback` |

The callback URL must match byte for byte. Then put the Client ID and Secret into
`worker/.dev.vars` and reload the Worker. `scripts/dev-stub-accounts.sql` is a third option: it
pre-creates both sessions, so `localStorage.ddi_token` can be set by hand instead.

In a second terminal:

```bash
npm run dev:web                       # http://localhost:5173
```

`--test-scheduled` exposes `GET /__scheduled?cron=*%2F10+*+*+*+*` so you can trigger the snapshot
cron by hand:

```bash
curl "http://localhost:8787/__scheduled?cron=%2A%2F10+%2A+%2A+%2A+%2A"
```

### Local fixtures

`scripts/dev-stub-accounts.sql` creates two accounts with sessions, so you can skip the OAuth round
trip by putting one of these in `localStorage.ddi_token` (or an `Authorization: Bearer` header):

| token | GitHub account age | behaviour |
| --- | --- | --- |
| `devtoken-old` | 2 years | may vote; is an admin when `DDI_ADMIN_GITHUB_IDS` includes its github id |
| `devtoken-new` | 10 days | may sign in and browse, voting returns 403 `ACCOUNT_TOO_NEW` |

### Captcha on votes

Voting requires a Cloudflare Turnstile token. The Worker verifies it against
`challenges.cloudflare.com/turnstile/v0/siteverify` between the cooldown check and the write, so a
vote that would be rejected anyway never consumes a token. Failures return 403 `CAPTCHA_FAILED`;
if the verifier is unreachable the vote is rejected (fail closed).

`.dev.vars` uses Cloudflare's documented **test** keys (`1x0000…AA` site / `1x0000…AA` secret): the
widget always passes, so local voting works without registering anything. `turnstile_required` is
exposed by `/api/config` and printed on `#/about`; it is only `true` when both keys look real, so a
half-configured deploy keeps working instead of locking everyone out.

For production: create a Turnstile site (Cloudflare dashboard → Turnstile), put the site key in
`wrangler.toml` `DDI_TURNSTILE_SITE_KEY`, the secret in
`npx wrangler secret put TURNSTILE_SECRET_KEY`, and add the Pages hostname to the site's domain list.
The widget script is the only third-party script on the site and is loaded on the model page only —
the leaderboard never fetches it.

### Tests

```bash
npm test          # worker + web (vitest)
npm run typecheck # worker + web (tsc --noEmit)
```

## Deploy

1. `npx wrangler login` and `cd worker && npx wrangler d1 create ddi`; put the returned
   `database_id` into `wrangler.toml`.
2. Apply migrations and seed remotely:
   `npx wrangler d1 migrations apply ddi --remote`,
   `npx wrangler d1 execute ddi --remote --file scripts/seed-models.sql`.
3. GitHub OAuth App: homepage `https://<user>.github.io/ddi/`, callback
   `https://ddi-api.<subdomain>.workers.dev/api/auth/github/callback` (plus a second callback
   `http://localhost:8787/api/auth/github/callback` for local dev).
4. `npx wrangler secret put GITHUB_CLIENT_ID` and `… GITHUB_CLIENT_SECRET`.
5. Repo settings: Pages source = GitHub Actions; Actions secrets `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`; Actions variable `DDI_API_BASE`.
6. Fill `DDI_WORKER_ORIGIN`, `DDI_WEB_ORIGIN`, `DDI_ALLOWED_ORIGINS` and `DDI_ADMIN_GITHUB_IDS` in
   `wrangler.toml` `[vars]`.

### Free-tier budget

Workers free tier: 100k requests/day. D1 free tier: 5M rows read/day, 100k rows written/day, 5 GB.

| operation | rows touched |
| --- | --- |
| `GET /api/models` | ≈ `6 × active models` + (24 × active models) sparkline rows |
| `POST …/vote` | 1 read + 1 `batch()` of 2 statements |
| `GET …/history` | ≤ 240 rows |
| snapshot cron | `144 × active models` writes/day, plus one bounded delete |

Worst-case read for a 20-model leaderboard is ~600 rows, i.e. ~8k leaderboard views/day inside the
free tier. Snapshot writes cap the registry at roughly 600 models (`144 × N ≤ 100k`). If the
registry grows past ~500 models, filter the snapshot set to models with `weight >= 0.001`.

## Configuration

All tunables are `wrangler.toml` `[vars]` (local overrides live in the gitignored `.dev.vars`); the
frontend shows the live values on `#/about`.

| variable | default | meaning |
| --- | --- | --- |
| `DDI_HALF_LIFE_HOURS` | `8` | vote weight half-life |
| `DDI_SCORE_ALPHA` | `3` | scale coefficient α |
| `DDI_K_MIN` | `3` | scale floor K_min |
| `DDI_VOTE_COOLDOWN_HOURS` | `24` | rolling cooldown per account per model |
| `DDI_MIN_GITHUB_AGE_DAYS` | `90` | minimum GitHub account age to vote |
| `DDI_SESSION_TTL_DAYS` | `30` | session lifetime |
| `DDI_SNAPSHOT_BUCKET_MINUTES` | `10` | snapshot interval |
| `DDI_SNAPSHOT_RETENTION_DAYS` | `90` | snapshot retention (upper bound of the trend ranges) |
| `DDI_SOFTMAX_TEMP` | `10` | initial softmax temperature of the homepage pie |
| `DDI_WORKER_ORIGIN` / `DDI_WEB_ORIGIN` / `DDI_ALLOWED_ORIGINS` | — | OAuth + CORS origins |
| `DDI_ADMIN_GITHUB_IDS` | — | comma-separated GitHub numeric ids |

An 8-hour half-life makes DDI a snapshot of the last one to two days: a vote from 24h ago keeps only
12.5% of its weight. If the leaderboard feels too twitchy or most models hug 0, raise
`DDI_HALF_LIFE_HOURS` to `24`, `72` or `168` — no code change or rescore needed.
