---
title: Complete reviewed Session Relay remediation
status: blocked
created: "2026-07-25T20:54:41.236Z"
updated: "2026-07-25T20:58:05.475Z"
started_at: null
blocked_reason: "Both permitted draft-review launches failed before model execution because no model is selected for the project-local plan-reviewer transport; no verdict exists and implementation is prohibited."
blocked_since: "2026-07-25T20:58:05.475Z"
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
  - docs/plans/active/session-relay-correlated-results-release-remediation.md
  - docs/plans/active/session-relay-correlated-results-release-completion.md
  - "DocksDocks/public:docs/plans/active/session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Complete reviewed Session Relay remediation

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"92ae78938e84b8d3f8e5c3091140d99b0c791a4beec83f2c53877399ee3a8555","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"868f4cc0918788829c3fd54a8b4fde882de95a6b536a3755d1be00bc985d8891","invocations":2,"result_sha256":"92ae78938e84b8d3f8e5c3091140d99b0c791a4beec83f2c53877399ee3a8555","state":"blocked"},"execution_parent":null,"goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v2.md","plan_sha256":"3574b0f1b7c8dc8bf3a911226153b1aecda69c23cd4f838389dca457e1baf738","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"8a218a6c-09e8-45ce-9fa0-178dba0f4897","schema":1,"source_base":"b1e10242efc33974981808bd2dd1852bd9cbd877","source_sha256":"73f0bd79b01a2608a15969f16b0084d4adaf9887404600b677d9e471bffe26b0"}

## Goal

Fix the terminal typed-drain mail-loss finding, close the same-candidate spawn option-boundary and README syntax regressions, and make Session Relay 0.14.0 release evidence bind this fresh real PlanRunV1 before resuming the approved Relay prerelease, docks-kit 0.12.0 companion, and stable promotion sequence.

## Context & rationale

The predecessor at `session-relay-correlated-results-release-completion.md` is terminal after two completion reviews and remains immutable. Its reviewed code can consume an earlier typed claim before a later mailbox row fails, leaving raw mail present while permanently suppressing the valid delivery. Grounding also proved that `spawn` parses literal task tokens after bare `--` as options, README advertises unsupported `inbox/peek --id` shell syntax, and the current source-proof binder cannot consume a real fresh run: it hard-codes the blocked identity, expects a red-record shape not emitted by `scripts/capture-tdd-red.mjs`, equates a bundle digest with the reviewed Git diff, and validates only synthetic fixtures rather than actual affected paths and acceptance evidence.

The first remediation plan is also terminal, but only because both reviewer launches failed before model execution. It produced no PlanReviewV1 and changed no implementation byte. This run uses a new `run_id`, preserves both terminal records, and carries the same repository-grounded obligations forward.

The old `/tmp/session-relay-red-evidence.json` and `/tmp/session-relay-red-test-blobs.json` are non-authoritative observation aids. They lack commit, Git-blob, producer, and canonical receipt identity and must not be upgraded or normalized into release evidence.

## Environment & how to run

- Repository `/home/vagrant/projects/docks`; source base `b1e10242efc33974981808bd2dd1852bd9cbd877`; pinned Rust; `cargo --locked`.
- Shared goal `8b89aabf-7336-4352-bc11-225bab67f9aa`; public child run `1f801952-705e-4c7e-a533-91026c013383` remains separately reviewed and ongoing.
- Canonical red capture is the exact existing `scripts/capture-tdd-red.mjs` output. No invented fields or rewritten exits.
- Focused checks: protocol integration; fanout smoke; release evidence/promotion/publication contracts; remediation aggregate; plugin gate.
- Full checks: Rust format/clippy/inventory, selftest jobs 1 and 4 byte comparison, workspace smoke, `node scripts/ci.mjs`, and fresh-home release-binary request/reply/result-json smoke.

## Steps

| # | Step | Effect | Acceptance |
|---|---|---|---|
| 1 | Review this fresh run and exact sixteen-path source manifest. Never edit either blocked predecessor. | local | One bound PlanReviewV1 passes, or one repository-grounded repair is applied and invocation 2 passes. |
| 2 | Add only red regression assertions plus `remediation-contract.mjs`. Transition to ongoing and use the one reviewed start checkpoint for this plan and those test-only bytes; include no production fix or shipped prose. | local | The start/red commit descends from source base; targeted failures reproduce typed partial consumption, spawn task-option injection, and real-binder rejection for the expected reasons. |
| 3 | Run the tracked capture helper against the test-only start commit and unchanged aggregate, then record its exact canonical TddRedReceiptV1 under Verification Results. Keep old `/tmp` summaries separately labeled non-authoritative. | local | Producer and every test blob resolve at the pre-production commit; command is observed nonzero; receipt bytes are not synthesized or normalized. |
| 4 | Preflight the complete typed mailbox with strict canonical parsing, recipient checks, and authoritative claim checks before any state write; only then consume. Preserve legacy rows, exact-duplicate one-logical-delivery, raw bytes on error, and successful-drain rollback. | local | Valid prefix plus unclaimed/mismatched suffix leaves claims/raw bytes unchanged; retry after suffix removal delivers once; noncanonical typed renderable data fails before mutation. |
| 5 | Use separator-bounded option helpers at every `spawn` option callsite, preserve request/reply parsing and all legacy output, and correct README inbox/peek syntax to positional `<nameOrId>`. | local | Boolean and valued flag-shaped task text cannot alter spawn behavior; explicit options before `--` still work; human output stays byte-identical. |
| 6 | Rebind all current Docks run/path constants to this run. Reuse the real capture-helper receipt contract, verify source→red→implementation ancestry and frozen producer/test blobs, fully validate the ongoing PlanRun acceptance, recompute exact binary/full-index affected-path diff and match CompletionReviewV1, retain diff/path evidence downstream, and reject the blocked predecessor and every tamper. | local | Real-plan tests cover fresh path/run routing, missing/fabricated red evidence, canonical Verification Results, acceptance manifest, affected-path drift, diff mismatch, and blocked status; all fail closed. |
| 7 | Run every focused/full check and smoke, commit the exact affected implementation plus manager-owned evidence, reserve exact-diff completion review, repair at most once, and require pass. | local | Final manifest, canonical Verification Results, implementation commit, cumulative diff, and CompletionReviewV1 all bind and pass. |
| 8 | Only with live exact ExternalAuthorityV1, fast-forward reviewed Docks commits; build/hash and stage five Relay assets as prerelease; complete/review/release/archive the public child; bind it; promote identical Relay assets stable; smoke download; finish/archive this plan. | release | Original Phase 6/7 acceptance and STOP conditions hold; absent authority blocks before any external mutation. |

## Dependencies

- Terminal implementation review evidence `f887017925795f10a9b8706e7eb39f178a865b2d8ada3210d65b4a13a6538b94` and candidate commit `c2ae0bca106d09f32cb989adcc44ed56489fcc58`.
- The separately owned public child performs its own red proof, implementation, completion review, release, archive, and push.
- Exact current-user authority at each Docks/public push or release boundary.

## Risks & mitigations

- Mail loss: a no-write full preflight precedes every claim transition; tests assert byte/state invariance on suffix failure.
- Task option injection: do not globally change legacy parsing; bound only spawn option lookups before the message separator.
- Red-evidence fabrication: capture fresh committed test blobs with the existing producer; old summaries remain explicitly non-authoritative.
- Binder self-assertion: recompute Git diff/paths and validate acceptance, not fixture constants or review fields alone.
- Commit ceiling: test-only red bytes share the start checkpoint, production uses one implementation checkpoint, and release receipts use one archive checkpoint.
- Effects remain prerelease Relay → finished public child → stable identical Relay. Never force, rebase, delete, retag, replace, reupload, or retry through a collision.

## STOP conditions

- Review blocks after its one repair; the red aggregate passes before production; the canonical receipt or blobs do not resolve; or production bytes enter the red/start checkpoint.
- Any failed drain changes earlier claim/raw bytes, noncanonical typed mail is surfaced, duplicates deliver twice, or rollback cannot redeliver once.
- Any token after `--` changes spawn options or any legacy surface changes.
- Binder accepts blocked/stale identities, absent/fabricated red evidence, tampered Verification Results/acceptance, unreviewed diff, or out-of-scope paths.
- A focused/full check fails or jobs 1/4 differ.
- Authority is missing/imprecise, remote main diverges, a target exists, asset/public evidence differs, or recovery would require destructive mutation.

## Open questions

N/A. The defects, fixed contracts, test-first ordering, evidence producer, fresh identities, companion identity, version pair, release ordering, and external STOP boundary are repository-grounded.

## Review

Both byte-identical draft-review invocations failed before model execution with `No model selected`; no PlanReviewV1 verdict was produced.

## Verification Results

Not run. Manager will record exact red receipt/output, checks, hashes, commits, review evidence, external receipts, and archive identities here.
