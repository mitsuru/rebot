# mise Compile Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `mise run compile` as the project command for compiling the `rebot` single binary.

**Architecture:** Rename `.mise.toml` to `mise.toml` and add a single mise task that delegates to the existing `bun run build` script. No package scripts or build output paths change.

**Tech Stack:** mise, Bun, TOML.

---

## File Structure

- Rename: `.mise.toml` -> `mise.toml` - project mise config and compile task.

## Task 1: Add mise Compile Task

**Files:**
- Rename: `.mise.toml` -> `mise.toml`

- [ ] **Step 1: Write the desired mise config**

Rename `.mise.toml` to `mise.toml` and make the file exactly:

```toml
[tools]
bun = "1.3.9"

[tasks.compile]
description = "Compile rebot into a single binary"
run = "bun run build"
```

- [ ] **Step 2: Trust and verify mise sees the task**

Run:

```bash
mise trust mise.toml
```

Expected: mise trusts the project config, or reports it is already trusted.

Run:

```bash
mise tasks
```

Expected: output includes `compile` and `Compile rebot into a single binary`.

- [ ] **Step 3: Run compile task**

Run:

```bash
mise run compile
```

Expected: succeeds and runs `bun run build`.

Run:

```bash
test -x ./rebot
```

Expected: succeeds.

Run:

```bash
./rebot --version
```

Expected: outputs `0.1.0`.

- [ ] **Step 4: Remove generated binary and run regression checks**

Run:

```bash
rm -f ./rebot
```

Expected: generated binary is removed and not committed.

Run:

```bash
mise exec -- bun test
```

Expected: PASS.

Run:

```bash
mise exec -- bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Before committing, run:

```bash
git status --short
git diff -- .mise.toml mise.toml
git log --oneline -10
```

Expected: status shows `.mise.toml` deleted and `mise.toml` added; diff shows the Bun tool pin plus compile task.

Commit:

```bash
git add .mise.toml mise.toml
git commit -m "chore: add mise compile task"
```

## Self-Review Notes

- Spec coverage: this plan covers the config rename, Bun version preservation, `compile` task, compile verification, version smoke check, binary cleanup, and no package script changes.
- Placeholder scan: no placeholders or deferred requirements remain.
- Type consistency: no TypeScript types are introduced.
