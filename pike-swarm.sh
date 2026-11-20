#!/usr/bin/env bash
# pike-swarm — levanta un enjambre de Pike workers en Windows Terminal (paneles).
# Cada worker escucha su INBOX PRIVADO (inbox-Pike-W<n>) = canal 1-1 con el coordinador.
# Cero instalacion: usa wt.exe (nativo) + el git-bash real.
#
# Uso:  ./pike-swarm.sh [N]
#   N = cuantos workers (def. 2)
#
# Coordinar despues:
#   1-1 privado:  node pike-tell.mjs W1 "mensaje"     (solo W1 lo ve)
#   broadcast:    node pike-tell.mjs all "mensaje"    (todos los inbox)
set -u
N="${1:-2}"
CWD="C:/Users/fabia/pike-web"
WORKER="/c/Users/fabia/pike-web/pike-worker.sh"

# OJO: wt resuelve 'bash' a C:\WINDOWS\System32\bash.exe (WSL), que NO ve rutas C:/...
# Hay que invocar EXPLICITAMENTE el git-bash y pasar el script con ruta unix /c/...
GITBASH_WIN="$(cygpath -w "$(which bash)")"

ARGS=()
for i in $(seq 1 "$N"); do
  NAME="Pike-W$i"
  INBOX="inbox-$NAME"                               # canal privado 1-1 de cada worker
  CMD="$WORKER $NAME $INBOX"
  if [ "$i" -eq 1 ]; then
    ARGS+=( new-tab --title "$NAME" "$GITBASH_WIN" -lc "$CMD" )
  else
    ARGS+=( ';' split-pane --title "$NAME" "$GITBASH_WIN" -lc "$CMD" )
  fi
done

echo "Levantando $N workers en Windows Terminal (cada uno en su inbox privado)..."
wt.exe "${ARGS[@]}"

# HOOK de notificacion: watcher unico que vigila TODOS los inbox (toast en ^D/^F/^W).
LOCK="/tmp/pike-watch.lock"
if [ ! -f "$LOCK" ] || ! kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  nohup node "C:/Users/fabia/pike-web/pike-watch.mjs" >/tmp/pike-watch.log 2>&1 &
  echo $! > "$LOCK"
  echo "pike-watch activo (vigila todos los inbox; toast al completarse)."
fi
echo "Listo: $N paneles en Windows Terminal, uno por Pike."
echo "1-1:        node pike-tell.mjs W1 \"mensaje\""
echo "broadcast:  node pike-tell.mjs all \"mensaje\""
