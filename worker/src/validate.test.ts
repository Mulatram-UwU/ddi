import { describe, expect, it } from 'vitest';
import { boundedText, MODEL_LIMITS, parseHomepageUrl } from './validate';

describe('parseHomepageUrl', () => {
  it('accepts absolute http(s) URLs and normalises them', () => {
    expect(parseHomepageUrl('https://example.com')).toEqual({
      ok: true,
      value: 'https://example.com/',
    });
    expect(parseHomepageUrl('http://example.com/model')).toEqual({
      ok: true,
      value: 'http://example.com/model',
    });
  });

  it('treats an empty value as cleared, not invalid', () => {
    expect(parseHomepageUrl('   ')).toEqual({ ok: true, value: null });
    expect(parseHomepageUrl(undefined)).toEqual({ ok: true, value: null });
  });

  it('rejects script and non-web schemes', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,hi', 'mailto:a@b.c', '/relative']) {
      expect(parseHomepageUrl(value)).toEqual({ ok: false, value: null });
    }
  });

  it('rejects values over the length limit', () => {
    expect(parseHomepageUrl(`https://example.com/${'a'.repeat(MODEL_LIMITS.homepageUrl)}`).ok).toBe(
      false,
    );
  });
});

describe('boundedText', () => {
  it('trims and returns null for blank input', () => {
    expect(boundedText('  Claude  ', 20)).toEqual({ ok: true, value: 'Claude' });
    expect(boundedText('   ', 20)).toEqual({ ok: true, value: null });
  });

  it('rejects non-strings and overlong text', () => {
    expect(boundedText(42, 20).ok).toBe(false);
    expect(boundedText('x'.repeat(21), 20).ok).toBe(false);
  });
});
