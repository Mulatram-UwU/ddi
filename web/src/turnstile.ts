interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: 'auto' | 'light' | 'dark';
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loader: Promise<TurnstileApi> | null = null;
let widgetId: string | null = null;
let currentToken: string | null = null;

/**
 * Loads Cloudflare's widget script on demand. The only third-party script on the site, and it is
 * fetched from the model page only — never on the leaderboard.
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
    script.addEventListener('load', () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('turnstile: script loaded without api'));
    });
    script.addEventListener('error', () => reject(new Error('turnstile: script failed to load')));
  });
  return loader;
}

export async function mountTurnstile(container: HTMLElement, siteKey: string): Promise<void> {
  const api = await loadTurnstile();
  removeCaptcha();
  currentToken = null;
  widgetId = api.render(container, {
    sitekey: siteKey,
    theme: 'auto',
    callback: (token) => {
      currentToken = token;
      container.dataset.state = 'ready';
    },
    'expired-callback': () => {
      currentToken = null;
      container.dataset.state = 'expired';
    },
    'error-callback': () => {
      currentToken = null;
      container.dataset.state = 'error';
    },
  });
}

export function captchaToken(): string | null {
  return currentToken;
}

/** Tokens are single-use: drop the old one and let the widget hand out a fresh one. */
export function resetCaptcha(): void {
  currentToken = null;
  if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
}

export function removeCaptcha(): void {
  if (widgetId !== null && window.turnstile) {
    try {
      window.turnstile.remove(widgetId);
    } catch {
      // Widget already gone (container replaced); nothing to clean up.
    }
  }
  widgetId = null;
  currentToken = null;
}
