---
title: Release Session Relay 0.16.0 with custody-safe disconnects
goal: Ship Session Relay 0.16.0 without fencing a managed worker on caller disconnect, retire Intel macOS production assets, and retain preflight evidence refs.
status: drafting
created: "2026-08-02T18:00:00+00:00"
updated: "2026-08-03T16:54:10.282+00:00"
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
| `plugins/session-relay/test/companion-distribution-contract.mjs` | 42, 48, 458 | Frozen 0.13.0/0.15.0 child and historical digest fixtures; the file stays byte-identical. |

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

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | regression_first | Add the managed caller-disconnect regression before changing production behavior, and register its exact test identity. | `plugins/session-relay/rust/tests/lifecycle_supervisor.rs`; `plugins/session-relay/test/fixtures/rust-test-inventory.json` | — | `local` | `planned` | The named test reaches `ChildOwned`, kills the caller, and fails against the current source because the worker becomes `Fencing`; the failure signature is the state/second-use assertion, not setup. If it passes before the fix or fails earlier, STOP and repair the test. |
| 2 | cancel_split | Separate explicit cancel from transport disconnect so intact supervisor custody completes and reaps without fencing the managed worker. | `plugins/session-relay/rust/src/supervisor.rs` | 1 | `local` | `planned` | Explicit cancel still publishes cancel, kills, and reaps; caller disconnect suppresses writes to the absent caller, never invokes `publish_disconnect_cancel`, lets the child terminate normally, records `ChildReaped`, and leaves the managed worker byte-for-field Active. The new regression and existing lifecycle-supervisor integration test both pass. Failure: STOP; do not weaken `LostAuthority`, hook admission, or managed-state checks. |
| 3 | drop_intel | Drop the Intel macOS current producer target, migrate every live three-target consumer and policy, preserve all historical/frozen four-target bytes, and add the deprecation note to both release bodies. | `.github/AGENTS.md`; `.github/workflows/build-binaries.yml`; `plugins/session-relay/AGENTS.md`; `plugins/session-relay/test/distribution-contract.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/session-relay/test/release-promotion-contract.mjs`; `plugins/session-relay/test/release-publication-contract.mjs`; `scripts/AGENTS.md`; `scripts/lib/plugins.mjs`; `scripts/lib/rust-bin.mjs`; `scripts/lib/session-relay-release-core.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/lib/session-relay-release-publication.mjs`; `scripts/verify-session-relay-preflight.mjs` | 2 | `local` | `planned` | Current 0.16 producer/preflight/publication/promotion accepts exactly Linux x64, Linux arm64, macOS arm64 plus `SHA256SUMS`; current Intel Darwin is rejected; retained 0.13/0.14/0.15 receipts and captured fixtures still validate byte-identically; workflow and core bodies include the exact deprecation sentence. Failure: STOP on any historical digest/receipt/finished-plan or `companion-distribution-contract.mjs` diff. |
| 4 | retain_refs | Record indefinite preflight-ref retention in its owning policy without adding any cleanup implementation. | `scripts/AGENTS.md` | 3 | `local` | `planned` | Policy states that every `preflight/*` ref is retained, release automation never deletes one, and any future exact-ref deletion requires a separate plan and separately authorized `push` row. A read-only remote count is at least the observed baseline 19. Failure: STOP if an implementation path deletes or rewrites a ref. |
| 5 | bump_version | Bump the tag-bearing Relay crate/manifests to 0.16.0 and prepare the current-release lane identities without changing frozen 0.15.0 evidence. | `.claude-plugin/marketplace.json`; `plugins/session-relay/.claude-plugin/plugin.json`; `plugins/session-relay/.codex-plugin/plugin.json`; `plugins/session-relay/rust/Cargo.lock`; `plugins/session-relay/rust/Cargo.toml`; `scripts/lib/session-relay-release-core.mjs`; `scripts/lib/session-relay-release-instances/0.16.0.json`; `plugins/session-relay/test/fixtures/release-identity-inventory.json`; `plugins/session-relay/test/release-instance-contract.mjs` | 3, 4 | `local` | `planned` | Cargo metadata, three manifests, marketplace Session Relay entry, and core `VERSION` are 0.16.0. The new closed instance binds this parent plus the real finished 0.13.0 child as retained pretag evidence and has `release_tag_commit: null`; it contains no invented future child or tag value. The inventory is regenerated only through `release-instance-contract.mjs --freeze`; the 0.15.0 instance and finished evidence are byte-identical. This step also requires this plan’s own installed parent PlanRun identity to be present and bound before it runs. Failure: STOP on any guessed identity, invalid instance, or historical drift. |
| 6 | focused_proof | Run focused red/green proof, Rust integration, target-contract suites, instance validation, and the authoritative plugin gate on the complete local tree. | all affected paths in frontmatter | 5 | `local` | `planned` | A1-A7 pass, including `node scripts/ci.mjs --plugin session-relay`; reverting only the disconnect fix makes A1 fail; restoring it returns green; current three-target assertions bite while retained historical four-target assertions remain green. Failure: repair the source, never a floor, frozen receipt, census count, or historical expectation. |
| 7 | tag_stage | Tag the exact release-source commit and stage the 0.16.0 prerelease through the three-leg native producer. | `.github/workflows/build-binaries.yml` | 6 | `release` | `planned` | Exact live release authority matches DocksDocks/docks and the tag/release targets; the immutable tag resolves to the focused-gate-verified release-source commit; one successful tag run publishes exactly three binaries plus `SHA256SUMS`, prerelease true, with the exact deprecation body. The release boundary is the Git ref `refs/tags/session-relay--v0.16.0` and the GitHub prerelease `session-relay--v0.16.0`. Failure: STOP permanently; never retag, replace, or clobber. |
| 8 | verify_assets | Independently download and hash every staged 0.16.0 binary against its checksum row. | — | 7 | `probe` | `planned` | Fresh downloaded bytes produce exactly three matching SHA-256 rows, no Intel Darwin/Windows/extra asset, and the three values are handed to the child. `SHA256SUMS` alone is not evidence. This step probes the GitHub prerelease `session-relay--v0.16.0` and its assets `session-relay-aarch64-apple-darwin`, `session-relay-aarch64-unknown-linux-musl`, `session-relay-x86_64-unknown-linux-musl`, and `SHA256SUMS`. Any mismatch is STOP after the burned tag. |
| 9 | read_child | Read back the separately reviewed and released docks-kit 0.14.0 child that pins the three observed Relay assets. | — | 8 | `probe` | `planned` | Exact live probe authority permits read-only DocksDocks/public/GitHub/npm reads; child tag, npm provenance, finished PlanRunV1, passed completion review, three independently verified Relay pins, shared `goal_id`, distinct `run_id`, and reviewed implementation-content digest all agree. The public child release and archive — `DocksDocks/public` tag `cli-v0.14.0`, npm `docks-kit@0.14.0`, and the child plan records `docs/plans/active/session-relay-0.16.0-docks-kit-0.14.0-release.md` and `docs/plans/finished/2026-08-02-session-relay-0.16.0-docks-kit-0.14.0-release.md` — must already exist as a precondition of this step. Failure: STOP; the parent neither edits public nor substitutes child 0.13.0. |
| 10 | finalize_instance | Finalize the 0.16.0 instance and re-point only current release-lane contracts to the completed child and three-target generation. | `scripts/lib/session-relay-release-instances/0.16.0.json`; `scripts/lib/session-relay-release-preparation.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/lib/session-relay-release-publication.mjs`; `plugins/session-relay/test/distribution-contract.mjs`; `plugins/session-relay/test/fixtures/release-identity-inventory.json`; `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/session-relay/test/release-instance-contract.mjs`; `plugins/session-relay/test/release-promotion-contract.mjs`; `plugins/session-relay/test/release-publication-contract.mjs` | 9 | `local` | `planned` | The new instance binds child 0.14.0/tag/run/content digest and the real tag commit; current contracts consume 0.16.0/three targets while retained generations stay immutable; the sentinel/unborn sweep is empty; A2-A7 pass again. Failure: STOP on guessed identity, historical-byte drift, or a current assertion derived from the same value it is meant to check. |
| 11 | impl_checkpoint | Commit the complete implementation checkpoint, require HEAD equality, bind live acceptance, and only then reserve and pass completion review. | all affected paths in frontmatter | 10 | `local` | `planned` | `git diff --name-only "$EXECUTION_PARENT" "$IMPLEMENTATION_COMMIT"` covers every changed implementation path in this run and no undeclared path; `git rev-parse HEAD` equals `implementation_commit` while acceptance is minted; its live manifest `source_base` equals that SHA; a fresh CompletionReviewV1 passes the exact commit and full execution-parent-to-implementation diff. The manager-owned lifecycle record `docs/plans/active/session-relay-0.16.0-release.md` changes through the plan lifecycle only, not as a step-edited implementation file. Failure: STOP before promotion; never reserve first or bind an earlier commit. |
| 12 | promote_stable | Run the current PlanRun release recipe and promote the existing byte-identical prerelease to stable. | release receipts | 11 | `release` | `planned` | With exact live release authority, run in order `--bind-completion`, `--publish-reviewed --rebind-complete-publication`, `--emit-public-request`, `--verify-public-release`, `--promote-reviewed`, `--finalize-reviewed`; every no-clobber receipt validates, remote main remains the reviewed implementation, stable release is non-draft/non-prerelease, body includes the Intel deprecation, and the three binaries plus checksum are byte-identical to step:verify_assets. The promotion targets are the GitHub release `session-relay--v0.16.0` and DocksDocks/docks branch `main`. Failure: STOP with receipts; no recovery-only mode without its exact documented state. |
| 13 | archive_push | Finish, archive, commit, push, and remotely read back the terminal plan. | — | 12 | `push` | `planned` | Exact live push authority matches the archive/main target; PlanRunV1 is finished with bound acceptance and passed completion review; the active plan moves once to the dated archive; the archive checkpoint is pushed and remotely readable; no preflight ref was deleted. This step’s targets are the lifecycle-managed plan record `docs/plans/active/session-relay-0.16.0-release.md`, its dated archive `docs/plans/finished/2026-08-02-session-relay-0.16.0-release.md`, and DocksDocks/docks branch `main`; the archive transaction owns those paths, so they are not step-edited files. Failure: leave the run ongoing and do not claim archive completion. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `(cd plugins/session-relay/rust && cargo test --locked --test lifecycle_supervisor lifecycle_supervisor_disconnect_preserves_managed_worker_when_custody_intact -- --exact)` | Exit 0; after caller death with intact `ChildOwned` custody, the operation reaches terminal `ChildReaped`, the managed worker remains `Active` with unchanged fence/proof fields, and a second use succeeds. Reverting the production fix makes this test fail. |
| A2 | `(cd plugins/session-relay/rust && cargo test --locked --test lifecycle_supervisor)` | Exit 0; explicit unmanaged cancel/reap, true supervisor-loss fencing, bootstrap disconnect, PTY, and managed claim transfer retain their existing semantics. |
| A3 | `node plugins/session-relay/test/distribution-contract.mjs && node plugins/session-relay/test/release-evidence-contract.mjs` | Exit 0; the current producer/preflight matrix has exactly three native targets and historical evidence remains closed. |
| A4 | `node plugins/session-relay/test/release-publication-contract.mjs && node plugins/session-relay/test/release-promotion-contract.mjs` | Exit 0; current publication/promotion requires three Relay binaries plus `SHA256SUMS`, rejects Intel Darwin as an extra current asset, and still validates frozen four-asset predecessors. |
| A5 | `node plugins/session-relay/test/release-instance-contract.mjs` | Exit 0; the 0.16.0 instance is closed and fully mapped, its child is docks-kit 0.14.0 with reproduced content digest, its tag commit is null only before tagging, and frozen instance generations remain unchanged. |
| A6 | `(cd plugins/session-relay/rust && cargo metadata --format-version 1 --no-deps)` | Exit 0; exactly one package is emitted and `packages[0].version` is `0.16.0`; `Cargo.lock` agrees. |
| A7 | `node scripts/ci.mjs --plugin session-relay` | Exit 0 on the complete local implementation with the Session Relay Rust, self-test, inventory, manifest, distribution, release-evidence, publication, promotion, and instance gates green. |
| A8 | `test "$(git ls-remote --heads origin 'preflight/*' | wc -l)" -ge 19` | Exit 0; the observed baseline has not decreased. The 0.16.0 validate-only ref is additional retained evidence, never a replacement for an older ref. |
| A9 | `gh release view session-relay--v0.16.0 --json isDraft,isPrerelease,body` | Immediately after staging, draft is false, prerelease true, and the body contains the exact `x86_64-apple-darwin` deprecation sentence. |
| A10 | `VERIFY_DIR="$(mktemp -d)" && chmod 700 "$VERIFY_DIR" && gh release download session-relay--v0.16.0 --pattern 'session-relay-*' --pattern SHA256SUMS --dir "$VERIFY_DIR" && (cd "$VERIFY_DIR" && sha256sum -c SHA256SUMS)` | The newly created directory receives exactly three binaries plus `SHA256SUMS`; exactly three rows report `OK`; no Intel Darwin, Windows, fourth binary, or unlisted file exists. |
| A11 | `git diff --name-only "$EXECUTION_PARENT" "$IMPLEMENTATION_COMMIT"` | At the implementation checkpoint, output contains only affected paths declared in frontmatter plus the manager-owned active plan record; no finished plan, 0.15.0 instance, companion frozen fixture, or unrelated path appears. |
| A12 | `test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_COMMIT"` | Exit 0 immediately before live acceptance binding and completion-review reservation; the acceptance manifest source base and `implementation_commit` are this same 40-hex SHA. |
| A13 | `gh release view session-relay--v0.16.0 --json isDraft,isPrerelease,tagName` | After promotion, reports tag `session-relay--v0.16.0`, draft false, prerelease false; downloaded assets still match A10 byte-for-byte. |

## Out of scope / do-NOT-touch

- Every file under `docs/plans/finished/`, including all four 0.15.0 asset
  digests, receipts, review evidence, and release bodies.
- `scripts/lib/session-relay-release-instances/0.15.0.json` and every earlier
  instance. Historical validators may read them; no migration rewrites them.
- `plugins/session-relay/test/companion-distribution-contract.mjs`; its historical
  and current 0.15.0 child pins remain byte-identical.
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
   receipt, finished plan, 0.15.0 instance, or the companion distribution
   contract. Split current and retained validation instead.
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

## Review

N/A — no review has been dispatched for this run.

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"execution_parent":null,"goal_id":"cef66d21-5bd3-4e07-a0e8-e393822dcfb0","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-release.md","plan_sha256":"784ecff1938d5ddcc52582c8c9e27f643ab7f8c9b008124c9eb25ee3f3fc1d19","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"6feb5288-d1ac-4578-9466-6252501361e6","schema":1,"source_base":"a35793c2bf9b51f233575d30a58e295c44c43501","source_sha256":"2034e62c7a06bd170f40760d1624fffb6dcbb769025c1495d758c7353c8be596"}

## Verification Results

N/A — manager-written after execution.
