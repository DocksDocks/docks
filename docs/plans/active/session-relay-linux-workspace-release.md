---
title: Prepare Session Relay 0.13.0 for Linux managed workspaces
goal: Make Linux managed workspaces releasable, preserve ordinary macOS Relay support and fail-closed workspace refusal, and seal reviewed 0.13.0 source evidence.
status: planned
created: "2026-07-22T21:28:09-03:00"
updated: "2026-07-22T21:58:22-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [session-relay, release, managed-workspaces, linux]
affected_paths:
  - .claude-plugin/marketplace.json
  - .github/workflows/build-binaries.yml
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/skills/productivity/session-relay/references/workspace.md
  - plugins/session-relay/test/companion-distribution-contract.mjs
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/verify-session-relay-preflight.mjs
related_plans:
  - session-relay-workspace-isolation
  - session-relay-prebuilt-cli-distribution
  - session-relay-prebuilt-cli-release
review_status: null
planned_at_commit: 1b6e4d1cafa30a5c5f1e1ad410e8392752fe669c
execution_base_commit: null
---

# Prepare Session Relay 0.13.0 for Linux managed workspaces

## Goal

Prepare independently reviewable Session Relay `0.13.0` source that releases managed workspaces as a Linux/ext4 capability without claiming macOS managed custody. Preserve the existing ordinary Relay CLI, all four Linux/macOS x86-64/arm64 native artifacts, and the exact macOS workspace refusal. Seal native producer and full-CI evidence for a later, separately reviewed publication plan; do not create a tag or GitHub Release in this plan.

## Context & rationale

The finished `session-relay-workspace-isolation` plan implemented and independently validated the nine-command managed-workspace surface. Linux has the required cgroup-v2, `cgroup.kill`, recursive empty proof, pidfd, and Landlock custody. macOS does not have a documented public primitive providing crash-durable descendant membership plus atomic kill/empty proof, so `macos_pgroup_libproc` remains inactive and returns the frozen refusal.

That limitation is feature-level, not product-level. Ordinary Session Relay already supports macOS, and the release system intentionally publishes four native binaries. Removing Darwin assets would break an unrelated supported surface. Conversely, describing a successful Darwin build or negative-admission test as macOS workspace support would weaken the security boundary.

The selected release contract is therefore:

- ordinary Relay CLI: Linux and macOS, x86-64 and arm64;
- managed workspace writing: Linux/ext4 only, subject to all existing admission predicates;
- macOS managed workspaces: exact fail-closed refusal, tested natively on APFS;
- release evidence: positive Linux custody plus negative macOS admission are both required and have different meanings;
- artifact set: unchanged four native binaries plus `SHA256SUMS`.

A physical Mac or macOS user is not required. GitHub-hosted `macos-15-intel` and `macos-15` runners provide native Darwin/APFS build, version, attestation, and refusal evidence. They do not substitute for Linux custody evidence, which remains owned by the two native Linux runners.

This is a source-preparation plan. It may bump Session Relay to `0.13.0`, update the release-policy wording and frozen fixtures, and produce exact preflight evidence. Before the Docks candidate is sealed, a separate `/home/vagrant/projects/public` source-preparation plan must produce an independently reviewed, immutable, blocked companion source identity without guessing any production digest. Publication, production digest insertion, promotion, installation smoke, and stable finalization remain owned by the later separately created and reviewed Docks publication plan.

## Environment & how-to-run

- Docks repository: `/home/vagrant/projects/docks`, branch `main`; execute from a clean dedicated worktree.
- Public repository: `/home/vagrant/projects/public`; only its public plan-creator and plan-manager may write its plan or lifecycle state.
- Public source-preparation plan: `docs/plans/active/session-relay-cli-0.13.0-release-preparation.md`.
- Public immutable validation ref: `refs/heads/preflight/session-relay-cli-0.13.0-<first 12 hex of PUBLIC_COMMIT>`, created once without force and accepted on resume only when its full tip is the recorded `PUBLIC_COMMIT`.
- Node: repository-supported Node 24 with `corepack enable && pnpm install --frozen-lockfile` already satisfied.
- Rust: `cargo +1.85.0` with `plugins/session-relay/rust/rust-toolchain.toml` and `--locked`.
- Release version: exactly `0.13.0`; tag reserved for the follow-up plan is `session-relay--v0.13.0`.
- Exact Docks source-preparation plan path: `docs/plans/active/session-relay-linux-workspace-release.md`; the release binder must accept only its dated finished archive.
- Docks native validation ref: `refs/heads/preflight/session-relay-0.13.0-<first 12 hex of SOURCE_COMMIT>`, create-once and never force-updated.
- Producer workflow: `.github/workflows/build-binaries.yml` in `validate-only` mode with exact `expected_commit=SOURCE_COMMIT` and empty `expected_tag`.
- Source-CI workflow: `.github/workflows/ci.yml` dispatched at the same Docks validation ref with its exact empty input object.
- Required native matrix: `ubuntu-24.04`/`x86_64-unknown-linux-musl`, `ubuntu-24.04-arm`/`aarch64-unknown-linux-musl`, `macos-15-intel`/`x86_64-apple-darwin`, and `macos-15`/`aarch64-apple-darwin`.
- Skill metadata refresh after shipped skill/reference edits: `node scripts/skills/content-hash.mjs --fix plugins/session-relay/skills`, then the check-only command in A7.

Before either repository's production edit, the Docks plan-manager creates and owns one persistent receipt directory outside `/tmp`; every canonical receipt has a distinct no-clobber path under it and remains available across a workstation restart:

```bash
RECEIPT_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/docks-release/session-relay-0.13.0"
install -d -m 700 "$RECEIPT_ROOT"
RECEIPT_DIR="$(mktemp -d "$RECEIPT_ROOT/preparation.XXXXXX")"
RECEIPT_DIR="$(realpath -e -- "$RECEIPT_DIR")"
chmod 700 "$RECEIPT_DIR"
test "$(stat -Lc '%a' -- "$RECEIPT_DIR")" = 700
test "$(stat -Lc '%u' -- "$RECEIPT_DIR")" = "$(id -u)"
DOCKS_RED_CAPTURE="$RECEIPT_DIR/docks-red-capture.json"
DOCKS_RED="$RECEIPT_DIR/docks-red.json"
PUBLIC_RED="$RECEIPT_DIR/public-red.json"
PREFLIGHT_RECEIPT="$RECEIPT_DIR/producer-preflight.json"
SOURCE_CI_RECEIPT="$RECEIPT_DIR/source-ci.json"
CANDIDATE_RECEIPT="$RECEIPT_DIR/source-preparation-candidate.json"
```

Receipt writers must atomically create mode-`0600` canonical RFC 8785 JCS bytes and refuse existing output paths. The Docks and public `TddRedReceiptV1` bytes are captured before their respective production edits, embedded byte-for-byte with adjacent SHA-256 values in their manager-owned plans, and later materialized into `DOCKS_RED` and `PUBLIC_RED`; neither is recreated from conversational handback.

`PUBLIC_COMMIT` means the clean public commit at the immutable public validation ref whose plan is independently draft-reviewed and blocked. `SOURCE_COMMIT` means the clean Docks release-ready commit containing every non-plan Docks change. `BUILD_RUN_ID` and `SOURCE_CI_RUN_ID` mean the unique new workflow-dispatch database IDs selected by before/after set difference for their exact workflows and the same Docks validation ref. `ARTIFACT_DIR="$RECEIPT_DIR/artifacts"` is a newly created empty mode-`0700` directory owned by the verifier. `EVIDENCE_COMMIT` means the later plan-only Docks commit that embeds the canonical receipts and candidate. These values and their hashes are recorded in this plan; none is selected from “latest” state.

## Interfaces & data shapes

### Product capability boundary

No new runtime flag or receipt field is needed. Platform capability remains derived from the existing admission result:

```text
ordinary_relay_targets = {
  x86_64-unknown-linux-musl,
  aarch64-unknown-linux-musl,
  x86_64-apple-darwin,
  aarch64-apple-darwin
}
managed_workspace_supported = platform_backend == linux_cgroup_v2_pidfd
macos_workspace_result = exact STOP_REASON error
```

`SessionRelayBinaryAttestationV1`, `ProducerPreflightReceiptV1`, `SourceCiReceiptV1`, publication receipts, and promotion receipts keep their existing closed schemas and exact keys. Capability claims are proven by ordered workflow steps, not added to a binary attestation that describes ordinary executable provenance.

### Source-preparation evidence contract

The unchanged closed `SourcePreparationCandidateV1` contract consumes the companion repository ID `DocksDocks/public`, immutable public validation ref and full commit, public plan path and canonical input SHA-256, public execution-base commit, passed draft-review receipt SHA-256, canonical public red-receipt SHA-256, status `blocked`, and exact blocked reason “Awaiting the four independently hashed `session-relay--v0.13.0` production asset digests.” The public plan may use fixture digests only in tests; it must not guess, publish, or write any production digest.

The same candidate also binds the Docks plan path/blob before evidence embedding, execution base, `SOURCE_COMMIT`, canonical Docks red receipt, `ProducerPreflightReceiptV1`, `SourceCiReceiptV1`, and the results of exactly A1–A6. Step 4 must keep the preparation helper's internally executed A1–A6 command identities synchronized with the A1–A6 table below. Plan-manager is the sole writer of the fixed Notes identities and embedded canonical bytes.

### Native evidence semantics

- Linux legs must build the exact release binary, run `linux_cgroup_pidfd_guardian_kills_hostile_descendants` inside the delegated cgroup with that binary, run explicit-fresh-binary workspace smokes, then attest and upload.
- macOS legs must build and execute the exact release binary, verify native Darwin 15+/APFS identity, run `macos_process_group_recursive_guardian_kills_hostile_descendants`, require the frozen refusal, then attest and upload the ordinary Relay binary.
- Aggregate must accept exactly four binary attestations and binaries, verify their target/runner/digest/version identities, and emit exactly four sorted checksum lines.

### Version surfaces

`0.13.0` must agree across the Claude and Codex plugin manifests, Claude marketplace entry, Cargo package/lockfile, release-core `VERSION`, preflight expected stdout/ref, preparation fixtures, and all release/distribution contract fixtures. `.agents/plugins/marketplace.json` intentionally has no version field and must not gain one.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Prepare the required public companion source before Docks candidate sealing. | `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-0.13.0-release-preparation.md` (external; written only by public plan-creator/plan-manager) | — | planned | In `/home/vagrant/projects/public`, public plan-creator creates the exact plan; public plan-manager independently performs its schema-6 draft review with `start`, records its execution base, captures canonical test-first `TddRedReceiptV1` evidence before public production edits, implements only fixture-backed source preparation, commits a clean `PUBLIC_COMMIT`, creates the immutable public validation ref without force, and blocks the plan with exact reason “Awaiting the four independently hashed `session-relay--v0.13.0` production asset digests.” Docks freshly fetches that ref and records the plan input, execution base, passed draft-review receipt, red receipt, commit/ref, status, and reason; STOP on any mismatch or production digest. |
| 2 | Add contract-first assertions for the feature-level release boundary and capture the Docks red receipt before Docks production edits. | `plugins/session-relay/test/release-evidence-contract.mjs`, `plugins/session-relay/test/release-publication-contract.mjs`, `plugins/session-relay/test/release-promotion-contract.mjs`, `plugins/session-relay/test/distribution-contract.mjs`, `plugins/session-relay/test/companion-distribution-contract.mjs`; manager-owned Notes in this plan | 1 | planned | Tests require four ordinary native assets, positive Linux workspace custody, exact macOS workspace refusal, and reject either a macOS workspace-support claim or a missing Darwin ordinary artifact. Run the repository's canonical `scripts/capture-tdd-red.mjs` into `DOCKS_RED_CAPTURE` against the complete frozen test paths, require nonzero, embed its exact canonical bytes/hash before production edits, and preserve the test blobs through `SOURCE_COMMIT`; STOP if a closed receipt schema must change. |
| 3 | Reframe public and maintainer guidance from a cross-platform release STOP to a Linux-only managed-workspace release boundary. | `plugins/session-relay/AGENTS.md`, `plugins/session-relay/skills/productivity/session-relay/SKILL.md`, `plugins/session-relay/skills/productivity/session-relay/references/workspace.md` | 2 | planned | Guidance clearly distinguishes ordinary macOS Relay support from unsupported macOS managed writing, preserves the exact STOP reason, names GitHub-hosted native refusal evidence, and does not advertise arbitrary unmanaged-process containment. Refresh the skill content hash. |
| 4 | Rebind source preparation to this plan and preserve the four-target evidence protocol. | `scripts/lib/session-relay-release-preparation.mjs`, `scripts/verify-session-relay-preflight.mjs`, `.github/workflows/build-binaries.yml` | 2 | planned | Fixed active/finished plan paths name this plan; the candidate verifier accepts only the recorded public companion identities; `--check-prepared` executes and records exactly A1–A6; preflight still requires all four target/runner pairs and ordered platform-specific steps; and no V1 receipt or attestation keys change. Workflow edits are allowed only if frozen tests show the existing order cannot represent the boundary. |
| 5 | Bump only Session Relay release/version surfaces to `0.13.0` and update exact fixtures. | `.claude-plugin/marketplace.json`, `plugins/session-relay/.claude-plugin/plugin.json`, `plugins/session-relay/.codex-plugin/plugin.json`, `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `scripts/lib/session-relay-release-core.mjs`, `scripts/lib/session-relay-release-preparation.mjs`, `scripts/verify-session-relay-preflight.mjs`, and the five Step 2 contract files | 3–4 | planned | All version authorities agree on `0.13.0`; Cargo lockstep is generated deterministically; existing four-asset names and release state-machine semantics are unchanged; no Docks/effect-kit version changes enter the diff. |
| 6 | Seal the exact Docks source candidate and native/full-CI evidence without publication. | All affected Docks paths above plus manager-owned machine records in this plan | 1–5 | planned | Follow the exact sealing procedure below: materialize both red receipts, commit clean `SOURCE_COMMIT`, create the immutable Docks validation ref, uniquely select and watch the validate-only producer and `ci.yml` runs, emit and hash `ProducerPreflightReceiptV1` and `SourceCiReceiptV1`, run `--check-prepared` with every explicit receipt path/hash so it records A1–A6 and emits `SourcePreparationCandidateV1`, embed canonical bytes/hashes, commit plan-only `EVIDENCE_COMMIT`, and pass embedded verification. No tag, Release, production branch, production digest, promotion, or install is created. |
| 7 | Complete independent review and hand off to a separate release plan. | `docs/plans/active/session-relay-linux-workspace-release.md` only for manager-owned evidence/lifecycle writes | 6 | planned | Schema-6 completion review passes for the exact source tree and acceptance inventory, the plan archives under `docs/plans/finished/`, and its reusable completion receipt names the reviewed `SOURCE_COMMIT`. Only then may plan-creator create `session-relay-linux-workspace-publication`; plan-manager independently reviews it before it may publish assets, supply the four real digests to the already reviewed blocked public plan, complete that separate public lifecycle, promote, smoke, or finalize. |

### Step 6 sealing procedure

1. Re-read the fixed Docks/public red Notes byte/hash pairs, require canonical closed `TddRedReceiptV1` values, and run `node scripts/release.mjs --materialize-tdd-red --plugin session-relay 0.13.0 --plan docs/plans/active/session-relay-linux-workspace-release.md --docks-red-out "$DOCKS_RED" --public-red-out "$PUBLIC_RED"`. Re-hash both no-clobber mode-`0600` files and require equality with `DOCKS_RED_SHA256` and `PUBLIC_RED_SHA256`.
2. Commit every release-owned non-plan change as `SOURCE_COMMIT`, require an empty worktree, set `PREFLIGHT_REF="refs/heads/preflight/session-relay-0.13.0-${SOURCE_COMMIT:0:12}"`, and push only `"$SOURCE_COMMIT:$PREFLIGHT_REF"` without force. The remote ref must have been absent or already equal the same full `SOURCE_COMMIT`; do not update `main` or create a tag.
3. Snapshot matching `build-binaries.yml` workflow-dispatch database IDs for branch `"preflight/session-relay-0.13.0-${SOURCE_COMMIT:0:12}"`; run `gh workflow run build-binaries.yml --ref "preflight/session-relay-0.13.0-${SOURCE_COMMIT:0:12}" -f mode=validate-only -f expected_commit="$SOURCE_COMMIT"`; select exactly one new ID by set difference; query it through `gh api` and require workflow file/SHA, event, head branch/SHA, and complete inputs `{mode:"validate-only",expected_commit:SOURCE_COMMIT,expected_tag:""}`; then run `gh run watch "$BUILD_RUN_ID" --exit-status`.
4. Create empty mode-`0700` `ARTIFACT_DIR`, then run A10. The verifier alone downloads exact artifact database IDs and emits canonical `ProducerPreflightReceiptV1` at `PREFLIGHT_RECEIPT`; capture and verify `PREFLIGHT_SHA256`.
5. Snapshot matching `ci.yml` workflow-dispatch database IDs for the same branch; run `gh workflow run ci.yml --ref "preflight/session-relay-0.13.0-${SOURCE_COMMIT:0:12}"`; select exactly one new ID by set difference; query it through `gh api` and require workflow file/SHA, event, head branch/SHA, and an empty input object; then run `gh run watch "$SOURCE_CI_RUN_ID" --exit-status` and A11 to emit canonical `SourceCiReceiptV1`; capture and verify `SOURCE_CI_SHA256`.
6. Run A12 with the four canonical receipt path/hash pairs. It must freshly verify the immutable public companion binding, red ancestry and frozen blobs, producer/source-CI identities, and the release-owned Docks tree; execute and record exactly A1–A6; and atomically emit canonical `SourcePreparationCandidateV1` at `CANDIDATE_RECEIPT`. Capture and verify `CANDIDATE_SHA256`.
7. Docks plan-manager copies the exact canonical preflight, source-CI, and candidate JCS bytes without parsing, reserialization, or extra newline into their fixed Notes fields with adjacent hashes; records all source, run, workflow, companion, and evidence identities; runs `node scripts/ci.mjs` on that plan-only tree; then commits only this plan as `EVIDENCE_COMMIT`. Require `git diff --exit-code "$SOURCE_COMMIT..$EVIDENCE_COMMIT" -- . ':(exclude)docs/plans/active/session-relay-linux-workspace-release.md'`.
8. Run A13 against the committed plan. It must reconstruct all five embedded canonical receipts byte-for-byte, freshly reverify public/Docks source identities, and rerun A1–A6 with identical outcomes before completion review.

## Acceptance criteria

Run in order from the Docks repository root after the dependency for each row exists. A1–A9 validate the clean source tree; `--check-prepared` in A12 reruns and records exactly A1–A6. A10–A12 consume the uniquely selected native/source-CI runs and canonical red receipts; A13 consumes the committed embedded evidence.

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/release-evidence-contract.mjs` | Exit 0; producer evidence requires both Linux positive custody and macOS negative admission, exact four native artifacts/attestations, and rejects macOS managed-workspace support claims without rejecting ordinary Darwin binaries. |
| A2 | `node plugins/session-relay/test/release-publication-contract.mjs` | Exit 0; publication remains closed to exactly four same-run native binaries plus `SHA256SUMS`, with exact target/runner/version/digest provenance. |
| A3 | `node plugins/session-relay/test/release-promotion-contract.mjs` | Exit 0; promotion preserves all four target pins and cannot promote a missing or substituted ordinary macOS asset. |
| A4 | `node plugins/session-relay/test/distribution-contract.mjs` | Exit 0; the workflow matrix retains both Linux and both macOS native runners, Linux custody/smoke, macOS refusal, four attestations, and four checksum lines. |
| A5 | `node plugins/session-relay/test/companion-distribution-contract.mjs --public-remote https://github.com/DocksDocks/public.git --public-ref "$(sed -n 's/^- Companion validation ref: //p' docs/plans/active/session-relay-linux-workspace-release.md)" --public-commit "$(sed -n 's/^- Companion implementation commit: //p' docs/plans/active/session-relay-linux-workspace-release.md)" --detached-clone` | Exit 0; a fresh detached clone proves the immutable public ref/commit, reviewed plan input/execution-base/draft-review/red identities, blocked status/reason, fixture-only test pins, and absence of guessed production digests. |
| A6 | `cargo +1.85.0 build --manifest-path plugins/session-relay/rust/Cargo.toml --release --locked && test "$(plugins/session-relay/rust/target/release/relay --version)" = "session-relay 0.13.0"` | Exit 0; the locked source builds a fresh host binary with the exact intended version. |
| A7 | `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills` | Exit 0; shipped Session Relay guidance and references have an idempotent current content hash. |
| A8 | `node plugins/session-relay/test/workspace-smoke.mjs --case docs-contract --bin "$PWD/plugins/session-relay/rust/target/release/relay"` | Exit 0; runtime help and shipped docs agree on the nine commands, Linux-only support, exact macOS refusal, and managed/unmanaged boundary using only the explicit fresh binary. |
| A9 | `node scripts/ci.mjs` | Exit 0; all repository, plan-policy, Docks, effect-kit, Session Relay, Rust, release-contract, selftest, format, and lint gates pass on `SOURCE_COMMIT`. |
| A10 | `node scripts/verify-session-relay-preflight.mjs --run-id "$BUILD_RUN_ID" --expected-commit "$SOURCE_COMMIT" --artifacts "$ARTIFACT_DIR" --receipt-out "$PREFLIGHT_RECEIPT"` | Exit 0 from the new empty verifier-owned directory; the exact validate-only run succeeds, all four native jobs have required platform evidence, every binary/attestation matches `SOURCE_COMMIT` and `0.13.0`, checksums verify, and canonical `ProducerPreflightReceiptV1` is created without clobber. |
| A11 | `SOURCE_CI_SHA256="$(node scripts/release.mjs --verify-source-ci --plugin session-relay 0.13.0 --run-id "$SOURCE_CI_RUN_ID" --expected-commit "$SOURCE_COMMIT" --receipt-out "$SOURCE_CI_RECEIPT")"` | Exit 0 and one 64-lowercase-hex digest; the exact same-ref authoritative `ci.yml` run has the required Node/pnpm/Claude/Rust/musl bootstrap and exact `node scripts/ci.mjs`, and canonical `SourceCiReceiptV1` is created without clobber. |
| A12 | `CANDIDATE_SHA256="$(node scripts/release.mjs --check-prepared --plugin session-relay 0.13.0 --source-commit "$SOURCE_COMMIT" --docks-red "$DOCKS_RED" --docks-red-sha256 "$DOCKS_RED_SHA256" --public-red "$PUBLIC_RED" --public-red-sha256 "$PUBLIC_RED_SHA256" --preflight "$PREFLIGHT_RECEIPT" --preflight-sha256 "$PREFLIGHT_SHA256" --source-ci "$SOURCE_CI_RECEIPT" --source-ci-sha256 "$SOURCE_CI_SHA256" --receipt-out "$CANDIDATE_RECEIPT")"` | Exit 0 and one 64-lowercase-hex digest; exact companion/source/red/producer/CI identities verify, A1–A6 are executed and recorded, and canonical `SourcePreparationCandidateV1` is created without clobber. |
| A13 | `node scripts/release.mjs --verify-embedded-preparation --plugin session-relay 0.13.0 --plan docs/plans/active/session-relay-linux-workspace-release.md` | Exit 0; all embedded canonical receipts reconstruct byte-for-byte, exact source/public/native/full-CI identities and A1–A6 results reverify, the feature-level platform boundary remains intact, and no release mutation is named. |

## Required follow-up release plan

After this plan is finished, plan-creator must create `docs/plans/active/session-relay-linux-workspace-publication.md`; only afterward may plan-manager independently review it and own its subsequent lifecycle. The plan must bind this plan's passed completion receipt, reviewed `SOURCE_COMMIT`, embedded candidate, and the already reviewed blocked `DocksDocks/public` companion identities before any external mutation. It owns, in order: immutable `session-relay--v0.13.0` tag creation, same-tag workflow publication of the five exact assets, non-install prerelease verification, independent hashing of the four production assets, exact-digest amendment/unblock/completion of the separate public plan under public plan-manager ownership, the matching docks-kit release, locked Docks promotion and live `docks-kit sync` smoke, then stable Session Relay finalization. No production digest is written before the immutable assets exist.

## Out of scope / do-NOT-touch

- Do not implement or imply macOS managed-workspace custody. Keep `macos_pgroup_libproc` inactive and preserve its exact refusal.
- Do not remove Darwin binaries, macOS runner legs, ordinary macOS Relay support, or any existing top-level Relay command.
- Do not add receipt/attestation keys or version a schema merely to encode prose capability; ordered native evidence already carries the distinction.
- Do not alter workspace authority, custody, Git broker, claims, resources, integration, recovery, or cleanup semantics proven by the finished implementation plan.
- Do not add a Docks workspace skill or advertise a Docks runtime command.
- Do not commit generated executables or `SHA256SUMS` under `plugins/session-relay/bin/`.
- Do not create a tag, GitHub Release, docks-kit production pin, production-branch promotion, or live installation in this plan.
- Do not modify Docks or effect-kit versions.

## Known gotchas

- “macOS build passed” means ordinary binary compatibility, not workspace custody.
- “macOS workspace test passed” means the exact refusal was observed, not that the feature works.
- The four-target artifact set and the Linux-only workspace capability set are deliberately different sets.
- `Cargo.lock` records the package version and must remain synchronized with `Cargo.toml`.
- `.agents/plugins/marketplace.json` has no Session Relay version; adding one creates a second convention rather than completing lockstep.
- Release preparation is fixed to one canonical active/finished plan path. Leaving the old prebuilt-distribution path would bind `0.13.0` to stale source evidence.
- Workflow dispatch selection must use before/after database-ID sets and exact queried inputs. Never bind “latest run.”
- All release actions remain pinned to full commit SHAs; do not loosen action provenance while changing product wording.
- The public companion plan is a source-preparation prerequisite, not the publication plan: it stays blocked with the exact four-digest reason until the later publication plan owns real asset production and digest insertion.
- The Docks producer run and source-CI run are distinct unique workflow-dispatch identities on the same immutable ref; local A9 is not a `SourceCiReceiptV1`.
- Canonical receipt files are append-only evidence at their original persistent no-clobber paths; copy bytes into Notes without JSON parse/stringify.

## Global constraints

- Correctness and fail-closed custody take priority over platform symmetry.
- Preserve ordinary Relay compatibility on both supported operating systems and architectures.
- Use GitHub-hosted native runners for platform evidence; do not cross-compile and call it native proof.
- Keep all current closed release schemas byte-compatible.
- Every downloaded or published executable must be independently hashed before installation or promotion.
- Publication requires a later independent plan review and exact completed-source binding.
- The separate public plan must be created by public plan-creator and reviewed, started, blocked, amended, and completed only by public plan-manager; Docks consumes immutable committed identities, never conversational claims.
- No secrets in plans, manifests, receipts, fixtures, workflow logs, or release bodies.

## STOP conditions

- STOP if making Linux-only managed workspaces releasable requires weakening or changing the frozen macOS refusal.
- STOP if any test or implementation drops a Darwin ordinary binary or treats macOS negative admission as positive custody.
- STOP if the four-target native workflow does not pass at the exact `SOURCE_COMMIT`; do not substitute local or cross-built evidence.
- STOP if Linux custody or explicit-fresh-binary smoke is skipped, filtered, ambient, or executed outside the delegated cgroup.
- STOP if preflight cannot bind exact workflow/run/job/artifact identities and all four checksums.
- STOP if any V1 release receipt or attestation schema would need to change; amend and independently review that protocol separately.
- STOP before any tag, Release, public production pin, promotion, or installation; those mutations require the finished source receipt and the follow-up publication plan.
- STOP if the public companion plan/ref is absent, mutable, dirty, unreviewed, not bound to its exact plan input/execution base/draft-review/red receipt, not `blocked`, or has any reason other than “Awaiting the four independently hashed `session-relay--v0.13.0` production asset digests.”
- STOP if either canonical red receipt does not prove a nonzero run against frozen test blobs before its repository's first production edit, or if materialization changes any byte/hash.
- STOP if build-binaries or source-CI selection yields zero or multiple new run IDs, either run is not bound to the exact create-once ref and `SOURCE_COMMIT`, or `--verify-source-ci` cannot emit canonical `SourceCiReceiptV1`.
- STOP if `--check-prepared` cannot bind every explicit receipt path/hash, freshly verify the public ref, record exactly A1–A6, or emit canonical `SourcePreparationCandidateV1`.
- STOP if `EVIDENCE_COMMIT` changes anything except this plan or embedded verification cannot reconstruct and reverify the canonical receipts/candidate.
- STOP if the plan path, source commit, version, target set, or working tree drifts after candidate preparation.

## Cold-handoff checklist

- **File manifest:** Every writable Docks path is named in frontmatter and Steps; the public companion path is external and owned only by its public plan lifecycle.
- **Environment and commands:** Both repositories, Node 24, Rust 1.85.0, version, create-once refs, workflow modes, matrix, persistent receipt directory, evidence variables, and ordered acceptance commands are fixed.
- **Interfaces and data contracts:** Product capability sets, native evidence meaning, unchanged V1 schemas, full companion identity tuple, version authorities, and artifact set are explicit.
- **Executable acceptance:** A1–A13 cover focused release contracts, immutable public companion proof, fresh binary/version, skill metadata, docs/runtime agreement, local full CI, native preflight, authoritative source CI, candidate production, and embedded source evidence.
- **Out of scope:** macOS custody, binary removal, runtime redesign, Docks UX, generated binaries, publication, production digests, and unrelated plugin versions are protected.
- **Decision rationale:** Feature-level support preserves the user's voluntary macOS compatibility without pretending the stronger managed-workspace security guarantee exists there.
- **Known gotchas:** Build-vs-capability semantics, target-set distinction, version lockstep, companion-vs-publication lifecycle, fixed plan binding, two-run dispatch identity, canonical no-clobber receipts, and action pinning are recorded.
- **Global constraints:** Fail-closed behavior, native evidence, schema compatibility, checksum provenance, cross-repository ownership, independent publication review, and secret hygiene are explicit.
- **No undefined terms:** `PUBLIC_COMMIT`, `SOURCE_COMMIT`, `BUILD_RUN_ID`, `SOURCE_CI_RUN_ID`, `ARTIFACT_DIR`, `RECEIPT_DIR`, and `EVIDENCE_COMMIT` are defined before use; both public and Docks follow-up plan names and ownership boundaries are fixed.

## Self-review

- `standalone_executability` — caught/fixed: a cold executor now has the public prerequisite, exact immutable identity tuple, persistent receipt paths, distinct workflow run IDs, candidate command, evidence embedding, and final verification sequence.
- `actionability` — caught/fixed: every step names exact files, owner, dependency, receipt/output, and failure action.
- `dependency_order` — caught/fixed: public plan-creator creates the companion source-preparation plan and public plan-manager reviews/starts/blocks it before Docks candidate sealing; later publication consumes rather than creates that prerequisite.
- `evidence_reverification` — pass: current release scripts, five contract files, four-runner workflow, platform modules/tests, shipped workspace guidance, manifests, and both related finished plans were re-opened at `planned_at_commit`.
- `goal_coverage` — pass: all four ordinary binaries remain while only Linux managed capability becomes releasable; no publication moved into source preparation.
- `executable_acceptance` — caught/fixed: A10 emits producer evidence, A11 emits source-CI evidence, A12 consumes all four path/hash pairs and records A1–A6, plan-manager embeds canonical bytes in a plan-only commit, and A13 verifies them.
- `failure_modes` — caught/fixed: companion drift, red-evidence drift, non-unique producer/CI selection, source-CI mismatch, candidate failure, non-plan evidence drift, target loss, false macOS support, skipped custody, schema drift, and premature publication all STOP.
- `open_questions` — pass: the user selected Linux-only managed workspaces and the exact companion/sealing order; no implementation choice remains unresolved.

## Open questions

None. The selected boundary is Linux-only managed workspace writing plus unchanged ordinary macOS Relay support and exact macOS workspace refusal.

## Sources

- `docs/plans/finished/2026-07-22-session-relay-workspace-isolation.md` — reviewed Linux custody implementation, macOS negative admission, nine-command surface, native evidence, and prior no-release boundary.
- `docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md` — four-target source-preparation and finished-source handoff pattern.
- `docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md` — separately reviewed publication, docks-kit, promotion, live smoke, and stable-finalization sequence.
- `.github/workflows/build-binaries.yml` — exact four native runners, Linux custody/smoke, macOS refusal, attestations, aggregate, and publication boundary.
- `plugins/session-relay/rust/src/workspace/platform.rs`, `plugins/session-relay/rust/src/workspace/platform/linux.rs`, and `plugins/session-relay/rust/src/workspace/platform/macos.rs` — current backend admission and frozen refusal.
- `plugins/session-relay/rust/tests/workspace_lease_process.rs` — positive Linux custody and exact macOS refusal tests.
- `plugins/session-relay/skills/productivity/session-relay/references/workspace.md` — shipped platform and managed/unmanaged boundary.
- `scripts/lib/session-relay-release-core.mjs`, `scripts/lib/session-relay-release-preparation.mjs`, `scripts/lib/session-relay-release-publication.mjs`, and `scripts/lib/session-relay-release-promotion.mjs` — version, asset, source-binding, publication, and promotion contracts.
- `scripts/verify-session-relay-preflight.mjs` and the five Session Relay release/distribution contract files — exact native evidence, runner, artifact, fixture, and downstream pin validation.

## Notes

- Companion repository: `/home/vagrant/projects/public`
- Companion repository ID: DocksDocks/public
- Companion plan: `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-0.13.0-release-preparation.md`
- Companion validation ref: pending
- Companion implementation commit: pending
- Companion plan input SHA-256: pending
- Companion execution base commit: pending
- Companion review receipt SHA-256: pending
- Companion TDD-red receipt JCS bytes: pending
- Companion TDD-red receipt SHA-256: pending
- Companion status: pending
- Companion blocked reason: pending
- Docks TDD-red receipt JCS bytes: pending
- Docks TDD-red receipt SHA-256: pending
- TAG_COMMIT / SOURCE_COMMIT: pending
- Producer preflight branch/ref commit: pending
- Producer preflight workflow SHA/run ID/attempt: pending
- Producer preflight artifact identities/digests: pending
- Producer preflight receipt JCS bytes: pending
- Producer preflight receipt SHA-256: pending
- Source CI receipt JCS bytes: pending
- Source CI receipt SHA-256: pending
- Source preparation candidate JCS bytes: pending
- Source preparation candidate SHA-256: pending
- Evidence commit: pending

## Review

(filled by main-context plan-manager after completion evidence)

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"d812e3877eb29cd24ba8c74ce8a25bd658025f0cfd69c62016e3e3a53e9f62ca","initial_input_sha256":"d812e3877eb29cd24ba8c74ce8a25bd658025f0cfd69c62016e3e3a53e9f62ca","lifecycle_intent":"none","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/session-relay-linux-workspace-release.md","request_ids":["d455ffa1-f909-40f6-b26d-58d0f2dbfd5d"],"retry_authorization":null,"round_index":1,"schema":2,"series_id":"49554a9a-637f-4fea-8899-ab6eb93f48d8","series_sha256":null,"state_sha256":"c58313f5d710a61caad1c7e29f6b470ebabf66611f1f95e1b5f3ee26776c7e53","status":"active","stop_reason":null,"terminal_evidence_sha256":null,"terminated_from_state":null,"terminated_from_state_sha256":null,"transitioned_from_state_sha256":null}
