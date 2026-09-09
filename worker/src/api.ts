import type { Env, PutCharacterBody, PutMoogleBody, PutCollectCacheBody } from './types';
import { getSession } from './session';
import { getCharacters, getCharacter, putCharacter, patchCharacterLabel, deleteCharacter, getMoogleProgress, putMoogleProgress, getCollectCache, putCollectCache, countCharacters, MAX_CHARACTERS_PER_USER } from './db';
import { jsonResponse, errorResponse, requireAuth, readBodyCapped, isValidImageUrl } from './utils';

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
      lodestoneId:         r.lodestone_id,
      characterName:       r.character_name,
      characterWorld:      r.character_world,
      label:               r.label,
      portraitUrl:         r.portrait_url,
      avatarUrl:           r.avatar_url,
      lodestoneTitle:      r.lodestone_title,
      lodestoneFC:         r.lodestone_fc,
      lodestoneClass:      r.lodestone_class,
      lodestoneClassLevel: r.lodestone_class_level,
      lodestoneClasses:    r.lodestone_classes,
      data:                r.data,
      updatedAt:           r.updated_at,
    })));
  }

  // /api/moogle/:eventKey — GET + PUT
  // GET accepts ?character=lodestoneId to load a character-specific save;
  // falls back to the account-level row (lodestone_id='') if not found.
  // PUT requires lodestone_id in the body ('' = account-level fallback).
  const moogleMatch = pathname.match(/^\/api\/moogle\/([^/]+)$/);
  if (moogleMatch) {
    const eventKey = decodeURIComponent(moogleMatch[1]);
    if (!/^[a-z0-9-]+$/.test(eventKey)) return errorResponse('Invalid event key', 400);

    if (method === 'GET') {
      const lodestoneId = url.searchParams.get('character') ?? '';
      const row = await getMoogleProgress(env, s.userId, lodestoneId, eventKey);
      if (!row) return errorResponse('Not found', 404);
      return jsonResponse({
        lodestoneId:        row.lodestone_id,
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
      const raw = await readBodyCapped(request, 64_000); // 64 KB max for moogle progress
      if (raw === null) return errorResponse('Payload too large', 413);
      let body: PutMoogleBody;
      try { body = JSON.parse(raw) as PutMoogleBody; } catch { return errorResponse('Invalid JSON', 400); }
      if (typeof body.tomes_current !== 'number') return errorResponse('tomes_current must be a number', 400);
      await putMoogleProgress(env, s.userId, eventKey, body);
      return new Response(null, { status: 204 });
    }
  }

  // /api/characters/:lodestoneId/collect-cache — GET + PUT
  const collectCacheMatch = pathname.match(/^\/api\/characters\/([^/]+)\/collect-cache$/);
  if (collectCacheMatch) {
    const lodestoneId = decodeURIComponent(collectCacheMatch[1]);

    if (method === 'GET') {
      const row = await getCollectCache(env, s.userId, lodestoneId);
      if (!row) return errorResponse('Not found', 404);
      return jsonResponse({
        cache:     row.cache,
        cacheDt:   row.cache_dt,
        syncedAt:  row.synced_at,
      });
    }

    if (method === 'PUT') {
      const raw = await readBodyCapped(request, 512_000); // 512 KB max for collect cache (large JSON blobs)
      if (raw === null) return errorResponse('Payload too large', 413);
      let body: PutCollectCacheBody;
      try { body = JSON.parse(raw) as PutCollectCacheBody; } catch { return errorResponse('Invalid JSON', 400); }
      if (typeof body.cache !== 'string') return errorResponse('cache must be a string', 400);
      await putCollectCache(env, s.userId, lodestoneId, body);
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
        lodestoneId:         row.lodestone_id,
        characterName:       row.character_name,
        characterWorld:      row.character_world,
        label:               row.label,
        portraitUrl:         row.portrait_url,
        avatarUrl:           row.avatar_url,
        lodestoneTitle:      row.lodestone_title,
        lodestoneFC:         row.lodestone_fc,
        lodestoneClass:      row.lodestone_class,
        lodestoneClassLevel: row.lodestone_class_level,
        lodestoneClasses:    row.lodestone_classes,
        data:                row.data,
        updatedAt:           row.updated_at,
      });
    }

    // PUT /api/characters/:lodestoneId — create or update
    if (method === 'PUT') {
      const raw = await readBodyCapped(request, 128_000); // 128 KB max per character save
      if (raw === null) return errorResponse('Payload too large', 413);
      let body: PutCharacterBody;
      try { body = JSON.parse(raw) as PutCharacterBody; } catch { return errorResponse('Invalid JSON body', 400); }
      if (!body.characterName?.trim()) return errorResponse('characterName is required', 400);
      if (!body.data?.trim())          return errorResponse('data is required', 400);
      if (!isValidImageUrl(body.portraitUrl)) return errorResponse('Invalid portraitUrl', 400);
      if (!isValidImageUrl(body.avatarUrl))   return errorResponse('Invalid avatarUrl', 400);

      // For characters without a Lodestone ID, derive a stable synthetic key
      const lodestoneId = isManual
        ? `manual:${body.characterName.toLowerCase().trim()}|${(body.characterWorld ?? '').toLowerCase().trim()}`
        : rawId;

      // Enforce per-user character cap (only check on new inserts, not updates)
      const existing = await getCharacter(env, s.userId, lodestoneId);
      if (!existing) {
        const count = await countCharacters(env, s.userId);
        if (count >= MAX_CHARACTERS_PER_USER) {
          return errorResponse(`Character limit reached (max ${MAX_CHARACTERS_PER_USER})`, 400);
        }
      }

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
