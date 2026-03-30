// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CLOUD AUTH  (same pattern as series tracker)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function initCloudAuth() {
  try {
    const resp = await fetch('/api/me', { credentials: 'same-origin' });
    if (!resp.ok) { renderAuthUI(null); return; }
    _cloudUser = await resp.json();
    renderAuthUI(_cloudUser);
    syncCloudCharacters(); // fire-and-forget — don't block init on character sync
    if (location.search.includes('auth=success')) {
      history.replaceState(null, '', location.pathname + location.hash);
      saveToCloud();
    } else {
      loadFromCloud();
    }
  } catch { renderAuthUI(null); }
}

// Fetch cloud-saved characters and apply the most recently updated one if it's
// newer than whatever is in localStorage. This ensures that linking your character
// on Series automatically appears on Moogle after Discord login.
async function syncCloudCharacters() {
  try {
    const resp = await fetch('/api/characters', { credentials: 'same-origin' });
    if (!resp.ok) return;
    _cloudChars = await resp.json();
    renderMoogleCharSwitcher();
    if (_cloudChars.length === 0) return;

    const latest = [..._cloudChars].sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    )[0];

    // Only skip if local char was saved more recently than cloud (manual local edit)
    const cloudTime = new Date(latest.updatedAt).getTime();
    const localTime = CHAR.name
      ? (parseInt(localStorage.getItem('moogle-char-updated') || '0') || 0)
      : 0;

    if (cloudTime <= localTime) return; // local is fresh enough, keep it

    // Skip synthetic manual: keys — only auto-apply real Lodestone characters
    const lid = latest.lodestoneId;
    CHAR = {
      name:        latest.characterName,
      world:       latest.characterWorld,
      lodestoneId: lid?.startsWith('manual:') ? null : lid,
      avatarUrl:   latest.avatarUrl || null,
    };
    saveCharData();
    renderCharDisplay();
  } catch {}
}

async function saveToCloud() {
  if (!_cloudUser || !EVENT) return;
  try {
    await fetch('/api/moogle/' + encodeURIComponent(EVENT.key), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wishlist:            JSON.stringify(WISHLIST),
        tomes_current:       TOMES,
        weekly_objectives:   JSON.stringify(filterChallenges('weekly')),
        standard_objectives: JSON.stringify(filterChallenges('standard')),
        minimog_challenges:  JSON.stringify(filterChallenges('minimog')),
        ultimog_challenges:  JSON.stringify(filterChallenges('ultimog')),
      }),
    });
  } catch {}
}

function filterChallenges(type) {
  if (!EVENT) return {};
  const result = {};
  (EVENT.challenges[type] || []).forEach(ch => { if (CHALLENGES[ch.id]) result[ch.id] = true; });
  return result;
}

async function loadFromCloud() {
  if (!_cloudUser || !EVENT) return;
  try {
    const resp = await fetch('/api/moogle/' + encodeURIComponent(EVENT.key), { credentials: 'same-origin' });
    if (!resp.ok) return; // 404 = no cloud save yet, keep local state
    const data = await resp.json();
    const cloudWishlist = JSON.parse(data.wishlist || '{}');
    // Only load cloud state if it appears to have data
    if (Object.keys(cloudWishlist).length > 0 || data.tomesCurrent > 0) {
      WISHLIST = cloudWishlist;
      TOMES    = data.tomesCurrent || 0;
      const weekly   = JSON.parse(data.weeklyObjectives   || '{}');
      const standard = JSON.parse(data.standardObjectives || '{}');
      const minimog  = JSON.parse(data.minimogChallenges  || '{}');
      const ultimog  = JSON.parse(data.ultimogChallenges  || '{}');
      CHALLENGES = { ...weekly, ...standard, ...minimog, ...ultimog };
      persist();
      const tomesInput = document.getElementById('inp-tomes');
      if (tomesInput) tomesInput.value = TOMES;
      renderAll();
      showToast('Cloud save loaded.');
    }
  } catch {}
}

function toggleProfileMenu() {
  const menu = document.getElementById('profile-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function renderAuthUI(user) {
  const el = document.getElementById('discord-auth-widget');
  if (!el) return;
  if (!user) {
    el.innerHTML = `
      <a href="/auth/login?returnTo=/moogle/" style="display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:8px;border:1px solid #5865F2;background:rgba(88,101,242,0.12);color:#7289da;font-size:11px;font-weight:600;text-decoration:none;transition:background 0.15s;"
        onmouseover="this.style.background='rgba(88,101,242,0.22)'" onmouseout="this.style.background='rgba(88,101,242,0.12)'">
        <svg width="14" height="14" viewBox="0 0 71 55" fill="#7289da" xmlns="http://www.w3.org/2000/svg"><path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.2 0A37.8 37.8 0 0 0 25.4.5a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.6 4.9a.2.2 0 0 0-.1.1C1.5 18.4-.9 31.5.3 44.5a.2.2 0 0 0 .1.2 58.9 58.9 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36 36 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.7 58.7 0 0 0 17.8-9 .2.2 0 0 0 .1-.2c1.4-15-2.4-28-10.1-39.6a.2.2 0 0 0-.1-.1ZM23.7 36.8c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z"/></svg>
        Login with Discord
      </a>`;
    return;
  }
  const avatarSrc = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=64`
    : null;
  const avatarInner = avatarSrc
    ? `<img src="${avatarSrc}" style="width:28px;height:28px;border-radius:50%;display:block;" onerror="this.style.display='none'">`
    : `<span style="font-size:13px;">⚔</span>`;
  const displayName = user.username.length > 14 ? user.username.slice(0, 13) + '…' : user.username;
  el.style.position = 'relative';
  el.innerHTML = `
    <button onclick="toggleProfileMenu()"
      style="background:rgba(88,101,242,0.1);border:1px solid rgba(88,101,242,0.35);border-radius:20px;padding:3px 10px 3px 4px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:background 0.15s;"
      onmouseover="this.style.background='rgba(88,101,242,0.2)'" onmouseout="this.style.background='rgba(88,101,242,0.1)'">
      <span style="width:28px;height:28px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--gold-dim);flex-shrink:0;">${avatarInner}</span>
      <span style="font-size:11px;font-weight:600;color:var(--text);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${displayName}</span>
      <span style="font-size:9px;color:var(--text-muted);margin-left:-2px;">▾</span>
    </button>
    <div id="profile-menu" style="display:none;position:absolute;top:44px;left:0;z-index:500;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;min-width:270px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.45);">
      <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:600;margin-bottom:3px;">${user.username}</div>
        <div style="display:inline-flex;align-items:center;gap:5px;">
          <svg width="12" height="12" viewBox="0 0 71 55" fill="#7289da" xmlns="http://www.w3.org/2000/svg"><path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.2 0A37.8 37.8 0 0 0 25.4.5a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.6 4.9a.2.2 0 0 0-.1.1C1.5 18.4-.9 31.5.3 44.5a.2.2 0 0 0 .1.2 58.9 58.9 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36 36 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.7 58.7 0 0 0 17.8-9 .2.2 0 0 0 .1-.2c1.4-15-2.4-28-10.1-39.6a.2.2 0 0 0-.1-.1ZM23.7 36.8c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z"/></svg>
          <span style="font-size:10px;color:var(--text-muted);">Discord account linked</span>
        </div>
      </div>
      <div id="profile-char-list"></div>
      <a href="/series/" style="display:block;font-size:12px;color:var(--text-muted);text-decoration:none;padding:4px 0;margin-top:8px;" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-muted)'">← Series Tracker</a>
      <button class="btn btn-outline" onclick="handleLogout()" style="width:100%;justify-content:center;font-size:11px;padding:6px;margin-top:10px;">Logout</button>
    </div>`;
  renderMoogleCharSwitcher();
}

function renderMoogleCharSwitcher() {
  const el = document.getElementById('profile-char-list');
  if (!el) return;
  if (_cloudChars.length === 0) {
    el.innerHTML = `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px 0;">No characters saved yet.<br>Link a character on the Series Tracker.</div>`;
    return;
  }
  el.innerHTML = `
    <div style="font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Characters</div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${_cloudChars.map(c => {
        const isActive = CHAR.lodestoneId ? c.lodestoneId === CHAR.lodestoneId : (c.characterName === CHAR.name && c.characterWorld === CHAR.world);
        const label    = c.characterName;
        const world    = c.characterWorld || '';
        const avatarTag = c.avatarUrl
          ? `<img src="${c.avatarUrl}" style="width:36px;height:36px;border-radius:6px;flex-shrink:0;object-fit:cover;" onerror="this.style.display='none'">`
          : `<span style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;background:var(--gold-dim);border-radius:6px;font-size:16px;flex-shrink:0;">⚔</span>`;
        return `
        <div onclick="applyCharacter('${label.replace(/'/g,"\\'")}','${world.replace(/'/g,"\\'")}','${(c.lodestoneId||'').replace(/'/g,"\\'")}','${(c.avatarUrl||'').replace(/'/g,"\\'")}');toggleProfileMenu();"
          style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid ${isActive ? 'var(--border-gold)' : 'var(--border)'};background:${isActive ? 'var(--gold-dim)' : 'transparent'};cursor:pointer;">
          ${avatarTag}
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
            <div style="font-size:10px;color:var(--text-muted);">${world}${isActive ? ' &nbsp;<span style="color:var(--gold);">● active</span>' : ''}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

async function handleLogout() {
  try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
  _cloudUser = null;
  renderAuthUI(null);
  showToast('Logged out.');
}

document.addEventListener('click', e => {
  const widget = document.getElementById('discord-auth-widget');
  const menu   = document.getElementById('profile-menu');
  if (menu && menu.style.display !== 'none' && widget && !widget.contains(e.target)) {
    menu.style.display = 'none';
  }
});
