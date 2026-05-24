---
name: forked-docs-role-mapper
description: "Use when /docs Phase 4a fans out parallel agents-analysis — wraps the docs-role-mapper agent with `context: fork` so siblings reuse the orchestrator's cached prompt prefix instead of re-paying full input-token cost per sibling (issue #16803, v2.1.101 fix). Not for direct user invocation."
context: fork
agent: docs-role-mapper
user-invocable: false
metadata:
  pattern: orchestration-wrapper
  source_files:
    - "plugins/docks/agents/docs-role-mapper.md"
    - "plugins/docks/commands/docs.md"
  updated: "2026-05-06"
  content_hash: "bf3d40bc4bbb4527ab1768f4d3ee978bdd9fe11e26c46dd646af45154bd36589"
---

# Forked Docs Role Mapper

`/docs` Phase 4a — parallel agents-analysis fan-out via `context: fork`.

<constraint>
Plan-file IPC: write output to `$0` under heading `## Phase 4a: Role Mapper Proposals` (verbatim). The orchestrator runs `Grep('^## Phase 4a:', $0)` to gate the next phase — wrong heading or missing write fails the pipeline.
</constraint>

<constraint>
Thin envelope only. Single-responsibility role boundaries, trigger-description CSO rules, tool-set selection rules, the broken-skill-reference audit on existing agents, and the anti-hallucination contract are owned by `plugins/docks/agents/docs-role-mapper.md` — do not re-derive them here.
</constraint>

<constraint>
Use Phase 3 Skills Plan paths (not pre-existing on-disk paths). Skills that Phase 3 split or merged have new paths — referencing the old path causes Phase 5 (Agents Builder) to emit broken `skills:` references.
</constraint>

## Task

Run /docs Phase 4a. Plan file: `$0`. Scope: `$1` (may be empty — flows from Phase 3).

Map the Phase 3 proposed skill set to agent roles with single-responsibility boundaries, trigger descriptions, and minimal tool sets. Audit existing agents (from Phase 1 Exploration) for broken skill references — flag any whose `skills:` field points at a path Phase 3 removed or renamed.

Write proposals to the plan file under:

```text
## Phase 4a: Role Mapper Proposals
```

## Output discipline

| | Behavior | Why |
|---|---|---|
| BAD | Reference pre-Phase-3 skill paths in agent `skills:` fields | Phase 6 verifier hard-fails on cross-layer integrity check; pipeline aborts |
| GOOD | Write role proposals to `$0` under `## Phase 4a: Role Mapper Proposals` (verbatim), referencing Phase 3 paths only | Phase 5 Agents Builder emits resolvable `skills:` arrays |

## Wrapper args

| Arg | Value | Required |
|---|---|---|
| `$0` | plan-file path | yes |
| `$1` | scope (path or empty for full project) | no |
