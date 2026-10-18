import { DEFAULT_LOCALE, LOCALES, isLocaleId } from './locales';
import type { LocaleId } from './locales';
import type { MessageKey } from './locales/en-US';

const STORAGE_KEY = 'ddi_locale';

const listeners: (() => void)[] = [];

let current: LocaleId = resolveInitialLocale();

export function detectLocale(navLangs: readonly string[]): LocaleId {
  for (const tag of navLangs) {
    if (tag.toLowerCase().startsWith('zh')) return 'zh-CN';
  }
  return DEFAULT_LOCALE;
}

function storedLocale(): LocaleId | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw && isLocaleId(raw) ? raw : null;
}

function resolveInitialLocale(): LocaleId {
  const stored = storedLocale();
  if (stored) return stored;
  const navLangs =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];
  return detectLocale(navLangs);
}

export function getLocale(): LocaleId {
  return current;
}

export function applyDocumentLocale(): void {
  document.documentElement.lang = current;
}

export function setLocale(id: LocaleId): void {
  current = id;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  applyDocumentLocale();
  for (const listener of listeners) listener();
}

export function onLocaleChange(fn: () => void): void {
  listeners.push(fn);
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const messages: Record<string, string> = LOCALES[current].messages;
  let template = messages[key];
  if (template === undefined) {
    template = (LOCALES[DEFAULT_LOCALE].messages as Record<string, string>)[key];
  }
  if (template === undefined) return key;
  if (!params) return template;
  for (const [name, value] of Object.entries(params)) {
    template = template.replaceAll(`{${name}}`, String(value));
  }
  return template;
}

export function localeLabel(id: LocaleId): string {
  return LOCALES[id].label;
}
