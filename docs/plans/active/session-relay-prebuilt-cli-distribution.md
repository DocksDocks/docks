---
title: Deliver Session Relay as a prebuilt CLI
goal: Prepare reviewed launcher-only Session Relay 0.12.0 and docks-kit 0.9.0 sources plus the resumable release tooling required by a separate release plan.
status: planned
created: "2026-07-16T04:10:15-03:00"
updated: "2026-07-16T12:25:14-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [session-relay, distribution, rust, github-actions]
affected_paths:
  - .claude-plugin/marketplace.json
  - .github/AGENTS.md
  - .github/workflows/build-binaries.yml
  - .github/workflows/ci.yml
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - plugins/session-relay/bin/SHA256SUMS
  - plugins/session-relay/bin/relay
  - plugins/session-relay/bin/relay-aarch64-apple-darwin
  - plugins/session-relay/bin/relay-aarch64-unknown-linux-musl
  - plugins/session-relay/bin/relay-x86_64-apple-darwin
  - plugins/session-relay/bin/relay-x86_64-unknown-linux-musl
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/selftest.mjs
  - scripts/AGENTS.md
  - scripts/ci.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/rust-bin.mjs
  - scripts/release.mjs
related_plans: []
review_status: null
planned_at_commit: b65ca2c9819e3113fa43576b5845f0f33a278a61
execution_base_commit: null
---

# Deliver Session Relay as a prebuilt CLI

## Goal

Prepare Session Relay as a normal precompiled CLI: the reviewed `0.12.0` source contains only a small launcher, GitHub Actions can build the four supported Rust targets plus `SHA256SUMS`, and a companion reviewed `docks-kit` `0.9.0` source installs an exact host asset whose digest is pinned independently in its repository. This plan also implements and tests the draft publication, finalization, promotion, smoke-receipt, compatibility-revert, and retry machinery. Actual tags, Releases, npm publication, and branch promotion belong to a separate plan created and reviewed only after this source-preparation plan finishes.

## Context & rationale

The current plugin commits four compiled executables and dispatches among them from `plugins/session-relay/bin/relay`. This makes the plugin payload large, obscures provenance during review, and requires an unusual build-artifact commit before every release. The chosen replacement follows the conventional Rust CLI pattern used by projects such as Grok Build: compile per platform in CI, publish immutable checksummed release assets, and let an installer place one host executable on the user's PATH.

The plugin must not download executables from hooks or MCP startup. Those paths are latency-sensitive and operate on untrusted plugin installation state. The plugin launcher therefore performs resolution only and fails with an actionable installation command. `docks-kit` owns downloads, checksum verification, smoke testing, and atomic replacement in the companion repository.

This plan owns the Docks release producer, final launcher-only plugin payload, plugin-consumer contract, resumable release state machine, and immutable handoff to a later release plan. A companion plan in `/home/vagrant/projects/public` owns the `docks-kit` installer and its source-pinned asset schema. Session Relay is the required cross-project implementation transport; the public worker must be dispatched while the current embedded binary still exists. Each repository retains its own plan lifecycle and commit history. This plan performs no externally visible tag, Release, npm, or branch mutation.

## Environment & how-to-run

- Node.js 24 and the lockfile-pinned pnpm dependencies: `corepack enable && pnpm install --frozen-lockfile`.
- Rust toolchain: `plugins/session-relay/rust/rust-toolchain.toml`; all builds use `cargo build --release --locked`.
- Focused Docks tests:
  - `node plugins/session-relay/test/distribution-contract.mjs`
  - `node plugins/session-relay/test/selftest.mjs`
  - `node scripts/ci.mjs --plugin session-relay`
- Required broad Docks gate before commit: `node scripts/ci.mjs`.
- Cross-repository dispatch while the embedded Relay is still present:
  - Set `PARENT_SESSION_ID` to the current registered Session Relay UUID.
  - `plugins/session-relay/bin/relay spawn /home/vagrant/projects/public --fanout --from "$PARENT_SESSION_ID" --tool codex --model gpt-5.6-sol --effort high --service-tier default -- "<execute Step 1 exactly; use public plan-manager and TDD; commit cleanly; hand back the commit and blocked production-digest state>"`
  - Record the returned worker UUID as `PUBLIC_WORKER_ID`.
  - `plugins/session-relay/bin/relay collect "$PUBLIC_WORKER_ID" --from "$PARENT_SESSION_ID"`; repeat once and require the same committed handback to prove idempotent collection.
- Skill maintenance after the shipped skill text changes:
  - `node scripts/skills/content-hash.mjs --fix plugins/session-relay/skills`
  - `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills`
- GitHub workflow syntax is validated by the repository CI gate; no release workflow is dispatched before both implementations and local gates are complete.
- Companion repository commands and prerequisites live in its own plan; the Docks completion receipt consumes only the companion plan's pinned clean commit and the distribution-contract report, not unbound conversational claims.
- Release sequencing is out of this plan's execution scope. The required follow-up plan must preserve draft Session Relay assets → reviewed public digest pins → live docks-kit → non-draft Session Relay → Docks promotion, and may start only from this plan's reusable passed completion receipt.

## Interfaces & data shapes

### Published release assets

For tag `session-relay--v<VERSION>`, the GitHub Release must contain exactly one executable for every supported target plus one checksum manifest:

```text
session-relay-x86_64-unknown-linux-musl
session-relay-aarch64-unknown-linux-musl
session-relay-x86_64-apple-darwin
session-relay-aarch64-apple-darwin
SHA256SUMS
```

`SHA256SUMS` uses the standard `<64 lowercase hex><two spaces><asset-name>` format and covers all four executables. Asset names are stable and are the contract consumed by `docks-kit`.

### Installed executable

`docks-kit` pins Session Relay `0.12.0` plus one reviewed SHA-256 per supported target in `SoT/toolchain.json` and installs one verified host asset as:

```text
~/.local/bin/session-relay
```

The Rust CLI must support `session-relay --version` and print `session-relay <semver>`. The Cargo package version stays synchronized with the Session Relay plugin manifest version during `scripts/release.mjs`.

The manifest entry is closed data: repository `DocksDocks/docks`, tag `session-relay--v0.12.0`, exact version `0.12.0`, install path `~/.local/bin/session-relay`, and an `assets` map whose four target keys each hold exactly 64 lowercase hex characters. Every ordinary `docks-kit sync` that targets Claude or Codex must ensure the pinned Session Relay CLI before installing, refreshing, or enabling the Session Relay plugin. The ensure path maps the host OS and architecture to one target, downloads the matching executable and `SHA256SUMS`, requires the manifest entry and downloaded bytes both to equal the repository-pinned digest, verifies the exact version, atomically installs it, then proceeds with plugin configuration. An unsupported platform, absent pin, failed download, checksum mismatch, version mismatch, or replacement failure aborts that sync path clearly and preserves any existing executable.

### Plugin launcher resolution

`plugins/session-relay/bin/relay` resolves in this order:

1. Non-empty `SESSION_RELAY_BIN`.
2. `session-relay` found on `PATH`.
3. `$HOME/.local/bin/session-relay`.
4. Exit nonzero with a clear `docks-kit sync` / `docks-kit toolchain ensure session-relay` installation message.

The launcher rejects a resolver target that is itself, preventing recursion. The reviewed and tagged `0.12.0` payload never downloads, compiles, or falls back to an embedded executable. Remote `main` remains on the distinct compatible `0.11.2` payload until `cli-v0.9.0` is live.

### Release orchestration

The binary builder is reusable by tag CI and manual dispatch. On `session-relay--v*`, the validation job must pass before publication. The publisher downloads only artifacts produced by that same workflow run, validates the tag against the manifests and Cargo version, generates `SHA256SUMS`, and creates a draft GitHub Release with the five assets. The publishing job alone receives `contents: write`; the workflow-level default remains `contents: read`. GitHub's `push` contract binds `GITHUB_SHA` to the pushed tag tip, and a same-repository `./.github/workflows/...` reusable workflow resolves from the same caller commit, so the release producer does not require that commit on the default branch.

The Session Relay GitHub Release install block is exactly `docks-kit sync`, because that command ensures the verified CLI before installing or enabling the plugin for either supported agent runtime. It must not retain the current plugin-only `/plugin install session-relay@docks` instructions. `scripts/lib/plugins.mjs` owns this release-note descriptor, and the distribution-contract test must prove it cannot publish plugin-first instructions after embedded binaries are removed.

`scripts/release.mjs --prepare --plugin session-relay 0.12.0` applies every manifest, marketplace, Cargo, and lockfile version change, runs the full CI gate on that exact changed tree, and commits locally without pushing or tagging. A failed post-bump gate prevents the commit. Completion review seals that final launcher-only source. Release-only modes reject an unfinished source-preparation plan. `--publish-reviewed` creates only the immutable tag and draft five-asset Release. `--finalize-reviewed` requires live `cli-v0.9.0` and changes only that exact draft Release to non-draft. `--promote-reviewed` proves both release identities, downloads and verifies the exact host docks-kit release executable, pushes the reviewed Docks lineage, executes the isolated end-to-end sync itself, and emits a canonical success receipt.

Promotion is an idempotent state machine. An initial post-push smoke failure emits a canonical failure receipt, creates and pushes a normal fast-forward compatibility revert restoring the prior plugin payload, and exits nonzero. A retry requires `--retry-failed <receipt-path> --receipt-sha256 <sha256>`; it validates the closed failure receipt, exact reviewed/tag/public identities, exact revert commit and remote head, and absence of intervening code changes, then creates a normal fast-forward reapply commit whose non-plan tree is byte-identical to the reviewed launcher-only commit. It reruns the same smoke without republishing tags, Releases, or npm. A second failure creates another compatibility revert and updated failure receipt. Force-push and history rewriting are forbidden. Distribution-contract tests cover initial success, failure/revert, retry/reapply success, stale receipt rejection, intervening-change rejection, and idempotent refusal to republish immutable artifacts. Other plugins retain their existing release behavior.

`--dry-run` remains strictly read-only. It computes and prints the manifest, marketplace, Cargo, and lockfile changes without writing them, skips the full CI execution while clearly reporting that the real release will gate the changed tree, and performs no commit, push, tag, or GitHub mutation. The distribution-contract test snapshots tracked status, untracked status, and every release-owned file byte before and after `node scripts/release.mjs --dry-run --plugin session-relay 0.12.0`.

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Dispatch the separate `DocksDocks/public` installer implementation through the currently working embedded Session Relay binary under its own reviewed plan; collect a clean commit that implements the digest-pinned installer and fixture-driven tests, while its plan remains explicitly blocked only on the four not-yet-published production digests. | `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-installation.md` (external companion plan; modified only by its plan-manager), Session Relay lifecycle/handback records (external state) | — | planned | The worker is launched with explicit Codex Standard tier, creates and starts its repository-local plan, freezes failing installer tests, implements the exact manifest/digest/atomic-replacement contract and Claude/Codex sync ordering, commits cleanly, records `blocked_reason` as awaiting `session-relay--v0.12.0` digests, hands back, and is collected before Docks Step 3. Plan-manager records that exact commit under Notes for immutable Docks acceptance. |
| 2 | Add frozen Docks distribution-contract tests before production changes and capture their failure against the embedded-binary design. | `plugins/session-relay/test/distribution-contract.mjs`, `plugins/session-relay/test/selftest.mjs` | 1 | planned | The new tests fail for missing external resolution, version output, release-asset publication, post-bump CI ordering, explicit fresh self-test binary, cross-repo contract receipt, or obsolete committed-binary assumptions; the failing output is recorded before production edits. |
| 3 | Make the Rust CLI and plugin launcher expose the final stable external CLI contract, then delete every committed platform executable and the in-plugin checksum file. | `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/bin/relay`, `plugins/session-relay/bin/SHA256SUMS`, `plugins/session-relay/bin/relay-*`, `plugins/session-relay/test/selftest.mjs` | 1, 2 | planned | `--version` reports the Cargo version; launcher tests prove external resolution order, recursion rejection, and actionable failure with no embedded fallback; self-test requires `SESSION_RELAY_TEST_BIN`; `git ls-files plugins/session-relay/bin` lists only the launcher. |
| 4 | Convert binary production to tag-gated draft GitHub Release assets with least-privilege permissions and same-run artifact provenance. | `.github/workflows/build-binaries.yml`, `.github/workflows/ci.yml`, `.github/AGENTS.md`, `plugins/session-relay/AGENTS.md` | 2 | planned | Workflow contract tests prove all four stable asset names, checksum generation, validation dependency, tag restriction, draft creation, pinned actions, and publisher-only write permission. |
| 5 | Update registry-driven CI and release tooling for source-built local tests, local release preparation, later draft/tag publication, safe release notes, a non-mutating preview, explicit finalization, and resumable reviewed branch promotion with an integrated live smoke. | `scripts/ci.mjs`, `scripts/lib/plugins.mjs`, `scripts/lib/rust-bin.mjs`, `scripts/release.mjs`, `scripts/AGENTS.md` | 3, 4 | planned | Local CI builds/tests the explicit host binary without comparing committed executables; `--prepare` changes all version files before exact-tree CI and commits locally only; release-only modes require the finished source-preparation receipt; `--publish-reviewed` pushes only the final tag into a draft Release; `--finalize-reviewed` requires live `cli-v0.9.0`; `--promote-reviewed` invokes the checksum-verified released docks-kit executable and emits a closed smoke receipt; failure creates a fast-forward compatibility revert and closed failure receipt; retry validates that receipt and creates a byte-equivalent fast-forward reapply commit without republishing immutable artifacts; other plugins retain their prior semantics; the install descriptor is exactly `docks-kit sync`; and dry-run snapshots prove no mutation. |
| 6 | Update Session Relay usage guidance for the external CLI and refresh its metadata/content hash through the prescribed maintenance flow. | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | 3, 5 | planned | Skill docs name `session-relay` as the installed executable, keep instructions and troubleshooting with the skill, put executable helpers in Rust subcommands rather than skill scripts, and content-hash validation is idempotent. |
| 7 | Prepare and seal the exact release-ready source without external publication: run the Session Relay `0.12.0` prepare mode, bind the immutable companion implementation commit, run focused and broad gates, and leave both repositories clean for completion review. | `.claude-plugin/marketplace.json`, `plugins/session-relay/.claude-plugin/plugin.json`, `plugins/session-relay/.codex-plugin/plugin.json`, `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `plugins/session-relay/test/distribution-contract.mjs`; `/home/vagrant/projects/public` companion commit (read-only) | 1–6 | planned | Every Docks version surface is `0.12.0`; the final source is launcher-only; `--check-prepared` passes; the pinned public commit is clean and passes contract tests in a detached clone; no Docks/public branch, tag, Release, or npm publication occurred; all steps are ready for plan-manager completion review. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `public_commit=$(sed -n 's/^- Companion implementation commit: //p' docs/plans/active/session-relay-prebuilt-cli-distribution.md); node -e 'process.exit(/^[0-9a-f]{40}$/.test(process.argv[1]) ? 0 : 1)' "$public_commit" && node plugins/session-relay/test/distribution-contract.mjs --public-repo /home/vagrant/projects/public --public-commit "$public_commit" --detached-clone` | Exit 0; the test owns and identity-checks cleanup of its temporary detached clone, and all public evidence comes from the one plan-pinned immutable commit and reports the installer schema, sync ordering, failure preservation, release URLs, Docks source contract, and both commit identities. |
| A2 | `cargo build --manifest-path plugins/session-relay/rust/Cargo.toml --release --locked && SESSION_RELAY_TEST_BIN="$PWD/plugins/session-relay/rust/target/release/relay" node plugins/session-relay/test/selftest.mjs` | Exit 0; black-box Relay behavior passes using only the explicitly supplied fresh release executable. |
| A3 | `git ls-files plugins/session-relay/bin` | Output is exactly `plugins/session-relay/bin/relay`. |
| A4 | `node scripts/ci.mjs --plugin session-relay` | Exit 0; Session Relay Rust, launcher, workflow, manifest, skill, and self-test gates pass. |
| A5 | `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills` | Exit 0 with no stale hash. |
| A6 | `base=$(sed -n 's/^execution_base_commit: //p' docs/plans/active/session-relay-prebuilt-cli-distribution.md); node -e 'process.exit(/^[0-9a-f]{40}$/.test(process.argv[1]) ? 0 : 1)' "$base" && git diff --check "$base..HEAD"` | Exit 0; the lifecycle base is a full commit SHA and no whitespace error exists anywhere in the immutable implementation range. |
| A7 | `node scripts/release.mjs --check-prepared --plugin session-relay 0.12.0` | Exit 0; manifests, marketplace, Cargo metadata, launcher-only payload, workflows, release notes, and local clean state are exactly ready, while no tag/release/branch mutation is attempted. |
| A8 | `test -z "$(git status --porcelain=v1)" && test -z "$(git -C /home/vagrant/projects/public status --porcelain=v1)"` | Exit 0, proving both implementation worktrees are clean before completion review. |

## Required follow-up release plan

After this plan is finished, plan-manager must create and independently review `docs/plans/active/session-relay-prebuilt-cli-release.md` before any external mutation. Its immutable inputs are this plan's passed completion receipt and exact reviewed implementation commit plus the companion public implementation commit recorded under Notes. It owns the authorized draft Session Relay Release, authenticated digest collection, production public pins and completion review, docks-kit `0.9.0` publication, Session Relay finalization, integrated promotion smoke, retry/reapply path if needed, and final remote/live evidence. The outer user goal remains incomplete until that release plan is shipped; this source-preparation plan must not claim publication success.

## Out of scope / do-NOT-touch

- Do not commit newly generated Rust release binaries anywhere in the repository; deleting the obsolete committed binaries is required, but producing replacements in-tree is forbidden.
- Do not add a plugin-install hook that downloads or compiles code; plugin hook and MCP startup must remain deterministic local execution.
- Do not add Windows support in this plan; the producer supports the existing four Linux/macOS targets, while `docks-kit` must fail clearly on unsupported platforms.
- Do not modify Session Relay message, wake, fanout, lifecycle, or app-server semantics except for the top-level CLI version response.
- Do not modify unrelated plugin versions or manifests; release only Session Relay in Docks and the `docks-kit` package in the public repository.
- Do not edit `/home/vagrant/projects/public` directly from this Docks worktree; use the Session Relay worker and its repository-local plan-manager.

## Known gotchas

- GitHub Actions references must remain pinned to full 40-character commit SHAs, including any download/upload or release action introduced.
- A reusable workflow called from tag CI must expose artifacts to the publishing job in the same workflow run; do not substitute artifacts from a prior manual run.
- The final reviewed Session Relay commit intentionally exists on the remote only through its tag until `cli-v0.9.0` is live. Do not replace the tag-only push with a normal branch push or run a generic push helper before promotion.
- `actions/download-artifact` extracts per-artifact directories by default; checksum generation must deliberately flatten or reference the resulting paths without accepting duplicate names.
- A shell `command -v session-relay` hit may resolve the launcher itself through a plugin-added PATH entry. Compare canonical paths before `exec` to prevent recursion.
- Local self-tests run before any GitHub Release exists. They must use only `SESSION_RELAY_TEST_BIN` pointing at a freshly built host binary, never select debug/committed fallbacks, skip, or attempt a network download.
- `Cargo.lock` records the package version. Release-version synchronization must update it deterministically, normally through Cargo rather than hand-editing.
- Before publication, the companion installer uses fixture digests only in tests and its plan remains blocked on the four production digests. Production pins are written and reviewed only after the immutable Session Relay assets exist.

## Global constraints

- Treat plugin marketplaces, installers, and downloaded artifacts as untrusted until verified.
- No secrets in committed config.
- Run `node scripts/ci.mjs` before any commit.
- Do not release or modify generated release binaries unless explicitly asked for a release.
- User installation must not require a Rust compiler.
- `docks-kit sync` must automatically install or update the verified precompiled Session Relay CLI for the current supported OS/architecture whenever it installs or refreshes the Session Relay plugin.
- Every downloaded executable must be checksummed before installation and smoke-tested before replacing an existing executable.
- The stable installed command is `session-relay`; the plugin-internal compatibility launcher remains `plugins/session-relay/bin/relay`.
- Supported release targets are exactly `x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`, `x86_64-apple-darwin`, and `aarch64-apple-darwin`.

## STOP conditions

- STOP if current GitHub Actions artifact semantics cannot prove the published binaries came from the same tag-gated workflow run; do not fall back to latest/manual artifacts.
- STOP if `docks-kit` cannot verify a checksum before replacement or cannot preserve an existing executable on failure.
- STOP if plugin startup would need network access or compilation to retain compatibility.
- STOP if a release tool change would affect non-Session-Relay plugin release behavior without an explicit regression test.
- STOP collection if the Session Relay worker reports a dirty worktree, out-of-scope edits, an unreviewed plan transition, or a merge conflict.
- STOP before releasing `docks-kit` if the live Session Relay asset cannot be checksum-verified and installed through its actual installer in a temporary home.
- STOP before advancing Docks `origin/main` if `cli-v0.9.0` is absent, draft, failed, or does not install the live `0.12.0` asset through the real sync path.
- STOP any publication if this Docks plan lacks a reusable passed completion receipt for the exact reviewed implementation commit.
- STOP the public release if any source-pinned target digest differs from the independently hashed live asset or if the public plan has not passed completion review at the pinned release commit.
- STOP Session Relay finalization until the exact `cli-v0.9.0` host asset and checksum are live; the draft Release must not advertise `docks-kit sync` publicly before then.
- STOP completion if the integrated post-promotion smoke does not exercise the exact released docks-kit executable against launcher-only Docks `main`; a failed smoke must leave a verified fast-forward compatibility revert on remote `main`.

## Cold-handoff checklist

- **File manifest:** Present; every Docks-owned step names exact paths and the public-repository boundary is explicitly external.
- **Environment & commands:** Present; Node, pnpm, Rust, focused gates, full CI, and hash maintenance commands are exact.
- **Interface & data contracts:** Present; asset names, checksum format, installed path, version output, launcher order, and release ownership are fixed.
- **Executable acceptance:** Present; A1–A8 are commands with exact success conditions for the source-preparation goal, while a separately reviewed release plan owns all external mutations and live evidence.
- **Out of scope:** Present; committing generated replacement binaries, Windows support, runtime semantics, and direct public edits are prohibited; the explicitly authorized Session Relay `0.12.0` and subsequent `docks-kit` releases are required.
- **Decision rationale:** Present; CI assets plus explicit installer are selected to reduce payload size and improve provenance without startup downloads.
- **Known gotchas:** Present; same-run provenance, action pinning, launcher recursion, offline tests, Cargo lockstep, and pre-release pins are covered.
- **Global constraints verbatim:** Present; user compiler, checksum, supported-target, binary, security, and release constraints are explicit.
- **No undefined terms / forward refs:** Present for the source-preparation goal; release-time commands and receipts will be bound to the implemented CLI surfaces in the required follow-up release plan.

## Self-review

Score: 98/100 · one local pass · caught: separated the public repository into its own lifecycle, prohibited hook-time downloads, made same-run artifact provenance explicit, and added recursion plus pre-release-pin gotchas.

Cross-check (2026-07-16): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] 5 findings — accepted S1,S2,S3,S4,S5 / rejected none; [Codex main-context orchestrator] reproduced all five against the plan and source before accepting. Repairs reordered Relay bootstrap before binary deletion, incorporated the user's explicit release authorization, required exact-tree post-bump CI, made self-test binary selection explicit and non-skipping, and added pinned cross-repo plus live-release evidence.

Cross-check (2026-07-16, round 2): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] 4 findings — accepted S1,S2,S3,S4 / rejected none; [Codex main-context orchestrator] reproduced all four. Repairs require a complete affected-path review bundle, add every release-mutated manifest/catalog file, bind whitespace validation to the execution range, and make the final cleanliness command prove both repositories.

Cross-check (2026-07-16, round 3): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] score 86 with 3 findings — accepted S1,S2,S3 / rejected none; [Codex main-context orchestrator] reproduced all three. Repairs make Session Relay release notes install through `docks-kit sync`, remove the checklist contradiction around the authorized releases, and preserve `release.mjs --dry-run` as a tested byte-for-byte non-mutating preview. The resolved three-round batch is exhausted; another independent round requires the plan-manager continuation choice.

Cross-check (2026-07-16, round 4): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] score 72 with 4 findings — accepted S2,S3,S4 / rejected S1; [Codex main-context orchestrator] reproduced the rollout exposure, fail-open base extraction, and missing live sync acceptance. S1 was rejected because tracked `plugins/session-relay/rust/rust-toolchain.toml` already pins Rust `1.85.0`; it was absent only from the sealed review bundle, so the next bundle includes it as unchanged evidence. Repairs use a tag-only Session Relay publication, require `cli-v0.9.0` before Docks branch promotion, validate A6's SHA, and execute the real live docks-kit sync plus failure-preservation tests.

Cross-check (2026-07-16, round 5): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] score 55 with 4 findings — accepted S1,S2,S3,S4 / rejected none; [Codex main-context orchestrator] reproduced all four. Repairs move every release mutation after Docks completion review, make `0.12.0` the one final launcher-only payload, require four independently reviewed source-pinned public digests, and bind all cross-repository implementation evidence to detached clones of exact commits.

Cross-check (2026-07-16, round 6): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] score 58 with 4 findings — accepted S1,S2,S3,S4 / rejected none; [Codex main-context orchestrator] reproduced all four. Repairs keep the Session Relay Release draft until `cli-v0.9.0` is live, bind the smoke to the checksum-verified released docks-kit host executable, make promotion execute and seal the closed smoke receipt itself, and require an actual launcher-only post-promotion sync with a tested fast-forward compatibility revert on failure.

Cross-check (2026-07-16, round 7): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] score 64 with 4 findings — accepted S1,S2,S3,S4 / rejected none; [Codex main-context orchestrator] reproduced all four. Repairs end this plan at reviewed release-ready source, require a separately reviewed release plan for every external mutation, add exact Relay dispatch/collection commands, make promotion failure resumable through closed failure receipts plus fast-forward reapply commits, and delegate detached-clone cleanup to the distribution-contract helper.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/session-relay/bin/relay` — current launcher dispatches to four embedded target binaries.
- `plugins/session-relay/rust/Cargo.toml` — current package lacks product-version synchronization.
- `plugins/session-relay/rust/rust-toolchain.toml` — tracked source pins Rust `1.85.0` plus rustfmt/clippy.
- `.github/workflows/build-binaries.yml` — current binary workflow is manual-only and uploads Actions artifacts.
- `.github/workflows/ci.yml` — current tag CI validates but does not publish release assets.
- `scripts/ci.mjs` and `scripts/lib/plugins.mjs` — current Rust capability rebuilds and compares committed binaries.
- `scripts/release.mjs` — current release path assumes binaries are already committed and creates the GitHub Release after tag CI.
- `plugins/session-relay/test/selftest.mjs` — current test resolution falls back to committed platform executables.
- Official cargo-dist documentation — prebuilt target assets and installers are a standard Rust CLI distribution model.
- Grok Build public installer and README — end users receive platform-specific precompiled Rust binaries and do not compile locally.
- Official GitHub Actions push-event and reusable-workflow documentation — tag pushes bind the run to the tag tip, and same-repository called workflows resolve from the caller commit.

## Notes

- Companion repository: `/home/vagrant/projects/public`.
- Companion plan: `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-installation.md`.
- Companion implementation commit: pending
- Intended first compatible Session Relay release: `0.12.0`.
- Release authorization was explicitly granted by the user after the first independent review and later expanded to continue without a review-round limit; Session Relay `0.12.0` plus docks-kit `0.9.0` publication are the required post-completion outcome.

## Mistakes & Dead Ends

- **2026-07-16T04:34:00-03:00**: Sealed the first review bundle under `/tmp/docks-plan-review-<uuid>` instead of the helper-owned `/tmp/docks-plan-review/<uuid>` root → policy cleanup correctly rejected it → preserved those invalidly located read-only bundles and will use the exact helper root for every fresh review.
- **2026-07-16T11:26:00-03:00**: Ran a reviewer with the sealed bundle as Codex's working directory → nested Codex initialization created `.git`/`.agents`/`.codex` mount points and invalidated directory modes → discarded that output and moved reviewer runtime state to a separate temporary work directory for all later rounds.
