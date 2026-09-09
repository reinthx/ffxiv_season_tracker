

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
      if (cr.ok) {
        const ch = await cr.text();
        const charDoc2 = new DOMParser().parseFromString(ch, 'text/html');
        const parsed = parseCharFromDoc(ch, charDoc2);
        // Prefer full name parsed from the character page over the typed search term
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
  // Pull portrait and extended lodestone data from cache
  const cacheKey = `${name.toLowerCase()}|${world.toLowerCase()}`;
  const cache    = loadCharCache();
  const cached   = cache[cacheKey] || Object.values(cache).find(e => e.lodestoneId === lodestoneId);
  // Prefer a fuller name from cache (e.g. when user typed just first name but cache has full name)
  if (cached?.name && cached.name.includes(' ') && !name.includes(' ')) CHAR.name = cached.name;
  if (cached?.portrait)         CHAR.portrait         = cached.portrait;
  if (cached?.activeClass)      CHAR.activeClass      = cached.activeClass;
  if (cached?.activeClassLevel) CHAR.activeClassLevel = cached.activeClassLevel;
  if (cached?.charTitle)        CHAR.charTitle        = cached.charTitle;
  if (cached?.freeCompany)      CHAR.freeCompany      = cached.freeCompany;
  // Fall back to DB record (already in memory) for fields still missing after local cache
  if (lodestoneId && typeof _enrichCharFromRecord === 'function') {
    const rec = (typeof _cloudChars !== 'undefined' ? _cloudChars : []).find(c => c.lodestoneId === lodestoneId);
    if (rec) _enrichCharFromRecord(rec);
  }
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
  if (typeof renderTomesPortraitBg === 'function') renderTomesPortraitBg();
  const hasCollectibles = EVENT && (EVENT.shop || []).some(i => i.unique && i.collectId != null && COLLECT_CATEGORY_MAP[i.category]);
  const collectBtn = (CHAR.lodestoneId && hasCollectibles)
    ? `<button class="btn btn-outline" id="btn-check-collect" style="padding:3px 8px;font-size:10px;flex-shrink:0;" title="Auto-mark items you already own via FFXIV Collect" onclick="checkCollectedViaFFXIVCollect()">🔍 Check owned</button>
       <button class="btn btn-ghost" style="padding:3px 6px;font-size:10px;flex-shrink:0;color:var(--text-muted);" title="Re-fetch from FFXIV Collect" onclick="checkCollectedViaFFXIVCollect(true)">↺</button>`
    : '';
  const clearBtn = `<button class="btn btn-ghost" style="padding:2px 6px;font-size:10px;" title="Clear character" onclick="clearCharacter()">✕</button>`;
  renderCharBadge(el, CHAR.name ? CHAR : null, collectBtn + clearBtn);
}
