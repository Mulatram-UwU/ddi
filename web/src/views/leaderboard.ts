import { api } from '../api';
import type { AppContext } from '../app-context';
import { pieChart, sparkline } from '../chart';
import { html, mustFind } from '../dom';
import { t } from '../i18n';
import { topSlices } from '../softmax';
import type { ModelJson } from '../types';
import {
  escapeHtml,
  formatNumber,
  formatRelative,
  formatScore,
  scoreClass,
} from '../util';

const TEMP_STORAGE_KEY = 'ddi_softmax_temp';
const PIE_SIZE = 320;

function initialTemp(config: { softmax_temp: number } | null): number {
  const stored = Number(localStorage.getItem(TEMP_STORAGE_KEY));
  if (Number.isFinite(stored) && stored >= 1 && stored <= 100) return Math.round(stored);
  return config ? Math.round(config.softmax_temp) : 10;
}

function readout(temp: number): string {
  return t('home.pie_temp', { temp });
}

export async function leaderboardView(ctx: AppContext): Promise<HTMLElement> {
  ctx.setTitle('title.leaderboard');
  const { models } = await api.models();

  const providers = [...new Set(models.map((model) => model.provider))].sort((a, b) =>
    a.localeCompare(b),
  );
  let temp = initialTemp(ctx.config);
  let providerFilter = '';
  let query = '';

  const providerOptions = providers
    .map((provider) => `<option value="${escapeHtml(provider)}">${escapeHtml(provider)}</option>`)
    .join('');

  const root = html(`
    <div>
      <header class="hero">
        <h1>${escapeHtml(t('home.title'))}</h1>
        <p class="subtitle">${escapeHtml(t('home.subtitle'))}</p>
      </header>

      <section class="card">
        <div class="card-head">
          <h2>${escapeHtml(t('home.pie_title'))}</h2>
          <div class="temp-control">
            <span class="temp-readout"></span>
            <input class="temp-slider" type="range" min="1" max="100" step="1" aria-label="T" />
          </div>
        </div>
        <div class="pie-wrap">
          <div class="pie-host"></div>
          <div class="legend"></div>
        </div>
        <p class="hint pie-hint"></p>
      </section>

      <section class="card">
        <div class="toolbar">
          <select class="provider-filter">
            <option value="">${escapeHtml(t('home.filter_provider'))}</option>
            ${providerOptions}
          </select>
          <input class="search" type="search" placeholder="${escapeHtml(t('home.search_placeholder'))}" />
        </div>
        <div class="table-wrap">
        <table class="models-table">
          <thead>
            <tr>
              <th class="rank">${escapeHtml(t('home.th_rank'))}</th>
              <th>${escapeHtml(t('home.th_model'))}</th>
              <th class="num">${escapeHtml(t('home.th_score'))}</th>
              <th>${escapeHtml(t('home.th_trend'))}</th>
              <th class="num">${escapeHtml(t('home.th_change'))}</th>
              <th class="num">${escapeHtml(t('home.th_votes24'))}</th>
              <th class="num">${escapeHtml(t('home.th_votes'))}</th>
              <th class="num">${escapeHtml(t('home.th_weight'))}</th>
              <th>${escapeHtml(t('home.th_last'))}</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        </div>
        <p class="hint table-empty" hidden>${escapeHtml(t('home.empty'))}</p>
      </section>
    </div>
  `);

  const pieHost = mustFind<HTMLElement>(root, '.pie-host');
  const legend = mustFind<HTMLElement>(root, '.legend');
  const pieHint = mustFind<HTMLElement>(root, '.pie-hint');
  const slider = mustFind<HTMLInputElement>(root, '.temp-slider');
  const readoutEl = mustFind<HTMLElement>(root, '.temp-readout');
  const tbody = mustFind<HTMLElement>(root, 'tbody');
  const emptyRow = mustFind<HTMLElement>(root, '.table-empty');

  // Recomputing the pie is pure client-side work: same /api/models payload, no refetch, no
  // full re-render (a full re-render would drop the table filters and the scroll position).
  const drawPie = (value: number) => {
    readoutEl.textContent = readout(value);
    if (models.length === 0) {
      pieHost.innerHTML = '';
      legend.innerHTML = '';
      pieHint.textContent = t('home.pie_empty');
      return;
    }
    const slices = topSlices(
      models.map((model) => model.name),
      models.map((model) => model.score),
      value,
      (count) => t('home.pie_other', { count }),
    );
    pieHost.innerHTML = pieChart(slices, { size: PIE_SIZE });
    legend.innerHTML = slices
      .map(
        (slice) => `
          <div class="legend-row">
            <span class="swatch" style="background:${slice.color ?? 'var(--muted)'}"></span>
            <span class="legend-name">${escapeHtml(slice.label)}</span>
            <span class="legend-pct">${escapeHtml(slice.pct)}%</span>
          </div>`,
      )
      .join('');

    const uniform = new Set(models.map((model) => model.score)).size === 1;
    pieHint.textContent = uniform ? t('home.pie_uniform') : '';
  };

  slider.value = String(temp);
  drawPie(temp);

  // Nothing to weigh up with zero models: a slider that changes nothing is just noise.
  if (models.length === 0) mustFind<HTMLElement>(root, '.temp-control').hidden = true;

  slider.addEventListener('input', () => {
    temp = Math.max(1, Math.min(100, Number(slider.value) || 1));
    localStorage.setItem(TEMP_STORAGE_KEY, String(temp));
    drawPie(temp);
  });

  const rankOf = new Map(models.map((model, index) => [model, index + 1]));

  const rowHtml = (model: ModelJson, rank: number) => `
    <tr>
      <td class="rank">${
        rank <= 3 ? `<span class="rank-badge rank-${rank}">${rank}</span>` : rank
      }</td>
      <td class="model-cell">
        <a class="model-name" href="#/m/${encodeURIComponent(model.slug)}">${escapeHtml(model.name)}</a>
        <span class="provider-chip">${escapeHtml(model.provider)}</span>
      </td>
      <td class="num ${scoreClass(model.score)}">${escapeHtml(formatScore(model.score))}</td>
      <td>${sparkline(model.sparkline, 96, 28)}</td>
      <td class="num ${
        model.change_24h === null ? 'score-zero' : scoreClass(model.change_24h)
      }">${
        model.change_24h === null
          ? escapeHtml(t('common.dash'))
          : escapeHtml(formatScore(model.change_24h))
      }</td>
      <td class="num">${formatNumber(model.recent_up)} / ${formatNumber(model.recent_down)}</td>
      <td class="num">${formatNumber(model.up)} / ${formatNumber(model.down)}</td>
      <td class="num">${formatNumber(Math.round(model.weight * 100) / 100)}</td>
      <td>${escapeHtml(formatRelative(model.last_vote_at))}</td>
    </tr>`;

  const drawTable = () => {
    const needle = query.trim().toLowerCase();
    const filtered = models.filter((model) => {
      if (providerFilter && model.provider !== providerFilter) return false;
      if (!needle) return true;
      return (
        model.name.toLowerCase().includes(needle) ||
        model.provider.toLowerCase().includes(needle) ||
        model.slug.includes(needle)
      );
    });
    tbody.innerHTML = filtered
      .map((model) => rowHtml(model, rankOf.get(model) ?? 0))
      .join('');
    emptyRow.hidden = filtered.length > 0;
  };

  mustFind<HTMLSelectElement>(root, '.provider-filter').addEventListener('change', (event) => {
    providerFilter = (event.target as HTMLSelectElement).value;
    drawTable();
  });
  mustFind<HTMLInputElement>(root, '.search').addEventListener('input', (event) => {
    query = (event.target as HTMLInputElement).value;
    drawTable();
  });

  drawTable();
  return root;
}
