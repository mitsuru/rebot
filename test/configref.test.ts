import { describe, expect, test } from "bun:test"
import { configReference, configReferenceData } from "../src/configref"

describe("configReferenceData", () => {
  test("documents every config key with a default and description", () => {
    const data = configReferenceData()
    const keys = data.keys.map((k) => k.key)

    expect(keys).toContain("model")
    expect(keys).toContain("context")
    expect(keys).toContain("maxDiffTokens")
    expect(keys).toContain("microOptimizations")
    expect(keys).toContain("rules")
    expect(keys).toContain("guardrails.maxSteps")
    for (const key of data.keys) {
      expect(key.description.length).toBeGreaterThan(0)
    }
    expect(data.gateways.go).toContain("zen/go")
    expect(data.languages).toContain("Go")
  })
})

describe("configReference", () => {
  test("renders a readable reference with the rules format and an example", () => {
    const md = configReference()
    expect(md).toContain(".rebot.toml")
    expect(md).toContain("model")
    expect(md).toContain("rules")
    expect(md).toContain("[[rules]]")
    expect(md).toContain("go/")
  })
})
