#!/usr/bin/env bash
# isv-swarm-cli — 2 workers en el canal 'isv2' que DELEGAN el razonamiento a Claude CLI (subagentes costo-0).
#   Worker-A (apiclient): desbloquea el CRITICO (0 API clients) + valida SCIM E2E con 2 usuarios.
#   Worker-B (claims):    mapea claims email/given/family en 'WordPress OIDC' + rota client secrets.
# Arquitectura: el worker-shell es `pi` (necesita tools: CDP/janus/n8n + olimpo). El "Claude CLI con
#   subagentes" = COMO delega: toda sintesis/plan/razonamiento -> subagent scout-cli|persona-cli (suscripcion,
#   costo 0, texto puro). Reserva tokens pagos solo para lo que requiere tools.
# Canal compartido 'isv2' (independiente del swarm 'isv'). Launcher autocontenido (tasks inline).
# Uso: ./isv-swarm-cli.sh
set -u
WDIR="C:/Users/fabia/pike-web"
CH="isv2"
GITBASH_WIN="$(cygpath -w "$(which bash)")"
SELF="/c/Users/fabia/pike-web/isv-swarm-cli.sh"

# --- Si se invoca con un rol, ARRANCA ese worker (modo hijo) ---
if [ "${1:-}" != "" ]; then
  NAME="$1"; ROLE="$2"
  cd "$WDIR" || exit 1
  export OLIMPO_NAME="$NAME"
  export OLIMPO_CHANNEL="$CH"
  export OLIMPO_WATCH=on
  if [ "$ROLE" = "apiclient" ]; then
read -r -d '' TASK <<'EOF'
Eres Pike-ISV2-APIClient, worker del enjambre ISV2. Canal compartido 'isv2' (lee/publica con olimpo_read/olimpo_post). Usa el skill JANUS (C:/Users/fabia/.agents/skills/janus/SKILL.md). Resuelve permisos de tools solo, NO preguntes. NUNCA imprimas token/secret.
REGLA DE DELEGACION (clave de este enjambre): TODO razonamiento/plan/analisis/redaccion pesado lo DELEGAS a Claude CLI de costo 0 con la tool subagent (agent 'scout-cli' para recon/analisis, 'persona-cli' para planear como experto). Tu aportas el contexto leido; ellos razonan GRATIS. Reserva el modelo pago SOLO para ejecutar tools (CDP/janus/n8n).
MISION: desbloquear el CRITICO (0 API clients) y validar el flujo SCIM completo con 2 usuarios.
PASOS:
 1) Asegura Chrome CDP: `bash pike-chrome.sh`. Lleva la pestaña a /ui/admin (ruta re-auth JANUS IBMid->Continue with Google). Si Google pide clave/MFA -> ESCALA: node ask-human.mjs "ISV2 admin pide MFA Google para crear API client" blocked --from Pike-ISV2-APIClient. `node janus/janus.mjs snapshot` -> publica resumen en canal isv2.
 2) Security > API access > Add API client: nombre "n8n-scim", entitlements "Manage users" + "Manage groups". Abre el wizard y dejalo listo. El SUBMIT + copiar el client_secret lo hace Fabian (regla 3 JANUS): publica ^W con el UNICO click que falta y pide que pegue el secret en pwmgr: node ~/OneDrive/Escritorio/pwmgr/cli.mjs set isv_scim_client_id <id> ; ... set isv_scim_client_secret <secret>.
 3) Cuando Fabian confirme (lee pwmgr: node ~/OneDrive/Escritorio/pwmgr/cli.mjs get isv_scim_client_id / isv_scim_client_secret, SIN imprimir el secret) -> VALIDA SCIM E2E: POST /v1.0/endpoint/default/token (grant_type=client_credentials) -> crea 2 usuarios de prueba POST /v2.0/Users (scim+json: pike.test1@example.com, pike.test2@example.com) -> espera 201 -> GET para confirmar -> BORRA los 2 (DELETE) dejando el tenant limpio.
 4) Inyecta los secretos en la credencial n8n id=lRgURi90b9DGfmjD (campo json {"body":{"client_id":..,"client_secret":..}}) y ACTIVA el workflow id=HqNhDPFlJEKh5Z2t. Valida 0 errores.
 5) Reporta SIEMPRE en canal isv2: ^R avance, ^W si necesitas a Fabian, ^F si fallaste, ^D final con {api_client:creado, scim_2users:OK/KO, n8n:activo}. Sin secretos. Quedate disponible.
EOF
  else
read -r -d '' TASK <<'EOF'
Eres Pike-ISV2-Claims, worker del enjambre ISV2. Canal compartido 'isv2'. Usa el skill JANUS. Resuelve permisos solo, NO preguntes. Sin secretos en claro.
REGLA DE DELEGACION (clave de este enjambre): TODO razonamiento/plan/analisis/redaccion pesado lo DELEGAS a Claude CLI de costo 0 con la tool subagent (agent 'scout-cli' o 'persona-cli'). Tu aportas el contexto; ellos razonan GRATIS. Reserva el modelo pago SOLO para ejecutar tools (CDP/janus).
MISION: mejorar el IdP 'WordPress OIDC' mapeando mas claims + rotar los client secrets que pasaron por portapapeles.
PASOS:
 1) Asegura Chrome CDP (`bash pike-chrome.sh`) y admin en /ui/admin (ruta re-auth JANUS si hace falta). `node janus/janus.mjs get /v2.0/identitysources` -> ubica el IdP 'WordPress OIDC' y su mapeo de atributos actual. Publica el estado en canal isv2 (sin secrets).
 2) ATTRIBUTE MAPPING en 'WordPress OIDC': anade claims email, given_name (nombre), family_name (apellido). OJO targets reservados (error CSIAG0772E): preferred_username, realmName, groupIds, uid, tenantId -> NO usarlos como target. Delega a scout-cli el mapeo claim->target correcto antes de tocar la UI. Selectores en janus/ref-ibm-verify-admin.md (Add attribute mapping: #ci-onprem-attr-mappings-idsAttrName-N / #ci-onprem-attr-mappings-attrId-N). Si es editable por API, prefiere API (regla 1 JANUS). Guarda y verifica con GET /v2.0/identitysources.
 3) ROTACION DE SECRETS (opcional, requiere OK Fabian por riesgo de romper SSO): localiza app 'WordPress Admin' y 'isv-demo-client'. Para rotar: abre la app OIDC, boton 🔄 regenerate del Client secret (regla 3: el submit/copia lo hace Fabian). Publica ^W con el plan EXACTO y el impacto (hay que actualizar el secret en WordPress/OGC o se cae el SSO) ANTES de tocar nada. NO rotes sin confirmacion explicita.
 4) Valida que el SSO E2E sigue vivo tras los cambios: `node engine.mjs wp-ibm` debe landear en /wp-admin. Si se rompe, revierte/reporta ^F.
 5) Reporta SIEMPRE en canal isv2: ^R/^W/^F y ^D final con {claims_mapeados:[...], secrets_rotados:si/no, sso_e2e:OK/KO}. Quedate disponible.
EOF
  fi
  echo "== $NAME ($ROLE) en canal '$CH' (watch on · delega a Claude CLI costo-0) =="
  exec pi -n "$NAME" "$TASK"
fi

# --- Modo padre: levanta los 2 paneles en Windows Terminal ---
echo "Levantando enjambre ISV-CLI (canal '$CH') en Windows Terminal..."
wt.exe new-tab    --title "Pike-ISV2-APIClient" "$GITBASH_WIN" -lc "$SELF Pike-ISV2-APIClient apiclient" \
   ';' split-pane --title "Pike-ISV2-Claims"    "$GITBASH_WIN" -lc "$SELF Pike-ISV2-Claims claims"

# watcher de notificaciones (toast/sonido en ^D/^F/^W)
LOCK="/tmp/pike-watch-isv2cli.lock"
if [ ! -f "$LOCK" ] || ! kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  nohup node "C:/Users/fabia/pike-web/pike-watch.mjs" >/tmp/pike-watch-isv2cli.log 2>&1 &
  echo $! > "$LOCK"
fi
echo "Listo. 2 workers en canal '$CH' (Pike-ISV2-APIClient + Pike-ISV2-Claims), delegando a Claude CLI costo-0."
