---
title: Release Session Relay 0.16.0 with custody-safe disconnects
goal: Ship Session Relay 0.16.0 without fencing a managed worker on caller disconnect, retire Intel macOS production assets, and retain preflight evidence refs.
status: drafting
created: "2026-08-02T18:00:00+00:00"
updated: "2026-08-04T03:52:01.359+00:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, session-relay, release, custody, supply-chain]
affected_paths:
  - .claude-plugin/marketplace.json
  - .github/AGENTS.md
  - .github/workflows/build-binaries.yml
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/test/companion-distribution-contract.mjs
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/fixtures/release-identity-inventory.json
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-instance-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - scripts/AGENTS.md
  - scripts/lib/plugins.mjs
  - scripts/lib/rust-bin.mjs
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-instances/0.16.0.json
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-publication.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/verify-session-relay-preflight.mjs
related_plans: []
---

# Release Session Relay 0.16.0 with custody-safe disconnects

## Goal

Release Session Relay 0.16.0 with four bounded changes: preserve an `Active`
managed worker when its wake caller disconnects but supervisor custody remains
intact; reduce the current producer and release contract from four binaries to
three by deprecating `x86_64-apple-darwin`; make preflight-ref retention an
explicit durable policy; and execute the Session Relay release lane without
altering any published 0.15.0 evidence.

The release is not complete until a separately reviewed docks-kit 0.14.0 child
pins the three independently verified 0.16.0 assets. The current public package
is docks-kit 0.13.0 and `SoT/toolchain.json:24-30` installs Session Relay 0.15.0
under an exact four-digest `managed-release` pin, so reusing that child would not
distribute 0.16.0 and would make the current stable-release body inaccurate.

## Context & rationale

### A. Managed caller disconnect is misclassified as custody loss

The installed command reports `session-relay 0.14.0`. The operator's live
reproduction is not rerun by this plan because doing so mutates the shared
lifecycle registry and can brick another managed worker. The source path is
closed and reproducible:

1. `plugins/session-relay/rust/src/supervisor.rs:1142-1144` returns
   `lifecycle supervisor disconnected before reap` on EOF, while
   `supervisor.rs:1188-1200` turns non-timeout read errors, including the
   observed reset, into `read lifecycle supervisor event: ...`.
2. The watchdog explicitly says that spawning the supervisor transfers custody
   and caller disconnect must not abandon the owned process
   (`supervisor.rs:1294-1299`). That comment is correct; the connected-supervisor
   branch contradicts it.
3. `supervisor.rs:1948-1977` merges `Control::Cancel` and
   `Control::Disconnected`, calls `publish_disconnect_cancel`, mints a child
   cancellation permit, and kills the owned child. The transport callback is
   therefore deciding worker safety.
4. `plugins/session-relay/rust/src/lifecycle.rs:3415-3426` first proves the
   operation still has `ExternalCustody::ChildOwned` under the same supervisor.
   For a managed binding, `lifecycle.rs:3464-3481` then requires the worker to be
   `Active`, changes it to `Fencing`, increments its version, and writes a new
   `fence_epoch` plus `fence_reason: "supervisor caller disconnected"`.
   `lifecycle.rs:3493-3500` separately marks the operation cancelled and changes
   custody to `ChildCancelRequested`. The branch does not write `proof_gap`, so
   an initially null gap stays null; it also does not change the worker's
   execution backend.
5. Genuine loss of custody is already typed as
   `ExternalCustody::LostAuthority` with reasons including `SupervisorLost`
   (`lifecycle.rs:447-468`). The cancel-deadline path uses the stronger
   `FencingUnconfirmed` state and records a non-null proof gap
   (`lifecycle.rs:2939-2947`). Those conditions are distinct from an intact
   `ChildOwned` record.
6. SessionStart calls the managed gate at
   `plugins/session-relay/rust/src/hook.rs:291-295`. Managed resume validates the
   exact binding tuple and returns active only when the worker state is
   `Active`; every other state is refused
   (`lifecycle.rs:1508-1550`). This turns the mistaken fence into a persistent
   spawn+wake failure.

**Resolved design:** a caller transport disconnect with intact `ChildOwned`
custody must only mark the connected operation locally as disconnected. It must
not call the managed safety-fence/cancel transition and must not kill the owned
child. The supervisor continues to completion, drains output without writing to
the absent caller, reaps the child, and records the normal terminal transition
through `supervisor.rs:1999-2029`. Explicit `Control::Cancel` retains the current
cancel-and-reap behavior. Actual supervisor/custody loss retains the typed
`LostAuthority` and proof-gap safety paths.

The regression test lives in
`plugins/session-relay/rust/tests/lifecycle_supervisor.rs` beside
`lifecycle_supervisor_disconnect_linearizes_unmanaged_cancel_and_reap`
(`:474-533`). Add the exact test
`lifecycle_supervisor_disconnect_preserves_managed_worker_when_custody_intact`.
It must establish a managed `Active` worker, wait until the operation is
`ChildOwned`, terminate the caller, observe terminal `ChildReaped`, assert the
worker remains `Active` with unchanged version/fence/proof-gap fields, and prove
a second wake or managed resume succeeds. Reverting the production fix while
leaving the test must fail on the `Fencing` state and second-use assertion.
Register that test in
`plugins/session-relay/test/fixtures/rust-test-inventory.json`; never weaken the
inventory to hide the new case.

Rejected alternatives:

- **Auto-recoverable fence state:** rejected because it adds a state and recovery
  protocol for a condition that must not fence at all.
- **SessionStart self-heal:** rejected because it bypasses the managed safety
  boundary instead of fixing the transport callback that crossed it.

### B. Intel macOS target inventory and corrected timing evidence

A case-sensitive, ignored-file-inclusive sweep for
`x86_64-apple-darwin|macos-15-intel` finds **23 files**, not the prior estimate.
Thirteen contain live or mixed current-release pins; ten are wholly frozen. Two
additional live policy files describe the same four-target contract without
spelling either literal and therefore also change.

**Live or mixed current-release files:**

| File | Current lines | Classification and required action |
|---|---:|---|
| `.github/AGENTS.md` | 16 | LIVE policy; describe three native legs. |
| `.github/workflows/build-binaries.yml` | 145, 148-149, 263, 375, 418, 469, 499 | LIVE producer/aggregate/publication pins; remove only the Intel Darwin leg and make all closed counts three binaries plus `SHA256SUMS`. |
| `plugins/session-relay/test/distribution-contract.mjs` | 47, 458, 461-462 | LIVE current producer expectations; require Linux x64/arm64 and Darwin arm64. |
| `plugins/session-relay/test/release-evidence-contract.mjs` | 56, 262, 1074, 1077-1078, 1125 | LIVE current preflight fixtures and exact target sets; migrate to three. |
| `plugins/session-relay/test/release-promotion-contract.mjs` | 85, 439, 3411-3412 | MIXED; preserve historical 0.13/0.14 four-asset fixtures while current 0.16 promotion and adversarial cases require exactly three. |
| `plugins/session-relay/test/release-publication-contract.mjs` | 51, 112, 295, 2282-2283 | MIXED; preserve captured 0.13 asset row `:91-122` byte-identically, but split current 0.16 assets/attestations and current refusal cases onto the three-target set. |
| `scripts/verify-session-relay-preflight.mjs` | 48 | LIVE verifier matrix; remove the Intel runner and replace hard-coded four-entry diagnostics such as `:874` with the three-target contract. |
| `scripts/lib/plugins.mjs` | 82 | LIVE Session Relay descriptor target. |
| `scripts/lib/rust-bin.mjs` | 16 | LIVE supported-release identity; keep any compatibility parsing needed by frozen receipts separate from the current supported target set. |
| `scripts/lib/session-relay-release-core.mjs` | 34 | LIVE release asset set; three binaries plus `SHA256SUMS`. |
| `scripts/lib/session-relay-release-preparation.mjs` | 120 | LIVE target set; replace hard-coded four-binary diagnostics such as `:583-584`. |
| `scripts/lib/session-relay-release-promotion.mjs` | 78, 3654 | LIVE current public pin/smoke selection; current release refuses Intel Darwin while retained historical validators remain capable of reading old receipts. |
| `scripts/lib/session-relay-release-publication.mjs` | 103 | LIVE current target/runner map; preserve the closed historical 0.13 publication path and change current closed-set diagnostics such as `:625-626` to three. |

**Additional live four-target policy without either literal:**

- `plugins/session-relay/AGENTS.md:52-54,76-96` currently requires two macOS
  legs, four binaries/checksum rows, and four child digests; update it to one
  Apple-Silicon macOS leg, three binaries/checksum rows, and three child digests.
- `scripts/AGENTS.md:151-153` currently defines four native legs/artifacts;
  update it to the three-target producer and record the ref-retention decision
  below.

**Wholly frozen files and values:**

| File | Matching lines | Why frozen |
|---|---:|---|
| `docs/plans/finished/2026-07-02-session-relay-rust-port.md` | 55, 63, 68, 82, 127, 239 | Finished historical plan. |
| `docs/plans/finished/2026-07-03-durable-anchors-followups.md` | 55 | Finished verification record. |
| `docs/plans/finished/2026-07-03-session-relay-per-session-identity.md` | 45 | Finished historical plan. |
| `docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md` | 557, 2315, 2543 | Finished legacy evidence. |
| `docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md` | 31, 111, 129, 352, 468-469 | Finished plan and captured receipts/digests. |
| `docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md` | 321 | Finished historical plan. |
| `docs/plans/finished/2026-07-23-session-relay-linux-workspace-recertification.md` | 224 | Captured four-target receipt. |
| `docs/plans/finished/2026-07-28-session-relay-linux-workspace-release.md` | 62, 79, 114 | Finished historical plan. |
| `docs/plans/finished/2026-08-02-session-relay-0.15.0-release.md` | 543 | Immutable published 0.15.0 digest evidence. |
| `plugins/session-relay/test/companion-distribution-contract.mjs` | 24-50, 151-265, 458 | The historical plan, 0.13.0 asset, digest, receipt, and archive fixtures stay byte-identical. The complete `CURRENT_*` child/parent identity tuple, `CURRENT_ASSET_DIGESTS`, and current three-target key-set assertion move together to the live docks-kit 0.14.0 / Relay 0.16.0 generation. |

The published 0.15.0 archive records all four downloaded digests at
`docs/plans/finished/2026-08-02-session-relay-0.15.0-release.md:539-544`.
Those values, every captured receipt, `scripts/lib/session-relay-release-instances/0.15.0.json`,
and every finished plan remain byte-identical.

The prior wall-clock claim is corrected rather than repeated. In the actual
0.15.0 producer run `30732536780`, the Intel macOS job ran
04:32:17Z-04:34:31Z (**134 s**) while aarch64 Linux ran
04:32:17Z-04:33:50Z (**93 s**); Intel macOS was the critical build leg. With
unchanged scheduling, removing it moves aggregate readiness to the aarch64 Linux
leg, approximately 41 seconds earlier, rather than saving zero wall-clock time.
GitHub's current billing table prices standard macOS at $0.062/minute and Linux
x64 at $0.006/minute (about 10.3x) for billed use, although standard runners in
this public repository are currently free. The durable reason to drop the leg is
the operator's aarch64-only support boundary plus reduced runner consumption;
the plan does not assert an observed invoice saving.

The prerelease and stable release bodies must contain this deprecation note:
`x86_64-apple-darwin is no longer published as of Session Relay 0.16.0; macOS support is aarch64-apple-darwin.`
The workflow-generated prerelease body and the release-core expected bodies must
stay byte-identical.

### C. Preflight branch retention

`scripts/verify-session-relay-preflight.mjs:301-337` validates that a successful
run is on `preflight/session-relay-<version>-<commit12>` and records the full ref.
Artifact verification requires the same head branch at `:475-500`. The verifier
contains no ref creation or deletion. A read-only
`git ls-remote --heads origin 'preflight/*'` on 2026-08-02 returned **19** refs.

These are the baseline refs observed at drafting time; every one of them must
still exist after the release:

```
refs/heads/preflight/session-relay-0.12.0-00284a84acb9
refs/heads/preflight/session-relay-0.12.0-0f47fb7bccb1
refs/heads/preflight/session-relay-0.12.0-12fc047e8931
refs/heads/preflight/session-relay-0.12.0-321e02c28408
refs/heads/preflight/session-relay-0.12.0-45f9e0f2a0eb
refs/heads/preflight/session-relay-0.12.0-86bf4eebe8f5
refs/heads/preflight/session-relay-0.12.0-e20541c29b37
refs/heads/preflight/session-relay-0.12.0-e20541c905e1
refs/heads/preflight/session-relay-0.12.0-ef3d99fb9fef
refs/heads/preflight/session-relay-0.13.0-0f43985a5306
refs/heads/preflight/session-relay-0.13.0-3fb9211f3309
refs/heads/preflight/session-relay-0.13.0-5ef57785df57
refs/heads/preflight/session-relay-0.13.0-79eaf56ed941
refs/heads/preflight/session-relay-0.13.0-89d55ec25db4
refs/heads/preflight/session-relay-0.13.0-b12c772d
refs/heads/preflight/session-relay-0.13.0-bcf9982283bd
refs/heads/preflight/session-relay-0.13.0-fba4a16f
refs/heads/preflight/session-relay-0.13.0-fba4a16fa00b
refs/heads/preflight/session-relay-0.15.0-4c372a8dec2d
```

**Resolved retention policy:** retain every Session Relay `preflight/*` ref
indefinitely as release evidence. `scripts/AGENTS.md` owns this policy. Release
code and this 0.16.0 run must not delete, rewrite, or automatically age out a
preflight ref. A future cleanup is explicitly deferred until a separate plan
proves that no finished plan, receipt, workflow run, tag, or recovery path
relies exclusively on each candidate ref. Every deletion in that future plan
must be a separately authorized `push` effect with exact ref names. This plan has
no deletion row and the count must not decrease.

### D. Release identity and child decision

Session Relay version surfaces move from 0.15.0 to 0.16.0 in
`plugins/session-relay/rust/Cargo.toml:3`, `Cargo.lock:48`, both plugin manifests,
the marketplace entry selected by `name: session-relay`, and
`scripts/lib/session-relay-release-core.mjs:13`. Create
`scripts/lib/session-relay-release-instances/0.16.0.json`; do not edit the
0.15.0 instance. Re-point only current-release assertions and regenerate the
release-identity inventory through its own `--freeze` mode.

A new public child **is required**. Docks-kit 0.14.0 is the chosen child version
and `cli-v0.14.0` its tag. Its separate PlanRunV1 must share this goal's
`goal_id`, carry its own `run_id`, replace the exact 0.15.0 four-digest toolchain
pin with the independently verified 0.16.0 three-digest pin, and finish before
stable parent promotion. Before the staged parent tag exists, the new
`0.16.0.json` instance may bind the real, already-finished 0.13.0 child as the
then-current public child; that is retained evidence, not a placeholder. After
the 0.16.0 digests exist and the new child finishes, the same unreviewed local
instance moves to the observed docks-kit 0.14.0 version, `cli-v0.14.0` tag,
child `run_id`, and independently reproduced implementation-content digest.
Those are the final `public_child` values reviewed and shipped. The 0.13.0
content digest must not survive in the final instance, and no guessed value or
schema-valid sentinel is allowed.

The normal current PlanRun release path uses the six modes verified by the
0.15.0 archive and present in
`scripts/lib/session-relay-release-cli.mjs:23-134`:
`--bind-completion`, `--publish-reviewed --rebind-complete-publication`,
`--emit-public-request`, `--verify-public-release`, `--promote-reviewed`, and
`--finalize-reviewed`. Preparation/materialization and source-CI modes are
pre-release evidence paths; `--resume-promotion` and
`--rebind-promotion-evidence` are recovery-only and require their own exact
receipt state, never an ordinary shortcut.

The final implementation binding has a strict order. First commit the complete
local implementation checkpoint. Confirm repository `HEAD` equals that exact
commit. Mint acceptance from the live affected-path manifest at that HEAD and
bind the same SHA as `implementation_commit`. Only then reserve completion
review. This is required because the live manifest's `source_base` must be HEAD
while `bindPlanRunCompletion` recomputes the accepted implementation manifest at
`implementation_commit`. If HEAD differs, STOP; never bind a prior commit and
never repair the mismatch by guessing a manifest base.

### E. Release invariants {mechanism}

A caller transport disconnect with intact `ChildOwned` custody only marks the
connected operation locally as disconnected; it never fences, cancels, or
kills the managed worker, while genuine supervisor/custody loss retains the
typed `LostAuthority` and proof-gap safety paths. The staged tag and
prerelease boundary is irreversible: the tag is never re-pointed, assets are
never replaced, and stable promotion re-verifies binaries byte-identical to
the independently hashed staged assets. Acceptance is minted at repository
HEAD and bound to the same SHA as `implementation_commit`, so the reviewed
manifest and the shipped implementation are digest-bound to one commit. Every
Session Relay `preflight/*` ref is retained indefinitely as release evidence
and no release code deletes, rewrites, or ages out a ref.

## Environment & how-to-run

Run commands from the repository root unless a command contains its own
subshell. Required tools are Node 24, pnpm through Corepack, Rust 1.85 selected
by `plugins/session-relay/rust/rust-toolchain.toml`, `gh`, and Git.

```bash
corepack enable
pnpm install --frozen-lockfile
node scripts/ci.mjs --plugin session-relay
```

Rust commands use `(cd plugins/session-relay/rust && ...)` so rustup sees the
pinned toolchain. External commands require a fresh live `ExternalAuthorityV1`
matching the exact Effect, mode, target, and current user-message digest.
Persisted plan intent, review, a tag, or a receipt is not authority. `probe` is
read-only and non-transitive; `release` and `push` each require their own live
mutation authority.
Before A11-A12, export `EXECUTION_PARENT` and `IMPLEMENTATION_COMMIT` from the
installed current PlanRunV1 after the implementation checkpoint; do not type or
infer either SHA independently.


The tag workflow stages a prerelease from its own three native build jobs. That
irreversible staging boundary necessarily precedes child digest insertion. The
post-child local lane migration, full gate, implementation checkpoint, live
acceptance binding, and completion review must all finish before stable
promotion. Never treat the staged tag commit as the later implementation
checkpoint.

> **Successor-5 note — completion binder review-base mismatch.** The predecessor completed and
> passed its full execution-parent-to-implementation review, but `--bind-completion` then failed
> with `stale CompletionReviewV1 diff_sha256 binding`. The measured cause is exact: the PlanRun
> completion bundle hashes `execution_parent..implementation_commit`, while
> `currentCompletionEvidence` reconstructs `source_base..implementation_commit`. Those commits are
> deliberately distinct in this release because `source_base` is the immutable tagged source and
> `execution_parent` is the parent of the complete reviewed implementation. Rows 1-12 are inherited
> world state and remain intact. This successor adds one red-first fixture with distinct bases,
> repairs only the PlanRun completion review base, reruns the full gate, checkpoints, and resumes
> the still-unpublished main/stable boundary. No tag, asset, child, or prerelease is changed.
>
## Steps

> **Successor note - move the complete live companion generation.**
> Steps 1-11 remain inherited world state. The predecessor proved that changing only
> `CURRENT_PUBLIC_RELAY_VERSION` is insufficient: the same live contract also binds the current
> docks-kit version, child and Docks PlanRun identities, implementation commits, asset digests, and
> target key set. This successor moves that complete `CURRENT_*` / `CURRENT_ASSET_DIGESTS` tuple to
> docks-kit 0.14.0 and Relay 0.16.0, and changes the current key-set assertion from four targets to
> the shipped three. Every `HISTORICAL_*` value, frozen plan digest, retained receipt, and 0.13.0 /
> 0.15.0 fixture stays byte-identical. The 0.16.0 instance and promotion census bind this run
> and its exact 28-path declaration. No release artifact is retagged, replaced, or republished.

> **Successor note - two corrections, no new release work.**
> Steps 1-11 are inherited world state. The tag, the staged prerelease and the published docks-kit
> 0.14.0 child are untouched; nothing is retagged, replaced, or republished.
>
> A14 embedded an absolute machine path to reach the shipped `canonicalize` helper, which
> `plan-skill-phases --case bounded-workflows` correctly rejects: plan text must stay portable. It
> now resolves that helper and the release instance with `path.resolve` plus `pathToFileURL`.
>
> `companion-distribution-contract.mjs` was classified frozen, but its
> `CURRENT_PUBLIC_RELAY_VERSION` is compared against the LIVE public checkout, which the child moved
> to `0.16.0`. A pin on a live cross-repository value cannot be frozen across a generation bump
> without guaranteeing a red gate. The file is now declared, and only that one current-generation
> pin moves; its retained 0.13.0/0.15.0 fixtures stay byte-identical.


> **Successor note - why this run is installed at the tagged commit.**
> Steps 1-10 are inherited world state, all performed by the predecessor run and left intact
> here: `step:read_child` observed the published docks-kit 0.14.0 child and A14 exited 0 against
> it, and `step:finalize_instance` bound that child, its tag, its reproduced content digest and
> the real release tag commit into the 0.16.0 instance. Their rows read `done` for that reason. Nothing is retagged, replaced, or republished: tag
> `session-relay--v0.16.0` stands at `875661640c1c45894c66a9b2fdc437fd47307e1f`, its prerelease is
> staged and digest-verified, and the docks-kit 0.14.0 child is published and archived.
>
> The predecessor blocked because its `source_base` postdated its own tag. `bindPlanRunCompletion`
> requires `source_base` to be an ancestor of the release tag, while
> `release-evidence-contract.mjs:3680` requires the instance's `docks_source_base` to equal that
> same `source_base`; a run installed after its own tag cannot satisfy both. This successor is
> installed while HEAD is exactly the tagged release-source commit, so `source_base` IS that commit,
> ancestry is `identical`, and the two requirements agree.


> **Successor note - why Steps 1-8 read `done` and what this run changes.**
> This run replaces a terminal predecessor blocked `verification_failed`. Steps 1-8 are inherited
> world state, not work this run performs. Their effects are irreversible and must never be
> repeated: tag `session-relay--v0.16.0` exists at `875661640c1c45894c66a9b2fdc437fd47307e1f`, the
> prerelease is staged with exactly three binaries plus `SHA256SUMS`, and A9 and A10 both passed
> against it.
>
> The predecessor accepted `v1_acceptance_coverage_incomplete`, repaired it by adding A14, and then
> the same class recurred IN A14 itself, which is terminal by contract. The defect was real: A14
> resolved the child from an unbound local checkout, never checked the archive's embedded
> `plan_path`, and never reproduced the child implementation-content digest. A14 is now remote-only
> and reproduces that digest by the shipped definition. The lesson is recorded in the sweep
> discipline: the row added to close a class is the row to judge hardest against it.


> **Successor note - why Steps 1-8 read `done` and what this run changes.**
> This run replaces a terminal predecessor blocked `verification_failed`. Steps 1-8 describe world
> state inherited from that predecessor, not work this run performs, so they carry `done`. Their
> effects are irreversible and must not be repeated: tag `session-relay--v0.16.0` exists at
> `875661640c1c45894c66a9b2fdc437fd47307e1f`, the prerelease is staged with exactly three binaries
> plus `SHA256SUMS`, and A9 and A10 both passed against it. Never re-tag, re-stage, or replace an
> asset.
>
> The predecessor coupled acceptance to a DATE. Step 9 cited the finished child archive as
> `2026-08-02-...`, and `distribution-contract.mjs:45` pinned that literal while line 1112 asserted
> the parent's own prose matched it. The archive prefix is the child's FINISH date; the child does
> not exist yet and cannot finish before 2026-08-03, so the pinned path was unreachable, and
> repointing the contract at the real path would have failed the assertion against prose that
> `plan_sha256` freezes.
>
> The fix removes the date from the coupling rather than moving it one day, so the trap cannot
> recur on the next child. The child is cited by stable identity - shared `goal_id`, tag
> `cli-v0.14.0`, npm `docks-kit@0.14.0` - and its archive is resolved by the date-free suffix
> `-session-relay-0.16.0-docks-kit-0.14.0-release.md` under `docs/plans/finished/`. Backdating the
> child was considered and rejected: the prefix is a fact about when that plan finished.


> **Successor note - why Steps 1-5 read `done` and what this run changes.**
> This run replaces a terminal predecessor blocked `verification_failed`. That predecessor's
> implementation is complete and committed at `2a57476`; Steps 1-5 describe world state inherited
> from that commit, not work this run performs, so they carry `done`.
>
> The predecessor blocked for one reason. `step:drop_intel` takes the build matrix in
> `.github/workflows/build-binaries.yml` from four legs to three, and
> `scripts/tests/ci-plugin-targeting.mjs:1218-1219` is a census of that exact matrix
> (`assert.equal(matrix.length, 4)`). That file was undeclared, so the predecessor could not move
> it and the full gate could not go green inside its own `affected_paths`.
>
> The predecessor's A7 was `node scripts/ci.mjs --plugin session-relay`. The targeted gate skips
> repo-wide CI-targeting checks by design, so it passed over a repository whose full gate was red.
> That narrowness was the deeper defect: this lane edits repo-wide CI topology, and the
> repository's rule is that such a change is gated by the full run. This successor therefore does
> two things: it declares `scripts/tests/ci-plugin-targeting.mjs` and it raises A7 to the full
> `node scripts/ci.mjs`, so the acceptance matches the blast radius of the change it accepts.
>
> One further full-gate failure was measured and is not this lane's:
> `rust-test-inventory --case workspace_lease_process` failed once inside the gate and passed 3/3
> in isolation. It is the pre-existing workspace parallelism flake already recorded in this
> repository, and it is not repaired here.


> **Successor note - why this run replaces a terminal `review_failed` predecessor.**
> Draft review invocation 2 returned one finding of class `v1_contract_contradiction`, a class the
> predecessor had already accepted at invocation 1. A repeated accepted class is terminal by
> contract, so the predecessor blocked and this successor carries the fix. The defect: Acceptance
> A5 asserted the instance child is docks-kit `0.14.0` unconditionally, while `step:bump_version`
> writes the retained finished `0.13.0` child as pretag evidence and `step:focused_proof` requires
> A1-A7 to pass before the `0.14.0` child can exist. A5 now states the child phase-dependently,
> exactly as it already stated the tag commit. `release-instance-contract.mjs` derives both fields
> from the instance file - its `0.13.0`/`0.14.0`/`0.15.0` literals are Relay instance generations,
> not child versions - so one command remains correct in both phases and no step moved.
>
> The predecessor's sweep cleared every unit for every accepted class in one pass. That was the
> mechanism failure behind the repeat: a blanket clear is not a judgement. This successor's sweep,
> if one is needed, must judge each unit against each class on its own evidence.


| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | regression_first | Add the managed caller-disconnect regression before changing production behavior, and register its exact test identity. | `plugins/session-relay/rust/tests/lifecycle_supervisor.rs`; `plugins/session-relay/test/fixtures/rust-test-inventory.json` | — | `local` | `done` | The named test reaches `ChildOwned`, kills the caller, and fails against the current source because the worker becomes `Fencing`; the failure signature is the state/second-use assertion, not setup. If it passes before the fix or fails earlier, STOP and repair the test. |
| 2 | cancel_split | Separate explicit cancel from transport disconnect so intact supervisor custody completes and reaps without fencing the managed worker. | `plugins/session-relay/rust/src/supervisor.rs` | 1 | `local` | `done` | Explicit cancel still publishes cancel, kills, and reaps; caller disconnect suppresses writes to the absent caller, never invokes `publish_disconnect_cancel`, lets the child terminate normally, records `ChildReaped`, and leaves the managed worker byte-for-field Active. The new regression and existing lifecycle-supervisor integration test both pass. Failure: STOP; do not weaken `LostAuthority`, hook admission, or managed-state checks. |
| 3 | drop_intel | Drop the Intel macOS current producer target, migrate every live three-target consumer and policy, preserve all historical/frozen four-target bytes, and add the deprecation note to both release bodies. | `.github/AGENTS.md`; `.github/workflows/build-binaries.yml`; `plugins/session-relay/AGENTS.md`; `plugins/session-relay/test/distribution-contract.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/session-relay/test/release-promotion-contract.mjs`; `plugins/session-relay/test/companion-distribution-contract.mjs`; `plugins/session-relay/test/release-publication-contract.mjs`; `scripts/AGENTS.md`; `scripts/lib/plugins.mjs`; `scripts/lib/rust-bin.mjs`; `scripts/lib/session-relay-release-core.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/lib/session-relay-release-publication.mjs`; `scripts/tests/ci-plugin-targeting.mjs`; `scripts/verify-session-relay-preflight.mjs` | 2 | `local` | `done` | Current 0.16 producer/preflight/publication/promotion accepts exactly Linux x64, Linux arm64, macOS arm64 plus `SHA256SUMS`; current Intel Darwin is rejected; retained 0.13/0.14/0.15 receipts and captured fixtures still validate byte-identically; workflow and core bodies include the exact deprecation sentence. Failure: STOP on any historical digest, receipt or finished-plan diff, or on any change to `companion-distribution-contract.mjs` beyond its single current-generation pin. The repo-wide build-matrix census in `scripts/tests/ci-plugin-targeting.mjs` moves from four legs to three in the same step that removes the leg, so the full gate never observes a matrix and a census that disagree. |
| 4 | retain_refs | Record indefinite preflight-ref retention in its owning policy without adding any cleanup implementation. | `scripts/AGENTS.md` | 3 | `local` | `done` | Policy states that every `preflight/*` ref is retained, release automation never deletes one, and any future exact-ref deletion requires a separate plan and separately authorized `push` row. Failure: STOP if an implementation path deletes or rewrites a ref. |
| 5 | bump_version | Bump the tag-bearing Relay crate/manifests to 0.16.0 and prepare the current-release lane identities without changing frozen 0.15.0 evidence. | `.claude-plugin/marketplace.json`; `plugins/session-relay/.claude-plugin/plugin.json`; `plugins/session-relay/.codex-plugin/plugin.json`; `plugins/session-relay/rust/Cargo.lock`; `plugins/session-relay/rust/Cargo.toml`; `scripts/lib/session-relay-release-core.mjs`; `scripts/lib/session-relay-release-instances/0.16.0.json`; `plugins/session-relay/test/fixtures/release-identity-inventory.json`; `plugins/session-relay/test/release-instance-contract.mjs` | 3, 4 | `local` | `done` | Cargo metadata, three manifests, marketplace Session Relay entry, and core `VERSION` are 0.16.0. The new closed instance binds this parent plus the real finished 0.13.0 child as retained pretag evidence and has `release_tag_commit: null`; it contains no invented future child or tag value. The inventory is regenerated only through `release-instance-contract.mjs --freeze`; the 0.15.0 instance and finished evidence are byte-identical. This step also requires this plan’s own installed parent PlanRun identity to be present and bound before it runs. Failure: STOP on any guessed identity, invalid instance, or historical drift. |
| 6 | focused_proof | Run focused red/green proof, Rust integration, target-contract suites, instance validation, and the authoritative plugin gate on the complete local tree. | all affected paths in frontmatter | 5 | `local` | `done` | A1-A7 pass, including the full `node scripts/ci.mjs`; reverting only the disconnect fix makes A1 fail; restoring it returns green; current three-target assertions bite while retained historical four-target assertions remain green. Failure: repair the source, never a floor, frozen receipt, census count, or historical expectation. |
| 7 | tag_stage | Tag the exact release-source commit and stage the 0.16.0 prerelease through the three-leg native producer. | `.github/workflows/build-binaries.yml` | 6 | `release` | `done` | Exact live release authority matches DocksDocks/docks and the tag/release targets; the immutable tag resolves to the focused-gate-verified release-source commit; one successful tag run publishes exactly three binaries plus `SHA256SUMS`, prerelease true, with the exact deprecation body. The release boundary is the Git ref `refs/tags/session-relay--v0.16.0` and the GitHub prerelease `session-relay--v0.16.0`. Failure: STOP permanently; never retag, replace, or clobber. |
| 8 | verify_assets | Independently download and hash every staged 0.16.0 binary against its checksum row. | — | 7 | `probe` | `done` | Fresh downloaded bytes produce exactly three matching SHA-256 rows, no Intel Darwin/Windows/extra asset, and the three values are handed to the child. `SHA256SUMS` alone is not evidence. This step probes the GitHub prerelease `session-relay--v0.16.0` and its assets `session-relay-aarch64-apple-darwin`, `session-relay-aarch64-unknown-linux-musl`, `session-relay-x86_64-unknown-linux-musl`, and `SHA256SUMS`. Any mismatch is STOP after the burned tag. |
| 9 | read_child | Read back the separately reviewed and released docks-kit 0.14.0 child that pins the three observed Relay assets. | — | 8 | `probe` | `done` | Exact live probe authority permits read-only DocksDocks/public/GitHub/npm reads; child tag, npm provenance, finished PlanRunV1, passed completion review, three independently verified Relay pins, shared `goal_id`, distinct `run_id`, and reviewed implementation-content digest all agree. The public child release and archive — `DocksDocks/public` tag `cli-v0.14.0`, npm `docks-kit@0.14.0`, and the finished child archive `the finished child archive, the single file under `docs/plans/finished/` whose name ends `-session-relay-0.16.0-docks-kit-0.14.0-release.md` (its date prefix is the child's own finish date and is never pinned here)` — must already exist as a precondition of this step; the finished archive's own embedded PlanRunV1 `plan_path` field is the stable identity that is checked, because archival moves the plan out of `docs/plans/active/` and no active child plan file exists after the child finishes. Failure: STOP; the parent neither edits public nor substitutes child 0.13.0. A14 is the runnable proof of every identity named here: it resolves the child archive by its date-free suffix and fails closed on any mismatch. |
| 10 | finalize_instance | Finalize the 0.16.0 instance and re-point only current release-lane contracts to the completed child and three-target generation. | `scripts/lib/session-relay-release-instances/0.16.0.json`; `scripts/lib/session-relay-release-preparation.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/lib/session-relay-release-publication.mjs`; `plugins/session-relay/test/distribution-contract.mjs`; `plugins/session-relay/test/fixtures/release-identity-inventory.json`; `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/session-relay/test/release-instance-contract.mjs`; `plugins/session-relay/test/release-promotion-contract.mjs`; `plugins/session-relay/test/release-publication-contract.mjs` | 9 | `local` | `done` | The new instance binds child 0.14.0/tag/run/content digest and the real tag commit; current contracts consume 0.16.0/three targets while retained generations stay immutable; the sentinel/unborn sweep is empty; A2-A7 pass again. Failure: STOP on guessed identity, historical-byte drift, or a current assertion derived from the same value it is meant to check. `CURRENT_PUBLIC_PLAN` in `plugins/session-relay/test/distribution-contract.mjs` resolves the child archive by that date-free suffix, so no acceptance row depends on the day the child happens to finish. A14 is re-run after this repoint and must pass with the instance naming the `0.14.0` child, which is where its reproduced-digest comparison binds. |
| 11 | verify_child_binding | Re-read the completed child under fresh exact live probe authority, now that the instance names it, and confirm the finalized binding. | — | 10 | `probe` | `done` | With exact live probe authority for read-only `DocksDocks/public`, GitHub and npm reads, A14 exits 0 with the instance naming the `0.14.0` child, so its reproduced-digest and `public_run_id` comparisons bind rather than pass vacuously. This row exists because A14 performs network reads: `step:finalize_instance` is `local` and cannot authorize them, and probe authority is exact and non-transitive. Failure: STOP; do not repoint the instance again without a fresh observation. |
| 12 | impl_checkpoint | Commit the complete implementation checkpoint, require HEAD equality, bind live acceptance, and only then reserve and pass completion review. | all affected paths in frontmatter | 10 | `local` | `done` | `git diff --name-only "$EXECUTION_PARENT" "$IMPLEMENTATION_COMMIT"` covers every changed implementation path in this run and no undeclared path; `git rev-parse HEAD` equals `implementation_commit` while acceptance is minted; its live manifest `source_base` equals that SHA; a fresh CompletionReviewV1 passes the exact commit and full execution-parent-to-implementation diff. The manager-owned lifecycle record `docs/plans/active/session-relay-0.16.0-release.md` changes through the plan lifecycle only, not as a step-edited implementation file. Failure: STOP before promotion; never reserve first or bind an earlier commit. |
| 13 | binder_regression | Add a synthetic PlanRun completion fixture whose tagged `source_base` and reviewed `execution_parent` are distinct, and prove the current binder rejects the otherwise valid passed review with the observed stale-diff signature. | `plugins/session-relay/test/release-evidence-contract.mjs` | 12 | `local` | `planned` | The new fixture fails before the production fix because the binder hashes the tag-based source range instead of the reviewed execution range. It keeps the immutable tag ancestry valid and changes no published receipt. A setup, ancestry, or manifest failure is not the required red result. |
| 14 | binder_review_base | Reconstruct current PlanRun completion evidence from `execution_parent` while retaining `source_base` for source/tag ancestry and the implementation commit for acceptance manifests. | `scripts/lib/session-relay-release-preparation.mjs` | 13 | `local` | `planned` | The current PlanRun binder validates the exact passed CompletionReviewV1 diff when `source_base != execution_parent`; retained non-PlanRun completion behavior and all ancestry checks remain unchanged. Failure: STOP rather than weakening diff, ancestry, or acceptance equality. |
| 15 | binder_reproof | Run the focused release-evidence contract and the complete authoritative repository gate on the successor bytes. | all affected paths in frontmatter | 14 | `local` | `planned` | A16 and A7 pass. Reverting only the review-base fix makes A16 fail with the original stale-diff signature; restoring it returns green. |
| 16 | successor_checkpoint | Commit the successor implementation, bind live acceptance at that exact HEAD, and pass a fresh completion review over the predecessor implementation through this fix. | all affected paths in frontmatter | 15 | `local` | `planned` | HEAD, implementation commit, acceptance manifest source base, and the fresh CompletionReviewV1 all bind one exact successor commit; the reviewed diff includes the regression and production repair. |
| 17 | publish_main | Bind completion and publish the reviewed implementation to the target branch through the first two current PlanRun release modes. | — | 16 | `push` | `planned` | With exact live push authority matching the DocksDocks/docks branch `main` target, run in order `--bind-completion`, then `--publish-reviewed --rebind-complete-publication`; remote `main` becomes exactly the reviewed implementation and every no-clobber receipt validates. Failure: STOP with receipts; no recovery-only mode without its exact documented state. A15 is the runnable remote read-back proving this row's remote claim. |
| 18 | promote_stable | Promote the existing byte-identical prerelease to stable through the remaining current PlanRun release modes. | release receipts | 17 | `release` | `planned` | With exact live release authority, after step:publish_main run in order `--emit-public-request`, `--verify-public-release`, `--promote-reviewed`, `--finalize-reviewed`; every no-clobber receipt validates, the stable release is non-draft/non-prerelease, its body includes the Intel deprecation sentence, and the three binaries plus checksum are byte-identical to step:verify_assets. The promotion target is the GitHub release `session-relay--v0.16.0` only; this row claims no branch target. Failure: STOP with receipts; no recovery-only mode without its exact documented state. |
| 19 | probe_refs | Re-read the remote preflight refs after promotion and prove every recorded baseline ref individually survives. | — | 18 | `probe` | `planned` | With exact live probe authority for read-only `git ls-remote --heads origin 'preflight/*'`, A8 passes: every baseline ref named in the rationale section C fenced list is individually present on the remote; an unchanged total count is not evidence, because the added 0.16.0 validate-only ref can mask one deletion. Failure: STOP; name the first missing ref and treat its absence as an unauthorized deletion. |
| 20 | archive_push | Finish, archive, commit, push, and remotely read back the terminal plan. | — | 18, 19 | `push` | `planned` | Exact live push authority matches the archive/main target; PlanRunV1 is finished with bound acceptance and passed completion review; the active plan moves once to the dated archive; the archive checkpoint is pushed and remotely readable; no preflight ref was deleted, with every baseline ref proven present by step:probe_refs. This step’s targets are the lifecycle-managed plan record `docs/plans/active/session-relay-0.16.0-release.md`, its dated archive `the lifecycle-selected archive path `docs/plans/finished/<finish-date>-session-relay-0.16.0-release.md`, where `<finish-date>` is the UTC date on which the archive transaction actually runs and is never pinned in advance; the push and the remote read-back both use the path that transaction reports`, and DocksDocks/docks branch `main`; the archive transaction owns those paths, so they are not step-edited files. Failure before the archive transaction: leave the run ongoing and do not claim archive completion. Failure after the archive transaction or archive checkpoint: preserve the finished archive and checkpoint, stop with receipts, and resume only the idempotent push plus A15 remote read-back under fresh exact push authority; never repeat archival. A15 is the runnable remote read-back proving this row's remote claim. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `(cd plugins/session-relay/rust && cargo test --locked --test lifecycle_supervisor lifecycle_supervisor_disconnect_preserves_managed_worker_when_custody_intact -- --exact)` | Exit 0; after caller death with intact `ChildOwned` custody, the operation reaches terminal `ChildReaped`, the managed worker remains `Active` with unchanged fence/proof fields, and a second use succeeds. Reverting the production fix makes this test fail. |
| A2 | `(cd plugins/session-relay/rust && cargo test --locked --test lifecycle_supervisor)` | Exit 0; explicit unmanaged cancel/reap, true supervisor-loss fencing, bootstrap disconnect, PTY, and managed claim transfer retain their existing semantics. |
| A3 | `node plugins/session-relay/test/distribution-contract.mjs && node plugins/session-relay/test/release-evidence-contract.mjs` | Exit 0; the current producer/preflight matrix has exactly three native targets and historical evidence remains closed. |
| A4 | `node plugins/session-relay/test/release-publication-contract.mjs && node plugins/session-relay/test/release-promotion-contract.mjs` | Exit 0; current publication/promotion requires three Relay binaries plus `SHA256SUMS`, rejects Intel Darwin as an extra current asset, and still validates frozen four-asset predecessors. |
| A5 | `node plugins/session-relay/test/release-instance-contract.mjs` | Exit 0; the 0.16.0 instance is closed and fully mapped, and frozen instance generations remain unchanged. Two fields are phase-dependent and the contract derives both from the instance file rather than pinning them: the child is the retained finished docks-kit 0.13.0 before `step:finalize_instance` and docks-kit 0.14.0 with reproduced content digest after it, and the tag commit is null only before tagging. |
| A6 | `(cd plugins/session-relay/rust && cargo metadata --format-version 1 --no-deps)` | Exit 0; exactly one package is emitted and `packages[0].version` is `0.16.0`; `Cargo.lock` agrees. |
| A7 | `node scripts/ci.mjs` | Exit 0 on the complete local implementation with the Session Relay Rust, self-test, inventory, manifest, distribution, release-evidence, publication, promotion, and instance gates green. |
| A8 | `sh -c 'set -eu; live="$(git ls-remote --heads origin "preflight/*" | cut -f2)"; for ref in refs/heads/preflight/session-relay-0.16.0-875661640c1c refs/heads/preflight/session-relay-0.12.0-00284a84acb9 refs/heads/preflight/session-relay-0.12.0-0f47fb7bccb1 refs/heads/preflight/session-relay-0.12.0-12fc047e8931 refs/heads/preflight/session-relay-0.12.0-321e02c28408 refs/heads/preflight/session-relay-0.12.0-45f9e0f2a0eb refs/heads/preflight/session-relay-0.12.0-86bf4eebe8f5 refs/heads/preflight/session-relay-0.12.0-e20541c29b37 refs/heads/preflight/session-relay-0.12.0-e20541c905e1 refs/heads/preflight/session-relay-0.12.0-ef3d99fb9fef refs/heads/preflight/session-relay-0.13.0-0f43985a5306 refs/heads/preflight/session-relay-0.13.0-3fb9211f3309 refs/heads/preflight/session-relay-0.13.0-5ef57785df57 refs/heads/preflight/session-relay-0.13.0-79eaf56ed941 refs/heads/preflight/session-relay-0.13.0-89d55ec25db4 refs/heads/preflight/session-relay-0.13.0-b12c772d refs/heads/preflight/session-relay-0.13.0-bcf9982283bd refs/heads/preflight/session-relay-0.13.0-fba4a16f refs/heads/preflight/session-relay-0.13.0-fba4a16fa00b refs/heads/preflight/session-relay-0.15.0-4c372a8dec2d; do printf "%s\n" "$live" | grep -qxF "$ref" || { echo "missing baseline ref: $ref" >&2; exit 1; }; done'` | Exit 0 only when every one of the 19 recorded baseline `preflight/*` refs is individually present on the remote; a missing baseline ref exits non-zero naming that ref, and it fails even when the total count is unchanged because the added 0.16.0 validate-only ref replaced it in the tally. The 0.16.0 ref is additional retained evidence, never a replacement for an older ref. The set includes this lane's own `refs/heads/preflight/session-relay-0.16.0-875661640c1c`, so retention covers the ref this release added and not only the older baseline. |
| A9 | `sh -c 'set -eu; v="$(gh release view session-relay--v0.16.0 --json isDraft,isPrerelease,body)"; printf "%s" "$v" | jq -e ".isDraft == false and .isPrerelease == true" > /dev/null; printf "%s" "$v" | jq -r ".body" | grep -Fq "x86_64-apple-darwin is no longer published as of Session Relay 0.16.0; macOS support is aarch64-apple-darwin."'` | Exit 0 only when the staged release reports draft false and prerelease true AND its body contains the exact sentence `x86_64-apple-darwin is no longer published as of Session Relay 0.16.0; macOS support is aarch64-apple-darwin.`. The command asserts all three; it does not merely print them, so a body missing the deprecation sentence fails here. |
| A10 | `sh -c 'set -eu; remote="$(gh release view session-relay--v0.16.0 --json assets --jq ".assets[].name" | sort)"; expect="$(printf "%s\n" SHA256SUMS session-relay-aarch64-apple-darwin session-relay-aarch64-unknown-linux-musl session-relay-x86_64-unknown-linux-musl | sort)"; test "$remote" = "$expect"; d="$(mktemp -d)"; chmod 700 "$d"; gh release download session-relay--v0.16.0 --pattern "session-relay-*" --pattern SHA256SUMS --dir "$d"; cd "$d"; test "$(ls -A | sort)" = "$(printf "%s\n" SHA256SUMS session-relay-aarch64-apple-darwin session-relay-aarch64-unknown-linux-musl session-relay-x86_64-unknown-linux-musl | sort)"; test "$(wc -l < SHA256SUMS)" -eq 3; test "$(sha256sum -c SHA256SUMS | grep -cx ".*: OK")" -eq 3; s="${XDG_STATE_HOME:-$HOME/.local/state}/docks/release/session-relay-0.16.0"; mkdir -p "$s"; chmod 700 "$s"; cp SHA256SUMS "$s/SHA256SUMS.staged"'` | Exit 0 only when the fresh mode-700 download directory contains exactly the four names `session-relay-aarch64-apple-darwin`, `session-relay-aarch64-unknown-linux-musl`, `session-relay-x86_64-unknown-linux-musl`, and `SHA256SUMS` — any extra or missing name fails the sorted-listing comparison — `SHA256SUMS` has exactly three rows, `sha256sum -c` reports exactly three `OK` rows, and the verified checksum file is saved to mode-700 `${XDG_STATE_HOME:-$HOME/.local/state}/docks/release/session-relay-0.16.0/SHA256SUMS.staged` as the staged reference for the post-promotion byte comparison. The complete remote asset listing is compared with the four allowed names BEFORE any download, so an unexpected asset under any other name fails here instead of being invisible to a name-pattern download. |
| A11 | `sh -c 'set -eu; test -n "${EXECUTION_PARENT:-}"; test -n "${IMPLEMENTATION_COMMIT:-}"; changed="$(git diff --name-only "$EXECUTION_PARENT" "$IMPLEMENTATION_COMMIT")"; allowed="$(sed -n "/^affected_paths:/,/^related_plans:/{s/^  - //p;}" docs/plans/active/session-relay-0.16.0-release.md; echo docs/plans/active/session-relay-0.16.0-release.md)"; for f in $changed; do printf "%s\n" "$allowed" | grep -Fqx "$f" || { echo "undeclared change: $f"; exit 1; }; done; if printf "%s\n" "$changed" | grep -qE "^(docs/plans/finished/|scripts/lib/session-relay-release-instances/0[.]1[345][.]json)"; then echo "frozen path changed"; exit 1; fi'` | Exit 0 only when every path in the execution-parent-to-implementation diff is declared in frontmatter `affected_paths` or is the manager-owned active plan record, and no `docs/plans/finished/` path or retained 0.13/0.14/0.15 instance appears. The declared companion contract may change only its current-generation pin; A7 validates the retained fixtures. An undeclared or frozen path exits non-zero naming it; both commit variables must be bound, so an unset variable fails closed. |
| A12 | `test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_COMMIT"` | Exit 0 immediately before live acceptance binding and completion-review reservation; the acceptance manifest source base and `implementation_commit` are this same 40-hex SHA. |
| A13 | `sh -c 'set -eu; remote="$(gh release view session-relay--v0.16.0 --json assets --jq ".assets[].name" | sort)"; expect="$(printf "%s\n" SHA256SUMS session-relay-aarch64-apple-darwin session-relay-aarch64-unknown-linux-musl session-relay-x86_64-unknown-linux-musl | sort)"; test "$remote" = "$expect"; gh release view session-relay--v0.16.0 --json isDraft,isPrerelease,tagName | jq -e ".isDraft == false and .isPrerelease == false and .tagName == \"session-relay--v0.16.0\"" > /dev/null; gh release view session-relay--v0.16.0 --json body --jq ".body" | grep -Fq "x86_64-apple-darwin is no longer published as of Session Relay 0.16.0; macOS support is aarch64-apple-darwin."; s="${XDG_STATE_HOME:-$HOME/.local/state}/docks/release/session-relay-0.16.0/SHA256SUMS.staged"; d="$(mktemp -d)"; chmod 700 "$d"; gh release download session-relay--v0.16.0 --pattern "session-relay-*" --pattern SHA256SUMS --dir "$d"; cd "$d"; test "$(ls -A | sort)" = "$(printf "%s\n" SHA256SUMS session-relay-aarch64-apple-darwin session-relay-aarch64-unknown-linux-musl session-relay-x86_64-unknown-linux-musl | sort)"; cmp SHA256SUMS "$s"; sha256sum -c "$s"'` | After promotion, the release reports tag `session-relay--v0.16.0`, draft false, prerelease false; the assets are re-downloaded into a fresh mode-700 directory and byte-verified against the saved `SHA256SUMS.staged` captured at staging time — not against whatever checksum file the release now serves — and the served `SHA256SUMS` must equal the staged copy, proving promotion changed only release metadata, never bytes. The complete remote asset listing is compared with the four allowed names BEFORE any download, so an unexpected asset under any other name fails here instead of being invisible to a name-pattern download. The stable body is asserted to contain the exact deprecation sentence, so promotion cannot drop it. |
| A14 | `node -e '(async () => { const cp = require("child_process"), crypto = require("crypto"), path = require("path"), url = require("url"); const PARENT_RUN = process.env.PARENT_RUN_ID; if (!PARENT_RUN) throw new Error("PARENT_RUN_ID must be set"); const OWNER = "DocksDocks/public", SUFFIX = "-session-relay-0.16.0-docks-kit-0.14.0-release.md"; const RELAY_TAG = "session-relay--v0.16.0"; const ASSETS = { "aarch64-apple-darwin": "da8b114216c3f2301ad582df8e59b49e91953abcc1112b510466b31637fda825", "aarch64-unknown-linux-musl": "816b6b8bd2d2c2518ea359a5a21502213347b387a1cc576a0fb9cf541e5646ed", "x86_64-unknown-linux-musl": "b3ca082dc5ea51e8322be407cdb4bbcaaa05d80bd62c3553f82ab98c1a95498a" }; const must = (c, m) => { if (!c) throw new Error(m); }; const api = (p) => JSON.parse(cp.execFileSync("gh", ["api", p], { encoding: "utf8", maxBuffer: 1 << 28 })); const raw = (p, ref) => cp.execFileSync("gh", ["api", "-H", "Accept: application/vnd.github.raw", "repos/" + OWNER + "/contents/" + p + "?ref=" + ref], { maxBuffer: 1 << 28 }); const sha = (b) => crypto.createHash("sha256").update(b).digest("hex"); const contains = (base, head) => { const s = api("repos/" + OWNER + "/compare/" + base + "..." + head).status; return s === "identical" || s === "ahead"; }; const hits = api("repos/" + OWNER + "/contents/docs/plans/finished?ref=main").map((e) => e.name).filter((n) => n.endsWith(SUFFIX)); must(hits.length === 1, "expected exactly one child archive on remote main, found " + hits.length); const archivePath = "docs/plans/finished/" + hits[0]; const body = raw(archivePath, "main").toString("utf8"); const run = JSON.parse(body.split("\n").find((l) => l.startsWith("Plan-run:")).slice(9)); must(run.plan_path === "docs/plans/active/session-relay-0.16.0-docks-kit-0.14.0-release.md", "child plan_path is " + run.plan_path); must(run.goal_id === "cef66d21-5bd3-4e07-a0e8-e393822dcfb0", "child goal_id differs from the parent"); must(run.run_id !== PARENT_RUN, "child run_id must differ from the parent"); must(run.draft_review.state === "passed", "child draft review is " + run.draft_review.state); must(run.completion_review.state === "passed", "child completion review is " + run.completion_review.state); must(/^status: finished/m.test(body), "child plan is not finished"); must(/^finished_at: "[^"]+"/m.test(body), "child finished_at is unset"); const impl = run.implementation_commit; must(/^[0-9a-f]{40}$/.test(impl || ""), "child implementation_commit is malformed"); const pin = JSON.parse(raw("SoT/toolchain.json", impl).toString("utf8")).tools["session-relay"]; must(pin.verified === "0.16.0", "child pin verified is " + pin.verified); must(pin.tag === RELAY_TAG, "child pin tag is " + pin.tag); must(pin.plugin_version === "0.16.0", "child pin plugin_version is " + pin.plugin_version); must(pin.repository === "DocksDocks/docks", "child pin repository is " + pin.repository); must(pin.policy === "exact", "child pin policy is " + pin.policy); const names = Object.keys(pin.assets).sort(), want = Object.keys(ASSETS).sort(); must(names.length === want.length && names.every((n, i) => n === want[i]), "child pin asset set is " + names.join(",")); for (const n of want) must(pin.assets[n] === ASSETS[n], "child pin " + n + " is " + pin.assets[n]); let tagRef = api("repos/" + OWNER + "/git/ref/tags/cli-v0.14.0").object; if (tagRef.type === "tag") tagRef = api("repos/" + OWNER + "/git/tags/" + tagRef.sha).object; must(contains(impl, tagRef.sha), "tag cli-v0.14.0 at " + tagRef.sha + " does not contain the child implementation commit"); const meta = JSON.parse(cp.execFileSync("npm", ["view", "docks-kit@0.14.0", "--json"], { encoding: "utf8", maxBuffer: 1 << 28 })); must(meta.version === "0.14.0", "npm version is " + meta.version); must(meta.dist && meta.dist.attestations && typeof meta.dist.attestations.url === "string", "npm publication carries no provenance attestation"); const bundle = await (await fetch(meta.dist.attestations.url)).json(); const slsa = (bundle.attestations || []).map((a) => JSON.parse(Buffer.from(a.bundle.dsseEnvelope.payload, "base64").toString("utf8"))).find((s) => s.predicateType === "https://slsa.dev/provenance/v1"); must(slsa, "npm provenance carries no SLSA v1 statement"); must(slsa.subject.some((s) => s.name === "pkg:npm/docks-kit@0.14.0"), "provenance subject is not docks-kit 0.14.0"); const wf = slsa.predicate.buildDefinition.externalParameters.workflow; must(wf.repository === "https://github.com/" + OWNER, "provenance workflow repository is " + wf.repository); must(wf.path === ".github/workflows/release-cli.yml", "provenance workflow path is " + wf.path); const built = slsa.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit; must(contains(impl, built), "provenance build commit " + built + " does not contain the child implementation commit"); const front = body.match(/^---\n([\s\S]*?)\n---/); must(front !== null, "child plan has no frontmatter"); const fm = front[1].match(/^affected_paths:\n((?:[ \t]+-[ \t]+.*(?:\n|$))+)/m); must(fm !== null, "child declares no affected_paths"); const paths = fm[1].split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean); must(paths.length > 0, "child affected_paths is empty"); const rel = await import(url.pathToFileURL(path.resolve("scripts/lib/session-relay-release.mjs")).href); const observed = paths.map((p) => ({ path: p, sha256: sha(raw(p, impl)) })); const digest = sha(Buffer.from(rel.canonicalize({ schema: 1, source_base: impl, paths: observed }))); const inst = JSON.parse(require("fs").readFileSync(path.resolve("scripts/lib/session-relay-release-instances/0.16.0.json"), "utf8")); const child = inst.public_child; if (child.version === "0.14.0") { must(child.tag === "cli-v0.14.0", "instance child tag is " + child.tag); must(child.implementation_content_sha256 === digest, "instance pins " + child.implementation_content_sha256 + " but the child tree reproduces " + digest); must(inst.current_attempt.public_run_id === run.run_id, "instance public_run_id " + inst.current_attempt.public_run_id + " differs from the observed child run " + run.run_id); let parentTag = api("repos/DocksDocks/docks/git/ref/tags/" + RELAY_TAG).object; if (parentTag.type === "tag") parentTag = api("repos/DocksDocks/docks/git/tags/" + parentTag.sha).object; must(inst.planrun_attempt.release_tag_commit === parentTag.sha, "instance release_tag_commit " + inst.planrun_attempt.release_tag_commit + " is not the commit " + RELAY_TAG + " resolves to (" + parentTag.sha + ")"); } else { must(child.version === "0.13.0", "instance child must be the retained 0.13.0 before finalize, found " + child.version); } console.log("child " + archivePath + " run " + run.run_id + " impl " + impl.slice(0, 12) + " reproduces " + digest + " over " + paths.length + " paths (instance child " + child.version + ")"); })();'` | Exit 0 only on PARSED evidence from the remote; existence checks and prose substring matching are not accepted. It resolves exactly one suffix-matched child archive on `DocksDocks/public@main`, then asserts the embedded PlanRunV1 `plan_path`, the shared `goal_id`, a `run_id` distinct from the parent's, both reviews `passed`, `status: finished`, a non-null `finished_at`, and a 40-hex `implementation_commit`. It parses `SoT/toolchain.json` AT that commit and requires `tools['session-relay']` to declare `verified` 0.16.0, tag `session-relay--v0.16.0`, `plugin_version` 0.16.0, repository `DocksDocks/docks`, policy `exact`, and an asset map that is EXACTLY the three name-to-digest pairs, so a fourth asset or one wrong digest fails. It dereferences tag `cli-v0.14.0` and requires its commit to contain the child implementation commit. It reads the npm SLSA provenance attestation, requires the subject `pkg:npm/docks-kit@0.14.0`, the workflow repository `DocksDocks/public` and path `.github/workflows/release-cli.yml`, and a build commit that also contains the child implementation commit, so an unrelated publication cannot satisfy it. It reproduces the implementation-content digest exactly as `scripts/lib/session-relay-release-promotion.mjs:1059-1077` defines it, reading every child `affected_paths` entry at that commit from the remote and using the shipped `canonicalize`. Before `step:finalize_instance` the instance still names the retained `0.13.0` child and the row asserts exactly that; after the repoint it asserts `public_child.tag`, `public_child.implementation_content_sha256` equal to the reproduction, and `current_attempt.public_run_id` equal to the observed child run, so every finalized identity field is compared and the check is never vacuous. `PARENT_RUN_ID` must be bound. It also requires the instance's `planrun_attempt.release_tag_commit` to be the commit that `session-relay--v0.16.0` actually resolves to in `DocksDocks/docks`, so the finalized instance cannot record a tag commit nobody observed. `affected_paths` is read from the child's YAML frontmatter in declaration order, never sorted and never from the record line, matching the shipped digest definition exactly; a declared path absent at the implementation commit is a hard failure. The command resolves the shipped `canonicalize` helper and the release instance with `path.resolve` plus `pathToFileURL` rather than an absolute path, so the plan text stays portable across checkouts. |
| A15 | `node -e 'const cp=require("child_process"); const impl=process.env.IMPLEMENTATION_COMMIT,arch=process.env.ARCHIVE_PATH; if(!impl||!arch)throw new Error("IMPLEMENTATION_COMMIT and ARCHIVE_PATH must be set"); if(!/^[0-9a-f]{40}$/.test(impl))throw new Error("IMPLEMENTATION_COMMIT must be 40 lowercase hex"); if(!arch.endsWith("-session-relay-0.16.0-release.md"))throw new Error("ARCHIVE_PATH must be this plan own archive"); const remote=cp.execFileSync("git",["ls-remote","origin","refs/heads/main"],{encoding:"utf8"}).split(/\s+/)[0]; if(!remote)throw new Error("origin/main is unreadable"); const merged=cp.execFileSync("git",["merge-base","--is-ancestor",impl,remote],{stdio:"ignore"}); const head=cp.execFileSync("git",["rev-parse",remote],{encoding:"utf8"}).trim(); const listed=cp.execFileSync("git",["ls-tree","--name-only",head,arch],{encoding:"utf8"}).trim(); if(listed!==arch)throw new Error("archive is not readable on remote main: "+arch); const active=cp.execFileSync("git",["ls-tree","--name-only",head,"docs/plans/active/session-relay-0.16.0-release.md"],{encoding:"utf8"}).trim(); if(active!=="")throw new Error("the active plan path still exists on remote main; the archive move did not happen"); console.log("remote main "+head.slice(0,12)+" contains "+impl.slice(0,12)+" and serves "+arch);'` | Exit 0 only when the remote itself proves the two claims this lane makes about it: remote `main` contains the reviewed implementation commit as an ancestor, its tree serves this plan's archive at the path the archive transaction reported, and the active plan path is gone from that tree so the move happened exactly once. `IMPLEMENTATION_COMMIT` and `ARCHIVE_PATH` must be bound, so an unset variable fails closed. Read-only against the remote; it belongs to `step:archive_push` and covers `step:publish_main`'s remote claim. |
| A16 | `node plugins/session-relay/test/release-evidence-contract.mjs` | Exit 0; a current PlanRun fixture with distinct tagged `source_base` and reviewed `execution_parent` binds completion to the execution-parent diff, while source-to-tag and tag-to-implementation ancestry remain enforced. Reverting only the production review-base selection reproduces `stale CompletionReviewV1 diff_sha256 binding`. |

## Out of scope / do-NOT-touch

- Every file under `docs/plans/finished/`, including all four 0.15.0 asset
  digests, receipts, review evidence, and release bodies.
- `scripts/lib/session-relay-release-instances/0.15.0.json` and every earlier
  instance. Historical validators may read them; no migration rewrites them.
- Historical plan paths, 0.13.0/0.15.0 child identities, asset digests, receipts,
  and archive fixtures inside `plugins/session-relay/test/companion-distribution-contract.mjs`.
  Its complete `CURRENT_*` tuple, `CURRENT_ASSET_DIGESTS`, and current target-set assertion are in
  scope because they validate live public main.
- Any file in `DocksDocks/public`. The child is a separate canonical run and owns
  its package, workflow, toolchain pin, generated payload, tests, goldens,
  publication, and archive.
- Intel Linux, aarch64 Linux, or Apple-Silicon macOS support; Windows remains
  unsupported. Do not generalize this target removal into host-runtime rejection
  outside current published assets.
- Any automatic or manual deletion, force-update, or rename of a remote
  `preflight/*` ref; cleanup is explicitly deferred.
- Hook-side healing, a new lifecycle state, weakened fencing, relaxed custody
  proof, changed receipt schemas, retagging, asset replacement, or force push.
- The docks and effect-kit plugin versions.

## STOP conditions

1. The regression does not fail against the old disconnect branch for the exact
   `Fencing`/second-use reason, or it requires weakening a real custody-loss
   assertion.
2. Caller disconnect reaches `publish_disconnect_cancel`, kills the owned child,
   changes worker state/version/fence fields, or fabricates a proof gap while
   `ChildOwned` custody remains valid.
3. Explicit cancel stops cancelling/reaping, or genuine supervisor/custody loss
   no longer reaches the existing typed fail-closed state.
4. Any current three-target edit changes a captured historical asset, digest,
   receipt, finished plan, 0.15.0 instance, or retained companion fixture. The
   complete current companion tuple may move, but `HISTORICAL_*` bytes may not;
   split current and retained validation if those boundaries cannot stay separate.
5. The current producer, verifier, checksum, publication, promotion, or child pin
   disagrees on the exact three-target set, or the release body omits the Intel
   macOS deprecation.
6. Any preflight ref count decreases, any release code gains ref deletion, or a
   deletion is attempted without a separate plan plus exact live `push`
   authority naming each ref.
7. The child does not pin independently hashed 0.16.0 bytes, does not use
   docks-kit 0.14.0/`cli-v0.14.0`, has a different `goal_id`, lacks a passed
   completion review, or is not remotely readable as finished.
8. The tag, target child, npm version, or release already exists with a different
   commit/asset/body identity. Never retag, overwrite, or republish.
9. The implementation checkpoint is not repository HEAD when acceptance is
   minted, the manifest source base differs from `implementation_commit`, or
   completion review was reserved before the checkpoint and live bind.
10. Any row whose Effect is not `local` is reached without an exact live
    `ExternalAuthorityV1` for that boundary. A probe grants no release or push;
    release grants no deployment or unrelated publication.
11. A gate is made green by lowering a floor, hand-editing a census/golden,
    deleting a historical assertion, accepting an extra asset, or excluding the
    new regression.
12. Recovery would require force, retag, release-asset replacement, receipt
    clobber, a recovery-only mode without its exact predecessor receipt, or a
    post-pass implementation edit not covered by a fresh legal completion
    review.

## Open questions

None. The disconnect design, exact regression home, three-target support set,
Intel macOS deprecation, indefinite preflight-ref retention under
`scripts/AGENTS.md`, required docks-kit 0.14.0 child, `public_child` meaning,
version surfaces, release-mode order, checkpoint-before-review ordering, and
historical-byte boundary are resolved.

12. `--bind-completion` still rejects the exact passed completion review because current PlanRun
    evidence hashes `source_base` instead of `execution_parent`, or the repair weakens source/tag
    ancestry, acceptance manifest equality, retained completion behavior, or diff binding.

## Review

N/A — no review has been dispatched for this run.

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"cea6d5b1c9228c5071be7f35f542cc4a8649eefccb7d788a9b1a982e4578d2d1","invocations":1,"result_sha256":"4bacd14008fea328980fb38358809d7cb5d81b7db7ae13a096959557e41632ca","state":"passed"},"execution_parent":null,"goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"ae03e1e31bf457c54b2a7b4c67185d18d975cca9f12bf7d84cafb6a008e7234e","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"09715c97-4d55-49d9-a268-b31c7e39cf38","schema":1,"source_base":"a869a7f895b5f68dde3b6aeec331e23fc5decab5","source_sha256":"c89f014011c8612f45251247873ab29e8b18e99527917d0f94b51e104728c5eb"}


Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"465b6035896e8d889e432e0335c23a36da91f779b5bb0880fd34200f35aae7fd","replacement_run_id":"ce7df5fd-8ccb-41a6-942c-56bbf67cd1bb","run":{"acceptance":null,"blocker":{"evidence_sha256":"c84e1f914e4ea6416ac24dffab9a72e7e641c64f71fa55e72ba37e157dfb1dc5","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_acceptance_coverage_incomplete","v1_acceptance_output_mismatch","v1_contract_contradiction","v1_unauthorized_effect"],"input_sha256":"878917bdc4b3df7d88d98d7c48e9666f9b97b89cff7d4b4351675b6a307e7dd1","invocations":2,"result_sha256":"c84e1f914e4ea6416ac24dffab9a72e7e641c64f71fa55e72ba37e157dfb1dc5","state":"blocked"},"execution_parent":null,"goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"83750324a0aa2dd622a942ff7b15312722b298c1bb4f097743dccb25b70bc101","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"6feb5288-d1ac-4578-9466-6252501361e6","schema":1,"source_base":"407bc52d7ebfcef5bf16f1d249394b2401aab4fd","source_sha256":"87180b7ba10105e50701b62e9c4def5a58d5ce553fc0a5239488000ca44fa656"},"schema":1,"status":"blocked","successor_run_sha256":"0b761ae4050729f3eda85fbe3b7a1310582b6bfb867c4c23afd7bc9b977cc56d"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"9b59d0a3174f9d6a9931f053703111aebc730570a1f03654fece96285ce62ffe","replacement_run_id":"75c7a055-44f2-4435-b863-301af9bb352f","run":{"acceptance":null,"blocker":{"evidence_sha256":"700d73d4946f296f7dd2ad66455b8cad4a0d08aee12d438b74f6229a3d5590c6","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"f26e34842be007fdc5657dea76fc2867e4348be50298c12e212e88bed8a6981f","invocations":1,"result_sha256":"95eea7c0f80d1d0017abb925e06c241d2dc60df4a6521f8677b89d15f6146893","state":"passed"},"execution_parent":"b6e983b0dc5bf432374d24a1487f3c56162d1181","goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"3747f60e4f81e0dc9b825fd10e8776a65df60622e0c548832564b4f5a758c87b","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"ce7df5fd-8ccb-41a6-942c-56bbf67cd1bb","schema":1,"source_base":"b6e983b0dc5bf432374d24a1487f3c56162d1181","source_sha256":"14f4a50e9057bb617edb258fb20cdaa8064f2a1044fd2fa58a478e5419b589e2"},"schema":1,"status":"blocked","successor_run_sha256":"30c964c38fea246b328e875f9b8828154ff047fa48b9ed7ebe9e5f7dc2e22bb3"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"0b1b5c4d3b9f7fe17488213d6b62ccb56cf67a272110dae2f1daa68ec765d048","replacement_run_id":"ab0c02b7-e918-4fc1-b684-9d88f658127c","run":{"acceptance":null,"blocker":{"evidence_sha256":"378041569234ee40faed3a6d8770d914e094e644cfcd17b240903614e2d45460","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_acceptance_coverage_incomplete"],"input_sha256":"c25e7935f1a1ea58b435e588d58b57dc01fae883cca27c6060a9cacd6f630ba8","invocations":2,"result_sha256":"3fd5e3d3fb61c995acbfaceef1a18a8cff36cb6c424d6831585d65a019abe099","state":"passed"},"execution_parent":"26506257255482e30e50e31edd74ce96f6785eee","goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"0ffe20962c385be002689fc446e65c7d7f6abf2064e569bc734174d720a784b2","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"75c7a055-44f2-4435-b863-301af9bb352f","schema":1,"source_base":"26506257255482e30e50e31edd74ce96f6785eee","source_sha256":"b26fd6d1536af88202afc6c46de71a42f5ab486bbf345578392634d1b91e22bc"},"schema":1,"status":"blocked","successor_run_sha256":"ee3fda07776c56a6ef4ea26170c512c16fdec31f599efa037f8e88a0c5e1076e"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"551998a51150dd355c004b1cd3ed2d9bf4efea7e22b4453771ea8994f72c5a34","replacement_run_id":"1c5b6f71-c69d-4566-adcc-4c15a9f0c599","run":{"acceptance":null,"blocker":{"evidence_sha256":"8680bfa8e0075bf9aab211ebcd2f1f84cb9578924436c38e9f6e86e1ad4b0a5a","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_acceptance_coverage_incomplete","v1_unstable_step_reference"],"input_sha256":"44f26af78990dad6edb9764d73bfefb6dcd69b42e954b03b7b0df68af3b4221c","invocations":2,"result_sha256":"8680bfa8e0075bf9aab211ebcd2f1f84cb9578924436c38e9f6e86e1ad4b0a5a","state":"blocked"},"execution_parent":null,"goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"c6efe80abb482ba69980004ce7c393f456176ba11adec430a4de76bc3c950695","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"ab0c02b7-e918-4fc1-b684-9d88f658127c","schema":1,"source_base":"33853dae2bee74763f79d3b47cfad4016fce02b6","source_sha256":"293a93b48b2d08bf5a76f4d35165e21b5455b0bb159bff176d0eedda37aedc70"},"schema":1,"status":"blocked","successor_run_sha256":"2f440b32482ab87fcd149a3b1de999c2afe5cb13d58fec293597a0817e01ad9a"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"e5172771943e0b97166491d9189896d2dc45260d9d760aae0f5b155d235e766d","replacement_run_id":"d5d1e9fa-7627-47b8-bac2-bed0b7465d9e","run":{"acceptance":null,"blocker":{"evidence_sha256":"21d99d29830710d113dbe344512895e9510bc1438a267cee5dbbd626b8509f93","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_acceptance_coverage_incomplete"],"input_sha256":"2b2802716b9bcae2f50756c61dfe7886c71a26898cdf3229b35413c989d7d690","invocations":2,"result_sha256":"c51410fb4e9920ccdd65e8721ff7905745516c56b70d17749a1dc00425335fa4","state":"passed"},"execution_parent":"598906234b45cad062c42e94840643f4af8cb913","goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"2757f4dceda23fa9532045e773e74e24ed6393d8408508b65554eee7eab893da","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"1c5b6f71-c69d-4566-adcc-4c15a9f0c599","schema":1,"source_base":"598906234b45cad062c42e94840643f4af8cb913","source_sha256":"a37412a428a14e75b8267f268468fc96d168037c89deb069b118d2d9409f5ee7"},"schema":1,"status":"blocked","successor_run_sha256":"ed125ddc30d32b9467acbe38a34f6564d1b18dd5a1e96dbb18afed9151bf3333"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"de87935135f8c103e3573345f24f2d89fbf607e6aefa7e3eac822225d4959528","replacement_run_id":"a2607f9b-7346-4224-bdb4-a6ffeb1bc8a4","run":{"acceptance":null,"blocker":{"evidence_sha256":"1e78b5a18e8da3e7a2495c614d9409a5ed5df58efcaf41573fdb2687dd3311ca","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_acceptance_coverage_incomplete","v1_contract_contradiction","v1_unauthorized_effect"],"input_sha256":"0467dcbff34b420041d2ecadf108d4f5bc65da86c4e7650b8142600dba5aa90f","invocations":3,"result_sha256":"5b0af4c6e0d99e28358db4f2aabf603581db9217019d3d89f5da450b3c74ac4d","state":"passed"},"execution_parent":"b1b7e91244c8d786ccfc71756aa7d553eae130ea","goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"39b4423d06a97eba4e97e2e0136a41a29efb89315dda8f7e85802fe45481012b","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"d5d1e9fa-7627-47b8-bac2-bed0b7465d9e","schema":1,"source_base":"875661640c1c45894c66a9b2fdc437fd47307e1f","source_sha256":"efa0881efe22655b2b2ba8061b64f93bac66e92f04fc3c5c0f6a9c9166ab1106"},"schema":1,"status":"blocked","successor_run_sha256":"a458e8b6679ea893f8426fb0389f9cae6a72eeccabf22c87664c7d9996d97c46"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"2c2dc59dd0f7e0a69565cac13cfbe92f3b2a09009ca3f22d2aa79fe137ea4a39","replacement_run_id":"16510f46-c86d-4198-88aa-04583ded46c1","run":{"acceptance":null,"blocker":{"evidence_sha256":"be6c7664fe34aaa4320a1cbb3c99007ae86595a01b65883269903d3f3fd6fc68","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"3f99ae4951ae9cd4429c6d177443820e35d149304e8aa15663bb205dfb49cdf1","invocations":1,"result_sha256":"cbe5848b7df4f102926cdce9f3d843abefb4dcdbb58d33f8a6915592f6182642","state":"passed"},"execution_parent":null,"goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"dc38a3ccb644e2d287e76da314d34fd2bd2625e5c7ba80f376041c6276d9c42f","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"a2607f9b-7346-4224-bdb4-a6ffeb1bc8a4","schema":1,"source_base":"875661640c1c45894c66a9b2fdc437fd47307e1f","source_sha256":"6ce9e198ef90247e9c01b83a1530319d81ca46cd94f763f9cb9c07b9e341728a"},"schema":1,"status":"blocked","successor_run_sha256":"eeae2f9c830b69fa0ce1d5706907fcb843854986f49db0f5eba49bbbda38ff6f"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"cacebd187daa83ff32e59e12b4948b12f2babc2f7de1dae214f0c5eb1c9f0b19","replacement_run_id":"c268ecc1-cf5e-4266-9a29-a83b59e9717d","run":{"acceptance":null,"blocker":{"evidence_sha256":"3092c510030240070530bb65120b53edfd18836b96bad92384184162ac469f69","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_failure_action_missing"],"input_sha256":"3681e3a8d2baa204e60001f097fdae40b8fb6302c552aa34a0647bd2f4697e0c","invocations":2,"result_sha256":"38ac2e6fa394c03bcb76b82897951f3f740eedd2350c54a0bfe86b9b095d96a5","state":"passed"},"execution_parent":"664f9db6001e49b06ceba6e85a3b1ec4fa984c0b","goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"e566b7c898dd77109b58452e54eb520010bf8b569dee0895012ff46322cade49","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"16510f46-c86d-4198-88aa-04583ded46c1","schema":1,"source_base":"875661640c1c45894c66a9b2fdc437fd47307e1f","source_sha256":"6ce9e198ef90247e9c01b83a1530319d81ca46cd94f763f9cb9c07b9e341728a"},"schema":1,"status":"blocked","successor_run_sha256":"10fa2d42a04147458d0181d256173ba5f16e634a0cc92935db65ad25f284fe29"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"b83e0414854d559b06785cca82708bcf349d3e1288e6b848c7932e7fb03cec9d","replacement_run_id":"09715c97-4d55-49d9-a268-b31c7e39cf38","run":{"acceptance":{"source_sha256":"c89f014011c8612f45251247873ab29e8b18e99527917d0f94b51e104728c5eb","verification_sha256":"c92f84c71b96d3abf098a624f292039a04a10dc050dc44f71df267d85f76f9e1"},"blocker":{"evidence_sha256":"0d351a438c29fd52b1a671901a3d04b3de8ff1ed3251396adf114d2996909538","kind":"concurrent_change"},"completion_review":{"accepted_classes":[],"input_sha256":"54a478475e30dcbdea6b0f2d9d8b58fd9245fc84c8cc23b7b78e159649ac8dff","invocations":2,"result_sha256":"c92d9896072688af83aaa162a698c42331ed5afecd360bd898e3dbab1e43c16a","state":"passed"},"draft_review":{"accepted_classes":[],"input_sha256":"aaf54a3b6c16204a9f77ff7f270f67bb6ec1f78caf9996bde6e5e3276ae8f78b","invocations":1,"result_sha256":"66289760ea8f3214b980f4db873adc47537494c248b4263c7f159abf16597fae","state":"passed"},"execution_parent":"664f9db6001e49b06ceba6e85a3b1ec4fa984c0b","goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":"a869a7f895b5f68dde3b6aeec331e23fc5decab5","plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"393f558ac87cde095d8dcee2f2dd9be25eb05f65b84a9904eab18b62c3ab6bbc","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"c268ecc1-cf5e-4266-9a29-a83b59e9717d","schema":1,"source_base":"875661640c1c45894c66a9b2fdc437fd47307e1f","source_sha256":"6ce9e198ef90247e9c01b83a1530319d81ca46cd94f763f9cb9c07b9e341728a"},"schema":1,"status":"blocked","successor_run_sha256":"c4f4aa48e5989856d1ea9cab24532af8a764c909cb6b103e94837dedfd822674"}










Completion review invocation 1:

Completion-review-result: {"diff_sha256":"0df6b475283da0238cb432ca3d0dee3b208287db23275a904a44338a7ae696e5","findings":[{"defect":"The current-release oracle is pinned to `d5d1e9fa-7627-47b8-bac2-bed0b7465d9e`, which the sealed plan records as a blocked predecessor run. The bound plan, companion contract, and new 0.16.0 instance all identify the reviewed run as `c268ecc1-cf5e-4266-9a29-a83b59e9717d`, so this independent oracle checks the wrong release instance.","fix":"Set `CURRENT_DOCKS_RUN_ID` to the bound current run ID `c268ecc1-cf5e-4266-9a29-a83b59e9717d` and refresh any identity inventory derived from that contract.","id":"current-run-oracle","kind":"release_identity_mismatch","locator":"plugins/session-relay/test/distribution-contract.mjs:CURRENT_DOCKS_RUN_ID"},{"defect":"The current child archive is hard-coded with a `2026-08-02` prefix even though the sealed plan explicitly records that the docks-kit 0.14.0 child could not finish before 2026-08-03 and requires resolving it by the date-free `-session-relay-0.16.0-docks-kit-0.14.0-release.md` suffix. This makes the promotion contract point at an unreachable archive identity instead of the finished companion it is meant to bind.","fix":"Resolve exactly one finished child archive by the required date-free suffix, or bind the observed finished path consistently across current publication and promotion contracts; do not retain the 2026-08-02 placeholder.","id":"child-archive-date","kind":"cross_repository_contract","locator":"plugins/session-relay/test/release-promotion-contract.mjs:CURRENT_PUBLIC_FINISHED_PLAN_PATH"},{"defect":"`plugins/session-relay/test/companion-distribution-contract.mjs` is changed in the sealed diff, declared in the plan, and included in `planrun_attempt.docks_affected_paths`, but it is omitted from `continuation_paths.current`, `authorized_base.shipped_to_promoted_paths`, and `authorized_base.authorized_base_to_promoted_paths`. The instance therefore excludes a live cross-repository identity and digest assertion from the continuation/promotion path closure.","fix":"Add `plugins/session-relay/test/companion-distribution-contract.mjs` to all three omitted path arrays so the release instance binds and authorizes the complete reviewed companion-contract change.","id":"companion-path-closure","kind":"release_authorization_closure","locator":"scripts/lib/session-relay-release-instances/0.16.0.json:continuation_paths.current and authorized_base path arrays"}],"implementation_commit":"34febc5e320d9c6d71d5923c02842003d777dd0a","invocation":1,"run_id":"c268ecc1-cf5e-4266-9a29-a83b59e9717d","schema":1,"verdict":"repair"}


Completion-review-transport-failure: {"input_sha256":"4f8a3c3147e59f51e75e58a875bfdf6ae701c019d1b1d0e2b274aa7d9c6412e0","invocation":2,"kind":"invalid_completion_review_schema","result_sha256":"2bf45ede121e6ee58360bd822512e9eaaa4069a1fdd7a73a37f35f2b16b226ac"}


Completion review invocation 2:

Completion-review-result: {"diff_sha256":"4706eafbb74583a5afcc4df50436a2284daf23253646cbd1bfe429f4248e66f5","findings":[],"implementation_commit":"a869a7f895b5f68dde3b6aeec331e23fc5decab5","invocation":2,"run_id":"c268ecc1-cf5e-4266-9a29-a83b59e9717d","schema":1,"verdict":"pass"}


Execution-blocker: {"evidence_sha256":"0d351a438c29fd52b1a671901a3d04b3de8ff1ed3251396adf114d2996909538","kind":"concurrent_change","reason":"post-review completion binder rejected the accepted execution-parent diff binding"}

## Verification Results

N/A - manager-written after execution.
