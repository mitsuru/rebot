# revoid Design

## Summary

`revoid` is a standalone CLI automation tool that provides a PR-Agent-like workflow using opencode. It is implemented in TypeScript, uses the official `@opencode-ai/sdk`, and is distributed as a single executable with `bun build --compile`.

The first version focuses on local Markdown output for three workflows:

- `describe`: summarize a PR or diff
- `review`: identify risks, bugs, regressions, and missing tests
- `improve`: suggest concrete improvements

It supports both GitHub PR input through `gh` and local git diff input.

## Goals

- Provide PR-Agent-like commands powered by opencode.
- Use the official opencode SDK instead of reimplementing the HTTP API.
- Package the tool as a single executable through Bun.
- Support `gh`-based PR input and local git diff input.
- Emit Markdown to stdout as the initial output format.
- Keep the first version small and easy to extend.

## Non-Goals

- Posting comments to GitHub.
- Creating inline review comments on PR files.
- Managing opencode authentication or provider configuration.
- Implementing a persistent config file.
- Supporting GitLab or other forges in the first version.

## CLI Interface

The binary is named `revoid` as a provisional name.

Commands:

```bash
revoid describe
revoid review
revoid improve
revoid all
```

Input options:

```bash
revoid review --pr 123
revoid review --base main
revoid review --diff-file diff.patch
```

Input selection order:

1. `--diff-file` reads a patch from disk.
2. `--pr` reads PR metadata and diff through `gh`.
3. `--base` reads `git diff <base>...HEAD`.
4. With no explicit source, the tool reads `git diff`.

`all` runs `describe`, `review`, and `improve` in one opencode session and prints one combined Markdown report.

## Architecture

The codebase is organized around narrow modules:

```text
src/
  cli.ts          # Command parsing and top-level orchestration
  inputs.ts       # Diff and PR input collection
  opencode.ts     # SDK session creation and prompt execution
  prompts.ts      # describe/review/improve prompt construction
  output.ts       # Markdown formatting
```

`cli.ts` parses flags, resolves the command, asks `inputs.ts` for normalized input, calls `opencode.ts` with the appropriate prompt from `prompts.ts`, then prints formatted Markdown through `output.ts`.

## Data Flow

The normalized input shape contains:

- command: `describe`, `review`, `improve`, or `all`
- source: `diff-file`, `github-pr`, `git-base`, or `git-worktree`
- diff text
- optional PR number
- optional PR title
- optional PR body
- optional changed file list

For `--pr`, `inputs.ts` runs:

```bash
gh pr diff <number>
gh pr view <number> --json number,title,body,files,baseRefName,headRefName,url
```

For local git input, `inputs.ts` runs either:

```bash
git diff <base>...HEAD
```

or:

```bash
git diff
```

The diff and metadata are embedded into a task-specific prompt. `opencode.ts` uses `createOpencode()` from `@opencode-ai/sdk`, creates a session, sends the prompt with `client.session.prompt`, returns the assistant response, and closes the opencode server instance when done.

## Prompt Behavior

`describe` outputs:

- PR summary
- changed areas
- notable implementation details
- suggested test focus

`review` outputs findings first, ordered by severity. Each finding should include a file or diff reference when possible, explain the risk, and suggest a concrete fix. If no findings are found, it should say so explicitly and mention residual risks or testing gaps.

`improve` outputs practical improvements that are not necessarily correctness bugs. It should avoid broad refactors unrelated to the diff.

`all` outputs the three sections in this order:

1. Description
2. Review Findings
3. Improvement Suggestions

## Error Handling

The CLI fails fast with actionable messages:

- Missing `gh` for `--pr`: tell the user to install GitHub CLI.
- `gh` not authenticated or PR not found: show the failing command context.
- Not inside a git repository for local diff input: say local git input requires a repository.
- Empty diff: stop without calling opencode.
- opencode SDK startup or prompt failure: tell the user to check opencode provider authentication and config.

The tool does not silently fall back from one input source to another when the user explicitly requested a source.

## Packaging

The project uses Bun and TypeScript.

Development command:

```bash
bun run src/cli.ts review --diff-file fixtures/sample.patch
```

Build command:

```bash
bun build src/cli.ts --compile --outfile revoid
```

The compiled executable is the intended distribution artifact.

## Testing

The first version includes:

- Unit tests for prompt construction.
- Unit tests for Markdown output formatting.
- Input collection tests using mocked command execution for `gh` and `git`.
- A fixture-based smoke test for `--diff-file fixtures/sample.patch review` that does not require GitHub.

Live opencode integration tests are optional because they depend on provider authentication and network/model availability.

## Extension Points

Future versions can add:

- `--post-comment` to publish Markdown output through `gh pr comment`.
- Inline GitHub review comments.
- A config file for model, output format, and prompt tuning.
- GitLab support.
- Structured JSON output using opencode structured output.
