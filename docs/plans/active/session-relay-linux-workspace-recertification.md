---
title: Recertify Session Relay 0.13.0 on current main
goal: Reapply and independently reseal the reviewed Session Relay 0.13.0 source on current origin/main so publication cannot discard newer Docks releases.
status: planned
created: "2026-07-23T10:29:08-03:00"
updated: "2026-07-23T10:29:08-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [session-relay, release, recertification, supply-chain]
affected_paths:
  - .claude-plugin/marketplace.json
  - .github/workflows/ci.yml
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/tests/workspace_coordination_process.rs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/skills/productivity/session-relay/references/workspace.md
  - plugins/session-relay/test/companion-distribution-contract.mjs
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/selftest-fixture.mjs
  - scripts/ci.mjs
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-publication.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/tests/unit/session-relay-selftest.test.mjs
  - scripts/verify-session-relay-preflight.mjs
related_plans:
  - docs/plans/finished/2026-07-23-session-relay-linux-workspace-release.md
  - docs/plans/active/session-relay-linux-workspace-publication.md
  - /home/vagrant/projects/public/docs/plans/active/session-relay-cli-0.13.0-release-preparation.md
review_status: null
planned_at_commit: 3368369cade6d89fd6ebf477cd0576646e992711
execution_base_commit: null
---

# Recertify Session Relay 0.13.0 on current main

## Goal

Produce a new, independently reviewed Session Relay `0.13.0` source-preparation identity descended from current Docks `origin/main` `3368369cade6d89fd6ebf477cd0576646e992711`. Preserve the completed Linux/ext4 managed-workspace behavior, four native ordinary Relay binaries, exact macOS managed-workspace refusal, public companion binding, closed schema-1 receipts, and version `0.13.0`. The recertified source must pass fresh native producer and authoritative source-CI runs before a separate publication plan creates any tag or GitHub Release.

## Context & rationale

The finished source plan sealed `SOURCE_COMMIT` `5ef57785df573bf73d81b9ceee1c671051084a19`, but that commit and its archive are diverged from current `origin/main`: the reviewed source is 23 commits ahead and 2 behind, with merge base `52eebc314bccc93ca54e80a7a0e2a103917fe15b`. Current main contains the later Docks `0.13.3` release. The promotion protocol requires expected `origin/main` to descend from the reviewed source and shipped commits; publishing the old lineage would fail closed or discard newer main history.

Do not weaken that guard and do not force main backward. Reapply the exact 23-path non-plan source delta from `105a85802e3382cd796bb786050d2e3c1a30bb57..5ef57785df573bf73d81b9ceee1c671051084a19` onto the current-main branch, change only the fixed source-plan binding from the prior plan to this recertification plan, capture fresh test-first evidence, and rerun the complete sealing protocol. The already reviewed public companion identity remains reusable only if its immutable ref and blocked plan tuple reverify exactly.

## Environment & how-to-run

- Repository/worktree: `/home/vagrant/projects/docks-session-relay-0.13.0-release`, branch `release/session-relay-0.13.0-recertify`.
- Required base: `origin/main` and `planned_at_commit` are exactly `3368369cade6d89fd6ebf477cd0576646e992711` before start.
- Prior reviewed delta source: `105a85802e3382cd796bb786050d2e3c1a30bb57..5ef57785df573bf73d81b9ceee1c671051084a19`, excluding `docs/plans/**`.
- Runtime: Node 24, pnpm frozen lockfile, Rust `1.85.0`; GitHub CLI authenticated with write permission.
- Version/tag reservation: `0.13.0` / `session-relay--v0.13.0`; the tag and Release must remain absent throughout this plan.
- Public companion: `DocksDocks/public`, ref `refs/heads/preflight/session-relay-cli-0.13.0-6c07f9bc02ef`, commit `6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172`, blocked plan input `818766be3668ad02bfce234cdb25e5d65bf0760bd7c7b2aea05fb8f075a99ed3`, review receipt `097206c0611c3357e10c0bf69a70819ea67901ef1ae8c3ef1d9e8207520f7c52`, and red receipt `833e777a509b44584f873628a65212fd92bd8a9305cd2f5f6699fc172738402c`.
- Fresh receipts live under `${XDG_STATE_HOME:-$HOME/.local/state}/docks-release/session-relay-0.13.0/recertification.XXXXXX`; directory mode `0700`, each output a nonexistent direct child and canonical mode `0600`.
- Exact immutable validation ref: `refs/heads/preflight/session-relay-0.13.0-<first 12 hex of RECERTIFIED_SOURCE_COMMIT>`; create once without force.

## Interfaces & data shapes

All existing closed schemas remain byte-compatible: `TddRedReceiptV1`, `SessionRelayBinaryAttestationV1`, `ProducerPreflightReceiptV1`, `SourceCiReceiptV1`, `SourcePreparationCandidateV1`, and `SourcePreparationProofV1`. No field is added, removed, renamed, defaulted, or reserialized.

The preparation helper's fixed plan contract changes only from:

```text
docs/plans/active/session-relay-linux-workspace-release.md
```

to:

```text
docs/plans/active/session-relay-linux-workspace-recertification.md
```

and the matching dated finished-plan identity. Contract tests must reject the old path for this candidate. The candidate binds the new source commit and plan blob while retaining the exact public companion tuple above.

`RECERTIFIED_SOURCE_COMMIT` is the clean commit containing exactly the recertified non-plan source changes on the current-main lineage. `RECERTIFIED_EVIDENCE_COMMIT` is its plan-only descendant containing embedded canonical receipts. The finished archive commit is a plan-only descendant of both. The later publication plan must bind this plan's passed completion receipt and new candidate, not either receipt from the superseded lineage.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Obtain independent schema-6 draft review and start this plan. | `docs/plans/active/session-relay-linux-workspace-recertification.md` | — | planned | Plan-manager records one passed draft review, applies `planned -> ongoing`, and records `execution_base_commit`; STOP on stale base or non-pass. |
| 2 | Recreate the contract-first boundary and capture fresh red evidence on the current-main lineage. | Five release/distribution contract files; `scripts/tests/ci-plugin-targeting.mjs`; `scripts/tests/unit/session-relay-selftest.test.mjs`; this plan for manager-owned receipt bytes | 1 | planned | Test-side delta is committed before production changes; the exact focused release-evidence command fails for the missing recertified `0.13.0` implementation/path contract; `TddRedReceiptV1` binds frozen test blobs and is embedded byte-exactly before implementation. |
| 3 | Reapply the reviewed product/tooling delta and bind preparation to this plan. | All remaining affected paths | 2 | planned | The prior 23-path non-plan delta applies on current main; only necessary conflict resolution preserves newer main behavior; fixed plan/finished paths name this plan; version remains `0.13.0`; focused contracts and source checks pass. |
| 4 | Run focused and full local verification, then seal a clean source commit. | All affected implementation paths | 3 | planned | A1-A9 pass; `RECERTIFIED_SOURCE_COMMIT` descends from `3368369...`, contains no plan lifecycle bytes beyond this plan, and the worktree is clean. |
| 5 | Produce fresh native and source-CI evidence from one create-once ref. | External GitHub refs/runs; fresh receipt directory | 4 | planned | One validate-only four-target producer run and one authoritative full-CI run bind the exact new commit; A10-A11 emit canonical no-clobber receipts. |
| 6 | Seal and embed the new candidate without publication. | Fresh candidate receipt; this plan only for manager-owned Notes/evidence commit | 5 | planned | A12 emits a candidate binding the new source, new plan blob, exact public tuple, fresh red/preflight/source-CI receipts, and A1-A6 results; manager embeds exact bytes/hashes in a plan-only evidence commit; A13 passes. |
| 7 | Complete review and hand off to publication. | This plan only for lifecycle/archive writes | 6 | planned | Completion review passes, the plan archives under `docs/plans/finished/`, and a later publication plan binds this completion receipt. No tag, Release, promotion, or install occurs here. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/release-evidence-contract.mjs` | Exit 0; recertified plan/source binding, current-main ancestry, Linux positive custody, macOS negative admission, and exact four-target evidence remain closed. |
| A2 | `node plugins/session-relay/test/release-publication-contract.mjs` | Exit 0; publication remains exactly four same-run native binaries plus `SHA256SUMS` and rejects stale/substituted identities. |
| A3 | `node plugins/session-relay/test/release-promotion-contract.mjs` | Exit 0; promotion preserves current-main compatibility and cannot use the superseded source proof. |
| A4 | `node plugins/session-relay/test/distribution-contract.mjs` | Exit 0; Linux/macOS x86-64/arm64 matrix, platform evidence, attestations, and four checksum rows remain exact. |
| A5 | `node plugins/session-relay/test/companion-distribution-contract.mjs --public-remote https://github.com/DocksDocks/public.git --public-ref refs/heads/preflight/session-relay-cli-0.13.0-6c07f9bc02ef --public-commit 6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172 --detached-clone` | Exit 0; immutable reviewed blocked public companion tuple remains exact. |
| A6 | `cargo +1.85.0 build --manifest-path plugins/session-relay/rust/Cargo.toml --release --locked && test "$(plugins/session-relay/rust/target/release/relay --version)" = "session-relay 0.13.0"` | Exit 0 with a fresh source-built host binary reporting the exact version. |
| A7 | `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills` | Exit 0; shipped skill hashes are current and deterministic. |
| A8 | `node plugins/session-relay/test/workspace-smoke.mjs --case docs-contract --bin "$PWD/plugins/session-relay/rust/target/release/relay"` | Exit 0; docs/runtime keep nine commands, Linux-only managed writing, macOS refusal, and managed/unmanaged boundary. |
| A9 | `node scripts/ci.mjs` | Exit 0 once on the final implementation tree. |
| A10 | `node scripts/verify-session-relay-preflight.mjs --run-id "$BUILD_RUN_ID" --expected-commit "$RECERTIFIED_SOURCE_COMMIT" --artifacts "$ARTIFACT_DIR" --receipt-out "$PREFLIGHT_RECEIPT"` | Exit 0 and canonical producer receipt; exact four native jobs, platform evidence, binaries, attestations, and checksums bind the new commit. |
| A11 | `node scripts/release.mjs --verify-source-ci --plugin session-relay 0.13.0 --run-id "$SOURCE_CI_RUN_ID" --expected-commit "$RECERTIFIED_SOURCE_COMMIT" --receipt-out "$SOURCE_CI_RECEIPT"` | Exit 0 and one canonical source-CI receipt digest for the exact new ref/commit and full gate. |
| A12 | `node scripts/release.mjs --check-prepared --plugin session-relay 0.13.0 --source-commit "$RECERTIFIED_SOURCE_COMMIT" --docks-red "$DOCKS_RED" --docks-red-sha256 "$DOCKS_RED_SHA256" --public-red "$PUBLIC_RED" --public-red-sha256 "$PUBLIC_RED_SHA256" --preflight "$PREFLIGHT_RECEIPT" --preflight-sha256 "$PREFLIGHT_SHA256" --source-ci "$SOURCE_CI_RECEIPT" --source-ci-sha256 "$SOURCE_CI_SHA256" --receipt-out "$CANDIDATE_RECEIPT"` | Exit 0 and one canonical candidate digest binding the new source/plan plus exact companion and fresh evidence. |
| A13 | `node scripts/release.mjs --verify-embedded-preparation --plugin session-relay 0.13.0 --plan docs/plans/active/session-relay-linux-workspace-recertification.md` | Exit 0; embedded receipts reconstruct byte-for-byte and A1-A6 reverify without publication mutation. |

## Out of scope / do-NOT-touch

- Do not create `session-relay--v0.13.0`, a GitHub Release, production digest, docks-kit release, promotion transaction, installation, or stable finalization.
- Do not modify Docks `0.13.3` version surfaces or discard either current-main commit after the old merge base.
- Do not change Session Relay product behavior beyond the already reviewed 23-path delta and the fixed plan-path binding.
- Do not alter the public companion ref, blocked plan, production SoT, or generated payload.
- Do not delete or force-update any prior preflight ref; only the new exact ref may be created once.
- Do not reuse old producer/source-CI/candidate receipts as proof for the new source commit.
- Do not change closed receipt or attestation schemas.

## Known gotchas

- Identical file content is not sufficient evidence: old receipts bind the superseded source commit and plan blob.
- The eight prior Docks preflight refs are historical immutable attempts; their presence is not authority for selecting a source. The new ref is derived only from the recertified commit.
- Apply test-side changes before production changes. If a frozen test changes after red capture, abandon that receipt and return for explicit plan amendment rather than recapturing silently.
- `git show` raw bytes, compact JCS bytes, and whole Markdown receipt lines have different hashes; preserve each contract exactly.
- Current main may advance again. Re-fetch immediately before any future PR merge/publication; drift after recertification is a STOP requiring another ancestry decision.
- Plan authoring/review runs no implementation tests or CI; acceptance runs only after start.

## Global constraints

- Correctness and current-main preservation outrank release speed.
- Version is exactly `0.13.0`; ordinary assets remain four targets plus `SHA256SUMS`.
- Managed workspace writing remains Linux/ext4 only; macOS remains ordinary Relay support plus exact fail-closed managed-workspace refusal.
- Every remote mutation is full-SHA-bound, create-once or compare-and-swap, and reconciled by exact read-back.
- Every receipt output is canonical RFC 8785 JCS, mode `0600`, no trailing newline, and no-clobber.
- No secrets enter plans, receipts, logs, refs, release bodies, or source.

## STOP conditions

- STOP if current `origin/main` differs from `3368369cade6d89fd6ebf477cd0576646e992711` before start or the branch is not its descendant.
- STOP if the old tag or GitHub Release appears before the new publication plan authorizes it.
- STOP if applying the prior delta would overwrite or weaken newer main behavior, changes any path outside the affected list, or cannot preserve Docks `0.13.3`.
- STOP if red evidence does not fail for the intended missing implementation/path contract, or frozen test blobs drift afterward.
- STOP if the public companion ref/commit, blocked state/reason, review receipt, input hash, or red receipt differs.
- STOP if any local/full/native/source-CI acceptance fails, any workflow selection is non-unique, or any receipt is noncanonical/hash-mismatched.
- STOP if current main advances after sealing and before publication; the publication plan must resolve ancestry without force or history loss.
- STOP if completion review is not passed; no publication plan may consume an unfinished recertification.

## Cold-handoff checklist

- **File manifest:** all 23 source/test/tooling paths are explicit; lifecycle writes stay in this plan.
- **Environment and commands:** base commit, branch/worktree, runtimes, refs, receipt root, and A1-A13 are exact.
- **Interfaces and data contracts:** closed schemas, plan-path change, source/evidence/archive identities, public tuple, and four-target boundary are defined.
- **Executable acceptance:** focused contracts, source build, full CI, native preflight, source CI, candidate, and embedded verification cover the goal.
- **Out of scope:** publication, public production pins, unrelated Docks versions, schema changes, and ref deletion are protected.
- **Decision rationale:** recertification preserves newer main instead of weakening promotion or forcing history backward.
- **Known gotchas:** commit-bound receipts, prior refs, red ordering, byte hashes, and future main drift are explicit.
- **Global constraints:** fail-closed provenance, no-clobber evidence, platform boundary, and secret hygiene are fixed.
- **No undefined terms:** all commits, refs, receipt variables, plan paths, and ownership boundaries are defined before use.

## Self-review

- `standalone_executability` — pass: a cold executor can recreate the delta, evidence directories, refs, workflow runs, and candidate from exact identities.
- `actionability` — caught/fixed: separated test-first capture, source application, local verification, remote evidence, embedding, and lifecycle completion into dependency-ordered steps.
- `dependency_order` — pass: no production edit precedes red evidence; no remote evidence precedes the clean source commit; no publication precedes completion.
- `evidence_reverification` — pass: current remote tag/release absence, main divergence, old source/evidence identities, public companion ref, release CLI mode grammar, and prior release protocol were re-opened.
- `goal_coverage` — pass: the plan proves current-main ancestry without weakening the already reviewed product/platform contract.
- `executable_acceptance` — caught/fixed: fresh source-CI and native receipts are required; old receipt reuse cannot satisfy A10-A13.
- `failure_modes` — caught/fixed: main drift, conflict overwrite, red drift, ref ambiguity, companion drift, workflow ambiguity, schema drift, and premature publication all STOP.
- `open_questions` — pass: safe policy is fixed—recertify on current main; no destructive fallback or user choice is silently assumed.

## Open questions

None.

## Sources

- `docs/plans/finished/2026-07-23-session-relay-linux-workspace-release.md` — superseded source evidence, completed acceptance, and mandatory later publication handoff.
- `docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md` — prior proof/publication/promotion/finalization protocol and recovery branches.
- `scripts/lib/session-relay-release-cli.mjs` — exact release mode grammar and paired receipt arguments.
- `scripts/lib/session-relay-release-preparation.mjs` — candidate, embedded evidence, completion binder, and source proof invariants.
- `scripts/lib/session-relay-release-publication.mjs` — immutable tag, bound workflow, exact assets, prerelease, resume/rebind, and stable finalization.
- `scripts/lib/session-relay-release-promotion.mjs` — public request/receipt, promotion lock/journal/CAS, compatibility, and live smoke.
- `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-0.13.0-release-preparation.md` — immutable blocked public companion contract.

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"502479b7e21f3bc69a8e9e4db9caa7c34f33ffd39f552050f5a2747ab76e1ff8","initial_input_sha256":"502479b7e21f3bc69a8e9e4db9caa7c34f33ffd39f552050f5a2747ab76e1ff8","lifecycle_intent":"start","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/session-relay-linux-workspace-recertification.md","request_ids":["6cf3bd41-8dbc-4850-99b2-b844c61e97a3"],"retry_authorization":null,"round_index":1,"schema":2,"series_id":"a96502b0-5605-4361-ac9d-68818c838098","series_sha256":null,"state_sha256":"c6a6734b3b425d789015d0240b4e141022e51c8fe01c98ff3f173e0f647a7414","status":"active","stop_reason":null,"terminal_evidence_sha256":null,"terminated_from_state":null,"terminated_from_state_sha256":null,"transitioned_from_state_sha256":null}
Review-orchestration-prepared-request: {"lifecycle_intent":"start","orchestration_series_id":"a96502b0-5605-4361-ac9d-68818c838098","orchestration_state_sha256":"c6a6734b3b425d789015d0240b4e141022e51c8fe01c98ff3f173e0f647a7414","phase":"draft","plan_path":"docs/plans/active/session-relay-linux-workspace-recertification.md","prepared_at":"2026-07-23T13:37:04.643Z","request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"324a88e09b553b27a162ea36376578a392d740932ce747f222eb0b3ab5095607","diff_sha256":null,"execution_base_commit":null,"input_sha256":"502479b7e21f3bc69a8e9e4db9caa7c34f33ffd39f552050f5a2747ab76e1ff8","lifecycle_intent":"start","orchestration_series_id":"a96502b0-5605-4361-ac9d-68818c838098","orchestration_state_sha256":"c6a6734b3b425d789015d0240b4e141022e51c8fe01c98ff3f173e0f647a7414","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"6cf3bd41-8dbc-4850-99b2-b844c61e97a3","review_mode":"full","reviewed_commit_or_head":"de8ce4e78dcb879068668fed354087a146bf2a00","round_index":1,"schema":6},"request_ids":["6cf3bd41-8dbc-4850-99b2-b844c61e97a3"],"request_sha256":"0f770b56506687e187e05397ccd4d7b85203168b088f4b221629e28ac9825417","schema":1,"type":"ReviewPreparedRequestV1"}
Review-orchestration-dispatch-commitment: {"argv":["exec","-C","/tmp/docks-plan-review-run/6cf3bd41-8dbc-4850-99b2-b844c61e97a3-primary","--skip-git-repo-check","--ephemeral","--ignore-user-config","--add-dir","/tmp/docks-plan-review/1746af7b-e514-4a8a-9383-2317e2048c8f","-s","read-only","-m","gpt-5.6-sol","-c","model_reasoning_effort=high","-c","service_tier=\"default\"","--output-schema","/tmp/docks-plan-review/1746af7b-e514-4a8a-9383-2317e2048c8f/reviewer-output.primary.v6.schema.json","--","You are the single primary plan reviewer. Read only the sealed bundle and return typed evidence. Sealed bundle: /tmp/docks-plan-review/1746af7b-e514-4a8a-9383-2317e2048c8f. Copy the request object exactly into ReviewerOutput.request.\nEvaluate exactly these criteria: standalone_executability, actionability, dependency_order, evidence_reverification, goal_coverage, executable_acceptance, failure_modes, open_questions. Each criterion needs pass, non_blocking_gap, or blocking_gap plus nonempty evidence. The verdict equals the strongest status. Every gap needs a matching finding; pass has no findings.\nA blocking finding must name the exact user requirement, safety property, or execution step that would fail. Do not emit a numeric score or rubric.\nFor request.phase === \"draft\", blocking_gap is eligible only when implementation cannot safely and correctly start because of an unresolved required user decision, contradictory goal/scope/interface, unsafe or unauthorized action, impossible dependency order, missing first executable step, or absent/non-executable acceptance contract.\nCode style, optional refactors/docs, speculative performance, exhaustive implementation edge cases, exact internal symbol choices, and defects best established by running the implementation are non_blocking_gap with rejection/defer reason defer_to_implementation_verification.\nA complete simple plan may return pass; there is no finding quota and no instruction to improve until perfect.\nThis is the full round-one review.\nREQUEST_JCS_BEGIN\n{\"acceptance_inventory_sha256\":null,\"author\":{\"company\":\"openai\",\"effort\":\"high\",\"model\":\"gpt-5.6-sol\",\"tool\":\"codex\"},\"bundle_sha256\":\"324a88e09b553b27a162ea36376578a392d740932ce747f222eb0b3ab5095607\",\"diff_sha256\":null,\"execution_base_commit\":null,\"input_sha256\":\"502479b7e21f3bc69a8e9e4db9caa7c34f33ffd39f552050f5a2747ab76e1ff8\",\"lifecycle_intent\":\"start\",\"orchestration_series_id\":\"a96502b0-5605-4361-ac9d-68818c838098\",\"orchestration_state_sha256\":\"c6a6734b3b425d789015d0240b4e141022e51c8fe01c98ff3f173e0f647a7414\",\"phase\":\"draft\",\"planned_at_commit\":null,\"policy\":{\"candidates\":[{\"company\":\"openai\",\"effort\":\"high\",\"model\":\"gpt-5.6-sol\",\"service_tier\":\"default\",\"tool\":\"codex\"},{\"company\":\"anthropic\",\"effort\":\"high\",\"model\":\"fable\",\"tool\":\"claude\"},{\"company\":\"anthropic\",\"effort\":\"xhigh\",\"model\":\"opus\",\"tool\":\"claude\"}],\"fallback\":\"availability_only\",\"max_rounds\":2,\"provenance\":{\"candidates\":\"skill_default\",\"fallback\":\"skill_default\",\"max_rounds\":\"skill_default\",\"role\":\"skill_default\"},\"role\":\"primary\",\"schema\":6},\"policy_sha256\":\"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b\",\"previous_input_sha256\":null,\"repair_targets_sha256\":null,\"request_id\":\"6cf3bd41-8dbc-4850-99b2-b844c61e97a3\",\"review_mode\":\"full\",\"reviewed_commit_or_head\":\"de8ce4e78dcb879068668fed354087a146bf2a00\",\"round_index\":1,\"schema\":6}\nREQUEST_JCS_END"],"argv_sha256":"4fe40ea21a054099488e1bb9a1f38211d1ff155ab4a83807790400c326b1c81c","bundle_path":"/tmp/docks-plan-review/1746af7b-e514-4a8a-9383-2317e2048c8f","bundle_sha256":"324a88e09b553b27a162ea36376578a392d740932ce747f222eb0b3ab5095607","candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"candidate_index":0,"committed_at":"2026-07-23T13:37:37.539Z","controller_config":{"timeout_mode":"orchestrator_tool","timeout_seconds":600},"orchestration_state_sha256":"c6a6734b3b425d789015d0240b4e141022e51c8fe01c98ff3f173e0f647a7414","plan_path":"docs/plans/active/session-relay-linux-workspace-recertification.md","prepared_request_sha256":"6360cf2405ed92c897387c51d9565c0a6ac8851718864962d9eb5572d1c96109","prior_attempts":[],"prior_attempts_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reviewer_workspace":{"cleanup_token":"ba2f1f3d9bf3d29baf64c67e601ecfa3fe5a03af7c22999fd796d902dabeaee6","leg":"primary","request_id":"6cf3bd41-8dbc-4850-99b2-b844c61e97a3","schema":1,"workspace":"/tmp/docks-plan-review-run/6cf3bd41-8dbc-4850-99b2-b844c61e97a3-primary"},"reviewer_workspace_sha256":"192cf432f61fb8935d8a6b1c1837ffe59b75f5271e58b456e19802150b1de48a","schema":1,"type":"ReviewDispatchCommitmentV1"}
## Review

(filled by main-context plan-manager after completion evidence)
