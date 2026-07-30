---
title: Close the four reproduced holes in the crash-safe review dispatch driver
goal: The dispatch driver shipped, but its own completion review reproduced four defects that break the crash-safety guarantee it exists to make. Close each one and prove each closure with a probe that fails when the defect is re-introduced into a copy of the driver.
status: ongoing
created: "2026-07-29T13:05:00-03:00"
updated: "2026-07-30T23:29:30.471+00:00"
started_at: "2026-07-30T23:29:30.471+00:00"
finished_at: null
assignee: null
tags: [plans, plan-manager, review, dispatch, tooling]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - scripts/tests/plan-dispatch-probes.mjs
  - scripts/tests/plan-orchestration.mjs
related_plans: [docs/plans/active/plan-evidence-row-scales.md]
---

# Close the four reproduced holes in the crash-safe review dispatch driver

## Goal

The driver ships. Its guarantee does not hold yet.

`dispatch-review.mjs` landed at `8531065` and its seven probes run inside the gate.
Its own completion review then spent both permits, returned `repair` twice, and the
reducer blocked the run. Four of those five findings are code defects, and all four
were reproduced against the shipped bytes before any of them was accepted.

The goal is met when each defect is closed, each closure is proven by a probe that
fails when the defect is re-introduced into a copy of the driver, and the seven shipped
probes plus the per-plugin gate stay green. The fifth finding is a verification-writing
discipline with no code site; it is discharged in the Acceptance preamble rather than
by a step, because there is nothing left in this body to repair for it.

One consequence is worth stating plainly: the driver being repaired is the same driver
that dispatches this plan's own reviews. Defect C1 is live in exactly that path, so
until step 1 lands, any dispatch of this plan must validate the reviewer route before
reserving, by hand if necessary.

## Context & rationale

### The shipped driver, measured at this run's baseline {measurement:committed}

Producer:

```
# The commit is read from this plan's own record, never pasted as a literal: the
# reserve transition may rebind source_base (plan-run.mjs:1636-1638), and a pasted
# SHA would then name a different commit than the record. A stale literal gives no
# signal; a derived one cannot drift.
P=docs/plans/active/plan-dispatch-driver.md
B="$(sed -n 's/^Plan-run: .*"source_base":"\([0-9a-f]\{40\}\)".*/\1/p' "$P")"
git ls-tree --name-only "$B" plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/ | wc -l
git grep -l transactPlanRun "$B" -- plugins/docks/skills/productivity/plan-manager/scripts/ | wc -l
git grep -l reserve_review "$B" -- plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/ | wc -l
```

Each enforced quantity has exactly one producer that emits it and nothing else, in the
order above. A committed producer reads the run's `source_base` commit, never the
working tree, so the values cannot drift as this plan does its own work:

|Enforced quantity|Value|
|---|--:|
|entries in the lifecycle script directory|3|
|payload files calling `transactPlanRun`|2|
|lifecycle files referencing `reserve_review`|1|

This run's `source_base` is the commit that carries the driver, so the producer now
measures the shipped state rather than its absence. At the predecessor run's baseline
the same three producers emitted 2, 1 and 0; `dispatch-review.mjs` alone accounts for
every one of the three deltas. That is the whole of what shipped, and it is why this
plan repairs rather than builds.

Two supporting facts are file-line citations rather than quantities: the dispatch
reference constrains "what a reviewer must receive and return, never which program
carries it" (`reviewer-dispatch-methods.md:5`), and the narrow escape from a crash
while reserved is `plan-run.mjs:1557`, the sole result transition allowed to refund a
reserved permit.

### The four defects, each reproduced against the shipped bytes

These are observations, not enforced quantities, so they carry no producer table. Each
was reproduced by driving the shipped driver against a scratch plan built with the
probe harness. Today the reproductions are operator-local scratch scripts; the durable
producer for each becomes the probe case added by the matching step, which must
reproduce the same observation against a copy of the driver carrying the defect.

|ID|Site|Observed against the shipped bytes|
|---|---|---|
|C1|`dispatch-review.mjs:270-284`|The reserve transaction runs at `:270-277`; `DOCKS_REVIEWER_ARGV` is parsed at `:282-284`, after it and outside the settlement `try` at `:340-400`. Invalid JSON `{` exited 1 leaving `draft_review` `reserved`, `invocations` 1, `result_sha256` null, dying with `SyntaxError` at `:282:27`. A non-array `{}` exited 1 with the same bare `reserved` and `TypeError ... map is not a function` at `:282:102`. A valid-but-useless route `["/bin/true"]` exited 0 and refunded correctly to `retryable`, `invocations` 0.|
|C2|`dispatch-review.mjs:295-330,374,379`|Complete reviewer stdout reaches no file. A stub emitted 311 stdout bytes; the driver settled `pass` and exited 0; the recursive out-dir held four files (`binding.json` 412 B, `manifest.json` 302 B, `plan.md` 1446 B, `*-result.json` 300 B) and zero raw-stdout bytes. A search for `DIAGNOSTIC` across that directory returned no matches: `:315` skips every line not starting `{` and `:330` slices from the first `{` to the last `}`, so both diagnostic lines were dropped before validation.|
|C3|`dispatch-review.mjs:363-367`|The branch reconstructs `{schema: 1, error: 'invalid_input', reason: parsed.reason}` instead of validating what the reviewer returned. Replies carrying `schema: 2`, no `schema`, or an unknown extra key each settled the run `blocked` with `draft_review` `blocked`, `invocations` 1, blocker kind `review_failed`, and a result file whose bytes the reviewer never emitted, `schema` rewritten 2 to 1 and the unknown key stripped. `validateReviewInvalidInput` (`plan-run.mjs:935-944`) rejects those same raw bytes.|
|C4|`dispatch-review.mjs:350-353`|The guard compares only `git rev-parse HEAD` against the sealed value; the sole `createAffectedPathManifest` call is the pre-dispatch seal at `:161`. With HEAD held and `git status --porcelain` reporting ` M tracked.txt`, the driver settled `draft_review` `passed`, `invocations` 1, exit 0 against a sealed `source_sha256` of `9e03eb5b` while a fresh re-derivation gave `30badb0b`. The committed half is already covered: `head-drift` exits 0 today.|

C4 turns on one measured property rather than an argument: `snapshotPath`
(`plan-run.mjs:1299-1320`) reads the working tree through `fs.lstatSync` at `:1304` and
hashes file contents at `:1318`, so an uncommitted edit moves a rebuilt manifest digest
while HEAD does not move. Measured directly, a manifest over a scratch tree went from
`55968475` to `011bbde3` across an uncommitted edit with HEAD unchanged at
`5a301894`. The contract already requires this: `source_base` plus `source_sha256`
binds a manifest for every affected path "including dirty/untracked bytes and
tombstones" (`docs/plans/AGENTS.md:174-176`).

C1 and C2 are the same sentence of the contract, from two directions: "Before
reserving, preflight the exact reviewer route and a private file that will receive
complete stdout" (`docs/plans/AGENTS.md:224-226`). Both halves are pre-reserve
obligations, and A1 binds both: the route half is C1's defect, while the stdout half is
unchecked at any point today, so C2's repair must not satisfy itself by creating the
target after the reservation. C2's other half is
`reviewer-dispatch-methods.md:20-23` - complete stdout to a private file, and "never
reconstruct a returned object by hand", which C3 also violates. That reference names
this driver as a conforming implementation at `:50-53`, so the reference and the
driver contradict each other until the repair lands.

### Every acceptance row of the predecessor passes today {measurement:committed}

Producer: run each Command cell of the predecessor's ten rows and collect exit status.

Measured: all ten exit 0, so the plan as inherited is entirely inert - it has no
change-demonstrating row left. Two rows state a "Fails today" reason that is now
false: A1 claimed `dispatch-review.mjs` does not exist, and A9 claimed the reference
names no implementation. Both exit 0. This is why every row below is re-authored
rather than edited, and why each of the four repair rows carries the pre-repair bytes
it must stop reproducing. The full sweep costs 18.3 s of command time, of which the
gate is 16.0 s.

### The refundable state is `retryable`, not `transport_retried` {measurement:committed}

The obvious guess is wrong, which is why this is measured rather than asserted.
`reserved` permits only `reserved`, `passed`, `repairing`, `blocked`, `cancelled`
and `retryable` (`plan-run.mjs:1522`), so `transport_retried` is not reachable from
a crash at all. The refund predicate is `after.state === 'retryable' &&
before.state === 'reserved' && [1, 2].includes(before.invocations) &&
after.invocations === before.invocations - 1` (`:1552-1556`), and
`transport_retried` is reached only from `retryable`, by a fresh `reserve_review`
(`:1011-1012`).

A signal handler that wants the permit back therefore persists `retryable`. A
handler persisting `transport_retried` would attempt an illegal transition and fail
closed, which is the same lost run by another route.

### A SIGKILL probe cannot prove a handler {measurement:committed}

Producer: `node -e "process.on('SIGKILL', () => {})"`

```
Error: uv_signal_start EINVAL
```

Node refuses to install a SIGKILL listener, so a SIGKILL probe leaves a bare
`reserved` whether or not the handler exists and discriminates nothing. The
discriminating probe uses SIGTERM: measured, a SIGTERM handler writes its marker
before exit while the same handler-bearing process under SIGKILL does not. SIGKILL
is kept only as a control whose expected outcome is bare `reserved`.

## Environment & how-to-run

Repository `DocksDocks/docks`, Node 24 with pnpm through corepack:

```
corepack enable && pnpm install --frozen-lockfile
node scripts/ci.mjs --plugin docks
```

The selected-plugin gate is authoritative. No step contacts GitHub, npm, or any
remote. Every step's effect is `local`.

Probe runs export `DOCKS_REVIEW_TIMEOUT_MS=15000`. The driver's default is
`1_800_000` (`dispatch-review.mjs:47`), so a stub that never answers would otherwise
hold a probe for thirty minutes and read as a hang rather than a failure.

## Crash-safe dispatch {mechanism}

One process performs seal, reserve, dispatch and settle. The body edit is installed
*inside* the reserve transaction, because only the reserve transition may move
`plan_sha256`. Signal handling is state-dependent, because only one state can
refund. A handler firing while the phase is `reserved` persists `retryable` - the
refund transition at `plan-run.mjs:1552-1557` - which returns the permit. A handler
firing while the phase is `transport_retried` cannot refund at all: that state's
legal successors are `transport_retried`, `passed`, `repairing`, `blocked`,
`cancelled` and `degraded` (`plan-run.mjs:1523`), with `retryable` absent. A second
transport failure therefore degrades eligible local draft work or blocks, and at this
plan's `sensitive` risk degradation is unavailable (`plan-run.mjs:535`), so it
blocks. The driver persists the state the phase actually permits rather than one
fixed state, or it fails closed and loses the run it exists to protect. The settle
event carries `run_id`, `invocation` and `input_sha256`, which `resultBindingMatches`
requires (`plan-run.mjs:916`); omitting them is a substantive failure that burns the
permit rather than a transport failure that refunds it.

Four corrected contracts define this repair. Each is stated as a property the driver
must hold, because each was violated by an implementation that looked correct.

**Nothing the dispatch depends on is established after the reservation when it could
have been established before it (bound by A1).** This covers inputs read *and* output targets opened,
because the contract binds both halves in one sentence: "Before reserving, preflight the
exact reviewer route and a private file that will receive complete stdout"
(`docs/plans/AGENTS.md:224-226`). The reservation is the point of no return: everything
past it either settles or refunds, and a throw between reserve and the settlement `try`
does neither. Two things are therefore proven before the reserve transaction - the
reviewer route parses to an argv array whose binary is executable, and the private
raw-stdout target is creatable and writable. Moving the route parse alone still reserves
before knowing the evidence file can be written, which is the same defect with a
different trigger, so row A1 binds both halves rather than the route only.

**The complete reviewer byte stream is persisted before it is interpreted (bound by A4).** Parsing
is lossy by construction: the extractor selects one JSON object out of a stream, so
anything the reviewer wrote around it is evidence that no longer exists. Persisting
raw bytes first and normalizing second makes the normalized result a derived artifact
rather than the only record.

**What the reviewer returned is validated, never reconstructed (bound by A2).** A reconstruction
cannot fail on the fields it does not copy, so it converts a malformed reply into a
well-formed one and then acts on it. Because `review_invalid_input` is terminal for
the run, the cost of laundering a malformed reply is the run itself, which is why this
sits beside the crash hazard rather than below it.

**The drift guard re-derives what it sealed (bound by A3 and A11).** A guard that compares HEAD checks
whether the commit graph moved, not whether the reviewed bytes moved, and the manifest
deliberately covers dirty and untracked content. Re-deriving the manifest at the same
observation point and comparing `source_sha256` closes the half that HEAD cannot see;
the throw belongs inside the settlement `try` so the existing refund path carries it.

The driver settles only what is mechanical. `pass` is "validated matching output"
(`docs/plans/AGENTS.md:199`) and a closed `ReviewInvalidInputV1` is consumed through
`review_invalid_input` against the exact live reservation (`:366-367`), so the driver
persists those unattended, along with `review_transport_failure`. It must **not**
settle `repair` or `blocked`: `repairing` is for an "accepted repair verdict only"
(`:198`) and the manager "accepts only reproducible findings; reviewer prose never
mutates state" (`:360-362`). On those verdicts the driver writes the reviewer result
to its private file and stops with the phase still `reserved`, and main context
reproduces each finding, accepts the reproducible ones, and settles from the accepted
set. The reservation is deliberately held across that adjudication, which is what
`reserved` means - "live initial or repair launch" (`:195`) - so adjudication happens
promptly rather than across a session boundary.

Drift surfaces as a transport failure rather than a `concurrent_change` blocker, which
is a decision with a reason. The contract's `concurrent_change` rule covers a mismatch
that "fails before write, dispatch, or external action" (`docs/plans/AGENTS.md:316-317`)
- the transaction preimage check the driver already performs. Drift detected *after*
dispatch is a different event: the sealed bundle went stale through no fault of the
review. Blocking would consume a permit for an environment change, and a `blocked`
tuple before start requires a baseline or terminal draft phase
(`docs/plans/AGENTS.md:250`), so it cannot preserve the reservation either. `reserved`
to `retryable` is legal and refunds, so drift refunds.

Executable check: send each of `SIGTERM`, `SIGINT` and `SIGHUP` to the driver inside
the dispatch window; every one must leave the on-disk phase `retryable`, never a bare
`reserved`. Delete the handler and repeat: each must then leave a bare `reserved`,
which is what proves the handler load-bearing rather than decorative. Enumerating the
signals is deliberate - a check covering one would let a driver register that signal
alone and still claim the goal.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Close C1: establish that nothing the dispatch depends on is set up after the reservation when it could be set up before it. Move the `DOCKS_REVIEWER_ARGV` parse ahead of the reserve transaction and prove three things there: it parses as an array, its `argv[0]` resolves to an executable file, and the private raw-stdout target is creatable and writable - so both halves of `docs/plans/AGENTS.md:224-226` hold rather than the route half alone. Executability is part of the route being "exact": a route whose binary does not exist fails at `spawn` after the reservation, which is the same hazard reached later. Add the `preflight-before-reserve` probe case driving invalid JSON, a non-array, a missing or non-executable `argv[0]`, and an unwritable stdout target. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `scripts/tests/plan-dispatch-probes.mjs` | — | `local` | `planned` | A1 exits 0 for all four inputs, and exits non-zero against a copy with any one of the three preflights moved back after the reserve. Any remaining post-reserve, pre-`try` read or output-target creation is named in the commit message or the step is not done. |
| 2 | Close C3: validate the reviewer's returned object instead of reconstructing it, so a wrong-schema or extra-key reply becomes malformed reviewer output and refunds rather than settling terminally. Add the `invalid-input-verbatim` probe case covering the three laundered shapes and asserting the three non-laundered shapes still refund. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `scripts/tests/plan-dispatch-probes.mjs` | — | `local` | `planned` | A2 exits 0, and exits non-zero against a copy with the reconstruction restored. |
| 3 | Close C4: re-derive the affected-path manifest at the existing drift observation point and compare `source_sha256` as well as `source_base`, throwing inside the settlement `try` so the existing refund path carries it. Add the `dirty-drift` probe case for uncommitted drift with HEAD asserted unchanged. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `scripts/tests/plan-dispatch-probes.mjs` | — | `local` | `planned` | A3 exits 0 and A11 stays 0, and A3 exits non-zero against a copy with the digest comparison removed but the HEAD check intact. |
| 4 | Close C2: persist the complete reviewer stdout byte stream to the private target step 1 preflighted, before interpreting it, keeping the normalized result as a separate artifact. Persistence before interpretation is only the second half of `docs/plans/AGENTS.md:224-226`; the target's existence is proven pre-reserve by step 1, so this step must not create it after the reservation. Add the `stdout-persistence` probe case asserting buffer equality against the emitted bytes. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `scripts/tests/plan-dispatch-probes.mjs` | 1 | `local` | `planned` | A4 exits 0 and A1 stays 0, and A4 exits non-zero against a copy with only the raw-stdout write deleted. Deleting either normalized write must not satisfy the mutation. Creating the target after the reserve instead of before must fail A1. |
| 5 | Register the four new cases in the orchestration suite so the gate runs them. | `scripts/tests/plan-orchestration.mjs` | 1, 2, 3, 4 | `local` | `planned` | A12 exits 0, and exits non-zero when one new case's assertion is broken - proving the cases run inside the gate rather than beside it. |

## Acceptance criteria

Every row's Command cell holds a runnable command, and every row binds its exit
status. The four repair rows are change-demonstrating and record the pre-repair bytes
they must stop reproducing, so "fixed" is a comparison against captured values rather
than a claim. Invariant rows carry a named mutation probe, because a gate demanding
that every row fail against the untouched tree would flag correct invariant rows and
get switched off.

Mutation uses `--driver=<copy>` (`plan-dispatch-probes.mjs:15,40`), re-introducing the
defect into a copy of the current driver by deterministic string replacement. It must
not extract a historical driver from git: all three `ci.yml` checkouts pin
`ref: ${{ github.sha }}` with no `fetch-depth`, so the clone is shallow and a baseline
blob is unreachable in CI. A re-introduced defect also fails loudly if the string stops
matching, where an unreachable baseline would silently stop discriminating.

Probe rows run with `DOCKS_REVIEW_TIMEOUT_MS=15000` exported.

When Verification Results are written, every Observed cell quotes the probe's emitted
string verbatim. The predecessor's completion review faulted an Observed cell that
quoted `sealed digest reported` while the probe emits `reported digest verifies the
bundle` (`plan-dispatch-probes.mjs:438`). A quoted string that was never emitted is a
fabricated observation, so it is measured at write time, not recalled.

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-dispatch-probes.mjs preflight-before-reserve` | Change-demonstrating. Exit 0 for all four pre-reserve failures - invalid JSON `DOCKS_REVIEWER_ARGV`, a non-array one, an `argv[0]` that is missing or not executable, and an unwritable private raw-stdout target: each is refused with the phase still `not_started`, `invocations` 0, and a non-zero driver exit, so no preflight failure spends a permit. Measured against the shipped bytes, the two route-shape cases instead left `draft_review` `reserved` with `invocations` 1 and `result_sha256` null, dying at `dispatch-review.mjs:282` with `SyntaxError` at `:282:27` and `TypeError ... map is not a function` at `:282:102`. The other two are unchecked at any point today: a non-executable `argv[0]` reaches `spawn` at `:299` inside the settlement `try` and so refunds instead of crashing, and the stdout target is never checked at all - neither has a pre-repair bare reservation to report, and both must still be refused before the reserve. Probe: in a copy, move the route parse back after the reserve, and separately move the stdout-target check after it - each mutation must exit non-zero and reproduce a bare `reserved`. Both halves are mutated separately because a single combined probe would pass with one half still misplaced. |
| A2 | `node scripts/tests/plan-dispatch-probes.mjs invalid-input-verbatim` | Change-demonstrating. Exit 0: a reply with `error: 'invalid_input'` and a valid `reason` but `schema: 2`, no `schema`, or an unknown extra key is refused as malformed reviewer output and refunds to `retryable` with `invocations` 0. Measured against the shipped bytes, all three settled `blocked` with `draft_review` `blocked`, `invocations` 1, blocker kind `review_failed`, and a result file the reviewer never emitted. The row also asserts the non-laundered shapes are unchanged: missing, empty and non-string `reason` each measured `retryable`, `invocations` 0, no result file. Probe: restore the reconstruction in a copy - the row must exit non-zero. |
| A3 | `node scripts/tests/plan-dispatch-probes.mjs dirty-drift` | Change-demonstrating. Exit 0: an uncommitted edit to a declared affected path inside the dispatch window refunds the permit to `retryable`, `invocations` 0, with a non-zero driver exit naming manifest divergence, and the probe asserts HEAD did not move so it cannot pass by accident through the HEAD check. Measured against the shipped bytes, the driver settled `passed` with `invocations` 1 and exit 0 against sealed `source_sha256` `9e03eb5b` while a fresh re-derivation gave `30badb0b`. Probe: remove the digest comparison but keep the HEAD check in a copy - A3 must exit non-zero while A11 stays 0. |
| A4 | `node scripts/tests/plan-dispatch-probes.mjs stdout-persistence` | Change-demonstrating. Exit 0: the complete reviewer stdout stream is persisted to a private file and equals the emitted bytes, asserted as buffer equality rather than existence or parsed equality. Measured against the shipped bytes, a stub emitted 311 stdout bytes and 0 of them reached any file; the recursive out-dir held four files and a search for `DIAGNOSTIC` returned no matches. Probe: delete only the raw-stdout write in a copy - the row must exit non-zero at the byte comparison. Deleting either normalized write must not satisfy it. |
| A5 | `node scripts/tests/plan-dispatch-probes.mjs crash-refund` | Invariant under mutation. Exit 0: the probe launches the driver against a scratch plan once per registered signal - `SIGTERM`, `SIGINT`, `SIGHUP` - sends that signal inside the dispatch window, and reads `retryable`, never bare `reserved`. Step 1 moves code across the reservation boundary this row defends, so it guards the original guarantee against its own repair. Probe: delete the signal handler and rerun - each signal must exit non-zero. |
| A6 | `node scripts/tests/plan-dispatch-probes.mjs sigkill-control` | Invariant. Exit 0: SIGKILL leaves a bare `reserved`, the documented control. This row exists to keep A5 honest - if this row and A5 ever agree, the crash probe is measuring nothing, since Node cannot install a SIGKILL listener. |
| A7 | `node scripts/tests/plan-dispatch-probes.mjs stale-preimage` | Invariant under mutation. Exit 0: the driver is handed a scratch plan whose bytes changed after sealing, and the reserve refuses naming a preimage mismatch with no permit spent. Probe: move the body edit outside the transaction - the probe must exit non-zero. |
| A8 | `node scripts/tests/plan-dispatch-probes.mjs settle-binding` | Invariant under mutation. Exit 0: one full cycle with a stub returning valid bound output lands `passed` with the settle event's `run_id`, `invocation` and `input_sha256` matching the live reservation; a stub returning `repair` must **not** settle, leaving the phase `reserved` with the result on disk; a stub returning `ReviewInvalidInputV1` settles terminally. Step 2 rewrites the invalid-input branch this row covers, so it guards against narrowing that boundary. Probe: drop `run_id` from the settle event - it must exit non-zero. |
| A9 | `node scripts/tests/plan-dispatch-probes.mjs retry-block` | Invariant under mutation. Exit 0: the probe drives a scratch plan to `transport_retried`, sends SIGTERM inside the second dispatch window, and asserts `blocked` rather than `retryable`, because `transport_retried` cannot reach `retryable` (`plan-run.mjs:1523`) and sensitive risk forbids `degraded` (`plan-run.mjs:535`). Both risk branches run: a `local`-risk scratch run must become `degraded` and a `sensitive`-risk run `blocked`, so a driver that always blocks fails as surely as one that always refunds. Probe: make the handler attempt `retryable` from that state - it must exit non-zero. |
| A10 | `node scripts/tests/plan-dispatch-probes.mjs dry-run` | Invariant under mutation. Exit 0: a dry run leaves the plan bytes and phase state byte-identical and reports a digest equal to the sealed bundle digest, verified against the bundle rather than merely present. Probe: make the dry run reserve - it must exit non-zero. |
| A11 | `node scripts/tests/plan-dispatch-probes.mjs head-drift` | Invariant under mutation. Exit 0: committed drift inside the dispatch window refunds the permit to `retryable`. Step 3 rewrites this guard, so this row and A3 must both hold - A11 covers the committed half, A3 the uncommitted half. Probe: delete the HEAD comparison - it must exit non-zero. |
| A12 | `node scripts/ci.mjs --plugin docks` | Invariant. Exit 0. Probe: break one of the four new cases' assertions - the gate must exit non-zero, proving they run inside the gate rather than beside it. |

## Out of scope / do-NOT-touch

- The reference and the owning skill's `content_hash`. The predecessor already named
  the driver in `reviewer-dispatch-methods.md`, and this repair changes no
  `references/*.md`, so the hash does not move and neither file is an affected path.
  Measured: appending a line to `scripts/lifecycle/dispatch-review.mjs` in a copy of
  the skill left the content hash at `82a7488c`, while appending one to
  `references/reviewer-dispatch-methods.md` moved it to `15d33725`. The hash covers
  frontmatter, body and sorted `references/*.md` (`scripts/skills/content-hash.mjs:4-5`),
  not `scripts/`.
- The row, sample and measurement evidence scales. They are a separate plan,
  `docs/plans/active/plan-evidence-row-scales.md`, declared in `related_plans`. That
  plan depends on this driver: its steps 1 and 4 exercise the review dispatch this
  plan repairs, so this one lands first.
- The PlanRunV1 schema. No field, event, status or transition is added, removed or
  renamed.
- Review budgets. Two substantive permits per phase stays exactly as it is.
- Resuming `docs/plans/active/relay-release-instance-separation.md`. It is blocked
  and immutable; it is this driver's first customer afterwards, not part of it.
- Reconciling the drift between `docs/plans/AGENTS.md` and its `plan-workspace`
  template. Measured with `wc -l`: the live contract is 455 lines, the template's
  fenced block 435, with 46 lines present only in the live copy and 27 only in the
  template. A `comm -23` over sorted unique lines puts both "Only the first transport
  failure refunds it" and "Cold entry into either live state" in the live-only set -
  the transport-refund and live-state contract this plan's mechanism cites - so a
  workspace refresh today would delete them. Real, separate, and not folded in here.
- `plugins/session-relay/` and `plugins/effect-kit/`. No behaviour there changes.
- The predecessor's blocked record. It is preserved outside the repository and is
  history, not an input: this run replaced it in place under exact authority.

## STOP conditions

1. A new probe case passes against a copy of the driver carrying the defect it exists
   to catch. The case is decorative, and a decorative case is worse than none because
   it certifies the hole as closed. This is the predecessor's own failure mode: ten
   rows that all passed against unrepaired bytes.
2. A repair closes its defect by weakening a shipped guarantee - `crash-refund`,
   `stale-preimage`, `settle-binding`, `retry-block`, `dry-run` or `head-drift`
   regressing. The four repairs touch the reserve boundary, the invalid-input branch
   and the drift guard, which is precisely where those rows already hold.
3. A dry run reserves a permit, or any driver run leaves a bare `reserved` that no
   handler refunds. The artifact is not safe to exercise against a real plan and must
   not be run against one until it is.
4. `node scripts/ci.mjs --plugin docks` fails twice with the same signature and no
   change in the relevant bytes between attempts.

## Open questions

None. The four corrected contracts, the mutation idiom, and the exclusion of the
reference and `content_hash` from the affected paths are settled above.

`risk: sensitive` is a decision, not an inherited default. The implementation diff
is local, but the artifact spends review permits and can cold-block a real plan if
its permit handling is wrong - the hazard this plan exists to remove, and the hazard
C1 shows is still live. Sensitive risk therefore applies deliberately, with the
consequences accepted: a second transport failure during review blocks rather than
degrading (`plan-run.mjs:535`), a completion review is mandatory before finish, and
implementation carries three checkpoint commits rather than two.

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"286d1c668c3421b5e65de7cc138dd7f235b84eb7731999ef6f0bd5e7958264f3","invocations":1,"result_sha256":"69be99b203d36e66c12aa2e555d356e730cc019ce9dccb24e7098bc061f61883","state":"passed"},"execution_parent":"85310659644e7e3738ceb6c3d72bb4cb4c5ac403","goal_id":"a52d016e-fb29-47b9-aedb-d9035ebff6e8","implementation_commit":null,"plan_path":"docs/plans/active/plan-dispatch-driver.md","plan_sha256":"4ce3b7575ee7156519c6000ee28ff181751f6fcdb9478d062cfdc4674aab302e","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"3f573c0e-ef45-419b-8bd0-603d1edaec79","schema":1,"source_base":"85310659644e7e3738ceb6c3d72bb4cb4c5ac403","source_sha256":"0e766edb0700f4795582a533af6d22b0f303a46d2d8d9392e5af51c255844799"}

## Review

### Predecessor draft review

Draft review invocation 1 returned `pass` with zero findings, bound to `run_id`
2f2863ac, `plan_sha256` d43c0535 and `source_sha256`
953e52a6. That was the PREDECESSOR run's budget, both permits of which are now history; this successor run holds a fresh `draft_review` 0 of 2.

That permit was spent only after the free pre-check stopped returning
implementation-changing defects. Nine sampling rounds ran over frozen bytes across
two vendors, and the rounds that mattered: replaced a "two probes" step contract that
an acceptance row already contradicted; enumerated the three catchable signals the
driver registers instead of testing one; made the second-dispatch row cover both risk
branches; and added the settlement boundary, which is that a driver may persist
`pass`, `ReviewInvalidInputV1` and a transport refund unattended but never
`repairing`, because that state is for an accepted repair verdict only.

### Predecessor completion findings, carried as this successor scope

Completion review of predecessor run 2f2863ac spent both permits and
returned `repair` twice, so the reducer blocked the run. All five findings were
reproduced against the bytes before acceptance; they are this successor's scope.

- **C1**, `dispatch-review.mjs:270-284` - the permit is reserved at :270 but
  `DOCKS_REVIEWER_ARGV` is parsed at :282, after the reservation and outside the
  `try` that begins at :340. A malformed value throws with a live reservation and no
  refund, leaving the bare `reserved` that cold-blocks a run. This is the hazard the
  driver exists to remove, reached by a different trigger. Fix: validate the reviewer
  route before reserving, so every preflight failure spends no permit.
- **C2**, `dispatch-review.mjs:286-330,373-379` - complete reviewer stdout is never
  captured. Both `writeFileSync` calls write the normalized result only, while
  `references/reviewer-dispatch-methods.md:20-21` requires complete stdout in a
  private file and states that clipped console text is not evidence. The reference now
  names this driver as conforming, so the two contradict. Fix: capture stdout
  byte-for-byte before parsing, keeping the normalized result separate.
- **C3**, `dispatch-review.mjs:363-367` - the invalid-input branch rebuilds
  `{schema:1,error:'invalid_input',reason}` instead of passing the returned object to
  `validateReviewInvalidInput`, so a wrong-schema reply is normalized into a valid one
  and can terminally block. Fix: validate the complete object and treat failure as
  malformed reviewer output.
- **C4**, `dispatch-review.mjs:350-353` - the mechanism states the drift guard
  re-derives the affected-path manifest; the implementation compares only HEAD, so an
  uncommitted change to an affected path during the dispatch window leaves the sealed
  source manifest stale and still permits settlement. Fix: re-derive the manifest after
  dispatch and refund on a source-base or source-digest mismatch.
- **C5**, `scripts/tests/plan-dispatch-probes.mjs:438` - the predecessor's A6 Observed
  cell quoted `sealed digest reported`, but the repaired probe emits
  `reported digest verifies the bundle`. Fix: quote the exact emitted string, measured
  rather than recalled.

Predecessor evidence bytes:
`~/review-bundle/dispatch-driver-completion-{1,2}-result.json`, verdict digests
`2f5d3fb5d1e8d89a` and `d6518effd5dbb853`. Its blocked record is preserved at
`~/review-bundle/plan-dispatch-driver-blocked.md`, sha256
`dd7be31cc4b641d8`.

What the predecessor did land, and which this successor must not redo: the driver and
its seven probes are committed at `8531065`, the gate runs them
(`plan-orchestration: 137/137`), and the driver already spent
`plan-evidence-row-scales`'s terminal draft permit successfully.

Plan-attempt-history: {"authorization_source_sha256":"97f61bdbe6ee34cd1cf69b49607811887d1384aaecbdfe6ee87b15e09e6d95b9","plan_bytes_sha256":"dd7be31cc4b641d8583c7ed25c58a09a14e8642a9aea2a0e46dd53a730919df5","replacement_run_id":"2ae3d6ed-428d-4e12-bc7b-df8526a36b16","run":{"acceptance":{"source_sha256":"4a4013658a80af614e0eff84136645a349e5213b426ab19b67efbb78109c17cf","verification_sha256":"7715cd61b984dabc8420cc6e44530f9749c32846eb87cacfa614382726450fcb"},"blocker":{"evidence_sha256":"d6518effd5dbb8530229195be6bc85328b15c76139fcb5f5baa9050af0a16d51","kind":"review_failed"},"completion_review":{"input_sha256":"b4be22249c956f4edcfcf8ad5e9c5aa3b02855daa8e0bbc86d614a755690cfcc","invocations":2,"result_sha256":"d6518effd5dbb8530229195be6bc85328b15c76139fcb5f5baa9050af0a16d51","state":"blocked"},"draft_review":{"input_sha256":"e9c600390d20d01da1c41e3996be59bcc690ceef630be337e83759a7262fd7cc","invocations":1,"result_sha256":"60efb6539568ec671aaba346ada196111c15a644d2c7c4d4795c5762584a6f70","state":"passed"},"execution_parent":"180b7e50de1e0dcc5c5fa322918c88c36aa120ba","goal_id":"a52d016e-fb29-47b9-aedb-d9035ebff6e8","implementation_commit":"85310659644e7e3738ceb6c3d72bb4cb4c5ac403","plan_path":"docs/plans/active/plan-dispatch-driver.md","plan_sha256":"d43c0535fa5776c401f14d814146a20c7008ddf1edbddb352f26273a9710506e","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"2f2863ac-62b6-48ee-a142-572215e3c6cc","schema":1,"source_base":"72036fe30c22545a10eb98b53e41f42036fa9d42","source_sha256":"953e52a655c684bf4d40d53a1789f192b3ef2ce21eb784d66c6adaf4e70e0c81"},"schema":1,"status":"blocked","successor_run_sha256":"2e8790fe57758e726ba31ee997bfe865fc2762f5c2b35078584a1c370b37cb1e"}

### Second-successor scope: the two round-2 draft findings

Draft review of predecessor run 2ae3d6ed spent both permits and
returned `repair` twice, so the reducer blocked the run. Round 1's finding was
repaired; round 2's two findings were introduced BY that repair and are this
successor's scope. Both were reproduced against the sealed bytes before acceptance -
write-up at `~/review-bundle/successor-draft-2-reproduction.md`.

- **F1**, Steps rows 1 and 4 - step 4's `Depends` cell is `—`, yet its task names the
  private target step 1 preflights, it cites the same contract sentence, and its
  done-when requires "A1 stays 0" while A1 is step 1's row. An executor may therefore
  legally start step 4 before the pre-reserve contract exists. P16 validates only
  DECLARED dependencies and cannot infer a missing one. Fix: set step 4's `Depends`
  to `1`.
- **F2**, mechanism versus step 1 and A1 - the mechanism asserts the pre-reserve proof
  includes "the reviewer route parses to an argv array whose binary is executable", but
  neither step 1 nor A1 mentions executability, a binary, or PATH; A1's cases are
  exactly invalid JSON, non-array, and unwritable stdout target. An unavailable binary
  bypasses a proof the plan states without failing any row. The check is implementable -
  this session's own `~/preflight-route.mjs` asserts `X_OK` - so it is an omission,
  not an impossible demand. Fix: add executability to step 1 and an A1 case for a
  missing or non-executable binary, refused pre-reserve with `not_started` and
  `invocations` 0.

All three findings across both rounds were ONE defect class: prose asserts an
obligation that no Steps/Acceptance row binds, or a cell cross-references another
row/step that the structured `Depends` column contradicts. A structural binding sweep
now exists at `~/review-bundle/sweep-bindings.mjs`; it catches F1 and every unbound
mechanism property, and it must run after every body edit rather than once, because F1
and F2 did not exist before the round-1 repair.

Predecessor evidence: `~/review-bundle/successor-draft-{1,2}/…-result.json`, verdict
digests `2bc06167873e1ef3` and `e5b7f83cd3a4cc65`. Its blocked record is preserved
byte-identically at `~/review-bundle/plan-dispatch-driver-blocked-2ae3d6ed.md`,
sha256 `f7ed72b550e339a9`.

What the predecessor did land, and which this successor keeps rather than redoing: the
whole body rewrite - narrowed `affected_paths`, `source_base` rebound to the commit
carrying the driver, the four reproduced defects with their pre-repair values in the
acceptance rows, and the round-1 repair across mechanism, step 1, step 4 and A1.

Plan-attempt-history: {"authorization_source_sha256":"ad3f214667d420412cccaef6bcb9ff358448ee64ec1ad1dae9d65fbc4c9efd17","plan_bytes_sha256":"f7ed72b550e339a9d659bad3b4750b36b368048e73b687e54288df3a3f3dd090","replacement_run_id":"3f573c0e-ef45-419b-8bd0-603d1edaec79","run":{"acceptance":null,"blocker":{"evidence_sha256":"e5b7f83cd3a4cc6563f1bac07b4963c638f10217ad47e667706a39c7152e80bc","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"24324ab0c25e5369c180d8c6fc2c8aae46deb46b1ca491023ebbeb160565f48c","invocations":2,"result_sha256":"e5b7f83cd3a4cc6563f1bac07b4963c638f10217ad47e667706a39c7152e80bc","state":"blocked"},"execution_parent":null,"goal_id":"a52d016e-fb29-47b9-aedb-d9035ebff6e8","implementation_commit":null,"plan_path":"docs/plans/active/plan-dispatch-driver.md","plan_sha256":"be6700ebf66d57ed5595fd70a9b2b8db2a4b414e8b20b0ead87d7a259e51d0f2","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"2ae3d6ed-428d-4e12-bc7b-df8526a36b16","schema":1,"source_base":"85310659644e7e3738ceb6c3d72bb4cb4c5ac403","source_sha256":"0e766edb0700f4795582a533af6d22b0f303a46d2d8d9392e5af51c255844799"},"schema":1,"status":"blocked","successor_run_sha256":"fa09cea8b8932e6cb8645ce98a229ec326ddeb7bf29eff7e93188708ef245e76"}

## Verification Results

Not yet started.
