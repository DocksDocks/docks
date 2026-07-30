---
title: Ship the crash-safe review dispatch driver
goal: Replace the hand-rolled reserve, dispatch and settle window with one shipped driver, so a crash inside it refunds the permit instead of leaving a run cold-reserved and permanently blocked.
status: planned
created: "2026-07-29T13:05:00-03:00"
updated: "2026-07-30T02:26:16.775+00:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plan-manager, review, dispatch, tooling]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/docks/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - scripts/tests/plan-dispatch-probes.mjs
  - scripts/tests/plan-orchestration.mjs
related_plans: [docs/plans/active/plan-evidence-row-scales.md]
---

# Ship the crash-safe review dispatch driver

## Goal

One shipped driver performs seal, reserve, dispatch and settle. A crash from any of
the three catchable termination signals it registers - `SIGTERM`, `SIGINT`, `SIGHUP` -
while the phase is `reserved` leaves the run refundable rather than cold-reserved, and the guard that achieves it is proven load-bearing by deleting
it and observing the failure.

The promise is scoped to that one state because it is the only state that can refund,
and each limit carries its own acceptance row rather than being left implicit. An
uncatchable `SIGKILL` cannot be refunded at all: Node cannot install a `SIGKILL`
listener, so the run is left a bare `reserved` for cold entry to block (A4). A
catchable signal arriving while the phase is already `transport_retried` cannot be
refunded either, because that state cannot reach `retryable`; at this plan's
`sensitive` risk it blocks (A8).

## Context & rationale

### The window that has no shipped implementation {measurement:committed}

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

Each enforced quantity has exactly one producer that emits it and nothing else, in
the order above. A committed producer reads the run's `source_base` commit, never
the working tree, so the values cannot drift as this plan does its own work:

|Enforced quantity|Value|
|---|--:|
|entries in the lifecycle script directory|2|
|payload files calling `transactPlanRun`|1|
|lifecycle files referencing `reserve_review`|0|

Two supporting facts are file-line citations rather than quantities: the dispatch
reference constrains "what a reviewer must receive and return, never which program
carries it" (`reviewer-dispatch-methods.md:5`), and the narrow escape from a crash
while reserved is `plan-run.mjs:1557`, the sole result transition allowed to refund
a reserved permit.

So the protocol specifies the sequence, the reference deliberately declines to name
an implementation, and nothing ships one. Every operator writes it unassisted in
the one window where a crash is terminal: per `docs/plans/AGENTS.md:215-222`, cold
entry into a live review state blocks with dangling-launch evidence and never
redispatches, so a crash between reserve and settle costs the run.

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

### Operator observation, not re-derivable {measurement:operator}

On 2026-07-29, across the author's untracked scratch directories, 53 scripts called
`transactPlanRun` and 3 carried both a crash handler and a HEAD-drift guard. The
producer is operator-local and is deleted with scratch. Recorded as motivation only;
it is never a denominator for any acceptance row here.

## Environment & how-to-run

Repository `DocksDocks/docks`, Node 24 with pnpm through corepack:

```
corepack enable && pnpm install --frozen-lockfile
node scripts/ci.mjs --plugin docks
```

The selected-plugin gate is authoritative. No step contacts GitHub, npm, or any
remote. Every step's effect is `local`.

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

The driver settles only what is mechanical. `pass` is "validated matching output"
(`docs/plans/AGENTS.md:199`) and a closed `ReviewInvalidInputV1` is consumed through
`review_invalid_input` against the exact live reservation (`:365-366`), so the driver
persists those unattended, along with `review_transport_failure`. It must **not**
settle `repair` or `blocked`: `repairing` is for an "accepted repair verdict only"
(`:198`) and the manager "accepts only reproducible findings; reviewer prose never
mutates state" (`:360-362`). On those verdicts the driver writes the reviewer result
to its private file and stops with the phase still `reserved`, and main context
reproduces each finding, accepts the reproducible ones, and settles from the accepted
set. The reservation is deliberately held across that adjudication, which is what
`reserved` means - "live initial or repair launch" (`:195`) - so adjudication happens
promptly rather than across a session boundary.

A HEAD-drift guard re-derives the affected-path manifest and refuses if HEAD moved
during the dispatch window. It surfaces drift as a transport failure rather than a
`concurrent_change` blocker, which is a decision with a reason. The contract's
`concurrent_change` rule covers a mismatch that "fails before write, dispatch, or
external action" (`docs/plans/AGENTS.md:317`) - the transaction preimage check the
driver already performs. Drift detected *after* dispatch is a different event: the
sealed bundle went stale through no fault of the review. Blocking would consume a
permit for an environment change, and a `blocked` tuple requires a baseline or
terminal draft phase (`docs/plans/AGENTS.md:245`), so it cannot preserve the
reservation either. `reserved` to `retryable` is legal and refunds, so drift
refunds.

Executable check: send each of `SIGTERM`, `SIGINT` and `SIGHUP` to the driver inside
the dispatch window; every one must leave the on-disk phase `retryable`, never a bare
`reserved`. Delete the handler and repeat: each must then leave a bare `reserved`,
which is what proves the handler load-bearing rather than decorative. Enumerating the
signals is deliberate - a check covering one would let a driver register that signal
alone and still claim the goal.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Ship the dispatch driver: seal, reserve with the body installed inside the same transaction, detached dispatch, settle, handlers for `SIGTERM`, `SIGINT` and `SIGHUP` persisting the state the phase actually permits - `retryable` from `reserved`, blocked from `transport_retried` at sensitive risk - a HEAD-drift guard, and result-event keys correct by construction. Compose existing primitives only; add no schema, event, or status. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs` | — | `local` | `planned` | A dry run against a **scratch** plan, copied outside `docs/plans/` - the same harness step 2 mandates - reserves nothing and reports the sealed digest. No plan under `docs/plans/active/` is a target until A2 and A3 pass, because a driver whose permit handling is unproven can cold-block a real run. If a dry run reserves anything, STOP: the driver is not safe to run against any plan. |
| 2 | Add the seven probes as test scaffolding, not payload: `crash-refund` drives the crash path, `stale-preimage` drives a changed preimage, `sigkill-control` drives the uncatchable-signal control that keeps `crash-refund` honest, `head-drift` moves HEAD after reservation, `dry-run` asserts a dry run mutates nothing, `settle-binding` drives one full cycle to a settled `passed` state, and `retry-block` drives the second-dispatch path that cannot refund. Each exits 0 when its expectation holds, non-zero when it does not, and each runs against a scratch plan copied outside `docs/plans/`. | `scripts/tests/plan-dispatch-probes.mjs` | 1 | `local` | `planned` | All seven probes exit 0 against the shipped driver. Deleting the signal handler makes `crash-refund` exit non-zero naming a bare `reserved`, while `sigkill-control` still exits 0 - which is what shows the two measure different things. If the crash probe passes with the handler deleted, STOP: it discriminates nothing and must not be trusted. |
| 3 | Name the driver in the dispatch reference as one conforming implementation, keeping the protocol transport-agnostic, and refresh the owning skill's `content_hash`. Register all seven probes in the orchestration suite. | `plugins/docks/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md`, `plugins/docks/skills/productivity/plan-manager/SKILL.md`, `scripts/tests/plan-orchestration.mjs` | 1, 2 | `local` | `planned` | `node scripts/ci.mjs --plugin docks` exits 0. The reference names the driver without asserting it is required. The `content_hash` is refreshed, because the hash covers sorted `references/*.md` (`scripts/skills/content-hash.mjs:4-5`) and the per-plugin gate rejects drift (`scripts/ci.mjs:581-583`). |

## Acceptance criteria

Every row's Command cell holds a runnable command, and every row binds its exit
status. Invariant rows carry a named mutation probe, because a gate demanding that
every row fail against the untouched tree would flag correct invariant rows and get
switched off.

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs --help` | Change-demonstrating. Exit 0. Fails today: the file does not exist. |
| A2 | `node scripts/tests/plan-dispatch-probes.mjs crash-refund` | Invariant under mutation. Exit 0: the probe launches the driver against a scratch plan once per registered signal - `SIGTERM`, `SIGINT`, `SIGHUP` - sends that signal inside the dispatch window, and reads `retryable`, never bare `reserved`. Probe: delete the signal handler and rerun - each signal must exit non-zero, proving the handler load-bearing. A single-signal version of this row would let a driver handle `SIGTERM` alone and satisfy the goal. |
| A3 | `node scripts/tests/plan-dispatch-probes.mjs stale-preimage` | Invariant under mutation. Exit 0: the probe hands the driver a scratch plan whose bytes changed after sealing, and the reserve refuses naming a preimage mismatch with no permit spent. Probe: move the body edit outside the transaction - the probe must exit non-zero, which is the defect this driver removes. |
| A4 | `node scripts/tests/plan-dispatch-probes.mjs sigkill-control` | Invariant. Exit 0: SIGKILL leaves a bare `reserved`, the documented control. This row exists to keep A2 honest - if this row and A2 ever agree, the crash probe is measuring nothing, since Node cannot install a SIGKILL listener. |
| A5 | `node scripts/tests/plan-dispatch-probes.mjs head-drift` | Invariant under mutation. Exit 0: the probe reserves against a scratch plan, commits in the scratch repository so HEAD moves inside the dispatch window, and the driver refuses with the permit refunded to `retryable`. Probe: delete the HEAD-drift guard and rerun - it must exit non-zero. Without this row the mechanism's guard is unexercised and a guard-free driver passes every other row. |
| A6 | `node scripts/tests/plan-dispatch-probes.mjs dry-run` | Invariant under mutation. Exit 0: the probe runs the driver's dry run against a scratch plan and asserts the plan bytes and phase state are byte-identical afterwards and that the reported digest equals the sealed bundle digest. Probe: make the dry run reserve - it must exit non-zero. `--help` exiting 0 does not observe any of this, which is why it is a separate row. |
| A7 | `node scripts/tests/plan-dispatch-probes.mjs settle-binding` | Invariant under mutation. Exit 0: the probe drives one full seal, reserve, dispatch and settle cycle against a scratch plan using a stub reviewer that returns valid bound output, then asserts the phase lands `passed` and the settle event's `run_id`, `invocation` and `input_sha256` match the live reservation. It then drives the same cycle with a stub returning `repair` and asserts the driver does **not** settle - the phase must still be `reserved` and the result must be on disk - and with a stub returning `ReviewInvalidInputV1`, which must settle terminally. A driver that settles `repairing` straight from reviewer output fails this row, which is the boundary the lifecycle requires. Probe: drop `run_id` from the settle event - it must exit non-zero, because `resultBindingMatches` (`plan-run.mjs:916`) rejects it, and that rejection is a substantive failure that burns the permit instead of refunding it. The probe also asserts the reviewer's complete stdout was captured to a private file and that settlement read from that file, because the reference requires complete stdout to a private file and states clipped console text is not evidence (`reviewer-dispatch-methods.md:20-21`). Without this row every other row is satisfied by a driver that never settles successfully. |
| A8 | `node scripts/tests/plan-dispatch-probes.mjs retry-block` | Invariant under mutation. Exit 0: the probe drives a scratch plan to `transport_retried` by refunding once and re-reserving, then sends SIGTERM inside the second dispatch window and asserts the run becomes `blocked` rather than `retryable`, because `transport_retried` cannot reach `retryable` (`plan-run.mjs:1523`) and sensitive risk forbids `degraded` (`plan-run.mjs:535`). The probe runs both risk branches: a `local`-risk scratch run must become `degraded` and a `sensitive`-risk scratch run must become `blocked`, and either mismatch exits non-zero - so a driver that always blocks fails as surely as one that always refunds. Probe: make the handler attempt `retryable` from that state - it must exit non-zero. Without this row a driver that always attempts `retryable` passes every other probe while failing the second dispatch. |
| A9 | `grep -q 'dispatch-review' plugins/docks/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md` | Change-demonstrating. Exit 0. Fails today: the reference names no implementation. |
| A10 | `node scripts/ci.mjs --plugin docks` | Invariant. Exit 0. Probe: break one probe's assertion - the gate must exit non-zero, proving the new cases run inside the gate rather than beside it. |

## Out of scope / do-NOT-touch

- The row, sample and measurement evidence scales. They are a separate plan,
  `docs/plans/active/plan-evidence-row-scales.md`, declared in `related_plans`. That
  plan depends on this driver: its steps 1 and 4 exercise the review dispatch this
  plan ships, so this one lands first. Five rounds of free sampling
  measured this: the dispatch-driver rows drew almost no findings while the
  row/sample/measurement machinery drew nearly all of them, so they are separated
  rather than carried as one plan that never converges.
- The PlanRunV1 schema. No field, event, status or transition is added, removed or
  renamed.
- Review budgets. Two substantive permits per phase stays exactly as it is.
- Resuming `docs/plans/active/relay-release-instance-separation.md`. It is blocked
  and immutable; it is this driver's first customer afterwards, not part of it.
- Reconciling the drift between `docs/plans/AGENTS.md` and its `plan-workspace`
  template. Measured while verifying this plan, counting with `wc -l`: the live contract is 455 lines, the
  template's fenced block 435, with 46 lines present only in the live copy and 27
  only in the template. 17 of the 46 live-only lines are the transport-refund and
  live-state contract this plan's mechanism cites, so a workspace refresh today
  would delete them. Real, separate, and not folded in here.
- `plugins/session-relay/` and `plugins/effect-kit/`. No behaviour there changes.
- Operator scratch scripts. They are superseded by step 1 rather than migrated.

## STOP conditions

1. A SIGTERM probe with the handler installed leaves a bare `reserved`. The driver
   has not removed the hazard it exists for, and shipping it would be worse than
   the hand-rolled scripts, which at least made the risk visible. A SIGKILL probe
   leaving bare `reserved` is the expected control and does not trip this: Node
   cannot install a SIGKILL listener, so an unnarrowed version of this condition
   would fire unconditionally and halt the executor at step 1.
2. The crash probe passes with the signal handler deleted. The probe is decorative,
   and a decorative probe is worse than none because it certifies the hazard.
3. A dry run reserves a permit. The driver is not safe to exercise against a real
   plan and must not be run against one until it is.
4. `node scripts/ci.mjs --plugin docks` fails twice with the same signature and no
   change in the relevant bytes between attempts.

## Open questions

None. The refundable state, the discriminating signal, the probes' home in
`scripts/tests/` rather than shipped payload, and the separation of the other three
evidence scales into their own plan are all settled above.

`risk: sensitive` is a decision, not an inherited default. The implementation diff
is local, but the artifact spends review permits and can cold-block a real plan if
its permit handling is wrong - the hazard this plan exists to remove. Sensitive risk
therefore applies deliberately, with the consequences accepted: a second transport
failure during review blocks rather than degrading (`plan-run.mjs:535`), a
completion review is mandatory before finish, and implementation carries three
checkpoint commits rather than two.


Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"e9c600390d20d01da1c41e3996be59bcc690ceef630be337e83759a7262fd7cc","invocations":1,"result_sha256":"60efb6539568ec671aaba346ada196111c15a644d2c7c4d4795c5762584a6f70","state":"passed"},"execution_parent":null,"goal_id":"a52d016e-fb29-47b9-aedb-d9035ebff6e8","implementation_commit":null,"plan_path":"docs/plans/active/plan-dispatch-driver.md","plan_sha256":"d43c0535fa5776c401f14d814146a20c7008ddf1edbddb352f26273a9710506e","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"2f2863ac-62b6-48ee-a142-572215e3c6cc","schema":1,"source_base":"72036fe30c22545a10eb98b53e41f42036fa9d42","source_sha256":"953e52a655c684bf4d40d53a1789f192b3ef2ce21eb784d66c6adaf4e70e0c81"}

## Review

Draft review invocation 1 returned `pass` with zero findings, bound to `run_id`
2f2863ac, `plan_sha256` d43c0535 and `source_sha256`
953e52a6. Invocation 2 is unspent.

That permit was spent only after the free pre-check stopped returning
implementation-changing defects. Nine sampling rounds ran over frozen bytes across
two vendors, and the rounds that mattered: replaced a "two probes" step contract that
an acceptance row already contradicted; enumerated the three catchable signals the
driver registers instead of testing one; made the second-dispatch row cover both risk
branches; and added the settlement boundary, which is that a driver may persist
`pass`, `ReviewInvalidInputV1` and a transport refund unattended but never
`repairing`, because that state is for an accepted repair verdict only.

## Verification Results

Not yet started.
