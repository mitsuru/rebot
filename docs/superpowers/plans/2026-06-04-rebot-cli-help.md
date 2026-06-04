# rebot CLI Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add standard `commander`-based help and version output to `rebot` while preserving existing workflow behavior.

**Architecture:** Replace the hand-written CLI parser in `src/cli.ts` with a small `createProgram()` function using `commander`. `runCli()` remains the testable entry point and injects input collection, opencode execution, stdout, and stderr dependencies.

**Tech Stack:** Bun, TypeScript, `commander`, `bun:test`.

---

## File Structure

- Modify: `package.json` - add `commander` dependency.
- Modify: `bun.lock` - lock the new dependency through `bun install`.
- Modify: `src/cli.ts` - replace custom parsing with commander program creation and command actions.
- Modify: `test/cli.test.ts` - test help, version, orchestration, and invalid option behavior.
- Modify: `README.md` - document help and version commands.

## Task 1: Add Commander Dependency

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Add the dependency**

Run:

```bash
mise exec -- bun add commander
```

Expected: `package.json` includes `commander` under `dependencies`, and `bun.lock` is updated.

- [ ] **Step 2: Verify existing tests still pass**

Run:

```bash
mise exec -- bun test
```

Expected: PASS with the existing test count.

Run:

```bash
mise exec -- bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit dependency update**

Run:

```bash
git add package.json bun.lock
git commit -m "chore: add commander dependency"
```

## Task 2: Replace CLI Parser With Commander

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Replace CLI tests with commander behavior tests**

Replace `test/cli.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
mise exec -- bun test test/cli.test.ts
```

Expected: FAIL because `src/cli.ts` still uses the custom parser and does not support commander help/version behavior.

- [ ] **Step 3: Replace `src/cli.ts` with commander implementation**

Replace `src/cli.ts` with:

```ts
#!/usr/bin/env bun
import { Command, CommanderError, InvalidArgumentError } from "commander"
import { collectInput as defaultCollectInput } from "./inputs"
import { runOpencodePrompt as defaultRunOpencodePrompt } from "./opencode"
import { formatMarkdown } from "./output"
import { buildPrompt } from "./prompts"
import type { CliOptions, NormalizedInput, PullRequestMetadata, RebotCommand, RunResult } from "./types"

const version = "0.1.0"

type RunCliInput = Omit<NormalizedInput, "base" | "diffFile" | "pr"> & {
  base?: string | undefined
  diffFile?: string | undefined
  pr?: PullRequestMetadata | undefined
}

interface RunCliDeps {
  collectInput?: (options: CliOptions) => Promise<RunCliInput>
  runOpencodePrompt?: (prompt: string) => Promise<RunResult>
  writeStdout?: (text: string) => void
  writeStderr?: (text: string) => void
}

interface SharedCommanderOptions {
  diffFile?: string
  pr?: number
  base?: string
}

interface ProgramDeps extends Required<RunCliDeps> {
  setExitCode: (code: number) => void
}

export async function runCli(args: string[], deps: RunCliDeps = {}): Promise<number> {
  let exitCode = 0
  const program = createProgram({
    collectInput: deps.collectInput ?? defaultCollectInput,
    runOpencodePrompt: deps.runOpencodePrompt ?? defaultRunOpencodePrompt,
    writeStdout: deps.writeStdout ?? ((text: string) => process.stdout.write(text)),
    writeStderr: deps.writeStderr ?? ((text: string) => process.stderr.write(text)),
    setExitCode: (code) => {
      exitCode = code
    },
  })

  try {
    await program.parseAsync(args, { from: "user" })
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode
    const message = error instanceof Error ? error.message : String(error)
    const writeStderr = deps.writeStderr ?? ((text: string) => process.stderr.write(text))
    writeStderr(`rebot: ${message}\n`)
    return 1
  }

  return exitCode
}

export function createProgram(deps: ProgramDeps): Command {
  const program = new Command()
  program
    .name("rebot")
    .description("PR-Agent-like CLI powered by opencode")
    .version(version)
    .exitOverride()
    .configureOutput({
      writeOut: deps.writeStdout,
      writeErr: deps.writeStderr,
    })

  addWorkflowCommand(program, "describe", "summarize a PR or diff", deps)
  addWorkflowCommand(program, "review", "produce review findings", deps)
  addWorkflowCommand(program, "improve", "suggest improvements", deps)
  addWorkflowCommand(program, "all", "produce description, review findings, and improvements", deps)

  return program
}

function addWorkflowCommand(program: Command, command: RebotCommand, description: string, deps: ProgramDeps): void {
  program
    .command(command)
    .description(description)
    .option("--diff-file <path>", "Read a patch file instead of querying git or GitHub")
    .option("--pr <number>", "Read PR metadata and diff through GitHub CLI", parsePositiveInteger)
    .option("--base <ref>", "Read git diff <ref>...HEAD")
    .action(async (options: SharedCommanderOptions) => {
      await runWorkflow({ command, ...toCliOptions(options) }, deps)
    })
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("must be a positive integer")
  }
  return parsed
}

function toCliOptions(options: SharedCommanderOptions): Omit<CliOptions, "command"> {
  const result: Omit<CliOptions, "command"> = {}
  if (options.pr !== undefined) result.pr = options.pr
  if (options.base) result.base = options.base
  if (options.diffFile) result.diffFile = options.diffFile
  return result
}

async function runWorkflow(options: CliOptions, deps: ProgramDeps): Promise<void> {
  try {
    const input = normalizeInput(await deps.collectInput(options))
    const prompt = buildPrompt(options.command, input)
    const result = await deps.runOpencodePrompt(prompt)
    deps.writeStdout(formatMarkdown(result.markdown))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    deps.writeStderr(`rebot: ${message}\n`)
    deps.setExitCode(1)
  }
}

function normalizeInput(input: RunCliInput): NormalizedInput {
  const normalized: NormalizedInput = { command: input.command, source: input.source, diff: input.diff }
  if (input.pr) normalized.pr = input.pr
  if (input.base) normalized.base = input.base
  if (input.diffFile) normalized.diffFile = input.diffFile
  return normalized
}

if (import.meta.main) {
  const code = await runCli(Bun.argv.slice(2))
  process.exit(code)
}
```

- [ ] **Step 4: Run CLI tests and typecheck**

Run:

```bash
mise exec -- bun test test/cli.test.ts
```

Expected: PASS.

Run:

```bash
mise exec -- bun test
```

Expected: PASS.

Run:

```bash
mise exec -- bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit commander CLI implementation**

Run:

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: add commander cli help"
```

## Task 3: Document Help and Verify Binary Behavior

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README Help section**

Modify `README.md` to add this section after the development examples:

```md
## Help

```bash
rebot --help
rebot review --help
rebot --version
```
```

- [ ] **Step 2: Run full verification and build**

Run:

```bash
mise exec -- bun test
```

Expected: PASS.

Run:

```bash
mise exec -- bun run typecheck
```

Expected: PASS.

Run:

```bash
mise exec -- bun run build
```

Expected: PASS and `./rebot` exists.

- [ ] **Step 3: Smoke test compiled help and version**

Run:

```bash
./rebot --help
```

Expected: exit `0`, output includes `Usage: rebot [options] [command]` and `review`.

Run:

```bash
./rebot review --help
```

Expected: exit `0`, output includes `Usage: rebot review [options]` and `--pr <number>`.

Run:

```bash
./rebot --version
```

Expected: exit `0`, output is `0.1.0`.

Run:

```bash
./rebot review --bogus
```

Expected: non-zero exit, stderr includes `unknown option`.

- [ ] **Step 4: Remove build artifact and commit README**

Run:

```bash
rm -f ./rebot
git add README.md
git commit -m "docs: document cli help"
```

## Self-Review Notes

- Spec coverage: tasks cover commander dependency, top-level help, command help, version output, preserved workflow orchestration, invalid option behavior, README documentation, and compiled binary smoke checks.
- Placeholder scan: no placeholders or deferred requirements remain.
- Type consistency: `CliOptions`, `RunCliInput`, `SharedCommanderOptions`, and `ProgramDeps` have explicit definitions before use.
