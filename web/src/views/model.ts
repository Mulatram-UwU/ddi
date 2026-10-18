import { api, errorMessageKey, loginUrl } from '../api';
import type { AppContext } from '../app-context';
import { lineChart } from '../chart';
import { html, mustFind } from '../dom';
import { getLocale, t } from '../i18n';
import type { MessageKey } from '../locales/en-US';
import type { MeJson, ModelJson } from '../types';
import { captchaToken, mountTurnstile, resetCaptcha } from '../turnstile';
import {
  escapeHtml,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatScore,
  scoreClass,
} from '../util';

const RANGE_KEY = 'ddi_range';
const RANGES = ['24h', '7d', '30d', '90d'] as const;

type Range = (typeof RANGES)[number];

const activeTimers: number[] = [];

function clearTimers(): void {
  for (const timer of activeTimers) window.clearInterval(timer);
  activeTimers.length = 0;
}

function isRange(value: string | null): value is Range {
  return value !== null && (RANGES as readonly string[]).includes(value);
}

function currentRange(): Range {
  const stored = localStorage.getItem(RANGE_KEY);
  return isRange(stored) ? stored : '24h';
}

function axisLabel(range: Range) {
  return (t: number): string => {
    const date = new Date(t * 1000);
    if (range === '24h' || range === '7d') {
      return date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString(getLocale(), { month: 'numeric', day: 'numeric' });
  };
}

function cooldownMs(me: MeJson | null, model: ModelJson): number {
  if (!me || !model.my_vote) return 0;
  return Math.max(0, Date.parse(model.my_vote.next_vote_at) - Date.now());
}

function blockedDays(me: MeJson): number {
  if (!me.age_eligible_at) return 0;
  return Math.max(1, Math.ceil((Date.parse(me.age_eligible_at) - Date.now()) / 86_400_000));
}

export async function modelView(ctx: AppContext, slug: string): Promise<HTMLElement> {
  clearTimers();
  const { model } = await api.model(slug);
  ctx.setTitle('title.model', { name: model.name });

  const range = currentRange();
  const root = html(`
    <div>
      <p><a href="#/">← ${escapeHtml(t('model.back'))}</a></p>
      <h1>${escapeHtml(model.name)}</h1>
      <p class="subtitle">
        ${escapeHtml(model.provider)}
        ${
          model.homepage_url
            ? ` · <a href="${escapeHtml(model.homepage_url)}" rel="noreferrer noopener" target="_blank">${escapeHtml(t('model.homepage'))}</a>`
            : ''
        }
      </p>
      ${model.description ? `<p>${escapeHtml(model.description)}</p>` : ''}

      <div class="banner error vote-banner" hidden></div>

      <section class="card">
        <div class="vote-row">
          <div class="big-score ${scoreClass(model.score)}">${escapeHtml(formatScore(model.score))}</div>
          <div class="actions vote-actions">
            <button class="vote vote-up">↑ ${escapeHtml(t('model.vote_up'))}</button>
            <button class="vote vote-down">↓ ${escapeHtml(t('model.vote_down'))}</button>
          </div>
          <div class="hint vote-status"></div>
        </div>
        <div class="captcha" hidden>
          <div class="captcha-label">${escapeHtml(t('vote.captcha_label'))}</div>
          <div class="captcha-host"></div>
        </div>
        <div class="stats">
          <div class="stat"><div class="k">${escapeHtml(t('model.stat_net'))}</div><div class="v">${escapeHtml(
            String(model.net),
          )}</div></div>
          <div class="stat"><div class="k">${escapeHtml(t('model.stat_weight'))}</div><div class="v">${escapeHtml(
            String(model.weight),
          )}</div></div>
          <div class="stat"><div class="k">${escapeHtml(t('model.stat_votes'))}</div><div class="v">${formatNumber(
            model.up,
          )} / ${formatNumber(model.down)}</div></div>
          <div class="stat"><div class="k">${escapeHtml(t('model.stat_votes24'))}</div><div class="v">${formatNumber(
            model.recent_up,
          )} / ${formatNumber(model.recent_down)}</div></div>
        </div>
      </section>

      <section class="card">
        <h2>${escapeHtml(t('model.trend_title'))}</h2>
        <div class="ranges">
          ${RANGES.map(
            (value) =>
              `<button class="range" data-range="${value}">${escapeHtml(t(`model.range.${value}` as MessageKey))}</button>`,
          ).join('')}
        </div>
        <div class="chart-host"></div>
      </section>
    </div>
  `);

  const banner = mustFind<HTMLElement>(root, '.vote-banner');
  const upButton = mustFind<HTMLButtonElement>(root, '.vote-up');
  const downButton = mustFind<HTMLButtonElement>(root, '.vote-down');
  const status = mustFind<HTMLElement>(root, '.vote-status');
  const chartHost = mustFind<HTMLElement>(root, '.chart-host');
  const rangeButtons = [...root.querySelectorAll<HTMLButtonElement>('.range')];
  const captchaOn =
    ctx.config !== null &&
    ctx.config.turnstile_required &&
    ctx.config.turnstile_site_key.length > 0;

  const showError = (error: unknown) => {
    banner.hidden = false;
    banner.textContent = t(errorMessageKey(error) as MessageKey);
  };

  if (captchaOn) {
    const box = mustFind<HTMLElement>(root, '.captcha');
    box.hidden = false;
    try {
      await mountTurnstile(mustFind<HTMLElement>(root, '.captcha-host'), ctx.config!.turnstile_site_key);
    } catch {
      box.hidden = true;
      banner.hidden = false;
      banner.textContent = t('vote.captcha_unavailable');
    }
  }

  // --- vote buttons -------------------------------------------------------
  const applyVoteState = () => {
    const remaining = cooldownMs(ctx.me, model);
    const locked = ctx.me !== null && !ctx.me.can_vote;
    upButton.disabled = locked || remaining > 0;
    downButton.disabled = locked || remaining > 0;
    upButton.classList.toggle('active-up', model.my_vote?.value === 1);
    downButton.classList.toggle('active-down', model.my_vote?.value === -1);

    if (!ctx.me) {
      status.textContent = '';
      upButton.disabled = false;
      downButton.disabled = false;
      return;
    }
    if (locked) {
      status.textContent = t('vote.locked_age', {
        date: formatDateTime(ctx.me.age_eligible_at),
        days: blockedDays(ctx.me),
      });
      return;
    }
    if (remaining > 0) {
      status.textContent = t('vote.cooldown', { time: formatDuration(remaining) });
      const timer = window.setInterval(() => {
        const left = cooldownMs(ctx.me, model);
        if (left <= 0) {
          window.clearInterval(timer);
          ctx.rerender();
          return;
        }
        status.textContent = t('vote.cooldown', { time: formatDuration(left) });
      }, 1000);
      activeTimers.push(timer);
      return;
    }
    status.textContent = model.my_vote
      ? t('model.you_voted', {
          value: model.my_vote.value === 1 ? '↑' : '↓',
          date: formatDateTime(model.my_vote.created_at),
        })
      : '';
  };

  const castVote = async (value: 1 | -1) => {
    if (!ctx.me) {
      window.location.href = loginUrl();
      return;
    }
    const token = captchaOn ? captchaToken() : null;
    if (captchaOn && !token) {
      banner.hidden = false;
      banner.textContent = t('vote.captcha_required');
      return;
    }
    banner.hidden = true;
    upButton.disabled = true;
    downButton.disabled = true;
    try {
      const response = await api.vote(slug, value, token);
      model.score = response.model.score;
      model.net = response.model.net;
      model.weight = response.model.weight;
      model.up = response.model.up;
      model.down = response.model.down;
      model.recent_up = response.model.recent_up;
      model.recent_down = response.model.recent_down;
      model.my_vote = response.model.my_vote;
      model.last_vote_at = response.model.last_vote_at;
      ctx.rerender();
    } catch (error) {
      showError(error);
      resetCaptcha();
      applyVoteState();
    }
  };

  upButton.addEventListener('click', () => void castVote(1));
  downButton.addEventListener('click', () => void castVote(-1));
  applyVoteState();

  // --- trend chart -------------------------------------------------------
  const drawChart = async (value: Range) => {
    for (const button of rangeButtons) {
      button.classList.toggle('active', button.dataset.range === value);
    }
    chartHost.innerHTML = `<p class="hint">${escapeHtml(t('common.loading'))}</p>`;
    try {
      const history = await api.history(slug, value);
      chartHost.innerHTML = lineChart(history.points, {
        width: 720,
        height: 180,
        label: axisLabel(value),
      });
    } catch (error) {
      chartHost.innerHTML =
        `<div class="banner error">${escapeHtml(t(errorMessageKey(error) as MessageKey))}</div>` +
        `<button class="retry primary">${escapeHtml(t('common.retry'))}</button>`;
      mustFind<HTMLButtonElement>(chartHost, '.retry').addEventListener('click', () => {
        void drawChart(value);
      });
    }
  };

  for (const button of rangeButtons) {
    button.addEventListener('click', () => {
      const raw = button.dataset.range ?? '';
      if (!isRange(raw)) return;
      localStorage.setItem(RANGE_KEY, raw);
      void drawChart(raw);
    });
  }

  await drawChart(range);

  if (ctx.me?.vote_blocked_reason === 'ACCOUNT_TOO_NEW') {
    banner.hidden = false;
    banner.textContent = t('vote.locked_age', {
      date: formatDateTime(ctx.me.age_eligible_at),
      days: blockedDays(ctx.me),
    });
  }
  return root;
}
