#!/usr/bin/env node
// decompile.mjs — recipes.json -> DSL (.pweb). Usage: node core/decompile.mjs <in.json> [out.pweb]
import fs from "node:fs";
import { decompile } from "./dsl.mjs";
const args = process.argv.slice(2);
const txt = decompile(JSON.parse(fs.readFileSync(args[0] || "core/recipes.json", "utf8")));
if (args[1]) { fs.writeFileSync(args[1], txt); console.error("wrote " + args[1]); } else process.stdout.write(txt);
