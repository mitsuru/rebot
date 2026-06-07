# rebot

`rebot` is a PR-Agent-like CLI powered by the Vercel AI SDK, calling models
through the [opencode zen](https://opencode.ai/zen) gateway.

## Requirements

- Bun
- An opencode zen API key. Either set `REBOT_ZEN_API_KEY`, or sign in with
  `opencode auth login` so an `opencode-go` key is stored in
  `~/.local/share/opencode/auth.json`.
- Git for local diff input
- GitHub CLI (`gh`) for `--pr` input

## Install Dependencies

```bash
bun install
```

## Run in Development

```bash
bun run src/cli.ts review --diff-file fixtures/sample.patch
bun run src/cli.ts describe --pr 123
bun run src/cli.ts improve --base main
```

## Help

```bash
rebot --help
rebot review --help
rebot --version
```

## Build Single Binary

```bash
bun run build
```

The build creates `./rebot`.

## Commands

- `rebot describe`: summarize a PR or diff
- `rebot review`: produce review findings
- `rebot improve`: suggest improvements
- `rebot all`: produce description, review findings, and improvements

## Input Sources

Input selection order:

1. `--diff-file <path>`
2. `--pr <number>`
3. `--base <ref>`
4. default `git diff`

## Model Selection

Every command accepts `--model <id>` (zen model ids are bare, e.g.
`claude-sonnet-4-6`, `gpt-5.4`). Resolution order:

1. `--model <id>`
2. `REBOT_MODEL` environment variable
3. default `claude-sonnet-4-6`

```bash
rebot review --diff-file fixtures/sample.patch --model gpt-5.4
```

The first version prints Markdown to stdout and does not post comments to GitHub.
