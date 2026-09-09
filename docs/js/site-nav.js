// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SHARED SITE NAV  — inject into any page via:
//    <div id="site-nav"></div>
//    <script src="/js/site-nav.js"></script>
//  Add future pages to the PAGES array below.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(function () {
  const PAGES = [
    { href: '/',        label: 'Home',            match: p => p === '/' },
    { href: '/series/', label: 'Series Tracker',  match: p => p.startsWith('/series') },
    { href: '/moogle/', label: 'Moogle Tracker', match: p => p.startsWith('/moogle') },
  ];

  function injectNav() {
    const el = document.getElementById('site-nav');
    if (!el) return;
    const path = window.location.pathname;
    const items = PAGES.map(page => {
      if (page.match(path)) {
        return `<span style="padding:5px 14px;border-radius:20px;border:1px solid var(--border-gold);background:var(--gold-dim);font-size:0.78rem;color:var(--gold);font-weight:600;">${page.label}</span>`;
      }
      return `<a href="${page.href}" style="display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;border:1px solid var(--border);font-size:0.78rem;color:var(--text-muted);text-decoration:none;transition:border-color 0.15s,color 0.15s;" onmouseover="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">${page.label}</a>`;
    }).join('');
    el.innerHTML = `<nav style="margin-top:12px;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;">${items}</nav>`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
