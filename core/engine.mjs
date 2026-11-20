#!/usr/bin/env node
// engine — Pike's generic, memory-backed, self-healing web-flow engine.
//
// COMBINATION OF MEMORY + GENERIC SCRIPTING:
//   * GENERIC: the engine is a tiny state-machine interpreter. It knows NO site. All the
//     smart behavior is built in and applies to EVERY site by default:
//       - ONE persistent CDP connection, state-aware ticks, short-circuit on goal,
//       - smart waits (polls until a known state settles; no fixed sleeps),
//       - self-healing (login/expired screens are just states),
//       - follows new tabs by the 'page' event (no fragile indices).
//   * MEMORY: each website is a declarative RECIPE stored as DATA (a mini-DSL, JSON) in the
//     recipe book `recipes.json` (which Pike mirrors to durable L2 memory, cross-session).
//     Adding a new site = add a recipe, not code.
//   * LEARNS WITH USE: on an unknown state the engine tries generic heuristics (reuse SSO
//     "Continue with Google / Sign in with X", generic OIDC buttons). If a heuristic moves
//     the flow forward, it appends the discovered step to the recipe (grows the memory).
//
// Usage: node core/engine.mjs <recipeName|startUrl> [--quiet] [--max=N] [--no-learn] [key=val ...]
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, decompile } from './dsl.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PWEB = resolve(HERE, 'recipes.pweb');
const JSONB = resolve(HERE, 'recipes.json');
const BOOK_SRC = existsSync(PWEB) ? 'pweb' : 'json';
const CDP = process.env.PWEB_CDP || 'http://127.0.0.1:9222';
const argv = process.argv.slice(2);
const target = argv.find(a => !a.startsWith('--') && !a.includes('='));
const QUIET = argv.includes('--quiet');
const LEARN = !argv.includes('--no-learn');
const MAX = Number((argv.find(a => a.startsWith('--max=')) || '--max=14').split('=')[1]);
const vars = Object.fromEntries(argv.filter(a => a.includes('=') && !a.startsWith('--')).map(a => a.split('=')));

const t0 = Date.now();
const marks = [];
function mark(n){ const ms=Date.now()-t0; marks.push([n,ms]); if(!QUIET) console.error(`  [${ms}ms] ${n}`); }
function out(o){ console.log(JSON.stringify(o)); }
const rx = (m) => (m instanceof RegExp ? m : new RegExp(m,'i'));

// ---- Recipe book (memory on disk; Pike syncs to L2) ----------------------------------
const book = BOOK_SRC === 'pweb' ? compile(readFileSync(PWEB,'utf8'))
  : existsSync(JSONB) ? JSON.parse(readFileSync(JSONB,'utf8'))
  : { recipes:{} };
function findRecipe(t){
  if (book.recipes[t]) return book.recipes[t];                                   // by name
  const host = (() => { try { return new URL(t).host; } catch { return null; } })();
  if (host) return Object.values(book.recipes).find(r => (r.domains||[]).includes(host));
  return null;
}
const recipe = findRecipe(target);
if (!recipe){ out({ ok:false, error:'sin receta para "'+target+'" (añádela a recipes.json o pásame la URL para aprenderla)' }); process.exit(1); }
recipe.steps = recipe.steps || [];

function matches(m, st){
  if (!m) return false;
  if (m.urlMatch  && !rx(m.urlMatch).test(st.url))  return false;
  if (m.textMatch && !rx(m.textMatch).test(st.text)) return false;
  return !!(m.urlMatch || m.textMatch);
}

const browser = await chromium.connectOverCDP(CDP);
mark('cdp-connected');
const ctx = browser.contexts()[0] || await browser.newContext();
const pages = () => browser.contexts().flatMap(c=>c.pages()).filter(p=>/^https?:/.test(p.url()));

// ---- DSL interpreter: a recipe `do` is a list of ops; ops are data, not code ----------
async function runOps(ops, getPage){
  let switchTo = null;
  const P = () => getPage();
  for (const op of ops){
    const [k, ...a] = op;
    if (k==='clickText')      await clickText(P(), a[0]);
    else if (k==='click')     await P().click(a[0]);
    else if (k==='type')      await P().fill(a[0], vars[a[1]] ?? a[1]);
    else if (k==='wait')      await P().waitForTimeout(a[0]);
    else if (k==='waitText')  await P().waitForFunction(s=>new RegExp(s,'i').test(document.body?.innerText||''), a[0], { timeout:a[1]||15000 }).catch(()=>{});
    else if (k==='waitUrl')   await P().waitForURL(rx(a[0]), { timeout:a[1]||20000 });
    else if (k==='waitSel')   await P().waitForSelector(a[0], { timeout:a[1]||15000 });
    else if (k==='clickAndWaitUrl') await Promise.all([ P().waitForURL(rx(a[1]), { timeout:a[2]||20000 }), clickText(P(), a[0]) ]);
    else if (k==='openTabClickTile') switchTo = await openTabOn(()=>P().evaluate(t=>{const el=[...document.querySelectorAll('.app-tile-wrapper')].find(x=>new RegExp(t,'i').test(x.textContent));(el.querySelector('button.btn-app-action')||el).click();}, a[0]));
    else if (k==='openTabClickText') switchTo = await openTabOn(()=>clickText(P(), a[0]));
    else throw new Error('op desconocida: '+k);
  }
  return switchTo;
}
function clickText(page, re){
  return page.evaluate(s=>{
    const r=new RegExp(s,'i');
    const el=[...document.querySelectorAll('a,button,li,[role=button],.bx--dropdown-text,.bx--dropdown-link,.bx--dropdown-item,.id-source-option')].find(e=>r.test(e.textContent.trim()));
    if(!el) return false; el.click(); return true;
  }, re);
}
async function openTabOn(actionFn){ const ev=ctx.waitForEvent('page'); await actionFn(); const np=await ev; await np.waitForLoadState('domcontentloaded'); return np; }

// ---- Generic heuristics: used on UNKNOWN states; what works gets learned into the recipe
const HEURISTICS = [
  { name:'reuse-google-sso', when:/Continue with Google|Sign in with Google/i,
    step:{ at:{ textMatch:'Continue with Google|Sign in with Google' }, do:[['clickText','Continue with Google|Sign in with Google']] } },
  { name:'oidc-generic-sso', when:/Sign in with|Iniciar sesión con|Log in with|Continue with/i,
    step:{ at:{ textMatch:'Sign in with|Iniciar sesión con|Log in with|Continue with' }, do:[['openTabClickText','Sign in with|Iniciar sesión con|Log in with|Continue with']] } },
];

async function stable(page, timeout=15000){
  const end=Date.now()+timeout; let last={url:page.url(),text:''};
  while(Date.now()<end){
    last={ url:page.url(), text:await page.innerText('body').catch(()=> '') };
    if (matches(recipe.goal,last) || recipe.steps.some(s=>matches(s.at,last))) return last;
    await page.waitForTimeout(300);
  }
  return last;
}

async function userName(page){
  if(!recipe.user?.selector) return null;
  return page.evaluate(s=>{const e=document.querySelector(s);return e?e.textContent.trim():null;}, recipe.user.selector).catch(()=>null);
}

async function run(){
  let active = pages().find(p => matches(recipe.goal,{url:p.url(),text:''}));
  if (active){ mark('goal-already-open'); return finish(active,'short-circuit'); }

  const base = recipe.start.replace(/\/$/,'');
  active = pages().find(p => p.url().startsWith(base));
  if (active) mark('reuse-start-tab');
  else { active = await ctx.newPage(); await active.goto(recipe.start,{waitUntil:'domcontentloaded'}); mark('start-opened'); }

  let learned=false;
  for (let i=0;i<MAX;i++){
    const st = await stable(active);
    if (matches(recipe.goal, st)){ mark('goal-reached'); if(learned) saveBook(); return finish(active, i===0?'warm':'full'); }

    let rule = recipe.steps.find(s=>matches(s.at,st));
    if (!rule && LEARN){                                   // try to LEARN this state
      const h = HEURISTICS.find(h=>h.when.test(st.text));
      if (h){ rule = h.step; recipe.steps.push(h.step); learned=true; mark('learned:'+h.name); }
    }
    if (!rule){ out({ ok:false, state:'UNKNOWN', msg:'estado no reconocido', url:st.url, textHead:st.text.slice(0,140), marks }); process.exit(2); }

    mark('step:'+(rule.at.textMatch||rule.at.urlMatch||'?'));
    try { const sw = await runOps(rule.do, ()=>active); if (sw) active = sw; }
    catch(e){ out({ ok:false, state:'HANDLER_ERROR', msg:String(e), marks }); process.exit(2); }
  }
  out({ ok:false, state:'MAX_STEPS', msg:'no alcanzó el goal', marks }); process.exit(2);
}
function saveBook(){ try{ if (BOOK_SRC === 'pweb') writeFileSync(PWEB, decompile(book)); else writeFileSync(JSONB, JSON.stringify(book,null,2)); mark('recipe-updated'); }catch{} }
async function finish(page, path){ out({ ok:true, recipe:recipe.name, path, user:await userName(page), url:page.url(), total_ms:Date.now()-t0, marks }); process.exit(0); }

await run();
