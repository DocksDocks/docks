---
title: Add a legal retirement path for quarantined legacy plans
goal: Give quarantined legacy evidence one documented terminal exit that archives the file without rewriting its record or relabelling its classification, so abandoned goals leave active without laundering.
status: finished
created: "2026-07-28T04:05:00-03:00"
updated: "2026-07-28T11:01:19-03:00"
started_at: "2026-07-28T10:04:26-03:00"
finished_at: "2026-07-28T11:01:19-03:00"
blocked_since: null
blocked_reason: null
assignee: null
tags: [plans, plan-manager, legacy, quarantine, lifecycle]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-workspace/SKILL.md
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - scripts/tests/plan-orchestration/legacy-quarantine.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans: []
---

# Add a legal retirement path for quarantined legacy plans

## Goal

A quarantined legacy plan whose goal will not be pursued gets exactly one legal
way out of `docs/plans/active/`: archive the file, unchanged, with a retirement
note. Its frontmatter status is not touched, its records are not stripped, and
its classification is identical before and after. Today there is no such exit,
so abandoned legacy goals accumulate in `active/` forever.

## Context & rationale

**The gap is real and the rule is explicit.** `docs/plans/AGENTS.md:414-415`
says of quarantined evidence: "render it, but never dispatch, resume, abandon,
repair, consume, or rewrite it." Four plans in `active/` are quarantined with no
path forward:

| Plan | Quarantine reason |
|---|---|
| `plan-review-controller-failure-recovery.md` | `schema-6 receipt requires settled orchestration state` |
| `plan-workflow-phases-and-loop-escape.md` | `unsettled legacy receipt family` |
| `session-relay-correlated-messaging-and-worker-results.md` | `unsettled legacy receipt family` |
| `session-relay-linux-workspace-publication.md` | `schema-6 receipt settled orchestration mismatch` |

"Abandon" is exactly what retiring one would be, so the contract forbids the
only action that would clear them. That is the gap this plan closes: not by
weakening the prohibition on rewriting evidence, but by defining one narrow,
non-destructive exit the prohibition currently sweeps up with the destructive
ones.

**The obvious shortcut is a laundering bug, measured.** Setting
`status: finished` and moving the file looks equivalent and is not.
`plan-run.mjs:2231` classifies an unsettled family as quarantined *only when*
`frontmatter.status !== 'finished'`, so flipping the status falls through to
`:2234-2235` and relabels the record `settled-terminal :: complete settled
terminal legacy evidence`. Measured on the four candidates: two of them
(`plan-workflow-phases-and-loop-escape.md` and
`session-relay-correlated-messaging-and-worker-results.md`) silently change
classification under that flip, and `settled-terminal` is migration-eligible at
`:2246`. So the shortcut both asserts a falsehood and unlocks migration for
records that never settled. The retirement path must therefore leave status
alone, and a test must pin that.

**Precedent already exists for the file move itself.** `finished/` currently
holds 88 plans, of which 25 classify `legacy-quarantined` and 15 carry
`status: blocked` rather than `finished`. So an archived file whose status is
not `finished` is an established shape, not a novelty; what is missing is a
documented rule saying when a *quarantined* one may join them. Every archived
filename is date-prefixed (88 of 88), so the move must rename to
`YYYY-MM-DD-<slug>.md`.

**Three coupled copies of the rule, and both skills are content-hashed.** The
sentence lives in `docs/plans/AGENTS.md`, in the
`plan-workspace/references/plans-agents-md-template.md` that file is generated
from, and in `plan-manager/SKILL.md`. Editing only the generated file lets a
later workspace refresh regenerate the amendment away — that is finding F3 of
the accepted-planrun-proof-contract plan, already paid for once. Editing either
`SKILL.md` changes its own `content_hash`, which `scripts/ci.mjs:581` enforces
via `scripts/skills/content-hash.mjs --check-only`, so both hashes must be
refreshed in the same change. All six paths are declared above because
`affected_paths` freezes at start.

**Design decision, with the alternatives recorded.** Three shapes were
considered:

- **(a) chosen — a documented retirement move.** Quarantined evidence may be
  archived unchanged: the file moves to `finished/` under a date-prefixed name,
  frontmatter status and all record lines are untouched, and a `## Retirement`
  section states who retired it and why. No validator changes; the rule is
  prose plus tests. Smallest blast radius, and it cannot launder because it
  changes no byte that classification reads.
- **(b) rejected — a new `retired` status.** Adding to `PLAN_STATUSES` touches
  `LIFECYCLE_TRANSITIONS`, `validateTuple`, and every status-tuple test, and
  would need a transition into it from `blocked`. Large change for no gain over
  (a), and it would make retirement a *record* mutation, which is precisely
  what `:414` forbids.
- **(c) rejected — a `Legacy-retirement` record kind.** Appending a record to a
  quarantined family is a rewrite of that family and would change its
  classification. Directly contradicts the rule it is meant to extend.

## Environment & how-to-run

Repository `/home/vagrant/projects/docks` at `4d6d854`, branch `main`. Node 24
via `corepack enable && pnpm install --frozen-lockfile`. Node-only; no cargo, no
network, no credential, and no release action is required or authorized.

Focused suites: `node scripts/tests/plan-orchestration.mjs` (currently exit 0 at
`plan-orchestration: 103/103 passed`) and `node scripts/tests/plan-skill-phases.mjs`.
Authoritative gate: `node scripts/ci.mjs --plugin docks`.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Amend the rule in all three coupled copies identically: keep "never dispatch, resume, abandon, repair, consume, or rewrite it" and add the single exception — a quarantined plan MAY be retired by moving the file unchanged to `docs/plans/finished/<YYYY-MM-DD>-<slug>.md` and appending a `## Retirement` section, provided frontmatter status, every record line, and the classification are byte-identical before and after. State explicitly that flipping status to `finished` is prohibited because it relabels an unsettled family as settled | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `plugins/docks/skills/productivity/plan-manager/SKILL.md` | — | `local` | `planned` | The identical sentence is present in all three files. If the three copies cannot be phrased identically, STOP rather than letting them drift |
| 2 | Refresh both skill content hashes touched by step 1 | `plugins/docks/skills/productivity/plan-manager/SKILL.md`, `plugins/docks/skills/productivity/plan-workspace/SKILL.md` | 1 | `local` | `planned` | A4 passes. `scripts/skills/content-hash.mjs --check-only` reports both skills in sync |
| 3 | Pin the laundering hazard executably: add a focused case asserting that a quarantined plan whose only change is `status: finished` reclassifies from `legacy-quarantined` to `settled-terminal`, and that a retirement move that leaves status alone does not change classification at all. Build both from the existing legacy fixtures, not from on-disk plans | `scripts/tests/plan-orchestration/legacy-quarantine.mjs` | 1 | `local` | `planned` | A1 reports `plan-orchestration: 105/105 passed` and A5 fails while the retention assertion is mutated |
| 4 | Assert the rule text itself in all three copies, matching the existing coupled-copy pattern so a later regeneration cannot drop it | `scripts/tests/plan-skill-phases.mjs` | 1 | `local` | `planned` | A2 passes, and A6 fails once per file when each copy's sentence is broken |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cd /home/vagrant/projects/docks && set -o pipefail && node scripts/tests/plan-orchestration.mjs 2>&1 \| tail -1` | Exit 0 and `plan-orchestration: 105/105 passed` — the pre-change 103 plus the two cases from step 3 |
| A2 | `cd /home/vagrant/projects/docks && set -o pipefail && node scripts/tests/plan-skill-phases.mjs 2>&1 \| tail -3` | Exit 0 |
| A3 | `cd /home/vagrant/projects/docks && node --input-type=module -e 'import fs from "node:fs"; const f=["docs/plans/AGENTS.md","plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md","plugins/docks/skills/productivity/plan-manager/SKILL.md"]; for (const p of f) { const t=fs.readFileSync(p,"utf8").replace(/\s+/g," "); if(!t.includes("may be retired by moving the file unchanged")) throw new Error("missing in "+p); } console.log("all three copies carry the exception");'` | `all three copies carry the exception` — the amendment is in the generated file, its template, and the skill body |
| A4 | `cd /home/vagrant/projects/docks && set -o pipefail && node scripts/ci.mjs --plugin docks 2>&1 \| tail -3` | Exit 0 and `All ci.mjs checks passed — plugin 'docks'` |
| A5 | Invert the step-3 retention assertion so it demands classification CHANGE under a status-preserving move, run A1, restore | Mutated run exits non-zero naming the retention case; restored file byte-identical and A1 back to exit 0 |
| A6 | Break the added sentence in each of the three copies in turn, run A2, restore each | Each mutation exits non-zero naming the file it broke; each restore byte-identical. All three halves required — an assertion reading only the generated file lets the template drift and be regenerated away |

## Out of scope / do-NOT-touch

- Retiring any actual plan. This change defines the path; using it is a separate
  explicitly requested act per plan.
- `docs/plans/finished/**` — immutable history.
- `migrateLegacyPlan` and `classifyLegacyPlan` behaviour. Retirement is a file
  move plus a prose rule; no classification logic changes, and step 3 exists to
  prove that.
- `PLAN_STATUSES`, `LIFECYCLE_TRANSITIONS`, `validateTuple` — design (b) was
  considered and rejected.
- Release, publication, tagging, and version bumps.

## STOP conditions

- Any measurement in Context fails to reproduce, in particular the two records
  that reclassify under a `status: finished` flip. If the laundering hazard does
  not reproduce, the rationale for the status-preserving constraint is wrong and
  the design must be re-derived.
- The three copies of the rule cannot be phrased identically, or an assertion can
  only reach the generated file.
- Any acceptance row passes while its mutation also passes, i.e. a row that
  cannot fail.
- The amendment would permit any change to a quarantined plan's record lines,
  frontmatter status, or classification.
- Any acceptance command fails twice with the same signature and no relevant byte
  progress between attempts.

## Open questions

None. The design decision is recorded in Context with both rejected
alternatives and the measured reason for the status-preserving constraint.

## Review

Pending.

Plan-run: {"acceptance":{"source_sha256":"cc078f9af93c7312bbdb4e67f0d4fd1c1ed1f8a66b54ae275236be78a4ee1a0d","verification_sha256":"c65a2b77b9e460be62dfd89d5c0b8c4a80c9c72b4ec7f76c194da1af98ff7977"},"blocker":null,"completion_review":{"input_sha256":"4b9e063323f5abe89e25903686fd5d03df66e768edc5980b2ddabb17b763386e","invocations":2,"result_sha256":"faaf429b9fe9d6c761305cb69bd601244c6c9c72fc2669ade61718c19d0e5704","state":"passed"},"draft_review":{"input_sha256":"899663549d3465d9ec3a1cfea9c9b40786dc349374c7e802fd25856adcd58409","invocations":1,"result_sha256":"4be0fe8bad8286e95e96e2702c0de941e486d0ba3ca12ee2a5689366f5ee713f","state":"passed"},"execution_parent":"0ee63477122df83d6e928415cd2f52849e197d14","goal_id":"0f1b065f-3fad-4722-8355-6d5574f1eb18","implementation_commit":"754d7a32bfe7e0ac4e381744e0196d58da4b2813","plan_path":"docs/plans/active/legacy-retirement-path.md","plan_sha256":"3934b8dc29b6c08dc36678a9d480c90af74c9cbfe1ec31ad6dcbc6e773f81957","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"7868ec5a-41c5-4124-ba1b-48aa6dc261bc","schema":1,"source_base":"4d6d854cc305d4a789d4ad44bc7d76793c7a9ee0","source_sha256":"2c85b162b9e21331da9c60fd8c4e4008ede330fb4275e55c8ee7a6012f1f7378"}

## Verification Results

| ID | Command | Observed |
|---|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs 2>&1 \| tail -1` | Exit 0 — `plan-orchestration: 105/105 passed`, the pre-change 103 plus the two cases from step 3 |
| A2 | `node scripts/tests/plan-skill-phases.mjs 2>&1 \| tail -3` | Exit 0 — `three-skill, one-wrapper bounded plan workflows passed`. Also exit 0 under CI's own `--case bounded-workflows` invocation: `parseArgs` discards its result, so the new coupled-copy assertion runs under both forms and is genuinely live in CI rather than reachable only by a bare run |
| A3 | Read-only whitespace-normalised probe of the three coupled copies | `all three copies carry the exception`. The sentence is wrapped at each file's native width, so identity was additionally verified by normalised comparison of the whole sentence, not only the probe substring |
| A4 | `node scripts/ci.mjs --plugin docks 2>&1 \| tail -3` | Exit 0 — `All ci.mjs checks passed — plugin 'docks'; safe to release`. The full `node scripts/ci.mjs` gate was also run and exited 0 (`3 plugin(s) + repo-wide`), because `--plugin docks` skips the repo-wide section that runs `durable-anchors`, whose scope covers two of the files amended here. Both gates were re-run after the repair |
| A5 | Retention assertion inverted (`deepEqual` → `notDeepEqual`), A1 re-run, file restored | Mutated run exit 1 naming `legacy-quarantine: retirement retains quarantined classification and reason` and its message `retirement retention case`; restored file byte-identical to the pre-mutation digest and A1 back to `105/105` exit 0 |
| A6 | Three mutation kinds × the three coupled copies, nine runs, A2 after each, each restored | All nine exit 1 and named the file they broke; every restore byte-identical to its pre-mutation digest; A2 exit 0 after all nine. The kinds are: corrupt the permission, widen the exception past `whose goal is abandoned`, and narrow the invariant's subject list to `Frontmatter status`. All three copies are required — an assertion reading only the generated `docs/plans/AGENTS.md` would let the template drift and be regenerated away |

Completion review invocation 1 returned `repair` with two findings; both are fixed
in the replacement checkpoint, and F1's defect was reproduced before being fixed
rather than accepted on assertion. F1: the coupled-copy assertion bound the
exception's mechanics but neither the `whose goal is abandoned` precondition nor
the invariant's subject list, so two mutations stayed green — widening the
exception to every quarantined plan, and narrowing byte-identity to frontmatter
status alone, the latter reopening exactly the laundering vector this rule closes.
Both spans are now bound (seven clauses per copy) and both mutations are permanent
A6 cases, so the gap cannot silently return. F2: the 24-line bootstrap fixture was
duplicated across the two new cases, leaving undefended the coupling that makes
them meaningful as a pair — retirement is the safe alternative to the status flip
it is set against. It is now one hoisted helper.

STOP condition 1 was re-verified rather than assumed: flipping `status: finished`
on the four quarantined actives still launders exactly two, the two named in
Context, and the precedent census still reproduces exactly — 88 finished plans,
25 classifying `legacy-quarantined`, 15 carrying `status: blocked`, and 88 of 88
date-prefixed.

One constraint the plan did not anticipate: `plan-manager/SKILL.md` sat at exactly
310 of the 310-line body budget asserted by `plan-skill-phases.mjs`. The amendment
was absorbed by tightening the quarantine section and merging two `Exact ...`
final-check bullets, so the body is still 310 and the asserted cap was not
loosened to pass. That leaves the contract with zero headroom for the next
amendment, which is follow-up work and not fixable inside this run. No plan was
retired: using the path is a separate requested act.
