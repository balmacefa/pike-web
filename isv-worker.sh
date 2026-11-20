#!/usr/bin/env bash
# isv-worker — un worker del enjambre ISV en el canal compartido 'isv'.
# Uso: isv-worker.sh <nombre> <rol: verify|n8n>
set -u
NAME="${1:?nombre}"
ROLE="${2:?rol verify|n8n}"
WDIR="C:/Users/fabia/pike-web"
cd "$WDIR" || exit 1
export OLIMPO_NAME="$NAME"
export OLIMPO_CHANNEL="isv"
export OLIMPO_WATCH=on

if [ "$ROLE" = "dsl" ]; then
read -r -d '' TASK <<'EOF'
Eres Pike-ISV-D, worker DSL-author del enjambre ISV. Canal compartido 'isv' (lee/publica con olimpo_read/olimpo_post). MISION: consolidar el mapeo de Verify (de Pike-ISV-V) y las plantillas n8n (de Pike-ISV-N) en un CATALOGO DSL formal para GENERAR workflows despues en vez de hacerlos a mano.
PASOS (resuelve permisos solo, NO preguntes):
1) Lee el canal isv (olimpo_read limit alto) y recoge los ^D de Pike-ISV-V (catalogo + ops REST verificadas) y Pike-ISV-N (plantillas de workflow). Si aun no estan, publica ^R y re-lee en unos minutos.
2) Expande C:/Users/fabia/pike-web/recipes.json con recetas engine.mjs para los flujos UI verificados del ref (janus/ref-ibm-verify-admin.md): create-group, add-user, add-attribute, add-oidc-idp, add-oidc-app, assign-entitlement. Reutiliza selectores ya verificados del ref.
3) Escribe C:/Users/fabia/pike-web/janus/isv-dsl-spec.md: una TABLA op-Verify -> request REST (method/path/body/schemas) -> receta engine -> nodo/plantilla n8n. Es el puente para auto-generar workflows.
4) Espeja lo durable a memoria L2 (memory_remember) sin secretos.
5) Reporta SIEMPRE en canal isv: ^D/^R/^W/^F con rutas de archivos producidos. Quedate disponible.
EOF
elif [ "$ROLE" = "verify" ]; then
read -r -d '' TASK <<'EOF'
Eres Pike-ISV-V, worker del enjambre ISV. Canal compartido 'isv' (lee/publica con olimpo_read/olimpo_post; los otros workers lo ven). MISION: desbloquear el provisioning de IBM Verify. Usa el skill JANUS.
PASOS (resuelve permisos solo, NO preguntes):
1) Asegura Chrome CDP: en C:/Users/fabia/pike-web corre `bash pike-chrome.sh`. Si cae en login, sigue la ruta JANUS (regla re-auth del skill) para quedar admin en /ui/admin.
2) `node janus/janus.mjs snapshot` -> publica resumen (users/groups/apps/idps) en canal isv.
3) Revisa si YA existe un API client: `node janus/janus.mjs get /v1.0/apiclients` (o la ruta correcta del skill). 
   - Si existe uno util -> reporta su client_id (NUNCA el secret) y marca que n8n puede usarlo.
   - Si total=0 -> navega en /ui/admin a Security > API access > Add API client, abre el wizard, pre-rellena nombre "n8n-provisioning" y SELECCIONA las entitlements "Manage users" + "Manage groups". NO hagas submit (crear + copiar secret lo hace Fabian, regla 3 del skill). Deja el wizard listo y publica ^W describiendo el UNICO click que falta para Fabian.
4) Reporta SIEMPRE en canal isv: ^D con resultado, ^R con avance, ^W si necesitas a Fabian, ^F si fallaste. Nunca imprimas tokens ni secrets. Quedate disponible.
EOF
else
read -r -d '' TASK <<'EOF'
Eres Pike-ISV-N, worker del enjambre ISV. Canal compartido 'isv' (lee/publica con olimpo_read/olimpo_post). MISION: dejar el workflow n8n de provisioning listo para un solo paso final. Usa las tools MCP de n8n.
PASOS (resuelve permisos solo, NO preguntes):
1) Inspecciona el workflow id=HqNhDPFlJEKh5Z2t "Verify: provisionar datos" (4 nodos: Manual Trigger -> Get Token -> Create Group SCIM -> Create User SCIM). Publica su estado (activo?, placeholders).
2) Refactoriza para que client_id/client_secret NO esten en texto plano: crea/usa una credencial n8n (HTTP header/generic) o variables, de modo que cuando Fabian pegue el secret sea en UN solo lugar seguro. Si no puedes crear credencial via MCP, deja documentado el punto exacto (nodo "Get Token", campos PASTE_CLIENT_ID / PASTE_CLIENT_SECRET).
3) Valida el workflow (validate) -> 0 errores. NO lo actives todavia (requiere creds reales + OK Fabian).
4) Coordina con Pike-ISV-V: si V reporta un client_id existente, incorpora ese client_id al workflow y deja solo el secret pendiente.
5) Reporta SIEMPRE en canal isv: ^D/^R/^W/^F. Quedate disponible.
EOF
fi
echo "== $NAME ($ROLE) en canal 'isv' (watch on) =="
exec pi -n "$NAME" "$TASK"
