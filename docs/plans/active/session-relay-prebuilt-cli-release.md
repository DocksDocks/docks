---
title: Publish Session Relay 0.12.0 and docks-kit 0.9.0
goal: Bind reviewed source evidence, publish immutable prerelease assets, release docks-kit, promote the archive, and finalize Session Relay stable.
status: in_review
created: "2026-07-18T11:45:54-03:00"
updated: "2026-07-19T03:11:13-03:00"
started_at: "2026-07-18T15:47:52-03:00"
in_review_since: "2026-07-19T02:12:40-03:00"
assignee: codex
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
  - scripts/lib/session-relay-release-publication.mjs
  - scripts/lib/session-relay-release-cli.mjs
related_plans:
  - target-plugin-ci-and-release-gates
  - session-relay-prebuilt-cli-distribution
  - session-relay-cli-installation
review_status: null
planned_at_commit: ef289381858b5f85680255d433e6c08b2d36a1cb
execution_base_commit: b136e034806e634a891bd918d5664202d7362e01
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
- Allocate one owned mode-`0700` persistent receipt directory outside `/tmp`
  so a workstation restart cannot erase the canonical chain; keep every
  receipt at its original no-clobber path:

```bash
RECEIPT_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/docks-release/session-relay-0.12.0"
install -d -m 700 "$RECEIPT_ROOT"
RECEIPT_DIR="$(mktemp -d "$RECEIPT_ROOT/run.XXXXXX")"
chmod 700 "$RECEIPT_DIR"
cargo +1.85.0 build --manifest-path plugins/session-relay/rust/Cargo.toml \
  --release --locked
export SESSION_RELAY_BIN="$PWD/plugins/session-relay/rust/target/release/relay"
PUBLIC_PARENT_SESSION_ID="$(node -e "process.stdout.write(require('node:crypto').randomUUID())")"
"$SESSION_RELAY_BIN" register docks-release-public --id "$PUBLIC_PARENT_SESSION_ID" \
  --dir /home/vagrant/projects/public
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

# Publication base rebind — only when the immutable tag, successful bound run,
# complete matching prerelease Release, and exact assets already exist but no
# canonical publication receipt was captured (crash after the Release became
# complete and before receipt emission). First re-run A5 into a fresh no-clobber
# source-proof path, then revalidate provenance without mutating the tag,
# workflow run, or Release and emit one fresh canonical receipt.
SOURCE_PROOF_REBIND="$RECEIPT_DIR/source-proof-rebind-1.json"
SOURCE_PROOF_SHA256="$(node scripts/release.mjs --bind-completion --plugin session-relay 0.12.0 --finished-plan docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md --embedded-candidate-sha256 5dc52ca755106f7ad712784f71c74293594e5e903eb25b626ef93770ec48c0fa --receipt-out "$SOURCE_PROOF_REBIND")"
SOURCE_PROOF="$SOURCE_PROOF_REBIND"
PUBLICATION_REBIND_RECEIPT="$RECEIPT_DIR/publication-rebind-1.json"
PUBLICATION_SHA256="$(node scripts/release.mjs --publish-reviewed --plugin session-relay 0.12.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --rebind-complete-publication --receipt-out "$PUBLICATION_REBIND_RECEIPT")"
PUBLICATION_RECEIPT="$PUBLICATION_REBIND_RECEIPT"

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
receipt. The only receiptless continuations are the explicit publication
rebind and finalization base recovery above; each requires the complete
matching remote state and no captured receipt of that phase.

The public boundary uses the source-built Relay CLI:

```bash
# Clear and prove the invoker mailbox is empty before the only worker spawn.
PUBLIC_MAILBOX="$("$SESSION_RELAY_BIN" inbox "$PUBLIC_PARENT_SESSION_ID")"
node -e 'const x=JSON.parse(process.argv[1]);if(x.count!==0||x.messages.length!==0)process.exit(1)' "$PUBLIC_MAILBOX"
read -r _ PUBLIC_WORKER_ID _ <<<"$("$SESSION_RELAY_BIN" spawn /home/vagrant/projects/public \
  --fanout --from "$PUBLIC_PARENT_SESSION_ID" \
  --tool codex --model gpt-5.6-sol --effort high --service-tier default -- \
  "Read /home/vagrant/projects/public/AGENTS.md and docs/plans/AGENTS.md. Using the public plan-manager skill operations exactly: run 'new' to create docs/plans/active/session-relay-cli-production-release.md from the canonical PublicReleaseRequestV1 at $PUBLIC_REQUEST (SHA-256 $PUBLIC_REQUEST_SHA256), obtain its independent draft review, and run 'start'. Supersede docs/plans/active/session-relay-cli-installation.md without claiming production completion, pin exactly the four request digests in SoT/toolchain.json, regenerate cli/src/generated/sotPayload.ts, and run the full public gates. Make the release-preparation commit, mark the implementation steps done, run 'complete', and obtain a passed Completion-review-receipt. Read that receipt's exact reviewed_head into PUBLIC_RELEASE_COMMIT; require 40 lowercase hex, require it to contain the implementation and digest pins, and require it to be an ancestor of the current receipt-application HEAD. Tag exactly PUBLIC_RELEASE_COMMIT as cli-v0.9.0, push the tag, wait for the single release-cli.yml run, and independently verify its six-asset Release, checksums, and npm state. Only after that live release proof, run 'ship' with auto-commit. Set PUBLIC_PLAN_COMMIT to the full post-ship HEAD containing the finished plan and its Completion-review-receipt. Send exactly one durable mailbox message before handback with: relay send --from <your session> $PUBLIC_PARENT_SESSION_ID '<finished-plan-path> <release-commit-40hex> <plan-commit-40hex> <completion-receipt-sha256>'; then run relay handback --from <your session> --status completed --note 'public release lifecycle complete'. Do not print or send that four-field payload anywhere else." )"

# Wait for exactly one sender-bound durable handoff, then verify peek idempotence.
PUBLIC_MAILBOX=
for ((attempt=1; attempt<=720; attempt++)); do
  PUBLIC_MAILBOX="$("$SESSION_RELAY_BIN" peek "$PUBLIC_PARENT_SESSION_ID")"
  if node -e 'const x=JSON.parse(process.argv[1]),id=process.argv[2];process.exit(x.count===1&&x.messages.length===1&&x.messages[0].from===id?0:1)' "$PUBLIC_MAILBOX" "$PUBLIC_WORKER_ID"; then break; fi
  sleep 10
done
HANDBACK_NOTE="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.messages[0].body)' "$PUBLIC_MAILBOX")"
PUBLIC_MAILBOX_AGAIN="$("$SESSION_RELAY_BIN" peek "$PUBLIC_PARENT_SESSION_ID")"
test "$HANDBACK_NOTE" = "$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.messages[0].body)' "$PUBLIC_MAILBOX_AGAIN")"

# Collect is lifecycle-only and may need a bounded wait after message delivery.
PUBLIC_COLLECTED=0
for ((attempt=1; attempt<=720; attempt++)); do
  if "$SESSION_RELAY_BIN" collect "$PUBLIC_WORKER_ID" --from "$PUBLIC_PARENT_SESSION_ID"; then PUBLIC_COLLECTED=1; break; fi
  sleep 10
done
test "$PUBLIC_COLLECTED" = 1
PUBLIC_MAILBOX_DRAIN="$("$SESSION_RELAY_BIN" inbox "$PUBLIC_PARENT_SESSION_ID")"
test "$HANDBACK_NOTE" = "$(node -e 'const x=JSON.parse(process.argv[1]),id=process.argv[2];if(x.count!==1||x.messages.length!==1||x.messages[0].from!==id)process.exit(1);process.stdout.write(x.messages[0].body)' "$PUBLIC_MAILBOX_DRAIN" "$PUBLIC_WORKER_ID")"
test "$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.count))' "$("$SESSION_RELAY_BIN" peek "$PUBLIC_PARENT_SESSION_ID")")" = 0
read -r PUBLIC_FINISHED_PLAN PUBLIC_RELEASE_COMMIT PUBLIC_PLAN_COMMIT PUBLIC_COMPLETION_SHA256 extra <<<"$HANDBACK_NOTE"
test -z "$extra"
printf '%s' "$PUBLIC_FINISHED_PLAN" | grep -Eq '^docs/plans/finished/[0-9]{4}-[0-9]{2}-[0-9]{2}-session-relay-cli-production-release\.md$'
printf '%s' "$PUBLIC_RELEASE_COMMIT" | grep -Eq '^[0-9a-f]{40}$'
printf '%s' "$PUBLIC_PLAN_COMMIT" | grep -Eq '^[0-9a-f]{40}$'
printf '%s' "$PUBLIC_COMPLETION_SHA256" | grep -Eq '^[0-9a-f]{64}$'
git -C /home/vagrant/projects/public push origin HEAD:refs/heads/worker-session-relay-cli-installation
```

The durable mailbox payload is transport, not evidence: its four fields only
parameterize A8. Collection is lifecycle-only, and the parent never parses
`collect` stdout. `--verify-public-release` freshly fetches `DocksDocks/public`,
resolves tag `cli-v0.9.0`, requires the tag commit to equal
`$PUBLIC_RELEASE_COMMIT`, validates the exact production finished-plan path and
closed schema-5 `Completion-review-receipt:` at `$PUBLIC_PLAN_COMMIT`, proves
that the tagged release commit is its reviewed implementation ancestor, and
independently observes the workflow run, Release, checksums, npm state, and
digest pins before promotion consumes the canonical receipt pair.

The first promotion attempt terminated before any `origin/main` mutation because
the immutable public `docks-kit` `0.9.0` parser correctly rejected the
nonexistent `sync --release-test-source <checkout>` interface. Its canonical
`PromotionReceiptV1` remains byte-immutable with `outcome: failure` and
`retryable: false`; it is not relabeled as a generic retryable result.
One explicit `--repair-prepush` continuation may append attempt 1 to the same
authoritative journal only when all of these fail closed: the supplied prior
receipt is byte-identical to the attempt-0 terminal projection; the lock and
prerelease are unchanged; `origin/main` still equals the immutable expected
commit; no push, live smoke, restore, or reapply occurred; the compatibility
tree still equals the attempt-0 `before` snapshot; and a committed repair is a
descendant of that expected main whose diff contains only
`scripts/lib/session-relay-release-promotion.mjs`,
`scripts/lib/session-relay-release-cli.mjs`, and
`plugins/session-relay/test/release-promotion-contract.mjs`.

The repaired exact-source smoke invokes the published `docks-kit` binary with
its real `sync` argv only. Inside the mode-`0700` temporary HOME it installs a
Git URL rewrite from the immutable Docks repository URL to the detached
reviewed-source worktree, then requires every installed Session Relay plugin
launcher copy to equal the reviewed source launcher's SHA-256 and version.
The evidence descriptor binds that source commit and the actual `["sync"]`
argv. Historical attempt-0 evidence retaining the rejected argv remains valid
only as failed evidence; new successful exact-source evidence must use the
URL-rewrite binding. Attempt 1 reruns pre-push smoke, then uses the original
lease, push, live-smoke, and terminal-success gates. It never deletes or
rewrites the failed journal or its receipt.

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
| 1 | Finish the byte-preserving proof-binder repair and commit it after the focused, targeted, and full verification ladder. | `scripts/lib/session-relay-release-core.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs` | reviewed `planned → ongoing` transition | done | `commandRaw`/`gitRaw` preserve the terminal LF; only `git show` uses raw bytes; the archive commit may be an ancestor of current HEAD; all five ladder commands exit 0; one focused repair commit leaves the worktree clean. |
| 2 | Extend the release public boundary: freeze failing promotion/publication-rebind fixtures and a passing finalization crash characterization first, then implement `--emit-public-request`, `--verify-public-release`, explicit receiptless `--rebind-complete-publication`, and the extended promotion/finalization receipt validation. | `plugins/session-relay/test/release-promotion-contract.mjs`; `plugins/session-relay/test/release-publication-contract.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/lib/session-relay-release-publication.mjs`; `scripts/lib/session-relay-release-cli.mjs` | 1 | planned | The promotion and publication-rebind fixtures fail before their implementations and pass after; the finalization characterization passes before and after while proving fresh-path base recovery after `editStable` exits 0 with exactly one total Release mutation and a canonical `already_stable` stable receipt. The local public-plan validator enforces the exact closed schema-5 `Completion-review-receipt` shape recursively, rejects every missing or unknown field, requires `phase: "completion"`, `outcome: "passed"`, `completion_verdict: "passed"`, and binds `reviewed_head` exactly to `public_release_commit`; the exact finished slug is fixed to `docs/plans/finished/2026-07-18-session-relay-cli-production-release.md`. The promotion journal/receipt carry `public_release_commit` and `public_release_receipt_sha256`; companion ancestry is required; the docks-kit smoke target equals `public_release_commit`; explicit publication rebind alone validates a complete matching prerelease with no captured receipt, emits a canonical receipt, and performs zero remote mutations; the full ladder passes at one focused commit. |
| 3 | Bind the existing finished source proof without reopening source preparation. | `docs/plans/finished/2026-07-18-session-relay-prebuilt-cli-distribution.md` (read-only); `$SOURCE_PROOF` (runtime receipt) | 2 | done | Latest-touch/archive/blob/ancestry/candidate identities match; `SourcePreparationProofV1` is canonical mode `0600` and binds the exact source, evidence, shipped, and promoted commits. |
| 4 | Publish and validate the immutable Session Relay staging prerelease. | `$PUBLICATION_RECEIPT` or one distinct canonical resume receipt; Git tag `session-relay--v0.12.0`; GitHub Release assets (external) | 3 | done | One immutable tag, one bound producer run, four executables plus `SHA256SUMS`, same-run attestations, and staging prerelease identities validate from the canonical publication receipt. |
| 5 | Emit the canonical public release request, dispatch the reviewed public production-release worker over Session Relay, and independently verify the release and later lifecycle archive. | `$PUBLIC_REQUEST`; `$PUBLIC_RELEASE_RECEIPT`; `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-production-release.md` then `/home/vagrant/projects/public/docs/plans/finished/2026-07-18-session-relay-cli-production-release.md` (public lifecycle, its plan-manager only); external tag/Release `cli-v0.9.0` | 4 | done | A7 writes the request; a public-repository parent owns the relay `spawn`/`collect` round-trip (repeat `collect` once; identical committed handback), which carries only the request path/digest and returns four fields: finished public plan path, tagged release commit, later plan-only commit, and completion receipt SHA-256. In the public repository, implementation and digest pins pass their gates; plan-manager first commits `in_review`, completion review passes, and the receipt's exact `reviewed_head` becomes `PUBLIC_RELEASE_COMMIT`; tag `cli-v0.9.0`, the six-asset Release, and npm publication target that exact reviewed commit. Only after those external identities verify does plan-manager ship/archive in a distinct descendant commit. The public plan supersedes `session-relay-cli-installation.md` without claiming its production completion; A8 requires that exact dated finished slug, validates its locally closed schema-5 completion receipt with completion/passed semantics, requires the receipt `reviewed_head` to equal the tagged release commit exactly, and verifies the later plan-commit ancestry. |
| 6 | Promote the reviewed Docks archive with permanent transaction-ref and resumable journal semantics. | `$PROMOTION_RECEIPT` or one distinct legal resume/retry receipt; `refs/heads/transactions/session-relay-0.12.0`; remote `origin/main` | 5 | done | Expected remote main is resolved once; promotion consumes the verified `PublicReleaseReceiptV1` pair; lock/ref/journal identities are exact; exact-source and live docks-kit smokes pass against `public_release_commit`; compare-and-swap promotion succeeds; compatibility restore/reapply evidence validates. |
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
pinned_assets:{the four request digests re-read from the tagged release commit's
SoT/toolchain.json}, public_plan:{path, plan_commit,
completion_receipt_sha256}, created_at}`. Verification fails closed unless the
tag commit equals the collected `$PUBLIC_RELEASE_COMMIT`, descends from
`companion_base_commit`, and carries the reviewed implementation and digest
pins; the collected `$PUBLIC_PLAN_COMMIT` must descend from that release
commit and carry exactly
`docs/plans/finished/2026-07-18-session-relay-cli-production-release.md`.
Its one canonical `Completion-review-receipt:` object is validated locally
against the complete closed schema-5 contract: every nested object and array
item rejects missing or unknown fields, and the receipt must have `schema: 5`,
`phase: "completion"`, `outcome: "passed"`, `completion_verdict: "passed"`, and
`reviewed_head` exactly equal to `$PUBLIC_RELEASE_COMMIT`. The receipt line must
hash to the collected digest and frontmatter must have exactly
`review_status: passed`. Exactly one successful `release-cli.yml` run must have
produced the Release, the six assets and checksums must match, and every pinned
digest must equal its request value.

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
| A2 | `node plugins/session-relay/test/release-promotion-contract.mjs && node plugins/session-relay/test/release-publication-contract.mjs` | Both exit 0; the promotion contract proves request/receipt emission and verification, release-commit versus plan-commit separation, strict exact dated-slug closed schema-5 completion validation with missing/unknown-field, wrong phase/outcome, wrong `reviewed_head`, and adjacent-date and different-slug rejection cases, companion/reviewed ancestry, the docks-kit smoke-target change, and the finalization consumer; the publication contract's crash-injection fixtures prove both receiptless boundaries: termination after a complete matching prerelease and before publication receipt emission rebinds through explicit `--rebind-complete-publication` without remote mutation, while termination after `editStable` and before stable-receipt emission recovers with exactly one total Release mutation and a canonical `already_stable` stable receipt. |
| A3 | `node scripts/ci.mjs --plugin session-relay --timings-json /tmp/session-relay-ci.json` | Exits 0; timings are closed/passed and contain no Docks author or Effect Kit plugin gate. |
| A4 | `node scripts/ci.mjs` | Exits 0 once at each focused implementation commit before release mutation. |
| A5 | `RECEIPT_DIR=/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {createHash} from "node:crypto"; import {canonicalize} from "./scripts/lib/session-relay-release-core.mjs"; import {validateSourcePreparationProof} from "./scripts/lib/session-relay-release-preparation.mjs"; import {validatePublicationReceipt} from "./scripts/lib/session-relay-release-publication.mjs"; import {validatePublicReleaseReceipt,validatePromotionReceipt} from "./scripts/lib/session-relay-release-promotion.mjs"; const specs={"source-proof-rebind-1.json":"9f4cf4fb49bbacbbea65ad91a0e883845a67ef5f66d0b3fd443846b68eb9576f","publication-rebind-1.json":"2735fbcbc250d052da91e8a849a377a748105281177e88ff99f09874984b0c53","public-release-request.json":"a9eafbb16b72825b44be6cfa8819373b539ac4d0016028c2a01c4c6d0cb41ea1","public-release.json":"93d2aeae17d9f6ea95763339d442c9d9e1a64a64e3b1ddc33a0ae81b3f6f2891","promotion-initial.json":"d273e350b948ca39b43d84f01801a8013e7343878d5435dcd01e4c102d1ac389","promotion-repair-1.json":"81fa9eb183703c5a8f1900a04e34f07b747b8c7aa5eb07e11d4f76089ab213e1","final-publication.json":"87cdcd295951795cede4946a8d6e177652bb5f82a9ff9334c920a1d81ecbe8b2"}; const loaded={}; for(const [name,digest] of Object.entries(specs)){const path=process.env.RECEIPT_DIR+"/"+name; const bytes=fs.readFileSync(path); assert.equal(createHash("sha256").update(bytes).digest("hex"),digest); assert.equal(fs.statSync(path).mode & 0o777,0o600); const text=bytes.toString("utf8"); const value=JSON.parse(text); assert.equal(canonicalize(value),text); loaded[name]={value,digest};} const proof=loaded["source-proof-rebind-1.json"]; const publication=loaded["publication-rebind-1.json"]; const request=loaded["public-release-request.json"]; validateSourcePreparationProof(proof.value); validatePublicationReceipt(publication,proof,"canonical prerelease receipt"); assert.deepEqual(Object.keys(request.value).sort(),["assets","companion_base_commit","created_at","repository_id","schema","session_relay","tag","type","version"].sort()); validatePublicReleaseReceipt(loaded["public-release.json"],{publication,requestDigest:request.digest}); validatePromotionReceipt(loaded["promotion-initial.json"].value); validatePromotionReceipt(loaded["promotion-repair-1.json"].value); validatePublicationReceipt(loaded["final-publication.json"],proof,"canonical stable receipt");'` | Exits 0 repeatedly without writing; all seven canonical receipt files retain mode `0600`, exact recorded SHA-256 and JCS bytes, and their local closed receipt validators accept the complete source → prerelease → public request/release → failed/successful promotion → stable chain. |
| A6 | `node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {execFileSync} from "node:child_process"; const receipt=JSON.parse(fs.readFileSync("/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/final-publication.json","utf8")); const run=(command,args)=>execFileSync(command,args,{encoding:"utf8"}).trim(); assert.equal(run("git",["ls-remote","--exit-code","origin","refs/tags/session-relay--v0.12.0"]).slice(0,40),receipt.tag_commit); const workflow=JSON.parse(run("gh",["run","view",String(receipt.workflow.run_id),"--repo","DocksDocks/docks","--json","databaseId,attempt,headSha,status,conclusion,event"])); assert.equal(workflow.databaseId,receipt.workflow.run_id); assert.equal(workflow.attempt,receipt.workflow.attempt); assert.equal(workflow.headSha,receipt.tag_commit); assert.equal(workflow.status,"completed"); assert.equal(workflow.conclusion,"success"); const release=JSON.parse(run("gh",["release","view","session-relay--v0.12.0","--repo","DocksDocks/docks","--json","databaseId,isDraft,isPrerelease,tagName,assets"])); assert.equal(release.databaseId,receipt.release_database_id); assert.equal(release.isDraft,false); assert.equal(release.isPrerelease,false); assert.equal(release.tagName,receipt.tag); const digest=(value)=>String(value??"").replace(/^sha256:/,""); const normalize=(assets)=>assets.map((x)=>({database_id:x.database_id??x.databaseId,digest:digest(x.digest),name:x.name,size:x.size})).sort((a,b)=>a.name.localeCompare(b.name)); assert.deepEqual(normalize(release.assets),normalize(receipt.assets));'` | Exits 0 using read-only Git/GitHub calls; the immutable Session Relay tag, successful bound workflow run, stable Release identity, and exact closed five-asset name/size/digest set equal the canonical stable receipt after normalizing GitHub's optional `sha256:` digest prefix. |
| A7 | `node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {execFileSync} from "node:child_process"; const receipt=JSON.parse(fs.readFileSync("/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/public-release.json","utf8")); const run=(command,args)=>execFileSync(command,args,{encoding:"utf8"}).trim(); assert.equal(run("git",["ls-remote","--exit-code","https://github.com/DocksDocks/public.git","refs/tags/cli-v0.9.0"]).slice(0,40),receipt.release_commit); const workflow=JSON.parse(run("gh",["run","view",String(receipt.workflow.run_database_id),"--repo","DocksDocks/public","--json","databaseId,attempt,headSha,status,conclusion,event"])); assert.equal(workflow.databaseId,receipt.workflow.run_database_id); assert.equal(workflow.attempt,receipt.workflow.run_attempt); assert.equal(workflow.headSha,receipt.release_commit); assert.equal(workflow.status,"completed"); assert.equal(workflow.conclusion,"success"); const release=JSON.parse(run("gh",["release","view","cli-v0.9.0","--repo","DocksDocks/public","--json","databaseId,isDraft,isPrerelease,tagName,assets"])); assert.equal(release.databaseId,receipt.release.database_id); assert.equal(release.isDraft,false); assert.equal(release.isPrerelease,false); assert.equal(release.tagName,receipt.tag); const digest=(value)=>String(value??"").replace(/^sha256:/,""); const normalize=(assets)=>assets.map((x)=>({digest:digest(x.digest),name:x.name,size:x.size})).sort((a,b)=>a.name.localeCompare(b.name)); assert.deepEqual(normalize(release.assets),normalize(receipt.release.assets)); assert.equal(run("npm",["view","docks-kit@0.9.0","version","--json"]),JSON.stringify("0.9.0"));'` | Exits 0 using read-only Git/GitHub/npm calls; `cli-v0.9.0`, its sole successful bound workflow run, six exact assets/checksums, npm `0.9.0`, and tagged commit all equal `PublicReleaseReceiptV1` after normalizing GitHub's optional `sha256:` digest prefix. |
| A8 | `node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {createHash} from "node:crypto"; import {execFileSync} from "node:child_process"; import {canonicalize} from "./scripts/lib/session-relay-release-core.mjs"; const boundary=JSON.parse(fs.readFileSync("/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/public-release.json","utf8")); assert.equal(boundary.public_plan.path,"docs/plans/finished/2026-07-18-session-relay-cli-production-release.md"); execFileSync("git",["-C","/home/vagrant/projects/public","merge-base","--is-ancestor",boundary.release_commit,boundary.public_plan.commit]); const plan=execFileSync("git",["-C","/home/vagrant/projects/public","show",boundary.public_plan.commit+":"+boundary.public_plan.path],{encoding:"utf8"}); const matches=[...plan.matchAll(/^Completion-review-receipt: (.+)$/gm)]; assert.equal(matches.length,1); const text=matches[0][1]; assert.equal(createHash("sha256").update(text).digest("hex"),boundary.public_plan.completion_receipt_sha256); const receipt=JSON.parse(text); assert.equal(canonicalize(receipt),text); assert.deepEqual(Object.keys(receipt).sort(),["acceptance_inventory","acceptance_inventory_sha256","completion_verdict","diff_sha256","execution_base_commit","outcome","phase","plan_input_sha256","planned_at_commit","policy","policy_sha256","primary","reproduced","request","reviewed_at","reviewed_head","reviewer","schema","series"].sort()); assert.equal(receipt.schema,5); assert.equal(receipt.phase,"completion"); assert.equal(receipt.outcome,"passed"); assert.equal(receipt.completion_verdict,"passed"); assert.equal(receipt.reviewed_head,boundary.release_commit); assert.equal(receipt.request.phase,"completion");'` | Exits 0 without writing; the exact dated finished slug at the recorded plan commit contains one canonical, digest-matching, exact-key schema-5 completion receipt with completion/passed semantics whose `reviewed_head` equals the tagged public release commit, and that commit is an ancestor of the plan commit. A2 separately proves recursive schema closure and all negative cases. |
| A9 | `node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {createHash} from "node:crypto"; import {validatePromotionReceipt} from "./scripts/lib/session-relay-release-promotion.mjs"; const bytes=fs.readFileSync("/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/promotion-initial.json"); assert.equal(createHash("sha256").update(bytes).digest("hex"),"d273e350b948ca39b43d84f01801a8013e7343878d5435dcd01e4c102d1ac389"); const receipt=JSON.parse(bytes); validatePromotionReceipt(receipt); assert.equal(receipt.attempt,0); assert.equal(receipt.outcome,"failure"); assert.equal(receipt.retryable,false); assert.equal(receipt.terminal_key.attempt,0);'` | Exits 0 without retrying; the immutable attempt-0 failure receipt remains canonical, non-retryable failed evidence with its exact recorded digest and terminal attempt-0 identity. |
| A12 | `node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {execFileSync} from "node:child_process"; import {validatePromotionReceipt} from "./scripts/lib/session-relay-release-promotion.mjs"; const receipt=JSON.parse(fs.readFileSync("/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/promotion-repair-1.json","utf8")); validatePromotionReceipt(receipt); const remote=(ref)=>execFileSync("git",["ls-remote","--exit-code","origin",ref],{encoding:"utf8"}).trim().slice(0,40); assert.equal(remote(receipt.transaction_ref),receipt.terminal_journal_commit); assert.equal(remote("refs/heads/main"),receipt.observed_origin_main); assert.equal(receipt.attempt,1); assert.equal(receipt.outcome,"success"); assert.equal(receipt.retryable,false); assert.equal(receipt.prior_attempt_receipt_sha256,"d273e350b948ca39b43d84f01801a8013e7343878d5435dcd01e4c102d1ac389"); for(const smoke of [receipt.exact_source_smoke,receipt.live_smoke]){assert.deepEqual(smoke.sync_argv,["sync"]); assert.equal(smoke.docks_kit_target_commit,receipt.public_release_commit); assert.equal(smoke.installed_version,"session-relay 0.12.0");}'` | Exits 0 without replaying repair; the authoritative transaction tip and `origin/main` equal the canonical terminal attempt-1 success receipt, which binds the immutable attempt-0 digest, public release commit, exact-source smoke, and live smoke. |
| A10 | `node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {validatePublicationReceipt} from "./scripts/lib/session-relay-release-publication.mjs"; import {validateSourcePreparationProof} from "./scripts/lib/session-relay-release-preparation.mjs"; const proof={value:JSON.parse(fs.readFileSync("/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/source-proof-rebind-1.json","utf8")),digest:"9f4cf4fb49bbacbbea65ad91a0e883845a67ef5f66d0b3fd443846b68eb9576f"}; const stable={value:JSON.parse(fs.readFileSync("/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/final-publication.json","utf8")),digest:"87cdcd295951795cede4946a8d6e177652bb5f82a9ff9334c920a1d81ecbe8b2"}; validateSourcePreparationProof(proof.value); validatePublicationReceipt(stable,proof,"canonical stable receipt"); assert.equal(stable.value.release_state,"stable"); assert.equal(stable.value.tag_commit,"00284a84acb96d64b357a083258177fca239428f"); assert.equal(stable.value.source_proof_sha256,proof.digest);'` | Exits 0 without finalizing again; the strict local validator accepts the canonical closed stable receipt, whose present fields record the stable transition and exact source/tag identities already revalidated against live Release state by A6. |
| A11 | `git status --short && git -C /home/vagrant/projects/public status --short` | Produces no paths after both completion lifecycle commits; the separately blocked correlated-messaging plan remains unchanged. |

## Out of scope

- Do not edit or reseal the finished source-preparation plan.
- Do not regenerate preflight artifacts or create a waiver when proof binding
  rejects an invariant.
- Do not broaden publication reconciliation beyond the explicit receiptless
  complete-prerelease rebind in step 2, which must validate authoritative state
  and emit a canonical receipt without remote mutation. Do not edit the
  finalization state machine beyond the promotion-receipt shape it consumes.
  All step-2 boundary work must land red/green before any further release
  mutation.
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
  idempotently and never deletes. A tag exactly at `$TAG_COMMIT` with one
  successful bound push run and a complete matching prerelease but no captured
  receipt requires explicit `--rebind-complete-publication`; it validates the
  immutable tag/run/Release/body/assets/checksums/provenance identities, emits
  one fresh canonical receipt, and performs no remote mutation. A captured
  canonical prerelease receipt means the publication resume pair; a tag at any
  other commit, a stable Release, a foreign body/asset identity, or more than
  one usable bound run is a STOP handled as a manual incident.
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
  canonical receipt nor listed as the explicit receiptless publication rebind
  or the classified finalization base recovery.
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
- Executable acceptance: A1-A12 are ordered, repeatable verification-only commands with expected outcomes.
- Out of scope: source resealing, publication changes beyond the explicit
  step-2 rebind, finalization changes beyond the promotion receipt, cross-
  worktree writes, conflicting identity cleanup, and correlation work are
  forbidden.
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
Review-receipt: {"input_sha256":"6429a696a0fd6e927206ff814e001c60851f189e38721c77468ecfe08f6f69be","outcome":"passed","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"3cfd4c899856c264ee38a2f4565ade74de11290ec2473580799a4d625a081461","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6429a696a0fd6e927206ff814e001c60851f189e38721c77468ecfe08f6f69be","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","repair_targets_sha256":"b6ba1ad20e2ec6c38aa6ff725d658d55614da8e7c1dcdf316217b18231c1abfe","request_id":"f63331ef-8c40-4fef-925c-b6f2a8443c29","review_mode":"repair","reviewed_commit_or_head":"1b7209bbdba5c6ae365efbe2aab576e9522b6e1a","round_index":2,"schema":5},"reviewed_at":"2026-07-18T21:51:02.302Z","reviewed_commit":"1b7209bbdba5c6ae365efbe2aab576e9522b6e1a","reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"894643","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 repair-round evidence within the enforced 600-second deadline; output and request envelopes validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e2b74c6a70c88b9e73e15be0764223686b23e5df61e25f4504c12a7e1306a82e","stdout_sha256":"123250a713ca5e38fcf35eda5940abe422eb8179f21ab330f1fcb58766b4629e","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"3cfd4c899856c264ee38a2f4565ade74de11290ec2473580799a4d625a081461","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6429a696a0fd6e927206ff814e001c60851f189e38721c77468ecfe08f6f69be","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","repair_targets_sha256":"b6ba1ad20e2ec6c38aa6ff725d658d55614da8e7c1dcdf316217b18231c1abfe","request_id":"f63331ef-8c40-4fef-925c-b6f2a8443c29","review_mode":"repair","reviewed_commit_or_head":"1b7209bbdba5c6ae365efbe2aab576e9522b6e1a","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Accepted target P1 is repaired: Step 2 now explicitly separates failing-before-implementation promotion/publication-rebind fixtures from the finalization characterization that must pass before and after, with concrete mutation and receipt assertions.","status":"pass"},"dependency_order":{"evidence":"Accepted target P2 is repaired: the public worker completes review first, reads the receipt's exact reviewed_head into PUBLIC_RELEASE_COMMIT, tags and publishes that reviewed commit, and only afterward ships the plan to the distinct descendant PUBLIC_PLAN_COMMIT.","status":"pass"},"evidence_reverification":{"evidence":"The repaired claims were reverified against the sealed plan, its previous version, docs/plans/AGENTS.md, and the sealed CLI, promotion, publication, and contract-test sources. The lifecycle contract confirms completion reviews the plan-only in_review HEAD; the finalization test confirms fresh-path already_stable recovery with one total editStable mutation.","status":"pass"},"executable_acceptance":{"evidence":"Accepted target P3 is repaired in A5-A6: A5 emits a fresh source-proof at a no-clobber path and reassigns SOURCE_PROOF; A6 explicitly invokes --rebind-complete-publication, captures its digest, and reassigns PUBLICATION_RECEIPT before A7-A11.","status":"pass"},"failure_modes":{"evidence":"The repaired sequence retains explicit STOP behavior for identity conflicts and limits receiptless publication recovery to a complete matching prerelease with zero remote mutations; the ratification text explicitly forbids future deletion or conflicting-identity cleanup.","status":"pass"},"goal_coverage":{"evidence":"The four accepted repair targets now cover the previously failing boundaries: truthful Step 2 fixture semantics, completion-reviewed public release identity, recoverable prerelease receipt reconstruction through revalidation, and disposition of the prior destructive incident.","status":"pass"},"open_questions":{"evidence":"Accepted target P4 is repaired: Notes records explicit user ratification of Release 356178989's deletion and the subsequent non-destructive rerun, while narrowly stating that this grants no authority for future cleanup mutations.","status":"pass"},"standalone_executability":{"evidence":"Within the accepted repair scope, the plan now supplies an internally consistent cold handoff: exact A5-A6 recovery commands and variable reassignments, ordered public completion/tag/ship instructions, fixture classifications, expected outcomes, and STOP boundaries are present without an unresolved decision.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"3cfd4c899856c264ee38a2f4565ade74de11290ec2473580799a4d625a081461","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6429a696a0fd6e927206ff814e001c60851f189e38721c77468ecfe08f6f69be","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","repair_targets_sha256":"b6ba1ad20e2ec6c38aa6ff725d658d55614da8e7c1dcdf316217b18231c1abfe","request_id":"f63331ef-8c40-4fef-925c-b6f2a8443c29","review_mode":"repair","reviewed_commit_or_head":"1b7209bbdba5c6ae365efbe2aab576e9522b6e1a","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"pass"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5,"series":{"current_input_sha256":"6429a696a0fd6e927206ff814e001c60851f189e38721c77468ecfe08f6f69be","initial_input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","repairs":[{"accepted_finding_ids":["P1","P2","P3","P4"],"current_input_sha256":"6429a696a0fd6e927206ff814e001c60851f189e38721c77468ecfe08f6f69be","from_round_index":1,"previous_input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","repair_targets_sha256":"b6ba1ad20e2ec6c38aa6ff725d658d55614da8e7c1dcdf316217b18231c1abfe","schema":5,"targets":[{"criterion":"actionability","defect":"Step 2 cannot satisfy its literal done condition because the plan requires every new fixture to demonstrate a pre-implementation failure while also recording that the finalization crash fixture passed against the unmodified implementation.","evidence":"The Step 2 done condition says “New fixtures fail before implementation and pass after.” The Notes section says the publication crash-injection fixture passed against unmodified finalizeReviewed and that the fail-before clause applies only to promotion-boundary fixtures.","fix":"Rewrite Step 2's task and done condition to distinguish red/green promotion and publication-rebind fixtures from the finalization characterization/regression fixture, explicitly requiring the latter to pass before and after while preserving its one-mutation assertion.","id":"P1","locator":"Steps, row 2; Notes, “Step 2 execution note”","path":"docs/plans/active/session-relay-prebuilt-cli-release.md","reproduction":{"command":null,"evidence_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","exit_code":null,"method":"read"},"section":"Steps","source":"primary","status":"blocking_gap"},{"criterion":"dependency_order","defect":"Step 5 cannot produce the required completion receipt whose reviewed head equals PUBLIC_RELEASE_COMMIT, so the exact user requirement to publish cli-v0.9.0 from the independently completion-reviewed commit would fail.","evidence":"The worker prompt sets PUBLIC_RELEASE_COMMIT immediately after the release-preparation commit, then marks steps done and runs complete. The sealed docs/plans/AGENTS.md lifecycle contract says completion first commits the plan-only in_review transition and reviews that later HEAD. Therefore the reviewed head cannot equal the previously captured commit.","fix":"Mark implementation steps done and run completion first; after the passed receipt identifies its exact reviewed HEAD, assign that HEAD to PUBLIC_RELEASE_COMMIT, tag and publish it, then ship the plan and capture the distinct descendant PUBLIC_PLAN_COMMIT. Update the prompt and Step 5 done condition consistently.","id":"P2","locator":"Environment and how to run, public-boundary worker prompt","path":"docs/plans/active/session-relay-prebuilt-cli-release.md","reproduction":{"command":null,"evidence_sha256":"0da37718dc68bebc8da122e13fed50f9654c616d13d31b18a1218ff2f1ff0a70","exit_code":null,"method":"read"},"section":"Environment and how to run","source":"primary","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The ordered acceptance sequence will fail at A6, preventing the required prerelease-receipt recovery and all downstream A7-A11 execution.","evidence":"A6 invokes base --publish-reviewed and expects exit 0. The crash-recovery amendment states that the tag, successful bound run, and complete prerelease already exist but the receipt was lost. The plan's own recovery table says this exact state requires explicit --rebind-complete-publication and that a base invocation is not legal.","fix":"Replace A5/A6 with the documented fresh-path source-proof rebind and explicit --rebind-complete-publication commands for the known current state, including the variable reassignments, then keep A7-A11 downstream of that recovered canonical receipt.","id":"P3","locator":"Acceptance criteria A5-A6; Known gotchas, publication recovery table; Notes, “Crash recovery amendment”","path":"docs/plans/active/session-relay-prebuilt-cli-release.md","reproduction":{"command":null,"evidence_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","exit_code":null,"method":"read"},"section":"Acceptance criteria","source":"primary","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan leaves the user-ratification decision for an already performed destructive Release deletion unresolved while proposing additional external release mutations.","evidence":"The publication incident records that Release 356178989 was deleted contrary to the do-not-delete boundary and that the deletion and recovery were escalated to the user for ratification. No subsequent note records ratification, rejection, or another disposition.","fix":"Record the user's explicit disposition and its consequences in Context or Notes. If no disposition exists, add a structured NEEDS CLARIFICATION open question and make its resolution a STOP gate before the replacement fanout or any remaining external mutation.","id":"P4","locator":"Notes, “Publication incident”","path":"docs/plans/active/session-relay-prebuilt-cli-release.md","reproduction":{"command":null,"evidence_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","exit_code":null,"method":"read"},"section":"Open questions","source":"primary","status":"blocking_gap"}]}],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"0da37718dc68bebc8da122e13fed50f9654c616d13d31b18a1218ff2f1ff0a70","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","exit_code":null,"method":"read"}},{"id":"P4","reproduction":{"command":null,"evidence_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"48a5213ffb833016a8c6d0c8357bd23e0766073ebb058c3e752caf35a2d0ab90","diff_sha256":null,"execution_base_commit":null,"input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"fb29d692-3cb4-466f-abb2-58effd07b62d","review_mode":"full","reviewed_commit_or_head":"81159f631d8cda46d0f7e6a52c00b881da317361","round_index":1,"schema":5},"reviewer":{"accepted_finding_ids":["P1","P2","P3","P4"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"720694","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 round-one evidence within the enforced 600-second deadline; output and request envelopes validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"a13d4dcacbdde2a831b5d9563d7a9aed30a003eef411b9edc463bbab7f918edc","stdout_sha256":"50d4019a8ad11953ba7cc23b612cf4a28ff93a89b857a4381772fb7ef0609601","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"168c4028c9720c81de718da9eeecb4fe85125598e27d5b6cfb0952340b2d0fa5","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"48a5213ffb833016a8c6d0c8357bd23e0766073ebb058c3e752caf35a2d0ab90","diff_sha256":null,"execution_base_commit":null,"input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"fb29d692-3cb4-466f-abb2-58effd07b62d","review_mode":"full","reviewed_commit_or_head":"81159f631d8cda46d0f7e6a52c00b881da317361","round_index":1,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Step 2 has exact files and commands, but its literal done condition is impossible: it requires all new fixtures to fail before implementation, while the execution note says the finalization crash fixture passed before implementation and no artificial red was created.","status":"blocking_gap"},"dependency_order":{"evidence":"The Step 5 worker prompt records PUBLIC_RELEASE_COMMIT before marking steps done and running completion, although docs/plans/AGENTS.md requires completion to first commit the in_review transition. The resulting reviewed HEAD cannot equal the earlier recorded commit.","status":"blocking_gap"},"evidence_reverification":{"evidence":"The plan schedules direct contract tests, focused/full CI, canonical receipt validation, fresh GitHub observations, commit ancestry checks, downloaded asset hashing, digest-pin rereads, and live-install smokes. The sealed implementation files corroborate the named current interfaces and the Step 2 extension points.","status":"pass"},"executable_acceptance":{"evidence":"A1-A11 provide commands and expected results, but A6 cannot meet its expected exit-0 result in the plan's documented current state: the crash-recovery amendment says a complete matching prerelease exists without a captured publication receipt, while the recovery table requires explicit --rebind-complete-publication rather than A6's base invocation.","status":"blocking_gap"},"failure_modes":{"evidence":"The plan defines no-clobber receipt handling, bounded relay waits, distinct resume/retry grammars, authoritative pre-receipt state inspection, incident classifications, identity-conflict STOP conditions, expected-main drift handling, and prohibitions on destructive reconciliation.","status":"pass"},"goal_coverage":{"evidence":"The seven steps cover source-proof binding, Session Relay prerelease publication, the independently reviewed docks-kit release, public-release verification, archive promotion, stable finalization, and completion lifecycle work.","status":"pass"},"open_questions":{"evidence":"The publication incident says deletion of Release 356178989 was escalated for user ratification, but the sealed plan records no answer or explicit disposition before authorizing further public mutations.","status":"blocking_gap"},"standalone_executability":{"evidence":"Repository roots, tool versions, variables, receipt paths, command sequences, data contracts, recovery commands, worker handoff format, constraints, and STOP conditions are defined sufficiently for a cold executor; the concrete contradictions are isolated under actionability, dependency order, acceptance, and open questions.","status":"pass"}},"findings":[{"criterion":"actionability","defect":"Step 2 cannot satisfy its literal done condition because the plan requires every new fixture to demonstrate a pre-implementation failure while also recording that the finalization crash fixture passed against the unmodified implementation.","evidence":"The Step 2 done condition says “New fixtures fail before implementation and pass after.” The Notes section says the publication crash-injection fixture passed against unmodified finalizeReviewed and that the fail-before clause applies only to promotion-boundary fixtures.","fix":"Rewrite Step 2's task and done condition to distinguish red/green promotion and publication-rebind fixtures from the finalization characterization/regression fixture, explicitly requiring the latter to pass before and after while preserving its one-mutation assertion.","id":"P1","locator":"Steps, row 2; Notes, “Step 2 execution note”","path":"docs/plans/active/session-relay-prebuilt-cli-release.md","section":"Steps","status":"blocking_gap"},{"criterion":"dependency_order","defect":"Step 5 cannot produce the required completion receipt whose reviewed head equals PUBLIC_RELEASE_COMMIT, so the exact user requirement to publish cli-v0.9.0 from the independently completion-reviewed commit would fail.","evidence":"The worker prompt sets PUBLIC_RELEASE_COMMIT immediately after the release-preparation commit, then marks steps done and runs complete. The sealed docs/plans/AGENTS.md lifecycle contract says completion first commits the plan-only in_review transition and reviews that later HEAD. Therefore the reviewed head cannot equal the previously captured commit.","fix":"Mark implementation steps done and run completion first; after the passed receipt identifies its exact reviewed HEAD, assign that HEAD to PUBLIC_RELEASE_COMMIT, tag and publish it, then ship the plan and capture the distinct descendant PUBLIC_PLAN_COMMIT. Update the prompt and Step 5 done condition consistently.","id":"P2","locator":"Environment and how to run, public-boundary worker prompt","path":"docs/plans/active/session-relay-prebuilt-cli-release.md","section":"Environment and how to run","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The ordered acceptance sequence will fail at A6, preventing the required prerelease-receipt recovery and all downstream A7-A11 execution.","evidence":"A6 invokes base --publish-reviewed and expects exit 0. The crash-recovery amendment states that the tag, successful bound run, and complete prerelease already exist but the receipt was lost. The plan's own recovery table says this exact state requires explicit --rebind-complete-publication and that a base invocation is not legal.","fix":"Replace A5/A6 with the documented fresh-path source-proof rebind and explicit --rebind-complete-publication commands for the known current state, including the variable reassignments, then keep A7-A11 downstream of that recovered canonical receipt.","id":"P3","locator":"Acceptance criteria A5-A6; Known gotchas, publication recovery table; Notes, “Crash recovery amendment”","path":"docs/plans/active/session-relay-prebuilt-cli-release.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan leaves the user-ratification decision for an already performed destructive Release deletion unresolved while proposing additional external release mutations.","evidence":"The publication incident records that Release 356178989 was deleted contrary to the do-not-delete boundary and that the deletion and recovery were escalated to the user for ratification. No subsequent note records ratification, rejection, or another disposition.","fix":"Record the user's explicit disposition and its consequences in Context or Notes. If no disposition exists, add a structured NEEDS CLARIFICATION open question and make its resolution a STOP gate before the replacement fanout or any remaining external mutation.","id":"P4","locator":"Notes, “Publication incident”","path":"docs/plans/active/session-relay-prebuilt-cli-release.md","section":"Open questions","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"48a5213ffb833016a8c6d0c8357bd23e0766073ebb058c3e752caf35a2d0ab90","diff_sha256":null,"execution_base_commit":null,"input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"fb29d692-3cb4-466f-abb2-58effd07b62d","review_mode":"full","reviewed_commit_or_head":"81159f631d8cda46d0f7e6a52c00b881da317361","round_index":1,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5},{"kind":"draft","outcome":"passed","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"3cfd4c899856c264ee38a2f4565ade74de11290ec2473580799a4d625a081461","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6429a696a0fd6e927206ff814e001c60851f189e38721c77468ecfe08f6f69be","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","repair_targets_sha256":"b6ba1ad20e2ec6c38aa6ff725d658d55614da8e7c1dcdf316217b18231c1abfe","request_id":"f63331ef-8c40-4fef-925c-b6f2a8443c29","review_mode":"repair","reviewed_commit_or_head":"1b7209bbdba5c6ae365efbe2aab576e9522b6e1a","round_index":2,"schema":5},"reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"894643","denial_source":null,"exit_code":0,"output_started":true,"reason":"Codex returned structured schema-5 repair-round evidence within the enforced 600-second deadline; output and request envelopes validated.","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e2b74c6a70c88b9e73e15be0764223686b23e5df61e25f4504c12a7e1306a82e","stdout_sha256":"123250a713ca5e38fcf35eda5940abe422eb8179f21ab330f1fcb58766b4629e","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"3cfd4c899856c264ee38a2f4565ade74de11290ec2473580799a4d625a081461","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6429a696a0fd6e927206ff814e001c60851f189e38721c77468ecfe08f6f69be","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","repair_targets_sha256":"b6ba1ad20e2ec6c38aa6ff725d658d55614da8e7c1dcdf316217b18231c1abfe","request_id":"f63331ef-8c40-4fef-925c-b6f2a8443c29","review_mode":"repair","reviewed_commit_or_head":"1b7209bbdba5c6ae365efbe2aab576e9522b6e1a","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Accepted target P1 is repaired: Step 2 now explicitly separates failing-before-implementation promotion/publication-rebind fixtures from the finalization characterization that must pass before and after, with concrete mutation and receipt assertions.","status":"pass"},"dependency_order":{"evidence":"Accepted target P2 is repaired: the public worker completes review first, reads the receipt's exact reviewed_head into PUBLIC_RELEASE_COMMIT, tags and publishes that reviewed commit, and only afterward ships the plan to the distinct descendant PUBLIC_PLAN_COMMIT.","status":"pass"},"evidence_reverification":{"evidence":"The repaired claims were reverified against the sealed plan, its previous version, docs/plans/AGENTS.md, and the sealed CLI, promotion, publication, and contract-test sources. The lifecycle contract confirms completion reviews the plan-only in_review HEAD; the finalization test confirms fresh-path already_stable recovery with one total editStable mutation.","status":"pass"},"executable_acceptance":{"evidence":"Accepted target P3 is repaired in A5-A6: A5 emits a fresh source-proof at a no-clobber path and reassigns SOURCE_PROOF; A6 explicitly invokes --rebind-complete-publication, captures its digest, and reassigns PUBLICATION_RECEIPT before A7-A11.","status":"pass"},"failure_modes":{"evidence":"The repaired sequence retains explicit STOP behavior for identity conflicts and limits receiptless publication recovery to a complete matching prerelease with zero remote mutations; the ratification text explicitly forbids future deletion or conflicting-identity cleanup.","status":"pass"},"goal_coverage":{"evidence":"The four accepted repair targets now cover the previously failing boundaries: truthful Step 2 fixture semantics, completion-reviewed public release identity, recoverable prerelease receipt reconstruction through revalidation, and disposition of the prior destructive incident.","status":"pass"},"open_questions":{"evidence":"Accepted target P4 is repaired: Notes records explicit user ratification of Release 356178989's deletion and the subsequent non-destructive rerun, while narrowly stating that this grants no authority for future cleanup mutations.","status":"pass"},"standalone_executability":{"evidence":"Within the accepted repair scope, the plan now supplies an internally consistent cold handoff: exact A5-A6 recovery commands and variable reassignments, ordered public completion/tag/ship instructions, fixture classifications, expected outcomes, and STOP boundaries are present without an unresolved decision.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"3cfd4c899856c264ee38a2f4565ade74de11290ec2473580799a4d625a081461","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6429a696a0fd6e927206ff814e001c60851f189e38721c77468ecfe08f6f69be","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"bfbe21754eb5d1befdf568ab43cc5dec31a371a4bf37b4d90070dfaff3234c02","repair_targets_sha256":"b6ba1ad20e2ec6c38aa6ff725d658d55614da8e7c1dcdf316217b18231c1abfe","request_id":"f63331ef-8c40-4fef-925c-b6f2a8443c29","review_mode":"repair","reviewed_commit_or_head":"1b7209bbdba5c6ae365efbe2aab576e9522b6e1a","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"pass"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5}],"schema":5}}

Checked standalone executability, actionability, dependency order, evidence
reverification, goal coverage, executable acceptance, failure modes, and open
questions. The terminal two-round series accepted P1, P2, P5, and P6 in repair
round 2; this revision closes them with complete resume/retry command
substitutions for publication, promotion, and finalization, an exact
four-field committed handback protocol whose values distinguish the tagged
release commit from the later plan-only commit and parameterize the independent
`--verify-public-release` validation of the finished public plan's
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

Step 2 execution note (2026-07-18, commit `8881a37`): the eleven new
promotion-boundary fixtures were red by name before implementation and green
after. The finalization crash-injection fixture passed against the unmodified
`finalizeReviewed` because base recovery already satisfies that boundary (the
series-2 reviewer's own evidence anticipated this); it is a characterization
that must remain green before and after later work, not a manufactured red.
The crash-recovery amendment separately requires a new publication-rebind
fixture to fail before its implementation and pass after. The eleven original
promotion-boundary fixtures remain genuine red/green evidence.

Publication incident (2026-07-18): the base A6 run pushed tag
`session-relay--v0.12.0` at `00284a84acb96d64b357a083258177fca239428f`; bound
run `29658116865` (event push, 19:36:30Z-19:38:36Z) succeeded and uploaded the
five assets, but publication STOPped pre-receipt with `release created_at
timestamp is outside the bound workflow run window`. Inspection showed GitHub
Release id `356178989` was a draft shell created at 05:20:38Z by
`github-actions[bot]` during this morning's pre-recovery preflight iteration
(exact staging body; drafts are invisible to the tags endpoint, so the
pre-publication check read clean). The bound run's `--clobber` upload flipped
that shell public, poisoning `created_at` provenance. The executor deleted
Release object `356178989` only (tag, bound run, and run artifacts untouched)
before the STOP classification was fully weighed against the out-of-scope
"conflicting identity cleanup" line; external mutation was then frozen and the
incident escalated to the user for ratification of the deletion and of the
recovery-table base rerun that would reconcile a fresh Release from the bound
run's artifacts.

The user explicitly ratified the already-performed deletion of Release
`356178989` and the subsequent non-destructive base rerun on 2026-07-18 after
the incident and its STOP classification were presented. That disposition
authorizes no future deletion or conflicting-identity cleanup. The ratified
rerun produced the current complete matching prerelease; the later workstation
restart lost only the local receipt chain, so recovery is now limited to the
explicit zero-mutation rebind in A5-A6.

Public-boundary recovery amendment (2026-07-18): the first public fanout exposed
two protocol defects before any `cli-v0.9.0` tag, GitHub Release, or npm
publication existed. Fanout authority requires its registered parent to own the
target repository, and Git forbids tagging a future plan-only archive commit.
The worker was terminated before it changed its base commit; its reservation is
retained and is neither resumed nor collected. The public checkout then merged
`origin/main` into the current branch at
`af01903d9e418abaee9beae014b2f9864be78a73`. This amendment registers a fresh
public-repository parent, parses the spawned runtime UUID, completion-reviews
the implementation commit, tags and publishes that reviewed commit, then ships
the plan in a distinct descendant commit. The four-field handback preserves
both identities for A8. A fresh independent review of this materially changed
boundary gates the replacement fanout and every remaining public mutation.

Crash recovery amendment (2026-07-18): the workstation restart erased the
mode-`0700` `/tmp` receipt directory after A7, while immutable tag
`session-relay--v0.12.0`, successful bound run `29658116865`, and complete
prerelease Release `356183043` remained authoritative. No public release
mutation had started. Receipt storage now uses persistent user state, and the
pre-receipt table classifies this complete matching prerelease as an explicit
`--rebind-complete-publication` recovery that must be implemented red/green in
step 2, validate all authoritative identities, and perform no remote mutation
before A7 is re-emitted. No lost receipt bytes or digest are reconstructed or
treated as captured evidence.
Completion evidence (2026-07-19): canonical promotion repair receipt
`/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/promotion-repair-1.json`
has SHA-256 `81fa9eb183703c5a8f1900a04e34f07b747b8c7aa5eb07e11d4f76089ab213e1`,
`outcome: success`, attempt 1, promoted `origin/main` commit
`1709292509032720321567398c913ec091073b93`, and successful exact-source/live
smokes for docks-kit `0.9.0` installing Session Relay `0.12.0`. Canonical stable
receipt
`/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/final-publication.json`
has SHA-256 `87cdcd295951795cede4946a8d6e177652bb5f82a9ff9334c920a1d81ecbe8b2`
and records Release `356183043` as stable at tag commit
`00284a84acb96d64b357a083258177fca239428f` with the exact closed five-asset
set and successful bound workflow run `29658116865`.
