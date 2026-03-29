export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  ASSETS: Fetcher;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
}

/** Stored in KV under `session:<token>` */
export interface Session {
  userId: number;       // users.id (auto-increment)
  discordId: string;
  username: string;
  avatar: string | null;
  expiresAt: number;    // unix ms
}

/** Row shape returned from tracker_saves queries */
export interface CharacterRow {
  id: number;
  lodestone_id: string;
  character_name: string;
  character_world: string | null;
  label: string | null;
  portrait_url: string | null;
  avatar_url: string | null;
  data: string;
  updated_at: string;
}

/** Request body for PUT /api/characters/:lodestoneId */
export interface PutCharacterBody {
  characterName: string;
  characterWorld?: string | null;
  label?: string | null;
  portraitUrl?: string | null;
  avatarUrl?: string | null;
  data: string;
}
