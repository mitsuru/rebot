#!/usr/bin/env bun
import { Command, CommanderError, InvalidArgumentError } from "commander"
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

const commands: Array<{ name: RebotCommand; description: string }> = [
  { name: "describe", description: "produce a pull request description" },
  { name: "review", description: "produce review findings" },
  { name: "improve", description: "produce improvement suggestions" },
  { name: "all", description: "produce a complete pull request analysis" },
]

export function createProgram(deps: RunCliDeps = {}): Command {
  const collectInput = deps.collectInput ?? defaultCollectInput
  const runOpencodePrompt = deps.runOpencodePrompt ?? defaultRunOpencodePrompt
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text))
  const writeStderr = deps.writeStderr ?? ((text: string) => process.stderr.write(text))

  const program = new Command()
    .name("rebot")
    .version("0.1.0")
    .addHelpText(
      "after",
      `
Shared Options:
  --diff-file <path>  read diff from a file
  --pr <number>       read diff from a GitHub pull request
  --base <ref>        diff the current worktree against a base ref`,
    )
    .exitOverride()
    .configureOutput({
      writeOut: writeStdout,
      writeErr: writeStderr,
      outputError: (text, write) => write(text),
    })

  for (const commandConfig of commands) {
    program
      .command(commandConfig.name)
      .description(commandConfig.description)
      .option("--diff-file <path>", "read diff from a file")
      .option("--pr <number>", "read diff from a GitHub pull request", parsePositiveInteger)
      .option("--base <ref>", "diff the current worktree against a base ref")
      .action(async (options: { diffFile?: string; pr?: number; base?: string }) => {
        const cliOptions = normalizeCliOptions(commandConfig.name, options)
        const input = normalizeInput(await collectInput(cliOptions))
        const prompt = buildPrompt(cliOptions.command, input)
        const result = await runOpencodePrompt(prompt)
        writeStdout(formatMarkdown(result.markdown))
      })
  }

  return program
}

export async function runCli(args: string[], deps: RunCliDeps = {}): Promise<number> {
  const writeStderr = deps.writeStderr ?? ((text: string) => process.stderr.write(text))
  const program = createProgram(deps)

  try {
    await program.parseAsync(args, { from: "user" })
    if (args.length === 0) {
      throw new Error("Unknown command: (missing). Expected describe, review, improve, or all.")
    }
    return 0
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode
    }

    const message = error instanceof Error ? error.message : String(error)
    writeStderr(`rebot: ${message}\n`)
    return 1
  }
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("must be a positive integer")
  }
  return parsed
}

function normalizeCliOptions(
  command: RebotCommand,
  options: { diffFile?: string; pr?: number; base?: string },
): CliOptions {
  const cliOptions: CliOptions = { command }
  if (options.pr) cliOptions.pr = options.pr
  if (options.base) cliOptions.base = options.base
  if (options.diffFile) cliOptions.diffFile = options.diffFile
  return cliOptions
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
