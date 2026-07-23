---
title: Prepare Session Relay 0.13.0 for Linux managed workspaces
goal: Make Linux managed workspaces releasable, preserve ordinary macOS Relay support and fail-closed workspace refusal, and seal reviewed 0.13.0 source evidence.
status: planned
created: "2026-07-22T21:28:09-03:00"
updated: "2026-07-22T21:28:09-03:00"
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

This is a source-preparation plan. It may bump Session Relay to `0.13.0`, update the release-policy wording and frozen fixtures, and produce exact preflight evidence. Publication, docks-kit production digest pins, promotion, installation smoke, and stable finalization belong to a new release plan created and independently reviewed only after this plan finishes.

## Environment & how-to-run

- Repository: Docks, branch `main`; execute from a clean dedicated worktree.
- Node: repository-supported Node 24 with `corepack enable && pnpm install --frozen-lockfile` already satisfied.
- Rust: `cargo +1.85.0` with `plugins/session-relay/rust/rust-toolchain.toml` and `--locked`.
- Release version: exactly `0.13.0`; tag reserved for the follow-up plan is `session-relay--v0.13.0`.
- Exact source-preparation plan path: `docs/plans/active/session-relay-linux-workspace-release.md`; the release binder must accept only its dated finished archive.
- Native validation ref: `refs/heads/preflight/session-relay-0.13.0-<first 12 hex of SOURCE_COMMIT>`, create-once and never force-updated.
- Producer workflow: `.github/workflows/build-binaries.yml` in `validate-only` mode with exact `expected_commit=SOURCE_COMMIT` and empty `expected_tag`.
- Required native matrix: `ubuntu-24.04`/`x86_64-unknown-linux-musl`, `ubuntu-24.04-arm`/`aarch64-unknown-linux-musl`, `macos-15-intel`/`x86_64-apple-darwin`, and `macos-15`/`aarch64-apple-darwin`.
- Skill metadata refresh after shipped skill/reference edits: `node scripts/skills/content-hash.mjs --fix plugins/session-relay/skills`, then the check-only command in A7.

`SOURCE_COMMIT` means the clean release-ready commit containing every non-plan change. `RUN_ID` means the unique successful workflow-dispatch run selected by before/after GitHub run-ID set difference for the exact validation ref. `ARTIFACT_DIR` is a newly created empty mode-`0700` directory owned by the verifier. These values are captured during Step 5 and retained in the canonical preparation record; they are never guessed from “latest” state.

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

### Native evidence semantics

- Linux legs must build the exact release binary, run `linux_cgroup_pidfd_guardian_kills_hostile_descendants` inside the delegated cgroup with that binary, run explicit-fresh-binary workspace smokes, then attest and upload.
- macOS legs must build and execute the exact release binary, verify native Darwin 15+/APFS identity, run `macos_process_group_recursive_guardian_kills_hostile_descendants`, require the frozen refusal, then attest and upload the ordinary Relay binary.
- Aggregate must accept exactly four binary attestations and binaries, verify their target/runner/digest/version identities, and emit exactly four sorted checksum lines.

### Version surfaces

`0.13.0` must agree across the Claude and Codex plugin manifests, Claude marketplace entry, Cargo package/lockfile, release-core `VERSION`, preflight expected stdout/ref, preparation fixtures, and all release/distribution contract fixtures. `.agents/plugins/marketplace.json` intentionally has no version field and must not gain one.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Add contract-first assertions for the feature-level release boundary. | `plugins/session-relay/test/release-evidence-contract.mjs`, `plugins/session-relay/test/release-publication-contract.mjs`, `plugins/session-relay/test/release-promotion-contract.mjs`, `plugins/session-relay/test/distribution-contract.mjs`, `plugins/session-relay/test/companion-distribution-contract.mjs` | — | planned | Tests require four ordinary native assets, positive Linux workspace custody, exact macOS workspace refusal, and reject either a macOS workspace-support claim or a missing Darwin ordinary artifact. Capture the focused red result before production edits; STOP if the existing closed receipt schemas cannot express the boundary without a schema change. |
| 2 | Reframe public and maintainer guidance from a cross-platform release STOP to a Linux-only managed-workspace release boundary. | `plugins/session-relay/AGENTS.md`, `plugins/session-relay/skills/productivity/session-relay/SKILL.md`, `plugins/session-relay/skills/productivity/session-relay/references/workspace.md` | 1 | planned | Guidance clearly distinguishes ordinary macOS Relay support from unsupported macOS managed writing, preserves the exact STOP reason, names GitHub-hosted native refusal evidence, and does not advertise arbitrary unmanaged-process containment. Refresh the skill content hash. |
| 3 | Rebind source preparation to this plan and preserve the four-target evidence protocol. | `scripts/lib/session-relay-release-preparation.mjs`, `scripts/verify-session-relay-preflight.mjs`, `.github/workflows/build-binaries.yml` | 1 | planned | The fixed active/finished plan paths name this plan, preflight still requires all four target/runner pairs and ordered platform-specific steps, and no V1 receipt or attestation keys change. Workflow edits are allowed only if tests show the existing order cannot already represent feature-level support; otherwise leave it byte-identical. |
| 4 | Bump only Session Relay release/version surfaces to `0.13.0` and update exact fixtures. | `.claude-plugin/marketplace.json`, `plugins/session-relay/.claude-plugin/plugin.json`, `plugins/session-relay/.codex-plugin/plugin.json`, `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `scripts/lib/session-relay-release-core.mjs`, `scripts/lib/session-relay-release-preparation.mjs`, `scripts/verify-session-relay-preflight.mjs`, and the five Step 1 contract files | 2–3 | planned | All version authorities agree on `0.13.0`; Cargo lockstep is generated deterministically; existing four-asset names and release state-machine semantics are unchanged; no Docks/effect-kit version changes enter the diff. |
| 5 | Seal the exact source candidate and native evidence without publication. | All affected paths above plus manager-owned machine records in this plan | 1–4 | planned | Focused contracts and full CI pass, `SOURCE_COMMIT` is clean, the unique validate-only run succeeds on all four native legs, the verifier emits canonical preflight evidence, and the prepared candidate binds this plan, source commit, receipts, runner identities, and hashes. No tag, Release, production branch, or install is created. |
| 6 | Complete independent review and hand off to a separate release plan. | `docs/plans/active/session-relay-linux-workspace-release.md` only for manager-owned evidence/lifecycle writes | 5 | planned | Schema-6 completion review passes for the exact source tree and acceptance inventory, the plan archives under `docs/plans/finished/`, and its reusable completion receipt names the reviewed `SOURCE_COMMIT`. Only then may plan-manager create a distinct publication plan that owns the `session-relay--v0.13.0` tag, prerelease, docks-kit digest update/release, promotion, live sync smoke, and stable finalization. |

## Acceptance criteria

Run in order from the repository root. A1–A9 run on the clean source tree; A10–A11 consume the exact native run and canonical plan evidence produced in Step 5.

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/release-evidence-contract.mjs` | Exit 0; producer evidence requires both Linux positive custody and macOS negative admission, exact four native artifacts/attestations, and rejects macOS managed-workspace support claims without rejecting the ordinary Darwin binaries. |
| A2 | `node plugins/session-relay/test/release-publication-contract.mjs` | Exit 0; publication remains closed to exactly four same-run native binaries plus `SHA256SUMS`, with exact target/runner/version/digest provenance. |
| A3 | `node plugins/session-relay/test/release-promotion-contract.mjs` | Exit 0; promotion preserves all four target pins and cannot promote a missing or substituted ordinary macOS asset. |
| A4 | `node plugins/session-relay/test/distribution-contract.mjs` | Exit 0; the workflow matrix retains both Linux and both macOS native runners, Linux custody/smoke, macOS refusal, four attestations, and four checksum lines. |
| A5 | `node plugins/session-relay/test/companion-distribution-contract.mjs` | Exit 0; the downstream installer contract remains closed to the four ordinary Relay targets and preserves digest-before-install behavior. |
| A6 | `cargo +1.85.0 build --manifest-path plugins/session-relay/rust/Cargo.toml --release --locked && test "$(plugins/session-relay/rust/target/release/relay --version)" = "session-relay 0.13.0"` | Exit 0; the locked source builds a fresh host binary with the exact intended version. |
| A7 | `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills` | Exit 0; shipped Session Relay guidance and references have an idempotent current content hash. |
| A8 | `node plugins/session-relay/test/workspace-smoke.mjs --case docs-contract --bin "$PWD/plugins/session-relay/rust/target/release/relay"` | Exit 0; runtime help and shipped docs agree on the nine commands, Linux-only support, exact macOS refusal, and managed/unmanaged boundary using only the explicit fresh binary. |
| A9 | `node scripts/ci.mjs` | Exit 0; all repository, plan-policy, Docks, effect-kit, Session Relay, Rust, release-contract, selftest, format, and lint gates pass on `SOURCE_COMMIT`. |
| A10 | `node scripts/verify-session-relay-preflight.mjs --run-id "$RUN_ID" --expected-commit "$SOURCE_COMMIT" --artifacts "$ARTIFACT_DIR" --receipt-out "$ARTIFACT_DIR/../preflight.json"` | Exit 0 from a newly empty verifier-owned directory; the exact validate-only run is successful, both Linux and both macOS jobs have their required platform-specific evidence, all four binaries/attestations match `SOURCE_COMMIT` and `0.13.0`, and checksums verify. |
| A11 | `node scripts/release.mjs --verify-embedded-preparation --plugin session-relay 0.13.0 --plan docs/plans/active/session-relay-linux-workspace-release.md` | Exit 0; the embedded candidate and canonical receipts reconstruct byte-for-byte, bind the exact source/native/full-CI evidence, preserve the feature-level platform boundary, and name no release mutation. |

## Required follow-up release plan

After this plan is finished, create and independently review `docs/plans/active/session-relay-linux-workspace-publication.md`. It must bind this plan's passed completion receipt and reviewed source commit before any external mutation. It owns, in order: immutable `session-relay--v0.13.0` tag creation, same-tag workflow publication of the five exact assets, non-install prerelease verification, an independently reviewed DocksDocks/public plan that pins all four production digests and releases the matching docks-kit version, locked Docks promotion and live `docks-kit sync` smoke, then stable Session Relay finalization. It must retain the macOS managed-workspace refusal in release notes while stating that ordinary Relay remains available on macOS.

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

## Global constraints

- Correctness and fail-closed custody take priority over platform symmetry.
- Preserve ordinary Relay compatibility on both supported operating systems and architectures.
- Use GitHub-hosted native runners for platform evidence; do not cross-compile and call it native proof.
- Keep all current closed release schemas byte-compatible.
- Every downloaded or published executable must be independently hashed before installation or promotion.
- Publication requires a later independent plan review and exact completed-source binding.
- No secrets in plans, manifests, receipts, fixtures, workflow logs, or release bodies.

## STOP conditions

- STOP if making Linux-only managed workspaces releasable requires weakening or changing the frozen macOS refusal.
- STOP if any test or implementation drops a Darwin ordinary binary or treats macOS negative admission as positive custody.
- STOP if the four-target native workflow does not pass at the exact `SOURCE_COMMIT`; do not substitute local or cross-built evidence.
- STOP if Linux custody or explicit-fresh-binary smoke is skipped, filtered, ambient, or executed outside the delegated cgroup.
- STOP if preflight cannot bind exact workflow/run/job/artifact identities and all four checksums.
- STOP if any V1 release receipt or attestation schema would need to change; amend and independently review that protocol separately.
- STOP before any tag, Release, public production pin, promotion, or installation; those mutations require the finished source receipt and the follow-up publication plan.
- STOP if the plan path, source commit, version, target set, or working tree drifts after candidate preparation.

## Cold-handoff checklist

- **File manifest:** Every writable Docks path is named in frontmatter and Steps; the follow-up public-repository work is explicitly separate.
- **Environment and commands:** Node 24, Rust 1.85.0, version, validation ref, workflow mode, matrix, evidence variables, and ordered acceptance commands are fixed.
- **Interfaces and data contracts:** Product capability sets, native evidence meaning, unchanged V1 schemas, version authorities, and artifact set are explicit.
- **Executable acceptance:** A1–A11 cover focused release contracts, fresh binary/version, skill metadata, docs/runtime agreement, full CI, native preflight, and embedded source evidence.
- **Out of scope:** macOS custody, binary removal, runtime redesign, Docks UX, generated binaries, publication, and unrelated plugin versions are protected.
- **Decision rationale:** Feature-level support preserves the user's voluntary macOS compatibility without pretending the stronger managed-workspace security guarantee exists there.
- **Known gotchas:** Build-vs-capability semantics, target-set distinction, version lockstep, fixed plan binding, dispatch identity, and action pinning are recorded.
- **Global constraints:** Fail-closed behavior, native evidence, schema compatibility, checksum provenance, independent publication review, and secret hygiene are explicit.
- **No undefined terms:** `SOURCE_COMMIT`, `RUN_ID`, and `ARTIFACT_DIR` are defined before use; the publication plan has a fixed name and ownership boundary.

## Self-review

- `standalone_executability` — pass: a cold executor has the selected product boundary, exact source paths, version, evidence hosts, and follow-up lifecycle split.
- `actionability` — pass: every step names exact files and a failure action.
- `dependency_order` — caught/fixed: separated source preparation/completion from publication because the release binder requires a finished source receipt before external mutation.
- `evidence_reverification` — pass: current release scripts, five contract files, four-runner workflow, platform modules/tests, shipped workspace guidance, manifests, and both related finished plans were re-opened at `planned_at_commit`.
- `goal_coverage` — caught/fixed: retained all four ordinary binaries while making only the Linux managed capability releasable.
- `executable_acceptance` — pass: each criterion is an exact command with observable success and no physical-Mac dependency.
- `failure_modes` — pass: target loss, false macOS support, skipped custody, stale run selection, schema drift, and premature publication all STOP.
- `open_questions` — pass: the user selected Linux-only managed workspaces; no implementation choice remains unresolved.

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

## Review

(filled by main-context plan-manager after completion evidence)

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"709b683e726cf9c0f5210b21ce984cd039610880ffc1da9af825d6627065b8c4","initial_input_sha256":"709b683e726cf9c0f5210b21ce984cd039610880ffc1da9af825d6627065b8c4","lifecycle_intent":"none","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/session-relay-linux-workspace-release.md","request_ids":["7bbb67f8-2b1b-4dc8-899a-06c7098cc184"],"retry_authorization":null,"round_index":1,"schema":2,"series_id":"ed773e5b-f4cc-448d-b0de-4d7f7bee07fa","series_sha256":null,"state_sha256":"697e78e52756b578cd395e83876ee8d59f1abf67d9956b1b7ca13c6569f870de","status":"active","stop_reason":null,"terminal_evidence_sha256":null,"terminated_from_state":null,"terminated_from_state_sha256":null,"transitioned_from_state_sha256":null}
Review-orchestration-prepared-request: {"lifecycle_intent":"none","orchestration_series_id":"ed773e5b-f4cc-448d-b0de-4d7f7bee07fa","orchestration_state_sha256":"697e78e52756b578cd395e83876ee8d59f1abf67d9956b1b7ca13c6569f870de","phase":"draft","plan_path":"docs/plans/active/session-relay-linux-workspace-release.md","prepared_at":"2026-07-23T00:35:12.175Z","request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"6c467f21412fd97c1830eabf5084d9a5bc3adbd82407fab7872cb2330b2178a9","diff_sha256":null,"execution_base_commit":null,"input_sha256":"709b683e726cf9c0f5210b21ce984cd039610880ffc1da9af825d6627065b8c4","lifecycle_intent":"none","orchestration_series_id":"ed773e5b-f4cc-448d-b0de-4d7f7bee07fa","orchestration_state_sha256":"697e78e52756b578cd395e83876ee8d59f1abf67d9956b1b7ca13c6569f870de","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"7bbb67f8-2b1b-4dc8-899a-06c7098cc184","review_mode":"full","reviewed_commit_or_head":"e67137c35a2fd667f65012d9743baac2c9193679","round_index":1,"schema":6},"request_ids":["7bbb67f8-2b1b-4dc8-899a-06c7098cc184"],"request_sha256":"8b4b3611122f387986de96cfdd6bbfe8dbd5b0264584a67b923b101e82af46a7","schema":1,"type":"ReviewPreparedRequestV1"}
