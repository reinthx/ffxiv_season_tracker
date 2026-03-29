// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MOOGLE TOME TRACKER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Data ──────────────────────────────────────────────
let EVENT       = null;   // active event from moogle_events.json
let ALL_EVENTS  = [];

// ── State ─────────────────────────────────────────────
// wishlist: { [itemId]: { state: 'wished'|'not_wished'|'purchased', qty: number, qtyPurchased: number } }
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

// ── Cloud sync state ───────────────────────────────────
let _cloudUser  = null;
let _cloudChars = [];
let _activeCloudCharId = null;

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DATA LOADING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function loadData() {
  const errEl = document.getElementById('data-load-error');
  try {
    const r = await fetch('../data/moogle_events.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    ALL_EVENTS = data.events || [];
    EVENT = ALL_EVENTS.find(e => e.active) || ALL_EVENTS[0] || null;
    const act = ALL_EVENTS.find(e => e.active);
    if (act) {
      if (act.shop) REWARDS = act.shop.map(r => r.img ? { ...r, img: '../' + r.img } : r);
    }
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

function cycleItemState(id) {
  const item   = EVENT.shop.find(i => i.id === id);
  const current = getItemState(id);
  let next;
  if (current === 'not_wished')  next = 'wished';
  else if (current === 'wished') next = 'purchased';
  else                           next = 'not_wished';

  if (!WISHLIST[id]) WISHLIST[id] = { state: 'not_wished', qty: 1, qtyPurchased: 0 };
  WISHLIST[id].state = next;

  // Auto-set qtyPurchased when marking purchased on a unique item
  if (next === 'purchased' && item?.unique) {
    WISHLIST[id].qtyPurchased = 1;
    recordTomeHistory(-item.cost, `Purchased: ${item.name}`);
  }
  if (next === 'not_wished') {
    WISHLIST[id].qtyPurchased = 0;
  }

  persist();
  renderShopGrid();
  renderSummary();
  renderRouteOutput();
}

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
    if (!entry || entry.state === 'not_wished') return sum;
    const qty = item.unique ? 1 : (entry.qty || 1);
    return sum + item.cost * qty;
  }, 0);
}

function wishlistRemainingCost() {
  if (!EVENT) return 0;
  return EVENT.shop.reduce((sum, item) => {
    const entry = WISHLIST[item.id];
    if (!entry || entry.state === 'not_wished' || entry.state === 'purchased') return sum;
    const qty    = item.unique ? 1 : (entry.qty || 1);
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOME HISTORY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function recordTomeHistory(delta, reason) {
  const balance = TOMES + (delta > 0 ? 0 : delta);  // balance after delta
  TOME_HISTORY.push({ date: new Date().toISOString().slice(0, 10), delta, reason, balance: TOMES });
  if (TOME_HISTORY.length > 90) TOME_HISTORY.shift();
}

function renderTomeHistory() {
  const section = document.getElementById('tome-history-section');
  if (!section || !_cloudUser || TOME_HISTORY.length < 2) {
    if (section && _cloudUser && TOME_HISTORY.length < 2) section.style.display = 'block';
    else if (section) section.style.display = _cloudUser ? 'block' : 'none';
    const cur = document.getElementById('th-current');
    if (cur) cur.textContent = TOMES + ' tomes';
    return;
  }
  section.style.display = 'block';
  document.getElementById('th-current').textContent = TOMES + ' tomes';

  // Group by date, take last balance per day
  const byDate = {};
  TOME_HISTORY.forEach(h => { byDate[h.date] = h.balance; });
  const dates   = Object.keys(byDate).sort();
  const values  = dates.map(d => byDate[d]);

  if (dates.length < 2) return;
  document.getElementById('th-start-date').textContent = dates[0];
  document.getElementById('th-end-date').textContent   = dates[dates.length - 1];

  drawSparkline('tome-sparkline', values, '#c8a96e');
}

function drawSparkline(containerId, values, color = '#c8a96e') {
  const container = document.getElementById(containerId);
  if (!container || values.length < 2) return;
  container.innerHTML = '';
  const canvas  = document.createElement('canvas');
  const W = container.clientWidth || 400, H = 80;
  canvas.width  = W; canvas.height = H;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pad = 6;
  const toX = i  => pad + (i / (values.length - 1)) * (W - pad * 2);
  const toY = v  => H - pad - ((v - min) / range) * (H - pad * 2);

  // Fill
  ctx.beginPath();
  ctx.moveTo(toX(0), H);
  values.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
  ctx.lineTo(toX(values.length - 1), H);
  ctx.closePath();
  ctx.fillStyle = color + '22';
  ctx.fill();

  // Line
  ctx.beginPath();
  values.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.stroke();
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
//  OPTIMIZER
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
  // Base rate: tomes per minute
  let tomesPerRun = duty.tomes;
  // Add fractional challenge bonus value: if a challenge requires N runs of any type,
  // spread its bonus across those N runs
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

  // Sort by effective tomes/min descending
  duties.sort((a, b) => getEffectiveTomeRate(b) - getEffectiveTomeRate(a));

  const route = [];
  let remaining = needed;
  // Fill with the best duty until covered
  while (remaining > 0 && duties.length) {
    const best  = duties[0];
    const runs  = Math.ceil(remaining / best.tomes);
    const time  = runs * best.avgMinutes;
    route.push({ duty: best, runs, time });
    remaining -= runs * best.tomes;
    // If one duty is enough, stop; otherwise mix in the next
    break;
  }
  return route;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RENDER FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderAll() {
  renderEventBanner();
  renderCategoryFilters();
  renderShopGrid();
  renderSummary();
  renderRunCounters();
  renderRouteOutput();
  renderChallenges();
  renderTomeHistory();
  setFarmMode(FARM_MODE);
}

function renderEventBanner() {
  if (!EVENT) return;
  const banner = document.getElementById('event-banner');
  if (banner) banner.style.display = 'block';
  setText('banner-event-name', EVENT.name);
  setText('banner-tome-type',  EVENT.tomeType);
  setText('event-name-header', EVENT.name);

  if (EVENT.start && EVENT.end) {
    const start = new Date(EVENT.start), end = new Date(EVENT.end), now = new Date();
    const total = end - start, elapsed = now - start;
    const pct   = Math.min(100, Math.max(0, (elapsed / total) * 100));
    const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
    setText('banner-dates',       fmtDate(EVENT.start) + ' → ' + fmtDate(EVENT.end));
    setText('event-dates-header', fmtDate(EVENT.start) + ' → ' + fmtDate(EVENT.end));
    setText('banner-days-left',   daysLeft);
    setW('event-timeline-bar', pct);
  }
}

function renderCategoryFilters() {
  if (!EVENT) return;
  const el = document.getElementById('shop-category-filters');
  if (!el) return;
  const cats = ['all', ...new Set(EVENT.shop.map(i => i.category))];
  el.innerHTML = cats.map(c => `
    <button class="btn btn-outline" id="cat-btn-${c}" style="font-size:11px;padding:4px 12px;"
      onclick="setShopFilter('${c}')">${c === 'all' ? 'All' : cap(c)}</button>
  `).join('');
  setShopFilter('all');
}

let _shopFilter = 'all';
function setShopFilter(cat) {
  _shopFilter = cat;
  document.querySelectorAll('[id^="cat-btn-"]').forEach(btn => {
    btn.className = btn.id === `cat-btn-${cat}` ? 'btn btn-gold' : 'btn btn-outline';
    btn.style.fontSize = '11px'; btn.style.padding = '4px 12px';
  });
  renderShopGrid();
}

function renderShopGrid() {
  if (!EVENT) return;
  const el = document.getElementById('shop-grid');
  if (!el) return;

  const items = EVENT.shop.filter(i => _shopFilter === 'all' || i.category === _shopFilter);

  // Sort: wished first, then purchased, then not_wished (faded)
  const order = { wished: 0, purchased: 1, not_wished: 2 };
  const sorted = [...items].sort((a, b) => (order[getItemState(a.id)] || 0) - (order[getItemState(b.id)] || 0));

  el.innerHTML = sorted.map(item => {
    const state       = getItemState(item.id);
    const qty         = item.unique ? 1 : getItemQty(item.id);
    const qtyPurchased = item.unique ? (state === 'purchased' ? 1 : 0) : getItemQtyPurchased(item.id);
    const isWished    = state === 'wished';
    const isPurchased = state === 'purchased';
    const opacity     = state === 'not_wished' ? '0.38' : '1';
    const borderColor = isPurchased ? 'var(--green)' : isWished ? 'var(--border-gold)' : 'var(--border)';
    const bg          = isPurchased ? 'rgba(74,222,128,0.07)' : isWished ? 'var(--gold-dim)' : 'transparent';

    const stateIcon = isPurchased ? '✓' : isWished ? '★' : '○';
    const stateColor = isPurchased ? 'var(--green)' : isWished ? 'var(--gold)' : 'var(--text-muted)';

    const imgTag = item.img
      ? `<img src="${item.img}" style="width:56px;height:56px;object-fit:contain;image-rendering:pixelated;margin-bottom:6px;" onerror="this.style.display='none'">`
      : `<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:var(--gold-dim);border-radius:8px;font-size:24px;margin-bottom:6px;">🎁</div>`;

    const qtyControls = (!item.unique && isWished) ? `
      <div style="display:flex;align-items:center;gap:4px;margin-top:4px;" onclick="event.stopPropagation()">
        <button class="btn btn-ghost" style="padding:1px 6px;font-size:11px;" onclick="adjustItemQty('${item.id}',-1)">−</button>
        <span style="font-size:11px;font-weight:600;min-width:16px;text-align:center;">${qty}</span>
        <button class="btn btn-ghost" style="padding:1px 6px;font-size:11px;" onclick="adjustItemQty('${item.id}',1)">+</button>
      </div>` : '';

    const purchasedControls = (!item.unique && (isWished || isPurchased) && qty > 1) ? `
      <div style="font-size:10px;color:var(--text-muted);margin-top:3px;" onclick="event.stopPropagation()">
        <span>Got: </span>
        <button class="btn btn-ghost" style="padding:0px 4px;font-size:10px;" onclick="adjustQtyPurchased('${item.id}',-1)">−</button>
        <span style="font-weight:600;">${qtyPurchased}/${qty}</span>
        <button class="btn btn-ghost" style="padding:0px 4px;font-size:10px;" onclick="adjustQtyPurchased('${item.id}',1)">+</button>
      </div>` : '';

    return `
    <div onclick="cycleItemState('${item.id}')"
      style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 8px;border-radius:10px;border:1px solid ${borderColor};background:${bg};cursor:pointer;opacity:${opacity};transition:opacity 0.25s,border-color 0.2s,background 0.2s;">
      ${imgTag}
      <div style="font-size:11px;font-weight:600;line-height:1.3;margin-bottom:4px;">${item.name}</div>
      <div style="font-size:10px;color:var(--text-muted);">${item.cost} tomes${item.unique ? '' : ' each'}</div>
      <div style="font-size:13px;color:${stateColor};margin-top:4px;">${stateIcon}</div>
      ${qtyControls}
      ${purchasedControls}
    </div>`;
  }).join('');
}

function renderSummary() {
  const total     = wishlistTotalCost();
  const remaining = wishlistRemainingCost();
  const purchased = EVENT?.shop.filter(i => {
    const e = WISHLIST[i.id];
    return e?.state === 'purchased' || (e && e.qtyPurchased >= e.qty && e.qty > 0);
  }).length || 0;

  setText('w-tomes-current',   TOMES);
  setText('w-tomes-needed',    total  || '—');
  setText('w-tomes-remaining', remaining > 0 ? remaining : (total > 0 ? '✓ Done!' : '—'));
  setText('w-items-purchased', purchased);
}

function renderRunCounters() {
  const el = document.getElementById('run-counters');
  const st = document.getElementById('session-tomes');
  if (!el || !EVENT) return;
  el.innerHTML = EVENT.duties.map(d => {
    const runs = SESSION_RUNS[d.id] || 0;
    const catBadge = d.casual
      ? `<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(74,222,128,0.15);color:var(--green);margin-left:5px;">casual</span>`
      : '';
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;border:1px solid var(--border);">
      <div style="flex:1;">
        <span style="font-size:12px;font-weight:600;">${d.name}</span>${catBadge}
        <span style="font-size:10px;color:var(--text-muted);margin-left:8px;">${d.tomes} tomes • ~${d.avgMinutes}m</span>
      </div>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:13px;" onclick="removeRunTomes('${d.id}')">−</button>
      <span style="font-size:13px;font-weight:700;min-width:24px;text-align:center;">${runs}</span>
      <button class="btn btn-gold"  style="padding:3px 8px;font-size:13px;" onclick="addRunTomes('${d.id}')">+</button>
    </div>`;
  }).join('');
  if (st) st.textContent = sessionTomesEarned();
}

function renderRouteOutput() {
  const el = document.getElementById('route-output');
  if (!el || !EVENT) return;
  const needed = wishlistRemainingCost() - TOMES;
  if (wishlistRemainingCost() === 0) {
    el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--green);font-weight:600;">✓ Wishlist complete!</div>`;
    return;
  }
  if (needed <= 0) {
    el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--green);">You have enough tomes for your current wishlist!</div>`;
    return;
  }
  if (wishlistRemainingCost() === 0 || EVENT.shop.every(i => getItemState(i.id) === 'not_wished')) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:12px 0;">Add items to your wishlist to see a recommended route.</div>`;
    return;
  }
  const route = buildRoute();
  if (!route.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text-muted);">No duties available for this mode.</div>`;
    return;
  }
  const totalTime = route.reduce((s, r) => s + r.time, 0);
  el.innerHTML = `
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">
      Need <strong>${needed}</strong> more tomes. Estimated time: <strong>~${Math.round(totalTime / 60 * 10) / 10}h</strong>.
    </p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${route.map(r => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;border:1px solid var(--border);">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${r.duty.name}</div>
          <div style="font-size:11px;color:var(--text-muted);">${r.duty.tomes} tomes/run • ~${r.duty.avgMinutes}m/run</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px;font-weight:700;color:var(--gold);">${r.runs}×</div>
          <div style="font-size:10px;color:var(--text-muted);">~${r.time}m total</div>
        </div>
      </div>`).join('')}
    </div>`;
}

function renderChallenges() {
  if (!EVENT) return;
  for (const type of ['weekly', 'standard', 'minimog', 'ultimog']) {
    const el = document.getElementById(`challenges-${type}`);
    if (!el) continue;
    const challenges = EVENT.challenges[type] || [];
    if (!challenges.length) { el.innerHTML = `<div style="font-size:11px;color:var(--text-muted);">No ${type} challenges for this event.</div>`; continue; }
    el.innerHTML = challenges.map(ch => {
      const done = !!CHALLENGES[ch.id];
      return `
      <div onclick="toggleChallenge('${ch.id}')"
        style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;border:1px solid ${done ? 'var(--green)' : 'var(--border)'};background:${done ? 'rgba(74,222,128,0.07)' : 'transparent'};cursor:pointer;transition:all 0.2s;">
        <span style="font-size:16px;flex-shrink:0;">${done ? '✓' : '○'}</span>
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:600;${done ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${ch.name}</div>
          ${ch.requirement ? `<div style="font-size:10px;color:var(--text-muted);">Requires: ${ch.requirement}</div>` : ''}
        </div>
        <div style="font-size:12px;font-weight:700;color:${done ? 'var(--green)' : 'var(--gold)'};">+${ch.bonus}</div>
      </div>`;
    }).join('');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TABS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function switchTab(name) {
  ['wishlist', 'farm', 'challenges'].forEach(t => {
    document.getElementById(`tab-${t}-content`).style.display = t === name ? 'block' : 'none';
    document.getElementById(`tab-btn-${t}`).classList.toggle('active', t === name);
  });
  if (name === 'farm') renderTomeHistory();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openItemModal(itemId) {
  const item = EVENT?.shop.find(i => i.id === itemId);
  if (!item) return;
  setText('modal-name',     item.name);
  setText('modal-category', cap(item.category));
  setText('modal-cost',     item.cost + ' ' + (EVENT?.tomeType || 'tomes'));
  const img = document.getElementById('modal-img');
  if (img) { img.src = item.img || ''; img.style.display = item.img ? 'block' : 'none'; }

  const mediaEl = document.getElementById('modal-media');
  if (mediaEl) mediaEl.innerHTML = item.media ? renderMedia(item.media) : '';

  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function renderMedia(url) {
  if (!url) return '';
  const isImage = /\.(png|jpg|jpeg|gif|webp|avif)(\?|$)/i.test(url);
  const isYT    = /youtube\.com|youtu\.be/.test(url);
  if (isImage) return `<img src="${url}" style="width:100%;border-radius:8px;margin-bottom:10px;" onerror="this.style.display='none'">`;
  if (isYT) {
    const id = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
    if (id) return `<div style="position:relative;padding-bottom:56.25%;height:0;margin-bottom:10px;"><iframe src="https://www.youtube.com/embed/${id}" style="position:absolute;inset:0;width:100%;height:100%;border-radius:8px;" allowfullscreen></iframe></div>`;
  }
  return `<video src="${url}" controls style="width:100%;border-radius:8px;margin-bottom:10px;"></video>`;
}

function closeModal() {
  const o = document.getElementById('modal-overlay');
  if (o) o.style.display = 'none';
}
function maybeCloseModal(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
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
//  CLOUD AUTH  (same pattern as series tracker)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function initCloudAuth() {
  try {
    const resp = await fetch('/api/me', { credentials: 'same-origin' });
    if (!resp.ok) { renderAuthUI(null); return; }
    _cloudUser = await resp.json();
    renderAuthUI(_cloudUser);
  } catch { renderAuthUI(null); }
}

function toggleProfileMenu() {
  const menu = document.getElementById('profile-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function renderAuthUI(user) {
  const el = document.getElementById('discord-auth-widget');
  if (!el) return;
  if (!user) {
    el.innerHTML = `
      <a href="/auth/login" style="display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:8px;border:1px solid #5865F2;background:rgba(88,101,242,0.12);color:#7289da;font-size:11px;font-weight:600;text-decoration:none;transition:background 0.15s;"
        onmouseover="this.style.background='rgba(88,101,242,0.22)'" onmouseout="this.style.background='rgba(88,101,242,0.12)'">
        <svg width="14" height="14" viewBox="0 0 71 55" fill="#7289da" xmlns="http://www.w3.org/2000/svg"><path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.2 0A37.8 37.8 0 0 0 25.4.5a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.6 4.9a.2.2 0 0 0-.1.1C1.5 18.4-.9 31.5.3 44.5a.2.2 0 0 0 .1.2 58.9 58.9 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36 36 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.7 58.7 0 0 0 17.8-9 .2.2 0 0 0 .1-.2c1.4-15-2.4-28-10.1-39.6a.2.2 0 0 0-.1-.1ZM23.7 36.8c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z"/></svg>
        Login with Discord
      </a>`;
    return;
  }
  const avatarSrc = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=64`
    : null;
  const avatarInner = avatarSrc
    ? `<img src="${avatarSrc}" style="width:28px;height:28px;border-radius:50%;display:block;" onerror="this.style.display='none'">`
    : `<span style="font-size:13px;">⚔</span>`;
  const displayName = user.username.length > 14 ? user.username.slice(0, 13) + '…' : user.username;
  el.style.position = 'relative';
  el.innerHTML = `
    <button onclick="toggleProfileMenu()"
      style="background:rgba(88,101,242,0.1);border:1px solid rgba(88,101,242,0.35);border-radius:20px;padding:3px 10px 3px 4px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:background 0.15s;"
      onmouseover="this.style.background='rgba(88,101,242,0.2)'" onmouseout="this.style.background='rgba(88,101,242,0.1)'">
      <span style="width:28px;height:28px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--gold-dim);flex-shrink:0;">${avatarInner}</span>
      <span style="font-size:11px;font-weight:600;color:var(--text);">${displayName}</span>
      <span style="font-size:9px;color:var(--text-muted);">▾</span>
    </button>
    <div id="profile-menu" style="display:none;position:absolute;top:44px;left:0;z-index:500;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.45);">
      <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:600;margin-bottom:3px;">${user.username}</div>
        <div style="display:inline-flex;align-items:center;gap:5px;">
          <svg width="12" height="12" viewBox="0 0 71 55" fill="#7289da" xmlns="http://www.w3.org/2000/svg"><path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.2 0A37.8 37.8 0 0 0 25.4.5a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.6 4.9a.2.2 0 0 0-.1.1C1.5 18.4-.9 31.5.3 44.5a.2.2 0 0 0 .1.2 58.9 58.9 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36 36 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.7 58.7 0 0 0 17.8-9 .2.2 0 0 0 .1-.2c1.4-15-2.4-28-10.1-39.6a.2.2 0 0 0-.1-.1ZM23.7 36.8c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z"/></svg>
          <span style="font-size:10px;color:var(--text-muted);">Discord account linked</span>
        </div>
      </div>
      <a href="/series" style="display:block;font-size:12px;color:var(--text-muted);text-decoration:none;padding:4px 0;margin-bottom:8px;" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-muted)'">← Series Tracker</a>
      <button class="btn btn-outline" onclick="handleLogout()" style="width:100%;justify-content:center;font-size:11px;padding:6px;">Logout</button>
    </div>`;
}

async function handleLogout() {
  try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
  _cloudUser = null;
  renderAuthUI(null);
  showToast('Logged out.');
}

document.addEventListener('click', e => {
  const widget = document.getElementById('discord-auth-widget');
  const menu   = document.getElementById('profile-menu');
  if (menu && menu.style.display !== 'none' && widget && !widget.contains(e.target)) {
    menu.style.display = 'none';
  }
});

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
  await Promise.all([loadData(), initCloudAuth()]);

  if (!EVENT) {
    document.getElementById('no-active-event').style.display = 'block';
    return;
  }

  document.getElementById('main-content').style.display = 'block';
  document.getElementById('event-banner').style.display  = 'block';

  loadPersisted();
  document.getElementById('inp-tomes').value = TOMES;
  renderAll();

  document.getElementById('inp-tomes')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyTomes(); });
});
