---
title: Publish Session Relay 0.12.0 and docks-kit 0.9.0
goal: Bind reviewed source evidence, publish immutable prerelease assets, release docks-kit, promote the archive, and finalize Session Relay stable.
status: planned
created: "2026-07-18T11:45:54-03:00"
updated: "2026-07-18T15:17:54-03:00"
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
```

Each later attempt of the same mode increments the `-N` receipt suffix and
repeats the same reassignment so downstream consumers always read the active
path/digest pair. Every resume/retry flag pair names the exact prior canonical
receipt; no other continuation grammar exists.

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
node scripts/ci.mjs --plugin session-relay --timings-json /tmp/session-relay-ci.json
node scripts/ci.mjs
```

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Finish the byte-preserving proof-binder repair and commit it after the focused, targeted, and full verification ladder. | `scripts/lib/session-relay-release-core.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs` | reviewed `planned → ongoing` transition | planned | `commandRaw`/`gitRaw` preserve the terminal LF; only `git show` uses raw bytes; the archive commit may be an ancestor of current HEAD; all four ladder commands exit 0; one focused repair commit leaves the worktree clean. |
| 2 | Extend the release public boundary red/green: freeze failing promotion-contract fixtures first, then implement `--emit-public-request`, `--verify-public-release`, and the extended promotion/finalization receipt validation. | `plugins/session-relay/test/release-promotion-contract.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/lib/session-relay-release-cli.mjs` | 1 | planned | New fixtures fail before implementation and pass after; the promotion journal/receipt carry `public_release_commit` and `public_release_receipt_sha256`; companion ancestry is required; the docks-kit smoke target equals `public_release_commit`; the full ladder passes at one focused commit. |
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
| A2 | `node plugins/session-relay/test/release-promotion-contract.mjs` | Exits 0; the extended contract proves request/receipt emission and verification, `public_release_commit` binding with companion ancestry, the docks-kit smoke-target change, and the finalization consumer against red/green fixtures. |
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
  recovery table.
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
Review-receipt: {"input_sha256":"9dd13a19100f69dd1484a976bb61a9e4d244e3917f96e16c7606205ea21b11ed","outcome":"not_ready","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"146d05a75af9fdfd6ed13b26ae74992e2aade7628159dbffcb5382427183af40","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"1331ec32bab0602df8c4455e60d6ff0e2e0e05b25146763e79659768e27fc88f","exit_code":null,"method":"read"}},{"id":"P5","reproduction":{"command":null,"evidence_sha256":"3b902576e9e773b66ba13455db83001e5d44804e7a29d85e5c965dde0f5706d3","exit_code":null,"method":"read"}},{"id":"P6","reproduction":{"command":null,"evidence_sha256":"024528de47dc5bf0882540e4fd544aa677eced87d121a42c21a53b5e3ed44a6e","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"5859c3f7043ea89f4796273abdd9b053b4021ddded0080b4cfcbdaa704ec130c","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9dd13a19100f69dd1484a976bb61a9e4d244e3917f96e16c7606205ea21b11ed","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","repair_targets_sha256":"0e822a0585518658cc372dd2231394cd7123bda244665781928646c44b562e8b","request_id":"5c969eac-c719-43cc-8a0a-464563358a3e","review_mode":"repair","reviewed_commit_or_head":"f4c1499da63192b20317ec879ae42e4b49c805f6","round_index":2,"schema":5},"reviewed_at":"2026-07-18T18:13:57.029Z","reviewed_commit":"f4c1499da63192b20317ec879ae42e4b49c805f6","reviewer":{"accepted_finding_ids":["P1","P2","P5","P6"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"codex-repair-5c969eac","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 repair-round evidence and the output validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"8e8f501e97a0a7173274b3c583ff8902a584b4a4dfe6262a2318d74ae5d87f20","stdout_sha256":"419044ae4ce956788df04b44c3f4a48c5edc96f4c081f1a07b944262d260bb0a","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"6897e847252a824908efebe0410e81fa4289ad4e4715b7bab6a8c7bdb8f888a3","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"5859c3f7043ea89f4796273abdd9b053b4021ddded0080b4cfcbdaa704ec130c","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9dd13a19100f69dd1484a976bb61a9e4d244e3917f96e16c7606205ea21b11ed","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","repair_targets_sha256":"0e822a0585518658cc372dd2231394cd7123bda244665781928646c44b562e8b","request_id":"5c969eac-c719-43cc-8a0a-464563358a3e","review_mode":"repair","reviewed_commit_or_head":"f4c1499da63192b20317ec879ae42e4b49c805f6","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Blocking: the repaired public handoff still lacks exact public plan-manager lifecycle commands and a canonical returned completion-receipt path/digest consumed by A8. The Relay reply is explicitly non-evidence, while A8 accepts only the request and publication pairs.","status":"blocking_gap"},"dependency_order":{"evidence":"Pass: step 2 extends the promotion boundary before runtime release mutation; steps 5 and 6 then produce and consume the reviewed public release receipt. This resolves the former companion-commit ordering conflict.","status":"pass"},"evidence_reverification":{"evidence":"Pass: A1-A4 re-run focused and repository gates, while A8 independently re-observes the public tag, workflow, Release, checksums, ancestry, npm state, and pinned digests before promotion.","status":"pass"},"executable_acceptance":{"evidence":"Pass: A5-A10 provide ordered base-path commands with command-substitution digest capture and adjacent receipt path/digest inputs; the former impossible publication failure-receipt outcome was removed.","status":"pass"},"failure_modes":{"evidence":"Blocking: the pre-receipt publication table refers to an undefined TAG_COMMIT and classifies pending or failed workflow runs without supplying an authoritative workflow-run inspection command. It therefore cannot drive the required recovery decision safely.","status":"blocking_gap"},"goal_coverage":{"evidence":"Pass: the repaired plan covers proof binding, prerelease publication, the public request and reviewed docks-kit release, promotion, live smokes, stable finalization, and lifecycle completion.","status":"pass"},"open_questions":{"evidence":"Blocking: despite the self-review claiming both decisions are closed, the canonical public completion handback and authoritative pre-receipt workflow-state recovery procedure remain unspecified.","status":"blocking_gap"},"standalone_executability":{"evidence":"Blocking: the base path captures receipt digests, but the accepted requirement for equivalent assignments on every legal resume or retry path remains unmet. No complete commands are provided for promotion resume/retry or finalization resume after interruption.","status":"blocking_gap"}},"findings":[{"criterion":"standalone_executability","defect":"The accepted P1 requirement to include equivalent path and digest assignments for every legal resume or retry path remains unmet, so interrupted promotion or finalization cannot be continued from this plan.","evidence":"Lines 74-75 only state generically that a legal resume or retry uses a distinct path and captures a digest. The plan contains no `--resume-promotion`, `--retry-failed`, or `--resume-finalization` command, although lines 109 and 226-227 require distinct legal recovery grammars. Consequently, an interrupted A9 or A10 has no executable continuation step.","fix":"Add complete command-substitution examples for publication resume, promotion resume, promotion retry, and finalization resume. Assign a distinct no-clobber receipt path for each attempt, pass every required adjacent receipt pair and transaction reference, validate the result, and then update the active path/digest pair used downstream.","id":"P1","locator":"lines 74-75, 109, and 226-227","path":"plan.review.md","section":"Environment and how to run / Steps / Known gotchas","status":"blocking_gap"},{"criterion":"actionability","defect":"The accepted P2 requirement for an exact canonical handback of the separately reviewed public release is still incomplete, so the reviewed-public-release execution step cannot produce trusted lifecycle evidence for promotion.","evidence":"Lines 80-84 invoke Relay but only request a conversational reply containing the shipped plan path, release commit, and completion receipt digest. Line 88 declares that reply non-evidence. Line 108 mentions an identical committed handback without defining its canonical path or bytes. The `PublicReleaseReceiptV1` shape at line 172 requires `public_plan.path` and `completion_receipt_sha256`, yet A8 at line 196 accepts no returned completion-receipt path/digest and the plan gives no exact public plan-manager review/start/complete/ship commands.","fix":"Define the exact public plan-manager lifecycle commands and a canonical completion handback receipt with a fixed path, closed fields, and SHA-256. Specify how its bytes cross the Relay boundary, add its adjacent path/digest inputs to `--verify-public-release`, and require A8 to validate the shipped plan, release commit, and completion receipt before emitting `PublicReleaseReceiptV1`.","id":"P2","locator":"lines 80-88, 108, 172, and 196","path":"plan.review.md","section":"Environment and how to run / Steps / Interfaces and data shapes / Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The accepted P5 requirement for authoritative inspection commands and a legal pre-receipt publication recovery decision table remains incomplete, so publication recovery can select a branch from unverified or undefined state.","evidence":"Lines 228-238 provide only tag and Release inspection commands, but classify pending or failed workflow runs without a command that identifies the bound run and its status. The table compares the tag to `TAG_COMMIT` at line 233, while the environment defines no TAG_COMMIT variable. Therefore the exact recovery step after a tag-only, pending-run, or failed-run interruption cannot be executed safely.","fix":"Derive and validate TAG_COMMIT from the canonical source proof, add exact authoritative workflow-run inspection commands that bind repository, workflow, head SHA, tag, run attempt, and conclusion, and provide the complete base or resume command for every resulting state. Make ambiguous or competing run states explicit STOP cases.","id":"P5","locator":"lines 228-238","path":"plan.review.md","section":"Known gotchas","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan claims no unresolved decisions although two execution-changing choices remain open: how canonical public completion evidence is returned and validated, and how workflow state is established during pre-receipt publication recovery.","evidence":"Lines 293 and 305 claim all terms are defined and both previous decisions are closed. P2 shows that the canonical public completion handback has no defined path/input protocol, and P5 shows that workflow state and TAG_COMMIT cannot be established using the stated recovery commands.","fix":"Close both decisions with exact canonical payload paths and digest pairs, exact lifecycle and validation commands, and a state-dependent recovery table whose inputs are all produced by listed authoritative commands.","id":"P6","locator":"lines 293 and 305","path":"plan.review.md","section":"Cold-handoff checklist / Self-review","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"5859c3f7043ea89f4796273abdd9b053b4021ddded0080b4cfcbdaa704ec130c","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9dd13a19100f69dd1484a976bb61a9e4d244e3917f96e16c7606205ea21b11ed","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","repair_targets_sha256":"0e822a0585518658cc372dd2231394cd7123bda244665781928646c44b562e8b","request_id":"5c969eac-c719-43cc-8a0a-464563358a3e","review_mode":"repair","reviewed_commit_or_head":"f4c1499da63192b20317ec879ae42e4b49c805f6","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5,"series":{"current_input_sha256":"9dd13a19100f69dd1484a976bb61a9e4d244e3917f96e16c7606205ea21b11ed","initial_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","repairs":[{"accepted_finding_ids":["P1","P2","P3","P4","P5","P6"],"current_input_sha256":"9dd13a19100f69dd1484a976bb61a9e4d244e3917f96e16c7606205ea21b11ed","from_round_index":1,"previous_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","repair_targets_sha256":"0e822a0585518658cc372dd2231394cd7123bda244665781928646c44b562e8b","schema":5,"targets":[{"criterion":"standalone_executability","defect":"The receipt-chain variables are declared empty and never populated before later commands consume them, causing exact acceptance steps A5, A7, and A8 to fail.","evidence":"Plan lines 42–50 leave SOURCE_PROOF_SHA256, PUBLICATION_RECEIPT, PUBLICATION_SHA256, PROMOTION_RECEIPT, and PROMOTION_SHA256 empty. A4 only prints a digest; A5 consumes SOURCE_PROOF_SHA256, A7 consumes the publication pair, and A8 consumes the promotion pair. scripts/lib/session-relay-release-core.mjs:108-117 rejects any digest that is not 64 lowercase hexadecimal characters.","fix":"Capture each producer's stdout into its digest variable, assign the exact no-clobber receipt path selected for that attempt, validate each adjacent path/digest pair, and include equivalent assignments for every legal resume or retry path.","id":"P1","locator":"lines 42-50 and 122-126","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"9cf9cb132e14859e46bbf8ae40c8444c59f1d412691a48fd89566ff98055c374","exit_code":null,"method":"read"},"section":"Environment and how to run / Acceptance criteria","source":"primary","status":"blocking_gap"},{"criterion":"actionability","defect":"The exact execution step that hands four production digests to the separately owned public release and collects its reviewed result is missing.","evidence":"Plan lines 23–28 require canonical receipt bytes and SHA-256 to cross the boundary; step 4 names a future public plan; STOP lines 179–180 forbid direct cross-worktree substitution. No relay command, canonical request fields, response receipt, lifecycle command, or returned-evidence validator is supplied. A6 only observes a tag after this omitted work.","fix":"Specify the authorized relay invocation, canonical request fields and digest, public plan review/lifecycle commands, returned canonical completion receipt path/digest, and the validation command used before promotion.","id":"P2","locator":"lines 23-28, 68, and 179-180","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"1755c06ddedc1b38a29ad3695be4326a4a579744274ac56ee6a6f7c2f1058966","exit_code":null,"method":"read"},"section":"Context and rationale / Steps / STOP conditions","source":"primary","status":"blocking_gap"},{"criterion":"dependency_order","defect":"Step 5 cannot accept step 4's reviewed public release commit because promotion is hard-bound to the older companion commit embedded before the production digest edits.","evidence":"The finished source plan records companion implementation commit c3b542220d5a24a98ca05383bbe28afc2319b7e2, which bindCompletion places in SourcePreparationProofV1 as public_reviewed_commit. Step 4 requires editing public SoT/toolchain.json and sotPayload.ts and producing a reviewed release commit. scripts/lib/session-relay-release-promotion.mjs:327-339 and 989-996 require the docks-kit tag/target commit to equal proof.value.public_reviewed_commit; a new digest-update commit therefore fails with `docks-kit release tag does not match the reviewed public commit`.","fix":"Separate the reviewed companion base commit from the later reviewed public release commit. Add a canonical public completion receipt that proves ancestry, allowed digest-only changes, review, tag, workflow, and Release identities, and make promotion consume and validate that new commit. Update the affected promotion interfaces/tests and out-of-scope boundary accordingly.","id":"P3","locator":"lines 68 and 122-126","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"50c24cfaf1b51ad5eeeaaeadb4473ac880821d95872b4c0f1a271eb43978d831","exit_code":null,"method":"read"},"section":"Steps / Acceptance criteria","source":"primary","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A5's stated resumable-failure outcome cannot be produced by the sealed publication state machine, so that exact acceptance branch fails.","evidence":"Plan line 123 accepts a canonical resumable failure receipt. scripts/lib/session-relay-release-publication.mjs:476-488 permits only prerelease/stable receipt states, and publishReviewed at lines 764–859 calls emitReceipt only following successful reconciliation; other outcomes throw. Neither the implementation nor release-publication-contract.mjs defines a failure receipt.","fix":"Replace A5 with outcomes the current implementation can produce and add exact receipt/digest/state validation. If failure receipts are required, explicitly plan their schema, producer, validator, CLI grammar, and contract tests first.","id":"P4","locator":"line 123","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"f2ab06ed8128283ace513adaf643c661496e874c0560052dadf7f942f27eec8d","exit_code":null,"method":"read"},"section":"Acceptance criteria","source":"primary","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The exact publication recovery step fails after an interruption before receipt emission because the plan requires receipt-based classification but no receipt exists.","evidence":"Plan lines 152–153 and 177–178 require selecting only a receipt-authorized resume/retry grammar. publishReviewed throws on conflicts or failed workflow outcomes without emitting a receipt. The plan supplies no state-based rule for no tag, tag only, pending/failed run, partial Release/assets, or complete prerelease without a captured receipt.","fix":"Define authoritative inspection commands and a legal recovery decision table for every pre-receipt publication state, including explicit STOP states and the exact base, reconcile, or resume invocation allowed in each case.","id":"P5","locator":"lines 152-153 and 177-178","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"e3f1e0771facdfc15998f5d64b88748e66031b8c42a0be23b46c67b5f9a22a77","exit_code":null,"method":"read"},"section":"Known gotchas / STOP conditions","source":"primary","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan incorrectly claims no open decision even though the public-boundary protocol and pre-receipt publication recovery mode remain undecided.","evidence":"Lines 199–209 claim all receipt roles are defined and no product decision remains. P2 shows that the cross-repository protocol is unspecified, and P5 shows that an executor must choose an unprovided recovery mode after partial publication.","fix":"Close both decisions with exact commands, canonical payload/receipt contracts, and state-dependent recovery rules before execution.","id":"P6","locator":"lines 199-209","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"4bb28c10ca4257c6cd6a802b6755691e938bf108c0959802423b317dffccd6b2","exit_code":null,"method":"read"},"section":"Cold-handoff checklist / Self-review","source":"primary","status":"blocking_gap"}]}],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"9cf9cb132e14859e46bbf8ae40c8444c59f1d412691a48fd89566ff98055c374","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"1755c06ddedc1b38a29ad3695be4326a4a579744274ac56ee6a6f7c2f1058966","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"50c24cfaf1b51ad5eeeaaeadb4473ac880821d95872b4c0f1a271eb43978d831","exit_code":null,"method":"read"}},{"id":"P4","reproduction":{"command":null,"evidence_sha256":"f2ab06ed8128283ace513adaf643c661496e874c0560052dadf7f942f27eec8d","exit_code":null,"method":"read"}},{"id":"P5","reproduction":{"command":null,"evidence_sha256":"e3f1e0771facdfc15998f5d64b88748e66031b8c42a0be23b46c67b5f9a22a77","exit_code":null,"method":"read"}},{"id":"P6","reproduction":{"command":null,"evidence_sha256":"4bb28c10ca4257c6cd6a802b6755691e938bf108c0959802423b317dffccd6b2","exit_code":null,"method":"read"}},{"id":"P7","reproduction":{"command":null,"evidence_sha256":"a966f051fb028bd613d4698008b19b80a04b41900cad32a0424dcc684ba04e10","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"c01b4a064c3e353021cc362ce2353ae41f54e0e919fdb842ba332000e7988f37","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"5148bafa-cd2a-46a1-94ed-c014f9fddfa0","review_mode":"full","reviewed_commit_or_head":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","round_index":1,"schema":5},"reviewer":{"accepted_finding_ids":["P1","P2","P3","P4","P5","P6","P7"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7650-89bd-7bd3-9aba-b5efa524a462","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 primary review evidence and the output validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"bd84bad16e7fc3f311aacb52359a23948478379639d3ee4b92f78ec4c9e43c72","stdout_sha256":"34ec0c2c0c9500a8f36c04e2c26f963710945f758c16087a7c64ea17edc64fe1","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"dda440b402836ef96ce6e6d518636685c41e9bcfb867a59b6be926d13f2f5dd7","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"c01b4a064c3e353021cc362ce2353ae41f54e0e919fdb842ba332000e7988f37","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"5148bafa-cd2a-46a1-94ed-c014f9fddfa0","review_mode":"full","reviewed_commit_or_head":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","round_index":1,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Step 4 cannot be performed from the plan: it provides no executable command, canonical request payload, returned receipt contract, or validation procedure for the required cross-repository handoff, while direct public-worktree edits are forbidden.","status":"blocking_gap"},"dependency_order":{"evidence":"The immutable source proof pins public reviewed commit c3b542220d5a24a98ca05383bbe28afc2319b7e2, but step 4 requires subsequent public digest edits and a new reviewed release commit. Promotion requires the docks-kit tag target to equal the older proof-bound commit, so step 5 cannot consume step 4's output.","status":"blocking_gap"},"evidence_reverification":{"evidence":"A6 only resolves the local cli-v0.9.0 tag, while its expected result claims verification of the workflow run, six release assets, checksums, and npm state. Those properties are delegated to an unbundled future plan and are not reverified by the command or a bound public completion receipt.","status":"non_blocking_gap"},"executable_acceptance":{"evidence":"A5 permits a canonical resumable failure receipt, but the sealed publication implementation defines only prerelease/stable receipts and emits them only after successful reconciliation. The documented failure branch is not executable.","status":"blocking_gap"},"failure_modes":{"evidence":"The plan requires publication recovery to be selected from a canonical receipt, but publication failures before successful reconciliation emit no receipt. No authoritative state-inspection decision table identifies the legal recovery command for tag-only, pending-run, failed-run, or partial-Release states.","status":"blocking_gap"},"goal_coverage":{"evidence":"The plan explicitly covers proof binding, Session Relay prerelease publication, the public docks-kit release, Docks promotion, live/exact-source smokes, stable finalization, and lifecycle completion. The inability to connect some phases is reported under dependency_order rather than omitted goal scope.","status":"pass"},"open_questions":{"evidence":"Material release choices remain unresolved: the exact public-boundary protocol and the legal recovery command after a pre-receipt publication interruption. Both choices affect external mutations and evidence provenance.","status":"blocking_gap"},"standalone_executability":{"evidence":"Lines 42–50 initialize every receipt digest and selected receipt path as empty, but A5, A7, and A8 consume those variables without assignments. Sealed core validation rejects empty digests, so the acceptance sequence fails as written.","status":"blocking_gap"}},"findings":[{"criterion":"standalone_executability","defect":"The receipt-chain variables are declared empty and never populated before later commands consume them, causing exact acceptance steps A5, A7, and A8 to fail.","evidence":"Plan lines 42–50 leave SOURCE_PROOF_SHA256, PUBLICATION_RECEIPT, PUBLICATION_SHA256, PROMOTION_RECEIPT, and PROMOTION_SHA256 empty. A4 only prints a digest; A5 consumes SOURCE_PROOF_SHA256, A7 consumes the publication pair, and A8 consumes the promotion pair. scripts/lib/session-relay-release-core.mjs:108-117 rejects any digest that is not 64 lowercase hexadecimal characters.","fix":"Capture each producer's stdout into its digest variable, assign the exact no-clobber receipt path selected for that attempt, validate each adjacent path/digest pair, and include equivalent assignments for every legal resume or retry path.","id":"P1","locator":"lines 42-50 and 122-126","path":"plan.review.md","section":"Environment and how to run / Acceptance criteria","status":"blocking_gap"},{"criterion":"actionability","defect":"The exact execution step that hands four production digests to the separately owned public release and collects its reviewed result is missing.","evidence":"Plan lines 23–28 require canonical receipt bytes and SHA-256 to cross the boundary; step 4 names a future public plan; STOP lines 179–180 forbid direct cross-worktree substitution. No relay command, canonical request fields, response receipt, lifecycle command, or returned-evidence validator is supplied. A6 only observes a tag after this omitted work.","fix":"Specify the authorized relay invocation, canonical request fields and digest, public plan review/lifecycle commands, returned canonical completion receipt path/digest, and the validation command used before promotion.","id":"P2","locator":"lines 23-28, 68, and 179-180","path":"plan.review.md","section":"Context and rationale / Steps / STOP conditions","status":"blocking_gap"},{"criterion":"dependency_order","defect":"Step 5 cannot accept step 4's reviewed public release commit because promotion is hard-bound to the older companion commit embedded before the production digest edits.","evidence":"The finished source plan records companion implementation commit c3b542220d5a24a98ca05383bbe28afc2319b7e2, which bindCompletion places in SourcePreparationProofV1 as public_reviewed_commit. Step 4 requires editing public SoT/toolchain.json and sotPayload.ts and producing a reviewed release commit. scripts/lib/session-relay-release-promotion.mjs:327-339 and 989-996 require the docks-kit tag/target commit to equal proof.value.public_reviewed_commit; a new digest-update commit therefore fails with `docks-kit release tag does not match the reviewed public commit`.","fix":"Separate the reviewed companion base commit from the later reviewed public release commit. Add a canonical public completion receipt that proves ancestry, allowed digest-only changes, review, tag, workflow, and Release identities, and make promotion consume and validate that new commit. Update the affected promotion interfaces/tests and out-of-scope boundary accordingly.","id":"P3","locator":"lines 68 and 122-126","path":"plan.review.md","section":"Steps / Acceptance criteria","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A5's stated resumable-failure outcome cannot be produced by the sealed publication state machine, so that exact acceptance branch fails.","evidence":"Plan line 123 accepts a canonical resumable failure receipt. scripts/lib/session-relay-release-publication.mjs:476-488 permits only prerelease/stable receipt states, and publishReviewed at lines 764–859 calls emitReceipt only following successful reconciliation; other outcomes throw. Neither the implementation nor release-publication-contract.mjs defines a failure receipt.","fix":"Replace A5 with outcomes the current implementation can produce and add exact receipt/digest/state validation. If failure receipts are required, explicitly plan their schema, producer, validator, CLI grammar, and contract tests first.","id":"P4","locator":"line 123","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The exact publication recovery step fails after an interruption before receipt emission because the plan requires receipt-based classification but no receipt exists.","evidence":"Plan lines 152–153 and 177–178 require selecting only a receipt-authorized resume/retry grammar. publishReviewed throws on conflicts or failed workflow outcomes without emitting a receipt. The plan supplies no state-based rule for no tag, tag only, pending/failed run, partial Release/assets, or complete prerelease without a captured receipt.","fix":"Define authoritative inspection commands and a legal recovery decision table for every pre-receipt publication state, including explicit STOP states and the exact base, reconcile, or resume invocation allowed in each case.","id":"P5","locator":"lines 152-153 and 177-178","path":"plan.review.md","section":"Known gotchas / STOP conditions","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan incorrectly claims no open decision even though the public-boundary protocol and pre-receipt publication recovery mode remain undecided.","evidence":"Lines 199–209 claim all receipt roles are defined and no product decision remains. P2 shows that the cross-repository protocol is unspecified, and P5 shows that an executor must choose an unprovided recovery mode after partial publication.","fix":"Close both decisions with exact commands, canonical payload/receipt contracts, and state-dependent recovery rules before execution.","id":"P6","locator":"lines 199-209","path":"plan.review.md","section":"Cold-handoff checklist / Self-review","status":"blocking_gap"},{"criterion":"evidence_reverification","defect":"A6 does not reverify the public release evidence asserted by its expected result.","evidence":"A6 at line 124 runs only `git -C /home/vagrant/projects/public rev-parse refs/tags/cli-v0.9.0^{commit}` but claims a unique successful release-cli.yml run, exact six-asset Release, checksums, and npm state. None of those live properties is observed, and no validated public completion receipt is an input.","fix":"Add rerunnable commands or validate a canonical public completion receipt covering the exact tag commit, unique workflow run, six asset identities/digests, checksum contents, and npm outcome; bind that receipt into promotion.","id":"P7","locator":"line 124","path":"plan.review.md","section":"Acceptance criteria","status":"non_blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"c01b4a064c3e353021cc362ce2353ae41f54e0e919fdb842ba332000e7988f37","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"5148bafa-cd2a-46a1-94ed-c014f9fddfa0","review_mode":"full","reviewed_commit_or_head":"35b639db3a1404b1b2f1a30bd5dc65c079b8052e","round_index":1,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5},{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"146d05a75af9fdfd6ed13b26ae74992e2aade7628159dbffcb5382427183af40","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"1331ec32bab0602df8c4455e60d6ff0e2e0e05b25146763e79659768e27fc88f","exit_code":null,"method":"read"}},{"id":"P5","reproduction":{"command":null,"evidence_sha256":"3b902576e9e773b66ba13455db83001e5d44804e7a29d85e5c965dde0f5706d3","exit_code":null,"method":"read"}},{"id":"P6","reproduction":{"command":null,"evidence_sha256":"024528de47dc5bf0882540e4fd544aa677eced87d121a42c21a53b5e3ed44a6e","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"5859c3f7043ea89f4796273abdd9b053b4021ddded0080b4cfcbdaa704ec130c","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9dd13a19100f69dd1484a976bb61a9e4d244e3917f96e16c7606205ea21b11ed","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","repair_targets_sha256":"0e822a0585518658cc372dd2231394cd7123bda244665781928646c44b562e8b","request_id":"5c969eac-c719-43cc-8a0a-464563358a3e","review_mode":"repair","reviewed_commit_or_head":"f4c1499da63192b20317ec879ae42e4b49c805f6","round_index":2,"schema":5},"reviewer":{"accepted_finding_ids":["P1","P2","P5","P6"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"codex-repair-5c969eac","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 repair-round evidence and the output validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"8e8f501e97a0a7173274b3c583ff8902a584b4a4dfe6262a2318d74ae5d87f20","stdout_sha256":"419044ae4ce956788df04b44c3f4a48c5edc96f4c081f1a07b944262d260bb0a","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"6897e847252a824908efebe0410e81fa4289ad4e4715b7bab6a8c7bdb8f888a3","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"5859c3f7043ea89f4796273abdd9b053b4021ddded0080b4cfcbdaa704ec130c","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9dd13a19100f69dd1484a976bb61a9e4d244e3917f96e16c7606205ea21b11ed","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","repair_targets_sha256":"0e822a0585518658cc372dd2231394cd7123bda244665781928646c44b562e8b","request_id":"5c969eac-c719-43cc-8a0a-464563358a3e","review_mode":"repair","reviewed_commit_or_head":"f4c1499da63192b20317ec879ae42e4b49c805f6","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Blocking: the repaired public handoff still lacks exact public plan-manager lifecycle commands and a canonical returned completion-receipt path/digest consumed by A8. The Relay reply is explicitly non-evidence, while A8 accepts only the request and publication pairs.","status":"blocking_gap"},"dependency_order":{"evidence":"Pass: step 2 extends the promotion boundary before runtime release mutation; steps 5 and 6 then produce and consume the reviewed public release receipt. This resolves the former companion-commit ordering conflict.","status":"pass"},"evidence_reverification":{"evidence":"Pass: A1-A4 re-run focused and repository gates, while A8 independently re-observes the public tag, workflow, Release, checksums, ancestry, npm state, and pinned digests before promotion.","status":"pass"},"executable_acceptance":{"evidence":"Pass: A5-A10 provide ordered base-path commands with command-substitution digest capture and adjacent receipt path/digest inputs; the former impossible publication failure-receipt outcome was removed.","status":"pass"},"failure_modes":{"evidence":"Blocking: the pre-receipt publication table refers to an undefined TAG_COMMIT and classifies pending or failed workflow runs without supplying an authoritative workflow-run inspection command. It therefore cannot drive the required recovery decision safely.","status":"blocking_gap"},"goal_coverage":{"evidence":"Pass: the repaired plan covers proof binding, prerelease publication, the public request and reviewed docks-kit release, promotion, live smokes, stable finalization, and lifecycle completion.","status":"pass"},"open_questions":{"evidence":"Blocking: despite the self-review claiming both decisions are closed, the canonical public completion handback and authoritative pre-receipt workflow-state recovery procedure remain unspecified.","status":"blocking_gap"},"standalone_executability":{"evidence":"Blocking: the base path captures receipt digests, but the accepted requirement for equivalent assignments on every legal resume or retry path remains unmet. No complete commands are provided for promotion resume/retry or finalization resume after interruption.","status":"blocking_gap"}},"findings":[{"criterion":"standalone_executability","defect":"The accepted P1 requirement to include equivalent path and digest assignments for every legal resume or retry path remains unmet, so interrupted promotion or finalization cannot be continued from this plan.","evidence":"Lines 74-75 only state generically that a legal resume or retry uses a distinct path and captures a digest. The plan contains no `--resume-promotion`, `--retry-failed`, or `--resume-finalization` command, although lines 109 and 226-227 require distinct legal recovery grammars. Consequently, an interrupted A9 or A10 has no executable continuation step.","fix":"Add complete command-substitution examples for publication resume, promotion resume, promotion retry, and finalization resume. Assign a distinct no-clobber receipt path for each attempt, pass every required adjacent receipt pair and transaction reference, validate the result, and then update the active path/digest pair used downstream.","id":"P1","locator":"lines 74-75, 109, and 226-227","path":"plan.review.md","section":"Environment and how to run / Steps / Known gotchas","status":"blocking_gap"},{"criterion":"actionability","defect":"The accepted P2 requirement for an exact canonical handback of the separately reviewed public release is still incomplete, so the reviewed-public-release execution step cannot produce trusted lifecycle evidence for promotion.","evidence":"Lines 80-84 invoke Relay but only request a conversational reply containing the shipped plan path, release commit, and completion receipt digest. Line 88 declares that reply non-evidence. Line 108 mentions an identical committed handback without defining its canonical path or bytes. The `PublicReleaseReceiptV1` shape at line 172 requires `public_plan.path` and `completion_receipt_sha256`, yet A8 at line 196 accepts no returned completion-receipt path/digest and the plan gives no exact public plan-manager review/start/complete/ship commands.","fix":"Define the exact public plan-manager lifecycle commands and a canonical completion handback receipt with a fixed path, closed fields, and SHA-256. Specify how its bytes cross the Relay boundary, add its adjacent path/digest inputs to `--verify-public-release`, and require A8 to validate the shipped plan, release commit, and completion receipt before emitting `PublicReleaseReceiptV1`.","id":"P2","locator":"lines 80-88, 108, 172, and 196","path":"plan.review.md","section":"Environment and how to run / Steps / Interfaces and data shapes / Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The accepted P5 requirement for authoritative inspection commands and a legal pre-receipt publication recovery decision table remains incomplete, so publication recovery can select a branch from unverified or undefined state.","evidence":"Lines 228-238 provide only tag and Release inspection commands, but classify pending or failed workflow runs without a command that identifies the bound run and its status. The table compares the tag to `TAG_COMMIT` at line 233, while the environment defines no TAG_COMMIT variable. Therefore the exact recovery step after a tag-only, pending-run, or failed-run interruption cannot be executed safely.","fix":"Derive and validate TAG_COMMIT from the canonical source proof, add exact authoritative workflow-run inspection commands that bind repository, workflow, head SHA, tag, run attempt, and conclusion, and provide the complete base or resume command for every resulting state. Make ambiguous or competing run states explicit STOP cases.","id":"P5","locator":"lines 228-238","path":"plan.review.md","section":"Known gotchas","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan claims no unresolved decisions although two execution-changing choices remain open: how canonical public completion evidence is returned and validated, and how workflow state is established during pre-receipt publication recovery.","evidence":"Lines 293 and 305 claim all terms are defined and both previous decisions are closed. P2 shows that the canonical public completion handback has no defined path/input protocol, and P5 shows that workflow state and TAG_COMMIT cannot be established using the stated recovery commands.","fix":"Close both decisions with exact canonical payload paths and digest pairs, exact lifecycle and validation commands, and a state-dependent recovery table whose inputs are all produced by listed authoritative commands.","id":"P6","locator":"lines 293 and 305","path":"plan.review.md","section":"Cold-handoff checklist / Self-review","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"5859c3f7043ea89f4796273abdd9b053b4021ddded0080b4cfcbdaa704ec130c","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9dd13a19100f69dd1484a976bb61a9e4d244e3917f96e16c7606205ea21b11ed","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"7672aaa157450dffce351cea7a54c2d03d2a202c886df91303e7d8a06a65ffce","repair_targets_sha256":"0e822a0585518658cc372dd2231394cd7123bda244665781928646c44b562e8b","request_id":"5c969eac-c719-43cc-8a0a-464563358a3e","review_mode":"repair","reviewed_commit_or_head":"f4c1499da63192b20317ec879ae42e4b49c805f6","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5}],"schema":5}}

Checked standalone executability, actionability, dependency order, evidence
reverification, goal coverage, executable acceptance, failure modes, and open
questions. The terminal two-round series accepted P1, P2, P5, and P6 in repair
round 2; this revision closes them with complete resume/retry command
substitutions for publication, promotion, and finalization, an exact
three-field committed handback protocol whose values parameterize the
independent `--verify-public-release` validation of the finished public plan's
passed completion receipt, a source-proof-derived `TAG_COMMIT` with an
authoritative bound-run inspection command driving the recovery table, and
closed cold-handoff claims. A fresh full round-one review of this materially
changed input is a mandatory execution gate.

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
