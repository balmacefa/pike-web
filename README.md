# pike-web

Browser/swarm toolbox that drives a running Chrome over CDP (DevTools 9222) to
automate web flows, record declarative recipes, and coordinate a small swarm of
agent workers ("Olimpo"). Node ESM, depends on `playwright-core`.

> Public release: tenant-specific data, admin screenshots and personal
> identifiers have been redacted/removed. Hostnames like
> `YOUR-TENANT.verify.ibm.com` and `YOUR-COOLIFY.example.com` are placeholders —
> set your own before running.

## Layout

| Path | What it is |
|------|-----------|
| `pweb.mjs` | Hands on Chrome: `tabs/goto/click/type/read/eval/shot/wait` over CDP |
| `engine.mjs` | Runs declarative recipes from `recipes.json` (self-healing state machine) |
| `recorder.mjs` + `recorder-inject.js` | Record human interaction into a recipe draft |
| `janus/` | IBM Verify ("JANUS") automation layer: runner, in-page kit, references |
| `olimpo-registry.mjs`, `pike-*.mjs/.sh` | Swarm plumbing: workers, inbox, escalation |
| `tests/` | CLI/worker test suite |

## Requirements

- Node 18+ (ESM)
- A Chrome started with `--remote-debugging-port=9222` (see `pike-chrome.sh`)

```bash
npm install
bash pike-chrome.sh        # launch Chrome in debug mode
node pweb.mjs tabs         # list open tabs
```

## Notes

- Never prints secrets; credentials are expected to be injected at runtime.
- `*.png` demo screenshots and `janus/isv-catalog.json` (a tenant dump) are
  intentionally excluded from this repository.

## License

MIT
