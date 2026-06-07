import { expect, test } from "bun:test"
import { DEFAULT_MODEL, runModel } from "../src/model"

test("runModel returns the generated text as markdown and passes prompt + resolved model", async () => {
  const seen: { id?: string; prompt?: string; model?: unknown } = {}

  const result = await runModel("hello", {
    model: "test-model",
    resolveModel: async (id) => {
      seen.id = id
      return { id } as never
    },
    generate: async ({ model, prompt }) => {
      seen.model = model
      seen.prompt = prompt
      return { text: "assistant output" }
    },
  })

  expect(result.markdown).toBe("assistant output")
  expect(seen.id).toBe("test-model")
  expect(seen.prompt).toBe("hello")
  expect(seen.model).toEqual({ id: "test-model" })
})

test("runModel uses DEFAULT_MODEL when no model is provided", async () => {
  let usedId = ""

  await runModel("hi", {
    resolveModel: async (id) => {
      usedId = id
      return {} as never
    },
    generate: async () => ({ text: "x" }),
  })

  expect(usedId).toBe(DEFAULT_MODEL)
})

test("runModel resolves model id: deps.model > REBOT_MODEL env > DEFAULT_MODEL", async () => {
  const ids: string[] = []
  const resolveModel = async (id: string) => {
    ids.push(id)
    return {} as never
  }
  const generate = async () => ({ text: "x" })

  await runModel("p", { resolveModel, generate, env: { REBOT_MODEL: "env-model" } })
  await runModel("p", { resolveModel, generate, env: {} })
  await runModel("p", { model: "explicit", resolveModel, generate, env: { REBOT_MODEL: "env-model" } })

  expect(ids).toEqual(["env-model", DEFAULT_MODEL, "explicit"])
})

test("runModel surfaces model errors with context", async () => {
  await expect(
    runModel("hi", {
      resolveModel: async () => ({}) as never,
      generate: async () => {
        throw new Error("boom")
      },
    }),
  ).rejects.toThrow(/Failed to run model prompt.*boom/)
})
