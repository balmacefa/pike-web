#!/usr/bin/env node
/**
 * olimpo-registry — gestor SINGLETON de canales, workers, PIDs, metadata y tags del Olimpo.
 *
 * FUENTE DE VERDAD en capas (no rompe la extensión olimpo.ts):
 *   - Presencia  : ~/.pi/olimpo/<canal>.peers.json   (la escribe la extensión: {name:{ts,pid,host,cwd,mode}})
 *   - Mensajes   : ~/.pi/olimpo/<canal>.pact          (log PACT; se parsea el ultimo estado ^D/^R/^W/^F/^N)
 *   - Metadata   : ~/.pi/olimpo/registry.meta.json    (SIDECAR nuestro: tags, role, swarm, note por worker/canal)
 *
 * SINGLETON: un lock con PID en ~/.pi/olimpo/.registry.lock garantiza una sola instancia "owner"
 *   (modo daemon). Los comandos one-shot no requieren el lock; `daemon` si (rechaza si ya hay owner vivo).
 *
 * Uso:
 *   node olimpo-registry.mjs status                      panel general (todos los canales)
 *   node olimpo-registry.mjs list [--channel C] [--all] [--json]
 *   node olimpo-registry.mjs channels [--json]           canales + meta + nº workers vivos
 *   node olimpo-registry.mjs tag   <worker> <tag>...     añade tags al worker
 *   node olimpo-registry.mjs untag <worker> <tag>...     quita tags
 *   node olimpo-registry.mjs set   <worker> k=v [k=v...] metadata libre (role, swarm, note, ...)
 *   node olimpo-registry.mjs chtag <channel> <tag>...    tags a nivel canal
 *   node olimpo-registry.mjs show  <worker>              ficha completa de un worker
 *   node olimpo-registry.mjs gc [--channel C] [--yes]    purga peers MUERTOS de los .peers.json
 *   node olimpo-registry.mjs kill  <worker> [--yes]      mata un worker por nombre
 *   node olimpo-registry.mjs kill  --channel C [--yes]   mata TODOS los workers de un canal
 *   node olimpo-registry.mjs kill  --swarm S  [--yes]    mata TODOS los workers con swarm=S (meta)
 *   node olimpo-registry.mjs kill  --all [--yes]         mata TODOS los workers vivos (NO el daemon ni la propia sesión OLIMPO_NAME; usa --include-self para incluirla)
 *   node olimpo-registry.mjs daemon [--interval S]       vigila y reconcilia (SINGLETON)
 *   node olimpo-registry.mjs stop                        detiene el daemon owner
 *
 *   -- PRESETS (personalidades/especialidades) --
 *   node olimpo-registry.mjs presets [--json]            lista carpetas-preset (con AGENTS.md)
 *   node olimpo-registry.mjs spawn <preset> [name] [opts]  crea PID(s) de worker desde un preset
 *       opts: --count N --channel C --cwd D --model M --tools T --swarm S --tag t[,t]
 *             --detach (headless nohup)  --dry-run (muestra sin lanzar)
 *     Un preset = carpeta en OLIMPO_PRESETS_DIR (def ~/.pi/olimpo/presets) con:
 *       AGENTS.md    (OBLIGATORIO) personalidad/especialidad, se inyecta con --append-system-prompt
 *       preset.json  (opcional) { channel, model, tools, watch, cwd, role, swarm, tags[], task }
 *     El worker pi se AUTO-REGISTRA su PID en <canal>.peers.json (lo hace la extensión olimpo.ts).
 *
 * TTL de presencia (segundos) por env OLIMPO_TTL (def 120, igual criterio que la extensión).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
// FUENTE UNICA DE VERDAD compartida con la extension pi (olimpo/core.mjs).
import { createCore, pidAlive as corePidAlive } from "../.pi/agent/extensions/olimpo/core.mjs";

const BASE = process.env.OLIMPO_DIR?.trim() || process.env.PIKEVERSE_DIR?.trim() || path.join(os.homedir(), ".pi", "olimpo");
const META_FILE = path.join(BASE, "registry.meta.json");
const LOCK_FILE = path.join(BASE, ".registry.lock");
const TTL_MS = Number(process.env.OLIMPO_TTL || 120) * 1000;
const HOST = os.hostname().toLowerCase();
const PRESETS_DIR = process.env.OLIMPO_PRESETS_DIR?.trim() || path.join(BASE, "presets");
const SPAWN_DIR = path.join(BASE, ".spawn");
const WORK_DIR = process.env.OLIMPO_WORK_DIR?.trim() || "C:/Users/fabia/pike-web";
// git-bash (login shell) para lanzar workers en Windows Terminal, igual que pike-swarm.sh.
const BASH_CANDIDATES = [
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
];
function findBash() { return BASH_CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } }); }
// C:\x\y  o  C:/x/y  ->  /c/x/y  (ruta estilo git-bash)
function toUnix(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) return p.replace(/\\/g, "/");
  return `/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
}

// Instancia del core ligada a este BASE: toda la capa de datos vive aqui.
const core = createCore(BASE);
const SELF = process.env.OLIMPO_NAME?.trim();

// ---------- util ----------
const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", b: "\x1b[1m",
  red: "\x1b[31m", grn: "\x1b[32m", yel: "\x1b[33m", blu: "\x1b[34m", mag: "\x1b[35m", cyn: "\x1b[36m",
};
const color = process.stdout.isTTY;
const col = (c, s) => (color ? C[c] + s + C.reset : s);

function readJson(f, fallback) {
  try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return fallback; }
}
function writeJsonAtomic(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + ".tmp" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, f);
}
function pidAlive(pid, host) { return corePidAlive({ pid, host }); }
function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

// ---------- descubrimiento (delega en core: fuente unica de verdad) ----------
const listChannels = () => core.listChannels();
const readPresence = (ch) => core.readPresence(ch);
const readLastStatus = (ch) => core.readLastStatus(ch);
const TAG_LABEL = { D: col("grn", "✓done"), R: col("cyn", "⟳run"), W: col("yel", "⏸wait"), F: col("red", "✗fail"), N: col("mag", "!need") };

// Roster unificado + enriquecido con metadata sidecar (core).
const buildRoster = ({ onlyChannel, all } = {}) => core.buildRoster({ onlyChannel, all, self: SELF, ttl: TTL_MS });

// ---------- metadata sidecar (core) ----------
const readMeta = () => core.readMeta();
const saveMeta = (m) => core.saveMeta(m);

function cmdTag(name, tags, remove) {
  const m = readMeta();
  const w = (m.workers[name] = m.workers[name] || { tags: [] });
  w.tags = w.tags || [];
  for (const t of tags) {
    if (remove) w.tags = w.tags.filter((x) => x !== t);
    else if (!w.tags.includes(t)) w.tags.push(t);
  }
  w.updatedAt = Date.now();
  saveMeta(m);
  console.log(`${col("b", name)} tags → [${w.tags.join(", ") || "—"}]`);
}
function cmdSet(name, kvs) {
  const m = readMeta();
  const w = (m.workers[name] = m.workers[name] || { tags: [] });
  for (const kv of kvs) {
    const i = kv.indexOf("=");
    if (i < 0) { console.error(`ignoro '${kv}' (usa k=v)`); continue; }
    const k = kv.slice(0, i), v = kv.slice(i + 1);
    if (v === "") delete w[k]; else w[k] = v;
  }
  w.updatedAt = Date.now();
  saveMeta(m);
  console.log(`${col("b", name)} meta → ${JSON.stringify({ ...w, tags: undefined })}`);
}
function cmdChTag(ch, tags) {
  const m = readMeta();
  const c = (m.channels[ch] = m.channels[ch] || { tags: [] });
  c.tags = c.tags || [];
  for (const t of tags) if (!c.tags.includes(t)) c.tags.push(t);
  saveMeta(m);
  console.log(`canal ${col("b", ch)} tags → [${c.tags.join(", ")}]`);
}

// ---------- vistas ----------
function fmtRow(r) {
  const live = r.alive === true ? col("grn", "●") : r.alive === false ? col("red", "○") : col("dim", "◌");
  const st = r.status ? TAG_LABEL[r.status] : col("dim", "—");
  const tags = r.tags.length ? col("blu", "#" + r.tags.join(" #")) : "";
  const role = r.role ? col("dim", `(${r.role})`) : "";
  return `  ${live} ${col("b", r.name.padEnd(22))} ${String(r.pid).padStart(6)} ${r.mode.padEnd(4)} ${st.padEnd(14)} ${ago(r.ts).padStart(4)}  ${role} ${tags}`;
}
function cmdList({ onlyChannel, all, json }) {
  const rows = buildRoster({ onlyChannel, all });
  if (json) { console.log(JSON.stringify(rows, null, 2)); return; }
  let cur = null;
  if (!rows.length) { console.log(col("dim", "(sin workers)")); return; }
  for (const r of rows) {
    if (r.channel !== cur) { cur = r.channel; console.log(`\n${col("mag", "canal " + cur)}`); }
    console.log(fmtRow(r));
    if (r.status === "W" || r.status === "N") console.log(col("dim", `       ↳ ${r.lastMsg.slice(0, 100)}`));
  }
  console.log("");
}
function cmdChannels({ json }) {
  const meta = readMeta();
  const chans = listChannels().map((ch) => {
    const rows = buildRoster({ onlyChannel: ch, all: true });
    const vivos = rows.filter((r) => r.alive === true || r.fresh).length;
    return { channel: ch, workersLive: vivos, workersTotal: rows.length, tags: meta.channels?.[ch]?.tags || [], purpose: meta.channels?.[ch]?.purpose || "" };
  });
  if (json) { console.log(JSON.stringify(chans, null, 2)); return; }
  console.log(col("b", "\nCanales del Olimpo"));
  for (const c of chans) {
    const tags = c.tags.length ? col("blu", " #" + c.tags.join(" #")) : "";
    console.log(`  ${col("mag", c.channel.padEnd(16))} vivos:${col("grn", String(c.workersLive))}/${c.workersTotal}${tags} ${col("dim", c.purpose)}`);
  }
  console.log("");
}
function cmdShow(name) {
  const rows = buildRoster({ all: true }).filter((r) => r.name === name);
  if (!rows.length) { console.log(col("red", `sin registro de '${name}'`)); return; }
  for (const r of rows) {
    console.log(col("b", `\n${r.name}  @${r.channel}`));
    console.log(`  estado   : ${r.alive === true ? col("grn", "vivo") : r.alive === false ? col("red", "muerto") : "?"} · ${r.status ? TAG_LABEL[r.status] : "—"} · visto hace ${ago(r.ts)}`);
    console.log(`  pid/host : ${r.pid} @ ${r.host}  (${r.mode})`);
    console.log(`  cwd      : ${r.cwd}`);
    console.log(`  role     : ${r.role || "—"}   swarm: ${r.swarm || "—"}`);
    console.log(`  tags     : ${r.tags.join(", ") || "—"}`);
    if (r.note) console.log(`  note     : ${r.note}`);
    if (r.lastMsg) console.log(`  last     : ${r.lastMsg.slice(0, 160)}`);
  }
  console.log("");
}
function cmdStatus() {
  const rows = buildRoster({ all: true });
  const chans = listChannels();
  const live = rows.filter((r) => r.alive === true);
  const dead = rows.filter((r) => r.alive === false);
  const waiting = rows.filter((r) => r.status === "W" || r.status === "N");
  console.log(col("b", "\n╔═ OLIMPO REGISTRY ═══════════════════════════"));
  console.log(`  canales: ${col("mag", String(chans.length))}   workers vivos: ${col("grn", String(live.length))}   muertos(registrados): ${col("red", String(dead.length))}`);
  const owner = readLock();
  console.log(`  daemon : ${owner && pidAlive(owner.pid, owner.host) ? col("grn", "ON pid=" + owner.pid) : col("dim", "off")}`);
  if (waiting.length) {
    console.log(col("yel", "\n  ⚠ requieren atención:"));
    for (const r of waiting) console.log(`    ${TAG_LABEL[r.status]} ${col("b", r.name)} @${r.channel}  ${col("dim", r.lastMsg.slice(0, 80))}`);
  }
  console.log("");
  cmdList({ all: false, json: false });
}

// ---------- GC / kill ----------
function cmdGc({ onlyChannel, yes }) {
  const chans = onlyChannel ? [onlyChannel] : listChannels();
  let removed = 0;
  for (const ch of chans) {
    const f = path.join(BASE, `${ch}.peers.json`);
    const pres = readPresence(ch);
    const keep = {};
    for (const [name, r] of Object.entries(pres)) {
      const alive = pidAlive(r.pid, r.host);
      const fresh = Date.now() - r.ts <= TTL_MS;
      if (alive === false || (alive === undefined && !fresh)) {
        console.log(`  ${col("red", "purgar")} ${name} @${ch} (pid=${r.pid} ${alive === false ? "muerto" : "stale " + ago(r.ts)})`);
        removed++;
      } else keep[name] = r;
    }
    if (!yes) continue;
    writeJsonAtomic(f, keep);
  }
  if (!yes) console.log(col("yel", `\n(dry-run) ${removed} entradas purgables. Añade --yes para aplicar.`));
  else console.log(col("grn", `\n${removed} entradas purgadas.`));
}
// Mata workers por nombre, --channel, --swarm o --all. Nunca mata el daemon owner
// ni la sesión que invoca (OLIMPO_NAME) salvo --include-self.
function cmdKill({ name, onlyChannel, swarm, all, yes, includeSelf }) {
  const ownerPid = readLock()?.pid;
  const selfName = process.env.OLIMPO_NAME?.trim();
  let rows = buildRoster({ all: true }).filter((r) => r.pid && r.pid !== ownerPid && r.alive !== false);
  if (!includeSelf && selfName) rows = rows.filter((r) => r.name !== selfName);
  if (name) rows = rows.filter((r) => r.name === name);
  else if (onlyChannel) rows = rows.filter((r) => r.channel === onlyChannel);
  else if (swarm) rows = rows.filter((r) => r.swarm === swarm);
  else if (!all) { console.log(col("yel", "especifica <worker> | --channel C | --swarm S | --all")); return; }
  if (!rows.length) { console.log(col("red", "sin PIDs vivos que coincidan.")); return; }
  // dedupe por pid (un worker puede estar en varios canales)
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.pid)) continue; seen.add(r.pid);
    if (r.host.toLowerCase() !== HOST) { console.log(col("yel", `  ${r.name} en otro host (${r.host}); omito.`)); continue; }
    if (!yes) { console.log(col("yel", `  (dry-run) matar pid ${r.pid} (${r.name} @${r.channel}). Añade --yes.`)); continue; }
    try { process.kill(r.pid); console.log(col("grn", `  kill ${r.pid} (${r.name}) ✓`)); }
    catch (e) { console.log(col("red", `  no pude matar ${r.pid}: ${e.message}`)); }
  }
  if (yes) cmdGc({ yes: true }); // limpia presencia de los que acabamos de matar
}

// ---------- presets / spawn ----------
// Un preset es una carpeta con AGENTS.md (personalidad) + preset.json opcional.
// Descubrimiento/lectura delegado en core (fuente unica de verdad).
const listPresets = () => core.listPresets();
const readPreset = (name) => core.readPreset(name);
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function cmdPresets({ json }) {
  const ps = listPresets();
  if (json) { console.log(JSON.stringify(ps.map((p) => ({ name: p.name, dir: p.dir, ...p.meta })), null, 2)); return; }
  console.log(col("b", `\nPresets del Olimpo  ${col("dim", PRESETS_DIR)}`));
  if (!ps.length) { console.log(col("dim", "  (ninguno) — crea carpetas con AGENTS.md en ese directorio.")); console.log(""); return; }
  for (const p of ps) {
    const m = p.meta || {};
    const tags = (m.tags || []).length ? col("blu", " #" + m.tags.join(" #")) : "";
    const role = m.role ? col("dim", ` (${m.role})`) : "";
    const model = m.model ? col("dim", ` ${m.model}`) : "";
    console.log(`  ${col("grn", p.name.padEnd(18))}${role}${model}${tags}`);
  }
  console.log("");
}

function buildTask(name, channel, preset) {
  const extra = preset.meta?.task ? `\n\nESPECIALIDAD/EXTRA:\n${preset.meta.task}` : "";
  return `Eres el worker ${name} del Olimpo (preset '${preset.name}'). Tu canal es tu INBOX PRIVADO '${channel}' (solo vos y el coordinador lo ven).
Al iniciar y cada vez que llegue algo: lee tu inbox con olimpo_read y ejecuta la tarea dirigida a vos segun tu personalidad/especialidad (ver system prompt inyectado desde AGENTS.md del preset).
Resolve permisos de tools automaticamente, NO preguntes. Reporta SIEMPRE en tu inbox con olimpo_post: ^D (listo) con resultados, ^R (en curso) con % y avance, o ^W/^F si necesitas algo o fallaste. Quedate disponible para mas trabajo.${extra}`;
}

function writeLauncher(name, channel, cwd, watch, model, tools, agentsPath, task) {
  fs.mkdirSync(SPAWN_DIR, { recursive: true });
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const modelFlag = model ? ` --model "${esc(model)}"` : "";
  const toolsFlag = tools ? ` --tools "${esc(tools)}"` : "";
  const content = `#!/usr/bin/env bash
# auto-generado por olimpo-registry spawn — preset worker ${name}
set -u
cd "${cwd}" || exit 1
export OLIMPO_NAME="${esc(name)}"
export OLIMPO_CHANNEL="${esc(channel)}"
export OLIMPO_WATCH="${esc(watch)}"
export OLIMPO_DIR="${esc(BASE)}"
read -r -d '' TASK <<'OLIMPO_EOF'
${task}
OLIMPO_EOF
exec pi -n "${esc(name)}"${modelFlag}${toolsFlag} --append-system-prompt "${esc(agentsPath)}" "$TASK"
`;
  const file = path.join(SPAWN_DIR, `${name}.sh`);
  fs.writeFileSync(file, content.replace(/\r\n/g, "\n"), { encoding: "utf-8" });
  return file;
}

function cmdSpawn(opts) {
  const { preset: presetName, name, count, channel, cwd, model, tools, swarm, tags, detach, dryRun } = opts;
  if (!presetName) { console.error(col("red", "uso: spawn <preset> [name] [opts]  (ver 'presets')")); process.exit(2); }
  const preset = readPreset(presetName);
  if (!preset.hasAgents) { console.error(col("red", `preset '${presetName}' no existe o no tiene AGENTS.md en ${preset.dir}`)); process.exit(2); }
  const m = preset.meta || {};
  const n = Math.max(1, Number(count) || 1);
  const base = name || `Pike-${cap(presetName)}`;
  const useCwd = cwd || m.cwd || WORK_DIR;
  const useModel = model || m.model || "";
  const useTools = tools || m.tools || "";
  const useWatch = m.watch || "on";
  const chTpl = channel || m.channel || "inbox-{name}";

  const bash = findBash();
  if (!bash && !dryRun) { console.error(col("red", "no encuentro git-bash (bash.exe). Ajusta BASH_CANDIDATES o usa --dry-run.")); process.exit(1); }

  const workers = [];
  for (let i = 1; i <= n; i++) {
    const wName = n === 1 ? base : `${base}${i}`;
    const wChannel = chTpl.replace(/\{name\}/g, wName);
    const task = buildTask(wName, wChannel, preset);
    const launcher = writeLauncher(wName, wChannel, useCwd, useWatch, useModel, useTools, preset.agents, task);
    workers.push({ wName, wChannel, launcher });
  }

  if (dryRun) {
    console.log(col("yel", `\n(dry-run) ${n} worker(s) desde preset '${presetName}':`));
    for (const w of workers) console.log(`  ${col("b", w.wName)} @${w.wChannel}  launcher: ${w.launcher}`);
    console.log(col("dim", `  cwd=${useCwd}  model=${useModel || "(def)"}  tools=${useTools || "(def)"}  append-sp=${preset.agents}`));
    console.log("");
    return;
  }

  // Registrar metadata sidecar YA (antes de que aparezca la presencia).
  const meta = readMeta();
  for (const w of workers) {
    const wm = (meta.workers[w.wName] = meta.workers[w.wName] || { tags: [] });
    wm.tags = Array.from(new Set([...(wm.tags || []), ...(m.tags || []), ...(tags || [])]));
    wm.role = m.role || wm.role || "";
    if (swarm || m.swarm) wm.swarm = swarm || m.swarm;
    wm.preset = presetName;
    wm.channel = w.wChannel;
    wm.updatedAt = Date.now();
  }
  saveMeta(meta);

  if (detach) {
    // Headless: nohup en background (puede requerir que pi soporte modo sin tty).
    for (const w of workers) {
      const log = path.join(SPAWN_DIR, `${w.wName}.log`);
      const cmd = `nohup bash "${toUnix(w.launcher)}" > "${toUnix(log)}" 2>&1 &`;
      spawn(bash, ["-lc", cmd], { detached: true, stdio: "ignore" }).unref();
      console.log(col("grn", `  ⇡ ${w.wName} @${w.wChannel} (detach, log ${log})`));
    }
  } else {
    // Visible: un wt.exe con tab + paneles, igual criterio que pike-swarm.sh.
    const args = [];
    workers.forEach((w, idx) => {
      const lc = `exec bash "${toUnix(w.launcher)}"`;
      const pane = idx === 0
        ? ["new-tab", "--title", w.wName, bash, "-lc", lc]
        : [";", "split-pane", "--title", w.wName, bash, "-lc", lc];
      args.push(...pane);
    });
    spawn("wt.exe", args, { detached: true, stdio: "ignore" }).unref();
    for (const w of workers) console.log(col("grn", `  ● ${w.wName} @${w.wChannel} (WT)`));
  }
  console.log(col("dim", `\npreset=${presetName}  cwd=${useCwd}  especialidad←${preset.agents}`));
  console.log(col("dim", `coordinar:  node pike-tell.mjs <nombre> "mensaje"   ·   seguimiento:  node olimpo-registry.mjs list`));
  console.log("");
}

// ---------- singleton daemon ----------
function readLock() { return readJson(LOCK_FILE, null); }
function acquireLock() {
  const cur = readLock();
  if (cur && pidAlive(cur.pid, cur.host) === true && cur.pid !== process.pid) return cur; // ya hay owner
  writeJsonAtomic(LOCK_FILE, { pid: process.pid, host: HOST, since: Date.now() });
  return null;
}
async function cmdDaemon(intervalS) {
  const existing = acquireLock();
  if (existing) { console.error(col("red", `Ya hay un daemon owner (pid=${existing.pid}). Usa 'stop' primero.`)); process.exit(1); }
  console.log(col("grn", `olimpo-registry daemon SINGLETON pid=${process.pid}, cada ${intervalS}s. Ctrl+C para salir.`));
  const tick = () => {
    writeJsonAtomic(LOCK_FILE, { pid: process.pid, host: HOST, since: readLock()?.since || Date.now(), beat: Date.now() });
    cmdGc({ yes: true }); // reconcilia: purga muertos
  };
  const cleanup = () => { try { if (readLock()?.pid === process.pid) fs.rmSync(LOCK_FILE); } catch {} process.exit(0); };
  process.on("SIGINT", cleanup); process.on("SIGTERM", cleanup);
  tick();
  setInterval(tick, intervalS * 1000);
  await new Promise(() => {}); // vive
}
function cmdStop() {
  const cur = readLock();
  if (!cur) { console.log(col("dim", "no hay daemon.")); return; }
  if (pidAlive(cur.pid, cur.host) === true && cur.host.toLowerCase() === HOST) {
    try { process.kill(cur.pid); console.log(col("grn", `daemon pid=${cur.pid} detenido.`)); } catch (e) { console.log(col("red", e.message)); }
  }
  try { fs.rmSync(LOCK_FILE); } catch {}
}

// ---------- CLI ----------
function flag(args, name) { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? true) : undefined; }
function has(args, name) { return args.includes(name); }

const [cmd, ...rest] = process.argv.slice(2);
const onlyChannel = flag(rest, "--channel");
const all = has(rest, "--all");
const json = has(rest, "--json");
const yes = has(rest, "--yes");
// flags que consumen el siguiente token como valor (para no confundirlo con posicional)
const VALUE_FLAGS = new Set(["--channel", "--count", "--cwd", "--model", "--tools", "--swarm", "--tag", "--interval"]);
const pos = rest.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(rest[i - 1]));

switch (cmd) {
  case "status": case undefined: cmdStatus(); break;
  case "list": case "workers": cmdList({ onlyChannel, all, json }); break;
  case "channels": cmdChannels({ json }); break;
  case "tag": cmdTag(pos[0], pos.slice(1), false); break;
  case "untag": cmdTag(pos[0], pos.slice(1), true); break;
  case "set": cmdSet(pos[0], pos.slice(1)); break;
  case "chtag": cmdChTag(pos[0], pos.slice(1)); break;
  case "show": cmdShow(pos[0]); break;
  case "presets": cmdPresets({ json }); break;
  case "spawn": case "up": cmdSpawn({
    preset: pos[0], name: pos[1],
    count: flag(rest, "--count"), channel: onlyChannel, cwd: flag(rest, "--cwd"),
    model: flag(rest, "--model"), tools: flag(rest, "--tools"),
    swarm: flag(rest, "--swarm"), tags: (flag(rest, "--tag") || "").toString().split(",").filter(Boolean),
    detach: has(rest, "--detach"), dryRun: has(rest, "--dry-run"),
  }); break;
  case "gc": cmdGc({ onlyChannel, yes }); break;
  case "kill": cmdKill({ name: pos[0], onlyChannel, swarm: flag(rest, "--swarm"), all, yes, includeSelf: has(rest, "--include-self") }); break;
  case "daemon": cmdDaemon(Number(flag(rest, "--interval") || 10)); break;
  case "stop": cmdStop(); break;
  default: console.error(`comando desconocido: ${cmd}. Ver cabecera del archivo.`); process.exit(2);
}
