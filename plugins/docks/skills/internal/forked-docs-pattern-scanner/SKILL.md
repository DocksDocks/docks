---
name: forked-docs-pattern-scanner
description: "Use when /docs Phase 2b fans out parallel skills agents — wraps the docs-pattern-scanner agent with `context: fork` so siblings reuse the orchestrator's cached prompt prefix instead of re-paying full input-token cost per sibling (issue #16803, v2.1.101 fix). Not for direct user invocation."
context: fork
agent: docs-pattern-scanner
user-invocable: false
metadata:
  pattern: orchestration-wrapper
  source_files:
    - "plugins/docks/agents/docs-pattern-scanner.md"
    - "plugins/docks/commands/docs.md"
  updated: "2026-05-06"
  content_hash: "d1c22df0c97620b18d1db8f3c90e16c4b3469d4aafc7743bbc3eaa80d1d1e769"
---

# Forked Docs Pattern Scanner

`/docs` Phase 2b — parallel skills-analysis fan-out via `context: fork`.

<constraint>
Plan-file IPC: write output to `$0` under heading `## Phase 2b: Pattern Scanner Findings` (verbatim). The orchestrator runs `Grep('^## Phase 2b:', $0)` to gate the next phase — wrong heading or missing write fails the pipeline.
</constraint>

<constraint>
Thin envelope only. The 5-domain category set (architecture / conventions / API / testing / gotchas), file:line evidence rules, and the anti-hallucination contract are owned by `plugins/docks/agents/docs-pattern-scanner.md` — do not re-derive them here.
</constraint>

<constraint>
Skill proposals are Phase 2a's job (docs-categorizer). This phase produces raw patterns with file:line refs only — no skill-set deltas. Mixing scopes corrupts Phase 3 input.
</constraint>

## Task

Run /docs Phase 2b. Plan file: `$0`. Scope: `$1` (may be empty — flows from Phase 1; when non-empty, restrict scanning to that directory or sub-tree).

Extract concrete patterns, conventions, and decisions from the codebase, grouped across the 5 skill domains: architecture, conventions, API, testing, and gotchas. Every pattern requires `file:line` evidence per the system prompt.

Write findings to the plan file under:

```text
## Phase 2b: Pattern Scanner Findings
```

## Output discipline

| | Behavior | Why |
|---|---|---|
| BAD | Bundle patterns as prose paragraphs without `file:line` refs | Phase 3 Skills Builder cannot turn unsourced patterns into SKILL.md `source_files` arrays |
| GOOD | Write per-domain findings to `$0` under `## Phase 2b: Pattern Scanner Findings` (verbatim) with `file:line` refs | Phase 3 Skills Builder grounds every skill body in real codebase evidence |

## Wrapper args

| Arg | Value | Required |
|---|---|---|
| `$0` | plan-file path | yes |
| `$1` | scope (path or empty for full project) | no |
