---
name: "wp-oidc-coolify-demo"
description: "Desplegar WordPress demo en Coolify tras Cloudflare, cargar datos demo y configurarlo como proveedor OpenID (OIDC) para IBM Verify u otro RP."
---

# WP demo + OIDC IdP (Coolify/CF/Verify)

## Tabla de compresión
| Abrev | = |
|---|---|
| CL | Coolify (YOUR-COOLIFY.example.com) |
| CF | Cloudflare, zona balmacefa.com (cuenta bab26d41190ff97843d8082c267eb671, plan Free) |
| WP | WordPress |
| IdP | WP como proveedor OIDC |
| RP | app cliente (p.ej. IBM Verify) |
| U | usuario (lo hace él, no Claude) |
| JS | eval vía javascript_tool (fast-browser-js) |
| N | nonce REST WP |
| H | host WP = wordpress-<id>.balmacefa.com (actual: wordpress-cq8frf4wsxluhjf7qezakz1k.balmacefa.com) |
| T | tenant Verify = YOUR-TENANT.verify.ibm.com |
| CS | plugin Code Snippets |
| OCS | plugin openid-connect-server |
| OGC | plugin daggerhart-openid-connect-generic (WP como cliente) |

## Preguntar 1º (AskUserQuestion)
proyecto CL (nuevo recomendado) · OIDC: IdP (WP→Verify) vs cliente (Verify→wp-admin) o ambos · dominio (auto CL).

## Pasos (WP como IdP)
1. CL /projects → New project `wordpress-demo` → /project/<p>/environment/<e>/new → buscar `wordpress` → "Wordpress With Mariadb" Deploy → Save changes → Deploy → esperar ~60s (logs "Started") → Links = H.
2. CF bloquea `wp-`: regla custom 2 "Bloquear escaneo de archivos sensibles" (URI Path contains wp-, .env, .git...). Regla 1 = Skip IP (IP de U cambia; Skip NO salta regla 2). Diagnóstico read-only: Security → Analytics → Sampled logs = "Custom rules", o GraphQL `firewallEventsAdaptive` (ver CF API abajo). Expr final regla 2: `((...expr actual...)) and not http.host eq "H"`. Cambios en reglas de seguridad solo si U lo pide explícitamente.
3. /wp-admin/install.php: Claude elige idioma es_CR + título. **U** crea admin + login (Claude nunca escribe passwords/crea cuentas aunque U pegue credenciales; sugerir cambiarlas).
4. N: `wpApiSettings.nonce` solo en dashboard; en otras páginas `await (await fetch('/wp-admin/admin-ajax.php?action=rest-nonce')).text()`. Usar top-level await, no IIFE async (devuelve {}).
5. Plugins JS: POST `/wp-json/wp/v2/plugins` {slug:'openid-connect-server'|'code-snippets'} → POST `/wp-json/wp/v2/plugins/<dir>/<file>` {status:'active'}. (Alternativa UI: plugin-install.php?s=<slug> → `.plugin-card-<slug> .install-now` → `.activate-now`.)
6. Snippet CS "OIDC Server: llaves y cliente demo" (POST `/wp-json/code-snippets/v1/snippets` {name,code,scope:'global',active:true}): RSA 2048 (openssl_pkey_new) → option `isv_oidc_keys`; secret `wp_generate_password(40,false)` → option `isv_oidc_demo_secret`; define OIDC_PUBLIC_KEY/OIDC_PRIVATE_KEY/OIDC_CLIENTS {isv-demo-client: {name,secret,redirect_uri,grant_types:['authorization_code'],scope:'openid profile'}}; **además** `add_filter('oidc_registered_clients', fn($c)=>array_merge((array)$c, OIDC_CLIENTS))` — la versión actual de OCS ignora la constante (sin el filtro: `invalid_client` "The client id supplied is invalid"). add_management_page "OIDC Demo" muestra discovery/client_id/secret. Claves y secret nunca pasan por el chat.
7. Permalinks: /wp-admin/options-permalink.php → `/%postname%/` (requerido para /.well-known).
8. Verificar: GET /.well-known/openid-configuration (200) y /.well-known/jwks.json (RSA RS256, sin `kid`).
9. Demo data JS (REST): 4 cats, 5 tags, 6 posts bloque, páginas Inicio/Acerca de/Servicios/Contacto/Blog; settings {show_on_front:'page',page_on_front,page_for_posts,timezone:'America/Costa_Rica'}. Si eval falla, revisar qué se creó antes de reintentar.
10. **CF skip para el RP** (obligatorio con Verify): regla custom en 1ª posición "Permitir OIDC de WordPress para IBM Verify": `(http.host eq "H" and (starts_with(http.request.uri.path, "/.well-known/") or starts_with(http.request.uri.path, "/wp-json/openid-connect/")))`, action skip {ruleset:'current', phases:[http_ratelimit, http_request_firewall_managed, http_request_sbfm]}, logging on. Sin ella, regla 3 "Bloquear bots falsos y sin user agent" bloquea el fetch de JWKS de Verify (UA vacío, ASN Amazon) → Verify CSIAQ0210E "cannot fetch a key from the JSON Web Key set URI … Forbidden".

## Config RP (IBM Verify: Identity providers → Add → OIDC Enterprise; selectores en skill ibm-verify-admin)
| Campo | Valor |
|---|---|
| Discovery | https://H/.well-known/openid-configuration |
| Issuer/realm | https://H/ (con /) |
| Authorize | https://H/wp-json/openid-connect/authorize |
| Token | https://H/wp-json/openid-connect/token |
| UserInfo | https://H/wp-json/openid-connect/userinfo |
| JWKS | https://H/.well-known/jwks.json |
| client_id | isv-demo-client |
| secret | U lo copia de WP → Herramientas → OIDC Demo (/wp-admin/tools.php?page=isv-oidc-demo) y lo escribe en Verify |
| scope | openid profile · code · RS256 · client_secret_post · PKCE off |
| JIT | on, unique id `sub`; map name→display_name (preferred_username es target reservado) |
Redirect URI de Verify = `https://T/auth/redirect` → reemplazar `redirect_uri` en el snippet (las 2 apariciones). Prueba: app OIDC en Verify con redirect https://oidcdebugger.com/debug, solo IdP WordPress → U acepta consentimiento en WP y en Verify → oidcdebugger "Success!" + usuario JIT `isv@https://H/`.

## Dirección contraria: Verify → login de wp-admin ✅ 2026-10-31
1. Verify: app OIDC "WordPress Admin": App URL https://H/wp-login.php, redirect `https://H/wp-admin/admin-ajax.php?action=openid-connect-authorize`, PKCE off, IdPs IBMid + Cloud Directory (no WordPress OIDC → bucle), entitlement solo el usuario de U.
2. WP: instalar OGC. Ajustes → OpenID Connect Client (`openid_connect_generic_settings[...]`; ojo: cada checkbox tiene un hidden gemelo, usar `input[type=checkbox][name=...]`): login_type button, texto "Iniciar sesión con IBM Verify", scope `openid email profile`, endpoint_login `https://T/oauth2/authorize`, end_session `https://T/oauth2/rplogout`, issuer `https://T/oauth2`, token/userinfo/jwks → Worker (paso 4), http_request_timeout 30, identity_key/nickname preferred_username, email_format {email}, link_existing_users ✓, create_if_does_not_exist ✗, redirect_user_back ✓.
3. Admin WP con el email de U (`fabian`, administrator) — OGC vincula por email, no asigna roles. Crear con user-new.php (+ `.wp-generate-pw`, sin notificación).
4. **Bloqueo Akamai**: el servidor WP (IP pública 13.140.156.98, AWS) no puede hablar con T (HTTP/2 INTERNAL_ERROR inmediato, HTTP/1.1 cuelga; cualquier UA; IPv4 forzado no ayuda). Solución: Worker CF `verify-oidc-proxy` (https://verify-oidc-proxy.YOUR-SUBDOMAIN.workers.dev) que reenvía solo `/oauth2/{token,userinfo,jwks}` a T (borra host/cf-*/x-forwarded-*). Authorize va directo desde el navegador.
5. U copia Client secret de Verify (icono copiar de la fila Client secret, NO el portapapeles de Client ID ni 🔄) → pega en "Client Secret Key" → Save. Verificar sin leer: len≠36 y ≠ client_id.
6. Probar: logout WP → wp-login.php → botón → Verify (consentimiento lo acepta U) → wp-admin. Comprobar `/wp-json/wp/v2/users/me?context=edit` → username/roles.

## CF API desde dash.cloudflare.com (JS, cookies + header `x-atok: window.bootstrap.atok`)
- Zona: `GET /api/v4/zones?name=balmacefa.com`. Reglas custom: `GET /api/v4/zones/<z>/rulesets/phases/http_request_firewall_custom/entrypoint`; añadir: `POST /api/v4/zones/<z>/rulesets/<rs>/rules` con `position:{before:<id>}`.
- Eventos: `POST /api/v4/graphql` `firewallEventsAdaptive(filter:{datetime_gt, clientRequestHTTPHost})` → action/source/path/userAgent/ASN.
- Worker: `PUT /api/v4/accounts/<acc>/workers/scripts/<name>` multipart (metadata {main_module, compatibility_date} + módulo `application/javascript+module`) → `POST …/<name>/subdomain {enabled:true}`. Subdominio workers.dev: `demo-user`.

## Code Snippets (editor React)
`cm.setValue()` no actualiza el estado de React ("Snippet incomplete … no snippet code"): tras setValue, foco en CodeMirror + escribir un espacio con `computer type`, luego Save/Save and Activate (usar `find` para el botón; la página hace scroll). Leer código con salida filtrada (javascript_tool bloquea texto con llaves/secrets → devolver solo nombres/longitudes).

## Diagnóstico de red desde WP
Snippet temporal con `add_management_page('Diag Verify',…)` que hace gethostbynamel/dns AAAA + curl por host/UA/versión HTTP y `api.ipify.org` para la IP pública. Abrir /wp-admin/tools.php?page=diag-verify. Hacerlo **antes** de cerrar sesión de WP (cada logout obliga a U a reloguearse).

## Gotchas
- CF regla 4 desafía AS 396982 (Google Cloud); regla 3 bloquea UA vacío (Verify).
- Sandbox cloud no alcanza H ni workers.dev (curl 000): probar desde el navegador o desde WP.
- javascript_tool bloquea salidas con cookie/query ("BLOCKED"): devolver solo lo necesario.
- javascript_tool/get_page_text fallan justo tras navegar o en redirects: esperar 2–3 s y reintentar.
- No recargar páginas de ajustes mientras U pega un secret sin guardar (se pierde).

## Pendientes (2026-10-31)
- [ ] U borra en CS: "TEMP Diagnóstico red hacia Verify" (activo) y "OIDC Client: forzar IPv4 hacia IBM Verify" (inactivo, no sirvió).
- [ ] Pedir a IBM que desbloquee 13.140.156.98 en Akamai (o cambiar IP de salida del servidor en CL/AWS); luego volver token/userinfo/jwks de OGC a https://T/oauth2/… y borrar el Worker `verify-oidc-proxy`.
- [ ] Opcional: rotar el Client secret de "WordPress Admin" (pasó por el portapapeles) y de isv-demo-client.
- [ ] Opcional: role mapping en OGC / grupo de admins en Verify si entran más usuarios.
- [ ] Al terminar el demo: borrar proyecto CL `wordpress-demo` (contenedores+volúmenes), la exclusión de H en regla 2, la regla "Permitir OIDC de WordPress para IBM Verify", el Worker, y en Verify el IdP WordPress OIDC, apps "OIDC debugger"/"WordPress Admin" y el usuario JIT `isv@…`.