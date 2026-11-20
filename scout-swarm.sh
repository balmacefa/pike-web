#!/usr/bin/env bash
# scout-swarm — levanta un enjambre de Pike SCOUTS en el canal compartido 'scout' (Windows Terminal).
# Scouts = recon rápido SOLO-LECTURA; delegan la síntesis a los subagentes scout-cli/scout-gem (costo 0).
# Cero instalación: usa wt.exe (nativo) + el git-bash real.
#
# Uso:  ./scout-swarm.sh [N] [cwd]
#   N   = cuántos scouts (def. 2 = Scout-S1, Scout-S2)
#   cwd = carpeta a reconocer (def. Escritorio)
#
# Encargar recon después:
#   dirigido:   node pike-tell.mjs ... (no aplica: canal compartido) -> usa olimpo_post con 'to Scout-S1'
#   al canal:   cualquier Pike publica en el canal 'scout' y el scout libre lo toma
set -u
N="${1:-2}"
CWD="${2:-C:/Users/fabia/OneDrive/Escritorio}"
CH="scout"
WORKER="/c/Users/fabia/pike-web/scout-worker.sh"

# OJO: wt resuelve 'bash' a C:\WINDOWS\System32\bash.exe (WSL), que NO ve rutas C:/...
# Hay que invocar EXPLÍCITAMENTE el git-bash y pasar el script con ruta unix /c/...
GITBASH_WIN="$(cygpath -w "$(which bash)")"

ARGS=()
for i in $(seq 1 "$N"); do
  NAME="Scout-S$i"
  CMD="$WORKER $NAME $CH $CWD"
  if [ "$i" -eq 1 ]; then
    ARGS+=( new-tab --title "$NAME" "$GITBASH_WIN" -lc "$CMD" )
  else
    ARGS+=( ';' split-pane --title "$NAME" "$GITBASH_WIN" -lc "$CMD" )
  fi
done

echo "Levantando $N scouts en Windows Terminal (canal compartido '$CH', cwd=$CWD)..."
wt.exe "${ARGS[@]}"

# HOOK de notificación: watcher único que vigila todos los canales (toast en ^D/^F/^W).
LOCK="/tmp/pike-watch.lock"
if [ ! -f "$LOCK" ] || ! kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  nohup node "C:/Users/fabia/pike-web/pike-watch.mjs" >/tmp/pike-watch.log 2>&1 &
  echo $! > "$LOCK"
  echo "pike-watch activo (vigila el canal; toast al completarse)."
fi
echo "Listo: $N scouts en canal '$CH'. Son SOLO-LECTURA y delegan síntesis a scout-cli/scout-gem (costo 0)."
