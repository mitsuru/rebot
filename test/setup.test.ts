import { describe, expect, test } from "bun:test"
import {
  type ServerHandle,
  type SetupDeps,
  buildManifest,
  installUrl,
  localUrls,
  manifestPostUrl,
  parseConversion,
  renderLandingPage,
  rewriteWorkflow,
  runSetup,
} from "../src/setup"

describe("buildManifest", () => {
  test("requests the permissions the App token needs, no events", () => {
    const manifest = buildManifest(
      { name: "revoid", url: "https://github.com/acme/repo", public: false },
      "http://127.0.0.1:5000/callback",
    )
    expect(manifest.redirect_url).toBe("http://127.0.0.1:5000/callback")
    expect(manifest.default_permissions).toEqual({
      pull_requests: "write",
      contents: "read",
      metadata: "read",
    })
    expect(manifest.default_events).toEqual([])
    expect(manifest.public).toBe(false)
  })
})

describe("manifestPostUrl", () => {
  test("personal account posts to settings/apps/new", () => {
    expect(manifestPostUrl("User", "alice")).toBe("https://github.com/settings/apps/new")
  })

  test("organization posts to the org-scoped endpoint", () => {
    expect(manifestPostUrl("Organization", "acme")).toBe(
      "https://github.com/organizations/acme/settings/apps/new",
    )
  })
})

describe("installUrl", () => {
  test("uses the slug from the conversion, not a hardcoded name", () => {
    expect(installUrl("revoid-2")).toBe("https://github.com/apps/revoid-2/installations/new")
  })
})

describe("renderLandingPage", () => {
  test("embeds an escaped manifest and auto-submits to the action", () => {
    const manifest = buildManifest(
      { name: "revoid", url: "https://github.com/acme/repo", public: false },
      "http://127.0.0.1:5000/callback",
    )
    const html = renderLandingPage(manifest, "https://github.com/settings/apps/new?state=xyz")
    expect(html).toContain('action="https://github.com/settings/apps/new?state=xyz"')
    expect(html).toContain('name="manifest"')
    // JSON quotes must be HTML-attribute-escaped.
    expect(html).toContain("&quot;pull_requests&quot;")
    expect(html).toContain('.submit()')
  })
})

describe("parseConversion", () => {
  test("extracts id, slug, pem", () => {
    const conv = parseConversion(
      JSON.stringify({ id: 42, slug: "revoid", pem: "-----KEY-----", html_url: "https://x" }),
    )
    expect(conv).toEqual({ id: 42, slug: "revoid", pem: "-----KEY-----", htmlUrl: "https://x" })
  })

  test("throws when required fields are missing", () => {
    expect(() => parseConversion(JSON.stringify({ id: 1 }))).toThrow()
  })
})

describe("localUrls", () => {
  test("loopback first, then non-internal IPv4 (string or numeric family)", () => {
    const urls = localUrls(5000, {
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      eth0: [
        { address: "192.168.1.10", family: "IPv4", internal: false },
        { address: "fe80::1", family: "IPv6", internal: false },
      ],
      wlan0: [{ address: "10.0.0.5", family: 4, internal: false }],
    })
    expect(urls).toEqual([
      "http://127.0.0.1:5000/",
      "http://192.168.1.10:5000/",
      "http://10.0.0.5:5000/",
    ])
  })
})

const WORKFLOW = `name: revoid review
jobs:
  review:
    steps:
      - run: bun install --frozen-lockfile
      - name: revoid review
        env:
          REVOID_ZEN_API_KEY: \${{ secrets.REVOID_ZEN_API_KEY }}
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: bun run src/cli.ts review --pr 1 --comment
`

describe("rewriteWorkflow", () => {
  test("inserts the token step and swaps GH_TOKEN", () => {
    const result = rewriteWorkflow(WORKFLOW)
    expect(result.status).toBe("rewritten")
    expect(result.content).toContain("actions/create-github-app-token@v3")
    expect(result.content).toContain("app-id: ${{ secrets.REVOID_APP_ID }}")
    expect(result.content).toContain("private-key: ${{ secrets.REVOID_APP_PRIVATE_KEY }}")
    expect(result.content).toContain("GH_TOKEN: ${{ steps.app-token.outputs.token }}")
    expect(result.content).not.toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}")
    // The new step is inserted before the revoid step.
    const tokenLine = result.content.indexOf("create-github-app-token")
    const stepLine = result.content.indexOf("- name: revoid review")
    expect(tokenLine).toBeLessThan(stepLine)
  })

  test("is idempotent when the token step already exists", () => {
    const once = rewriteWorkflow(WORKFLOW)
    const twice = rewriteWorkflow(once.content)
    expect(twice.status).toBe("already")
    expect(twice.content).toBe(once.content)
  })

  test("reports manual when the expected anchors are absent", () => {
    const result = rewriteWorkflow("name: something\njobs: {}\n")
    expect(result.status).toBe("manual")
  })
})

type Call = { command: string; args: string[]; input?: string }

function harness(overrides: Partial<SetupDeps> = {}) {
  const calls: Call[] = []
  const logs: string[] = []
  let written: { path: string; content: string } | undefined

  const fakeServer: ServerHandle = {
    port: 5173,
    waitForCode: async () => ({ code: "the-code" }),
    close: () => {},
  }

  const deps: SetupDeps = {
    state: "fixed-state",
    exec: async (command, args) => {
      calls.push({ command, args })
      if (args[0] === "repo" && args[1] === "view") return "acme/repo\n"
      if (args[0] === "api" && args[1] === "users/acme") return "User\n"
      if (args[0] === "api" && args.some((a) => a.includes("conversions"))) {
        return JSON.stringify({ id: 99, slug: "revoid", pem: "-----PEM-----" })
      }
      if (args[0] === "secret" && args[1] === "list") return "OTHER_SECRET\n"
      return ""
    },
    execInput: async (command, args, input) => {
      calls.push({ command, args, input })
      return ""
    },
    startServer: async () => fakeServer,
    openBrowser: async () => {},
    readFile: async () => WORKFLOW,
    writeFile: async (path, content) => {
      written = { path, content }
    },
    networkInterfaces: () => ({}),
    log: (message) => logs.push(message),
    ...overrides,
  }

  return { deps, calls, logs, getWritten: () => written }
}

describe("runSetup", () => {
  test("creates the App, sets secrets, rewrites the workflow", async () => {
    const { deps, calls, getWritten } = harness()
    const result = await runSetup({}, deps)

    expect(result).toEqual({ appId: 99, slug: "revoid", workflow: "rewritten" })

    const conversion = calls.find((c) => c.args.some((a) => a.includes("conversions")))
    expect(conversion?.args.join(" ")).toContain("/app-manifests/the-code/conversions")

    const appId = calls.find((c) => c.args[0] === "secret" && c.args[2] === "REVOID_APP_ID")
    expect(appId?.args).toContain("99")

    // The private key is piped via stdin (no --body flag), never passed as an argument.
    const pem = calls.find((c) => c.args[2] === "REVOID_APP_PRIVATE_KEY")
    expect(pem?.input).toBe("-----PEM-----")
    expect(pem?.args).not.toContain("--body")
    expect(calls.some((c) => c.args.includes("-----PEM-----"))).toBe(false)

    expect(getWritten()?.path).toBe(".github/workflows/revoid.yml")
    expect(getWritten()?.content).toContain("create-github-app-token")
  })

  test("warns when REVOID_ZEN_API_KEY is absent", async () => {
    const { deps, logs } = harness()
    await runSetup({}, deps)
    expect(logs.some((l) => l.includes("REVOID_ZEN_API_KEY is not set"))).toBe(true)
  })

  test("targets an organization with --org", async () => {
    const { deps, calls } = harness()
    await runSetup({ org: "acme-inc" }, deps)
    const appId = calls.find((c) => c.args[0] === "secret" && c.args[2] === "REVOID_APP_ID")
    expect(appId?.args).toContain("--org")
    expect(appId?.args).toContain("acme-inc")
    expect(appId?.args).toContain("--visibility")
  })

  test("warns before creating a duplicate when the workflow is already wired", async () => {
    const wired = rewriteWorkflow(WORKFLOW).content
    const { deps, logs } = harness({ readFile: async () => wired })
    await runSetup({}, deps)
    expect(logs.some((l) => l.includes("an App may already exist"))).toBe(true)
  })

  test("does not open a browser when noBrowser is set", async () => {
    let opened = false
    const { deps } = harness({ openBrowser: async () => {
      opened = true
    } })
    await runSetup({ noBrowser: true }, deps)
    expect(opened).toBe(false)
  })
})
