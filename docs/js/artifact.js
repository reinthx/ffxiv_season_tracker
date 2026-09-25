// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ARTIFACT HUB — state, persistence (soft-cache), cloud, character
//  Companion: artifact-render.js, artifact-collect.js
//  Depends: shared.js, shared-character.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// var (not let): e2e introspects ARTIFACTS via globalThis (top-level let
// bindings don't attach there, function declarations and var do).
var ARTIFACTS = [];          // expansions from artifacts.json
var ART_MAPCAL = {};         // per-map calibration bounds from _mapCal
let ART_SEL = {};            // { [expKey]: { jobs: {JOB:true}, have: {itemKey:num}, steps: {"JOB:n": state} } }
let ART_CHAR = { name: null, world: null, lodestoneId: null, avatarUrl: null };

// ── Soft-cache (dirty-check) ──────────────────────────
// L0 memory (above) → L1 localStorage → L2 D1.
// Renders read L0 only. PUTs are debounced + hash-gated.
let _cloudUser = null;
let _cloudChars = [];   // server-side character saves (Discord) for the switcher
let _artViewingShare = false;  // true when displaying someone else's share link
let _artShareExp = null;       // expansion key carried by the share link
let _artFlushTimer = {};
let _artLastFlushedHash = {};   // { [expKey]: hash }
let _artLastAcked = {};         // { [expKey]: { updatedAt, contentHash } }

function _artExpKey() {
  // Accept .html, clean (/expansion), and trailing-slash variants —
  // static hosts (serve, Workers Assets) normalize these differently.
  if (!/\/artifacts\/expansion(\.html)?\/?$/.test(location.pathname)) return '';
  return new URLSearchParams(location.search).get('exp') || '';
}

function _artSelFor(expKey) {
  if (!ART_SEL[expKey]) ART_SEL[expKey] = { jobs: {}, have: {}, steps: {}, reqs: {} };
  const sel = ART_SEL[expKey];
  if (!sel.reqs) sel.reqs = {};
  return sel;
}

function _stable(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(_stable).join(',') + ']';
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + _stable(o[k])).join(',') + '}';
}

function _djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function artContentHash(expKey) {
  return _djb2(_stable(_artSelFor(expKey)));
}

// ── Share mode (read-only view of someone else's grind) ─
function artReadOnly() {
  if (!_artViewingShare) return false;
  showToast('Viewing a shared grind — read-only.');
  return true;
}

// Encode the ACTIVE tab into a shareable hash (series-style: #...&sh=1).
function artShareURL() {
  const key = (typeof artGetActiveTab === 'function') ? artGetActiveTab() : null;
  const exp = ARTIFACTS.find(e => e.key === key);
  if (!exp) { showToast('Nothing to share yet.'); return; }
  const sel = _artSelFor(key);
  const p = new URLSearchParams();
  p.set('art', key);
  p.set('jobs', Object.keys(sel.jobs).filter(j => sel.jobs[j]).join(','));
  p.set('have', Object.entries(sel.have).filter(([, v]) => (v || 0) > 0).map(([k, v]) => k + ':' + v).join(','));
  const code = { done: 'd', 'collect-owned': 'c', ignored: 'i' };
  p.set('steps', Object.entries(sel.steps || {}).filter(([, v]) => code[v]).map(([k, v]) => {
    const ix = k.split(':');
    return ix[0] + ':' + ix[1] + ':' + code[v];
  }).join(','));
  if (ART_CHAR.name) p.set('cn', ART_CHAR.name);
  if (ART_CHAR.world) p.set('cw', ART_CHAR.world);
  if (ART_CHAR.lodestoneId) p.set('cl', ART_CHAR.lodestoneId);
  if (ART_CHAR.avatarUrl) p.set('ca', ART_CHAR.avatarUrl);
  p.set('sh', '1');
  const url = location.origin + location.pathname + '#' + p.toString();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => showToast('Share link copied!')).catch(() => prompt('Copy this link:', url));
  } else prompt('Copy this link:', url);
}

function artDecodeShare() {
  try {
    const h = location.hash.slice(1);
    if (!h || !/(^|&)sh=1(&|$)/.test(h)) return false;
    const p = new URLSearchParams(h);
    const key = p.get('art');
    if (!key || !ARTIFACTS.some(e => e.key === key)) return false;
    const sel = _artSelFor(key);
    sel.jobs = {}; sel.have = {}; sel.steps = {}; sel.reqs = {};
    for (const j of (p.get('jobs') || '').split(',').filter(Boolean)) sel.jobs[j] = true;
    for (const kv of (p.get('have') || '').split(',').filter(Boolean)) {
      const ix = kv.split(':');
      if (ix[0]) sel.have[ix[0]] = Math.max(0, parseInt(ix[1] || '0', 10) || 0);
    }
    const code = { d: 'done', c: 'collect-owned', i: 'ignored' };
    for (const t of (p.get('steps') || '').split(',').filter(Boolean)) {
      const m = t.match(/^([^:]+):([^:]+):([dci])$/);
      if (m && code[m[3]]) sel.steps[m[1] + ':' + m[2]] = code[m[3]];
    }
    ART_CHAR = {
      name: p.get('cn') || null, world: p.get('cw') || null,
      lodestoneId: p.get('cl') || null, avatarUrl: p.get('ca') || null,
    };
    artNormalize(key, false); // heal the shared snapshot in memory only
    _artViewingShare = true;
    _artShareExp = key;
    return true;
  } catch { return false; }
}

function artLoadOwnArt() {
  _artViewingShare = false;
  _artShareExp = null;
  try { history.replaceState(null, '', location.pathname); } catch {}
  artLoadChar();
  artLoadPersisted();
  artLoadFromCloudAll();
  if (typeof artRenderAll === 'function') artRenderAll();
}

// Same-document share navigation (clicking a share link while on the hub)
// doesn't reload the page — handle it via hashchange. replaceState above
// doesn't fire this event, so no loop.
window.addEventListener('hashchange', () => {
  if (!document.getElementById('art-expansions') && !document.getElementById('art-guide')) return;
  const h = location.hash.slice(1);
  if (/(^|&)sh=1(&|$)/.test(h)) {
    if (typeof artDecodeShare === 'function') artDecodeShare();
    if (typeof artRenderAll === 'function') artRenderAll();
    if (typeof renderArtChar === 'function') renderArtChar();
  } else if (_artViewingShare) {
    artLoadOwnArt();
  }
});

// ── Passive history (zero-input snapshots) ────────────
// One entry per day per expansion: {d:'YYYY-MM-DD', f:finishedStages, w:weaponsDone}.
// Recorded automatically inside artPersist() — no buttons, no session counters.
function artHistKey(expKey) { return 'artifact-history:' + expKey; }

function artHistLoad(expKey) {
  try {
    const raw = localStorage.getItem(artHistKey(expKey));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(e => e && e.d && typeof e.f === 'number') : [];
  } catch { return []; }
}

function artHistStats(expKey) {
  const exp = ARTIFACTS.find(e => e.key === expKey);
  if (!exp) return { finished: 0, weapons: 0 };
  const sel = _artSelFor(expKey);
  const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
  const reps = (exp.steps || []).filter(s => s.kind !== 'onetime');
  let finished = 0, weapons = 0;
  for (const j of jobs) {
    let jobDone = true;
    for (const st of reps) {
      if (artIsStepDone(expKey, j, st.n)) finished++;
      else jobDone = false;
    }
    if (jobs.length && reps.length && jobDone) weapons++;
  }
  return { finished, weapons };
}

function artRecordHist(expKey) {
  if (_artViewingShare) return;
  if (!ARTIFACTS.some(e => e.key === expKey)) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const s = artHistStats(expKey);
    const hist = artHistLoad(expKey);
    const last = hist[hist.length - 1];
    if (last && last.d === today) {
      if (last.f === s.finished && last.w === s.weapons) return;
      last.f = s.finished; last.w = s.weapons;
    } else {
      // Backfill: if the previous entry has identical counts, just roll the
      // date forward instead of growing a flat line of duplicate points.
      if (last && last.f === s.finished && last.w === s.weapons) { last.d = today; }
      else hist.push({ d: today, f: s.finished, w: s.weapons });
    }
    while (hist.length > 180) hist.shift();
    localStorage.setItem(artHistKey(expKey), JSON.stringify(hist));
  } catch {}
}

// Aggregate across live expansions: week delta, best day, spark points.
function artHistSummary() {
  const byDate = new Map();
  for (const exp of ARTIFACTS.filter(e => e.status === 'live')) {
    for (const e of artHistLoad(exp.key)) {
      byDate.set(e.d, (byDate.get(e.d) || 0) + e.f);
    }
  }
  const days = [...byDate.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
  const inWeek = days.filter(([d]) => d >= weekAgo && d <= today);
  const weekDelta = inWeek.length >= 2 ? inWeek[inWeek.length - 1][1] - inWeek[0][1]
    : (inWeek.length === 1 ? 0 : 0);
  let bestDay = null, bestGain = 0;
  for (let i = 1; i < days.length; i++) {
    const gain = days[i][1] - days[i - 1][1];
    if (gain > bestGain) { bestGain = gain; bestDay = days[i][0]; }
  }
  // Spark points: last 14 days of totals, null-padded.
  const pts = days.slice(-14).map(([, v]) => v);
  return { weekDelta, bestDay, bestGain, points: pts, days: days.length };
}

// ── Persistence (L1) ──────────────────────────────────
function artPersist(expKey) {
  try {
    localStorage.setItem('artifact:' + expKey, JSON.stringify(_artSelFor(expKey)));
  } catch {}
  artRecordHist(expKey);
}

function artLoadPersisted() {
  for (const e of ARTIFACTS) {
    try {
      const raw = localStorage.getItem('artifact:' + e.key);
      if (raw) { ART_SEL[e.key] = JSON.parse(raw); artNormalize(e.key); }
    } catch {}
  }
}

// Heal incoherent states (legacy saves, share links, other devices): any
// done/collect-owned repeat step implies all earlier steps for that job.
// Only fills 'tracked'/missing slots — never done/collect-owned/ignored.
// Returns true when anything changed. Set save=false in share view so the
// viewer's own local save is never overwritten.
function artNormalize(expKey, save = true) {
  const exp = ARTIFACTS.find(e => e.key === expKey);
  if (!exp) return false;
  const sel = _artSelFor(expKey);
  let changed = false;
  for (const job of Object.keys(sel.jobs).filter(j => sel.jobs[j])) {
    for (const st of (exp.steps || []).filter(s => s.kind !== 'onetime' && typeof s.n === 'number')) {
      const k = artStepKey(expKey, job, st.n);
      if (sel.steps[k] === 'done' || sel.steps[k] === 'collect-owned') {
        if (artCascadePrior(expKey, job, st.n, sel.steps[k])) changed = true;
      }
    }
  }
  if (changed && save) artPersist(expKey);
  return changed;
}

function artSaveChar() {
  try {
    localStorage.setItem('artifact-character', JSON.stringify(ART_CHAR));
    localStorage.setItem('artifact-char-updated', String(Date.now()));
  } catch {}
}

function artLoadChar() {
  try {
    const c = JSON.parse(localStorage.getItem('artifact-character') || 'null');
    if (c) ART_CHAR = c;
  } catch {}
}

// ── Data ──────────────────────────────────────────────
async function artLoadData() {
  const errEl = document.getElementById('data-load-error');
  try {
    const r = await fetch('/data/artifacts.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    ARTIFACTS = data.expansions || [];
    ART_MAPCAL = data._mapCal || {};
  } catch (e) {
    if (errEl) { errEl.textContent = 'Failed to load artifact data. ' + e.message; errEl.style.display = 'block'; }
  }
}

// ── Display flags (local-only) ────────────────────────
function artShowCompleted(expKey) {
  try { return localStorage.getItem('artifact-showdone:' + expKey) === '1'; } catch { return false; }
}
function artShowAll(expKey) {
  try { return localStorage.getItem('artifact-showall:' + expKey) === '1'; } catch { return false; }
}
function artRefreshExp(expKey) {
  if (typeof artRenderAll === 'function') artRenderAll();
}
function artToggleShowDone(expKey) {
  try { localStorage.setItem('artifact-showdone:' + expKey, artShowCompleted(expKey) ? '0' : '1'); } catch {}
  artRefreshExp(expKey);
}
// Hub review toggle: flips the per-expansion show-completed flag for every
// tracked expansion at once (expansion-page toggles stay in sync — same flags).
function artToggleShowDoneAll() {
  const keys = ARTIFACTS.filter(e => e.status === 'live' && Object.keys(_artSelFor(e.key).jobs).length).map(e => e.key);
  if (!keys.length) return;
  const target = !keys.every(k => artShowCompleted(k));
  try { for (const k of keys) localStorage.setItem('artifact-showdone:' + k, target ? '1' : '0'); } catch {}
  if (typeof artRenderAll === 'function') artRenderAll();
}
function artToggleShowAll(expKey) {
  // Plain toggle, no confirm dialog — the quest-order lock note next to the
  // button already explains the gating, and every change is one click back.
  try { localStorage.setItem('artifact-showall:' + expKey, artShowAll(expKey) ? '0' : '1'); } catch {}
  artRefreshExp(expKey);
}
// Undo a misclick: clear 'done' back to 'tracked' for one step across every
// tracked job (plus the global one-time slot). Collect-owned stays —
// achievements are permanent facts, same guard as artToggleStep.
function artUndoStep(expKey, n) {
  if (artReadOnly()) return;
  const exp = ARTIFACTS.find(e => e.key === expKey);
  if (!exp) return;
  const sel = _artSelFor(expKey);
  const st = artFindStep(expKey, n);
  const jobs = st && st.kind === 'onetime' ? ['*'] : (exp.jobs || []).filter(j => sel.jobs[j]);
  let touched = false;
  for (const j of jobs) {
    const k = artStepKey(expKey, j, n);
    if (sel.steps[k] === 'done') { sel.steps[k] = 'tracked'; touched = true; }
  }
  if (!touched) return;
  artPersist(expKey);
  artScheduleSave(expKey);
  showToast('Step ' + n + ' restored — not done.');
  artRefreshExp(expKey);
}
// Copy "Zone (X:1.2, Y:3.4)" for pasting while playing. Reads data
// attributes off the button so zone names with quotes can't break anything.
function artCopyCoords(btn) {
  const zone = btn?.dataset?.zone || 'Eorzea';
  const text = zone + ' (X:' + (btn?.dataset?.x || '?') + ', Y:' + (btn?.dataset?.y || '?') + ')';
  const done = () => showToast('Coords copied — paste while you play.');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => prompt('Copy coords:', text));
  else prompt('Copy coords:', text);
}
// Blink-highlight an element (re-triggers on repeat clicks).
function artFlashEl(el) {
  if (!el) return;
  el.classList.remove('art-flash');
  void el.offsetWidth;
  el.classList.add('art-flash');
  setTimeout(() => el.classList.remove('art-flash'), 2600);
}
// In-page step jump — opens + scrolls the matching step card, falling back to
// the reference-sheet row. Never navigates away; silently no-ops if absent.
function artGotoStep(expKey, n) {
  if (typeof switchArtTab === 'function' && !document.getElementById('art-guide')) {
    if (artGetActiveTab() !== expKey) switchArtTab(expKey);
  }
  const el = document.getElementById('art-step-' + n) || document.getElementById('art-sheet-' + n);
  if (!el) return;
  artOpenAncestors(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  artFlashEl(el);
}
// Expand any collapsed <details> ancestors so a jumped-to card is actually
// visible (past/in-progress steps live inside dropdowns).
function artOpenAncestors(el) {
  let p = el;
  while (p) {
    if (p.tagName === 'DETAILS') p.open = true;
    p = p.parentElement;
  }
  if (el.tagName === 'DETAILS') el.open = true;
}
// In-page reveal for "Full grind sheet" links: scroll the reference sheet.
function artRevealGrind(expKey) {
  if (typeof switchArtTab === 'function' && !document.getElementById('art-guide')) {
    if (artGetActiveTab() !== expKey) switchArtTab(expKey);
  }
  const el = document.getElementById('art-sheet');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  artFlashEl(el);
}
// Scroll to the unlock checklist.
function artScrollToPrereq() {
  const el = document.getElementById('art-prereq');
  if (!el) return;
  artOpenAncestors(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  artFlashEl(el);
}
// Continue button in the guide header: jump to the current step hero (or the
// unlock bubble when the frontier is gated). Confirms with a toast naming the
// step + its need so the click lands unmistakably.
function artContinueFromUnlock(expKey) {
  const exp = ARTIFACTS.find(e => e.key === expKey);
  const el = document.querySelector('#art-guide .art-stephero')
    || document.querySelector('#art-guide .art-unlockhero')
    || document.getElementById('art-prereq');
  if (!el) return;
  artOpenAncestors(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  artFlashEl(el);
  const n = el.dataset ? el.dataset.step : null;
  const st = exp && n != null ? (exp.steps || []).find(s => String(s.n) === String(n)) : null;
  if (st) {
    const g = artGrindForStep(exp, st);
    const what = st.kind === 'onetime' ? `Once ever · need ${g.need}` : `Need ${g.need} ${st.item || ''}`;
    showToast(`Step ${st.n} · ${st.quest} — ${what}.`);
    return;
  }
  showToast('Check off the unlock list to open step 1.');
}

// ── Prerequisite requirements (honor-system checkboxes) ───
// A step only shows once its own requirements are checked (or it's done).
// Keys are the requirement texts (stable strings).
function artReqKey(r) {
  return typeof r === 'string' ? r : (r.t || '');
}
function artReqDone(expKey, r) {
  return !!_artSelFor(expKey).reqs[artReqKey(r)];
}
function artToggleReq(expKey, reqText) {
  if (artReadOnly()) return;
  const sel = _artSelFor(expKey);
  if (sel.reqs[reqText]) delete sel.reqs[reqText];
  else sel.reqs[reqText] = true;
  artPersist(expKey);
  artScheduleSave(expKey);
  artRefreshExp(expKey);
}

// ── Quest-order gating ────────────────────────────────
// Steps walk in quest order; steps sharing a `parallel` group id (e.g. the
// three Zadnor one-time quests, done together) unlock as a unit: entering the
// group open makes every member visible, and the walk only continues past the
// group once ALL members are done.
// A step is visible when its group is open and (it is done or its own
// prerequisites are all checked). Completed steps always show.
function artStepGroups(exp) {
  const groups = [];
  const steps = exp.steps || [];
  for (let i = 0; i < steps.length;) {
    const gid = steps[i].parallel;
    if (!gid) { groups.push([steps[i++]]); continue; }
    const g = [];
    while (i < steps.length && steps[i].parallel === gid) g.push(steps[i++]);
    groups.push(g);
  }
  return groups;
}
function artStepDone(exp, job, st) {
  return st.kind === 'onetime' ? artIsStepDone(exp.key, '*', st.n) : artIsStepDone(exp.key, job, st.n);
}
function artStepReqsOk(exp, st) {
  return (st.requirements || []).every(r => artReqDone(exp.key, r));
}
function artReachable(exp, job) {
  const s = new Set();
  let open = true;
  for (const grp of artStepGroups(exp)) {
    for (const st of grp) {
      if (open && (artStepDone(exp, job, st) || artStepReqsOk(exp, st))) s.add(st.n);
    }
    open = open && grp.every(st => artStepDone(exp, job, st));
  }
  return s;
}

// Union of reachable steps across tracked jobs (empty when nothing tracked).
function artVisibleSteps(exp) {
  if (artShowAll(exp.key)) return (exp.steps || []).slice();
  const sel = _artSelFor(exp.key);
  const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
  const vis = new Set();
  for (const j of jobs) for (const n of artReachable(exp, j)) vis.add(n);
  return (exp.steps || []).filter(st => vis.has(st.n));
}

// ── Step helpers ──────────────────────────────────────
// Repeatable steps track per job ("PLD:3"); one-time steps (kind:'onetime',
// done once ever, not per weapon) track globally under "*:<n>".
function artFindStep(expKey, n) {
  const exp = ARTIFACTS.find(e => e.key === expKey);
  // Same quoted-number pitfall as the item modal — compare as strings.
  return exp?.steps?.find(s => String(s.n) === String(n)) || null;
}

function artStepKey(expKey, job, n) {
  const st = artFindStep(expKey, n);
  return ((st && st.kind === 'onetime') ? '*' : job) + ':' + n;
}

function artStepState(expKey, job, n) {
  return _artSelFor(expKey).steps[artStepKey(expKey, job, n)] || 'tracked';
}

function artIsStepDone(expKey, job, n) {
  const s = artStepState(expKey, job, n);
  return s === 'done' || s === 'collect-owned';
}

// Quest-order cascade: completing step N implies every earlier step (repeat
// per job, one-time globally). Fills earlier steps still sitting at 'tracked'
// with the same state — never touches 'done', 'collect-owned' or 'ignored'.
// Skipped for the global '*' actor (one-time toggles must not invent per-job
// '*:N' keys). Returns the number of steps filled.
function artCascadePrior(expKey, job, n, state) {
  if (job === '*') return 0;
  const exp = ARTIFACTS.find(e => e.key === expKey);
  if (!exp) return 0;
  const steps = exp.steps || [];
  const idx = steps.findIndex(s => String(s.n) === String(n));
  if (idx < 0) return 0;
  const sel = _artSelFor(expKey);
  let filled = 0;
  for (const st of steps.slice(0, idx)) {
    const k = artStepKey(expKey, job, st.n);
    if (!sel.steps[k] || sel.steps[k] === 'tracked') {
      sel.steps[k] = state;
      filled++;
    }
  }
  return filled;
}

function artToggleStep(expKey, job, n) {
  if (artReadOnly()) return;
  const sel = _artSelFor(expKey);
  const k = artStepKey(expKey, job, n);
  const cur = sel.steps[k] || 'tracked';
  // Collect-confirmed ownership is factual (achievements are permanent) —
  // it can't be unchecked. Ignore-state stays available via future UI.
  if (cur === 'collect-owned') {
    showToast('Already confirmed owned via FFXIV Collect — can’t be unchecked.');
    return;
  }
  const exp = ARTIFACTS.find(e => e.key === expKey);
  const reps = exp ? (exp.steps || []).filter(s => s.kind !== 'onetime') : [];
  const wasComplete = job !== '*' && reps.length > 0 && reps.every(s => artIsStepDone(expKey, job, s.n));
  sel.steps[k] = (cur === 'done') ? 'tracked' : 'done';
  if (sel.steps[k] === 'done') artCascadePrior(expKey, job, n, 'done');
  artPersist(expKey);
  artScheduleSave(expKey);
  if (typeof artRenderAll === 'function') artRenderAll();

  const nowComplete = job !== '*' && reps.length > 0 && reps.every(s => artIsStepDone(expKey, job, s.n));
  if (!wasComplete && nowComplete && typeof fireArtConfetti === 'function') fireArtConfetti();
}

// Bulk step toggle for the guide card: steps aren't class-based, so the card
// offers one "Completed" switch that marks/unmarks every tracked class at once.
function artToggleStepAll(expKey, n) {
  if (artReadOnly()) return;
  const exp = ARTIFACTS.find(e => e.key === expKey);
  if (!exp) return;
  const sel = _artSelFor(expKey);
  const st = artFindStep(expKey, n);
  const isOT = !!(st && st.kind === 'onetime');
  const jobs = isOT ? ['*'] : (exp.jobs || []).filter(j => sel.jobs[j]);
  if (!jobs.length) return;
  const reps = (exp.steps || []).filter(s => s.kind !== 'onetime');
  const jobDone = j => reps.length > 0 && reps.every(s => artIsStepDone(expKey, j, s.n));
  const before = new Map(jobs.map(j => [j, jobDone(j)]));
  const allDone = jobs.every(j => artIsStepDone(expKey, j, n));
  for (const j of jobs) {
    const k = artStepKey(expKey, j, n);
    // Collect-confirmed ownership is factual — never unchecked.
    if ((sel.steps[k] || 'tracked') === 'collect-owned') continue;
    sel.steps[k] = allDone ? 'tracked' : 'done';
    if (!allDone) artCascadePrior(expKey, j, n, 'done');
  }
  artPersist(expKey);
  artScheduleSave(expKey);
  if (typeof artRenderAll === 'function') artRenderAll();
  const anyNew = jobs.some(j => !isOT && !before.get(j) && jobDone(j));
  if (anyNew && typeof fireArtConfetti === 'function') fireArtConfetti();
}

// "Review Completed Quests": open + scroll the shrunk completed-guide review
// that lives at the bottom of the page once the whole guide is done.
function artReviewCompleted() {
  const el = document.getElementById('art-completed-guide');
  if (!el) return;
  const d = el.querySelector('details');
  if (d) d.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  artFlashEl(el);
}

// Remaining steps for selected jobs only — completed steps hidden.
// One-time steps appear once (globally) until done, in array order.
function artRemainingSteps(exp) {
  const sel = _artSelFor(exp.key);
  const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
  if (!jobs.length) return [];
  const vis = new Set(artVisibleSteps(exp).map(s => s.n));
  const showDone = artShowCompleted(exp.key);
  return (exp.steps || []).filter(st => {
    if (!vis.has(st.n)) return false;
    if (st.kind === 'onetime') return showDone || !artIsStepDone(exp.key, '*', st.n);
    return showDone || jobs.some(j => !artIsStepDone(exp.key, j, st.n));
  });
}

function artJobsNeedingStep(exp, n) {
  const st = artFindStep(exp.key, n);
  if (st && st.kind === 'onetime') return [];
  const sel = _artSelFor(exp.key);
  return (exp.jobs || []).filter(j => sel.jobs[j] && !artIsStepDone(exp.key, j, n));
}

// Grind plan: need = perWeapon × jobsNeeding − have; runs = ceil(need / yield).
// One-time steps count once globally with per-item lines.
function artGrindForStep(exp, step) {
  const sel = _artSelFor(exp.key);
  if (step.kind === 'onetime') {
    const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
    if (!jobs.length) return { needers: [], have: 0, gross: 0, need: 0, sources: [], best: null, lines: [] };
    const lines = (step.items || []).map(it => {
      const have = Math.max(0, parseInt(sel.have[it.key] || '0', 10) || 0);
      const need = Math.max(0, it.perWeapon - have);
      const sources = (it.sources || []).map(s => ({ ...s, ...artSourceRuns(need, s) }));
      const best = sources.filter(s => s.runs != null).sort((a, b) => a.runs - b.runs)[0] || null;
      return { key: it.key, name: it.name, perWeapon: it.perWeapon, have, need, sources, best };
    });
    const need = lines.reduce((t, l) => t + l.need, 0);
    const best = lines.map(l => l.best).filter(Boolean).sort((a, b) => a.runs - b.runs)[0] || null;
    return { needers: ['∗'], have: 0, gross: lines.reduce((t, l) => t + l.perWeapon, 0), need, sources: [], best, lines };
  }
  const needers = artJobsNeedingStep(exp, step.n);
  // Split-farm steps (e.g. step 2's 20/20/20 memories) track each type under
  // its own sub-key — the total is the sum of those, never a separate
  // aggregate key (which made the stockpile impossible to lower).
  const subItems = step.subItems || [];
  const haveOf = k => Math.max(0, parseInt(sel.have[k] || '0', 10) || 0);
  const have = subItems.length
    ? subItems.reduce((t, s) => t + haveOf(s.key), 0)
    : haveOf(step.itemKey);
  // firstFree: the first N weapons skip this step's cost (e.g. the free first
  // Resistance weapon) — once any copy is done, everyone pays.
  let billable = needers.length;
  if (step.firstFree && needers.length) {
    const anyDone = Object.entries(sel.steps).some(([k, v]) =>
      k.endsWith(':' + step.n) && (v === 'done' || v === 'collect-owned'));
    if (!anyDone) billable = Math.max(0, needers.length - step.firstFree);
  }
  const gross = step.perWeapon * billable;
  const need = Math.max(0, gross - have);
  const sources = (step.sources || []).map(s => ({ ...s, ...artSourceRuns(need, s) }));
  const best = sources.filter(s => s.runs != null).sort((a, b) => a.runs - b.runs)[0] || null;
  return { needers, have, gross, need, sources, best, free: needers.length - billable, billable };
}

// Parse a drop probability from a source's free-text rate ("Random drop (~61%)",
// "Guaranteed with Gold medal", "Per 10 floors: 1–60 ~10–20%, …"). Ranges take
// the lower bound so estimates stay conservative.
function artRatePct(rate) {
  if (!rate) return null;
  const s = String(rate);
  const range = s.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*%/);
  if (range) return Math.max(0.01, parseFloat(range[1]) / 100);
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Math.max(0.01, parseFloat(m[1]) / 100) : null;
}

// Expected runs to earn `need` from a source. Guaranteed drops use yield/run;
// a stated % gives an estimated run count (flagged); an unquantified random
// drop gets no invented count.
function artSourceRuns(need, s) {
  if (!s || !(s.yields > 0)) return { runs: null, estimated: false };
  const pct = artRatePct(s.rate);
  if (pct != null && pct > 0 && pct < 1) {
    return { runs: Math.ceil(need / (s.yields * pct)), estimated: true };
  }
  if (pct == null && s.rate && /random|chance|rare|drop|odds/i.test(s.rate)) {
    return { runs: null, estimated: false };
  }
  return { runs: Math.ceil(need / s.yields), estimated: false };
}

// Display helper: "20" or "~30" (estimated from a drop rate).
function artRuns(x) {
  return x && x.runs != null ? (x.estimated ? '~' : '') + x.runs : null;
}

// ── Cloud (dirty-gated, debounced) ────────────────────
async function artInitCloud() {
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin' });
    if (!r.ok) return;
    _cloudUser = await r.json();
    if (typeof renderArtAuth === 'function') renderArtAuth();
    artLoadCloudChars();
    artLoadFromCloudAll();
  } catch {}
}

// Saved characters for the switcher (created on Series/Moogle; reused here).
async function artLoadCloudChars() {
  if (!_cloudUser) return;
  try {
    const r = await fetch('/api/characters', { credentials: 'same-origin' });
    if (!r.ok) return;
    _cloudChars = await r.json();
    if (typeof renderArtCharSwitcher === 'function') renderArtCharSwitcher();

  } catch {}
}

function artUseCloudChar(lodestoneId) {
  if (artReadOnly()) return;
  const rec = (_cloudChars || []).find(c => c.lodestoneId === lodestoneId);
  if (!rec) return;
  const manual = rec.lodestoneId?.startsWith('manual:');
  ART_CHAR = {
    name: rec.characterName,
    world: rec.characterWorld,
    lodestoneId: manual ? null : rec.lodestoneId,
    avatarUrl: rec.avatarUrl || null,
    portrait: rec.portraitUrl || null,
    activeClass: rec.lodestoneClass || null,
    activeClassLevel: rec.lodestoneClassLevel || null,
    charTitle: rec.lodestoneTitle || null,
    freeCompany: rec.lodestoneFC || null,
  };
  artSaveChar();
  if (typeof renderArtChar === 'function') renderArtChar();
  if (typeof renderArtCharSwitcher === 'function') renderArtCharSwitcher();

  artLoadFromCloudAll();
  showToast('Character set: ' + rec.characterName);
  if (ART_CHAR.lodestoneId && typeof checkArtifactsViaCollect === 'function') checkArtifactsViaCollect();
}

function artScheduleSave(expKey) {
  if (_artViewingShare) return;
  if (!_cloudUser || !ART_CHAR.lodestoneId) return;
  clearTimeout(_artFlushTimer[expKey]);
  _artFlushTimer[expKey] = setTimeout(() => artFlushSave(expKey), 1000);
}

async function artFlushSave(expKey) {
  if (_artViewingShare) return;
  if (!_cloudUser || !ART_CHAR.lodestoneId) return;
  const hash = artContentHash(expKey);
  if (_artLastFlushedHash[expKey] === hash) return; // unchanged → skip PUT
  _artLastFlushedHash[expKey] = hash;
  const sel = _artSelFor(expKey);
  try {
    await fetch('/api/artifacts/' + encodeURIComponent(expKey), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Content-Hash': hash },
      body: JSON.stringify({
        lodestone_id: ART_CHAR.lodestoneId || '',
        tracked_jobs: JSON.stringify(Object.keys(sel.jobs).filter(j => sel.jobs[j])),
        have: JSON.stringify(sel.have),
        steps: JSON.stringify(sel.steps),
        reqs: JSON.stringify(sel.reqs || {}),
      }),
    });
  } catch {}
}

async function artLoadFromCloudAll() {
  if (!_cloudUser) return;
  const keys = _artExpKey() ? [_artExpKey()] : ARTIFACTS.map(e => e.key);
  for (const k of keys) {
    if (_artViewingShare && k === _artShareExp) continue; // never clobber a share view
    try {
      const qp = ART_CHAR.lodestoneId ? '?character=' + encodeURIComponent(ART_CHAR.lodestoneId) : '';
      const ack = _artLastAcked[k];
      const r = await fetch('/api/artifacts/' + encodeURIComponent(k) + qp, {
        credentials: 'same-origin',
        headers: ack?.updatedAt ? { 'If-Modified-Since': ack.updatedAt } : {},
      });
      if (r.status === 304) continue;
      if (!r.ok) continue;
      const d = await r.json();
      const jobs = JSON.parse(d.trackedJobs || '[]');
      const sel = _artSelFor(k);
      sel.jobs = {};
      jobs.forEach(j => { sel.jobs[j] = true; });
      sel.have = JSON.parse(d.have || '{}');
      sel.steps = JSON.parse(d.steps || '{}');
      try { sel.reqs = JSON.parse(d.reqs || '{}'); } catch { sel.reqs = {}; }
      const healed = artNormalize(k);
      _artLastAcked[k] = { updatedAt: d.updatedAt, contentHash: d.contentHash };
      artPersist(k);
      if (healed) {
        // Healed state differs from the cloud copy — push it up (debounced).
        delete _artLastFlushedHash[k];
        artScheduleSave(k);
      } else {
        _artLastFlushedHash[k] = _djb2(_stable(sel));
      }
    } catch {}
  }
  if (typeof artRenderAll === 'function') artRenderAll();

}

// ── Character (thin wrapper over shared core) ─────────
function artCharWorldVal() {
  const s = document.getElementById('art-char-world');
  return s ? s.value : '';
}

function onArtWorldChange() {
  const btn = document.getElementById('art-btn-lookup');
  const hint = document.getElementById('art-lookup-hint');
  const has = !!artCharWorldVal();
  if (btn) btn.disabled = !has;
  if (hint) hint.style.display = has ? 'none' : '';
}

async function artLookup() {
  const name = document.getElementById('art-char-name')?.value.trim() || '';
  const world = artCharWorldVal();
  const resEl = document.getElementById('art-lookup-result');
  if (!name || !world) return;
  if (resEl) resEl.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">Searching Lodestone…</span>';
  try {
    const entry = await lookupCharacterCore(name, world);
    if (!entry) {
      if (resEl) resEl.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">No match found. Try pasting your character URL.</span>';
      return;
    }
    artShowResult(resEl, entry);
  } catch {
    if (resEl) resEl.innerHTML = '<span style="font-size:12px;color:var(--red);">⚠ Lookup failed — try pasting your character URL.</span>';
  }
}

async function artApplyUrl() {
  const input = document.getElementById('art-lodestone-url');
  const resEl = document.getElementById('art-lookup-result');
  const m = (input?.value.trim() || '').match(/\/character\/(\d+)/) || (input?.value.trim().match(/^\d+$/) ? [null, input.value.trim()] : null);
  if (!m) { showToast('Paste your full Lodestone character URL'); return; }
  try {
    const entry = await applyLodestoneUrlCore(m[1], document.getElementById('art-char-name')?.value.trim(), artCharWorldVal());
    artShowResult(resEl, entry);
  } catch {
    showToast('Character load failed.');
  }
}

function artShowResult(resEl, entry) {
  if (!resEl) return;
  const safe = s => (s || '').replace(/'/g, "\\'");
  resEl.innerHTML = `
    <div class="char-result-card">
      ${entry.avatarUrl ? `<img src="${entry.avatarUrl}" alt="" onerror="this.style.display='none'">` : ''}
      <div class="char-result-info">
        <div class="char-result-name">${entry.name}</div>
        <div class="char-result-server">${entry.world || ''}</div>
      </div>
      <button class="btn btn-gold" style="padding:5px 12px;font-size:12px;" onclick="artUseCharacter('${safe(entry.name)}','${safe(entry.world)}','${safe(entry.lodestoneId)}','${safe(entry.avatarUrl)}')">Use</button>
    </div>`;
}

function artUseCharacter(name, world, lodestoneId, avatarUrl) {
  if (typeof artReadOnly === 'function' && artReadOnly()) return;
  ART_CHAR = { name, world, lodestoneId, avatarUrl: avatarUrl || null };
  // Pull the full-body portrait from the shared Lodestone cache (series/moogle lookups)
  try {
    const cache = loadCharCache();
    const hit = Object.values(cache).find(e => e && e.lodestoneId === lodestoneId);
    if (hit?.portrait) ART_CHAR.portrait = hit.portrait;
    if (hit?.activeClass && !ART_CHAR.activeClass) ART_CHAR.activeClass = hit.activeClass;
    if (hit?.activeClassLevel && !ART_CHAR.activeClassLevel) ART_CHAR.activeClassLevel = hit.activeClassLevel;
  } catch {}
  artSaveChar();
  if (typeof renderArtChar === 'function') renderArtChar();
  if (typeof renderArtCharSwitcher === 'function') renderArtCharSwitcher();
  artLoadFromCloudAll();
  showToast('Character set: ' + name);
  document.querySelector('.char-card-section')?.classList.remove('open');
  // A fresh link implies consent to check — run the Collect sync right away.
  if (lodestoneId && typeof checkArtifactsViaCollect === 'function') checkArtifactsViaCollect();
}

function artClearCharacter() {
  if (typeof artReadOnly === 'function' && artReadOnly()) return;
  ART_CHAR = { name: null, world: null, lodestoneId: null, avatarUrl: null };
  artSaveChar();
  if (typeof renderArtChar === 'function') renderArtChar();
  if (typeof renderArtCharSwitcher === 'function') renderArtCharSwitcher();
}

function renderArtAuth() {
  const el = document.getElementById('discord-auth-widget');
  if (!el || !_cloudUser) return;
  el.style.position = 'relative';
  el.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">${esc(_cloudUser.username)} ●</span>`;
}

// ── Page init (shared by the hub landing + per-expansion guide) ──────
// The hub lists expansions; /artifacts/expansion.html?exp=… is the one-page
// guide/tracker for a single expansion. Both boot through here.
async function artPageInit() {
  const isExpPage = !!document.getElementById('art-guide');
  const isHub = !!document.getElementById('art-expansions');
  if (!isExpPage && !isHub) return;
  loadTheme();
  const sel = document.getElementById('theme-select');
  if (sel) {
    const cur = document.documentElement.getAttribute('data-theme') || 'dusk';
    sel.value = cur === '' ? 'dusk' : cur;
  }
  artLoadChar();
  buildWorldSelect('art-char-world');
  await artLoadData();
  artLoadPersisted();
  // Share links (#art=…&sh=1) overlay one expansion + character read-only,
  // after local data loads so Back-to-yours can restore it.
  if (artDecodeShare() && _artShareExp) {
    try {
      artActiveTab = _artShareExp;
      localStorage.setItem('artifact-active-tab', _artShareExp);
      if (isExpPage) {
        const u = new URL(location.href);
        u.searchParams.set('exp', _artShareExp);
        history.replaceState(null, '', u.pathname + u.search + location.hash);
      }
    } catch {}
  }
  await artInitCloud();
  if (typeof artRenderAll === 'function') artRenderAll();
  if (typeof renderArtChar === 'function') renderArtChar();
}
window.addEventListener('load', artPageInit);
