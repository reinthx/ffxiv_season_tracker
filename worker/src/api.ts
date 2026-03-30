import type { Env, PutCharacterBody, PutMoogleBody } from './types';
import { getSession } from './session';
import { getCharacters, getCharacter, putCharacter, patchCharacterLabel, deleteCharacter, getMoogleProgress, putMoogleProgress } from './db';
import { jsonResponse, errorResponse, requireAuth } from './utils';

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url      = new URL(request.url);
  const pathname = url.pathname;
  const method   = request.method;

  // All /api/* routes require a valid session
  const session = await getSession(env, request);
  const authErr = requireAuth(session);
  if (authErr) return authErr;
  const s = session!;

  // GET /api/me
  if (pathname === '/api/me' && method === 'GET') {
    return jsonResponse({
      id:        s.userId,
      discordId: s.discordId,
      username:  s.username,
      avatar:    s.avatar,
    });
  }

  // GET /api/characters
  if (pathname === '/api/characters' && method === 'GET') {
    const rows = await getCharacters(env, s.userId);
    return jsonResponse(rows.map(r => ({
      lodestoneId:    r.lodestone_id,
      characterName:  r.character_name,
      characterWorld: r.character_world,
      label:          r.label,
      portraitUrl:    r.portrait_url,
      avatarUrl:      r.avatar_url,
      data:           r.data,
      updatedAt:      r.updated_at,
    })));
  }

  // /api/moogle/:eventKey — GET + PUT
  const moogleMatch = pathname.match(/^\/api\/moogle\/([^/]+)$/);
  if (moogleMatch) {
    const eventKey = decodeURIComponent(moogleMatch[1]);
    if (!/^[a-z0-9-]+$/.test(eventKey)) return errorResponse('Invalid event key', 400);

    if (method === 'GET') {
      const row = await getMoogleProgress(env, s.userId, eventKey);
      if (!row) return errorResponse('Not found', 404);
      return jsonResponse({
        eventKey:           row.event_key,
        wishlist:           row.wishlist,
        tomesCurrent:       row.tomes_current,
        weeklyObjectives:   row.weekly_objectives,
        standardObjectives: row.standard_objectives,
        minimogChallenges:  row.minimog_challenges,
        ultimogChallenges:  row.ultimog_challenges,
        updatedAt:          row.updated_at,
      });
    }

    if (method === 'PUT') {
      let body: PutMoogleBody;
      try { body = await request.json() as PutMoogleBody; } catch { return errorResponse('Invalid JSON', 400); }
      if (typeof body.tomes_current !== 'number') return errorResponse('tomes_current must be a number', 400);
      await putMoogleProgress(env, s.userId, eventKey, body);
      return new Response(null, { status: 204 });
    }
  }

  // Routes with a :lodestoneId segment
  const charMatch = pathname.match(/^\/api\/characters\/([^/]+)$/);
  if (charMatch) {
    const rawId     = decodeURIComponent(charMatch[1]);
    // If client passes "manual" as the placeholder, we compute the key from the body later
    const isManual  = rawId === 'manual';

    // GET /api/characters/:lodestoneId
    if (method === 'GET') {
      if (isManual) return errorResponse('Specify full lodestone_id for GET', 400);
      const row = await getCharacter(env, s.userId, rawId);
      if (!row) return errorResponse('Not found', 404);
      return jsonResponse({
        lodestoneId:    row.lodestone_id,
        characterName:  row.character_name,
        characterWorld: row.character_world,
        label:          row.label,
        portraitUrl:    row.portrait_url,
        avatarUrl:      row.avatar_url,
        data:           row.data,
        updatedAt:      row.updated_at,
      });
    }

    // PUT /api/characters/:lodestoneId — create or update
    if (method === 'PUT') {
      let body: PutCharacterBody;
      try {
        body = await request.json() as PutCharacterBody;
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }
      if (!body.characterName?.trim()) return errorResponse('characterName is required', 400);
      if (!body.data?.trim())          return errorResponse('data is required', 400);

      // For characters without a Lodestone ID, derive a stable synthetic key
      const lodestoneId = isManual
        ? `manual:${body.characterName.toLowerCase().trim()}|${(body.characterWorld ?? '').toLowerCase().trim()}`
        : rawId;

      await putCharacter(env, s.userId, lodestoneId, body);
      return new Response(null, { status: 204 });
    }

    // PATCH /api/characters/:lodestoneId — label rename only
    if (method === 'PATCH') {
      if (isManual) return errorResponse('Specify full lodestone_id for PATCH', 400);
      let body: { label?: string };
      try { body = await request.json() as { label?: string }; } catch { return errorResponse('Invalid JSON', 400); }
      if (!body.label?.trim()) return errorResponse('label is required', 400);
      const updated = await patchCharacterLabel(env, s.userId, rawId, body.label.trim());
      return updated ? new Response(null, { status: 204 }) : errorResponse('Not found', 404);
    }

    // DELETE /api/characters/:lodestoneId
    if (method === 'DELETE') {
      if (isManual) return errorResponse('Specify full lodestone_id for DELETE', 400);
      const deleted = await deleteCharacter(env, s.userId, rawId);
      return deleted ? new Response(null, { status: 204 }) : errorResponse('Not found', 404);
    }
  }

  return errorResponse('Not found', 404);
}
