#!/usr/bin/env node
// JANUS — Pike's IBM Verify + WordPress-OIDC automation (ported from the Claude-in-Chrome
// skills ibm-verify-admin + wp-oidc-coolify-demo to Pike's CDP/engine world).
// Two-faced like the Roman god of gates: drives OIDC federation in both directions
// (WordPress -> Verify, and Verify -> WordPress admin).
//
// It injects the in-page kit `window.V` (verify-kit.js) into the IBM Verify tab over CDP,
// then evaluates helper expressions. The kit persists in the tab across invocations
// (dies only on a full page reload -> re-inject, which this runner does automatically).
//
// Usage:
//   node janus.mjs state                 -> V.state()
//   node janus.mjs why                   -> V.why()
//   node janus.mjs apps                  -> V.apps()
//   node janus.mjs snapshot              -> tenant snapshot (users/groups/apps/idps/logins)
//   node janus.mjs get /v2.0/identitysources
//   node janus.mjs report admin_activity 7
//   node janus.mjs "V.page()"            -> any raw expression (starts with V.|await|()
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = readFileSync(resolve(HERE, 'verify-kit.js'), 'utf8');
const DSL = readFileSync(resolve(HERE, 'verify-dsl-v2.js'), 'utf8');
const CDP = process.env.PWEB_CDP || 'http://127.0.0.1:9222';
const argv = process.argv.slice(2);
const cmd = argv[0];
if (!cmd){ console.log('uso: node janus.mjs <state|why|warm|apps|snapshot|get PATH|report NAME DAYS|dsl "<script>" [--apply]|"V.expr()">'); process.exit(1); }

// DSL v2 mode: inject the full write-capable kit and run V.run(script,{apply}).
// Script lines come from a file (dsl @file.txt) or the quoted arg. --apply commits (default = plan/dry-run).
const isDsl = cmd === 'dsl';
const dslApply = argv.includes('--apply');
function dslScript(){
  const rest = argv.slice(1).filter(a => a !== '--apply');
  if (rest[0] && rest[0].startsWith('@')) return readFileSync(resolve(process.cwd(), rest[0].slice(1)), 'utf8');
  return rest.join('\n').replace(/\\n/g, '\n');
}

// Build the in-page expression from CLI args.
function expr(){
  if (/^(V\.|await|\()/.test(cmd)) return argv.join(' ');
  switch(cmd){
    case 'get':      return `V.get(${JSON.stringify(argv[1])}).then(r=>JSON.stringify(r).slice(0,1500))`;
    case 'report':   return `V.report(${JSON.stringify(argv[1])}, Object.assign(V.range(${Number(argv[2]||7)}),{TO:String(Date.now()),SIZE:50,SORT_BY:'time',SORT_ORDER:'DESC'})).then(r=>JSON.stringify(r.data?.response?.report||r).slice(0,1500))`;
    case 'snapshot': return `(async()=>{const [u,g,a,idp,lg]=await Promise.all([V.get('/v2.0/Users?attributes=userName&count=1'),V.get('/v2.0/Groups?attributes=displayName'),V.get('/v1.0/applications'),V.get('/v2.0/identitysources'),V.report('auth_total_logins',V.range(7))]);return JSON.stringify({why:V.why(),users:u.data?.totalResults,groups:(g.data?.Resources||[]).map(x=>x.displayName),apps:(a.data?._embedded?.applications||[]).map(x=>x.name),idps:(idp.data?.identitySources||[]).map(x=>x.instanceName),logins7d:lg.data?.response?.report?.successful_logins?.doc_count}).slice(0,1800)})()`;
    default:         return `(async()=>{const r=await V.${cmd}(${argv.slice(1).map(x=>JSON.stringify(x)).join(',')});return typeof r==='string'?r:JSON.stringify(r)})()`;
  }
}

const browser = await chromium.connectOverCDP(CDP);
const pages = browser.contexts().flatMap(c=>c.pages()).filter(p=>/^https?:/.test(p.url()));
let page = pages.find(p=>/\/ui\/admin/.test(p.url()) && /verify\.ibm\.com/.test(p.url()))
        || pages.find(p=>/verify\.ibm\.com/.test(p.url()));
if (!page){ console.log(JSON.stringify({ ok:false, error:'no hay pestaña en verify.ibm.com — abre el tenant primero (o usa engine wp-ibm)' })); process.exit(2); }

// Inject the kit (idempotent) then evaluate the expression.
if (isDsl){
  // force a fresh kit so edits to verify-dsl-v2.js always take effect (keeps captured token on window.__vAuth).
  await page.evaluate(() => { try { window.V = null; } catch (e) {} }).catch(() => {});
  const injected = await page.evaluate(DSL).catch(e=>'INJECT_ERR:'+e.message);
  const script = dslScript();
  const result = await page.evaluate(
    ([src, apply]) => window.V.run(src, { apply, keepGoing: true }),
    [script, dslApply]
  ).catch(e=>'DSL_ERR:'+e.message);
  console.log(JSON.stringify({ ok:true, mode:'dsl', apply:dslApply, url: page.url(), inject: injected, result }, null, 2));
  process.exit(0);
}

const injected = await page.evaluate(KIT).catch(e=>'INJECT_ERR:'+e.message);
const result = await page.evaluate(`(async()=>{ try { const r = await (${expr()}); return typeof r==='string'?r:JSON.stringify(r); } catch(e){ return 'EVAL_ERR:'+e.message } })()`).catch(e=>'EVAL_ERR:'+e.message);
console.log(JSON.stringify({ ok:true, url: page.url(), inject: injected, result }, null, 2));
process.exit(0);
