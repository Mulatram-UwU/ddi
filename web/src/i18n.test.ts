import { describe, expect, it } from 'vitest';
import { detectLocale } from './i18n';
import { enUS } from './locales/en-US';
import type { MessageKey } from './locales/en-US';
import { zhCN } from './locales/zh-CN';

describe('detectLocale', () => {
  it('maps every zh variant to zh-CN', () => {
    expect(detectLocale(['zh-Hans-CN'])).toBe('zh-CN');
    expect(detectLocale(['zh'])).toBe('zh-CN');
    expect(detectLocale(['en-US', 'zh-Hant-TW'])).toBe('zh-CN');
  });

  it('falls back to en-US for anything else', () => {
    expect(detectLocale(['fr-FR'])).toBe('en-US');
    expect(detectLocale([])).toBe('en-US');
    expect(detectLocale(['ZH-cn'])).toBe('zh-CN');
  });
});

describe('zh-CN catalogue', () => {
  it('has no empty strings', () => {
    const empty = Object.entries(zhCN)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('keeps every interpolation placeholder of the English source', () => {
    const placeholders = (value: string) => (value.match(/\{[a-z_]+\}/g) ?? []).sort().join(',');
    const mismatch = (Object.keys(enUS) as MessageKey[]).filter(
      (key) => placeholders(enUS[key]) !== placeholders(zhCN[key]),
    );
    expect(mismatch).toEqual([]);
  });
});
