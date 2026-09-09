// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MOOGLE TOME TRACKER  —  state, logic, init
//  Companion files: moogle-render.js, moogle-collect.js,
//                   moogle-character.js, moogle-auth.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// FFXIV servers run on Pacific time — event starts/ends are at midnight PT.
// Always derive "today" in the PT timezone so events go live at the correct moment.
function todayPT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}

// ── Data ──────────────────────────────────────────────
let EVENT          = null;   // active event from moogle_events.json
let UPCOMING_EVENT = null;   // announced but not yet started
let ALL_EVENTS     = [];

// ── State ─────────────────────────────────────────────
// wishlist item states: 'wished' | 'purchased' | 'collected' (owned before event) | 'not_wished' | 'ignored'
let EVENT_IS_UPCOMING = false;   // true when using UPCOMING_EVENT for planning — disables purchasing
let WISHLIST     = {};
let TOMES        = 0;     // current tome count
let SESSION_RUNS = {};    // { [dutyId]: number } — runs this session
let CHALLENGES   = {};    // { [challengeId]: boolean }
let TOME_HISTORY = [];    // [{ date, delta, reason, balance }]

const STORAGE_KEYS = {
  wishlist:    'moogle-wishlist',
  tomes:       'moogle-tomes',
  challenges:  'moogle-challenges',
  tomeHistory: 'moogle-tome-history',
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


// Duty category display metadata (badge colours)
const DUTY_CATEGORY_META = {
  dungeon:     { badgeClass: 'badge-start'    },
  alliance:    { badgeClass: 'badge-mount'    },
  raid:        { badgeClass: 'badge-crystals' },
  trials:      { badgeClass: 'badge-attire'   },
  msq:         { badgeClass: 'badge-framer'   },
  pvp:         { badgeClass: 'badge-emote'    },
  gold_saucer: { badgeClass: 'badge-fashion'  },
  fishing:     { badgeClass: 'badge-minion'   },
  other:       { badgeClass: 'badge-start'    },
};

// Parse a tomes value that may be a range string like "3-5" or an exact number.
// Returns a single number — midpoint for ranges, for use in arithmetic estimates.
function parseTomesNum(val) {
  if (typeof val === 'number') return val;
  const m = String(val).match(/^(\d+)-(\d+)$/);
  if (m) return Math.round((parseInt(m[1]) + parseInt(m[2])) / 2);
  return parseInt(val) || 0;
}

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

// CORS_PROXIES, fetchViaProxy are provided by shared.js

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
    const today = todayPT();
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
  } else if (current === 'not_wished' || current === 'ignored') {
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

// Mark an item as already owned (collected) — same state as FFXIV Collect auto-detection.
// Calling again on a collected item clears it back to not_wished.
function markCollected(id) {
  if (!WISHLIST[id]) WISHLIST[id] = { state: 'not_wished', qty: 1, qtyPurchased: 0 };
  WISHLIST[id].state = WISHLIST[id].state === 'collected' ? 'not_wished' : 'collected';
  persist(); saveToCloud(); renderShopGrid(); renderSummary();
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
  if (current !== 'purchased' && item?.tokenCost && tokenEarned() < item.tokenCost) {
    showToast(`⚠ Only ${tokenEarned()}/${item.tokenCost} tokens earned — finish minimog/ultimog challenges for the rest.`);
  }
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
  renderRouteOutput();
}

function wishlistTotalCost() {
  if (!EVENT) return 0;
  return EVENT.shop.reduce((sum, item) => {
    const entry = WISHLIST[item.id];
    if (!entry || entry.state === 'not_wished' || entry.state === 'collected' || entry.state === 'ignored') return sum;
    const qty = item.unique ? 1 : (entry.qty || 1);
    return sum + item.cost * qty;
  }, 0);
}

function wishlistRemainingCost() {
  if (!EVENT) return 0;
  return EVENT.shop.reduce((sum, item) => {
    const entry = WISHLIST[item.id];
    if (!entry || entry.state === 'not_wished' || entry.state === 'purchased' || entry.state === 'collected' || entry.state === 'ignored') return sum;
    const qty = item.unique ? 1 : (entry.qty || 1);
    const bought = item.unique ? 0 : (entry.qtyPurchased || 0);
    return sum + item.cost * Math.max(0, qty - bought);
  }, 0);
}

// Sum of bonus tomes from challenges not yet completed.
// For weekly challenges: only weeks that are currently active (started, not ended).
// Standard/Minimog/Ultimog: all uncompleted (no date gate needed).
function projectedChallengeEarnings() {
  if (!EVENT) return 0;
  const today    = todayPT();
  const weekDefs = EVENT.weeks || [];

  // Build a set of week numbers that are currently live (started but not yet ended)
  const liveWeeks = new Set(weekDefs.filter(w => today >= w.start && today <= w.end).map(w => w.week));
  // Also include all past weeks (already expired — user can still retroactively mark them)
  const pastWeeks = new Set(weekDefs.filter(w => today > w.end).map(w => w.week));

  let total = 0;
  for (const [type, challenges] of Object.entries(EVENT.challenges)) {
    for (const ch of (challenges || [])) {
      if (CHALLENGES[ch.id]) continue; // already done
      if (type === 'weekly') {
        // Include if week is live OR already ended (grace period for backfill)
        const w = ch.week;
        if (!w || (!liveWeeks.has(w) && !pastWeeks.has(w))) continue;
      }
      total += ch.bonus || 0;
    }
  }
  return total;
}

// ── Uolon Horn Tokens ───────────────────────────────────────────────
// Headline items can require challenge tokens on top of tomes (e.g. Uolon
// Horn: 100 tomes + 10 tokens — 1/week from minimog, 5 from ultimog).
// tokenCost lives on shop items, tokens on challenges; events without them
// simply yield 0 everywhere below.
function tokenEarned() {
  if (!EVENT) return 0;
  let t = 0;
  for (const challenges of Object.values(EVENT.challenges || {})) {
    for (const ch of (challenges || [])) {
      if (CHALLENGES[ch.id]) t += ch.tokens || 0;
    }
  }
  return t;
}

// Tokens still needed for wished (not yet bought/owned/ignored) items.
function tokenNeeded() {
  if (!EVENT) return 0;
  return EVENT.shop.reduce((sum, item) => {
    if (!item.tokenCost) return sum;
    const e = WISHLIST[item.id];
    if (!e || e.state === 'not_wished' || e.state === 'purchased' || e.state === 'collected' || e.state === 'ignored') return sum;
    return sum + item.tokenCost;
  }, 0);
}

// Tokens still earnable this event. Unlike tome projections (which only count
// live/past weeks), this counts ALL uncompleted minimog/ultimog challenges:
// future weeks will unlock, and the question is whether the mount is still
// attainable before the event ends.
function tokenAvailable() {
  if (!EVENT) return 0;
  let total = 0;
  for (const challenges of Object.values(EVENT.challenges || {})) {
    for (const ch of (challenges || [])) {
      if (CHALLENGES[ch.id]) continue;
      total += ch.tokens || 0;
    }
  }
  return total;
}
// Weeks remaining in the event (including current week), capped to total weeks.
function weeksRemainingInEvent() {
  if (!EVENT?.weeks) return null;
  const today = todayPT();
  return EVENT.weeks.filter(w => today <= w.end).length;
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
  const gained = parseTomesNum(duty.tomes) * count;
  TOMES += gained;
  document.getElementById('inp-tomes').value = TOMES;
  recordTomeHistory(gained, `Run: ${duty.name}`);
  persist();
  renderSummary();
  renderRunCounters();
  renderTomeHistory();
  const toastTomes = typeof duty.tomes === 'string' ? `~${gained}` : `+${gained}`;
  showToast(`${toastTomes} tomes from ${duty.name}`);
}

function removeRunTomes(dutyId) {
  const duty = EVENT?.duties.find(d => d.id === dutyId);
  if (!duty || !SESSION_RUNS[dutyId]) return;
  SESSION_RUNS[dutyId] = Math.max(0, SESSION_RUNS[dutyId] - 1);
  const lost = parseTomesNum(duty.tomes);
  TOMES = Math.max(0, TOMES - lost);
  document.getElementById('inp-tomes').value = TOMES;
  recordTomeHistory(-lost, `Undid run: ${duty.name}`);
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
  const seen = new Set();
  return EVENT.duties.reduce((sum, d) => {
    if (seen.has(d.id)) return sum;
    seen.add(d.id);
    return sum + (SESSION_RUNS[d.id] || 0) * parseTomesNum(d.tomes);
  }, 0);
}

function recordTomeHistory(delta, reason) {
  TOME_HISTORY.push({ date: todayPT(), delta, reason, balance: TOMES });
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
  renderRouteOutput();
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

// setTheme, loadTheme, setText, setW, cap, fmtDate, showToast are provided by shared.js

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INIT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

window.addEventListener('load', async () => {
  loadTheme();
  loadCharData();
  buildWorldSelect('mog-char-world');
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
