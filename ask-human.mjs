#!/usr/bin/env node
// ask-human — primitivo uniforme "necesito a un humano" para cualquier Pike o subagente.
// 1) Registra una linea PACT ^W en human.pact (auditoria + pike-watch).
// 2) Muestra una VENTANA real (no una notificacion del sistema, que Win11 suprime):
//    - Preferente: Aurora (IPC 127.0.0.1:48123, comando notify) -> overlay propio.
//    - Fallback:   ventana WinForms topmost + sonido (si Aurora no corre).
//
// Uso:
//   node ask-human.mjs "<pregunta o bloqueo>"            (severidad normal = need)
//   node ask-human.mjs "<...>" blocked                   (bloqueo duro)
//   node ask-human.mjs "<...>" --from Pike-W3            (firma explicita)
// Env: OLIMPO_NAME (firma), OLIMPO_DIR (canales), AURORA_IPC_PORT (def 48123).
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { execFile, spawn, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
let from = process.env.OLIMPO_NAME || process.env.PI_AGENT_NAME || 'subagente';
let severity = 'need';
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from') { from = args[++i]; continue; }
  if (args[i] === 'blocked' || args[i] === 'need') { severity = args[i]; continue; }
  rest.push(args[i]);
}
const msg = rest.join(' ').trim();
if (!msg) { console.error('uso: node ask-human.mjs "<pregunta>" [need|blocked] [--from <nombre>]'); process.exit(1); }

// ---- 1) registro PACT (auditoria + pike-watch) ----
const BASE = process.env.OLIMPO_DIR || 'C:/Users/fabia/.pi/olimpo';
const file = path.join(BASE, 'human.pact');
fs.mkdirSync(BASE, { recursive: true });
fs.appendFileSync(file, `o#human<${from}"^W ${msg.replace(/\n/g, ' ')}\n`, 'utf8');

// ---- 1b) VOZ: alerta hablada concisa (edge-tts local -> ffplay), no bloqueante ----
// Pike te habla cuando se para en seco y necesita tu decision. Apagar con PIKE_VOICE_OFF=1.
function speakAlert() {
  if (process.env.PIKE_VOICE_OFF === '1') return;
  try {
    const voice = process.env.PIKE_VOICE || 'es-ES-AlvaroNeural';
    // Linea corta y simple: encabezado + primeras palabras del bloqueo.
    const head = severity === 'blocked' ? 'Fabian, estoy bloqueado.' : 'Fabian, necesito tu decision.';
    const short = msg.replace(/\s+/g, ' ').trim().slice(0, 120);
    const line = `${head} ${short}`;
    const dir = path.join(os.tmpdir(), 'pike-voice');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `ask-${Date.now()}.mp3`);
    const r = spawnSync('python', ['-m', 'edge_tts', '--voice', voice, '--text', line, '--write-media', out], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 128) {
      const p = spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', out], { detached: true, stdio: 'ignore', windowsHide: true });
      p.unref();
    }
  } catch { /* la voz es best-effort; nunca bloquea la escalada */ }
}
speakAlert();

// ---- 2a) intento Aurora IPC ----
const PORT = Number(process.env.AURORA_IPC_PORT || 48123);
function tryAurora() {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port: PORT });
    let buf = '';
    const done = (ok) => { try { sock.destroy(); } catch {} resolve(ok); };
    sock.setTimeout(1500);
    sock.on('connect', () => {
      sock.write(JSON.stringify({ cmd: 'notify', body: msg, severity, author: from, title: `${from} te necesita` }) + '\n');
    });
    sock.on('data', (d) => {
      buf += d.toString();
      if (buf.includes('\n')) { try { done(JSON.parse(buf.trim()).ok === true); } catch { done(false); } }
    });
    sock.on('timeout', () => done(false));
    sock.on('error', () => done(false));
  });
}

// ---- 2b) fallback: ventana WinForms topmost + sonido ----
function fallbackWindow() {
  const urgent = severity === 'blocked';
  const safe = (s) => s.replace(/'/g, "''");
  const color = urgent ? 'FromArgb(45,18,18)' : 'FromArgb(45,42,18)';
  const bar = urgent ? 'FromArgb(255,59,48)' : 'FromArgb(230,184,0)';
  const tag = urgent ? 'BLOQUEADO - no puede avanzar' : 'Necesita tu decision';
  const beeps = urgent ? '1..4|%{[System.Media.SystemSounds]::Hand.Play();Start-Sleep -Milliseconds 600}'
                       : '[System.Media.SystemSounds]::Exclamation.Play()';
  const ps = `$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
${beeps}
$f=New-Object System.Windows.Forms.Form
$f.Text='Pike te necesita'
$f.StartPosition='CenterScreen'
$f.Size=New-Object System.Drawing.Size(480,230)
$f.TopMost=$true
$f.BackColor=[System.Drawing.Color]::${color}
$f.ForeColor=[System.Drawing.Color]::White
$h=New-Object System.Windows.Forms.Label
$h.Text='[!] ${safe(from)} te necesita'
$h.ForeColor=[System.Drawing.Color]::${bar}
$h.Font=New-Object System.Drawing.Font('Segoe UI',14,[System.Drawing.FontStyle]::Bold)
$h.AutoSize=$true;$h.Location=New-Object System.Drawing.Point(20,18)
$t=New-Object System.Windows.Forms.Label
$t.Text='${safe(tag)}'
$t.ForeColor=[System.Drawing.Color]::${bar}
$t.AutoSize=$true;$t.Location=New-Object System.Drawing.Point(20,52)
$b=New-Object System.Windows.Forms.Label
$b.Text='${safe(msg).slice(0, 300)}'
$b.MaximumSize=New-Object System.Drawing.Size(440,100)
$b.AutoSize=$true;$b.Location=New-Object System.Drawing.Point(20,80)
$b.Font=New-Object System.Drawing.Font('Segoe UI',11)
$ok=New-Object System.Windows.Forms.Button
$ok.Text='Atender';$ok.DialogResult='OK'
$ok.Location=New-Object System.Drawing.Point(370,160);$ok.BackColor=[System.Drawing.Color]::${bar};$ok.ForeColor=[System.Drawing.Color]::Black
$f.Controls.AddRange(@($h,$t,$b,$ok));$f.AcceptButton=$ok
$f.Add_Shown({$f.Activate()})
[void]$f.ShowDialog()`;
  execFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], () => {});
}

const viaAurora = await tryAurora();
if (!viaAurora) fallbackWindow();
console.log(`[ask-human] ^W por ${from}${severity === 'blocked' ? ' (blocked)' : ''} -> ${viaAurora ? 'Aurora overlay' : 'ventana fallback'}`);
console.log(`  "${msg}"  (log: ${file})`);
