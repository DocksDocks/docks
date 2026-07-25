---
title: Remediate final Session Relay review blockers
status: blocked
created: "2026-07-25T20:47:08.669Z"
updated: "2026-07-25T20:53:35.983Z"
started_at: null
blocked_reason: "Both permitted draft-review launches failed before model execution because the project-local Codex plan-reviewer had no selected model; no plan verdict was produced."
blocked_since: "2026-07-25T20:53:35.983Z"
finished_at: null
assignee: null
tags: [session-relay, protocol, release, remediation]
affected_paths:
  - plugins/session-relay/README.md
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/protocol.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/tests/protocol.rs
  - plugins/session-relay/test/companion-distribution-contract.mjs
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/fanout-smoke.mjs
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/remediation-contract.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-publication.mjs
related_plans:
  - docs/plans/active/session-relay-correlated-results-release-completion.md
  - docs/plans/active/session-relay-correlated-results-release.md
  - "DocksDocks/public:docs/plans/active/session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Remediate final Session Relay review blockers

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"92ae78938e84b8d3f8e5c3091140d99b0c791a4beec83f2c53877399ee3a8555","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"80e9cfc4c458c3dcc4919677bf1e397b2c9db49704710217116ca279864249db","invocations":2,"result_sha256":"92ae78938e84b8d3f8e5c3091140d99b0c791a4beec83f2c53877399ee3a8555","state":"blocked"},"execution_parent":null,"goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation.md","plan_sha256":"48512d0b35178e6bc41c784b8112c2c31586f35492402a2c6c83aa509b910de7","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"bb13d48b-c68a-46b8-a47b-e98e3b868418","schema":1,"source_base":"1ad5e38363164745df1913afcb93b5d2ad8ab1ca","source_sha256":"6e1e411d4af88b3b5992e196856560d92741dd341ba8c9d8aa992d98e0b9be6f"}

## Goal

Fix the terminal `typed-drain-partial-consumption` finding without mutating its blocked predecessor, close the same-root spawn argument-boundary and README syntax regressions found while grounding that review, make the Session Relay 0.14.0 source-proof binder consume this fresh real PlanRunV1 and canonical red evidence, then resume the already-approved prerelease → public companion → stable promotion sequence.

## Context & rationale

`docs/plans/active/session-relay-correlated-results-release-completion.md` is terminal after completion-review invocation 2 and remains immutable. Its implementation checkpoint `c2ae0bca106d09f32cb989adcc44ed56489fcc58` passed focused/full gates, but the bound review proved that both typed drains can mark an earlier valid claim consumed before a later typed row fails, leaving raw mail present while suppressing the valid delivery on retry.

Repository grounding found three additional release-blocking facts in the same candidate:

1. `spawn` parses boolean and valued tokens after the bare `--` task boundary as options, so literal task text can change tool, permissions, fanout mode, dry-run behavior, target, or stdout shape.
2. README advertises unsupported `inbox [--id ...]` / `peek [--id ...]` shell syntax although the preserved CLI contract is positional `<nameOrId>`.
3. The current 0.14 source-proof binder hard-codes the blocked run/path, requires a red-record shape not emitted by `scripts/capture-tdd-red.mjs`, compares `CompletionReviewV1.diff_sha256` to the PlanRun bundle-input digest, never recomputes the affected-path Git diff, and its synthetic fixture bypasses full acceptance/evidence validation. The blocked plan has no canonical TDD-red record and must continue to be rejected.

The original `/tmp/session-relay-red-evidence.json` and `/tmp/session-relay-red-test-blobs.json` remain observation aids only. They lack commit/blob/producer identity and must never be converted into canonical receipts or represented as stronger evidence than they contain.

## Environment & how to run

- Repository: `/home/vagrant/projects/docks`; source base `1ad5e38363164745df1913afcb93b5d2ad8ab1ca`; pinned Rust toolchain; `cargo --locked`.
- Shared release goal: `8b89aabf-7336-4352-bc11-225bab67f9aa`; public child run `1f801952-705e-4c7e-a533-91026c013383` remains separately owned and ongoing.
- Red capture uses the tracked `scripts/capture-tdd-red.mjs` format exactly. No synthetic receipt fields, rewritten exit codes, or inferred Git history.
- Focused checks: targeted protocol integration tests; `node plugins/session-relay/test/fanout-smoke.mjs`; `node plugins/session-relay/test/release-evidence-contract.mjs`; release promotion/publication contracts; remediation aggregate; Session Relay plugin gate.
- Authoritative gate: `node scripts/ci.mjs`; release binary: `plugins/session-relay/rust/target/release/relay` with a fresh `AGENT_RELAY_HOME`.

## Steps

| # | Step | Effect | Acceptance |
|---|---|---|---|
| 1 | Draft-review this fresh run against the exact sixteen-path source manifest. Keep every blocked predecessor byte immutable. | local | One bound PlanReviewV1 passes, or one repository-grounded repair is applied and invocation 2 passes. |
| 2 | Add only red regression assertions and `remediation-contract.mjs`; no production source or shipped prose. The reviewed start checkpoint may contain this plan plus those test-only bytes so the canonical capture helper can bind their exact Git blobs before production implementation. | local | Start checkpoint is descended from source base, contains no production fix, and the targeted aggregate fails for the typed-drain, spawn-boundary, and real-binder contracts rather than setup/harness failure. |
| 3 | Run `scripts/capture-tdd-red.mjs` against that test-only start checkpoint and the unchanged aggregate. Record the emitted canonical TddRedReceiptV1 verbatim under Verification Results; retain the original `/tmp` observations only as separately labeled non-authoritative hashes. | local | Receipt producer/test blobs resolve exactly at its pre-production commit; command exits nonzero with observed hashes; no field is synthesized or normalized. |
| 4 | Make typed draining two-phase: strict full-mailbox parse/recipient/claim preflight with no writes, then consume. Preserve legacy rows, exact-duplicate one-logical-delivery behavior, successful-drain rollback, and raw mailbox bytes on any preflight error. | local | Valid-prefix plus invalid-suffix cases leave every claim/raw byte unchanged; removing the suffix permits one delivery; renderable rejects noncanonical typed JCS before mutation. |
| 5 | Bound every `spawn` option lookup before the first bare `--`, preserve request/reply parsing, prove literal task tokens remain task data and human stdout stays byte-compatible, and correct README inbox/peek syntax to positional `<nameOrId>`. | local | Literal `--json`, boolean flags, and valued flag-shaped task text cannot change spawn behavior; existing option-before-separator and legacy output cases still pass. |
| 6 | Rebind current release identities to this run/path. Make source-proof creation accept the actual capture-helper receipt, require frozen producer/test blobs and ancestry, validate the fresh ongoing PlanRun/acceptance evidence, recompute the exact binary/full-index affected-path diff and match CompletionReviewV1, carry diff/path evidence downstream, and keep the blocked predecessor/fabricated evidence rejected. | local | Real-plan fixture passes only with exact run/path/status, canonical Verification Results, affected paths, acceptance manifest, red producer/test blobs, implementation diff, and bound review; every single-field tamper fails closed. |
| 7 | Run focused tests, remediation aggregate green, Rust format/clippy/test inventory, jobs=1/jobs=4 byte comparison, workspace smoke, release contracts, plugin gate, authoritative full gate, and direct release-binary request/reply/result-json smoke. Commit only affected implementation paths plus manager-owned Verification evidence as the implementation checkpoint and reserve exact-diff completion review. | local | All observed checks pass; final manifest and canonical Verification Results bind the exact implementation commit; a fresh CompletionReviewV1 passes, with at most one reviewed repair. |
| 8 | With a matching live ExternalAuthorityV1, require origin/main at the reviewed parent, fast-forward exact reviewed Docks commits, build/hash/stage the five-asset Relay prerelease, complete/review/release/archive the public child, bind its receipt, promote the unchanged Relay assets stable, smoke the downloaded binary, then finish/archive this plan. | release | Every original Phase 6/7 acceptance and STOP condition holds; absent exact push/release authority blocks before the first external mutation. |

## Dependencies

- Immutable blocked predecessor and review evidence SHA-256 `f887017925795f10a9b8706e7eb39f178a865b2d8ada3210d65b4a13a6538b94`.
- Existing 0.14 implementation checkpoint `c2ae0bca106d09f32cb989adcc44ed56489fcc58` and clean local HEAD `1ad5e38363164745df1913afcb93b5d2ad8ab1ca`.
- Separately reviewed public child plan; it performs its own public edits, review, release, archive, and push.
- Exact current-user external authority at each later Docks/public push or release boundary.

## Risks & mitigations

- Partial typed consumption: preflight every typed row and authoritative claim without mutation; only a complete pass may transition claims.
- Option injection through task text: do not globally change legacy parsers; use separator-bounded helpers at all spawn option callsites and test boolean plus valued tokens.
- Evidence fabrication: never promote the old `/tmp` summaries into TddRedReceiptV1. Capture one fresh receipt from committed red tests with the existing producer.
- Binder self-assertion: recompute diff/paths and validate live plan acceptance rather than trusting fixture constants or review fields alone.
- Commit ceiling: test-only red bytes share the reviewed start checkpoint; production changes use the single implementation checkpoint; final receipts use the archive checkpoint. No extra per-round commit.
- Release ordering and external effects remain prerelease Relay → finished/pushed public child → stable byte-identical Relay. No force, rebase, delete, retag, replace, reupload, or ambiguous retry.

## STOP conditions

- Draft/completion review blocks after its one permitted repair, the red aggregate passes before production fixes, capture-helper receipt fields or blobs do not resolve exactly, or any production path appears in the red/start checkpoint.
- A drain error changes any earlier claim or mailbox byte, noncanonical typed data is surfaced, a duplicate yields twice, or successful injection rollback cannot redeliver once.
- Any task token after `--` changes spawn options, or any legacy CLI/MCP/default output changes.
- Binder accepts the blocked predecessor, absent/fabricated red evidence, a mismatched run/path/goal, tampered Verification Results/acceptance, unreviewed diff, or paths outside frontmatter.
- Any focused/full check fails or jobs=1/jobs=4 differ.
- External authority is absent or imprecise; remote main diverges; target tag/release/npm already exists; asset/public evidence differs; or recovery would require destructive history or publication mutation.

## Open questions

N/A. The terminal finding, parser boundary, positional legacy syntax, canonical capture format, fresh PlanRun identity, public child identity, version pair, release ordering, and exact external STOP boundary are repository-grounded.

## Review

Both byte-identical draft-review invocations failed before model execution with `No model selected`; no PlanReviewV1 verdict was produced.

## Verification Results

Not run. Manager will record exact red receipt/output, checks, hashes, commits, review evidence, external receipts, and archive identities here.
