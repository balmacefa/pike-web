#!/usr/bin/env node
// pike-watch — HOOK de notificacion del Olimpo (multi-inbox).
// Vigila el directorio del Olimpo y, ante una linea nueva con ^D/^F/^W en CUALQUIER
// canal (inbox privado o comun), dispara un toast de Windows para avisar a Fabian.
// Uso: node pike-watch.mjs            (vigila todos los *.pact del dir)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const BASE = 'C:/Users/fabia/.pi/olimpo';
const counts = new Map();   // archivo -> lineas ya procesadas

function pactFiles() {
  return fs.readdirSync(BASE).filter(f => f.endsWith('.pact'));
}
function parse(line) {
  if (!line.startsWith('o#')) return null;
  const lt = line.indexOf('<'), q = line.indexOf('"');
  if (lt < 0 || q < 0) return null;
  return { channel: line.slice(2, lt), author: line.slice(lt + 1, q), msg: line.slice(q + 1).replace(/\\n/g, ' ') };
}
function stateOf(msg) {
  if (/\^F\b/.test(msg)) return { tag: 'FALLO', icon: '[X]' };
  if (/\^W\b/.test(msg)) return { tag: 'TE NECESITA', icon: '[!]' };
  if (/\^D\b/.test(msg)) return { tag: 'LISTO', icon: '[OK]' };
  return null;
}
// sonido por severidad: W(te necesita)=urgente/repetido, F(fallo)=hand, D(listo)=asterisk
function soundFor(tag) {
  if (tag === 'TE NECESITA') return "1..3|%{[System.Media.SystemSounds]::Exclamation.Play();Start-Sleep -Milliseconds 650}";
  if (tag === 'FALLO')       return "[System.Media.SystemSounds]::Hand.Play()";
  return "[System.Media.SystemSounds]::Asterisk.Play()"; // LISTO
}
function notify(title, text, tag) {
  const t = text.replace(/'/g, "''").slice(0, 180);
  const icon = tag === 'FALLO' ? 'Error' : tag === 'TE NECESITA' ? 'Warning' : 'Information';
  const ps = `$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
${soundFor(tag)}
$n=New-Object System.Windows.Forms.NotifyIcon
$n.Icon=[System.Drawing.SystemIcons]::${icon}
$n.BalloonTipTitle='${title.replace(/'/g, "''")}'
$n.BalloonTipText='${t}'
$n.Visible=$true
$n.ShowBalloonTip(8000)
Start-Sleep -Seconds 9
$n.Dispose()`;
  execFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], () => {});
  console.error(`NOTIFY ${title} -- ${t}`);
}

// baseline: marcar lo existente como visto
for (const f of pactFiles()) {
  counts.set(f, fs.readFileSync(path.join(BASE, f), 'utf8').split('\n').filter(Boolean).length);
}
console.error(`pike-watch vigilando ${BASE} (${counts.size} canales). Ctrl+C para salir.`);

function drainFile(f) {
  const full = path.join(BASE, f);
  let lines; try { lines = fs.readFileSync(full, 'utf8').split('\n').filter(Boolean); } catch { return; }
  const seen = counts.get(f) || 0;
  if (lines.length <= seen) { counts.set(f, lines.length); return; }
  for (const line of lines.slice(seen)) {
    const m = parse(line); if (!m) continue;
    const s = stateOf(m.msg); if (!s) continue;
    const scope = m.channel.startsWith('inbox-') ? '(privado)' : '(comun)';
    notify(`${s.icon} ${m.author} ${s.tag} ${scope}`, m.msg.slice(0, 180), s.tag);
  }
  counts.set(f, lines.length);
}

let t;
fs.watch(BASE, (ev, fname) => {
  if (!fname || !fname.endsWith('.pact')) return;
  clearTimeout(t);
  t = setTimeout(() => { for (const f of pactFiles()) drainFile(f); }, 300);
});
