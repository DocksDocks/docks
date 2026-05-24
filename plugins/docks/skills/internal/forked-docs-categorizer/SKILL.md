---
name: forked-docs-categorizer
description: "Use when /docs Phase 2a fans out parallel skills agents — wraps the docs-categorizer agent with `context: fork` so siblings reuse the orchestrator's cached prompt prefix instead of re-paying full input-token cost per sibling (issue #16803, v2.1.101 fix). Not for direct user invocation."
context: fork
agent: docs-categorizer
user-invocable: false
metadata:
  pattern: orchestration-wrapper
  source_files:
    - "plugins/docks/agents/docs-categorizer.md"
    - "plugins/docks/commands/docs.md"
  updated: "2026-05-06"
---

# Forked Docs Categorizer

`/docs` Phase 2a — parallel skills-analysis fan-out via `context: fork`.

<constraint>
Plan-file IPC: write output to `$0` under heading `## Phase 2a: Categorizer Proposals` (verbatim). The orchestrator runs `Grep('^## Phase 2a:', $0)` to gate the next phase — wrong heading or missing write fails the pipeline.
</constraint>

<constraint>
Thin envelope only. CSO description rules, the ≥5-project-specific-identifiers requirement, split/merge/refresh/rewrite-description action semantics, and the anti-hallucination contract are owned by `plugins/docks/agents/docs-categorizer.md` — do not re-derive them here.
</constraint>

<constraint>
Stay in skills scope (the full `.claude/skills/` audit). Agent roles are Phase 4's job (docs-role-mapper) — proposing them here causes scope overlap and corrupts Phase 5's input.
</constraint>

## Task

Run /docs Phase 2a. Plan file: `$0`. Scope: `$1` (may be empty — flows from Phase 1; when non-empty, prioritize new-skill proposals tied to patterns in that directory).

Audit every existing skill in `.claude/skills/` and propose the full skill-set delta — create / update / split / merge / refresh / rewrite-description — with CSO-compliant descriptions (≥5 project-specific identifiers each) per the system prompt.

Write proposals to the plan file under:

```text
## Phase 2a: Categorizer Proposals
```

## Output discipline

| | Behavior | Why |
|---|---|---|
| BAD | Propose agent-role changes alongside skill deltas | Phase 4 owns roles; mixing scopes makes the Phase 3 builder produce wrong source_files |
| GOOD | Write skill-only proposals to `$0` under `## Phase 2a: Categorizer Proposals` (verbatim) | Phase 3 (Skills Builder) reads this with Phase 2b patterns to draft SKILL.md bodies |

## Wrapper args

| Arg | Value | Required |
|---|---|---|
| `$0` | plan-file path | yes |
| `$1` | scope (path or empty for full project) | no |
