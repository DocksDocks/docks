---
title: Establish agent worktree lifecycle strategy
goal: Make shared Cargo target dirs safe in the gate, reap abandoned fanout worktree reservations, and document worktree location and teardown so scratch checkouts stop accumulating.
status: drafting
created: "2026-07-27T10:12:21-03:00"
updated: "2026-07-28T03:18:01-03:00"
started_at: "2026-07-27T12:41:23-03:00"
finished_at: null
assignee: null
tags: [plans, worktrees, ci, session-relay, disk-hygiene]
affected_paths:
  - AGENTS.md
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/tests/fanout_reap.rs
  - scripts/ci.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/tests/unit/cargo-target-dir.test.mjs
related_plans: []
---

# Establish agent worktree lifecycle strategy

## Goal

Agent scratch worktrees stop accumulating: the gate validates a run-private
binary so a shared Cargo target directory cannot produce a false green, relay
reaps worktree reservations abandoned before collection, and one documented
convention states where worktrees live and what teardown removes.

## Context & rationale

Measured on 2026-07-27 before any change. Eleven sibling worktrees under
`~/projects` held 3849 MB, removed with every branch ref intact and zero
untracked bytes lost. The checkout itself is 3–10 MB per worktree; 3555 MB of
the 3615 MB guaranteed-reclaimable total (98%) was `plugins/*/rust/target/`.
Six never-built fanout worktrees total 15 MB. Duplication is build output, not
checkouts, so relocating worktrees reclaims nothing.

Three independent mechanisms produced the accumulation.

**1. Sibling placement.** `docs/plans/finished/2026-07-22-session-relay-workspace-isolation.md:99`
defines `IMPL_ROOT="$(dirname "$REPO")/docks-$SESSION_ID-$SLUG"`, which resolves
to `~/projects`. Finished plans are immutable, so the recipe stays; only a
forward convention can redirect new worktrees. This affected both `docks` and
`public`, so no single repository can carry the convention for both. Step 5
therefore binds only agents working in this repository and is partial by
construction; the cross-repository home is the user-global agent file listed
under Out of scope, which no step here may write.

**2. The gate blocks the fix that addresses the 98%.** A shared
`CARGO_TARGET_DIR` collapses each Rust worktree from ~900 MB to ~15 MB, but
`scripts/ci.mjs:538` runs `cargo build --release --locked` (which honors the
variable) and then stats the hardcoded `source.builtBinary` from
`scripts/lib/plugins.mjs:85` at `scripts/ci.mjs:543`. Nothing compares the two.
A stale `plugins/session-relay/rust/target/release/relay` exists on the
development host (2 898 408 bytes, mtime 2026-07-25T19:36:16-03:00), so an
exported variable yields a green gate over a two-day-old binary.

Following the variable is necessary but not sufficient. Cargo's build lock
covers the build phase only, while `gateRust` validates after it returns: the
source checks at `scripts/ci.mjs:446`, the self-test at `:449` and `:469`, and
the reported binary at `:499` all consume the returned path afterwards. Two
worktrees sharing one `$CARGO_TARGET_DIR/release/relay` therefore race — run B's
build can overwrite the file while run A is still validating it, and A reports
green over B's binary. Copying the freshly built binary to a run-private path
and returning that closes the window, and every consumer already reads
`gateRust`'s return value rather than re-deriving the descriptor path.

A second execution site needs the same treatment.
`scripts/lib/session-relay-release-preparation.mjs:2021-2033` builds with
`cargo +1.85.0 build --manifest-path … --release --locked` and then asserts
`test "$(plugins/session-relay/rust/target/release/relay --version)" = …`.
`runAcceptanceChecks` at `:2040` executes both through `runCheck` and fails the
preparation when either exits non-zero, so these are live commands rather than
recipe text. With the variable exported, that cargo writes elsewhere while the
assertion reads the stale default path — the same false-green class outside the
gate. `runStep` forwards a per-specification `options` object, so removing
`CARGO_TARGET_DIR` from that child environment pins the documented recipe to its
literal path without altering any argv the release-contract fixtures compare.

**3. Fanout abandons reservations before collection.** Cleanup exists —
`remove_merged_worktree` at `plugins/session-relay/rust/src/fanout.rs:442` after
`CollectionPhase::Merged`, and `remove_unstarted_worktree` at `:134` on
rollback. Neither covers abandonment. Six reservations dated 2026-07-18 remain
in `~/.agent-relay/worktrees/` with `collection_phase: None`: three `Running`
and one `HandedBack` reporting "fanout process exited without handback; capacity
retained", two `Reserved` reporting "no fanout birth registration". They are
tracked in `fanout-v1.json`, `lifecycle-v1.json`, and `registry.json`, so they
are retained capacity rather than garbage. `store.rs` contains zero occurrences
of `worktree`, and its managed surfaces are
`["mailbox", "markers", "watchers", "locks", "hook-state"]`, so the 14-day GC
never reaches them. Their `relay/fanout-<id>` branches may carry uncollected
worker commits, so reaping must never delete a branch holding commits absent
from its base.

Location constraints are host-measured. `/tmp` is tmpfs (3.9 G of RAM) with
`q /tmp 1777 root root 10d`; `/var/tmp` is ext4 with `30d`;
`systemd-tmpfiles-clean.timer` is active. Aging applies per file, so a worktree
left past its threshold is partially deleted, leaving a corrupted checkout and
an orphaned `.git/worktrees` record — the origin of the 19 orphaned records
pruned on 2026-07-27. The XDG specification licenses deletion of
`$XDG_CACHE_HOME` at any time, which reproduces the same hazard; `$XDG_DATA_HOME`
carries no auto-clean contract. Session-relay's own newer facility already
resolves `~/.local/share/session-relay` for data and `~/.local/state/session-relay`
for authority.

## Environment & how-to-run

Repository `/home/vagrant/projects/docks` at `14a75c5cf0da03ddb73edb652042a6ac765cffbc`,
branch `main`, clean. Node 24 via `corepack enable && pnpm install --frozen-lockfile`.
Rust toolchain present; `cargo` resolves. Steps 1, 2, and 5 are validated by
`node scripts/ci.mjs` because they touch repo-wide tooling and the root context
file; steps 3 and 4 are validated by `node scripts/ci.mjs --plugin session-relay`.
Run Rust tests from `plugins/session-relay/rust`. No network, credential, or
release action is required.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Resolve and privatize the gate's built binary, and pin the release-preparation build. Export `resolveBuiltBinary({ source, binName, env, repo })` from `scripts/lib/plugins.mjs`, returning `<CARGO_TARGET_DIR>/release/<binName>` when that variable is a non-empty string and the descriptor path otherwise. Export `privatizeBuiltBinary({ binary, dir })` from the same module: it copies an already-resolved binary to a fresh run-private path inside `dir` and returns that path, so two invocations against one shared source yield distinct copies with identical bytes. In `gateRust`, replace `path.resolve(REPO, source.builtBinary)` at `scripts/ci.mjs:543` with `resolveBuiltBinary(...)`, validate that path, then hand it to `privatizeBuiltBinary(...)` and use the returned copy, so no consumer reads a shared location. In `acceptanceSpecifications`, give the cargo step an `options.env` that removes `CARGO_TARGET_DIR`, leaving every argv unchanged. Name the resolved source and the private copy in the existing success line. | `scripts/lib/plugins.mjs`; `scripts/ci.mjs`; `scripts/lib/session-relay-release-preparation.mjs` | — | `local` | `planned` | A1 and A4 pass. Failure: restore the original lines and STOP. |
| 2 | Cover resolution, privatization, and release-build pinning with unit tests: unset variable yields the descriptor path; a set variable yields `<CARGO_TARGET_DIR>/release/<binName>`; a relative value resolves against the repository root; an empty value is treated as unset; two invocations against one shared source produce distinct private paths whose bytes match the source; the release-preparation cargo specification carries a child environment without `CARGO_TARGET_DIR` while its argv is unchanged. | `scripts/tests/unit/cargo-target-dir.test.mjs` | 1 | `local` | `planned` | A2 passes and fails when step 1 is reverted. Failure: STOP. |
| 3 | Reap abandoned fanout reservations. Add a `worktrees` surface to the relay GC that removes a reservation's worktree only — never its branch — when its record has `collection_phase: None`, its state is not `Collected`, its worker process is absent, and its age exceeds `DEFAULT_GC_DAYS`. The surface always reports the reservation's branch name instead of deleting it, whatever `git rev-list --count <base>..<branch>` returns: branch deletion is irreversible while a stale ref costs bytes only, so it stays an operator decision. A non-zero count additionally retains the worktree, because it may hold uncollected work. | `plugins/session-relay/rust/src/store.rs`; `plugins/session-relay/rust/src/fanout.rs` | — | `local` | `planned` | A4 passes. Failure: revert both files and STOP. |
| 4 | Add Rust coverage for reaping: an abandoned reservation past the window has its worktree removed while its branch still exists and is reported; one inside the window is kept whole; one whose branch holds commits absent from base keeps both worktree and branch and is reported; a live worker's reservation is untouched. | `plugins/session-relay/rust/tests/fanout_reap.rs` | 3 | `local` | `planned` | A3 passes and fails when step 3 is reverted. Failure: STOP. |
| 5 | Document the convention in the repository's Tool-agnostic rules, binding agents working in this repository only: agent scratch worktrees live under `$XDG_DATA_HOME/agent-worktrees/<repo>/<slug>` (default `~/.local/share/agent-worktrees/...`), never as a sibling of the repository and never under `/tmp` or `/var/tmp`; teardown is `git worktree remove` plus `git worktree prune`; and the artifact set to delete is stack-dependent (`target/`, `node_modules/`, `dist/`, `.next/`, `__pycache__`, `.venv`) rather than a fixed `cargo clean`. State in the same paragraph that cross-repository coverage requires the user-global agent file. | `AGENTS.md` | — | `local` | `planned` | A5 and A6 pass. Failure: revert `AGENTS.md` and STOP. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cd /home/vagrant/projects/docks && CARGO_TARGET_DIR=$(mktemp -d) node scripts/ci.mjs --plugin session-relay 2>&1 \| tail -3` | Exit 0, and the Rust success line names the temporary directory as the source rather than `plugins/session-relay/rust/target/release/relay`. |
| A2 | `cd /home/vagrant/projects/docks && node --test scripts/tests/unit/cargo-target-dir.test.mjs 2>&1 \| grep -E '^# (pass\|fail)'` | `# pass 6` and `# fail 0`. |
| A3 | `cd /home/vagrant/projects/docks/plugins/session-relay/rust && cargo test --test fanout_reap --locked 2>&1 \| tail -3` | `test result: ok.` with 0 failed. |
| A4 | `cd /home/vagrant/projects/docks && node scripts/ci.mjs --plugin session-relay 2>&1 \| tail -3` | Exit 0 and `All ci.mjs checks passed — plugin 'session-relay'`. |
| A5 | `cd /home/vagrant/projects/docks && grep -q 'agent-worktrees' AGENTS.md && grep -q 'git worktree prune' AGENTS.md && grep -q 'stack-dependent' AGENTS.md && echo OK` | `OK` — location, teardown command, and stack-dependent artifact guidance are all present. |
| A6 | `cd /home/vagrant/projects/docks && node scripts/ci.mjs 2>&1 \| tail -3` | Exit 0 and `All ci.mjs checks passed`. |

## Out of scope / do-NOT-touch

- `docs/plans/finished/**` — immutable history, including the recipe at
  `2026-07-22-session-relay-workspace-isolation.md:99`.
- The five legacy schema-6 plans in `docs/plans/active/` — quarantined,
  render-only, and unrelated to this goal.
- `~/.omp/agent/AGENTS.md` — the cross-repository home for the same convention,
  outside every repository and therefore a user action, not a step here.
- The six existing abandoned reservations in `~/.agent-relay/` — live records on
  the development host; this plan changes future behaviour and does not hand-edit
  relay state.
- `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`
  and `docs/plans/AGENTS.md` — the copy-only generated plan contract, unrelated
  to worktree hygiene.
- The three `plugins/session-relay/test/*-contract.mjs` release fixtures — they
  compare argv, which step 1 leaves unchanged.
- Release, publication, tagging, and version bumps.

## STOP conditions

- Any acceptance command fails twice with the same signature and no relevant
  byte progress between attempts. A wall-clock deadline or timeout signature in
  the session-relay suite is exempt: A1 and A4 force a cold release build, and
  that contention reproduces the known open deadline flake (for example the
  15-second broker deadline in `unowned_dirty_path_blocks_handback`). Retry such
  a run once on an idle host; only a binary-path or `--version` mismatch counts
  as a step 1 regression.
- Step 3 cannot distinguish an abandoned reservation from a live one without
  inspecting a running worker's process state.
- Reaping would delete a branch holding commits absent from its base.
- `node scripts/ci.mjs` fails on `main` before implementation starts, indicating
  pre-existing drift that this plan must not absorb.
- A shared `CARGO_TARGET_DIR` changes the gate's verdict for identical sources.

## Open questions

1. Should reaping delete `relay/fanout-<id>` branches whose commits are already
   contained in the base? Default taken by this plan: no — report them and leave
   deletion to the operator, because branch deletion is irreversible while a
   stale ref costs bytes only.
2. Should the GC window for abandoned worktrees reuse `DEFAULT_GC_DAYS` (14) or
   take its own shorter value? Default taken by this plan: reuse
   `DEFAULT_GC_DAYS`, so one documented number governs every relay surface.

## Review

Successor authorization: SHA-256 `0eee9d1a56c01fcb496d87aa0b2c57eb802c2009381e9d86ef3c5d2f6a070f88` over the exact
current-user message, 15 bytes, **no trailing newline**,
persisted verbatim at `/home/vagrant/worktree-authorization.txt`. Literal message:

> 1 - yes
> 2 - yes

Pending.

Plan-attempt-history: {"authorization_source_sha256":"54bdcb9a2ecc6a76847d63aee7e806f57014989c6217879cd0a67f537fa66534","plan_bytes_sha256":"634cc69e48f2f37cb3a5b53bb378988727bfd69e1f0eb0a704f61ab0eed77440","replacement_run_id":"b02aa569-a19c-41e7-b880-dea5b748b626","run":{"acceptance":null,"blocker":{"evidence_sha256":"ccef9bb4b00c159c15a12f7e7e5af68ce3f34795eed95f1cbbe49d62fe5beba8","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"4040cc54a2f2819aeeede4094020c92e676b5bd6aabfbedef7ca3eb9ae208a25","invocations":2,"result_sha256":"ccef9bb4b00c159c15a12f7e7e5af68ce3f34795eed95f1cbbe49d62fe5beba8","state":"blocked"},"execution_parent":null,"goal_id":"fb3c4f2c-5f95-4b6f-b927-069973c205d6","implementation_commit":null,"plan_path":"docs/plans/active/agent-worktree-lifecycle-strategy.md","plan_sha256":"6e70714092d51d5ed071f2365277b710cba61f4a566ea5648b2e1b07e57f5a0a","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"f0073e07-9efb-4c6b-9d77-3e256575bf43","schema":1,"source_base":"ee9ec619a84db99dd6db2ee73972e1f3d277971a","source_sha256":"15c270957547620681b92c7ffce821e35ccf8431e9eed31e546e0dc3877f18b6"},"schema":1,"status":"blocked","successor_run_sha256":"0362ff9ed12f7c520b744c93506db635b9999448f8f38585e73d31eaab26f880"}
Plan-attempt-history: {"authorization_source_sha256":"0eee9d1a56c01fcb496d87aa0b2c57eb802c2009381e9d86ef3c5d2f6a070f88","plan_bytes_sha256":"2441b80837aab76c3c029cd61e2e5a1a73677ff80cd826e549d8cfc6c89e07c6","replacement_run_id":"80044613-f381-4986-a3f0-25dff7b36f2a","run":{"acceptance":{"source_sha256":"4240db802968d02cbd8b5c2472211d2a4a4885597aaeb775565694f439450bcc","verification_sha256":"42be89b6611af7cd97370c614ccde436ced0c7f9cdf7553826889efaa85dcd5f"},"blocker":{"evidence_sha256":"d7b4d36e78a9aa043e5c4e18bbe60716c063db4e60fe9f3c565c92456a79619d","kind":"review_failed"},"completion_review":{"input_sha256":"9f041f353c5f6ec0c854c4b586a436844b1da5ad277b2c306b0385093dcf1bf4","invocations":2,"result_sha256":"d7b4d36e78a9aa043e5c4e18bbe60716c063db4e60fe9f3c565c92456a79619d","state":"blocked"},"draft_review":{"input_sha256":"5784f0e697bd5fdb555a20da55f263de03aa33592a001449f1aed4efc2b50186","invocations":2,"result_sha256":"1e0dcc67d288cbcdb264b723ac14f67420b23bf51e543ff91e8cf7355ee27363","state":"passed"},"execution_parent":"89405d04982b3fcf049087ec0fbd1310b45b518e","goal_id":"fb3c4f2c-5f95-4b6f-b927-069973c205d6","implementation_commit":"590c15233b8ebc4771dbcf88284dcfd45e4db199","plan_path":"docs/plans/active/agent-worktree-lifecycle-strategy.md","plan_sha256":"1ced01916e7ade4a601c32395ee8caf0df9977e056735e4a00060763d477a29a","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"b02aa569-a19c-41e7-b880-dea5b748b626","schema":1,"source_base":"14a75c5cf0da03ddb73edb652042a6ac765cffbc","source_sha256":"f546d08ed8fcd254410419b5fcb2133a264c3cf5456618721d78e489ad60d024"},"schema":1,"status":"blocked","successor_run_sha256":"205a4029dcb6fc62b02e9ab20a7f7f2fe8d3c90449f9fd3c3257f1567aa7a3dc"}

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"execution_parent":null,"goal_id":"fb3c4f2c-5f95-4b6f-b927-069973c205d6","implementation_commit":null,"plan_path":"docs/plans/active/agent-worktree-lifecycle-strategy.md","plan_sha256":"1ced01916e7ade4a601c32395ee8caf0df9977e056735e4a00060763d477a29a","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"80044613-f381-4986-a3f0-25dff7b36f2a","schema":1,"source_base":"3c18fe40d46bbb0b26945ee47f8a964eb10d8593","source_sha256":"a1aca3119f1a213c8a2bdb4fac95b4cd37a7916327d84fcc7fd125b3d0f54768"}

## Verification Results

All six acceptance criteria pass at `56f8396352290935ff8e5d1426b7d856c91c49a8`. Two bound commands needed a
documented deviation; both are recorded verbatim below rather than substituted.

| ID | Result |
|---|---|
| A1 | Exit 0. Success line: `session-relay source-built host executable ready --release --locked: source /var/tmp/tmp.3isrXVF2nW/release/relay → private /var/tmp/tmp.3isrXVF2nW/release/.docks-ci-binary-Bmb9ca/relay` — the temporary directory is named as the source, and 0 private dirs survived the run. **Deviation:** the bound command's `mktemp -d` resolves to `/tmp`, which is tmpfs on this host; the managed-workspace tests then abort with `managed workspace requires exact ext4; mount ID 41 is tmpfs`, so the literal command cannot pass here regardless of implementation. Re-ran identically with `mktemp -d -p /var/tmp` (ext4). |
| A2 | `# pass 6` / `# fail 0`. **Deviation:** the bound command produces no output on Node 24 — `grep -E '^# (pass\|fail)'` exits 1 because the default reporter emits `ℹ pass 6`, not TAP. Re-ran as `node --test --test-reporter=tap …`, which is the same test set under the reporter the criterion's pattern was written for. |
| A3 | `test result: ok. 4 passed; 0 failed`. |
| A4 | Exit 0, `All ci.mjs checks passed — plugin 'session-relay'`. First attempt failed on `broker close proof was not published within fifteen seconds` (`tests/support/workspace.rs:452`) — the wall-clock signature STOP condition 1 exempts. The same target passed 9/9 standalone; the retry was clean. |
| A5 | `OK`. |
| A6 | Exit 0, `All ci.mjs checks passed — 3 plugin(s) + repo-wide`. |

### Required but undeclared touches

Four files outside the steps' declared `Files` had to change; none alter the
plan's intent, and each is listed here rather than left for the reviewer to find:

- `plugins/session-relay/test/rust-test-inventory.mjs` and its fixture, plus a
  `fanout_reap` entry in `sourceChecks` (`scripts/lib/plugins.mjs`). The inventory
  is what actually executes Rust targets in CI, so without registration step 4's
  suite would never run outside a manual invocation and its regression protection
  would not exist.
- `plugins/session-relay/test/fixtures/reentry-inventory.json`, regenerated. Net
  −1 operation site.
- `plugins/session-relay/rust/src/lifecycle.rs`: two visibility widenings to
  `pub(crate)` so fanout can reuse the existing liveness guard.

### Deliberate consolidations

Both sit on paths that gate deletion, which is why they were not left as written:

- `uncollected_commit_count` moved into `fanout/git.rs` behind `run_git`. As first
  written it spawned git directly, which the frozen reentry inventory classifies
  as `direct_git_command` rather than the sanctioned `git_api`. Its duplicated
  second invocation was also removed — the guard above it already covered the
  result, so it was doubling git subprocesses per reservation in the GC loop.
- `process_value_is_live` now reuses `ProcessObservation::from_json` plus
  `process_observation_is_live` instead of a third hand-rolled copy of the
  `/proc` start-token check. That token is the anti-pid-recycling guard; a copy
  that drifted and reported a live worker as dead would delete a live worker's
  worktree.

The private-copy sweep in `privatizeBuiltBinary` was added for the same reason:
as first written it created a `.docks-ci-binary-*` directory per gate run inside
`target/release/` and never removed it, which is the scratch accumulation this
plan exists to eliminate.
### Fix round (completion review invocation 1)

Invocation 1 returned `repair` with verdict `incorrect`. All findings accepted;
none rejected. Fixes are amended into the unpublished checkpoint, which moves
from `56f839635229` to `590c15233b8e`.

- **P1 — `node scripts/ci.mjs` failed whenever `CARGO_TARGET_DIR` was exported.**
  `ci-plugin-targeting.mjs` stubs its relay binary at the descriptor path and
  inherited the variable, so the nested gate looked somewhere the stub never
  wrote. Scrubbed from `probeEnv`. **No acceptance criterion covers this**: A1
  sets the variable but `--plugin session-relay` skips CI-targeting checks, and
  A6 runs them with the variable unset, where the scrub is a no-op. Verified with
  the reviewer's own reproduction — `CARGO_TARGET_DIR=<ext4 scratch> node
  scripts/ci.mjs` — exit 0, and zero occurrences of `did not produce executable`.
- **P1 — the reaper aborted the entire relay GC.** `acquire_legacy_gate(...)?`
  was the only per-reservation step that propagated; a repository in
  managed-workspace mode therefore killed every legacy surface sweep and left
  `gc-stamp` permanently stale. Now skips the reservation.
- **P2 — git and worktree deletion ran inside the fanout flock**, whose contract
  fails fast at three seconds; deleting a worktree carrying a large `target/`
  routinely exceeds that and would hard-fail concurrent relay callers. Decisions
  now happen under the lock, slow work outside it, with snapshots revalidated
  before removal.
- **P3 — unknown worker liveness defaulted to dead.** `LostAuthority` with no
  `last_observation` reported the worker absent, so the reaper would delete a
  live worker's tree; its sibling branch already defaulted the other way. Both
  now fail safe toward retention. A fifth and sixth reap case cover it.

Two corrections to the statements above, both raised by the reviewer:

- The reentry fixture delta is **+1** operation site (371 → 372), not −1. The
  hand-rolled `/proc` copy that would have made it −1 never reached a commit, so
  no `libc` site was ever registered to remove. The commit message carried the
  same error.
- **Five** files outside the steps' declared `Files` changed, not four:
  `fanout/git.rs`, `lifecycle.rs`, both inventory fixtures, and
  `rust-test-inventory.mjs` — plus `ci-plugin-targeting.mjs` added in this fix
  round, making six at the replacement commit.

**Evidence envelope deviation:** invocation 1's reviewer returned its own finding
schema rather than `CompletionReviewV1`, so `completion_review.result_sha256`
binds the digest of those exact bytes rather than a conforming envelope. The
findings were independently reproduced before acceptance. Invocation 2 is
schema-pinned, and only its conforming pass may create the archive checkpoint.

**Discovered, deliberately not fixed here:** `ci-plugin-targeting.mjs:790`
asserts an empty effect-kit timing task list, but `bac463ee` (2026-07-26) added
the `javascript quality` task without updating it. CI never catches this because
`ci.mjs` invokes the file with `--unit`, and line 777 gates 790 behind
`if (!unitOnly)`. Unrelated to this plan; folding it in would have widened the
commit past its declared scope.
