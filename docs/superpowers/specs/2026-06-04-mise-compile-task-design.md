# mise Compile Task Design

## Summary

Rename the existing `.mise.toml` to `mise.toml` and add a `compile` task that builds the `rebot` single binary through the existing Bun build script.

## Goals

- Use `mise.toml` as the project mise config file.
- Keep the existing Bun tool pin at `1.3.9`.
- Add `mise run compile` as the canonical compile command.
- Reuse the existing `package.json` `build` script to avoid duplicate build command definitions.

## Non-Goals

- Add additional mise tasks such as `test`, `typecheck`, `dev`, or `install`.
- Change the binary output path.
- Change package scripts or build behavior.

## User Interface

```bash
mise run compile
```

This runs:

```bash
bun run build
```

The resulting binary remains `./rebot`.

## File Changes

Rename `.mise.toml` to `mise.toml` and use this content:

```toml
[tools]
bun = "1.3.9"

[tasks.compile]
description = "Compile rebot into a single binary"
run = "bun run build"
```

## Verification

- `mise run compile` succeeds.
- `test -x ./rebot` succeeds after compile.
- `./rebot --version` outputs `0.1.0`.
- `git status --short` shows no unintended files other than the intentional mise config rename before commit. The generated `./rebot` binary is ignored and should not be committed.
