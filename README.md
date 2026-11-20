# pike-web

Browser toolbox that drives a running Chrome over CDP (DevTools 9222) to automate web flows and record declarative recipes. Node ESM, depends on `playwright-core`.

> Public release: tenant-specific data, admin screenshots and personal
> identifiers have been redacted/removed. Hostnames like
> `YOUR-TENANT.verify.ibm.com` and `YOUR-COOLIFY.example.com` are placeholders —
> set your own before running.

## Layout

| Path | What it is |
|------|-----------|
| `core/` | Browser engine: `pweb.mjs` (CDP hands), `engine.mjs` (recipe runner), `recipes.json` |
| `scripts/` | Launchers: start Chrome in CDP debug mode (`pike-chrome.sh` / `.cmd`), `cockpit.bat` |
| `janus/` | IBM Verify ("JANUS") automation layer: runner, in-page kit, recorder, references |
| `isv/` | Demo auth flows against IBM Verify / ISV: login, SCIM, n8n injection, simulators |
| `bench/` | Benchmark/reset helpers |

## Requirements

- Node 18+ (ESM)
- A Chrome started with `--remote-debugging-port=9222` (see `scripts/pike-chrome.sh`)

```bash
npm install
bash scripts/pike-chrome.sh        # launch Chrome in debug mode
node core/pweb.mjs tabs         # list open tabs
```

## Notes

- Never prints secrets; credentials are expected to be injected at runtime.
- `*.png` demo screenshots and `janus/isv-catalog.json` (a tenant dump) are
  intentionally excluded from this repository.

## License

MIT

## Recipe DSL (AI-ready)

Recipes are authored in a compact, line-oriented DSL (`core/recipes.pweb`) that
compiles to the JSON `engine.mjs` runs. It is ~3x denser than the JSON and far
easier for a human or an LLM to write without syntax errors. `engine.mjs` loads
`recipes.pweb` directly (falling back to `recipes.json`).

```
recipe wp-ibm
  desc  Login SSO IBM Verify -> wp-admin
  start https://YOUR-TENANT.verify.ibm.com/usc
  goal  url /wp-admin
  user  sel #wpadminbar .display-name

  on text "Cloud Directory"
    clickText "Sign in another way"
    wait 600
    clickText "^IBMid$"
    waitText "Continue with Google|App center" 15000
```

Tooling (round-trip is loss-free, validated in `tests/`):

```bash
node core/compile.mjs   core/recipes.pweb core/recipes.json   # DSL  -> JSON (+ --strict)
node core/decompile.mjs core/recipes.json core/recipes.pweb   # JSON -> DSL (migrate)
npm test                                                      # round-trip + validation
```
