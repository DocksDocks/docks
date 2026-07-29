---
title: Ship commit-safe drivers for every plan checkpoint boundary
goal: "Give plan-manager a bundled CLI owning the three commit-bearing plan boundaries, so a plan commit is never taken outside a token-gated transaction with a restorable snapshot."
status: draft-note
created: "2026-07-28T18:05:00-03:00"
updated: "2026-07-29T01:15:00-03:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plan-manager, tooling, checkpoints, commit-safety]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-lifecycle.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/core.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/execution.mjs
  - plugins/docks/skills/productivity/plan-manager/references/plan-lifecycle-drivers.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - scripts/tests/plan-orchestration/lifecycle-drivers.mjs
  - scripts/tests/plan-orchestration/harness.mjs
  - scripts/tests/plan-orchestration.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/lib/plugins.mjs
  - package.json
related_plans: []
---

> **Design draft, not a tracked plan.** It carries no `Plan-run` record and is deliberately
> outside the `docs/plans/` lifecycle. It is the document the unit-gated review protocol in
> `plugins/docks/skills/productivity/plan-manager/references/plan-review-protocol.md` was
> developed and measured against. Promote it to a canonical plan before implementing it.

# Ship commit-safe drivers for every plan checkpoint boundary

## Goal

Three subcommands — `start`, `checkpoint` in four modes, and `finish` — own every
commit-bearing plan boundary the contract permits, so a `plan-manager`-conforming caller
never hand-rolls a plan commit. Enforcement boundary, stated plainly: the CLI owns the
checkpoints taken through it; an arbitrary `git commit` by some other tool remains outside
its reach, because no repository hook is installed. `plan-run.mjs`
keeps every lifecycle, state, transaction, and locking invariant. The drivers add
exactly two things it does not provide, both prototyped and measured before this plan
was written: a revocable transaction token, and a narrow index-plus-record snapshot
with a real restore primitive.

**Scope is one axis: commits.** A subcommand is in scope only if it commits owned
paths. Draft review, completion review, `status`, `replace`, and minting are out, each
with a measured reason in Out of scope. The commit half needs nothing that cannot be
measured today; the review half needs library APIs that do not exist.

## Context & rationale

**The defect.** `f375be5` is a bare `git commit` taken at `drafting`: no preimage
check, no owned-path restriction, no read-back. It is in `main`, and rewinding it would
be a destructive history rewrite. Two further checkpoints in the same sessions were
hand-rolled the same way and caught only by inspection. Of 65 scratch drivers this
repository accumulated across two sessions, 14 were checkpoint-bearing (verify: the
classifier in Environment). Every one re-derived the commit sequence.

**`plan-run.mjs` has no entry point and never commits.** It is 2,345 lines with 22
exports (verify: `grep -c '^export '` on the file), and `withRepositoryTransaction`
invokes its callback as `return await operation();`, releasing the lock in its own
`finally` — the commit is entirely the caller's. That is why `f375be5` was possible and
why `commitOwnedPaths` is new code rather than a duplication.

**Every mechanism in this plan was measured before being written down**, in a scratch
repository and against the real library. The measurements are restated here in full, so
nothing below depends on opening another file; the probe script that produced them is
operator-local provenance, and the normative encoding is the repository-relative suite at
`scripts/tests/plan-orchestration/lifecycle-drivers.mjs`, which Step 0 creates.

Measured facts that decide the design, each with the observation that fixes it:

### Measured facts

| Fact | Observation |
|---|---|
| `git commit --only` cannot commit a new untracked path | exits 1, `pathspec 'x' did not match any file(s) known to git` |
| A deletion must be a plain worktree removal | `git rm` first makes a later `git add -A -- <path>` fail, exit 128 |
| `captureRepositoryPreimage` cannot restore | returns `head`, `index_sha256`, `owned_paths`, `owned_paths_sha256`, `repository`, `schema` — digests only, no bytes |
| Copying the caller's index into the private index is wrong | the commit then sweeps in whatever the caller had staged |
| Seeding the amend tree from `HEAD^` loses work | a two-path checkpoint loses the path the repair does not touch |
| `commit-tree` ignores `commit.gpgsign` | no `gpgsig` header even with the config `true`; `-S` must be forwarded |
| A bare `update-ref` leaves an unlabelled reflog entry | the entry exists with an empty message; `-m` is required |
| `update-ref` takes an expected-old argument | a stale value fails with `cannot lock ref 'HEAD': is at … but expected …`, exit 128, `HEAD` untouched |
| The plan lock and the repository lock are distinct | `acquirePlanLock` uses `os.tmpdir()/docks-plan-run-locks`; `withRepositoryTransaction` uses `<common-dir>/docks-plan-run-locks/repository` |
| `AsyncLocalStorage` alone cannot gate the commit | a detached `setTimeout` inherits the store after the wrapper settles |
| Owned paths must be passed as `:(literal)` pathspecs | a path containing glob metacharacters otherwise expands as a pattern, and `git status` has no `--pathspec-from-file` |
| Expected-old must come from the transaction-entry snapshot | reading `HEAD` at commit time absorbs a concurrent commit and defeats the CAS — measured: the checkpoint overwrote it |
| The narrow index refresh cannot be made atomic in-process | holding `index.lock` blocks `git update-index` itself, so preventing the race would need raw index writing, which this plan forbids; the contract is detect-and-refuse |
| `canonicalBody` ends the excluded section at any `heading.level <= 2` | so a level-1 heading moves `plan_sha256` just as a level-2 does |

Two of those were design errors caught only by running code: restoring owned-path bytes
would have deleted the caller's implementation work, and writing the raw index back would
have reverted a third party's staging. Both are designed out below rather than guarded.


**What the prototype establishes positively.** The token dies before the lock: with a
wrapper of the same shape as `withRepositoryTransaction`, invalidating inside the
callback's `finally` produces the trace `token.invalidate` then `lock.release`, and a
`setTimeout` scheduled inside the transaction and firing after it settles inherits the
storage but is refused because its token is invalid. The five-step commit over
creation, modification, worktree deletion, and rename together yields a HEAD holding
exactly the changed owned subset while an unrelated staged entry stays staged and an
unrelated untracked file survives. A checkpoint whose plan file changed but whose one
`affected_paths` entry did not succeeds with only the changed path in HEAD, and a
boundary whose mandatory plan file is unchanged is refused before any commit.

**Owned paths are the permitted set, not the required set.** `docs/plans/AGENTS.md`
requires a checkpoint to commit *only* owned paths; it does not require every declared
`affected_paths` entry to change. An earlier draft demanded `git diff-tree` equal the
full owned set, which would reject a valid checkpoint whenever one affected path was
untouched — the prototype's third probe group is what caught it.

**A local degraded draft is startable.** `successfulDraft = draftState === 'passed' ||
(run.risk === 'local' && draftState === 'degraded')` (verify: symbol
`successfulDraft`), so `start` gates on that disjunction, not on `passed` alone.

**Why this is not a three-homes contract change.** The `docs/plans` contract describes
*what* must hold; that does not move. What moves is *how* `plan-manager` satisfies it,
which lives in `plan-manager`'s body and reference. So `docs/plans/AGENTS.md`, the
workspace template, `plan-workspace/SKILL.md`, `plan-reviewer/SKILL.md`, and both
reviewer wrappers are untouched, and the content-hash backfill cannot spill into an
undeclared skill.

**Naming a bundled script as a CLI is established here** — `write-skill/SKILL.md`
instructs `node <write-skill-dir>/scripts/skill-guard.mjs score --per-file` and
`scaffold/SKILL.md` instructs `node <target>/scripts/skills/guard.mjs` (verify:
`grep -rn '\.mjs' --include=SKILL.md plugins/*/skills/`), both rooting the path in a
placeholder because a consumer's install location is unknown.

**Budget and lint facts.** `plan-manager/SKILL.md` is 290 lines against a 310-line
sweet-spot ceiling, so the subcommand reference goes to
`references/plan-lifecycle-drivers.md`; `content-hash.mjs` hashes `SKILL.md` plus
`references/*.md` only, so the new reference moves that skill's hash while the new
scripts do not. `package.json` lints only `plan-reviewer/scripts` and
`write-skill/scripts` among shipped skill scripts, as does the Docks
`javascriptQuality` descriptor in `scripts/lib/plugins.mjs`; adding
`plan-manager/scripts` also pulls in the existing library files, which this plan may not
edit, so it was measured first — `pnpm exec biome lint
plugins/docks/skills/productivity/plan-manager/scripts` reports "Checked 2 files" and
exits 0. Because that edits the CI registry, acceptance runs the **full** gate.

## Environment & how-to-run

Node 24, pnpm via corepack: `corepack enable && pnpm install --frozen-lockfile`. Every
acceptance command runs from the repository root, with no absolute path and no `cd`
prefix.

The prototype carrying every measurement quoted above:

```
node ~/measure/spike-core.mjs      # 35/35 probes, ten groups; operator-local provenance
```

Its nine probe groups are (1) token gating including detached-task refusal and
snapshot-inside-lock ordering, (2) the commit over create+modify+delete+rename, (3)
unchanged-permitted versus unchanged-mandatory, (4) narrow plan-path restore across three
injected failure points, (5) amend replacing an unpublished checkpoint without growing the
commit count, (6) an implementation checkpoint with the record untouched, (7) a path
containing a space via NUL-delimited discovery, (8) third-party staging interleaved before
the driver's own stage, and (9) the real exported library surface. The implementation must
reproduce groups 1 through 8 as named suite cases and satisfy group 9 by real imports; the
prototype is the reference, not the deliverable.

The two git negative results, reproducible standalone:

```
T=$(mktemp -d); cd "$T"; git init -q .; git config user.email a@b.c; git config user.name t
printf 'a\n' > plan.md; printf 'b\n' > gone.txt; git add .; git commit -qm base
echo new > untracked.txt
git commit -m owned --only -- untracked.txt    # exit 1: pathspec did not match any file(s) known to git
git rm -q gone.txt; git add -A -- gone.txt     # exit 128: pathspec did not match any files
```

Detached-store hazard behind the revocable token:

```
node --input-type=module -e "import {AsyncLocalStorage} from 'node:async_hooks';
const s=new AsyncLocalStorage(); let rel; const d=new Promise(r=>rel=r);
await s.run({tx:true}, async()=>{setTimeout(()=>{console.log('detached:',JSON.stringify(s.getStore()));rel();},10)});
console.log('caller:',JSON.stringify(s.getStore())); await d;"
```

Census classifier — the scratch drivers live outside the repository and are reference
material only:

```
cd ~ && for f in $(grep -l 'plan-run.mjs' *.mjs measure/*.mjs 2>/dev/null); do
  grep -l 'withRepositoryTransaction' "$f"; done 2>/dev/null | wc -l
```

Fixtures live under `scripts/tests/plan-orchestration/fixtures/`. Every case runs in a
scratch repository created by the test, never against this working tree.

## CLI grammar

Universal: `--plan <repo-relative-path>` on every subcommand; every subcommand is a dry
run unless `--commit` is passed. Exit codes: `0` success or dry run, `2` usage error,
`1` refusal or failure. All path arguments are repository-relative.

Stdout is machine-readable: one line per changed record field, exactly
`<field>: <before> -> <after>`, ordered lexicographically by field name, each value
compact JCS so `null`, strings, numbers, and nested objects have one spelling; then
`paths: <compact-JCS array of the changed owned subset, sorted bytewise>`; then `commit: <40hex>` when it
committed or `dry-run: no bytes written` otherwise. A refusal prints one
`refused: <reason>` line to stderr and nothing to stdout. Dry run writes nothing and
computes the same field previews and path set the committed run would produce, which is
possible because no value in this scope depends on a digest that exists only after a
write.

| Subcommand | Required | Commits |
|---|---|---|
| `start` | — | the `start` checkpoint |
| `checkpoint` | `--mode implementation\|plan-only\|amend\|blocker`, `--message <text>` | that mode's checkpoint |
| `finish` | `--archive <repo-relative path>`; `--verification <repo-relative path>` for a local run only | the `archive` checkpoint |

`start` requires status `drafting`, `planned`, or `scheduled`, and a draft phase that is
`passed` or — for a local run only — `degraded`. It writes `ongoing`, binds
`execution_parent` to the locked repository `HEAD`, and takes one checkpoint.

`checkpoint --mode` covers `implementation`, `plan-only`, `amend`, and `blocker`; `start`
and `finish` own their own boundaries, so there is exactly one public way to take every
commit the contract permits. `amend` replaces a still-unpublished implementation checkpoint
after an accepted completion repair: it requires `HEAD` to equal the run's bound
`implementation_commit`, uses `git commit --amend --only`, and is otherwise refused.
`blocker` is the single cold-handoff commit a real terminal blocker may add. Stated limit:
PlanRun has no checkpoint counter (verify: the field list at symbol `PlanRunV1`), so a
second ordinary `implementation` checkpoint is not refusable from the record alone; `amend`
is refusable, because it checks `HEAD` against the bound commit.

`finish` composes its span as
`withRepositoryTransaction(… , async () => { transactPlanRun(…); move; commitOwnedPaths(…) })`,
so the record write, the archive move, and the archive commit share one repository lock
while the per-plan lock is taken and released inside it by `transactPlanRun`. Because the
plan lock drops mid-span, the record bytes are re-read and re-validated immediately before
the commit. `finish` requires status `ongoing`; a settled completion phase — `not_required` for a
local run, already `passed` for a sensitive or external one, recorded by whatever means,
since this CLI records no verdicts; and an archive target that does not exist, sits
directly under `docs/plans/finished/`, matches `YYYY-MM-DD-<slug>.md`, and whose
resolved real path equals its literal form. It refuses an existing target, the source
path, a target elsewhere, a malformed name, and a symlinked or `..`-bearing path, each
before any mutation. For a local run it writes `## Verification Results` from
`--verification`, binds acceptance, sets `finished`, moves the file, and checkpoints
inside one transaction.

`--verification` is a UTF-8 file holding the *body* of the Verification Results section:
no unfenced heading of its own at level 1 or level 2 anywhere, because `canonicalBody` ends
the excluded section on any `heading.level <= 2` and that would move `plan_sha256`. The
driver supplies the heading and refuses a file containing either level. It is required for
a local run, where the driver writes the section; for a sensitive or external run the
section is already present and the argument is refused as unused.

### Legal preconditions per boundary

Closed:

| Boundary | Risk | Required status | Required phase state | Also required |
|---|---|---|---|---|
| `start` | any | `drafting`, `planned`, or `scheduled` | draft `passed`, or `degraded` only when risk is `local` | `execution_parent` null |
| `checkpoint --mode plan-only` | any | `planned` or `scheduled` | draft `passed`, or local `degraded` | — |
| `checkpoint --mode implementation` | `sensitive` or `external` only | `ongoing` | completion `not_started` | `execution_parent` bound |
| `checkpoint --mode amend` | `sensitive` or `external` only | `ongoing` | completion `repairing` | `HEAD` equals `implementation_commit` |
| `checkpoint --mode blocker` | any | `blocked` | any | `blocker` non-null, and no prior blocker commit for it |
| `finish` | any | `ongoing` | completion `not_required` when risk is `local`, `passed` otherwise | acceptance bindable |

A local run takes no implementation checkpoint at all — its ceiling is start plus final — so
`implementation` and `amend` are refused for local risk, naming it. The `blocker` row
requires the record to already be `blocked`, which is the only status a validated PlanRun
carrying a blocker can hold.

Any other combination is refused naming the offending status or phase, and every row above
is bound to an acceptance case in A15, A19, or A21.

### Owned paths per boundary

The plan file is mandatory everywhere; the rest are permitted,
and only the changed subset is committed:

| Boundary | Mandatory | Permitted |
|---|---|---|
| `start` | the plan file | — |
| `checkpoint --mode plan-only` | the plan file | — |
| `checkpoint --mode implementation` | the changed subset of `affected_paths` | the plan file |
| `checkpoint --mode amend` | the changed subset of `affected_paths` | the plan file |
| `checkpoint --mode blocker` | the plan file | — |
| `finish` | both plan paths | `affected_paths` when the run is local |

### The commit algorithm {mechanism}

`runTransaction` and `commitOwnedPaths`, as measured by the prototype.
`runTransaction` passes the storage-scoped operation as `withRepositoryTransaction`'s
callback and invalidates its token inside that callback's own `finally`, so the token dies
before the lock. Its first action **inside** that callback — after the lock is held and the
preimage verified — is the snapshot: the raw `.git/index` bytes and their digest, plus each
plan path's bytes or absence, which for `finish` means both the source and the archive
target. Inside, `commitOwnedPaths`:

1. Runs `git status --porcelain=v1 -z -- :(literal)<owned>…` and splits on NUL, so a path
   containing a space is neither quoted nor truncated and one containing glob metacharacters
   does not expand as a pattern; parses the rename record's two NUL-separated names; computes
   the changed owned subset and
   refuses when a mandatory path is unchanged or when the subset is empty.
2. Seeds a throwaway index from `HEAD` — **always `HEAD`, including in `amend` mode** —
   with `GIT_INDEX_FILE=<tmp> git read-tree HEAD`, and stages exactly the changed subset there
   using `:(literal)` pathspecs
   with `git add -A -- <changed owned>`, covering creation, modification, worktree deletion,
   and rename. A deletion must already be a plain worktree removal. The caller's index is
   not touched.
3. Writes the tree with `git write-tree`, creates the object with
   `git commit-tree <tree> -p <parent> -m <message>` where `<parent>` is `HEAD` normally and
   `HEAD^` in `amend` mode, forwarding `-S` when `commit.gpgsign` is `true` because
   `commit-tree` otherwise ignores it, and moves the branch with
   `git update-ref -m <mode>:<plan> HEAD <commit> <expected-old>`, where `<expected-old>` is
   the `head` recorded in the transaction-entry snapshot — never a fresh read at commit time,
   which would absorb a concurrent commit and defeat the check — so a concurrent commit makes
   the move fail rather than be overwritten.
4. Verifies the created commit object — not ambient `HEAD` — with
   `git diff-tree --no-commit-id --name-only -r <commit>`, expecting exactly the changed
   subset in ordinary modes. In `amend` mode the expected set is **derived** from
   `git diff-tree -r <parent> <commit>` rather than predicted, because a repair that reverts
   an implementation path back to the parent legitimately drops it; a predicted union would
   reject that valid case.
5. Reads the commit back, then refreshes **only** the owned entries in the caller's index
   from the new tree, comparing the complete index entry — mode, object, and stage — and
   refusing rather than clobbering any owned path whose entry changed since the snapshot.
   Stated limit: this is detect-and-refuse, not prevention. Holding `index.lock` would block
   `git update-index` itself, so prevention would mean writing the index directly, which STOP
   condition 2 forbids. The repository lock excludes every conforming caller; a
   non-conforming external tool racing this window is detected, reported, and the refresh is
   re-verified after writing.

### Failure model {mechanism}

Any failure before the commit lands — including a non-zero `git commit`
that left `HEAD` unmoved — restores each plan path's bytes or absence and
nothing else. The caller's index needs no restoration because the failure path never writes
it — staging happens in a throwaway index. The caller's implementation edits are never
touched, because only the plan paths are ever snapshotted. Stated precisely: the caller's
index is never written on the failure path, and on the success path only its owned entries
are refreshed. A failure at step 4,
after `HEAD` has moved, does **not** rewrite history: it exits non-zero naming the
unexpected path set and leaves the commit for a human. So `finish` is atomic up to the
commit and fail-loud after it, and A12 asserts that split rather than claiming full
atomicity.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Shared core (depends on step 0 so its cases exist and fail first): plan-bytes loader, identity from the `Plan-run:` line, `--commit` gating, read-back, the compact-JCS stdout format, `runTransaction()` owning the snapshot boundary and the token whose invalidation sits inside `withRepositoryTransaction`'s callback, the narrow restore primitive, and `commitOwnedPaths()` as the only git-commit site. Reproduce the prototype's five probe groups against this implementation. Exports only, no CLI. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/core.mjs` | 0 | `local` | `planned` | A4–A12 and A11b–A11e pass, reproducing probe groups 1–4 and 7–8. Failure: STOP; step 3 does not start. |
| 2 | Dispatcher implementing the CLI grammar table; unknown subcommand, unknown flag, or missing required argument exits 2. | `plugins/docks/skills/productivity/plan-manager/scripts/plan-lifecycle.mjs` | 0, 1 | `local` | `planned` | A1–A3 pass. Failure: STOP. |
| 3 | `start`, `checkpoint`, `finish`, including archive-target rules, the `--verification` grammar, atomic local finish, and the fail-loud post-commit boundary. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/execution.mjs` | 0, 1, 2 | `local` | `planned` | A13–A20 pass, reproducing probe groups 5 and 6. Failure: STOP. |
| 0 | Make the focused harness refuse a selected group name matching no registered group, create `lifecycle-drivers.mjs` with every A4–A20 case present and failing against the not-yet-existing modules, and register it — so the whole suite is red before any production code exists. | `scripts/tests/plan-orchestration/harness.mjs`, `scripts/tests/plan-orchestration/lifecycle-drivers.mjs`, `scripts/tests/plan-orchestration.mjs` | — | `local` | `planned` | An unknown group name exits non-zero; `lifecycle-drivers` is registered with every A4–A20 case present and red, and that red count is recorded. Failure: STOP — without this every row below is vacuous. |
| 4 | Reconcile the suite: all of groups 1–8 reproduced as named cases, group 9 satisfied by real imports. | `scripts/tests/plan-orchestration/lifecycle-drivers.mjs`, `scripts/tests/plan-orchestration.mjs` | 1, 2, 3 | `local` | `planned` | A21, A22 pass. Failure: STOP. |
| 5 | Bring the new shipped scripts under JavaScript quality and update the CI-targeting expectation. Narrow to the new paths only if the directory is ever lint-dirty. | `package.json`, `scripts/lib/plugins.mjs`, `scripts/tests/ci-plugin-targeting.mjs` | 3 | `local` | `planned` | A24 passes and A27 is green. Failure: STOP. |
| 6 | Subcommand reference (30–150 lines; `## Contents` past 100 lines with three or more headings) carrying the CLI grammar, owned-path, and commit-algorithm tables, a durable-anchor pointer plus the two bug-preventing invariants in the body, and a manual `metadata.updated` bump. | `plugins/docks/skills/productivity/plan-manager/references/plan-lifecycle-drivers.md`, `plugins/docks/skills/productivity/plan-manager/SKILL.md` | 3 | `local` | `planned` | A25, A26 pass. Failure: move more prose into the reference. |
| 7 | Capture the pre-backfill skill-hash inventory, run one `content-hash.mjs --backfill`, and assert the diff touches no skill but `plan-manager`. | `plugins/docks/skills/productivity/plan-manager/SKILL.md` | 6 | `local` | `planned` | A26 passes. Failure: STOP. |

## Acceptance criteria

Rows A4–A23 are cases in one suite group, whose command is
`node scripts/tests/plan-orchestration.mjs --case lifecycle-drivers`; rows A1–A3 and
A24–A27 are direct commands. All run from the repository root.

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/docks/skills/productivity/plan-manager/scripts/plan-lifecycle.mjs` | Exits 2, listing exactly `start`, `checkpoint`, `finish` with their required arguments. Probe: delete the usage branch → row fails. |
| A2 | `node plugins/docks/skills/productivity/plan-manager/scripts/plan-lifecycle.mjs bogus-subcommand` | Exits 2 naming the unknown subcommand. Probe: accept any string → row fails. |
| A3 | `node plugins/docks/skills/productivity/plan-manager/scripts/plan-lifecycle.mjs checkpoint --plan docs/plans/active/plan-lifecycle-drivers.md` | Exits 2 for missing `--mode` and `--message`; `--mode start` and `--mode archive` are rejected as not public; an unknown mode exits 2. Probe: default the mode → row fails. |
| A4 | Group, `commit-helper-refuses-outside-transaction` | `commitOwnedPaths` with no enclosing `runTransaction` throws, naming the absent transaction. Probe: remove the check → fails. |
| A5 | Group, `commit-helper-context-is-per-task` | Two concurrent `runTransaction` calls each see only their own token. Probe: hoist the store to module scope → fails. |
| A6 | Group, `token-dies-before-lock-releases` | With an injected wrapper recording the order, invalidation is observed strictly before lock release, and a `setTimeout` scheduled inside the transaction and firing after it settles inherits the storage but is refused for an invalid token. Probe: invalidate outside `withRepositoryTransaction` → the recorded order inverts and the case fails. Asserted from the trace, not a timer race. |
| A7 | Group, `commit-stages-then-commits-changed-subset` | Over creation, modification, worktree deletion, and rename together, HEAD's `git diff-tree --no-commit-id --name-only -r HEAD` equals the changed owned subset exactly. Probe: drop the staging step → fails with the measured pathspec error on the new file. |
| A8 | Group, `commit-allows-unchanged-permitted-paths` | A `checkpoint --mode implementation` that changed two `affected_paths` entries and left a third untouched succeeds, with only the changed subset in HEAD; and one where **no** `affected_paths` entry changed is refused, because an implementation checkpoint containing no implementation is not a legal boundary. Probe: require the full owned set → the first case fails; drop the non-empty requirement → the second fails. |
| A9 | Group, `commit-refuses-unchanged-mandatory-path` | A boundary whose mandatory plan file is unchanged is refused before any commit, naming the path. Probe: skip the mandatory check → an empty-diff commit is produced and the case fails. |
| A10 | Group, `commit-preserves-unrelated-index-and-worktree` | With an unrelated staged entry and an unrelated untracked file present, both survive every boundary byte-identically and the unrelated entry remains staged. Probe: replace the pathspec commit with `git add -A` plus a bare `git commit` → fails. |
| A11 | Group, `restore-is-narrow-and-preserves-caller-work` | For an injected failure at each pre-commit point, the driver's record write is rolled back and the caller's index is byte-identical because it was never written, while a modified `affected_paths` file carrying the caller's implementation survives byte-identically. Probe: widen the snapshot to owned-path bytes → the caller's work is destroyed and the case fails. This is the case that protects the user's implementation. |
| A11b | Group, `commit-uses-a-private-index` | The commit is built from a throwaway index seeded from `HEAD`, so with an unrelated path staged **before** the driver stages its own owned subset, the commit contains the owned paths only and the unrelated staging is neither swept in nor reverted; on the failure path the caller's index digest is unchanged. Probe: seed the private index by copying the caller's index instead of `read-tree HEAD` → the unrelated path is swept into the commit and the case fails. |
| A11c | Group, `refresh-refuses-concurrent-owned-stage` | If an owned path's complete index entry — object **or** mode **or** stage — changes between `update-ref` and the owned-entry refresh, the driver refuses and names the path rather than overwriting it; a mode-only change is covered, and a second injection between the guard read and the write must also preserve the concurrent entry. Probe: compare object identity alone, or refresh unconditionally → the concurrent staging is lost and the case fails. |
| A11d | Group, `commit-forwards-signing-and-labels-reflog` | With `commit.gpgsign` `true` the commit object carries a signature header, and every checkpoint leaves a reflog entry whose message names the mode and plan. Probe: drop `-S`, or drop `update-ref -m` → the signature is absent, or the reflog message is empty, and the case fails. |
| A11e | Group, `update-ref-is-compare-and-swap` | With `HEAD` advanced by a concurrent commit after the locked preimage was captured, `update-ref` refuses with a stale-expected-old error, `HEAD` keeps the concurrent commit, and neither the plan record nor the caller's index is rolled back over it. Probe: omit the expected-old argument → the concurrent commit is overwritten and the case fails. |
| A12 | Group, `commit-failure-before-head-moves-restores` | An injected non-zero `git commit` leaving `HEAD` unmoved restores the snapshot and aborts; an injected post-commit path-set mismatch exits non-zero, names the unexpected set, leaves the commit in place, and rewrites no history. Probe: swallow the post-commit failure and claim atomicity → fails. |
| A13 | Group, `start-requires-passed-or-local-degraded-draft` | `start` refuses while the draft phase is `not_started`, `reserved`, or `repairing`, naming the state; succeeds when `passed`; and succeeds when `degraded` **only** for a local run, refusing a sensitive one. Probe: gate on `passed` alone → the local degraded case fails. |
| A14 | Group, `start-binds-execution-parent-to-head` | `start` writes `ongoing`, binds `execution_parent` to the locked repository `HEAD`, and takes exactly one checkpoint. Probe: accept a caller-supplied parent → fails. |
| A15 | Group, `checkpoint-modes-are-status-gated` | Table-driven over the closed precondition table: each of `implementation`, `plan-only`, `amend`, `blocker` commits its permitted set for every legal status/phase tuple and is refused for every illegal one, naming the offending field. Probe: drop the status gate → fails. |
| A15b | Group, `amend-replaces-unpublished-checkpoint` | With an implementation checkpoint that introduced at least two paths and a repair touching only one, `--mode amend` moves `HEAD`, keeps the parent, leaves the commit count unchanged, **preserves the untouched path's implementation bytes**, and yields a commit whose diff against its parent is the full implementation set plus the repair; it is refused when `HEAD` does not equal the bound `implementation_commit`, and refused when completion is not `repairing`. Probe: allow it as an ordinary duplicate → the commit count grows and the case fails. |
| A15c | Group, `blocker-checkpoint-is-single-and-gated` | `--mode blocker` commits the plan file only, is refused when the record carries no blocker, and is refused a second time for the same blocker. Probe: allow an unbounded number → fails. |
| A16 | Group, `finish-requires-ongoing-and-settled-completion` | `finish` refuses when the run is not `ongoing`; refuses a sensitive run while completion is not `passed`, naming the phase; refuses a local run whose completion is not `not_required`. Probe: drop either gate → fails. |
| A17 | Group, `finish-validates-archive-target` | `finish` refuses an existing target, the source path, a target outside `docs/plans/finished/`, a name not matching `YYYY-MM-DD-<slug>.md`, and a symlinked or `..`-bearing path whose resolved location differs from its literal form — each before any mutation, leaving bytes and `HEAD` unchanged. Probe: accept any repo-relative path → the overwrite case fails. |
| A18 | Group, `finish-rejects-nested-heading-in-verification` | Table-driven: a `--verification` file containing an unfenced level-1 heading is refused, and one containing an unfenced level-2 heading is refused, each naming the constraint, while the same text inside a fenced block is accepted as a control; an accepted file's content appears under exactly one driver-supplied `## Verification Results` heading and `plan_sha256` is unchanged by the write. Probe: pass the file through verbatim → `plan_sha256` moves and the case fails. |
| A19 | Group, `local-finish-is-one-transaction` | For a local run, `finish` writes Verification Results, binds acceptance, sets `finished`, moves the file, and checkpoints in one transaction, leaving `implementation_commit` null and completion `not_required`; the archive commit contains both plan paths, as a deletion and an addition. Probe: split the write → fails. |
| A20 | Group, `local-round-trip-is-driver-only` | In a scratch repository from a pre-minted fixture whose draft phase is already `passed`, `start` then `finish` runs end to end with `validatePlanRun` after each hop, ending `finished` at the archive path with exactly two checkpoints. **A driver set that refuses everything passes A4, A9, A13, A15–A18 but fails here.** Probe: make either subcommand a no-op → fails. |
| A21 | `node scripts/tests/plan-orchestration.mjs --case lifecycle-drivers` | Passes with a case count strictly greater than zero. Step 0 makes an **unregistered** group name exit non-zero while a registered group runs normally, so this row can fail; the pre-change `0/0 passed` baseline is recorded in Verification Results as the starting state, not an expected outcome. |
| A22 | `node scripts/tests/plan-orchestration.mjs` | Passes; total strictly greater than the baseline recorded in Verification Results, no existing case regresses. |
| A23 | Group, `dry-run-mutates-nothing-and-previews` | Table-driven over all three subcommands: invoked without `--commit` each exits 0, prints the exact compact-JCS field previews and `paths:` set the committed run would produce plus `dry-run: no bytes written`, and leaves plan bytes, `HEAD`, index, worktree, and the archive path byte-identical. Probe: make any one write without `--commit`, or omit the preview → fails. |
| A23b | Group, `suite-was-red-before-implementation` | The number of lifecycle-driver cases registered at Step 0 equals the number green at Step 4, and Verification Results records the Step 0 run as all-red. Probe: add a case only after its implementation exists → the counts disagree and the row fails. |
| A24 | `node scripts/tests/ci-plugin-targeting.mjs` | Passes with the new script directory in the expected Docks JavaScript-quality set. Probe: revert the descriptor edit → fails. |
| A25 | `wc -l < plugins/docks/skills/productivity/plan-manager/SKILL.md` then `node scripts/skills/durable-anchors.mjs` | Body ≤ 310 lines; anchors guard exits 0 with no live `path:NN`. |
| A26 | `node scripts/skills/content-hash.mjs --check-only`, plus `git diff --name-only` after the step-7 backfill | No would-bump, and the diff's only `SKILL.md` is plan-manager's — the pre-backfill inventory is what makes this falsifiable. Probe: also edit another skill's reference → fails. |
| A27 | `node scripts/ci.mjs` | Green. Full gate, because step 5 edits the CI registry. Run last. |

## Out of scope / do-NOT-touch

- **`plan-run.mjs`, `legacy-review-records.mjs`, and `review-policy.mjs` are not
  modified.** If a driver appears to need a library change, STOP.
- **Every non-committing lifecycle mutation**, each for a measured reason. Draft
  `reserve`/`record`/`amend-reserve` are out because a correct dry run would need the
  bundle descriptor digest, whose `bundleSha256` is not exported, and because reviewer
  dispatch, prompt delivery, and private output capture are orchestration this CLI does
  not perform. `accept` and completion reservation are out because no completion-bundle
  creator or prompt builder exists — `createPlanReviewBundle` is `validatePlanBinding`
  shaped and `buildPlanReviewPrompt` emits "matching PlanReviewV1". `replace`,
  `cold-entry`, and cancellation are out because each needs an artifact or authority
  contract with no form in the reviewer's `pass|repair|blocked` verdict space.
  `status --to blocked` and reopen are out because blocking needs a closed blocker
  artifact and a legal reopen targets `drafting` or `ongoing`. Minting is out because
  `transactPlanRun` validates current bytes as a PlanRun first. Follow-ups in Open
  questions 1.
- **Recording any review verdict.** `finish` reads a settled completion phase; it never
  writes one.
- **The `docs/plans` contract, the workspace template, `plan-workspace/SKILL.md`,
  `plan-reviewer/SKILL.md`, and both reviewer wrappers.** If the work cannot be described
  without editing one, STOP — that is the three-homes cutover.
- **The `DocksDocks/public` repository.** Nothing here reaches it.
- **`f375be5` is not rewound.** Rewriting pushed history is destructive.
- **No repository-level commit hook**, so an agent that bypasses the CLI still can. See
  Open questions 2.
- **Git hooks do not run.** `commit-tree` bypasses `pre-commit` and `commit-msg`. That is
  deliberate for a plan checkpoint — a consumer's formatting or test hook must not gate a
  lifecycle record write — but it is a decision, not an accident, and a consumer relying on
  a hook to guard plan commits will not get it.
- **The review tooling is a landed sibling, not part of this plan.**
  `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-review.mjs`,
  its `plan-properties.json` rubric, and
  `plugins/docks/skills/productivity/plan-manager/references/plan-review-protocol.md` codify the
  unit-gated review protocol that reviewed this plan. They were authorized and landed separately,
  perform no network access, and neither this plan's steps nor its acceptance depend on them.
- **The probe script is not shipped, moved, or imported**, and nothing normative depends on
  opening it: every fact it established is restated in the measured-facts table above. Its
  repository-relative successor is the Step 0 suite.

## STOP conditions

1. Any acceptance row cannot be made to fail under its named probe. A7, A8, A10, A11,
   and A20 are the costliest: A7 and A10 are the only proofs the commit is path-exact and
   index-safe, A8 the only proof an unchanged permitted path is tolerated, A11 the only
   proof the restore does not destroy the caller's implementation, and A20 the only
   end-to-end proof. A21 was vacuous by construction until step 4 lands.
2. A driver would need to duplicate validation, reduction, canonicalization, or locking
   logic from `plan-run.mjs`.
3. The revocable token cannot hold across the real `withRepositoryTransaction` call —
   for instance if a boundary must commit from a child process, where no in-process store
   is inherited. The prototype used a same-shaped stand-in wrapper, so this is the one
   mechanism whose behaviour against the real export is asserted first by A6 rather than
   already measured.
4. Describing the driver requirement in `plan-manager`'s body requires a matching edit in
   any file listed as untouched above.
5. `SKILL.md` cannot state the requirement within 310 lines even after extraction.
6. Adding the script directory to the lint set surfaces a violation in a library file.
   Narrow step 5 to the new paths rather than editing an out-of-scope file.
7. The restore primitive cannot recover some state A11 exercises — a mode change, a
   symlink, or a path that is a directory in one state and a file in the other. The
   prototype covered bytes, absence, and index entries only.

## Open questions

1. **Follow-up plans for the declined surface.** Two are coherent successors and neither
   is smuggled in here: a completion-review custody contract in `review-policy.mjs`
   shaped by the `validateCompletionBinding` that already exists there, and an exported
   pure bundle-digest function so a draft `reserve` could preview without writing.
2. **Whether the requirement should be enforced rather than documented.** A `pre-commit`
   hook refusing a plan-path commit that no driver produced would make the claim
   absolute, but hooks are consumer-machine artifacts this repository deliberately keeps
   out.

Settled during drafting, recorded so a cold reader does not reopen it: the body wording
is **MUST for every commit-bearing plan boundary**, with no SHOULD tier, because `start`,
the four `checkpoint` modes, and `finish` are the only public way to take the commits the
contract permits, and a read-only inspection takes none of them. "Three subcommands, six
boundaries" is the accurate phrasing.

## Review

Pending.

## Verification Results

Pending.
