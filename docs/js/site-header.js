// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SHARED SITE HEADER — theme dropdown with bubble + name
//  Include after shared.js on every page, with:
//    <div id="header-theme-controls"></div>
//  Single source of truth for theme picking: add future themes to
//  the THEMES array below only. setTheme() in shared.js calls
//  window.syncThemeDrop() to keep the control in sync.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(function () {
  const THEMES = [
    { id: 'dusk',     label: 'Dusk',          sw: 'linear-gradient(135deg,#080b10,#10141c)', border: '#c8a96e' },
    { id: 'midnight', label: 'Midnight',      sw: 'linear-gradient(135deg,#050505,#0c0c10)', border: '#f0c040' },
    { id: 'dawn',     label: 'Dawn (light)',  sw: 'linear-gradient(135deg,#f0ead8,#fffcf4)', border: '#8b6514' },
    { id: 'aether',   label: 'Aether',        sw: 'linear-gradient(135deg,#030c18,#071628)', border: '#38cce0' },
    { id: 'arr',      label: 'ARR',           sw: 'linear-gradient(135deg,#0d0808,#3a1a1e)', border: '#e05a4e' },
    { id: 'hw',       label: 'Heavensward',   sw: 'linear-gradient(135deg,#060c14,#1e324a)', border: '#7fb8e8' },
    { id: 'sb',       label: 'Stormblood',    sw: 'linear-gradient(135deg,#100805,#42271b)', border: '#f0643c' },
    { id: 'shb',      label: 'Shadowbringers', sw: 'linear-gradient(135deg,#090812,#2b2344)', border: '#a78bfa' },
    { id: 'ew',       label: 'Endwalker',     sw: 'linear-gradient(135deg,#040816,#1c2a52)', border: '#6fa8ff' },
    { id: 'dt',       label: 'Dawntrail',     sw: 'linear-gradient(135deg,#03100d,#173d33)', border: '#2dd4a8' },
    { id: 'evercold', label: 'Evercold',      sw: 'linear-gradient(135deg,#040e14,#1a3a4c)', border: '#8ae8ff' },
  ];

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'dusk';
  }

  function dot(t, size) {
    return `<span style="width:${size || 14}px; height:${size || 14}px; border-radius:50%; flex-shrink:0; ` +
      `background:${t.sw}; border:1px solid ${t.border}; display:inline-block;"></span>`;
  }

  function renderHeaderTheme() {
    const el = document.getElementById('header-theme-controls');
    if (!el) return;
    const cur = THEMES.find(t => t.id === current()) || THEMES[0];
    el.innerHTML =
      `<span style="font-size:10px; color:var(--text-muted); letter-spacing:0.05em; text-transform:uppercase;">Theme</span>` +
      `<div class="theme-drop" id="theme-drop" style="position:relative;">` +
        `<button onclick="toggleThemeDrop(event)" title="Theme: ${cur.label}" ` +
        `style="display:inline-flex; align-items:center; gap:7px; padding:4px 10px 4px 6px; border-radius:8px; ` +
        `background:var(--input-bg); color:var(--input-text); border:1px solid var(--border); font-family:inherit; ` +
        `font-size:11px; font-weight:600; cursor:pointer;">${dot(cur)}${cur.label}<span style="font-size:9px; color:var(--text-muted);">▾</span></button>` +
        `<div id="theme-drop-menu" style="display:none; position:absolute; top:32px; right:0; z-index:500; ` +
        `background:var(--card); border:1px solid var(--border); border-radius:10px; padding:6px; min-width:160px; ` +
        `max-height:320px; overflow-y:auto; ` +
        `box-shadow:0 8px 32px rgba(0,0,0,0.45);">` +
          THEMES.map(t =>
            `<div onclick="setTheme('${t.id}')" ` +
            `style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:7px; cursor:pointer; font-size:12px; ` +
            `${t.id === cur.id ? 'background:var(--gold-dim); font-weight:700;' : 'font-weight:400;'}" ` +
            `onmouseover="this.style.background='var(--gold-dim)'" onmouseout="this.style.background='${t.id === cur.id ? 'var(--gold-dim)' : 'transparent'}'">` +
            `${dot(t)}<span style="flex:1;">${t.label}</span>${t.id === cur.id ? '<span style="color:var(--gold); font-size:11px;">●</span>' : ''}</div>`
          ).join('') +
        `</div>` +
      `</div>`;
  }

  window.renderHeaderTheme = renderHeaderTheme;
  window.syncThemeDrop = renderHeaderTheme;

  window.toggleThemeDrop = function (e) {
    if (e) e.stopPropagation();
    const m = document.getElementById('theme-drop-menu');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
  };

  document.addEventListener('click', e => {
    const drop = document.getElementById('theme-drop');
    const menu = document.getElementById('theme-drop-menu');
    if (menu && menu.style.display !== 'none' && drop && !drop.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHeaderTheme);
  } else {
    renderHeaderTheme();
  }
})();
