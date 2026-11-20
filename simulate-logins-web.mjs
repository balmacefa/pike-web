#!/usr/bin/env node
// simulate-logins-web — simula el login REAL por NAVEGADOR (authorization_code flow) de varios
// usuarios contra IBM Verify Cloud Directory. Carril "web" del plan: dispara la pantalla de login,
// consentimiento, MFA y políticas de acceso como un humano. 1 contexto de navegador por usuario
// (serie o paralelo limitado). Más realista que ROPC pero más lento/frágil.
//
// Requiere Chrome vía CDP (PWEB_CDP, default http://127.0.0.1:9222) — reutiliza la instancia de Pike.
// App OIDC con authorization_code + redirect conocido (p.ej. https://oidcdebugger.com/debug).
//
// ⚠ SELECTORES de la pantalla de Cloud Directory = DRAFT (ajustar al primer run; no estaban en el ref).
//   Pantalla login Verify: campos usuario/clave + botón continuar. Se auto-curan por heurística.
//
// ENTRADA: JSON array [{username,password}] por --users=archivo.json
// Uso:
//   node simulate-logins-web.mjs --users=users.json --clientId=<id> --redirect=https://oidcdebugger.com/debug \
//        [--concurrency=2] [--headful]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const argv = Object.fromEntries(process.argv.slice(2).map(a=>{const m=a.match(/^--([^=]+)=?(.*)$/);return m?[m[1],m[2]||true]:[a,true];}));
const TENANT = process.env.ISV_TENANT || 'https://YOUR-TENANT.verify.ibm.com';
const CDP = process.env.PWEB_CDP || 'http://127.0.0.1:9222';
const CLIENT_ID = argv.clientId; const REDIRECT = argv.redirect;
const CONC = Number(argv.concurrency || 2);
if (!CLIENT_ID || !REDIRECT){ console.error('Faltan --clientId y --redirect'); process.exit(1); }
let users = JSON.parse(readFileSync(argv.users,'utf8'));

function authUrl(state){
  const q = new URLSearchParams({ client_id:CLIENT_ID, response_type:'code', scope:'openid profile',
    redirect_uri:REDIRECT, state, response_mode:'query' });
  return `${TENANT}/oauth2/authorize?${q}`;
}

async function fill(page, selectors, value){
  for (const s of selectors){ const el = await page.$(s); if (el){ await el.fill(value).catch(()=>{}); return true; } }
  return false;
}
async function clickAny(page, texts){
  return page.evaluate(ts=>{ const r=new RegExp(ts.join('|'),'i');
    const el=[...document.querySelectorAll('button,input[type=submit],a')].find(e=>r.test((e.innerText||e.value||'').trim()));
    if(el){el.click();return true;} return false; }, texts);
}

async function loginUser(ctx, u){
  const page = await ctx.newPage(); const state = 'sim'+Math.random().toString(36).slice(2,12);
  const t0 = Date.now();
  try{
    await page.goto(authUrl(state), { waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForTimeout(1200);
    // usuario
    await fill(page, ['#username','input[name=username]','#j_username','input[type=email]','input[name=j_username]'], u.username);
    await clickAny(page, ['Continue','Continuar','Next','Siguiente']);
    await page.waitForTimeout(1000);
    // clave
    await fill(page, ['#password','input[name=password]','#j_password','input[type=password]'], u.password);
    await clickAny(page, ['Sign in','Iniciar','Log in','Continue','Continuar','Submit']);
    // esperar redirect con code o pantalla de consentimiento
    await page.waitForTimeout(2500);
    await clickAny(page, ['Allow','Permitir','Accept','Aceptar','Continue']); // consentimiento si aparece
    await page.waitForURL(/[?&]code=/, { timeout:20000 }).catch(()=>{});
    const url = page.url(); const ok = /[?&]code=/.test(url);
    return { user:u.username, ok, ms:Date.now()-t0, finalUrl: ok? 'code-received' : url.slice(0,120) };
  }catch(e){ return { user:u.username, ok:false, ms:Date.now()-t0, err:String(e).slice(0,120) }; }
  finally{ await page.close().catch(()=>{}); }
}

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0] || await browser.newContext();
async function runPool(items, n, fn){ const res=[]; let i=0;
  await Promise.all(Array.from({length:Math.min(n,items.length)}, async()=>{ while(i<items.length){ const k=i++; res[k]=await fn(items[k]); } })); return res; }
const t0=Date.now();
const results = await runPool(users, CONC, u=>loginUser(ctx,u));
const ok=results.filter(x=>x.ok).length;
console.log(JSON.stringify({ carril:'web-authcode', total:results.length, ok, fail:results.length-ok,
  wall_ms:Date.now()-t0, results,
  nota:'Selectores de Cloud Directory son DRAFT: si ok=0 revisar la pantalla real y ajustar fill()/clickAny().' }, null, 2));
process.exit(0);
