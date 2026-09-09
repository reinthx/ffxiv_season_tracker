/**
 * Sliding-window rate limiter backed by KV.
 * Returns true if the caller should be blocked (limit exceeded).
 * Key format: `rl:{scope}:{minuteBucket}`
 *
 * NOTE: Not currently called — sessions moved to D1 which freed the KV write budget.
 * Re-enable in api.ts if abuse becomes a concern, or replace with Cloudflare's native
 * rate limiting API (available on Workers Paid, no KV needed).
 *
 * KV write budget note (free tier: 1,000 writes/day):
 *   - Pass `countWrite: false` for read-only requests — check the counter but don't increment.
 *   - Writes are batched: one KV put per WRITE_BATCH requests, pre-claiming that many slots.
 */
const WRITE_BATCH = 5;

export async function isRateLimited(
  kv: KVNamespace,
  scope: string,
  limit: number,
  windowMs = 60_000,
  countWrite = true,
): Promise<boolean> {
  const bucket  = Math.floor(Date.now() / windowMs);
  const kvKey   = `rl:${scope}:${bucket}`;
  const current = parseInt((await kv.get(kvKey)) ?? '0', 10);
  if (current >= limit) return true;
  if (countWrite && current % WRITE_BATCH === 0) {
    // Pre-claim the next batch so we only write 1-in-5 requests
    kv.put(kvKey, String(current + WRITE_BATCH), { expirationTtl: Math.ceil((windowMs * 2) / 1000) });
  }
  return false;
}

/**
 * Reads the request body as text and rejects if it exceeds maxBytes.
 * Returns the text on success, or null if too large.
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  const ct = request.headers.get('Content-Length');
  if (ct && parseInt(ct, 10) > maxBytes) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  return text;
}

/** Valid Lodestone CDN hostname — portrait/avatar URLs must be from here or null. */
const LODESTONE_CDN = 'img2.finalfantasyxiv.com';

export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return true; // null/undefined is fine
  try {
    return new URL(url).hostname === LODESTONE_CDN;
  } catch {
    return false;
  }
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

/** Returns a 401 Response if session is null, otherwise null (meaning OK to proceed). */
export function requireAuth(session: unknown): Response | null {
  if (!session) return errorResponse('Unauthorized', 401);
  return null;
}

/** Builds the Set-Cookie string for the session token. */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `__session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

/** Reads a named cookie from a Request. */
export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
