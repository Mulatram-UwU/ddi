import { getLocale, t } from './i18n';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

export function formatScore(score: number): string {
  const rounded = Math.abs(score) < 0.05 ? 0 : score;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString(getLocale());
}

export function scoreClass(score: number): string {
  if (score > 0.05) return 'score-pos';
  if (score < -0.05) return 'score-neg';
  return 'score-zero';
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return t('common.dash');
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return t('common.dash');
  return new Date(ms).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return t('common.dash');
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return t('common.dash');
  const diffSeconds = Math.round((ms - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  if (Math.abs(diffSeconds) < 60) return formatter.format(diffSeconds, 'second');
  const minutes = Math.round(diffSeconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(diffSeconds / 3600);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(diffSeconds / 86_400), 'day');
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
