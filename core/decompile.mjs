#!/usr/bin/env node
// decompile.mjs — recipes.json -> DSL. Usage: node core/decompile.mjs <in.json> [out] [--compact|--packed]
import fs from "node:fs";
import { decompile, emitCompact, emitPacked } from "./dsl.mjs";
const flags = process.argv.slice(2).filter(a => a.startsWith("--"));
const pos = process.argv.slice(2).filter(a => !a.startsWith("--"));
const book = JSON.parse(fs.readFileSync(pos[0] || "core/recipes.json", "utf8"));
const emit = flags.includes("--packed") ? emitPacked : flags.includes("--compact") ? emitCompact : decompile;
const txt = emit(book);
if (pos[1]) { fs.writeFileSync(pos[1], txt); console.error("wrote " + pos[1]); } else process.stdout.write(txt);
