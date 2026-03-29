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
