import { expect, test } from "bun:test"

// Guards the example GitHub Action against accidental breakage. It is not
// executed here; CI in a consuming repo runs it.
test("revoid workflow wires the review-on-PR job", async () => {
  const yml = await Bun.file(".github/workflows/revoid.yml").text()

  expect(yml).toContain("pull_request")
  expect(yml).toContain("pull-requests: write")
  expect(yml).toContain("REVOID_ZEN_API_KEY")
  expect(yml).toContain("GH_TOKEN")
  expect(yml).toContain("--comment")
  expect(yml).toContain("github.event.pull_request.number")
})
