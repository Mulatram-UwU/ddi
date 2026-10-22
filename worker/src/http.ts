import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  const body: ApiErrorBody = { error: { code, message, details } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

const MAX_JSON_BYTES = 16 * 1024;

export async function readJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  // Every mutating route expects a small JSON object. Rejecting other content types also kills
  // cross-site form posts, which cannot set `application/json` without a CORS preflight.
  const contentType = c.req.header('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType.trim())) return null;
  const declared = Number(c.req.header('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) return null;
  try {
    const parsed: unknown = await c.req.json();
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64url(bytes);
}

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
