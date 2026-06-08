#!/usr/bin/env bun
/**
 * Manual eval (not part of `bun test`, since it calls a live model).
 *
 * Scenario: the PR (fixtures/eval/caller.patch) adds area.ts which calls
 * multiply() from lib.ts. multiply() is buggy (adds instead of multiplying) and
 * lives OUTSIDE the diff. A reviewer can only catch it by reading lib.ts.
 *
 * Run: bun run scripts/eval-context.ts
 * Compares review quality with repository context tools on vs off.
 */
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { analyze } from "../src/analyze"
import { buildPrompt } from "../src/prompts"

const evalDir = join(dirname(import.meta.dir), "fixtures", "eval")
const diff = await readFile(join(evalDir, "caller.patch"), "utf8")
const prompt = buildPrompt("review", {
  command: "review",
  source: "diff-file",
  diff,
  diffFile: "caller.patch",
})

function caughtBug(md: string): boolean {
  const lower = md.toLowerCase()
  // The bug is that multiply() adds instead of multiplying. Require a clear
  // statement of the mis-implementation, not just a mention of "multiply".
  return lower.includes("multiply") && /(a \+ b|addition|adds instead|incorrectly implement|return a \+ b)/.test(lower)
}

for (const context of [true, false]) {
  console.log(`\n================ context: ${context ? "ON" : "OFF"} ================`)
  const md = await analyze("review", prompt, { cwd: evalDir, context })
  console.log(md)
  console.log(`---> caught multiply bug: ${caughtBug(md)}`)
}
