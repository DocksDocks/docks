---
name: verify
description: "Use when checking a change to docks-kit end to end: run the CLI the way a user does (sync dry run, toolchain doctor, unknown target), the dry-run goldens, and the real omp on the kit trigger rules, and inspect exit codes and output lines. Not for unit tests (run `bun run test:unit`), lint, or a release."
metadata:
  updated: "2026-11-19"
---

# Verify docks-kit

docks-kit is a CLI that a user runs from the checkout (`./docks-kit`) or from the global install. Flows V1 to V4 run it from the repository root and read its exit code and output. V5 runs the real omp on the kit trigger rules. No flow writes to the home folder: `sync --dry-run` plans the deploy only, the golden suite runs each case in its own temporary home, and `omp ttsr test --rule` tests one rule file without loading other rules.

Hosts: the commands below are POSIX shell for Linux and macOS. On Windows, run `.\docks-kit.ps1` in place of `./docks-kit` for V1 and V4 and read the exit code from `$LASTEXITCODE`; for V2, read the omp row of `.\docks-kit.ps1 toolchain check`. V3 does not run on Windows: `cli/test/golden-dryrun.ts` exits 2 on a host whose executables need a suffix, because the snapshots are Linux-canonical. On Windows, run `bun run typecheck`, `bun run test:unit`, and `bun run smoke:native` instead.

## Prerequisites

| Need | Check command | Expected result |
|---|---|---|
| Bun at the CI pin | `bun --version` | `1.4.4` |
| omp at the toolchain floor | `omp --version` | `omp/19.0.0` |
| Dependencies installed | `test -d node_modules && echo present` (PowerShell: `if (Test-Path node_modules) { 'present' }`) | `present` |

## Drive and inspect

| Id | Flow | Command or tool action | Expected result |
|---|---|---|---|
| V1 | omp sync plan | `./docks-kit sync omp --dry-run; echo "exit $?"` | Lines that start with `[dry-run]`, then `--- Sync complete ---`, then `exit 0` |
| V2 | Toolchain doctor | `./docks-kit toolchain check 2>&1 \| grep -E '^omp '` | One omp row whose INSTALLED, FLOOR, and VERIFIED columns are equal and whose STATUS is `ok` |
| V3 | Dry-run goldens through the engine and the public CLI | `bun run golden:dryrun` | A line `golden-dryrun: OK (<n> case(s))` and exit 0 |
| V4 | Unknown sync target | `./docks-kit sync bogus --dry-run; echo "exit $?"` | `Unknown sync target(s): bogus` and `exit 2` |
| V5 | Trigger rules on a large tool call, in the real omp | `bun .agents/skills/verify/scripts/ttsr-snippet.ts big-reset \| omp ttsr test --rule SoT/.omp/plugin/rules/git-safety.md --source tool --tool eval --file -`, then the same command with `big-quiet` | For `big-reset`, `Triggered (1)` and a `git-safety` line within a few seconds. For `big-quiet`, `No rules triggered. (evaluated 1)`. The `big-reset` snippet is a 21 KB eval cell with many `\"` escapes that ends with `sh("git reset --hard HEAD")`. The rules of 0.22.29 stayed quiet on it after 4.7 s: JavaScriptCore stopped at its match limit and reported no match, so the rule failed open |

## Failure signs

| Sign | Meaning | Next step |
|---|---|---|
| `ignoring stale cli/dist/docks-kit-...; running from source` | The launcher found an old binary and runs the source instead | No action for a flow; run `bun run build:binaries` only when you test the binary |
| `=== GOLDEN MISMATCH` in V3 | The CLI output changed | Read the diff; when the change is intended, run `bun cli/test/golden-dryrun.ts --update-goldens`, then `bun run format` |
| omp row status `below-floor` or `above-verified` in V2 | The installed omp differs from `SoT/toolchain.json` | Check the omp release against the kit before you move the pin |
| V5 prints `No rules triggered.` for `big-reset`, or takes seconds | A condition scans the buffer in more than linear time, or hits the JavaScriptCore match limit | Run `bunx vitest run cli/test/unit/ompTriggerRules.test.ts` and fix the condition that its shape guard or Bun backstop names (`cli/docs/command-guards.md`, omp trigger rules) |
