---
name: "ibm-verify-admin"
description: "Use for any task on the user's IBM Verify tenant (verify.ibm.com admin console or /usc launchpad) in Claude in Chrome: fast JS kit for its REST API, selectors, wizards and reports."
---

# IBM Verify admin — fast JS workflows

Tenant: `https://YOUR-TENANT.verify.ibm.com` · Admin console `/ui/admin` · End-user launchpad `/usc`.
UI = IBM Carbon (`bx--*`) + Carbon for IBM Products (`c4p--*`), React SPA. Mapped and tested 2026-10-31 (kit V3: apps + rename; OIDC IdP federation + OIDC apps).

## Golden rules
1. **API first, UI second.** Every admin page is a thin client over IBM Verify REST APIs. Reading via `V.get()` is ~100× faster than clicking. Use the UI only when the user wants to see it, or for flows whose API you have not verified.
2. **One bootstrap per page load.** Paste the kit (below) into `javascript_tool`, wait ~2 s, then call helpers. A full `navigate` wipes it; SPA clicks (`V.go`) keep it.
3. **Return small strings** (`JSON.stringify(...)`, slice). Tool output truncates near ~1000 chars; for big results store in `window.__x` and read slices.
4. **Never print the token** (`window.__vAuth`). It's only in memory (not in storage/cookies).
5. **Writes need explicit user confirmation in chat**, naming the object. Never delete (deletions are for the user to do). Reads, opening wizards and cancelling are fine.
6. If the tab lands on `login.ibm.com` / `accounts.google.com` / `/idaas/mtfim/sps/idaas/login` the session expired → ask the user to sign in; never type credentials. If it lands on `/ui/admin/terms`, the user must accept IBM terms themselves.
7. **`/ui/admin` → `/usc` redirect = signed-in user is not an admin** (e.g. entered via a federated WordPress/OIDC identity). `V.why()` returns `NOT_ADMIN`; ask the user to sign out and sign in with the admin account.
8. **Full reloads kill a running batch**: an item that reloads the page (opening an app's details, `location.href=`) makes `browser_batch` fail. Put it last in the batch or alone, then re-inject the kit.
9. Opening Profile & settings › **Security** in `/usc` triggers an email OTP step-up (`/authsvc/mtfim/sps/authsvc`, `#otp-input`) — the user enters it, not you.
10. **Client secrets** (IdP or app): the user types/copies them; Claude only checks shape (length, ≠ client id) without printing them.

## Bootstrap kit V3 (global singleton `window.V`, paste as-is)
Idempotent: re-pasting returns `V3 ready`. Survives SPA clicks (`V.go`), dies on full reloads (`navigate`, app details page) → re-paste. Every helper returns a short string/JSON so an AI can chain it; `V.help()` lists them, `V.why()` explains blockers, `V.log` keeps API calls (no headers).
```js
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
```
Typical call after bootstrap (top-level `await` works in `javascript_tool`; don't wrap in an async IIFE — it returns `{}`). For slow helpers inside a batch, prefer fire-and-read: `V.fn().then(r=>window.__r=r)` → `computer wait` → read `window.__r`:
```js
const [u,g] = await Promise.all([V.get('/v2.0/Users?attributes=userName,active'), V.get('/v2.0/Groups?attributes=displayName')]);
JSON.stringify({users:u.data.totalResults, groups:g.data.Resources.map(x=>x.displayName)})
```

## API map (discovered from the console's own calls; ✅ = tested 200 JSON)
SCIM (`Accept: application/scim+json`, handled by `V.api`):
- ✅ `GET /v2.0/Users?attributes=…&filter=…&count=…` · `GET /v2.0/Users/{id}` · `GET /v2.0/Users/cardinality` · `GET /v2.0/Me`
- ✅ `GET /v2.0/Groups?attributes=displayName&filter=displayName sw "x"`
- ✅ `POST /v2.0/Groups` → 201. Body **must** list both schemas:
  `{schemas:['urn:ietf:params:scim:schemas:core:2.0:Group','urn:ietf:params:scim:schemas:extension:ibm:2.0:Group'], displayName, 'urn:ietf:params:scim:schemas:extension:ibm:2.0:Group':{description}}` (missing the IBM schema → 400 CSIAI0137E).
- `GET /v2.0/SCIM/capabilities`

JSON (`/v1.0`, `/v2.0`, `/v3.0` and service prefixes):
| Area | Endpoints |
|---|---|
| Applications | ✅ `/v1.0/applications` (`_embedded.applications[]`: `name`, `templateId`, id = last segment of `_links.self.href`) · `/appaccess/v1.0/applications/stats` · `/appaccess/v1.0/pwdsyncapplications` |
| App settings | `/v1.0/saml/federations/saml20ip` · `/v1.0/saml/federations/saml20sp` · `/dpcm-mgmt/config/v1.0/privacy/profiles` |
| OIDC / STS | `/oidc-mgmt/v1.0/sts/tokentypes` · `/oidc-mgmt/v1.0/sts/oauth/clients` · `/oidc-mgmt/v1.0/auth-detail-types` · `/v1.0/grants` (OIDC tokens) |
| App gateway / profiles | `/appgateway/config/v1.0/application-gateway` · `/adaptermgmt/config/v1.0/profiles` · `/adaptermgmt/config/v1.0/templates` |
| Roles & entitlements | `POST /v1.0/entitlements/search` (app roles) · `POST /v1.0/admin/entitlements/search` (admin roles) · `/apisecurity/v2.0/roles` |
| Provisioning / certification | `/v1.0/accounts/operations` · `/cm/v2.0/campaign/stats` · `/cm/v2.0/instances` · `/cm/v2.0/campaigns` |
| Attributes | ✅ `/v1.0/attributes` (array; custom ones have `id`, `name`, `datatype`) · `/v1.0/attributefunctions` |
| Identity providers | ✅ `/v2.0/identitysources` (`identitySources[]`: `instanceName`, `id`, `enabled`, `properties[]` key/value incl. realm, client_id, endpoints, jitEnabled, principalAttribute) · ✅ `/v1.0/identitysourcetypes` (19 types) · `/v1.0/config/identitysources/attributemappings` · `/authbroker-mgmt/v1.0/config/identitylinking` |
| Device mgmt / smartcard | `/mdmbroker-mgmt/config/v1.0/mdm/device-managers` · `/config/v1.0/smartcard-providers` |
| MFA factors | ✅ `/v2.0/factors` · ✅ `/v2.0/factors/emailotp` · `/config/v2.0/factors/{emailotp|smsotp|totp|voiceotp}` · `/factors-mgmt/config/v2.0/factors/qr` · `/v1.0/authnmethods/signature` |
| FIDO2 | `/factors-mgmt/config/v2.0/factors/fido2/relyingparties` · `…/fido2/metadata` |
| Registration profiles | `/v1.0/authenticators/clients` · ✅ `/v1.0/authenticators` |
| Access policies | ✅ `/policyvault/v5.0/policyvault/accesspolicy` (`total`, `policies[]`; 18 built-in) · `/policyvault/v5.0/policyvault/accesspolicy/{n}` · `/v1.0/authpolicy/{n}/applications` |
| Tenant props | `/gta/v1.0/tenant/properties` |
| API clients | ✅ `/v1.0/apiclients` |
| Certificates | `/ui/api/v1.0/certificates` · `/keyservice/v1.0/personalcert` · `/keyservice/v1.0/signercert` |
| Passwords | `/v3.0/PasswordPolicies` · `/v3.0/DictionaryPolicy/multi` · `/v2.0/identitysources/passwordPolicies` |
| Threats / secrets | `/threatinsights/v1.0/itdr/configurations` · ✅ `/keyservice/v1.0/secrets` (also `/v1.0/secrets`) |
| Privacy | `/dpcm-mgmt/config/v1.0/privacy/{purposes|access-types|profiles|policies/default|consents}` |
| Branding / flows | ✅ `/v1.0/branding/themes` (`themeRegistrations[]`) · `/profile/config/v3.0/flows` · `/config/v1.0/relyingparty/` (OIDC providers) · `/factors/config/v1.0/recaptcha` |
| Integrations | `/ui/api/v1.0/integration/extensions` · `/config/v1.0/onpremagents` · `/webhooks/v1.0/webhooks-mgmt/` · `/webhooks/v1.0/webhooks-mgmt/purposes` · `/factors/config/v1.0/mfaproviders` |
| Communication / usage | `/ui/api/v1.0/preferences/customization` · `/tms/v1.0/offering/report/enablements` · `/ruleservice/v1.0/functions/stats/cache` |
| Tenant as OIDC provider | public discovery `/oauth2/.well-known/openid-configuration` → issuer `https://<tenant>/oauth2`, `/oauth2/{authorize,token,userinfo,jwks,rplogout}` (auth: client_secret_basic/post, private_key_jwt, tls_client_auth); legacy `/oidc/endpoint/default/…` also works. `state` must be ≥ 8 chars (CSIAQ5025E). |

**Reports** are read-only `POST /v1.0/reports/<name>` with JSON body (epoch-ms strings; `TO` may be `"now"`):
- ✅ `auth_total_logins` `{FROM,TO}` → `response.report.{successful_logins.doc_count, failed_logins.doc_count, unique_users.value}`
- ✅ `admin_activity` `{FROM,TO,SIZE,SORT_BY:'time',SORT_ORDER:'DESC'}` → `response.report.hits[]` (audit of admin changes)
- `auth_failed_logins_tenant` / `auth_successful_logins_tenant` / `auth_total_logins_curve` `{INTERVAL:'hour'|'day', TIME}`
- `threat_total_alerts`, `mfa_method_logins`, `password_check_logins`, `token_total_actions` `{FROM,TO}`
- `consent_activity` (like admin_activity) · `agent_health_search` `{FROM,TO,SEARCH_FIELD:'data.target',SEARCH_STRING:'*'}`
- Dashboard: `added_users_count` `{FROM,TO}`, `app_sso_tenant`, `app_top_sso`, `app_top_users`; usage page: `added_users_curve`, `app_unique_users`

To discover an endpoint not listed: hook `fetch` (log method + path, not headers), trigger the page with `V.go(key)`, read the log. Paths returning `200 text/html` are SPA fallbacks, not APIs.

## UI map (when you must click)
Admin header: `#isv--header-global-action-support` (Support panel: docs, What's new…), `#isv--profile-menu-icon` (Switch to launchpad `/usc`, Profile & settings, Sign out ⚠), "Guide me" (WalkMe, shadow DOM → use `find` + click). Tour/WalkMe overlays: click their X via `find`.
Common patterns: primary button top-right; empty pages show a dark purple *hero* + blue CTA; tables are Carbon `table` (use `V.readTable()`); search `main input.bx--search-input` (use `V.search()` — plain `.value=` doesn't trigger React); tabs `[role=tab]` (`V.tab('Groups')`); dropdown options `[role=option]` render ~1 s after opening; modals `.bx--modal.is-visible` (wizards are `c4p--tearsheet`, steps on the left, footer *Cancel setup / Back / Next*).
**Avoid**: `#downshift-:rXX:` IDs (change every load); `#ci-user-registration-create-flow` (reused on Branding + 3 flow pages); `#data-table-NN__…` (NN changes).

Verified wizard selectors:
- **Add user** (Users tab › *Add user*): Identity provider dropdown (required), Status toggle, `#ci-user-dialog-{given-name,middle-name,surname,user-name,external-id,preferred-language,email,mobile-phone,work-number,street-address,locality,region,postal-code,country,formatted}`, *View extended profile*, Cancel/Save.
- **Create group** (Groups tab › *Add group*): `#ci-group-dialog-display-name`, description `textarea`, `#ci-group-dialog-attached-pwd-policy`, members search `#ci-selected-users-box-search` + Add/Remove, notify checkbox `#cs-group-notificaion-toggle-button` (sic), Cancel/Save. ✅ tested end-to-end.
- **Add attribute** (4 steps): type tiles `#ci-add-edit-attribute-type-and-availability-step-{custom-attribute|rule-based-attribute|identity-source-credential|fixed|app-profile}-tile` (click its `label`), purpose checkboxes `…-step-{provisioning|sso}-purpose-tile` → name `#ci-add-edit-attribute-name-and-description-step-{name,id,description}` → identifier `#ci-add-edit-attribute-custom-source-step-custom-attribute-name` (**letters/digits only, no `_ - . space`**), data type (String), hash checkbox → constraints `#attr-constraint-field-{email,write,mandatory,unique}` → *Add attribute*. ✅ tested.
- **Create API client** wizard: Entitlements (165 checkboxes) › API credentials › Custom scopes › IP filter › Additional properties › Confirm configuration.
- **Create a policy**: `#ci-policy-editor-add-settings-policy-name`, type radios `#fedSSO` / `#nativeApp`, Cancel/Create policy.
- **Create realtime webhook**: Purpose dropdown (External MFA | External Risk) › General webhook setup › Connection details.
- **Add identity provider → OIDC Enterprise** ✅ 2026-10-31 (Identity providers page › *Add identity provider*; tearsheet, 6 steps). Type: radios `#cs-identity-source-select-type__N` — pick by label text "OIDC Enterprise" (click `label[for=id]`), Next. General: `#cs-identity-source-add-name`, `#cs-identity-source-add-realm` (= issuer; keep trailing `/` if the IdP has it), `#cs-identity-source-add-enabled`. "To identity provider" shows the **redirect URI to give the IdP: `https://<tenant>/auth/redirect`**. From IdP: `#cs-identity-source-add-{friendly-name,client-id,client-secret,wellknown-endpoint,authorization-endpoint,token-endpoint,userinfo-endpoint,jwks-uri}`, `#cs-identity-source-add-pkce-support-checkbox`, scopes tag input `#isv--identity-sources-add-tag-input` (type + Enter keydown; `openid` fixed), Authentication method dropdown (default Client secret POST), trusted signer certs (optional). **Client secret = user types it**; Next stays disabled until filled. JIT step: `#cs-identity-linking-add-jit-enabled`, Unique user identifier combobox `#cs-identity-linking-add-uuid-custom` (open it and click option `sub`), `#cs-identity-linking-add-enabled` (linking). Attribute mapping: "+ Add attribute mapping" → `#ci-onprem-attr-mappings-idsAttrName-N` / `#ci-onprem-attr-mappings-attrId-N` (open, click `[role=option]`). Reserved targets (error CSIAG0772E): `preferred_username, realmName, groupIds, uid, tenantId`. Done → verify with `GET /v2.0/identitysources` (filter out secret keys). JIT users appear as `<sub>@<issuer>`.
- **Add an application**: type picker search `#ci-application-type-picker-search`; each template is an input whose `id` is its name (`[id="OpenID Connect"]`, `[id="Custom Application"]`); click its label, then modal button *Add application* → full-page form.
- **OIDC app — General/Sign-on** ✅ 2026-10-31: name `#app-name-input`, `#cs-guixml-companyName` (required), `#cs-app-description`. Sign-on: `#cs-configure-sso-input` (disable), `#cs-guixml-applicationUrl` (required), grant types `appinstance.providers.oidc.properties.grantTypes.*`, redirect `#cs-guixml-redirectUris-0` (**click the field first** — typing goes to the last focused input), `#cs-guixml-requirePkceVerification-checkbox` (on by default), `#cs-guixml-doNotGenerateClientSecret-checkbox`, client id `#cs-guixml-clientId-value` (after save), secret `#isv--application-clientSecret-input` (row icons: 👁 · **copy** · list · **🔄 regenerate ⚠**; the clipboard icon next to Client ID copies the ID — users mix them up). Access policies: label "Select specific supported identity providers." → checkboxes by label (Cloud Directory, IBMid, custom IdPs). Consent dropdown default "Ask for consent". Prefer real typing (`computer type`) for name/company; `setVal` on this form sometimes crashed the tool.
- **App Entitlements tab** (shown after first Save): "Automatic access for all users and groups" (→ modal "Update workflow" → OK) or "Select users and groups…" → *Add* → search → select → *Add* → *OK* → per-user Automatic access On → Save.
- **App details** `/ui/admin/application/{id}` (full page load): `#app-name-input`, `#cs-application-enabled-input`, `#cs-application-visible-on-launchpad-input`, `#cs-app-description`, `#cs-guixml-companyName`, `#cs-app-theme`; tabs General | Sign-on | API access | Account lifecycle | Entitlements | Privacy; buttons Add owner, Cancel, Save, Delete ⚠. Success toast: "The application was updated."
- Applications list side panel (click a row): icon buttons `button.bx--btn--sm.bx--btn--ghost` with no aria-label, ordered left→right: settings (gear → details page), users, stats; `.ci-delete-icon-button` far right ⚠. Row "Settings" button also opens details.
- Application settings sub-nav: `#saml-general-settings`, `#oidc-general-settings`, `#dynamic-client-profile`, `#preauthorized`.
- Portal access: `#ci-access-policy-revert-button` / `#ci-access-policy-save-button`. Auth factors toggles: `#ci-security-auth-factors-{one-time-use,correlation-code,user-presence,biometrics}-toggle`.

End-user portal `/usc`: header `#ovd--cloud-header__app-menu`, `#usc--header-action__Application` (notifications), `#usc--header-action__User` (profile; "Switch to admin" → `/ui/admin`, only shown to admins). Pages `/usc/applications` (search `#application-search`, *Add app* `button.btn-add-app-false` → App catalog), `/usc/myaccesses` (*Request new* `.my-accesses-container-add-button` → 3-step wizard, Filters `.filter-link-button`, search `#my-access-multiview`), `/usc/myrequests`, `/usc/tasks` (+ `/usc/tasks/certifications`, search `#certification-multiview-search`), `/usc/myaccounts` (`#my-accounts-multiview`), `/usc/settings` (Profile read-only / Security → OTP / Privacy `/usc/settings/privacy`).

## Ready workflows
- **Tenant snapshot** (1 call): `Promise.all` of Users count, Groups, `/v1.0/applications` totalCount, policies total, identity sources, `auth_total_logins` 7 d, `admin_activity` 1 d → summarize.
- **Who changed what**: `V.report('admin_activity', {...V.range(7), TO:String(Date.now()), SIZE:50, SORT_BY:'time', SORT_ORDER:'DESC'})`.
- **Find a user / group**: SCIM `filter` (`userName eq "x"`, `displayName sw "x"`), or UI `V.go('users')` + `V.search('x')` + `V.readTable()`.
- **Create group** (after user confirms name): SCIM POST above, then verify with a filtered GET. Or UI: `V.go('users')`, `V.tab('Groups')`, `V.btn('Add group').click()`, `V.setVal(...)`, `V.mbtn('Save').click()`.
- **Rename an application** ✅ 2026-10-31 (after user confirms old → new name):
  1. batch: `navigate /ui/admin/` → wait 3 → paste kit → wait 2 → `V.apps().then(r=>window.__r=r)` → wait 1 → read `window.__r` (gets id).
  2. batch: `navigate /ui/admin/application/<id>` → wait 4 → paste kit → `V.appInfo()`.
  3. `V.appSetName('New name').then(r=>window.__r=r)` → wait 4 → read `window.__r` (expect "The application was updated").
  UI fallback: Applications → click row → side panel → first small ghost icon (gear) → details page; name `#app-name-input`, Save; never click Delete.
- **Federate an external OIDC IdP (e.g. WordPress) + test app** ✅ 2026-10-31: IdP wizard above → give the IdP owner `https://<tenant>/auth/redirect` → OIDC test app with redirect `https://oidcdebugger.com/debug`, only that IdP, automatic access → test by navigating `/oauth2/authorize?client_id=…&response_type=code&scope=openid&redirect_uri=…&state=<≥8 chars>&response_mode=form_post&code_challenge=…&code_challenge_method=S256`; the user accepts consent screens. Typical failures: `invalid_client` shown on the IdP host = the IdP doesn't know the client (fix on the IdP); CSIAQ0210E "cannot fetch a key from the JSON Web Key set URI … Forbidden" = a WAF blocks Verify's server-side fetch (empty User-Agent, Amazon ASN) → allow-list the IdP's `/.well-known/*` and token/userinfo paths. ⚠ Logging in through the federated IdP leaves the browser signed in as that non-admin user → `/ui/admin` redirects to `/usc`; the user must sign out and back in as admin.
- **Verify as IdP for a web app (e.g. WordPress admin)** ✅ 2026-10-31: OIDC app with the app's callback, IdPs = IBMid + Cloud Directory (never the app's own federated IdP → loop), entitlement = specific user. If the app's server times out talking to Verify (cURL 28, or HTTP/2 INTERNAL_ERROR on every request with any UA) its IP is blocked by Akamai in front of Verify → proxy only `/oauth2/{token,userinfo,jwks}` through a Cloudflare Worker; authorize stays direct from the browser. `invalid_client` CSIAQ0155E at the token call = wrong secret (check stored secret ≠ client id; length 36 = it's the client id).
- **Dry-run any wizard**: open it, `V.modalInfo()`, step with `V.mbtn('Next')`, then `V.cancel()`.
- **Detect UI drift**: for each `NAV` key, `await V.go(k); V.page()` and compare with this file; update the selectors here.

## Known tenant state
- Identity provider `WordPress OIDC` (OIDC Enterprise, id fc0da5e0-c186-40f0-b0bd-6d88009c9301, issuer `https://wordpress-cq8frf4wsxluhjf7qezakz1k.balmacefa.com/`, client `isv-demo-client`, client_secret_post, PKCE off, JIT on, unique id `sub`, map name→display_name). Works end-to-end.
- App `OIDC debugger` (id 1456302950516373810, templateId 998, OpenID Connect; formerly "WordPress SSO test", client id cfe06067-14e6-4427-be8a-715bcef4c981) — only IdP WordPress OIDC, automatic access for all; redirects to oidcdebugger.com.
- App `WordPress Admin` (id 1509447995874816150, client id 9f819345-1257-4f20-a59f-646e60e608ce) — Verify as IdP for wp-admin; redirect `https://wordpress-cq8frf4wsxluhjf7qezakz1k.balmacefa.com/wp-admin/admin-ajax.php?action=openid-connect-authorize`; IdPs IBMid + Cloud Directory; PKCE off; access only Fabián (IBMid user `demo-user@example.com`). Works (logs in as WP admin `fabian`). Details in skill wp-oidc-coolify-demo.
- JIT user `isv@https://wordpress-cq8frf4wsxluhjf7qezakz1k.balmacefa.com/` (created by the WordPress OIDC test).
- Test objects (user deletes them): groups `claude-test-ui` (id 8A5000317Z) and `claude-test-api` (id 8A50003182); custom attribute `claude_test_attr` (identifier `claudeTestAttr`, id 648d2d65-0092-43be-809a-2793c4588bd5).

## Pendientes (2026-10-31)
- [ ] User deletes test objects: groups `claude-test-ui` / `claude-test-api`, attribute `claude_test_attr`, JIT user `isv@https://wordpress-…/`, and app `OIDC debugger` when the demo is over.
- [ ] Optional: rotate the `WordPress Admin` client secret (it went through the clipboard) and update it in WordPress.
- [ ] Optional: map more claims (email, given/family name) on `WordPress OIDC`; `preferred_username` cannot be a target.
- [ ] Ask IBM support to unblock WordPress server IP 13.140.156.98 at Akamai (then the Cloudflare Worker proxy can be removed) — see wp-oidc-coolify-demo.