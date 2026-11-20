#!/usr/bin/env node
// login-flow — Pike's optimized + self-healing SSO login (IBM Verify -> WordPress wp-admin).
// ONE persistent CDP connection, smart waits (no fixed sleeps), state-aware (idempotent),
// and AUTO re-auth via IBMid -> "Continue with Google" when the IBM session expired.
// Usage: node login-flow.mjs [--portal URL] [--quiet]
import { chromium } from 'playwright-core';

const CDP = process.env.PWEB_CDP || 'http://127.0.0.1:9222';
const PORTAL = argVal('--portal') || 'https://YOUR-TENANT.verify.ibm.com/usc';
const QUIET = process.argv.includes('--quiet');
function argVal(f){const i=process.argv.indexOf(f);return i!==-1?process.argv[i+1]:null;}
function log(...a){ if(!QUIET) console.error(...a); }

const t0 = Date.now();
const marks = [];
function mark(name){ const ms = Date.now()-t0; marks.push([name,ms]); log(`  [${ms}ms] ${name}`); }

const clickByText = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const el = [...document.querySelectorAll('a,button,li,.bx--dropdown-text,.bx--dropdown-link,.bx--dropdown-item,.id-source-option')]
    .find(e => rx.test(e.textContent.trim()));
  if (!el) return false; el.click(); return true;
}, re.source);

async function main(){
  const browser = await chromium.connectOverCDP(CDP);
  mark('cdp-connected');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const allPages = () => browser.contexts().flatMap(c => c.pages()).filter(p => /^https?:/.test(p.url()));

  // 1) Short-circuit: already on wp-admin?
  let wp = allPages().find(p => /\/wp-admin\/?/.test(p.url()) && /wordpress/i.test(p.url()));
  if (wp) { mark('already-logged-in'); return done(wp, 'short-circuit'); }

  // 2) Open/reuse portal tab, settle redirects.
  let portal = allPages().find(p => p.url().startsWith(PORTAL.replace(/\/$/,'')));
  if (portal) { mark('reuse-portal-tab'); }
  else { portal = await ctx.newPage(); await portal.goto(PORTAL, { waitUntil: 'domcontentloaded' }); mark('portal-opened'); }
  await settle(portal);

  // 3) If not at the App center, attempt auto re-auth (IBMid -> Continue with Google).
  if (!(await atAppCenter(portal))) {
    mark('needs-login');
    const ok = await autoReauth(portal);
    if (!ok) {
      console.log(JSON.stringify({ ok:false, state:'NEEDS_LOGIN', msg:'Re-auth requiere a Fabián (Google pidió clave/MFA o IdP distinto)', url:portal.url(), marks }));
      process.exit(2);
    }
    mark('reauth-ok');
  }

  // 4) Launch WordPress Admin tile (opens a new tab).
  await portal.waitForSelector('.app-tile-wrapper', { timeout: 15000 });
  const tilePromise = ctx.waitForEvent('page');
  await portal.evaluate(() => {
    const t = [...document.querySelectorAll('.app-tile-wrapper')].find(x => /WordPress Admin/i.test(x.textContent));
    (t.querySelector('button.btn-app-action') || t).click();
  });
  wp = await tilePromise;
  await wp.waitForLoadState('domcontentloaded');
  mark('wp-tab-opened');

  // 5) Already wp-admin? else click "Iniciar sesión con IBM Verify" and wait for redirect.
  if (/\/wp-admin\/?/.test(wp.url())) { mark('direct-wp-admin'); return done(wp, 'direct'); }
  await wp.waitForSelector('a:has-text("IBM Verify"), button:has-text("IBM Verify")', { timeout: 15000 });
  await Promise.all([
    wp.waitForURL(/\/wp-admin\/?/, { timeout: 20000 }),
    clickByText(wp, /IBM Verify/),
  ]);
  mark('sso-redirected');
  return done(wp, 'full-sso');
}

// Wait for the portal to finish redirecting to either App center or a login screen.
async function settle(page){
  await page.waitForLoadState('domcontentloaded').catch(()=>{});
  await page.waitForFunction(() => {
    const t = document.body ? document.body.innerText : '';
    return /App center/i.test(t) || /Cloud Directory|User name|Log in to IBM/i.test(t);
  }, { timeout: 15000 }).catch(()=>{});
}

async function atAppCenter(page){
  const t = await page.innerText('body').catch(()=> '');
  return /App center/i.test(t) && /WordPress Admin/i.test(t);
}

// IBMid -> "Continue with Google". Works unattended when the profile holds the Google session.
async function autoReauth(portal){
  // Cloud Directory screen: open "Sign in another way" and pick IBMid.
  await clickByText(portal, /Sign in another way/).catch(()=>{});
  await portal.waitForTimeout(600);
  const pickedIbmid = await clickByText(portal, /^IBMid$/);
  if (!pickedIbmid) {
    // Maybe already on the IBMid page.
    const txt = await portal.innerText('body').catch(()=> '');
    if (!/Continue with Google|Log in to IBM/i.test(txt)) return false;
  }
  // Wait to arrive at login.ibm.com with the Google button.
  await portal.waitForFunction(() => /Continue with Google/i.test(document.body?.innerText||''),
    { timeout: 15000 }).catch(()=>{});
  const g = await clickByText(portal, /Continue with Google/);
  if (!g) return false;
  // Back at App center? (Google session reused silently.) Allow a Google account chooser pause.
  try {
    await portal.waitForFunction(() => /App center/i.test(document.body?.innerText||''), { timeout: 20000 });
    return true;
  } catch { return false; }
}

async function done(page, path){
  const user = await page.evaluate(() => {
    const u = document.querySelector('#wp-admin-bar-my-account .display-name, #wpadminbar .display-name');
    return u ? u.textContent.trim() : null;
  }).catch(()=>null);
  console.log(JSON.stringify({ ok:true, path, user, url: page.url(), total_ms: Date.now()-t0, marks }));
  process.exit(0);
}

await main();
