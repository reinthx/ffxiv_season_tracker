// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FFXIV COLLECT  (icon lookup + ownership check)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _collectIconCache = {};

// Returns { image, id } for a given item; results cached to avoid duplicate fetches.
async function fetchCollectItem(category, name) {
  const resource = COLLECT_CATEGORY_MAP[category];
  if (!resource) return null;
  const cacheKey = `${category}:${name}`;
  if (_collectIconCache[cacheKey] !== undefined) return _collectIconCache[cacheKey];
  try {
    const resp = await fetch(
      `https://ffxivcollect.com/api/${resource}?search=${encodeURIComponent(name)}&limit=5`,
      { headers: { Accept: 'application/json' } }
    );
    if (!resp.ok) { _collectIconCache[cacheKey] = null; return null; }
    const json = await resp.json();
    const results = Array.isArray(json) ? json : (json.results || []);
    const match = results.find(r => r.name?.toLowerCase() === name.toLowerCase()) || results[0];
    const result = match ? { image: match.image || null, id: match.id ?? null } : null;
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
async function checkCollectedViaFFXIVCollect() {
  if (!CHAR.lodestoneId || !EVENT) return;
  const btn = document.getElementById('btn-check-collect');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Checking…'; }

  try {
    const uniqueItems = EVENT.shop.filter(i => i.unique && COLLECT_CATEGORY_MAP[i.category]);
    if (uniqueItems.length === 0) { showToast('No collectible items in this event.'); return; }

    // Fetch owned IDs for each needed resource category in parallel.
    // Some categories use a different path for the /owned endpoint vs the search endpoint
    // (e.g. triad search is /triad/cards but owned is /cards/owned).
    const OWNED_PATH_OVERRIDE = { 'triad/cards': 'cards' };

    const resourcesNeeded = [...new Set(uniqueItems.map(i => COLLECT_CATEGORY_MAP[i.category]))];
    const ownedEntries = await Promise.all(
      resourcesNeeded.map(async resource => {
        try {
          const ownedPath = OWNED_PATH_OVERRIDE[resource] || resource;
          const resp = await fetch(`https://ffxivcollect.com/api/characters/${CHAR.lodestoneId}/${ownedPath}/owned`);
          if (!resp.ok) return [resource, new Set()];
          const data = await resp.json();
          // API returns full objects like {id, name, ...}; extract numeric id and normalize to string
          const raw = Array.isArray(data) ? data : (data.owned || []);
          const ids = new Set(raw.map(entry =>
            String(entry !== null && typeof entry === 'object' ? entry.id : entry)
          ));
          return [resource, ids];
        } catch {
          return [resource, new Set()];
        }
      })
    );
    const ownedByResource = Object.fromEntries(ownedEntries);

    // Resolve collect IDs for all unique items in parallel, then check ownership.
    // Uses item.collectName (if set) as the search term instead of item.name,
    // for cases where the in-game item name differs from the FFXIV Collect entry name.
    const itemResults = await Promise.all(
      uniqueItems.map(async item => {
        const resource = COLLECT_CATEGORY_MAP[item.category];
        const owned = ownedByResource[resource];
        if (!owned || owned.size === 0) return null;
        const searchName = item.collectName || item.name;
        const hit = await fetchCollectItem(item.category, searchName);
        return (hit?.id != null && owned.has(String(hit.id))) ? item : null;
      })
    );

    let markedCount = 0;
    for (const item of itemResults.filter(Boolean)) {
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

function modalEscHandler(e) { if (e.key === 'Escape') closeModal(); }

function openItemModal(itemId) {
  // Search active event first, then all events (for past-event previews)
  const item = EVENT?.shop.find(i => i.id === itemId)
    || ALL_EVENTS.flatMap(e => e.shop || []).find(i => i.id === itemId);
  if (!item) return;

  setText('modal-name', item.name);

  // Category badge
  const badgeWrap = document.getElementById('modal-badge-wrap');
  if (badgeWrap) badgeWrap.innerHTML = categoryBadgeHTML(item.category);

  // Wishlist / ownership state + action buttons
  const statusEl  = document.getElementById('modal-status');
  const actionsEl = document.getElementById('modal-actions');
  if (EVENT) {
    const state = getItemState(item.id);
    const isWished    = state === 'wished';
    const isPurchased = state === 'purchased';
    const isCollected = state === 'collected';

    if (statusEl) {
      const stateHTML = isPurchased
        ? `<span style="font-size:11px;font-weight:700;color:var(--green);">✓ Purchased</span>`
        : isCollected
        ? `<span style="font-size:11px;font-weight:700;color:var(--blue);">✓ Already owned</span>`
        : isWished
        ? `<span style="font-size:11px;font-weight:700;color:var(--gold);">★ Wishlisted</span>`
        : `<span style="font-size:11px;color:var(--text-muted);">Not wishlisted</span>`;
      const costText = `<span style="font-size:11px;color:var(--text-muted);margin-left:10px;">${item.cost} ${EVENT.tomeType || 'tomes'}</span>`;
      statusEl.innerHTML = stateHTML + costText;
      statusEl.style.display = 'block';
    }

    if (actionsEl) {
      let wishBtn, boughtBtn = '';
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
      } else {
        wishBtn = `<button class="btn btn-outline" style="padding:5px 14px;font-size:12px;"
          onclick="modalToggleWishlist('${item.id}')">☆ Add to Wishlist</button>`;
      }
      actionsEl.innerHTML = wishBtn + boughtBtn;
      actionsEl.style.display = 'flex';
    }
  } else {
    if (statusEl) statusEl.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';
  }

  // Image
  const img = document.getElementById('modal-img');
  const emojiEl = document.getElementById('modal-emoji');
  if (img) { img.src = item.img || ''; img.style.display = item.img ? 'block' : 'none'; }
  if (emojiEl) { emojiEl.style.display = item.img ? 'none' : 'inline'; }

  // Try fetching icon from FFXIV Collect if we have no local image
  if (!item.img && item.unique && COLLECT_CATEGORY_MAP[item.category]) {
    const searchName = item.collectName || item.name;
    fetchCollectIcon(item.category, searchName).then(iconUrl => {
      if (!iconUrl) return;
      const currentImg = document.getElementById('modal-img');
      if (currentImg && !currentImg.src.includes('http')) {
        currentImg.src = iconUrl;
        currentImg.style.display = 'block';
        if (emojiEl) emojiEl.style.display = 'none';
      }
    });
  }

  // FFXIV Collect link
  const collectResource = COLLECT_CATEGORY_MAP[item.category];
  const collectLinkEl   = document.getElementById('modal-collect-link');
  if (collectLinkEl) {
    if (item.unique && collectResource) {
      const searchName = item.collectName || item.name;
      collectLinkEl.href = `https://ffxivcollect.com/${collectResource}?search=${encodeURIComponent(searchName)}`;
      collectLinkEl.style.display = 'inline-flex';
    } else {
      collectLinkEl.style.display = 'none';
    }
  }

  const mediaEl = document.getElementById('modal-media');
  if (mediaEl) mediaEl.innerHTML = item.media ? renderMedia(item.media) : '';

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
  const o = document.getElementById('modal-overlay');
  if (o) { o.classList.remove('open'); document.removeEventListener('keydown', modalEscHandler); }
}
function maybeCloseModal(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
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
