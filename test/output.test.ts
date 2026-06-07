import { expect, test } from "bun:test"
import { formatMarkdown } from "../src/output"

test("formatMarkdown trims surrounding whitespace and keeps one trailing newline", () => {
  expect(formatMarkdown("\n# Title\n\nBody\n\n")).toBe("# Title\n\nBody\n")
})

test("formatMarkdown returns a fallback for empty assistant output", () => {
  expect(formatMarkdown("   ")).toBe("No output was returned by the model.\n")
})
