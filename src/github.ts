import { commentableLines } from "./diff"
import { execCommand, type ExecCommand } from "./exec"
import type { ReviewFinding } from "./schema"

export function commentMarker(command: string): string {
  return `<!-- rebot:${command} -->`
}

interface PostCommentDeps {
  exec?: ExecCommand
}

export interface PostCommentResult {
  action: "created" | "updated"
  id: number
  url?: string
}

export async function postComment(
  opts: { pr: number; command: string; body: string },
  deps: PostCommentDeps = {},
): Promise<PostCommentResult> {
  const exec = deps.exec ?? execCommand
  const marker = commentMarker(opts.command)
  const fullBody = `${opts.body}\n\n${marker}`

  const repo = (await exec("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])).trim()

  const listJson = await exec("gh", ["api", `repos/${repo}/issues/${opts.pr}/comments`, "--paginate"])
  const comments = JSON.parse(listJson) as Array<{ id: number; body?: string }>
  const existing = comments.find((comment) => (comment.body ?? "").includes(marker))

  if (existing) {
    const updated = await exec("gh", [
      "api",
      "-X",
      "PATCH",
      `repos/${repo}/issues/comments/${existing.id}`,
      "-f",
      `body=${fullBody}`,
    ])
    return { action: "updated", ...parseComment(updated, existing.id) }
  }

  const created = await exec("gh", [
    "api",
    "-X",
    "POST",
    `repos/${repo}/issues/${opts.pr}/comments`,
    "-f",
    `body=${fullBody}`,
  ])
  return { action: "created", ...parseComment(created) }
}

function parseComment(json: string, fallbackId = 0): { id: number; url?: string } {
  try {
    const parsed = JSON.parse(json) as { id?: number; html_url?: string }
    const result: { id: number; url?: string } = { id: parsed.id ?? fallbackId }
    if (parsed.html_url) result.url = parsed.html_url
    return result
  } catch {
    return { id: fallbackId }
  }
}

export interface ReviewComment {
  path: string
  line: number
  side: "RIGHT"
  body: string
}

export function buildReviewComments(
  findings: ReviewFinding[],
  diff: string,
): { comments: ReviewComment[]; skipped: number } {
  const commentable = commentableLines(diff)
  const comments: ReviewComment[] = []
  let skipped = 0

  for (const finding of findings) {
    if (finding.file && finding.startLine !== undefined && commentable.get(finding.file)?.has(finding.startLine)) {
      comments.push({ path: finding.file, line: finding.startLine, side: "RIGHT", body: findingBody(finding) })
    } else {
      skipped++
    }
  }

  return { comments, skipped }
}

function findingBody(finding: ReviewFinding): string {
  const lines = [`**[${finding.severity}] ${finding.title}**`, finding.description]
  if (finding.suggestion) lines.push(`Suggestion: ${finding.suggestion}`)
  return lines.join("\n\n")
}

interface PostReviewDeps {
  exec?: ExecCommand
  writeTemp?: (content: string) => Promise<string>
}

export async function postReview(
  opts: { pr: number; comments: ReviewComment[] },
  deps: PostReviewDeps = {},
): Promise<{ count: number }> {
  if (opts.comments.length === 0) return { count: 0 }

  const exec = deps.exec ?? execCommand
  const writeTemp = deps.writeTemp ?? defaultWriteTemp
  const repo = (await exec("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])).trim()

  const payload = JSON.stringify({ event: "COMMENT", comments: opts.comments })
  const path = await writeTemp(payload)
  await exec("gh", ["api", "-X", "POST", `repos/${repo}/pulls/${opts.pr}/reviews`, "--input", path])

  return { count: opts.comments.length }
}

async function defaultWriteTemp(content: string): Promise<string> {
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const path = join(tmpdir(), `rebot-review-${content.length}.json`)
  await Bun.write(path, content)
  return path
}
