import { describe, expect, test } from "bun:test"
import {
  GO_BASE_URL,
  ZEN_API_KEY_ENV,
  ZEN_BASE_URL,
  createProvider,
  getModel,
  parseModelSpec,
  resolveZenApiKey,
} from "../src/provider"

const authJson = (key: string) =>
  JSON.stringify({ openai: { type: "oauth" }, "opencode-go": { type: "api", key } })

describe("base URLs", () => {
  test("zen and go point at the opencode gateways", () => {
    expect(ZEN_BASE_URL).toBe("https://opencode.ai/zen/v1")
    expect(GO_BASE_URL).toBe("https://opencode.ai/zen/go/v1")
  })
})

describe("resolveZenApiKey", () => {
  test("prefers the environment variable when set", async () => {
    const key = await resolveZenApiKey({
      env: { [ZEN_API_KEY_ENV]: "env-key" },
      readAuthFile: async () => authJson("auth-key"),
    })

    expect(key).toBe("env-key")
  })

  test("falls back to the opencode-go key from auth.json", async () => {
    const key = await resolveZenApiKey({
      env: {},
      readAuthFile: async () => authJson("auth-key"),
    })

    expect(key).toBe("auth-key")
  })

  test("throws a helpful error when no key is available", async () => {
    await expect(
      resolveZenApiKey({
        env: {},
        readAuthFile: async () => {
          throw new Error("ENOENT")
        },
      }),
    ).rejects.toThrow(/opencode-go/)
  })
})

describe("parseModelSpec", () => {
  test("defaults to the zen endpoint with no prefix", () => {
    expect(parseModelSpec("claude-sonnet-4-6")).toEqual({
      baseURL: ZEN_BASE_URL,
      modelId: "claude-sonnet-4-6",
    })
  })

  test("routes zen/ and opencode/ prefixes to the zen endpoint", () => {
    expect(parseModelSpec("zen/claude-sonnet-4-6")).toEqual({
      baseURL: ZEN_BASE_URL,
      modelId: "claude-sonnet-4-6",
    })
    expect(parseModelSpec("opencode/gpt-5.4")).toEqual({
      baseURL: ZEN_BASE_URL,
      modelId: "gpt-5.4",
    })
  })

  test("routes go/ and opencode-go/ prefixes to the go endpoint", () => {
    expect(parseModelSpec("go/deepseek-v4-pro")).toEqual({
      baseURL: GO_BASE_URL,
      modelId: "deepseek-v4-pro",
    })
    expect(parseModelSpec("opencode-go/deepseek-v4-pro")).toEqual({
      baseURL: GO_BASE_URL,
      modelId: "deepseek-v4-pro",
    })
  })

  test("treats an unknown prefix as part of the model id on zen", () => {
    expect(parseModelSpec("foo/bar")).toEqual({
      baseURL: ZEN_BASE_URL,
      modelId: "foo/bar",
    })
  })
})

describe("createProvider / getModel", () => {
  test("builds a chat model with the requested model id", () => {
    const provider = createProvider({ apiKey: "k", baseURL: ZEN_BASE_URL })
    const model = provider("claude-haiku-4-5")

    expect(model.modelId).toBe("claude-haiku-4-5")
  })

  test("getModel strips the prefix and returns the bare model id", async () => {
    const model = await getModel("go/deepseek-v4-pro", {
      env: { [ZEN_API_KEY_ENV]: "k" },
      readAuthFile: async () => authJson("auth-key"),
    })

    expect(model.modelId).toBe("deepseek-v4-pro")
  })
})
