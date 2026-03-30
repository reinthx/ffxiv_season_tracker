// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CHARACTER TRACKING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WORLD_DATA = {
  'NA': {
    'Aether':   ['Adamantoise','Cactuar','Faerie','Gilgamesh','Jenova','Midgardsormr','Sargatanas','Siren'],
    'Crystal':  ['Balmung','Brynhildr','Coeurl','Diabolos','Goblin','Malboro','Mateus','Zalera'],
    'Dynamis':  ['Halicarnassus','Maduin','Marilith','Seraph','Cuchulainn','Golem','Kraken','Rafflesia'],
    'Primal':   ['Behemoth','Excalibur','Exodus','Famfrit','Hyperion','Lamia','Leviathan','Ultros'],
  },
  'EU': {
    'Chaos':    ['Cerberus','Louisoix','Moogle','Omega','Phantom','Ragnarok','Sagittarius','Spriggan'],
    'Light':    ['Alpha','Lich','Odin','Phoenix','Raiden','Shiva','Twintania','Zodiark'],
    'Shadow':   ['Innocence','Pixie','Titania','Tycoon'],
  },
  'JP': {
    'Elemental': ['Aegis','Atomos','Carbuncle','Garuda','Gungnir','Kujata','Tonberry','Typhon'],
    'Gaia':      ['Alexander','Bahamut','Durandal','Fenrir','Ifrit','Ridill','Tiamat','Ultima'],
    'Mana':      ['Anima','Asura','Chocobo','Hades','Ixion','Masamune','Pandaemonium','Titan'],
    'Meteor':    ['Belias','Mandragora','Ramuh','Shinryu','Unicorn','Valefor','Yojimbo','Zeromus'],
  },
  'OCE': {
    'Materia': ['Bismarck','Ravana','Sephirot','Sophia','Zurvan'],
  },
};

function buildWorldSelect() {
  const sel = document.getElementById('mog-char-world');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select World —</option>';
  for (const [region, dcs] of Object.entries(WORLD_DATA)) {
    for (const [dc, worlds] of Object.entries(dcs)) {
      const og = document.createElement('optgroup');
      og.label = `${region} — ${dc}`;
      worlds.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w; opt.textContent = w;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    }
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__'; customOpt.textContent = '— Other / Unlisted world…';
  sel.appendChild(customOpt);
}

function getWorldVal() {
  const wSel    = document.getElementById('mog-char-world');
  const wCustom = document.getElementById('mog-char-world-custom');
  if (wSel && wSel.value && wSel.value !== '__custom__') return wSel.value;
  if (wCustom && wCustom.value.trim()) return wCustom.value.trim();
  return '';
}

function onWorldSelectChange() {
  const btn    = document.getElementById('mog-btn-lookup');
  const hint   = document.getElementById('mog-lookup-hint');
  const hasWorld = !!getWorldVal();
  if (btn) btn.disabled = !hasWorld;
  if (hint) hint.style.display = hasWorld ? 'none' : '';
  const wSel = document.getElementById('mog-char-world');
  const customWrap = document.getElementById('mog-world-custom-wrap');
  if (wSel && customWrap) customWrap.style.display = (wSel.value === '__custom__') ? 'block' : 'none';
}

// Character Lodestone cache (7-day TTL)
const CHAR_CACHE_KEY = 'moogle-char-cache';
const CHAR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
function loadCharCache() { try { return JSON.parse(localStorage.getItem(CHAR_CACHE_KEY) || '{}'); } catch { return {}; } }
function saveCharCache(cache) {
  const cutoff = Date.now() - CHAR_CACHE_TTL;
  for (const key of Object.keys(cache)) { if ((cache[key].cachedAt || 0) < cutoff) delete cache[key]; }
  try { localStorage.setItem(CHAR_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

function parseCharFromDoc(html, doc) {
  const portraitEl = doc.querySelector('.js__image_popup > img')
    || doc.querySelector('.character__detail__image img')
    || doc.querySelector('img[src*="img2.finalfantasyxiv.com"][src*="_gc"]');
  const portrait = portraitEl ? (portraitEl.getAttribute('src') || null) : null;
  const soulMatch = html.match(/Soul of the ([A-Z][A-Za-z ]{2,28}?)(?=["<&\n])/);
  const activeClass = soulMatch ? soulMatch[1].trim() : null;
  return { portrait, activeClass };
}

async function lookupCharacter(forceRefresh = false) {
  const nameVal  = document.getElementById('mog-char-name').value.trim();
  const worldVal = getWorldVal();
  const resultEl = document.getElementById('mog-lookup-result');
  if (!nameVal)  { if (resultEl) resultEl.innerHTML = `<span style="color:var(--text-muted);font-size:12px;">Enter a character name first.</span>`; return; }
  if (!worldVal) { if (resultEl) resultEl.innerHTML = `<span style="color:var(--text-muted);font-size:12px;">Select a Home World first.</span>`; return; }
  const cacheKey = `${nameVal.toLowerCase()}|${worldVal.toLowerCase()}`;
  if (!forceRefresh) {
    const cached = loadCharCache()[cacheKey];
    if (cached && (Date.now() - cached.cachedAt < CHAR_CACHE_TTL)) { showCharResult(resultEl, cached); return; }
  }
  if (resultEl) resultEl.innerHTML = `<span style="color:var(--text-muted);font-size:12px;">Searching Lodestone…</span>`;
  try {
    const searchUrl = `https://na.finalfantasyxiv.com/lodestone/character/?q=${encodeURIComponent(nameVal)}&worldname=${encodeURIComponent(worldVal)}`;
    const resp = await fetchViaProxy(searchUrl);
    const html = await resp.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    let lodestoneId = null;
    for (const a of doc.querySelectorAll('a[href*="/lodestone/character/"]')) {
      const m = a.getAttribute('href').match(/\/character\/(\d+)\//);
      if (m) { lodestoneId = m[1]; break; }
    }
    if (!lodestoneId) {
      if (resultEl) resultEl.innerHTML = `<span style="color:var(--text-muted);font-size:12px;">No match found on Lodestone. Try pasting your character URL instead.</span>`;
      return;
    }
    const avatarEl  = doc.querySelector(`a[href*="/character/${lodestoneId}/"] img`);
    const avatarUrl = avatarEl ? (avatarEl.getAttribute('src') || '') : '';
    const entry     = { name: nameVal, world: worldVal, lodestoneId, avatarUrl, cachedAt: Date.now() };
    try {
      const cr = await fetchViaProxy('https://na.finalfantasyxiv.com/lodestone/character/' + lodestoneId + '/');
      if (cr.ok) { const ch = await cr.text(); const parsed = parseCharFromDoc(ch, new DOMParser().parseFromString(ch, 'text/html')); if (parsed.portrait) entry.portrait = parsed.portrait; if (parsed.activeClass) entry.activeClass = parsed.activeClass; }
    } catch {}
    const cache = loadCharCache(); cache[cacheKey] = entry; saveCharCache(cache);
    showCharResult(resultEl, entry);
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:var(--red);font-size:12px;">⚠ Lookup failed — try pasting your character URL below.</span>`;
  }
}

async function applyLodestoneUrl() {
  const input    = document.getElementById('mog-lodestone-url');
  const resultEl = document.getElementById('mog-lookup-result');
  if (!input) return;
  const val     = input.value.trim();
  const idMatch = val.match(/\/character\/(\d+)/) || (val.match(/^\d+$/) ? [null, val] : null);
  if (!idMatch) { showToast('Paste your full Lodestone character URL'); return; }
  const lodestoneId = idMatch[1];
  if (resultEl) resultEl.innerHTML = `<span style="color:var(--text-muted);font-size:12px;">Loading character…</span>`;
  try {
    const cr = await fetchViaProxy('https://na.finalfantasyxiv.com/lodestone/character/' + lodestoneId + '/');
    if (!cr.ok) throw new Error('HTTP ' + cr.status);
    const charHtml = await cr.text();
    const charDoc  = new DOMParser().parseFromString(charHtml, 'text/html');
    const nameEl   = charDoc.querySelector('.frame__chara__name') || charDoc.querySelector('.character__name');
    const worldEl  = charDoc.querySelector('.frame__chara__world') || charDoc.querySelector('.character__world');
    const charName  = (nameEl && nameEl.textContent.trim()) || document.getElementById('mog-char-name')?.value.trim() || '(Unknown)';
    const charWorld = (worldEl && worldEl.textContent.trim().split(/\s*[\n[]/)[0].trim()) || getWorldVal() || '';
    const avatarEl  = charDoc.querySelector('.character__detail__face img') || charDoc.querySelector('.js__c_face img');
    const avatarUrl = avatarEl ? (avatarEl.getAttribute('src') || '') : '';
    const parsed    = parseCharFromDoc(charHtml, charDoc);
    const entry     = { name: charName, world: charWorld, lodestoneId, avatarUrl, cachedAt: Date.now(), ...(parsed.portrait ? { portrait: parsed.portrait } : {}), ...(parsed.activeClass ? { activeClass: parsed.activeClass } : {}) };
    const cacheKey  = `${charName.toLowerCase()}|${charWorld.toLowerCase()}`;
    const cache = loadCharCache(); cache[cacheKey] = entry; saveCharCache(cache);
    showCharResult(resultEl, entry);
  } catch {
    // Partial save — just the lodestone ID
    const nameVal  = document.getElementById('mog-char-name')?.value.trim() || '(Unknown)';
    const worldVal = getWorldVal() || '';
    const entry    = { name: nameVal, world: worldVal, lodestoneId, avatarUrl: '', cachedAt: Date.now() };
    const cacheKey = `${nameVal.toLowerCase()}|${worldVal.toLowerCase()}`;
    const cache = loadCharCache(); cache[cacheKey] = entry; saveCharCache(cache);
    showCharResult(resultEl, entry);
    showToast('Portrait unavailable — character linked by ID only.');
  }
}

function showCharResult(resultEl, entry) {
  if (!resultEl) return;
  const lodestoneUrl = `https://na.finalfantasyxiv.com/lodestone/character/${entry.lodestoneId}/`;
  const safeName    = (entry.name  || '').replace(/'/g, "\\'");
  const safeWorld   = (entry.world || '').replace(/'/g, "\\'");
  const safeAvatar  = (entry.avatarUrl || '').replace(/'/g, "\\'");
  resultEl.innerHTML = `
    <div class="char-result-card">
      ${entry.avatarUrl ? `<img src="${entry.avatarUrl}" alt="${entry.name}" onerror="this.style.display='none'">` : ''}
      <div class="char-result-info">
        <div class="char-result-name">${entry.name}</div>
        <div class="char-result-server">${entry.world}</div>
        <a href="${lodestoneUrl}" target="_blank" rel="noopener">🔗 Lodestone</a>
      </div>
      <button class="btn btn-gold" style="padding:5px 12px;font-size:12px;" onclick="applyCharacter('${safeName}','${safeWorld}','${entry.lodestoneId}','${safeAvatar}')">Use</button>
    </div>`;
}

function applyCharacter(name, world, lodestoneId, avatarUrl) {
  CHAR = { name, world, lodestoneId, avatarUrl: avatarUrl || null };
  // Try to pull portrait from cache
  const cacheKey = `${name.toLowerCase()}|${world.toLowerCase()}`;
  const cache    = loadCharCache();
  const cached   = cache[cacheKey] || Object.values(cache).find(e => e.lodestoneId === lodestoneId);
  if (cached?.portrait) CHAR.portrait = cached.portrait;
  saveCharData();
  renderCharDisplay();
  saveToCloud();
  showToast(`Character set: ${name}`);
  const section = document.querySelector('.char-card-section');
  if (section) section.classList.remove('open');
}

function clearCharacter() {
  CHAR = { name: null, world: null, lodestoneId: null, avatarUrl: null };
  saveCharData();
  renderCharDisplay();
}

function renderCharDisplay() {
  const el = document.getElementById('mog-char-display');
  if (!el) return;
  if (!CHAR.name) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.style.flexWrap = 'wrap';
  const avatarTag = CHAR.avatarUrl
    ? `<img src="${CHAR.avatarUrl}" style="width:28px;height:28px;border-radius:4px;flex-shrink:0;object-fit:cover;" onerror="this.style.display='none'">`
    : `<span style="width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;background:var(--gold-dim);border-radius:4px;font-size:14px;flex-shrink:0;">⚔</span>`;
  // Show FFXIV Collect check button only when character has a real Lodestone ID and event has collectibles
  const hasCollectibles = EVENT && (EVENT.shop || []).some(i => i.unique && COLLECT_CATEGORY_MAP[i.category]);
  const collectBtn = (CHAR.lodestoneId && hasCollectibles)
    ? `<button class="btn btn-outline" id="btn-check-collect" style="padding:3px 8px;font-size:10px;flex-shrink:0;" title="Auto-mark items you already own via FFXIV Collect" onclick="checkCollectedViaFFXIVCollect()">🔍 Check owned</button>`
    : '';
  el.innerHTML = `
    ${avatarTag}
    <div style="flex:1;min-width:0;">
      <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${CHAR.name}</div>
      <div style="font-size:10px;color:var(--text-muted);">${CHAR.world || ''}</div>
    </div>
    ${collectBtn}
    <button class="btn btn-ghost" style="padding:2px 6px;font-size:10px;" title="Clear character" onclick="clearCharacter()">✕</button>`;
}
