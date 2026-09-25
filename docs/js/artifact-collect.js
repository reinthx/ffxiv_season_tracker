// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ARTIFACT COLLECT — FFXIV Collect achievement sync
//  Mirrors moogle-collect.js rate limits + cache shape.
//  Verified live against character 25015431: payload carries
//  achievements.ids (numeric) plus mounts/minions/etc.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _ART_CACHE_KEY = id => `artifact_collect_${id}`;
const _ART_CACHE_TTL = 7 * 24 * 3600000;

// SQLite datetime('now') guard shared with moogle-collect when present.
function parseArtServerDate(s) {
  if (!s) return null;
  return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
}

function _artBuildCacheBlob(charData) {
  const blob = {};
  for (const key of ['mounts', 'minions', 'cards', 'emotes', 'hairstyles', 'bardings', 'orchestrions', 'achievements']) {
    if (charData[key]?.ids) blob[key] = charData[key].ids;
  }
  return blob;
}

function _artLoadCache(lodestoneId) {
  try {
    const raw = localStorage.getItem(_ART_CACHE_KEY(lodestoneId));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || (Date.now() - (entry.savedAt || 0)) > _ART_CACHE_TTL) return null;
    if (!entry.ids || !Array.isArray(entry.ids.achievements)) return null; // pre-achievements blob → refetch
    return entry.ids;
  } catch { return null; }
}

function _artSaveCache(lodestoneId, charData) {
  try {
    localStorage.setItem(_ART_CACHE_KEY(lodestoneId), JSON.stringify({ ids: _artBuildCacheBlob(charData), savedAt: Date.now() }));
  } catch {}
}

// Merge with the shared DB row so moogle's narrower blob never drops our
// achievement ids (and vice versa once moogle saves achievements too).
async function _artSaveCloudCache(lodestoneId, charData, forceLatest) {
  if (!_cloudUser || !lodestoneId) return;
  try {
    let merged = _artBuildCacheBlob(charData);
    try {
      const cr = await fetch(`/api/characters/${encodeURIComponent(lodestoneId)}/collect-cache`, { credentials: 'same-origin' });
      if (cr.ok) {
        const cd = await cr.json();
        const prev = cd.cache ? JSON.parse(cd.cache) : {};
        merged = { ...prev, ...merged };
      }
    } catch {}
    await fetch(`/api/characters/${encodeURIComponent(lodestoneId)}/collect-cache`, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cache: JSON.stringify(merged),
        last_parsed: charData.last_parsed || null,
        force_synced: !!forceLatest,
      }),
    });
    if (forceLatest) {
      try { localStorage.setItem(`collect_forced_${lodestoneId}`, String(Date.now())); } catch {}
    }
  } catch {}
}

// 24h force-sync guard (DB-backed when logged in, localStorage fallback).
async function _artForceAllowed(lodestoneId) {
  let syncedAt = null;
  if (_cloudUser && lodestoneId) {
    try {
      const cr = await fetch(`/api/characters/${encodeURIComponent(lodestoneId)}/collect-cache`, { credentials: 'same-origin' });
      if (cr.ok) { const cd = await cr.json(); syncedAt = cd.syncedAt; }
    } catch {}
  }
  if (!syncedAt) {
    try { syncedAt = new Date(parseInt(localStorage.getItem(`collect_forced_${lodestoneId}`) || '0', 10)).toISOString(); } catch {}
  }
  const hoursSince = syncedAt ? (Date.now() - parseArtServerDate(syncedAt).getTime()) / 3600000 : Infinity;
  return { ok: hoursSince >= 24, hoursLeft: hoursSince < 24 ? Math.ceil(24 - hoursSince) : 0 };
}

function _artSetChecking(on) {
  document.querySelectorAll('[data-collect-check]').forEach(b => {
    b.disabled = on;
    if (on) { b.dataset.label = b.textContent; b.textContent = '⏳ Checking…'; }
    else if (b.dataset.label) { b.textContent = b.dataset.label; delete b.dataset.label; }
  });
}

// Find untracked jobs where Collect shows relic progress.
// Returns [{exp, job}] — the caller tracks them outright (the Check-owned
// click already implies consent).
function _artDetectJobs(ownedIds) {
  const owned = new Set(ownedIds || []);
  const found = [];
  for (const exp of ARTIFACTS.filter(e => e.status === 'live')) {
    const sel = _artSelFor(exp.key);
    for (const st of (exp.steps || [])) {
      const map = st.collectAchievementIds;
      if (!map) continue;
      for (const job of Object.keys(map)) {
        if (sel.jobs[job] || found.some(f => f.exp === exp.key && f.job === job)) continue;
        if (owned.has(map[job])) found.push({ exp: exp.key, job });
      }
    }
  }
  return found;
}

// Track every detected-but-untracked job outright — clicking Check owned
// already implies consent to load them. Returns the newly tracked list.
function _artMaybeAutoTrack(ownedIds) {
  const found = _artDetectJobs(ownedIds);
  for (const f of found) {
    _artSelFor(f.exp).jobs[f.job] = true;
    artPersist(f.exp);
  }
  return found;
}

// Mark trackable steps from an owned-achievement-id set. Returns counts.
function _artApplyAchievementIds(ownedIds) {
  const owned = new Set(ownedIds || []);
  let marked = 0, mapped = 0;
  for (const exp of ARTIFACTS.filter(e => e.status === 'live')) {
    const sel = _artSelFor(exp.key);
    for (const st of (exp.steps || [])) {
      const map = st.collectAchievementIds;
      if (!map) continue;
      mapped++;
      for (const job of Object.keys(map)) {
        if (!sel.jobs[job]) continue;
        const k = artStepKey(exp.key, job, st.n);
        if (sel.steps[k] === 'done') continue;
        if (owned.has(map[job]) && sel.steps[k] !== 'collect-owned') {
          sel.steps[k] = 'collect-owned';
          marked++;
          // Owning this stage implies every earlier one (steps 2/4 have no
          // achievements of their own, so they'd otherwise stay blank).
          if (typeof artCascadePrior === 'function') marked += artCascadePrior(exp.key, job, st.n, 'collect-owned');
        }
      }
    }
    artPersist(exp.key);
    artScheduleSave(exp.key);
  }
  return { marked, mapped };
}

async function checkArtifactsViaCollect(onlyExpKey = null, forceLatest = false) {
  if (typeof artReadOnly === 'function' && artReadOnly()) return;
  if (!ART_CHAR.lodestoneId) { showToast('Link a character first.'); return; }
  // Auto-checks can fire before the data JSON arrives (e.g. right after
  // linking) — make sure the achievement maps are loaded first.
  if (!ARTIFACTS.length && typeof artLoadData === 'function') {
    try { await artLoadData(); } catch {}
  }
  const lid = ART_CHAR.lodestoneId;
  _artSetChecking(true);
  try {
    // ── Force-sync rate limit: Lodestone re-parses are expensive ──
    if (forceLatest) {
      const gate = await _artForceAllowed(lid);
      if (!gate.ok) {
        showToast(`Lodestone sync already requested today. Try again in ${gate.hoursLeft}h.`);
        return;
      }
      localStorage.setItem(`collect_check_${lid}`, '0'); // bypass the 60s guard below
    }

    // ── Serve from cache inside the 60s check window ──
    const lastCheck = parseInt(localStorage.getItem(`collect_check_${lid}`) || '0', 10);
    if (!forceLatest && (Date.now() - lastCheck) / 1000 < 60) {
      const cached = _artLoadCache(lid);
      if (cached) {
        const newly = _artMaybeAutoTrack(cached.achievements);
        const { marked } = _artApplyAchievementIds(cached.achievements);
        if (typeof artRenderAll === 'function') artRenderAll();
        showToast(_artCheckToast(newly, marked, true));
        return;
      }
      // No usable cache — fall through to the network despite the window.
    }

    // ── Fetch from FFXIV Collect ──
    let url = `https://ffxivcollect.com/api/characters/${lid}?ids=true`;
    if (forceLatest) url += '&latest=true';
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      showToast('Character not found on FFXIV Collect. Visit ffxivcollect.com to register your character.');
      return;
    }
    let charData = await resp.json();
    try { localStorage.setItem(`collect_check_${lid}`, String(Date.now())); } catch {}

    // Auto-refresh: data older than 90 days gets one latest=true refetch.
    if (!forceLatest) {
      const lastParsed = charData.last_parsed ? new Date(charData.last_parsed) : null;
      const daysSince = lastParsed ? (Date.now() - lastParsed.getTime()) / 86400000 : Infinity;
      if (daysSince > 90) {
        const fresh = await fetch(url + '&latest=true', { headers: { Accept: 'application/json' } });
        if (fresh.ok) {
          charData = await fresh.json();
          try { localStorage.setItem(`collect_forced_${lid}`, String(Date.now())); } catch {}
        }
      }
    }

    _artSaveCache(lid, charData);
    await _artSaveCloudCache(lid, charData, forceLatest);

    const newly = _artMaybeAutoTrack(charData.achievements?.ids);
    const { marked, mapped } = _artApplyAchievementIds(charData.achievements?.ids);
    if (typeof artRenderAll === 'function') artRenderAll();
    showToast(_artCheckToast(newly, marked, false, mapped));
  } catch (e) {
    showToast('FFXIV Collect check failed: ' + e.message);
  } finally {
    _artSetChecking(false);
  }
}

// One message builder for every outcome (network + cache paths).
function _artCheckToast(newly, marked, cached, mapped = 1) {
  const names = [...new Set((newly || []).map(f => f.job))].join(', ');
  const trackedNote = newly.length ? `Now tracking ${names}. ` : '';
  if (marked > 0) return `${trackedNote}Marked ${marked} step${marked === 1 ? '' : 's'} as already owned${cached ? ' (from cache)' : ' via FFXIV Collect'}.`;
  if (newly.length) return `${trackedNote}No steps auto-marked yet — check off prerequisites to unlock them.`;
  const anyTracked = ARTIFACTS.some(e => e.status === 'live' && Object.keys(_artSelFor(e.key).jobs).length);
  if (!anyTracked) return 'No relic progress detected on FFXIV Collect — track some classes, then check again.';
  if (mapped > 0) return `No new owned steps found${cached ? ' (from cache)' : ' on FFXIV Collect'}.`;
  return 'No achievement IDs mapped yet — steps are manual for now.';
}
