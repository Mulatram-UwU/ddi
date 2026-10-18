import { getToken } from './session';
import type {
  AdminModelJson,
  ConfigJson,
  HistoryJson,
  MeJson,
  ModelJson,
} from './types';

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8787';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: string, status: number, details: Record<string, unknown> = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

export function errorMessageKey(error: unknown): string {
  if (error instanceof ApiError) return `errors.${error.code}`;
  return 'errors.NETWORK';
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = options.auth === false ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('NETWORK', 0);
  }

  // 204 responses carry no body; draining it keeps the console free of "request aborted" noise.
  if (response.status === 204) {
    await response.text();
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) throw new ApiError('NETWORK', response.status);
  }

  if (!response.ok) {
    const body = payload as { error?: { code?: string; details?: Record<string, unknown> } } | null;
    const code = body?.error?.code ?? (response.status >= 500 ? 'UNKNOWN' : 'NETWORK');
    throw new ApiError(code, response.status, body?.error?.details ?? {});
  }
  return payload as T;
}

export const api = {
  config: () => request<ConfigJson>('/api/config', { auth: false }),
  me: () => request<MeJson>('/api/me'),
  models: () => request<{ models: ModelJson[]; generated_at: string }>('/api/models'),
  model: (slug: string) => request<{ model: ModelJson }>(`/api/models/${encodeURIComponent(slug)}`),
  history: (slug: string, range: string) =>
    request<HistoryJson>(
      `/api/models/${encodeURIComponent(slug)}/history?range=${encodeURIComponent(range)}`,
      { auth: false },
    ),
  vote: (slug: string, value: 1 | -1, captchaToken: string | null) =>
    request<{ model: ModelJson }>(`/api/models/${encodeURIComponent(slug)}/vote`, {
      method: 'POST',
      body: { value, captcha_token: captchaToken },
    }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  devLogin: (account: 'old' | 'new') =>
    request<{ token: string; login: string }>('/api/auth/dev-login', {
      method: 'POST',
      body: { account },
      auth: false,
    }),
  adminModels: () => request<{ models: AdminModelJson[] }>('/api/admin/models'),
  createModel: (body: Record<string, unknown>) =>
    request<{ model: AdminModelJson }>('/api/admin/models', { method: 'POST', body }),
  updateModel: (slug: string, body: Record<string, unknown>) =>
    request<{ model: AdminModelJson }>(`/api/admin/models/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body,
    }),
  deleteModel: (slug: string) =>
    request<void>(`/api/admin/models/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  rescore: () => request<{ models: number }>('/api/admin/rescore', { method: 'POST' }),
};

export function loginUrl(): string {
  return `${API_BASE}/api/auth/github/start`;
}
