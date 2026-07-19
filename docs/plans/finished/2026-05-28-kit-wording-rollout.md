---
title: Roll out cross-tool wording rules and data-preservation across at-risk skills
goal: Copy the proven self-contained data-preservation pattern + add a cross-tool wording section, across the remaining HIGH/MED-risk skills (multi-tool-bridge, skill-agent-pipeline, skill-maintenance, refactor)
status: finished
created: "2026-05-28T14:08:35-03:00"
updated: "2026-05-28T16:50:42-03:00"
started_at: "2026-05-28T16:36:12-03:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: "a78e70bd20551929fa83b4c8fb63ec9ea25ec319"
tags: [skills, wording, data-preservation, layer-3, cross-tool]
affected_paths:
  - plugins/docks/skills/AGENTS.md
  - plugins/docks/skills/productivity/multi-tool-bridge/SKILL.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/references/verifier.md
  - plugins/docks/skills/productivity/skill-maintenance/SKILL.md
  - plugins/docks/skills/engineering/refactor/SKILL.md
related_plans:
  - 20260528-context-tree-loss-guard
  - 20260528-data-preservation-shared-infra
review_status: passed
---

# Roll out cross-tool wording rules and data-preservation across at-risk skills

## Goal

Propagate the self-contained data-preservation pattern (proven in Layer 1, documented for authors in Layer 2) into the four other at-risk skills, by **copying** the inline constraint + verification snippet into each skill's own body/`references/` — never cross-linking a sibling skill's file. Add a "Cross-tool wording" section to `plugins/docks/skills/AGENTS.md` so future authors inherit the discipline.

Success state: every HIGH/MED-risk skill carries (a) a top-of-body preservation `<constraint>` written as a literal checklist, (b) a turn-ending approval gate where it does a destructive write, (c) a concrete `## Verification` block (per-section presence + net-shrink tripwire); AND the authoring node documents the cross-tool wording rules. All touched skills hold their current score (do-not-regress — they're already at/near max).

## Context

The cross-skill audit found `multi-tool-bridge` has the best in-class safeguards but its byte-delta tolerance is loose and section-level only; `skill-agent-pipeline` backs up agents but not split skills; `skill-maintenance` auto-rewrites prose with no diff gate; `refactor` states scope discipline in prose but doesn't enforce it mechanically.

The wording research (browser-verified 2026-05-28) confirmed five cross-tool rules worth making canonical: the 5,000/25,000-token compaction reattachment (constraints belong at the top), turn-ending gates (no runtime pause primitive exists), front-loaded descriptions (Codex shortens the catalog tail-first), Codex reading bodies as plain markdown (no XML weighting), and `isolation: worktree` as a Claude-only preservation primitive.

This is Layer 3. It depends on Layer 2's pattern doc and on Layer 1 proving the pattern.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Add "Cross-tool wording" subsection to `plugins/docks/skills/AGENTS.md`: (a) 5,000/25,000-token compaction → constraints at top; (b) turn-ending gate phrasing (no pause primitive); (c) front-load description first ~100 chars (Codex shortens the ~8K *catalog* tail-first; per-skill desc cap stays 1024); (d) Codex reads bodies as plain markdown — safety rules must read fine without `<constraint>` weighting; (e) `isolation: worktree` is Claude-only | — | with #2 | done | — |
| 2 | Confirm the `plugins/docks/skills/AGENTS.md` node stays ≤500 lines after #1; if it would exceed, split the wording rules into `plugins/docks/skills/references/cross-tool-wording.md` (same-folder, one level deep) and link it | 1 | — | done | — |
| 3 | `multi-tool-bridge/SKILL.md` — replace the loose byte-% check (`:197`) with per-section presence + net-shrink tripwire; add paragraph-level routing for MIXED sections (default STAY); add a `git stash push -u -m mtb-pre-rewrite-<ISO>` recovery anchor before the first destructive write; copy the inline verification snippet | 1 | with #4,#5,#6 | done | — |
| 4 | `skill-agent-pipeline/SKILL.md` — extend the Phase 8 backup (`:93`, currently agents-only via `<name>.md.bak`) to also `.bak` a split SKILL.md + its new `references/`; add a Phase 6 line-parity check in `references/verifier.md`; add a "split → copy verbatim, no rewording" constraint | 1 | with #3,#5,#6 | done | — |
| 5 | `skill-maintenance/SKILL.md` — add a constraint: when a refresh would rewrite a prose section by more than a trivial amount, show the diff in a proposal table and use the turn-ending gate (currently step 5 auto-rewrites with no gate) | 1 | with #3,#4,#6 | done | — |
| 6 | `refactor/SKILL.md` (LOWEST value — already states the discipline in prose) — harden the existing soft rule into a mechanical check: Phase 8 runs `git diff --name-only` against the plan's `affected_paths`; any path outside the set ⇒ FAIL | 1 | with #3,#4,#5 | done | — |
| 7 | Per touched skill: bump `metadata.updated`; re-sync `content_hash` via `bash scripts/skills/content-hash.sh --backfill` | 3-6 | — | done | — |
| 8 | Run `bash scripts/skills/score.sh --per-file` — confirm every touched skill holds its current score (baseline: mtb 16, pipeline 15, maintenance 16, refactor 16); report any delta | 7 | — | done | — |
| 9 | Run `bash scripts/ci.sh` — full green (incl. Layer 2's `transform-guard.sh`) | 7, 8 | — | done | — |

### Step details

- **Step 1 — Codex description fact (corrected).** The ~8,000 chars is the **aggregate catalog cap** (~2% of context), not a per-description limit; the per-skill `description` cap is **1024** (agentskills.io). When the catalog overflows, Codex shortens descriptions tail-first — hence front-load the first ~100 chars. (Earlier draft conflated these.)
- **Step 1 — Opus 4.7/4.8.** Write "Opus 4.7/4.8 follow instructions literally" — 4.8 shipped 2026-05-28 and makes consistent instruction-following a headline, reinforcing the checklist framing. (Earlier draft said "4.7" only.)
- **Step 3 — threshold (corrected).** Don't just tighten "5% → 2%". A global byte-% is the wrong primary check for a split/migration (scaffolding is added). Use per-section presence as primary; keep a net-shrink tripwire as secondary. `multi-tool-bridge:197` currently does CLAUDE.md+AGENTS.md combined line-count "must not drop > 5%" — replace with section-presence.
- **Step 6 — refactor is the lowest-value edit.** `refactor/SKILL.md:24` already says "Do not touch code beyond the planned change" and Phase 8 (`:101`) already "verifies the diff against the plan." This step only converts that soft prose into a mechanical `git diff --name-only` assertion — keep it, but it's lowest priority.

### Scoring note (do-not-regress)

All four skills already score at/near max (mtb 16, pipeline 15, maintenance 16, refactor 16). There is **no headroom to improve** — the criterion is "don't regress." Bodies are 112–198 lines (headroom to the 310-line bonus is 110+ lines), so added constraints/verification won't cost the size bonus. A **4th/5th `<constraint>` earns 0 marginal score** (cap 3); `multi-tool-bridge` already has 4. Added blocks are for behavior, not points — push detail to `references/` to stay lean.

## Acceptance criteria

- [ ] `plugins/docks/skills/AGENTS.md` "Cross-tool wording" subsection with the 5 rules (Codex fact corrected; Opus 4.7/4.8)
- [ ] Authoring node still ≤500 lines (or wording split into a same-folder `references/` file)
- [ ] `multi-tool-bridge` — per-section presence check replaces the byte-% line; paragraph-level MIXED routing; `git stash` anchor; inline verification copied
- [ ] `skill-agent-pipeline` — Phase 8 backup covers split skills; Phase 6 line-parity check; verbatim-copy constraint
- [ ] `skill-maintenance` — diff-gate constraint with turn-ending gate
- [ ] `refactor` — Phase 8 mechanical scope assertion (`git diff --name-only` vs affected_paths)
- [ ] Every touched skill: `metadata.updated` bumped, `content_hash` re-synced
- [ ] `bash scripts/ci.sh` green; per-file scores hold at baseline (no regression)

## Out of scope

- `context-tree` — Layer 1.
- LOW-risk skills (`scaffold`, `plan-init`, `plan-sidecar`, `codex-plugin-mirror`, `write-skill`) — sufficient safeguards per audit (write-skill is touched by Layer 2 for the doc, not here).
- Worktree-isolation subagent wrappers — user rejected.
- Codex `.codex-plugin/plugin.json` schema changes — not needed; per-skill inline snippets ship with each skill, no cross-tool plumbing.

## Mistakes & Dead Ends

- **2026-05-28T16:16:41-03:00**: First draft told each skill to "link the shared `_shared/references/data-preservation.md`" and "run `scripts/tree/preserve.sh`". → Both rejected in Layer 2 (cross-skill dangling pointer; consumer-unreachable script). → This plan now COPIES the inline snippet into each skill (duplication acceptable) and references the author-facing doc only at authoring time.
- **2026-05-28T16:16:41-03:00**: First draft framed acceptance as "scores unchanged or improved" and proposed "tighten 5%→2%". → Skills are already at max (no improve headroom) and a byte-% is the wrong primary check for splits. → Reframed to do-not-regress + per-section presence.
- **2026-05-28T16:16:41-03:00**: First draft conflated Codex's ~8K aggregate catalog cap with a per-description limit. → Corrected: 8K is the catalog; per-skill description cap is 1024.

## Sources

- Audit fork — per-skill edits spec
- Wording-research fork + browser verification (2026-05-28) — the five cross-tool rules; Codex catalog-vs-description correction; Opus 4.8 instruction-following headline
- `plugins/docks/skills/productivity/multi-tool-bridge/SKILL.md:197` — byte-% line to replace
- `plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md:93` — agents-only backup to extend
- `plugins/docks/skills/productivity/skill-maintenance/SKILL.md` step 5 — auto-rewrite with no gate
- `plugins/docks/skills/engineering/refactor/SKILL.md:24,101` — scope discipline already in prose (lowest-value edit)
- https://code.claude.com/docs/en/skills, https://agentskills.io/specification, https://developers.openai.com/codex/skills, https://www.anthropic.com/news/claude-opus-4-8 — all verified 2026-05-28

## Blockers

- Layer 2's author-facing pattern doc must exist (the copy source).
- Layer 1 should land first so the pattern is proven before propagation.

## Notes

- Per-skill edits (steps 3-6) parallelize once steps 1-2 land. Could split into per-skill sub-plans if the diff gets large; kept unified for now (one coherent research-derived diff).
- Score floors: engineering 10, productivity 8 (`scripts/AGENTS.md`). refactor is engineering; the rest productivity.

## Evidence log

- **2026-05-28T14:08:35-03:00** — plan created as Layer 3 of the rollout
- **2026-05-28T16:16:41-03:00** — revised after logic re-audit + browser fact-check: rewired the dependency to copy-not-link, corrected the Codex catalog/description conflation and the threshold logic, set Opus 4.7/4.8, reframed scoring as do-not-regress
- **2026-05-28T16:36:12-03:00** — moved to ongoing/ (blockers cleared: L1+L2 implemented), `started_at` set
- **2026-05-28T16:43:53-03:00** — implemented all 9 steps: "Cross-tool wording" section added to `plugins/docks/skills/AGENTS.md` (78 lines, ≤500); multi-tool-bridge byte-% → per-section presence + git-stash anchor; skill-agent-pipeline Phase 8 backup extended to splits + verbatim rule + `## Verification` + verifier.md line-parity check; skill-maintenance step-5 diff-gate; refactor `## Verification` with mechanical `git diff --name-only` scope assertion. `transform-guard.sh` PENDING now empty → all 5 transformers fully enforced. Hashes backfilled; scores hold (no regression); `bash scripts/ci.sh` green. Awaiting commit to ship.

## Review

- **Goal met:** yes — all 6 slice files verified in `a78e70b` and HEAD: AGENTS.md "Cross-tool wording" (5 rules + Codex catalog/1024 fix + Opus 4.7/4.8); multi-tool-bridge byte-% → per-section presence + git-stash anchor; skill-agent-pipeline Phase 8 split backup + verbatim rule + Phase 6 line-parity; skill-maintenance step-5 diff-gate; refactor `## Verification` git-diff scope assertion.
- **Regressions:** none — per-file scores hold at baseline (refactor 16, multi-tool-bridge 16, skill-agent-pipeline 15, skill-maintenance 16; do-not-regress met). transform-guard: 5 enforced-clean, 0 pending. metadata.updated bumped + content_hash in sync (all four). Scope note (not a regression): `affected_paths` lists `multi-tool-bridge/references/claude-md-classification.md`, which the commit does not touch — Step 3 only edited that skill's SKILL.md, so the entry is stale.
- **CI:** pass — `bash scripts/ci.sh` exit 0; transform-guard PASSED (5 enforced-clean, 0 pending), content_hash in sync.
- **Follow-ups:** none
- Filed by: plan-review on 2026-05-28T16:50:42-03:00
