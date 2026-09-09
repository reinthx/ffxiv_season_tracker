// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SHARED UTILITIES — loaded by both series and moogle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── HTML escaping ──────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── CORS proxy ─────────────────────────────────────────
const CORS_PROXIES = [
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
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

// ── World data (canonical list) ────────────────────────
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

// Build a world <select> from WORLD_DATA. selectId = the element's id.
function buildWorldSelect(selectId) {
  const sel = document.getElementById(selectId);
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

// ── Lodestone HTML parser ──────────────────────────────
function parseCharFromDoc(html, doc) {
  const portraitEl = doc.querySelector('.js__image_popup > img')
    || doc.querySelector('.character__detail__image img')
    || doc.querySelector('img[src*="img2.finalfantasyxiv.com"][src*="_gc"]')
    || doc.querySelector('.character-block__portrait img');
  const portrait = portraitEl ? (portraitEl.getAttribute('src') || null) : null;
  const soulMatch = html.match(/Soul of the ([A-Z][A-Za-z ]{2,28}?)(?=["<&\n])/);
  const activeClass = soulMatch ? soulMatch[1].trim() : null;
  const classDataEl = doc.querySelector('.character__class__data > p:nth-child(1)');
  const lvMatch = classDataEl ? classDataEl.textContent.match(/LEVEL\s*(\d+)/i) : null;
  const activeClassLevel = lvMatch ? parseInt(lvMatch[1]) : null;
  const titleEl = doc.querySelector('.frame__chara__title');
  const charTitle = titleEl ? (titleEl.textContent.trim() || null) : null;
  const fcEl = doc.querySelector('.character__freecompany__name > h4:nth-child(2) > a:nth-child(1)');
  const freeCompany = fcEl ? (fcEl.textContent.trim() || null) : null;
  return { portrait, activeClass, activeClassLevel, charTitle, freeCompany };
}

// ── Theme ──────────────────────────────────────────────
function setTheme(name) {
  document.documentElement.setAttribute('data-theme', name === 'dusk' ? '' : name);
  document.querySelectorAll('.theme-swatch').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === name));
  try { localStorage.setItem('ffxiv-theme', name); } catch {}
}
function loadTheme() {
  try {
    const saved = localStorage.getItem('ffxiv-theme');
    if (saved) { setTheme(saved); return; }
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'dawn');
  } catch { setTheme('dusk'); }
}

// ── DOM / formatting helpers ───────────────────────────
function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function setW(id, p)    { const e = document.getElementById(id); if (e) e.style.width = p + '%'; }
function cap(s)          { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''; }
function fmtDate(d)      { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
function showToast(msg)  { const e = document.getElementById('toast'); if (!e) return; e.textContent = msg; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), 2600); }

// ── Build version stamp ─────────────────────────────────
// scripts/build.js writes docs/data/version.json (gitignored) with the commit
// the bundle was built from. Surface it so the live site can always be matched
// back to a commit. Hidden when the file is absent (e.g. unbuilt checkout).
fetch('/data/version.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(v => {
  const el = document.getElementById('site-version');
  if (!el || !v || !v.commit) return;
  const when = v.builtAt ? new Date(v.builtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const short = v.short || String(v.commit).slice(0, 7);
  el.innerHTML = `build <a href="https://github.com/reinthx/ffxiv_season_tracker/commit/${v.commit}" target="_blank" rel="noopener" style="color:inherit;">${short}</a>${when ? ' · ' + when : ''}`;
  el.style.display = 'block';
}).catch(() => {});
