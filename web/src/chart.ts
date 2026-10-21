import { t } from './i18n';
import type { HistoryPoint } from './types';
import { escapeHtml } from './util';

// One hue instead of a rainbow: wedges are blends between two theme-provided endpoints
// (--ramp-strong → --ramp-weak), spread evenly across the number of displayed slices so any
// registry size gets distinct steps. The only neutral slice is the merged "others".
const RAMP_HEAD = 100;
const RAMP_TAIL = 8;

export const PIE_MUTED_COLOR = 'color-mix(in srgb, var(--muted) 45%, var(--surface))';

export function pieColor(index: number, total: number): string {
  const pct =
    total <= 1 ? RAMP_HEAD : RAMP_HEAD - ((RAMP_HEAD - RAMP_TAIL) * index) / (total - 1);
  return `color-mix(in oklab, var(--ramp-strong) ${pct.toFixed(1)}%, var(--ramp-weak))`;
}

export interface PieSlice {
  label: string;
  share: number;
  pct: string;
  score: number | null;
  color?: string;
}

const Y_MIN = -100;
const Y_MAX = 100;

function toY(score: number, top: number, bottom: number): number {
  const clamped = Math.max(Y_MIN, Math.min(Y_MAX, score));
  const ratio = (Y_MAX - clamped) / (Y_MAX - Y_MIN);
  return top + ratio * (bottom - top);
}

export function sparkline(values: number[], width = 96, height = 28): string {
  if (values.length < 2) {
    return `<span class="spark-empty">${escapeHtml(t('common.dash'))}</span>`;
  }
  const top = 2;
  const bottom = height - 2;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => `${(index * step).toFixed(2)},${toY(value, top, bottom).toFixed(2)}`)
    .join(' ');
  return (
    `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">` +
    `<polyline points="${points}" fill="none" stroke-linejoin="round" stroke-linecap="round" /></svg>`
  );
}

export interface LineChartOptions {
  width: number;
  height: number;
  label: (t: number) => string;
}

export function lineChart(points: HistoryPoint[], opts: LineChartOptions): string {
  const { width, height } = opts;
  const left = 38;
  const right = 10;
  const top = 10;
  const bottom = height - 22;

  if (points.length === 0) {
    return (
      `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="chart-empty">` +
      `${escapeHtml(t('model.no_snapshots'))}</text></svg>`
    );
  }

  const ticks = [100, 50, 0, -50, -100];
  let grid = '';
  for (const tick of ticks) {
    const y = toY(tick, top, bottom);
    const strong = tick === 0 ? ' chart-grid-zero' : '';
    grid +=
      `<line x1="${left}" y1="${y.toFixed(2)}" x2="${width - right}" y2="${y.toFixed(2)}" class="chart-grid${strong}" />` +
      `<text x="${left - 6}" y="${(y + 3.5).toFixed(2)}" text-anchor="end" class="chart-tick">${tick}</text>`;
  }

  const plotWidth = width - left - right;
  const stepX = points.length === 1 ? 0 : plotWidth / (points.length - 1);
  const coords = points.map((point, index) => ({
    x: left + index * stepX,
    y: toY(point.score, top, bottom),
  }));
  const line = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = `${line} ${last.x.toFixed(2)},${bottom.toFixed(2)} ${first.x.toFixed(2)},${bottom.toFixed(2)}`;

  const labelCount = Math.min(4, points.length);
  let axis = '';
  for (let i = 0; i < labelCount; i += 1) {
    const index =
      labelCount === 1 ? points.length - 1 : Math.round((i * (points.length - 1)) / (labelCount - 1));
    const anchor = i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle';
    axis +=
      `<text x="${coords[index].x.toFixed(2)}" y="${height - 6}" text-anchor="${anchor}" class="chart-tick">` +
      `${escapeHtml(opts.label(points[index].t))}</text>`;
  }

  return (
    `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    grid +
    `<polygon points="${area}" class="chart-area" />` +
    `<polyline points="${line}" class="chart-line" />` +
    axis +
    `</svg>`
  );
}

export interface PieChartOptions {
  size: number;
}

export function pieChart(slices: PieSlice[], opts: PieChartOptions): string {
  const size = opts.size;
  const radius = size / 2 - 4;
  const center = size / 2;
  const visible = slices.filter((slice) => slice.share > 0);
  const total = visible.reduce((sum, slice) => sum + slice.share, 0);
  const open = `<svg class="pie" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">`;
  if (total <= 0) return `${open}</svg>`;

  const pointAt = (angle: number) => ({
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  });

  // Wedges are separated by a surface-coloured hairline: the ring keeps neighbouring steps of the
  // ink ramp visually distinct without introducing borders or shadows.
  const sep = ` stroke="var(--surface)" stroke-width="1"`;

  let sweepTotal = 0;
  let paths = '';
  for (let index = 0; index < visible.length; index += 1) {
    const slice = visible[index];
    const sweep = (slice.share / total) * Math.PI * 2;
    const color = slice.color ?? pieColor(index, visible.length);
    const title = `<title>${escapeHtml(slice.label)}: ${escapeHtml(slice.pct)}%</title>`;
    // A single slice (or one taking the whole circle) degenerates into an arc with coincident
    // endpoints, which renders blank — draw an explicit circle instead.
    if (sweep >= Math.PI * 2 - 0.0001) {
      paths += `<circle cx="${center}" cy="${center}" r="${radius}" fill="${color}"${sep}>${title}</circle>`;
      sweepTotal += sweep;
      continue;
    }
    const start = -Math.PI / 2 + sweepTotal;
    const end = start + sweep;
    const from = pointAt(start);
    const to = pointAt(end);
    const largeArc = sweep > Math.PI ? 1 : 0;
    paths +=
      `<path d="M ${center} ${center} L ${from.x.toFixed(3)} ${from.y.toFixed(3)} ` +
      `A ${radius} ${radius} 0 ${largeArc} 1 ${to.x.toFixed(3)} ${to.y.toFixed(3)} Z" ` +
      `fill="${color}"${sep}>${title}</path>`;
    sweepTotal += sweep;
  }
  return `${open}${paths}<circle class="pie-hole" cx="${center}" cy="${center}" r="${(radius * 0.62).toFixed(3)}" /></svg>`;
}
