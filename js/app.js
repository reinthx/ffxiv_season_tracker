// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DATA — loaded from data/series.json at runtime
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let LEVEL_THRESHOLDS = [0,2000,4000,6000,8000,11000,14000,17000,20000,23000,27000,31000,35000,39000,43000,48500,54000,59500,65000,70500,78000,85500,93000,100500,108000];
let EXTRA_LEVEL_COST = 20000;
let CURRENT_SERIES   = { num:0, name:'Loading…', patch:'', patchStart:'', patchEnd:'' };
let REWARDS          = [];
let OLD_SERIES       = [];

const TYPE_META = {
  start:    { label:'Start',           badgeClass:'badge-start',    iconBg:'rgba(107,122,150,0.2)' },
  crystals: { label:'Trophy Crystals', badgeClass:'badge-crystals', iconBg:'rgba(200,169,110,0.18)' },
  emote:    { label:'Emote',           badgeClass:'badge-emote',    iconBg:'rgba(251,191,36,0.2)' },
  framer:   { label:"Framer's Kit",    badgeClass:'badge-framer',   iconBg:'rgba(91,160,224,0.2)' },
  minion:   { label:'Minion',          badgeClass:'badge-minion',   iconBg:'rgba(74,222,128,0.2)' },
  mount:    { label:'Mount',           badgeClass:'badge-mount',    iconBg:'rgba(167,139,250,0.2)' },
  attire:   { label:'Attire Coffer',   badgeClass:'badge-attire',   iconBg:'rgba(251,146,60,0.2)' },
  fashion:  { label:'Fashion Acc.',    badgeClass:'badge-fashion',  iconBg:'rgba(244,114,182,0.2)' },
};

const ACT_AVG = { cc:800, fl:1250, rw:1000, dailyBonus:1250 };

// CORS proxy pool — tried in parallel, fastest working one wins
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];
const PROXY_TIMEOUT_MS = 8000;

async function fetchViaProxy(url) {
  const controllers = CORS_PROXIES.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach(c => c.abort()), PROXY_TIMEOUT_MS);

  try {
    return await Promise.any(
      CORS_PROXIES.map(async (makeProxy, i) => {
        const resp = await fetch(makeProxy(url), { signal: controllers[i].signal });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        // Cancel remaining in-flight requests
        controllers.forEach((c, j) => { if (j !== i) c.abort(); });
        return resp;
      })
    );
  } catch {
    throw new Error('All proxies failed or timed out');
  } finally {
    clearTimeout(timer);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LEVEL MATH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function xpToStartLevel(level) {
  if (level <= 1) return 0;
  const idx = level - 1;
  if (idx < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[idx];
  return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (idx - LEVEL_THRESHOLDS.length + 1) * EXTRA_LEVEL_COST;
}
function xpPerLevel(level) { return xpToStartLevel(level + 1) - xpToStartLevel(level); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let S = { level:1, xp:0, goal:25, userStart:null, charName:null, charWorld:null, charLodestoneId:null, charAvatar:null, charPortrait:null, charClass:null, charClassLevel:null };

function encodeS(s) {
  const p = new URLSearchParams();
  p.set('l', s.level); p.set('x', s.xp); p.set('g', s.goal);
  if (s.userStart)       p.set('us', s.userStart);
  if (s.charName)        p.set('cn', s.charName);
  if (s.charWorld)       p.set('cw', s.charWorld);
  if (s.charLodestoneId) p.set('cl', s.charLodestoneId);
  return p.toString();
}
function decodeS(raw) {
  try {
    const p  = new URLSearchParams(raw);
    const lv = Math.max(1, parseInt(p.get('l')) || 1);
    const xp = Math.max(0, parseInt(p.get('x')) || 0);
    return {
      level:          lv,
      xp:             Math.min(xp, xpPerLevel(lv)-1),
      goal:           Math.max(1, parseInt(p.get('g')) || 25),
      userStart:      p.get('us') || null,
      charName:       p.get('cn') || null,
      charWorld:      p.get('cw') || null,
      charLodestoneId:p.get('cl') || null,
      charAvatar:     p.get('ca') || null,
    };
  } catch { return null; }
}
function persist() {
  history.replaceState(null, '', '#' + encodeS(S));
  try { localStorage.setItem('ffxiv-tracker', encodeS(S)); } catch {}
}
function loadPersisted() {
  const hash = location.hash.slice(1);
  if (hash) { const s = decodeS(hash); if (s) return s; }
  try {
    const st = localStorage.getItem('ffxiv-tracker');
    if (st) { const s = decodeS(st); if (s) return s; }
  } catch {}
  return null;
}

// Fetch portrait (and class) from Lodestone for a given ID, silently — used when loading a share link on a new device
async function fetchPortraitByLodestoneId(lodestoneId) {
  try {
    const resp = await fetchViaProxy('https://na.finalfantasyxiv.com/lodestone/character/' + lodestoneId + '/');
    if (!resp.ok) return;
    const html = await resp.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const portraitEl = doc.querySelector('.character__detail__image img')
      || doc.querySelector('img[src*="img2.finalfantasyxiv.com"][src*="_gc"]')
      || doc.querySelector('.character-block__portrait img')
      || doc.querySelector('img[src*="/character/"]');
    if (portraitEl) S.charPortrait = portraitEl.getAttribute('src') || null;
    const soulMatch = html.match(/Soul of the ([A-Z][A-Za-z ]{2,28}?)(?=["<&\n])/);
    if (soulMatch && !S.charClass) S.charClass = soulMatch[1].trim();
  } catch { /* best-effort */ }

  // Avatar (face thumbnail) is only reliably available on the search results page — fetch it if still missing
  if (!S.charAvatar && S.charName && S.charWorld) {
    try {
      const searchUrl = `https://na.finalfantasyxiv.com/lodestone/character/?q=${encodeURIComponent(S.charName)}&worldname=${encodeURIComponent(S.charWorld)}`;
      const searchResp = await fetchViaProxy(searchUrl);
      if (searchResp.ok) {
        const searchHtml = await searchResp.text();
        const searchDoc  = new DOMParser().parseFromString(searchHtml, 'text/html');
        for (const a of searchDoc.querySelectorAll('a[href*="/lodestone/character/"]')) {
          const m = a.getAttribute('href').match(/\/character\/(\d+)\//);
          if (m && m[1] === String(lodestoneId)) {
            const avatarEl = a.querySelector('img') || a.closest('li')?.querySelector('img');
            if (avatarEl) { S.charAvatar = avatarEl.getAttribute('src') || null; break; }
          }
        }
      }
    } catch { /* best-effort */ }
  }

  if (S.charPortrait || S.charAvatar || S.charClass) {
    saveCharExt();
    renderPortraitBg();
    renderCharDisplay();
  }
}

// Extended char data (portrait/class — not in URL, stored separately)
function saveCharExt() {
  try { localStorage.setItem('ffxiv-char-ext', JSON.stringify({ lodestoneId: S.charLodestoneId, portrait: S.charPortrait, avatar: S.charAvatar, cls: S.charClass, clsLv: S.charClassLevel })); } catch {}
}
function loadCharExt() {
  try { return JSON.parse(localStorage.getItem('ffxiv-char-ext') || 'null'); } catch { return null; }
}
function clearCharExt() {
  try { localStorage.removeItem('ffxiv-char-ext'); } catch {}
}

// XP history (sparkline)
const XP_HIST_KEY = 'ffxiv-xp-history';
function loadXPHist() { try { return JSON.parse(localStorage.getItem(XP_HIST_KEY) || '[]'); } catch { return []; } }
function saveXPHist(h) { try { localStorage.setItem(XP_HIST_KEY, JSON.stringify(h)); } catch {} }
function recordXPHist() {
  const hist   = loadXPHist();
  const today  = new Date().toISOString().split('T')[0];
  const totalXP = xpToStartLevel(S.level) + S.xp;
  const last   = hist[hist.length - 1];
  if (last && last.date === today) { last.totalXP = totalXP; }
  else { hist.push({ date: today, totalXP }); }
  if (hist.length > 60) hist.splice(0, hist.length - 60);
  saveXPHist(hist);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  COMPUTED STATS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function computeStats() {
  const totalXP    = xpToStartLevel(S.level) + S.xp;
  const goalXP     = xpToStartLevel(S.goal);
  const xpRemain   = Math.max(0, goalXP - totalXP);
  const seasonPct  = goalXP > 0 ? Math.min(100, (totalXP / goalXP) * 100) : 100;
  const levelPct   = xpPerLevel(S.level) > 0 ? Math.min(100, (S.xp / xpPerLevel(S.level)) * 100) : 0;

  const MS_DAY  = 86_400_000;
  const now     = Date.now();
  const psMs    = new Date(CURRENT_SERIES.patchStart).getTime();
  const peMs    = new Date(CURRENT_SERIES.patchEnd).getTime();
  const seriesD = Math.max(1, Math.round((peMs - psMs) / MS_DAY));
  const elapsed = Math.max(0, Math.floor((now - psMs) / MS_DAY));
  const daysLeft= Math.max(0, Math.ceil((peMs - now) / MS_DAY));
  const seriesPct = Math.min(100, (elapsed / seriesD) * 100);

  const startMs  = S.userStart ? new Date(S.userStart).getTime() : psMs;
  const trackDays= Math.max(1, Math.floor((now - startMs) / MS_DAY));
  const xpPerDay = totalXP > 0 ? Math.round(totalXP / trackDays) : null;
  const usingUserStart = !!S.userStart;

  const minXpPerDay = daysLeft > 0 && xpRemain > 0 ? Math.ceil(xpRemain / daysLeft) : null;

  let daysToGoal = null, finishDate = null;
  if (xpPerDay > 0) {
    daysToGoal = Math.ceil(xpRemain / xpPerDay);
    finishDate = new Date(now + daysToGoal * MS_DAY);
  }

  let makeIt = null;
  if (xpPerDay > 0) {
    if (xpRemain === 0)              makeIt = 'done';
    else if (daysToGoal <= daysLeft) makeIt = 'yes';
    else                             makeIt = 'no';
  }

  const nextReward  = REWARDS.find(r => r.level > S.level) || null;
  const nextSpecial = REWARDS.find(r => r.level > S.level && r.milestone) || null;
  const nextLvXP    = xpPerLevel(S.level) - S.xp;

  return { totalXP, goalXP, xpRemain, seasonPct, levelPct, elapsed, daysLeft, seriesPct, xpPerDay, usingUserStart, minXpPerDay, daysToGoal, finishDate, makeIt, nextReward, nextSpecial, nextLvXP };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FORMATTING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fmt  = n => Number(n).toLocaleString();
const fmtD = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
const fmtDS= s => new Date(s+'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
function badgeHTML(type) { const m = TYPE_META[type] || TYPE_META.start; return `<span class="badge ${m.badgeClass}">${m.label}</span>`; }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RENDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function render() {
  const st = computeStats();

  // Series banner
  setText('banner-elapsed', st.elapsed);
  setText('banner-remain',  st.daysLeft);
  setW('series-timeline-bar', st.seriesPct);
  setText('banner-start-label', fmtDS(CURRENT_SERIES.patchStart));
  setText('banner-end-label',   fmtDS(CURRENT_SERIES.patchEnd));
  setText('banner-dates', `${fmtDS(CURRENT_SERIES.patchStart)} → ${fmtDS(CURRENT_SERIES.patchEnd)}`);
  setText('banner-pct-label', st.seriesPct.toFixed(1) + '% of series elapsed');

  // Progress bars
  setText('season-pct', st.seasonPct.toFixed(1)+'%');
  setW('season-bar', st.seasonPct);
  setText('season-xp-label', `${fmt(st.totalXP)} / ${fmt(st.goalXP)} XP`);
  setText('season-goal-label', `Goal: Lv. ${S.goal}`);
  setText('level-pct', st.levelPct.toFixed(1)+'%');
  setW('level-bar', st.levelPct);
  setText('lv-label', `Level ${S.level}`);
  setText('level-xp-label', `${fmt(S.xp)} / ${fmt(xpPerLevel(S.level))} XP`);
  setText('lv-next-label', `→ Level ${S.level+1}`);

  // Stats
  setText('s-total-xp',  fmt(st.totalXP));
  setText('s-xp-rem',    fmt(st.xpRemain));
  setText('s-xp-day',    st.xpPerDay !== null ? fmt(st.xpPerDay) : '—');
  setText('s-xp-day-label', st.usingUserStart ? 'Avg XP / Day (your start)' : 'Avg XP / Day (patch start)');
  setText('s-min-xp-day', st.minXpPerDay !== null ? fmt(st.minXpPerDay) : (st.xpRemain===0 ? '✓ Done!' : '—'));
  setText('s-days-left',  st.daysLeft + (st.daysLeft===1 ? ' day' : ' days'));
  setText('s-days-goal',  st.daysToGoal !== null ? st.daysToGoal + (st.daysToGoal===1 ? ' day' : ' days') : (st.xpRemain===0 ? '✓' : '—'));
  setText('s-completion', st.finishDate ? fmtD(st.finishDate) : (st.xpRemain===0 ? '✓ Done!' : '—'));

  const miEl = document.getElementById('s-make-it');
  if      (st.makeIt==='done') { miEl.textContent='🎉 Done!';       miEl.style.color='var(--green)'; }
  else if (st.makeIt==='yes')  { miEl.textContent='✓ On track!';    miEl.style.color='var(--green)'; }
  else if (st.makeIt==='no')   { miEl.textContent='⚠ Behind pace';  miEl.style.color='var(--red)'; }
  else                         { miEl.textContent='—';              miEl.style.color='var(--text-muted)'; }

  // Next level info
  setText('next-level-info', st.nextLvXP > 0
    ? `${fmt(st.nextLvXP)} XP to Level ${S.level+1}${st.nextSpecial ? ` · Next special: Lv.${st.nextSpecial.level} ${st.nextSpecial.name}` : ''}`
    : (st.xpRemain===0 ? '🎉 Goal reached!' : ''));

  renderUpcoming(st);
  renderRewards(st);
  renderCatchup(st);
  calcActivities();
  renderCharDisplay();
  renderPortraitBg();
  renderSparkline();
}

function renderUpcoming(st) {
  const el = document.getElementById('upcoming-list');
  const upcoming = REWARDS.filter(r => r.level > S.level).slice(0, 5);
  if (!upcoming.length) { el.innerHTML = `<p style="color:var(--gold);font-size:13px;">🎉 All rewards earned for your goal!</p>`; return; }
  const totalXP = xpToStartLevel(S.level) + S.xp;
  el.innerHTML = upcoming.map((r, i) => {
    const isNext = i === 0;
    const xpNeed = Math.max(0, xpToStartLevel(r.level) - totalXP);
    const imgTag = r.imgUrl
      ? `<img src="${r.imgUrl}" alt="${r.name}" style="width:30px;height:30px;object-fit:contain;image-rendering:pixelated;flex-shrink:0;" onerror="this.outerHTML='<span style=\\'font-size:1.3rem;flex-shrink:0;\\'>${r.icon}</span>'">`
      : `<span style="font-size:1.3rem;flex-shrink:0;">${r.icon}</span>`;
    return `<div class="upcoming-item ${isNext ? 'is-next' : ''}">
      ${imgTag}
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span style="font-size:12px;font-weight:600;">Lv.${r.level}</span>${badgeHTML(r.type)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.name}</div>
      </div>
      <div style="text-align:right;white-space:nowrap;flex-shrink:0;">
        <div style="font-size:12px;font-weight:600;color:${isNext ? 'var(--gold)' : 'var(--text-muted)'};">${fmt(xpNeed)} XP</div>
        ${isNext ? `<div style="font-size:10px;color:var(--text-muted);">next up</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderRewards(st) {
  renderMilestoneCounter();
  const grid   = document.getElementById('rewards-grid');
  const totalXP = xpToStartLevel(S.level) + S.xp;
  const nextLv  = REWARDS.find(r => r.level > S.level)?.level;
  grid.innerHTML = REWARDS.map(r => {
    const completed = r.level <= S.level;
    const isGoal    = r.level === S.goal;
    const isNext    = r.level === nextLv;
    const xpNeed    = Math.max(0, xpToStartLevel(r.level) - totalXP);
    const m         = TYPE_META[r.type] || TYPE_META.start;
    const shortName = r.name.length > 22 ? r.name.slice(0, 20) + '…' : r.name;
    const imgOrEmoji = r.imgUrl
      ? `<img src="${r.imgUrl}" alt="${r.name}" class="reward-img" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="reward-emoji" style="display:none;">${r.icon}</span>`
      : `<span class="reward-emoji">${r.icon}</span>`;
    return `<div class="reward-card tip-wrap ${completed ? 'completed' : 'locked'} ${isGoal ? 'is-goal' : ''} ${isNext ? 'is-next' : ''} ${r.milestone ? 'is-special' : ''}" ${r.milestone ? `onclick="openModal(${r.level})"` : ''}>
      <span class="reward-check">✓</span>
      <div style="padding:8px 0 6px;background:${m.iconBg};border-radius:6px;margin-bottom:6px;">${imgOrEmoji}</div>
      <div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:4px;">LV.${r.level}</div>
      ${badgeHTML(r.type)}
      <div style="font-size:9.5px;color:var(--text-muted);margin-top:5px;line-height:1.3;">${shortName}</div>
      ${isGoal ? `<div style="font-size:9px;margin-top:3px;color:var(--gold);">⭐ Goal</div>` : ''}
      <div class="tip-box">
        <div class="font-cinzel" style="font-size:11px;color:var(--gold);margin-bottom:5px;">Level ${r.level}</div>
        <div style="font-weight:600;margin-bottom:4px;">${r.name}</div>
        <div style="color:var(--text-muted);font-size:11px;line-height:1.5;margin-bottom:6px;">${r.desc.slice(0,100)}${r.desc.length>100?'…':''}</div>
        ${badgeHTML(r.type)}
        <div style="margin-top:7px;font-size:11px;color:${completed ? 'var(--green)' : 'var(--text-muted)'};">${completed ? '✓ Unlocked' : `${fmt(xpNeed)} XP needed`}</div>
      </div>
    </div>`;
  }).join('');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CATCH-UP SECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderCatchup(st) {
  const sec = document.getElementById('catchup-section');
  if (st.makeIt !== 'no' || !st.minXpPerDay || st.totalXP === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';

  const deficit = st.minXpPerDay - (st.xpPerDay || 0);
  setText('cu-min-xp',  fmt(st.minXpPerDay) + ' XP/day');
  setText('cu-cur-xp',  st.xpPerDay ? fmt(st.xpPerDay) + ' XP/day' : '—');
  setText('cu-deficit', '+' + fmt(Math.max(0, deficit)) + ' XP/day needed');

  const extraCC        = Math.max(0, Math.ceil(deficit / ACT_AVG.cc));
  const withFLnoBonus  = Math.max(0, Math.ceil((deficit - ACT_AVG.fl) / ACT_AVG.cc));
  const withFLandBonus = Math.max(0, Math.ceil((deficit - ACT_AVG.fl - ACT_AVG.dailyBonus) / ACT_AVG.cc));

  document.getElementById('cu-options').innerHTML = `
    <div class="catchup-option">
      ⚔ +${extraCC} CC/day <span class="catchup-xp">+${fmt(extraCC*ACT_AVG.cc)} XP</span>
    </div>
    <div class="catchup-option">
      ⚔ +1 FL (no bonus) + ${withFLnoBonus} CC
      <span class="catchup-xp">+${fmt(ACT_AVG.fl + withFLnoBonus*ACT_AVG.cc)} XP</span>
    </div>
    <div class="catchup-option" style="border-color:rgba(200,169,110,0.3);">
      ⭐ +1 FL (with daily bonus) + ${withFLandBonus} CC
      <span class="catchup-xp" style="color:var(--gold);">+${fmt(ACT_AVG.fl+ACT_AVG.dailyBonus+withFLandBonus*ACT_AVG.cc)} XP</span>
    </div>`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PORTRAIT BG / SPARKLINE / MILESTONE COUNTER / CONFETTI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderPortraitBg() {
  const bg = document.getElementById('progress-portrait-bg');
  if (!bg) return;
  if (S.charPortrait) {
    bg.style.backgroundImage = `url('${S.charPortrait}')`;
    bg.style.display = 'block';
  } else {
    bg.style.backgroundImage = '';
    bg.style.display = 'none';
  }
}

function renderMilestoneCounter() {
  const el = document.getElementById('milestone-counter-wrap');
  if (!el || !REWARDS.length) return;
  const milestones = REWARDS.filter(r => r.milestone);
  if (!milestones.length) { el.style.display = 'none'; return; }
  const unlocked = milestones.filter(r => r.level <= S.level).length;
  const total    = milestones.length;
  const pct      = Math.round((unlocked / total) * 100);
  el.style.display = 'block';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
      <span style="font-size:11px;color:var(--text-muted);letter-spacing:0.04em;">Milestones Unlocked</span>
      <span style="font-size:12px;font-weight:700;color:var(--gold);">${unlocked} / ${total}</span>
    </div>
    <div class="progress-track" style="height:5px;margin-bottom:0;">
      <div class="progress-fill" style="width:${pct}%;background:var(--gold);"></div>
    </div>`;
}

function renderSparkline() {
  const wrap = document.getElementById('xp-sparkline-section');
  if (!wrap) return;
  const hist = loadXPHist();
  if (hist.length < 2) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  const W = 400, H = 80, PAD = 8;
  const goalXP = xpToStartLevel(S.goal) || 1;
  const maxY   = Math.max(goalXP, ...hist.map(h => h.totalXP));
  const pts    = hist.map((h, i) => {
    const x = PAD + (i / (hist.length - 1)) * (W - PAD * 2);
    const y = H - PAD - (h.totalXP / maxY) * (H - PAD * 2);
    return [x, y];
  });
  const polyline = pts.map(p => p.join(',')).join(' ');
  const areaPath = `M ${pts[0][0]},${H - PAD} ` + pts.map(p => `L ${p[0]},${p[1]}`).join(' ') + ` L ${pts[pts.length-1][0]},${H - PAD} Z`;
  const goalY    = H - PAD - (goalXP / maxY) * (H - PAD * 2);
  const last     = pts[pts.length - 1];

  document.getElementById('xp-sparkline').innerHTML = `
    <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="spk-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#c8a96e" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#c8a96e" stop-opacity="0.03"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#spk-grad)"/>
      <line x1="${PAD}" y1="${goalY.toFixed(1)}" x2="${W-PAD}" y2="${goalY.toFixed(1)}" stroke="rgba(74,222,128,0.45)" stroke-width="1" stroke-dasharray="4,3"/>
      <polyline points="${polyline}" fill="none" stroke="#c8a96e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="#c8a96e"/>
    </svg>`;

  setText('spk-start-date', hist[0].date);
  setText('spk-end-date',   hist[hist.length-1].date);
  setText('spk-current-xp', fmt(hist[hist.length-1].totalXP) + ' XP');
}

let confettiActive = false;
function fireConfetti() {
  if (confettiActive) return;
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';
  const ctx     = canvas.getContext('2d');
  confettiActive = true;
  const colors  = ['#c8a96e','#f0c040','#4ade80','#5ba0e0','#a78bfa','#fb923c','#f472b6','#fff'];
  const parts   = Array.from({length: 130}, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * canvas.height - canvas.height,
    w:    5 + Math.random() * 7,
    h:    3 + Math.random() * 4,
    col:  colors[Math.floor(Math.random() * colors.length)],
    vy:   2 + Math.random() * 3,
    vx:   (Math.random() - 0.5) * 2,
    rot:  Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.15,
  }));
  const end = Date.now() + 4000;
  function frame() {
    if (Date.now() > end) { canvas.style.display = 'none'; confettiActive = false; return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
      if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ACTIVITY CALCULATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function calcActivities() {
  const cc  = Math.max(0, parseInt(document.getElementById('c-cc').value) || 0);
  const fl  = Math.max(0, parseInt(document.getElementById('c-fl').value) || 0);
  const rw  = Math.max(0, parseInt(document.getElementById('c-rw').value) || 0);
  const bonus   = fl > 0 ? ACT_AVG.dailyBonus : 0;
  const dailyXP = cc*ACT_AVG.cc + fl*ACT_AVG.fl + rw*ACT_AVG.rw + bonus;

  const st  = computeStats();
  const out = document.getElementById('calc-output');

  if (dailyXP === 0) { out.innerHTML = `<p style="font-size:12px;color:var(--text-muted);">Enter match counts above.</p>`; return; }

  const daysNeeded = st.xpRemain > 0 ? Math.ceil(st.xpRemain / dailyXP) : 0;
  const finish     = new Date(Date.now() + daysNeeded * 86_400_000);
  const minXP      = st.minXpPerDay;
  const meetsMin   = minXP ? dailyXP >= minXP : null;
  const flDailies  = st.daysLeft;

  out.innerHTML = `
    <div style="background:rgba(255,255,255,0.025);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="color:var(--text-muted);">Daily XP</span>
        <span style="font-weight:600;color:var(--gold);">${fmt(dailyXP)}</span>
      </div>
      ${bonus > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span style="color:var(--text-muted);">  ↳ incl. frontline daily bonus</span><span style="color:var(--gold);">+${fmt(bonus)}</span></div>` : ''}
      ${minXP ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="color:var(--text-muted);">Min needed/day</span>
        <span style="font-weight:600;color:${meetsMin ? 'var(--green)' : 'var(--red)'};">${fmt(minXP)} ${meetsMin ? '✓' : '✗'}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-bottom:${daysNeeded > 0 ? 5 : 0}px;">
        <span style="color:var(--text-muted);">Days to goal</span>
        <span style="font-weight:600;">${daysNeeded > 0 ? daysNeeded : '✓ Done!'}</span>
      </div>
      ${daysNeeded > 0 ? `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:var(--text-muted);">Est. finish</span>
        <span style="font-weight:600;color:var(--green);">${fmtD(finish)}</span>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin-bottom:8px;">
      <div style="color:var(--text-muted);line-height:2;">
        <div>Frontline dailies left in series: <strong style="color:var(--text);">${flDailies}</strong> (+${fmt(flDailies*ACT_AVG.dailyBonus)} potential bonus XP)</div>
        ${cc > 0 ? `<div>${fmt(cc*daysNeeded)} total CC matches</div>` : ''}
        ${fl > 0 ? `<div>${fmt(fl*daysNeeded)} total Frontline runs</div>` : ''}
        ${rw > 0 ? `<div>${fmt(rw*daysNeeded)} total Rival Wings runs</div>` : ''}
      </div>` : ''}
    </div>`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openItemModal({ name, type, icon, imgUrl, demoUrl, desc, titleText, xpHtml }) {
  const imgEl = document.getElementById('modal-img'), emojiEl = document.getElementById('modal-emoji');
  if (imgUrl) {
    imgEl.src = imgUrl; imgEl.style.display = 'block'; emojiEl.style.display = 'none';
    imgEl.onerror = () => { imgEl.style.display = 'none'; emojiEl.textContent = icon; emojiEl.style.display = 'block'; };
  } else { imgEl.style.display = 'none'; emojiEl.textContent = icon; emojiEl.style.display = 'block'; }
  setText('modal-level', titleText || '');
  setText('modal-name',  name);
  document.getElementById('modal-badge-wrap').innerHTML = badgeHTML(type);
  setText('modal-desc',  desc || '');
  const xpEl = document.getElementById('modal-xp-info');
  if (xpHtml) { xpEl.innerHTML = xpHtml; xpEl.style.display = 'block'; } else { xpEl.style.display = 'none'; }
  const demoEl = document.getElementById('modal-demo');
  demoEl.innerHTML = '';
  if (demoUrl) {
    const vid = ytId(demoUrl);
    if (vid) {
      demoEl.innerHTML = `
        <div class="demo-thumb-wrap" onclick="playYtEmbed(this,'${vid}')" title="Click to play">
          <img class="demo-thumb" src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" alt="Preview" onerror="this.parentElement.style.display='none'">
        </div>
        <a href="${demoUrl}" target="_blank" rel="noopener" class="demo-btn">▶ Watch on YouTube</a>`;
    } else {
      demoEl.innerHTML = `<a href="${demoUrl}" target="_blank" rel="noopener" class="demo-btn">▶ View Item Preview</a>`;
    }
  }
  document.getElementById('modal-card').classList.toggle('has-video', !!(demoUrl && ytId(demoUrl)));
  document.getElementById('modal-overlay').classList.add('open');
  document.addEventListener('keydown', modalEscHandler);
}

function openModal(level) {
  const r = REWARDS.find(r => r.level === level); if (!r) return;
  const totalXP   = xpToStartLevel(S.level) + S.xp;
  const xpNeed    = Math.max(0, xpToStartLevel(r.level) - totalXP);
  const completed = r.level <= S.level;
  const xpHtml    = completed
    ? `<span style="color:var(--green);">✓ Unlocked</span> — You've earned this reward!`
    : `<span style="color:var(--text-muted);">XP needed: </span><strong style="color:var(--gold);">${fmt(xpNeed)} XP</strong> <span style="color:var(--text-muted);">(reach Level ${r.level})</span>`;
  openItemModal({ name:r.name, type:r.type, icon:r.icon, imgUrl:r.imgUrl, demoUrl:r.demoUrl||null, desc:r.desc, titleText:`${CURRENT_SERIES.name} · Level ${r.level} Reward`, xpHtml });
}

function ytId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function playYtEmbed(el, vid) {
  const wrap = document.createElement('div');
  wrap.className = 'demo-iframe-wrap';
  wrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&rel=0" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen class="demo-iframe"></iframe>`;
  el.replaceWith(wrap);
}
function closeModal() {
  const iframe = document.querySelector('#modal-demo .demo-iframe');
  if (iframe) iframe.src = '';
  document.getElementById('modal-card').classList.remove('has-video');
  document.getElementById('modal-overlay').classList.remove('open');
  document.removeEventListener('keydown', modalEscHandler);
}
function maybeCloseModal(e) { if (e.target === document.getElementById('modal-overlay')) closeModal(); }
function modalEscHandler(e) { if (e.key === 'Escape') closeModal(); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PAST SEASONS (localStorage — browser-only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PSK = 'ffxiv-past-seasons';
function loadPS() { try { return JSON.parse(localStorage.getItem(PSK) || '[]'); } catch { return []; } }
function savePS(arr) { try { localStorage.setItem(PSK, JSON.stringify(arr)); } catch {} }

function recordPastSeason(num) {
  const lvInput = document.getElementById('rec-lv-' + num);
  const lv = Math.max(1, parseInt(lvInput?.value) || 0);
  if (!lv) { lvInput?.focus(); return; }
  const old = OLD_SERIES.find(s => s.num === num);
  const ms  = old?.milestones || (old?.rewards||[]).filter(r => r.milestone).map(r => ({lv:r.level,type:r.type,icon:r.icon,name:r.name,imgUrl:r.imgUrl||null,demoUrl:r.demoUrl||null,desc:r.desc||''}));
  const obtained = ms.filter(m => {
    const cb = document.getElementById(`rec-ms-${num}-${m.lv}`);
    return cb?.checked;
  }).map(m => m.lv);
  const arr = loadPS();
  arr.push({
    seriesNum:     num,
    name:          old?.name || 'Series ' + num,
    patch:         old?.patch || '',
    patchStart:    old?.start || old?.patchStart || '',
    patchEnd:      old?.end   || old?.patchEnd   || '',
    levelReached:  lv,
    xpInLevel:     0,
    goalLevel:     25,
    savedAt:       new Date().toISOString().split('T')[0],
    rewards:       old?.rewards || null,
    milestones:    ms,
    itemsObtained: obtained,
  });
  savePS(arr);
  renderDataTab();
  showToast(`Series ${num} progress saved!`);
}

function deletePastSeason(num) {
  if (!confirm(`Remove Series ${num} from history?`)) return;
  savePS(loadPS().filter(s => s.seriesNum !== num));
  renderDataTab();
}

function editPastSeason(num) {
  const arr = loadPS();
  const s   = arr.find(s => s.seriesNum === num); if (!s) return;
  const lvl = prompt(`Edit level reached for ${s.name}:`, s.levelReached);
  if (lvl === null) return;
  const parsed = Math.max(1, parseInt(lvl) || 1);
  s.levelReached = parsed; s.xpInLevel = 0;
  savePS(arr);
  renderDataTab();
}

function toggleItemObtained(seriesNum, lv) {
  const arr = loadPS();
  const s   = arr.find(s => s.seriesNum === seriesNum); if (!s) return;
  if (!s.itemsObtained) s.itemsObtained = [];
  const idx = s.itemsObtained.indexOf(lv);
  const nowCollected = idx < 0;
  if (idx >= 0) s.itemsObtained.splice(idx, 1); else s.itemsObtained.push(lv);
  savePS(arr);
  // Update card visual
  const card = document.getElementById(`ms-card-${seriesNum}-${lv}`);
  if (card) {
    card.classList.toggle('is-collected', nowCollected);
    const badge = card.querySelector('.ms-collected-badge');
    if (nowCollected && !badge) {
      const b = document.createElement('div');
      b.className = 'ms-collected-badge';
      b.textContent = '✓';
      card.insertBefore(b, card.firstChild);
    } else if (!nowCollected && badge) {
      badge.remove();
    }
    card.title = nowCollected ? `${card.dataset.name || ''} — click to mark uncollected` : `${card.dataset.name || ''} — click to mark collected`;
  }
  const ms     = s.milestones || [];
  const col    = s.itemsObtained.filter(l => ms.some(m => m.lv === l)).length;
  const summEl = document.getElementById('ps-summary-' + seriesNum);
  if (summEl) summEl.textContent = ms.length ? `${col}/${ms.length} milestones collected` : 'no milestone data';
}

function toggleRecMs(seriesNum, lv) {
  const cb   = document.getElementById(`rec-ms-${seriesNum}-${lv}`);
  if (!cb) return;
  cb.checked = !cb.checked;
  const card = document.getElementById(`ms-card-${seriesNum}-${lv}`);
  if (card) {
    card.classList.toggle('is-collected', cb.checked);
    const badge = card.querySelector('.ms-collected-badge');
    if (cb.checked && !badge) {
      const b = document.createElement('div');
      b.className = 'ms-collected-badge';
      b.textContent = '✓';
      card.insertBefore(b, card.firstChild);
    } else if (!cb.checked && badge) {
      badge.remove();
    }
  }
}

function autoRecMs(seriesNum, value) {
  const lv = parseInt(value);
  document.querySelectorAll(`[id^="rec-ms-${seriesNum}-"]`).forEach(cb => {
    const parts       = cb.id.split('-');
    const msLv        = parseInt(parts[parts.length - 1]);
    const shouldCheck = !isNaN(lv) && msLv <= lv;
    if (cb.checked === shouldCheck) return;
    cb.checked = shouldCheck;
    const card = document.getElementById(`ms-card-${seriesNum}-${msLv}`);
    if (!card) return;
    card.classList.toggle('is-collected', shouldCheck);
    const badge = card.querySelector('.ms-collected-badge');
    if (shouldCheck && !badge) {
      const b = document.createElement('div');
      b.className = 'ms-collected-badge';
      b.textContent = '✓';
      card.insertBefore(b, card.firstChild);
    } else if (!shouldCheck && badge) {
      badge.remove();
    }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  USER ACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function applyProgress() {
  const level = Math.max(1, parseInt(document.getElementById('inp-level').value) || 1);
  const xp    = Math.max(0, parseInt(document.getElementById('inp-xp').value) || 0);
  const goal  = Math.max(1, parseInt(document.getElementById('inp-goal').value) || 25);
  const us    = document.getElementById('inp-user-start').value || null;
  const cn    = document.getElementById('inp-char-name').value.trim() || null;
  // Read world from select first, fall back to custom text input
  const wSel  = document.getElementById('inp-char-world');
  const wCustom = document.getElementById('inp-char-world-custom');
  let cw = null;
  if (wSel && wSel.value && wSel.value !== '__custom__') {
    cw = wSel.value;
  } else if (wCustom && wCustom.value.trim()) {
    cw = wCustom.value.trim();
  }
  const maxXP    = xpPerLevel(level) - 1;
  const prevLevel = S.level;
  if (xp > maxXP) showToast(`XP capped at ${fmt(maxXP)} for Level ${level}`);
  S = {
    level, xp: Math.min(xp, maxXP), goal, userStart: us,
    charName: cn, charWorld: cw,
    charLodestoneId: S.charLodestoneId, charAvatar: S.charAvatar,
    charPortrait: S.charPortrait, charClass: S.charClass, charClassLevel: S.charClassLevel,
  };
  recordXPHist();
  persist(); render(); showToast('Progress updated!');
  if (level >= goal && prevLevel < goal) fireConfetti();
}

function shareURL() {
  const url = location.origin + location.pathname + '#' + encodeS(S);
  navigator.clipboard.writeText(url).then(() => showToast('Share link copied! 📋')).catch(() => prompt('Copy this link:', url));
}

function resetAll() {
  if (!confirm('Reset all progress? Character info will also be cleared.')) return;
  S = { level:1, xp:0, goal:25, userStart:null, charName:null, charWorld:null, charLodestoneId:null, charAvatar:null, charPortrait:null, charClass:null, charClassLevel:null };
  clearCharExt();
  document.getElementById('inp-level').value      = '1';
  document.getElementById('inp-xp').value         = '0';
  document.getElementById('inp-goal').value        = '25';
  document.getElementById('inp-user-start').value  = '';
  document.getElementById('inp-char-name').value   = '';
  const wSel = document.getElementById('inp-char-world');
  if (wSel) wSel.value = '';
  const wCustom = document.getElementById('inp-char-world-custom');
  if (wCustom) wCustom.value = '';
  const lookupResult = document.getElementById('char-lookup-result');
  if (lookupResult) lookupResult.innerHTML = '';
  persist(); render(); showToast('Progress reset.');
}

function clearCharacter() {
  S.charName = null; S.charWorld = null; S.charLodestoneId = null; S.charAvatar = null;
  S.charPortrait = null; S.charClass = null; S.charClassLevel = null;
  clearCharExt();
  document.getElementById('inp-char-name').value = '';
  const wSel = document.getElementById('inp-char-world');
  if (wSel) wSel.value = '';
  const wCustom = document.getElementById('inp-char-world-custom');
  if (wCustom) wCustom.value = '';
  const lookupResult = document.getElementById('char-lookup-result');
  if (lookupResult) lookupResult.innerHTML = '';
  persist(); renderCharDisplay(); renderPortraitBg();
}

function renderCharDisplay() {
  const el = document.getElementById('char-display');
  if (S.charName) {
    el.style.display = 'flex';
    const avatarEl = document.getElementById('char-avatar-img');
    if (avatarEl) {
      if (S.charAvatar) { avatarEl.src = S.charAvatar; avatarEl.style.display = 'block'; }
      else avatarEl.style.display = 'none';
    }
    setText('char-name-display', S.charName);
    setText('char-world-display', S.charWorld ? '@ ' + S.charWorld : '');
    const classEl = document.getElementById('char-class-display');
    if (classEl) {
      if (S.charClass) {
        classEl.textContent = S.charClass + (S.charClassLevel ? ' Lv.' + S.charClassLevel : '');
        classEl.style.display = 'inline';
      } else { classEl.style.display = 'none'; }
    }
    // Lodestone link — always show if ID known, else show search link
    const lodestoneEl = document.getElementById('char-lodestone-link');
    if (lodestoneEl) {
      if (S.charLodestoneId) {
        lodestoneEl.href = `https://na.finalfantasyxiv.com/lodestone/character/${S.charLodestoneId}/`;
        lodestoneEl.style.display = 'inline';
      } else {
        // Link to search page so user can find the ID manually
        const q = encodeURIComponent(S.charName);
        const w = encodeURIComponent(S.charWorld || '');
        lodestoneEl.href = `https://na.finalfantasyxiv.com/lodestone/character/?q=${q}&worldname=${w}`;
        lodestoneEl.style.display = 'inline';
      }
      lodestoneEl.textContent = '🔗 Lodestone';
    }
    // Refresh button — re-run lookup to pull fresh data and update cache
    const refreshEl = document.getElementById('char-refresh-btn');
    if (refreshEl) {
      refreshEl.style.display = 'inline-block';
      refreshEl.onclick = () => {
        // Populate name/world fields from state so lookupCharacter can read them
        const nameInput = document.getElementById('inp-char-name');
        const wSel      = document.getElementById('inp-char-world');
        if (nameInput && S.charName) nameInput.value = S.charName;
        if (wSel && S.charWorld) {
          const opts = Array.from(wSel.options).map(o => o.value);
          if (opts.includes(S.charWorld)) { wSel.value = S.charWorld; onWorldSelectChange(); }
        }
        // Open char section if collapsed
        const section = document.querySelector('.char-card-section');
        if (section && !section.classList.contains('open')) section.classList.add('open');
        lookupCharacter(true);
      };
    }
  } else {
    el.style.display = 'none';
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CHARACTER WORLD SELECT HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WORLD_DATA = {
  'NA': {
    'Aether':  ['Adamantoise','Cactuar','Faerie','Gilgamesh','Jenova','Midgardsormr','Sargatanas','Siren'],
    'Crystal': ['Balmung','Brynhildr','Coeurl','Diabolos','Goblin','Malboro','Mateus','Zalera'],
    'Dynamis': ['Cuchulainn','Halicarnassus','Maduin','Marilith','Seraph','Spriggan'],
    'Primal':  ['Behemoth','Excalibur','Exodus','Famfrit','Hyperion','Lamia','Leviathan','Ultros'],
  },
  'EU': {
    'Chaos':  ['Cerberus','Louisoix','Moogle','Omega','Phantom','Ragnarok','Shiva','Zodiark'],
    'Light':  ['Alpha','Lich','Odin','Phoenix','Raiden','Shemhazai','Twintania'],
    'Shadow': ['Innocence','Pixie','Titania','Tycoon'],
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
  const sel = document.getElementById('inp-char-world');
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
  // Custom entry option
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__'; customOpt.textContent = '— Other / Unlisted world…';
  sel.appendChild(customOpt);

  // change event handled by onWorldSelectChange() (inline onchange in HTML)
}

function syncWorldSelectFromState() {
  const sel = document.getElementById('inp-char-world');
  const customInput = document.getElementById('inp-char-world-custom');
  if (!sel || !S.charWorld) return;
  const opts = Array.from(sel.options).map(o => o.value);
  if (opts.includes(S.charWorld)) {
    sel.value = S.charWorld;
  } else {
    sel.value = '__custom__';
    if (customInput) customInput.value = S.charWorld;
  }
  onWorldSelectChange();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LODESTONE CHARACTER LOOKUP (via CORS proxy)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CHAR_CACHE_KEY = 'ffxiv-char-cache';
const CHAR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadCharCache() {
  try { return JSON.parse(localStorage.getItem(CHAR_CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveCharCache(cache) {
  try { localStorage.setItem(CHAR_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

function getWorldVal() {
  const wSel    = document.getElementById('inp-char-world');
  const wCustom = document.getElementById('inp-char-world-custom');
  if (wSel && wSel.value && wSel.value !== '__custom__') return wSel.value;
  if (wCustom && wCustom.value.trim()) return wCustom.value.trim();
  return '';
}

function onWorldSelectChange() {
  const btn = document.getElementById('btn-char-lookup');
  const hint = btn && btn.nextElementSibling;
  const hasWorld = !!getWorldVal();
  if (btn) btn.disabled = !hasWorld;
  if (hint) hint.style.display = hasWorld ? 'none' : '';
  // Also handle showing/hiding custom input (mirrors buildWorldSelect logic)
  const wSel = document.getElementById('inp-char-world');
  const customWrap = document.getElementById('char-world-custom-wrap');
  if (wSel && customWrap) {
    customWrap.style.display = (wSel.value === '__custom__') ? 'block' : 'none';
  }
}

async function lookupCharacter(forceRefresh = false) {
  const nameVal  = document.getElementById('inp-char-name').value.trim();
  const worldVal = getWorldVal();
  const resultEl = document.getElementById('char-lookup-result');

  if (!nameVal) { resultEl.innerHTML = `<span style="color:var(--text-muted);font-size:12px;">Enter a character name first.</span>`; return; }
  if (!worldVal) { resultEl.innerHTML = `<span style="color:var(--text-muted);font-size:12px;">Select a Home World first.</span>`; return; }

  const cacheKey = `${nameVal.toLowerCase()}|${worldVal.toLowerCase()}`;
  if (!forceRefresh) {
    const cache = loadCharCache();
    const entry = cache[cacheKey];
    if (entry && (Date.now() - entry.cachedAt < CHAR_CACHE_TTL)) {
      showCharResult(resultEl, entry);
      return;
    }
  }

  resultEl.innerHTML = `<span class="lookup-spinner"></span><span style="color:var(--text-muted);">Searching Lodestone…</span>`;

  try {
    const searchUrl = `https://na.finalfantasyxiv.com/lodestone/character/?q=${encodeURIComponent(nameVal)}&worldname=${encodeURIComponent(worldVal)}`;
    const resp = await fetchViaProxy(searchUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');

    let linkEl = null, lodestoneId = null;
    for (const a of doc.querySelectorAll('a[href*="/lodestone/character/"]')) {
      const m = a.getAttribute('href').match(/\/character\/(\d+)\//);
      if (m) { linkEl = a; lodestoneId = m[1]; break; }
    }
    if (!linkEl) {
      const lodestoneSearchUrl = `https://na.finalfantasyxiv.com/lodestone/character/?q=${encodeURIComponent(nameVal)}&worldname=${encodeURIComponent(worldVal)}`;
      resultEl.innerHTML = `<span style="color:var(--text-muted);">No characters found for "${nameVal}" on ${worldVal}. <a href="${lodestoneSearchUrl}" target="_blank" rel="noopener" style="color:var(--blue);">Search on Lodestone</a></span>`;
      return;
    }

    const avatarEl  = linkEl.querySelector('img') || doc.querySelector('.entry__chara__face img');
    const avatarUrl = avatarEl ? (avatarEl.getAttribute('src') || '') : '';
    const nameEl    = doc.querySelector('.entry__chara__name') || doc.querySelector('.entry__name');
    const charName  = nameEl ? nameEl.textContent.trim() : nameVal;
    const worldEl   = doc.querySelector('.entry__world') || doc.querySelector('.entry__world-dcgroup--world');
    const charWorld = worldEl ? worldEl.textContent.trim().split(/\s*[\n[]/)[0].trim() : worldVal;

    const entry = { name: charName, world: charWorld, lodestoneId, avatarUrl, cachedAt: Date.now() };

    try {
      const charResp = await fetchViaProxy('https://na.finalfantasyxiv.com/lodestone/character/' + lodestoneId + '/');
      if (charResp.ok) {
        const charHtml = await charResp.text();
        const charDoc  = parser.parseFromString(charHtml, 'text/html');
        const portraitEl = charDoc.querySelector('.character__detail__image img')
          || charDoc.querySelector('img[src*="img2.finalfantasyxiv.com"][src*="_gc"]')
          || charDoc.querySelector('.character-block__portrait img')
          || charDoc.querySelector('img[src*="/character/"]');
        if (portraitEl) entry.portrait = portraitEl.getAttribute('src') || null;
        const soulMatch = charHtml.match(/Soul of the ([A-Z][A-Za-z ]{2,28}?)(?=["<&\n])/);
        if (soulMatch) entry.activeClass = soulMatch[1].trim();
        const classData = charDoc.querySelector('.character__class__data, .character__level__main');
        if (classData) { const lm = classData.textContent.match(/(\d+)/); if (lm) entry.activeClassLevel = parseInt(lm[1]); }
      }
    } catch { /* portrait is best-effort */ }

    const cache = loadCharCache();
    cache[cacheKey] = entry;
    saveCharCache(cache);
    showCharResult(resultEl, entry);
  } catch (e) {
    resultEl.innerHTML = `<span style="color:var(--red);font-size:12px;">⚠ Lookup failed: ${e.message} — try pasting your character URL in the field above.</span>`;
  }
}

async function applyLodestoneUrl() {
  const input    = document.getElementById('inp-lodestone-url');
  const resultEl = document.getElementById('char-lookup-result');
  if (!input) return;
  const val     = input.value.trim();
  const idMatch = val.match(/\/character\/(\d+)/) || (val.match(/^\d+$/) ? [null, val] : null);
  if (!idMatch) { showToast('Paste your full Lodestone character URL'); return; }
  const lodestoneId = idMatch[1];
  const nameVal     = document.getElementById('inp-char-name').value.trim();
  const worldVal    = getWorldVal();
  resultEl.innerHTML = `<span class="lookup-spinner"></span><span style="color:var(--text-muted);">Loading character…</span>`;
  try {
    const charResp = await fetchViaProxy('https://na.finalfantasyxiv.com/lodestone/character/' + lodestoneId + '/');
    if (!charResp.ok) throw new Error('HTTP ' + charResp.status);
    const charHtml = await charResp.text();
    const charDoc  = new DOMParser().parseFromString(charHtml, 'text/html');
    const nameEl   = charDoc.querySelector('.frame__chara__name') || charDoc.querySelector('.character__name');
    const worldEl  = charDoc.querySelector('.frame__chara__world') || charDoc.querySelector('.character__world');
    const charName  = (nameEl && nameEl.textContent.trim()) || nameVal || '(Unknown)';
    const charWorld = (worldEl && worldEl.textContent.trim().split(/\s*[\n[]/)[0].trim()) || worldVal || '';
    const entry = { name: charName, world: charWorld, lodestoneId, avatarUrl: '', cachedAt: Date.now() };
    const portraitEl = charDoc.querySelector('.character__detail__image img')
      || charDoc.querySelector('img[src*="img2.finalfantasyxiv.com"][src*="_gc"]')
      || charDoc.querySelector('.character-block__portrait img');
    if (portraitEl) entry.portrait = portraitEl.getAttribute('src') || null;
    const avatarEl = charDoc.querySelector('.character__detail__face img') || charDoc.querySelector('.js__c_face img');
    if (avatarEl) entry.avatarUrl = avatarEl.getAttribute('src') || '';
    const soulMatch = charHtml.match(/Soul of the ([A-Z][A-Za-z ]{2,28}?)(?=["<&\n])/);
    if (soulMatch) entry.activeClass = soulMatch[1].trim();
    const cacheKey = `${(nameVal || charName).toLowerCase()}|${(worldVal || charWorld).toLowerCase()}`;
    const cache = loadCharCache();
    cache[cacheKey] = entry;
    saveCharCache(cache);
    showCharResult(resultEl, entry);
  } catch (e) {
    // Proxies failed — create a minimal entry from just the ID and whatever the user typed
    const charName  = nameVal || '(Unknown)';
    const charWorld = worldVal || '';
    const entry = { name: charName, world: charWorld, lodestoneId, avatarUrl: '', cachedAt: Date.now() };
    const cacheKey = `${charName.toLowerCase()}|${charWorld.toLowerCase()}`;
    const cache = loadCharCache();
    cache[cacheKey] = entry;
    saveCharCache(cache);
    showCharResult(resultEl, entry);
    showToast('Portrait unavailable — character linked by ID only.');
  }
}

function showCharResult(resultEl, entry) {
  const lodestoneUrl = `https://na.finalfantasyxiv.com/lodestone/character/${entry.lodestoneId}/`;
  const safeName  = entry.name.replace(/'/g, "\\'");
  const safeWorld = entry.world.replace(/'/g, "\\'");
  const safeAvatar = (entry.avatarUrl || '').replace(/'/g, "\\'");
  resultEl.innerHTML = `
    <div class="char-result-card">
      ${entry.avatarUrl ? `<img src="${entry.avatarUrl}" alt="${entry.name}" onerror="this.style.display='none'">` : ''}
      <div class="char-result-info">
        <div class="char-result-name">${entry.name}</div>
        <div class="char-result-server">${entry.world}</div>
        <a href="${lodestoneUrl}" target="_blank" rel="noopener">🔗 Lodestone Profile</a>
      </div>
      <button class="btn btn-gold" style="padding:5px 12px;font-size:12px;" onclick="applyLookupResult('${safeName}','${safeWorld}','${entry.lodestoneId}','${safeAvatar}')">Use</button>
    </div>`;
}

function applyLookupResult(name, server, lodestoneId, avatarUrl) {
  // Update name and world fields
  document.getElementById('inp-char-name').value = name;
  const wSel = document.getElementById('inp-char-world');
  const wCustom = document.getElementById('inp-char-world-custom');
  const wWrap   = document.getElementById('char-world-custom-wrap');
  // Try to match server to select
  if (wSel) {
    const opts = Array.from(wSel.options).map(o => o.value);
    // Extract just world name (server may be "WorldName [DC]" or just "WorldName")
    const worldOnly = server.replace(/\s*\[.*\]/, '').trim();
    if (opts.includes(worldOnly)) {
      wSel.value = worldOnly;
      if (wWrap) wWrap.style.display = 'none';
    } else if (opts.includes(server)) {
      wSel.value = server;
      if (wWrap) wWrap.style.display = 'none';
    } else {
      wSel.value = '__custom__';
      if (wCustom) wCustom.value = server;
      if (wWrap) wWrap.style.display = 'block';
    }
  }
  S.charName        = name;
  S.charWorld       = server || null;
  S.charLodestoneId = lodestoneId;
  S.charAvatar      = avatarUrl || null;
  // Pull portrait/class from char cache if available
  const cache = loadCharCache();
  const cacheKey = (name + '|' + (server || '')).toLowerCase();
  const cached = cache[cacheKey] || Object.values(cache).find(e => e.lodestoneId === lodestoneId);
  if (cached) {
    S.charPortrait    = cached.portrait || null;
    S.charClass       = cached.activeClass || null;
    S.charClassLevel  = cached.activeClassLevel || null;
  }
  saveCharExt();
  persist();
  renderCharDisplay();
  renderPortraitBg();
  showToast(`Character set: ${name}`);
  // If portrait or avatar are still missing, fetch them now (char page fetch may have failed during lookup)
  if (!S.charPortrait || !S.charAvatar) fetchPortraitByLodestoneId(lodestoneId);
  // Collapse the lookup section after successful use
  const charSection = document.querySelector('.char-card-section');
  if (charSection) charSection.classList.remove('open');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  THEME
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setTheme(name) {
  document.documentElement.setAttribute('data-theme', name === 'dusk' ? '' : name);
  document.querySelectorAll('.theme-swatch').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === name));
  try { localStorage.setItem('ffxiv-theme', name); } catch {}
}
function loadTheme() {
  try {
    const saved = localStorage.getItem('ffxiv-theme');
    if (saved) { setTheme(saved); return; }
    // No saved preference — detect from OS
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'midnight' : 'dawn');
  } catch { setTheme('dusk'); }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  JSON LOADER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function loadData() {
  const errEl = document.getElementById('data-load-error');
  try {
    const r = await fetch('./data/series.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (Array.isArray(data.levelThresholds)) LEVEL_THRESHOLDS = data.levelThresholds;
    if (data.extraLevelCost) EXTRA_LEVEL_COST = data.extraLevelCost;
    const cur = data.series?.find(s => s.current);
    if (cur) {
      if (cur.rewards) REWARDS = cur.rewards;
      CURRENT_SERIES = { num:cur.num, name:cur.name||'Series '+cur.num, patch:cur.patch||'', patchStart:cur.patchStart, patchEnd:cur.patchEnd };
      setText('banner-series-name', CURRENT_SERIES.name);
      setText('banner-patch', 'Patch ' + CURRENT_SERIES.patch);
      const rt = document.getElementById('rewards-title');
      if (rt) rt.textContent = CURRENT_SERIES.name + ' Rewards';
    }
    const old = data.series?.filter(s => !s.current) || [];
    if (old.length) OLD_SERIES = old.map(s => {
      const ms = (s.rewards||[]).filter(r => r.milestone).map(r => ({lv:r.level,type:r.type,icon:r.icon,name:r.name,imgUrl:r.imgUrl||null,demoUrl:r.demoUrl||null,desc:r.desc||''}));
      return { num:s.num, name:s.name||'Series '+s.num, patch:s.patch, start:s.patchStart, end:s.patchEnd, rewards:s.rewards||null, milestones:ms };
    });
    if (errEl) errEl.style.display = 'none';
  } catch (e) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Could not load series data. Make sure you are serving this page over HTTP (not file://).'; }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AUTO-ARCHIVE (series transition detection)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkSeriesTransition() {
  const stored = parseInt(localStorage.getItem('ffxiv-series-num') || '0');
  localStorage.setItem('ffxiv-series-num', String(CURRENT_SERIES.num));
  if (stored <= 0 || stored >= CURRENT_SERIES.num) return;
  const arr     = loadPS();
  const already = arr.find(s => s.seriesNum === stored);
  if (already) return;
  if (S.level <= 1 && S.xp === 0) return;
  const old   = OLD_SERIES.find(s => s.num === stored);
  const entry = {
    seriesNum:     stored,
    name:          old?.name || 'Series ' + stored,
    patch:         old?.patch || '',
    patchStart:    old?.start || '',
    patchEnd:      old?.end || '',
    levelReached:  S.level,
    xpInLevel:     S.xp,
    goalLevel:     S.goal,
    savedAt:       new Date().toISOString().split('T')[0],
    auto:          true,
    rewards:       old?.rewards || null,
    milestones:    old?.milestones || [],
    itemsObtained: [],
  };
  arr.push(entry);
  savePS(arr);
  S = { level:1, xp:0, goal:25, userStart:null, charName:S.charName, charWorld:S.charWorld, charLodestoneId:S.charLodestoneId, charAvatar:S.charAvatar };
  document.getElementById('inp-level').value     = '1';
  document.getElementById('inp-xp').value        = '0';
  document.getElementById('inp-goal').value       = '25';
  document.getElementById('inp-user-start').value = '';
  persist();
  showToast(`🎉 Series ${CURRENT_SERIES.num} has begun! Series ${stored} auto-archived.`);
}

function checkPatchEndExpiry() {
  if (!CURRENT_SERIES.patchEnd) return;
  const endMs = new Date(CURRENT_SERIES.patchEnd + 'T12:00:00').getTime();
  if (Date.now() <= endMs) return;
  const arr = loadPS();
  if (arr.find(p => p.seriesNum === CURRENT_SERIES.num)) return;
  if (S.level <= 1 && S.xp === 0) return;
  const ms = REWARDS.filter(r => r.milestone).map(r => ({lv:r.level,type:r.type,icon:r.icon,name:r.name,imgUrl:r.imgUrl||null,demoUrl:r.demoUrl||null,desc:r.desc||''}));
  arr.push({ seriesNum:CURRENT_SERIES.num, name:CURRENT_SERIES.name, patch:CURRENT_SERIES.patch, patchStart:CURRENT_SERIES.patchStart, patchEnd:CURRENT_SERIES.patchEnd, levelReached:S.level, xpInLevel:S.xp, goalLevel:S.goal, savedAt:new Date().toISOString().split('T')[0], auto:true, rewards:REWARDS, milestones:ms, itemsObtained:[] });
  savePS(arr);
  showToast(`${CURRENT_SERIES.name} has ended — progress auto-archived.`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TAB SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function switchTab(name) {
  ['tracker', 'data'].forEach(t => {
    document.getElementById('tab-' + t + '-content').style.display = t === name ? 'block' : 'none';
    document.getElementById('tab-btn-' + t).classList.toggle('active', t === name);
  });
  if (name === 'data') renderDataTab();
}

let DATA_MODAL_CACHE = [];

function renderDataTab() {
  const el = document.getElementById('data-series-list');
  if (!el) return;
  DATA_MODAL_CACHE = [];
  const now = Date.now();
  const curMilestones = REWARDS.filter(r => r.milestone).map(r => ({lv:r.level,type:r.type,icon:r.icon,name:r.name,imgUrl:r.imgUrl||null,demoUrl:r.demoUrl||null,desc:r.desc||''}));
  const curEntry = { num:CURRENT_SERIES.num, name:CURRENT_SERIES.name, patch:CURRENT_SERIES.patch, start:CURRENT_SERIES.patchStart, end:CURRENT_SERIES.patchEnd, rewards:null, milestones:curMilestones };
  el.innerHTML = [renderDataCard(curEntry, true, now), ...OLD_SERIES.map(s => renderDataCard(s, false, now))].join('');

  // Completion stats + streak
  const ps = loadPS();
  const recorded  = ps.length;
  const cleared   = ps.filter(e => e.levelReached >= (e.goalLevel || 25)).length;
  let streak = 0;
  for (const s of [...OLD_SERIES].sort((a,b) => b.num - a.num)) {
    const entry = ps.find(p => p.seriesNum === s.num);
    if (entry && entry.levelReached >= (entry.goalLevel || 25)) { streak++; }
    else { break; }
  }
  const streakEl = document.getElementById('streak-display');
  if (streakEl) {
    if (recorded === 0) { streakEl.style.display = 'none'; return; }
    streakEl.style.display = 'block';
    const total = OLD_SERIES.length;
    const clearRate = recorded > 0 ? Math.round((cleared / recorded) * 100) : 0;
    const streakPill = streak >= 2
      ? `<span class="stat-pill streak-pill">🔥 ${streak}-Series Streak</span>`
      : '';
    streakEl.innerHTML = `
      <div class="series-stats-bar">
        <span class="stat-pill" style="color:var(--green);">✓ ${cleared} Cleared</span>
        <span class="stat-pill" style="color:var(--text-muted);">${recorded} Recorded</span>
        <span class="stat-pill" style="color:var(--gold);">${clearRate}% Clear Rate</span>
        ${streakPill}
      </div>`;
  }
}

function openDataModal(cacheIdx) {
  const m = DATA_MODAL_CACHE[cacheIdx]; if (!m) return;
  openItemModal({ name:m.name, type:m.type, icon:m.icon, imgUrl:m.imgUrl, demoUrl:m.demoUrl, desc:m.desc||'', titleText:m._seriesLabel, xpHtml:null });
}

function renderDataCard(s, isCurrent, now) {
  const start    = s.start || s.patchStart;
  const end      = s.end   || s.patchEnd;
  const startMs  = new Date(start + 'T12:00:00').getTime();
  const endMs    = new Date(end + 'T12:00:00').getTime();
  const totalDays = Math.round((endMs - startMs) / 86_400_000);
  const isPast    = endMs < now;
  const barPct    = isPast ? 100 : (startMs > now ? 0 : Math.min(100, ((now - startMs) / (endMs - startMs)) * 100));
  const daysLeft  = isPast ? 0 : Math.ceil((endMs - now) / 86_400_000);

  const statusBadge = isCurrent
    ? `<span style="background:rgba(74,222,128,0.18);color:var(--green);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;letter-spacing:0.05em;">ACTIVE</span>`
    : `<span style="background:rgba(107,122,150,0.1);color:var(--text-muted);border-radius:4px;padding:2px 8px;font-size:10px;letter-spacing:0.05em;">ENDED</span>`;

  const seriesLabel = (s.name || 'Series ' + s.num);
  const milestones = s.rewards
    ? s.rewards.filter(r => r.milestone).map(r => ({lv:r.level,type:r.type,icon:r.icon,name:r.name,imgUrl:r.imgUrl||null,demoUrl:r.demoUrl||null,desc:r.desc||''}))
    : (s.milestones || []);

  // For past series, get obtained state upfront so cards can show collected overlay
  let psEntry = null, obtained = [];
  if (!isCurrent) {
    psEntry = loadPS().find(p => p.seriesNum === s.num);
    obtained = psEntry ? (psEntry.itemsObtained || []) : [];
  }

  const mCardHtml = milestones.map(m => {
    const tm  = TYPE_META[m.type] || TYPE_META.crystals;
    const img = m.imgUrl
      ? `<img src="${m.imgUrl}" alt="${m.name}" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated;display:block;margin:0 auto;" onerror="this.outerHTML='<span style=\\'font-size:1.5rem;display:block;text-align:center;\\'>${m.icon}</span>'">`
      : `<span style="font-size:1.5rem;display:block;text-align:center;">${m.icon}</span>`;
    const shortName = m.name.length > 30 ? m.name.slice(0, 28) + '…' : m.name;
    const idx = DATA_MODAL_CACHE.length;
    DATA_MODAL_CACHE.push({ ...m, _seriesLabel: `${seriesLabel} · Level ${m.lv}` });
    const hasDetail = m.imgUrl || m.demoUrl || m.desc;
    const safeName  = m.name.replace(/"/g, '&quot;');

    let cardAttrs = '', collectedBadge = '';
    if (isCurrent) {
      // Current series: click opens detail modal
      cardAttrs = hasDetail
        ? `onclick="openDataModal(${idx})" style="cursor:pointer;" title="${safeName}"`
        : '';
    } else if (psEntry) {
      // Recorded past season: click toggles collected
      const isCollected = obtained.includes(m.lv);
      collectedBadge = isCollected ? `<div class="ms-collected-badge">✓</div>` : '';
      const titleText = isCollected ? `${safeName} — click to mark uncollected` : `${safeName} — click to mark collected`;
      cardAttrs = `id="ms-card-${s.num}-${m.lv}" data-name="${safeName}" onclick="toggleItemObtained(${s.num},${m.lv})" style="cursor:pointer;" title="${titleText}"`;
      if (isCollected) cardAttrs += ` class="data-milestone is-milestone is-collected"`;
    } else {
      // Record Your Progress: click pre-selects milestone
      cardAttrs = `id="ms-card-${s.num}-${m.lv}" data-name="${safeName}" onclick="toggleRecMs(${s.num},${m.lv})" style="cursor:pointer;" title="${safeName} — click to mark collected"`;
    }

    // Preview button — full-width, in-flow at bottom of card, only for past-series with demoUrl
    const previewBtn = (!isCurrent && m.demoUrl)
      ? `<button class="ms-preview-btn" onclick="openDataModal(${idx});event.stopPropagation();" title="Watch preview">▶ Preview</button>`
      : '';

    const openTag = (psEntry && obtained.includes(m.lv))
      ? `<div ${cardAttrs}>`
      : `<div class="data-milestone is-milestone" ${cardAttrs}>`;

    return `${openTag}
      ${collectedBadge}
      <div style="margin-bottom:6px;">${img}</div>
      <div style="font-size:10px;font-weight:700;color:var(--gold);margin-bottom:3px;">LV.${m.lv}</div>
      <div class="badge ${tm.badgeClass}" style="font-size:9px;padding:1px 5px;margin-bottom:4px;">${tm.label}</div>
      <div style="font-size:9px;color:var(--text-muted);line-height:1.3;margin-bottom:${previewBtn ? '5px' : '0'};">${shortName}</div>
      ${hasDetail && isCurrent ? `<div style="font-size:8px;color:var(--text-muted);margin-top:3px;">click for details</div>` : ''}
      ${previewBtn}
    </div>`;
  }).join('');

  const rewardsHtml = milestones.length
    ? `<div style="font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Milestones</div>
       <div style="display:flex;gap:8px;flex-wrap:wrap;">${mCardHtml}</div>`
    : '';

  let personalHtml = '';
  if (!isCurrent) {
    if (psEntry) {
      const collected = obtained.filter(lv => milestones.some(m => m.lv === lv)).length;
      const total     = milestones.length;
      const cleared   = psEntry.levelReached >= (psEntry.goalLevel || 25);
      const summText  = total ? `${collected}/${total} milestones collected` : 'no milestone data';
      personalHtml = `
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <span style="font-size:12px;">
              Reached <strong style="color:${cleared ? 'var(--green)' : 'var(--text)'};">Level ${psEntry.levelReached}</strong>
              ${cleared ? ' <span style="color:var(--green);font-size:11px;">✓ Cleared!</span>' : ''}
              &nbsp;·&nbsp;
              <span id="ps-summary-${s.num}" style="color:var(--text-muted);font-size:11px;">${summText}</span>
            </span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-ghost" onclick="editPastSeason(${s.num})" style="padding:3px 8px;font-size:11px;" title="Edit level reached">✏</button>
              <button class="btn btn-ghost" onclick="deletePastSeason(${s.num})" style="padding:3px 8px;font-size:11px;" title="Remove entry">✕</button>
            </div>
          </div>
          ${milestones.length ? `<div style="font-size:10px;color:var(--text-muted);margin-top:8px;">Click a milestone above to toggle collected.</div>` : ''}
        </div>`;
    } else {
      // Hidden checkboxes feed recordPastSeason(); cards are the visible toggle UI
      const hiddenCbs = milestones.map(m =>
        `<input type="checkbox" id="rec-ms-${s.num}-${m.lv}" style="display:none;">`
      ).join('');
      const goalLv = s.goalLevel || 25;
      personalHtml = `
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;">Record Your Progress</div>
          ${hiddenCbs}
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
            <label style="font-size:12px;color:var(--text-muted);">Level reached</label>
            <input type="number" id="rec-lv-${s.num}" min="1" max="50" placeholder="e.g. ${goalLv}"
              style="width:72px;padding:5px 8px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--input-text);font-size:13px;"
              oninput="autoRecMs(${s.num},this.value)"
              onkeydown="if(event.key==='Enter')recordPastSeason(${s.num})">
            <button class="btn btn-gold" onclick="recordPastSeason(${s.num})" style="padding:5px 14px;font-size:12px;">Save</button>
          </div>
          ${milestones.length ? `<div style="font-size:10px;color:var(--text-muted);">Click milestone cards above to mark which you collected.</div>` : ''}
        </div>`;
    }
  }

  return `<div class="data-series-card ${isCurrent ? 'is-current' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="font-cinzel" style="color:var(--gold);font-size:0.92rem;font-weight:600;">${s.name || 'Series ' + s.num}</span>
        <span style="color:var(--text-muted);font-size:0.78rem;">Patch ${s.patch||''}</span>
        ${statusBadge}
      </div>
      <div style="font-size:0.78rem;color:var(--text-muted);">
        ${fmtDS(start)} → ${fmtDS(end)}
        <span style="margin-left:8px;opacity:0.65;">${totalDays} days</span>
      </div>
    </div>
    <div class="progress-track thin" style="margin-bottom:6px;">
      <div class="progress-fill pf-purple" style="width:${barPct.toFixed(1)}%"></div>
    </div>
    <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:${rewardsHtml ? 12 : 0}px;">
      ${isPast ? 'Series concluded' : `${barPct.toFixed(1)}% of series elapsed · ${daysLeft} days remaining`}
    </div>
    ${rewardsHtml}
    ${personalHtml}
  </div>`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function setW(id, p) { const e = document.getElementById(id); if (e) e.style.width = p + '%'; }
function showToast(msg) { const e = document.getElementById('toast'); e.textContent = msg; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), 2600); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INIT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

window.addEventListener('load', async () => {
  loadTheme();
  try { localStorage.removeItem('ffxiv-icon-cache'); } catch {}
  buildWorldSelect();

  const saved = loadPersisted();
  if (saved) {
    S = saved;
    document.getElementById('inp-level').value     = S.level;
    document.getElementById('inp-xp').value        = S.xp;
    document.getElementById('inp-goal').value       = S.goal;
    document.getElementById('inp-user-start').value = S.userStart || '';
    document.getElementById('inp-char-name').value  = S.charName || '';
    syncWorldSelectFromState();
    // Restore portrait/class from extended localStorage cache
    const ext = loadCharExt();
    if (ext && ext.lodestoneId && ext.lodestoneId === S.charLodestoneId) {
      S.charPortrait    = ext.portrait || null;
      S.charAvatar      = ext.avatar   || S.charAvatar || null;
      S.charClass       = ext.cls      || null;
      S.charClassLevel  = ext.clsLv    || null;
    }
    // If portrait or avatar are missing (e.g. share link on a new device), fetch them silently
    if (S.charLodestoneId && (!S.charPortrait || !S.charAvatar)) {
      fetchPortraitByLodestoneId(S.charLodestoneId);
    }
  }

  await loadData();
  checkSeriesTransition();
  checkPatchEndExpiry();
  render();

  document.querySelectorAll('#inp-level,#inp-xp,#inp-goal,#inp-user-start,#inp-char-name')
    .forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') applyProgress(); }));
  const wSel = document.getElementById('inp-char-world');
  if (wSel) wSel.addEventListener('keydown', e => { if (e.key === 'Enter') applyProgress(); });
  const wCustom = document.getElementById('inp-char-world-custom');
  if (wCustom) wCustom.addEventListener('keydown', e => { if (e.key === 'Enter') applyProgress(); });
  document.querySelectorAll('#c-cc,#c-fl,#c-rw').forEach(el => el.addEventListener('input', calcActivities));

  const lodestoneUrlInput = document.getElementById('inp-lodestone-url');
  if (lodestoneUrlInput) lodestoneUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyLodestoneUrl(); });

  // Character section collapse/expand toggle
  const charHeader = document.querySelector('.char-card-section .char-card-header');
  if (charHeader) {
    charHeader.addEventListener('click', () => {
      charHeader.closest('.char-card-section').classList.toggle('open');
    });
  }
});
