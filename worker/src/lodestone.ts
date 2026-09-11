import { errorResponse } from './utils';

// ── Public Lodestone fetch proxy ─────────────────────────────────────
// GET /api/lodestone?url=<encoded absolute URL>
//
// Why this exists: browsers can't fetch Lodestone directly (no CORS headers),
// and the public CORS proxies the frontend used to rely on are dead/blocked
// for Lodestone (codetabs 522s everything; Square Enix's edge 522s AllOrigins).
// Same-origin proxying kills the CORS problem with no third-party dependency.
//
// Deliberately PUBLIC (no session check — character search must work logged
// out). Abuse surface is limited by:
//   - host allowlist (finalfantasyxiv.com subdomains only),
//   - GET only, 3 MB response cap, 12 s upstream timeout,
//   - Cloudflare edge caching (search 2 min, pages/images 30 min).
const ALLOWED_HOST = /(^|\.)finalfantasyxiv\.com$/;
const UPSTREAM_TIMEOUT_MS = 12_000;
const MAX_BYTES = 3_000_000;

// Looks like a normal browser tab — datacenter-default fetch headers are
// what gets bot-walled.
const UPSTREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://na.finalfantasyxiv.com/',
};

function cacheTtl(target: URL): number {
  // Search result pages change as characters are created/renamed — short TTL.
  // Character pages / CDN images are fairly stable — longer TTL.
  const isSearch = target.pathname.endsWith('/character/') && target.search.length > 0;
  return isSearch ? 120 : 1800;
}

export async function handleLodestoneProxy(request: Request): Promise<Response> {
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405);

  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) return errorResponse('Missing ?url=', 400);

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return errorResponse('Invalid URL', 400);
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOST.test(target.hostname)) {
    return errorResponse('Only https://*.finalfantasyxiv.com URLs may be proxied', 400);
  }

  // Serve from edge cache when possible (also shields Lodestone from repeat hits).
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  try {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  } catch { /* cache unavailable — fall through to upstream */ }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: UPSTREAM_HEADERS,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return errorResponse('Lodestone unreachable from edge (timeout/blocked)', 502);
  }

  if (!upstream.ok) {
    return errorResponse(`Lodestone responded HTTP ${upstream.status}`, 502);
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return errorResponse('Upstream response too large', 502);

  const contentType = upstream.headers.get('Content-Type') ?? 'application/octet-stream';
  const resp = new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Allow any origin — harmless for public Lodestone pages, and keeps the
      // route usable from local dev / preview hosts too.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${cacheTtl(target)}`,
    },
  });

  try {
    // Clone into the edge cache; failures must not fail the request.
    await cache.put(cacheKey, resp.clone());
  } catch { /* ignore */ }

  return resp;
}
