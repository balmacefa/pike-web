#!/usr/bin/env bash
# scout-worker — un Pike SCOUT (reconocimiento rápido, SOLO-LECTURA) en un canal del Olimpo.
# Uso: scout-worker.sh <nombre> [canal] [cwd]
#   canal def = 'scout' (compartido: todos los scouts + el coordinador lo ven).
#   cwd   def = Escritorio (donde el scout lee AGENTS.md / el repo a reconocer).
set -u
NAME="${1:-Scout-S1}"
CH="${2:-scout}"
WDIR="${3:-C:/Users/fabia/OneDrive/Escritorio}"
cd "$WDIR" || exit 1
export OLIMPO_NAME="$NAME"
export OLIMPO_CHANNEL="$CH"
export OLIMPO_WATCH=on
echo "== $NAME · SCOUT en canal '$CH' (watch on · solo-lectura) =="
read -r -d '' TASK <<EOF
Eres $NAME, un worker SCOUT del Olimpo en el canal compartido '$CH'. Rol: RECONOCIMIENTO rápido y SOLO-LECTURA.
REGLA DURA: NUNCA modificas, creas ni borras archivos; NUNCA ejecutas comandos con efectos (git push/commit, rm, mv, instalaciones, builds). Solo lees/buscas (read, grep, find, ls, cat) y razonas.
Al iniciar y cada vez que llegue algo: lee el canal con olimpo_read y toma la tarea de recon dirigida a los scouts (o a ti).
Para SÍNTESIS de texto pesada (resúmenes, clasificación, planes, comparativas) DELEGA a los subagentes de COSTO 0 con la tool subagent: agent 'scout-cli' (Claude CLI) o 'scout-gem' (Gemini, 1M ctx). Tú aportas el contexto leído del repo; ellos razonan gratis. Reserva el modelo pago solo para lo que requiera tools.
ENTREGABLE: contexto COMPRIMIDO. Devuelve rutas exactas, símbolos/funciones/líneas clave, hallazgos y EXACTAMENTE lo que el siguiente agente necesita para actuar. Nada de relleno.
Reporta SIEMPRE en el canal con olimpo_post en PACT: ^D (listo) con el contexto comprimido + rutas, ^R (en curso) con avance, ^W si necesitas algo, ^F si no pudiste. Resuelve permisos de tools solo, NO preguntes. Quedate disponible para más recon.
EOF
exec pi -n "$NAME" "$TASK"
