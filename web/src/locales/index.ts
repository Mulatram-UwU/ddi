import { enUS } from './en-US';
import { zhCN } from './zh-CN';

export const LOCALES = {
  'en-US': { label: 'English', messages: enUS },
  'zh-CN': { label: '中文', messages: zhCN },
} as const;

export type LocaleId = keyof typeof LOCALES;

export const DEFAULT_LOCALE: LocaleId = 'en-US';

export const LOCALE_IDS = Object.keys(LOCALES) as LocaleId[];

export function isLocaleId(value: string): value is LocaleId {
  return Object.prototype.hasOwnProperty.call(LOCALES, value);
}
