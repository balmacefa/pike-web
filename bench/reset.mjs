// Close WP tabs so a login trial starts from a comparable state (IBM session stays).
import { chromium } from 'playwright-core';
const CDP = process.env.PWEB_CDP || 'http://127.0.0.1:9222';
const b = await chromium.connectOverCDP(CDP);
for (const c of b.contexts()) for (const p of c.pages()) {
  if (/wordpress.*balmacefa\.com/i.test(p.url())) await p.close().catch(()=>{});
}
console.log('reset ok');
process.exit(0);
