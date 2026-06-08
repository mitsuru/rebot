import type {
  AllResult,
  DescribeResult,
  ImproveResult,
  ReviewFinding,
  ReviewResult,
  Severity,
} from "./schema"
import type { RebotCommand } from "./types"

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"]

export function renderReview(result: ReviewResult): string {
  const parts: string[] = ["# Review Findings"]

  if (result.findings.length === 0) {
    parts.push("No findings.")
    if (result.summary) parts.push(result.summary)
    return parts.join("\n\n")
  }

  if (result.summary) parts.push(result.summary)

  const ordered = [...result.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  )
  for (const finding of ordered) {
    parts.push(renderFinding(finding))
  }

  return parts.join("\n\n")
}

function renderFinding(finding: ReviewFinding): string {
  const lines: string[] = [`## [${finding.severity}] ${finding.title}`]

  const meta = [`**Category:** ${finding.category}`]
  const location = formatLocation(finding.file, finding.startLine, finding.endLine)
  if (location) meta.push(`**Location:** ${location}`)
  lines.push(meta.join(" · "))

  lines.push(finding.description)
  if (finding.suggestion) lines.push(`**Suggestion:** ${finding.suggestion}`)

  return lines.join("\n\n")
}

function formatLocation(file?: string, startLine?: number, endLine?: number): string | undefined {
  if (!file) return undefined
  if (startLine === undefined) return file
  if (endLine === undefined || endLine === startLine) return `${file}:${startLine}`
  return `${file}:${startLine}-${endLine}`
}

export function renderDescribe(result: DescribeResult): string {
  return [
    "# Description",
    "## Summary",
    result.summary,
    "## Changed Areas",
    renderList(result.changedAreas),
    "## Notable Implementation Details",
    renderList(result.notableDetails),
    "## Suggested Test Focus",
    renderList(result.suggestedTestFocus),
  ].join("\n\n")
}

function renderList(items: string[]): string {
  if (items.length === 0) return "_None_"
  return items.map((item) => `- ${item}`).join("\n")
}

export function renderImprove(result: ImproveResult): string {
  const parts: string[] = ["# Improvement Suggestions"]

  if (result.suggestions.length === 0) {
    parts.push("No improvement suggestions.")
    return parts.join("\n\n")
  }

  for (const suggestion of result.suggestions) {
    const lines: string[] = [`## ${suggestion.title}`]
    const location = formatLocation(suggestion.file, suggestion.startLine, suggestion.endLine)
    if (location) lines.push(`**Location:** ${location}`)
    lines.push(suggestion.description)
    if (suggestion.suggestedCode) lines.push(`\`\`\`\n${suggestion.suggestedCode}\n\`\`\``)
    parts.push(lines.join("\n\n"))
  }

  return parts.join("\n\n")
}

export function renderAll(result: AllResult): string {
  return [
    renderDescribe(result.description),
    renderReview(result.review),
    renderImprove(result.improvements),
  ].join("\n\n")
}

export function renderResult(command: RebotCommand, result: unknown): string {
  switch (command) {
    case "describe":
      return renderDescribe(result as DescribeResult)
    case "review":
      return renderReview(result as ReviewResult)
    case "improve":
      return renderImprove(result as ImproveResult)
    case "all":
      return renderAll(result as AllResult)
  }
}
