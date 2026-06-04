#!/usr/bin/env bun
import { collectInput as defaultCollectInput } from "./inputs"
import { runOpencodePrompt as defaultRunOpencodePrompt } from "./opencode"
import { formatMarkdown } from "./output"
import { buildPrompt } from "./prompts"
import type { CliOptions, NormalizedInput, PullRequestMetadata, RebotCommand, RunResult } from "./types"

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

const commands = new Set<RebotCommand>(["describe", "review", "improve", "all"])

export function parseArgs(args: string[]): CliOptions {
  const [rawCommand, ...rest] = args
  if (!rawCommand || !commands.has(rawCommand as RebotCommand)) {
    throw new Error(`Unknown command: ${rawCommand ?? "(missing)"}. Expected describe, review, improve, or all.`)
  }

  const options: CliOptions = { command: rawCommand as RebotCommand }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    const value = rest[index + 1]

    if (arg === "--pr") {
      if (!value) throw new Error("--pr requires a PR number")
      const pr = Number(value)
      if (!Number.isInteger(pr) || pr <= 0) throw new Error("--pr requires a positive integer")
      options.pr = pr
      index += 1
      continue
    }

    if (arg === "--base") {
      if (!value) throw new Error("--base requires a branch or ref")
      options.base = value
      index += 1
      continue
    }

    if (arg === "--diff-file") {
      if (!value) throw new Error("--diff-file requires a path")
      options.diffFile = value
      index += 1
      continue
    }

    throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

export async function runCli(args: string[], deps: RunCliDeps = {}): Promise<number> {
  const collectInput = deps.collectInput ?? defaultCollectInput
  const runOpencodePrompt = deps.runOpencodePrompt ?? defaultRunOpencodePrompt
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text))
  const writeStderr = deps.writeStderr ?? ((text: string) => process.stderr.write(text))

  try {
    const options = parseArgs(args)
    const input = normalizeInput(await collectInput(options))
    const prompt = buildPrompt(options.command, input)
    const result = await runOpencodePrompt(prompt)
    writeStdout(formatMarkdown(result.markdown))
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeStderr(`rebot: ${message}\n`)
    return 1
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
