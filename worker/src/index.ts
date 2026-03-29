import type { Env } from './types';
import { handleAuth } from './auth';
import { handleApi }  from './api';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

    if (pathname.startsWith('/auth/')) return handleAuth(request, env);
    if (pathname.startsWith('/api/'))  return handleApi(request, env);

    // Root → redirect to series tracker
    // All other paths (static assets, /series/*, /moogle/*) are served
    // directly by the Assets binding without going through the Worker.

    return env.ASSETS.fetch(request);
  },
};
