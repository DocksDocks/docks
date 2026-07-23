---
title: Publish Session Relay 0.13.0 and public companion
goal: Correct the legacy publication protocol, publish and verify both bound releases, promote Docks without rollback, finalize stable, and archive both reviewed plans.
status: planned
created: "2026-07-23T12:31:06-03:00"
updated: "2026-07-23T12:31:06-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [session-relay, release, publication, supply-chain]
affected_paths:
  - docs/plans/active/session-relay-linux-workspace-publication.md
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - /home/vagrant/projects/public/docs/plans/active/session-relay-cli-0.13.0-production-release.md
  - /home/vagrant/projects/public/SoT/toolchain.json
  - /home/vagrant/projects/public/cli/src/generated/sotPayload.ts
related_plans:
  - docs/plans/finished/2026-07-23-session-relay-linux-workspace-recertification.md
  - /home/vagrant/projects/public/docs/plans/active/session-relay-cli-0.13.0-release-preparation.md
  - /home/vagrant/projects/public/docs/plans/finished/2026-07-18-session-relay-cli-production-release.md
review_status: null
planned_at_commit: cdca867e6a140311ea865a81229fb30de1df32c1
execution_base_commit: null
---

# Publish Session Relay 0.13.0 and public companion

## Goal

Correct the legacy public-release identity in Docks before any tag, Release, branch, transaction-ref, or stable-state mutation. Then independently review and start this plan; preserve and bind the completed recertified source proof; publish exactly one five-asset Session Relay `0.13.0` prerelease; create, independently review, execute, completion-review, and archive the public `0.10.1` production child plan; verify its exact six-asset `cli-v0.10.1` release; promote the reviewed Docks implementation without rolling `origin/main` backward; finalize Session Relay stable; run live install, version, self-test, and workspace-boundary checks; completion-review and archive this plan.

Success matters because the recertified product source and public companion are ready, but the current release tooling still hard-codes the superseded public `0.9.0` identity and equates `promoted_commit` with the earlier shipped archive. Those guards correctly fail closed today; publication is forbidden until test-first protocol changes bind the actual `0.10.1` companion and the later publication implementation commit.

## Context & rationale

The completed source authority is `docs/plans/finished/2026-07-23-session-relay-linux-workspace-recertification.md` at archive commit `cdca867e6a140311ea865a81229fb30de1df32c1`. Its embedded candidate SHA-256 is `75e5bf5386a203cd81e3930ca2309ceed4e1a665d995848a29eb73a0fa5cb395`; its recertified product source/tag commit is `3fb9211f3309977f24853a10714d4b7a82b38c8f`; its immutable producer ref is `refs/heads/preflight/session-relay-0.13.0-3fb9211f3309`; producer run `30016169824` and source-CI run `30016063891` succeeded, with receipt digests `a9bd19d988285663b50e92a9ef4662dbada3fa078581cf63090a517448550ac4` and `8da93f817ceceb8b50d189b638afbe8d88041afaae4c7e4c375cb6f893933069`. The binder must derive the reviewed evidence commit from the embedded passed completion receipt; no copied evidence-commit value is authority.

The immutable public companion is repository `DocksDocks/public`, ref `refs/heads/preflight/session-relay-cli-0.13.0-6c07f9bc02ef`, commit `6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172`. Its blocked preparation plan is `docs/plans/active/session-relay-cli-0.13.0-release-preparation.md`, with exact reason `Awaiting the four independently hashed \`session-relay--v0.13.0\` production asset digests.`, plan input SHA-256 `818766be3668ad02bfce234cdb25e5d65bf0760bd7c7b2aea05fb8f075a99ed3`, draft-review receipt SHA-256 `097206c0611c3357e10c0bf69a70819ea67901ef1ae8c3ef1d9e8207520f7c52`, and public red receipt SHA-256 `833e777a509b44584f873628a65212fd92bd8a9305cd2f5f6699fc172738402c`. Public `origin/main` `6f9691cc19349ccd0ce81e8c8bf5cc573f76f3f1` is the companion commit's merge base and ancestor, so the child plan can continue from the immutable companion without discarding main.

The protocol mismatch is mandatory pre-publication work, not a documentation discrepancy. `scripts/lib/session-relay-release-promotion.mjs` currently fixes `PUBLIC_VERSION='0.9.0'`, `PUBLIC_TAG='cli-v0.9.0'`, companion base `c3b542220d5a24a98ca05383bbe28afc2319b7e2`, finished plan `2026-07-18-session-relay-cli-production-release.md`, and `DOCKS_KIT_RELEASE='cli-v0.9.0'`. The existing `cli-v0.9.0` tag commit is not descended from the new companion, while `SourcePreparationProofV1.public_reviewed_commit` is `6c07f9...`; current public verification and promotion must fail. Tests must first demonstrate that failure, then production code may be rebound to public package version `0.10.1`, tag/release `cli-v0.10.1`, companion `6c07f9...`, and the new child-plan slug.

`SourcePreparationProofV1` remains a closed schema with no field additions, removals, renames, defaults, or reserialization. Its meanings are refined: `tag_commit` remains the recertified product source `3fb9211...`; `shipped_commit` remains the finished recertification archive commit derived from Git history; `promoted_commit` is the later Docks publication implementation commit. This allows promotion to move or retain main at the exact reviewed publication implementation instead of rolling it back to the source archive.

## Environment & how-to-run

- Docks repository/worktree: `/home/vagrant/projects/docks-session-relay-0.13.0-release`, branch `release/session-relay-0.13.0-recertify`; creation base `cdca867e6a140311ea865a81229fb30de1df32c1`; creation-time `origin/main` observation `3368369cade6d89fd6ebf477cd0576646e992711`.
- Public repository/worktree: `/home/vagrant/projects/public`, repository id `DocksDocks/public`; immutable child base `6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172`; observed public main `6f9691cc19349ccd0ce81e8c8bf5cc573f76f3f1`.
- Runtimes: Node `24`, pnpm with frozen lockfile, Rust `1.85.0`; public Bun `1.3.14`, Vitest `3.2.7`, TypeScript `7.0.2`; authenticated GitHub CLI with required repository write permissions only when a mutation step is reached.
- Fixed release identities: Session Relay version/tag `0.13.0` / `session-relay--v0.13.0`; public package version/tag `0.10.1` / `cli-v0.10.1`; Docks remains `0.13.3` and Session Relay remains `0.13.0`.
- Before work, fetch read-only state and revalidate every fixed commit/ref/tag/Release/workflow observation. Never replace a fixed identity with ambient `HEAD`, a mutable branch, a copied digest, or “latest.”
- Create one fresh receipt directory and direct-child outputs:

```bash
set -euo pipefail
umask 077
RECEIPT_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/docks-release/session-relay-0.13.0"
install -d -m 700 "$RECEIPT_ROOT"
RECEIPT_DIR="$(mktemp -d "$RECEIPT_ROOT/publication.XXXXXX")"
RECEIPT_DIR="$(realpath -e -- "$RECEIPT_DIR")"
chmod 700 "$RECEIPT_DIR"
test "$(stat -Lc '%a' -- "$RECEIPT_DIR")" = 700
test "$(stat -Lc '%u' -- "$RECEIPT_DIR")" = "$(id -u)"
SOURCE_PROOF="$RECEIPT_DIR/source-proof.json"
PUBLICATION_RECEIPT="$RECEIPT_DIR/publication.json"
PUBLIC_REQUEST="$RECEIPT_DIR/public-request.json"
PUBLIC_RELEASE_RECEIPT="$RECEIPT_DIR/public-release.json"
PROMOTION_RECEIPT="$RECEIPT_DIR/promotion.json"
FINALIZATION_RECEIPT="$RECEIPT_DIR/finalization.json"
for output in "$SOURCE_PROOF" "$PUBLICATION_RECEIPT" "$PUBLIC_REQUEST" "$PUBLIC_RELEASE_RECEIPT" "$PROMOTION_RECEIPT" "$FINALIZATION_RECEIPT"; do test ! -e "$output"; done
```

Every release mode takes exactly one positional `0.13.0`, exact `--plugin session-relay`, and each receipt input is immediately followed by its paired `--*-sha256`. Every output is a nonexistent direct child of the owner-only directory and must be canonical RFC 8785 JCS, mode `0600`, nonempty, and have no trailing newline. Capture each printed lowercase 64-hex digest, compare it with `sha256sum`, and never parse/reserialize receipt bytes.

## Interfaces & data shapes

### Corrected source-proof semantics

Keep the existing exact `SourcePreparationProofV1` field set. The implementation must enforce:

```text
source_commit   = candidate.source_commit = 3fb9211f3309977f24853a10714d4b7a82b38c8f
tag_commit      = source_commit
evidence_commit = completion receipt reviewed_head, derived from the finished plan
shipped_commit  = commit that archived the exact finished recertification-plan bytes
promoted_commit = current clean Docks HEAD after the publication protocol implementation
public_reviewed_commit = 6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172
```

The binder verifies `source -> evidence -> shipped -> promoted == current HEAD` ancestry. `source_ancestry` and `non_plan_tree_equivalence` retain their closed shapes and existing source/evidence/shipped meanings. Offline proof validation permits `promoted_commit != shipped_commit` only when these producer-bound invariants hold; a hand-authored proof cannot opt into the relaxation.

The shipped-to-promoted changed-path set is closed and exact:

```text
docs/plans/active/session-relay-linux-workspace-publication.md
plugins/session-relay/test/release-evidence-contract.mjs
plugins/session-relay/test/release-promotion-contract.mjs
plugins/session-relay/test/release-publication-contract.mjs
scripts/lib/session-relay-release-preparation.mjs
scripts/lib/session-relay-release-promotion.mjs
```

Reject a missing or extra path, rename, stale/non-ancestor current head, dirty tree, mismatched constant, changed finished-plan bytes, changed source/evidence/shipped relationship, or proof whose `promoted_commit` differs from current HEAD. Plan-only lifecycle commits after the one final full gate are allowed only while all five implementation/test blobs are byte-identical to the gated implementation tree and the active plan remains the sole additional changed path.

### Public request and child-plan contract

`PublicReleaseRequestV1` stays closed and is emitted only from the successful exact Session Relay publication receipt. It must bind repository `DocksDocks/public`, version/tag `0.10.1` / `cli-v0.10.1`, companion base `6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172`, Session Relay tag/source identity, and four production asset digests independently read from the exact five-asset Session Relay prerelease.

Create exactly `docs/plans/active/session-relay-cli-0.13.0-production-release.md` in `/home/vagrant/projects/public` with `planned_at_commit` equal to the immutable companion commit. That child plan must be created by `plan-creator`, independently draft-reviewed and started by public `plan-manager`, and remain the public repository's sole authority for production edits and mutations. It must:

1. Validate the request bytes/hash and companion/main ancestry before editing.
2. Replace only Session Relay `verified`, `tag`, `plugin_version`, and the four request-authorized asset digest values in `SoT/toolchain.json`; regenerate `cli/src/generated/sotPayload.ts` from the source manifest.
3. Preserve byte-for-byte the frozen `cli/test/unit/sessionRelayCli.test.ts` and `cli/test/unit/pluginRefresh.test.ts` blobs bound by public red receipt `833e777...`; no test recapture is authorized.
4. Run the exact focused test command and the full public gate, prove the implementation diff is only the two production files plus the child plan, and completion-review before any tag.
5. Derive `PUBLIC_RELEASE_COMMIT` only from the passed completion receipt's exact `reviewed_head`; require it to descend from companion `6c07f9...`; create lightweight tag `cli-v0.10.1` once at that commit and push only that tag refspec.
6. Wait for exactly one matching successful `.github/workflows/release-cli.yml` push run with `head_sha == PUBLIC_RELEASE_COMMIT`; do not dispatch another run.
7. Verify the stable GitHub Release has exactly `SHA256SUMS`, `docks-kit-darwin-arm64`, `docks-kit-darwin-x64`, `docks-kit-linux-arm64`, `docks-kit-linux-x64`, and `docks-kit-windows-x64.exe`; download them; require every size/digest and all five checksum rows to match.
8. Read npm through a fresh mode-`0700` cache. Record `npm.state=published` only when `npm view docks-kit@0.10.1 version` returns `0.10.1`; record `oidc_warning` only when the unique successful workflow contains the protocol's exact trusted-publisher warning. Any other npm result is STOP.
9. Completion-review and archive to the unique date-prefixed `docs/plans/finished/<ship-date>-session-relay-cli-0.13.0-production-release.md`; return exact `PUBLIC_RELEASE_COMMIT`, later plan-archive commit, finished path, and SHA-256 of the exact completion receipt payload.

The existing blocked preparation plan remains read-only historical authority; do not rewrite it into a production-success claim. The child plan consumes its immutable tuple and supersedes its pending production action without altering its frozen evidence.

### Release receipt chain

Use the reviewed CLI grammar exactly:

```bash
SOURCE_PROOF_SHA256="$(node scripts/release.mjs --bind-completion --plugin session-relay 0.13.0 --finished-plan docs/plans/finished/2026-07-23-session-relay-linux-workspace-recertification.md --embedded-candidate-sha256 75e5bf5386a203cd81e3930ca2309ceed4e1a665d995848a29eb73a0fa5cb395 --receipt-out "$SOURCE_PROOF")"
PUBLICATION_SHA256="$(node scripts/release.mjs --publish-reviewed --plugin session-relay 0.13.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --receipt-out "$PUBLICATION_RECEIPT")"
PUBLIC_REQUEST_SHA256="$(node scripts/release.mjs --emit-public-request --plugin session-relay 0.13.0 --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --receipt-out "$PUBLIC_REQUEST")"
PUBLIC_RELEASE_SHA256="$(node scripts/release.mjs --verify-public-release --plugin session-relay 0.13.0 --request "$PUBLIC_REQUEST" --request-sha256 "$PUBLIC_REQUEST_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --public-finished-plan "$PUBLIC_FINISHED_PLAN" --public-release-commit "$PUBLIC_RELEASE_COMMIT" --public-plan-commit "$PUBLIC_PLAN_COMMIT" --public-completion-sha256 "$PUBLIC_COMPLETION_SHA256" --receipt-out "$PUBLIC_RELEASE_RECEIPT")"
PROMOTION_SHA256="$(node scripts/release.mjs --promote-reviewed --plugin session-relay 0.13.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --public-release "$PUBLIC_RELEASE_RECEIPT" --public-release-sha256 "$PUBLIC_RELEASE_SHA256" --docks-kit-release cli-v0.10.1 --expected-origin-main "$EXPECTED_ORIGIN_MAIN" --receipt-out "$PROMOTION_RECEIPT")"
FINALIZATION_SHA256="$(node scripts/release.mjs --finalize-reviewed --plugin session-relay 0.13.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --promotion "$PROMOTION_RECEIPT" --promotion-sha256 "$PROMOTION_SHA256" --receipt-out "$FINALIZATION_RECEIPT")"
```

`EXPECTED_ORIGIN_MAIN` is captured once immediately before proof binding and must equal `PUBLICATION_IMPLEMENTATION_COMMIT`, the clean Docks commit containing the corrected protocol and this active plan. It must remain unchanged through promotion. A different current or remote main is drift, not permission to recalculate the expected value.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Obtain one independent schema-6 draft review and start this plan through `plan-manager`. Re-fetch and revalidate all immutable Docks/public identities without mutation. | `docs/plans/active/session-relay-linux-workspace-publication.md` only for manager-owned review/start identity commits | — | planned | Draft review passes with no unauthorized waiver; plan becomes `ongoing` with exact `execution_base_commit`; recertification completion receipt/candidate, companion tuple/ancestry, tag/Release absence, versions, and legacy constants reverify. Any non-pass or drift is STOP. |
| 2 | Commit test-only contract changes that fail against the legacy public identity and `promoted_commit == shipped_commit` behavior; capture the intended red before production edits. | `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/session-relay/test/release-publication-contract.mjs`; `plugins/session-relay/test/release-promotion-contract.mjs` | 1 | planned | A1 fails only on assertions requiring `0.10.1`/`cli-v0.10.1`/`6c07f9...`/new child slug and producer-bound promoted-vs-shipped ancestry/path closure. Freeze the red test blobs; setup, parse, timeout, or unrelated failures STOP. |
| 3 | Implement the closed protocol correction and make focused contracts green. | `scripts/lib/session-relay-release-preparation.mjs`; `scripts/lib/session-relay-release-promotion.mjs` | 2 | planned | Public constants bind `0.10.1`, `cli-v0.10.1`, `6c07f9...`, and the new finished-plan slug; `bindCompletion` derives evidence/shipped identity, binds promoted to clean current HEAD, verifies exact ancestry/path allowlist, and keeps schema shapes closed; A2-A5 pass. |
| 4 | Run companion/hash checks and one final Docks full gate, seal the exact implementation commit, independently review it through the normal branch/PR path, and merge/push without force so Docks `origin/main` equals it. | The six-path shipped-to-promoted allowlist above | 3 | planned | A6-A9 pass; implementation/test blobs do not change after A8; `PUBLICATION_IMPLEMENTATION_COMMIT` is clean, descends from `cdca867...`, has exactly the allowlisted diff, and local/remote `origin/main` both equal it. Any review rejection, extra path, force requirement, or main drift is STOP. |
| 5 | Bind the completed recertification proof with corrected tooling and validate canonical bytes/hash/semantics offline. | `$SOURCE_PROOF` only; no tracked file | 4 | planned | A10-A11 pass; proof derives the passed completion evidence commit, retains source/tag `3fb9211...` and shipped archive, records `promoted_commit == PUBLICATION_IMPLEMENTATION_COMMIT == origin/main`, and binds the exact public companion. No remote mutation occurs. |
| 6 | Publish the reviewed Session Relay prerelease once and reconcile exact remote evidence. | External tag `session-relay--v0.13.0`; GitHub build-binaries run and prerelease; `$PUBLICATION_RECEIPT` | 5 | planned | A12-A13 pass; tag points to `3fb9211...`; exactly one successful bound build-binaries run produced four ordinary native assets plus `SHA256SUMS`; downloaded bytes, sizes, checksums, attestations, and provenance match the proof; Release remains prerelease. Follow only named publication recovery branches. |
| 7 | Emit the canonical public request, then create, independently review, and start the exact public child plan from the immutable companion commit. | `$PUBLIC_REQUEST`; `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-0.13.0-production-release.md` | 6 | planned | A14 passes; public `PlanCreatedV1.planned_at_commit == 6c07f9...`; its plan-only creation commit is based on that commit; public draft review passes and start identity is recorded before public implementation. Any companion/main ancestry or request drift is STOP. |
| 8 | Execute the public child plan: update only production Session Relay pins/payload, preserve frozen tests, run focused/full gates, completion-review, create the exact tag once, verify the one workflow/six-asset stable release/npm result, and archive the child. | `/home/vagrant/projects/public/SoT/toolchain.json`; `/home/vagrant/projects/public/cli/src/generated/sotPayload.ts`; child plan lifecycle/archive path | 7 | planned | A15-A18 pass in the public repo; tag `cli-v0.10.1` points to the completion-reviewed descendant of `6c07f9...`; exactly one successful release workflow and closed six-asset Release verify; npm result is canonical; child plan archives with passed completion receipt and exact handoff values. |
| 9 | Verify the completed public release from Docks and emit the canonical public-release receipt. | Public finished plan/read-only remote evidence; `$PUBLIC_RELEASE_RECEIPT` | 8 | planned | A19 passes; request/publication digests, companion ancestry, child release/plan commits, completion receipt, pin map, workflow, six assets/checksums, and npm state agree exactly. |
| 10 | Promote reviewed Docks through the transaction ref, immutable lock, pre-push proof, exact/live smokes, and expected-main compare-and-swap. | `refs/session-relay-release/transaction`; immutable lock/journal refs; Docks `origin/main`; `$PROMOTION_RECEIPT` | 9 | planned | A20-A21 pass; authoritative terminal journal is `terminal_success`; promotion consumes the same receipt chain, observes and leaves `origin/main == PUBLICATION_IMPLEMENTATION_COMMIT`, and exact-source/live docks-kit smokes install Session Relay `0.13.0`. No rollback or unreviewed path occurs. |
| 11 | Finalize Session Relay stable once, then run independent stable Release and live binary/self-test/workspace-boundary checks. | Existing Session Relay GitHub Release; `$FINALIZATION_RECEIPT`; disposable live-check directory only | 10 | planned | A22-A24 pass; stable Release keeps the exact five assets and source/tag identity, canonical finalization receipt succeeds, fresh installed binary reports `0.13.0`, immutable self-test passes, Linux workspace docs contract passes, and managed/unmanaged boundaries remain exact. |
| 12 | Record immutable receipt/evidence summaries, run Docks completion review, and archive this plan. | This plan only for manager-owned evidence, review, status, and dated active-to-finished lifecycle move | 11 | planned | Completion inventory A1-A24 is complete, child plan is already finished, no implementation blob changed after A8, completion review passes, and plan-manager archives this plan under the unique date-prefixed finished path. Non-pass is STOP; no tag/release retry follows. |

## Acceptance criteria

Run in order only after the owning step starts. A1 is the required red before production edits. A2-A8 run on the final Docks implementation tree; `node scripts/ci.mjs` runs exactly once there. Commands that mutate external release state occur only in their authorized steps, never during plan creation or draft review.

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/capture-tdd-red.mjs --repo "$PWD" --repository-id DocksDocks/docks --pre-production-commit "$PROTOCOL_RED_COMMIT" --test plugins/session-relay/test/release-evidence-contract.mjs --test plugins/session-relay/test/release-publication-contract.mjs --test plugins/session-relay/test/release-promotion-contract.mjs --receipt-out "$PROTOCOL_RED_RECEIPT" -- node plugins/session-relay/test/release-evidence-contract.mjs` | Exit 0 from the capture helper over an intended nonzero contract run; frozen blobs are the committed test-only red blobs, and failure names the missing promoted-vs-shipped semantics and legacy public tuple rather than setup. The publication and promotion test files are also run directly and must fail on their new legacy-identity assertions before Step 3. |
| A2 | `node plugins/session-relay/test/release-evidence-contract.mjs` | Exit 0; producer-bound proof accepts exact later promoted HEAD only under closed ancestry/path semantics and rejects extra paths, dirty/stale heads, mismatched constants, and hand-authored relaxation. |
| A3 | `node plugins/session-relay/test/release-publication-contract.mjs` | Exit 0; bind/publish/request/finalization fixtures use the exact recertified source and current `0.10.1` public tuple while retaining five-asset publication closure and legal recovery rejection. |
| A4 | `node plugins/session-relay/test/release-promotion-contract.mjs` | Exit 0; public verification and promotion require `cli-v0.10.1`, companion `6c07f9...`, new child-plan identity, exact expected main, closed six public assets, and terminal journal safety. |
| A5 | `node plugins/session-relay/test/distribution-contract.mjs` | Exit 0; release CLI grammar, receipt pairing/no-clobber modes, four native targets plus `SHA256SUMS`, and distribution closure remain unchanged. |
| A6 | `node plugins/session-relay/test/companion-distribution-contract.mjs --public-remote https://github.com/DocksDocks/public.git --public-ref refs/heads/preflight/session-relay-cli-0.13.0-6c07f9bc02ef --public-commit 6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172 --detached-clone` | Exit 0; immutable reviewed blocked companion tuple and frozen public contract revalidate detached. |
| A7 | `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills` | Exit 0; Session Relay skill hashes remain current without product changes. |
| A8 | `node scripts/ci.mjs` | Exit 0 once on the final Docks implementation tree before `PUBLICATION_IMPLEMENTATION_COMMIT` is fixed; no implementation/test blob changes afterward. |
| A9 | `test -z "$(git status --porcelain=v1 --untracked-files=all)" && test "$(git rev-parse HEAD)" = "$PUBLICATION_IMPLEMENTATION_COMMIT" && test "$(git rev-parse origin/main)" = "$PUBLICATION_IMPLEMENTATION_COMMIT" && git merge-base --is-ancestor cdca867e6a140311ea865a81229fb30de1df32c1 "$PUBLICATION_IMPLEMENTATION_COMMIT"` | Exit 0; clean exact implementation commit descends from the archive and equals remote main. Independently compare `cdca867...HEAD` changed paths to the closed six-path shipped-to-promoted list; no rename or extra path is present. |
| A10 | `node scripts/release.mjs --bind-completion --plugin session-relay 0.13.0 --finished-plan docs/plans/finished/2026-07-23-session-relay-linux-workspace-recertification.md --embedded-candidate-sha256 75e5bf5386a203cd81e3930ca2309ceed4e1a665d995848a29eb73a0fa5cb395 --receipt-out "$SOURCE_PROOF"` | Exit 0 and prints the canonical source-proof digest; exact source/evidence/shipped/promoted ancestry, allowlisted diff, clean HEAD, completion receipt, candidate, public tuple, and `origin/main` identity bind. |
| A11 | `SOURCE_PROOF_SHA256="$(sha256sum "$SOURCE_PROOF" | cut -d' ' -f1)" node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {validateSourcePreparationProof} from "./scripts/lib/session-relay-release-preparation.mjs"; const bytes=fs.readFileSync(process.env.SOURCE_PROOF); assert.equal(bytes.at(-1),125); const value=JSON.parse(bytes); validateSourcePreparationProof(value); assert.equal(value.source_commit,"3fb9211f3309977f24853a10714d4b7a82b38c8f"); assert.equal(value.tag_commit,value.source_commit); assert.equal(value.promoted_commit,process.env.PUBLICATION_IMPLEMENTATION_COMMIT); assert.equal(value.public_reviewed_commit,"6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172");'` | Exit 0; closed proof validates offline, has no trailing newline, and preserves distinct shipped/promoted semantics only for the producer-bound proof. |
| A12 | `node scripts/release.mjs --publish-reviewed --plugin session-relay 0.13.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --receipt-out "$PUBLICATION_RECEIPT"` | Exit 0 under the initial or one explicitly legal recovery mode and prints canonical digest; exact tag/source/ref/workflow/prerelease state is reconciled without duplicate dispatch. |
| A13 | `node --input-type=module -e 'import fs from "node:fs"; import {validatePublicationReceipt} from "./scripts/lib/session-relay-release-publication.mjs"; validatePublicationReceipt({value:JSON.parse(fs.readFileSync(process.env.PUBLICATION_RECEIPT,"utf8")),digest:process.env.PUBLICATION_SHA256});'` | Exit 0; receipt proves tag `session-relay--v0.13.0` at `3fb9211...`, exactly one successful bound build-binaries run, four native binary assets plus `SHA256SUMS`, exact sizes/digests/checksums/provenance, and prerelease state. |
| A14 | `node scripts/release.mjs --emit-public-request --plugin session-relay 0.13.0 --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --receipt-out "$PUBLIC_REQUEST"` | Exit 0 and canonical digest; request binds public `0.10.1` / `cli-v0.10.1`, companion `6c07f9...`, source publication, and exact four production digests. |
| A15 | `cd /home/vagrant/projects/public && bun cli/scripts/generate-sot-payload.ts --check && bun run test:unit -- cli/test/unit/sessionRelayCli.test.ts cli/test/unit/pluginRefresh.test.ts` | Exit 0 after the child implementation; generated payload is current, frozen focused tests stay byte-bound to prior red evidence, and production manifest consumes exact request digests. |
| A16 | `cd /home/vagrant/projects/public && git diff --exit-code 6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172 -- cli/test/unit/sessionRelayCli.test.ts cli/test/unit/pluginRefresh.test.ts && test "$(node -p 'require("./package.json").version')" = 0.10.1` | Exit 0; frozen tests and package version are unchanged. Structural child-plan acceptance proves only the exact Session Relay production fields and generated payload changed outside the child plan. |
| A17 | `cd /home/vagrant/projects/public && bash -euo pipefail -c 'bun cli/scripts/generate-sot-payload.ts --check; bun run typecheck; bun run test:unit; bun cli/test/statusline-runtime-smoke.mjs posix; bun run golden:dryrun; set +e; dry_out="$(bun run golden:dryrun --prove-red 2>&1)"; dry_status=$?; set -e; test "$dry_status" -ne 0; grep -q "prove-red OK: golden-dryrun" <<<"$dry_out"; bun run golden:mutation; set +e; mutation_out="$(bun run golden:mutation --prove-red 2>&1)"; mutation_status=$?; set -e; test "$mutation_status" -ne 0; grep -q "prove-red OK: golden-mutation" <<<"$mutation_out"'` | Exit 0; generator, typecheck, all unit tests, runtime smoke, both goldens, and both intentional prove-red message checks pass once in the child plan's full gate. |
| A18 | `cd /home/vagrant/projects/public && test "$(git rev-parse refs/tags/cli-v0.10.1)" = "$PUBLIC_RELEASE_COMMIT" && git merge-base --is-ancestor 6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172 "$PUBLIC_RELEASE_COMMIT" && test -f "$PUBLIC_FINISHED_PLAN"` | Exit 0 after the child release/archive; tag target is the completion-reviewed companion descendant and the exact finished child plan exists with passed completion receipt. Child production verification separately proves one successful workflow, the closed six assets/checksums, and canonical npm result. |
| A19 | `node scripts/release.mjs --verify-public-release --plugin session-relay 0.13.0 --request "$PUBLIC_REQUEST" --request-sha256 "$PUBLIC_REQUEST_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --public-finished-plan "$PUBLIC_FINISHED_PLAN" --public-release-commit "$PUBLIC_RELEASE_COMMIT" --public-plan-commit "$PUBLIC_PLAN_COMMIT" --public-completion-sha256 "$PUBLIC_COMPLETION_SHA256" --receipt-out "$PUBLIC_RELEASE_RECEIPT"` | Exit 0 and canonical digest; exact public ancestry, request pins, passed child completion, tag/workflow, six assets/checksums, and npm state validate from Docks. |
| A20 | `node scripts/release.mjs --promote-reviewed --plugin session-relay 0.13.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --public-release "$PUBLIC_RELEASE_RECEIPT" --public-release-sha256 "$PUBLIC_RELEASE_SHA256" --docks-kit-release cli-v0.10.1 --expected-origin-main "$EXPECTED_ORIGIN_MAIN" --receipt-out "$PROMOTION_RECEIPT"` | Exit 0 under the initial or one exact legal recovery branch; terminal receipt records success, expected/observed/pushed Docks main is the publication implementation commit, and exact-source/live smokes pass. |
| A21 | `node --input-type=module -e 'import fs from "node:fs"; import {validatePromotionReceipt} from "./scripts/lib/session-relay-release-promotion.mjs"; const receipt=JSON.parse(fs.readFileSync(process.env.PROMOTION_RECEIPT,"utf8")); validatePromotionReceipt(receipt); if(receipt.outcome!=="success"||receipt.promoted_commit!==process.env.EXPECTED_ORIGIN_MAIN) throw new Error("promotion terminal identity mismatch");'` | Exit 0; canonical receipt and authoritative transaction journal end in terminal success with exact public/source identities, CAS result, compatibility, and live-smoke evidence. |
| A22 | `node scripts/release.mjs --finalize-reviewed --plugin session-relay 0.13.0 --source-proof "$SOURCE_PROOF" --source-proof-sha256 "$SOURCE_PROOF_SHA256" --publication "$PUBLICATION_RECEIPT" --publication-sha256 "$PUBLICATION_SHA256" --promotion "$PROMOTION_RECEIPT" --promotion-sha256 "$PROMOTION_SHA256" --receipt-out "$FINALIZATION_RECEIPT"` | Exit 0 under the initial or exact canonical resume/lost-receipt recovery; stable finalization receipt binds the same source, publication, promotion, tag, Release, and five assets with no second stable mutation. |
| A23 | `LIVE_DIR="$(mktemp -d /tmp/session-relay-live.XXXXXX)" && chmod 700 "$LIVE_DIR" && gh release download session-relay--v0.13.0 --repo DocksDocks/docks --pattern session-relay-x86_64-unknown-linux-musl --dir "$LIVE_DIR" && chmod 755 "$LIVE_DIR/session-relay-x86_64-unknown-linux-musl" && test "$("$LIVE_DIR/session-relay-x86_64-unknown-linux-musl" --version)" = 'session-relay 0.13.0' && SESSION_RELAY_TEST_BIN="$LIVE_DIR/session-relay-x86_64-unknown-linux-musl" node plugins/session-relay/test/selftest.mjs` | Exit 0 on x86-64 Linux; freshly downloaded stable asset reports exact version and immutable 133-check self-test passes. On another host select only the matching closed target and retain the same digest/provenance checks. |
| A24 | `node plugins/session-relay/test/workspace-smoke.mjs --case docs-contract --bin "$LIVE_DIR/session-relay-x86_64-unknown-linux-musl"` | Exit 0 on Linux/ext4; documented nine-command surface, managed/unmanaged boundary, custody, and workspace behavior hold for the stable downloaded binary. macOS remains ordinary Relay support with exact managed-workspace refusal and is verified by the release evidence/full gate, not by pretending to run the Linux positive case. |

## Recovery matrix

| Boundary | Legal recovery | Mandatory STOP |
|---|---|---|
| Session Relay publication | Initial `--publish-reviewed` only when tag and Release are absent. An interrupted canonical receipt may be supplied once through paired `--resume-publication`/`--resume-publication-sha256`. A complete matching prerelease with lost receipt may use one explicit `--rebind-complete-publication` only after exactly one successful bound workflow is proven. | Existing tag target mismatch; stable preexisting Release; zero/multiple/conflicting workflows outside bounded readiness; asset/provenance mismatch; any attempt to dispatch a second workflow after resume/rebind. |
| Public child release | Reconcile a nonzero tag push once by exact remote ref read-back; continue only if remote `cli-v0.10.1` already equals `PUBLIC_RELEASE_COMMIT`. Bounded waiting may observe the one already-triggered workflow. | Public main no longer ancestor-compatible with companion; companion tuple/frozen tests drift; preexisting tag target or Release conflicts; multiple matching workflows; production pin, six-asset, checksum, npm, child receipt/review/archive mismatch; any tag rewrite or second trigger. |
| Docks promotion | Resume only through `--resume-promotion` with authoritative transaction ref and the same receipt inputs. Retry only an exact canonical retryable restored-failure receipt through paired retry flags. `--repair-prepush` is restricted to the known legacy sync-target failure and is not a general repair. | Expected/current/remote main differs from `PUBLICATION_IMPLEMENTATION_COMMIT`; transaction lock/ref or immutable tuple conflicts; nonretryable/manual-incident terminal journal; unproven restore; extra path; force/CAS bypass. |
| Stable finalization | Initial `--finalize-reviewed` only after promotion terminal success. Resume only with paired `--resume-finalization` receipt/digest. Lost-receipt already-stable recovery is allowed only when exact live tag/Release/assets identity revalidates. | Any source/publication/promotion mismatch, prerelease/stable conflict, asset change, or action that would perform a second stable mutation. |

Recovery never changes receipt inputs, overwrites a receipt, deletes/rewrites a ref, retags, force-pushes, or guesses remote state. When a named legal branch does not match exactly, STOP and preserve all evidence for incident handling.

## Out of scope / do-NOT-touch

- No closed receipt/schema field is added, removed, renamed, defaulted, or reserialized.
- No Session Relay product behavior, platform matrix, asset inventory, installer algorithm, frozen public test, public workflow, package version, Docks version, or Session Relay version changes.
- No path outside the six Docks shipped-to-promoted allowlist, two public production files, and the two plans' manager-owned lifecycle/archive paths may change.
- Do not edit the existing blocked public preparation plan or rewrite its historical blocked state into success.
- No additional platform or asset; Session Relay remains four binaries plus `SHA256SUMS`, while docks-kit remains five binaries plus `SHA256SUMS`.
- No branch/ref force, tag rewrite, ref deletion, history discard, automatic retry, mutable-ref authority, guessed digest, superseded source receipt, or release reuse.
- No publication, public repository write, promotion, finalization, or other remote mutation occurs during this plan's creation or draft review.

## Known gotchas

- Current tooling's failure against `6c07f9...` is a safety success. Do not bypass it or substitute the old `cli-v0.9.0`; implement the test-first rebind.
- `shipped_commit` and `promoted_commit` are intentionally different after correction. Equality is no longer the invariant; exact producer-derived ancestry, current clean HEAD, and the closed changed-path set are.
- The active publication plan is part of the shipped-to-promoted allowlist. Manager-owned start/status/evidence commits may advance its blob without changing implementation bytes; rerun the final full gate if any implementation/test blob changes.
- Session Relay tag points to product source `3fb9211...`, not the later Docks publication implementation or finished-plan archive.
- Public tag points to the child completion receipt's reviewed implementation commit, not its later plan archive commit or ambient public HEAD.
- Source Release has five assets; public docks-kit Release has six. Their `SHA256SUMS` row counts are four and five respectively.
- Workflow success alone is not npm proof because the public workflow may downgrade the known trusted-publisher failure to a warning. Record only the two closed npm states with their required evidence.
- GitHub and npm visibility are eventually consistent. Bounded read-only waiting is allowed; a timeout does not authorize a duplicate dispatch, retag, or reused cache.
- A remote push can succeed while the client exits nonzero. Reconcile the exact ref/branch once; never blind-retry.
- Hash exact raw canonical receipt bytes, not parsed JSON, Markdown labels, trimmed `git show`, or a reconstructed line.

## Global constraints

- Correctness, provenance, and no-history-loss outrank release speed.
- All commit ids are full lowercase 40-hex; all receipt/input digests are lowercase 64-hex; all fixed refs and versions are exact.
- Every external mutation is authorized by a passed independent plan/completion review and uses create-once or compare-and-swap semantics with exact read-back.
- Receipt output is canonical JCS, no trailing newline, mode `0600`, no-clobber, under one fresh mode-`0700` owner directory.
- No secrets enter plans, receipts, refs, release bodies, logs, command output, or source.
- Plan-manager owns every review, receipt, status, step-status, evidence, completion, and archive write. Plan-creator owns only each missing plan's add-only creation commit.
- Any current-main drift after implementation merge and proof binding, immutable tuple change, preexisting identity conflict, wrong/nonunique workflow or asset set, noncanonical receipt, failed focused/full/live gate, or review non-pass is STOP.

## STOP conditions

- STOP before implementation if this plan's draft review does not pass, its execution base is stale, or any immutable recertification/public companion fact differs.
- STOP before any tag/Release mutation unless the legacy constants and old promoted-equals-shipped behavior first fail the intended new tests and the final corrected contracts/full gate pass.
- STOP if the red test blobs change after capture, or if an implementation path outside the exact allowlist becomes necessary; amend and independently review the plan rather than silently expanding scope.
- STOP if Docks `origin/main` cannot become the exact reviewed publication implementation commit by non-force ancestry-preserving merge/push, or if it changes afterward.
- STOP if proof binding cannot derive the completion-reviewed evidence commit, exact shipped archive, clean promoted HEAD, closed path set, or public companion from committed evidence.
- STOP on any tag/Release preexistence conflict, nonunique workflow, receipt/hash/mode/canonicalization mismatch, asset/checksum/provenance disagreement, or changed fixed ref.
- STOP if the public child plan is not created from `6c07f9...`, is not independently reviewed, changes frozen tests/package/workflow/unrelated paths, or cannot completion-review before tagging.
- STOP if promotion's transaction identity, lock, expected main, restore proof, journal chain, exact/live smoke, or CAS result is not authoritative terminal success.
- STOP if stable finalization or live version/self-test/workspace checks fail. Do not archive this plan on partial publication.

## Cold-handoff checklist

- **File manifest:** the six exact Docks changed paths, two exact public production paths, exact child plan, and manager-owned lifecycle/archive path rules are enumerated.
- **Environment and commands:** both repositories, branches/bases, runtime pins, versions/tags, refs/runs/digests, receipt root, CLI grammar, and A1-A24 are explicit.
- **Interface and data contracts:** closed `SourcePreparationProofV1`, producer-bound promoted semantics, public request, child handoff, release receipts, assets, workflow, npm states, and commit roles are defined before use.
- **Executable acceptance:** ordered red, focused, full, bind, publication, public, promotion, finalization, and live checks have observable expected results.
- **Out of scope:** product/schema/version/platform/workflow/frozen-test/unrelated-path/ref-rewrite changes are prohibited.
- **Decision rationale:** correction preserves fail-closed behavior and current main rather than bypassing legacy identity checks or rolling history backward.
- **Known gotchas:** commit-role separation, active-plan allowlist, asset counts, npm warning semantics, eventual consistency, and raw-byte hashing are explicit.
- **Global constraints:** exact identities, no-clobber evidence, review ownership, create-once/CAS mutation, and secret hygiene are fixed.
- **No undefined terms:** every environment variable is assigned by its producing command or exact child handoff before consumption; recovery inputs are the prior canonical receipt/digest pair.

A cold read using only this plan and its cited sources leaves no user decision unresolved. Any observation outside the fixed contracts routes to a named STOP/amendment path rather than improvisation.

## Self-review

- `standalone_executability` — caught/fixed: added exact repository bases, receipt setup, commit-role definitions, child-plan contract, CLI commands, and external recovery ownership so a cold executor does not need conversation context.
- `actionability` — caught/fixed: separated red tests, protocol implementation, full gate/main publication, proof binding, source publication, child release, Docks verification, promotion, finalization, and archive into exact-path rows with observable completion/failure actions.
- `dependency_order` — pass: legacy-contract red precedes production edits; implementation/full gate/main equality precede proof binding; proof precedes source publication; source digests precede public production; public completion precedes Docks verification/promotion; promotion precedes stable finalization; both child completion and live proof precede parent completion.
- `evidence_reverification` — pass: re-opened the finished recertification evidence, current binder/proof validation, legacy public constants, release CLI grammar, immutable public companion plan/ancestry, package/SoT pins, public workflow, and prior production protocol.
- `goal_coverage` — caught/fixed: explicitly included the mandatory test-first legacy-identity correction, public child lifecycle, both asset inventories, no-rollback main binding, live self-test/workspace checks, and completion/archive of both new plans.
- `executable_acceptance` — caught/fixed: added ordered A1-A24 covering intended red, focused/full gates, canonical receipt chain, exact remote identities, public production checks, authoritative promotion, final stable state, and fresh binary behavior.
- `failure_modes` — caught/fixed: added closed recovery matrix and STOP branches for main drift, tag/Release conflicts, workflow uniqueness, remote-push ambiguity, receipt loss, transaction recovery, npm warning, extra paths, and failed review/live gates.
- `open_questions` — pass: version/tag/commits/paths/assets/recovery rules are fixed by authoritative evidence; no destructive fallback or unresolved human choice is silently guessed.

This is the single mandated local author critique pass. It is not independent review evidence and carries no score or lifecycle effect.

## Open questions

None.

## Sources

- `docs/plans/finished/2026-07-23-session-relay-linux-workspace-recertification.md` — completed source/candidate/native/source-CI identities and passed completion evidence.
- `scripts/lib/session-relay-release-preparation.mjs` — closed candidate/proof schemas, completion receipt binder, ancestry, tree-equivalence, and current promoted-equals-shipped limitation.
- `scripts/lib/session-relay-release-promotion.mjs` — legacy public constants, public request/release validation, six-asset/npm boundary, transaction/CAS journal, and live smokes.
- `scripts/lib/session-relay-release-publication.mjs` — tag/workflow/five-asset prerelease publication, resume/rebind, and stable finalization.
- `scripts/lib/session-relay-release-cli.mjs` — exact mode grammar, one positional version, adjacent receipt/digest pairing, recovery flags, and no-clobber outputs.
- `plugins/session-relay/test/release-evidence-contract.mjs`, `release-publication-contract.mjs`, `release-promotion-contract.mjs`, `distribution-contract.mjs`, and `companion-distribution-contract.mjs` — focused contract/fixture boundaries to change or preserve.
- `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-0.13.0-release-preparation.md` — immutable blocked companion tuple, frozen red evidence, runtimes, and source/preparation contract.
- `/home/vagrant/projects/public/package.json`, `SoT/toolchain.json`, `cli/src/generated/sotPayload.ts`, and `.github/workflows/release-cli.yml` — public `0.10.1` package identity, current `0.12.0` production pin, generated payload, tag-triggered build/release/npm behavior, and six assets.
- `/home/vagrant/projects/public/docs/plans/finished/2026-07-18-session-relay-cli-production-release.md` — prior public production-release ordering, completion-reviewed tag commit, single-run/read-back, npm, asset, and archive protocol; identities are historical and must be rebound.
- `docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md` — prior end-to-end publication/promotion/finalization and exact/live smoke recovery lessons; prior receipts and versions are not reusable.

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"44304c5945f1489fc0592eacfff59a79ffd803f55d1a1dfa21cbba20dca631cd","initial_input_sha256":"44304c5945f1489fc0592eacfff59a79ffd803f55d1a1dfa21cbba20dca631cd","lifecycle_intent":"start","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/session-relay-linux-workspace-publication.md","request_ids":["2abd4198-4787-4162-92c6-ce2f835c06ca"],"retry_authorization":null,"round_index":1,"schema":2,"series_id":"231c34c5-c3ec-4bfc-acb2-725dfd5665a0","series_sha256":null,"state_sha256":"cd2570cd6d11e398585465896f52599477de10b8ce6d4f112ccf3cdc01de1d0e","status":"active","stop_reason":null,"terminal_evidence_sha256":null,"terminated_from_state":null,"terminated_from_state_sha256":null,"transitioned_from_state_sha256":null}
## Review

(filled by main-context plan-manager after completion evidence)
