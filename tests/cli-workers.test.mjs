#!/usr/bin/env node
/**
 * Test DINÁMICO del CLI de workers (olimpo-registry.mjs) — arquitectura MVC.
 * ---------------------------------------------------------------------------
 *   MODELO       core.mjs                 fuente única de verdad
 *                                          (PACT · presencia/PID · roster · meta · presets)
 *   CONTROLADOR  olimpo-registry.mjs       comandos que CONSULTAN y MUTAN el modelo
 *   VISTA (a)    render del CLI            list/channels/status --json
 *   VISTA (b)    UI Godot roster_reader    lee el modelo y lo muestra (mapa)
 *
 * "Dinámico": crea PROCESOS REALES (sleepers) para tener PIDs vivos y valida el
 * flujo  Controlador → Modelo → Vista  en runtime, en un OLIMPO_DIR temporal
 * aislado (no toca los canales reales del Olimpo).
 *
 * Correr:  node tests/cli-workers.test.mjs      (exit 0 si todo pasa)
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "swarm", "olimpo-registry.mjs");
const CORE_URL = pathToFileURL("C:/Users/fabia/.pi/agent/extensions/olimpo/core.mjs").href;
const GODOT_PROJ = "C:/Users/fabia/GodotProjects/PikeverseNavigator";

function findGodot() {
  const base = "C:/Users/fabia/AppData/Local/Microsoft/WinGet/Packages";
  try {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith("GodotEngine")) continue;
      const pd = path.join(base, d);
      const e = fs.readdirSync(pd).find((f) => f.includes("Godot") && f.includes("win64_console") && f.endsWith(".exe"));
      if (e) return path.join(pd, e);
    }
  } catch {}
  return null;
}
const GD = findGodot();

const TMP = path.join(os.tmpdir(), `olimpo_cli_test_${process.pid}`);
fs.mkdirSync(TMP, { recursive: true });
const ENV = { ...process.env, OLIMPO_DIR: TMP, OLIMPO_TTL: "120" };

let pass = 0, fail = 0;
const sleepers = [];
const log = (tag, l) => console.log(`  ${tag} · ${l}`);
const ok = (c, l) => (c ? (pass++, log("PASS", l)) : (fail++, log("FAIL", l)));
const eq = (g, w, l) => ok(JSON.stringify(g) === JSON.stringify(w), `${l}  (want=${JSON.stringify(w)} got=${JSON.stringify(g)})`);
const cli = (...a) => execFileSync("node", [CLI, ...a], { env: ENV, encoding: "utf8" });
const cliJson = (...a) => JSON.parse(cli(...a));
const section = (t) => console.log(`\n${"═".repeat(66)}\n  ${t}\n${"═".repeat(66)}`);
function spawnSleeper() {
  const c = spawn(process.execPath, ["-e", "setInterval(()=>{},1e9)"], { detached: true, stdio: "ignore" });
  c.unref();
  sleepers.push(c.pid);
  return c.pid;
}
function waitDead(pid, ms = 2500) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { process.kill(pid, 0); } catch { return true; } }
  return false;
}
function godotView(extraEnv, label) {
  if (!GD) return ok(false, `${label} (no encontré Godot console exe)`);
  try {
    const out = execFileSync(GD, ["--headless", "--path", GODOT_PROJ, "--script", "res://tests/roster_reader.gd"],
      { env: { ...ENV, ...extraEnv }, encoding: "utf8" });
    const vline = out.split("\n").find((l) => l.includes("UI ve"));
    if (vline) console.log(`    ${vline.trim()}`);
    ok(out.includes("UI↔BACKEND PASS"), label);
  } catch (e) {
    const out = `${e.stdout || ""}${e.stderr || ""}`;
    ok(false, `${label} (godot exit ${e.status})`);
    out.split("\n").filter((l) => l.includes("UI") || l.includes("FAIL")).forEach((l) => console.log(`    ${l.trim()}`));
  }
}

const coreMod = await import(CORE_URL);
const { HOST } = coreMod;
const core = coreMod.createCore(TMP);

console.log(`Test dinámico CLI de workers (MVC) · OLIMPO_DIR=${TMP}`);
console.log(`Godot: ${GD ? "ok" : "NO ENCONTRADO"}`);

try {
  // ══════════ MODELO ══════════
  section("MODELO · core.mjs (fuente única de verdad)");
  const pidA = spawnSleeper();
  const pidB = spawnSleeper();
  core.touchPresence("qa-live", "Pike-Alpha", { pid: pidA, host: HOST, cwd: "C:/w", mode: "tui" });
  core.touchPresence("qa-live", "Pike-Beta", { pid: pidB, host: HOST, cwd: "C:/w", mode: "tui" });
  core.touchPresence("qa-dead", "Pike-Zombie", { pid: 999999, host: HOST, mode: "tui" });
  // IMPORTANTE: pasar selfRec con el pid REAL del sleeper. Si no, post->touchPresence
  // reescribiría la presencia con process.pid (el del test) y un 'kill' mataría al test.
  core.post("qa-live", "Pike-Alpha", "^R trabajando 40%", { pid: pidA, host: HOST, cwd: "C:/w", mode: "tui" });
  core.post("qa-live", "Pike-Beta", "^D listo", { pid: pidB, host: HOST, cwd: "C:/w", mode: "tui" });
  const rm = core.buildRoster({ onlyChannel: "qa-live", all: true });
  ok(rm.find((r) => r.name === "Pike-Alpha")?.alive === true, "modelo: Pike-Alpha VIVO (pid real)");
  ok(rm.find((r) => r.name === "Pike-Beta")?.status === "D", "modelo: estado ^D parseado del PACT");
  eq(core.pidAlive({ pid: 999999, host: HOST }), false, "modelo: pid inexistente = muerto");
  ok(core.readAll("qa-live").length === 2, "modelo: .pact tiene 2 líneas");

  // ══════════ CONTROLADOR ══════════
  section("CONTROLADOR · olimpo-registry.mjs (comandos → modelo)");
  const lj = cliJson("list", "--channel", "qa-live", "--json");
  const a = lj.find((r) => r.name === "Pike-Alpha");
  const b = lj.find((r) => r.name === "Pike-Beta");
  ok(a && a.alive === true, "controlador: list --json ve a Pike-Alpha vivo");
  eq(a?.status, "R", "controlador: list expone estado ^R de Alpha");
  eq(b?.status, "D", "controlador: list expone estado ^D de Beta");

  cli("tag", "Pike-Alpha", "qa", "critical");
  cli("set", "Pike-Alpha", "role=tester");
  const a2 = cliJson("list", "--channel", "qa-live", "--json").find((r) => r.name === "Pike-Alpha");
  ok(a2.tags.includes("qa") && a2.tags.includes("critical"), "controlador: tag persiste en el modelo (meta)");
  eq(a2.role, "tester", "controlador: set role=tester persiste");

  cli("gc", "--yes");
  ok(!("Pike-Zombie" in core.readPresence("qa-dead")), "controlador: gc purga el pid muerto del modelo");
  ok("Pike-Alpha" in core.readPresence("qa-live"), "controlador: gc respeta a los vivos");

  fs.mkdirSync(path.join(TMP, "presets", "qa-bot"), { recursive: true });
  fs.writeFileSync(path.join(TMP, "presets", "qa-bot", "AGENTS.md"), "# QA bot\nEres un worker de prueba.");
  fs.writeFileSync(path.join(TMP, "presets", "qa-bot", "preset.json"), JSON.stringify({ role: "qa", channel: "inbox-{name}" }));
  ok(cli("presets").includes("qa-bot"), "controlador: presets lista el preset creado dinámicamente");
  const dry = cli("spawn", "qa-bot", "--dry-run");
  ok(dry.includes("dry-run") && dry.includes("qa-bot"), "controlador: spawn --dry-run reporta sin lanzar");
  ok(Object.keys(core.readMeta().workers).every((n) => !n.startsWith("Pike-Qa-bot")), "controlador: dry-run NO escribe meta");

  // ══════════ VISTA (a) · render CLI ══════════
  section("VISTA (a) · render del CLI (JSON refleja el modelo)");
  const chans = cliJson("channels", "--json");
  ok((chans.find((c) => c.channel === "qa-live")?.workersLive ?? 0) >= 2, "vista-cli: channels refleja ≥2 vivos en qa-live");
  ok(cli("status").includes("Pike-Alpha"), "vista-cli: status muestra el worker del modelo");

  // ══════════ VISTA (b) · UI Godot ══════════
  section("VISTA (b) · UI Godot (el mapa lee el MISMO modelo)");
  godotView({ EXPECT_WORKERS: "Pike-Alpha,Pike-Beta" }, "UI↔backend: la UI ve los workers que creó el backend");

  // Controlador MATA a Beta → la Vista (UI) debe reflejarlo
  cli("kill", "Pike-Beta", "--yes");
  ok(waitDead(pidB), "controlador: kill terminó el PROCESO REAL de Pike-Beta");
  cli("gc", "--yes");
  ok(!("Pike-Beta" in core.readPresence("qa-live")), "controlador: gc purgó a Beta del modelo");
  godotView({ EXPECT_WORKERS: "Pike-Alpha", FORBID_WORKERS: "Pike-Beta" }, "UI↔backend: la UI REFLEJA el kill (Beta desaparece, Alpha queda)");
} catch (e) {
  fail++;
  console.log(`\n  EXCEPCION: ${e.message}`);
  if (e.stderr) console.log(`  stderr: ${e.stderr}`);
} finally {
  for (const pid of sleepers) { try { process.kill(pid); } catch {} }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
}

console.log(`\n${"─".repeat(66)}`);
console.log(`  RESULTADO: ${pass} PASS · ${fail} FAIL  (${pass + fail} total)`);
console.log(fail === 0 ? "  ✅ MVC OK · Controlador→Modelo→Vista íntegro (CLI y UI)" : "  ❌ HAY FALLOS");
console.log("─".repeat(66));
process.exit(fail > 0 ? 1 : 0);
