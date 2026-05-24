---
name: forked-docs-pattern-extractor
description: "Use when /docs Phase 4b fans out parallel agents-analysis — wraps the docs-pattern-extractor agent with `context: fork` so siblings reuse the orchestrator's cached prompt prefix instead of re-paying full input-token cost per sibling (issue #16803, v2.1.101 fix). Not for direct user invocation."
context: fork
agent: docs-pattern-extractor
user-invocable: false
metadata:
  pattern: orchestration-wrapper
  source_files:
    - "plugins/docks/agents/docs-pattern-extractor.md"
    - "plugins/docks/commands/docs.md"
  updated: "2026-05-06"
  content_hash: "f6bb410b3168c925fe3b9f7900857efe8cc64b6a85a6f57841b755b0f24b4f9f"
---

# Forked Docs Pattern Extractor

`/docs` Phase 4b — parallel agents-analysis fan-out via `context: fork`.

<constraint>
Plan-file IPC: write output to `$0` under heading `## Phase 4b: Pattern Extractor Content` (verbatim). The orchestrator runs `Grep('^## Phase 4b:', $0)` to gate the next phase — wrong heading or missing write fails the pipeline.
</constraint>

<constraint>
Thin envelope only. Per-role constraint extraction, workflow distillation, gotcha selection, skill-reference resolution against Phase 3 paths, and the anti-hallucination contract are owned by `plugins/docks/agents/docs-pattern-extractor.md` — do not re-derive them here.
</constraint>

<constraint>
Do NOT inline skill content into agent system prompts — emit `skills:` references to Phase 3 paths instead. Inlined skill bodies bloat agents past the 200-line cap and break the on-demand skill load model.
</constraint>

## Task

Run /docs Phase 4b. Plan file: `$0`. Scope: `$1` (may be empty — flows from Phase 2b/3).

For each agent role from Phase 4a, extract the constraints, workflows, gotchas, skill references (Phase 3 paths only), and integration points its system prompt needs. Source from Phase 3 Skills Plan and Phase 2b Pattern Scanner Findings.

Write extracted content to the plan file under:

```text
## Phase 4b: Pattern Extractor Content
```

## Output discipline

| | Behavior | Why |
|---|---|---|
| BAD | Copy-paste skill bodies into the agent system prompt template | Skills load on-demand; inlined content double-pays the token cost on every agent invocation |
| GOOD | Write per-role content to `$0` under `## Phase 4b: Pattern Extractor Content` (verbatim) with `skills:` refs to Phase 3 paths | Phase 5 Agents Builder assembles complete agent files with valid skill references |

## Wrapper args

| Arg | Value | Required |
|---|---|---|
| `$0` | plan-file path | yes |
| `$1` | scope (path or empty for full project) | no |
