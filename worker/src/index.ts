import type { Env } from './types';
import { handleAuth } from './auth';
import { handleApi }  from './api';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    // CORS preflight — same-origin deployment, but handle it cleanly
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (pathname.startsWith('/auth/')) return handleAuth(request, env);
    if (pathname.startsWith('/api/'))  return handleApi(request, env);

    // Everything else → serve static assets (index.html, js/, css/, data/, etc.)
    return env.ASSETS.fetch(request);
  },
};
