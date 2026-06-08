import type { ZodType } from "zod"
import { runModelObject, type RunModelObjectDeps } from "./model"
import { renderResult } from "./render"
import { resultSchemaFor } from "./schema"
import type { RebotCommand } from "./types"

/**
 * Runs a command end-to-end: builds a schema-validated structured result from
 * the model, then renders it to Markdown.
 */
export async function analyze(
  command: RebotCommand,
  prompt: string,
  deps: RunModelObjectDeps = {},
): Promise<string> {
  const schema = resultSchemaFor(command) as ZodType
  const result = await runModelObject(prompt, schema, deps)
  return renderResult(command, result)
}
