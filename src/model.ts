import { generateText, type LanguageModel } from "ai"
import { getZenModel } from "./provider"
import type { RunResult } from "./types"

// Default model finalized in task 0-3. Sonnet balances review quality and cost.
export const DEFAULT_MODEL = "claude-sonnet-4-6"

type GenerateFn = (options: { model: LanguageModel; prompt: string }) => Promise<{ text: string }>

interface RunModelDeps {
  model?: string
  resolveModel?: (modelId: string) => Promise<LanguageModel>
  generate?: GenerateFn
}

export async function runModel(prompt: string, deps: RunModelDeps = {}): Promise<RunResult> {
  const modelId = deps.model ?? DEFAULT_MODEL
  const resolveModel = deps.resolveModel ?? ((id: string) => getZenModel(id))
  const generate = deps.generate ?? ((options) => generateText(options))

  try {
    const model = await resolveModel(modelId)
    const result = await generate({ model, prompt })
    return { markdown: result.text }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to run model prompt: ${message}`)
  }
}
