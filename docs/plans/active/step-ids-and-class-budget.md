---
title: Give steps stable identifiers and charge review permits by defect class
goal: Stop spending scarce review permits on mechanically decidable defects, by giving Steps rows a stable identifier a guard can cite, teaching the validator the classes that currently go undetected, and replacing the flat permit count with class-repetition detection.
status: drafting
created: "2026-08-01T22:11:43-03:00"
updated: "2026-08-01T22:11:43-03:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plan-manager, plan-reviewer, review-budget, registered-idea]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs
  - plugins/docks/skills/productivity/plan-reviewer/SKILL.md
  - docs/plans/AGENTS.md
related_plans: []
---

# Give steps stable identifiers and charge review permits by defect class

## Goal

A guard survives a renumbered table, and a review permit buys judgement rather
than arithmetic a validator could have done.

## Context & rationale

This plan exists because a user observation and a measured failure converged.
Both halves are recorded here because the design is theirs, and prose in a chat
window is the least durable medium available.

### The measured failure

Two consecutive runs of the same goal died with `review_failed`, both permits
spent, on defects a program can decide:

- Guards citing a step by its number, which desynced when the table was
  renumbered mid-draft. Nine instances in one plan across two rounds.
- Commands whose documented output shape did not match what the command emits.
  Four instances, found only by enumerating all fifteen guard commands by hand.

The second run's self-check returned **0 findings against 18 rules** on the exact
sealed bytes a reviewer then rejected. The validator was not wrong; it was never
taught these classes.

### Why numbers cannot be made safe

`plan-self-check.mjs` detects a Steps row only when cell 0 matches `/^\d{1,3}$/`
— five sites: `:520`, `:605`, `:817`, `:1028`, `:1042`. Lines `1042` to `1045`
additionally require the ids to be strictly ascending integers. So the schema
cannot express a stable label, and every insertion forces a renumber.

Acceptance rows already solved this. They match `/^[A-Z]\d{1,3}[a-z]?$/` at
`:512` and `:812`, and guards cite them by that id at `:197` and `:967`, where an
unknown id is reported. The convention exists and is enforced; it simply stops at
the Steps table.

Evidence the gap is real and not personal: across 103 plans and 681 step rows,
**47** step-number references sit inside Steps rows in 22 plans, and 748 more in
surrounding prose across 68 plans. Zero self-check rules match a step-number
reference of any form. A fused id such as `3b` is worse than useless — it fails
the cell-0 detector, so the row becomes invisible to every steps rule. The
identifier must therefore be its own column, not a decorated number.

### Why the permit budget must charge by class

The budget is two substantive permits per phase. Under a flat count, a *new*
defect class discovered on round 2 ends the run even when every earlier class was
swept to zero. That is what happened: `PRV1-004` was scope-check completeness, a
class neither prior round raised.

Class-repetition inverts the incentive correctly. A repeated class still blocks,
because repetition means the author did not sweep. A genuinely new class earns a
round, because discovering one is the reviewer working as intended. The rule
cannot loop, because the class set is finite and only grows.

This requires the reviewer to emit a fine-grained class label. The four canonical
criteria in `legacy-review-records.mjs:1696` are too coarse: two of one run's
three findings shared `missing_acceptance` while being genuinely different
defects. The label must come from the reviewer, never from the author, or the
author grades their own homework.

## Environment & how-to-run

Run every command from the repository root of this checkout. Do not write an
absolute machine path into plan text: `plan-skill-phases.mjs --case
bounded-workflows` fails any active plan citing one.

```bash
corepack enable && pnpm install --frozen-lockfile   # Node 24
node scripts/tests/plan-orchestration.mjs
node scripts/ci.mjs                                 # repo-wide: touches the contract
```

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | `id_column` | Add an optional stable-identifier column to the Steps schema, keeping cell 0 numeric so every existing rule and the ascending check still apply | `lifecycle/plan-self-check.mjs` | — | `local` | `planned` | A plan carrying identifiers parses with every existing steps rule still firing, and one without identifiers parses unchanged. Failure: STOP; if cell 0 stops being the number, five detector sites and the ascending rule at `:1042` break at once. |
| 2 | `guard_cites_id` | Let a guard cite a step identifier, and report an unknown one, mirroring the acceptance-row binding at `:197` and `:967` | `lifecycle/plan-self-check.mjs` | `id_column` | `local` | `planned` | A guard citing an undefined identifier is reported; one citing a defined identifier passes. Failure: STOP; a binding that cannot report an unknown id is decorative. |
| 3 | `detect_number_cite` | Add a rule reporting a step-number citation inside a guard cell, so the class that cost two runs is machine-detected | `lifecycle/plan-self-check.mjs` | `id_column` | `local` | `planned` | The rule reports on a guard citing a bare step number and stays silent on one citing an identifier. Non-vacuity: it must report on the reconstructed pre-repair body of the 0.15.0 release plan, which carried nine instances. Failure: STOP; a rule that cannot reproduce a known historical defect is unproven. |
| 4 | `class_label` | Have the reviewer emit a fine-grained class label per finding, and persist it in the run record | `plan-reviewer/scripts/review-policy.mjs`, `plan-reviewer/SKILL.md`, `scripts/plan-run.mjs` | — | `local` | `planned` | A recorded finding carries a class label distinct from the four coarse criteria, and a record missing one is rejected. Failure: STOP; never let the author supply or infer the label, which would make the budget self-graded. |
| 5 | `repeat_budget` | Replace the flat permit count with class-repetition: a repeated class blocks, a new class earns a round | `scripts/plan-run.mjs`, `docs/plans/AGENTS.md` | `class_label` | `local` | `planned` | A second finding of an already-accepted class blocks the run; a finding of an unseen class does not. Non-vacuity: replaying this goal's two runs must still block, because both raised a repeated class. Failure: STOP; if the replay stops blocking, the rule has loosened the contract rather than retargeted it. |
| 6 | `class_sweep` | Require a whole-document sweep of an accepted finding's class before the next dispatch | `docs/plans/AGENTS.md`, `lifecycle/plan-self-check.mjs` | `class_label` | `local` | `planned` | A dispatch is refused while another instance of an accepted class remains in the body. Failure: STOP; a sweep that is advisory reproduces the half-sweep that cost three rounds. |
| 7 | `archive` | Archive this plan | this plan record | `class_sweep` | `local` | `planned` | Plan is `finished` at the dated archive path with a local commit. Failure: leave `ongoing`. |

## Acceptance criteria

| Id | Criterion |
|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs` exits 0. |
| A2 | `node scripts/ci.mjs` exits 0 repo-wide, because this changes the contract, not one plugin. |
| A3 | Every plan under `docs/plans/finished/` remains byte-identical, verified by digest. Identifiers are additive and bind new drafts only. |
| A4 | A guard citing a bare step number is reported; the same guard citing an identifier passes. Non-vacuity: the rule reports on a body reconstructed from this goal's pre-repair state. |
| A5 | Replaying this goal's two recorded runs under the new budget still ends `blocked`, proving the change retargets the budget rather than loosening it. |
| A6 | A finding whose class was already accepted this run is refused a further round; a finding of an unseen class is granted one. |
| A7 | Every code line cited in the Context section still resolves to the construct it describes, verified by re-reading rather than trusting this document. |

Each row is anchored to a command or an observable outcome, never to a step
number, which is the defect this plan exists to remove.

## Out of scope / do-NOT-touch

- Renumbering or relabelling any plan under `docs/plans/finished/`. Historical
  records stay byte-identical; identifiers bind new drafts only.
- The dispatch-path integrity gaps. Separate registered plan.
- Extracting the lifecycle into its own plugin. Separate registered plan.
- The blocked 0.15.0 release run, which neither this plan nor its successor
  repairs.
- Validator floors. Fix the file, never the threshold.

## STOP conditions

1. Any row whose `Effect` column is not `local` is reached.
2. Cell 0 of a Steps row stops being the ascending number. Five detector sites
   and the ascending rule depend on it, so the identifier must be additive.
3. A finished plan's bytes change for any reason.
4. The class label becomes author-supplied or author-inferred at any point.
5. Replaying this goal's two runs under the new budget stops blocking.
6. A rule is added that cannot reproduce a known historical defect from this
   repository's own history.

## Open questions

1. Whether the identifier column is mandatory for new drafts or optional with a
   warning. Optional risks permanent half-adoption; mandatory invalidates
   in-flight drafts. Measure how many active plans would need editing.
2. Whether the class vocabulary is closed and versioned, or free-form text the
   reviewer coins. Closed is comparable but needs migration when a genuinely new
   class appears; free-form compares poorly.
3. Whether a repeated class should block immediately or after a second
   repetition, given that a sweep can legitimately miss an instance in a very
   large body.
4. Whether `Depends` should cite identifiers too, which would make the existing
   526 dependency edges renumber-proof as a side effect.

## Review

Not dispatched. This plan is registered so a user design contribution and two
runs' worth of measured evidence survive the session, and it holds a full review
budget. No permit has been reserved or spent.

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"execution_parent":null,"goal_id":"4f091bda-6643-437e-84d0-8d4ca0118bb7","implementation_commit":null,"plan_path":"docs/plans/active/step-ids-and-class-budget.md","plan_sha256":"053fc95f81c1c52062d3deecd8be95fb6ec55f5e1151c45d319ffa79245817f4","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"b6167972-c6ae-40b6-9738-849e21364b81","schema":1,"source_base":"6e2da01553f80180ad72f1cd8f5bd6f250dc953a","source_sha256":"157892d93e35de3a82221d6d1feadabb102c5ec14803ae9b38e7752bf81940ac"}

## Verification Results

Manager-written after execution. Empty at registration time.
