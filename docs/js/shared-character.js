// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SHARED CHARACTER — cache, Lodestone lookup, badge render
//  Loaded before page-specific scripts on both pages.
//  Depends on: shared.js (fetchViaProxy, parseCharFromDoc, esc)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Unified cache key — shared between Series and Moogle pages
// so a Lodestone lookup on either page is available to both.
const CHAR_CACHE_KEY = 'ffxiv-char-cache';
const CHAR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadCharCache() {
  try { return JSON.parse(localStorage.getItem(CHAR_CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveCharCache(cache) {
  const cutoff = Date.now() - CHAR_CACHE_TTL;
  for (const key of Object.keys(cache)) { if ((cache[key].cachedAt || 0) < cutoff) delete cache[key]; }
  try { localStorage.setItem(CHAR_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// ── Lodestone lookup core ──────────────────────────────
// Search Lodestone by name+world. Returns a cache entry, or null if not found.
// Throws on network failure. Always saves result to cache on success.
async function lookupCharacterCore(nameVal, worldVal, forceRefresh = false) {
  const cacheKey = `${nameVal.toLowerCase()}|${worldVal.toLowerCase()}`;
  if (!forceRefresh) {
    const cached = loadCharCache()[cacheKey];
    if (cached && (Date.now() - cached.cachedAt < CHAR_CACHE_TTL)) return cached;
  }
  const searchUrl = `https://na.finalfantasyxiv.com/lodestone/character/?q=${encodeURIComponent(nameVal)}&worldname=${encodeURIComponent(worldVal)}`;
  const resp = await fetchViaProxy(searchUrl);
  const html = await resp.text();
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  let lodestoneId = null;
  for (const a of doc.querySelectorAll('a[href*="/lodestone/character/"]')) {
    const m = a.getAttribute('href').match(/\/character\/(\d+)\//);
    if (m) { lodestoneId = m[1]; break; }
  }
  if (!lodestoneId) return null;
  const avatarEl  = doc.querySelector(`a[href*="/character/${lodestoneId}/"] img`);
  const avatarUrl = avatarEl ? (avatarEl.getAttribute('src') || '') : '';
  const entry     = { name: nameVal, world: worldVal, lodestoneId, avatarUrl, cachedAt: Date.now() };
  try {
    const cr = await fetchViaProxy('https://na.finalfantasyxiv.com/lodestone/character/' + lodestoneId + '/');
    if (cr.ok) {
      const ch = await cr.text();
      const charDoc2 = new DOMParser().parseFromString(ch, 'text/html');
      const parsed = parseCharFromDoc(ch, charDoc2);
      const nameEl2 = charDoc2.querySelector('.frame__chara__name') || charDoc2.querySelector('.character__name');
      if (nameEl2 && nameEl2.textContent.trim()) entry.name = nameEl2.textContent.trim();
      if (parsed.portrait)         entry.portrait         = parsed.portrait;
      if (parsed.activeClass)      entry.activeClass      = parsed.activeClass;
      if (parsed.activeClassLevel) entry.activeClassLevel = parsed.activeClassLevel;
      if (parsed.charTitle)        entry.charTitle        = parsed.charTitle;
      if (parsed.freeCompany)      entry.freeCompany      = parsed.freeCompany;
    }
  } catch {}
  const cache = loadCharCache(); cache[cacheKey] = entry; saveCharCache(cache);
  return entry;
}

// Fetch a character page by Lodestone ID. Returns a cache entry.
// Throws on fetch failure — caller handles partial save if needed.
async function applyLodestoneUrlCore(lodestoneId, fallbackName, fallbackWorld) {
  const cr = await fetchViaProxy('https://na.finalfantasyxiv.com/lodestone/character/' + lodestoneId + '/');
  if (!cr.ok) throw new Error('HTTP ' + cr.status);
  const charHtml = await cr.text();
  const charDoc  = new DOMParser().parseFromString(charHtml, 'text/html');
  const nameEl   = charDoc.querySelector('.frame__chara__name') || charDoc.querySelector('.character__name');
  const worldEl  = charDoc.querySelector('.frame__chara__world') || charDoc.querySelector('.character__world');
  const charName  = (nameEl  && nameEl.textContent.trim())  || fallbackName  || '(Unknown)';
  const charWorld = (worldEl && worldEl.textContent.trim().split(/\s*[\n[]/)[0].trim()) || fallbackWorld || '';
  const avatarEl  = charDoc.querySelector('.character__detail__face img') || charDoc.querySelector('.js__c_face img');
  const avatarUrl = avatarEl ? (avatarEl.getAttribute('src') || '') : '';
  const parsed    = parseCharFromDoc(charHtml, charDoc);
  const entry     = {
    name: charName, world: charWorld, lodestoneId, avatarUrl, cachedAt: Date.now(),
    ...(parsed.portrait         ? { portrait:         parsed.portrait         } : {}),
    ...(parsed.activeClass      ? { activeClass:      parsed.activeClass      } : {}),
    ...(parsed.activeClassLevel ? { activeClassLevel: parsed.activeClassLevel } : {}),
    ...(parsed.charTitle        ? { charTitle:        parsed.charTitle        } : {}),
    ...(parsed.freeCompany      ? { freeCompany:      parsed.freeCompany      } : {}),
  };
  const cacheKey  = `${charName.toLowerCase()}|${charWorld.toLowerCase()}`;
  const cache = loadCharCache(); cache[cacheKey] = entry; saveCharCache(cache);
  return entry;
}

// ── Character badge renderer ───────────────────────────
// Renders a character badge widget into `el` using CSS class selectors
// (.char-badge, .char-avatar, .char-info, .char-name-row, .char-meta-row, …).
// char: { name, world, lodestoneId, avatarUrl, activeClass, activeClassLevel, charTitle, freeCompany }
// extraButtons: HTML string appended after .char-info (e.g. clear/refresh/collect buttons)
function renderCharBadge(el, char, extraButtons) {
  if (!el) return;
  if (!char || !char.name) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  const classLine = char.activeClass
    ? char.activeClass + (char.activeClassLevel ? ' Lv.' + char.activeClassLevel : '')
    : null;
  const metaParts = [classLine, char.freeCompany ? '‹' + char.freeCompany + '›' : null].filter(Boolean);
  const lodestoneHref = char.lodestoneId
    ? `https://na.finalfantasyxiv.com/lodestone/character/${char.lodestoneId}/`
    : `https://na.finalfantasyxiv.com/lodestone/character/?q=${encodeURIComponent(char.name)}&worldname=${encodeURIComponent(char.world || '')}`;
  el.innerHTML = `
    ${char.avatarUrl
      ? `<img class="char-avatar" src="${esc(char.avatarUrl)}" alt="${esc(char.name)}" onerror="this.style.display='none'">`
      : `<span class="char-avatar char-avatar-placeholder"></span>`}
    <div class="char-info">
      <div class="char-name-row">
        <span class="char-name-display">${esc(char.name)}</span>
        ${char.world ? `<span class="char-world-display">@ ${esc(char.world)}</span>` : ''}
      </div>
      <div class="char-meta-row">
        ${char.charTitle ? `<span class="char-title-display">${esc(char.charTitle)}</span>` : ''}
        ${metaParts.map(p => `<span class="char-class-display">${esc(p)}</span>`).join('')}
        <a class="char-lodestone-link" href="${esc(lodestoneHref)}" target="_blank" rel="noopener">🔗 Lodestone</a>
      </div>
    </div>
    ${extraButtons || ''}`;
}
