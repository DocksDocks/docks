---
title: Establish a self-contained data-preservation pattern for transforming skills
goal: Make data preservation a reusable AUTHOR-FACING pattern (doc authors read while writing) + an inline runtime check each skill copies — no cross-skill link, no consumer-unreachable validator
status: finished
created: "2026-05-28T14:08:35-03:00"
updated: "2026-05-28T16:50:45-03:00"
started_at: "2026-05-28T16:24:24-03:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: "a78e70bd20551929fa83b4c8fb63ec9ea25ec319"
tags: [skills, infra, data-preservation, layer-2]
affected_paths:
  - plugins/docks/skills/productivity/write-skill/references/data-preservation.md
  - plugins/docks/skills/productivity/write-skill/SKILL.md
  - plugins/docks/skills/AGENTS.md
  - scripts/skills/transform-guard.sh
  - scripts/ci.sh
  - scripts/AGENTS.md
related_plans:
  - 20260528-context-tree-loss-guard
  - 20260528-kit-wording-rollout
review_status: passed
---

# Establish a self-contained data-preservation pattern for transforming skills

## Goal

Make "don't lose content during a transform" a **reusable pattern** without violating the kit's shipping model or its self-sufficiency doctrine. Two artifacts:

1. **Author-facing pattern doc** — read by skill AUTHORS at authoring time (inside the docks repo, where its path always resolves), NOT linked at skill-runtime from a consumer repo. Home: the `write-skill` skill's `references/` (write-skill is literally "the skill for authoring skills") + a short pointer subsection in the `plugins/docks/skills/AGENTS.md` authoring node.
2. **Inline runtime check** — a verbatim bash snippet each transforming skill COPIES into its own body/`references/` (duplication is acceptable per the kit doctrine; a cross-skill link is not).

Plus an OPTIONAL author-side **structural lint** (`scripts/skills/transform-guard.sh`) that runs in *this repo's* CI over *committed* skill files — flagging any docks SKILL.md that describes a transform (split/relocate/migrate/rewrite/move) but omits a preservation constraint or `## Verification` block.

Success state: a new author writing a destructive skill reads `write-skill/references/data-preservation.md`, copies the constraint + gate + verification snippet into their skill, and the author-side lint confirms the snippet is present before commit. No skill links a sibling skill's references; no shipped artifact assumes `scripts/` exists in the consumer's repo.

## Context

The cross-skill audit found `context-tree` (HIGH), `multi-tool-bridge` (HIGH), `skill-agent-pipeline` (HIGH), `skill-maintenance` (MED), `refactor` (MED) all do destructive transforms with uneven safeguards. The instinct was to centralize the discipline. The **first draft of this plan did so wrongly** — see Mistakes & Dead Ends. This revision centralizes the *guidance* (author-time, shared) while keeping the *runtime check* self-contained per skill (copy, not link).

This is Layer 2 of three. It is **independent of Layer 1** (disjoint files) and can run in parallel. Layer 3 copies the pattern this plan documents into the remaining at-risk skills.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Write `write-skill/references/data-preservation.md` — the 10-point checklist + 3 copy-paste templates: (a) per-section preservation constraint, (b) turn-ending approval gate, (c) inline-bash `## Verification` block (per-section presence + net-shrink tripwire). Plain markdown + plain bash only. | — | with #4 | done | — |
| 2 | Add a "Data preservation for transforming skills" pointer subsection to `plugins/docks/skills/AGENTS.md` — link to the write-skill reference + the inline-not-cross-linked rule | 1 | — | done | — |
| 3 | Link the new reference from `write-skill/SKILL.md` (one level deep, same-skill); bump `metadata.updated` + backfill `content_hash` | 1 | — | done | — |
| 4 | Write `scripts/skills/transform-guard.sh` — **curated opt-in list** (audit output), NOT verb-detection (which over/under-matched, see Mistakes). Each listed transformer must carry a preservation `<constraint>` + `## Verification` block; shrinking PENDING allowlist warns during rollout, fails on regression | — | with #1 | done | — |
| 5 | Wire `transform-guard.sh` into `scripts/ci.sh` structural-guards loop (`skills/guard skills/transform-guard agents/guard tree/guard`) | 4 | — | done | — |
| 6 | Update `scripts/AGENTS.md` validator table — add the `skills/transform-guard.sh` row | 5 | — | done | — |
| 7 | Smoke test: `transform-guard.sh` WARNs context-tree (gap detected) pre-Layer-1, exits 0 (CI-safe); passes once L1 lands | 4 | — | done | — |
| 8 | Run `bash scripts/ci.sh` — green; no score regression; no category-floor miscount (no new top-level dir) | 1-7 | — | done | — |

### Step details

- **Step 1 — Why write-skill, not a `_shared/` dir.** `write-skill` is the authoring skill; authors invoke it while building a skill, in the docks repo, so its `references/` path always resolves. A new top-level `productivity/_shared/` dir is rejected: it is counted by `ci.sh` step-4 floor math (`find -maxdepth 1 -type d` over `productivity/`), inflating the category floor by 8 with no matching score (latent miscalibration), and any skill linking `../_shared/…` is a cross-skill dangling pointer (violates agentskills.io "one level deep", verified 2026-05-28).
- **Step 1 — template contents.** The verification template is the per-section presence check + net-shrink tripwire (NOT a global byte-% floor — for splits, output is normally ≥100% of input, so a % floor is the wrong primary check; see Layer 1). Pure POSIX bash + `grep`/`wc`/`shasum -a 256` (portable Linux+macOS). No Claude-only tools inside the snippet, since Codex reads it as advisory text.
- **Step 4 — what a CI lint legitimately CAN check.** It validates *this repo's committed skill files* — which `scripts/ci.sh` genuinely sees — not consumer runtime state. This is the right scope for `scripts/` tooling. It is a *style/structure* lint ("does this transforming skill carry a safeguard block?"), explicitly NOT a runtime data-loss check.
- **Step 4 — false-positive control.** Transform-verb matching is heuristic. Ship an allowlist (skills known not to transform despite mentioning the verbs) so the lint warns broadly but fails CI only on a real gap. Keep it advisory-leaning to avoid blocking unrelated PRs.

## Acceptance criteria

- [ ] `write-skill/references/data-preservation.md` exists: 10-point checklist + 3 templates (constraint, turn-ending gate, inline verification), plain markdown + plain bash
- [ ] `plugins/docks/skills/AGENTS.md` has a short "Data preservation for transforming skills" subsection pointing to it + the inline-block rule
- [ ] `write-skill/SKILL.md` References links the new file (same-skill, one level deep)
- [ ] `scripts/skills/transform-guard.sh` flags a transforming skill missing a safeguard; passes when present; runs <500ms
- [ ] `scripts/ci.sh` runs `transform-guard.sh`; CI green
- [ ] `scripts/AGENTS.md` validator table updated
- [ ] Smoke test: lint flags context-tree pre-Layer-1, passes post-Layer-1
- [ ] No skill score regressed; no category-floor miscount introduced (no new top-level skill-sibling dir)

## Out of scope

- A `scripts/tree/preserve.sh` snapshot/runtime validator — rejected (Mistakes & Dead Ends).
- A `productivity/_shared/` shared-reference directory + cross-skill links — rejected (Mistakes & Dead Ends).
- Editing context-tree itself — Layer 1.
- Per-skill edits to the other at-risk skills — Layer 3.
- A PostToolUse hook that auto-snapshots before writes — possible future; out of scope.

## Mistakes & Dead Ends

- **2026-05-28T16:16:41-03:00**: First draft shipped a `scripts/tree/preserve.sh` runtime validator wired into `scripts/ci.sh`, fed by a `.preserve-snapshot.json` the skill writes at the start of a run. → Architecturally broken: `scripts/` is **author-side-only, never shipped to consumers** (`scripts/AGENTS.md`), so a skill running in a consumer repo can't call it; and `scripts/ci.sh` runs in the *docks* repo where skills never execute, so it never sees a real snapshot. The runtime check must be **inline bash in the skill body** (Claude runs it; Codex reads it), not a shipped script. → Replaced with inline templates + a *style* lint that validates committed docks skill files only.
- **2026-05-28T16:16:41-03:00**: First draft put the shared pattern in `plugins/docks/skills/productivity/_shared/references/data-preservation.md` and had other skills link `../_shared/…`. → Cross-skill link is a dangling pointer (kit doctrine forbids it; agentskills.io says references one level deep); and the extra dir inflates the `ci.sh` category-floor count. → Author-facing doc lives in `write-skill/references/` (resolves at authoring time); runtime snippet is copied per skill.
- **2026-05-28T16:31:00-03:00** (impl): First `transform-guard.sh` auto-DETECTED transforming skills by regex over the body (`relocate|split|migrate|rewrite|…`). A dry run proved this both **misses** the real transformers (skill-agent-pipeline / skill-maintenance / refactor use the verbs in tables/advice, not their own imperative voice, so they didn't match) AND **false-positives** on 9 advice skills (solid "split a fat interface", react "rewrite", dep-vuln "migrate framework majors"). A verb regex can't replicate the audit's semantic judgment. → Rewrote to a **curated opt-in list** of the 5 known transformers (audit output) with a `PENDING` warn-allowlist; zero false positives, CI green immediately. Add a name to the list when a new content-transforming skill ships.

## Sources

- `scripts/AGENTS.md` — "author-side only — never shipped to consumers" (the fact that kills the preserve.sh approach)
- `scripts/ci.sh` step 4 — `find -maxdepth 1 -type d` floor count (why `_shared/` miscalibrates)
- `scripts/lib/validate-skills.mjs:33` (`findSkillFiles`) — only matches files named `SKILL.md` (why guards ignore non-SKILL dirs)
- `scripts/tree/guard.sh` — pattern for a new shell lint (set -u, walk, exit non-zero)
- https://agentskills.io/specification — verified 2026-05-28: "keep file references one level deep"; description 1-1024
- https://developers.openai.com/codex/skills — verified 2026-05-28: bodies read as plain instructions, no markup privileged; descriptions shortened tail-first when the ~8K aggregate catalog overflows (per-skill cap still 1024)
- Audit + wording-research forks; local logic re-audit (this conversation)

## Blockers

(none — independent of Layer 1; can run in parallel)

## Notes

- The reframed Layer 2 is much smaller than the original: a doc + a pointer + a style lint, instead of a shipped validator + a new directory convention.
- Layer 3 depends on this plan's *pattern doc* existing, and on Layer 1 having *proven* the pattern in a real skill.

## Evidence log

- **2026-05-28T14:08:35-03:00** — plan created as Layer 2 of the rollout
- **2026-05-28T16:16:41-03:00** — redesigned after logic re-audit: dropped the consumer-unreachable `scripts/` validator and the cross-skill `_shared/` link; refocused on an author-facing doc + per-skill inline check + a committed-file style lint
- **2026-05-28T16:24:24-03:00** — moved to ongoing/, `started_at` set
- **2026-05-28T16:31:00-03:00** — implemented all 8 steps; `transform-guard.sh` redesigned regex→curated-list after a dry-run calibration; `bash scripts/ci.sh` green. Implementation-complete, awaiting commit to ship.

## Review

- **Goal met:** yes — author-facing pattern doc (`write-skill/references/data-preservation.md`: 10-point checklist + Templates A/B/C, plain md+bash) + same-skill one-level link from `write-skill/SKILL.md:130` + `skills/AGENTS.md` "Data preservation" subsection + curated-list `scripts/skills/transform-guard.sh` wired into `scripts/ci.sh:138` + `scripts/AGENTS.md` table row. Shipped design avoids both rejected dead ends: no `scripts/tree/preserve.sh` runtime validator, no `productivity/_shared/` dir with cross-skill links — the lint validates committed docks skill files only, the doc lives in `write-skill/references/`. All 8 plan Steps marked `done`; all 8 acceptance criteria evidence-verified against the diff.
- **Regressions:** none — scores held (skills/engineering 212≥140, skills/productivity 173≥96, agents 29≥28); no new top-level skill-sibling dir, so no category-floor miscount. Scope-drift: clean — all 6 `affected_paths` present in `a78e70b`; the cross-layer files (context-tree, multi-tool-bridge, skill-agent-pipeline, skill-maintenance, refactor) are the intended single-commit bundling of Layers 1+3, not drift.
- **CI:** pass — `bash scripts/ci.sh` exit 0, all checks green; `skills/transform-guard passed` in the structural-guards section. `transform-guard.sh` standalone: PASSED, 0 pending / 5 enforced-clean, 80ms (<500ms criterion). Smoke test confirmed: `PENDING` is now empty and the lint passes, proving context-tree (pre-Layer-1 WARN) is hardened post-rollout.
- **Follow-ups:** none
- Filed by: plan-review on 2026-05-28T16:50:45-03:00
