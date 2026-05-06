---
name: forked-refactor-dead-code-scanner
description: "Use when /refactor Phase 2a fans out parallel scanners — wraps the refactor-dead-code-scanner agent with `context: fork` so siblings reuse the orchestrator's cached prompt prefix instead of re-paying full input-token cost per sibling (issue #16803, v2.1.101 fix). Not for direct user invocation."
context: fork
agent: refactor-dead-code-scanner
user-invocable: false
metadata:
  pattern: orchestration-wrapper
  source_files:
    - "plugins/docks/agents/refactor-dead-code-scanner.md"
    - "plugins/docks/commands/refactor.md"
  updated: "2026-05-06"
---

# Forked Refactor Dead Code Scanner

`/refactor` Phase 2a — parallel scanner fan-out via `context: fork`.

<constraint>
Plan-file IPC: write output to `$0` under heading `## Phase 2a: Dead Code Findings` (verbatim). The orchestrator runs `Grep('^## Phase 2a:', $0)` to gate the next phase — wrong heading or missing write fails the pipeline.
</constraint>

<constraint>
Thin envelope only. Detection logic, safety tiers, the dynamic-import / `require(...)` / template-literal / decorator-DI / reflection check, and the anti-hallucination contract are owned by `plugins/docks/agents/refactor-dead-code-scanner.md` — do not re-derive them here.
</constraint>

<constraint>
If `$0` is empty, abort with: `forked-refactor-dead-code-scanner: missing plan-file path.` The wrapper has no fallback path — the orchestrator owns plan-file selection.
</constraint>

## Task

Run /refactor Phase 2a. Plan file: `$0`. Scope: `$1` (empty = full project).

Find dead code (unused exports, unreachable code, unused dependencies, orphaned files). Use available tooling per Phase 1 explorer output (knip / depcheck / ts-prune / vulture / ruff / deadcode / cargo-udeps), plus manual grep verification. Classify into SAFE / CAUTION / DANGER tiers per the system prompt. Apply the dynamic-reference check before marking any export SAFE.

Write findings to the plan file under:

```text
## Phase 2a: Dead Code Findings
```

## Output discipline

| | Behavior | Why |
|---|---|---|
| BAD | Print results inline to the conversation; skip the plan file | Orchestrator gates next phase on `Grep('^## Phase 2a:', $0)` — silent failure |
| GOOD | Write findings to `$0` under `## Phase 2a: Dead Code Findings` (verbatim) | Phase 3 SOLID analyzer reads Phase 2a from the plan file to skip SAFE files |

## Wrapper args

| Arg | Value | Required |
|---|---|---|
| `$0` | plan-file path | yes |
| `$1` | scope (path or empty for full project) | no |
