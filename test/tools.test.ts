import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createContextTools, grepRepo, readFileContent } from "../src/tools"

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "rebot-tools-"))
  mkdirSync(join(root, "src"))
  writeFileSync(join(root, "src", "math.ts"), "export function add(a: number, b: number) {\n  return a - b\n}\n")
  writeFileSync(join(root, "src", "util.ts"), "export const NAME = 'rebot'\n")
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true })
  writeFileSync(join(root, "node_modules", "pkg", "index.js"), "export const add = 1\n")
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("readFileContent", () => {
  test("returns numbered lines for a file under the root", async () => {
    const out = await readFileContent(root, "src/math.ts")
    expect(out).toContain("return a - b")
    expect(out).toContain("1")
    expect(out).toContain("2")
  })

  test("refuses paths that escape the repository root", async () => {
    const out = await readFileContent(root, "../../etc/passwd")
    expect(out.toLowerCase()).toContain("outside")
  })

  test("reports a missing file instead of throwing", async () => {
    const out = await readFileContent(root, "src/missing.ts")
    expect(out.toLowerCase()).toContain("not")
  })
})

describe("grepRepo", () => {
  test("finds matches with file and line references", async () => {
    const out = await grepRepo(root, "function add")
    expect(out).toContain("src/math.ts")
    expect(out).toMatch(/src\/math\.ts:1/)
  })

  test("excludes node_modules", async () => {
    const out = await grepRepo(root, "add")
    expect(out).not.toContain("node_modules")
  })

  test("reports an invalid regular expression", async () => {
    const out = await grepRepo(root, "(")
    expect(out.toLowerCase()).toContain("invalid")
  })

  test("reports when there are no matches", async () => {
    const out = await grepRepo(root, "zzz_nonexistent_zzz")
    expect(out.toLowerCase()).toContain("no matches")
  })
})

describe("createContextTools", () => {
  test("exposes read_file and grep tools", () => {
    const tools = createContextTools(root)
    expect(Object.keys(tools).sort()).toEqual(["grep", "read_file"])
  })
})
