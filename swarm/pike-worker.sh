#!/usr/bin/env bash
# pike-worker — arranca UN Pike worker en su INBOX PRIVADO (canal 1-1 con el coordinador).
# Uso: pike-worker.sh <nombre> [inbox] [cwd]
# Por defecto el canal = inbox-<nombre> (privado): solo el coordinador y este worker lo ven.
# cwd = carpeta de trabajo (donde pi lee AGENTS.md). Def = pike-web.
set -u
NAME="${1:-Pike-WX}"
CH="${2:-inbox-$NAME}"
WDIR="${3:-C:/Users/fabia/pike-web}"
cd "$WDIR" || exit 1
export OLIMPO_NAME="$NAME"
export OLIMPO_CHANNEL="$CH"
export OLIMPO_WATCH=on
echo "== $NAME · inbox privado '$CH' (watch on) =="
read -r -d '' TASK <<EOF
Eres el worker $NAME del Olimpo. Tu canal es tu INBOX PRIVADO '$CH' (solo vos y el coordinador lo ven; los otros workers NO).
Al iniciar y cada vez que llegue algo: lee tu inbox con olimpo_read y ejecuta la tarea dirigida a vos. Para JANUS: en C:/Users/fabia/pike-web corre 'node janus/janus.mjs snapshot' y 'node core/engine.mjs wp-ibm --quiet'.
Resolve permisos de tools automaticamente, NO preguntes. Reporta SIEMPRE en tu inbox con olimpo_post un ^D (listo) con resultados, ^R (en curso) con % y avance, o ^W/^F si necesitas algo o fallaste. Quedate disponible para mas trabajo.
EOF
exec pi -n "$NAME" "$TASK"
