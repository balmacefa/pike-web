#!/usr/bin/env node
// simulate-logins-ropc — simula logins MASIVOS de muchos usuarios por API (sin navegador).
// Grant ROPC (password) contra el token endpoint OIDC de IBM Verify. Cada llamada = 1 evento
// de login REAL (aparece en reports auth_total_logins / dashboard). Carril "api" del plan.
//
// Tenant soporta grant_types: password ✅ (verificado en /oauth2/.well-known/openid-configuration).
//
// SECRETOS POR ENV (nunca hardcodear):
//   ROPC_CLIENT_ID, ROPC_CLIENT_SECRET   -> app OIDC con grant 'password' habilitado
//   ISV_TOKEN_ENDPOINT (opcional)        -> default https://<tenant>/oauth2/token
//
// ENTRADA: JSON array [{username,password}] por --users=archivo.json  (o stdin)
// Uso:
//   ROPC_CLIENT_ID=.. ROPC_CLIENT_SECRET=.. node simulate-logins-ropc.mjs --users=users.json [--rounds=1] [--concurrency=10] [--scope="openid"]
import { readFileSync } from 'node:fs';

const argv = Object.fromEntries(process.argv.slice(2).map(a=>{const m=a.match(/^--([^=]+)=?(.*)$/);return m?[m[1],m[2]||true]:[a,true];}));
const TENANT = process.env.ISV_TENANT || 'https://YOUR-TENANT.verify.ibm.com';
const TOKEN_URL = process.env.ISV_TOKEN_ENDPOINT || `${TENANT}/oauth2/token`;
const CLIENT_ID = process.env.ROPC_CLIENT_ID;
const CLIENT_SECRET = process.env.ROPC_CLIENT_SECRET;
const SCOPE = argv.scope || 'openid';
const ROUNDS = Number(argv.rounds || 1);
const CONC = Number(argv.concurrency || 10);

if (!CLIENT_ID || !CLIENT_SECRET){ console.error('FALTAN ROPC_CLIENT_ID / ROPC_CLIENT_SECRET (env).'); process.exit(1); }
const src = argv.users ? readFileSync(argv.users,'utf8') : readFileSync(0,'utf8');
let users = JSON.parse(src);
if (!Array.isArray(users)){ console.error('--users debe ser un JSON array [{username,password}]'); process.exit(1); }

async function login(u){
  const body = new URLSearchParams({ grant_type:'password', username:u.username, password:u.password,
    scope:SCOPE, client_id:CLIENT_ID, client_secret:CLIENT_SECRET });
  const t0 = Date.now();
  try{
    const r = await fetch(TOKEN_URL, { method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded', 'Accept':'application/json' }, body });
    const ms = Date.now()-t0; let j=null; try{ j=await r.json(); }catch{}
    return { user:u.username, status:r.status, ok:r.ok && !!j?.access_token, ms, err: r.ok?null:(j?.error_description||j?.error||('HTTP '+r.status)) };
  }catch(e){ return { user:u.username, status:0, ok:false, ms:Date.now()-t0, err:String(e) }; }
}

// pool con límite de concurrencia
async function runPool(tasks, n){
  const res=[]; let i=0;
  const workers = Array.from({length:Math.min(n,tasks.length)}, async ()=>{
    while(i<tasks.length){ const idx=i++; res[idx]=await tasks[idx](); }
  });
  await Promise.all(workers); return res;
}

const jobs = [];
for (let r=0;r<ROUNDS;r++) for (const u of users) jobs.push(()=>login(u));
const t0 = Date.now();
const results = await runPool(jobs, CONC);
const ok = results.filter(x=>x.ok).length, fail = results.length-ok;
const lat = results.map(x=>x.ms).sort((a,b)=>a-b);
const p = q => lat.length? lat[Math.floor((lat.length-1)*q)] : 0;
const errs = {}; results.filter(x=>!x.ok).forEach(x=>{errs[x.err]=(errs[x.err]||0)+1;});
console.log(JSON.stringify({ carril:'api-ropc', token_url:TOKEN_URL, total:results.length, ok, fail,
  wall_ms:Date.now()-t0, latency_ms:{ p50:p(.5), p90:p(.9), p99:p(.99), max:lat[lat.length-1]||0 },
  errors:errs,
  hint:'Ver el pico en Verify: POST /v1.0/reports/auth_total_logins {FROM,TO:"now"} o el dashboard.' }, null, 2));
