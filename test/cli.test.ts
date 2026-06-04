import { expect, test } from "bun:test"
import { runCli } from "../src/cli"

test("top-level help includes commands and shared options", async () => {
  const stdout: string[] = []
  const stderr: string[] = []
  const code = await runCli(["--help"], {
    collectInput: async () => {
      throw new Error("collectInput should not run for help")
    },
    runOpencodePrompt: async () => {
      throw new Error("opencode should not run for help")
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: (text) => stderr.push(text),
  })

  expect(code).toBe(0)
  expect(stderr).toEqual([])
  expect(stdout.join("")).toContain("Usage: rebot [options] [command]")
  expect(stdout.join("")).toContain("describe")
  expect(stdout.join("")).toContain("review")
  expect(stdout.join("")).toContain("--diff-file <path>")
  expect(stdout.join("")).toContain("--pr <number>")
  expect(stdout.join("")).toContain("--base <ref>")
})

test("command help includes command description and shared options", async () => {
  const stdout: string[] = []
  const code = await runCli(["review", "--help"], {
    collectInput: async () => {
      throw new Error("collectInput should not run for command help")
    },
    runOpencodePrompt: async () => {
      throw new Error("opencode should not run for command help")
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(stdout.join("")).toContain("Usage: rebot review [options]")
  expect(stdout.join("")).toContain("produce review findings")
  expect(stdout.join("")).toContain("--diff-file <path>")
  expect(stdout.join("")).toContain("--pr <number>")
  expect(stdout.join("")).toContain("--base <ref>")
})

test("version outputs package version", async () => {
  const stdout: string[] = []
  const code = await runCli(["--version"], {
    collectInput: async () => {
      throw new Error("collectInput should not run for version")
    },
    runOpencodePrompt: async () => {
      throw new Error("opencode should not run for version")
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => undefined,
  })

  expect(code).toBe(0)
  expect(stdout.join("").trim()).toBe("0.1.0")
})

test("runCli orchestrates review with PR number", async () => {
  const writes: string[] = []
  const seenOptions: unknown[] = []
  const code = await runCli(["review", "--pr", "123"], {
    collectInput: async (options) => {
      seenOptions.push(options)
      return { command: options.command, source: "github-pr", diff: "diff" }
    },
    runOpencodePrompt: async (prompt) => ({ markdown: `result for ${prompt.includes("Review Findings")}` }),
    writeStdout: (text) => writes.push(text),
    writeStderr: (text) => writes.push(`ERR:${text}`),
  })

  expect(code).toBe(0)
  expect(seenOptions).toEqual([{ command: "review", pr: 123 }])
  expect(writes).toEqual(["result for true\n"])
})

test("unknown options fail without invoking opencode", async () => {
  const stderr: string[] = []
  const code = await runCli(["review", "--bogus"], {
    collectInput: async () => {
      throw new Error("collectInput should not run for invalid options")
    },
    runOpencodePrompt: async () => {
      throw new Error("opencode should not run for invalid options")
    },
    writeStdout: () => undefined,
    writeStderr: (text) => stderr.push(text),
  })

  expect(code).toBe(1)
  expect(stderr.join("")).toContain("unknown option")
})
