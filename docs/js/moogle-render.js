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

function renderUpcomingBanner(ev) {
  const el = document.getElementById('upcoming-event-banner');
  if (!el || !ev) return;
  const startDate = new Date(ev.start);
  const daysUntil = Math.ceil((startDate.getTime() - Date.now()) / 86400000);
  const dateStr = startDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
      <span style="font-size:1.6rem;">🐱</span>
      <div>
        <div class="font-cinzel" style="color:var(--gold); font-size:0.95rem; font-weight:600; margin-bottom:3px;">${ev.name}</div>
        <div style="font-size:0.82rem; color:var(--text-muted);">
          Starts <strong style="color:var(--text);">${dateStr}</strong>
          ${daysUntil > 0 ? ` — <strong style="color:var(--gold);">${daysUntil}</strong> day${daysUntil !== 1 ? 's' : ''} away` : ' — starting soon!'}
          ${ev.tomeType ? ` &nbsp;·&nbsp; ${ev.tomeType}` : ''}
        </div>
      </div>
    </div>`;
  el.style.display = 'block';
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

// ── Category filter ────────────────────────────────────

let _shopFilter = 'all';

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

function setShopFilter(cat) {
  _shopFilter = cat;
  document.querySelectorAll('[id^="cat-btn-"]').forEach(btn => {
    btn.className = btn.id === `cat-btn-${cat}` ? 'btn btn-gold' : 'btn btn-outline';
    btn.style.fontSize = '11px'; btn.style.padding = '4px 12px';
  });
  renderShopGrid();
}

// ── Shop list ──────────────────────────────────────────

function renderShopGrid() {
  if (!EVENT) return;
  const el = document.getElementById('shop-grid');
  if (!el) return;

  const items = EVENT.shop.filter(i => _shopFilter === 'all' || i.category === _shopFilter);

  // Sort: wished first, then purchased/collected, then not_wished (faded)
  const order = { wished: 0, purchased: 1, collected: 1, not_wished: 2 };
  const sorted = [...items].sort((a, b) => (order[getItemState(a.id)] || 0) - (order[getItemState(b.id)] || 0));

  el.innerHTML = sorted.map(item => {
    const state        = getItemState(item.id);
    const qty          = item.unique ? 1 : getItemQty(item.id);
    const qtyPurchased = item.unique ? (state === 'purchased' ? 1 : 0) : getItemQtyPurchased(item.id);
    const isWished    = state === 'wished';
    const isPurchased = state === 'purchased';
    const isCollected = state === 'collected';

    const rowClass = isPurchased ? 'shop-row is-purchased'
      : isCollected ? 'shop-row is-collected'
      : isWished    ? 'shop-row is-wished'
      : 'shop-row is-dim';

    const { label: catLabel, badgeClass: catBadge } = CATEGORY_META[item.category] || CATEGORY_META.other;

    const imgTag = item.img
      ? `<img src="${item.img}" style="width:44px;height:44px;object-fit:contain;image-rendering:pixelated;flex-shrink:0;" onerror="this.style.display='none'">`
      : `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--gold-dim);border-radius:6px;font-size:20px;flex-shrink:0;">🎁</div>`;

    const stateTag = isPurchased
      ? `<span style="font-size:10px;font-weight:700;color:var(--green);">✓ Bought</span>`
      : isCollected
      ? `<span style="font-size:10px;font-weight:700;color:var(--blue);">✓ Owned</span>`
      : isWished
      ? `<span style="font-size:10px;font-weight:700;color:var(--gold);">★ Wished</span>`
      : '';

    // Qty controls for non-unique items (target+purchased counters)
    const qtyControls = (!item.unique && (isWished || isPurchased)) ? `
      <div style="display:flex;align-items:center;gap:2px;" onclick="event.stopPropagation()">
        <button class="btn btn-ghost" style="padding:1px 5px;font-size:11px;" onclick="adjustItemQty('${item.id}',-1)">−</button>
        <span style="font-size:11px;font-weight:600;min-width:14px;text-align:center;">${qty}</span>
        <button class="btn btn-ghost" style="padding:1px 5px;font-size:11px;" onclick="adjustItemQty('${item.id}',1)">+</button>
      </div>` : '';

    const qtyBoughtEl = (!item.unique && (isWished || isPurchased) && qty > 1) ? `
      <div style="display:flex;align-items:center;gap:2px;" onclick="event.stopPropagation()">
        <button class="btn btn-ghost" style="padding:0 3px;font-size:10px;" onclick="adjustQtyPurchased('${item.id}',-1)">−</button>
        <span style="font-size:10px;font-weight:600;color:var(--text-muted);">${qtyPurchased}/${qty}</span>
        <button class="btn btn-ghost" style="padding:0 3px;font-size:10px;" onclick="adjustQtyPurchased('${item.id}',1)">+</button>
      </div>` : '';

    // Primary action button — reflects current state
    let wishBtn;
    if (isPurchased) {
      wishBtn = `<button class="btn btn-ghost" style="padding:3px 10px;font-size:11px;color:var(--green);border-color:rgba(74,222,128,0.4);"
        onclick="event.stopPropagation();markPurchased('${item.id}')" title="Unmark as bought">✓ Bought</button>`;
    } else if (isCollected) {
      wishBtn = `<button class="btn btn-ghost" style="padding:3px 10px;font-size:11px;color:var(--blue);border-color:rgba(91,160,224,0.4);"
        onclick="event.stopPropagation();toggleWishlist('${item.id}')" title="Remove owned mark">✓ Owned</button>`;
    } else if (isWished) {
      wishBtn = `<button class="btn btn-gold" style="padding:3px 10px;font-size:11px;"
        onclick="event.stopPropagation();toggleWishlist('${item.id}')" title="Remove from wishlist">★ Wished</button>`;
    } else {
      wishBtn = `<button class="btn btn-outline" style="padding:3px 10px;font-size:11px;"
        onclick="event.stopPropagation();toggleWishlist('${item.id}')" title="Add to wishlist">☆ Wish</button>`;
    }

    // Mark Bought button — only for wished items, not in upcoming/planning mode
    const boughtBtn = (!EVENT_IS_UPCOMING && isWished) ? `
      <button class="btn btn-ghost" style="padding:3px 10px;font-size:11px;color:var(--text-muted);"
        onclick="event.stopPropagation();markPurchased('${item.id}')" title="Mark as bought">○ Mark Bought</button>` : '';

    return `
    <div class="${rowClass}" onclick="openItemModal('${item.id}')">
      ${imgTag}
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:2px;flex-wrap:wrap;">
          <span class="badge ${catBadge}" style="font-size:9px;">${catLabel}</span>
          <span style="font-size:11px;color:var(--text-muted);">${item.cost} tomes${item.unique ? '' : ' each'}</span>
          ${stateTag}
        </div>
      </div>
      <div class="shop-row-actions" onclick="event.stopPropagation()">
        ${qtyControls}
        ${qtyBoughtEl}
        ${wishBtn}
        ${boughtBtn}
      </div>
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
//  TABS + PAST EVENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function switchTab(name) {
  ['wishlist', 'farm', 'challenges', 'history'].forEach(t => {
    const content = document.getElementById(`tab-${t}-content`);
    const btn     = document.getElementById(`tab-btn-${t}`);
    if (content) content.style.display = t === name ? 'block' : 'none';
    if (btn)     btn.classList.toggle('active', t === name);
  });
  if (name === 'farm')    renderTomeHistory();
  if (name === 'history') renderPastEvents();
}

const _pastExpanded = {};  // { [eventKey]: boolean }

function togglePastEvent(key) {
  _pastExpanded[key] = !_pastExpanded[key];
  const body = document.getElementById(`past-body-${key}`);
  const icon = document.getElementById(`past-icon-${key}`);
  if (body) body.style.display = _pastExpanded[key] ? 'block' : 'none';
  if (icon) icon.textContent   = _pastExpanded[key] ? '▼' : '▶';
}

function renderPastEvents() {
  const el = document.getElementById('tab-history-content');
  if (!el) return;
  const past = ALL_EVENTS.filter(e => !e.active);
  if (!past.length) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--text-muted);">No past events recorded yet.</div>`;
    return;
  }
  el.innerHTML = past.map(ev => {
    const itemCount  = (ev.shop || []).length;
    const isExpanded = !!_pastExpanded[ev.key];

    const shopRows = (ev.shop || []).map(item => {
      const imgTag = item.img
        ? `<img src="${item.img}" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated;flex-shrink:0;" onerror="this.style.display='none'">`
        : `<span style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;background:var(--gold-dim);border-radius:6px;font-size:18px;flex-shrink:0;">🎁</span>`;
      const collectResource = COLLECT_CATEGORY_MAP[item.category];
      const collectLink = (item.unique && collectResource)
        ? `<a href="https://ffxivcollect.com/${collectResource}?search=${encodeURIComponent(item.collectName || item.name)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--text-muted);margin-left:6px;" onclick="event.stopPropagation()" title="View on FFXIV Collect">🔗</a>`
        : '';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
          ${imgTag}
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}${collectLink}</div>
            <div style="font-size:10px;color:var(--text-muted);">${cap(item.category)}</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--gold);flex-shrink:0;">${item.cost}</div>
        </div>`;
    }).join('');

    return `
    <div class="card" style="margin-bottom:14px;">
      <div onclick="togglePastEvent('${ev.key}')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;gap:8px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          <span id="past-icon-${ev.key}" style="font-size:10px;color:var(--text-muted);flex-shrink:0;">${isExpanded ? '▼' : '▶'}</span>
          <div style="min-width:0;">
            <div class="font-cinzel" style="font-size:0.9rem;font-weight:600;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ev.name}</div>
            <div style="font-size:10px;color:var(--text-muted);">${ev.tomeType || ''} &nbsp;·&nbsp; ${itemCount} items</div>
          </div>
        </div>
        <div style="text-align:right;font-size:11px;color:var(--text-muted);flex-shrink:0;">
          ${ev.start ? fmtDate(ev.start) + ' → ' + fmtDate(ev.end) : ''}
          ${ev.patch ? `<div>Patch ${ev.patch}</div>` : ''}
        </div>
      </div>
      <div id="past-body-${ev.key}" style="display:${isExpanded ? 'block' : 'none'};margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">
        ${shopRows}
      </div>
    </div>`;
  }).join('');
}
