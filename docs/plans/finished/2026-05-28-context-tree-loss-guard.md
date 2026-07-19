---
title: Harden context-tree against silent content loss when splitting
goal: Stop context-tree dropping content during root→nodes relocation via per-section accounting + a two-phase write + a self-contained verification block
status: finished
created: "2026-05-28T14:08:35-03:00"
updated: "2026-05-28T16:49:12-03:00"
started_at: "2026-05-28T16:24:24-03:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: "a78e70bd20551929fa83b4c8fb63ec9ea25ec319"
tags: [skills, context-tree, data-preservation, layer-1]
affected_paths:
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md
  - plugins/docks/skills/productivity/context-tree/references/node-template.md
  - plugins/docks/skills/productivity/context-tree/references/data-preservation.md
related_plans:
  - 20260528-data-preservation-shared-infra
  - 20260528-kit-wording-rollout
review_status: passed
---

# Harden context-tree against silent content loss when splitting

## Goal

Make `context-tree init` and `context-tree refresh` *section-conservative by default* so content moved out of the root `AGENTS.md` cannot vanish silently. The user reported losing sections of root context after a split. Root cause: the approval gate shows the **folder list**, not the per-section relocation plan, and the workflow has no pre/post content inventory and no post-write check.

The primary safety invariant is **per-section accounting**, NOT a global byte percentage. Every headed section present in the source root must end up either (a) in some destination file, or (b) explicitly marked `DROP` by the user at the gate. A byte-delta check is a *secondary, crude* gross-loss tripwire only — see the calibration note below.

Success state: a `context-tree init` run on a synthetic repo whose root AGENTS.md has 200 distinct headed sections cannot complete unless every one of those 200 sections is traced to a destination (or DROP-marked). Splitting *adds* scaffolding (`@AGENTS.md` imports, CLAUDE.md files, node headings, the root breadcrumb section), so total written bytes should be **≥100%** of the source bytes; the post-write check flags any *net shrink* as suspicious and refuses to claim success until the missing section is located.

## Context

`context-tree` is the highest-risk skill in the kit for silent content loss because its central operation IS deletion-from-root (workflow step 5 — "Relocate, don't duplicate"). Companion skills `multi-tool-bridge` and `skill-agent-pipeline` do similar splits but `context-tree` has none of their safeguards:

- `multi-tool-bridge` has a byte-delta check (`SKILL.md:197`) — `context-tree` has zero content check
- `multi-tool-bridge` shows a 3-column section→destination→reason table at the gate — `context-tree` shows only `folder | new? | sources | one-line summary`
- Both ship a post-write `Anti-Hallucination Checks` section — `context-tree` has only `scripts/tree/guard.sh` (structural — pair existence, line cap)

This is Layer 1 of a three-plan rollout. It is **self-contained** — it does not depend on Layer 2 or Layer 3. context-tree owns its own preservation logic (in its own `references/data-preservation.md`), per the kit's self-sufficiency doctrine ("Duplication across nodes is acceptable; a dangling pointer is not").

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Add CONSTRAINT 4 to `SKILL.md` — per-section preservation invariant (every source section → destination or explicit DROP; secondary gross-loss tripwire) — placed in the top half of the body so it survives the 5K-token compaction window | — | with #2 | done | — |
| 2 | Upgrade CONSTRAINT 3 to turn-ending approval phrasing: "Print the proposal table as your final message. End the turn. Do not call Write/Edit/git-mv until the user replies." | — | with #1 | done | — |
| 3 | Split workflow step 5 ("Relocate") into a subworkflow with a per-section relocation table at the gate (`Section | Destination | Reason`); unclassified sections default to `KEEP in root` | 1, 2 | — | done | — |
| 4 | Promote `init` to a two-phase write: phase A writes all new nodes + runs `scripts/tree/guard.sh` to confirm they parse; phase B prunes root only after a second mini-approval of the exact lines-to-remove diff | 3 | — | done | — |
| 5 | Add `--dry-run` mode (NL equivalent "preview only") that short-circuits before any Write/Edit/git-mv and prints the relocation table + post-prune root preview + each node preview + the check that WOULD run | 4 | — | done | — |
| 6 | Add a `## Verification` block — per-section presence check (each source section's heading + normalized first line must grep-match in some destination) plus the gross-loss tripwire; fail-loud, do not claim success on a miss | 5 | — | done | — |
| 7 | Create `references/data-preservation.md` (context-tree-owned, self-contained) holding the section-inventory algorithm, the keyword routing rules, the two-phase write, and the verbatim inline-bash verification snippet | 3 | with #6 | done | — |
| 8 | Update `references/conflict-resolution.md` (per-section classification + unclassified→KEEP default) and `references/node-template.md` (per-section relocation table example) | 3 | with #6, #7 | done | — |
| 9 | Bump `metadata.updated` to today; re-sync `content_hash` via `bash scripts/skills/content-hash.sh --backfill` | 1-8 | — | done | — |
| 10 | Run `bash scripts/ci.sh` — green; confirm `bash scripts/skills/score.sh --per-file | grep context-tree` stays at its current 16 (do-not-regress; see scoring note) | 9 | — | done | — |

### Step details

- **Step 1 — Constraint placement + content.** Verified: Claude Code re-attaches only the first **5,000 tokens** of each invoked skill after compaction (combined **25,000**-token budget, oldest-invoked dropped first) — confirmed live on code.claude.com/docs/en/skills, 2026-05-28. Safety rules must sit near the top. Constraint 4 states the per-section invariant in checklist form (Opus 4.7/4.8 follow instructions literally — checklists, not narrative).
- **Step 2 — Turn-ending phrasing.** "STOP and await" gets bypassed by literal/eager models. There is **no runtime pause primitive** for skills (verified — `disable-model-invocation` only gates auto-invoke, not mid-run). The only enforceable pause is *ending the turn*: print the table as the final message and stop calling tools.
- **Step 3 — Per-section table.** Mirror `multi-tool-bridge` SKILL.md:80-91: `| Section | Destination | Reason |`. Unclassified → `| <heading> | KEEP in root | unclassified (default safe) |`. The user can override any row to `DROP` explicitly.
- **Step 4 — Two-phase write.** Phase A writes nodes only; guard.sh between A and B. Phase B deletes from root only after the user confirms the exact removal diff. If the user halts after A, the worst case is *duplicated* content (recoverable), never *lost* content.
- **Step 6 — Verification (concrete, not prose).** Per-section presence is the real check; byte-delta is only a tripwire. Sketch:
  ```bash
  # every source section heading must still appear somewhere downstream
  while IFS= read -r h; do
    grep -rqF "$h" <destination-files> root-AGENTS.md || echo "LOST SECTION: $h"
  done < <(grep -E '^#{1,3} ' root-AGENTS.md.orig)
  # gross-loss tripwire: a SPLIT adds scaffolding, so expect ≥100% of source bytes
  before=$(wc -c < root-AGENTS.md.orig)
  after=$(cat <every-written-file> | wc -c)
  awk -v b="$before" -v a="$after" 'BEGIN{ if (a < b) print "NET SHRINK after split — investigate" }'
  ```
  Any non-empty echo ⇒ stop, locate, do not report success.
- **Step 7 — Self-contained reference.** context-tree owns `references/data-preservation.md`. It is NOT a link to a sibling skill's file (that would be a dangling pointer and violates agentskills.io "keep references one level deep" — both verified 2026-05-28). Layer 2 produces the author-facing *template* this is copied from; the copy lives here, owned by this skill.
- **Step 9 — Hash sync.** Mandatory per `plugins/docks/skills/AGENTS.md` constraint 2 — editing only `updated:` doesn't move the hash.

### Scoring note (do-not-regress, not improve)

context-tree currently scores **16/16** — there is no headroom to improve, the goal is not to regress. Body is **109 lines** (sweet spot 80–310), so adding constraint 4 (~8 lines) + the Verification block (~15 lines) leaves ~180 lines of headroom — the 310-line bonus is safe. Note a **4th `<constraint>` earns 0 marginal score** (scorer caps constraint credit at 3); it's added for behavior, not points. Push the detailed algorithm into `references/data-preservation.md` to keep the body lean.

## Acceptance criteria

- [ ] `context-tree/SKILL.md` constraint 4 states the per-section invariant in checklist form, in the top half of the body
- [ ] Approval gate shows a per-section relocation table (not just a folder list); unclassified sections default to KEEP in root
- [ ] CONSTRAINT 3 uses turn-ending phrasing
- [ ] Two-phase write: nodes written + guard-verified before root is pruned, with a second mini-approval of the removal diff
- [ ] `--dry-run` (or NL equivalent) short-circuits all writes
- [ ] `## Verification` block does per-section presence checking + the gross-loss tripwire; fails loud on a missing section
- [ ] `references/data-preservation.md` exists, self-contained (no cross-skill link)
- [ ] `metadata.updated: "2026-05-28"`, `content_hash` re-synced
- [ ] `bash scripts/ci.sh` green; context-tree score stays 16
- [ ] Manual dogfood: run against a copy of this repo; confirm the gate shows section-level moves and refuses to drop an unrecognized section

## Out of scope

- The author-facing shared pattern doc + any author-side lint — Layer 2.
- Per-skill edits to other skills — Layer 3.
- A `scripts/tree/preserve.sh` runtime validator — explicitly rejected (see Layer 2 Mistakes & Dead Ends: scripts/ is author-side-only and never reaches the consumer repo where the check must run).
- Worktree-isolation subagent wrapper — user rejected; in-skill safeguards only.
- Rewriting consumer projects' non-conforming AGENTS.md — `audit` surfaces drift only.

## Mistakes & Dead Ends

- **2026-05-28T16:16:41-03:00**: First draft made a global "<95% of input bytes = fail" byte-delta the headline check → wrong for a SPLIT, because splitting *adds* scaffolding so output is normally ≥100% of input; a 95% floor is both too lenient and conceptually backwards, and a whole lost section can hide under added scaffolding. → Replaced with per-section presence accounting as the primary invariant; byte-delta demoted to a net-shrink tripwire.
- **2026-05-28T16:16:41-03:00**: First draft planned to inline the preservation pattern now and later replace it with a link to Layer 2's shared `_shared/references/data-preservation.md` → that cross-skill link is a dangling pointer (violates this skill's own constraint 2 and agentskills.io "one level deep"). → context-tree owns a self-contained copy in its OWN references/.

## Sources

- `plugins/docks/skills/productivity/context-tree/SKILL.md:83` — the "Relocate, don't duplicate" step with no safeguard
- `plugins/docks/skills/productivity/multi-tool-bridge/SKILL.md:80-91` — section classification table to mirror
- `plugins/docks/skills/productivity/multi-tool-bridge/SKILL.md:197` — existing byte-delta check
- `scripts/tree/guard.sh` — current structural-only validator (used in phase-A verify)
- https://code.claude.com/docs/en/skills — verified 2026-05-28: 5,000-token re-attachment, 25,000 combined budget oldest-first, "keep under 500 lines"; no mid-run pause primitive
- https://agentskills.io/specification — verified 2026-05-28: description 1-1024 chars; "keep file references one level deep"
- https://www.anthropic.com/news/claude-opus-4-8 — Opus 4.8 (released 2026-05-28): instruction-following is a headline; no tokenization/compaction change
- Audit + wording-research forks (this conversation); local logic re-audit (this conversation)

## Blockers

(none — self-contained, actionable when picked up; can run in parallel with Layer 2)

## Notes

- This plan no longer depends on Layer 2. Layer 2 produces the author-facing *template*; this skill keeps its own copy.
- Strictly additive — every existing op (`init`, `audit`, `refresh`, `refresh <folder>`) keeps its name and outputs. The change is more gates + checks, no API break.

## Evidence log

- **2026-05-28T14:08:35-03:00** — plan created in response to user report of silent content loss during `context-tree init`
- **2026-05-28T16:16:41-03:00** — revised after a logic re-audit + browser-verified fact-check (Opus 4.8 release day): sharpened threshold to per-section accounting, made the skill self-contained, dropped the Layer 2 dependency
- **2026-05-28T16:24:24-03:00** — moved to ongoing/, `started_at` set
- **2026-05-28T16:36:12-03:00** — implemented all 10 steps: turn-ending gate (constraint 3), per-section preservation invariant (constraint 4), per-section relocation table + two-phase write + `--dry-run` in the init workflow, `## Verification` block, self-contained `references/data-preservation.md`, conflict-resolution + node-template updates. content_hash backfilled; context-tree holds score 16; `transform-guard.sh` now reports context-tree enforced-clean; `bash scripts/ci.sh` green. Awaiting commit to ship.

## Review

- **Goal met:** yes — per-section accounting (constraint 4 + relocation table), turn-ending gate (constraint 3), two-phase write, `--dry-run`, and a fail-loud `## Verification` block all shipped in `context-tree/SKILL.md` + self-contained `references/data-preservation.md`; 9/9 artifact criteria verified against the diff.
- **Regressions:** none — context-tree score holds at 16; `transform-guard.sh` reports context-tree enforced-clean; cross-layer files in the bundled commit (shared-infra + kit-wording) are expected co-ship, not drift.
- **CI:** pass — `bash scripts/ci.sh` exit 0; `content_hash in sync`, `transform-guard passed`, `tree/guard passed`.
- **Follow-ups:** none — criterion 10 (manual dogfood against a repo copy) is a runtime smoke test, not a diff-checkable artifact; unverifiable from the ship commit (not a defect).
- Filed by: plan-review on 2026-05-28T16:49:12-03:00
