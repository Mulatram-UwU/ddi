import './style.css';
import { api, errorMessageKey, loginUrl } from './api';
import type { AppContext } from './app-context';
import { mustFind } from './dom';
import { applyDocumentLocale, getLocale, localeLabel, onLocaleChange, setLocale, t } from './i18n';
import { LOCALE_IDS, isLocaleId } from './locales';
import type { MessageKey } from './locales/en-US';
import { clearToken, consumeAuthFragment, getToken, setToken } from './session';
import { removeCaptcha } from './turnstile';
import type { ConfigJson, MeJson } from './types';
import { escapeHtml } from './util';
import { aboutView } from './views/about';
import { adminView } from './views/admin';
import { leaderboardView } from './views/leaderboard';
import { modelView } from './views/model';

const rootEl = document.getElementById('app');
if (!rootEl) throw new Error('missing #app');

const headerEl = document.createElement('header');
const viewEl = document.createElement('main');
const bannerEl = document.createElement('div');
bannerEl.className = 'banner error';
bannerEl.hidden = true;
rootEl.append(headerEl, bannerEl, viewEl);

let me: MeJson | null = null;
let config: ConfigJson | null = null;
let titleSpec: { key: MessageKey; params?: Record<string, string | number> } = {
  key: 'title.leaderboard',
};
let renderToken = 0;

const ctx: AppContext = {
  me: null,
  config: null,
  async reloadMe() {
    me = getToken() ? await api.me() : null;
    ctx.me = me;
    renderHeader();
  },
  rerender() {
    void renderRoute();
  },
  setTitle(key, params) {
    titleSpec = { key, params };
    document.title = t(key, params);
  },
};

function showGlobalError(key: MessageKey): void {
  bannerEl.hidden = false;
  bannerEl.textContent = t(key);
}

function renderHeader(): void {
  const account = me;
  headerEl.className = 'topbar';
  headerEl.innerHTML = `
    <a class="brand" href="#/">DDI</a>
    <nav>
      <a href="#/">${escapeHtml(t('nav.leaderboard'))}</a>
      <a href="#/about">${escapeHtml(t('nav.about'))}</a>
      ${account?.is_admin ? `<a href="#/admin">${escapeHtml(t('nav.admin'))}</a>` : ''}
    </nav>
    <div class="spacer"></div>
    <select class="locale-select" aria-label="${escapeHtml(t('nav.language'))}">
      ${LOCALE_IDS.map(
        (id) =>
          `<option value="${id}"${id === getLocale() ? ' selected' : ''}>${escapeHtml(
            localeLabel(id),
          )}</option>`,
      ).join('')}
    </select>
    <div class="who account"></div>
  `;

  mustFind<HTMLSelectElement>(headerEl, '.locale-select').addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (isLocaleId(value)) setLocale(value);
  });

  const slot = mustFind<HTMLElement>(headerEl, '.account');
  if (!account) {
    const devLogin = config?.dev_login_enabled
      ? `<span class="dev-login">
           <button data-account="old">${escapeHtml(t('nav.dev_login'))} · 730d</button>
           <button data-account="new">${escapeHtml(t('nav.dev_login'))} · 10d</button>
         </span>`
      : '';
    slot.innerHTML =
      devLogin +
      `<a class="sign-in" href="${escapeHtml(loginUrl())}">${escapeHtml(t('nav.sign_in'))}</a>`;
    for (const button of slot.querySelectorAll<HTMLButtonElement>('.dev-login button')) {
      button.addEventListener('click', () => {
        void (async () => {
          try {
            const result = await api.devLogin(button.dataset.account === 'new' ? 'new' : 'old');
            setToken(result.token);
            await ctx.reloadMe();
            void renderRoute();
          } catch {
            showGlobalError('errors.OAUTH_FAILED');
          }
        })();
      });
    }
    return;
  }
  slot.innerHTML = `
    ${account.avatar_url ? `<img src="${escapeHtml(account.avatar_url)}" alt="" />` : ''}
    <span>${escapeHtml(t('auth.signed_in', { login: account.login }))}</span>
    <button class="sign-out">${escapeHtml(t('nav.sign_out'))}</button>
  `;
  mustFind<HTMLButtonElement>(slot, '.sign-out').addEventListener('click', () => {
    void (async () => {
      try {
        await api.logout();
      } catch {
        // A dead session must not block sign-out: drop the local token regardless.
      }
      clearToken();
      me = null;
      ctx.me = null;
      renderHeader();
      void renderRoute();
    })();
  });
}

function parseRoute(): { name: 'leaderboard' | 'model' | 'admin' | 'about'; slug: string } {
  const raw = window.location.hash.replace(/^#/, '');
  const path = raw.startsWith('/') ? raw.slice(1) : raw;
  const segments = path.split('/').filter((segment) => segment.length > 0);
  if (segments[0] === 'm' && segments[1]) {
    return { name: 'model', slug: decodeURIComponent(segments[1]) };
  }
  if (segments[0] === 'admin') return { name: 'admin', slug: '' };
  if (segments[0] === 'about') return { name: 'about', slug: '' };
  return { name: 'leaderboard', slug: '' };
}

async function renderRoute(): Promise<void> {
  const token = (renderToken += 1);
  removeCaptcha();
  viewEl.innerHTML = `<p class="hint">${escapeHtml(t('common.loading'))}</p>`;
  const route = parseRoute();
  try {
    let node: HTMLElement;
    if (route.name === 'model') node = await modelView(ctx, route.slug);
    else if (route.name === 'admin') node = await adminView(ctx);
    else if (route.name === 'about') node = aboutView(ctx);
    else node = await leaderboardView(ctx);
    if (token !== renderToken) return;
    viewEl.replaceChildren(node);
  } catch (error) {
    if (token !== renderToken) return;
    const key = errorMessageKey(error) as MessageKey;
    viewEl.innerHTML =
      `<div class="banner error">${escapeHtml(t(key))}</div>` +
      `<button class="retry primary">${escapeHtml(t('common.retry'))}</button>`;
    mustFind<HTMLButtonElement>(viewEl, '.retry').addEventListener('click', () => {
      void renderRoute();
    });
  }
}

async function boot(): Promise<void> {
  applyDocumentLocale();
  const { authError } = consumeAuthFragment();
  renderHeader();
  const [configResult, meResult] = await Promise.all([
    api.config().catch(() => null),
    getToken() ? api.me().catch(() => null) : Promise.resolve(null),
  ]);
  config = configResult;
  me = meResult;
  ctx.config = config;
  ctx.me = me;
  renderHeader();
  if (authError) showGlobalError('errors.OAUTH_FAILED');
  await renderRoute();

  window.addEventListener('hashchange', () => {
    void renderRoute();
  });
  onLocaleChange(() => {
    document.title = t(titleSpec.key, titleSpec.params);
    renderHeader();
    void renderRoute();
  });
}

void boot();
