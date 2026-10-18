const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5000;

export interface TurnstileResult {
  success: boolean;
  errorCodes: string[];
}

/**
 * Server-side half of Cloudflare Turnstile. Tokens are single-use and expire after 300s.
 * Any transport failure fails closed: an unreachable verifier must not become a free pass.
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp: string | null,
): Promise<TurnstileResult> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
    return { success: payload.success === true, errorCodes: payload['error-codes'] ?? [] };
  } catch {
    return { success: false, errorCodes: ['siteverify-unreachable'] };
  }
}
