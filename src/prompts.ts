import type { NormalizedInput, RebotCommand } from "./types"

export function buildPrompt(command: RebotCommand, input: NormalizedInput): string {
  const metadata = buildMetadata(input)
  const instruction = commandInstruction(command)

  return `${instruction}

Context:
${metadata}

Diff:
\`\`\`diff
${input.diff.trim()}
\`\`\`
`
}

function commandInstruction(command: RebotCommand): string {
  if (command === "describe") {
    return `You are generating a PR description.
Return Markdown with these sections:
# Description
## Summary
## Changed Areas
## Notable Implementation Details
## Suggested Test Focus
Be concise and base every claim on the provided diff.`
  }

  if (command === "review") {
    return `You are reviewing a pull request for correctness.
Return Markdown with this top-level section:
# Review Findings
Findings first, ordered by severity. For each finding, include a file or diff reference when possible, explain the risk, and suggest a concrete fix. If there are no findings, say that explicitly and mention residual risks or testing gaps.`
  }

  if (command === "improve") {
    return `You are suggesting practical improvements for a pull request.
Return Markdown with this top-level section:
# Improvement Suggestions
Focus on concrete improvements that are close to the diff. Do not propose broad unrelated refactors.`
  }

  return `You are producing a complete PR analysis.
Return Markdown with these top-level sections, in this order:
# Description
# Review Findings
# Improvement Suggestions
For Review Findings, put findings first, ordered by severity. If there are no findings, say that explicitly and mention residual risks or testing gaps.`
}

function buildMetadata(input: NormalizedInput): string {
  const lines = [`- Source: ${input.source}`]

  if (input.pr) {
    lines.push(`- PR: #${input.pr.number}`)
    lines.push(`- Title: ${input.pr.title}`)
    lines.push(`- URL: ${input.pr.url}`)
    lines.push(`- Base: ${input.pr.baseRefName}`)
    lines.push(`- Head: ${input.pr.headRefName}`)
    lines.push(`- Body: ${input.pr.body || "(empty)"}`)
    lines.push(`- Files: ${input.pr.files.length > 0 ? input.pr.files.join(", ") : "(none reported)"}`)
  }

  if (input.base) lines.push(`- Base: ${input.base}`)
  if (input.diffFile) lines.push(`- Diff file: ${input.diffFile}`)

  return lines.join("\n")
}
