#!/usr/bin/env node
// pweb — Pike's hands in Chrome. Connects over CDP to an already-running Chrome.
// Usage: node pweb.mjs <cmd> [args...]   (CDP endpoint via PWEB_CDP, default http://127.0.0.1:9222)
import { chromium } from 'playwright-core';

const CDP = process.env.PWEB_CDP || 'http://127.0.0.1:9222';
const [, , cmd, ...args] = process.argv;

function out(obj) { console.log(JSON.stringify(obj, null, 2)); }
function fail(msg) { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(1); }

// Pick the page: by index (--tab N) or the last non-extension http(s) page.
async function pickPage(context, browser) {
  let pages = [];
  for (const c of browser.contexts()) pages.push(...c.pages());
  pages = pages.filter(p => /^https?:/.test(p.url()));
  const tabFlag = args.indexOf('--tab');
  if (tabFlag !== -1) return pages[Number(args[tabFlag + 1])];
  return pages[pages.length - 1] || (await context.newPage());
}

const browser = await chromium.connectOverCDP(CDP).catch(e => fail('cannot connect CDP: ' + e.message));
const context = browser.contexts()[0] || await browser.newContext();

try {
  switch (cmd) {
    case 'tabs': {
      const list = [];
      for (const c of browser.contexts())
        for (const p of c.pages()) list.push({ url: p.url(), title: await p.title().catch(() => '') });
      out({ ok: true, tabs: list });
      break;
    }
    case 'goto': {
      const page = await context.newPage();
      await page.goto(args[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
      out({ ok: true, url: page.url(), title: await page.title() });
      break;
    }
    case 'nav': { // navigate current/last tab
      const page = await pickPage(context, browser);
      await page.goto(args[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
      out({ ok: true, url: page.url(), title: await page.title() });
      break;
    }
    case 'click': {
      const page = await pickPage(context, browser);
      await page.click(args[0], { timeout: 15000 });
      out({ ok: true, clicked: args[0], url: page.url() });
      break;
    }
    case 'type': {
      const page = await pickPage(context, browser);
      await page.fill(args[0], args[1], { timeout: 15000 });
      out({ ok: true, typed: args[1], into: args[0] });
      break;
    }
    case 'press': {
      const page = await pickPage(context, browser);
      await page.keyboard.press(args[0]);
      out({ ok: true, pressed: args[0] });
      break;
    }
    case 'read': { // innerText of a selector (or body)
      const page = await pickPage(context, browser);
      const sel = args[0] || 'body';
      const txt = await page.locator(sel).first().innerText({ timeout: 15000 });
      out({ ok: true, selector: sel, text: txt.slice(0, 4000) });
      break;
    }
    case 'eval': { // run JS in page, return result
      const page = await pickPage(context, browser);
      const res = await page.evaluate(args[0]);
      out({ ok: true, result: res });
      break;
    }
    case 'shot': {
      const page = await pickPage(context, browser);
      const file = args[0] || 'shot.png';
      await page.screenshot({ path: file, fullPage: args.includes('--full') });
      out({ ok: true, file });
      break;
    }
    case 'wait': {
      const page = await pickPage(context, browser);
      await page.waitForSelector(args[0], { timeout: Number(args[1]) || 15000 });
      out({ ok: true, found: args[0] });
      break;
    }
    default:
      out({ ok: false, error: 'unknown cmd', cmds: ['tabs', 'goto <url>', 'nav <url>', 'click <sel>', 'type <sel> <text>', 'press <key>', 'read [sel]', 'eval <js>', 'shot [file] [--full]', 'wait <sel> [ms]'] });
  }
} catch (e) {
  fail(e.message);
} finally {
  // Do NOT close the browser — it's the user's Chrome. Just detach.
  await browser.close().catch(() => {});
}
