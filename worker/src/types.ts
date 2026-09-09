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
  ffxiv_cache: string | null;
  ffxiv_cache_dt: string | null;
  ffxiv_collect_synced_at: string | null;
  lodestone_title: string | null;
  lodestone_fc: string | null;
  lodestone_class: string | null;
  lodestone_class_level: number | null;
  lodestone_classes: string | null; // JSON: [{ name, level, type }]
}

/** Row shape returned from moogle_progress queries */
export interface MoogleProgressRow {
  lodestone_id:         string;
  event_key:            string;
  wishlist:             string;
  tomes_current:        number;
  weekly_objectives:    string;
  standard_objectives:  string;
  minimog_challenges:   string;
  ultimog_challenges:   string;
  updated_at:           string;
}

/** Request body for PUT /api/moogle/:eventKey */
export interface PutMoogleBody {
  lodestone_id:        string;  // '' = account-level fallback
  wishlist:            string;  // JSON
  tomes_current:       number;
  weekly_objectives:   string;  // JSON
  standard_objectives: string;  // JSON
  minimog_challenges:  string;  // JSON
  ultimog_challenges:  string;  // JSON
}

/** Request body for PUT /api/characters/:lodestoneId */
export interface PutCharacterBody {
  characterName: string;
  characterWorld?: string | null;
  label?: string | null;
  portraitUrl?: string | null;
  avatarUrl?: string | null;
  lodestoneTitle?: string | null;
  lodestoneFC?: string | null;
  lodestoneClass?: string | null;
  lodestoneClassLevel?: number | null;
  lodestoneClasses?: string | null; // JSON: [{ name, level, type }]
  data: string;
}

/** Request body for PUT /api/characters/:lodestoneId/collect-cache */
export interface PutCollectCacheBody {
  cache:        string;           // JSON — { mounts:[...], minions:[...], ... }
  last_parsed:  string | null;    // ISO datetime from FFXIV Collect response
  force_synced: boolean;          // true → stamp ffxiv_collect_synced_at = now
}
