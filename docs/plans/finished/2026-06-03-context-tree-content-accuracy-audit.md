---
title: Add a content-accuracy audit to context-tree's audit op
goal: Make `context-tree audit` verify each node's source-anchored claims against current source — not just file existence — so renamed validators and stale file:line refs surface as drift.
status: finished
created: "2026-06-03T15:26:46-03:00"
updated: "2026-06-03T16:08:04-03:00"
started_at: "2026-06-03T15:56:29-03:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: "512f24b4cd5a2594e5af960b7f5a599420b1a7f2"
tags: [skills, audit, drift]
affected_paths:
  - plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/context-tree/references/node-template.md
related_plans: []
review_status: passed
---

# Add a content-accuracy audit to context-tree's audit op

## Goal

`context-tree audit` should verify that each node's **source-anchored claims** (file:line / path refs, code snippets, named identifiers, counts) still match **current source** — re-derived from disk, ignoring git history — and report drift with a per-claim verdict and the count of claims actually checked. Success: an `audit` run can no longer declare a node "no drift" while it documents a renamed validator, a moved file:line, a changed scoring floor, or an identifier that no longer exists; and a clean verdict always states how many claims were verified. `audit` stays read-only; `refresh` remains the fixer.

## Context

The `skill-agent-pipeline` skill just gained a mandatory content-accuracy audit (Phase 2c, `references/content-auditor.md`) because its old git-delta + 5-ref spot-check could call a skill accurate while it documented APIs that don't exist. `context-tree` has the **same class of gap** for the nested `AGENTS.md` nodes it owns: its entire drift logic (`conflict-resolution.md:42-50`) is three shallow checks — does a referenced path *exist*, does a count match, did a new file appear — i.e. **existence, not content-match**. Nodes carry exactly the drift-prone claims this misses (this repo's own `plugins/docks/skills/AGENTS.md` cites validator names, scoring floors, line caps, file paths). Layer ownership says this belongs in `context-tree` (it owns nodes), not in `skill-agent-pipeline` (skills+agents) or `human-docs-workflow` (prose docs) — so the fix is to port the Phase 2c *discipline* into `context-tree`'s audit, **copied inline** (the kit forbids cross-skill `references/` pointers — agentskills.io "one level deep").

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Rewrite `conflict-resolution.md` "Drift detection (`audit`)" into a content-accuracy procedure: enumerate every checkable claim per node (path/file:line ref, code snippet, named identifier, count), verify each against current source ignoring git history, assign a drift verdict, reproduce-or-drop, and state claims-checked. Keep "audit never writes; user decides `refresh`." | — | with #3 | done | — |
| 2 | Add a drift taxonomy + verdict to that section: `confirmed` / `broken-ref` / `stale-snippet` / `fictional-identifier` / `drifted-claim` / `unverifiable` (soft prose, not drift). A node verdict of CLEAN requires zero drift AND a non-zero stated claim count. | 1 | — | done | — |
| 3 | Update `node-template.md` so the `## tree (metadata)` `sources:` field is load-bearing — each node records the files its claims derive from (the cited-sources floor), giving `audit` a cheap pre-filter analogous to `source_files`. | — | with #1 | done | — |
| 4 | Update `SKILL.md`: rephrase the `audit` op rows (lines 36, 93) from "claims that no longer match disk" to the content-accuracy contract; add a gotcha ("passing a node as 'no drift' on a file-exists check → stale claims ship; audit verifies content, not existence, and states the count"). Leave the preservation `<constraint>` (lines 27-29) and `## Verification` block (line 98) intact. | 1, 2 | — | done | — |
| 5 | Validate: bump `metadata.updated` → today, `bash scripts/skills/content-hash.sh --backfill`, `bash scripts/ci.sh` green (transform-guard still satisfied; score ≥ productivity floor 8, aim 14+). | 1, 2, 3, 4 | — | done | — |
| 6 | Dogfood: run the upgraded `audit` mentally/actually against this repo's own nodes; confirm it surfaces at least one real drift (or reports CLEAN with stated counts). Record the result in `## Evidence log`. | 5 | — | done | — |

### Step details

- **#1** mirror the three constraints from `content-auditor.md` (vertical-not-horizontal / state-the-count / reproduce-or-drop) but worded for nodes; copy inline, do **not** reference `skill-agent-pipeline/references/content-auditor.md`.
- **#4** the SKILL.md edits are additive; only the two `audit` op descriptions change wording. Do not touch constraint 4 or `## Verification` — `scripts/skills/transform-guard.sh` scans the SKILL.md body for both and `context-tree` is a curated transformer (`transform-guard.sh:35`).

## Acceptance criteria

- [x] `conflict-resolution.md` "Drift detection" enumerates every checkable claim type and verifies it against current source (not existence), with the drift taxonomy, reproduce-or-drop, and a state-the-count rule.
- [x] The content-accuracy discipline is copied inline — zero cross-skill `references/` pointers (agentskills.io one-level rule honored).
- [x] `node-template.md` `sources:` guidance makes each node record its cited source files.
- [x] `SKILL.md` audit op + a gotcha reflect content-accuracy; `metadata.updated` bumped and `content_hash` re-synced.
- [x] `bash scripts/ci.sh` green — transform-guard passes (preservation `<constraint>` + `## Verification` intact), per-file score ≥ floor.
- [x] Dogfood run recorded: the upgraded `audit` surfaces a real node drift, or reports CLEAN with stated per-node claim counts.

## Out of scope

- Changing `skill-agent-pipeline` (its Phase 2c shipped in commit `84c0be3`).
- Making `context-tree` audit README / prose docs — that is `human-docs-workflow`'s layer.
- Auto-fixing drift inside `audit` — it stays read-only; `refresh` remains the writer.
- A standalone CI validator that machine-checks node claims on every commit — possible follow-up, not this plan.

## Mistakes & Dead Ends

(empty)

## Sources

- `plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md:42-50` — the shallow existence/count drift check this plan replaces
- `plugins/docks/skills/productivity/context-tree/SKILL.md:36,93` — `audit` op described only as "compares AGENTS.md claims to disk"
- `plugins/docks/skills/productivity/context-tree/references/node-template.md:28-32` — the `## tree` `sources:` metadata that will seed the audit pre-filter
- `plugins/docks/skills/productivity/skill-agent-pipeline/references/content-auditor.md` — the Phase 2c discipline to mirror (copied inline, NOT cross-referenced)
- `plugins/docks/skills/AGENTS.md` — no cross-skill `references/` pointers (one level deep); transform-guard requires a preservation `<constraint>` + `## Verification` on curated transformers
- `scripts/skills/transform-guard.sh:35` — `context-tree` is a curated transformer; its safeguard must survive the edit

## Blockers

(none)

## Notes

- **Why context-tree, not skill-agent-pipeline:** layer ownership. `context-tree` owns the nested `AGENTS.md`+`CLAUDE.md` pairs and knows their structural contract (pair convention, `@AGENTS.md` shim, ≤500 cap, `tree/guard.sh`). Reaching into nodes from `skill-agent-pipeline` would reverse that skill's own scope guard and duplicate logic — the exact drift we are eliminating.
- **Why inline, not shared:** the kit spreads shared discipline by copying inline (cf. the data-preservation `<constraint>` enforced across all 5 transformers by `transform-guard.sh`), because agentskills.io keeps `references/` one level deep and a sibling-skill reference is a dangling pointer.
- Open question for the implementer: should `refresh`'s existing "drift-corrected claims" step (`conflict-resolution.md:26`) explicitly consume the audit's per-claim verdicts? Likely yes — note it, keep the change minimal.

## Evidence log

- **2026-06-03T16:01:50-03:00** — Implemented in commit `512f24b`; `bash scripts/ci.sh` green, context-tree per-file score 16/16. — main context
- **2026-06-03T16:01:50-03:00** — Dogfood: ran the upgraded `audit` against `scripts/AGENTS.md` — 15/15 claims confirmed (10 validator paths, 2 score caps via `score.sh:4` / `agents/score.sh:4`, 2 per-file floors via `config/scoring.json`, 1 tag format via `release.sh`), 0 drift → CLEAN. The score-cap claims needed a source read (grep was inconclusive), exercising reproduce-or-drop before "confirmed". — main context

## Review

- **Goal met:** yes — `conflict-resolution.md` "Drift detection" now verifies every source-anchored claim (path/file:line, snippet, identifier, count, coverage) against current source re-derived from disk, with a drift taxonomy (`broken-ref`/`stale-snippet`/`fictional-identifier`/`drifted-claim`/`unverifiable`), reproduce-or-drop, and a CLEAN-requires-non-zero-claim-count rule; `node-template.md` `sources:` is load-bearing as the audit pre-filter; `SKILL.md` audit rows + new gotcha reflect content-vs-existence. Auto-fix and prose-doc auditing stayed out of scope; discipline copied inline (zero cross-skill pointers — `grep -rn 'skill-agent-pipeline\|content-auditor'` over the skill dir returns nothing).
- **Regressions:** none
- **CI:** pass — `bash scripts/ci.sh` exit 0; transform-guard green (preservation `<constraint>` + `## Verification` intact), `content_hash in sync`, context-tree per-file score clears the productivity floor.
- **Follow-ups:** none (a standalone CI validator that machine-checks node claims is noted out-of-scope in the plan as a possible future plan, not filed here)
- Filed by: plan-review on 2026-06-03T16:08:04-03:00
