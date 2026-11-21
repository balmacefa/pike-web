// dsl.mjs — pike-web recipe DSL <-> recipes.json (single source for compile/decompile).
// Robust: validation with line numbers, quote escaping, list parsing, generic verbs.

const BS = String.fromCharCode(92); // backslash, built to avoid literal-escape pitfalls

export class DslError extends Error {}
const err = (line, msg) => { throw new DslError(`line ${line}: ${msg}`); };

// --- tokenizer: whitespace-split, "quoted" with \" and \ escapes ---
function tokens(s, line) {
  const out = []; let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '"') {
      i++; let v = "";
      while (i < s.length && s[i] !== '"') {
        if (s[i] === BS && i + 1 < s.length) { v += s[i + 1]; i += 2; }
        else v += s[i++];
      }
      if (i >= s.length) err(line, "unterminated string");
      i++; out.push({ v, q: true });
    } else {
      let v = ""; while (i < s.length && !/\s/.test(s[i])) v += s[i++];
      out.push({ v, q: false });
    }
  }
  return out;
}
const argVal = (t) => t.q ? t.v : (/^-?\d+$/.test(t.v) ? Number(t.v) : t.v);
const quote = (s) => '"' + String(s).split(BS).join(BS + BS).split('"').join(BS + '"') + '"';
const emitArg = (a) => typeof a === "number" ? String(a) : quote(a);

// --- comma-separated list that respects quotes (for `domains`) ---
function splitList(s, line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === BS && q && i + 1 < s.length) { cur += s[++i]; continue; }
    if (c === '"') { q = !q; continue; }
    if (c === "," && !q) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (q) err(line, "unterminated string in list");
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const emitList = (xs) => xs.map(x => /[,"]/.test(x) ? quote(x) : x).join(", ");

export const KNOWN_VERBS = new Set([
  "clickText", "click", "type", "wait", "waitText", "waitSel",
  "openTabClickTile", "openTabClickText", "clickAndWaitUrl",
]);

function unq(s, ln) {
  const t = tokens(s, ln);
  if (t.length !== 1) err(ln, "expected a single matcher token");
  return t[0].v;
}

// --- compile: DSL text -> { _doc, recipes } ---
function compileVerbose(text, { strict = false } = {}) {
  const recipes = {}; let cur = null, step = null;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const t = lines[n].trim(); const ln = n + 1;
    if (!t || t.startsWith("#")) continue;

    const sp0 = t.indexOf(" ");
    const kw = sp0 < 0 ? t : t.slice(0, sp0);
    const rest = t.slice(kw.length).trim();

    if (kw === "recipe") {
      if (!rest) err(ln, "recipe needs a name");
      cur = { name: rest, steps: [] }; recipes[cur.name] = cur; step = null;
    } else if (!cur) {
      err(ln, `'${kw}' before any 'recipe'`);
    } else if (kw === "on") {
      let at;
      if (rest.startsWith("url ")) at = { urlMatch: unq(rest.slice(4), ln) };
      else if (rest.startsWith("text ")) at = { textMatch: unq(rest.slice(5), ln) };
      else if (rest) at = { textMatch: unq(rest, ln) };
      else err(ln, "on needs a matcher");
      step = { at, do: [] }; cur.steps.push(step);
    } else if (kw === "desc") { cur.desc = rest; }
    else if (kw === "domains") { cur.domains = splitList(rest, ln); }
    else if (kw === "start") { cur.start = rest; }
    else if (kw === "goal") {
      if (rest.startsWith("url ")) cur.goal = { urlMatch: rest.slice(4).trim() };
      else if (rest.startsWith("text ")) cur.goal = { textMatch: rest.slice(5).trim() };
      else err(ln, "goal must be 'url <m>' or 'text <m>'");
    } else if (kw === "user") {
      if (rest.startsWith("sel ")) cur.user = { selector: rest.slice(4).trim() };
      else if (rest.startsWith("text ")) cur.user = { textMatch: rest.slice(5).trim() };
      else if (rest) cur.user = { selector: rest };
      else err(ln, "user needs a selector/text");
    } else if (kw === "meta") {
      const sp = rest.indexOf(" ");
      if (sp < 0) err(ln, "meta needs <key> <json>");
      try { cur[rest.slice(0, sp)] = JSON.parse(rest.slice(sp + 1)); }
      catch { err(ln, "meta value is not valid JSON"); }
    } else {
      if (!step) err(ln, `verb '${kw}' before any 'on' step`);
      const toks = tokens(t, ln);
      const verb = toks[0].v;
      if (strict && !KNOWN_VERBS.has(verb)) err(ln, `unknown verb '${verb}'`);
      step.do.push([verb, ...toks.slice(1).map(argVal)]);
    }
  }
  return { _doc: "Compiled from recipes.pweb DSL. DATA interpreted by engine.mjs.", recipes };
}

// --- decompile: { recipes } -> DSL text ---
export function decompile(book) {
  const R = book.recipes || book;
  const L = ["# pike-web recipe DSL (AI-ready). Compile: node core/compile.mjs core/recipes.pweb"];
  const known = ["name", "desc", "domains", "start", "goal", "user", "steps"];
  for (const name in R) {
    const r = R[name];
    L.push("", `recipe ${name}`);
    if (r.desc) L.push(`  desc ${r.desc}`);
    if (r.domains) L.push(`  domains ${emitList(r.domains)}`);
    if (r.start) L.push(`  start ${r.start}`);
    if (r.goal) L.push(`  goal ${r.goal.urlMatch != null ? "url " + r.goal.urlMatch : "text " + r.goal.textMatch}`);
    if (r.user) L.push(`  user ${r.user.selector != null ? "sel " + r.user.selector : "text " + r.user.textMatch}`);
    for (const k of Object.keys(r)) if (!known.includes(k)) L.push(`  meta ${k} ${JSON.stringify(r[k])}`);
    for (const s of (r.steps || [])) {
      const at = s.at && s.at.urlMatch != null ? `url ${quote(s.at.urlMatch)}`
               : s.at ? `text ${quote(s.at.textMatch)}` : 'text ""';
      L.push("", `  on ${at}`);
      for (const d of s.do) L.push(`    ${d[0]}${d.length > 1 ? " " + d.slice(1).map(emitArg).join(" ") : ""}`);
    }
  }
  return L.join("\n") + "\n";
}

// ===== compact sigil codec (lossless, ~25% fewer tokens) =====
const VERB2SIG = { clickText: ">", click: "@", type: "=", wait: ".", waitText: "~",
  waitSel: "?", openTabClickTile: "^", openTabClickText: "^^", clickAndWaitUrl: ">>" };
const SIG2VERB = Object.fromEntries(Object.entries(VERB2SIG).map(([k, v]) => [v, k]));
const LF = String.fromCharCode(10);
const isNum = (s) => /^-?[0-9]+$/.test(s);

export function emitCompact(book) {
  const R = book.recipes || book;
  const known = ["name", "desc", "domains", "start", "goal", "user", "steps"];
  const L = ["# compact pike-web recipe DSL (sigil, lossless). Parse: compile() auto-detects."];
  for (const name in R) {
    const r = R[name];
    L.push("", "R " + name);
    if (r.desc) L.push("# " + r.desc);
    if (r.domains) L.push("d " + emitList(r.domains));
    if (r.start) L.push("s " + r.start);
    if (r.goal) L.push("g " + (r.goal.urlMatch != null ? "u " + r.goal.urlMatch : "t " + r.goal.textMatch));
    if (r.user) L.push("v " + (r.user.selector != null ? r.user.selector : "t " + r.user.textMatch));
    for (const k of Object.keys(r)) if (!known.includes(k)) L.push("m " + k + " " + JSON.stringify(r[k]));
    for (const s of (r.steps || [])) {
      const m = s.at && s.at.urlMatch != null ? "u " + quote(s.at.urlMatch)
              : s.at ? quote(s.at.textMatch) : quote("");
      const ops = (s.do || []).map(d => {
        const sig = VERB2SIG[d[0]] || d[0];
        const args = d.slice(1).map(emitArg).join(" ");
        return args ? sig + " " + args : sig;
      }).join(" ");
      L.push("* " + m + (ops ? " " + ops : ""));
    }
  }
  return L.join(LF) + LF;
}

const isRef = (tk) => !tk.q && tk.v[0] === "$" && /^[0-9]+$/.test(tk.v.slice(1));

function parseCompact(text, { strict = false, legend = [] } = {}) {
  const recipes = {}; let cur = null;
  const rv = (tk) => tk.q ? tk.v : (isRef(tk) ? legend[Number(tk.v.slice(1))] : tk.v);
  const lines = text.split(LF);
  for (let n = 0; n < lines.length; n++) {
    const t = lines[n].trim(); const ln = n + 1;
    if (!t || t === "~~~" || t[0] === "$") continue;
    const sp = t.indexOf(" ");
    const kw = sp < 0 ? t : t.slice(0, sp);
    const rest = t.slice(kw.length).trim();
    if (kw === "R") { cur = { name: rest, steps: [] }; recipes[rest] = cur; }
    else if (!cur) { if (kw === "#") continue; err(ln, "'" + kw + "' before any 'R'"); }
    else if (kw === "#") { cur.desc = rest; }
    else if (kw === "d") { cur.domains = splitList(rest, ln); }
    else if (kw === "s") { cur.start = rest; }
    else if (kw === "g") {
      if (rest.startsWith("u ")) cur.goal = { urlMatch: rest.slice(2).trim() };
      else if (rest.startsWith("t ")) cur.goal = { textMatch: rest.slice(2).trim() };
      else err(ln, "g must be 'u <m>' or 't <m>'");
    } else if (kw === "v") {
      if (rest.startsWith("t ")) cur.user = { textMatch: rest.slice(2).trim() };
      else cur.user = { selector: rest };
    } else if (kw === "m") {
      const s2 = rest.indexOf(" "); if (s2 < 0) err(ln, "m needs <key> <json>");
      try { cur[rest.slice(0, s2)] = JSON.parse(rest.slice(s2 + 1)); } catch { err(ln, "m value not JSON"); }
    } else if (kw === "*") {
      const toks = tokens(rest, ln);
      let i = 0, at;
      if (toks[0] && !toks[0].q && (toks[0].v === "u" || toks[0].v === "t")) {
        at = toks[0].v === "u" ? { urlMatch: rv(toks[1]) } : { textMatch: rv(toks[1]) }; i = 2;
      } else { at = { textMatch: rv(toks[0]) }; i = 1; }
      const step = { at, do: [] }; let op = null;
      for (; i < toks.length; i++) {
        const tk = toks[i];
        if (!tk.q && !isNum(tk.v) && !isRef(tk)) { op = [SIG2VERB[tk.v] || tk.v]; step.do.push(op); }
        else { if (!op) err(ln, "arg before any verb"); op.push(isRef(tk) ? legend[Number(tk.v.slice(1))] : (tk.q ? tk.v : Number(tk.v))); }
      }
      if (strict) for (const d of step.do) if (!KNOWN_VERBS.has(d[0])) err(ln, "unknown verb '" + d[0] + "'");
      cur.steps.push(step);
    } else err(ln, "unknown directive '" + kw + "'");
  }
  return { _doc: "Compiled from compact pike-web DSL.", recipes };
}

function parsePacked(text) {
  const parts = text.split(LF + "~~~");
  const head = parts[0].split(LF);
  const legend = [];
  for (const line of head) {
    const m = line.match(/^\$([0-9]+)=(.*)$/);
    if (m) legend[Number(m[1])] = m[2];
  }
  return parseCompact(text, { legend });
}

// dispatcher: auto-detect verbose ('recipe ') | compact ('R ') | packed ('$N=')
export function compile(text, opts) {
  const first = (text.split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith("#")) || "");
  if (/^\$[0-9]+=/.test(first)) return parsePacked(text);
  if (first.startsWith("R ") || first === "R") return parseCompact(text, opts);
  return compileVerbose(text, opts);
}

// packed emitter: compact + global dictionary of repeated strings (lossless)
export function emitPacked(book) {
  const R = book.recipes || book;
  const cnt = new Map();
  const bump = (s) => { if (typeof s === "string") cnt.set(s, (cnt.get(s) || 0) + 1); };
  for (const name in R) for (const s of (R[name].steps || [])) {
    if (s.at) bump(s.at.urlMatch != null ? s.at.urlMatch : s.at.textMatch);
    for (const d of (s.do || [])) for (const a of d.slice(1)) bump(a);
  }
  const legend = [...cnt.entries()].filter(([, c]) => c >= 2).map(([w]) => w);
  const idx = new Map(legend.map((w, i) => [w, i]));
  const ref = (s) => typeof s === "number" ? String(s) : (idx.has(s) ? "$" + idx.get(s) : quote(s));
  const known = ["name", "desc", "domains", "start", "goal", "user", "steps"];
  const L = legend.map((w, i) => "$" + i + "=" + w); L.push("~~~");
  for (const name in R) {
    const r = R[name];
    L.push("", "R " + name);
    if (r.desc) L.push("# " + r.desc);
    if (r.domains) L.push("d " + emitList(r.domains));
    if (r.start) L.push("s " + r.start);
    if (r.goal) L.push("g " + (r.goal.urlMatch != null ? "u " + r.goal.urlMatch : "t " + r.goal.textMatch));
    if (r.user) L.push("v " + (r.user.selector != null ? r.user.selector : "t " + r.user.textMatch));
    for (const k of Object.keys(r)) if (!known.includes(k)) L.push("m " + k + " " + JSON.stringify(r[k]));
    for (const s of (r.steps || [])) {
      const at = s.at || {};
      const m = at.urlMatch != null ? "u " + ref(at.urlMatch) : ref(at.textMatch);
      const ops = (s.do || []).map(d => {
        const sig = VERB2SIG[d[0]] || d[0];
        const args = d.slice(1).map(ref).join(" ");
        return args ? sig + " " + args : sig;
      }).join(" ");
      L.push("* " + m + (ops ? " " + ops : ""));
    }
  }
  return L.join(LF) + LF;
}
