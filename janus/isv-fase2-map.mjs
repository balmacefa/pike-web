#!/usr/bin/env node
// FASE-2 (Pike-ISV-V): mapeo exhaustivo read-only del tenant IBM Verify via token de sesion admin.
// Vuelca un catalogo canonico a janus/isv-catalog.json. NUNCA persiste tokens ni secretos (se redactan).
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = readFileSync(resolve(HERE, 'verify-kit.js'), 'utf8');
const CDP = process.env.PWEB_CDP || 'http://127.0.0.1:9222';

// Endpoints a mapear (read-only). label -> path
const ENDPOINTS = {
  users:              '/v2.0/Users?count=100',
  users_cardinality:  '/v2.0/Users/cardinality',
  groups:             '/v2.0/Groups?count=100',
  applications:       '/v1.0/applications',
  identitysources:    '/v2.0/identitysources',
  identitysourcetypes:'/v1.0/identitysourcetypes',
  attributes:         '/v1.0/attributes',
  attributefunctions: '/v1.0/attributefunctions',
  factors:            '/v2.0/factors',
  policies:           '/policyvault/v5.0/policyvault/accesspolicy',
  apiclients:         '/v1.0/apiclients',
  branding_themes:    '/v1.0/branding/themes',
  secrets:            '/keyservice/v1.0/secrets',
  webhooks:           '/webhooks/v1.0/webhooks-mgmt/',
  oidc_providers:     '/config/v1.0/relyingparty/',
  tenant_props:       '/gta/v1.0/tenant/properties',
  mfa_factors_v2:     '/v2.0/factors',
  admin_roles:        '/apisecurity/v2.0/roles',
};

const SECRET_KEY = /secret|password|passwd|pwd|private[_-]?key|client[_-]?secret|token|credential|apikey|api[_-]?key|sharedkey|signingkey|keystore|salt/i;
function redact(v){
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object'){
    const o = {};
    for (const [k,val] of Object.entries(v)){
      if (SECRET_KEY.test(k)) { o[k] = '[REDACTED]'; continue; }
      // identitysources store properties as [{key,value}] -> redact by key value too
      if (k === 'properties' && Array.isArray(val)){
        o[k] = val.map(p => (p && typeof p==='object' && 'key' in p) ? { ...p, value: SECRET_KEY.test(String(p.key)) ? '[REDACTED]' : redact(p.value) } : redact(p));
        continue;
      }
      o[k] = redact(val);
    }
    return o;
  }
  return v;
}

const browser = await chromium.connectOverCDP(CDP);
const pages = browser.contexts().flatMap(c=>c.pages()).filter(p=>/^https?:/.test(p.url()));
let page = pages.find(p=>/\/ui\/admin/.test(p.url()) && /verify\.ibm\.com/.test(p.url())) || pages.find(p=>/verify\.ibm\.com/.test(p.url()));
if (!page){ console.log(JSON.stringify({ok:false,error:'no verify tab'})); process.exit(2); }
await page.evaluate(KIT);

const raw = await page.evaluate(async (endpoints)=>{
  const out = {};
  for (const [label, path] of Object.entries(endpoints)){
    try { const r = await window.V.get(path); out[label] = { status:r.status, ok:r.ok, data:r.data }; }
    catch(e){ out[label] = { status:0, ok:false, error:String(e.message||e) }; }
  }
  return out;
}, ENDPOINTS);

// Build canonical catalog (redacted + summarized)
const cat = { tenant: new URL(page.url()).host, generatedAt: new Date().toISOString(), by:'Pike-ISV-V', endpoints:{} };
for (const [label, res] of Object.entries(raw)){
  cat.endpoints[label] = { status: res.status, ok: res.ok, data: redact(res.data) };
}
writeFileSync(resolve(HERE,'isv-catalog.json'), JSON.stringify(cat, null, 2));

// Short console summary
const sum = {};
for (const [label,res] of Object.entries(raw)){
  const d = res.data || {};
  let count = d.totalResults ?? d.total ?? d.totalCount ?? (Array.isArray(d)?d.length:undefined)
    ?? (d.Resources?.length) ?? (d._embedded?.applications?.length) ?? (d.identitySources?.length)
    ?? (d.apiClients?.length) ?? (d.policies?.length) ?? (d.themeRegistrations?.length);
  sum[label] = { status: res.status, ok: res.ok, count };
}
console.log(JSON.stringify({ ok:true, file:'janus/isv-catalog.json', summary:sum }, null, 2));
process.exit(0);
