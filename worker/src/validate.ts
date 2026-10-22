/**
 * Field validation for administrator-edited registry rows. Keeping it here (instead of inline in
 * the route) lets the rules be unit-tested without a D1 binding.
 */

export const MODEL_LIMITS = {
  name: 100,
  provider: 80,
  description: 2_000,
  homepageUrl: 300,
} as const;

export interface ParsedText {
  ok: boolean;
  value: string | null;
}

/** Trimmed text, or null when the field is empty. `ok` is false when it is too long/wrong type. */
export function boundedText(value: unknown, max: number): ParsedText {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, value: null };
  const text = value.trim();
  if (text.length === 0) return { ok: true, value: null };
  if (text.length > max) return { ok: false, value: null };
  return { ok: true, value: text };
}

/** Only absolute http(s) URLs are accepted: `javascript:` in an href is script execution. */
export function parseHomepageUrl(value: unknown): ParsedText {
  const parsed = boundedText(value, MODEL_LIMITS.homepageUrl);
  if (!parsed.ok || parsed.value === null) return parsed;
  try {
    const url = new URL(parsed.value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, value: null };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, value: null };
  }
}
