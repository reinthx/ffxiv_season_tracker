// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MOOGLE TOME TRACKER  —  state, logic, init
//  Companion files: moogle-render.js, moogle-collect.js,
//                   moogle-character.js, moogle-auth.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Data ──────────────────────────────────────────────
let EVENT          = null;   // active event from moogle_events.json
let UPCOMING_EVENT = null;   // announced but not yet started
let ALL_EVENTS     = [];

// ── State ─────────────────────────────────────────────
// wishlist item states: 'wished' | 'purchased' | 'collected' (owned before event) | 'not_wished'
let EVENT_IS_UPCOMING = false;   // true when using UPCOMING_EVENT for planning — disables purchasing
let WISHLIST     = {};
let TOMES        = 0;     // current tome count
let FARM_MODE    = 'casual';
let SESSION_RUNS = {};    // { [dutyId]: number } — runs this session
let CHALLENGES   = {};    // { [challengeId]: boolean }
let TOME_HISTORY = [];    // [{ date, delta, reason, balance }]

const STORAGE_KEYS = {
  wishlist:    'moogle-wishlist',
  tomes:       'moogle-tomes',
  farmMode:    'moogle-farm-mode',
  challenges:  'moogle-challenges',
  tomeHistory: 'moogle-tome-history',
  theme:       'ffxiv-theme',           // shared with series tracker
};

// ── Character state ────────────────────────────────────
let CHAR = { name: null, world: null, lodestoneId: null, avatarUrl: null };

// ── Cloud sync state ───────────────────────────────────
let _cloudUser  = null;
let _cloudChars = [];
let _activeCloudCharId = null;

// ── FFXIV Collect category mapping ─────────────────────
// Maps our shop category → FFXIV Collect resource name (for API + links)
const COLLECT_CATEGORY_MAP = {
  mount:       'mounts',
  minion:      'minions',
  emote:       'emotes',
  hairstyle:   'hairstyles',
  barding:     'bardings',
  orchestrion: 'orchestrions',
  triad:       'triad/cards',
};

// Category display metadata (badge colours reuse series CSS classes)
const CATEGORY_META = {
  mount:       { label: 'Mount',        badgeClass: 'badge-mount'    },
  minion:      { label: 'Minion',       badgeClass: 'badge-minion'   },
  emote:       { label: 'Emote',        badgeClass: 'badge-emote'    },
  hairstyle:   { label: 'Hairstyle',    badgeClass: 'badge-framer'   },
  barding:     { label: 'Barding',      badgeClass: 'badge-attire'   },
  orchestrion: { label: 'Orchestrion',  badgeClass: 'badge-crystals' },
  triad:       { label: 'Triple Triad', badgeClass: 'badge-start'    },
  gear:        { label: 'Gear',         badgeClass: 'badge-start'    },
  housing:     { label: 'Housing',      badgeClass: 'badge-fashion'  },
  map:         { label: 'Map',          badgeClass: 'badge-start'    },
  other:       { label: 'Other',        badgeClass: 'badge-start'    },
};

// CORS proxy pool (same as series tracker)
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];
const PROXY_TIMEOUT_MS = 8000;

async function fetchViaProxy(url) {
  const controllers = CORS_PROXIES.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach(c => c.abort()), PROXY_TIMEOUT_MS);
  try {
    return await Promise.any(
      CORS_PROXIES.map(async (makeProxy, i) => {
        const resp = await fetch(makeProxy(url), { signal: controllers[i].signal });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        controllers.forEach((c, j) => { if (j !== i) c.abort(); });
        return resp;
      })
    );
  } catch {
    throw new Error('All proxies failed or timed out');
  } finally {
    clearTimeout(timer);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PERSISTENCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function persist() {
  if (!EVENT) return;
  const key = EVENT.key;
  try {
    localStorage.setItem(STORAGE_KEYS.wishlist   + ':' + key, JSON.stringify(WISHLIST));
    localStorage.setItem(STORAGE_KEYS.tomes      + ':' + key, String(TOMES));
    localStorage.setItem(STORAGE_KEYS.challenges + ':' + key, JSON.stringify(CHALLENGES));
    localStorage.setItem(STORAGE_KEYS.tomeHistory + ':' + key, JSON.stringify(TOME_HISTORY.slice(-90)));
    localStorage.setItem(STORAGE_KEYS.farmMode, FARM_MODE);
  } catch {}
}

function loadPersisted() {
  if (!EVENT) return;
  const key = EVENT.key;
  try {
    const wl = localStorage.getItem(STORAGE_KEYS.wishlist + ':' + key);
    WISHLIST = wl ? JSON.parse(wl) : {};
    TOMES    = parseInt(localStorage.getItem(STORAGE_KEYS.tomes + ':' + key) || '0') || 0;
    const ch = localStorage.getItem(STORAGE_KEYS.challenges + ':' + key);
    CHALLENGES = ch ? JSON.parse(ch) : {};
    const th = localStorage.getItem(STORAGE_KEYS.tomeHistory + ':' + key);
    TOME_HISTORY = th ? JSON.parse(th) : [];
    FARM_MODE = localStorage.getItem(STORAGE_KEYS.farmMode) || 'casual';
  } catch {}
}

function saveCharData() {
  try {
    localStorage.setItem('moogle-character', JSON.stringify(CHAR));
    localStorage.setItem('moogle-char-updated', String(Date.now()));
  } catch {}
}
function loadCharData() {
  try {
    const c = JSON.parse(localStorage.getItem('moogle-character') || 'null');
    if (c) CHAR = c;
  } catch {}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DATA LOADING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function loadData() {
  const errEl = document.getElementById('data-load-error');
  try {
    const r = await fetch('/data/moogle_events.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    ALL_EVENTS = data.events || [];
    const today = new Date().toISOString().split('T')[0];
    // active=true but start in future → treat as upcoming announcement
    EVENT = ALL_EVENTS.find(e => e.active && e.start <= today) || null;
    UPCOMING_EVENT = ALL_EVENTS.find(e => e.active && e.start > today) || null;
    if (!UPCOMING_EVENT) UPCOMING_EVENT = ALL_EVENTS.find(e => e.upcoming) || null;
  } catch (e) {
    if (errEl) { errEl.textContent = 'Failed to load event data. ' + e.message; errEl.style.display = 'block'; }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WISHLIST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getItemState(id) {
  return WISHLIST[id]?.state || 'not_wished';
}
function getItemQty(id) {
  return WISHLIST[id]?.qty || 1;
}
function getItemQtyPurchased(id) {
  return WISHLIST[id]?.qtyPurchased || 0;
}

// Card click: cycle wishlist state. 'collected' (auto-marked via FFXIV Collect) → clears on click.
function toggleWishlist(id) {
  if (!WISHLIST[id]) WISHLIST[id] = { state: 'not_wished', qty: 1, qtyPurchased: 0 };
  const current = getItemState(id);
  if (current === 'collected') {
    WISHLIST[id].state = 'not_wished';   // un-mark collected
  } else if (current === 'not_wished') {
    WISHLIST[id].state = 'wished';
  } else if (current === 'wished') {
    WISHLIST[id].state = 'not_wished';
    WISHLIST[id].qtyPurchased = 0;
  } else {
    // purchased → back to wished
    WISHLIST[id].state = 'wished';
    WISHLIST[id].qtyPurchased = 0;
  }
  persist(); saveToCloud(); renderShopGrid(); renderSummary(); renderRouteOutput();
}

// Explicit "Mark Bought" toggle — disabled in planning/upcoming mode.
function markPurchased(id) {
  if (EVENT_IS_UPCOMING) return;
  const item = EVENT.shop.find(i => i.id === id);
  if (!WISHLIST[id]) WISHLIST[id] = { state: 'wished', qty: 1, qtyPurchased: 0 };
  const current = getItemState(id);
  if (current === 'purchased') {
    WISHLIST[id].state = 'wished';
    WISHLIST[id].qtyPurchased = 0;
  } else {
    WISHLIST[id].state = 'purchased';
    if (item?.unique) {
      WISHLIST[id].qtyPurchased = 1;
      recordTomeHistory(-item.cost, `Purchased: ${item.name}`);
    }
  }
  persist(); saveToCloud(); renderShopGrid(); renderSummary(); renderRouteOutput();
}

// Legacy alias kept for any callers in cloud-loaded data paths
function cycleItemState(id) { toggleWishlist(id); }

function adjustItemQty(id, delta) {
  const item = EVENT.shop.find(i => i.id === id);
  if (!item || item.unique) return;
  if (!WISHLIST[id]) WISHLIST[id] = { state: 'wished', qty: 1, qtyPurchased: 0 };
  WISHLIST[id].qty = Math.max(1, (WISHLIST[id].qty || 1) + delta);
  persist();
  renderShopGrid();
  renderSummary();
  renderRouteOutput();
}

function adjustQtyPurchased(id, delta) {
  const item = EVENT.shop.find(i => i.id === id);
  if (!item || item.unique) return;
  if (!WISHLIST[id]) WISHLIST[id] = { state: 'wished', qty: 1, qtyPurchased: 0 };
  const maxPurchased = WISHLIST[id].qty || 1;
  const prev = WISHLIST[id].qtyPurchased || 0;
  const next = Math.max(0, Math.min(maxPurchased, prev + delta));
  WISHLIST[id].qtyPurchased = next;
  if (delta > 0) recordTomeHistory(-item.cost, `Purchased: ${item.name}`);
  if (next >= maxPurchased) WISHLIST[id].state = 'purchased';
  else if (next > 0)        WISHLIST[id].state = 'wished';
  persist();
  renderShopGrid();
  renderSummary();
}

function wishlistTotalCost() {
  if (!EVENT) return 0;
  return EVENT.shop.reduce((sum, item) => {
    const entry = WISHLIST[item.id];
    if (!entry || entry.state === 'not_wished' || entry.state === 'collected') return sum;
    const qty = item.unique ? 1 : (entry.qty || 1);
    return sum + item.cost * qty;
  }, 0);
}

function wishlistRemainingCost() {
  if (!EVENT) return 0;
  return EVENT.shop.reduce((sum, item) => {
    const entry = WISHLIST[item.id];
    if (!entry || entry.state === 'not_wished' || entry.state === 'purchased' || entry.state === 'collected') return sum;
    const qty = item.unique ? 1 : (entry.qty || 1);
    const bought = item.unique ? 0 : (entry.qtyPurchased || 0);
    return sum + item.cost * Math.max(0, qty - bought);
  }, 0);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOMES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function applyTomes() {
  const val = parseInt(document.getElementById('inp-tomes')?.value || '0') || 0;
  const prev = TOMES;
  TOMES = Math.max(0, val);
  if (TOMES !== prev) recordTomeHistory(TOMES - prev, 'Manual update');
  persist();
  saveToCloud();
  renderSummary();
  renderRouteOutput();
  renderTomeHistory();
  showToast('Tomes updated!');
}

function addRunTomes(dutyId, count = 1) {
  const duty = EVENT?.duties.find(d => d.id === dutyId);
  if (!duty) return;
  SESSION_RUNS[dutyId] = (SESSION_RUNS[dutyId] || 0) + count;
  const gained = duty.tomes * count;
  TOMES += gained;
  document.getElementById('inp-tomes').value = TOMES;
  recordTomeHistory(gained, `Run: ${duty.name}`);
  persist();
  renderSummary();
  renderRunCounters();
  renderTomeHistory();
  showToast(`+${gained} tomes from ${duty.name}`);
}

function removeRunTomes(dutyId) {
  const duty = EVENT?.duties.find(d => d.id === dutyId);
  if (!duty || !SESSION_RUNS[dutyId]) return;
  SESSION_RUNS[dutyId] = Math.max(0, SESSION_RUNS[dutyId] - 1);
  TOMES = Math.max(0, TOMES - duty.tomes);
  document.getElementById('inp-tomes').value = TOMES;
  recordTomeHistory(-duty.tomes, `Undid run: ${duty.name}`);
  persist();
  renderSummary();
  renderRunCounters();
  renderTomeHistory();
}

function resetSessionRuns() {
  SESSION_RUNS = {};
  renderRunCounters();
  showToast('Session runs reset.');
}

function sessionTomesEarned() {
  if (!EVENT) return 0;
  return EVENT.duties.reduce((sum, d) => sum + (SESSION_RUNS[d.id] || 0) * d.tomes, 0);
}

function recordTomeHistory(delta, reason) {
  TOME_HISTORY.push({ date: new Date().toISOString().slice(0, 10), delta, reason, balance: TOMES });
  if (TOME_HISTORY.length > 90) TOME_HISTORY.shift();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CHALLENGES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function toggleChallenge(id) {
  CHALLENGES[id] = !CHALLENGES[id];
  const ch = findChallenge(id);
  if (ch) {
    const gained = CHALLENGES[id] ? ch.bonus : -ch.bonus;
    TOMES = Math.max(0, TOMES + gained);
    document.getElementById('inp-tomes').value = TOMES;
    recordTomeHistory(gained, `Challenge: ${ch.name}`);
  }
  persist();
  saveToCloud();
  renderChallenges();
  renderSummary();
  renderTomeHistory();
  showToast(CHALLENGES[id] ? `+${ch?.bonus || 0} tomes from challenge!` : 'Challenge unmarked.');
}

function findChallenge(id) {
  if (!EVENT) return null;
  for (const type of ['weekly', 'standard', 'minimog', 'ultimog']) {
    const found = EVENT.challenges[type]?.find(c => c.id === id);
    if (found) return found;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FARM OPTIMIZER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setFarmMode(mode) {
  FARM_MODE = mode;
  document.getElementById('mode-btn-casual').className    = mode === 'casual'    ? 'btn btn-gold'    : 'btn btn-outline';
  document.getElementById('mode-btn-efficient').className = mode === 'efficient' ? 'btn btn-gold'    : 'btn btn-outline';
  document.getElementById('farm-mode-desc').textContent   = mode === 'casual'
    ? 'Gold Saucer events and low-effort duties. Relaxed farming — grab a drink and queue up.'
    : 'Maximum tomes per hour. Sorted by tomes ÷ average run time. Challenge bonuses factored in.';
  persist();
  renderRouteOutput();
}

function getEffectiveTomeRate(duty) {
  let tomesPerRun = duty.tomes;
  if (EVENT) {
    for (const type of ['weekly', 'standard', 'minimog', 'ultimog']) {
      EVENT.challenges[type]?.forEach(ch => {
        if (!CHALLENGES[ch.id] && ch.requirement) {
          tomesPerRun += ch.bonus / ch.requirement;
        }
      });
    }
  }
  return tomesPerRun / (duty.avgMinutes || 20);
}

function buildRoute() {
  if (!EVENT) return [];
  const needed = wishlistRemainingCost() - TOMES;
  if (needed <= 0) return [];

  let duties = [...EVENT.duties];
  if (FARM_MODE === 'casual') duties = duties.filter(d => d.casual);
  if (!duties.length) duties = EVENT.duties.filter(d => d.casual); // fallback

  duties.sort((a, b) => getEffectiveTomeRate(b) - getEffectiveTomeRate(a));

  const route = [];
  let remaining = needed;
  while (remaining > 0 && duties.length) {
    const best  = duties[0];
    const runs  = Math.ceil(remaining / best.tomes);
    const time  = runs * best.avgMinutes;
    route.push({ duty: best, runs, time });
    remaining -= runs * best.tomes;
    break;
  }
  return route;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  THEME  (shared with series tracker via same localStorage key)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setTheme(name) {
  document.documentElement.setAttribute('data-theme', name === 'dusk' ? '' : name);
  document.querySelectorAll('.theme-swatch').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === name));
  try { localStorage.setItem(STORAGE_KEYS.theme, name); } catch {}
}
function loadTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    if (saved) { setTheme(saved); return; }
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'dawn');
  } catch { setTheme('dusk'); }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function setW(id, p)    { const e = document.getElementById(id); if (e) e.style.width = p + '%'; }
function cap(s)          { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''; }
function fmtDate(d)      { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
function showToast(msg)  { const e = document.getElementById('toast'); if (!e) return; e.textContent = msg; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), 2600); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INIT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

window.addEventListener('load', async () => {
  loadTheme();
  loadCharData();
  buildWorldSelect();
  await Promise.all([loadData(), initCloudAuth()]);

  document.getElementById('main-content').style.display = 'block';

  if (!EVENT) {
    if (UPCOMING_EVENT) {
      // Enter planning mode: use upcoming event data so all tabs work,
      // but block purchasing so users can only wishlist / mark collected.
      EVENT = UPCOMING_EVENT;
      EVENT_IS_UPCOMING = true;
      renderUpcomingBanner(UPCOMING_EVENT);
    } else {
      document.getElementById('no-active-event').style.display = 'block';
      ['wishlist','farm','challenges'].forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) btn.style.display = 'none';
      });
      switchTab('history');
      return;
    }
  }

  document.getElementById('event-banner').style.display = EVENT_IS_UPCOMING ? 'none' : 'block';

  loadPersisted();
  document.getElementById('inp-tomes').value = TOMES;
  renderAll();
  renderCharDisplay();

  document.getElementById('inp-tomes')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyTomes(); });
  document.getElementById('mog-lodestone-url')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyLodestoneUrl(); });
});
