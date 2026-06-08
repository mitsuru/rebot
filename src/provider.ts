import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

export const ZEN_BASE_URL = "https://opencode.ai/zen/v1"
export const GO_BASE_URL = "https://opencode.ai/zen/go/v1"
export const ZEN_API_KEY_ENV = "REVOID_ZEN_API_KEY"

const PREFIX_BASE_URLS: Record<string, string> = {
  zen: ZEN_BASE_URL,
  opencode: ZEN_BASE_URL,
  go: GO_BASE_URL,
  "opencode-go": GO_BASE_URL,
}

export interface ModelSpec {
  baseURL: string
  modelId: string
}

export function parseModelSpec(spec: string): ModelSpec {
  const slash = spec.indexOf("/")
  if (slash > 0) {
    const prefix = spec.slice(0, slash)
    const baseURL = PREFIX_BASE_URLS[prefix]
    if (baseURL) return { baseURL, modelId: spec.slice(slash + 1) }
  }
  return { baseURL: ZEN_BASE_URL, modelId: spec }
}

const DEFAULT_AUTH_PATH = join(homedir(), ".local", "share", "opencode", "auth.json")

interface ResolveKeyDeps {
  env?: Record<string, string | undefined>
  readAuthFile?: () => Promise<string>
}

export async function resolveZenApiKey(deps: ResolveKeyDeps = {}): Promise<string> {
  const env = deps.env ?? process.env
  const readAuthFile = deps.readAuthFile ?? (() => readFile(DEFAULT_AUTH_PATH, "utf8"))

  const fromEnv = env[ZEN_API_KEY_ENV]?.trim()
  if (fromEnv) return fromEnv

  const fromAuth = await readOpencodeGoKey(readAuthFile)
  if (fromAuth) return fromAuth

  throw new Error(
    `No opencode zen API key found. Set ${ZEN_API_KEY_ENV} or run 'opencode auth login' to store an 'opencode-go' key.`,
  )
}

async function readOpencodeGoKey(readAuthFile: () => Promise<string>): Promise<string | undefined> {
  let raw: string
  try {
    raw = await readAuthFile()
  } catch {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw) as { "opencode-go"?: { key?: string } }
    return parsed["opencode-go"]?.key?.trim() || undefined
  } catch {
    return undefined
  }
}

export function createProvider(options: {
  apiKey: string
  baseURL: string
  structuredOutputs?: boolean | undefined
}) {
  return createOpenAICompatible({
    name: "zen",
    baseURL: options.baseURL,
    apiKey: options.apiKey,
    supportsStructuredOutputs: options.structuredOutputs ?? false,
  })
}

export interface GetModelOptions {
  structuredOutputs?: boolean
}

export async function getModel(spec: string, deps: ResolveKeyDeps = {}, options: GetModelOptions = {}) {
  const { baseURL, modelId } = parseModelSpec(spec)
  const apiKey = await resolveZenApiKey(deps)
  return createProvider({ apiKey, baseURL, structuredOutputs: options.structuredOutputs })(modelId)
}
