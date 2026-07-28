---
title: Establish agent worktree lifecycle strategy
goal: Verify at a bound base that the worktree lifecycle work already landed under the predecessor run, record the observed evidence, and archive without re-ordering changes the tree contains.
status: ongoing
created: "2026-07-27T10:12:21-03:00"
updated: "2026-07-28T03:48:20-03:00"
started_at: "2026-07-28T03:48:20-03:00"
finished_at: null
blocked_since: null
blocked_reason: null
assignee: null
tags: [plans, worktrees, ci, session-relay, disk-hygiene]
affected_paths:
  - AGENTS.md
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/fanout/git.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/tests/fanout_reap.rs
  - scripts/ci.mjs
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/rust-test-inventory.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/tests/unit/cargo-target-dir.test.mjs
related_plans: []
---

# Establish agent worktree lifecycle strategy

## Goal

The worktree-hygiene goal is already met in the tree. This run does not
implement it again: it verifies each declared end state against bound bytes at a
named base, records what was observed, and archives the goal. A step that orders
an edit the tree already contains is a defect, not work.

## Context & rationale

**This successor exists because the predecessor ordered work that had already
shipped.** Draft review invocation 2 of run `80044613` returned `repair` with two
findings, both accepted:

- **F1 (contradiction).** Every step's declared end state already existed in the
  bound source while all five rows read `planned`. Its prescribed fix is the
  shape of this successor, verbatim: "check each row's end state against the
  cited bytes, drop the rows already satisfied ... If re-derivation leaves no
  unsatisfied row, record the goal as already met at this base and archive the
  plan instead of starting it."
- **F2 (missing_acceptance).** A4 and A6 piped `node scripts/ci.mjs` into
  `tail -3` without `set -o pipefail`, so the pipeline yielded `tail`'s status -
  always 0 - while the Expected cell asserted "Exit 0". Rows gating on A4/A6
  could record a green for a failed gate. A1 already carried `set -o pipefail`
  and stated the rule verbatim, so the two rows contradicted their own plan.

**Re-derivation at `23fc146` leaves no unsatisfied row.** Each declared end state
was checked against current bytes:

| Declared end state | Observed | Evidence |
|---|---|---|
| `resolveBuiltBinary({source,binName,env,repo,cargoCwd})` resolves a relative value against the cargo working directory | present | `scripts/lib/plugins.mjs:42`, resolution at `:45` |
| `privatizeBuiltBinary({binary,dir})` exists and is consumed | present | exported from `scripts/lib/plugins.mjs`, imported at `scripts/tests/unit/cargo-target-dir.test.mjs:7` |
| Release-preparation build pinned to its literal path | present | `scripts/lib/session-relay-release-preparation.mjs:2027` passes `options: { env: { CARGO_TARGET_DIR: undefined } }` |
| Unit coverage for resolution, privatization and pinning | present, six tests | `scripts/tests/unit/cargo-target-dir.test.mjs`; A2 observed `# pass 6`, `# fail 0` |
| Relay GC reaps abandoned fanout worktrees, never their branches | present | `reap_abandoned_worktrees` at `plugins/session-relay/rust/src/fanout.rs:260`, called from the `worktrees` surface at `plugins/session-relay/rust/src/store.rs:1307` |
| Rust coverage for reaping | present | `plugins/session-relay/rust/tests/fanout_reap.rs` |
| Documented worktree convention | present | root `AGENTS.md`; A5 observed `OK` |

**Where the work landed, and why the record looks empty.** The current run has
`started_at: null` and `implementation_commit: null`, which reads as "nothing was
built". The opposite is true: the predecessor run carried
`execution_parent 89405d04` and `implementation_commit 590c1523`
("feat(ci,relay): private gate binary and abandoned-worktree reaping", touching
`fanout.rs`, `fanout/git.rs`, `store.rs`, `tests/fanout_reap.rs`, `AGENTS.md` and
both inventories), both recorded in this file's append-only
`Plan-attempt-history`. That is what attempt history is for; it is not an
untracked commit.

**The original measurement is retained as the record of why the goal existed.**
Measured 2026-07-27: eleven sibling worktrees under `~/projects` held 3849 MB;
3555 MB of the 3615 MB reclaimable total (98%) was `plugins/*/rust/target/`, so
duplication is build output, not checkouts. `/tmp` is tmpfs with a 10-day
age-out and `/var/tmp` is ext4 with 30 days; `systemd-tmpfiles` ages per file, so
a worktree left past its threshold is partially deleted, leaving a corrupted
checkout and an orphaned `.git/worktrees` record. `$XDG_DATA_HOME` carries no
auto-clean contract, which is why the documented convention names it.

**Risk is `local`, downgraded from `sensitive`.** The predecessor was sensitive
because it changed the gate and the relay GC. This run changes no source file: it
runs read-only acceptance commands and records their output. Nothing here is
destructive, public-contract, or external. `plan-run.mjs:648-650` makes this a
legal finished shape - for `risk: local`, `finished` requires a passed draft
review, `execution_parent`, and bound acceptance, and returns before the `:652`
branch that demands an `implementation_commit`. `:1751` correspondingly makes
`not_required` the right completion state for a local successor.

## Environment & how-to-run

Repository `/home/vagrant/projects/docks` at `23fc146`, branch `main`, clean.
Node 24 via `corepack enable && pnpm install --frozen-lockfile`. Rust toolchain
present; `cargo` resolves. No network, credential, or release action is required
or authorized.

**Two acceptance classes, deliberately separated.** A2 and A5 are Node-only or
pure `grep` and run anywhere. A1, A3, A4 and A6 force cold `cargo` release builds
and the full gate. This host has locked up under concurrent build load and
destroyed uncommitted work, so the cargo-backed rows must run on an idle host in
a supervised session - never unattended, never concurrently with another build.
This plan does not reach `finished` until they are observed.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Observe the two cheap end states and capture their exact output: run A2 and A5 verbatim and record stdout in Verification Results. These need no cargo and no supervision | — | — | `local` | `planned` | A2 reports `# pass 6` and `# fail 0`; A5 prints `OK`. If either disagrees, the re-derivation table in Context is wrong and this plan STOPs rather than editing source |
| 2 | Observe the four cargo-backed end states on an idle host: run A1, A3, A4 and A6 verbatim, one at a time, never concurrently, recording each exit status and matched banner | — | 1 | `local` | `planned` | All four exit 0 with their asserted banners. A deadline/timeout signature in the session-relay suite may be retried once on an idle host per STOP conditions; a binary-path or `--version` mismatch is a real regression and STOPs |
| 3 | Record the outcome: write observed evidence for all six rows into Verification Results, bind acceptance to the affected-path manifest, and archive. No source file is edited by this run | — | 2 | `local` | `planned` | Verification Results holds one row per acceptance ID with observed output, acceptance is bound, and the plan reaches `finished`. If any row could not be observed, the plan stays `ongoing` rather than recording an unobserved pass |

## Acceptance criteria

Every row is read-only. `set -o pipefail` is mandatory on every piped row:
without it the pipeline yields the last command's status and a failed gate reads
as green, which is exactly defect F2.

| ID | Command | Expected |
|---|---|---|
| A1 | `cd /home/vagrant/projects/docks && set -o pipefail && CARGO_TARGET_DIR=$(mktemp -d -p /var/tmp) node scripts/ci.mjs --plugin session-relay 2>&1 \| grep -F 'source-built host executable ready'` | Exit 0 — `pipefail` propagates node's status, which a bare pipe would discard — and the match confirms the gate validated a run-private binary under a shared target dir |
| A2 | `cd /home/vagrant/projects/docks && set -o pipefail && node --test --test-reporter=tap scripts/tests/unit/cargo-target-dir.test.mjs 2>&1 \| grep -E '^# (pass\|fail)'` | `# pass 6` and `# fail 0` |
| A3 | `cd /home/vagrant/projects/docks/plugins/session-relay/rust && set -o pipefail && cargo test --test fanout_reap --locked 2>&1 \| tail -3` | `test result: ok.` with 0 failed |
| A4 | `cd /home/vagrant/projects/docks && set -o pipefail && node scripts/ci.mjs --plugin session-relay 2>&1 \| tail -3` | Exit 0 and `All ci.mjs checks passed — plugin 'session-relay'`. `set -o pipefail` is required: without it the pipeline reports `tail`'s status and the asserted exit status is unobservable |
| A5 | `cd /home/vagrant/projects/docks && grep -q 'agent-worktrees' AGENTS.md && grep -q 'git worktree prune' AGENTS.md && grep -q 'stack-dependent' AGENTS.md && echo OK` | `OK` — location, teardown command, and stack-dependent artifact guidance are all present |
| A6 | `cd /home/vagrant/projects/docks && set -o pipefail && node scripts/ci.mjs 2>&1 \| tail -3` | Exit 0 and `All ci.mjs checks passed`. `set -o pipefail` is required for the same reason as A4 |

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

- Any acceptance row disagrees with the re-derivation table in Context. That
  means the tree is not in the state this plan asserts, and the correct response
  is to stop and re-derive, never to edit source under a verification-shaped
  plan.
- Any step would edit a file. This run's `affected_paths` are evidence bindings,
  not an edit budget; a diff against any of them means the plan has changed shape
  and must be re-reviewed.
- Any acceptance command fails twice with the same signature and no relevant byte
  progress between attempts. A wall-clock deadline or timeout signature in the
  session-relay suite is exempt: A1 and A4 force a cold release build, and that
  contention reproduces the known open deadline flake (for example the 15-second
  broker deadline in `unowned_dirty_path_blocks_handback`). Retry such a run once
  on an idle host; only a binary-path or `--version` mismatch counts as a
  regression.
- A cargo-backed row is attempted unattended, or two builds run concurrently on
  this host.
- `node scripts/ci.mjs` fails on `main` for a reason unrelated to this goal,
  indicating pre-existing drift this plan must not absorb or mask.

## Open questions

None. The predecessor's two open questions were settled by the implementation
that shipped and are now observations rather than choices: reaping reports
`relay/fanout-<id>` branches and never deletes them, and the abandoned-worktree
window reuses `DEFAULT_GC_DAYS` so one documented number governs every relay
surface. Both are exercised by A3.

## Review

Successor authorization: the exact current-user grant is persisted verbatim at
`/home/vagrant/worktree-replacement-authorization.txt` and its SHA-256 is
recorded as `authorization_source_sha256` in the appended
`Plan-attempt-history` entry below. That grant selected "Grant replacement
authority" and, in the same turn, "No releases"; it authorizes local effects
only.

Pending.

Plan-attempt-history: {"authorization_source_sha256":"54bdcb9a2ecc6a76847d63aee7e806f57014989c6217879cd0a67f537fa66534","plan_bytes_sha256":"634cc69e48f2f37cb3a5b53bb378988727bfd69e1f0eb0a704f61ab0eed77440","replacement_run_id":"b02aa569-a19c-41e7-b880-dea5b748b626","run":{"acceptance":null,"blocker":{"evidence_sha256":"ccef9bb4b00c159c15a12f7e7e5af68ce3f34795eed95f1cbbe49d62fe5beba8","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"4040cc54a2f2819aeeede4094020c92e676b5bd6aabfbedef7ca3eb9ae208a25","invocations":2,"result_sha256":"ccef9bb4b00c159c15a12f7e7e5af68ce3f34795eed95f1cbbe49d62fe5beba8","state":"blocked"},"execution_parent":null,"goal_id":"fb3c4f2c-5f95-4b6f-b927-069973c205d6","implementation_commit":null,"plan_path":"docs/plans/active/agent-worktree-lifecycle-strategy.md","plan_sha256":"6e70714092d51d5ed071f2365277b710cba61f4a566ea5648b2e1b07e57f5a0a","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"f0073e07-9efb-4c6b-9d77-3e256575bf43","schema":1,"source_base":"ee9ec619a84db99dd6db2ee73972e1f3d277971a","source_sha256":"15c270957547620681b92c7ffce821e35ccf8431e9eed31e546e0dc3877f18b6"},"schema":1,"status":"blocked","successor_run_sha256":"0362ff9ed12f7c520b744c93506db635b9999448f8f38585e73d31eaab26f880"}
Plan-attempt-history: {"authorization_source_sha256":"0eee9d1a56c01fcb496d87aa0b2c57eb802c2009381e9d86ef3c5d2f6a070f88","plan_bytes_sha256":"2441b80837aab76c3c029cd61e2e5a1a73677ff80cd826e549d8cfc6c89e07c6","replacement_run_id":"80044613-f381-4986-a3f0-25dff7b36f2a","run":{"acceptance":{"source_sha256":"4240db802968d02cbd8b5c2472211d2a4a4885597aaeb775565694f439450bcc","verification_sha256":"42be89b6611af7cd97370c614ccde436ced0c7f9cdf7553826889efaa85dcd5f"},"blocker":{"evidence_sha256":"d7b4d36e78a9aa043e5c4e18bbe60716c063db4e60fe9f3c565c92456a79619d","kind":"review_failed"},"completion_review":{"input_sha256":"9f041f353c5f6ec0c854c4b586a436844b1da5ad277b2c306b0385093dcf1bf4","invocations":2,"result_sha256":"d7b4d36e78a9aa043e5c4e18bbe60716c063db4e60fe9f3c565c92456a79619d","state":"blocked"},"draft_review":{"input_sha256":"5784f0e697bd5fdb555a20da55f263de03aa33592a001449f1aed4efc2b50186","invocations":2,"result_sha256":"1e0dcc67d288cbcdb264b723ac14f67420b23bf51e543ff91e8cf7355ee27363","state":"passed"},"execution_parent":"89405d04982b3fcf049087ec0fbd1310b45b518e","goal_id":"fb3c4f2c-5f95-4b6f-b927-069973c205d6","implementation_commit":"590c15233b8ebc4771dbcf88284dcfd45e4db199","plan_path":"docs/plans/active/agent-worktree-lifecycle-strategy.md","plan_sha256":"1ced01916e7ade4a601c32395ee8caf0df9977e056735e4a00060763d477a29a","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"b02aa569-a19c-41e7-b880-dea5b748b626","schema":1,"source_base":"14a75c5cf0da03ddb73edb652042a6ac765cffbc","source_sha256":"f546d08ed8fcd254410419b5fcb2133a264c3cf5456618721d78e489ad60d024"},"schema":1,"status":"blocked","successor_run_sha256":"205a4029dcb6fc62b02e9ab20a7f7f2fe8d3c90449f9fd3c3257f1567aa7a3dc"}

Plan-attempt-history: {"authorization_source_sha256":"c152aa6a93cc4d0f5044af23d19407d7cdef12899d0d1d088eb5e8596f1cf866","plan_bytes_sha256":"007ca9c1d2fdaaeaf3fe8621d2b1c48e0afce43acae0de77cc820a4f083f97b4","replacement_run_id":"f0e233cc-228a-4594-b2e5-e48f5b077094","run":{"acceptance":null,"blocker":{"evidence_sha256":"28aa44fc35be05e52c0d4396a7fe9625fdc77092accc40c652d97c4616399fcc","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"030d31527bd6d272ddfb15b0dc11726d6c8f8a3ad84d53689a4b9ef4bbeb6184","invocations":2,"result_sha256":"28aa44fc35be05e52c0d4396a7fe9625fdc77092accc40c652d97c4616399fcc","state":"blocked"},"execution_parent":null,"goal_id":"fb3c4f2c-5f95-4b6f-b927-069973c205d6","implementation_commit":null,"plan_path":"docs/plans/active/agent-worktree-lifecycle-strategy.md","plan_sha256":"e78bbb3f9b5715be49d7b69a07637a2a5b1ad6171cbe1904de0d7d6199728cd7","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"80044613-f381-4986-a3f0-25dff7b36f2a","schema":1,"source_base":"d58a061b5d47fa10758390a78f48f4c0ca81e86f","source_sha256":"ddb62205a48da67164359382b8c7fad69c8d0c069c8297a1d49cb28e90717764"},"schema":1,"status":"blocked","successor_run_sha256":"0373f545f3ae1925785daca83a1677026020a906d54d04d866a48b065396f7b4"}
Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_required"},"draft_review":{"input_sha256":"d0e496ee988e4e13a5c3aa63031cfd97922c850ca1a68537bcfbb13db989970e","invocations":1,"result_sha256":"fb941c2578ee31f1a5f5be9714ae74789e68ea9eeef10032609147921f01fc00","state":"passed"},"execution_parent":"23fc146c80e91ce9b898f94ac1546d18416b8f9d","goal_id":"fb3c4f2c-5f95-4b6f-b927-069973c205d6","implementation_commit":null,"plan_path":"docs/plans/active/agent-worktree-lifecycle-strategy.md","plan_sha256":"a60899ebfa7f2288976c0606dcb989e8d6af4c49a1b781e6f7b1544c39035b17","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"local","run_id":"f0e233cc-228a-4594-b2e5-e48f5b077094","schema":1,"source_base":"23fc146c80e91ce9b898f94ac1546d18416b8f9d","source_sha256":"e6c323805a53f30a1eee2c5c2afed50b57843d2af43c38fbe6b911d9ce76a00f"}

## Verification Results
