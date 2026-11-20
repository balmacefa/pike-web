@echo off
REM Pike's persistent Chrome: same profile always -> logins stay saved.
REM Debug port 9222 so pweb.mjs can drive it. Log in ONCE per site; sessions persist.
set PIKE_PROFILE=C:\Users\fabia\chrome_pike_debug
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"

REM If already up on 9222, just focus; else launch.
curl -s --max-time 2 http://127.0.0.1:9222/json/version >nul 2>&1
if %errorlevel%==0 (
  echo [pike-chrome] ya esta corriendo en 9222
) else (
  echo [pike-chrome] abriendo perfil Pike...
  start "" %CHROME% --remote-debugging-port=9222 --user-data-dir="%PIKE_PROFILE%" --no-first-run --no-default-browser-check %*
)
