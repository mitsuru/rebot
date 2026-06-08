import { z } from "zod"
import type { RebotCommand } from "./types"

export const severitySchema = z.enum(["critical", "high", "medium", "low", "info"])
export const categorySchema = z.enum([
  "correctness",
  "security",
  "performance",
  "maintainability",
  "testing",
  "style",
  "other",
])

export type Severity = z.infer<typeof severitySchema>
export type Category = z.infer<typeof categorySchema>

export const reviewFindingSchema = z.object({
  title: z.string(),
  severity: severitySchema,
  category: categorySchema,
  file: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  description: z.string(),
  suggestion: z.string().optional(),
})

export const reviewResultSchema = z.object({
  summary: z.string().optional(),
  findings: z.array(reviewFindingSchema),
})

export const describeResultSchema = z.object({
  summary: z.string(),
  changedAreas: z.array(z.string()),
  notableDetails: z.array(z.string()),
  suggestedTestFocus: z.array(z.string()),
})

export const improvementSchema = z.object({
  title: z.string(),
  file: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  description: z.string(),
  suggestedCode: z.string().optional(),
})

export const improveResultSchema = z.object({
  suggestions: z.array(improvementSchema),
})

export const allResultSchema = z.object({
  description: describeResultSchema,
  review: reviewResultSchema,
  improvements: improveResultSchema,
})

export type ReviewFinding = z.infer<typeof reviewFindingSchema>
export type ReviewResult = z.infer<typeof reviewResultSchema>
export type DescribeResult = z.infer<typeof describeResultSchema>
export type Improvement = z.infer<typeof improvementSchema>
export type ImproveResult = z.infer<typeof improveResultSchema>
export type AllResult = z.infer<typeof allResultSchema>

const SCHEMAS = {
  describe: describeResultSchema,
  review: reviewResultSchema,
  improve: improveResultSchema,
  all: allResultSchema,
} as const

export function resultSchemaFor(command: RebotCommand) {
  return SCHEMAS[command]
}
