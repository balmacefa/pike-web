#!/usr/bin/env node
// JANUS recorder — watch a HUMAN drive Chrome and auto-convert the interaction into an
// engine DSL recipe. Closes the agile loop: record once -> draft recipe -> Pike polishes.
//
// Usage: node recorder.mjs --name <recipeName> [--seconds 90] [--out recipes.json] [--start URL]
// While it runs, the human performs the flow in the Chrome at CDP 9222. At the end it prints
// a draft recipe and (unless --no-save) appends it to the recipe book.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REC = readFileSync(resolve(HERE, 'recorder-inject.js'), 'utf8');
const BOOK = resolve(HERE, '..', 'recipes.json');
const CDP = process.env.PWEB_CDP || 'http://127.0.0.1:9222';
const A = process.argv.slice(2);
const opt = (f, d) => { const i = A.indexOf(f); return i !== -1 ? A[i + 1] : d; };
const NAME = opt('--name', 'nueva-receta');
const SECONDS = Number(opt('--seconds', 90));
const START = opt('--start', null);
const SAVE = !A.includes('--no-save');

const esc = s => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0] || await browser.newContext();
const events = [];
const MARK = '@@JANUSREC@@';

function onConsole(pageUrlFn){
  return msg => {
    const txt = msg.text();
    const i = txt.indexOf(MARK);
    if (i === -1) return;
    let ev; try { ev = JSON.parse(txt.slice(i + MARK.length)); } catch { return; }
    ev.page = pageUrlFn();
    events.push(ev);
    console.error(`  • ${ev.type.padEnd(5)} "${(ev.text || ev.field || '').slice(0,30)}" @ ${(ev.sig.title || ev.sig.h[0] || '').slice(0,30)}`);
  };
}
async function wire(p){
  try {
    p.on('console', onConsole(() => p.url()));
    await p.evaluate(() => { try { delete window.__janusRec; } catch(e){} }).catch(() => {}); // clear stale injection
    await p.evaluate(REC).catch(() => {});
    const reinject = () => p.evaluate(REC).catch(() => {});
    p.on('load', reinject);
    p.on('framenavigated', f => { if (f === p.mainFrame()) reinject(); });
  } catch {}
}
for (const p of ctx.pages()) await wire(p);                    // already-open pages
ctx.on('page', async p => { events.push({ type: 'newtab', t: Date.now(), page: p.url(), sig: { url: p.url(), title: '', h: [], body: '' } }); await wire(p); });

console.error(`\n🔴 GRABANDO ${SECONDS}s — hacé el flujo en Chrome ahora (clicks, typing, navegación)...\n`);
await sleep(SECONDS * 1000);
console.error(`\n⏹  fin. ${events.length} eventos capturados.\n`);

// ---- convert events -> recipe DSL ------------------------------------------------------
const newtabs = events.filter(e => e.type === 'newtab');
const opensTab = e => newtabs.some(nt => nt.t >= e.t && nt.t - e.t < 2500);
const acts = events.filter(e => e.type === 'click' || e.type === 'type');
const steps = [];
let cur = null, key = null; let manualAuth = false;
for (const e of acts) {
  const k = e.sig.title || e.sig.h[0] || e.page;
  if (k !== key) { cur = { at: { textMatch: esc(e.sig.h[0] || e.sig.title || e.sig.body || '') }, do: [] }; steps.push(cur); key = k; }
  if (e.type === 'click') {
    if (e.text) cur.do.push(opensTab(e) ? ['openTabClickText', esc(e.text)] : ['clickText', esc(e.text)]);
    else if (e.sel) cur.do.push(['click', e.sel]);
  } else { // type
    if (e.isPassword) { manualAuth = true; cur.do.push(['_human', 'enter password/secret (Pike no lo automatiza)']); }
    else cur.do.push(['type', e.sel || 'input', (e.field || 'value').replace(/[^a-z0-9]/gi, '_') || 'value']);
  }
}
const lastPage = acts.length ? acts[acts.length - 1].page : (events.slice(-1)[0] && events.slice(-1)[0].page);
let goalPath = ''; try { goalPath = new URL(lastPage).pathname; } catch { goalPath = lastPage || ''; }
const startUrl = START || (events.find(e => e.sig && e.sig.url) || {}).sig?.url || acts[0]?.page;

const recipe = { name: NAME, _recorded: new Date().toISOString(), _draft: true,
  manualAuth: manualAuth || undefined,
  start: startUrl, goal: { urlMatch: esc(goalPath) }, steps };

console.log(JSON.stringify(recipe, null, 2));

if (SAVE) {
  const book = existsSync(BOOK) ? JSON.parse(readFileSync(BOOK, 'utf8')) : { recipes: {} };
  book.recipes[NAME] = recipe;
  writeFileSync(BOOK, JSON.stringify(book, null, 2));
  console.error(`\n💾 guardada como "${NAME}" en recipes.json (borrador — Pike la revisa/pule).`);
}
process.exit(0);
