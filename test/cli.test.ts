import { expect, test } from "bun:test"
import { parseArgs, runCli } from "../src/cli"

test("parseArgs parses review with PR number", () => {
  expect(parseArgs(["review", "--pr", "123"])).toEqual({ command: "review", pr: 123 })
})

test("parseArgs parses base and diff-file", () => {
  expect(parseArgs(["improve", "--base", "main"])).toEqual({ command: "improve", base: "main" })
  expect(parseArgs(["describe", "--diff-file", "x.patch"])).toEqual({ command: "describe", diffFile: "x.patch" })
})

test("parseArgs rejects unknown commands", () => {
  expect(() => parseArgs(["unknown"])).toThrow("Unknown command")
})

test("runCli orchestrates input prompt opencode and output", async () => {
  const writes: string[] = []
  const code = await runCli(["review", "--diff-file", "fixtures/sample.patch"], {
    collectInput: async (options) => ({ command: options.command, source: "diff-file", diff: "diff", diffFile: options.diffFile }),
    runOpencodePrompt: async (prompt) => ({ markdown: `result for ${prompt.includes("Review Findings")}` }),
    writeStdout: (text) => writes.push(text),
    writeStderr: (text) => writes.push(`ERR:${text}`),
  })

  expect(code).toBe(0)
  expect(writes).toEqual(["result for true\n"])
})
