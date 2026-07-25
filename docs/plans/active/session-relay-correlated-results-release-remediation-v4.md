---
title: Complete reviewed Session Relay remediation
status: ongoing
created: "2026-07-25T21:24:31.600Z"
updated: "2026-07-25T21:37:55.954Z"
started_at: "2026-07-25T21:37:55.954Z"
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
  - docs/plans/active/session-relay-correlated-results-release-remediation-v3.md
  - docs/plans/active/session-relay-correlated-results-release-remediation-v2.md
  - docs/plans/active/session-relay-correlated-results-release-remediation.md
  - docs/plans/active/session-relay-correlated-results-release-completion.md
  - "DocksDocks/public:docs/plans/active/session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Complete reviewed Session Relay remediation

Plan-run: {"acceptance":{"source_sha256":"9963c75a3b1fcb6f5b1301691272299bee02909c0a32d872c932219f6ddff0b8","verification_sha256":"e851d2b1a60fccfb578f2d1bc90963ebaefc3c9be585583d061de16a8a8358e7"},"blocker":null,"completion_review":{"input_sha256":"635b75bf0bb4759fedbafd1673dbb7baff6b10590e88cbc845282104c3bdb052","invocations":1,"result_sha256":"17ee4c2fa44e622403e7e779a661dfd097e0065dc28d8add4dc02e1fc31003c0","state":"repairing"},"draft_review":{"input_sha256":"48f88b092c715825ac8adea71cc386bd4a7ff871f8107cf87894f0857c221236","invocations":2,"result_sha256":"ca25dbafdca2aa45f10afbaf9cda1935ebc6843ae03bbef2cca26f050db32d4e","state":"passed"},"execution_parent":"494881a0d973863d1ac8e233734c827eb6913ce8","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":"0a384c15e48ec3fcbbc9aa03697ceb4709c9b62f","plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v4.md","plan_sha256":"2ff21e9412120324de5290311a85558c380a90412769daa2163f760f497737a9","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"88732ba0-ef06-411b-a31c-93705ccefb27","schema":1,"source_base":"494881a0d973863d1ac8e233734c827eb6913ce8","source_sha256":"63fd6cbbd0786e951249c6ada312151eaa01afe0142a066ef51a8c14aa596d8d"}

## Goal

Fix the terminal typed-drain mail-loss finding, close the same-candidate spawn option-boundary and README syntax regressions, and make Session Relay 0.14.0 release evidence bind this fresh real PlanRunV1 before resuming the approved Relay prerelease, docks-kit 0.12.0 companion, and stable promotion sequence.

## Context & rationale

The implementation predecessor at `session-relay-correlated-results-release-completion.md` is terminal after two completion reviews and remains immutable. Its reviewed code can consume an earlier typed claim before a later mailbox row fails, leaving raw mail present while permanently suppressing the valid delivery. Grounding also proved that `spawn` parses literal task tokens after bare `--` as options, README advertises unsupported `inbox/peek --id` shell syntax, and the current source-proof binder cannot consume a real fresh run: it hard-codes the blocked identity, expects a red-record shape not emitted by `scripts/capture-tdd-red.mjs`, equates a bundle digest with the reviewed Git diff, and validates only synthetic fixtures rather than actual affected paths and acceptance evidence.

Three remediation plans are terminal without implementation: two reviewer-profile transport failures and one correctly closed retry bundle-binding mismatch. This fresh run dispatches the repository-authorized generic read-only fallback on invocation 1, preserves every terminal record, and carries the same repository-grounded obligations forward.

The old `/tmp/session-relay-red-evidence.json` and `/tmp/session-relay-red-test-blobs.json` are non-authoritative observation aids. They lack commit, Git-blob, producer, and canonical receipt identity and must not be upgraded or normalized into release evidence.

## Environment & how to run

- Repository `/home/vagrant/projects/docks`; source base `494881a0d973863d1ac8e233734c827eb6913ce8`; pinned Rust; `cargo --locked`.
- Shared goal `8b89aabf-7336-4352-bc11-225bab67f9aa`; public child run `1f801952-705e-4c7e-a533-91026c013383` remains separately reviewed and ongoing.
- Canonical red capture is the exact existing `scripts/capture-tdd-red.mjs` output. No invented fields or rewritten exits.
- Focused checks: protocol integration; fanout smoke; release evidence/promotion/publication contracts; remediation aggregate; plugin gate.
- Full checks: Rust format/clippy/inventory, selftest jobs 1 and 4 byte comparison, workspace smoke, `node scripts/ci.mjs`, and fresh-home release-binary request/reply/result-json smoke.

## Steps

| # | Step | Effect | Acceptance |
|---|---|---|---|
| 1 | Review this fresh run and exact sixteen-path source manifest through the generic read-only fallback authorized by `docs/plans/AGENTS.md`. Never edit any blocked predecessor. | local | One bound PlanReviewV1 passes, or one repository-grounded repair is applied and invocation 2 passes. |
| 2 | Add only red regression assertions plus `remediation-contract.mjs`. Transition to ongoing and use the one reviewed start checkpoint for this plan and those test-only bytes; include no production fix or shipped prose. | local | The start/red commit descends from source base; targeted failures reproduce typed partial consumption, spawn task-option injection, and real-binder rejection for the expected reasons. |
| 3 | Run the tracked capture helper against the test-only start commit and unchanged aggregate, then record its exact canonical TddRedReceiptV1 under Verification Results. Keep old `/tmp` summaries separately labeled non-authoritative. | local | Producer and every test blob resolve at the pre-production commit; command is observed nonzero; receipt bytes are not synthesized or normalized. |
| 4 | Preflight the complete typed mailbox with strict canonical parsing, recipient checks, and authoritative claim checks before any state write; only then consume. Preserve legacy rows, exact-duplicate one-logical-delivery, raw bytes on error, and successful-drain rollback. | local | Valid prefix plus unclaimed/mismatched suffix leaves claims/raw bytes unchanged; retry after suffix removal delivers once; noncanonical typed renderable data fails before mutation. |
| 5 | Use separator-bounded option helpers at every `spawn` option callsite, preserve request/reply parsing and all legacy output, and correct README inbox/peek syntax to positional `<nameOrId>`. | local | Boolean and valued flag-shaped task text cannot alter spawn behavior; explicit options before `--` still work; human output stays byte-identical. |
| 6 | Rebind all current Docks run/path constants to this run. Reuse the real capture-helper receipt contract, verify source→red→implementation ancestry and frozen producer/test blobs, fully validate the ongoing PlanRun acceptance, recompute exact binary/full-index affected-path diff and match CompletionReviewV1, retain diff/path evidence downstream, and reject blocked predecessors and every tamper. | local | Real-plan tests cover fresh path/run routing, missing/fabricated red evidence, canonical Verification Results, acceptance manifest, affected-path drift, diff mismatch, and blocked status; all fail closed. |
| 7 | Run every focused/full check and smoke, commit the exact affected implementation plus manager-owned evidence, reserve exact-diff completion review, repair at most once, and require pass. | local | Final manifest, canonical Verification Results, implementation commit, cumulative diff, and CompletionReviewV1 all bind and pass. |
| 8 | Only with live exact ExternalAuthorityV1, fast-forward reviewed Docks commits; build/hash and stage five Relay assets as prerelease; wait for the separately owned public child to complete its own proof, implementation, review, release, archive, and push; verify and bind its receipts without mutating its lifecycle; promote identical Relay assets stable; smoke download; finish/archive this plan. | release | Original Phase 6/7 acceptance and STOP conditions hold; absent authority blocks before any external mutation. |

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

Review-result: {"findings":[{"defect":"Step 8 directs this run to complete, review, release, and archive the public child, while Dependencies assigns those lifecycle actions to the separately owned child run; a weaker executor could duplicate or seize child ownership before binding it.","fix":"Rewrite Step 8 to wait for the separately owned child to complete its own proof, implementation, review, release, archive, and push, then verify and bind its receipts before promoting identical Relay assets; this run must not perform child lifecycle mutations.","id":"public-child-ownership","kind":"contradiction","locator":"plan.md:70 vs plan.md:75"}],"invocation":1,"plan_sha256":"e6a99f5be07cd1ec54d7d0c148d082e489bda1245cb4d4040db66803eb5b1abd","run_id":"88732ba0-ef06-411b-a31c-93705ccefb27","schema":1,"source_sha256":"63fd6cbbd0786e951249c6ada312151eaa01afe0142a066ef51a8c14aa596d8d","verdict":"repair"}

Invocation 1 found and repaired the public-child ownership contradiction.

Review-result: {"findings":[],"invocation":2,"plan_sha256":"2ff21e9412120324de5290311a85558c380a90412769daa2163f760f497737a9","run_id":"88732ba0-ef06-411b-a31c-93705ccefb27","schema":1,"source_sha256":"63fd6cbbd0786e951249c6ada312151eaa01afe0142a066ef51a8c14aa596d8d","verdict":"pass"}

Invocation 2 passed with no findings.

Completion-review-result: {"diff_sha256":"fa05665c78ff0af5c72b73a132d6918efaf4441e944f85c7333513a0acf76fd6","findings":[{"defect":"The canonical red receipt binds plugins/session-relay/test/fanout-smoke.mjs to Git blob c63f9a0c644e0176884dc65ea48a88003f36b366, but the reviewed implementation diff records its post-image as aa9fc0adacace086ccef1d7fef225fe588af5177. verifyCurrentRedBlobs requires the implementation blob to equal the captured blob, so bindCurrentCompletion will deterministically reject this implementation and cannot produce release evidence.","fix":"Restore fanout-smoke.mjs at the implementation commit to the captured c63f9a0c644e0176884dc65ea48a88003f36b366 bytes—fixing production behavior instead of weakening the captured byte-exact assertion—or create a fresh test-only red commit and canonical receipt containing the final test bytes, then create a new descendant implementation commit and regenerate the manifest, verification evidence, diff, and completion-review bundle.","id":"red-fanout-blob-drift","kind":"evidence_binding","locator":"tdd-red-receipt.json:test_paths[1]; changes.diff:793-873; changes.diff:2493-2502"}],"implementation_commit":"0a384c15e48ec3fcbbc9aa03697ceb4709c9b62f","invocation":1,"run_id":"88732ba0-ef06-411b-a31c-93705ccefb27","schema":1,"verdict":"repair"}

## Verification Results

TDD-red-evidence: {"captured_at":"2026-07-25T22:20:18.979Z","command":{"argv":["node","/tmp/relay-v4-red-capture/plugins/session-relay/test/remediation-contract.mjs"],"cwd":"/home/vagrant/projects/docks"},"exit_code":1,"pre_production_commit":"4796aa7769e914e55686471fc564de57b2761b29","producer":{"blob_id":"3fc09767ff84e9bffef0b0321d5ed0ef201901e8","path":"scripts/capture-tdd-red.mjs","version":"1"},"repository_id":"DocksDocks/docks","schema":1,"stderr_sha256":"3f277ed05be06e69dcb1be2743a9d01d90d8c57a6579c6061acf6eba734abd0b","stdout_sha256":"7386700efe34a55bf4c5054e729e930c9d6c495442a8034e0a257da6be4f7213","test_paths":[{"blob_id":"39896c44ad8b19b3e89af266175f6eefa68bf97d","path":"plugins/session-relay/rust/tests/protocol.rs"},{"blob_id":"aa9fc0adacace086ccef1d7fef225fe588af5177","path":"plugins/session-relay/test/fanout-smoke.mjs"},{"blob_id":"4d3fd90a4ecc4990839a36024d2184a6e8411247","path":"plugins/session-relay/test/remediation-contract.mjs"}],"type":"TddRedReceiptV1"}

- Canonical TDD-red receipt SHA-256 `83ff1c4f80adb5366a5392e27be3388f325c0155588018ad0557ea1dc4b2703c`; the committed aggregate exited 1 at `4796aa7769e914e55686471fc564de57b2761b29` with all three reviewed failures.
- `node plugins/session-relay/test/remediation-contract.mjs`: pass, 5/5 focused checks; typed and renderable drains preflight every typed row before writes, noncanonical typed mail fails closed, task option tokens after `--` stay task data, and the real release binder accepts only the fresh evidence.
- `cargo clippy --locked --all-targets --all-features -- -D warnings`: pass.
- `node plugins/session-relay/test/release-evidence-contract.mjs`, `release-promotion-contract.mjs`, and `release-publication-contract.mjs`: pass; publication covered 75 production-handler cases.
- `node scripts/ci.mjs --plugin session-relay`: pass; release build, all seven exact Rust inventories, recursive reentry, explicit fresh-binary workspace smokes, all release contracts, and byte-identical selftest jobs 1/4 passed.
- `node scripts/ci.mjs`: pass for all three plugins and repository-wide guards, including JavaScript quality.
- `plugins/session-relay/rust/target/release/relay --version`: `session-relay 0.14.0`.
- Diagnostic only: bare `cargo test --locked` is not the repository acceptance runner and failed eight `workspace_coordination_process` cases because the direct harness could not write the Linux custody FD; the authoritative release-mode selftest subsequently passed the same exact inventory in both jobs modes.
