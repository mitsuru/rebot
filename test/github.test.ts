import { describe, expect, test } from "bun:test"
import { buildReviewComments, commentMarker, postComment, postReview } from "../src/github"

type Call = { command: string; args: string[] }

function fakeExec(handlers: (call: Call) => string) {
  const calls: Call[] = []
  const exec = async (command: string, args: string[]) => {
    const call = { command, args }
    calls.push(call)
    return handlers(call)
  }
  return { exec, calls }
}

describe("commentMarker", () => {
  test("is command-specific and HTML-hidden", () => {
    expect(commentMarker("review")).toBe("<!-- revoid:review -->")
  })
})

describe("postComment", () => {
  test("creates a new comment when none carries the marker", async () => {
    const { exec, calls } = fakeExec(({ args }) => {
      if (args[0] === "repo") return "acme/repo\n"
      if (args[0] === "api" && args.includes("--paginate")) return "[]"
      if (args.includes("-X") && args.includes("POST")) return '{"id":111,"html_url":"https://x/111"}'
      return ""
    })

    const result = await postComment({ pr: 7, command: "review", body: "# Review Findings" }, { exec })

    expect(result.action).toBe("created")
    expect(result.id).toBe(111)
    const post = calls.find((c) => c.args.includes("POST"))
    expect(post?.args.join(" ")).toContain("repos/acme/repo/issues/7/comments")
    const bodyArg = post?.args.find((a) => a.startsWith("body="))
    expect(bodyArg).toContain("<!-- revoid:review -->")
  })

  test("updates the existing marked comment instead of creating a duplicate", async () => {
    const { exec, calls } = fakeExec(({ args }) => {
      if (args[0] === "repo") return "acme/repo"
      if (args[0] === "api" && args.includes("--paginate")) {
        return JSON.stringify([
          { id: 1, body: "unrelated" },
          { id: 42, body: "old result\n<!-- revoid:review -->" },
        ])
      }
      if (args.includes("PATCH")) return '{"id":42,"html_url":"https://x/42"}'
      return ""
    })

    const result = await postComment({ pr: 7, command: "review", body: "new body" }, { exec })

    expect(result.action).toBe("updated")
    expect(result.id).toBe(42)
    const patch = calls.find((c) => c.args.includes("PATCH"))
    expect(patch?.args.join(" ")).toContain("repos/acme/repo/issues/comments/42")
    expect(calls.some((c) => c.args.includes("POST"))).toBe(false)
  })
})

const REVIEW_DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,2 @@
+const a = 1
+const b = 2
`

describe("buildReviewComments", () => {
  test("keeps findings on commentable lines and skips the rest", () => {
    const { comments, skipped } = buildReviewComments(
      [
        { title: "On line 2", severity: "high", category: "correctness", file: "src/a.ts", startLine: 2, description: "d", suggestion: "fix it" },
        { title: "Off-diff", severity: "low", category: "style", file: "src/a.ts", startLine: 99, description: "d" },
        { title: "No location", severity: "low", category: "style", description: "d" },
      ],
      REVIEW_DIFF,
    )

    expect(comments).toHaveLength(1)
    expect(skipped).toBe(2)
    expect(comments[0]?.path).toBe("src/a.ts")
    expect(comments[0]?.line).toBe(2)
    expect(comments[0]?.side).toBe("RIGHT")
    expect(comments[0]?.body).toContain("On line 2")
    expect(comments[0]?.body).toContain("fix it")
  })
})

describe("postReview", () => {
  test("posts a COMMENT review via gh api with a payload file", async () => {
    let tempContent = ""
    const calls: Array<{ command: string; args: string[] }> = []
    const exec = async (command: string, args: string[]) => {
      calls.push({ command, args })
      if (args[0] === "repo") return "acme/repo"
      if (args.includes("reviews")) return '{"id":9}'
      return ""
    }
    const writeTemp = async (content: string) => {
      tempContent = content
      return "/tmp/payload.json"
    }

    const result = await postReview(
      { pr: 7, comments: [{ path: "src/a.ts", line: 2, side: "RIGHT", body: "x" }] },
      { exec, writeTemp },
    )

    expect(result.count).toBe(1)
    const post = calls.find((c) => c.args.some((a) => a.includes("reviews")))
    expect(post?.args.join(" ")).toContain("repos/acme/repo/pulls/7/reviews")
    expect(post?.args.join(" ")).toContain("/tmp/payload.json")
    const payload = JSON.parse(tempContent)
    expect(payload.event).toBe("COMMENT")
    expect(payload.comments).toHaveLength(1)
  })

  test("does nothing when there are no comments", async () => {
    let execCalled = false
    const result = await postReview(
      { pr: 7, comments: [] },
      { exec: async () => { execCalled = true; return "" }, writeTemp: async () => "/tmp/x" },
    )
    expect(result.count).toBe(0)
    expect(execCalled).toBe(false)
  })
})
