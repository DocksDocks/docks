---
title: Publish Session Relay 0.12.0 and docks-kit 0.9.0
goal: Bind reviewed source evidence, publish immutable prerelease assets, release docks-kit, promote the archive, and finalize Session Relay stable.
status: planned
created: "2026-07-18T11:45:54-03:00"
updated: "2026-07-18T14:53:36-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [session-relay, release, docks-kit, receipts]
affected_paths:
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
related_plans:
  - target-plugin-ci-and-release-gates
  - session-relay-prebuilt-cli-distribution
  - session-relay-cli-installation
review_status: null
planned_at_commit: ef289381858b5f85680255d433e6c08b2d36a1cb
execution_base_commit: null
---

# Publish Session Relay 0.12.0 and docks-kit 0.9.0

## Goal

Bind the immutable finished source-preparation evidence to a byte-exact canonical
proof, publish Session Relay `0.12.0` as a staging prerelease, hand its four
production executable digests to a separately reviewed public-repository release,
publish docks-kit `cli-v0.9.0`, promote the reviewed Docks archive with resumable
journal semantics, run exact-source and live install smokes, and finalize the
Session Relay GitHub Release as stable.

## Context and rationale

The source implementation and its independent completion evidence are already
finished in `docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md`.
That archive and its embedded candidate are immutable inputs; this plan does not
reopen or reseal them. The remaining local repair is limited to raw Git byte
preservation and finished-plan archive ancestry in the proof binder. Publication,
promotion, and finalization modules are invoked but not edited.

Session Relay and docks-kit have separate ownership boundaries. This repository
owns the Session Relay proof, prerelease, promotion, and stable finalization.
`/home/vagrant/projects/public` owns the fixture digest update and docks-kit
`0.9.0` release through its own reviewed plan. Session Relay transport may carry
the request and result, but conversational text is never release evidence; only
canonical receipt bytes plus their SHA-256 cross the boundary.

## Environment and how to run

- Docks repository: `/home/vagrant/projects/docks`, branch `main`.
- Public repository: `/home/vagrant/projects/public`; never edit it from the
  Docks worktree.
- Node: repository-supported Node 24; pnpm dependencies already installed.
- GitHub and npm authentication must already be valid for read/write release
  operations. Never rotate credentials or weaken policy inside this plan.
- Allocate one owned mode-`0700` receipt directory and keep every canonical
  receipt at its original no-clobber path:

```bash
RECEIPT_DIR="$(mktemp -d /tmp/session-relay-release.XXXXXX)"
chmod 700 "$RECEIPT_DIR"
SOURCE_PROOF_SHA256=
PUBLICATION_RECEIPT=
PUBLICATION_SHA256=
PROMOTION_RECEIPT=
PROMOTION_SHA256=
FINAL_PUBLICATION_RECEIPT=
FINAL_PUBLICATION_SHA256=
```

Authoritative verification ladder before the repair commit:

```bash
node plugins/session-relay/test/release-evidence-contract.mjs
node scripts/ci.mjs --plugin session-relay --timings-json /tmp/session-relay-ci.json
node scripts/ci.mjs
```

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Finish the byte-preserving proof-binder repair and commit it after the focused, targeted, and full verification ladder. | `scripts/lib/session-relay-release-core.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs` | reviewed `planned → ongoing` transition | planned | `commandRaw`/`gitRaw` preserve the terminal LF; only `git show` uses raw bytes; the archive commit may be an ancestor of current HEAD; all three commands exit 0; one focused repair commit leaves the worktree clean. |
| 2 | Bind the existing finished source proof without reopening source preparation. | `docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md` (read-only); `$RECEIPT_DIR/source-proof.json` (runtime receipt) | 1 | planned | Latest-touch/archive/blob/ancestry/candidate identities match; `SourcePreparationProofV1` is canonical mode `0600` and binds the exact source, evidence, shipped, and promoted commits. |
| 3 | Publish and validate the immutable Session Relay staging prerelease. | `$RECEIPT_DIR/publication-initial.json` or one distinct canonical resume/reconcile receipt; Git tag `session-relay--v0.12.0`; GitHub Release assets (external) | 2 | planned | One immutable tag, one bound producer run, four executables plus `SHA256SUMS`, same-run attestations, and staging prerelease identities validate from the canonical publication receipt. |
| 4 | Hand the canonical publication receipt to a separately reviewed public plan and publish docks-kit `cli-v0.9.0`. | `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-production-release.md`; `/home/vagrant/projects/public/SoT/toolchain.json`; `/home/vagrant/projects/public/cli/src/generated/sotPayload.ts`; external tag/Release `cli-v0.9.0` | 3 | planned | Public plan is reviewed and ongoing before edits; the old installation plan is superseded without claiming production completion; four production digests are pinned; public gates pass; exact tag/workflow/six assets/checksums/npm state validate; public completion review ships the plan. |
| 5 | Promote the reviewed Docks archive with permanent transaction-ref and resumable journal semantics. | `$RECEIPT_DIR/promotion-initial.json` or one distinct legal resume/retry receipt; `refs/heads/transactions/session-relay-0.12.0`; remote `origin/main` | 4 | planned | Expected remote main is resolved once; lock/ref/journal identities are exact; exact-source and live docks-kit smokes pass; compare-and-swap promotion succeeds; compatibility restore/reapply evidence validates. |
| 6 | Finalize stable Session Relay, verify every remote identity and live install, then complete this plan. | `$RECEIPT_DIR/final-publication.json` or one distinct canonical resume receipt; external Session Relay Release; this plan only for lifecycle receipt/archive | 5 | planned | Terminal receipt validates; stable Release keeps the closed five-asset set/checksums; tag CI, docks-kit release, Docks `origin/main`, and fresh-home `docks-kit sync` all match; completion review passes before plan-only archive/push. |

## Interfaces and data shapes

### Immutable source input

```text
finished plan: docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md
latest-touch/shipped commit: 1709292509032720321567398c913ec091073b93
source/tag commit: 00284a84acb96d64b357a083258177fca239428f
evidence commit: fce0c78a82bc8a569a5f665c26d6b78b6d065867
embedded candidate SHA-256: 5dc52ca755106f7ad712784f71c74293594e5e903eb25b626ef93770ec48c0fa
```

### Binder API

```text
commandRaw(commandName, args): Buffer
gitRaw(args): Buffer
```

`evidenceDependencies().git(args)` returns a `Buffer` only for `git show`; all
other Git commands preserve the existing trimmed text adapter. `bindCompletion`
resolves current HEAD and the finished plan's latest-touch commit separately and
requires shipped commit ancestry to current HEAD.

### Receipt chain

```text
SourcePreparationProofV1 bytes + sha256
  → SessionRelayPublicationReceiptV1 prerelease bytes + sha256
  → SessionRelayPromotionReceiptV1 bytes + sha256
  → SessionRelayPublicationReceiptV1 stable bytes + sha256
```

Every consumer receives an adjacent path/SHA-256 pair. Resume/retry writes a
new no-clobber path; it never copies, renames, replaces, or edits earlier bytes.

### Public digest handoff

The validated publication receipt supplies exactly four target executable
SHA-256 values. The public plan preserves repository `DocksDocks/docks`, tag
`session-relay--v0.12.0`, version `0.12.0`, install path
`~/.local/bin/session-relay`, and all four existing target mappings.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/release-evidence-contract.mjs` | Exits 0; a temporary Git object ending in LF is byte-identical through `gitRaw`, and completion binding accepts an archive commit that is an ancestor of current HEAD. |
| A2 | `node scripts/ci.mjs --plugin session-relay --timings-json /tmp/session-relay-ci.json` | Exits 0; timings are closed/passed and contain no Docks author or Effect Kit plugin gate. |
| A3 | `node scripts/ci.mjs` | Exits 0 once at the repair commit before release mutation. |
| A4 | `node scripts/release.mjs --bind-completion --plugin session-relay 0.12.0 --finished-plan docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md --embedded-candidate-sha256 5dc52ca755106f7ad712784f71c74293594e5e903eb25b626ef93770ec48c0fa --receipt-out "$RECEIPT_DIR/source-proof.json"` | Exits 0; canonical mode-`0600` `SourcePreparationProofV1` reports its matching digest and exact source/evidence/shipped/promoted identities. |
| A5 | `node scripts/release.mjs --publish-reviewed --plugin session-relay 0.12.0 --source-proof "$RECEIPT_DIR/source-proof.json" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --receipt-out "$RECEIPT_DIR/publication-initial.json"` | Exits 0 or produces the one canonical resumable failure receipt allowed by the publication state machine; successful receipt validates tag/run/Release/five-asset/checksum identities. |
| A6 | `git -C /home/vagrant/projects/public rev-parse refs/tags/cli-v0.9.0^{commit}` | Returns the reviewed public release commit whose single successful `release-cli.yml` run and exact six-asset Release were independently verified by the public plan. |
| A7 | `REMOTE_MAIN="$(git ls-remote origin refs/heads/main)"; EXPECTED_ORIGIN_MAIN="${REMOTE_MAIN%%[[:space:]]*}"; test "${#EXPECTED_ORIGIN_MAIN}" -eq 40; node scripts/release.mjs --promote-reviewed --plugin session-relay 0.12.0 --source-proof "$RECEIPT_DIR/source-proof.json" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --docks-kit-release cli-v0.9.0 --expected-origin-main "$EXPECTED_ORIGIN_MAIN" --receipt-out "$RECEIPT_DIR/promotion-initial.json"` | Exits 0; exactly one 40-hex remote main was used and the canonical terminal promotion receipt validates the transaction ref, gap-free journal, smokes, compare-and-swap, and restore/reapply evidence. |
| A8 | `node scripts/release.mjs --finalize-reviewed --plugin session-relay 0.12.0 --source-proof "$RECEIPT_DIR/source-proof.json" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --promotion "$PROMOTION_RECEIPT" --promotion-sha256 "$PROMOTION_SHA256" --receipt-out "$RECEIPT_DIR/final-publication.json"` | Exits 0; terminal stable receipt validates unchanged tag/five assets/checksums, tag CI, public docks-kit release, promoted main, and fresh-home live install. |
| A9 | `git status --short && git -C /home/vagrant/projects/public status --short` | Produces no paths after both completion lifecycle commits; the separately blocked correlated-messaging plan remains unchanged. |

## Out of scope

- Do not edit or reseal the finished source-preparation plan.
- Do not regenerate preflight artifacts or create a waiver when proof binding
  rejects an invariant.
- Do not edit publication, promotion, or finalization modules; invoke their
  reviewed closed grammar only.
- Do not edit `/home/vagrant/projects/public` from the Docks worktree or treat a
  relay conversation as review/release evidence.
- Do not implement correlated messaging, `send --await`, `relay wait`, delivery
  outcomes, or worker-result behavior.
- Do not delete, move, force-update, clobber, or copy a conflicting tag, Release,
  workflow run, asset, transaction ref, or receipt.

## Known gotchas

- Git's text adapter trims output; only `git show` may use `gitRaw` in the source
  proof path.
- The finished plan archive commit is not required to equal current HEAD; it must
  be the latest commit touching the finished path and an ancestor of current
  HEAD.
- `.github/workflows/release-cli.yml` masks `gh release create` failures and uses
  `--clobber`; independent database/asset/hash verification is mandatory.
- Publication, promotion, and finalization each have distinct legal resume/retry
  grammars. A new base-mode invocation is not a generic retry.
- npm publication is observationally optional only when the public workflow emits
  its documented OIDC warning; never label that warning as npm success.

## Global constraints

- Session Relay version is exactly `0.12.0` and tag is exactly
  `session-relay--v0.12.0`.
- docks-kit version is exactly `0.9.0` and tag is exactly `cli-v0.9.0`.
- Receipt directories are mode `0700`; canonical receipt files are mode `0600`.
- Release transitions are serial: proof → prerelease → public 0.9.0 → promotion
  → finalization.
- Tag mismatch, competing usable workflow run, Release identity/state/body
  conflict, asset/digest conflict, premature stable state, journal gap,
  expected-main drift, or nonretryable receipt result is a STOP.

## STOP conditions

- STOP before execution if this draft lacks an eligible independent review or
  cannot apply `planned → ongoing` exactly once.
- STOP if `docs/plans/finished/2026-07-18-target-plugin-ci-and-release-gates.md`
  loses its passed terminal completion evidence; do not infer a waiver.
- STOP proof binding on any source/evidence/archive/current identity or ancestry
  mismatch; do not reopen source preparation automatically.
- STOP publication/promotion/finalization on any identity conflict or result not
  explicitly classified as resumable/retryable by the canonical receipt.
- STOP at the public boundary if Session Relay cannot deliver and collect the
  reviewed handoff; do not substitute direct cross-worktree edits.

## Cold-handoff checklist

- File manifest: each implementation step names the exact three writable source
  paths or an exact runtime/external receipt path.
- Environment and commands: repository roots, versions, variables, release modes,
  and verification ladder are explicit.
- Interface and data contracts: raw Git APIs, immutable identities, receipt chain,
  and public digest payload are closed.
- Executable acceptance: A1-A9 are ordered commands with expected outcomes.
- Out of scope: source resealing, release-module edits, cross-worktree writes,
  conflicting identity cleanup, and correlation work are forbidden.
- Decision rationale: immutable receipts and separate repository ownership avoid
  conversational or mutable evidence substitution.
- Known gotchas: text trimming, archive ancestry, masked public release failures,
  and legal resume modes are explicit.
- Global constraints: exact versions, tags, modes, serialization, and STOP
  identities are copied into this plan.
- Undefined terms/forward references: runtime variables and every receipt role are
  defined before use; no TODO/TBD placeholder remains.

## Self-review
Review-receipt: {"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","outcome":"not_ready","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"9cf9cb132e14859e46bbf8ae40c8444c59f1d412691a48fd89566ff98055c374","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"1755c06ddedc1b38a29ad3695be4326a4a579744274ac56ee6a6f7c2f1058966","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"50c24cfaf1b51ad5eeeaaeadb4473ac880821d95872b4c0f1a271eb43978d831","exit_code":null,"method":"read"}},{"id":"P4","reproduction":{"command":null,"evidence_sha256":"f2ab06ed8128283ace513adaf643c661496e874c0560052dadf7f942f27eec8d","exit_code":null,"method":"read"}},{"id":"P5","reproduction":{"command":null,"evidence_sha256":"e3f1e0771facdfc15998f5d64b88748e66031b8c42a0be23b46c67b5f9a22a77","exit_code":null,"method":"read"}},{"id":"P6","reproduction":{"command":null,"evidence_sha256":"4bb28c10ca4257c6cd6a802b6755691e938bf108c0959802423b317dffccd6b2","exit_code":null,"method":"read"}},{"id":"P7","reproduction":{"command":null,"evidence_sha256":"a966f051fb028bd613d4698008b19b80a04b41900cad32a0424dcc684ba04e10","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"c01b4a064c3e353021cc362ce2353ae41f54e0e919fdb842ba332000e7988f37","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"5148bafa-cd2a-46a1-94ed-c014f9fddfa0","review_mode":"full","reviewed_commit_or_head":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","round_index":1,"schema":5},"reviewed_at":"2026-07-18T17:52:56.653Z","reviewed_commit":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","reviewer":{"accepted_finding_ids":["P1","P2","P3","P4","P5","P6","P7"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7650-89bd-7bd3-9aba-b5efa524a462","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 primary review evidence and the output validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"bd84bad16e7fc3f311aacb52359a23948478379639d3ee4b92f78ec4c9e43c72","stdout_sha256":"34ec0c2c0c9500a8f36c04e2c26f963710945f758c16087a7c64ea17edc64fe1","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"dda440b402836ef96ce6e6d518636685c41e9bcfb867a59b6be926d13f2f5dd7","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"c01b4a064c3e353021cc362ce2353ae41f54e0e919fdb842ba332000e7988f37","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"5148bafa-cd2a-46a1-94ed-c014f9fddfa0","review_mode":"full","reviewed_commit_or_head":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","round_index":1,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Step 4 cannot be performed from the plan: it provides no executable command, canonical request payload, returned receipt contract, or validation procedure for the required cross-repository handoff, while direct public-worktree edits are forbidden.","status":"blocking_gap"},"dependency_order":{"evidence":"The immutable source proof pins public reviewed commit c3b542220d5a24a98ca05383bbe28afc2319b7e2, but step 4 requires subsequent public digest edits and a new reviewed release commit. Promotion requires the docks-kit tag target to equal the older proof-bound commit, so step 5 cannot consume step 4's output.","status":"blocking_gap"},"evidence_reverification":{"evidence":"A6 only resolves the local cli-v0.9.0 tag, while its expected result claims verification of the workflow run, six release assets, checksums, and npm state. Those properties are delegated to an unbundled future plan and are not reverified by the command or a bound public completion receipt.","status":"non_blocking_gap"},"executable_acceptance":{"evidence":"A5 permits a canonical resumable failure receipt, but the sealed publication implementation defines only prerelease/stable receipts and emits them only after successful reconciliation. The documented failure branch is not executable.","status":"blocking_gap"},"failure_modes":{"evidence":"The plan requires publication recovery to be selected from a canonical receipt, but publication failures before successful reconciliation emit no receipt. No authoritative state-inspection decision table identifies the legal recovery command for tag-only, pending-run, failed-run, or partial-Release states.","status":"blocking_gap"},"goal_coverage":{"evidence":"The plan explicitly covers proof binding, Session Relay prerelease publication, the public docks-kit release, Docks promotion, live/exact-source smokes, stable finalization, and lifecycle completion. The inability to connect some phases is reported under dependency_order rather than omitted goal scope.","status":"pass"},"open_questions":{"evidence":"Material release choices remain unresolved: the exact public-boundary protocol and the legal recovery command after a pre-receipt publication interruption. Both choices affect external mutations and evidence provenance.","status":"blocking_gap"},"standalone_executability":{"evidence":"Lines 42–50 initialize every receipt digest and selected receipt path as empty, but A5, A7, and A8 consume those variables without assignments. Sealed core validation rejects empty digests, so the acceptance sequence fails as written.","status":"blocking_gap"}},"findings":[{"criterion":"standalone_executability","defect":"The receipt-chain variables are declared empty and never populated before later commands consume them, causing exact acceptance steps A5, A7, and A8 to fail.","evidence":"Plan lines 42–50 leave SOURCE_PROOF_SHA256, PUBLICATION_RECEIPT, PUBLICATION_SHA256, PROMOTION_RECEIPT, and PROMOTION_SHA256 empty. A4 only prints a digest; A5 consumes SOURCE_PROOF_SHA256, A7 consumes the publication pair, and A8 consumes the promotion pair. scripts/lib/session-relay-release-core.mjs:108-117 rejects any digest that is not 64 lowercase hexadecimal characters.","fix":"Capture each producer's stdout into its digest variable, assign the exact no-clobber receipt path selected for that attempt, validate each adjacent path/digest pair, and include equivalent assignments for every legal resume or retry path.","id":"P1","locator":"lines 42-50 and 122-126","path":"plan.review.md","section":"Environment and how to run / Acceptance criteria","status":"blocking_gap"},{"criterion":"actionability","defect":"The exact execution step that hands four production digests to the separately owned public release and collects its reviewed result is missing.","evidence":"Plan lines 23–28 require canonical receipt bytes and SHA-256 to cross the boundary; step 4 names a future public plan; STOP lines 179–180 forbid direct cross-worktree substitution. No relay command, canonical request fields, response receipt, lifecycle command, or returned-evidence validator is supplied. A6 only observes a tag after this omitted work.","fix":"Specify the authorized relay invocation, canonical request fields and digest, public plan review/lifecycle commands, returned canonical completion receipt path/digest, and the validation command used before promotion.","id":"P2","locator":"lines 23-28, 68, and 179-180","path":"plan.review.md","section":"Context and rationale / Steps / STOP conditions","status":"blocking_gap"},{"criterion":"dependency_order","defect":"Step 5 cannot accept step 4's reviewed public release commit because promotion is hard-bound to the older companion commit embedded before the production digest edits.","evidence":"The finished source plan records companion implementation commit c3b542220d5a24a98ca05383bbe28afc2319b7e2, which bindCompletion places in SourcePreparationProofV1 as public_reviewed_commit. Step 4 requires editing public SoT/toolchain.json and sotPayload.ts and producing a reviewed release commit. scripts/lib/session-relay-release-promotion.mjs:327-339 and 989-996 require the docks-kit tag/target commit to equal proof.value.public_reviewed_commit; a new digest-update commit therefore fails with `docks-kit release tag does not match the reviewed public commit`.","fix":"Separate the reviewed companion base commit from the later reviewed public release commit. Add a canonical public completion receipt that proves ancestry, allowed digest-only changes, review, tag, workflow, and Release identities, and make promotion consume and validate that new commit. Update the affected promotion interfaces/tests and out-of-scope boundary accordingly.","id":"P3","locator":"lines 68 and 122-126","path":"plan.review.md","section":"Steps / Acceptance criteria","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A5's stated resumable-failure outcome cannot be produced by the sealed publication state machine, so that exact acceptance branch fails.","evidence":"Plan line 123 accepts a canonical resumable failure receipt. scripts/lib/session-relay-release-publication.mjs:476-488 permits only prerelease/stable receipt states, and publishReviewed at lines 764–859 calls emitReceipt only following successful reconciliation; other outcomes throw. Neither the implementation nor release-publication-contract.mjs defines a failure receipt.","fix":"Replace A5 with outcomes the current implementation can produce and add exact receipt/digest/state validation. If failure receipts are required, explicitly plan their schema, producer, validator, CLI grammar, and contract tests first.","id":"P4","locator":"line 123","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The exact publication recovery step fails after an interruption before receipt emission because the plan requires receipt-based classification but no receipt exists.","evidence":"Plan lines 152–153 and 177–178 require selecting only a receipt-authorized resume/retry grammar. publishReviewed throws on conflicts or failed workflow outcomes without emitting a receipt. The plan supplies no state-based rule for no tag, tag only, pending/failed run, partial Release/assets, or complete prerelease without a captured receipt.","fix":"Define authoritative inspection commands and a legal recovery decision table for every pre-receipt publication state, including explicit STOP states and the exact base, reconcile, or resume invocation allowed in each case.","id":"P5","locator":"lines 152-153 and 177-178","path":"plan.review.md","section":"Known gotchas / STOP conditions","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan incorrectly claims no open decision even though the public-boundary protocol and pre-receipt publication recovery mode remain undecided.","evidence":"Lines 199–209 claim all receipt roles are defined and no product decision remains. P2 shows that the cross-repository protocol is unspecified, and P5 shows that an executor must choose an unprovided recovery mode after partial publication.","fix":"Close both decisions with exact commands, canonical payload/receipt contracts, and state-dependent recovery rules before execution.","id":"P6","locator":"lines 199-209","path":"plan.review.md","section":"Cold-handoff checklist / Self-review","status":"blocking_gap"},{"criterion":"evidence_reverification","defect":"A6 does not reverify the public release evidence asserted by its expected result.","evidence":"A6 at line 124 runs only `git -C /home/vagrant/projects/public rev-parse refs/tags/cli-v0.9.0^{commit}` but claims a unique successful release-cli.yml run, exact six-asset Release, checksums, and npm state. None of those live properties is observed, and no validated public completion receipt is an input.","fix":"Add rerunnable commands or validate a canonical public completion receipt covering the exact tag commit, unique workflow run, six asset identities/digests, checksum contents, and npm outcome; bind that receipt into promotion.","id":"P7","locator":"line 124","path":"plan.review.md","section":"Acceptance criteria","status":"non_blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"c01b4a064c3e353021cc362ce2353ae41f54e0e919fdb842ba332000e7988f37","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"5148bafa-cd2a-46a1-94ed-c014f9fddfa0","review_mode":"full","reviewed_commit_or_head":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","round_index":1,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5,"series":{"current_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","initial_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","repairs":[],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"9cf9cb132e14859e46bbf8ae40c8444c59f1d412691a48fd89566ff98055c374","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"1755c06ddedc1b38a29ad3695be4326a4a579744274ac56ee6a6f7c2f1058966","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"50c24cfaf1b51ad5eeeaaeadb4473ac880821d95872b4c0f1a271eb43978d831","exit_code":null,"method":"read"}},{"id":"P4","reproduction":{"command":null,"evidence_sha256":"f2ab06ed8128283ace513adaf643c661496e874c0560052dadf7f942f27eec8d","exit_code":null,"method":"read"}},{"id":"P5","reproduction":{"command":null,"evidence_sha256":"e3f1e0771facdfc15998f5d64b88748e66031b8c42a0be23b46c67b5f9a22a77","exit_code":null,"method":"read"}},{"id":"P6","reproduction":{"command":null,"evidence_sha256":"4bb28c10ca4257c6cd6a802b6755691e938bf108c0959802423b317dffccd6b2","exit_code":null,"method":"read"}},{"id":"P7","reproduction":{"command":null,"evidence_sha256":"a966f051fb028bd613d4698008b19b80a04b41900cad32a0424dcc684ba04e10","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"c01b4a064c3e353021cc362ce2353ae41f54e0e919fdb842ba332000e7988f37","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"5148bafa-cd2a-46a1-94ed-c014f9fddfa0","review_mode":"full","reviewed_commit_or_head":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","round_index":1,"schema":5},"reviewer":{"accepted_finding_ids":["P1","P2","P3","P4","P5","P6","P7"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7650-89bd-7bd3-9aba-b5efa524a462","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 primary review evidence and the output validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"bd84bad16e7fc3f311aacb52359a23948478379639d3ee4b92f78ec4c9e43c72","stdout_sha256":"34ec0c2c0c9500a8f36c04e2c26f963710945f758c16087a7c64ea17edc64fe1","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"dda440b402836ef96ce6e6d518636685c41e9bcfb867a59b6be926d13f2f5dd7","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"c01b4a064c3e353021cc362ce2353ae41f54e0e919fdb842ba332000e7988f37","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"5148bafa-cd2a-46a1-94ed-c014f9fddfa0","review_mode":"full","reviewed_commit_or_head":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","round_index":1,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Step 4 cannot be performed from the plan: it provides no executable command, canonical request payload, returned receipt contract, or validation procedure for the required cross-repository handoff, while direct public-worktree edits are forbidden.","status":"blocking_gap"},"dependency_order":{"evidence":"The immutable source proof pins public reviewed commit c3b542220d5a24a98ca05383bbe28afc2319b7e2, but step 4 requires subsequent public digest edits and a new reviewed release commit. Promotion requires the docks-kit tag target to equal the older proof-bound commit, so step 5 cannot consume step 4's output.","status":"blocking_gap"},"evidence_reverification":{"evidence":"A6 only resolves the local cli-v0.9.0 tag, while its expected result claims verification of the workflow run, six release assets, checksums, and npm state. Those properties are delegated to an unbundled future plan and are not reverified by the command or a bound public completion receipt.","status":"non_blocking_gap"},"executable_acceptance":{"evidence":"A5 permits a canonical resumable failure receipt, but the sealed publication implementation defines only prerelease/stable receipts and emits them only after successful reconciliation. The documented failure branch is not executable.","status":"blocking_gap"},"failure_modes":{"evidence":"The plan requires publication recovery to be selected from a canonical receipt, but publication failures before successful reconciliation emit no receipt. No authoritative state-inspection decision table identifies the legal recovery command for tag-only, pending-run, failed-run, or partial-Release states.","status":"blocking_gap"},"goal_coverage":{"evidence":"The plan explicitly covers proof binding, Session Relay prerelease publication, the public docks-kit release, Docks promotion, live/exact-source smokes, stable finalization, and lifecycle completion. The inability to connect some phases is reported under dependency_order rather than omitted goal scope.","status":"pass"},"open_questions":{"evidence":"Material release choices remain unresolved: the exact public-boundary protocol and the legal recovery command after a pre-receipt publication interruption. Both choices affect external mutations and evidence provenance.","status":"blocking_gap"},"standalone_executability":{"evidence":"Lines 42–50 initialize every receipt digest and selected receipt path as empty, but A5, A7, and A8 consume those variables without assignments. Sealed core validation rejects empty digests, so the acceptance sequence fails as written.","status":"blocking_gap"}},"findings":[{"criterion":"standalone_executability","defect":"The receipt-chain variables are declared empty and never populated before later commands consume them, causing exact acceptance steps A5, A7, and A8 to fail.","evidence":"Plan lines 42–50 leave SOURCE_PROOF_SHA256, PUBLICATION_RECEIPT, PUBLICATION_SHA256, PROMOTION_RECEIPT, and PROMOTION_SHA256 empty. A4 only prints a digest; A5 consumes SOURCE_PROOF_SHA256, A7 consumes the publication pair, and A8 consumes the promotion pair. scripts/lib/session-relay-release-core.mjs:108-117 rejects any digest that is not 64 lowercase hexadecimal characters.","fix":"Capture each producer's stdout into its digest variable, assign the exact no-clobber receipt path selected for that attempt, validate each adjacent path/digest pair, and include equivalent assignments for every legal resume or retry path.","id":"P1","locator":"lines 42-50 and 122-126","path":"plan.review.md","section":"Environment and how to run / Acceptance criteria","status":"blocking_gap"},{"criterion":"actionability","defect":"The exact execution step that hands four production digests to the separately owned public release and collects its reviewed result is missing.","evidence":"Plan lines 23–28 require canonical receipt bytes and SHA-256 to cross the boundary; step 4 names a future public plan; STOP lines 179–180 forbid direct cross-worktree substitution. No relay command, canonical request fields, response receipt, lifecycle command, or returned-evidence validator is supplied. A6 only observes a tag after this omitted work.","fix":"Specify the authorized relay invocation, canonical request fields and digest, public plan review/lifecycle commands, returned canonical completion receipt path/digest, and the validation command used before promotion.","id":"P2","locator":"lines 23-28, 68, and 179-180","path":"plan.review.md","section":"Context and rationale / Steps / STOP conditions","status":"blocking_gap"},{"criterion":"dependency_order","defect":"Step 5 cannot accept step 4's reviewed public release commit because promotion is hard-bound to the older companion commit embedded before the production digest edits.","evidence":"The finished source plan records companion implementation commit c3b542220d5a24a98ca05383bbe28afc2319b7e2, which bindCompletion places in SourcePreparationProofV1 as public_reviewed_commit. Step 4 requires editing public SoT/toolchain.json and sotPayload.ts and producing a reviewed release commit. scripts/lib/session-relay-release-promotion.mjs:327-339 and 989-996 require the docks-kit tag/target commit to equal proof.value.public_reviewed_commit; a new digest-update commit therefore fails with `docks-kit release tag does not match the reviewed public commit`.","fix":"Separate the reviewed companion base commit from the later reviewed public release commit. Add a canonical public completion receipt that proves ancestry, allowed digest-only changes, review, tag, workflow, and Release identities, and make promotion consume and validate that new commit. Update the affected promotion interfaces/tests and out-of-scope boundary accordingly.","id":"P3","locator":"lines 68 and 122-126","path":"plan.review.md","section":"Steps / Acceptance criteria","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A5's stated resumable-failure outcome cannot be produced by the sealed publication state machine, so that exact acceptance branch fails.","evidence":"Plan line 123 accepts a canonical resumable failure receipt. scripts/lib/session-relay-release-publication.mjs:476-488 permits only prerelease/stable receipt states, and publishReviewed at lines 764–859 calls emitReceipt only following successful reconciliation; other outcomes throw. Neither the implementation nor release-publication-contract.mjs defines a failure receipt.","fix":"Replace A5 with outcomes the current implementation can produce and add exact receipt/digest/state validation. If failure receipts are required, explicitly plan their schema, producer, validator, CLI grammar, and contract tests first.","id":"P4","locator":"line 123","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The exact publication recovery step fails after an interruption before receipt emission because the plan requires receipt-based classification but no receipt exists.","evidence":"Plan lines 152–153 and 177–178 require selecting only a receipt-authorized resume/retry grammar. publishReviewed throws on conflicts or failed workflow outcomes without emitting a receipt. The plan supplies no state-based rule for no tag, tag only, pending/failed run, partial Release/assets, or complete prerelease without a captured receipt.","fix":"Define authoritative inspection commands and a legal recovery decision table for every pre-receipt publication state, including explicit STOP states and the exact base, reconcile, or resume invocation allowed in each case.","id":"P5","locator":"lines 152-153 and 177-178","path":"plan.review.md","section":"Known gotchas / STOP conditions","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan incorrectly claims no open decision even though the public-boundary protocol and pre-receipt publication recovery mode remain undecided.","evidence":"Lines 199–209 claim all receipt roles are defined and no product decision remains. P2 shows that the cross-repository protocol is unspecified, and P5 shows that an executor must choose an unprovided recovery mode after partial publication.","fix":"Close both decisions with exact commands, canonical payload/receipt contracts, and state-dependent recovery rules before execution.","id":"P6","locator":"lines 199-209","path":"plan.review.md","section":"Cold-handoff checklist / Self-review","status":"blocking_gap"},{"criterion":"evidence_reverification","defect":"A6 does not reverify the public release evidence asserted by its expected result.","evidence":"A6 at line 124 runs only `git -C /home/vagrant/projects/public rev-parse refs/tags/cli-v0.9.0^{commit}` but claims a unique successful release-cli.yml run, exact six-asset Release, checksums, and npm state. None of those live properties is observed, and no validated public completion receipt is an input.","fix":"Add rerunnable commands or validate a canonical public completion receipt covering the exact tag commit, unique workflow run, six asset identities/digests, checksum contents, and npm outcome; bind that receipt into promotion.","id":"P7","locator":"line 124","path":"plan.review.md","section":"Acceptance criteria","status":"non_blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"c01b4a064c3e353021cc362ce2353ae41f54e0e919fdb842ba332000e7988f37","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"5148bafa-cd2a-46a1-94ed-c014f9fddfa0","review_mode":"full","reviewed_commit_or_head":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","round_index":1,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5}],"schema":5}}

Checked standalone executability, actionability, dependency order, evidence
reverification, goal coverage, executable acceptance, failure modes, and open
questions. Tightened the repository ownership boundary, distinguished receipt
resume from generic retry, and made the source/archive/current commit identities
explicit. No open product decision remains; independent draft review is still a
mandatory execution gate.

## Review

(filled by main-context plan-manager after completion evidence)

## Notes

The target-CI prerequisite was archived by lifecycle commit
`d7ac120024c65e10c2a42858d6b4fee2df2c5989`; its recorded `ship_commit`
`87d3bd1c592c732d33938837d15222a22ee9f0b9` names the integrated implementation
head whose full repository gate passed before archive. Its earlier GPT
transport probe had exposed unsupported `oneOf` in the helper-generated
response schema before model output; commit
`ef289381858b5f85680255d433e6c08b2d36a1cb` fixed that helper defect with a
focused red/green regression. No fallback or waiver was inferred from the
failed probe. This release plan remains non-executing until its own fresh
eligible independent draft review passes.
