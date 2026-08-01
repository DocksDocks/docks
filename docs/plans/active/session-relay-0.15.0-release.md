---
title: Release Session Relay 0.15.0 and accept docks-kit child 0.13.0
goal: Ship Session Relay 0.15.0 from the docks repository and move the parent release lane onto public child docks-kit 0.13.0, so the separation work in this lane is exercised by a real transition instead of asserted against absent versions.
status: blocked
created: "2026-08-01T16:35:59-03:00"
updated: "2026-08-01T21:32:18-03:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, session-relay, release, public-child, cross-repository]
affected_paths:
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/test/companion-distribution-contract.mjs
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/fixtures/release-identity-inventory.json
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-instance-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/remediation-contract.mjs
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-instances/0.15.0.json
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-publication.mjs
  - .claude-plugin/marketplace.json
related_plans: []
---

# Release Session Relay 0.15.0 and accept docks-kit child 0.13.0

## Goal

Session Relay ships 0.15.0 and the parent release lane binds public child
docks-kit 0.13.0. Seven commits of shipped Rust source changed since
`session-relay--v0.14.0` and are unreleased; the lane currently refuses both
0.15.0 and any child other than 0.12.0.

This is one half of a cross-repository goal, joined by a shared `goal_id`. The
child half exists and is verified as of this drafting:

| Field | Value |
|---|---|
| repository | `DocksDocks/public` |
| plan | `docs/plans/active/session-relay-0.15.0-docks-kit-0.13.0-release.md` |
| `goal_id` | `258b44c2-c3b2-4902-862c-7461724ca078` — identical to this run's |
| `run_id` | `ad7f3b75-dfff-4bcd-8d1f-c8c11555b119` — becomes `public_run_id` in step 3 |
| state | `planned`, `draft_review` passed at invocation 2 |

The shared-`goal_id` convention is not assumed: in the 0.14.0 precedent the docks
instance's `current_attempt.goal_id` is byte-identical to the `goal_id` in the
public repo's finished 0.14.0 plan, while the two `run_id`s differ. Neither half
completes alone, and the child is blocked on this half twice — once for the
digests and once because its plan path only becomes the derived one after step 2.

## Context & rationale

Measured, not assumed. Every count below came from a command run at draft time.

**The lane refuses 0.15.0 today.** `session-relay-release-cli.mjs` derives
`SUPPORTED_VERSIONS` from `session-relay-release-core.mjs` `VERSION` (`0.14.0`)
plus `HISTORICAL_VERSION` (`0.13.0`), so `--prepare` for 0.15.0 fails with
`--prepare is only valid for session-relay 0.13.0 or 0.14.0`. This is a one-line
gate, not a wall: the version-scoped instance files this lane recently gained are
exactly the mechanism that makes admitting 0.15.0 a data change.

**Two independent bumps, not one.** Step rows separate them because their blast
radii differ and one is build-affecting:

- *Relay* `0.14.0 -> 0.15.0` touches `rust/Cargo.toml` and `rust/Cargo.lock`,
  both plugin manifests, the versioned marketplace entry, `core.mjs VERSION`,
  the `frozen_at_version` fixture, and body/assertion text in five contract
  tests. `distribution-contract.mjs` asserts `Cargo.lock must bind Session Relay
  0.14.0`, so the crate version is load-bearing for the binaries.
- *Child* `0.12.0 -> 0.13.0` touches 31 sites across 8 files: 5 in source
  (`promotion.mjs` `PUBLIC_VERSION` and `CURRENT_DOCKS_KIT_RELEASE`,
  `publication.mjs` `CURRENT_PUBLIC_VERSION`, and `public_child.{version,tag}` in
  the instance file) and 26 across the five `*contract*.mjs` files.
  `preparation.mjs` needs no literal edit: it already reads
  `INSTANCE.public_child.{version,tag}`.

**Version strings are ambiguous in three directions.** This is the central
hazard of the whole plan, and it is why no acceptance row below greps a version:

| String | Means one thing | And also | Consequence |
|---|---|---|---|
| `0.12.0` | child version | `PRODUCTION_VERSION` in `companion-distribution-contract.mjs` is a *Relay* version consumed as `session-relay--v${…}`, `relay.verified`, `relay.plugin_version` | a pre-bump value-replace corrupts a relay pin |
| `0.13.0` | the child's target | legacy relay-CLI version in `distribution-contract.mjs` `RELEASE_VERSION`, `release-publication-contract.mjs` `EXPECTED_VERSION`/`EXPECTED_TAG`, three preflight refs, and the quarantined plan path | a post-bump value-sweep cannot distinguish new from pre-existing |
| `0.15.0` | Relay's target | the docks plugin, already released at 0.15.0 | after the bump `marketplace.json` holds two, distinguishable only by entry `name` |

**The instance file is the join point.** `INSTANCE_FIELD_GROUPS.current_attempt`
requires `goal_id, docks_run_id, docks_plan_path, docks_source_base,
public_run_id, release_plan_path`, and `preparation.mjs` requires the groups
`current_attempt, planrun_attempt, continuation_paths, public_child,
authorized_base`. `public_run_id` must be a PlanRunV1 `run_id` from a canonical
plan in the *public* repository, so that plan precedes this file. The 0.14.0
precedent proves the convention: docks instance `goal_id`
`8b89aabf-7336-4352-bc11-225bab67f9aa` is byte-identical to the `goal_id` in the
public repo's finished 0.14.0 plan, while the two `run_id`s differ.

**Ordering is forced by irreversibility.** Tagging burns a version — no retag, no
asset replacement — and the child's npm publish is unrecallable. The parent must
already accept `0.13.0` before the child publishes, or the child lands
permanently on a lane that structurally rejects it.

## Environment & how-to-run

Run every command from the repository root of this checkout, with one measured
exception stated below. Do not hard-code a machine path here: plan text must stay
portable, and `plan-skill-phases.mjs --case bounded-workflows` fails any active
plan citing an absolute checkout path.

```bash
corepack enable && pnpm install --frozen-lockfile     # Node 24
node scripts/ci.mjs --plugin session-relay            # authoritative gate for this plan
```

The gate is local: `scripts/lib` contains no `fetch(`, no `api.github.com`, and
no `registry.npmjs.org`. It therefore reaches green before either tag exists.
Rust work needs the pinned toolchain from `rust-toolchain.toml`, and that is the
exception to the repository-root rule: the two `cargo metadata` observables run
from `plugins/session-relay/rust/`, because rustup resolves `rust-toolchain.toml`
from the working directory rather than from `--manifest-path`. Measured on this
checkout, invoking them from the repository root exits 1 before emitting any JSON,
because no default toolchain is configured. Every other command in this plan runs
from the repository root.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Bump the Relay crate version, which the binaries carry | `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock` | — | `local` | `planned` | run from `plugins/session-relay/rust/`, `cargo metadata --format-version 1 --no-deps` emits exactly one package whose `packages[0].version` is `0.15.0`, and `Cargo.lock` agrees. Both details are measured, not stylistic: `--no-deps` is required because the bare form emits the entire resolved dependency graph rather than one version, and the working directory must be the crate directory because rustup resolves the pinned toolchain from the working directory — invoked from the repository root with no default toolchain configured, `cargo` exits 1 before emitting any JSON. Failure: STOP; a wrong crate version would silently ship in the binaries staged by the tag row. |
| 2 | Bump Relay's declared version across manifests and the lane constant | `plugins/session-relay/.claude-plugin/plugin.json`, `plugins/session-relay/.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `scripts/lib/session-relay-release-core.mjs` | 1 | `local` | `planned` | All three manifest sites plus `core.mjs VERSION` read `0.15.0`, selected by marketplace entry `name` rather than by value because the docks entry already reads `0.15.0`. Failure: STOP. |
| 3 | Create the release instance for 0.15.0 | `scripts/lib/session-relay-release-instances/0.15.0.json` | 2, and the public plan's `goal_id`/`run_id` | `local` | `planned` | `loadReleaseInstance('0.15.0', { require: ['current_attempt','planrun_attempt','continuation_paths','public_child','authorized_base'] })` resolves; `public_child` reads `{version:'0.13.0', tag:'cli-v0.13.0'}`; `current_attempt.goal_id` is `258b44c2-c3b2-4902-862c-7461724ca078` and `public_run_id` is `ad7f3b75-dfff-4bcd-8d1f-c8c11555b119`. `planrun_attempt.release_tag_commit` holds the sentinel formed by repeating `deadbeef` five times — 40 hex characters, so it satisfies the schema's `commit40` rule, while being unmistakably a placeholder that no reader or diff can mistake for a settled SHA. It was chosen by measurement, not taste: `f` × 40 and `0` × 40 both already occur in this repository and would leave the sentinel sweep unsatisfiable. Failure: STOP. |
| 4 | Move the child identity in lane source | `scripts/lib/session-relay-release-promotion.mjs`, `scripts/lib/session-relay-release-publication.mjs` | 3 | `local` | `planned` | `PUBLIC_VERSION`, `CURRENT_DOCKS_KIT_RELEASE`, and `CURRENT_PUBLIC_VERSION` name the child by constant, each `0.13.0`/`cli-v0.13.0`; `PRODUCTION_VERSION` is unchanged. Verified by reading each constant by name, never by grepping the value. Failure: STOP. |
| 5 | Re-point every contract-test expectation and re-freeze the census | the eight `plugins/session-relay/test/**` paths in `affected_paths` — seven `.mjs` contracts plus the `fixtures/release-identity-inventory.json` census this row re-freezes | 4 | `local` | `planned` | `node scripts/ci.mjs --plugin session-relay` exits 0. `release-evidence-contract.mjs` enumerates `0.15.0.json`. The identity inventory is regenerated through its own `--freeze` path, never hand-edited. Failure: STOP; do not relax a floor or edit a census to match a scan. |
| 6 | Tag and stage the Relay prerelease | none (Git ref + CI artifacts) | 5 | `release` | `planned` | Tag `session-relay--v0.15.0` resolves to the commit produced by the last `local`-effect row preceding it, and `build-binaries.yml` publishes exactly four binaries plus `SHA256SUMS`. Failure: STOP permanently — the version is burned and cannot be retagged or re-uploaded. |
| 7 | Replace the sentinel tagged-commit value everywhere it is pinned | `scripts/lib/session-relay-release-instances/0.15.0.json`, `plugins/session-relay/test/release-evidence-contract.mjs`, `plugins/session-relay/test/release-promotion-contract.mjs` | 6 | `local` | `planned` | A repository-wide sweep for the sentinel finds nothing, stated as a satisfiable observable: `! git grep -q "$(printf 'deadbeef%.0s' $(seq 5))"` exits 0. The negation is deliberate and measured — `git grep` exits **1** with empty output when there are no matches, so phrasing this as a command that "returns zero hits" and expecting exit 0 would be unsatisfiable. The pattern is built at run time rather than written literally, so the command cannot match this plan record and needs no path exclusion — an exclusion here could only hide a future literal. This sweep is the acceptance rather than the three named sites, because a site list only proves the sites I thought of and four of my inventories this session were short. Then `planrun_attempt.release_tag_commit` and both `PLANRUN_RELEASE_TAG_COMMIT` literals equal the 40-hex commit that `git rev-parse session-relay--v0.15.0^{commit}` reports. The `^{commit}` suffix is load-bearing and measured, not stylistic: `git tag --points-at <tag>` prints tag *names*, so comparing a 40-hex field against it can never pass, and bare `git rev-parse <annotated-tag>` yields the tag *object* SHA — also 40 hex, also never equal to this field, and `node scripts/ci.mjs --plugin session-relay` exits 0 a second time. Failure: STOP; a sentinel must never reach a promotion receipt. |
| 8 | Verify the four digests against downloaded bytes and hand them to the child | none | 6 | `probe` | `planned` | Each asset's recomputed `sha256` equals its `SHA256SUMS` row; the four values are reported to the child half. `SHA256SUMS` alone is not evidence. Failure: STOP before the child pins anything. |
| 9 | Read back the child's completed release | none | 8, and the child's rows that pin the digests, tag `cli-v0.13.0`, and archive its finished plan | `probe` | `planned` | The child's `cli-v0.13.0` tag, finished archived plan, and `run.completion_review.result_sha256` are all readable on the remote, and its `goal_id` still matches this run's. Read-only; grants nothing. Failure: STOP. |
| 10 | Run the lane's prepare, promote, and publish recipe | lane receipts | 7, 9 | `release` | `planned` | The lane's documented atomic recipe completes and Session Relay 0.15.0 is a stable, non-prerelease release. Failure: STOP with the receipt. |
| 11 | Archive this plan | this plan record | 10 | `push` | `planned` | Plan is `finished` at the dated archive path and pushed. Failure: leave `ongoing`. |

Step 10's internal ordering is deliberately not spelled out here: the endpoints
are measured (`--prepare` needs `public_run_id` and rejects 0.15.0 pre-bump;
promotion binds the child's tag, finished plan, and completion digest) but the
full intermediate sequence is not, and inventing it would be exactly the
asserted-structure failure this plan exists to avoid. Verify it against
`plugins/session-relay/AGENTS.md` and the lane's `--help` before executing.

## Acceptance criteria

Every row names a command whose failure is observable. None greps a version
string, because all three of the collisions above defeat that.

1. `node scripts/ci.mjs --plugin session-relay` exits 0 with the working tree
   clean. This is the authoritative gate for this plugin and its owned tooling.
2. Run from `plugins/session-relay/rust/`, `cargo metadata --format-version 1 --no-deps`
   emits exactly one package and its version equals `0.15.0`, and
   `distribution-contract.mjs`'s `Cargo.lock` binding assertion passes rather than
   being edited away. This row is proven non-vacuous: measured on this checkout the
   same command returns `0.14.0`, so it fails before the bump and can only pass
   after it. `--no-deps` and the crate working directory are both load-bearing — the
   bare form returns the whole dependency graph, and from the repository root the
   command exits 1 because the pinned toolchain resolves from the working directory.
3. `loadReleaseInstance('0.15.0', { require: [...all five groups] })` resolves,
   and a diff review confirms `PRODUCTION_VERSION` in
   `companion-distribution-contract.mjs` is byte-identical to its pre-bump value.
4. The plugin version triple agrees: `ci.mjs --plugin session-relay`'s lockstep
   check passes, selecting the marketplace entry by `name`.
5. The explicit two-commit diff `git diff --name-only <source_base> <last-local>`
   lists only paths declared in `affected_paths`. `<source_base>` is the sealed
   `source_base` in this plan’s own record; `<last-local>` is the commit produced
   by the last `local`-effect row before the first `release`-effect row. Both
   endpoints are named on purpose: a one-commit `git diff --name-only <commit>`
   compares the working tree against that commit instead of bounding a range, so
   it can report an empty or unrelated path set while the implementation scope
   goes entirely unchecked.
6. After the row that promotes the staged prerelease to stable — identified by its
   done-when text, not by its number — `gh release view session-relay--v0.15.0
   --json isDraft,isPrerelease` reports both false. The row that stages the
   prerelease deliberately leaves `isPrerelease` true, so asserting this against
   the staging row instead would read a correct staged state as a failure while
   stranded between the two irreversible boundaries.

Every row above is anchored by effect or by done-when text rather than by step
number. That is deliberate and it is the same lesson STOP 3 records: two review
findings against earlier drafts of this plan both reduced to a guard that named
specific rows and desynced when the table was renumbered mid-draft.

## Out of scope / do-NOT-touch

- The `DocksDocks/public` repository — the child half owns every file there. This
  plan neither edits nor commits in that repository. Referred to by repository id
  rather than by checkout path, because plan text must stay portable.
- `PRODUCTION_VERSION` and the legacy `PUBLIC_VERSION` in
  `companion-distribution-contract.mjs`; the legacy `RELEASE_VERSION`,
  `EXPECTED_VERSION`, `EXPECTED_TAG`, and preflight refs elsewhere. These read
  like the values being changed and are not.
- Every plan under `docs/plans/finished/` — historical records stay
  byte-identical.
- The quarantined blocked plan whose filename contains `0.13.0` and which refers
  to Relay's old CLI versioning. Never resume, repair, or cite it.
- The `docks` and `effect-kit` plugins. `docks` is already at 0.15.0 for
  unrelated reasons.
- Validator floors and frozen censuses. Fix the file, never the threshold.

## STOP conditions

1. A version-bearing edit lands in a file whose constant is a Relay pin rather
   than a child pin, or vice versa. Revert and re-classify by constant name.
2. The gate needs a floor lowered, a census edited to match a scan, or a golden
   hand-edited to pass. Any of these means the change is wrong, not the check.
3. Any row whose `Effect` column is not `local` is reached without a live
   `ExternalAuthorityV1` whose scope, mode, target, and source digest match that
   exact boundary. This condition deliberately names no row number and no subset
   of effects: root `AGENTS.md` requires live authority for *every* non-local
   action, and two review findings against earlier drafts of this plan shared one
   root cause — a guard that enumerates rows or effects desyncs the moment a row
   is renumbered or an effect is added. Read the requirement off the Effect column
   itself. `probe` rows still need their own literal `probe` authority: read-only
   and non-transitive means the grant carries nothing further, not that no grant
   is needed. `push` and `release` rows each need their own literal scope and
   target.
4. A digest disagrees with the downloaded bytes at the row that recomputes each
   asset's `sha256` against its `SHA256SUMS` row — that row is identified by its
   done-when text, not by its number. The tag is already burned by then, so stop
   and report rather than handing the child a value that was not verified.
5. The child's `goal_id` stops matching this run's, indicating the two halves
   have diverged into separate goals.
6. Any attempt to satisfy the parent by renaming the child's plan, or to satisfy
   the child by relaxing a parent guard.
7. The child's `cli-v0.13.0` tag is approved while its modified
   `.github/workflows/release-cli.yml` has never executed. That workflow triggers
   on `push: tags: cli-v*` and nothing else — no `workflow_dispatch`, no branch
   trigger — so a modified copy's first execution would be the irreversible tag
   itself, where a YAML or dependency error burns `cli-v0.13.0` without
   publishing. The default resolution is to require the workflow change dropped
   from this release: measured, `parity.yml` already runs on push to all branches
   and executes the same chain (`check:generated`, `typecheck`, `test:unit`,
   `test:runtime:posix`, `golden:dryrun`). That redundancy only holds if the run
   is OBSERVED, not assumed: `parity.yml` is asynchronous, so push-then-tag can
   happen while it is still in progress or after it has failed. Dropping
   gate-on-tag is therefore conditional on confirming a `success` conclusion for
   the exact commit `cli-v0.13.0` will point at. Read that as
   `gh run list --commit <sha> --json conclusion,workflowName` and assert
   `conclusion` equals `success`, naming the field rather than eyeballing the
   table; `conclusion` is a real `gh run list --json` field, verified against `gh`
   2.93.0. Neither plan requires that observation today: the child's
   tag-and-release row asserts
   remote ancestry and readability only, and its immediately-preceding re-probe row
   lists workflow and OIDC preconditions but no CI conclusion. Those rows are named
   by their content because they live in a document this plan does not own and
   cannot renumber-proof. Without that observation the trade is a
   tested tag workflow for an untested assumption.
   If the child keeps the change instead, it must both
   add `workflow_dispatch` and position the new job so a dispatch run reaches it
   rather than dying at tag-vs-package validation, which has no tag on a dispatch
   run — and prove one green dispatch run before the tag. Stating only "must have
   been exercised" would be a gate with no satisfaction path, which is the mirror
   of a check that cannot fail. This gate lives here rather than in the child's
   plan because that plan's `draft_review` is `passed` at invocation 2 — its
   budget is spent, so amending its bytes would leave them unreviewed.

## Open questions

1. Step 10's internal command order within the lane's release recipe — endpoints
   measured, intermediate sequence to be verified before execution, not guessed.
2. Whether the three contract tests pinning `current_attempt.docks_plan_path`
   (`release-evidence-contract.mjs`, `release-publication-contract.mjs`,
   `companion-distribution-contract.mjs`) require this plan's own path
   registered as part of step 5. Measure before editing them.

Resolved during drafting, recorded so it is not re-litigated. The field
`planrun_attempt.release_tag_commit` is structurally self-referential for an
unreleased version: it names the commit the tag points at, and the instance file
is itself part of that commit. A file cannot contain its own commit SHA. The
0.14.0 precedent does not help — that file was created in one commit
(`ff2465f`) *after* 0.14.0 was already tagged, so it recorded a tag commit that
already existed. Measured resolution: every consumer compares the field against
release-time receipt or proof fields (`promotion.mjs:2784,2923,3013`;
`preparation.mjs:1089,2680`), and nothing resolves it against a live Git object.
So steps 3-5 may store a schema-valid provisional 40-hex and still reach a green
gate, provided step 7 replaces it — in the instance file and in both test-side
`PLANRUN_RELEASE_TAG_COMMIT` literals — before any receipt is generated. The
consequence for scheduling is explicit: the unattended local window is steps 1-5
only, and a second local edit plus gate cycle is required after the tag.

## Review

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"3c74e21c6297ee94a812de77266162ae671a810f77450e719dde6a5abdd9e150","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"a72ea0243ff254c961181df426773d925a7089003b9e62fa09c292ccae92adb8","invocations":2,"result_sha256":"3c74e21c6297ee94a812de77266162ae671a810f77450e719dde6a5abdd9e150","state":"blocked"},"execution_parent":null,"goal_id":"258b44c2-c3b2-4902-862c-7461724ca078","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.15.0-release.md","plan_sha256":"0f835b0f2730ab72922eafc603855f6bc7df19f0abcc34aeeac07a964d5fadb8","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"8dd47f78-e890-4e3d-bf60-e26b0193236c","schema":1,"source_base":"2298bbc7fac269b57ce6915ff82d84e452b661b8","source_sha256":"ba16f51fb7e440d0f0899bc55169b563f8d8d9ac294b56e7b0052d8d0c9ec18d"}

Plan-attempt-history: {"authorization_source_sha256":"521f0e36922ee111e8069b9f91466bddcb154db673f8b86929d8c9f5456588f0","plan_bytes_sha256":"a95e8eb8efdc196dda0f1e51dfc7c027393f6f65bdc1601c0bc48fda9bedc993","replacement_run_id":"8dd47f78-e890-4e3d-bf60-e26b0193236c","run":{"acceptance":null,"blocker":{"evidence_sha256":"070667735e7df15b996e47f29b6dc16202cd382574f0efd363b4115301c88877","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"61a68eb853346511ad236bbd35f814500b0e7b5e0c8da8977144951b7ebfa904","invocations":2,"result_sha256":"070667735e7df15b996e47f29b6dc16202cd382574f0efd363b4115301c88877","state":"blocked"},"execution_parent":null,"goal_id":"258b44c2-c3b2-4902-862c-7461724ca078","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.15.0-release.md","plan_sha256":"e29a06f0f7a807a4ee13efc8936bc7ff83fbf471f38d0db11bfb8b68ff87fddc","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"ff2125bd-746a-427b-86ba-2fc2cde51747","schema":1,"source_base":"95575af016dd1119f6fe85a5d5ca52e9f0b9f185","source_sha256":"78d1eeb735ef1bb8a664ba4aa4c82b07d7b4e4aafdcac225b9f52216c04942dc"},"schema":1,"status":"blocked","successor_run_sha256":"aa5cbb3b3cc4920e866949f1710478ffcbf5fcc781b613a9fe49b89dbae0c91b"}

### Replacement authority derivation

This run replaced a terminal predecessor, so its `source_sha256` must be
reproducible by a third party rather than asserted. The authorising bytes are the
UTF-8 bytes of the granted option label exactly as offered and selected, with no
prefix, no framing, and no trailing newline:

```text
Grant replacement authority
```

That is 27 bytes, and the digest is recomputable with
`printf 'Grant replacement authority' | sha256sum`, yielding
`521f0e36922ee111e8069b9f91466bddcb154db673f8b86929d8c9f5456588f0`. An earlier
attempt digested a hand-built transcript summary carrying invented field
prefixes; that byte form existed nowhere outside the operator's scratch file and
could not have been re-derived, which would have made the authority record an
assertion. Stating the construction rule is the difference.

### This run: invocation 1 adjudication

Verdict `repair`, three findings returned, two accepted and one rejected. Each was
reproduced by command before adjudication, because asserting structure instead of
measuring it is the single failure that ended the predecessor run.

`PRV1-002` accepted. Reproduced: `git tag --points-at docks--v0.1.0` printed
`docks--v0.1.0`, a tag name, so row 7's comparison of a 40-hex field against it
could never pass. The replacement was verified too, not assumed: that tag is
annotated (`git cat-file -t` reports `tag`), bare `git rev-parse` yields the tag
object `7094b6af…` while `^{commit}` yields the commit `9b1c1cf7…`. Both are
40 hex, so omitting the suffix would have swapped an unsatisfiable check for a
silently wrong one.

`PRV1-003` accepted. Reproduced: `git diff --name-only HEAD` compares the working
tree against one commit rather than bounding a range, so the row could report an
empty set and pass while checking nothing.

`PRV1-001` rejected as not reproducible against the live record, with the cause
stated because it does not favour me. The reviewer read `source_sha256`
`521f0e36…` in the bundle's `plan.md` against `ba16f51f…` in the manifest, and
that contradiction was real in the bundle: the driver installed my value, which was
wrong — I had set the run's `source_sha256` to the authorisation digest. The
reserve transition rebinds that field from the affected-path manifest, and the
bundle is sealed pre-reserve, so the reviewer saw the stale value while the live
record already carried `ba16f51f…`. Measured: live `run.source_sha256` equals
`manifest.source_sha256`, and the authorisation digest survives only in
`Plan-attempt-history.authorization_source_sha256`, exactly where the prescribed
fix places it. Nothing to repair; the mechanism corrected an error of mine.

One further instance of the twice-flagged class was swept proactively rather than
waiting for a third finding. Row 7's sentinel sweep was written as a command that
"returns zero hits"; measured, `git grep -I -c` on an absent pattern exits **1**
with empty output, so any wrapper expecting exit 0 would have been unsatisfiable.
It now states `! git grep -q …` exits 0, which was verified to exit 0.

A fourth instance of the same class was found and fixed before spending the second
permit, by enumerating every command in the Steps and Acceptance columns instead of
waiting for a reviewer to name one. Both `cargo metadata` sites claimed a single
version from a command that emits the whole resolved dependency graph. Measured with
the pinned 1.85.0 toolchain: `--no-deps` yields exactly one package, the bare form
does not, and the command exits 1 from the repository root because rustup resolves
`rust-toolchain.toml` from the working directory and no default toolchain is
configured. The row now names the working directory and the field it reads, and it is
non-vacuous because the same command returns `0.14.0` today.

Separately checked and deliberately left alone:
`Plan-attempt-history[0].successor_run_sha256` no longer hashes the live run,
because the reserve rebind moved it. Per `docs/plans/AGENTS.md:172` that field is
install-time audit evidence which later transitions "neither recompute nor
rewrite", so correcting it would destroy the audit trail rather than repair it.

### Predecessor run `ff2125bd`: invocation 1 provenance, and a defect it exposed

Recorded because the digest above would otherwise assert a review over a bundle
shape that never existed and cannot be re-derived.

Invocation 1 was dispatched over a **hand-sealed, non-canonical bundle**: a flat
`.md` file under the operator's review-bundle directory, named
`docks-0150-draft-1.md`, containing only the plan bytes. The recorded
`draft_review.input_sha256` digests that flat file. Every one
of the 26 precedent bundles in that directory is instead a
`plan-review-v1-<rand>/` directory holding exactly `plan.md`, `manifest.json`
and `binding.json`, and `plan-reviewer/SKILL.md` requires the bundle to carry
"immutable plan bytes, a canonical affected-path manifest, and the same four
bindings", verified before content review. The cause was mine: I hand-rolled
reserve-then-dispatch instead of using
`plan-manager/scripts/lifecycle/dispatch-review.mjs`, which seals the canonical
bundle and performs seal/reserve/dispatch/settle in one process precisely to
close the cold-`reserved` window I opened. Invocation 2 uses that driver.

**Defect in shipped code, not a footnote.** The reviewer accepted that bundle and
returned a verdict. Its own contract requires it to verify the manifest and the
closed binding object first and map failure to `bundle_binding_mismatch`. It did
neither, so the bundle-integrity guarantee underpinning every plan review in this
plugin is currently unenforced: a reviewer pointed at a hand-edited plan copy
would review it as authoritative. That is a separate goal from this release and
needs its own plan; it is recorded here so it survives this session.

The invocation-1 verdict is nonetheless consumed as valid. It bound `run_id`,
`invocation`, `plan_sha256` and `source_sha256` exactly, used only canonical
finding kinds, and both findings were independently reproduced before acceptance
— the unsatisfiable sweep by locating the literal sentinel in row 7's own text,
and the misanchored guards by reading the Effect column, which shows rows 6 and
10 as the two `release` rows against STOP 3's original "step 6 or 9".

## Verification Results

Manager-written after execution. Empty at draft time.
