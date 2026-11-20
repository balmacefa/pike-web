#!/usr/bin/env bash
# Baseline: the current multi-process style (one `node core/pweb.mjs` per step + fixed sleeps).

cd "$(dirname "$0")/.."
PORTAL="https://YOUR-TENANT.verify.ibm.com/usc"
node core/pweb.mjs nav "$PORTAL" >/dev/null 2>&1
node core/pweb.mjs wait 3500 >/dev/null 2>&1
node core/pweb.mjs eval "(()=>{const t=[...document.querySelectorAll('.app-tile-wrapper')].find(x=>/WordPress Admin/i.test(x.textContent));(t.querySelector('button.btn-app-action')||t).click();return 1})()" >/dev/null 2>&1
sleep 6
node core/pweb.mjs eval "(()=>{const el=[...document.querySelectorAll('a,button')].find(e=>/IBM Verify/i.test(e.textContent));if(el)el.click();return 1})()" --tab 2 >/dev/null 2>&1
sleep 6
node core/pweb.mjs read body --tab 2 >/dev/null 2>&1
echo "baseline done"
