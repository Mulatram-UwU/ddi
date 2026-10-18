const STORAGE_KEY = 'ddi_token';

export function getToken(): string | null {
  const token = localStorage.getItem(STORAGE_KEY);
  return token && token.length > 0 ? token : null;
}

export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Reads the OAuth hand-off fragment, then immediately strips it with replaceState: a session
 * token left in the address bar leaks through screenshots, shared links and browser history.
 */
export function consumeAuthFragment(): { token: string | null; authError: string | null } {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const params = new URLSearchParams(raw);
  const token = params.get('token');
  const authError = params.get('auth_error');
  if (token === null && authError === null) return { token: null, authError: null };

  const clean = `${window.location.pathname}${window.location.search}#/`;
  window.history.replaceState(null, '', clean);
  if (token) setToken(token);
  return { token, authError };
}
