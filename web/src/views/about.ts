import type { AppContext } from '../app-context';
import { html } from '../dom';
import { t } from '../i18n';
import { escapeHtml } from '../util';

export function aboutView(ctx: AppContext): HTMLElement {
  ctx.setTitle('title.about');
  const config = ctx.config;

  const params = config
    ? [
        `DDI_HALF_LIFE_HOURS = ${config.half_life_hours}`,
        `DDI_SCORE_ALPHA = ${config.score_alpha}`,
        `DDI_K_MIN = ${config.k_min}`,
        `DDI_VOTE_COOLDOWN_HOURS = ${config.vote_cooldown_hours}`,
        `DDI_MIN_GITHUB_AGE_DAYS = ${config.min_github_age_days}`,
        `DDI_SESSION_TTL_DAYS = ${config.session_ttl_days}`,
        `DDI_SNAPSHOT_BUCKET_MINUTES = ${config.snapshot_bucket_minutes}`,
        `DDI_SNAPSHOT_RETENTION_DAYS = ${config.snapshot_retention_days}`,
        `DDI_SOFTMAX_TEMP = ${config.softmax_temp}`,
        `TURNSTILE_REQUIRED = ${config.turnstile_required ? 'on' : 'off'}`,
      ]
    : [];

  return html(`
    <div>
      <h1>${escapeHtml(t('about.title'))}</h1>
      <p class="subtitle">${escapeHtml(t('about.intro'))}</p>

      <section class="card">
        <h2>${escapeHtml(t('about.formula_title'))}</h2>
        <p class="formula">DDI(m, t) = 100 · tanh( S(m, t) / max(K_min, α · √W(m, t)) )
S(m, t) = Σ vᵢ · 2^(−(t − tᵢ)/H)
W(m, t) = Σ 2^(−(t − tᵢ)/H)
pᵢ = exp(DDIᵢ / T) / Σⱼ exp(DDIⱼ / T)</p>
        <p class="hint">${escapeHtml(t('about.formula_body'))}</p>
      </section>

      <section class="card">
        <h2>${escapeHtml(t('about.params_title'))}</h2>
        <ul class="param-list">
          ${params.map((line) => `<li><code>${escapeHtml(line)}</code></li>`).join('')}
        </ul>
      </section>

      <section class="card">
        <h2>${escapeHtml(t('about.cooldown_title'))}</h2>
        <p>${escapeHtml(t('about.cooldown_body'))}</p>
      </section>

      <section class="card">
        <h2>${escapeHtml(t('about.gate_title'))}</h2>
        <p>${escapeHtml(t('about.gate_body'))}</p>
      </section>

      <section class="card">
        <h2>${escapeHtml(t('about.softmax_title'))}</h2>
        <p>${escapeHtml(t('about.softmax_body'))}</p>
        <p class="hint">${escapeHtml(t('about.pie_note'))}</p>
      </section>
    </div>
  `);
}
