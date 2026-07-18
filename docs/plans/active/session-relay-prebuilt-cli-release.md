---
title: Publish Session Relay 0.12.0 and docks-kit 0.9.0
goal: Bind reviewed source evidence, publish immutable prerelease assets, release docks-kit, promote the archive, and finalize Session Relay stable.
status: planned
created: "2026-07-18T11:45:54-03:00"
updated: "2026-07-18T15:34:57-03:00"
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
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-cli.mjs
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
reopen or reseal them. The remaining local repairs are the raw Git byte
preservation and finished-plan archive ancestry fix in the proof binder plus
the sanctioned public-release boundary extension in step 2. The publication and
finalization state machines are invoked, not redesigned.

Session Relay and docks-kit have separate ownership boundaries. This repository
owns the Session Relay proof, prerelease, promotion, and stable finalization.
`/home/vagrant/projects/public` owns the fixture digest update and docks-kit
`0.9.0` release through its own reviewed plan. Session Relay transport may carry
the request and result, but conversational text is never release evidence; only
canonical receipt bytes plus their SHA-256 cross the boundary.

The sealed promotion contract binds `public_reviewed_commit` to the immutable
companion implementation commit `c3b542220d5a24a98ca05383bbe28afc2319b7e2` and
requires the docks-kit smoke target to equal it, but the real `cli-v0.9.0`
release commit must add production digest pins after that commit. Step 2
therefore extends the promotion boundary first: a canonical
`PublicReleaseRequestV1`/`PublicReleaseReceiptV1` pair carries the four digests
out and the independently verified release identity back, and promotion
validates the new reviewed public release commit — which must descend from the
companion commit — instead of assuming the companion commit itself.

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
cargo +1.85.0 build --manifest-path plugins/session-relay/rust/Cargo.toml \
  --release --locked
export SESSION_RELAY_BIN="$PWD/plugins/session-relay/rust/target/release/relay"
"$SESSION_RELAY_BIN" register docks-release --id "$(uuidgen)" \
  --dir /home/vagrant/projects/docks
PARENT_SESSION_ID="docks-release"
SOURCE_PROOF="$RECEIPT_DIR/source-proof.json"
PUBLICATION_RECEIPT="$RECEIPT_DIR/publication-initial.json"
PUBLIC_REQUEST="$RECEIPT_DIR/public-release-request.json"
PUBLIC_RELEASE_RECEIPT="$RECEIPT_DIR/public-release.json"
PROMOTION_RECEIPT="$RECEIPT_DIR/promotion-initial.json"
FINAL_PUBLICATION_RECEIPT="$RECEIPT_DIR/final-publication.json"
```

Every `scripts/release.mjs` receipt mode writes one canonical mode-`0600`
receipt at its no-clobber `--receipt-out` path and prints exactly one 64-hex
digest line on success. Capture that digest with command substitution at the
moment the command runs, exactly as A5-A10 show
(`SOURCE_PROOF_SHA256="$(node scripts/release.mjs --bind-completion … --receipt-out "$SOURCE_PROOF")"`).
A legal resume or retry writes a new distinct path and captures a new digest
variable; earlier receipt bytes are never edited, copied, or replaced. The
complete legal recovery commands are:

```bash
# Publication resume — only with a captured canonical prerelease receipt.
PUBLICATION_RESUME_RECEIPT="$RECEIPT_DIR/publication-resume-1.json"
PUBLICATION_RESUME_SHA256="$(node scripts/release.mjs --publish-reviewed --plugin session-relay 0.12.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --resume-publication "$PUBLICATION_RECEIPT" --resume-publication-sha256 "$PUBLICATION_SHA256" --receipt-out "$PUBLICATION_RESUME_RECEIPT")"
PUBLICATION_RECEIPT="$PUBLICATION_RESUME_RECEIPT"
PUBLICATION_SHA256="$PUBLICATION_RESUME_SHA256"

# Promotion resume — only when the permanent transaction ref already exists.
PROMOTION_RESUME_RECEIPT="$RECEIPT_DIR/promotion-resume-1.json"
PROMOTION_RESUME_SHA256="$(node scripts/release.mjs --resume-promotion --plugin session-relay 0.12.0 --transaction-ref refs/heads/transactions/session-relay-0.12.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --public-release "$PUBLIC_RELEASE_RECEIPT" --public-release-sha256 "$PUBLIC_RELEASE_SHA256" --docks-kit-release cli-v0.9.0 --expected-origin-main "$EXPECTED_ORIGIN_MAIN" --receipt-out "$PROMOTION_RESUME_RECEIPT")"
PROMOTION_RECEIPT="$PROMOTION_RESUME_RECEIPT"
PROMOTION_SHA256="$PROMOTION_RESUME_SHA256"

# Promotion retry — only from a canonical retryable failed promotion receipt.
PROMOTION_RETRY_RECEIPT="$RECEIPT_DIR/promotion-retry-1.json"
PROMOTION_RETRY_SHA256="$(node scripts/release.mjs --promote-reviewed --plugin session-relay 0.12.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --public-release "$PUBLIC_RELEASE_RECEIPT" --public-release-sha256 "$PUBLIC_RELEASE_SHA256" --docks-kit-release cli-v0.9.0 --expected-origin-main "$EXPECTED_ORIGIN_MAIN" --retry-failed "$PROMOTION_RECEIPT" --retry-failed-sha256 "$PROMOTION_SHA256" --receipt-out "$PROMOTION_RETRY_RECEIPT")"
PROMOTION_RECEIPT="$PROMOTION_RETRY_RECEIPT"
PROMOTION_SHA256="$PROMOTION_RETRY_SHA256"

# Finalization resume — only with a captured canonical stable receipt.
FINAL_RESUME_RECEIPT="$RECEIPT_DIR/final-publication-resume-1.json"
FINAL_RESUME_SHA256="$(node scripts/release.mjs --finalize-reviewed --plugin session-relay 0.12.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --promotion "$PROMOTION_RECEIPT" --promotion-sha256 "$PROMOTION_SHA256" --resume-finalization "$FINAL_PUBLICATION_RECEIPT" --resume-finalization-sha256 "$FINAL_PUBLICATION_SHA256" --receipt-out "$FINAL_RESUME_RECEIPT")"
FINAL_PUBLICATION_RECEIPT="$FINAL_RESUME_RECEIPT"
FINAL_PUBLICATION_SHA256="$FINAL_RESUME_SHA256"

# Finalization base recovery — legal exactly when the Release is already
# stable but no canonical stable receipt was captured (crash after
# editStable, before the receipt write). The base command revalidates the
# exact stable state and promotion receipt, emits the canonical stable
# receipt at a fresh no-clobber path, and performs no second Release
# mutation. Step 2 adds the crash-injection fixture in
# plugins/session-relay/test/release-publication-contract.mjs that
# terminates finalization immediately after editStable and before the
# receipt write, asserts no receipt was created, and proves this base
# recovery emits the canonical already_stable receipt with exactly one
# total Release mutation.
FINAL_RECOVERY_RECEIPT="$RECEIPT_DIR/final-publication-recovery-1.json"
FINAL_PUBLICATION_SHA256="$(node scripts/release.mjs --finalize-reviewed --plugin session-relay 0.12.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --promotion "$PROMOTION_RECEIPT" --promotion-sha256 "$PROMOTION_SHA256" --receipt-out "$FINAL_RECOVERY_RECEIPT")"
FINAL_PUBLICATION_RECEIPT="$FINAL_RECOVERY_RECEIPT"
```

Each later attempt of the same mode increments the `-N` receipt suffix and
repeats the same reassignment so downstream consumers always read the active
path/digest pair. Every resume/retry flag pair names the exact prior canonical
receipt; the only receiptless continuation is the classified finalization base
recovery above, which requires an already-stable Release and no captured
stable receipt.

The public boundary uses the source-built Relay CLI:

```bash
PUBLIC_WORKER_ID="$("$SESSION_RELAY_BIN" spawn /home/vagrant/projects/public \
  --fanout --from "$PARENT_SESSION_ID" \
  --tool codex --model gpt-5.6-sol --effort high --service-tier default -- \
  "Read /home/vagrant/projects/public/AGENTS.md and docs/plans/AGENTS.md. Using the public plan-manager skill operations exactly: run 'new' to create docs/plans/active/session-relay-cli-production-release.md from the canonical PublicReleaseRequestV1 at $PUBLIC_REQUEST (SHA-256 $PUBLIC_REQUEST_SHA256), obtain its independent draft review, run 'start', supersede docs/plans/active/session-relay-cli-installation.md without claiming production completion, pin exactly the four request digests in SoT/toolchain.json, regenerate cli/src/generated/sotPayload.ts, run the full public gates, publish tag cli-v0.9.0 and its six-asset Release, then run 'complete' and 'ship' with auto-commit. Finish with: relay handback --from <your session> --status completed --note '<finished-plan-path> <release-commit-40hex> <completion-receipt-sha256>' where the note is exactly those three space-separated fields taken from the shipped plan and its embedded Completion-review-receipt line.")"
HANDBACK_NOTE="$("$SESSION_RELAY_BIN" collect "$PUBLIC_WORKER_ID" --from "$PARENT_SESSION_ID" | tail -n1)"
test "$HANDBACK_NOTE" = "$("$SESSION_RELAY_BIN" collect "$PUBLIC_WORKER_ID" --from "$PARENT_SESSION_ID" | tail -n1)"
read -r PUBLIC_FINISHED_PLAN PUBLIC_RELEASE_COMMIT PUBLIC_COMPLETION_SHA256 <<<"$HANDBACK_NOTE"
test "${#PUBLIC_RELEASE_COMMIT}" -eq 40
printf '%s' "$PUBLIC_COMPLETION_SHA256" | grep -Eq '^[0-9a-f]{64}$'
```

The collected handback is transport, not evidence: its three fields only
parameterize A8. `--verify-public-release` freshly fetches
`DocksDocks/public`, resolves tag `cli-v0.9.0`, requires the tag commit to
equal `$PUBLIC_RELEASE_COMMIT`, reads the finished plan blob at that commit,
requires its embedded `Completion-review-receipt:` line to hash to
`$PUBLIC_COMPLETION_SHA256` with `review_status: passed`, and independently
observes the workflow run, Release, checksums, npm state, and digest pins
before promotion consumes the canonical receipt pair.

Authoritative verification ladder before the repair commit:

```bash
node plugins/session-relay/test/release-evidence-contract.mjs
node plugins/session-relay/test/release-promotion-contract.mjs
node plugins/session-relay/test/release-publication-contract.mjs
node scripts/ci.mjs --plugin session-relay --timings-json /tmp/session-relay-ci.json
node scripts/ci.mjs
```

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Finish the byte-preserving proof-binder repair and commit it after the focused, targeted, and full verification ladder. | `scripts/lib/session-relay-release-core.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs` | reviewed `planned → ongoing` transition | planned | `commandRaw`/`gitRaw` preserve the terminal LF; only `git show` uses raw bytes; the archive commit may be an ancestor of current HEAD; all five ladder commands exit 0; one focused repair commit leaves the worktree clean. |
| 2 | Extend the release public boundary red/green: freeze failing promotion-contract and finalization crash-boundary fixtures first, then implement `--emit-public-request`, `--verify-public-release`, and the extended promotion/finalization receipt validation. | `plugins/session-relay/test/release-promotion-contract.mjs`; `plugins/session-relay/test/release-publication-contract.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/lib/session-relay-release-cli.mjs` | 1 | planned | New fixtures fail before implementation and pass after; the promotion journal/receipt carry `public_release_commit` and `public_release_receipt_sha256`; companion ancestry is required; the docks-kit smoke target equals `public_release_commit`; the publication-contract crash fixture terminates after `editStable` and before the receipt write, asserts no receipt exists, then proves fresh-path base recovery exits 0 with exactly one total Release mutation and a canonical `already_stable` stable receipt; the full ladder passes at one focused commit. |
| 3 | Bind the existing finished source proof without reopening source preparation. | `docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md` (read-only); `$SOURCE_PROOF` (runtime receipt) | 2 | planned | Latest-touch/archive/blob/ancestry/candidate identities match; `SourcePreparationProofV1` is canonical mode `0600` and binds the exact source, evidence, shipped, and promoted commits. |
| 4 | Publish and validate the immutable Session Relay staging prerelease. | `$PUBLICATION_RECEIPT` or one distinct canonical resume receipt; Git tag `session-relay--v0.12.0`; GitHub Release assets (external) | 3 | planned | One immutable tag, one bound producer run, four executables plus `SHA256SUMS`, same-run attestations, and staging prerelease identities validate from the canonical publication receipt. |
| 5 | Emit the canonical public release request, dispatch the reviewed public production-release worker over Session Relay, and independently verify the shipped release. | `$PUBLIC_REQUEST`; `$PUBLIC_RELEASE_RECEIPT`; `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-production-release.md` (public lifecycle, its plan-manager only); external tag/Release `cli-v0.9.0` | 4 | planned | A7 writes the request; the relay `spawn`/`collect` round-trip (repeat `collect` once; identical committed handback) carries only the request path/digest and returns the shipped public plan path, release commit, and completion receipt SHA-256; the public plan supersedes `session-relay-cli-installation.md` without claiming production completion, pins exactly the four request digests, and ships under its own reviewed lifecycle; A8 verification exits 0. |
| 6 | Promote the reviewed Docks archive with permanent transaction-ref and resumable journal semantics. | `$PROMOTION_RECEIPT` or one distinct legal resume/retry receipt; `refs/heads/transactions/session-relay-0.12.0`; remote `origin/main` | 5 | planned | Expected remote main is resolved once; promotion consumes the verified `PublicReleaseReceiptV1` pair; lock/ref/journal identities are exact; exact-source and live docks-kit smokes pass against `public_release_commit`; compare-and-swap promotion succeeds; compatibility restore/reapply evidence validates. |
| 7 | Finalize stable Session Relay, verify every remote identity and live install, then complete this plan. | `$FINAL_PUBLICATION_RECEIPT` or one distinct canonical resume receipt; external Session Relay Release; this plan only for lifecycle receipt/archive | 6 | planned | Terminal receipt validates; stable Release keeps the closed five-asset set/checksums; tag CI, docks-kit release, Docks `origin/main`, and fresh-home `docks-kit sync` all match; completion review passes before plan-only archive/push. |

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
  → PublicReleaseRequestV1 bytes + sha256
  → PublicReleaseReceiptV1 bytes + sha256
  → SessionRelayPromotionReceiptV1 bytes + sha256
  → SessionRelayPublicationReceiptV1 stable bytes + sha256
```

Every consumer receives an adjacent path/SHA-256 pair. Resume/retry writes a
new no-clobber path; it never copies, renames, replaces, or edits earlier bytes.

### Public release request and receipt

`--emit-public-request` derives `PublicReleaseRequestV1` from the validated
prerelease publication receipt. It is closed to exactly
`{schema:1, type:"PublicReleaseRequestV1", repository_id:"DocksDocks/public",
tag:"cli-v0.9.0", version:"0.9.0", companion_base_commit,
session_relay:{repository_id:"DocksDocks/docks", tag:"session-relay--v0.12.0",
version:"0.12.0", tag_commit, publication_receipt_sha256},
assets:{x86_64-unknown-linux-musl, aarch64-unknown-linux-musl,
x86_64-apple-darwin, aarch64-apple-darwin}, created_at}` with 64-hex digest
values and `companion_base_commit` fixed to
`c3b542220d5a24a98ca05383bbe28afc2319b7e2`.

`--verify-public-release` observes live public state only after the public plan
ships and writes `PublicReleaseReceiptV1`, closed to exactly
`{schema:1, type:"PublicReleaseReceiptV1", request_sha256,
repository_id:"DocksDocks/public", tag:"cli-v0.9.0", version:"0.9.0",
release_commit, companion_base_commit, ancestry_verified:true,
workflow:{file:".github/workflows/release-cli.yml", run_database_id,
run_attempt, conclusion:"success"}, release:{database_id, assets:[six exact
name/size/digest records], checksums_sha256}, npm:{state},
pinned_assets:{the four request digests re-read from the release commit's
SoT/toolchain.json}, public_plan:{path, completion_receipt_sha256},
created_at}`. Verification fails closed unless the tag commit equals the
collected `$PUBLIC_RELEASE_COMMIT`, descends from `companion_base_commit`,
carries the finished public plan whose embedded `Completion-review-receipt:`
line hashes to the collected digest with `review_status: passed`, exactly one
successful `release-cli.yml` run produced the Release, the six assets and
checksums match, and every pinned digest equals its request value.

The extended `SessionRelayPromotionReceiptV1` and its journal immutable
identity additionally carry `public_release_commit` and
`public_release_receipt_sha256`; `public_tag_commit` and
`docks_kit.target_commit` equal `public_release_commit`, which must descend
from `public_reviewed_commit`. The finalization consumer validates the same
extended shape.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/release-evidence-contract.mjs` | Exits 0; a temporary Git object ending in LF is byte-identical through `gitRaw`, and completion binding accepts an archive commit that is an ancestor of current HEAD. |
| A2 | `node plugins/session-relay/test/release-promotion-contract.mjs && node plugins/session-relay/test/release-publication-contract.mjs` | Both exit 0; the promotion contract proves request/receipt emission and verification, `public_release_commit` binding with companion ancestry, the docks-kit smoke-target change, and the finalization consumer; the publication contract's crash-injection fixture proves that termination after `editStable` and before the receipt write leaves no receipt, and that fresh-path base recovery exits 0 with exactly one total Release mutation and a canonical `already_stable` stable receipt. |
| A3 | `node scripts/ci.mjs --plugin session-relay --timings-json /tmp/session-relay-ci.json` | Exits 0; timings are closed/passed and contain no Docks author or Effect Kit plugin gate. |
| A4 | `node scripts/ci.mjs` | Exits 0 once at each focused implementation commit before release mutation. |
| A5 | `SOURCE_PROOF_SHA256="$(node scripts/release.mjs --bind-completion --plugin session-relay 0.12.0 --finished-plan docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md --embedded-candidate-sha256 5dc52ca755106f7ad712784f71c74293594e5e903eb25b626ef93770ec48c0fa --receipt-out "$SOURCE_PROOF")"` | Exits 0 and assigns exactly the printed 64-hex digest of the canonical mode-`0600` `SourcePreparationProofV1`, which binds the exact source/evidence/shipped/promoted identities. |
| A6 | `PUBLICATION_SHA256="$(node scripts/release.mjs --publish-reviewed --plugin session-relay 0.12.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --receipt-out "$PUBLICATION_RECEIPT")"` | Exits 0 and assigns the prerelease receipt digest after tag/run/Release/five-asset/checksum identities validate; identity conflicts and failed workflow outcomes exit nonzero without writing a receipt and recovery follows the publication recovery table; `--resume-publication` plus `--resume-publication-sha256` are legal only with a previously captured canonical prerelease receipt. |
| A7 | `PUBLIC_REQUEST_SHA256="$(node scripts/release.mjs --emit-public-request --plugin session-relay 0.12.0 --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --receipt-out "$PUBLIC_REQUEST")"` | Exits 0; the canonical request carries exactly the four publication digests, the fixed companion base commit, and the immutable Session Relay tag/version/commit identities. |
| A8 | `PUBLIC_RELEASE_SHA256="$(node scripts/release.mjs --verify-public-release --plugin session-relay 0.12.0 --request "$PUBLIC_REQUEST" --request-sha256 "$PUBLIC_REQUEST_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --public-finished-plan "$PUBLIC_FINISHED_PLAN" --public-release-commit "$PUBLIC_RELEASE_COMMIT" --public-completion-sha256 "$PUBLIC_COMPLETION_SHA256" --receipt-out "$PUBLIC_RELEASE_RECEIPT")"` | Exits 0 only after the public plan ships `cli-v0.9.0`; the canonical receipt proves the release commit, companion ancestry, the finished public plan's passed completion receipt, one successful `release-cli.yml` run, the exact six assets and checksums, npm state, and the re-read digest pins. |
| A9 | `REMOTE_MAIN="$(git ls-remote origin refs/heads/main)"; EXPECTED_ORIGIN_MAIN="${REMOTE_MAIN%%[[:space:]]*}"; test "${#EXPECTED_ORIGIN_MAIN}" -eq 40; PROMOTION_SHA256="$(node scripts/release.mjs --promote-reviewed --plugin session-relay 0.12.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --public-release "$PUBLIC_RELEASE_RECEIPT" --public-release-sha256 "$PUBLIC_RELEASE_SHA256" --docks-kit-release cli-v0.9.0 --expected-origin-main "$EXPECTED_ORIGIN_MAIN" --receipt-out "$PROMOTION_RECEIPT")"` | Exits 0; exactly one 40-hex remote main was used and the canonical terminal promotion receipt validates the transaction ref, gap-free journal, `public_release_commit` binding, smokes, compare-and-swap, and restore/reapply evidence. |
| A10 | `FINAL_PUBLICATION_SHA256="$(node scripts/release.mjs --finalize-reviewed --plugin session-relay 0.12.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --promotion "$PROMOTION_RECEIPT" --promotion-sha256 "$PROMOTION_SHA256" --receipt-out "$FINAL_PUBLICATION_RECEIPT")"` | Exits 0; terminal stable receipt validates unchanged tag/five assets/checksums, tag CI, public docks-kit release, promoted main, and fresh-home live install. |
| A11 | `git status --short && git -C /home/vagrant/projects/public status --short` | Produces no paths after both completion lifecycle commits; the separately blocked correlated-messaging plan remains unchanged. |

## Out of scope

- Do not edit or reseal the finished source-preparation plan.
- Do not regenerate preflight artifacts or create a waiver when proof binding
  rejects an invariant.
- Do not edit the publication or finalization state machines beyond the
  promotion-receipt shape they consume; the step-2 extension of the promotion
  module, release CLI grammar, and promotion contract test is the only
  in-scope module change and must land red/green before any release mutation.
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
- Publication recovery before any captured receipt is state-inspected, not
  receipt-classified. Derive the expected tag target from the source proof and
  inspect all three authoritative surfaces:

  ```bash
  TAG_COMMIT="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).tag_commit)" "$SOURCE_PROOF")"
  git ls-remote origin refs/tags/session-relay--v0.12.0
  gh api repos/DocksDocks/docks/releases/tags/session-relay--v0.12.0
  gh run list --repo DocksDocks/docks --workflow build-binaries.yml \
    --commit "$TAG_COMMIT" --json databaseId,status,conclusion,event,headSha
  ```

  Then: no tag and no Release means run base `--publish-reviewed`; a tag
  exactly at `$TAG_COMMIT` whose run list shows at most one bound run in any
  pending or failed state, a missing Release, or partial assets — with no
  captured receipt — means rerun base `--publish-reviewed`, which reconciles
  idempotently and never deletes; a captured canonical prerelease receipt
  means the publication resume pair; a tag at any other commit, a stable
  Release, a foreign body/asset identity, or more than one usable bound run
  is a STOP handled as a manual incident.
- npm publication is observationally optional only when the public workflow emits
  its documented OIDC warning; never label that warning as npm success.

## Global constraints

- Session Relay version is exactly `0.12.0` and tag is exactly
  `session-relay--v0.12.0`.
- docks-kit version is exactly `0.9.0` and tag is exactly `cli-v0.9.0`.
- Receipt directories are mode `0700`; canonical receipt files are mode `0600`.
- Release transitions are serial: proof → prerelease → public request/verified
  release 0.9.0 → promotion → finalization.
- Tag mismatch, competing usable workflow run, Release identity/state/body
  conflict, asset/digest conflict, premature stable state, journal gap,
  expected-main drift, or nonretryable receipt result is a STOP.
- `public_release_commit` must descend from companion commit
  `c3b542220d5a24a98ca05383bbe28afc2319b7e2`, and the docks-kit smoke target
  must equal `public_release_commit` exactly.

## STOP conditions

- STOP before execution if this draft lacks an eligible independent review or
  cannot apply `planned → ongoing` exactly once.
- STOP if `docs/plans/finished/2026-07-18-target-plugin-ci-and-release-gates.md`
  loses its passed terminal completion evidence; do not infer a waiver.
- STOP proof binding on any source/evidence/archive/current identity or ancestry
  mismatch; do not reopen source preparation automatically.
- STOP publication/promotion/finalization on any identity conflict or on any
  result that is neither explicitly classified as resumable/retryable by a
  canonical receipt nor listed as a legal base rerun in the publication
  recovery table or the classified finalization base recovery.
- STOP at the public boundary if Session Relay cannot deliver and collect the
  reviewed handoff; do not substitute direct cross-worktree edits.

## Cold-handoff checklist

- File manifest: each implementation step names its exact writable source
  paths or an exact runtime/external receipt path.
- Environment and commands: repository roots, versions, variables, release modes,
  and verification ladder are explicit.
- Interface and data contracts: raw Git APIs, immutable identities, the
  receipt chain, and the closed public release request/receipt pair are
  closed.
- Executable acceptance: A1-A11 are ordered commands with expected outcomes.
- Out of scope: source resealing, unsanctioned module edits beyond the step-2
  promotion boundary extension, cross-worktree writes, conflicting identity
  cleanup, and correlation work are forbidden.
- Decision rationale: immutable receipts and separate repository ownership avoid
  conversational or mutable evidence substitution.
- Known gotchas: text trimming, archive ancestry, masked public release
  failures, legal resume modes, and the pre-receipt recovery table are
  explicit.
- Global constraints: exact versions, tags, modes, serialization, and STOP
  identities are copied into this plan.
- Undefined terms/forward references: runtime variables, recovery commands,
  the handback fields, and every receipt role are defined before use; no
  TODO/TBD placeholder remains.

## Self-review
Review-receipt: {"input_sha256":"42b7859b03fec81a5d923c3ba00347449cd4349575d49f489132ccd8e20fc428","outcome":"not_ready","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"8881f69e2fcd4e2cbfdb12e221e2e326d612e87cb0ddf02c587e7d61a213d41f","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"73aa501a5863be312e573379eff5010bfcb6a2a2a118877a98ffbb72441b56a6","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"60b3fad0fa1c349cab1d0070a3c9bf6228a17e81ac84de579c888a189bb8e2fb","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"cd95b9c31dd8392a63271f9b443cf3326d8d12b5fdee3bf96e29f856d8b4f2a4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"42b7859b03fec81a5d923c3ba00347449cd4349575d49f489132ccd8e20fc428","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","repair_targets_sha256":"04efeea1b30b694340560ab44b0dbbca669ce9b73f4cfe8ab291f1794ea3b483","request_id":"8ed6557d-879f-424d-8b30-a95002c372d8","review_mode":"repair","reviewed_commit_or_head":"d157a4ccac84c084c5897b626a6dc7e4a49fa25e","round_index":2,"schema":5},"reviewed_at":"2026-07-18T18:33:41.259Z","reviewed_commit":"d157a4ccac84c084c5897b626a6dc7e4a49fa25e","reviewer":{"accepted_finding_ids":["P1","P2","P3"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"codex-series2-round2","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 repair-round evidence and the output validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"74c4a9d8e5fbbf82c381f1cd2d21ab9a1d9165571b1e4f79e8c44696fe2fef53","stdout_sha256":"3c05ece64e0714e1e78efae5a00d5d9d0f691d6c051bcbc70376eb4fe7d83ff5","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"850ab5ae4ed9a80dae725be4a82d648cabbaafdc2a011b882452db80e61476be","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"cd95b9c31dd8392a63271f9b443cf3326d8d12b5fdee3bf96e29f856d8b4f2a4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"42b7859b03fec81a5d923c3ba00347449cd4349575d49f489132ccd8e20fc428","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","repair_targets_sha256":"04efeea1b30b694340560ab44b0dbbca669ce9b73f4cfe8ab291f1794ea3b483","request_id":"8ed6557d-879f-424d-8b30-a95002c372d8","review_mode":"repair","reviewed_commit_or_head":"d157a4ccac84c084c5897b626a6dc7e4a49fa25e","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"The repaired plan provides a complete base `--finalize-reviewed` recovery command with defined receipt variables, no-clobber output reassignment, and the already-stable/no-receipt precondition.","status":"pass"},"dependency_order":{"evidence":"The recovery remains correctly ordered after source proof, prerelease publication, public release verification, and promotion; it consumes the existing proof, publication, and promotion receipt pairs.","status":"pass"},"evidence_reverification":{"evidence":"Blocking: plan.review.md claims the existing already-stable fixture proves the crash-boundary recovery, but the sealed fixture first completes finalization and captures `final.json`, then performs an already-stable rerun. It never terminates after `editStable()` and before receipt creation.","status":"blocking_gap"},"executable_acceptance":{"evidence":"Blocking: A1-A11 contain no acceptance case that injects termination after `editStable()`, verifies that no stable receipt was created, and then requires base recovery to emit the canonical receipt without another Release mutation.","status":"blocking_gap"},"failure_modes":{"evidence":"The runtime procedure now explicitly classifies the post-stable/no-receipt state, supplies a fresh-path base recovery command, retains receipt-pair resume for captured receipts, and extends the global STOP rule to permit only this classified recovery.","status":"pass"},"goal_coverage":{"evidence":"Blocking: accepted repair target P1 explicitly requires a crash-boundary fixture, but the revision changes only recovery prose and the STOP condition; no step schedules that fixture and the cited existing fixture does not model the required crash.","status":"blocking_gap"},"open_questions":{"evidence":"The repaired text makes the recovery choice explicit: use base finalization only for an already-stable Release without a captured stable receipt, and use receipt-pair resume when a receipt exists.","status":"pass"},"standalone_executability":{"evidence":"The recovery block defines the fresh receipt path, supplies every proof/publication/promotion argument and digest, captures the emitted digest, and reassigns the active final receipt pair.","status":"pass"}},"findings":[{"criterion":"goal_coverage","defect":"Accepted repair target P1 requires a fixture that terminates after `editStable()` but before stable-receipt creation and then exercises base recovery. The revised plan does not schedule that fixture, so the exact accepted repair requirement remains incomplete.","evidence":"The sealed diff changes only plan.review.md recovery prose and the STOP condition. Steps 1-2 do not name `plugins/session-relay/test/release-publication-contract.mjs` for modification. In that test's `finalize-` block, the first `finalizeReviewed` returns and `final.json` is read successfully before the already-stable invocation begins.","fix":"Add an explicit implementation task for `plugins/session-relay/test/release-publication-contract.mjs` that injects termination immediately after `editStable()`, asserts the original receipt was not created, reruns base finalization with a fresh no-clobber path, and proves one total Release mutation plus a canonical `already_stable` receipt.","id":"P1","locator":"Environment recovery block; Steps 1-2; `finalize-` fixture","path":"plan.review.md","section":"Accepted P1 repair coverage","status":"blocking_gap"},{"criterion":"evidence_reverification","defect":"The repaired plan mischaracterizes the existing already-stable test as proof of the no-receipt crash boundary. That evidence only proves idempotent base invocation after a successful receipt-producing finalization.","evidence":"plan.review.md says the existing fixture proves crash-after-`editStable` recovery. The sealed fixture calls `finalizeReviewed(options, ...)`, reads the resulting receipt, and only afterward calls `finalizeReviewed(stableOptions, ...)`; it contains no injected exit or receipt-write failure between mutation and `emitReceipt`.","fix":"Replace the unsupported evidence claim with the new crash-injection fixture and cite its assertions showing no first receipt, stable authoritative state, one mutation total, and successful fresh-path recovery.","id":"P2","locator":"Finalization base recovery comment; `finalize-` test block","path":"plugins/session-relay/test/release-publication-contract.mjs","section":"Crash-boundary evidence","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"No executable acceptance criterion proves the exact post-stable/no-receipt recovery required by P1, so an implementation could pass every listed acceptance command while retaining only the weaker successful-finalization rerun fixture.","evidence":"A1 targets the evidence contract, A2 targets the promotion contract, and A3-A4 are aggregate CI commands. The publication contract contains no crash-after-mutation fixture, and no A-row states the required no-receipt and single-mutation assertions.","fix":"Add the crash-injection fixture and an acceptance command that executes `release-publication-contract.mjs` with expected assertions: first invocation leaves the Release stable with no receipt, the fresh-path base invocation exits 0, exactly one `editStable` occurred, and the emitted receipt is canonical and stable.","id":"P3","locator":"Acceptance criteria A1-A4","path":"plan.review.md","section":"Executable acceptance for finalization recovery","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"cd95b9c31dd8392a63271f9b443cf3326d8d12b5fdee3bf96e29f856d8b4f2a4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"42b7859b03fec81a5d923c3ba00347449cd4349575d49f489132ccd8e20fc428","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","repair_targets_sha256":"04efeea1b30b694340560ab44b0dbbca669ce9b73f4cfe8ab291f1794ea3b483","request_id":"8ed6557d-879f-424d-8b30-a95002c372d8","review_mode":"repair","reviewed_commit_or_head":"d157a4ccac84c084c5897b626a6dc7e4a49fa25e","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5,"series":{"current_input_sha256":"42b7859b03fec81a5d923c3ba00347449cd4349575d49f489132ccd8e20fc428","initial_input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","repairs":[{"accepted_finding_ids":["P1"],"current_input_sha256":"42b7859b03fec81a5d923c3ba00347449cd4349575d49f489132ccd8e20fc428","from_round_index":1,"previous_input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","repair_targets_sha256":"04efeea1b30b694340560ab44b0dbbca669ce9b73f4cfe8ab291f1794ea3b483","schema":5,"targets":[{"criterion":"failure_modes","defect":"The exact requirement to finalize Session Relay stable and produce its canonical terminal receipt can fail permanently after a normal crash boundary. If A10 successfully changes the Release from prerelease to stable but exits before writing FINAL_PUBLICATION_RECEIPT, the only documented finalization recovery requires that nonexistent receipt, while the global STOP rule forbids an unclassified base rerun.","evidence":"plan.review.md lines 76–104 label the listed commands complete and provide only `--resume-finalization \"$FINAL_PUBLICATION_RECEIPT\" --resume-finalization-sha256 \"$FINAL_PUBLICATION_SHA256\"`. Lines 317–319 require STOP unless a result is explicitly resumable/retryable or a listed legal base rerun. In the sealed implementation, finalizeReviewed changes the Release with `adapter.editStable()` before `emitReceipt`, and its already-stable branch can safely validate and emit a new receipt; release-publication-contract.mjs lines 995–998 confirms that base behavior.","fix":"Explicitly classify the no-receipt post-stable case as legal recovery. Provide a complete base `--finalize-reviewed` command using a fresh no-clobber receipt path and digest variable, gated by the existing exact stable-state and promotion validation. Add a fixture that terminates after `editStable()` but before receipt creation, then requires the base recovery to emit the canonical stable receipt without another Release mutation; retain the existing receipt-pair resume command for cases where a stable receipt was captured.","id":"P1","locator":"lines 76–104, 269–270, and 317–319","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"47485d5d1db5f5e6588a87edcff81d52876f454eea52421cadb3bbe32d0b9307","exit_code":null,"method":"read"},"section":"Environment and how to run / finalization recovery","source":"primary","status":"blocking_gap"}]}],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"47485d5d1db5f5e6588a87edcff81d52876f454eea52421cadb3bbe32d0b9307","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"48e92ff6cd2bbe0c8cd37b89a13dbf9a5f0c767be2d78dcae6864c2aecc01388","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"31cb1fb0-f486-43bd-9de1-0e02feb1d379","review_mode":"full","reviewed_commit_or_head":"09b4ad7fef5a86f1af6006a54ac9bae84f462589","round_index":1,"schema":5},"reviewer":{"accepted_finding_ids":["P1"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"codex-series2-round1","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 full round-one evidence and the output validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"b883ce03192ad1a97f981919a7eff63f53ff7617e6e75a91b606a269ab8c30b1","stdout_sha256":"7b3f4946a7a026b272f7563219a2dcc9637001382ea8168c6afe9102d85e1cd2","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"320174a4c1f53ca3ac1167563e096edc02ebb948b55be9240e1d792b822875d6","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"48e92ff6cd2bbe0c8cd37b89a13dbf9a5f0c767be2d78dcae6864c2aecc01388","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"31cb1fb0-f486-43bd-9de1-0e02feb1d379","review_mode":"full","reviewed_commit_or_head":"09b4ad7fef5a86f1af6006a54ac9bae84f462589","round_index":1,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Steps 1–7 identify concrete files, runtime artifacts, commands, receipt fields, ownership boundaries, and done conditions. The two implementation repairs are scoped to named modules and tests, while A5–A11 provide literal release invocations.","status":"pass"},"dependency_order":{"evidence":"The plan serializes binder repair, public-boundary implementation, source-proof binding, prerelease publication, independently reviewed public release, Docks promotion, and stable finalization. Both focused implementation commits and the full verification ladder precede external release mutation.","status":"pass"},"evidence_reverification":{"evidence":"A5 freshly binds the immutable finished source plan and its candidate, A6 revalidates tag/run/Release identities, A8 freshly fetches and verifies the public release and completion evidence, A9 re-resolves origin/main before compare-and-swap promotion, and A10 revalidates remote identities during finalization.","status":"pass"},"executable_acceptance":{"evidence":"A1–A11 give executable commands and expected results for byte preservation, public-boundary contracts, targeted/full CI, each receipt transition, promotion, stable finalization, and final worktree cleanliness. The sealed publication contract also exercises an already-stable base finalization at lines 995–998, so the underlying recovery mechanism is testable even though the plan omits its legal invocation.","status":"pass"},"failure_modes":{"evidence":"Blocking gap: plan.review.md calls lines 76–104 the complete legal recovery commands, but finalization recovery only accepts an already captured stable receipt. If A10 changes the GitHub Release to stable and the process dies before writeCanonicalExclusive emits FINAL_PUBLICATION_RECEIPT, that input does not exist. Lines 317–319 then require STOP for any continuation not explicitly classified, despite sealed finalizeReviewed supporting an identity-checked base invocation against an already-stable Release.","status":"blocking_gap"},"goal_coverage":{"evidence":"The plan covers the stated source-proof binding, immutable Session Relay prerelease, canonical public request and independently verified docks-kit release, archive promotion with exact-source/live smokes, and final stable Session Relay release.","status":"pass"},"open_questions":{"evidence":"Versions, tags, companion ancestry, receipt shapes, handback fields, repository ownership, mutation ordering, and conflict STOP conditions are fixed. The omitted finalization recovery has a concrete existing mechanism rather than requiring a product decision.","status":"pass"},"standalone_executability":{"evidence":"The plan defines repository roots, supported toolchain, authentication prerequisites, receipt directory and file modes, every runtime variable, the public-worker protocol, ordered commands, acceptance expectations, and STOP conditions. A clean uninterrupted execution can follow it without additional design decisions.","status":"pass"}},"findings":[{"criterion":"failure_modes","defect":"The exact requirement to finalize Session Relay stable and produce its canonical terminal receipt can fail permanently after a normal crash boundary. If A10 successfully changes the Release from prerelease to stable but exits before writing FINAL_PUBLICATION_RECEIPT, the only documented finalization recovery requires that nonexistent receipt, while the global STOP rule forbids an unclassified base rerun.","evidence":"plan.review.md lines 76–104 label the listed commands complete and provide only `--resume-finalization \"$FINAL_PUBLICATION_RECEIPT\" --resume-finalization-sha256 \"$FINAL_PUBLICATION_SHA256\"`. Lines 317–319 require STOP unless a result is explicitly resumable/retryable or a listed legal base rerun. In the sealed implementation, finalizeReviewed changes the Release with `adapter.editStable()` before `emitReceipt`, and its already-stable branch can safely validate and emit a new receipt; release-publication-contract.mjs lines 995–998 confirms that base behavior.","fix":"Explicitly classify the no-receipt post-stable case as legal recovery. Provide a complete base `--finalize-reviewed` command using a fresh no-clobber receipt path and digest variable, gated by the existing exact stable-state and promotion validation. Add a fixture that terminates after `editStable()` but before receipt creation, then requires the base recovery to emit the canonical stable receipt without another Release mutation; retain the existing receipt-pair resume command for cases where a stable receipt was captured.","id":"P1","locator":"lines 76–104, 269–270, and 317–319","path":"plan.review.md","section":"Environment and how to run / finalization recovery","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"48e92ff6cd2bbe0c8cd37b89a13dbf9a5f0c767be2d78dcae6864c2aecc01388","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"31cb1fb0-f486-43bd-9de1-0e02feb1d379","review_mode":"full","reviewed_commit_or_head":"09b4ad7fef5a86f1af6006a54ac9bae84f462589","round_index":1,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5},{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"8881f69e2fcd4e2cbfdb12e221e2e326d612e87cb0ddf02c587e7d61a213d41f","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"73aa501a5863be312e573379eff5010bfcb6a2a2a118877a98ffbb72441b56a6","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"60b3fad0fa1c349cab1d0070a3c9bf6228a17e81ac84de579c888a189bb8e2fb","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"cd95b9c31dd8392a63271f9b443cf3326d8d12b5fdee3bf96e29f856d8b4f2a4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"42b7859b03fec81a5d923c3ba00347449cd4349575d49f489132ccd8e20fc428","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","repair_targets_sha256":"04efeea1b30b694340560ab44b0dbbca669ce9b73f4cfe8ab291f1794ea3b483","request_id":"8ed6557d-879f-424d-8b30-a95002c372d8","review_mode":"repair","reviewed_commit_or_head":"d157a4ccac84c084c5897b626a6dc7e4a49fa25e","round_index":2,"schema":5},"reviewer":{"accepted_finding_ids":["P1","P2","P3"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"codex-series2-round2","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 repair-round evidence and the output validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"74c4a9d8e5fbbf82c381f1cd2d21ab9a1d9165571b1e4f79e8c44696fe2fef53","stdout_sha256":"3c05ece64e0714e1e78efae5a00d5d9d0f691d6c051bcbc70376eb4fe7d83ff5","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"850ab5ae4ed9a80dae725be4a82d648cabbaafdc2a011b882452db80e61476be","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"cd95b9c31dd8392a63271f9b443cf3326d8d12b5fdee3bf96e29f856d8b4f2a4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"42b7859b03fec81a5d923c3ba00347449cd4349575d49f489132ccd8e20fc428","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","repair_targets_sha256":"04efeea1b30b694340560ab44b0dbbca669ce9b73f4cfe8ab291f1794ea3b483","request_id":"8ed6557d-879f-424d-8b30-a95002c372d8","review_mode":"repair","reviewed_commit_or_head":"d157a4ccac84c084c5897b626a6dc7e4a49fa25e","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"The repaired plan provides a complete base `--finalize-reviewed` recovery command with defined receipt variables, no-clobber output reassignment, and the already-stable/no-receipt precondition.","status":"pass"},"dependency_order":{"evidence":"The recovery remains correctly ordered after source proof, prerelease publication, public release verification, and promotion; it consumes the existing proof, publication, and promotion receipt pairs.","status":"pass"},"evidence_reverification":{"evidence":"Blocking: plan.review.md claims the existing already-stable fixture proves the crash-boundary recovery, but the sealed fixture first completes finalization and captures `final.json`, then performs an already-stable rerun. It never terminates after `editStable()` and before receipt creation.","status":"blocking_gap"},"executable_acceptance":{"evidence":"Blocking: A1-A11 contain no acceptance case that injects termination after `editStable()`, verifies that no stable receipt was created, and then requires base recovery to emit the canonical receipt without another Release mutation.","status":"blocking_gap"},"failure_modes":{"evidence":"The runtime procedure now explicitly classifies the post-stable/no-receipt state, supplies a fresh-path base recovery command, retains receipt-pair resume for captured receipts, and extends the global STOP rule to permit only this classified recovery.","status":"pass"},"goal_coverage":{"evidence":"Blocking: accepted repair target P1 explicitly requires a crash-boundary fixture, but the revision changes only recovery prose and the STOP condition; no step schedules that fixture and the cited existing fixture does not model the required crash.","status":"blocking_gap"},"open_questions":{"evidence":"The repaired text makes the recovery choice explicit: use base finalization only for an already-stable Release without a captured stable receipt, and use receipt-pair resume when a receipt exists.","status":"pass"},"standalone_executability":{"evidence":"The recovery block defines the fresh receipt path, supplies every proof/publication/promotion argument and digest, captures the emitted digest, and reassigns the active final receipt pair.","status":"pass"}},"findings":[{"criterion":"goal_coverage","defect":"Accepted repair target P1 requires a fixture that terminates after `editStable()` but before stable-receipt creation and then exercises base recovery. The revised plan does not schedule that fixture, so the exact accepted repair requirement remains incomplete.","evidence":"The sealed diff changes only plan.review.md recovery prose and the STOP condition. Steps 1-2 do not name `plugins/session-relay/test/release-publication-contract.mjs` for modification. In that test's `finalize-` block, the first `finalizeReviewed` returns and `final.json` is read successfully before the already-stable invocation begins.","fix":"Add an explicit implementation task for `plugins/session-relay/test/release-publication-contract.mjs` that injects termination immediately after `editStable()`, asserts the original receipt was not created, reruns base finalization with a fresh no-clobber path, and proves one total Release mutation plus a canonical `already_stable` receipt.","id":"P1","locator":"Environment recovery block; Steps 1-2; `finalize-` fixture","path":"plan.review.md","section":"Accepted P1 repair coverage","status":"blocking_gap"},{"criterion":"evidence_reverification","defect":"The repaired plan mischaracterizes the existing already-stable test as proof of the no-receipt crash boundary. That evidence only proves idempotent base invocation after a successful receipt-producing finalization.","evidence":"plan.review.md says the existing fixture proves crash-after-`editStable` recovery. The sealed fixture calls `finalizeReviewed(options, ...)`, reads the resulting receipt, and only afterward calls `finalizeReviewed(stableOptions, ...)`; it contains no injected exit or receipt-write failure between mutation and `emitReceipt`.","fix":"Replace the unsupported evidence claim with the new crash-injection fixture and cite its assertions showing no first receipt, stable authoritative state, one mutation total, and successful fresh-path recovery.","id":"P2","locator":"Finalization base recovery comment; `finalize-` test block","path":"plugins/session-relay/test/release-publication-contract.mjs","section":"Crash-boundary evidence","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"No executable acceptance criterion proves the exact post-stable/no-receipt recovery required by P1, so an implementation could pass every listed acceptance command while retaining only the weaker successful-finalization rerun fixture.","evidence":"A1 targets the evidence contract, A2 targets the promotion contract, and A3-A4 are aggregate CI commands. The publication contract contains no crash-after-mutation fixture, and no A-row states the required no-receipt and single-mutation assertions.","fix":"Add the crash-injection fixture and an acceptance command that executes `release-publication-contract.mjs` with expected assertions: first invocation leaves the Release stable with no receipt, the fresh-path base invocation exits 0, exactly one `editStable` occurred, and the emitted receipt is canonical and stable.","id":"P3","locator":"Acceptance criteria A1-A4","path":"plan.review.md","section":"Executable acceptance for finalization recovery","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"cd95b9c31dd8392a63271f9b443cf3326d8d12b5fdee3bf96e29f856d8b4f2a4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"42b7859b03fec81a5d923c3ba00347449cd4349575d49f489132ccd8e20fc428","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"c81779df544edaabe42ad7b9c7b125ea3191a63ee4ef2b0e18935fb4e14493d7","repair_targets_sha256":"04efeea1b30b694340560ab44b0dbbca669ce9b73f4cfe8ab291f1794ea3b483","request_id":"8ed6557d-879f-424d-8b30-a95002c372d8","review_mode":"repair","reviewed_commit_or_head":"d157a4ccac84c084c5897b626a6dc7e4a49fa25e","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5}],"schema":5}}

Checked standalone executability, actionability, dependency order, evidence
reverification, goal coverage, executable acceptance, failure modes, and open
questions. The terminal two-round series accepted P1, P2, P5, and P6 in repair
round 2; this revision closes them with complete resume/retry command
substitutions for publication, promotion, and finalization, an exact
three-field committed handback protocol whose values parameterize the
independent `--verify-public-release` validation of the finished public plan's
passed completion receipt, a source-proof-derived `TAG_COMMIT` with an
authoritative bound-run inspection command driving the recovery table, and
closed cold-handoff claims. The second terminal series accepted the
finalization crash boundary and its fixture coverage; this third revision
schedules the crash-injection fixture in step 2, corrects the recovery
evidence claim, and makes A2 execute both boundary contracts. A fresh full
round-one review of this materially changed input is a mandatory execution
gate.

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

Repair round on 2026-07-18: the round-one schema-5 review returned `not_ready`
with accepted blockers P1-P6 (variable capture, missing public handoff
protocol, promotion hard-bound to the companion commit, impossible A5 failure
receipt, missing pre-receipt recovery rule, and open decisions) plus
nonblocking P7 (A6 evidence). This revision repairs all seven within the
accepted fixes; repair round 2 must review the changed input before any
`planned → ongoing` transition.

Second revision on 2026-07-18: repair round 2 resolved P3/P4 but returned
terminal `not_ready` with accepted P1, P2, P5, P6 (missing resume/retry
commands, incomplete canonical handback, undefined `TAG_COMMIT` and workflow
inspection, and the resulting open decisions). That series is exhausted; this
materially changed revision closes all four and requires a fresh full
round-one review — a new series on changed input, not a same-input retry —
before any `planned → ongoing` transition.

Third revision on 2026-07-18: series 2 (full round then repair round) accepted
the finalization crash-boundary blocker and, in repair round 2, the missing
fixture scheduling, the overstated evidence claim, and the missing acceptance
coverage. This revision adds the crash-injection fixture to step 2 and A2,
corrects the recovery comment, and adds
`plugins/session-relay/test/release-publication-contract.mjs` to the ladder
and affected paths. A fresh full round-one review on this changed input gates
any `planned → ongoing` transition.
