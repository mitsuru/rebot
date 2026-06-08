import { expect, test } from "bun:test"
import { analyze } from "../src/analyze"

test("analyze renders a review result to Markdown via the fallback path", async () => {
  const reviewJson = JSON.stringify({
    summary: "One issue.",
    findings: [
      {
        title: "Subtraction bug",
        severity: "critical",
        category: "correctness",
        file: "x.ts",
        startLine: 1,
        description: "returns a - b",
        suggestion: "use a + b",
      },
    ],
  })

  const md = await analyze("review", "review this diff", {
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      throw new Error("native unsupported")
    },
    generateText: async () => ({ text: reviewJson }),
  })

  expect(md).toContain("# Review Findings")
  expect(md).toContain("Subtraction bug")
  expect(md).toContain("x.ts:1")
  expect(md).toContain("use a + b")
})

test("analyze uses the schema for the given command", async () => {
  const describeJson = JSON.stringify({
    summary: "Adds a helper.",
    changedAreas: ["x.ts"],
    notableDetails: [],
    suggestedTestFocus: [],
  })

  const md = await analyze("describe", "describe this diff", {
    resolveModel: async () => ({}) as never,
    generateObject: async () => {
      throw new Error("native unsupported")
    },
    generateText: async () => ({ text: describeJson }),
  })

  expect(md).toContain("# Description")
  expect(md).toContain("Adds a helper.")
})
