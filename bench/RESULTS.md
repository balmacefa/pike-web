# ce-optimize — Target: tiempo del login SSO (IBM Verify → wp-admin)

Chrome CDP 9222, perfil chrome_pike_debug. Workload: portal → lanzar WordPress → SSO → wp-admin.

## Baseline (estilo actual: 1 proceso `node core/pweb.mjs` por paso + sleeps fijos 3.5s+6s+6s)
- Overhead por comando: ~750 ms (relanza Node+Playwright+connect CDP cada vez)
- Flujo completo: **~15.2 s** (15216 / 15195 / 15134 ms) — y frágil (`--tab N` quebradizo, no siempre llega a wp-admin)

## Optimizado (login-flow.mjs: 1 sola conexión CDP + esperas inteligentes + state-aware)
- Full SSO: **~3.7 s** (3624 / 3318 / 4294 ms)  → **~76% menos**
- Ya logueado (short-circuit): **65 ms**        → **~99.6% menos**

## Self-healing (auto re-auth) — NUEVO
Cuando la sesión IBM caducó, el flujo se recupera SOLO (sin Fabián, el perfil tiene la sesión Google):
- Detecta login → "Sign in another way" → IBMid → login.ibm.com → "Continue with Google" → App center → WordPress → IBM Verify → wp-admin.
- Flujo en frío completo (con re-auth): **~12.2 s** desde sesión cerrada hasta wp-admin, unattended.
  - needs-login 1.8s · re-auth (redirects IBMid→Google) ~6.7s (network) · wp-tab 1.1s · sso 2.5s.

### Tres escenarios
| Estado | Tiempo | vs baseline |
|---|---|---|
| Ya logueado (short-circuit) | 65 ms | ~99.6% menos |
| Sesión IBM activa (warm) | ~3.3 s | ~78% menos |
| Sesión cerrada (cold + auto re-auth) | ~12.2 s | hace solo lo que antes requería intervención manual |

## Qué cambió (las palancas)
1. **1 conexión CDP** para todo el flujo (paga ~750ms UNA vez, no 8×).
2. **Esperas inteligentes**: `waitForSelector`/`waitForURL`/`waitForEvent('page')` en vez de `sleep 6` fijos → avanza apenas el DOM está listo.
3. **State-aware / idempotente**: detecta si ya hay pestaña en /wp-admin → short-circuit; detecta `NEEDS_LOGIN` (sesión IBM caducada) → devuelve estado en vez de colgarse.
4. **Robusto**: usa el evento de nueva pestaña (no índices `--tab N` frágiles).

## Nota de auth
La sesión IBM Verify caduca rápido. Re-auth = IBMid → "Continue with Google" (el perfil ya tiene la sesión Google, entra sin clave). Esa parte requiere a Fabián si Google pidiera clave/MFA; el resto es 100% automatizable.

## Uso
`node isv/login-flow.mjs [--portal URL] [--quiet]` — imprime JSON {ok, path, user, url, total_ms, marks}.
