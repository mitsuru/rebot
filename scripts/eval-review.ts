#!/usr/bin/env bun
/**
 * Manual eval (not part of `bun test`, since it calls a live model).
 *
 * fixtures/eval-review/changes.patch introduces server.ts with three distinct,
 * unambiguous defects across different dimensions:
 *   1. SQL injection   — getUser builds a query by string concatenation
 *   2. null/undefined  — firstUpper(items?) dereferences items[0] when undefined
 *   3. resource leak   — readConfig opens a file handle and never closes it
 *
 * Run: bun run scripts/eval-review.ts
 * Reports which dimensions the review caught.
 */
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { analyze } from "../src/analyze"
import { buildPrompt } from "../src/prompts"
import type { ReviewResult } from "../src/schema"

const patch = join(dirname(import.meta.dir), "fixtures", "eval-review", "changes.patch")
const diff = await readFile(patch, "utf8")
const prompt = buildPrompt("review", { command: "review", source: "diff-file", diff, diffFile: "changes.patch" })

const json = await analyze("review", prompt, { context: false, format: "json" })
const result = JSON.parse(json) as ReviewResult
const text = JSON.stringify(result).toLowerCase()

const checks: Record<string, boolean> = {
  "SQL injection": /inject|sql|sanitiz|parameteri/.test(text),
  "null/undefined": /undefined|null|optional|items\[0\]|may be empty/.test(text),
  "resource leak": /leak|close|resource|handle|finally/.test(text),
}

console.log(`Findings: ${result.findings.length}`)
for (const f of result.findings) console.log(`- [${f.severity}] ${f.title} (${f.file ?? "?"}:${f.startLine ?? "?"})`)
console.log("\nDimensions caught:")
for (const [name, hit] of Object.entries(checks)) console.log(`  ${hit ? "✓" : "✗"} ${name}`)
const caught = Object.values(checks).filter(Boolean).length
console.log(`\nScore: ${caught}/${Object.keys(checks).length}`)
