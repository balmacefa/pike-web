(() => {
  if (window.V && window.V.__v === 3) return 'V3 ready (token=' + !!window.__vAuth + ')';
  const F = window.__origFetch || window.fetch; window.__origFetch = F;
  window.fetch = function (i, init) { try { const h = init && init.headers;
    const a = h && (h instanceof Headers ? h.get('authorization') : (h.authorization || h.Authorization));
    const u = String((i && i.url) || i);
    if (a && (u.startsWith('/') || u.startsWith(location.origin))) window.__vAuth = a; } catch (e) {}
    return F.apply(this, arguments); };
  const sl = ms => new Promise(r => setTimeout(r, ms));
  const vis = e => e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden';
  const NAV = { home:'cs-admin-nav-header-sidemenu-dashboard', applications:'cs-admin-nav-header-sidemenu-applications-applications',
    appSettings:'cs-admin-nav-header-sidemenu-application-settings', appGateway:'cs-admin-nav-header-sidemenu-application-gateway',
    tokenTypes:'cs-admin-nav-header-sidemenu-application-token-types', stsClients:'cs-admin-nav-header-sidemenu-application-sts-clients',
    appRoles:'cs-admin-nav-header-sidemenu-roles-permissions', appProfiles:'cs-configuration-schema',
    provisioning:'cs-admin-nav-header-sidemenu-operation-results', accessCert:'cs-admin-nav-header-sidemenu-access-certification-mfe',
    authzDetailTypes:'authorizationDetailsTypes', users:'cs-admin-nav-header-sidemenu-users-and-groups', attributes:'cs-configuration-attributes',
    identityProviders:'cs-configuration-identity-sources', deviceManagers:'cs-configuration-deviceManager', certProviders:'cs-configuration-certificateProviders',
    authFactors:'cs-tab-item-authenticationFactors', regProfiles:'cs-authentication-registration-profiles', fido2:'fido2WebAuthn',
    accessPolicies:'accessPolicies', portalAccess:'cs-tabitem-portalAccess', oidcTokens:'tokens', apiAccess:'cs-security-api-access',
    certificates:'cs-security-certificates', appConsents:'applicationConsents', passwords:'password-management', signInOptions:'signInOptions',
    threatDetection:'threatDetection', secrets:'secrets', purposes:'cs-admin-nav-header-sidemenu-priavcy-purposes',
    eulas:'cs-admin-nav-header-sidemenu-priavcy-eulas', privacyProfiles:'cs-admin-nav-header-sidemenu-priavcy-profiles',
    privacyPolicy:'cs-admin-nav-header-sidemenu-priavcy-policy', userConsents:'cs-admin-nav-header-sidemenu-priavcy-consents',
    branding:'cs-admin-nav-header-sidemenu-branding', proofing:'cs-admin-nav-header-sidemenu-flows-proofing',
    profileFlows:'cs-admin-nav-header-sidemenu-flows-profile', registrationFlows:'cs-admin-nav-header-sidemenu-flows-registrations',
    extensions:'cs-admin-nav-header-sidemenu-extensions', identityAgents:'cs-admin-nav-header-sidemenu-identity-agents',
    realtimeWebhooks:'cs-admin-nav-header-sidemenu-realtime-webhooks', notificationWebhooks:'cs-admin-nav-header-sidemenu-notification-webhooks',
    oidcProviders:'cs-admin-nav-header-sidemenu-oidc-providers', recaptcha:'cs-admin-nav-header-sidemenu-recaptcha',
    reports:'cs-admin-nav-header-sidemenu-reports', adminRoles:'cs-admin-header-configuration-admin-roles',
    communication:'cs-configuration-customization', usage:'cs-admin-nav-header-sidemenu-usage-dashboard' };
  const S = x => typeof x === 'string' ? x : JSON.stringify(x);
  window.V = { __v: 3, NAV, sl, vis, log: [],
    // ---- state / guards ----
    state() { const p = location.pathname; return S({ host: location.host, path: p, admin: p.startsWith('/ui/admin') && !p.endsWith('/terms'),
      usc: p.startsWith('/usc'), token: !!window.__vAuth, busy: !!window.__vBusy }); },
    sessionOk() { return location.host.endsWith('verify.ibm.com') && location.pathname.startsWith('/ui/admin') && !location.pathname.endsWith('/terms'); },
    why() { const p = location.pathname; if (!location.host.endsWith('verify.ibm.com')) return 'LOGIN: off tenant (' + location.host + ') -> user signs in';
      if (p.startsWith('/usc')) return 'NOT_ADMIN: /ui/admin redirected to /usc -> user must sign in with an admin account';
      if (p.endsWith('/terms')) return 'TERMS: user must accept IBM terms'; if (!window.__vAuth) return 'NO_TOKEN: run V.warm()'; return 'OK'; },
    async warm() { if (window.__vAuth) return 'OK'; const a = document.getElementById(NAV.attributes); if (a) a.click();
      for (let i = 0; i < 10 && !window.__vAuth; i++) await sl(400); return window.__vAuth ? 'OK' : this.why(); },
    // ---- API ----
    async api(method, path, body) {
      if (!window.__vAuth) return { status: 0, ok: false, data: this.why() };
      const scim = /^\/v2\.0\/(Users|Groups|Me|SCIM)/.test(path); const ct = scim ? 'application/scim+json' : 'application/json';
      const h = { authorization: window.__vAuth, accept: ct }; if (body !== undefined) h['content-type'] = ct;
      const r = await F(path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      const rct = r.headers.get('content-type') || ''; let data = null;
      if (/json/.test(rct)) { try { data = await r.json(); } catch (e) {} }
      this.log.push(method + ' ' + path + ' ' + r.status); return { status: r.status, ok: r.ok && /json/.test(rct), data }; },
    get(p) { return this.api('GET', p); },
    report(name, body) { return this.api('POST', '/v1.0/reports/' + name, body); },
    range(days) { return { FROM: String(Date.now() - days * 864e5), TO: 'now' }; },
    // ---- DOM helpers ----
    async go(key, wait = 2500) { const a = document.getElementById(NAV[key] || key); if (!a) return 'nav id not found: ' + key; a.click(); await sl(wait); return location.pathname; },
    btn(txt, root) { return [...(root || document).querySelectorAll('button,a')].find(b => vis(b) && b.innerText.trim() === txt); },
    tab(txt) { const t = [...document.querySelectorAll('[role=tab]')].find(e => vis(e) && e.innerText.trim() === txt); if (t) t.click(); return !!t; },
    setVal(el, v) { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
    async waitFor(fn, ms = 6000) { for (let t = 0; t < ms; t += 250) { const v = fn(); if (v) return v; await sl(250); } return null; },
    toast() { return [...document.querySelectorAll('.bx--toast-notification,.bx--inline-notification,.bx--actionable-notification')].filter(vis).map(e => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 120)).join(' | '); },
    async search(text) { const s = [...document.querySelectorAll('main input.bx--search-input')].find(vis); if (!s) return false; this.setVal(s, text); await sl(2500); return true; },
    readTable(root) { root = root || document.querySelector('main'); const t = root && [...root.querySelectorAll('table')].find(vis); if (!t) return [];
      const h = [...t.querySelectorAll('thead th')].map(x => ((x.querySelector('.bx--table-header-label') || x).innerText || '').replace(/^Click to sort.*?order/, '').trim());
      return [...t.querySelectorAll('tbody tr')].map(r => { const o = {}; [...r.cells].forEach((c, i) => { const v = c.innerText.trim().replace(/\s+/g, ' '); if (h[i] && v && h[i] !== 'Select all rows') o[h[i]] = v; }); return o; }); },
    modal() { return [...document.querySelectorAll('.bx--modal.is-visible')].filter(vis).pop() || null; },
    modalInfo() { const m = this.modal(); if (!m) return 'no modal'; const u = a => a.filter((x, i, b) => x && b.indexOf(x) === i);
      return 'TITLE:' + ((m.querySelector('h2,h3,.bx--modal-header__heading') || {}).innerText || '') +
        '\nL:' + u([...m.querySelectorAll('label,legend')].filter(vis).map(l => l.innerText.trim().split('\n')[0].slice(0, 35))).join('|') +
        '\nIN:' + u([...m.querySelectorAll('input,textarea,select')].filter(vis).map(e => (e.id && !e.id.includes(':') ? '#' + e.id : '') + '[' + (e.type || '') + ']')).slice(0, 25).join(' ') +
        '\nB:' + u([...m.querySelectorAll('button')].filter(vis).map(b => (b.innerText || b.getAttribute('aria-label') || '').trim().split('\n')[0].slice(0, 25))).join('|') +
        '\nERR:' + [...m.querySelectorAll('.bx--form-requirement')].filter(vis).map(e => e.innerText.trim()).join('|'); },
    mbtn(txt) { const m = this.modal(); return m && [...m.querySelectorAll('button')].find(b => vis(b) && b.innerText.trim() === txt); },
    async cancel() { const m = this.modal(); const b = this.mbtn('Cancel') || this.mbtn('Cancel setup') || (m && m.querySelector('.bx--modal-close')); if (b) { b.click(); await sl(800); } return !this.modal(); },
    page() { const m = document.querySelector('main') || document.body; const u = a => a.filter((x, i, b) => x && b.indexOf(x) === i);
      const t = e => (e.innerText || e.getAttribute('aria-label') || e.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 28);
      const q = s => [...m.querySelectorAll(s)].filter(vis);
      return location.pathname + '\nH:' + u(q('h1,h2,h3').map(t)).join('|') + '\nT:' + u(q('[role=tab],.c4p--nav-item__link').map(t)).join('|') +
        '\nTH:' + u(q('th').map(t)).join('|') + '\nB:' + u(q('button,a.bx--btn').map(t)).join('|'); },
    // ---- applications (tested 2026-10-31) ----
    async apps() { const r = await this.get('/v1.0/applications'); if (!r.ok) return S({ err: r.status, why: r.data });
      return S((r.data._embedded && r.data._embedded.applications || []).map(a => ({ id: (a._links && a._links.self && a._links.self.href || '').split('/').pop(), name: a.name, tpl: a.templateId }))); },
    async appId(name) { const a = JSON.parse(await this.apps()); const f = Array.isArray(a) && a.find(x => x.name === name); return f ? f.id : null; },
    // Details page is a FULL reload (kit is wiped): navigate there, then re-inject the kit.
    appUrl(id) { return location.origin + '/ui/admin/application/' + id; },
    openApp(id) { if (location.pathname === '/ui/admin/application/' + id) return 'already'; setTimeout(() => { location.href = this.appUrl(id); }, 50); return 'reloading -> wait 4s, re-inject kit'; },
    appInfo() { const g = id => document.getElementById(id); if (!g('app-name-input')) return 'not on app details page';
      return S({ path: location.pathname, name: g('app-name-input').value, enabled: g('cs-application-enabled-input')?.checked, launchpad: g('cs-application-visible-on-launchpad-input')?.checked,
        desc: (g('cs-app-description')?.value || '').slice(0, 80), tabs: [...document.querySelectorAll('[role=tab]')].filter(vis).map(t => t.innerText.trim()) }); },
    // WRITE: only after the user confirmed the exact change in chat
    async appSetName(name) { const el = document.getElementById('app-name-input'); if (!el) return 'open the app first (V.openApp)';
      if (el.value === name) return 'unchanged'; this.setVal(el, name); await sl(400);
      const b = [...document.querySelectorAll('main button,footer button,button')].find(x => vis(x) && x.innerText.trim() === 'Save');
      if (!b || b.disabled) return 'Save disabled'; b.click();
      const t = await this.waitFor(() => /updated|saved|error|fail/i.test(this.toast()) && this.toast()); return t || 'no toast'; },
    help() { return 'V3: state() why() warm() get(p) api(m,p,b) report(n,b) go(key) page() readTable() modalInfo() cancel() search(t) toast() | apps() appId(name) openApp(id) appInfo() appSetName(n)[WRITE]'; } };
  // Auto-warm only on list pages: on detail/edit pages a nav click would leave unsaved forms. Use V.warm() there if API is needed.
  const a = document.getElementById(NAV.attributes); if (a && !window.__vAuth && !/\/application\/\d/.test(location.pathname)) a.click();
  return 'V3 installed; ' + V.why();
})()
