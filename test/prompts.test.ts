import { expect, test } from "bun:test"
import { buildPrompt } from "../src/prompts"
import type { NormalizedInput } from "../src/types"

const input: NormalizedInput = {
  command: "review",
  source: "github-pr",
  diff: "diff --git a/src/a.ts b/src/a.ts",
  pr: {
    number: 123,
    title: "Add feature",
    body: "Body",
    url: "https://github.com/acme/repo/pull/123",
    baseRefName: "main",
    headRefName: "feature",
    files: ["src/a.ts"],
  },
}

test("buildPrompt includes review instructions and diff", () => {
  const prompt = buildPrompt("review", input)

  expect(prompt).toContain("Review Findings")
  expect(prompt).toContain("Findings first")
  expect(prompt).toContain("diff --git")
  expect(prompt).toContain("Add feature")
})

test("buildPrompt for all includes all report sections", () => {
  const prompt = buildPrompt("all", { ...input, command: "all" })

  expect(prompt).toContain("Description")
  expect(prompt).toContain("Review Findings")
  expect(prompt).toContain("Improvement Suggestions")
})
