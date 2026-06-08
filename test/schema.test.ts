import { describe, expect, test } from "bun:test"
import {
  allResultSchema,
  describeResultSchema,
  improveResultSchema,
  resultSchemaFor,
  reviewResultSchema,
} from "../src/schema"

describe("reviewResultSchema", () => {
  test("parses a result with a fully specified finding", () => {
    const parsed = reviewResultSchema.parse({
      summary: "One issue found.",
      findings: [
        {
          title: "Null deref",
          severity: "high",
          category: "correctness",
          file: "src/a.ts",
          startLine: 12,
          endLine: 18,
          description: "value may be undefined",
          suggestion: "guard with a null check",
        },
      ],
    })

    expect(parsed.findings[0]?.severity).toBe("high")
    expect(parsed.findings[0]?.endLine).toBe(18)
  })

  test("accepts a finding with only the required fields", () => {
    const result = reviewResultSchema.safeParse({
      findings: [
        { title: "X", severity: "low", category: "style", description: "d" },
      ],
    })

    expect(result.success).toBe(true)
  })

  test("rejects an unknown severity", () => {
    const result = reviewResultSchema.safeParse({
      findings: [
        { title: "X", severity: "blocker", category: "style", description: "d" },
      ],
    })

    expect(result.success).toBe(false)
  })

  test("rejects a finding missing its description", () => {
    const result = reviewResultSchema.safeParse({
      findings: [{ title: "X", severity: "low", category: "style" }],
    })

    expect(result.success).toBe(false)
  })

  test("rejects a non-integer line", () => {
    const result = reviewResultSchema.safeParse({
      findings: [
        { title: "X", severity: "low", category: "style", description: "d", startLine: 1.5 },
      ],
    })

    expect(result.success).toBe(false)
  })
})

describe("describeResultSchema", () => {
  test("parses a description with all sections", () => {
    const parsed = describeResultSchema.parse({
      summary: "Adds an add() helper.",
      changedAreas: ["src/math.ts"],
      notableDetails: [],
      suggestedTestFocus: ["overflow"],
    })

    expect(parsed.changedAreas).toEqual(["src/math.ts"])
  })

  test("requires a summary", () => {
    const result = describeResultSchema.safeParse({
      changedAreas: [],
      notableDetails: [],
      suggestedTestFocus: [],
    })

    expect(result.success).toBe(false)
  })
})

describe("improveResultSchema", () => {
  test("parses improvement suggestions", () => {
    const parsed = improveResultSchema.parse({
      suggestions: [
        {
          title: "Extract constant",
          file: "src/a.ts",
          description: "magic number",
          suggestedCode: "const MAX = 10",
        },
      ],
    })

    expect(parsed.suggestions[0]?.title).toBe("Extract constant")
  })
})

describe("allResultSchema", () => {
  test("composes description, review, and improvements", () => {
    const parsed = allResultSchema.parse({
      description: { summary: "s", changedAreas: [], notableDetails: [], suggestedTestFocus: [] },
      review: { findings: [] },
      improvements: { suggestions: [] },
    })

    expect(parsed.review.findings).toEqual([])
  })
})

describe("resultSchemaFor", () => {
  test("returns the matching schema per command", () => {
    expect(resultSchemaFor("review")).toBe(reviewResultSchema)
    expect(resultSchemaFor("describe")).toBe(describeResultSchema)
    expect(resultSchemaFor("improve")).toBe(improveResultSchema)
    expect(resultSchemaFor("all")).toBe(allResultSchema)
  })
})
