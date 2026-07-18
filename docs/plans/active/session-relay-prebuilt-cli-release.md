---
title: Publish Session Relay 0.12.0 and docks-kit 0.9.0
goal: Bind reviewed source evidence, publish immutable prerelease assets, release docks-kit, promote the archive, and finalize Session Relay stable.
status: planned
created: "2026-07-18T11:45:54-03:00"
updated: "2026-07-18T14:34:04-03:00"
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
