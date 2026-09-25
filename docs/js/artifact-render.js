// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ARTIFACT RENDER — hub + tabs + matrix + modals + grind plan
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let artActiveTab = null;

function artGetActiveTab() {
  if (artActiveTab && ARTIFACTS.some(e => e.key === artActiveTab)) return artActiveTab;
  // Deep-linkable tabs: ?exp= wins so refresh/share preserves the expansion.
  try {
    const q = new URLSearchParams(location.search).get('exp');
    if (q && ARTIFACTS.some(e => e.key === q)) { artActiveTab = q; return artActiveTab; }
  } catch {}
  try { artActiveTab = localStorage.getItem('artifact-active-tab'); } catch {}
  if (!artActiveTab || !ARTIFACTS.some(e => e.key === artActiveTab)) {
    artActiveTab = (ARTIFACTS.find(e => e.status === 'live') || ARTIFACTS[0])?.key || null;
  }
  return artActiveTab;
}

function switchArtTab(key, scroll) {
  artActiveTab = key;
  try { localStorage.setItem('artifact-active-tab', key); } catch {}
  try {
    const u = new URL(location.href);
    u.searchParams.set('exp', key);
    history.replaceState(null, '', u.pathname + u.search + location.hash);
  } catch {}
  if (typeof artRenderAll === 'function') artRenderAll();
  if (scroll !== false) document.getElementById('art-tab-content')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderArtChar() {
  const el = document.getElementById('art-char-display');
  if (!el) return;
  const hasCollect = ARTIFACTS.some(e => (e.status === 'live'));
  const collectBtn = (ART_CHAR.lodestoneId && hasCollect)
    ? `<button class="btn btn-outline" data-collect-check style="padding:3px 8px;font-size:10px;flex-shrink:0;" onclick="checkArtifactsViaCollect()">🔍 Check owned</button>
       <button class="btn btn-ghost" data-collect-check style="padding:3px 6px;font-size:10px;flex-shrink:0;color:var(--text-muted);" onclick="checkArtifactsViaCollect(null,true)">↺</button>`
    : '';
  const clearBtn = `<button class="btn btn-ghost" style="padding:2px 6px;font-size:10px;" onclick="artClearCharacter()">✕</button>`;
  renderCharBadge(el, ART_CHAR.name ? ART_CHAR : null, collectBtn + clearBtn);
  // Same card on hub + sub-pages: auto-open the link form when nothing is
  // linked yet, collapse it once a character is set (badge shows instead).
  try {
    const section = el.closest('.char-card-section');
    if (section && !section.dataset.userToggled) {
      if (!ART_CHAR.name) section.classList.add('open');
      else section.classList.remove('open');
    }
  } catch {}
}

// Saved-character switcher (Discord cloud saves, created on any tracker).
function artCharSwitcherHTML() {
  if (!_cloudUser || !(_cloudChars || []).length) return '';
  const btns = _cloudChars.map(c => {
    const lid = (c.lodestoneId || '').replace(/'/g, "\\'");
    const active = c.lodestoneId && c.lodestoneId === ART_CHAR.lodestoneId;
    const av = c.avatarUrl
      ? `<img src="${esc(c.avatarUrl)}" style="width:26px; height:26px; border-radius:6px; object-fit:cover; flex-shrink:0;" onerror="this.style.display='none'">` : '';
    return `<button onclick="artUseCloudChar('${lid}')" title="Switch to ${esc(c.characterName)}"
      style="display:inline-flex; align-items:center; gap:7px; padding:4px 10px 4px 5px; font-size:11px; border-radius:16px; cursor:pointer; font-family:inherit;
        border:1px solid ${active ? 'var(--border-gold)' : 'var(--border)'}; background:${active ? 'var(--gold-dim)' : 'transparent'}; color:var(--text);">
      ${av}<span>${esc(c.characterName)}${c.characterWorld ? ` <span style="color:var(--text-muted);">@ ${esc(c.characterWorld)}</span>` : ''}${active ? ' ●' : ''}</span>
    </button>`;
  }).join('');
  return `<div style="margin-top:10px;"><div style="font-size:10px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-muted); margin-bottom:6px;">Saved characters</div>
    <div style="display:flex; gap:6px; flex-wrap:wrap;">${btns}</div></div>`;
}

function renderArtCharSwitcher() {
  const el = document.getElementById('art-char-switcher');
  if (el) el.innerHTML = artCharSwitcherHTML();
}

function artRenderAll() {
  renderArtChar();
  renderArtCharSwitcher();
  renderArtExpPills();
  renderArtShareBanner();
  renderArtOnboard();
  renderArtAllCard();
  renderArtExpansions();
  renderArtTabContent();
  renderArtGuide();
  renderArtGallery();
  renderArtGrindSheet();
  renderArtAftercareSlot();
  renderArtCompletedGuide();
  renderArtOverview();
  renderArtTrackedClasses();
}

// ── Expansion quicknav pills (hub + sub-pages) ───────
// One pill per expansion in chronological order; live pills link to the
// expansion guide, coming-soon pills are disabled. Active exp is highlighted.
function renderArtExpPills() {
  const el = document.getElementById('art-exp-pills');
  if (!el) return;
  const active = (typeof artGetActiveTab === 'function') ? artGetActiveTab() : null;
  el.innerHTML = `<nav style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;" aria-label="Relic expansions">` + ARTIFACTS.map(exp => {
    const live = exp.status === 'live';
    const isActive = exp.key === active;
    const base = `display:inline-flex; align-items:center; gap:5px; padding:5px 14px; border-radius:20px; font-size:0.78rem; font-family:inherit;`;
    if (!live) return `<span title="Coming soon" style="${base} border:1px solid var(--border); color:var(--text-muted); opacity:0.6; cursor:default;">${exp.glyph || '⚔️'} ${esc(exp.subtitle || exp.name)}</span>`;
    if (isActive) return `<span style="${base} border:1px solid var(--border-gold); background:var(--gold-dim); color:var(--gold); font-weight:600;">${exp.glyph || '⚔️'} ${esc(exp.subtitle || exp.name)}</span>`;
    return `<a href="/artifacts/expansion.html?exp=${encodeURIComponent(exp.key)}" style="${base} border:1px solid var(--border); color:var(--text-muted); text-decoration:none;" onmouseover="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">${exp.glyph || '⚔️'} ${esc(exp.subtitle || exp.name)}</a>`;
  }).join('') + `</nav>`;
}

// ── Zone-map registry ─────────────────────────────
// NPC + farm-area popups resolve their thumbnail through here, so dropping a
// new zone screenshot next to gangos.jpg lights up every popup referencing
// that zone with zero code changes (Auriana/Hismena popups upgrade from
// coords cards to mini-maps automatically once mor-dhona/idyllshire land).
function artZoneMapImg(zone) {
  if (!zone) return null;
  const table = (typeof ART_MAPCAL !== 'undefined' && ART_MAPCAL) || {};
  const slug = String(zone).toLowerCase().replace(/[^a-z]+/g, '');
  if (slug.length < 3) return null;
  const hit = Object.keys(table).find(k => String(k).toLowerCase().replace(/[^a-z]+/g, '').includes(slug));
  return hit || null;
}

// ── NPC references (GamerEscape, verified coords) ───
// Quest givers link out; every name carries a hover/focus popup with its
// location map (or a coords card where that zone has no screenshot yet), so
// prose stays readable. Coords follow the Lodestone where sources conflict
// (Auriana 6.6 not 6.7; Hismena 5.7,5.2 not 5.8,5.3).
const ART_NPC_REF = {
  'Zlatan': { zone: 'Gangos', x: 6.1, y: 4.9, wiki: 'https://ffxiv.gamerescape.com/wiki/Zlatan', map: 'https://ffxiv.gamerescape.com/wiki/Zlatan/Map/1032905' },
  'Gerolt': { zone: 'Gangos', x: 6.2, y: 5.0, wiki: 'https://ffxiv.gamerescape.com/wiki/Gerolt' },
  'Allagan Node': { zone: 'Gangos', x: 5.9, y: 4.8, wiki: 'https://ffxiv.gamerescape.com/wiki/Allagan_Node' },
  'Regana': { zone: 'Gangos', x: 6.0, y: 4.7, wiki: 'https://ffxiv.gamerescape.com/wiki/Regana' },
  'Auriana': { zone: 'Mor Dhona', x: 22.7, y: 6.6, wiki: 'https://ffxiv.gamerescape.com/wiki/Auriana' },
  'Hismena': { zone: 'Idyllshire', x: 5.7, y: 5.2, wiki: 'https://ffxiv.gamerescape.com/wiki/Hismena' },
  'Rowena': { zone: 'Multiple', wiki: 'https://ffxiv.gamerescape.com/wiki/Rowena' },
};
// Mini location card for an NPC: zone-map thumbnail with pin when the zone
// has a screenshot, styled coords card otherwise.
function artNpcPopup(name) {
  const r = ART_NPC_REF[name];
  if (!r) return '';
  const mapImg = artZoneMapImg(r.zone);
  let visual = '';
  if (mapImg && typeof r.x === 'number') {
    const [px, py] = artMapPinPct({ x: r.x, y: r.y, mapImg });
    visual = `<span style="position:relative; display:block; border-radius:6px; overflow:hidden; border:1px solid var(--border);">`
      + `<img src="/${mapImg}" alt="${esc(r.zone)} map" loading="lazy" style="width:224px; display:block;" onerror="this.parentNode.style.display='none'">`
      + `<span style="position:absolute; left:${px}%; top:${py}%; transform:translate(-50%,-100%); font-size:16px; line-height:1;">📍</span></span>`;
  } else {
    visual = `<span style="display:block; padding:8px 10px; text-align:center; background:linear-gradient(135deg, var(--gold-dim), transparent 70%); border-radius:6px; border:1px solid var(--border);">`
      + `<span style="font-size:10px; font-weight:700; letter-spacing:0.12em; color:var(--gold);">📍 ${esc(r.zone).toUpperCase()}</span>`
      + (typeof r.x === 'number' ? `<span class="font-cinzel" style="display:block; font-size:1.1rem; color:var(--gold); font-weight:700;">X:${r.x} · Y:${r.y}</span>` : '')
      + `</span>`;
  }
  return `<span class="art-npc-pop" role="tooltip">`
    + `${visual}`
    + `<span style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:6px; font-size:11px;"><strong>${esc(name)}</strong>`
    + `<a href="${r.wiki}" target="_blank" rel="noopener" style="color:var(--gold);">wiki ↗</a></span>`
    + (typeof r.x === 'number' ? `<span style="font-size:10px; color:var(--text-muted);">${esc(r.zone)} (X:${r.x}, Y:${r.y})</span>` : `<span style="font-size:10px; color:var(--text-muted);">${esc(r.zone)}</span>`)
    + `</span>`;
}
function artNpcTip(name) {
  const r = ART_NPC_REF[name];
  if (!r) return esc(name);
  return `<span class="art-npc-wrap" tabindex="0"><a href="${r.wiki}" target="_blank" rel="noopener" class="art-npc-tip">${esc(name)}</a>${artNpcPopup(name)}</span>`;
}
// Linkify known NPC names inside already-escaped text (longest names first
// so "Allagan Node" wins over "Node"). Only first occurrence each to avoid
// turning prose into a link farm.
function artLinkifyNpcs(escapedText) {
  let out = String(escapedText || '');
  for (const name of Object.keys(ART_NPC_REF).sort((a, b) => b.length - a.length)) {
    const ix = out.indexOf(name);
    if (ix < 0) continue;
    // Skip if already inside an anchor from a previous replacement.
    const before = out.slice(Math.max(0, ix - 60), ix);
    if (/<a[^>]*$/.test(before) || /art-npc-tip[^>]*$/.test(before)) continue;
    out = out.slice(0, ix) + artNpcTip(name) + out.slice(ix + name.length);
  }
  return out;
}

// ── Farm-area popups (coverage, not pins) ──────────
// Farm sources cover whole zones/areas ("Sea of Clouds · Coerthas Western
// Highlands"), so their popup shows a coverage card: zone chips plus the
// zone-map thumbnail with a FARM AREA tag when that zone has a screenshot,
// otherwise activity/location/rate text. Multi-zone locations split on · / |.
function artAreaChips(location) {
  const zones = String(location || '').split(/[·|]/).map(s => s.trim()).filter(Boolean).slice(0, 4);
  if (!zones.length) return '';
  return zones.map(z => `<span class="art-area-chip">${esc(z)}</span>`).join(' ');
}
function artAreaMapForSource(s) {
  const zones = String(s?.location || '').split(/[·|,|/]/).map(t => t.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
  for (const z of zones) {
    const hit = artZoneMapImg(z);
    if (hit) return { mapImg: hit, zone: z };
  }
  return { mapImg: null, zone: zones[0] || null };
}
function artSourcePopup(s) {
  if (!s) return '';
  const { mapImg, zone } = artAreaMapForSource(s);
  const visual = mapImg
    ? `<span style="position:relative; display:block; border-radius:6px; overflow:hidden; border:1px solid var(--border);">`
      + `<img src="/${mapImg}" alt="${esc(zone || 'farm area')} map" loading="lazy" style="width:100%; display:block;" onerror="this.parentNode.style.display='none'">`
      + `<span style="position:absolute; left:8px; top:8px; font-size:9px; font-weight:700; letter-spacing:0.1em; background:rgba(0,0,0,0.65); color:var(--gold); padding:2px 8px; border-radius:10px;">FARM AREA${zone ? ' · ' + esc(zone).toUpperCase() : ''}</span></span>`
    : '';
  const rows = [
    s.activity ? `Activity: ${esc(s.activity)}` : null,
    (s.yields > 0) ? `Yields: ${s.yields}/run` : null,
    s.location ? `Where: ${esc(s.location)}` : null,
    s.vendor ? `Vendor: ${esc(s.vendor)}` : null,
    s.cost ? `Cost: ${esc(s.cost)}` : null,
    s.rate ? `Drop rate: ${esc(s.rate)}` : null,
    s.note ? `Note: ${esc(s.note)}` : null,
  ].filter(Boolean);
  return `<span class="art-area-pop" role="tooltip">${visual}`
    + `<span style="display:block; font-size:12px; font-weight:700; margin:${visual ? '6px 0 2px' : '0 0 2px'};">${esc(s.label || 'Farm source')}</span>`
    + (rows.length ? `<span style="display:block; font-size:11px; color:var(--text-muted); line-height:1.6;">${rows.join('<br>')}</span>` : '')
    + `</span>`;
}
// Source label with hover coverage popup. Used by grind rows + item modal so
// every farm mention carries its area info.
function artSourceLabelHTML(s) {
  if (!s || !s.label) return '';
  return `<span class="art-area-wrap" tabindex="0"><strong>${esc(s.label)}</strong>${artSourcePopup(s)}</span>`;
}

// ── GO HERE panel (hand-holding maps) ───────────────
// where = {npc, zone, x, y, aetheryte, mapImg, hint}. Pin plots from in-game
// coords through per-map calibration bounds (ART_MAPCAL[mapImg] = {x0,x1,y0,y1}
// in image-% for game 0→42) since zone screenshots include parchment margins.
// where.pin=[px,py] remains as a rare manual override. Missing mapImg degrades
// to a styled coords card — layout never breaks.
function artMapPinPct(w) {
  if (Array.isArray(w.pin)) return [w.pin[0], w.pin[1]];
  const cal = (typeof ART_MAPCAL !== 'undefined' && w.mapImg && ART_MAPCAL[w.mapImg]) || null;
  if (cal && typeof w.x === 'number' && typeof w.y === 'number') {
    const px = cal.x0 + (w.x / 42) * (cal.x1 - cal.x0);
    const py = cal.y0 + (w.y / 42) * (cal.y1 - cal.y0);
    return [Math.min(98, Math.max(2, px)), Math.min(98, Math.max(2, py))];
  }
  return [Math.min(98, Math.max(2, (w.x / 42) * 100)), Math.min(98, Math.max(2, (w.y / 42) * 100))];
}
function artWhereHTML(exp, st) {
  const w = st?.where;
  if (!w) return `<div style="font-size:12px; color:var(--text-muted);">📍 ${esc(st?.questGiver || exp.npc || 'See questline')}</div>`;
  const [px, py] = artMapPinPct(w);
  // Full image, never cropped: pin % maps exactly onto map coords. A wrong
  // pin is worse than a tall map — cap width instead of cropping height.
  const mapBlock = w.mapImg
    ? `<div class="art-mapwrap" style="position:relative; border-radius:8px; overflow:hidden; border:1px solid var(--border); max-width:420px;">
      <img src="/${w.mapImg}" alt="${esc(w.zone)} map" loading="lazy" style="width:100%; display:block;"
        onerror="this.style.display='none';this.parentNode.querySelector('.art-map-pin').style.display='none';this.parentNode.querySelector('.art-map-fallback').style.display='block';">
      <div class="art-map-pin" style="position:absolute; left:${px}%; top:${py}%; transform:translate(-50%,-100%); font-size:22px; line-height:1; filter:drop-shadow(0 2px 3px rgba(0,0,0,0.7)); pointer-events:none;">📍</div>
      <div class="art-map-fallback" style="display:none; padding:12px 10px; text-align:center; background:linear-gradient(135deg, var(--gold-dim), transparent 70%);">
        <div style="font-size:10px; font-weight:700; letter-spacing:0.12em; color:var(--gold);">📍 GO HERE</div>
        <div style="font-size:13px; font-weight:700; margin:2px 0;">${esc(w.npc)} · ${esc(w.zone)}</div>
        <div class="font-cinzel" style="font-size:1.25rem; color:var(--gold); font-weight:700;">X:${w.x} · Y:${w.y}</div>
      </div>
    </div>`
    : `<div style="padding:12px 10px; text-align:center; background:linear-gradient(135deg, var(--gold-dim), transparent 70%); border-radius:8px; border:1px solid var(--border);">
      <div style="font-size:10px; font-weight:700; letter-spacing:0.12em; color:var(--gold);">📍 GO HERE</div>
      <div style="font-size:13px; font-weight:700; margin:2px 0;">${esc(w.npc)} · ${esc(w.zone)}</div>
      <div class="font-cinzel" style="font-size:1.25rem; color:var(--gold); font-weight:700;">X:${w.x} · Y:${w.y}</div>
    </div>`;
  return `<div style="border:1px solid var(--border-gold); border-radius:8px; overflow:hidden; margin-bottom:8px; background:var(--card);">
    <div style="padding:10px;">
      <div style="font-size:10px; font-weight:700; letter-spacing:0.12em; color:var(--gold); margin-bottom:6px;">📍 GO HERE — ${artNpcTip(w.npc)} · ${esc(w.zone)}</div>
      ${mapBlock}
    </div>
    <div style="padding:8px 10px; font-size:11px; border-top:1px solid var(--border);">
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
        <strong style="font-size:12px;">${artNpcTip(w.npc)}</strong>
        ${w.hideCopy ? '' : `<button onclick="artCopyCoords(this)" data-zone="${esc(w.zone)}" data-x="${w.x}" data-y="${w.y}" title="Copy map coords"
          style="font-size:10px; padding:2px 9px; border-radius:12px; cursor:pointer; font-family:inherit; border:1px solid var(--border-gold); background:var(--gold-dim); color:var(--gold);">⧉ copy coords</button>`}
      </div>
      ${w.aetheryte ? `<div style="color:var(--text-muted);">🔷 Nearest aetheryte: ${esc(w.aetheryte)}</div>` : ''}
      ${w.hint ? `<div style="color:var(--text-muted); margin-top:2px;">${artLinkifyNpcs(esc(w.hint))}</div>` : ''}
    </div>
  </div>`;
}

function artStepCompletedJobs(exp, st) {
  if (st.kind === 'onetime') return artIsStepDone(exp.key, '*', st.n) ? ['once ever'] : [];
  const sel = _artSelFor(exp.key);
  return (exp.jobs || []).filter(j => sel.jobs[j] && artIsStepDone(exp.key, j, st.n));
}

function artStepRepeatJobs(exp, st) {
  if (st.kind === 'onetime') return [];
  const sel = _artSelFor(exp.key);
  return (exp.jobs || []).filter(j => sel.jobs[j] && !artIsStepDone(exp.key, j, st.n));
}

function artBestSourcesHTML(sources, limit) {
  const rows = (sources || [])
    .filter(s => s && s.label)
    .slice()
    .sort((a, b) => {
      const ar = a.runs == null ? Number.MAX_SAFE_INTEGER : a.runs;
      const br = b.runs == null ? Number.MAX_SAFE_INTEGER : b.runs;
      return ar - br;
    })
    .slice(0, limit || 3);
  if (!rows.length) return '<div style="font-size:11px; color:var(--text-muted);">Source details are not mapped yet.</div>';
  return rows.map(s => `<div style="font-size:11px; line-height:1.5;">
    ${artSourceLabelHTML(s)}${s.runs != null ? ` <span style="color:var(--gold);">(${artRuns(s)} run${s.runs === 1 && !s.estimated ? '' : 's'})</span>` : ''}
    ${s.location ? `<span style="color:var(--text-muted);"> · ${artAreaChips(s.location)}</span>` : ''}
    ${s.rate || s.note ? `<span style="color:var(--text-muted);"> · ${esc(s.rate || s.note)}</span>` : ''}
  </div>`).join('');
}

// Overlap tips: authored notes ("farm together") plus a cross-step scan that
// finds another step sharing a named farm, so alts can double up runs.
function artOverlapHTML(exp, st) {
  const hints = [...(st.setup || []), ...(st.sources || []).map(s => s.note).filter(Boolean)]
    .filter(t => /together|also|passive|double|overlap|while/i.test(t));
  const norm = s => String(s || '').toLowerCase();
  const chunks = t => norm(t).split(/[·,/|]| - /).map(x => x.trim()).filter(x => x.length >= 5);
  const myChunks = (st.sources || []).flatMap(s => chunks(s.label));
  const others = [];
  for (const other of (exp.steps || [])) {
    if (other === st) continue;
    const shared = (other.sources || []).some(os => {
      const oc = chunks(os.label);
      return oc.some(c => myChunks.includes(c));
    });
    if (shared) others.push(other.kind === 'onetime' ? other.quest : `Step ${other.n} · ${other.quest}`);
  }
  if (!hints.length && !others.length) return '';
  return `<div class="art-overlap">
    <div class="art-overlap-title">Farm overlap</div>
    ${hints.slice(0, 2).map(h => `<div class="art-overlap-line">🔁 ${esc(h)}</div>`).join('')}
    ${others.slice(0, 3).map(o => `<div class="art-overlap-line">🔁 Shares a farm with ${esc(o)} — run them in one trip.</div>`).join('')}
  </div>`;
}

// ── Step classification + per-class badges ───────────
// A repeatable step is complete once every tracked class that still needs it
// has finished it; one-time steps complete once globally.
function artStepIsDone(exp, st) {
  if (st.kind === 'onetime') return artIsStepDone(exp.key, '*', st.n);
  return artJobsNeedingStep(exp, st.n).length === 0;
}

// Reachable union across tracked classes — tells "locked" from "open" and
// lets a mixed-progress roster show each class on the step it's actually on.
function artTrackedReach(exp) {
  const sel = _artSelFor(exp.key);
  const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
  const reach = new Set();
  for (const j of jobs) for (const n of artReachable(exp, j)) reach.add(n);
  return reach;
}

// Header need line for an open step.
function artStepNeedLine(exp, st) {
  const g = artGrindForStep(exp, st);
  if (st.kind === 'onetime') return `Once ever · total need <strong style="color:var(--gold);">${g.need}</strong>`;
  const best = g.best ? ` · best: ${artRuns(g.best)}× ${esc(g.best.label)}` : '';
  const free = g.free ? ' · first free' : '';
  return `Need <strong style="color:var(--gold);">${g.need}</strong> ${esc(st.item)} (have ${g.have}${free})${best}`;
}

// Reference note on a completed step: who's done, who still needs it.
function artStepReferenceNote(exp, st) {
  if (st.kind === 'onetime') return 'Once ever — already unlocked for every weapon.';
  const done = artStepCompletedJobs(exp, st);
  const repeat = artStepRepeatJobs(exp, st);
  const parts = [];
  if (done.length) parts.push(`✓ ${done.map(esc).join(' · ')}`);
  if (repeat.length) parts.push(`still needs: ${repeat.map(esc).join(' · ')}`);
  return parts.join(' — ') || 'No tracked class needs this yet.';
}

// The farm block: every piece needed, sources with run counts, and split-farm
// breakdowns. Self-contained so a second character can start at any step.
function artStepGrindHTML(exp, st) {
  const sel = _artSelFor(exp.key);
  const g = artGrindForStep(exp, st);
  const have = k => Math.max(0, parseInt(sel.have[k] || '0', 10) || 0);
  const row = (thumb, itemHTML, per, haveVal, needVal, sources, itemKey) => `
    <div class="art-grindline">
      ${thumb}
      <div style="flex:1; min-width:0;">
        <div style="font-size:12px;">${per}× ${itemHTML} <span style="color:var(--text-muted);">(have ${haveVal}, need <strong style="color:var(--gold);">${needVal}</strong>)</span></div>
        ${artBestSourcesHTML(sources, 3)}
      </div>
      ${itemKey ? `<span class="art-have">
        <button class="art-havebtn" title="−1" onclick="artBumpHave('${exp.key}','${itemKey}',-1)">−</button>
        <button class="art-havebtn is-plus" title="+1 farmed" onclick="artBumpHave('${exp.key}','${itemKey}',1)">+</button>
      </span>` : ''}
    </div>`;
  if (st.kind === 'onetime') {
    return `<div class="art-grind">${(g.lines || []).map(l =>
      row(artItemIcon(exp, l.key, 26), artItemNameButton(exp, st, l.name), l.perWeapon, l.have, l.need, l.sources, l.key)).join('')}</div>`;
  }
  if (st.subItems && st.subItems.length) {
    const rows = st.subItems.map(it => {
      const h = have(it.key);
      const need = Math.max(0, it.perWeapon - h);
      const srcs = (st.sources || [])
        .filter(s => String(s.label || '').toLowerCase().includes(String(it.key).toLowerCase()))
        .map(s => ({ ...s, ...artSourceRuns(need, s) }));
      return row(artItemIcon(exp, it.key, 26), artItemNameButton(exp, st, it.name), it.perWeapon, h, need, srcs, it.key);
    }).join('');
    return `<div class="art-grind"><div class="art-grindhead">${g.need} total left · ${st.perWeapon}/weapon (${esc(st.item)})</div>${rows}</div>`;
  }
  return `<div class="art-grind">${row(artItemIcon(exp, st.itemKey, 26), artItemButton(exp, st), st.perWeapon, g.have, g.need, g.sources, st.itemKey)}</div>`;
}

// Single completion switch — quests aren't class-based in the guide (the
// sheet shows which classes sit on each step). One tick clears it for all.
function artStepRecordHTML(exp, st) {
  const done = artStepIsDone(exp, st);
  return `<div class="art-record">
    <button class="art-mark art-mark-done${done ? ' is-done' : ''}" onclick="artToggleStepAll('${exp.key}','${st.n}')">
      ${done ? '✓ Completed' : 'Mark as completed'}
    </button>
  </div>`;
}

// Body of an open (or completed-reference) step: where to go on the left; the
// hand-held quest walkthrough up top on the right, then the objectives below a
// horizontal break.
function artStepBodyHTML(exp, st, tracked, reference) {
  const blurb = st.guide?.blurb ? `<div style="font-size:12px; color:var(--text-muted); line-height:1.6; margin:6px 0;">${artLinkifyNpcs(esc(st.guide.blurb))}</div>` : '';
  const refNote = reference
    ? `<div style="margin-bottom:8px;"><span class="art-ref-tag">Repeat reference</span> <span style="font-size:11px; color:var(--text-muted);">${artStepReferenceNote(exp, st)}</span></div>`
    : '';
  const actions = `<div class="art-stepactions">
    <button class="btn btn-outline" style="font-size:12px; padding:6px 14px;" onclick="openArtItemModal('${exp.key}','${st.n}')">Sources ⓘ</button>
    ${reference ? `<button class="btn btn-ghost" style="font-size:12px; padding:6px 14px;" onclick="artUndoStep('${exp.key}','${st.n}')">Undo ⟲</button>` : ''}
  </div>`;
  return `${refNote}<div class="art-stepgrid">
    <div>
      <div class="section-title">Where to go</div>
      ${artWhereHTML(exp, st)}
      ${blurb}
    </div>
    <div>
      ${artGuideDetails(exp, st)}
      <div class="art-stepbreak"></div>
      <div class="section-title">Objectives · what to farm</div>
      ${artStepGrindHTML(exp, st)}
      ${artOverlapHTML(exp, st)}
      ${artStepRecordHTML(exp, st)}
      ${actions}
    </div>
  </div>`;
}

// One collapsible step card — the breadcrumb once done, the focus while open.
function artStepCardHTML(exp, st, opts) {
  const { status, isNext, tracked } = opts;
  const done = status === 'done';
  const locked = status === 'locked';
  const title = st.kind === 'onetime' ? esc(st.quest) : `Step ${st.n} · ${esc(st.quest)}`;
  const reward = st.reward ? ` <span style="color:var(--text-muted); font-weight:400;">→ ${esc(st.reward)}</span>` : '';
  const need = done
    ? `<span style="color:var(--green);">✓ complete — reference below</span>`
    : locked
      ? `<span style="color:var(--text-muted);">🔒 unlock first</span>`
      : artStepNeedLine(exp, st);
  const open = isNext && !done && !locked;
  const body = done
    ? artStepBodyHTML(exp, st, tracked, true)
    : locked
      ? `${artWhereHTML(exp, st)}${artGuideDetails(exp, st)}`
      : artStepBodyHTML(exp, st, tracked, false);
  return `<details class="art-stepcard${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}${locked ? ' is-locked' : ''}"
    id="art-step-${st.n}" data-step="${st.n}" data-status="${status}"${open ? ' open' : ''}>
    <summary class="art-stepcard-head">
      <span class="art-step-dot" style="${done ? `background:${exp.accent}; border-color:${exp.accent}; color:#fff;` : isNext ? `background:${exp.accent}2e; border:1px solid ${exp.accent}; color:var(--gold);` : 'background:transparent; border:1px solid var(--border); color:var(--text-muted);'}">${done ? '✓' : (st.kind === 'onetime' ? '★' : st.n)}</span>
      <span class="art-stepcard-main">
        <span class="art-stepcard-title">${title}${reward}</span>
        <span class="art-stepcard-sub">${need}</span>
      </span>
      <span class="art-stepcard-chevron">▾</span>
    </summary>
    <div class="art-stepcard-body">${body}</div>
  </details>`;
}


// ── The unified guide ─────────────────────────────────
// One starting bubble, then a single card that follows your furthest class:
// the current step up top, the unlock checklist inline, completed steps in a
// "Past steps" dropdown, and any other in-progress steps tucked away.
function artJobChipsHTML(exp) {
  const sel = _artSelFor(exp.key);
  return (exp.jobs || []).map(j => {
    const on = !!sel.jobs[j];
    return `<button onclick="artHubToggleJob('${exp.key}','${j}')" class="art-jobchip${on ? ' is-on' : ''}"
      style="${on ? `border-color:${exp.accent}; background:${exp.accent}2e; color:var(--text); font-weight:700;` : ''}">${artJobIcon(j, 14)}${esc(j)}</button>`;
  }).join('');
}

// Frontier = the most advanced open step, so adding a fresh second class never
// drags the guide back to step 1 while another class is further along.
function artGuideState(exp) {
  const reach = artTrackedReach(exp);
  const vis = artVisibleSteps(exp);
  const statusOf = st => artStepIsDone(exp, st) ? 'done' : (reach.has(st.n) ? 'open' : 'locked');
  const open = vis.filter(st => statusOf(st) === 'open');
  const done = vis.filter(st => statusOf(st) === 'done');
  const locked = vis.filter(st => statusOf(st) === 'locked');
  const frontier = open.length ? open[open.length - 1] : null;
  return { vis, reach, statusOf, open, done, locked, frontier, otherOpen: open.filter(st => st !== frontier) };
}

// Non-collapsible hero: the step you're actually on.
function artStepHeroHTML(exp, st, tracked, prereqHTML) {
  const reward = st.reward ? ` <span style="color:var(--text-muted); font-weight:400;">→ ${esc(st.reward)}</span>` : '';
  const title = st.kind === 'onetime' ? esc(st.quest) : `Step ${st.n} · ${esc(st.quest)}`;
  return `<div class="art-stephero" id="art-step-${st.n}" data-step="${st.n}" data-status="open">
    <div class="art-stepcard-head">
      <span class="art-step-dot" style="background:${exp.accent}2e; border:1px solid ${exp.accent}; color:var(--gold);">${st.kind === 'onetime' ? '★' : st.n}</span>
      <span class="art-stepcard-main">
        <span class="art-stepcard-title">${title}${reward}</span>
        <span class="art-stepcard-sub">${artStepNeedLine(exp, st)}</span>
      </span>
    </div>
    <div class="art-stephero-body">
      ${artStepBodyHTML(exp, st, tracked, false)}
      ${prereqHTML ? `<div class="art-unlocknext">${prereqHTML}</div>` : ''}
    </div>
  </div>`;
}

// Shown when nothing is reachable yet: the unlock bubble + checklist together.
function artUnlockHeroHTML(exp, lockedNext, prereqHTML) {
  return `<div class="art-unlockhero">
    <div class="art-start-kicker">🔒 Unlock — ${esc(exp.questline || exp.name)}</div>
    <div class="font-cinzel" style="font-size:1.2rem; font-weight:700; margin:2px 0 4px;">Unlock the relic</div>
    <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">Clear the list below in-game — the first step opens as soon as it's done.</div>
    <div class="art-stepgrid">
      <div>
        <div class="section-title">Where to go</div>
        ${artWhereHTML(exp, lockedNext)}
      </div>
      <div>${prereqHTML || '<div style="font-size:12px; color:var(--green);">All checked ✓ — proceed in-game, then mark the step completed.</div>'}</div>
    </div>
  </div>`;
}

function renderArtGuide() {
  const wrap = document.getElementById('art-guide');
  if (!wrap) return;
  const exp = ARTIFACTS.find(e => e.key === artGetActiveTab());
  if (!exp || exp.status !== 'live') { wrap.innerHTML = ''; return; }
  setText('exp-title', exp.name);
  setText('exp-sub', (exp.questline || '') + (exp.subtitle ? ' · ' + exp.subtitle : ''));
  document.body.setAttribute('data-exp', exp.key);
  document.body.style.setProperty('--exp', exp.accent || 'var(--gold)');
  const sel = _artSelFor(exp.key);
  const tracked = (exp.jobs || []).filter(j => sel.jobs[j]);

  // ── The single starting bubble ──
  if (!tracked.length) {
    wrap.innerHTML = `<div class="card art-start" id="art-start">
      <div class="art-start-kicker">Start here</div>
      <h2 class="font-cinzel" style="margin:2px 0 6px; color:var(--gold); font-size:1.3rem;">Forge your first ${esc(exp.name.replace(/s$/, ''))}</h2>
      <p style="font-size:12px; color:var(--text-muted); line-height:1.7; margin-bottom:14px;">
        Pick the class you want a relic for. The walkthrough then grows one step at a time —
        unlock the relic, farm it, and it collapses into a reusable grind sheet for every repeat and alt.
      </p>
      <div id="art-job-chips" class="art-jobchips">${artJobChipsHTML(exp)}</div>
    </div>`;
    return;
  }

  // ── Guide complete: the whole walkthrough folds away to the bottom of the
  // page (revealed by the sheet's "Review Completed Quests" button).
  const allComplete = artAllComplete(exp);
  if (allComplete) { wrap.innerHTML = ''; return; }

  const { vis, reach, statusOf, done, locked, frontier, otherOpen } = artGuideState(exp);
  const prereqHTML = renderArtPrereq(exp, tracked);
  // Next gated step (first undone, unreachable) drives the unlock hero.
  const lockedAny = (exp.steps || []).find(st => !artStepIsDone(exp, st) && !reach.has(st.n)) || null;

  const rail = vis.map(st => {
    const s = statusOf(st);
    const isFrontier = frontier && st.n === frontier.n;
    const cls = s === 'done' ? 'is-done' : (isFrontier ? 'is-next' : (s === 'locked' ? 'is-locked' : ''));
    const glyph = s === 'done' ? '✓' : (st.kind === 'onetime' ? '★' : st.n);
    return `<button class="art-rail-dot ${cls}" onclick="artGotoStep('${exp.key}','${st.n}')"
      title="${esc(st.quest)}" aria-label="Go to ${esc(st.quest)}">${glyph}</button>`;
  }).join('');

  const doneCount = (exp.steps || []).filter(st => artStepIsDone(exp, st)).length;
  const totalSteps = (exp.steps || []).length;

  // Hero: your current step, or the unlock bubble when the frontier is gated.
  const hero = frontier
    ? artStepHeroHTML(exp, frontier, tracked, prereqHTML)
    : lockedAny
      ? artUnlockHeroHTML(exp, lockedAny, prereqHTML)
      : `<div class="art-alldone">✅ Every tracked class has finished the chain. The grind sheet below is yours for every repeat and alt.</div>`;

  // Everything else is tucked into dropdowns so the card never piles up.
  const fold = (cls, label, steps, status) => steps.length
    ? `<details class="${cls}"><summary>${label} · ${steps.length}</summary>
        <div class="art-foldlist">${steps.map(st => artStepCardHTML(exp, st, { status, isNext: false, tracked })).join('')}</div>
      </details>`
    : '';
  const past = fold('art-past', 'Past steps — review or copy the repeat reference', done, 'done');
  const inprog = fold('art-inprog', 'Also in progress', otherOpen, 'open');
  const later = fold('art-later', 'Locked steps', locked, 'locked');

  wrap.innerHTML = `<div class="art-guidehead">
      <div>
        <div class="section-title bare" style="margin:0;">${esc(exp.name)} — walkthrough</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${esc(exp.questline || '')} · ${tracked.length} class${tracked.length === 1 ? '' : 'es'} tracked · ${doneCount}/${totalSteps} steps done</div>
      </div>
      <button class="btn btn-outline" style="font-size:11px; padding:4px 12px; flex-shrink:0;" onclick="artContinueFromUnlock('${exp.key}')">Continue ↓</button>
    </div>
    ${rail ? `<div class="art-rail">${rail}</div>` : ''}
    <div class="card art-guidecard">${hero}${past}${inprog}${later}</div>`;
}

// A single class' chain is complete when every step is done for it (one-time
// steps are global). The guide is done once the FURTHEST class finishes — so
// adding a fresh class never re-opens the completed walkthrough.
function artChainComplete(exp, job) {
  return (exp.steps || []).every(st =>
    st.kind === 'onetime' ? artIsStepDone(exp.key, '*', st.n) : artIsStepDone(exp.key, job, st.n));
}

// Whether any tracked class has finished the whole chain.
function artAllComplete(exp) {
  const sel = _artSelFor(exp.key);
  const tracked = (exp.jobs || []).filter(j => sel.jobs[j]);
  return tracked.some(j => artChainComplete(exp, j));
}

// The shrunk guide that lives at the bottom once everything is done.
function renderArtCompletedGuide() {
  const el = document.getElementById('art-completed-guide');
  if (!el) return;
  const exp = ARTIFACTS.find(e => e.key === artGetActiveTab());
  const sel = exp ? _artSelFor(exp.key) : null;
  const tracked = exp && sel ? (exp.jobs || []).filter(j => sel.jobs[j]) : [];
  if (!exp || exp.status !== 'live' || !tracked.length || !artAllComplete(exp)) { el.innerHTML = ''; return; }
  const steps = exp.steps || [];
  el.innerHTML = `<details class="card art-completed-guide">
    <summary>Completed quests · ${steps.length} — review walkthroughs, rewards &amp; repeat farms</summary>
    <div class="art-foldlist">${steps.map(st => artStepCardHTML(exp, st, { status: 'done', isNext: false, tracked })).join('')}</div>
  </details>`;
}


// ── Collection gallery: weapon stages at a glance ──
function renderArtGallery() {
  const wrap = document.getElementById('art-gallery');
  if (!wrap) return;
  const live = ARTIFACTS.filter(e => e.status === 'live');
  const anyTracked = live.some(e => Object.keys(_artSelFor(e.key).jobs).length);
  if (!anyTracked) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="card" style="margin-bottom:14px;">
    <div class="section-title">Collection — weapon stages</div>
    ${live.map(exp => {
      const sel = _artSelFor(exp.key);
      const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
      if (!jobs.length) return '';
      const reps = (exp.steps || []).filter(s => s.kind !== 'onetime');
      return `<div style="margin-bottom:12px;">
        <div style="font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${exp.accent}; margin-bottom:6px;">${esc(exp.name)}</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:8px;">
        ${jobs.map(j => {
          const cur = artJobStage(exp, j);
          const w = (exp.weapons || []).find(x => x.job === j);
          const stageName = (w && w.stages && w.stages[cur]) ? w.stages[cur] : (cur >= reps.length ? 'Complete' : 'Step ' + (cur + 1));
          const pct = reps.length ? Math.round(100 * cur / reps.length) : 0;
          const complete = cur >= reps.length;
          return `<div style="border:1px solid ${complete ? exp.accent : 'var(--border)'}; border-radius:8px; padding:8px 10px; background:${complete ? exp.accent + '14' : 'transparent'};">
            <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700;">${artJobIcon(j, 16)}${j} ${complete ? '<span style="color:var(--green);">✓</span>' : ''}</div>
            <div style="font-size:11px; color:${complete ? 'var(--green)' : 'var(--gold)'}; margin:3px 0;">${complete ? '✓ ' : `→ `}${esc(String(stageName))}</div>
            <div class="progress-track thin"><div class="progress-fill" style="width:${pct}%; background:${exp.accent};"></div></div>
            <div style="font-size:10px; color:var(--text-muted); margin-top:3px;">stage ${cur}/${reps.length}</div>
          </div>`;
        }).join('')}
        </div></div>`;
    }).join('')}
  </div>`;
}

// Have stepper that works from any page (hub card, plan table, inventory).
function artBumpHave(expKey, itemKey, delta) {
  if (artReadOnly()) return;
  const sel = _artSelFor(expKey);
  sel.have[itemKey] = Math.max(0, (parseInt(sel.have[itemKey] || '0', 10) || 0) + delta);
  artPersist(expKey);
  artScheduleSave(expKey);
  artRenderAll();

  artInvRefreshModal(expKey, '*');
}

// ── Full grind reference sheet ────────────────────────
// The aggregate "every piece" view: plan table + inline per-step detail. It
// sits under the walkthrough so a second character can follow beginning to
// end, while progress views stay up top.
function renderArtGrindSheet() {
  const wrap = document.getElementById('art-sheet');
  if (!wrap) return;
  const exp = ARTIFACTS.find(e => e.key === artGetActiveTab());
  if (!exp || exp.status !== 'live') { wrap.innerHTML = ''; return; }
  const sel = _artSelFor(exp.key);
  const tracked = (exp.jobs || []).filter(j => sel.jobs[j]);
  if (!tracked.length) { wrap.innerHTML = ''; return; }
  const complete = artAllComplete(exp);
  wrap.innerHTML = `<div class="card art-sheet" style="border-left:3px solid ${exp.accent};">
    <div class="art-sheet-head">
      <div class="section-title" style="margin:0;">Grind reference sheet — every piece</div>
      ${complete ? `<button class="btn btn-outline art-review-btn" onclick="artReviewCompleted()">Review Completed Quests</button>` : ''}
    </div>
    <div style="font-size:11px; color:var(--text-muted); margin:2px 0 10px;">Every step and one-time quest for ${esc(exp.name)}: item, classes, stockpile and best farm. Follow it beginning to end, or jump straight to the step you're on.</div>
    ${renderExpPlanHTML(exp)}
  </div>`;
}

// Share-view banner (read-only mode).
function renderArtShareBanner() {
  const banner = document.getElementById('art-share-banner');
  if (!banner) return;
  if (_artViewingShare) {
    banner.style.display = 'flex';
    const who = document.getElementById('art-share-who');
    if (who) who.textContent = ART_CHAR.name ? ` — ${ART_CHAR.name}${ART_CHAR.world ? ' @ ' + ART_CHAR.world : ''}` : '';
  } else {
    banner.style.display = 'none';
  }
}

// ── Onboarding (first-run guidance) ───────────────────
function renderArtOnboard() {
  const el = document.getElementById('art-onboard');
  if (!el) return;
  const any = ARTIFACTS.filter(e => e.status === 'live').some(e => Object.keys(_artSelFor(e.key).jobs).length);
  if (any) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card" style="margin-bottom:14px; border-left:3px solid var(--gold);">
    <div class="section-title">Start here</div>
    <ol style="font-size:12px; color:var(--text-muted); line-height:2; margin:0; padding-left:20px;">
      <li><button onclick="document.getElementById('art-expansions')?.scrollIntoView({behavior:'smooth',block:'center'})" title="Jump to the expansion picker"
        style="background:none; border:none; padding:0; font:inherit; color:var(--gold); font-weight:600; cursor:pointer; text-decoration:underline dotted;">Pick an expansion above to open its walkthrough →</button></li>
      <li>Clear the unlock list to open step 1 — then the guide leads you step by step</li>
      <li>Link your character (above) to auto-mark steps via FFXIV Collect</li>
    </ol></div>`;
}

// ── Confetti (weapon complete) ────────────────────────
let _artConfettiActive = false;
function fireArtConfetti() {
  if (_artConfettiActive) return;
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  _artConfettiActive = true;
  const colors = ['#c8a96e', '#f0c040', '#4ade80', '#5ba0e0', '#a78bfa', '#fb923c', '#f472b6', '#fff'];
  const parts = Array.from({ length: 130 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    w: 5 + Math.random() * 7,
    h: 3 + Math.random() * 4,
    col: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 3,
    vx: (Math.random() - 0.5) * 2,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.15,
  }));
  const end = Date.now() + 4000;
  (function frame() {
    if (Date.now() > end) { canvas.style.display = 'none'; _artConfettiActive = false; return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
      if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.h, p.w);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  })();
}

// ── Stats + collection cards ────────────────────────
function artExpStats(exp) {
  const sel = _artSelFor(exp.key);
  const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
  const steps = (exp.steps || []).filter(s => s.kind !== 'onetime');
  const total = jobs.length * steps.length;
  const finished = jobs.reduce((n, j) => n + steps.filter(st => artIsStepDone(exp.key, j, st.n)).length, 0);
  const weaponsDone = jobs.filter(j => steps.every(st => artIsStepDone(exp.key, j, st.n))).length;
  return { jobs: jobs.length, total, finished, pct: total ? Math.round(100 * finished / total) : 0, weaponsDone };
}

function artJobProgressPct(exp, job) {
  const steps = (exp.steps || []).filter(s => s.kind !== 'onetime');
  if (!steps.length) return 0;
  const finished = steps.filter(st => artIsStepDone(exp.key, job, st.n)).length;
  return Math.round(100 * finished / steps.length);
}

function artGlobalStats() {
  const live = ARTIFACTS.filter(e => e.status === 'live');
  const t = { jobs: 0, total: 0, finished: 0, weaponsDone: 0, per: [] };
  for (const exp of live) {
    const s = artExpStats(exp);
    t.jobs += s.jobs; t.total += s.total; t.finished += s.finished; t.weaponsDone += s.weaponsDone;
    t.per.push({ exp, ...s });
  }
  t.pct = t.total ? Math.round(100 * t.finished / t.total) : 0;
  return t;
}

function artCharImg(size, radius) {
  const src = ART_CHAR.portrait || ART_CHAR.avatarUrl;
  if (!src) return '';
  const s = size || 40;
  return `<img src="${esc(src)}" alt="" loading="lazy" style="width:${s}px; height:${s}px; object-fit:cover; object-position:top; border-radius:${radius || '8px'}; flex-shrink:0;" onerror="this.style.display='none'">`;
}

// Expansion banner: prefers a vendored banner.png screenshot (drop-in,
// no code change), falls back to the checked-in bannerImg SVG, then glyph.
// To add real art: save docs/data/artifacts/<artDir>/banner.png (~1200x220).
function artBannerSrc(exp) {
  if (exp.artDir) return `/data/artifacts/${exp.artDir}/banner.png`;
  return exp.bannerImg ? `/${exp.bannerImg}` : null;
}
function artBannerFallback(exp) {
  if (exp.artDir && exp.bannerImg) return `onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='/${exp.bannerImg}'}else{this.style.display='none'}"`;
  return `onerror="this.style.display='none'"`;
}
// Per-expansion collection cards: banner art, character portrait, weapons
// complete and stage progress. Click opens that expansion's guide page.
function renderArtExpansions() {
  const wrap = document.getElementById('art-expansions');
  if (!wrap) return;
  wrap.innerHTML = ARTIFACTS.map(exp => {
    const live = exp.status === 'live';
    const src = artBannerSrc(exp);
    const art = src
      ? `<img src="${src}" alt="${esc(exp.name)}" style="width:100%; height:74px; object-fit:cover; border-radius:8px 8px 0 0; display:block;" ${artBannerFallback(exp)}>`
      : `<div style="height:74px; display:flex; align-items:center; justify-content:center; font-size:38px; background:${exp.accent || 'var(--gold)'}24; border-radius:8px 8px 0 0;">${exp.glyph || '⚔️'}</div>`;
    const foot = !live
      ? `<span class="badge badge-start">Coming soon</span>`
      : (() => {
          const s = artExpStats(exp);
          return `<div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">${s.weaponsDone}/${s.jobs} weapon${s.jobs === 1 ? '' : 's'} complete · ${s.pct}%</div>
          <div class="progress-track thin"><div class="progress-fill" style="width:${s.pct}%; background:${exp.accent};"></div></div>`;
        })();
    const open = () => live ? `location.href='/artifacts/expansion.html?exp=${encodeURIComponent(exp.key)}'` : `showToast('Coming soon.')`;
    return `<div onclick="${open()}"
      style="border:1px solid ${live ? exp.accent : 'var(--border)'}; border-radius:8px; overflow:hidden; cursor:${live ? 'pointer' : 'default'}; opacity:${live ? 1 : 0.65}; background:var(--card);">
      ${art}
      <div style="padding:8px 10px;">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
          ${live ? artCharImg(30, '50%') : ''}
          <div style="flex:1; min-width:0;">
            <div style="font-size:12px; font-weight:700; color:var(--gold);">${esc(exp.name)}</div>
            <div style="font-size:10px; color:var(--text-muted);">${live ? esc(exp.questline || '') : 'Coming soon'}</div>
          </div>
        </div>
        ${foot}
      </div>
    </div>`;
  }).join('');
}

// All-expansion collection card: character portrait backdrop + global totals.
function renderArtAllCard() {
  const wrap = document.getElementById('art-all-card');
  if (!wrap) return;
  const t = artGlobalStats();
  if (!t.jobs) { wrap.innerHTML = ''; return; }
  const portrait = ART_CHAR.portrait || ART_CHAR.avatarUrl;
  wrap.innerHTML = `<div class="card" style="margin-bottom:14px; position:relative; overflow:hidden; border:1px solid var(--border-gold);">
    ${portrait ? `<img src="${esc(portrait)}" alt="" style="position:absolute; right:0; top:0; height:100%; width:45%; object-fit:cover; object-position:top; opacity:0.3; mask-image:linear-gradient(to right, transparent, black 45%); -webkit-mask-image:linear-gradient(to right, transparent, black 45%);" onerror="this.style.display='none'">` : ''}
    <div style="position:relative;">
      <div class="font-cinzel" style="color:var(--gold); font-size:0.85rem; font-weight:700; letter-spacing:0.1em; margin-bottom:2px;">${esc(ART_CHAR.name || 'YOUR RELIC COLLECTION')}</div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">${t.weaponsDone}/${t.jobs} weapons complete · ${t.finished}/${t.total} stages · ${t.pct}%</div>
      <div class="progress-track" style="margin-bottom:10px;"><div class="progress-fill" style="width:${t.pct}%;"></div></div>
      <div style="display:flex; flex-direction:column; gap:5px;">${t.per.map(p => `
        <div style="display:flex; align-items:center; gap:8px; font-size:11px;">
          <span style="width:8px; height:8px; border-radius:50%; background:${p.exp.accent}; flex-shrink:0;"></span>
          <span style="min-width:130px; color:var(--text-muted);">${esc(p.exp.name)}</span>
          <div class="progress-track thin" style="flex:1;"><div class="progress-fill" style="width:${p.pct}%; background:${p.exp.accent};"></div></div>
          <span style="color:var(--text-muted); min-width:64px; text-align:right;">${p.weaponsDone}/${p.jobs}</span>
        </div>`).join('')}</div>
    </div>
  </div>`;
}

function renderArtTabContent() {
  const wrap = document.getElementById('art-tab-content');
  if (!wrap) return;
  const exp = ARTIFACTS.find(e => e.key === artGetActiveTab());
  if (!exp) { wrap.innerHTML = ''; return; }
  if (exp.status !== 'live') {
    wrap.innerHTML = `<div class="card" style="margin-bottom:18px; text-align:center; color:var(--text-muted);">Coming soon.</div>`;
    return;
  }
  const sel = _artSelFor(exp.key);
  const tracked = (exp.jobs || []).filter(j => sel.jobs[j]);
  const bsrc = artBannerSrc(exp);
  const hero = bsrc
    ? `<img src="${bsrc}" alt="${esc(exp.name)}" style="width:100%; max-height:130px; object-fit:cover; border-radius:8px; margin-bottom:12px; display:block;" ${artBannerFallback(exp)}>`
    : '';
  const s = artExpStats(exp);
  const hidden = (exp.steps || []).length - artVisibleSteps(exp).length;
  wrap.innerHTML = `
  <div class="card" style="margin-bottom:14px; border-top:3px solid ${exp.accent};">
    ${hero}
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
      <div><span class="font-cinzel" style="color:var(--gold); font-weight:600;">${esc(exp.name)}</span>
      <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">${esc(exp.questline || '')}</span></div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <button onclick="artRevealGrind('${exp.key}')" title="Scroll to the full grind reference sheet"
        style="font-size:12px; color:var(--gold); background:none; border:none; cursor:pointer; font-family:inherit; padding:0;">Grind sheet ↓</button>
      <button onclick="artGenerateExpansionCard()" title="Create a shareable relic progress card for this expansion"
        style="font-size:11px; padding:4px 12px; border-radius:14px; cursor:pointer; font-family:inherit; border:1px solid ${exp.accent}; background:${exp.accent}18; color:var(--gold);">🎴 Create Expansion Card</button>
      </div>
    </div>
    <div id="art-job-chips-tab" class="art-jobchips" style="margin-bottom:12px;">${artJobChipsHTML(exp)}</div>
    ${tracked.length
      ? `<details class="art-overview">
          <summary>Class progress overview · ${s.weaponsDone}/${s.jobs} complete · ${s.pct}%${hidden ? ` · 🔒 ${hidden} locked` : ''}</summary>
          <div style="margin-top:10px;">${renderArtMatrix(exp, tracked)}</div>
        </details>`
      : `<div style="font-size:12px; color:var(--text-muted);">Select classes above to start tracking — the walkthrough and full grind sheet follow.</div>`}
  </div>`;
}

// Job icon with text fallback: <img> hides itself on error, text always renders.
let _artExpansionCardBlob = null;

function artHexToRgb(hex) {
  const value = (hex || '#ffffff').trim().replace(/^#/, '');
  const clean = value.length === 3 ? value.split('').map(ch => ch + ch).join('') : value;
  const num = Number.parseInt(clean, 16);
  if (Number.isNaN(num)) return { r: 255, g: 255, b: 255 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function artMixRgb(a, b, t) {
  const mix = (x, y) => x + (y - x) * t;
  return {
    r: Math.round(mix(a.r, b.r)),
    g: Math.round(mix(a.g, b.g)),
    b: Math.round(mix(a.b, b.b)),
  };
}

function artRgbString(rgb, alpha = 1) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function artProgressTitle(exp, pct) {
  const titles = {
    'shadowbringers-resistance': [
      { cut: 20, title: 'The First Forge' },
      { cut: 40, title: 'Blades of Defiance' },
      { cut: 60, title: 'A Relic Reforged' },
      { cut: 80, title: 'The Last Stand' },
      { cut: 100, title: 'Resistance Reborn' },
    ],
  };
  const set = titles[exp.key] || [
    { cut: 25, title: 'The First Forge' },
    { cut: 50, title: 'Forged for the Long Road' },
    { cut: 75, title: 'A Relic Reforged' },
    { cut: 100, title: 'The Final Blade' },
  ];
  const match = set.findLast ? set.findLast(item => pct >= item.cut) : [...set].reverse().find(item => pct >= item.cut);
  return match ? match.title : set[0].title;
}

async function artLoadImage(src) {
  if (!src) return null;
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function artBuildExpansionCardCanvas(exp, jobSet) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 760;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const accent = exp.accent || '#c8a96e';
  const accentRgb = artHexToRgb(accent);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#090b11';
  const card = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#10141c';
  const text = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e2e8f0';
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#6b7a96';
  const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#c8a96e';
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#232c3d';
  const bgRgb = artHexToRgb(bg);
  const cardRgb = artHexToRgb(card);
  const titleIntensity = 0.18 + Math.min(1, Math.max(0, (jobSet.length ? 1 : 0))) * 0.35;
  const titleColor = artMixRgb(accentRgb, { r: 255, g: 255, b: 255 }, 0.35 + titleIntensity);

  const jobs = Array.isArray(jobSet) && jobSet.length ? [...jobSet].sort((a, b) => {
    const pa = artJobProgressPct(exp, a);
    const pb = artJobProgressPct(exp, b);
    return pb - pa || a.localeCompare(b);
  }) : (exp.jobs || []).slice().sort((a, b) => a.localeCompare(b));
  const reps = (exp.steps || []).filter(s => s.kind !== 'onetime');
  const totalStages = reps.length || 1;
  const totalPossible = jobs.length ? jobs.length * totalStages : totalStages;
  const finishedStages = jobs.reduce((n, j) => n + reps.filter(st => artIsStepDone(exp.key, j, st.n)).length, 0);
  const weaponsDone = jobs.filter(j => reps.every(st => artIsStepDone(exp.key, j, st.n))).length;
  const pct = totalPossible ? Math.round(100 * finishedStages / totalPossible) : 0;
  const charName = ART_CHAR.name || 'Your Character';
  const charWorld = ART_CHAR.world || 'Unlinked';
  const titleText = artProgressTitle(exp, pct);
  const portraitSource = ART_CHAR.portrait || ART_CHAR.avatarUrl;
  const portrait = await artLoadImage(portraitSource)
    || await artLoadImage('/data/artifacts/shadowbringers/banner.svg');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const fullBg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  fullBg.addColorStop(0, artRgbString(artMixRgb(bgRgb, accentRgb, 0.24), 1));
  fullBg.addColorStop(0.48, artRgbString(cardRgb, 1));
  fullBg.addColorStop(1, artRgbString(artMixRgb(bgRgb, { r: 8, g: 12, b: 18 }, 0.7), 1));
  ctx.fillStyle = fullBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (portrait) {
    const pW = portrait.naturalWidth || 600;
    const pH = portrait.naturalHeight || 900;
    const scale = Math.max(canvas.width / pW, canvas.height / pH) * 1.15;
    const w = pW * scale;
    const h = pH * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.save();
    ctx.globalAlpha = 0.44;
    ctx.drawImage(portrait, x, y, w, h);
    ctx.restore();
  }

  const vignette = ctx.createRadialGradient(canvas.width * 0.68, canvas.height * 0.25, 40, canvas.width * 0.68, canvas.height * 0.25, canvas.width * 0.78);
  vignette.addColorStop(0, artRgbString(artMixRgb(accentRgb, { r: 12, g: 12, b: 18 }, 0.55), 0.6));
  vignette.addColorStop(1, artRgbString({ r: 5, g: 7, b: 12 }, 0));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panel = ctx.createLinearGradient(56, 160, 1144, 600);
  panel.addColorStop(0, artRgbString(artMixRgb(cardRgb, accentRgb, 0.1), 0.85));
  panel.addColorStop(1, artRgbString(artMixRgb(cardRgb, { r: 13, g: 15, b: 22 }, 0.32), 0.88));
  ctx.fillStyle = panel;
  ctx.fillRect(56, 110, 1088, 595);
  ctx.strokeStyle = artRgbString(artMixRgb(accentRgb, { r: 255, g: 255, b: 255 }, 0.4), 0.8);
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 110, 1088, 595);

  ctx.textAlign = 'left';
  ctx.fillStyle = artRgbString(titleColor, 0.9);
  ctx.font = '700 22px Inter, sans-serif';
  ctx.fillText('FINAL FANTASY XIV', 90, 150);
  ctx.textAlign = 'right';
  ctx.fillText((exp.name || 'RELIC GUIDE').toUpperCase(), 1110, 150);
  ctx.textAlign = 'left';
  ctx.font = '700 56px Cinzel, serif';
  ctx.shadowColor = artRgbString(accentRgb, 0.55 + pct / 200);
  ctx.shadowBlur = 20;
  ctx.fillStyle = artRgbString(titleColor, 0.97);
  ctx.fillText(titleText, 90, 216);
  ctx.shadowBlur = 0;

  ctx.font = '500 18px Inter, sans-serif';
  ctx.fillStyle = artRgbString(artMixRgb(artHexToRgb(muted), accentRgb, 0.3), 1);
  ctx.fillText(exp.name || 'Relic Progress', 90, 248);

  const statBox = { x: 90, y: 300, w: 430, h: 130 };
  ctx.fillStyle = artRgbString(artMixRgb(bgRgb, accentRgb, 0.12), 0.82);
  ctx.fillRect(statBox.x, statBox.y, statBox.w, statBox.h);
  ctx.strokeStyle = artRgbString(artMixRgb(accentRgb, { r: 255, g: 255, b: 255 }, 0.35), 0.6);
  ctx.strokeRect(statBox.x, statBox.y, statBox.w, statBox.h);

  ctx.fillStyle = artRgbString(artMixRgb(artHexToRgb(muted), { r: 255, g: 255, b: 255 }, 0.35), 1);
  ctx.font = '600 14px Inter, sans-serif';
  ctx.fillText('CHARACTER', statBox.x + 24, statBox.y + 30);
  ctx.font = '700 32px Cinzel, serif';
  ctx.fillStyle = artRgbString(artMixRgb(artHexToRgb(text), accentRgb, 0.18), 1);
  ctx.fillText(charName, statBox.x + 24, statBox.y + 72);
  ctx.font = '500 16px Inter, sans-serif';
  ctx.fillStyle = artRgbString(artMixRgb(artHexToRgb(muted), accentRgb, 0.28), 1);
  ctx.fillText(charWorld, statBox.x + 24, statBox.y + 102);

  const rightBox = { x: 560, y: 300, w: 520, h: 130 };
  ctx.fillStyle = artRgbString(artMixRgb(bgRgb, accentRgb, 0.12), 0.82);
  ctx.fillRect(rightBox.x, rightBox.y, rightBox.w, rightBox.h);
  ctx.strokeStyle = artRgbString(artMixRgb(accentRgb, { r: 255, g: 255, b: 255 }, 0.35), 0.6);
  ctx.strokeRect(rightBox.x, rightBox.y, rightBox.w, rightBox.h);

  const statList = [
    { label: 'Weapons done', value: `${weaponsDone}/${jobs.length || 1}` },
    { label: 'Stages', value: `${finishedStages}/${totalPossible}` },
    { label: 'Progress', value: `${pct}%` },
  ];

  statList.forEach((stat, index) => {
    const x = rightBox.x + 26 + (index * 150);
    ctx.fillStyle = artRgbString(artMixRgb(artHexToRgb(muted), accentRgb, 0.22), 1);
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillText(stat.label.toUpperCase(), x, rightBox.y + 32);
    ctx.fillStyle = artRgbString(artMixRgb(artHexToRgb(text), accentRgb, 0.18), 1);
    ctx.font = '700 30px Inter, sans-serif';
    ctx.fillText(stat.value, x, rightBox.y + 80);
  });

  ctx.fillStyle = artRgbString(artMixRgb(accentRgb, { r: 255, g: 255, b: 255 }, 0.25), 0.9);
  ctx.fillRect(90, 470, 1020, 12);
  ctx.fillStyle = artRgbString(accentRgb, 0.95);
  ctx.fillRect(90, 470, 1020 * (pct / 100), 12);
  ctx.fillStyle = artRgbString(artMixRgb(artHexToRgb(text), accentRgb, 0.15), 1);
  ctx.font = '700 14px Inter, sans-serif';
  ctx.fillText(`Overall progress: ${pct}%`, 90, 454);

  const sortedJobs = jobs.length ? jobs : [ ...exp.jobs || [] ];
  // Real job icons (vendored) — preloaded, letter fallback if missing.
  const jobIcons = {};
  await Promise.all(sortedJobs.map(async j => {
    jobIcons[j] = await artLoadImage(`/data/artifacts/jobs/${j}.png`);
  }));
  const perCol = Math.ceil(sortedJobs.length / 3) || 6;
  const jobColumns = [sortedJobs.slice(0, perCol), sortedJobs.slice(perCol, perCol * 2), sortedJobs.slice(perCol * 2, perCol * 3)];
  const rowY = 522;
  const rowH = 34;

  jobColumns.forEach((col, colIndex) => {
    col.forEach((job, rowIndex) => {
      const rowBase = rowY + rowIndex * rowH;
      const x = 90 + (colIndex * 340);
      const width = 310;
      const jobDone = reps.filter(st => artIsStepDone(exp.key, job, st.n)).length;
      const jobPct = Math.round((jobDone / totalStages) * 100);

      ctx.fillStyle = artRgbString(artMixRgb(cardRgb, accentRgb, 0.06), 0.88);
      ctx.fillRect(x, rowBase, width, 26);
      ctx.strokeStyle = artRgbString(artMixRgb(accentRgb, { r: 255, g: 255, b: 255 }, 0.22), 0.45);
      ctx.strokeRect(x, rowBase, width, 26);

      const iconX = x + 8;
      const iconY = rowBase + 13;
      const icon = jobIcons[job];
      if (icon) {
        try { ctx.drawImage(icon, iconX, iconY - 9, 18, 18); } catch {}
      } else {
        const jobLetter = job.slice(0, 2);
        ctx.fillStyle = artRgbString(artMixRgb(accentRgb, { r: 255, g: 255, b: 255 }, 0.3), 0.9);
        ctx.fillRect(iconX, iconY - 9, 18, 18);
        ctx.fillStyle = artRgbString(artMixRgb({ r: 12, g: 13, b: 18 }, accentRgb, 0.25), 1);
        ctx.font = '700 10px Inter, sans-serif';
        ctx.fillText(jobLetter, iconX + 4, iconY + 2);
      }

      ctx.fillStyle = artRgbString(artMixRgb(artHexToRgb(text), accentRgb, 0.14), 1);
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText(job, x + 34, rowBase + 17);

      ctx.fillStyle = artRgbString(artMixRgb(bgRgb, accentRgb, 0.22), 0.9);
      ctx.fillRect(x + 150, rowBase + 8, 110, 10);
      ctx.fillStyle = artRgbString(accentRgb, 0.9);
      ctx.fillRect(x + 150, rowBase + 8, 110 * (jobPct / 100), 10);

      ctx.fillStyle = artRgbString(artMixRgb(artHexToRgb(text), accentRgb, 0.14), 1);
      ctx.font = '700 11px Inter, sans-serif';
      ctx.fillText(`${jobPct}%`, x + 268, rowBase + 17);
    });
  });

  return canvas;
}

async function artGenerateExpansionCard() {
  const exp = ARTIFACTS.find(e => e.key === artGetActiveTab());
  if (!exp || exp.status !== 'live') return;
  const overlay = document.getElementById('art-expansion-card-overlay');
  const img = document.getElementById('art-expansion-card-img');
  if (!overlay || !img) return;

  const sel = _artSelFor(exp.key);
  const tracked = (exp.jobs || []).filter(j => sel.jobs[j]);
  const canvas = await artBuildExpansionCardCanvas(exp, tracked);
  canvas.toBlob(blob => {
    if (!blob) return;
    if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    _artExpansionCardBlob = blob;
    img.src = URL.createObjectURL(blob);
    overlay.style.display = 'flex';
  }, 'image/png');
}

function closeArtExpansionCard(e) {
  if (e && e.target && e.target.id !== 'art-expansion-card-overlay') return;
  const overlay = document.getElementById('art-expansion-card-overlay');
  const img = document.getElementById('art-expansion-card-img');
  if (img && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  if (img) img.src = '';
  if (overlay) overlay.style.display = 'none';
}

function artDownloadExpansionCard() {
  if (!_artExpansionCardBlob) return;
  const exp = ARTIFACTS.find(e => e.key === artGetActiveTab());
  const a = document.createElement('a');
  a.href = URL.createObjectURL(_artExpansionCardBlob);
  const base = (ART_CHAR.name || exp?.name || 'relic-progress').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  a.download = `${base || 'relic-progress'}-${exp?.key || 'expansion'}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function artJobIcon(job, size) {
  const s = size || 15;
  return `<img src="/data/artifacts/jobs/${job}.png" alt="" loading="lazy" ` +
    `style="width:${s}px; height:${s}px; vertical-align:-3px; border-radius:3px;" onerror="this.style.display='none'">`;
}

// Item icon (vendored wiki art) with graceful fallback: hides on error.
// Allowlisted to vendored files only — avoids 404 noise for aggregate keys.
const ART_ITEM_ICONS = { thav_scalepowder: 1, tortured: 1, sorrowful: 1, harrowing: 1, bitter_memories: 1, loathsome_memories: 1, timeworn_artifact: 1, raw_emotions: 1, haunting: 1, vexatious: 1, compact_axle: 1, compact_spring: 1, day_realm: 1, day_rift: 1, bleak: 1, lurid: 1 };
function artItemIcon(exp, key, size) {
  if (!exp.artDir || !key || !ART_ITEM_ICONS[key]) return '';
  const s = size || 28;
  return `<img src="/data/artifacts/${exp.artDir}/items/${key}.png" alt="" loading="lazy" ` +
    `style="width:${s}px; height:${s}px; border-radius:4px; flex-shrink:0;" onerror="this.style.display='none'">`;
}

// Prerequisite checklist: unchecked requirements of frontier steps across
// tracked jobs (prefix-reachable but req-blocked). Checking them unlocks steps.
function renderArtPrereq(exp, tracked) {
  if (!tracked.length) return '';
  const seen = new Map();
  for (const j of tracked) {
    let open = true;
    for (const grp of artStepGroups(exp)) {
      for (const st of grp) {
        const done = artStepDone(exp, j, st);
        if (open && !done) {
          for (const r of (st.requirements || [])) {
            const k = artReqKey(r);
            if (!artReqDone(exp.key, r) && !seen.has(k)) seen.set(k, { r, st });
          }
        }
      }
      open = open && grp.every(st => artStepDone(exp, j, st));
    }
  }
  if (!seen.size) return '';
  const rows = [...seen.values()].map(({ r, st }) => {
    const key = artReqKey(r).replace(/'/g, "\\'");
    const stepTag = st.kind === 'onetime' ? 'One-time · ' + st.quest : 'Step ' + st.n;
    return `<label style="display:flex; gap:8px; align-items:flex-start; font-size:12px; padding:6px 8px; border:1px solid var(--border); border-radius:7px; cursor:pointer;">
      <input type="checkbox" data-art-req onchange="artToggleReq('${exp.key}','${key}')" style="margin-top:2px; flex-shrink:0;">
      <span style="flex:1;">${artReqHTML(r)}<span style="display:block; font-size:10px; color:var(--text-muted);">unlocks ${esc(stepTag)}</span></span>
    </label>`;
  }).join('');
  return `<div id="art-prereq" class="art-prereqblock">
    <div class="section-title" style="margin-top:0;">Unlock checklist · tick what you've done in-game</div>
    <div style="display:flex; flex-direction:column; gap:6px;">${rows}</div>
  </div>`;
}

// ── Class × Stage matrix (Excel-style) ────────────────
// Checked tiles are pure accent fills (no glyph): step 1 faintest → final full,
// with an inset highlight for depth. Collect-owned gets a full-opacity outline.
// Filled tiles ascending in the expansion accent (Excel-style): step 1 mid-tint
// → final step full accent, white glyph, white outer glow + inset depth.
// Unchecked stays a hollow cutout (transparent, hairline border).
function artCheckCell(exp, job, st, locked) {
  const done = artIsStepDone(exp.key, job, st.n);
  const state = artStepState(exp.key, job, st.n);
  const total = (exp.steps || []).filter(s => s.kind !== 'onetime').length || 1;
  const fill = Math.round(150 + 105 * (st.n / total)).toString(16).padStart(2, '0');
  const tag = state === 'collect-owned' ? ' (Collect-owned)' : '';
  const lockTag = locked ? ' 🔒 locked — finish earlier steps and prerequisites first (still clickable)' : '';
  const box = done
    ? `background:${exp.accent}${fill}; border:1px solid ${exp.accent}; color:#fff; ` +
      `text-shadow:0 1px 2px rgba(0,0,0,0.55); ` +
      `box-shadow:inset 0 2px 3px rgba(255,255,255,0.4), inset 0 -2px 3px rgba(0,0,0,0.35), 0 0 8px rgba(255,255,255,0.9), 0 0 10px ${exp.accent}66;` +
      (state === 'collect-owned' ? ` outline:2px solid ${exp.accent}; outline-offset:1px;` : '')
    : `background:transparent; border:1px solid var(--border); color:transparent; box-shadow:none;` +
      (locked ? ' opacity:0.45;' : '');
  return `<td style="padding:4px 6px; text-align:center;">
    <span role="checkbox" aria-checked="${done}" tabindex="0" title="${job} step ${st.n}${tag}${lockTag} — click to toggle"
      onclick="artToggleStep('${exp.key}','${job}',${st.n})"
      onkeydown="if(event.key===' '||event.key==='Enter'){event.preventDefault();artToggleStep('${exp.key}','${job}',${st.n})}"
      style="display:inline-flex; width:20px; height:20px; border-radius:6px; border:1px solid; ${box}
        align-items:center; justify-content:center; cursor:pointer; font-size:12px; font-weight:700;">✓</span></td>`;
}

function artJobStage(exp, job) {
  // Highest k such that repeatable steps 1..k are all done (one-time excluded).
  let k = 0;
  for (const st of (exp.steps || [])) {
    if (st.kind === 'onetime' || typeof st.n !== 'number') continue;
    if (artIsStepDone(exp.key, job, st.n)) k = st.n;
    else break;
  }
  return k;
}

function renderArtMatrix(exp, tracked) {
  const steps = (exp.steps || []).filter(s => s.kind !== 'onetime');
  const reach = {};
  tracked.forEach(j => { reach[j] = artReachable(exp, j); });
  const head = tracked.map(j =>
    `<th style="padding:6px 6px; font-size:11px; min-width:46px;">
      <button onclick="openArtInventoryModal('${exp.key}','${j}')" title="${j} inventory"
        style="background:none; border:none; color:var(--gold); font-weight:700; font-size:11px; cursor:pointer; text-decoration:underline dotted; padding:0; line-height:1.5;">${artJobIcon(j, 18)}<br>${j}</button>
    </th>`).join('');
  const rows = steps.map(st => {
    const cells = tracked.map(j => artCheckCell(exp, j, st, !reach[j].has(st.n))).join('');
    const thumb = st.img
      ? `<img src="/${st.img}" alt="" style="width:34px; height:26px; object-fit:cover; border-radius:4px; flex-shrink:0;" onerror="this.style.display='none'">`
      : '';
    return `<tr id="art-matrix-${st.n}" style="border-top:1px solid var(--border);">
      <td style="padding:6px 8px; font-size:11px; white-space:nowrap;">
        <span style="display:inline-flex; align-items:center; gap:7px;">${thumb}<span>${st.n} · ${esc(st.quest)}<br><span style="color:var(--text-muted); font-size:10px;">→ ${esc(st.reward || '')}</span></span></span></td>${cells}</tr>`;
  }).join('');
  // In-page jumps to the step (walkthrough row in Guide, full-grind card in
  // Grind mode) — never leaves the page.
  const drops = tracked.map(j => {
    const cur = artJobStage(exp, j);
    const total = steps.length;
    const next = cur >= total ? total : cur + 1;
    const label = cur === 0 ? '→ 1' : (cur >= total ? '✓' : `→ ${next}`);
    return `<button onclick="artGotoStep('${exp.key}',${next})"
        title="${j}: ${cur === 0 ? 'not started — step 1' : (cur >= total ? 'complete' : 'through step ' + cur + ', on step ' + next)} — jump to the step"
        style="display:inline-flex; align-items:center; gap:7px; padding:5px 13px; border-radius:16px; cursor:pointer; font-family:inherit;
          border:1px solid ${exp.accent}; background:${exp.accent}1f; font-size:12px; font-weight:700; text-decoration:none; color:var(--gold);">
        ${artJobIcon(j, 16)}<span>${label}</span>
      </button>`;
  }).join('');
  return `
  <div style="overflow-x:auto; margin-bottom:10px;"><table style="border-collapse:collapse; font-size:12px;">
    <thead><tr><th style="padding:6px 8px; text-align:left; font-size:11px; color:var(--text-muted);">Stage ↓ · Class →</th>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <div style="font-size:10px; color:var(--text-muted); margin-bottom:8px;">Deeper color = later step · hover a check for status (ⓒ = Collect-owned) · click a class header for its inventory</div>
  <div class="section-title" style="margin-top:12px;">Current stage</div>
  <div style="display:flex; gap:10px; flex-wrap:wrap;">${drops}</div>
  ${renderArtOnetime(exp)}`;
}

// ── One-time grinds (once ever, not per weapon) ───────
function renderArtOnetime(exp) {
  const sel = _artSelFor(exp.key);
  const tracked = (exp.jobs || []).filter(j => sel.jobs[j]);
  const vis = new Set(artVisibleSteps(exp).map(s => s.n));
  const showDone = artShowCompleted(exp.key);
  const ots = (exp.steps || []).filter(s => s.kind === 'onetime' && vis.has(s.n));
  if (!tracked.length || !ots.length) return '';
  return `<details class="art-onetime" style="margin-top:14px;">
    <summary style="cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--gold);">
      <span>One-time grinds · once ever</span>
      <span style="color:var(--text-muted); font-size:10px; letter-spacing:0.02em; text-transform:none;">${ots.length} item${ots.length === 1 ? '' : 's'}</span>
    </summary>
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
    ${ots.map(st => {
      const done = artIsStepDone(exp.key, '*', st.n);
      const g = artGrindForStep(exp, st);
      const visLines = (g.lines || []).filter(l => showDone || l.need > 0);
      const items = visLines.map(l => `
        <div style="display:flex; gap:8px; align-items:center; font-size:11px; padding:5px 0; border-top:1px solid var(--border);">
          ${artItemIcon(exp, l.key, 26)}
          <span style="flex:1; min-width:0;">${l.perWeapon}× ${esc(l.name)} <span style="color:var(--text-muted);">(have ${l.have}, need <strong style="color:var(--gold);">${l.need}</strong>${l.best ? ` · best ${artRuns(l.best)}× ${esc(l.best.label)}` : ''})</span></span>
          <span style="display:inline-flex; align-items:center; gap:3px; flex-shrink:0;">
            <button onclick="artInvAdjust('${exp.key}','*','${l.key}',-1)" title="−1" style="width:22px; height:22px; border-radius:6px; border:1px solid var(--border); background:transparent; color:var(--text); cursor:pointer;">−</button>
            <button onclick="artInvAdjust('${exp.key}','*','${l.key}',1)" title="+1" style="width:22px; height:22px; border-radius:6px; border:1px solid var(--border-gold); background:var(--gold-dim); color:var(--gold); cursor:pointer;">+</button>
          </span>
        </div>`).join('')
        + (!visLines.length && !done ? `<div style="font-size:11px; color:var(--green); padding:5px 0;">All farmed ✓ — mark the step done.</div>` : '');
      return `<div data-art-ot="${st.n}" style="padding:9px 11px; border:1px solid ${done ? exp.accent : 'var(--border)'}; border-radius:8px; opacity:${done ? 0.7 : 1};">
        <div style="display:flex; gap:8px; align-items:center;">
          <span role="checkbox" aria-checked="${done}" tabindex="0" title="Mark one-time step done"
            onclick="artToggleStep('${exp.key}','*','${st.n}');"
            onkeydown="if(event.key===' '||event.key==='Enter'){event.preventDefault();artToggleStep('${exp.key}','*','${st.n}');}"
            style="display:inline-flex; width:20px; height:20px; border-radius:6px; border:1px solid; flex-shrink:0; cursor:pointer; align-items:center; justify-content:center; font-size:12px; font-weight:700;
              ${done ? `background:${exp.accent}; border-color:${exp.accent}; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.55); box-shadow:inset 0 2px 3px rgba(255,255,255,0.4), inset 0 -2px 3px rgba(0,0,0,0.35), 0 0 8px rgba(255,255,255,0.9), 0 0 10px ${exp.accent}66;` : 'background:transparent; border-color:var(--border); color:transparent;'}">✓</span>
          <div style="flex:1;"><span class="badge badge-start" style="margin-right:6px;">One-time</span>
          <strong style="font-size:12px;">${esc(st.quest)}</strong>
          <span style="font-size:11px; color:var(--text-muted);"> → ${esc(st.reward || '')}</span></div>
          <button onclick="openArtItemModal('${exp.key}','${st.n}')" title="Source details"
            style="background:none; border:none; color:var(--gold); font-size:11px; cursor:pointer;">sources ⓘ</button>
        </div>
        <div style="margin-top:4px;">${items}${artGuideDetails(exp, st)}</div>
      </div>`;
    }).join('')}
    </div>
  </details>`;
}

// ── Per-class inventory (relevant items only) ─────────
// Shows items for steps this job has NOT finished, with editable
// Have counts + steppers. Have is shared across jobs (one stockpile).
function artInvAdjust(expKey, job, itemKey, delta) {
  if (artReadOnly()) return;
  const sel = _artSelFor(expKey);
  sel.have[itemKey] = Math.max(0, (parseInt(sel.have[itemKey] || '0', 10) || 0) + delta);
  artPersist(expKey);
  artScheduleSave(expKey);
  artRenderAll();

  artInvRefreshModal(expKey, job);
}

function artInvSet(expKey, job, itemKey, val) {
  if (artReadOnly()) return;
  const sel = _artSelFor(expKey);
  sel.have[itemKey] = Math.max(0, parseInt(val || '0', 10) || 0);
  artPersist(expKey);
  artScheduleSave(expKey);
  artRenderAll();

  artInvRefreshModal(expKey, job);
}

function artInvRefreshModal(expKey, job) {
  // One-time card steppers pass job='*' — no inventory modal open for those.
  if (job === '*') return;
  const body = document.getElementById('art-inv-body');
  const exp = ARTIFACTS.find(e => e.key === expKey);
  if (body && exp) body.innerHTML = renderArtInventoryBody(exp, job);
}

function artInvRow(exp, job, thumb, stepLabel, itemHTML, itemKey, perWeapon, perLabel) {
  const sel = _artSelFor(exp.key);
  const have = Math.max(0, parseInt(sel.have[itemKey] || '0', 10) || 0);
  return `<div style="display:flex; gap:10px; align-items:center; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
      ${thumb}
      <div style="flex:1; min-width:0;">
        <div style="font-size:11px; color:var(--text-muted);">${stepLabel} · ${perWeapon}/${perLabel}</div>
        <div>${itemHTML}</div>
      </div>
      <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
        <button onclick="artInvAdjust('${exp.key}','${job}','${itemKey}',-1)" title="−1"
          style="width:24px; height:24px; border-radius:6px; border:1px solid var(--border); background:transparent; color:var(--text); cursor:pointer; font-size:14px; line-height:1;">−</button>
        <input type="number" min="0" value="${have}" title="Have"
          onchange="artInvSet('${exp.key}','${job}','${itemKey}',this.value)"
          style="width:56px; padding:4px 6px; text-align:center;">
        <button onclick="artInvAdjust('${exp.key}','${job}','${itemKey}',1)" title="+1"
          style="width:24px; height:24px; border-radius:6px; border:1px solid var(--border-gold); background:var(--gold-dim); color:var(--gold); cursor:pointer; font-size:14px; line-height:1;">+</button>
      </div>
    </div>`;
}

function renderArtInventoryBody(exp, job) {
  const sel = _artSelFor(exp.key);
  const showDone = artShowCompleted(exp.key);
  const reach = artReachable(exp, job);
  const have = k => Math.max(0, parseInt(sel.have[k] || '0', 10) || 0);
  const open = (exp.steps || []).filter(st => st.kind !== 'onetime' && reach.has(st.n)
    && !artIsStepDone(exp.key, job, st.n) && (showDone || have(st.itemKey) < st.perWeapon));
  const openOT = (exp.steps || []).filter(st => st.kind === 'onetime' && reach.has(st.n) && !artIsStepDone(exp.key, '*', st.n));
  if (!open.length && !openOT.length) {
    const anyLeft = (exp.steps || []).some(st => st.kind === 'onetime'
      ? !artIsStepDone(exp.key, '*', st.n) : !artIsStepDone(exp.key, job, st.n));
    return anyLeft
      ? `<div style="font-size:12px; color:var(--text-muted);">🔒 Locked behind prerequisites — check them off in the tab to stockpile here.</div>`
      : `<div style="font-size:12px; color:var(--green);">All steps complete ✓ — nothing left to stockpile.</div>`;
  }
  const rows = open.map(st => {
    const thumb = st.img
      ? `<img src="/${st.img}" alt="" style="width:56px; height:42px; object-fit:cover; border-radius:6px; flex-shrink:0;" onerror="this.style.display='none'">`
      : '';
    return artInvRow(exp, job, thumb, `Step ${st.n} · ${esc(st.quest)}`, artItemButton(exp, st), st.itemKey, st.perWeapon, 'weapon');
  });
  const otRows = openOT.flatMap(st => (st.items || [])
    .filter(it => showDone || have(it.key) < it.perWeapon)
    .map(it => artInvRow(exp, job, artItemIcon(exp, it.key, 40), `One-time · ${esc(st.quest)}`, esc(it.name), it.key, it.perWeapon, 'once ever'))
  );
  return rows.join('') + otRows.join('');
}

function openArtInventoryModal(expKey, job) {
  const exp = ARTIFACTS.find(e => e.key === expKey);
  if (!exp) return;
  setText('art-inv-title', `${job} ${exp.name} Inventory`);
  setText('art-inv-sub', `This is a shared stockpile of all quest items, only ${job} relevant items shown.`);
  const body = document.getElementById('art-inv-body');
  if (body) body.innerHTML = renderArtInventoryBody(exp, job);
  document.getElementById('inv-modal-overlay')?.classList.add('open');
}

function closeArtInvModal() {
  document.getElementById('inv-modal-overlay')?.classList.remove('open');
}
function maybeCloseArtInvModal(e) {
  if (e.target === document.getElementById('inv-modal-overlay')) closeArtInvModal();
}

function artHubToggleJob(expKey, job) {
  if (artReadOnly()) return;
  const sel = _artSelFor(expKey);
  if (sel.jobs[job]) delete sel.jobs[job];
  else sel.jobs[job] = true;
  artPersist(expKey);
  artScheduleSave(expKey);
  artRenderAll();
}

function artHubUntrackJob(expKey, job, ev) {
  if (artReadOnly()) return;
  if (ev) ev.stopPropagation();
  delete _artSelFor(expKey).jobs[job];
  artPersist(expKey);
  artScheduleSave(expKey);
  artRenderAll();

}

// ── At-a-glance + tracked classes ─────────────────────
function renderArtOverview() {
  const t = document.getElementById('art-stat-tracked');
  if (!t) return;
  let tracked = 0, done = 0, stepsLeft = 0, runsLeft = 0;
  const bars = [];
  for (const exp of ARTIFACTS.filter(e => e.status === 'live')) {
    const sel = _artSelFor(exp.key);
    const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
    tracked += jobs.length;
    let expDone = 0;
    for (const j of jobs) {
      const allDone = (exp.steps || []).every(st => artIsStepDone(exp.key, j, st.n));
      if (allDone) { done++; expDone++; }
    }
    const remaining = artRemainingSteps(exp);
    stepsLeft += remaining.length;
    for (const st of remaining) {
      const g = artGrindForStep(exp, st);
      if (g.best) runsLeft += g.best.runs;
    }
    const total = jobs.length * (exp.steps || []).filter(s => s.kind !== 'onetime').length;
    const finished = jobs.reduce((n, j) => n + (exp.steps || []).filter(s => s.kind !== 'onetime' && artIsStepDone(exp.key, j, s.n)).length, 0);
    const pct = total ? Math.round(100 * finished / total) : 0;
    bars.push(`<div style="display:flex; align-items:center; gap:10px; font-size:12px;">
      <span style="width:10px; height:10px; border-radius:50%; background:${exp.accent}; flex-shrink:0;"></span>
      <span style="min-width:150px;">${esc(exp.name)}</span>
      <div class="progress-track thin" style="flex:1;"><div class="progress-fill" style="width:${pct}%; background:${exp.accent};"></div></div>
      <span style="color:var(--text-muted); min-width:90px; text-align:right;">${expDone}/${jobs.length} · ${pct}%</span>
    </div>`);
  }
  document.getElementById('art-stat-tracked').textContent = tracked;
  document.getElementById('art-stat-done').textContent = done;
  document.getElementById('art-stat-steps').textContent = stepsLeft || '—';
  document.getElementById('art-stat-runs').textContent = runsLeft || '—';
  document.getElementById('art-expansion-bars').innerHTML = bars.join('');
  renderArtHistLine();
}

// ── Passive history line + sparkline (no manual input) ──
function artSparkSVG(points, color) {
  if (!points || points.length < 2) return '';
  const w = 120, h = 28, min = Math.min(...points), max = Math.max(...points);
  const span = Math.max(1, max - min);
  const step = w / (points.length - 1);
  const path = points.map((v, i) => `${(i * step).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;" aria-hidden="true">`
    + `<polyline points="${path}" fill="none" stroke="${color || 'var(--gold)'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderArtHistLine() {
  const el = document.getElementById('art-hist-line');
  if (!el) return;
  let summary = { weekDelta: 0, bestDay: null, bestGain: 0, points: [], days: 0 };
  try { summary = artHistSummary(); } catch { return; }
  if (!summary.days) {
    el.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">Progress history builds automatically as you mark steps done.</span>';
    return;
  }
  const weekTxt = summary.weekDelta > 0 ? `+${summary.weekDelta} stages this week`
    : summary.weekDelta === 0 ? 'no change this week' : `${summary.weekDelta} stages this week`;
  let bestTxt = '';
  if (summary.bestDay && summary.bestGain > 0) {
    let label = summary.bestDay;
    try { label = new Date(summary.bestDay + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }); } catch {}
    bestTxt = ` · best: ${label} (+${summary.bestGain})`;
  }
  el.innerHTML = `<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
    <span style="font-size:11px; color:var(--text-muted);">📈 ${esc(weekTxt)}${esc(bestTxt)}</span>
    <span style="margin-left:auto;">${artSparkSVG(summary.points, 'var(--gold)')}</span>
  </div>`;
}

function renderArtTrackedClasses() {
  const wrap = document.getElementById('art-tracked-classes');
  if (!wrap) return;
  const rows = [];
  for (const exp of ARTIFACTS.filter(e => e.status === 'live')) {
    const sel = _artSelFor(exp.key);
    const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
    if (!jobs.length) continue;
    rows.push(`<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:12px;">
      <span style="width:10px; height:10px; border-radius:50%; background:${exp.accent}; flex-shrink:0;"></span>
      <span style="min-width:150px; color:var(--text-muted);">${esc(exp.name)}</span>
      <span style="display:flex; gap:5px; flex-wrap:wrap;">${jobs.map(j => {
        const stage = artJobStage(exp, j);
        const total = (exp.steps || []).filter(s => s.kind !== 'onetime').length;
        return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:11px; padding:2px 9px; border-radius:12px; border:1px solid ${exp.accent}; background:${exp.accent}2e;">
          <button onclick="openArtInventoryModal('${exp.key}','${j}')" title="${j} inventory"
            style="background:none; border:none; color:var(--text); font-size:11px; font-weight:700; cursor:pointer; padding:0;">${artJobIcon(j, 13)}${j}</button>
          <span style="color:var(--text-muted);">st.${stage}/${total}</span>
          <button onclick="artHubUntrackJob('${exp.key}','${j}',event)" title="Stop tracking"
          style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:10px; padding:0;">✕</button></span>`;
      }).join('')}</span>
    </div>`);
  }
  wrap.innerHTML = rows.length ? rows.join('') : '<div style="font-size:12px; color:var(--text-muted);">Nothing tracked yet — pick an expansion above to start its guide.</div>';
}

// ── Remaining steps (selected weapons only) ───────────
function artItemButton(exp, st) {
  return `<button onclick="openArtItemModal('${exp.key}','${st.n}')" title="Source details"
    style="background:none; border:none; color:var(--gold); font-weight:600; font-size:13px; cursor:pointer; padding:0; text-align:left;">${esc(st.item)} ⓘ</button>`;
}

// Clickable item name for split-farm sub-items / one-time items (opens the
// step's source modal, same as the aggregate line).
function artItemNameButton(exp, st, name) {
  return `<button onclick="openArtItemModal('${exp.key}','${st.n}')" title="Source details"
    style="background:none; border:none; color:var(--gold); font-weight:600; font-size:inherit; cursor:pointer; padding:0; text-align:left;">${esc(name)} ⓘ</button>`;
}

// Gate toggles: show-all (with one-time confirm) + show-completed lines.
function artGateButtons(exp) {
  const total = (exp.steps || []).length;
  const hidden = total - artVisibleSteps(exp).length;
  const showAll = artShowAll(exp.key);
  const showDone = artShowCompleted(exp.key);
  const btn = (fn, label, on) =>
    `<button onclick="${fn}('${exp.key}')" style="font-size:11px; padding:4px 12px; border-radius:14px; cursor:pointer; font-family:inherit; ` +
    `border:1px solid ${on ? exp.accent : 'var(--border)'}; background:${on ? exp.accent + '2e' : 'transparent'}; color:${on ? 'var(--text)' : 'var(--text-muted)'}; font-weight:${on ? 700 : 400};">${label}</button>`;
  return `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:10px 0; font-size:11px;">
    ${hidden > 0 && !showAll ? `<span style="color:var(--text-muted);">🔒 ${hidden} step${hidden === 1 ? '' : 's'} locked behind quest order</span>` : ''}
    ${btn('artToggleShowAll', showAll ? 'Hide locked steps' : 'Show all grind', showAll)}
    ${btn('artToggleShowDone', showDone ? 'Hide completed lines' : 'Show completed lines', showDone)}
  </div>`;
}

// Requirement entry: plain string (legacy) or {t, link}. Links to wiki quest pages.
function artReqHTML(r) {
  const t = typeof r === 'string' ? r : (r.t || '');
  const link = typeof r === 'string' ? null : r.link;
  return link
    ? `<a href="${esc(link)}" target="_blank" rel="noopener" style="color:var(--gold);">${esc(t)}</a>`
    : esc(t);
}

// Correct wiki reference (explicit per-step slug; fall back to the quest name).
function artQuestWikiURL(st) {
  if (st.wiki) return st.wiki;
  return 'https://ffxiv.consolegameswiki.com/wiki/' + encodeURIComponent(String(st.quest).replace(/ /g, '_'));
}

// Hand-held quest walkthrough, built from our own data so this page — not the
// wiki — is the walkthrough. The wiki link is a small secondary reference.
function artGuideDetails(exp, st) {
  const gd = st.guide || {};
  const giver = gd.giver || st.questGiver || exp.npc || 'the quest giver';
  const turnIn = gd.turnIn || giver;
  const g = artGrindForStep(exp, st);
  const best = g.best ? esc(g.best.label) : null;
  const patch = gd.patch ? ` <span class="art-qw-patch">Patch ${esc(gd.patch)}</span>` : '';

  const steps = [];
  steps.push(`Speak with <strong>${artLinkifyNpcs(esc(giver))}</strong> and accept <strong>“${esc(st.quest)}”</strong>${patch}.`);
  if (st.kind === 'onetime') {
    steps.push(`Farm <strong>${esc(st.item || 'the required items')}</strong>${best ? ` — fastest from <strong>${best}</strong>` : ''}, then hand it over.`);
  } else {
    steps.push(`Farm <strong>${st.perWeapon}× ${esc(st.item)}</strong>${best ? ` — fastest from <strong>${best}</strong>` : ''}. Use the +/− steppers to track it.`);
  }
  steps.push(`Turn in to <strong>${artLinkifyNpcs(esc(turnIn))}</strong> to receive <strong>${esc(st.reward || 'your upgraded relic')}</strong>.`);
  if (gd.next) steps.push(`Then pick up <strong>${esc(gd.next)}</strong>.`);

  const notes = (gd.notes || []).map(n => `<div class="art-qw-note">⚠ ${esc(n)}</div>`).join('');
  const reqs = (st.requirements || []).map(r => `<div>✅ ${artReqHTML(r)}</div>`).join('');
  const setup = (st.setup || []).map(s => `<div>🛠 ${artLinkifyNpcs(esc(s))}</div>`).join('');
  const banner = st.img ? `<img src="/${st.img}" alt="${esc(st.quest)}" class="art-qw-banner" loading="lazy" onerror="this.style.display='none'">` : '';

  return `<details class="art-details art-questwalk" open>
    <summary>Quest walkthrough</summary>
    ${banner}
    <ol class="art-queststeps">${steps.map(s => `<li>${s}</li>`).join('')}</ol>
    ${reqs || setup ? `<div class="art-qw-cols">
      ${reqs ? `<div><div class="art-qw-sec">Requirements</div>${reqs}</div>` : ''}
      ${setup ? `<div><div class="art-qw-sec">Setup</div>${setup}</div>` : ''}
    </div>` : ''}
    ${notes}
    <div class="art-qw-wiki">Reference: <a href="${esc(artQuestWikiURL(st))}" target="_blank" rel="noopener">${esc(st.quest)} on the wiki ↗</a></div>
  </details>`;
}

// ── Item modal (vendor / cost / location / drop rate) ─
function openArtItemModal(expKey, stepN) {
  const exp = ARTIFACTS.find(e => e.key === expKey);
  // onclick handlers interpolate the step number into a quoted string, so a
  // numeric step arrives as '1' — compare loosely or the modal silently no-ops.
  const st = exp?.steps?.find(s => String(s.n) === String(stepN));
  if (!st) return;
  setText('art-item-step', `${exp.name} · Step ${st.n} · ${st.quest}`);
  setText('art-item-name', st.item);
  const g = artGrindForStep(exp, st);
  const box = document.getElementById('art-item-body');
  if (box) {
    // One-time steps: one block per item (own sources + Have-aware runs).
    const otBlocks = (st.items || []).map((it, ix) => {
      const l = (g.lines || [])[ix] || { have: 0, need: it.perWeapon, sources: it.sources, best: null };
      const srcs = (l.sources || []).map(s => `
        <div style="font-size:12px;">${artSourceLabelHTML(s)} <span style="color:var(--gold); font-weight:600;">(${s.yields}/run${s.runs != null ? ` · ${artRuns(s)} runs` : ''})</span>${s.location ? ` <span style="color:var(--text-muted);">${artAreaChips(s.location)}</span>` : ''}${s.cost ? ` <span style="color:var(--text-muted);">${esc(s.cost)}</span>` : ''}${s.rate ? ` <span style="color:var(--text-muted);">· ${esc(s.rate)}</span>` : ''}</div>`).join('');
      return `<div style="padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
        <div style="font-weight:600;">${esc(it.name)} <span style="color:var(--text-muted); font-weight:400;">(${it.perWeapon} once ever · have ${l.have}, need <strong style="color:var(--gold);">${l.need}</strong>)</span></div>
        <div style="margin-top:5px; display:flex; flex-direction:column; gap:4px;">${srcs}</div>
      </div>`;
    }).join('');
    const needLine = st.items
      ? `<div style="padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--gold-dim);">
          <strong>Once ever</strong> · total need <strong style="color:var(--gold);">${g.need}</strong>
          <span style="color:var(--text-muted);">(one-time grind, not per weapon)</span></div>`
      : `<div style="padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--gold-dim);">
      <strong>${st.perWeapon}/weapon</strong> · need <strong style="color:var(--gold);">${g.need}</strong>
      <span style="color:var(--text-muted);">(have ${g.have}, ${g.needers.length} weapon${g.needers.length === 1 ? '' : 's'})</span></div>`;
    const vendorLines = (st.vendors || []).map(v =>
      `<div style="font-size:12px;">🏪 ${artLinkifyNpcs(esc(v))}</div>`).join('');
    const srcLines = (st.sources || []).map(s => `
      <div style="padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
        <div style="font-weight:600;">${artSourceLabelHTML(s)} <span style="color:var(--gold);">(${s.yields}/run)</span></div>
        ${s.activity ? `<div style="color:var(--text-muted);">Activity: ${esc(s.activity)}</div>` : ''}
        ${s.vendor ? `<div style="color:var(--text-muted);">Vendor: ${esc(s.vendor)}</div>` : ''}
        ${s.location ? `<div style="color:var(--text-muted);">Location: ${artAreaChips(s.location)}</div>` : ''}
        ${s.cost ? `<div style="color:var(--text-muted);">Cost: ${esc(s.cost)}</div>` : ''}
        ${s.rate ? `<div style="color:var(--text-muted);">Drop rate: ${esc(s.rate)}</div>` : ''}
        ${s.note ? `<div style="color:var(--text-muted);">Note: ${esc(s.note)}</div>` : ''}
      </div>`).join('');
    const subLines = (st.subItems || []).map(s =>
      `<div style="font-size:12px;">• ${s.perWeapon}× ${esc(s.name)}</div>`).join('');
    box.innerHTML = needLine
      + ((st.requirements || []).length ? `<div style="font-size:11px; color:var(--text-muted);">Requires: ${(st.requirements || []).map(artReqHTML).join(' · ')}</div>` : '')
      + (otBlocks ? `<div><div style="font-weight:600; margin-bottom:4px;">Items</div><div style="display:flex; flex-direction:column; gap:6px;">${otBlocks}</div></div>` : '')
      + (subLines ? `<div><div style="font-weight:600; margin-bottom:4px;">Breakdown</div>${subLines}</div>` : '')
      + (vendorLines ? `<div><div style="font-weight:600; margin-bottom:4px;">Vendors</div>${vendorLines}</div>` : '')
      + (!otBlocks ? `<div><div style="font-weight:600; margin-bottom:4px;">Sources</div><div style="display:flex; flex-direction:column; gap:6px;">${srcLines}</div></div>` : '');
  }
  document.getElementById('item-modal-overlay')?.classList.add('open');
}

function closeArtItemModal() {
  document.getElementById('item-modal-overlay')?.classList.remove('open');
}
function maybeCloseArtItemModal(e) {
  if (e.target === document.getElementById('item-modal-overlay')) closeArtItemModal();
}

// ── Shared grind partials (expansion page + hub inline) ─
// Pure HTML builders so the hub tab can render the SAME full grind without
// navigating away. idPrefix namespaces step anchors ('step' on the sub-page,
// 'art-fg' inline on the hub).
// Which tracked classes still sit on a step (shown in the sheet, not the guide).
function artStepClassesCell(exp, st) {
  if (st.kind === 'onetime') return '<span style="color:var(--text-muted);">once ever</span>';
  const need = artJobsNeedingStep(exp, st.n);
  if (!need.length) return '<span style="color:var(--green);">✓ all tracked</span>';
  return `<span class="art-clslist">${need.map(j => `<span class="art-clsico" title="${esc(j)} still needs this step">${artJobIcon(j, 14)}${esc(j)}</span>`).join('')}</span>`;
}

function renderExpPlanHTML(exp) {
  const sel = _artSelFor(exp.key);
  const jobs = (exp.jobs || []).filter(j => sel.jobs[j]);
  const vis = new Set(artVisibleSteps(exp).map(s => s.n));
  const showDone = artShowCompleted(exp.key);
  if (!jobs.length) return '<div style="font-size:12px; color:var(--text-muted);">Select jobs above to compute the grind plan.</div>';
  const haveOf = k => Math.max(0, parseInt(sel.have[k] || '0', 10) || 0);
  return `${artGateButtons(exp)}<div style="overflow-x:auto;"><table style="width:100%; font-size:12px; border-collapse:collapse;">
    <thead><tr style="color:var(--text-muted); text-align:left;">
      <th style="padding:6px 8px;">Step</th><th style="padding:6px 8px;">Item</th>
      <th style="padding:6px 8px;">Classes</th>
      <th style="padding:6px 8px;">Have</th><th style="padding:6px 8px;">Need</th>
      <th style="padding:6px 8px;">Best farm (runs)</th>
    </tr></thead><tbody>
    ${(exp.steps || []).filter(s => vis.has(s.n)).map(st => {
      const g = artGrindForStep(exp, st);
      if (st.kind === 'onetime') {
        // Once-ever steps are hidden the moment they're done — never needed again.
        if (artIsStepDone(exp.key, '*', st.n)) return '';
        return (g.lines || []).filter(l => showDone || l.need > 0).map(l => `<tr style="border-top:1px solid var(--border); background:rgba(255,255,255,0.015);">
        <td style="padding:6px 8px;"><span class="badge badge-start">One-time</span> ${esc(st.quest)}<div style="font-size:10px; color:var(--text-muted);">→ ${esc(st.reward || '')}</div></td>
        <td style="padding:6px 8px;">${artItemIcon(exp, l.key, 22)} ${esc(l.name)} <span style="color:var(--text-muted);">(${l.perWeapon} once ever)</span></td>
        <td style="padding:6px 8px;">${artStepClassesCell(exp, st)}</td>
        <td style="padding:6px 8px;"><input type="number" min="0" value="${l.have}" style="width:70px; padding:4px 6px;" onchange="artExpSetHave('${exp.key}','${l.key}',this.value)"></td>
        <td style="padding:6px 8px; font-weight:700; color:${l.need ? 'var(--gold)' : 'var(--green)'};">${l.need}</td>
        <td style="padding:6px 8px;">${l.best ? `${artRuns(l.best)}× ${esc(l.best.label)}` : '—'}</td>
      </tr>`).join('');
      }
      if (!showDone && g.need === 0 && (g.needers.length === 0 || g.have > 0)) return '';
      const billable = g.billable != null ? g.billable : g.needers.length;
      const subs = st.subItems || [];
      // Split-farm steps: one row per memory type, each with its own Have.
      if (subs.length) {
        return subs.map((it, ix) => {
          const h = haveOf(it.key);
          const need = Math.max(0, it.perWeapon * billable - h);
          const srcs = (st.sources || [])
            .filter(s => String(s.label || '').toLowerCase().includes(String(it.key).toLowerCase()))
            .map(s => ({ ...s, ...artSourceRuns(need, s) }));
          const best = srcs.filter(s => s.runs != null).sort((a, b) => a.runs - b.runs)[0] || null;
          return `<tr style="border-top:1px solid var(--border);">
            <td style="padding:6px 8px; white-space:nowrap;">${ix === 0 ? `${st.n} · ${esc(st.quest)}<div style="font-size:10px; color:var(--text-muted);">→ ${esc(st.reward || '')}</div>` : ''}</td>
            <td style="padding:6px 8px;">${artItemIcon(exp, it.key, 22)} ${esc(it.name)} <span style="color:var(--text-muted);">(${it.perWeapon}/weapon)</span></td>
            <td style="padding:6px 8px;">${ix === 0 ? artStepClassesCell(exp, st) : ''}</td>
            <td style="padding:6px 8px;"><input type="number" min="0" value="${h}" style="width:70px; padding:4px 6px;" onchange="artExpSetHave('${exp.key}','${it.key}',this.value)"></td>
            <td style="padding:6px 8px; font-weight:700; color:${need ? 'var(--gold)' : 'var(--green)'};">${need}</td>
            <td style="padding:6px 8px;">${best ? `${artRuns(best)}× ${esc(best.label)}` : '—'}</td>
          </tr>`;
        }).join('');
      }
      return `<tr style="border-top:1px solid var(--border);">
        <td style="padding:6px 8px; white-space:nowrap;">${st.n} · ${esc(st.quest)}<div style="font-size:10px; color:var(--text-muted);">→ ${esc(st.reward || '')}</div></td>
        <td style="padding:6px 8px;">${artItemIcon(exp, st.itemKey, 22)} ${artItemButton(exp, st)} <span style="color:var(--text-muted);">(${st.perWeapon}/weapon${g.free ? ' · first free' : ''})</span></td>
        <td style="padding:6px 8px;">${artStepClassesCell(exp, st)}</td>
        <td style="padding:6px 8px;"><input type="number" min="0" value="${g.have}" style="width:70px; padding:4px 6px;" onchange="artExpSetHave('${exp.key}','${st.itemKey}',this.value)"></td>
        <td style="padding:6px 8px; font-weight:700; color:${g.need ? 'var(--gold)' : 'var(--green)'};">${g.need}</td>
        <td style="padding:6px 8px;">${g.best ? `${artRuns(g.best)}× ${esc(g.best.label)}` : '—'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>
    <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">Click an item name for vendor / cost / location / drop-rate details.</div>
    ${(function () {
      const rows = (exp.steps || []).filter(s => vis.has(s.n));
      if (!rows.length) return '<div style="font-size:12px; color:var(--text-muted); margin-top:8px;">🔒 Nothing unlocked yet — clear the checklist in the walkthrough above, or use “Show all grind”.</div>';
      const anyNeed = rows.some(st => artGrindForStep(exp, st).need > 0);
      return (!showDone && !anyNeed)
        ? `<div style="font-size:12px; color:var(--green); margin-top:8px;">All unlocked steps farmed ✓ — use “Show completed lines” to review, or mark steps completed in the guide above.</div>` : '';
    })()}`;
}

// ── Aftercare ─────────────────────────────────────────
// Fills the expansion page's aftercare slot (replicas, stat reallocation).
function renderArtAftercareSlot() {
  const el = document.getElementById('art-aftercare');
  if (!el) return;
  const exp = ARTIFACTS.find(e => e.key === artGetActiveTab());
  el.innerHTML = exp && exp.status === 'live' ? renderArtAftercare(exp) : '';
}

function renderArtAftercare(exp) {
  const ac = exp.aftercare;
  if (!ac) return '';
  return `<div class="card" style="border-left:3px solid ${exp.accent};">
    <div class="section-title">${esc(ac.title || 'Aftercare')}</div>
    ${(ac.points || []).map(p => `<div style="font-size:12px; margin-bottom:6px; line-height:1.6;">✨ ${artLinkifyNpcs(esc(p))}</div>`).join('')}
  </div>`;
}

function artExpSetHave(expKey, itemKey, val) {
  if (artReadOnly()) return;
  _artSelFor(expKey).have[itemKey] = Math.max(0, parseInt(val || '0', 10) || 0);
  artPersist(expKey);
  artScheduleSave(expKey);
  if (typeof artRenderAll === 'function') artRenderAll();
}
