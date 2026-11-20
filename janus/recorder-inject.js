// recorder-inject — in-page capture of HUMAN interaction. Injected into every page/nav.
// Emits compact events to Node via window.__janusEmit (exposeBinding). NEVER captures
// password/secret VALUES (only that a password field was used).
(() => {
  if (window.__janusRec === 3) return 'rec-on';
  window.__janusRec = 3;
  window.__janusCount = window.__janusCount || 0;
  const short = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 48);

  // --- creative connectivity proof: a live floating badge injected into the DOM ---
  function badge() {
    let b = document.getElementById('__janus_badge');
    if (!b) {
      b = document.createElement('div'); b.id = '__janus_badge';
      b.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;font:600 13px/1.3 system-ui,sans-serif;'
        + 'background:#111;color:#fff;padding:8px 12px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.4);'
        + 'display:flex;align-items:center;gap:8px;cursor:move;user-select:none;transition:transform .12s ease';
      b.innerHTML = '<span id="__janus_dot" style="width:9px;height:9px;border-radius:50%;background:#e33;'
        + 'box-shadow:0 0 0 0 rgba(227,51,51,.7);animation:__janusPulse 1.4s infinite"></span>'
        + '<span>JANUS REC</span><span style="opacity:.6">\u00b7</span><span id="__janus_n">0</span>';
      const st = document.createElement('style');
      st.textContent = '@keyframes __janusPulse{0%{box-shadow:0 0 0 0 rgba(227,51,51,.7)}70%{box-shadow:0 0 0 10px rgba(227,51,51,0)}100%{box-shadow:0 0 0 0 rgba(227,51,51,0)}}';
      (document.head || document.documentElement).appendChild(st);
      (document.body || document.documentElement).appendChild(b);
    }
    const n = document.getElementById('__janus_n'); if (n) n.textContent = window.__janusCount;
    b.style.transform = 'scale(1.12)'; setTimeout(() => { b.style.transform = 'scale(1)'; }, 120);
    return b;
  }
  badge();
  // keep it alive even if the app re-renders the body
  new MutationObserver(() => { if (!document.getElementById('__janus_badge')) badge(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  const sig = () => ({
    url: location.href,
    title: document.title,
    h: [...document.querySelectorAll('h1,h2,h3')].map(e => short(e.innerText)).filter(Boolean).slice(0, 3),
    body: short(document.body && document.body.innerText).slice(0, 80),
  });
  const selFor = el => {
    if (!el || !el.tagName) return null;
    if (el.id && !/:/.test(el.id)) return '#' + el.id;
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    if (el.getAttribute && el.getAttribute('data-ci-key')) return '[data-ci-key="' + el.getAttribute('data-ci-key') + '"]';
    return null;
  };
  const emit = o => { try { window.__janusCount++; badge(); console.log('@@JANUSREC@@' + JSON.stringify(o)); } catch (e) {} };
  document.addEventListener('click', e => {
    const el = (e.target.closest && e.target.closest('a,button,li,[role=button],label,.app-tile-wrapper,.bx--dropdown-item')) || e.target;
    emit({ type: 'click', text: short(el.innerText || el.value || (el.getAttribute && el.getAttribute('aria-label'))),
           tag: el.tagName, sel: selFor(el), sig: sig(), t: Date.now() });
  }, true);
  document.addEventListener('change', e => {
    const el = e.target;
    if (!/INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
    emit({ type: 'type', sel: selFor(el), field: el.name || el.id || '', isPassword: el.type === 'password', sig: sig(), t: Date.now() });
  }, true);
  return 'rec-on';
})();
