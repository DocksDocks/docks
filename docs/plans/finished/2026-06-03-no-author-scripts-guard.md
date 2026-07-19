---
title: Stop shipped skills/agents from naming docks author scripts
goal: Shipped skill/agent bodies must never name docks plugin-author scripts (scripts/ci.sh, scripts/tree/…) absent downstream — enforce with a guard + fix every violation.
status: finished
created: "2026-06-03T16:10:00-03:00"
updated: "2026-06-03T16:43:58-03:00"
started_at: "2026-06-03T16:10:00-03:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: "559e7021e2f3c07abf57cce842a1beea62e674cd"
tags: [skills, agents, consumer-safety, ci]
affected_paths:
  - scripts/skills/no-author-scripts.sh
  - scripts/ci.sh
  - scripts/AGENTS.md
  - AGENTS.md
  - plugins/docks/skills/AGENTS.md
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md
  - plugins/docks/skills/productivity/context-tree/references/data-preservation.md
  - plugins/docks/skills/productivity/context-tree/references/node-template.md
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/skill-maintenance/SKILL.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/references/codex-agents-builder.md
  - plugins/docks/agents/plan-review.md
related_plans: []
review_status: passed
---

# Stop shipped skills/agents from naming docks author scripts

## Goal

A skill or agent shipped in `plugins/docks/` must be runnable in a **consumer's** project, where `scripts/` (the docks plugin-author tooling) does not exist. Several shipped skill/agent bodies told the runtime to run docks author scripts as a verification step (e.g. `context-tree` → `bash scripts/tree/guard.sh`, `plan-review` → `bash scripts/ci.sh`). Those instructions break the moment the skill runs anywhere but this repo. Success: (1) a guard fails CI if any shipped SKILL.md body, `references/*.md`, or Claude agent body names a docks author script; (2) the rule is documented where authors look; (3) every existing violation is fixed by making the check self-contained or referring generically to "the project's CI / validators, if present"; (4) `scripts/ci.sh` stays green.

## Context

Reported from the field: invoking `context-tree` in a downstream project surfaced instructions to run `scripts/tree/guard.sh` and `scripts/ci.sh`, neither of which exists there — `scripts/` is author-side only (`scripts/AGENTS.md`) and never ships in the plugin payload. This is a class bug, not a one-off: the same leak existed across `plan-review`, `plan-init`, `skill-maintenance`, and `skill-agent-pipeline` references. The fix is a mechanical guard plus a documented rule plus a per-file sweep. Two skills that legitimately *seed or describe* that tooling — `scaffold` (writes `<target>/scripts/...`) and `write-skill` (encodes the docks scorer rubric) — are allowlisted rather than rewritten.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Write `scripts/skills/no-author-scripts.sh`: scan shipped `SKILL.md` + `references/*.md` + `agents/*.md`; fail on docks author-script names; allowlist `scaffold`, `write-skill`. | — | — | done | — |
| 2 | Wire the guard into `scripts/ci.sh`'s structural-guard loop. | 1 | — | done | — |
| 3 | Document the rule in 3 nodes: `plugins/docks/skills/AGENTS.md` (new 3rd `<constraint>`), `scripts/AGENTS.md` (validator-table row), root `AGENTS.md` (agent-authoring bullet). | 1 | with #4 | done | — |
| 4 | Fix every flagged violation — make verification self-contained or refer generically to "the project's CI / validators, if present". | 1 | with #3 | done | — |
| 5 | Re-sync hashes (`content-hash.sh --backfill`), bump `metadata.updated` on touched skills, run `scripts/ci.sh` green incl. the new check. | 2, 3, 4 | — | done | — |

### Step details

- **#1** PATTERN deliberately matches `scripts/(ci|release)\.sh` and `scripts/(skills|agents|tree|scaffold|config|lib)/` — NOT bare `scripts/` — so generic examples (`scripts/install-hooks.sh` in lint-no-suppressions, a consumer's own `scripts/hitl-loop.sh`) and node files (`scripts/AGENTS.md`) don't false-positive.
- **#4** files fixed: `context-tree` (SKILL.md + conflict-resolution/data-preservation/node-template), `plan-review` (SKILL.md + agent body), `plan-init`, `skill-maintenance`, `skill-agent-pipeline/references/codex-agents-builder.md`. Untouched-by-design: `scaffold`, `write-skill` (allowlisted), `fix-workflow`/`lint-no-suppressions` (generic/consumer-owned script examples, not docks author scripts).

## Acceptance criteria

- [x] `scripts/skills/no-author-scripts.sh` exists, is executable, scans shipped SKILL.md + references/ + agent bodies, and fails on docks author-script names with a FAIL list.
- [x] Allowlist covers exactly `scaffold` + `write-skill`; the guard reports 0 violations on the fixed tree.
- [x] Guard runs inside `scripts/ci.sh` (structural-guard loop).
- [x] Rule documented in `plugins/docks/skills/AGENTS.md`, `scripts/AGENTS.md`, and root `AGENTS.md`.
- [x] Every prior violation fixed; verification is self-contained or generic ("the project's CI / validators, if present").
- [x] `content_hash` re-synced for touched skills; `bash scripts/ci.sh` green including `skills/no-author-scripts`.

## Out of scope

- Codex `.toml` agent twins — Codex doesn't consume plugin-shipped subagents; only Claude `agents/*.md` bodies are scanned.
- Rewriting `scaffold` / `write-skill` to avoid script names — they legitimately seed/describe the tooling and are allowlisted.
- The `skill-agent-pipeline/SKILL.md` change in this commit is a `content_hash` re-sync only (its reference file changed), not a content edit.

## Mistakes & Dead Ends

- **2026-06-03T16:25:00-03:00**: First draft of the audit example inside `context-tree/references/conflict-resolution.md` used `scripts/ci.sh` / `score.sh:125` as the illustrative file:line → the new guard flagged its own documentation example → changed the example refs to `src/db.ts:42` / `Makefile:18` (neutral, non-docks paths).

## Sources

- `scripts/AGENTS.md` — `scripts/` is author-side tooling, never shipped to consumers; the validator-table contract the new guard joins.
- `plugins/docks/skills/AGENTS.md` — "no cross-skill references/ pointers" + the consumer-facing body rules the new `<constraint>` extends.
- `scripts/ci.sh` — the structural-guard loop the new guard wires into.
- `scripts/skills/content-hash.sh` — hash surface = frontmatter (minus updated/content_hash) + body + references; `--backfill` after edits.

## Blockers

(none)

## Notes

- **Why a guard, not just docs:** the leak recurred across five skills/agents; a documented rule without enforcement drifts back. The guard makes the rule mechanical, matching the kit's other structural guards.
- **Why allowlist over rewrite:** `scaffold` and `write-skill` are the two skills whose *job* is the docks tooling itself (seeding it / encoding its scorer). Naming the scripts there is correct, not a leak.
- **Pattern precision is load-bearing:** matching bare `scripts/` would false-positive on consumer-owned example scripts and on `scripts/AGENTS.md` node files. The anchored category list is the right granularity.

## Evidence log

- **2026-06-03T16:42:19-03:00** — Implemented + committed as `559e702`; `bash scripts/ci.sh` green including `✔ skills/no-author-scripts passed`. Not pushed (awaiting explicit authorization for direct push to main). — main context

## Review

- **Goal met:** yes — guard `scripts/skills/no-author-scripts.sh` exists/executable (100755), scans SKILL.md + references/ + agent bodies, is wired into `scripts/ci.sh`, reports 0 violations; all 9 prior-leaking bodies are clean; rule documented in all 3 nodes.
- **Regressions:** none — full `bash scripts/ci.sh` green; all 6 `[x]` criteria evidence-backed against `git show 559e702`.
- **CI:** pass — `bash scripts/ci.sh` exit 0; new check present as `✔ skills/no-author-scripts passed`; allowlist (`scaffold write-skill`) matches the documented allowlist exactly.
- **Follow-ups:** none — out-of-scope items (Codex `.toml` twins, scaffold/write-skill allowlist) are intentional, not gaps.
- Filed by: plan-review on 2026-06-03T16:43:58-03:00
