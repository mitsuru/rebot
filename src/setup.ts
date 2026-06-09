import { createServer } from "node:http"
import { readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises"
import { networkInterfaces as osNetworkInterfaces } from "node:os"
import { type ExecCommand, type ExecCommandInput, execCommand, execCommandInput } from "./exec"

export const WORKFLOW_PATH = ".github/workflows/revoid.yml"

// --- Manifest -------------------------------------------------------------

export interface ManifestBase {
  /** App name (globally unique on GitHub; the user may rename in the browser). */
  name: string
  /** Homepage URL — the repository the App is set up for. */
  url: string
  /** Whether the App is installable by others. */
  public: boolean
}

export interface GitHubAppManifest extends ManifestBase {
  redirect_url: string
  default_permissions: Record<string, string>
  default_events: string[]
}

/**
 * Build the App manifest. `redirectUrl` is injected per request from the
 * browser's Host header so the callback returns to whichever host the user
 * actually opened (127.0.0.1 locally, or a LAN IP when driving from another
 * device). The token scope comes from `default_permissions`, NOT the workflow
 * `permissions:` block.
 */
export function buildManifest(base: ManifestBase, redirectUrl: string): GitHubAppManifest {
  return {
    name: base.name,
    url: base.url,
    public: base.public,
    redirect_url: redirectUrl,
    default_permissions: {
      pull_requests: "write",
      contents: "read",
      metadata: "read",
    },
    default_events: [],
  }
}

/** POST target for the manifest form: personal account vs organization. */
export function manifestPostUrl(ownerType: string, owner: string): string {
  return ownerType === "Organization"
    ? `https://github.com/organizations/${owner}/settings/apps/new`
    : "https://github.com/settings/apps/new"
}

export function installUrl(slug: string): string {
  return `https://github.com/apps/${slug}/installations/new`
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** Auto-submitting form that POSTs the manifest from the user's browser session. */
export function renderLandingPage(manifest: GitHubAppManifest, action: string): string {
  const json = escapeHtmlAttr(JSON.stringify(manifest))
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>revoid setup</title></head>
<body>
<p>Redirecting to GitHub to create the <b>${escapeHtmlAttr(manifest.name)}</b> App…</p>
<form id="f" method="post" action="${escapeHtmlAttr(action)}">
  <input type="hidden" name="manifest" value="${json}">
  <noscript><button type="submit">Create the GitHub App</button></noscript>
</form>
<script>document.getElementById("f").submit()</script>
</body></html>`
}

export function renderSuccessPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>revoid setup</title></head>
<body><p>✓ App created. You can close this tab and return to the terminal.</p></body></html>`
}

// --- Conversion response --------------------------------------------------

export interface AppConversion {
  id: number
  slug: string
  pem: string
  htmlUrl?: string
}

/** Parse the `POST /app-manifests/{code}/conversions` response. */
export function parseConversion(json: string): AppConversion {
  const parsed = JSON.parse(json) as {
    id?: number
    slug?: string
    pem?: string
    html_url?: string
  }
  if (typeof parsed.id !== "number" || !parsed.slug || !parsed.pem) {
    throw new Error("conversion response missing id, slug, or pem")
  }
  const result: AppConversion = { id: parsed.id, slug: parsed.slug, pem: parsed.pem }
  if (parsed.html_url) result.htmlUrl = parsed.html_url
  return result
}

// --- Local URLs -----------------------------------------------------------

type NetworkInterfaceInfo = { address: string; family: string | number; internal: boolean }

/** Loopback first, then every non-internal IPv4 address, as openable URLs. */
export function localUrls(
  port: number,
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined>,
): string[] {
  const urls = [`http://127.0.0.1:${port}/`]
  for (const list of Object.values(interfaces)) {
    for (const ni of list ?? []) {
      const family = typeof ni.family === "string" ? ni.family : `IPv${ni.family}`
      if (family === "IPv4" && !ni.internal && ni.address !== "127.0.0.1") {
        urls.push(`http://${ni.address}:${port}/`)
      }
    }
  }
  return urls
}

// --- Workflow rewrite -----------------------------------------------------

export type WorkflowRewrite =
  | { status: "rewritten"; content: string }
  | { status: "already"; content: string }
  | { status: "manual"; content: string }

function tokenStep(pad: string): string {
  return [
    `${pad}- uses: actions/create-github-app-token@v3`,
    `${pad}  id: app-token`,
    `${pad}  with:`,
    `${pad}    app-id: \${{ secrets.REVOID_APP_ID }}`,
    `${pad}    private-key: \${{ secrets.REVOID_APP_PRIVATE_KEY }}`,
  ].join("\n")
}

/**
 * Insert the `create-github-app-token` step before the revoid step and swap
 * `GH_TOKEN` from the default token to the App token. Idempotent: returns
 * "already" if the step exists, "manual" if the expected anchors are missing.
 */
export function rewriteWorkflow(yaml: string): WorkflowRewrite {
  if (yaml.includes("actions/create-github-app-token")) {
    return { status: "already", content: yaml }
  }

  const lines = yaml.split("\n")
  const stepIdx = lines.findIndex((line) => /^\s*-\s*name:\s*revoid review\s*$/.test(line))
  const tokenIdx = lines.findIndex((line) =>
    /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(line),
  )
  if (stepIdx === -1 || tokenIdx === -1) {
    return { status: "manual", content: yaml }
  }

  const pad = lines[stepIdx]?.match(/^(\s*)-/)?.[1] ?? "      "
  // Replace by index first; the splice below shifts this line down but its
  // content is already correct.
  lines[tokenIdx] = (lines[tokenIdx] ?? "").replace(
    /\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/,
    "${{ steps.app-token.outputs.token }}",
  )
  lines.splice(stepIdx, 0, tokenStep(pad))
  return { status: "rewritten", content: lines.join("\n") }
}

// --- Orchestrator ---------------------------------------------------------

export interface SetupOptions {
  org?: string
  repo?: string
  name?: string
  port?: number
  public?: boolean
  noBrowser?: boolean
}

export interface ServerHandle {
  port: number
  waitForCode: () => Promise<{ code: string }>
  close: () => void
}

export interface SetupDeps {
  exec?: ExecCommand
  execInput?: ExecCommandInput
  startServer?: (opts: {
    port: number
    state: string
    manifestBase: ManifestBase
    actionUrl: string
  }) => Promise<ServerHandle>
  openBrowser?: (url: string) => Promise<void>
  readFile?: (path: string) => Promise<string>
  writeFile?: (path: string, content: string) => Promise<void>
  networkInterfaces?: () => Record<string, NetworkInterfaceInfo[] | undefined>
  log?: (message: string) => void
  /** A random CSRF state token (injectable for deterministic tests). */
  state?: string
}

function secretTarget(options: SetupOptions): string[] {
  if (options.repo) return ["--repo", options.repo]
  if (options.org) return ["--org", options.org, "--visibility", "all"]
  return []
}

export interface SetupResult {
  appId: number
  slug: string
  workflow: WorkflowRewrite["status"]
}

export async function runSetup(options: SetupOptions, deps: SetupDeps = {}): Promise<SetupResult> {
  const exec = deps.exec ?? execCommand
  const execInput = deps.execInput ?? execCommandInput
  const startServer = deps.startServer ?? defaultStartServer
  const openBrowser = deps.openBrowser ?? ((url) => defaultOpenBrowser(url, exec))
  const readFile = deps.readFile ?? ((path) => fsReadFile(path, "utf8"))
  const writeFile = deps.writeFile ?? ((path, content) => fsWriteFile(path, content))
  const netInterfaces = deps.networkInterfaces ?? (() => osNetworkInterfaces())
  const log = deps.log ?? ((message: string) => process.stdout.write(`${message}\n`))
  const state = deps.state ?? cryptoState()

  // 1. Resolve the target repository and owner type.
  const nameWithOwner =
    options.repo ??
    (await exec("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])).trim()
  const repoOwner = nameWithOwner.split("/")[0] ?? ""
  const owner = options.org ?? repoOwner
  const ownerType = options.org
    ? "Organization"
    : (await exec("gh", ["api", `users/${owner}`, "--jq", ".type"])).trim()

  const manifestBase: ManifestBase = {
    name: options.name ?? "revoid",
    url: `https://github.com/${nameWithOwner}`,
    public: options.public ?? false,
  }
  const actionUrl = manifestPostUrl(ownerType, owner)

  // The manifest flow always registers a NEW App (there is no update-via-manifest).
  // If the workflow is already wired for an App token, an App likely exists — warn
  // before creating a duplicate.
  try {
    if ((await readFile(WORKFLOW_PATH)).includes("actions/create-github-app-token")) {
      log("Warning: the workflow already uses an App token — an App may already exist.")
      log("Continuing will register a NEW App (the manifest flow cannot update one).")
    }
  } catch {
    // No workflow yet; nothing to warn about.
  }

  // 2-6. Serve the manifest form locally and await the redirect with the code.
  const server = await startServer({ port: options.port ?? 0, state, manifestBase, actionUrl })
  const urls = localUrls(server.port, netInterfaces())
  log("Open one of these URLs in a browser to create the GitHub App:")
  for (const url of urls) log(`  ${url}`)
  if (!options.noBrowser) await openBrowser(`http://127.0.0.1:${server.port}/`)
  log("Waiting for the App to be created in the browser…")

  let code: string
  try {
    ;({ code } = await server.waitForCode())
  } finally {
    server.close()
  }

  // 7. Exchange the code for the App credentials (valid for 1 hour).
  const conversion = parseConversion(
    await exec("gh", ["api", "-X", "POST", `/app-manifests/${code}/conversions`]),
  )
  log(`Created App "${conversion.slug}" (id ${conversion.id}).`)

  // 8. Store the credentials as Actions secrets (private key piped, never on disk).
  const target = secretTarget(options)
  await exec("gh", ["secret", "set", "REVOID_APP_ID", ...target, "--body", String(conversion.id)])
  // No --body flag: gh secret set reads the value from stdin, so the private key
  // is piped and never appears in argv or on disk.
  await execInput("gh", ["secret", "set", "REVOID_APP_PRIVATE_KEY", ...target], conversion.pem)
  log("Set secrets REVOID_APP_ID and REVOID_APP_PRIVATE_KEY.")

  if (!(await zenKeyPresent(exec, target))) {
    log("Warning: REVOID_ZEN_API_KEY is not set. revoid needs it to run:")
    log(`  gh secret set REVOID_ZEN_API_KEY ${target.join(" ")}`.trimEnd())
  }

  // 9. Rewrite the workflow to authenticate as the App.
  let workflowStatus: WorkflowRewrite["status"] = "manual"
  try {
    const rewrite = rewriteWorkflow(await readFile(WORKFLOW_PATH))
    workflowStatus = rewrite.status
    if (rewrite.status === "rewritten") {
      await writeFile(WORKFLOW_PATH, rewrite.content)
      log(`Updated ${WORKFLOW_PATH} to mint an App token.`)
    } else if (rewrite.status === "already") {
      log(`${WORKFLOW_PATH} already uses an App token; left unchanged.`)
    } else {
      log(`Could not safely update ${WORKFLOW_PATH}; add the create-github-app-token step manually.`)
    }
  } catch {
    log(`${WORKFLOW_PATH} not found; add the create-github-app-token step manually.`)
  }

  // 10. Install the App (human step) — opened last so the next run can mint a token.
  const install = installUrl(conversion.slug)
  log(`Install the App on the repository: ${install}`)
  if (!options.noBrowser) await openBrowser(install)

  return { appId: conversion.id, slug: conversion.slug, workflow: workflowStatus }
}

async function zenKeyPresent(exec: ExecCommand, target: string[]): Promise<boolean> {
  try {
    const list = await exec("gh", ["secret", "list", ...target])
    return /\bREVOID_ZEN_API_KEY\b/.test(list)
  } catch {
    return false
  }
}

function cryptoState(): string {
  // Avoid Math.random; use a UUID from the platform crypto.
  return globalThis.crypto.randomUUID()
}

async function defaultStartServer(opts: {
  port: number
  state: string
  manifestBase: ManifestBase
  actionUrl: string
}): Promise<ServerHandle> {
  let resolveCode: (value: { code: string }) => void
  let rejectCode: (reason: Error) => void
  const done = new Promise<{ code: string }>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  // The manifest code is valid for an hour; give up well before that rather than
  // hang forever if the browser step is abandoned.
  const timeout = setTimeout(
    () => rejectCode(new Error("timed out waiting for the GitHub App to be created")),
    15 * 60 * 1000,
  )
  timeout.unref?.()

  const server = createServer((req, res) => {
    const host = req.headers.host ?? "127.0.0.1"
    const url = new URL(req.url ?? "/", `http://${host}`)

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code")
      const returnedState = url.searchParams.get("state")
      if (!code || returnedState !== opts.state) {
        res.writeHead(400, { "content-type": "text/plain" })
        res.end("invalid request")
        return
      }
      res.writeHead(200, { "content-type": "text/html" })
      res.end(renderSuccessPage())
      clearTimeout(timeout)
      resolveCode({ code })
      return
    }

    const manifest = buildManifest(opts.manifestBase, `http://${host}/callback`)
    const action = `${opts.actionUrl}?state=${encodeURIComponent(opts.state)}`
    res.writeHead(200, { "content-type": "text/html" })
    res.end(renderLandingPage(manifest, action))
  })

  await new Promise<void>((resolve) => server.listen(opts.port, "0.0.0.0", resolve))
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : opts.port

  return {
    port,
    waitForCode: () => done,
    close: () => server.close(),
  }
}

async function defaultOpenBrowser(url: string, exec: ExecCommand): Promise<void> {
  const platform = process.platform
  const [command, args] =
    platform === "darwin"
      ? ["open", [url]]
      : platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]]
  try {
    await exec(command, args as string[])
  } catch {
    // Opening a browser is best-effort; the URLs are printed regardless.
  }
}
