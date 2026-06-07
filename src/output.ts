export function formatMarkdown(markdown: string): string {
  const trimmed = markdown.trim()
  if (trimmed.length === 0) return "No output was returned by the model.\n"
  return `${trimmed}\n`
}
