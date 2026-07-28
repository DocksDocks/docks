---
title: Classify schema-6-declared records carrying the schema-5 policy shape
goal: Reclassify the three plan records whose only defect is drifted reviewer-selection metadata, narrowing legacy classification alone and leaving schema-6 receipt acceptance globally unchanged.
status: finished
created: "2026-07-28T04:10:00-03:00"
updated: "2026-07-28T03:16:23-03:00"
started_at: "2026-07-28T05:47:26-03:00"
finished_at: "2026-07-28T03:16:23-03:00"
assignee: null
tags: [plans, plan-manager, legacy, classification, quarantine]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - scripts/tests/plan-orchestration/fixtures/historical-inventory.json
  - scripts/tests/plan-orchestration/fixtures/historical-records.mjs
  - scripts/tests/plan-orchestration/fixtures/legacy-plans.mjs
  - scripts/tests/plan-orchestration/legacy-quarantine.mjs
related_plans: []
---

# Classify schema-6-declared records carrying the schema-5 policy shape

## Goal

Exactly three plan records stop classifying as `legacy-quarantined` and become
`settled-terminal`. The five receipt-path validators keep their current source
bytes, and every caller outside the new classification scope — the release
binder included — observes identical behaviour.

## Context & rationale

`validateCurrentPolicy` (`legacy-review-records.mjs:1739-1775`) enforces three
extra rules once a policy declares `schema: 6`: `fallback` must be `none`
(`:1763`), there must be exactly one runtime candidate (`:1764-1765`), and
`provenance` must be the `runtime_global` map (`:1767-1773`). Five records on
disk declare schema 6 while carrying the complete schema-5 shape instead. The
drifted policy is byte-identical everywhere it appears — measured on
`2026-07-23-session-relay-linux-workspace-recertification.md`, where it occurs
seven times inside one receipt (`payload.policy`, `payload.request.policy`,
`payload.reviewer.raw.request.policy`,
`payload.reviewer.raw.reviewer_output.request.policy`, and the same three again
under `payload.series.rounds[0]`):

```json
{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6}
```

All three fields diverge together, so narrowing any two changes nothing. Those
fields select **which reviewer model would have been used**. They say nothing
about whether work ran or an effect fired, so quarantining on them is metadata
drift, not evidence of a problem.

**Measured effect.** A prototype of the change below was applied to an
out-of-tree copy of both scripts and every `docs/plans/{active,finished}/*.md`
file (94 of them) was classified before and after. Five records fail today with
`schema-6 current policy fallback must be none`; only **three** change
classification, because two are independently rejected by checks this plan does
not touch:

| Record | Before | After |
|---|---|---|
| `active/session-relay-linux-workspace-release.md` | `legacy-quarantined` | **`settled-terminal`** |
| `finished/2026-07-19-session-relay-prebuilt-cli-release.md` | `legacy-quarantined` | **`settled-terminal`** |
| `finished/2026-07-23-session-relay-linux-workspace-recertification.md` | `legacy-quarantined` | **`settled-terminal`** |
| `active/plan-review-controller-failure-recovery.md` | `legacy-quarantined` | `legacy-quarantined`, reason becomes `schema-6 receipt requires settled orchestration state` |
| `finished/2026-07-22-session-relay-workspace-isolation.md` | `legacy-quarantined` | `legacy-quarantined`, reason becomes `schema-6 policy candidate must equal request author` (its `author.tool` is `omp`, its `candidates[0].tool` is `codex`) |

Totals move `legacy-quarantined` 32 → 29 and `settled-terminal` 10 → 13;
`current` 18 and `record-free` 34 are unchanged. Two records therefore change
their quarantine *reason* without changing classification, and both are named
above. No plan file's bytes are read-modified by classification (measured: zero
mutations across the 94 files).

A sixth file carries a schema-6 policy and is deliberately untouched:
`active/session-relay-linux-workspace-publication.md`. Its policy is the
*conforming* one — one runtime candidate, `fallback: "none"`,
`provenance.candidates: "runtime_global"` — and it stays quarantined for an
unrelated reason (`schema-6 receipt settled orchestration mismatch`). It is the
control that shows the narrowing does not reach conforming evidence.

Of the 32 records quarantined today: 22 fail on a frontmatter/parse error
(`malformed legacy plan: …`), 5 on the policy rule above, 2 on
`unsettled legacy receipt family`, and one each on
`schema-6 receipt settled orchestration mismatch`,
`current waiver is not the exact snapshot`, and
`crossed current and legacy family`. Only the 5 are in scope.

**Mechanism: a dynamically scoped classification context, not a threaded
option.** `legacy-review-records.mjs` gains one export,
`withLegacyClassification(fn)`, which raises a module-scoped depth counter for
the synchronous extent of `fn` and restores it in `finally`.
`validateCurrentPolicy` accepts the drifted shape only while that depth is
non-zero. `plan-run.mjs` wraps its single `validateLegacyRecordFamily` call
(`:2217`) in it.

Threading an explicit option through the receipt validators was prototyped first
and **measured to reclassify nothing**. Two reasons, both reproducible:

- The drifted policy is re-validated at nested depths the receipt entry point
  does not control. `legacy-review-records.mjs` has 17 call sites of
  `validateRequest` / `validatePolicy` / `validateCurrentPolicy`; the ones
  reached under one receipt include `:1802`, `:2035`, `:2194` and `:2473`. A
  flag delivered only to `:2282` (`validateCurrentReviewReceipt` →
  `validateRequest`) dies before those, and the receipt still throws.
- `validateLegacyOrchestrationFamily` runs at `plan-run.mjs:2179`, *before* both
  receipt validators at `:2181`/`:2184`, and takes no options bag. All three
  records that move carry a `Review-orchestration-state`, so that call throws
  first regardless of what the receipt validators accept.

A dynamic scope covers the orchestration family, both receipt validators, the
cancelled-evidence sweep and every nested request in one place, with **zero
validator signature changes**. Every validator on this path is synchronous:
`legacy-review-records.mjs` contains no `async function` and no `await`
(measured), so the counter is exact for the extent of `fn`.

**What the narrowing does not relax.** Inside the scope, `validateCurrentPolicy`
still enforces its closed key set, `role`, `max_rounds` and provenance-source
rules (`:1740-1747`), and the accepted shape must match exactly: the candidate
array must equal a frozen three-entry literal in order, and `provenance` must be
all four sources `skill_default`. Five partial-shape variants were measured and
all still throw. Every other family check still runs: the policy-hash bind
(`:508`), the schema-6 author identity check (`:509-518`), the settled
orchestration coupling, and the `cancelled historical evidence is
quarantine-only` sweep (`plan-run.mjs:2186-2188`). Two of the five records stay
quarantined precisely because those checks still bite.

**The accepted candidate chain must be a frozen literal, not `CURRENT_CANDIDATES`.**
For a schema-6 policy the whole schema-5 branch `:1748-1762` is skipped — it ends
in `return policy` — so the roster eligibility check at `:1754` and the exact-order
check at `:1757` never run, and the guard's predicate is the *only* thing binding
the candidate array. Reusing `CURRENT_CANDIDATES` (`:1717-1720`), the live reviewer
roster, would therefore couple a frozen historical shape to a mutable constant.
Measured by prototyping both against a roster with one model swapped: the
roster-bound predicate reclassifies **0** of the three target records, while the
frozen literal still reclassifies them. With the roster unchanged the two are
indistinguishable, which is exactly why the coupling would revert silently and no
test would notice. The guard's early `return policy` also skips
`validateCurrentCandidate` at `:1766`; an exact `jcs` match against a frozen
three-entry literal byte-pins all three candidates, so nothing goes unvalidated on
the narrowed path.

**Source vs behaviour, stated separately.** `validateDraftReceipt`,
`validateCompletionReceipt`, `validateCurrentReviewReceipt`, `validateRequest`
and `validatePolicy` keep their current source bytes — no signature, no body
change. Only `validateCurrentPolicy` gains a default-off branch, and
`legacy-review-records.mjs` gains one export. Behaviour is identical for every
caller at scope depth 0 and changes only inside the dynamic extent of
`validateLegacyRecordFamily` invoked from `classifyLegacyPlan`. Measured at
depth 0, live and prototype agree exactly: `validateCompletionReceipt` on the
recertification receipt and `validateCurrentPolicy` on its policy both throw
`schema-6 current policy fallback must be none`.

**Why not relax the shared rule itself.** `scripts/lib/session-relay-release-preparation.mjs:8-13`
imports `validateCompletionReceipt` and `validateDraftReceipt` from this module
for release binding. The active plan `session-relay-linux-workspace-publication.md`
constrains that surface at `:268` — "The implementation is binder-local and
exact-artifact-only." and "Current schema-6 emission and validation remain
globally `fallback:\"none\"` … ; do not edit
`plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`." —
and at `:440`, "Current schema-6 policy remains fallback none globally." Those
are constraints on *acceptance behaviour* and on one named file, not on function
arity. This plan edits neither `review-policy.mjs` nor the binder, and the
binder never enters the classification scope, so schema-6 receipt acceptance
stays globally unchanged.

**Existing test coverage, precisely.** The literal
`schema-6 current policy fallback must be none` occurs in exactly three files:
the live `legacy-review-records.mjs:1763`, and two files inside the frozen
regression tree (`…/legacy-regression-tree/plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs:1133`
and `…/legacy-regression-tree/scripts/tests/plan-review-policy-regressions.mjs:1964`).
The live `plan-reviewer/scripts/review-policy.mjs` contains no such rule. A
live-gated assertion of this exact drifted shape does exist — frozen
`plan-review-convergence-repair.mjs:1108-1113`, named "schema 6 rejects the
legacy availability-only three-candidate policy" — but it is closed over the
frozen tree's own `validateCurrentPolicy`, so it neither covers nor constrains
the live helper. No live test exercises the live `validateCurrentPolicy` against
the drifted shape, and no existing fixture can build one:
`fixtures/historical-records.mjs:324-337` (`currentPolicy`) emits
`candidates: [candidate]` — exactly one — and
`fallback: schema === 6 ? 'none' : 'availability_only'`. That is why step 3's
fixtures are load-bearing rather than decorative.

**The frozen export inventory must move with the new export.**
`historical-characterization.mjs:268-282` asserts
`Object.keys(api).sort()` equals the flattened category list in
`fixtures/historical-inventory.json`. Measured: 31 frozen names, 31 live
exports, equal today; the prototype's 32 makes them diverge and fails the
focused suite. The tracked-corpus assertion is *not* affected — its outcomes
come from `canonicalPlanView`, and its single `known_quarantined` entry is the
publication plan, which does not move (measured: prototype, live and frozen all
produce the identical 20 rows).

**This reclassification unlocks migration, and that is intended.**
`classifyLegacyPlan` gates `migrateLegacyPlan` (`plan-run.mjs:2245-2247`), so the
three records become migration-eligible. The user authorized that consequence
explicitly. This plan does not migrate any record; it only changes
classification.

`scripts/tests/plan-orchestration/fixtures/historical-records.mjs` is declared in
`affected_paths` because step 3's positive fixture needs a builder that can emit
the three-candidate drifted policy, which `currentPolicy` cannot today. If the
fixture turns out to be constructible without it, the path is simply left
unmodified — `affected_paths` freezes when this run leaves `drafting`, so it is
declared now rather than discovered later.

## Environment & how-to-run

Repository `/home/vagrant/projects/docks` at `f375be5`
(`f375be5d323636dc716ac82992eb84c1ba265eaa`), branch `main`, tree clean. Node 24,
dependencies already provisioned.

Focused suite: `node scripts/tests/plan-orchestration.mjs` — currently exit 0
with the literal summary line `plan-orchestration: 98/98 passed`. This is the
exact invocation the gate uses: `scripts/ci.mjs:345` passes argv
`['scripts/tests/plan-orchestration.mjs']`.

Authoritative gate: `node scripts/ci.mjs --plugin docks` (Node-only). That
targeted gate does run the focused suite, so A5 exercises A1's new cases and the
full gate the host constraint forbids is not needed:
`scripts/lib/plugins.mjs:107` gives the docks plugin
`authorChecks: ['idempotency', 'plan-reviewer']`, `ci.mjs:218-219` derives
`planAuthorChecks = selectedAuthorChecks(targets).has('plan-reviewer')`, and
`:343` gates the `plan orchestration` section on it.

No `SKILL.md` content-hash refresh is coupled to this work.
`scripts/skills/content-hash.mjs:67-82` assembles a skill's hash from `SKILL.md`
plus its immediate `references/*.md` entries only; a skill-local `scripts/*.mjs`
file never feeds it. Baseline `node scripts/skills/content-hash.mjs --check-only`
is exit 0 with every skill reported `unchanged`.

**Host constraint.** Do not run the full `node scripts/ci.mjs`, and do not run
concurrent Rust builds or synthetic CPU load. This host locked up under a
concurrent gate run on 2026-07-27 and lost uncommitted work.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add the dynamically scoped classification context to the legacy helper: a module-scoped depth counter, one new export `withLegacyClassification(fn)` that increments it and restores it in `finally`, a frozen `LEGACY_DRIFTED_SCHEMA6_CANDIDATES` literal holding exactly the three entries quoted in Context (openai/codex/gpt-5.6-sol/high/default, anthropic/claude/fable/high, anthropic/claude/opus/xhigh) — its own constant, deliberately NOT `CURRENT_CANDIDATES` — a private `isDriftedLegacySchema6Policy(policy)` predicate requiring `fallback === 'availability_only'` AND a candidate array whose `jcs` equals that frozen literal's AND `provenance` equal to all-four-`skill_default`, and a guard `if (depth > 0 && isDriftedLegacySchema6Policy(policy)) return policy;` immediately before the `:1763` fallback throw. Register the new export in exactly one `categories` bucket of the frozen inventory, preserving its no-duplicate-ownership invariant | `plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs`, `scripts/tests/plan-orchestration/fixtures/historical-inventory.json` | — | `local` | `planned` | A1 still passes at its pre-change count of 98 (the guard is depth-gated, so nothing reclassifies yet) and A3 passes. If the guard cannot sit inside `validateCurrentPolicy` without altering depth-0 behaviour, STOP rather than relaxing the shared rule |
| 2 | Import `withLegacyClassification` in `plan-run.mjs` and wrap the single family-validation call at `:2217` — `family = withLegacyClassification(() => validateLegacyRecordFamily(bytes, records));` — so the scope covers `validateLegacyOrchestrationFamily` at `:2179`, both receipt validators at `:2181`/`:2184`, and the cancelled-evidence sweep at `:2186-2188` in one validated pass | `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs` | 1 | `local` | `planned` | A2 reports exactly the three movers and the two reason-only changes. If any record outside those five changes classification, STOP |
| 3 | Add exactly five focused cases: (a) a positive fixture whose family carries the drifted schema-6 policy, asserted to classify `settled-terminal` — asserting the classification string, not merely that nothing threw; (b) a partial-shape fixture (drifted `fallback` only) asserted to stay `legacy-quarantined`; (c) a fixture combining the drifted shape with cancelled evidence, asserted to stay `legacy-quarantined` so the narrowing cannot smuggle cancelled families past the `:2186-2188` sweep; (d) a depth-0 case asserting `validateCurrentPolicy` on the drifted policy still throws `schema-6 current policy fallback must be none` outside the scope; (e) a case asserting the depth counter is restored after a `withLegacyClassification` body throws. Construction recipe for (a), since no existing builder emits the drifted shape: start from a complete valid schema-6 family produced by `historical-records.mjs`, then rewrite the policy to the drifted triple in **both** `request` and `receipt`, recompute `policy_sha256` in both so `:508` and `:2283` still bind, keep the author-matching candidate first so `:509-518` passes, and emit the `Review-orchestration-state` record whose canonical digest satisfies the receipt's `settled_orchestration_state_sha256`. If that family cannot be built, STOP rather than weakening an assertion | `scripts/tests/plan-orchestration/fixtures/legacy-plans.mjs`, `scripts/tests/plan-orchestration/fixtures/historical-records.mjs`, `scripts/tests/plan-orchestration/legacy-quarantine.mjs` | 2 | `local` | `planned` | A1 reports `plan-orchestration: 103/103 passed` and A4 fails while mutated. A negative-only set is vacuous and trips STOP condition 4 |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs` | Exit 0 and the literal summary line `plan-orchestration: 103/103 passed` — the pre-change 98 plus the five cases added in step 3 |
| A2 | Read-only script classifying every `docs/plans/{active,finished}/*.md` with `classifyLegacyPlan`, comparing against the pre-change baseline | Exactly three records change classification `legacy-quarantined` → `settled-terminal`: `active/session-relay-linux-workspace-release.md`, `finished/2026-07-19-session-relay-prebuilt-cli-release.md`, `finished/2026-07-23-session-relay-linux-workspace-recertification.md`. Totals `legacy-quarantined` 32 → 29 and `settled-terminal` 10 → 13; `current` 18 and `record-free` 34 unchanged. Exactly two records change quarantine reason without changing classification: `active/plan-review-controller-failure-recovery.md` → `schema-6 receipt requires settled orchestration state` and `finished/2026-07-22-session-relay-workspace-isolation.md` → `schema-6 policy candidate must equal request author`. No other record changes classification or reason. Zero plan files modified |
| A3 | Read-only script calling, outside any classification scope, `validateCompletionReceipt(receipt, {}, { orchestration })` on the `Completion-review-receipt` of `docs/plans/finished/2026-07-23-session-relay-linux-workspace-recertification.md`, and `validateCurrentPolicy` on that receipt's policy | Both still throw, with the exact pre-change message `schema-6 current policy fallback must be none` captured before the change. Additionally the five partial-shape variants still throw *inside* the scope. Proves acceptance was not widened and the binder-local constraint holds |
| A4 | Delete the `if (depth > 0 && isDriftedLegacySchema6Policy(policy)) return policy;` guard line, run A1, restore | Mutated run exits non-zero naming the new positive classification case from step 3(a); the restored file is byte-identical to pre-mutation and A1 exits 0 |
| A5 | `node scripts/ci.mjs --plugin docks` | Exit 0 |

## Out of scope / do-NOT-touch

- Migrating, resuming, repairing or finishing any reclassified record. This plan
  changes classification only; the three become migration-eligible and none is
  migrated here.
- `scripts/lib/session-relay-release-preparation.mjs` and its binder-local
  exact-artifact recognition. A3 exists to prove it is untouched.
- `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`,
  which `session-relay-linux-workspace-publication.md:268` explicitly forbids
  editing.
- The frozen regression tree under
  `scripts/tests/plan-orchestration/fixtures/legacy-regression-tree/`, including
  its own copy of this rule.
- The 22 records failing on a frontmatter/parse error and the 5 failing on other
  family defects.
- `validateCurrentPolicy`'s depth-0 behaviour, and the `known_quarantined` /
  `expected_outcomes` sections of `historical-inventory.json`.

## STOP conditions

- Any caller at scope depth 0 observes different behaviour, i.e. the narrowing is
  not confined to the dynamic extent of `validateLegacyRecordFamily` invoked from
  `classifyLegacyPlan`.
- A3 shows receipt validation newly accepting anything it previously rejected, or
  any partial-shape variant being accepted inside the scope.
- A2's measured delta is not exactly the three enumerated movers, or any record
  outside the five enumerated in Context changes classification or reason.
- A4 passes while mutated, meaning the positive case does not bind.
- A fixture combining the drifted shape with cancelled evidence classifies as
  anything other than `legacy-quarantined`.
- Any plan record's bytes change.

## Open questions

None. The migration-unlock consequence is authorized, and the layering
constraint is settled: the publication plan restricts schema-6 receipt
*acceptance* and names one file not to edit, neither of which this plan touches.

## Review

Plan-run: {"acceptance":{"source_sha256":"cb573f5ae0e33b9cfb648b152312326f78dfcb70fd77d4f849db656d9394e0b9","verification_sha256":"bc9871f49e54f55fda6bb91a0462e971a8b9ac6499ffc25ea1a36b1d55845706"},"blocker":null,"completion_review":{"input_sha256":"17c3b98887296dbc2115e47f85be2bf598e6349baae3087362a56e3a2d31b6fa","invocations":1,"result_sha256":"65338d0a9251b284e72bda8a0ade2348b15bfa69aa636e7f5e815373fd64b6e3","state":"passed"},"draft_review":{"input_sha256":"dc64f829b53d95f0b2d998f84fe5db499e780d0b5a068f20580d8c004cd77ec9","invocations":2,"result_sha256":"15c20873ba5bf5abd3478b25a8c214c9b58ac563a48ac5e69edc72e0afa657f5","state":"passed"},"execution_parent":"f375be5d323636dc716ac82992eb84c1ba265eaa","goal_id":"0824417a-f37d-4260-a823-b1ed4fbd54ee","implementation_commit":"b229bbcb8156e0fb8580bb849affdd77c30b576b","plan_path":"docs/plans/active/legacy-schema6-policy-classification.md","plan_sha256":"1b9a49eab578684e89cd219ec9ff0c694ae90a03c5398806cfb73f3fe6d760db","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"296a6721-08c5-4fb5-a2c9-a19d68c39c0a","schema":1,"source_base":"f375be5d323636dc716ac82992eb84c1ba265eaa","source_sha256":"58f1ecb4aa48f8974fc6fd1a81885351485e236453a3a42d358dab6e24950a96"}

## Verification Results

| ID | Command | Observed |
|---|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs` | Exit 0 — `plan-orchestration: 103/103 passed`, the pre-change 98 plus the five cases from step 3 |
| A2 | Read-only census of all 94 `docs/plans/{active,finished}/*.md` against the pre-change baseline | Exactly three records moved `legacy-quarantined` → `settled-terminal`: `active/session-relay-linux-workspace-release.md`, `finished/2026-07-19-session-relay-prebuilt-cli-release.md`, `finished/2026-07-23-session-relay-linux-workspace-recertification.md`. Totals 32 → 29 and 10 → 13; `current` 18 and `record-free` 34 unchanged. Two reason-only changes, both revealing the next always-present defect: the controller plan now reports `schema-6 receipt requires settled orchestration state`, and `finished/2026-07-22-session-relay-workspace-isolation.md` reports `schema-6 policy candidate must equal request author` |
| A3 | Read-only depth-0 validation of the recertification `Completion-review-receipt`, plus five partial shapes inside the scope | Outside any scope both `validateCurrentPolicy` and `validateCompletionReceipt(receipt, {}, { orchestration })` threw `schema-6 current policy fallback must be none`, byte-equal to the message captured before the change. Inside the scope all five partial-shape variants still threw; only the exact drifted shape is accepted |
| A4 | Guard line deleted, A1 re-run, file restored | Mutated run exit 1 with `3 of 103` failing, naming `legacy-quarantine: a drifted schema-6 policy classifies as settled terminal evidence`; restored file byte-identical to the pre-mutation digest and A1 back to exit 0 |
| A5 | `node scripts/ci.mjs --plugin docks` | Exit 0 — `All ci.mjs checks passed — plugin 'docks'; safe to release` |

Depth-0 behaviour is unchanged by construction, not only by assertion: `role`
(`:1742`), `max_rounds` (`:1743`) and the closed six-key set (`:1740`) are all
enforced before the guard, and the guard pins `fallback`, `candidates` and
`provenance` by exact `jcs`, so nothing reaches the early return unvalidated.
