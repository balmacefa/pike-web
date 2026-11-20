#!/usr/bin/env bash
# Perfil Pike persistente + debug port. Sesiones se guardan y reusan.
PROFILE="C:/Users/fabia/chrome_pike_debug"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
if curl -s --max-time 2 http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
  echo "[pike-chrome] ya corriendo en 9222"
else
  echo "[pike-chrome] abriendo perfil Pike..."
  "$CHROME" --remote-debugging-port=9222 --user-data-dir="$PROFILE" \
    --no-first-run --no-default-browser-check "$@" >/dev/null 2>&1 &
  sleep 4
fi
curl -s --max-time 3 http://127.0.0.1:9222/json/version 2>/dev/null | head -c 60
