// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FFXIV COLLECT  (icon lookup + ownership check)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _collectIconCache = {};

// SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" without a timezone marker.
// Browsers in UTC-negative timezones parse that as local time, making it appear
// to be in the future and causing inflated "try again in Xh" values (e.g. 29h).
// This helper normalises the string to ISO 8601 + Z before construction.
function parseServerDate(s) {
  if (!s) return null;
  return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
}

// ── FFXIV Collect owned-ID cache (localStorage, 7-day TTL) ──────────────
const _COLLECT_CACHE_TTL = 7 * 24 * 3600000;

function _buildCacheBlob(charData) {
  const blob = {};
  for (const key of ['mounts','minions','cards','emotes','hairstyles','bardings','orchestrions']) {
    if (charData[key]?.ids) blob[key] = charData[key].ids;
  }
  return blob;
}

function _saveCollectCache(lodestoneId, charData) {
  try {
    localStorage.setItem(`collect_cache_${lodestoneId}`, JSON.stringify({ ids: _buildCacheBlob(charData), savedAt: Date.now() }));
  } catch {}
}

function _loadCollectCache(lodestoneId) {
  try {
    const raw = localStorage.getItem(`collect_cache_${lodestoneId}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || (Date.now() - (entry.savedAt || 0)) > _COLLECT_CACHE_TTL) return null;
    return entry.ids; // { mounts: [...], minions: [...], ... }
  } catch { return null; }
}

function _applyCollectCache(ownedIds) {
  if (!EVENT) return;
  const CHAR_KEY_OVERRIDE = { 'triad/cards': 'cards' };
  const checkableItems = EVENT.shop.filter(i => i.unique && i.collectId != null && COLLECT_CATEGORY_MAP[i.category]);
  let markedCount = 0;
  for (const item of checkableItems) {
    const resource = COLLECT_CATEGORY_MAP[item.category];
    const charKey  = CHAR_KEY_OVERRIDE[resource] || resource;
    if (!Array.isArray(ownedIds[charKey])) continue;
    if (!ownedIds[charKey].includes(item.collectId)) continue;
    if (!WISHLIST[item.id]) WISHLIST[item.id] = { state: 'not_wished', qty: 1, qtyPurchased: 0 };
    if (WISHLIST[item.id].state !== 'purchased') { WISHLIST[item.id].state = 'collected'; markedCount++; }
  }
  if (markedCount > 0) {
    persist(); saveToCloud(); renderShopGrid(); renderSummary();
    showToast(`Marked ${markedCount} item${markedCount !== 1 ? 's' : ''} as already owned (from cache).`);
  } else {
    showToast('No new owned items found (from cache).');
  }
}

// Returns { image, icon, id } for a given item; results cached to avoid duplicate fetches.
// `image` = large preview (192x192 for mounts/minions, 104x128 for cards), may be null.
// `icon`  = small 40x40 game icon, or 192x192 hairstyle sample for hairstyle category.
// Pass `collectId` to fetch by numeric ID directly (skips name search, more reliable).
async function fetchCollectItem(category, name, collectId = null) {
  const resource = COLLECT_CATEGORY_MAP[category];
  if (!resource) return null;
  const cacheKey = collectId != null ? `${category}:id:${collectId}` : `${category}:${name}`;
  if (_collectIconCache[cacheKey] !== undefined) return _collectIconCache[cacheKey];
  try {
    let match;
    if (collectId != null) {
      const resp = await fetch(
        `https://ffxivcollect.com/api/${resource}/${collectId}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!resp.ok) { _collectIconCache[cacheKey] = null; return null; }
      match = await resp.json();
    } else {
      const resp = await fetch(
        `https://ffxivcollect.com/api/${resource}?search=${encodeURIComponent(name)}&limit=5`,
        { headers: { Accept: 'application/json' } }
      );
      if (!resp.ok) { _collectIconCache[cacheKey] = null; return null; }
      const json = await resp.json();
      const results = Array.isArray(json) ? json : (json.results || []);
      match = results.find(r => r.name?.toLowerCase() === name.toLowerCase()) || results[0];
    }
    const result = match ? { image: match.image || null, icon: match.icon || null, id: match.id ?? null } : null;
    _collectIconCache[cacheKey] = result;
    return result;
  } catch {
    _collectIconCache[cacheKey] = null;
    return null;
  }
}

// Convenience wrapper: returns just the image URL (for modal icon lazy-load)
async function fetchCollectIcon(category, name) {
  const result = await fetchCollectItem(category, name);
  return result?.image ?? null;
}

// Fetch this character's owned collectibles from FFXIV Collect and auto-mark already-owned unique items.
// Pass forceLatest=true to request a Lodestone sync (rate-limited to once per day per character).
// Auto-refresh also fires automatically when the character's last_parsed timestamp is older than 90 days.
async function checkCollectedViaFFXIVCollect(forceLatest = false) {
  if (!CHAR.lodestoneId || !EVENT) return;
  const btn = document.getElementById('btn-check-collect');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Checking…'; }

  // The character endpoint uses 'cards' for triad, not 'triad/cards'
  const CHAR_KEY_OVERRIDE = { 'triad/cards': 'cards' };

  try {
    const checkableItems = EVENT.shop.filter(i => i.unique && i.collectId != null && COLLECT_CATEGORY_MAP[i.category]);
    if (checkableItems.length === 0) { showToast('No collectible items with known IDs in this event.'); return; }

    // ── Rate-limit: 1 check per minute (localStorage — device-local guard) ──
    const checkKey = `collect_check_${CHAR.lodestoneId}`;
    const lastCheck = parseInt(localStorage.getItem(checkKey) || '0', 10);
    const secsSinceCheck = (Date.now() - lastCheck) / 1000;

    // ── Force-refresh rate limit: 24h, DB-backed when logged in ─────────────
    if (forceLatest) {
      let syncedAt = null;
      if (_cloudUser && CHAR.lodestoneId) {
        try {
          const cr = await fetch(`/api/characters/${encodeURIComponent(CHAR.lodestoneId)}/collect-cache`, { credentials: 'same-origin' });
          if (cr.ok) { const cd = await cr.json(); syncedAt = cd.syncedAt; }
        } catch {}
      }
      // Fall back to localStorage if not logged in
      if (!syncedAt) syncedAt = new Date(parseInt(localStorage.getItem(`collect_forced_${CHAR.lodestoneId}`) || '0', 10)).toISOString();

      const hoursSince = syncedAt ? (Date.now() - parseServerDate(syncedAt).getTime()) / 3600000 : Infinity;
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        showToast(`Lodestone sync already requested today. Try again in ${hoursLeft}h.`);
        if (btn) { btn.disabled = false; btn.textContent = '🔍 Check owned'; }
        return;
      }
    }

    // ── Serve from cache if fresh and not a force refresh ────────────────────
    if (!forceLatest && secsSinceCheck < 60) {
      // Prefer DB cache for logged-in users, fall back to localStorage
      let cachedIds = null;
      if (_cloudUser && CHAR.lodestoneId) {
        try {
          const cr = await fetch(`/api/characters/${encodeURIComponent(CHAR.lodestoneId)}/collect-cache`, { credentials: 'same-origin' });
          if (cr.ok) {
            const cd = await cr.json();
            const ageDays = cd.cacheDt ? (Date.now() - parseServerDate(cd.cacheDt).getTime()) / 86400000 : Infinity;
            if (ageDays < 7 && cd.cache) cachedIds = JSON.parse(cd.cache);
          }
        } catch {}
      }
      if (!cachedIds) cachedIds = _loadCollectCache(CHAR.lodestoneId);
      if (cachedIds) {
        _applyCollectCache(cachedIds);
        if (btn) { btn.disabled = false; btn.textContent = '🔍 Check owned'; }
        return;
      }
      // No cache at all — fall through to API call despite rate limit
    }

    // ── Fetch from FFXIV Collect ─────────────────────────────────────────────
    let url = `https://ffxivcollect.com/api/characters/${CHAR.lodestoneId}?ids=true`;
    if (forceLatest) url += '&latest=true';

    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      showToast('Character not found on FFXIV Collect. Visit ffxivcollect.com to register your character.');
      return;
    }
    let charData = await resp.json();
    localStorage.setItem(checkKey, String(Date.now()));

    // Auto-refresh: if FFXIV Collect data is older than 90 days, request a sync
    if (!forceLatest) {
      const lastParsed = charData.last_parsed ? new Date(charData.last_parsed) : null;
      const daysSince = lastParsed ? (Date.now() - lastParsed.getTime()) / 86400000 : Infinity;
      if (daysSince > 90) {
        const freshResp = await fetch(
          `https://ffxivcollect.com/api/characters/${CHAR.lodestoneId}?ids=true&latest=true`,
          { headers: { Accept: 'application/json' } }
        );
        if (freshResp.ok) charData = await freshResp.json();
      }
    }

    // ── Persist cache — DB for logged-in users, localStorage as fallback ─────
    _saveCollectCache(CHAR.lodestoneId, charData); // always save to localStorage
    if (_cloudUser && CHAR.lodestoneId) {
      try {
        await fetch(`/api/characters/${encodeURIComponent(CHAR.lodestoneId)}/collect-cache`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cache:        JSON.stringify(_buildCacheBlob(charData)),
            last_parsed:  charData.last_parsed || null,
            force_synced: forceLatest,
          }),
        });
        if (forceLatest) localStorage.setItem(`collect_forced_${CHAR.lodestoneId}`, String(Date.now()));
      } catch {}
    } else if (forceLatest) {
      localStorage.setItem(`collect_forced_${CHAR.lodestoneId}`, String(Date.now()));
    }

    // ── Match owned IDs ──────────────────────────────────────────────────────
    let markedCount = 0;
    for (const item of checkableItems) {
      const resource = COLLECT_CATEGORY_MAP[item.category];
      const charKey  = CHAR_KEY_OVERRIDE[resource] || resource;
      const ownedIds = charData[charKey]?.ids;
      if (!Array.isArray(ownedIds)) continue;
      if (!ownedIds.includes(item.collectId)) continue;
      if (!WISHLIST[item.id]) WISHLIST[item.id] = { state: 'not_wished', qty: 1, qtyPurchased: 0 };
      if (WISHLIST[item.id].state !== 'purchased') {
        WISHLIST[item.id].state = 'collected';
        markedCount++;
      }
    }

    persist();
    saveToCloud();
    renderShopGrid();
    renderSummary();
    if (markedCount > 0) {
      showToast(`Marked ${markedCount} item${markedCount !== 1 ? 's' : ''} as already owned.`);
    } else {
      showToast('No new owned items found on FFXIV Collect.');
    }
  } catch (e) {
    showToast('FFXIV Collect check failed: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 Check owned'; }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function categoryBadgeHTML(category) {
  const m = CATEGORY_META[category] || { label: cap(category), badgeClass: 'badge-start' };
  return `<span class="badge ${m.badgeClass}">${m.label}</span>`;
}

function ytId(url) {
  return url?.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1] ?? null;
}

function playYtEmbed(el, vid) {
  const wrap = document.createElement('div');
  wrap.className = 'demo-iframe-wrap';
  wrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&rel=0" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen class="demo-iframe"></iframe>`;
  el.replaceWith(wrap);
}

function modalEscHandler(e) { if (e.key === 'Escape') closeModal(); }

function openItemModal(itemId) {
  // Search active event first, then all events (for past-event previews)
  const item = EVENT?.shop.find(i => i.id === itemId)
    || ALL_EVENTS.flatMap(e => e.shop || []).find(i => i.id === itemId);
  if (!item) return;

  // ── Image ────────────────────────────────────────────────────────────────
  const imgEl   = document.getElementById('modal-img');
  const emojiEl = document.getElementById('modal-emoji');
  const imgWrap = document.getElementById('modal-img-wrap');

  function resetImgWrap() {
    if (imgWrap) { imgWrap.style.width = '100px'; imgWrap.style.height = '100px'; imgWrap.style.maxWidth = ''; }
  }
  function expandImgWrap(size) {
    if (imgWrap) { imgWrap.style.width = `${size}px`; imgWrap.style.height = `${size}px`; imgWrap.style.maxWidth = `${size + 20}px`; }
  }

  resetImgWrap();
  if (item.collectImg) {
    if (imgEl) {
      imgEl.src = item.collectImg; imgEl.style.display = 'block';
      imgEl.style.maxWidth = '192px'; imgEl.style.maxHeight = '192px';
      imgEl.style.imageRendering = 'auto';
    }
    if (emojiEl) emojiEl.style.display = 'none';
    expandImgWrap(200);
  } else {
    if (imgEl) {
      imgEl.src = item.img || ''; imgEl.style.display = item.img ? 'block' : 'none';
      imgEl.style.maxWidth = '80px'; imgEl.style.maxHeight = '80px';
      imgEl.style.imageRendering = 'pixelated';
    }
    if (emojiEl) emojiEl.style.display = item.img ? 'none' : 'inline';

    const LARGE_IMG_CATS = new Set(['mount', 'minion', 'triad', 'hairstyle']);
    if (item.unique && COLLECT_CATEGORY_MAP[item.category] && LARGE_IMG_CATS.has(item.category)) {
      const searchName = item.collectName || item.name;
      fetchCollectItem(item.category, searchName, item.collectId ?? null).then(result => {
        if (!result) return;
        const largeUrl = result.image || (item.category === 'hairstyle' ? result.icon : null);
        if (!largeUrl) return;
        const curImg = document.getElementById('modal-img');
        if (!curImg) return;
        curImg.src = largeUrl; curImg.style.display = 'block';
        curImg.style.maxWidth = '192px'; curImg.style.maxHeight = '192px';
        curImg.style.imageRendering = 'auto';
        expandImgWrap(200);
        if (document.getElementById('modal-emoji')) document.getElementById('modal-emoji').style.display = 'none';
      });
    }
  }

  // ── Event label (e.g. "Aphorism") ────────────────────────────────────────
  const eventLabelEl = document.getElementById('modal-event-label');
  if (eventLabelEl) {
    const src = EVENT ? EVENT.name : (ALL_EVENTS.find(e => (e.shop || []).some(i => i.id === itemId))?.name || '');
    eventLabelEl.textContent = src.split(/[\s\-–—]+/).filter(Boolean).pop() || '';
  }

  // ── Name ─────────────────────────────────────────────────────────────────
  setText('modal-name', item.name);

  // ── Badge row: category + cost + collectId ───────────────────────────────
  const badgeWrap = document.getElementById('modal-badge-wrap');
  if (badgeWrap) {
    const costPill = EVENT
      ? `<span style="font-size:11px;color:var(--text-muted);padding:2px 8px;border:1px solid var(--border);border-radius:12px;">${item.cost} tomes</span>`
      : '';
    const collectPill = item.collectId != null
      ? `<span style="font-size:10px;color:var(--text-muted);padding:2px 8px;border:1px solid var(--border);border-radius:12px;font-family:monospace;">itemId: ${item.collectId}</span>`
      : '';
    badgeWrap.innerHTML = `<div style="display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;">${categoryBadgeHTML(item.category)}${costPill}${collectPill}</div>`;
  }

  // ── Optional description ──────────────────────────────────────────────────
  const descEl = document.getElementById('modal-desc');
  if (descEl) {
    if (item.desc) { descEl.textContent = item.desc; descEl.style.display = 'block'; }
    else           { descEl.textContent = ''; descEl.style.display = 'none'; }
  }

  // ── Wishlist state + action buttons ──────────────────────────────────────
  const infoBox   = document.getElementById('modal-item-info');
  const statusEl  = document.getElementById('modal-status');
  const actionsEl = document.getElementById('modal-actions');

  if (EVENT && infoBox) {
    const state = getItemState(item.id);
    const isWished    = state === 'wished';
    const isPurchased = state === 'purchased';
    const isCollected = state === 'collected';
    const isIgnored   = state === 'ignored';

    if (actionsEl) {
      let wishBtn, boughtBtn = '', ignoreBtn = '';
      if (isPurchased) {
        wishBtn = `<button class="btn btn-ghost" style="padding:5px 14px;font-size:12px;color:var(--green);border-color:rgba(74,222,128,0.4);"
          onclick="modalMarkPurchased('${item.id}')">✓ Bought — click to unmark</button>`;
      } else if (isCollected) {
        wishBtn = `<button class="btn btn-ghost" style="padding:5px 14px;font-size:12px;color:var(--blue);border-color:rgba(91,160,224,0.4);"
          onclick="modalToggleWishlist('${item.id}')">✓ Owned — click to unmark</button>`;
      } else if (isWished) {
        wishBtn = `<button class="btn btn-gold" style="padding:5px 14px;font-size:12px;"
          onclick="modalToggleWishlist('${item.id}')">★ Wished — click to remove</button>`;
        if (!EVENT_IS_UPCOMING) {
          boughtBtn = `<button class="btn btn-ghost" style="padding:5px 14px;font-size:12px;"
            onclick="modalMarkPurchased('${item.id}')">○ Mark Bought</button>`;
        }
      } else if (isIgnored) {
        wishBtn = `<button class="btn btn-ghost" style="padding:5px 14px;font-size:12px;color:var(--text-muted);"
          onclick="modalToggleIgnored('${item.id}')">— Ignored — click to unmark</button>`;
        if (item.unique) {
          ignoreBtn = `<button class="btn btn-ghost" style="padding:5px 14px;font-size:12px;color:var(--blue);border-color:rgba(91,160,224,0.3);"
            onclick="modalMarkCollected('${item.id}')">✓ Mark as Owned</button>`;
        }
      } else {
        wishBtn = `<button class="btn btn-outline" style="padding:5px 14px;font-size:12px;"
          onclick="modalToggleWishlist('${item.id}')">☆ Add to Wishlist</button>`;
        if (item.unique) {
          boughtBtn = `<button class="btn btn-ghost" style="padding:5px 14px;font-size:12px;color:var(--blue);border-color:rgba(91,160,224,0.3);"
            onclick="modalMarkCollected('${item.id}')">✓ Mark as Owned</button>`;
        }
        ignoreBtn = `<button class="btn btn-ghost" style="padding:5px 14px;font-size:12px;color:var(--text-muted);"
          onclick="modalToggleIgnored('${item.id}')">— Ignore</button>`;
      }
      actionsEl.innerHTML = wishBtn + boughtBtn + ignoreBtn;
    }
    infoBox.style.display = 'block';
  } else if (infoBox) {
    infoBox.style.display = 'none';
  }

  // ── Video demo (Series-style: thumbnail → click to embed) ────────────────
  const demoEl = document.getElementById('modal-demo');
  if (demoEl) {
    demoEl.innerHTML = '';
    if (item.media) {
      const vid = ytId(item.media);
      if (vid) {
        demoEl.innerHTML = `
          <div class="demo-thumb-wrap" onclick="playYtEmbed(this,'${vid}')" title="Click to play">
            <img class="demo-thumb" src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" alt="Preview" onerror="this.parentElement.style.display='none'">
          </div>
          <a href="${item.media}" target="_blank" rel="noopener" class="demo-btn">▶ Watch on YouTube</a>`;
      }
    }
    document.getElementById('modal-card')?.classList.toggle('has-video', !!(item.media && ytId(item.media)));
  }

  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    const alreadyOpen = overlay.classList.contains('open');
    overlay.classList.add('open');
    if (!alreadyOpen) document.addEventListener('keydown', modalEscHandler);
  }
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
  const iframe = document.querySelector('#modal-demo .demo-iframe');
  if (iframe) iframe.src = '';
  document.getElementById('modal-card')?.classList.remove('has-video');
  const o = document.getElementById('modal-overlay');
  if (o) { o.classList.remove('open'); document.removeEventListener('keydown', modalEscHandler); }
}
function maybeCloseModal(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// Toggle ignored state — sets to 'ignored' if not already, otherwise clears back to 'not_wished'
function toggleIgnored(id) {
  if (!WISHLIST[id]) WISHLIST[id] = { state: 'not_wished', qty: 1, qtyPurchased: 0 };
  WISHLIST[id].state = WISHLIST[id].state === 'ignored' ? 'not_wished' : 'ignored';
  persist();
  saveToCloud();
  renderShopGrid();
  renderSummary();
}

// Wishlist wrappers for modal buttons — update state then re-render modal in place
function modalToggleWishlist(id) {
  toggleWishlist(id);
  openItemModal(id);
}
function modalMarkPurchased(id) {
  markPurchased(id);
  openItemModal(id);
}
function modalToggleIgnored(id) {
  toggleIgnored(id);
  openItemModal(id);
}
function modalMarkCollected(id) {
  markCollected(id);
  openItemModal(id);
}
