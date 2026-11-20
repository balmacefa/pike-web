#!/usr/bin/env node
// compile.mjs — DSL (.pweb) -> recipes.json. Usage: node core/compile.mjs <in.pweb> [out.json] [--strict]
import fs from "node:fs";
import { compile, DslError } from "./dsl.mjs";
const args = process.argv.slice(2).filter(a => a !== "--strict");
const strict = process.argv.includes("--strict");
try {
  const json = JSON.stringify(compile(fs.readFileSync(args[0] || "core/recipes.pweb", "utf8"), { strict }), null, 2);
  if (args[1]) { fs.writeFileSync(args[1], json); console.error("wrote " + args[1]); } else console.log(json);
} catch (e) { if (e instanceof DslError) { console.error("DSL error: " + e.message); process.exit(1); } throw e; }
