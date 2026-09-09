// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RENDER FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderAll() {
  renderEventBanner();
  renderCategoryFilters();
  renderFarmCategoryFilters();
  renderShopGrid();
  renderSummary();
  renderActiveChallengesWidget();
  renderRunCounters();
  renderAnnouncements();
  renderChallenges();
  renderTomeHistory();
}

function renderEventBanner() {
  if (!EVENT) return;
  const banner = document.getElementById('event-banner');
  if (banner) banner.style.display = 'block';
  setText('banner-event-name', EVENT.name);
  setText('banner-tome-type',  EVENT.tomeType);

  if (EVENT.start && EVENT.end) {
    const start = new Date(EVENT.start), end = new Date(EVENT.end), now = new Date();
    const total = end - start, elapsed = now - start;
    const pct   = Math.min(100, Math.max(0, (elapsed / total) * 100));
    const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
    setText('banner-dates',             fmtDate(EVENT.start) + ' → ' + fmtDate(EVENT.end));
    setText('banner-days-left',         daysLeft);
    setText('banner-event-start-label', fmtDate(EVENT.start));
    setText('banner-event-pct-label',   Math.round(pct) + '% elapsed');
    setText('banner-event-end-label',   fmtDate(EVENT.end));
    // Defer width so display:none→block transition fires before the fill animates
    requestAnimationFrame(() => setW('event-timeline-bar', pct));
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
      <span style="font-size:1.6rem;"></span>
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

// ── Category filters ───────────────────────────────────

let _shopFilter    = 'all';
let _farmCatFilter = 'all';

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

function renderFarmCategoryFilters() {
  if (!EVENT) return;
  const el = document.getElementById('farm-category-filters');
  if (!el) return;
  const seen = new Set();
  EVENT.duties.forEach(d => seen.add(d.category));
  const cats = ['all', ...[...seen]];
  el.innerHTML = cats.map(c => `
    <button class="btn btn-outline" id="farm-cat-btn-${c}" style="font-size:11px;padding:4px 12px;"
      onclick="setFarmCatFilter('${c}')">${c === 'all' ? 'All' : cap(c)}</button>`
  ).join('');
  setFarmCatFilter(_farmCatFilter);
}

function setFarmCatFilter(cat) {
  _farmCatFilter = cat;
  document.querySelectorAll('[id^="farm-cat-btn-"]').forEach(btn => {
    btn.className = btn.id === `farm-cat-btn-${cat}` ? 'btn btn-gold' : 'btn btn-outline';
    btn.style.fontSize = '11px'; btn.style.padding = '4px 12px';
  });
  renderRunCounters();
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

let _ignoredExpanded = false;

function toggleIgnoredSection() {
  _ignoredExpanded = !_ignoredExpanded;
  renderShopGrid();
}

function renderShopGrid() {
  if (!EVENT) return;
  const el = document.getElementById('shop-grid');
  if (!el) return;

  const items = EVENT.shop.filter(i => _shopFilter === 'all' || i.category === _shopFilter);

  // Sort: wished first, then purchased/collected, then not_wished, then ignored (bottom)
  const order = { wished: 0, purchased: 1, collected: 1, not_wished: 2, ignored: 3 };
  const sorted = [...items].sort((a, b) => (order[getItemState(a.id)] || 0) - (order[getItemState(b.id)] || 0));

  const visible  = sorted.filter(i => getItemState(i.id) !== 'ignored');
  const ignored  = sorted.filter(i => getItemState(i.id) === 'ignored');

  const renderItem = item => {
    const state        = getItemState(item.id);
    const qty          = item.unique ? 1 : getItemQty(item.id);
    const qtyPurchased = item.unique ? (state === 'purchased' ? 1 : 0) : getItemQtyPurchased(item.id);
    const isWished    = state === 'wished';
    const isPurchased = state === 'purchased';
    const isCollected = state === 'collected';
    const isIgnored   = state === 'ignored';

    const rowClass = isPurchased ? 'shop-row is-purchased'
      : isCollected ? 'shop-row is-collected'
      : isWished    ? 'shop-row is-wished'
      : isIgnored   ? 'shop-row is-ignored'
      : 'shop-row is-dim';

    const { label: catLabel, badgeClass: catBadge } = CATEGORY_META[item.category] || CATEGORY_META.other;

    const imgTag = item.img
      ? `<img src="${item.img}" style="width:44px;height:44px;object-fit:contain;image-rendering:pixelated;flex-shrink:0;" onerror="this.style.display='none'">`
      : `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--gold-dim);border-radius:6px;font-size:20px;flex-shrink:0;">🎁</div>`;

    const costTag = (isPurchased || isCollected)
      ? `<div style="flex-shrink:0;min-width:44px;text-align:center;"><span style="font-size:16px;font-weight:800;color:var(--text-muted);">✓</span></div>`
      : `<div style="flex-shrink:0;min-width:44px;text-align:center;padding:4px 6px;border-radius:6px;background:${isWished ? 'rgba(200,169,110,0.15)' : 'rgba(255,255,255,0.04)'};border:1px solid ${isWished ? 'var(--border-gold)' : 'var(--border)'};">
          <div style="font-size:17px;font-weight:800;color:${isWished ? 'var(--gold)' : 'var(--text-muted);opacity:0.8'};">${item.cost}</div>
          <div style="font-size:9px;color:var(--text-muted);margin-top:-1px;">tome${item.cost !== 1 ? 's' : ''}${!item.unique ? '/ea' : ''}${item.tokenCost ? ` + ${item.tokenCost}🎟` : ''}</div>
        </div>`;

    // Qty controls for non-unique items — always visible so target can be set before wishing
    // Unique items get a same-width spacer so the wish/bought buttons stay column-aligned
    const qtyControls = !item.unique ? `
      <div style="display:flex;align-items:center;gap:2px;" onclick="event.stopPropagation()">
        <button class="btn btn-ghost" style="padding:1px 5px;font-size:11px;" onclick="adjustItemQty('${item.id}',-1)">−</button>
        <span style="font-size:11px;font-weight:600;min-width:20px;text-align:center;">${qty}</span>
        <button class="btn btn-ghost" style="padding:1px 5px;font-size:11px;" onclick="adjustItemQty('${item.id}',1)">+</button>
      </div>` : `<div style="min-width:66px;flex-shrink:0;"></div>`;

    const qtyBoughtEl = (!item.unique && qty > 1) ? `
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

    // Mark as Owned button — for unique items not yet collected/purchased
    const ownBtn = (item.unique && !isWished && !isPurchased && !isCollected) ? `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--blue);opacity:0.7;border-color:rgba(91,160,224,0.3);" title="Mark as already owned (skips purchasing)"
        onclick="event.stopPropagation();markCollected('${item.id}')">✓ Own</button>` : '';

    // Ignore button — only on unwished, unowned items (click-in modal also has it)
    const ignoreBtn = (!isWished && !isPurchased && !isCollected) ? `
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:11px;color:var(--text-muted);opacity:0.6;" title="${isIgnored ? 'Remove ignored mark' : 'Mark as not interested'}"
        onclick="event.stopPropagation();toggleIgnored('${item.id}')">${isIgnored ? '↩' : '—'}</button>` : '';

    return `
    <div class="${rowClass}" onclick="openItemModal('${item.id}')">
      ${imgTag}
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:2px;">
          <span class="badge ${catBadge}" style="font-size:9px;">${catLabel}</span>
        </div>
      </div>
      ${costTag}
      <div class="shop-row-actions" onclick="event.stopPropagation()">
        ${qtyControls}
        ${qtyBoughtEl}
        ${wishBtn}
        ${boughtBtn}
        ${ownBtn}
        ${ignoreBtn}
      </div>
    </div>`;
  };

  let html = visible.map(renderItem).join('');

  if (ignored.length > 0) {
    const arrow = _ignoredExpanded ? '▲' : '▼';
    html += `
    <div onclick="toggleIgnoredSection()" style="display:flex;align-items:center;gap:8px;padding:7px 14px;
      border-radius:8px;border:1px solid var(--border);cursor:pointer;margin-top:4px;
      opacity:0.55;transition:opacity 0.15s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='0.55'">
      <span style="font-size:11px;color:var(--text-muted);flex:1;">— Ignored (${ignored.length})</span>
      <span style="font-size:10px;color:var(--text-muted);">${arrow}</span>
    </div>`;
    if (_ignoredExpanded) html += ignored.map(renderItem).join('');
  }

  el.innerHTML = html;
}

function renderTomesPortraitBg() {
  for (const id of ['tomes-portrait-bg', 'f-tomes-portrait-bg']) {
    const bg = document.getElementById(id);
    if (!bg) continue;
    if (CHAR?.portrait) {
      bg.style.backgroundImage = `url('${CHAR.portrait}')`;
      bg.style.display = 'block';
    } else {
      bg.style.backgroundImage = '';
      bg.style.display = 'none';
    }
  }
}

function renderSummary() {
  const total     = wishlistTotalCost();
  const remaining = wishlistRemainingCost();
  const purchased = EVENT?.shop.filter(i => {
    const e = WISHLIST[i.id];
    return e?.state === 'purchased' || (e && e.qtyPurchased >= e.qty && e.qty > 0);
  }).length || 0;
  const projected  = projectedChallengeEarnings();
  const afterChall = Math.max(0, remaining - TOMES - projected);
  const weeksLeft  = weeksRemainingInEvent();

  for (const pfx of ['w', 'f']) _renderSummaryPanel(pfx, total, remaining, purchased, projected, afterChall, weeksLeft);

  renderTomesPortraitBg();
  renderActiveChallengesWidget();
}

function _renderSummaryPanel(pfx, total, remaining, purchased, projected, afterChall, weeksLeft) {
  setText(`${pfx}-tomes-current`,   TOMES);
  setText(`${pfx}-tomes-needed`,    total || '—');
  setText(`${pfx}-tomes-remaining`, remaining > 0 ? remaining : (total > 0 ? '✓ Done!' : '—'));
  setText(`${pfx}-items-purchased`, purchased);

  const projEl = document.getElementById(`${pfx}-projections`);
  if (!projEl) return;

  if (total > 0 && remaining > 0) {
    projEl.style.display = 'flex';
    setText(`${pfx}-projected-challenges`, projected > 0 ? `+${projected}` : '0');
    const afterEl = document.getElementById(`${pfx}-after-challenges`);
    if (afterEl) {
      if (projected > 0 && afterChall > 0) afterEl.textContent = `→ still need ${afterChall} from duties`;
      else if (projected > 0 && afterChall <= 0) afterEl.textContent = '→ covers your wishlist!';
      else afterEl.textContent = '';
    }
    const paceEl = document.getElementById(`${pfx}-pace-card`);
    if (weeksLeft && weeksLeft > 0 && afterChall > 0) {
      const perWeek = Math.ceil(afterChall / weeksLeft);
      setText(`${pfx}-pace`, perWeek);
      setText(`${pfx}-weeks-left`, `tomes/wk · ${weeksLeft} wk${weeksLeft !== 1 ? 's' : ''} left`);
      if (paceEl) paceEl.style.display = '';
    } else if (afterChall <= 0) {
      setText(`${pfx}-pace`, '✓');
      setText(`${pfx}-weeks-left`, 'covered by challenges');
      if (paceEl) paceEl.style.display = '';
    } else {
      if (paceEl) paceEl.style.display = 'none';
    }
  } else {
    projEl.style.display = 'none';
  }

  // ── Token status (e.g. Uolon Horn's horn tokens) ──
  const tokEl = document.getElementById(`${pfx}-token-status`);
  if (tokEl) {
    const need = tokenNeeded(), have = tokenEarned(), avail = tokenAvailable();
    if (need > 0) {
      tokEl.style.display = 'block';
      const short = Math.max(0, need - have);
      const attainable = have + avail >= need;
      tokEl.innerHTML = short <= 0 ? `🎟 Tokens: <strong>${have}/${need}</strong> ✓ covered`
        : attainable ? `🎟 Tokens: <strong>${have}/${need}</strong> — need ${short} more (still earnable)`
        : `🎟 Tokens: <strong>${have}/${need}</strong> — ⚠ need ${short} more, carry to Second Hunt!`;
      tokEl.style.color = short <= 0 ? 'var(--green)' : (attainable ? 'var(--yellow)' : 'var(--red)');
    } else if (have > 0) {
      tokEl.style.display = 'block';
      tokEl.textContent = `🎟 Tokens earned: ${have}`;
      tokEl.style.color = 'var(--text-muted)';
    } else {
      tokEl.style.display = 'none';
    }
  }
}

function renderActiveChallengesWidget() {
  if (!EVENT) return;
  const today = todayPT();
  const rows  = [];

  // Current-week weeklies only
  const weekDefs    = EVENT.weeks || [];
  const weeklies    = EVENT.challenges?.weekly || [];
  const currentWeek = weekDefs.find(wd => today >= wd.start && today <= wd.end);
  if (currentWeek) {
    weeklies
      .filter(ch => ch.week === currentWeek.week && !CHALLENGES[ch.id])
      .forEach(ch => rows.push({ ch, label: `Wk${currentWeek.week}` }));
  }

  // Minimog / Ultimog — minimog may be week-gated, ultimog is always flat
  for (const type of ['minimog', 'ultimog']) {
    (EVENT.challenges[type] || [])
      .filter(ch => {
        if (CHALLENGES[ch.id]) return false;
        if (ch.week) {
          const wd = weekDefs.find(w => w.week === ch.week);
          if (!wd || today < wd.start) return false;
        }
        return true;
      })
      .forEach(ch => rows.push({ ch, label: type === 'minimog' ? 'Mini' : 'Ulti' }));
  }

  const doneHtml = `<div style="font-size:11px;color:var(--green);padding:4px 0;">✓ All available challenges complete!</div>`;

  const rowHtml = (pfx) => rows.map(({ ch, label }) => `
    <div id="${pfx}ac-${ch.id}" onclick="confirmChallengeInline('${pfx}','${ch.id}')"
      style="display:flex;align-items:center;gap:8px;padding:5px 10px;
      border-radius:7px;border:1px solid var(--border);cursor:pointer;transition:all 0.2s;">
      <span style="font-size:13px;flex-shrink:0;">○</span>
      <div style="flex:1;min-width:0;">
        <span style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${ch.name}</span>
      </div>
      <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(107,122,150,0.15);color:var(--text-muted);flex-shrink:0;">${label}</span>
      <span style="font-size:11px;font-weight:700;color:var(--gold);flex-shrink:0;">+${ch.bonus}${ch.tokens ? ` +${ch.tokens}🎟` : ''}</span>
    </div>`).join('');

  for (const pfx of ['w', 'f']) {
    const el = document.getElementById(`${pfx}-active-weeklies`);
    if (!el) continue;
    el.innerHTML = rows.length ? rowHtml(pfx) : doneHtml;
  }
}

function confirmChallengeInline(pfx, id) {
  const el = document.getElementById(`${pfx}ac-${id}`);
  if (!el || el.dataset.confirming) return;
  el.dataset.confirming = '1';
  // Click anywhere on the row (except Yes) cancels
  el.onclick = () => renderActiveChallengesWidget();
  const ch = findChallenge(id);
  el.innerHTML = `
    <div style="flex:1;min-width:0;">
      <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${ch?.name ?? id}</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;" onclick="event.stopPropagation()">
      <span style="font-size:11px;font-weight:600;color:var(--text);">Mark completed?</span>
      <button class="btn btn-gold" style="padding:3px 10px;font-size:11px;"
        onclick="toggleChallenge('${id}')">Yes</button>
    </div>`;
}

function renderRunCounters() {
  const el = document.getElementById('run-counters');
  const st = document.getElementById('session-tomes');
  if (!el || !EVENT) return;
  const seen = new Set();
  const allDuties = EVENT.duties.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
  const duties = _farmCatFilter === 'all' ? allDuties : allDuties.filter(d => d.category === _farmCatFilter);
  el.innerHTML = duties.length ? duties.map(d => {
    const runs = SESSION_RUNS[d.id] || 0;
    const catBadge = `<span class="badge ${(DUTY_CATEGORY_META[d.category] || DUTY_CATEGORY_META.other).badgeClass}" style="font-size:9px;margin-left:6px;">${cap(d.category)}</span>`;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;border:1px solid var(--border);">
      <div style="flex:1;">
        <span style="font-size:12px;font-weight:600;">${d.name}</span>${catBadge}
        <span style="font-size:10px;color:var(--text-muted);margin-left:8px;">~${d.avgMinutes}m/run</span>
      </div>
      <div style="flex-shrink:0;min-width:52px;text-align:center;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border);">
        <div style="font-size:${typeof d.tomes === 'string' ? '13' : '17'}px;font-weight:800;color:var(--gold);line-height:1.2;">${d.tomes}</div>
        <div style="font-size:9px;color:var(--text-muted);margin-top:1px;">${typeof d.tomes === 'string' ? 'tomes/run~' : 'tomes/run'}</div>
      </div>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:13px;" onclick="removeRunTomes('${d.id}')">−</button>
      <span style="font-size:13px;font-weight:700;min-width:24px;text-align:center;">${runs}</span>
      <button class="btn btn-gold"  style="padding:3px 8px;font-size:13px;" onclick="addRunTomes('${d.id}')">+</button>
    </div>`;
  }).join('') : `<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No duties in this category.</div>`;
  if (st) st.textContent = sessionTomesEarned();
}

function renderRouteOutput() {
  const el = document.getElementById('route-output');
  if (!el || !EVENT) return;

  const remaining = wishlistRemainingCost();
  const hasWishlist = EVENT.shop.some(i => getItemState(i.id) !== 'not_wished' && getItemState(i.id) !== 'ignored');

  if (!hasWishlist) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:12px 0;">Add items to your wishlist to see a recommended route.</div>`;
    return;
  }
  if (remaining === 0) {
    el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--green);font-weight:600;">✓ Wishlist complete!</div>`;
    return;
  }

  // Tomes still needed from duties after counting current balance + projected challenge bonuses
  const projected  = projectedChallengeEarnings();
  const neededRaw  = remaining - TOMES;
  const neededAfterChallenges = Math.max(0, neededRaw - projected);

  if (neededRaw <= 0) {
    el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--green);">You have enough tomes for your current wishlist!</div>`;
    return;
  }

  const route = buildRoute();
  if (!route.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text-muted);">No duties available for this mode.</div>`;
    return;
  }

  const totalTime    = route.reduce((s, r) => s + r.time, 0);
  const challengeNote = (projected > 0 && neededAfterChallenges < neededRaw)
    ? ` <span style="color:var(--purple);font-size:11px;">(${neededRaw} − ${projected} projected challenges = ${neededAfterChallenges} from duties)</span>`
    : '';

  el.innerHTML = `
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">
      Need <strong>${neededAfterChallenges > 0 ? neededAfterChallenges : neededRaw}</strong> more tomes from duties.
      Estimated time: <strong>~${Math.round(totalTime / 60 * 10) / 10}h</strong>.${challengeNote}
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

function _challengeRow(ch, done, disabled) {
  const click = disabled ? '' : `onclick="toggleChallenge('${ch.id}')"`;
  return `
  <div ${click} style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;
    border:1px solid ${done ? 'var(--green)' : 'var(--border)'};
    background:${done ? 'rgba(74,222,128,0.07)' : 'transparent'};
    ${disabled ? '' : 'cursor:pointer;'}transition:all 0.2s;">
    <span style="font-size:16px;flex-shrink:0;">${done ? '✓' : '○'}</span>
    <div style="flex:1;">
      <div style="font-size:12px;font-weight:600;${done ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${ch.name}</div>
      ${ch.requirement != null ? `<div style="font-size:10px;color:var(--text-muted);">Requires: ${ch.requirement}</div>` : ''}
    </div>
    <div style="font-size:12px;font-weight:700;color:${done ? 'var(--green)' : 'var(--gold)'};">+${ch.bonus}${ch.tokens ? `<span style="font-size:10px;font-weight:600;color:var(--purple);margin-left:6px;white-space:nowrap;">+${ch.tokens} 🎟</span>` : ''}</div>
  </div>`;
}

// Shared helper: renders week-grouped challenges into el.
// Falls back to flat rendering if no week metadata or challenges lack week fields.
function _renderWeekGrouped(challenges, weekDefs, el) {
  if (!el) return;
  if (!challenges.length) { el.innerHTML = `<div style="font-size:11px;color:var(--text-muted);">No tasks yet.</div>`; return; }
  if (!weekDefs.length || !challenges.some(ch => ch.week)) {
    el.innerHTML = challenges.map(ch => _challengeRow(ch, !!CHALLENGES[ch.id], false)).join('');
    return;
  }
  const today  = todayPT();
  const byWeek = {};
  challenges.forEach(ch => { const w = ch.week || 1; (byWeek[w] = byWeek[w] || []).push(ch); });
  el.innerHTML = weekDefs.map(wd => {
    const chs = byWeek[wd.week] || [];
    if (!chs.length || today < wd.start) return '';
    const expired = today > wd.end;
    const badge = expired
      ? `<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(107,122,150,0.15);color:var(--text-muted);">Ended</span>`
      : `<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(74,222,128,0.15);color:var(--green);">Active</span>`;
    return `
    <div style="margin-bottom:14px;${expired ? 'opacity:0.4;pointer-events:none;' : ''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);">Week ${wd.week}</span>
        <span style="font-size:10px;color:var(--text-muted);">${fmtDate(wd.start)} – ${fmtDate(wd.end)}</span>
        ${badge}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">${chs.map(ch => _challengeRow(ch, !!CHALLENGES[ch.id], expired)).join('')}</div>
    </div>`;
  }).join('');
}

function renderChallenges() {
  if (!EVENT) return;
  const weekDefs = EVENT.weeks || [];

  // Minimog — week-grouped if any have a week field, otherwise flat
  const minimog = EVENT.challenges['minimog'] || [];
  _renderWeekGrouped(minimog, minimog.some(ch => ch.week) ? weekDefs : [], document.getElementById('challenges-minimog'));

  // Ultimog — always flat
  const ultimogEl = document.getElementById('challenges-ultimog');
  const ultimog = EVENT.challenges['ultimog'] || [];
  if (ultimogEl) {
    if (!ultimog.length) ultimogEl.innerHTML = `<div style="font-size:11px;color:var(--text-muted);">No ultimog tasks for this event.</div>`;
    else ultimogEl.innerHTML = ultimog.map(ch => _challengeRow(ch, !!CHALLENGES[ch.id], false)).join('');
  }

  // Weekly — week-grouped
  _renderWeekGrouped(EVENT.challenges['weekly'] || [], weekDefs, document.getElementById('challenges-weekly'));
}

function renderAnnouncements() {
  const card    = document.getElementById('farm-announcements');
  const content = document.getElementById('announcements-content');
  if (!card || !content || !EVENT) return;
  const list = EVENT.announcements || [];
  if (!list.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  content.innerHTML = list.map(a => `
    <div style="padding:10px 14px;border-radius:8px;border:1px solid var(--border);margin-bottom:8px;${a.type === 'tip' ? 'border-left:3px solid var(--gold);' : a.type === 'warning' ? 'border-left:3px solid var(--red);' : ''}">
      ${a.title ? `<div style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--text);">${a.title}</div>` : ''}
      <div style="font-size:12px;color:var(--text-muted);line-height:1.6;">${a.body}</div>
    </div>`).join('');
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
      const collectHref = item.collectId != null
        ? `https://ffxivcollect.com/${collectResource}/${item.collectId}`
        : `https://ffxivcollect.com/${collectResource}?search=${encodeURIComponent(item.collectName || item.name)}`;
      const collectLink = (item.unique && collectResource)
        ? `<a href="${collectHref}" target="_blank" rel="noopener" style="font-size:10px;color:var(--text-muted);margin-left:6px;" onclick="event.stopPropagation()" title="View on FFXIV Collect">🔗</a>`
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
