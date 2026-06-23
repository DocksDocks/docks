---
title: Auto-review a plan when its steps complete, before ship
goal: Add an in_review status so plan-review fires automatically on step completion (pre-ship), plus drift-check base SHA and handoff-template hardening
status: ongoing
created: "2026-06-23T17:36:31-03:00"
updated: "2026-06-23T17:58:19-03:00"
started_at: "2026-06-23T17:58:19-03:00"
assignee: null
tags: [plans, lifecycle, review, improve-graft]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
related_plans: [improve-audit-grafts, model-tiered-executor-mode]
review_status: null
---

# Auto-review a plan when its steps complete, before ship

## Goal

Today review only happens *after* ship: `plan-manager` Step 8 auto-dispatches
`plan-review` on the `→ finished` move, and `plan-review` diffs the `ship_commit`
(`plan-manager/SKILL.md:111-113`, `plan-review/SKILL.md:95-101`). So you must
archive a plan to `finished/` to get it reviewed. This plan inverts that: when
every `## Steps` row reaches `done`, the plan auto-transitions to a new
`in_review` status and `plan-review` runs a **completion review** against the
work-so-far diff — *before* the `finished/` move. Ship becomes a deliberate,
already-reviewed step.

Success = a plan whose last step is marked `done` gets a filled `## Review`
block and a `review_status` *without anyone asking for it and without shipping*,
and `node scripts/ci.mjs` stays green. Folds in four cheap improve-skill grafts
that touch the same contract files (drift-check base SHA, STOP-conditions
section, per-file out-of-scope, weakest-executor framing) plus `--issues`
publishing, so the lifecycle contract changes land in one coherent commit.

## Context

User decisions (verbatim, from the planning conversation — do not re-litigate):

- **Review-gate model: a NEW `in_review` status** (6th value). When the last
  step is marked `done`, `plan-manager` auto-transitions `ongoing → in_review`
  and auto-dispatches the completion review (diffs `planned_at_commit..HEAD`).
  Chosen over a statusless `review_status: pending` flag because "work done,
  awaiting review" should be a visible state in `ls active/` and the listings.
- **After a clean review: surface "ready to ship", user confirms.** The review
  fires automatically (solves the pain), but the move to `finished/` stays an
  explicit `ship <slug>` step — the user keeps archive authority. Auto-ship is
  an opt-in, not the default.
- The completion review **replaces** the post-ship review: ship no longer
  auto-dispatches `plan-review`; the `## Review` written at `in_review` carries
  forward. Re-run the completion review at ship only if `HEAD` moved since it
  was filed (reuse the drift check).
- **Two-home contract sync is mandatory** (`plugins/docks/skills/AGENTS.md`,
  "Plan-skill contract sync"): every contract change here lands in BOTH the
  repo's own `docs/plans/AGENTS.md` AND `plan-init`'s shipped template
  (`plans-agents-md-template.md`) in the same commit.
- **Age-token anchor (resolved in self-review):** `in_review` uses a dedicated
  `in_review_since` field, not `updated`. Every entry-anchored status already
  has its own field (`started_at`, `blocked_since`, `scheduled_date`), and the
  completion review bumps `updated` when it writes `## Review` — reusing it
  would reset the "in review" age to ~0 on the review write.
- **Open-questions surfacing is enforced (Step 8), from direct user feedback:**
  agents (including the one that authored these plans) repeatedly list open
  questions as prose instead of surfacing them via the picker. The convention
  already prefers the picker; Step 8 promotes it to a non-negotiable constraint
  that fires on every render carrying unresolved `## Open questions`.
- **`auto_execute` + review gate (resolved via picker):** a `scheduled` plan with
  `auto_execute: true` still HALTS at `in_review` for a human `ship` — the gate
  applies to scheduled work too; auto-ship stays opt-out.
- **Migration of pre-existing `active/` plans (resolved via picker):** an old plan
  with no `planned_at_commit` that reaches `in_review` is BACKFILLED on that first
  transition — its `created`-era commit if recoverable, else a working-tree-only
  review noting "drift base unset". No re-scaffold required.

Origin: this is the "review automation" ask plus the lifecycle/handoff grafts
(P1 drift-check, P2 STOP-conditions / out-of-scope / weakest-executor framing /
`--issues`) from the shadcn/improve evaluation. See `[[shadcn-improve-evaluation]]`.

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | **Frontmatter schema (both homes):** add `in_review` to the `status` enum (`docs/plans/AGENTS.md:58`, template `:59`); add a `planned_at_commit` key (full SHA, set at scaffold via `git rev-parse HEAD`) to the base frontmatter; add a status-specific `in_review_since` key (ISO datetime, set ONCE on `→ in_review`) to the status-specific-keys table — so the age token has a dedicated anchor, not `updated` (which the review bumps). Each gets a one-line description. | — | planned |
| 2 | **Body spine (both homes):** add an optional `## STOP conditions` row to the body table (named plan-specific escape hatches: "if assumption X is false, STOP and report — do not improvise"); tighten the `## Out of scope` row description to "per-file do-NOT-touch list, each with a one-line blast-radius rationale"; reword the cold-handoff test (`AGENTS.md:137`, template `:123`) from "a fresh agent" to "the weakest plausible executor (assume a smaller/cheaper model — weak at filling gaps)". | — | planned |
| 3 | **Age token + pretty-print (both homes + plan-manager Step 3):** add an `in_review` row to the age-token table → `<X> in review` sourced from the dedicated `in_review_since` field (NOT `updated` — the completion review bumps `updated` when it writes `## Review`, which would reset the token to ~0); the listings-render confirmation is verifiable once the `→ in_review` transition exists (Step 4). | 1, 4 | planned |
| 4 | **plan-manager transitions:** (a) add a `→ in_review` transition to Step 5 + the transition table, fired automatically when all `## Steps` rows are `done`; (b) add an intent row ("all steps done" / "complete `<slug>`") to Step 1; (c) set `planned_at_commit` at scaffold (Step 6, from `git rev-parse HEAD`); (d) instruct the executor/assignee on dispatch (Step 4) to run the drift check first (`git diff --stat <planned_at_commit>..HEAD -- <affected_paths>`; on mismatch, STOP); (e) an `auto_execute` scheduled plan also HALTS at `in_review` (no auto-ship); an old plan lacking `planned_at_commit` is BACKFILLED on this first `→ in_review` (created-era commit if recoverable, else working-tree-only review noting "drift base unset"). | 1, 3 | planned |
| 5 | **plan-review completion mode:** promote the "two modes, keyed on status" constraint (`:15-17`) to THREE — add `status: in_review` (file still in `active/`) → **completion review**: same Steps 4–9 machinery but diff base is `planned_at_commit..HEAD` (+ uncommitted working tree) instead of `git show <ship_commit>` (Step 3, `:95-101`); write `## Review` + set `review_status`; end by surfacing "✓ reviewed — say `ship <slug>` to archive". | 1, 4 | planned |
| 6 | **plan-manager ship rewire:** ship is allowed only when `review_status == passed`. On `partial`/`regressed`: block ship, surface the findings, route back to `ongoing` to fix. If `review_status` is `null` at ship time (auto-dispatch silently no-op'd), FALL BACK to dispatching the completion review inline — never hard-deadlock ship. On `passed`: `git mv → finished/`, set `ship_commit: HEAD`, `status: finished`, carry the existing `## Review` forward, and **no longer auto-dispatch plan-review** (Step 8 / transition table `:79` / success criteria `:148` / common traps). Re-run the completion review before ship only if `HEAD ≠` the commit the review was filed against (drift). | 5 | planned |
| 7 | **plan-manager `--issues` publishing:** add an op + intent to publish a plan as a GitHub issue (`gh issue create --title <title> --body-file <plan>`), gated by a visibility check (`gh repo view --json visibility` → if public, warn and require explicit confirmation before publishing any plan naming a vulnerability/credential location); record the issue URL in `## Notes`. Skip cleanly if `gh` is unauthenticated or there's no remote. | — | planned |
| 8 | **Enforce open-questions surfacing (recurring-miss fix):** add a `<constraint>` to `plan-manager` (near the top, so it survives compaction) + a line in the AGENTS.md "Open questions" section and the template: whenever a plan carrying UNRESOLVED `## Open questions` is presented or rendered (Tier-3, after any write/transition), the agent MUST surface them through the native picker (`AskUserQuestion` / `ask_user_question`) in the SAME turn — never leave them as prose for the user to answer in free text. Agents (including the one that wrote this plan) repeatedly skip this; make it non-negotiable. | — | planned |
| 9 | **Contract-sync + validation:** confirm the repo's `docs/plans/AGENTS.md` and the shipped template now match; bump `metadata.updated` on plan-manager + plan-review + plan-init; `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs` style + `node scripts/skills/content-hash.mjs --backfill`; run `node scripts/ci.mjs` until green. | 1,2,3,4,5,6,7,8 | planned |

## Acceptance criteria

- [ ] `grep -n 'in_review' docs/plans/AGENTS.md plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` → the status enum row AND the age-token row are present in BOTH files.
- [ ] `grep -n 'planned_at_commit' docs/plans/AGENTS.md plugins/docks/skills/productivity/plan-manager/SKILL.md plugins/docks/skills/productivity/plan-review/SKILL.md` → set at scaffold (plan-manager), used as the drift base (both), used as the completion-review diff base (plan-review).
- [ ] `plan-review/SKILL.md` has a third mode keyed on `status: in_review` that diffs `planned_at_commit..HEAD` and writes `## Review` while the file is still in `active/` (grep + read).
- [ ] `plan-manager/SKILL.md` Step 8 no longer auto-dispatches `plan-review` on `→ finished`; the auto-dispatch now fires on `→ in_review` (read the rewired sections).
- [ ] Ship is gated on `review_status == passed` specifically (not merely "set"): a plan with `review_status: regressed` cannot be `git mv`'d to `finished/` — read the rewired ship transition and confirm it names `passed`.
- [ ] `node scripts/ci.mjs` exits 0 (skills structural + score floors + content-hash idempotency + trigger-collision + refs-guard all green).
- [ ] **End-to-end trace:** scaffold a throwaway smoke plan, mark its single step `done` → it auto-moves to `in_review` and gets a filled `## Review` + `review_status` with NO `git mv` and NO `ship` invoked. (Delete the smoke plan after.)
- [ ] `grep -ni 'open question' plugins/docks/skills/productivity/plan-manager/SKILL.md docs/plans/AGENTS.md plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` → a constraint/rule in all three requires unresolved `## Open questions` to be surfaced via the native picker in the same turn they're presented (not just at new-plan scaffold).

## Out of scope

- `model-tiered-executor-mode` (D-3, separate plan) — that dispatches a cheaper executor; this plan only changes WHEN review fires, not WHO executes.
- The `security`/`code-review` prompt-injection + audit grafts (`improve-audit-grafts`, separate plan) — disjoint files, no overlap with the lifecycle contract.
- Auto-ship-on-pass — explicitly deferred per the user decision (opt-in only; not built here).
- Retroactively reviewing already-`finished/` plans.

## STOP conditions

- If adding `in_review` makes `node scripts/ci.mjs` fail a check that has **no upstream exemption** (e.g. a plans-schema validator I haven't seen), STOP and report which check + the literal failing line — do not loosen the floor.
- If the completion-review diff base `planned_at_commit..HEAD` turns out to be empty for a legitimately-complete plan (e.g. work landed before `planned_at_commit` was recorded on a pre-existing plan), STOP — the migration story for plans created before this field exists is an open question (see below), not something to paper over.

## Self-review

`Score: 81/100 · trajectory 81→90 (holes below fixed in this draft) · stopped: single critique pass (dispatched plan-review Mode 0)`

A dispatched `plan-review` Mode 0 red-team verified all 13 cited `file:line` refs accurate against source, and caught (now fixed): the ship gate must check `review_status == passed`, not merely "set" — plus a `null → dispatch inline` fallback so ship never deadlocks; the `in_review` age token needs a dedicated `in_review_since` anchor rather than `updated`; Step 3's listings-render confirmation depends on Step 4's transition. Surfaced the `auto_execute`-vs-gate interaction as an open question. Strongest aspect: full two-home contract-sync coverage.

## Sources

- `docs/plans/AGENTS.md:58` — status enum `planned | ongoing | blocked | scheduled | finished` (the field gaining `in_review`).
- `docs/plans/AGENTS.md:202-216` — lifecycle transition table; `:215` ship sets `ship_commit` (HEAD) and auto-dispatches plan-review.
- `docs/plans/AGENTS.md:240-255` — status-specific age-token table (gains an `in_review` row).
- `docs/plans/AGENTS.md:88-109` — body spine table (gains `## STOP conditions`; `## Out of scope` tightened) + `:137` cold-handoff test.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:79` — `→ finished` transition; `:111-113` Step 8 auto-trigger plan-review; `:45` ship intent; `:58` age tokens; `:148` success criterion "plan-review auto-fires on every `→ finished`".
- `plugins/docks/skills/productivity/plan-review/SKILL.md:15-17` — "Two modes, keyed on status" constraint (becomes three); `:95-101` Step 3 `git show <ship_commit>` (the diff base the completion mode swaps for `planned_at_commit..HEAD`).
- `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md:59,160-173,194-200` — the shipped template homes for the enum, lifecycle, and age tokens that must mirror every change.
- `plugins/docks/skills/AGENTS.md` ("Plan-skill contract sync") — the two-home rule + `content-hash --backfill` + `ci.mjs` green requirement.

## Review

(filled by plan-review on completion)
