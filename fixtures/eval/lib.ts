// NOTE: this is an evaluation fixture. `multiply` is intentionally buggy:
// it adds instead of multiplying. A reviewer can only catch the bug in the
// PR below by reading this file, which is outside the diff.
export function multiply(a: number, b: number): number {
  return a + b
}
