#!/usr/bin/env node
// FASE-2 (Pike-ISV-V): crea recursos representativos ADITIVOS prefijo isv-dsl- via token admin.
// Guarda el request EXACTO (method/path/body/schemas) + respuesta (id/status) como plantillas DSL.
// NUNCA persiste secretos (password redactado en la plantilla guardada).
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = readFileSync(resolve(HERE, 'verify-kit.js'), 'utf8');
const CDP = process.env.PWEB_CDP || 'http://127.0.0.1:9222';

// ---- Request definitions (the DSL templates) ----
const GROUP_BODY = {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group','urn:ietf:params:scim:schemas:extension:ibm:2.0:Group'],
  displayName: 'isv-dsl-group',
  'urn:ietf:params:scim:schemas:extension:ibm:2.0:Group': { description: 'ISV DSL test group (additive, safe to delete)' }
};
const USER_BODY = {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User','urn:ietf:params:scim:schemas:extension:ibm:2.0:User'],
  userName: 'isv-dsl-user',
  name: { givenName: 'ISV', familyName: 'DSL' },
  emails: [{ type: 'work', value: 'isv-dsl-user@example.com' }],
  active: true,
  'urn:ietf:params:scim:schemas:extension:ibm:2.0:User': { realm: 'cloudIdentityRealm', userCategory: 'regular' }
};
const ATTR_BODY = {
  name: 'isvDslAttr',
  description: 'ISV DSL test attribute (additive, safe to delete)',
  scope: 'user',
  sourceType: 'static',
  datatype: 'string',
  displayName: 'ISV DSL Attr',
  tags: ['isv-dsl']
};

const browser = await chromium.connectOverCDP(CDP);
const pages = browser.contexts().flatMap(c=>c.pages()).filter(p=>/^https?:/.test(p.url()));
let page = pages.find(p=>/\/ui\/admin/.test(p.url()) && /verify\.ibm\.com/.test(p.url())) || pages.find(p=>/verify\.ibm\.com/.test(p.url()));
if (!page){ console.log(JSON.stringify({ok:false,error:'no verify tab'})); process.exit(2); }
await page.evaluate(KIT);

const results = await page.evaluate(async ({GROUP_BODY, USER_BODY, ATTR_BODY})=>{
  const V = window.V;
  const run = async (method, path, body) => {
    try { const r = await V.api(method, path, body); return { status:r.status, ok:r.ok, data:r.data }; }
    catch(e){ return { status:0, ok:false, error:String(e.message||e) }; }
  };
  const out = {};
  out.group = { req:{ method:'POST', path:'/v2.0/Groups', body:GROUP_BODY }, res: await run('POST','/v2.0/Groups', GROUP_BODY) };
  out.user  = { req:{ method:'POST', path:'/v2.0/Users',  body:USER_BODY  }, res: await run('POST','/v2.0/Users',  USER_BODY)  };
  out.attr  = { req:{ method:'POST', path:'/v1.0/attributes', body:ATTR_BODY }, res: await run('POST','/v1.0/attributes', ATTR_BODY) };
  return out;
}, { GROUP_BODY, USER_BODY, ATTR_BODY });

// Extract created ids
const idOf = r => r?.data?.id || r?.data?.Resources?.[0]?.id || null;
const created = {
  group: { ok: results.group.res.ok, status: results.group.res.status, id: idOf(results.group.res), err: results.group.res.ok?undefined:JSON.stringify(results.group.res.data).slice(0,300) },
  user:  { ok: results.user.res.ok,  status: results.user.res.status,  id: idOf(results.user.res),  err: results.user.res.ok?undefined:JSON.stringify(results.user.res.data).slice(0,300) },
  attr:  { ok: results.attr.res.ok,  status: results.attr.res.status,  id: idOf(results.attr.res),  err: results.attr.res.ok?undefined:JSON.stringify(results.attr.res.data).slice(0,300) },
};

// Save DSL templates (request shapes, parameterized) — redact any secret-ish field
const templates = {
  generatedAt: new Date().toISOString(), by:'Pike-ISV-V', tenant: new URL(page.url()).host,
  note:'Plantillas de ops Verify verificadas via token admin. {{param}} = sustituir. Bodies sin secretos.',
  ops: {
    'create-group': { method:'POST', path:'/v2.0/Groups', headers:{'Content-Type':'application/scim+json'},
      body: { ...GROUP_BODY, displayName:'{{groupName}}', 'urn:ietf:params:scim:schemas:extension:ibm:2.0:Group':{ description:'{{description}}' } },
      verified: created.group.ok, status: created.group.status },
    'create-user': { method:'POST', path:'/v2.0/Users', headers:{'Content-Type':'application/scim+json'},
      body: { ...USER_BODY, userName:'{{userName}}', name:{givenName:'{{givenName}}',familyName:'{{familyName}}'}, emails:[{type:'work',value:'{{email}}'}] },
      verified: created.user.ok, status: created.user.status },
    'create-attribute': { method:'POST', path:'/v1.0/attributes', headers:{'Content-Type':'application/json'},
      body: { ...ATTR_BODY, name:'{{attrName}}', displayName:'{{displayName}}', description:'{{description}}' },
      verified: created.attr.ok, status: created.attr.status },
  }
};
writeFileSync(resolve(HERE,'isv-dsl-templates.json'), JSON.stringify(templates, null, 2));

console.log(JSON.stringify({ ok:true, created, templatesFile:'janus/isv-dsl-templates.json' }, null, 2));
process.exit(0);
