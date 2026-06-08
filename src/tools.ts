import { readdir, readFile, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { tool } from "ai"
import { z } from "zod"

const MAX_READ_LINES = 400
const MAX_GREP_RESULTS = 40
const MAX_GREP_FILE_BYTES = 512 * 1024
const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", ".beads", ".worktrees"])

function resolveWithinRoot(root: string, relPath: string): string | undefined {
  const base = resolve(root)
  const target = resolve(base, relPath)
  const rel = relative(base, target)
  if (rel.startsWith("..") || isAbsolute(rel)) return undefined
  return target
}

export async function readFileContent(root: string, relPath: string, maxLines = MAX_READ_LINES): Promise<string> {
  const target = resolveWithinRoot(root, relPath)
  if (!target) return `Error: path "${relPath}" is outside the repository root.`

  let content: string
  try {
    content = await readFile(target, "utf8")
  } catch {
    return `Error: file "${relPath}" was not found or could not be read.`
  }

  const lines = content.split("\n")
  const shown = lines.slice(0, maxLines)
  const numbered = shown.map((line, i) => `${i + 1}\t${line}`).join("\n")
  if (lines.length > maxLines) {
    return `${numbered}\n... (${lines.length - maxLines} more lines truncated)`
  }
  return numbered
}

function isExcluded(relPath: string): boolean {
  return relPath.split(/[\\/]/).some((segment) => EXCLUDED_DIRS.has(segment))
}

/** Yield repository-relative file paths (posix separators), skipping dotfiles and excluded dirs. */
async function* walkFiles(base: string, relDir = ""): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(resolve(base, relDir), { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue // dot: false
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      yield* walkFiles(base, relDir ? `${relDir}/${entry.name}` : entry.name)
    } else if (entry.isFile()) {
      yield relDir ? `${relDir}/${entry.name}` : entry.name
    }
  }
}

export async function grepRepo(root: string, pattern: string, maxResults = MAX_GREP_RESULTS): Promise<string> {
  let regex: RegExp
  try {
    regex = new RegExp(pattern)
  } catch (error) {
    return `Error: invalid regular expression: ${error instanceof Error ? error.message : String(error)}`
  }

  const base = resolve(root)
  const matches: string[] = []

  for await (const rel of walkFiles(base)) {
    if (isExcluded(rel)) continue
    if (matches.length >= maxResults) break

    let text: string
    try {
      const target = resolve(base, rel)
      const info = await stat(target)
      if (info.size > MAX_GREP_FILE_BYTES) continue
      text = await readFile(target, "utf8")
    } catch {
      continue
    }
    if (text.includes("\u0000")) continue // skip binary files

    const lines = text.split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= maxResults) break
      const line = lines[i] as string
      if (regex.test(line)) {
        matches.push(`${rel.split(sep).join("/")}:${i + 1}: ${line.trim()}`)
      }
    }
  }

  if (matches.length === 0) return `No matches for /${pattern}/.`
  return matches.join("\n")
}

export function createContextTools(root: string) {
  return {
    read_file: tool({
      description:
        "Read a UTF-8 text file from the repository being reviewed. Returns up to 400 numbered lines. Use this to inspect code outside the diff (callers, definitions, types).",
      inputSchema: z.object({
        path: z.string().describe("Repository-relative path, e.g. src/foo.ts"),
      }),
      execute: ({ path }) => readFileContent(root, path),
    }),
    grep: tool({
      description:
        "Search the repository for a JavaScript regular expression. Returns matching 'path:line: text', capped. Use this to find definitions, callers, or related code.",
      inputSchema: z.object({
        pattern: z.string().describe("JavaScript regular expression"),
        maxResults: z.number().int().positive().max(100).optional(),
      }),
      execute: ({ pattern, maxResults }) => grepRepo(root, pattern, maxResults ?? MAX_GREP_RESULTS),
    }),
  }
}
