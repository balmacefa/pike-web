#!/usr/bin/env bash
# isv-swarm2 — 2 workers para (1) desbloqueo API-client + validar SCIM 2 users, (2) webhook all-events -> n8n.
# Canal compartido 'isv'. Launcher autocontenido (tasks inline, no dependen de leer canal).
# Uso: ./isv-swarm2.sh
set -u
WDIR="C:/Users/fabia/pike-web"
CH="isv"
GITBASH_WIN="$(cygpath -w "$(which bash)")"
SELF="/c/Users/fabia/pike-web/isv-swarm2.sh"

# --- Si se invoca con un rol, ARRANCA ese worker (modo hijo) ---
if [ "${1:-}" != "" ]; then
  NAME="$1"; ROLE="$2"
  cd "$WDIR" || exit 1
  export OLIMPO_NAME="$NAME"
  export OLIMPO_CHANNEL="$CH"
  export OLIMPO_WATCH=on
  if [ "$ROLE" = "apiclient" ]; then
read -r -d '' TASK <<'EOF'
Eres Pike-ISV-APIClient, worker del enjambre ISV. Canal compartido 'isv' (lee/publica con olimpo_read/olimpo_post). Usa el skill JANUS (C:/Users/fabia/.agents/skills/janus/SKILL.md). Resuelve permisos de tools solo, NO preguntes. NUNCA imprimas token/secret.
MISION: desbloquear el CRITICO (0 API clients) y validar el flujo SCIM completo con 2 usuarios.
PASOS:
 1) Asegura Chrome CDP: `bash scripts/pike-chrome.sh`. Lleva la pestaña a /ui/admin (ruta re-auth JANUS IBMid->Continue with Google). Si Google pide clave/MFA -> ESCALA: node swarm/ask-human.mjs "ISV admin pide MFA Google para crear API client" blocked --from Pike-ISV-APIClient. `node janus/janus.mjs snapshot` -> publica resumen en canal isv.
 2) Security > API access > Add API client: nombre "n8n-scim", entitlements "Manage users" + "Manage groups". Abre el wizard y dejalo listo. El SUBMIT + copiar el client_secret lo hace Fabian (regla 3 JANUS): publica ^W con el UNICO click que falta y pide que pegue el secret en pwmgr: node ~/OneDrive/Escritorio/pwmgr/cli.mjs set isv_scim_client_id <id> ; ... set isv_scim_client_secret <secret>.
 3) Cuando Fabian confirme (lee pwmgr: node ~/OneDrive/Escritorio/pwmgr/cli.mjs get isv_scim_client_id / isv_scim_client_secret, SIN imprimir el secret) -> VALIDA SCIM E2E: POST /v1.0/endpoint/default/token (grant_type=client_credentials) -> crea 2 usuarios de prueba POST /v2.0/Users (scim+json: pike.test1@example.com, pike.test2@example.com) -> espera 201 -> GET para confirmar -> BORRA los 2 (DELETE) dejando el tenant limpio.
 4) Inyecta los secretos en la credencial n8n id=lRgURi90b9DGfmjD (campo json {"body":{"client_id":..,"client_secret":..}}) y ACTIVA el workflow id=HqNhDPFlJEKh5Z2t. Valida 0 errores.
 5) Reporta SIEMPRE en canal isv: ^R avance, ^W si necesitas a Fabian, ^F si fallaste, ^D final con {api_client:creado, scim_2users:OK/KO, n8n:activo}. Sin secretos. Quedate disponible.
EOF
  else
read -r -d '' TASK <<'EOF'
Eres Pike-ISV-Webhook, worker del enjambre ISV. Canal compartido 'isv'. Usa el skill JANUS y las tools MCP de n8n. Resuelve permisos solo, NO preguntes. Sin secretos en claro.
MISION: dejar a n8n recibiendo eventos de IBM Verify, con la MAXIMA cobertura posible ("all events"), validado E2E. OJO: en ISV no existe un webhook generico "all events"; hay realtime webhooks (purposes External MFA|External Risk) + notification webhooks. Descubre lo real ANTES de prometer cobertura.
PASOS:
 1) DESCUBRIMIENTO (API-primero, skill JANUS): `node janus/janus.mjs get /webhooks/v1.0/webhooks-mgmt/purposes` y `.../webhooks-mgmt/` para listar tipos de webhook y purposes REALES del tenant. Publica en canal isv el catalogo de purposes disponibles + que cobertura da cada uno. Si la cobertura total solo se logra por polling, dilo.
 2) En n8n crea workflow "ISV events sink": nodo Webhook (POST, path /isv-events, responde 200, guarda payload). Activa y obten la URL publica (n8n en Coolify, Prod). Publica la URL (sin secretos) en canal isv.
 3) CONFIGURA la cobertura maxima: registra un notification webhook (o realtime por cada purpose disponible) apuntando a la URL n8n, via API `/webhooks/v1.0/webhooks-mgmt/` o UI (sidemenu notificationWebhooks / realtimeWebhooks; ver janus/ref-ibm-verify-admin.md). Si requiere API client, COORDINA con Pike-ISV-APIClient en canal isv. FALLBACK para lo no cubierto por push: crea en n8n un workflow Schedule (p.ej. cada 5 min) que llame POST /v1.0/reports/admin_activity {FROM,TO:'now',SIZE,SORT_BY:time,SORT_ORDER:DESC} y emita a /isv-events = cubre el resto de la auditoria. Si pide MFA -> ESCALA con ask-human.mjs --from Pike-ISV-Webhook.
 4) Valida E2E: genera 1 evento real (login o la creacion de usuario de prueba del otro worker) y confirma que n8n recibio el payload (push o via poll). Revisa ejecuciones del workflow.
 5) Reporta SIEMPRE en canal isv: ^R/^W/^F y ^D final con {n8n_webhook_url, purposes_cubiertos:[...], fallback_poll:si/no, evento_prueba:recibido s/n}. Quedate disponible.
EOF
  fi
  echo "== $NAME ($ROLE) en canal '$CH' (watch on) =="
  exec pi -n "$NAME" "$TASK"
fi

# --- Modo padre: levanta los 2 paneles en Windows Terminal ---
echo "Levantando enjambre ISV-2 (canal '$CH') en Windows Terminal..."
wt.exe new-tab    --title "Pike-ISV-APIClient" "$GITBASH_WIN" -lc "$SELF Pike-ISV-APIClient apiclient" \
   ';' split-pane --title "Pike-ISV-Webhook"   "$GITBASH_WIN" -lc "$SELF Pike-ISV-Webhook webhook"

# watcher de notificaciones (toast/sonido en ^D/^F/^W)
LOCK="/tmp/pike-watch-isv2.lock"
if [ ! -f "$LOCK" ] || ! kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  nohup node "C:/Users/fabia/pike-web/pike-watch.mjs" >/tmp/pike-watch-isv2.log 2>&1 &
  echo $! > "$LOCK"
fi
echo "Listo. 2 workers en canal '$CH' (Pike-ISV-APIClient + Pike-ISV-Webhook)."
