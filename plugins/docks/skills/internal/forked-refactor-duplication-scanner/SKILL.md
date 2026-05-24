---
name: forked-refactor-duplication-scanner
description: "Use when /refactor Phase 2b fans out parallel scanners — wraps the refactor-duplication-scanner agent with `context: fork` so siblings reuse the orchestrator's cached prompt prefix instead of re-paying full input-token cost per sibling (issue #16803, v2.1.101 fix). Not for direct user invocation."
context: fork
agent: refactor-duplication-scanner
user-invocable: false
metadata:
  pattern: orchestration-wrapper
  source_files:
    - "plugins/docks/agents/refactor-duplication-scanner.md"
    - "plugins/docks/commands/refactor.md"
  updated: "2026-05-06"
---

# Forked Refactor Duplication Scanner

`/refactor` Phase 2b — parallel scanner fan-out via `context: fork`.

<constraint>
Plan-file IPC: write output to `$0` under heading `## Phase 2b: Duplication Findings` (verbatim). The orchestrator runs `Grep('^## Phase 2b:', $0)` to gate the next phase — wrong heading or missing write fails the pipeline.
</constraint>

<constraint>
Thin envelope only. Duplicate-detection heuristics, function-extraction thresholds, frontend reuse rules, modernization research-gate, and the anti-hallucination contract are owned by `plugins/docks/agents/refactor-duplication-scanner.md` — do not re-derive them here.
</constraint>

<constraint>
SOLID violations are out of scope — Phase 3 (refactor-solid-analyzer) owns those. Flagging SOLID issues here causes duplicate findings and degrades the planner's input quality.
</constraint>

## Task

Run /refactor Phase 2b. Plan file: `$0`. Scope: `$1` (empty = full project).

Find duplicate code blocks, function-extraction opportunities, frontend component reuse candidates, module-organization issues, and modernization candidates per the system prompt. Apply the research-gate before flagging any deprecated-API or framework-migration candidate. Do NOT flag SOLID violations.

Write findings to the plan file under:

```text
## Phase 2b: Duplication Findings
```

## Output discipline

| | Behavior | Why |
|---|---|---|
| BAD | Mix in SOLID-violation findings to "be thorough" | Phase 3 re-derives them with Liskov coverage; mixed input doubles planner work |
| GOOD | Write findings to `$0` under `## Phase 2b: Duplication Findings` (verbatim), SOLID-free | Phase 3 reads Phase 2b alongside Phase 2a to scope its own pass cleanly |

## Wrapper args

| Arg | Value | Required |
|---|---|---|
| `$0` | plan-file path | yes |
| `$1` | scope (path or empty for full project) | no |
