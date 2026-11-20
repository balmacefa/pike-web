#!/usr/bin/env bash
# isv-swarm — enjambre dedicado al DESBLOQUEO Verify+n8n, canal compartido 'isv'.
# Todos los workers publican/leen en el MISMO canal 'isv' (se ven entre si).
# Uso: ./isv-swarm.sh
set -u
CWD="C:/Users/fabia/pike-web"
CH="isv"
GITBASH_WIN="$(cygpath -w "$(which bash)")"
SELF="/c/Users/fabia/pike-web/isv-worker.sh"

echo "Levantando enjambre ISV (canal '$CH') en Windows Terminal..."
wt.exe new-tab    --title "Pike-ISV-V" "$GITBASH_WIN" -lc "$SELF Pike-ISV-V verify" \
   ';' split-pane --title "Pike-ISV-N" "$GITBASH_WIN" -lc "$SELF Pike-ISV-N n8n"

# watcher de notificaciones (reusa el hook existente)
LOCK="/tmp/pike-watch-isv.lock"
if [ ! -f "$LOCK" ] || ! kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  nohup node "C:/Users/fabia/pike-web/pike-watch.mjs" >/tmp/pike-watch-isv.log 2>&1 &
  echo $! > "$LOCK"
fi
echo "Listo. 2 workers en canal '$CH'. Coordina desde pi con olimpo (canal isv)."
