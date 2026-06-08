import { describe, expect, test } from "bun:test"
import { commentableLines } from "../src/diff"

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 export function a() {
-  return 1
+  return 2
+  // note
 }
diff --git a/src/b.ts b/src/b.ts
new file mode 100644
--- /dev/null
+++ b/src/b.ts
@@ -0,0 +1,2 @@
+export const b = 1
+export const c = 2
`

describe("commentableLines", () => {
  test("collects added and context lines on the new side per file", () => {
    const map = commentableLines(DIFF)

    // a.ts new side: line1 context, line2 '+return 2', line3 '+// note', line4 context '}'
    expect([...(map.get("src/a.ts") ?? [])].sort((x, y) => x - y)).toEqual([1, 2, 3, 4])
    // b.ts new file: lines 1,2 added
    expect([...(map.get("src/b.ts") ?? [])].sort((x, y) => x - y)).toEqual([1, 2])
  })

  test("ignores removed lines for the new side numbering", () => {
    const map = commentableLines(DIFF)
    // the removed "return 1" must not shift new-side numbering: line 2 is "return 2"
    expect(map.get("src/a.ts")?.has(2)).toBe(true)
  })

  test("returns an empty map for an empty diff", () => {
    expect(commentableLines("").size).toBe(0)
  })
})
