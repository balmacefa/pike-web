// tests/dsl.test.mjs — round-trip + validation for the recipe DSL. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, decompile, DslError } from "../core/dsl.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const sortK = x => Array.isArray(x) ? x.map(sortK)
  : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sortK(x[k])])) : x;
const eq = (a, b) => assert.deepEqual(sortK(a), sortK(b));

test("round-trip: every recipe json -> dsl -> json is deep-equal", () => {
  const orig = JSON.parse(readFileSync(resolve(HERE, "../core/recipes.json"), "utf8")).recipes;
  const back = compile(decompile({ recipes: orig })).recipes;
  assert.equal(Object.keys(back).length, Object.keys(orig).length);
  for (const k of Object.keys(orig)) eq(orig[k], back[k], k);
});

test("escaping: quotes and commas survive round-trip", () => {
  const book = { recipes: { r: { name: "r", domains: ['a,b.com', 'c"d.com'], steps: [
    { at: { textMatch: "x" }, do: [["type", "#s", 'he said "hi", ok']] }] } } };
  eq(book.recipes, compile(decompile(book)).recipes);
});

test("numbers vs strings preserved", () => {
  const { recipes } = compile(`recipe r\n  on text "a"\n    wait 600\n    clickText "600"`);
  assert.deepEqual(recipes.r.steps[0].do, [["wait", 600], ["clickText", "600"]]);
});

test("validation: verb before any 'on' throws with line", () => {
  assert.throws(() => compile(`recipe r\n  clickText "x"`), e => e instanceof DslError && /line 2/.test(e.message));
});
test("validation: directive before any recipe throws", () => {
  assert.throws(() => compile(`desc hi`), DslError);
});
test("validation: unterminated string throws", () => {
  assert.throws(() => compile(`recipe r\n  on text "a"\n    type "#s oops`), DslError);
});
test("validation: --strict rejects unknown verb", () => {
  assert.throws(() => compile(`recipe r\n  on text "a"\n    frobnicate "x"`, { strict: true }), /unknown verb/);
});

import { emitCompact, emitPacked } from "../core/dsl.mjs";
const BOOK = () => compile(readFileSync(resolve(HERE, "../core/recipes.pweb"), "utf8")).recipes;

test("compact codec: round-trip all recipes", () => {
  const b = BOOK(); const back = compile(emitCompact({ recipes: b })).recipes;
  for (const k of Object.keys(b)) eq(b[k], back[k], k);
});
test("packed codec (dict): round-trip all recipes", () => {
  const b = BOOK(); const back = compile(emitPacked({ recipes: b })).recipes;
  for (const k of Object.keys(b)) eq(b[k], back[k], k);
});
