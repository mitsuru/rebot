/**
 * Parses a unified diff and returns, per new-file path, the set of line numbers
 * that can carry a GitHub review comment on the RIGHT side: added (`+`) and
 * context (` `) lines within hunks.
 */
export function commentableLines(diff: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>()
  let currentFile: string | undefined
  let newLine = 0

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = parseNewPath(line)
      currentFile = path
      if (path && !result.has(path)) result.set(path, new Set())
      continue
    }

    if (line.startsWith("@@")) {
      newLine = parseHunkNewStart(line)
      continue
    }

    if (!currentFile || newLine === 0) continue

    if (line.startsWith("+")) {
      result.get(currentFile)?.add(newLine)
      newLine++
    } else if (line.startsWith("-")) {
      // removed line: old side only, new-side numbering unchanged
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file": not a content line
    } else if (line.startsWith(" ")) {
      // context line (always prefixed with a space in a unified diff)
      result.get(currentFile)?.add(newLine)
      newLine++
    }
  }

  return result
}

function parseNewPath(line: string): string | undefined {
  const raw = line.slice(4).trim()
  if (raw === "/dev/null") return undefined
  return raw.replace(/^b\//, "")
}

function parseHunkNewStart(line: string): number {
  const match = line.match(/\+(\d+)/)
  return match ? Number(match[1]) : 0
}
