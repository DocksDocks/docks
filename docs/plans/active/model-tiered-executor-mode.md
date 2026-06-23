---
title: Optional Claude-only dispatched-executor mode for refactor
goal: Add an opt-in mode where refactor dispatches a cheaper executor in an isolated worktree and reviews its diff like a tech lead, default staying single-context
status: in_review
created: "2026-06-23T17:36:31-03:00"
updated: "2026-06-23T18:15:59-03:00"
started_at: "2026-06-23T18:10:51-03:00"
in_review_since: "2026-06-23T18:12:45-03:00"
planned_at_commit: f257b5c
assignee: null
tags: [engineering, refactor, claude-only, improve-graft]
affected_paths:
  - plugins/docks/skills/engineering/refactor/SKILL.md
  - plugins/docks/skills/engineering/refactor/references/executor-dispatch.md
related_plans: [plans-lifecycle-auto-review, improve-audit-grafts]
review_status: passed
---

# Optional Claude-only dispatched-executor mode for refactor

## Goal

improve's most differentiated capability — the one no docks skill has — is the
model-tiered split: an expensive model plans, then a *cheaper* model executes in
an isolated git worktree, and the orchestrator reviews that untrusted diff like a
tech lead (`APPROVE`/`REVISE` with a max-2-round cap/`BLOCK`). `refactor` and
`fix-workflow` today implement in the SAME context; `plan-review` only verifies
an already-committed `ship_commit`. Add this as an **opt-in, explicitly
Claude-only** mode on `refactor`, with the portable single-context path
(`refactor` Phases 7–8) staying the default.

Success = an approved refactor plan can OPTIONALLY be executed by a dispatched
sonnet/haiku executor in a worktree and tech-lead-reviewed, the default behavior
is unchanged, and `node scripts/ci.mjs` is green (including `refs-guard` on the
new reference).

## Context

- This is disposition D-3 from `[[shadcn-improve-evaluation]]`, promoted from
  "worthIt:false" after the under-adoption red-team showed docks already ships
  Claude-only dispatch (the `agents/` wrappers; `plan-manager/SKILL.md:60-64`
  dispatches `Agent(subagent_type=<assignee>)`). Caveat (from self-review): that
  precedent is *named-assignee* dispatch — a weaker shape than a cheaper-executor
  worktree run. It establishes that docks ACCEPTS a Claude-only lane, not that
  this exact mechanism is precedented; the mode must justify itself on merit, not
  lean on the precedent.
- **Hard tension to reconcile:** `refactor/SKILL.md:15-17` (constraint 1) says
  "no subagent dispatch — runtime-specific and not portable", and
  `plugins/docks/skills/AGENTS.md` item 5 flags `isolation: worktree` as
  Claude-only. The mode therefore must be (a) clearly OPT-IN, (b) clearly
  Claude-only, (c) never the default, with the existing single-context path
  preserved verbatim as the default.
- Pattern adapted from improve's `references/closing-the-loop.md`, authored
  docks-native (no improve-isms, no `plans/` directory — verdicts feed back
  through `docs/plans/` and `affected_paths` scope checks).
- **Executor model default (resolved via picker):** `sonnet` — capable for most
  refactors, cheaper than the opus orchestrator; the user can override per run
  ("execute haiku").

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | **Write `references/executor-dispatch.md`** (new, Claude-only mode): preconditions (git repo; plan approved via `start <slug>`; run the drift check first); dispatch ONE `general-purpose` subagent with `isolation: "worktree"`, executor model default `sonnet` (or user-named, e.g. "execute haiku"), inlining the full approved plan + an executor preamble + a fixed report format; review like a tech lead — re-run each done-criterion IN the worktree, scope-stat check (`git -C <worktree> diff --name-only` ⊆ `affected_paths`), read the full diff against the plan's intent, audit new tests for gaming; verdict table APPROVE / REVISE (`SendMessage` same executor, **max 2 rounds** then BLOCK) / BLOCK. End: merging is the user's call — never merge/push/commit to their branch. Add a `## Contents` TOC if the file exceeds 100 lines (refs-guard). | — | done |
| 2 | **refactor/SKILL.md — carve out the mode:** reword constraint 1 (`:15-17`) so the default stays "single-agent sequential, in THIS context", and add: "an OPTIONAL Claude-only dispatched-executor mode is documented in `references/executor-dispatch.md` — it is opt-in, never the default, and degrades to the single-context path off-Claude." Add a row to the References table (`:108-118`) and a one-line pointer after the Phase 6 gate (`:76-85`): after approval, the user may either run Phases 7–8 in-context (default) OR opt into the dispatched-executor mode. | 1 | done |
| 3 | **Sync + validate:** bump `metadata.updated` on `refactor`; `node scripts/skills/content-hash.mjs --backfill` (the new reference is inside the hash surface); run `node scripts/ci.mjs` until green — in particular `refs-guard` (new reference linked from SKILL.md, one level deep, TOC if >100 lines) and the engineering score floor. | 1,2 | done |

## Acceptance criteria

- [x] `plugins/docks/skills/engineering/refactor/references/executor-dispatch.md` exists, is linked from `refactor/SKILL.md`, and contains the dispatch (`isolation: "worktree"`, default `sonnet`) + the APPROVE/REVISE-max-2/BLOCK verdict table.
- [x] `grep -ni 'optional\|claude-only\|default' plugins/docks/skills/engineering/refactor/SKILL.md` → constraint 1 now marks the mode opt-in/Claude-only with single-context as the default.
- [x] The default path is unchanged: Phases 7–8 single-context implementation reads exactly as before (diff shows only additive carve-out wording, no removal of the single-context steps).
- [x] `node scripts/ci.mjs` exits 0 — `refs-guard` passes the new reference (resolves, one level deep, has a `## Contents` TOC if >100 lines), content-hash idempotent, score floor met.
- [x] **Codex-prose check (post-write gate):** re-read the reworded constraint 1 as a plain-markdown reader (no `<constraint>` weighting) — it must still read "default is single-context; the dispatch mode is optional and Claude-only". If it reads as "subagent dispatch is fine", revert and re-word.
- [ ] **Manual smoke (Claude-only, not CI):** on a throwaway approved 1-step refactor plan, opting into the mode dispatches an executor in a worktree, the orchestrator renders a verdict, and NOTHING is merged/pushed to the user's branch. The capability is Claude-only and can't be asserted by `ci.mjs` — verify by hand once.

## Out of scope

- Adding the mode to `fix-workflow` — `refactor` is the single best home for a first cut; generalize later if it proves out.
- Touching `plan-review` — its tech-lead muscle is the closest analog but it's owned by `plans-lifecycle-auto-review`; keep files disjoint.
- Making dispatch the default, or any cross-tool/Codex executor path — explicitly Claude-only and opt-in.

## STOP conditions

- If the new reference can't satisfy `refs-guard` (TOC) and the engineering body cap together without splitting, STOP and report — don't inflate `refactor/SKILL.md` past its sweet spot to compensate.
- If rewording constraint 1 would read as "subagent dispatch is fine" in plain prose (Codex reads bodies as plain markdown, not weighting `<constraint>`), STOP — the default-is-single-context guarantee must survive as prose, not lean on the tag.

## Self-review

`Score: 81/100 · stopped: single critique pass (dispatched plan-review Mode 0)`

A dispatched `plan-review` Mode 0 verified all 6 cited `file:line` refs accurate and confirmed two non-holes (refs-guard's TOC gate is `>100 lines AND ≥3 headings` — the plan's conditional is correct; `content-hash --backfill` covers the new reference). Fixes ingested: softened the precedent framing (named-assignee dispatch is weaker than a worktree executor — the mode justifies on merit); added a Claude-only manual smoke criterion (the capability can't be asserted by `ci.mjs`) and a post-write Codex-plain-prose gate. Surfaced the executor-model default as an open question; the one-general-purpose-subagent dispatch shape and the max-2-round cap are kept as defaults per improve's `closing-the-loop`.

## Sources

- `plugins/docks/skills/engineering/refactor/SKILL.md:15-17` — constraint 1 "no subagent dispatch — runtime-specific and not portable" (the tension to reconcile); `:76-85` — the Phase 6 approval gate (where the opt-in pointer lands); `:87-101` — Phases 7–8 single-context implementation (the preserved default); `:108-118` — References table.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:60-64` — Step 4 named-assignee `Agent(subagent_type=<assignee>)` dispatch (the Claude-only-lane precedent, weaker than a worktree executor).
- `plugins/docks/skills/AGENTS.md` item 5 — `isolation: worktree` is Claude-only; item 4 — Codex reads bodies as plain markdown (the prose-must-stand caveat).
- shadcn/improve `references/closing-the-loop.md` (scratchpad copy) — the dispatch + tech-lead-review + APPROVE/REVISE-max-2/BLOCK pattern being adapted docks-native.

## Review

`Goal met: yes · review_status: passed · completion review (in_review), diff base f257b5c..6920502 · Filed by: plan-review (dispatched, 9 tool-uses)`

Independent completion review verified the carve-out is additive and the prose holds under a Codex reading.

- **Criteria 1–5 PASS.** New reference exists, linked from refactor/SKILL.md:121 (refs-guard one-level-deep), contains the worktree dispatch (`isolation: "worktree"`, default `sonnet`) + APPROVE/REVISE-max-2/BLOCK verdict table; constraint 1 marks the mode opt-in/Claude-only with single-context as the default; the diff is +7/−4, purely additive — the Phases 7–8 single-context steps are intact (no removal); scope ⊆ `affected_paths`.
- **Codex-prose adversarial check (the key gate) PASS.** A plain-markdown read (zero weight on `<constraint>` tags) of intro line 13 + constraint 1 confirms the polarity is carried by ordinary prose — "by default", "only", "never", "ONE optional exception", "opt-in, never the default", "fall back" — so a Codex reader cannot come away thinking dispatch is the norm. The STOP condition is satisfied.

Criterion 6 (manual Claude-only smoke) — **NOT run, non-blocking.** A one-time by-hand dispatch-in-a-worktree run that `ci.mjs` cannot assert; the mode is documentation-only and structurally validated, but the end-to-end hand-run was not performed. Perform it once before relying on the mode in anger.

Regressions: none. CI: pass. Follow-ups: the one-time manual smoke above.
