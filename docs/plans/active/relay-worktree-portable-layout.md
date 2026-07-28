---
title: Repo-key the relay fan-out worktree layout and split the worktree sweep age
goal: Give fan-out worktrees a portable repo-keyed path, keep existing worktrees reapable through a dual-shape window, and shorten only the abandoned-worktree sweep to one day.
status: blocked
created: "2026-07-28T12:10:00-03:00"
updated: "2026-07-28T14:36:12-03:00"
started_at: null
finished_at: null
blocked_since: "2026-07-28T14:36:12-03:00"
blocked_reason: "Draft review invocation 2 of 2 returned repair: F1 (missing_acceptance); F2 (missing_acceptance); F3 (contradiction); F4 (contradiction); F5 (missing_acceptance); F6 (missing_decision)."
assignee: null
tags: [session-relay, worktrees, gc, disk-hygiene, schema]
affected_paths:
  - plugins/session-relay/rust/src/fanout/authority.rs
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/fanout/git.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/tests/fanout.rs
  - plugins/session-relay/rust/tests/fanout_reap.rs
  - plugins/session-relay/rust/tests/workspace_coordination_process.rs
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/AGENTS.md
related_plans: []
---

# Repo-key the relay fan-out worktree layout and split the worktree sweep age

## Goal

Fan-out worktrees move from a flat `worktrees/<reservation_id>` to a portable
`worktrees/<repo-key>/<reservation_id>`, and every worktree already on disk stays
collectable while both shapes are accepted. The abandoned-worktree sweep drops from
fourteen days to one, without changing any other retention age.

## Context & rationale

**The documented convention and the implementation disagree.** Root `AGENTS.md`
prescribes `$XDG_DATA_HOME/agent-worktrees/<repo>/<slug>` — repo-keyed. The
implementation builds a flat `<relay home>/worktrees/<reservation_id>`
(`fanout.rs:219-223`, `:271-281`, `:445-459`). This closes that gap; it does not
invent a convention. Reservation ids are already unique, so the flat layout is not
*broken* — the wins are grouping, per-repo policy, and matching the documented
shape.

**There is no portable repository identifier in the record today, so this is a
record schema change and not a path edit.** `FanoutRecord`
(`fanout/authority.rs:87-113`) carries `repo_common_dir`, `repo_dev`, `repo_ino`,
and `object_format`. All are machine-local by construction: `repo_common_dir` is a
lexical canonical absolute path, and dev/ino are a filesystem device and inode.
`RepositoryIdentityV1.repository_id` (`workspace/schema.rs:699-706`) is no help
either — it is a hash of euid plus device plus inode (`workspace/git.rs:71-80`).
Nothing in the crate derives an owner/name identifier from a remote today. A new
field plus a new derivation is therefore required. The record is serialized as
plain JSON by `to_json` (`:115-174`) and admitted by `from_json` (`:176-274`); the
JCS-serialized closed-key type is `WorkerResultV1` in `protocol.rs:656-682`, a
different record, which is why `protocol.rs` is out of scope.

**Adding a required key would hard-fail the whole store, not just this feature.**
`from_json` admits exactly three shapes through `has_exact_keys` (`:200-205`),
which tests `object.len() == LEGACY_KEYS.len() + extras.len()` plus containment:
20 legacy keys, 21 with `object_format`, and 25 with the correlated extras. A
record matching no shape returns `None`, which `:1047-1050` converts to
`Err("malformed fanout record {id}")`, and `read_records` fails on the *first* bad
row (`:1047-1055`) so one unreadable record breaks every fan-out operation. So the
new field is added as a **fourth** arm — the 25-key extras plus `repo_key`, 26
keys — and the three existing arms stay byte-compatible.

**`repo_key` is emitted only when it has a value, unlike every other optional
field.** `insert_optional` (`:1095-1103`) always inserts, writing `null` for
`None`, which is why the current writer emits exactly 25 keys for every record. If
`repo_key` followed that helper, every new record would be 26 keys and a
pre-change binary — which admits only 20, 21, or 25 — would reject *all* of them.
That matters because mixed binaries are a normal state for this store: prebuilts
ship alongside locally built ones (`scripts/lib/plugins.mjs:121-131`), the store is
per-user (`store.rs:51-57`), `fanout.rs:1-6` names old-binary compatibility as a
design invariant, and GC errors are swallowed by callers
(`bus.rs:611-613`, `hook.rs:297-299`) so the damage would appear as exactly the
invisible disk leak this plan exists to fix. Emitting the key conditionally keeps a
keyless record byte-identical to today's 25-key shape. Records that *do* carry a
key are readable only by binaries carrying this change: that is a deliberate
one-way upgrade, recorded under Out of scope.

**A naive re-key strands worktrees silently, in both directions.** The reap guard
is `if ... || Path::new(&snapshot.worktree) != fanout.root().join("worktrees")
.join(&snapshot.reservation_id) || old_worktree_snapshot(...).is_none() { continue; }`
(`fanout.rs:271-281`) — a bare `continue`, with no log and no report entry; only
`Retained` and `Removed` outcomes are reported later. Resolution is also by a
**single path component**: `old_worktree_snapshot` (`:98-116`) and
`worktree_matches_snapshot` (`:120-133`) call
`statat(&worktrees.fd, reservation_id, AtFlags::SYMLINK_NOFOLLOW)`. So keeping the
flat expectation while writing nested strands every *new* worktree, and switching
wholly to nested strands every *existing* one. Both are permanent and invisible to
GC. Hence the dual-shape window in step 3. Nothing enumerates the `worktrees`
directory itself — the reaper iterates record keys (`:265-267`) and
`gc_surface_id` returns `None` for `worktrees` (`store.rs:879-893`) — so the record
is the only source of truth for a worktree's location.

**The key is derived once, outside the store lock, and bound to the stored path.**
Origin remotes are mutable — `git remote set-url`, an organisation rename, a fork,
or a second checkout with a different remote all change what a derivation returns —
so deriving twice can produce a record whose `repo_key` disagrees with its stored
`worktree`, which is the silent strand again. Derivation therefore happens exactly
once in `prepare_worktree`, before the transaction, and the single value is passed
both to the path builder and to `ReservationRequest` (`fanout/authority.rs:276-281`).
It must not move inside `reserve`: `reserve` runs under
`transaction` → `store::with_lock_at` (`authority.rs:634`, `store.rs:512-546`),
which holds the store's global exclusive lock whose contention budget for every
other relay process is three seconds, and the existing code deliberately performs
every git call before reserving (`fanout.rs:381-395` precede `:396`).

**Nesting must not weaken the existing escape hardening.** `SYMLINK_NOFOLLOW`
guards only the final component, so handing `<repo-key>/<reservation_id>` to
`statat` would let intermediate components follow symlinks. Creation has the same
hole today: `ensure_worktree_root` (`fanout/git.rs:56-68`) rejects a symlink at the
root itself, then calls `fs::create_dir_all`, leaving intermediates unprotected. So
both sides walk per component — `mkdirat` plus `openat(O_NOFOLLOW|O_DIRECTORY)`,
then `statat` inside the resulting directory fd. The reusable hardened helpers all
handle exactly one component (`store.rs:846-873`, `workspace.rs:1844-1868`,
`repository_gate.rs:231-267`); no multi-component walker exists, so one is written
by iterating that primitive. Two consequences the plan must pin down rather than
leave to judgement. First, a blocked component must **skip**, not abort: the
in-repo precedent turns a no-follow failure into a sweep-fatal `Err`
(`store.rs:857-869`) and `reap_abandoned_worktrees` propagates with `?` at
`fanout.rs:281` into `LegacyGc::collect` (`store.rs:1306-1311`), so a fatal reading
would let one planted symlink disable all GC — whereas today the same planting is
inert, because `statat` with `SYMLINK_NOFOLLOW` sees a non-directory and returns
`Ok(None)`. Second, `git worktree add` (`fanout/git.rs:122-125`) receives a plain
path string and re-resolves every component itself, following symlinks, so the
hardened walk does not protect the operation that actually writes the checkout.
Unlike today's unguessable uuid leaf, `<repo-key>` is predictable and long-lived,
and fan-out workers are same-uid untrusted processes
(`plugins/session-relay/AGENTS.md:52`), so the created parent is re-checked by
device and inode after `git worktree add` returns and the reservation fails closed
on any mismatch. `git worktree add` also does not create missing parents, so the
chain must exist before it runs.

**Shortening the sweep must not touch general retention.** `DEFAULT_GC_DAYS`
(`store.rs:34`, `u64 = 14`) feeds `gc_days()` (`:775-784`) and produces the single
`cutoff: SystemTime` at `:1289-1304`, which is consumed by the fan-out reaper
(`:1306-1313`) **and** by registry `last_seen` filtering (`:1364-1369`),
`known_gc_surfaces` (`:1330`), the all-surfaces gate (`:1373-1377`),
`candidate_surfaces_still_eligible` (`:1417`), and registry/name removal
(`:1427-1443`) — reaching mailboxes, markers, watchers, resume locks, hook state,
and spawn logs through `surface_is_old` (`:994-998`). Lowering that constant
generally would cut mailbox retention to one day and lose mail for any
quiet-but-alive session. So a separate fan-out default is introduced and only the
reaper's cutoff changes. This keeps both shipped documents literally true, so
neither is edited:
`plugins/session-relay/skills/productivity/session-relay/SKILL.md:97` states that
"A session is removed only when its discovery activity and every
mailbox/marker/watcher/lock/spawn-log surface are all older than 14 days" — an
enumeration that does not include worktrees — and
`plugins/session-relay/AGENTS.md:28` documents the same fourteen-day inactivity
threshold for the shared store. That skill is content-hash gated, and
`scripts/skills/content-hash.mjs --check-only` exits 1 on drift via
`scripts/ci.mjs:581-583`, so leaving it untouched is what keeps A4 and A8 green.
`AGENT_RELAY_GC_DAYS=0` continues to disable GC entirely, because `Gc::prepare`
returns `Ok(None)` before any cutoff is computed (`store.rs:1202-1205`).

**One day is safe for worktrees specifically, because age is a backstop and not
the guard.** A candidate must already have zero commits beyond base
(`uncollected_commit_count` is `git rev-list --count base..branch`), a clean tree,
no live worker (`worker_process_is_present` yields `Skipped`), a matching
repository identity, and a held collection lock. Removal is
`remove_unstarted_worktree` (`fanout/git.rs:135-143`), which runs
`git worktree remove` without `--force` and re-checks existence afterwards, and the
branch is retained even on success. So the sweep only ever removes worktrees where
nothing was produced, and the age gate exists to catch crashed workers. One day is
sufficient for that and reclaims disk far sooner. This does **not** make committed
work collectable; that would be a policy loosening and is out of scope.

## Environment & how-to-run

Repository `DocksDocks/docks`, branch `main`, all commands run from the repository
root. Node 24 via `corepack enable && pnpm install --frozen-lockfile`. The Rust
toolchain is pinned to `channel = "1.85.0"` by
`plugins/session-relay/rust/rust-toolchain.toml`, which is why the cargo rows name
`+1.85.0` explicitly and use `--manifest-path` rather than changing directory,
matching the house convention. Those rows build the debug profile; no row passes
`--release`. Run the cargo rows one at a time on an idle host, never concurrently,
because this host has locked up under concurrent build load. No network,
credential, tag, or release action is required or authorized by this plan.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add `repo_key: Option<String>` to `FanoutRecord`, inserting the key in `to_json` **only when it is `Some`** rather than through `insert_optional`, and admit a fourth exact-key shape — the 25-key correlated extras plus `repo_key` — leaving the 20-, 21-, and 25-key shapes untouched. Derive the key once in `prepare_worktree` before the transaction and pass it to both the path builder and `ReservationRequest`: strip scheme, userinfo, host and port including the scp-style `host:` form, strip a trailing `.git`, take the last two non-empty segments, lowercase them. Fall back to a digest of the sorted root-commit oids from `git rev-list --max-parents=0 HEAD`, and to a fixed sentinel when the repository has no commits — never the local path, and never `None` merely because derivation failed. Reject any `/`-separated component that is empty, `.`, `..`, over 255 bytes, or contains a separator or NUL | `plugins/session-relay/rust/src/fanout/authority.rs`, `plugins/session-relay/rust/src/fanout/git.rs`, `plugins/session-relay/rust/src/fanout.rs` | — | `local` | `planned` | A keyless record serializes 25 keys byte-identically to today; a keyed record serializes 26 and round-trips; byte-literal 20-, 21-, and 25-key records still parse and still reap; this repository's own scp-style origin yields `docksdocks/docks`; a `file://` or bare-path remote falls back to the root-commit digest rather than a machine path; two clones at different local paths yield the same key; an over-long or `..` component fails the reservation; no derivation call runs inside `reserve` or on the reap or rollback path. If the fallback cannot avoid the local path, STOP |
| 2 | Write new worktrees at `worktrees/<repo-key>/<reservation_id>`, creating the key's components with a per-component `mkdirat` plus `openat(O_NOFOLLOW\|O_DIRECTORY)` walk from the `worktrees` directory fd, creating the parent chain before `git worktree add` runs, and re-checking the created parent by device and inode after it returns so a component swapped mid-operation fails the reservation closed. Have `reserve` refuse any request whose worktree is not exactly the nested path for its key, or the flat path when the key is absent | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/fanout/git.rs`, `plugins/session-relay/rust/src/fanout/authority.rs` | 1 | `local` | `planned` | A freshly reserved worktree lands at the nested path, its record's stored `worktree` matches its `repo_key`, and it is enumerated, aged, and reaped by `reap_abandoned_worktrees`; a symlink pre-planted at an intermediate component is not followed and the reservation fails; a request whose worktree disagrees with its key is refused |
| 3 | Resolve and compare every record-derived worktree path from the record's own `repo_key` — nested when present, flat when absent — at both `statat` lookups (`fanout.rs:103`, `:125`), expected-path construction and resolution (`:219-223`, `:227-230`), the decision equality (`:249-255`), the reap guard (`:271-281`), and rollback (`:445-459`). Treat `ELOOP`, `ENOTDIR`, and `ENOENT` at any component as "no worktree here" — skip the record exactly as a missing flat worktree is skipped today — and fail the sweep only on an unexpected errno. After a leaf is removed, best-effort remove the now-empty key components innermost first, ignoring a non-empty directory. Record in `plugins/session-relay/AGENTS.md` the observable condition under which the flat arm is deleted | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/fanout/git.rs`, `plugins/session-relay/AGENTS.md` | 2 | `local` | `planned` | A legacy flat-path worktree and a nested repo-keyed worktree are both reaped in the same sweep; rollback succeeds for both shapes; a symlink planted at a key component leaves the rest of the sweep running rather than aborting it; an emptied key directory is gone after its last leaf is reaped; `plugins/session-relay/AGENTS.md` states the flat-arm removal condition; A6 fails when the flat arm is deleted |
| 4 | Add a fan-out-worktree-specific one-day age default and pass its cutoff only as the third argument of the `reap_abandoned_worktrees` call at `store.rs:1306-1313`, leaving `DEFAULT_GC_DAYS` at 14 and keeping `AGENT_RELAY_GC_DAYS` authoritative for both ages when set, including `0` disabling GC | `plugins/session-relay/rust/src/store.rs` | — | `local` | `planned` | With no override set, a two-day-idle abandoned worktree is reaped while a thirteen-day-idle session's mailbox and registry entry survive the same sweep; an explicit `AGENT_RELAY_GC_DAYS` still governs both; `0` still disables GC |
| 5 | Cover steps 1-4 in the existing `fanout` and `fanout_reap` test targets, update the fan-out worktree assertions in `tests/workspace_coordination_process.rs`, register every new test name in `cases.fanout.tests` and `cases.fanout_reap.tests` sorted and unique, regenerate the source-derived operation inventory with `node plugins/session-relay/test/reentry-inventory.mjs --generate` and confirm the only new rows are the `git_api` calls step 1 adds, and document the nested layout and the worktree-specific default | `plugins/session-relay/rust/tests/fanout.rs`, `plugins/session-relay/rust/tests/fanout_reap.rs`, `plugins/session-relay/rust/tests/workspace_coordination_process.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json`, `plugins/session-relay/test/fixtures/reentry-inventory.json`, `plugins/session-relay/AGENTS.md` | 1 | `local` | `planned` | A3 and A4 print their `PASS rust_test_inventory` lines with every new name present and none orphaned; `node plugins/session-relay/test/reentry-inventory.mjs` prints its `PASS reentry_inventory` line; A5 and A8 pass. No new test target is created, so the runnable-target registration stays untouched |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test fanout` | Exit 0; nested-path creation, intermediate-component symlink refusal, the post-`git worktree add` device-and-inode recheck, repo-key derivation from an scp-style remote, the fallback for a pathless remote, component validation, the 26-key round-trip, and the byte-literal 20-, 21-, and 25-key parses all pass |
| A2 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test fanout_reap` | Exit 0; a legacy flat worktree and a nested repo-keyed worktree are both reaped in one sweep, a planted symlink at a key component does not abort the sweep, an emptied key directory is removed, a thirteen-day-idle session's mailbox and registry entry survive, and an explicit `AGENT_RELAY_GC_DAYS` still governs both ages |
| A3 | `node plugins/session-relay/test/rust-test-inventory.mjs --case fanout` | Exit 0, which is what asserts 0 ignored and 0 filtered, and a printed `PASS rust_test_inventory case=fanout tests=<n> executed=<n>` line whose counts are equal and non-zero |
| A4 | `node plugins/session-relay/test/reentry-inventory.mjs` | Exit 0 and a printed `PASS reentry_inventory source_derived=<n> births=<n>` line — the source-derived operation inventory matches the regenerated fixture with no undeclared drift |
| A5 | `node scripts/ci.mjs --plugin session-relay` | Exit 0; the final banner reads `✔ All ci.mjs checks passed` and ends `— plugin 'session-relay'; safe to release.` |
| A6 | Delete the flat arm of the record-driven path resolution, run A2, restore | A2 exits non-zero and its `failures:` block names the legacy-shape reap test; the restored file is byte-identical and A2 is back to exit 0. This is the row that proves existing worktrees do not become silently unreapable |
| A7 | Delete the existing `has_exact_keys(&["object_format"])` arm, run A1, restore | A1 exits non-zero and its `failures:` block names the byte-literal 21-key parse test; the restored file is byte-identical and A1 is back to exit 0. This is the row that proves pre-change records still parse |
| A8 | Delete the fourth `has_exact_keys` arm, run A1, restore | A1 exits non-zero and its `failures:` block names the 26-key round-trip test; the restored file is byte-identical and A1 is back to exit 0 |
| A9 | `node scripts/ci.mjs` | Exit 0; the final banner reads `✔ All ci.mjs checks passed` and ends `— 3 plugin(s) + repo-wide; safe to release.` |

## Out of scope / do-NOT-touch

- **Refusing a tmpfs relay home.** Measured and deliberately deferred to its own
  plan: the guard has to sit where every relay command passes, and this
  repository's own harness roots fan-out homes at `os.tmpdir()`
  (`plugins/session-relay/test/fanout-smoke.mjs:14`,
  `plugins/session-relay/test/workspace-smoke.mjs:165` and `:501`), which is tmpfs
  on hosts where `/tmp` is. A refusal therefore requires changing those harnesses,
  and `fanout-smoke.mjs` is tracked evidence in
  `plugins/session-relay/test/release-evidence-contract.mjs:78` and
  `plugins/session-relay/test/remediation-contract.mjs:48`, so it drags evidence
  regeneration in with it. That is a separate blast radius from this plan's, and
  none of those files are declared here.
- **Backward compatibility for binaries without this change.** Once a repo-keyed
  record exists, only binaries carrying step 1 can read it, because the 26-key
  shape matches none of their three arms. Keyless records stay byte-identical, so
  the break is confined to repositories that have fanned out after the upgrade.
  This is an accepted one-way upgrade at a minor version boundary; no downgrade
  path is provided and none is attempted.
- **Making committed work collectable.** Today the sweep retains any worktree with
  commits beyond base, pushed or not. Adding a `pushed` predicate would loosen that
  guarantee and is a separate decision.
- **`protocol.rs` and `WorkerResultV1`.** The JCS closed-key record is a different
  type; `repo_key` belongs to `FanoutRecord`, so neither `protocol.rs` nor
  `tests/protocol.rs` changes.
- **General retention and the shipped documents that describe it.**
  `DEFAULT_GC_DAYS` stays 14, so mailbox, marker, watcher, resume-lock, hook-state,
  and spawn-log ages are untouched;
  `plugins/session-relay/skills/productivity/session-relay/SKILL.md` is not edited
  and its `content_hash` is not refreshed.
- The Session Relay `0.15.0` release itself, its thirteen-stage reviewed protocol,
  and the `DocksDocks/public` companion. This plan prepares source only.
- Branch deletion. The reaper removes worktrees and retains branches; that stays.
- `docs/plans/finished/**` and any recorded receipt bytes.

## STOP conditions

- The no-remote fallback cannot be made stable without embedding a local path.
- A pre-change 20-, 21-, or 25-key record stops parsing, or a keyless record
  written by the new writer is not byte-identical to today's 25-key shape.
- A legacy flat worktree or a nested repo-keyed worktree cannot be reaped during
  the deprecation window, or A6, A7, or A8 passes while its mutation also passes.
- A record's `repo_key` and its stored `worktree` can disagree, or derivation must
  run inside `reserve` or on the reap path to make resolution work.
- A blocked or symlinked key component cannot be made to skip one record without
  aborting the whole sweep.
- The created parent cannot be re-checked after `git worktree add`, leaving the
  hardened walk unable to protect the checkout it guards.
- Lowering the worktree default changes the removal age of any non-worktree
  surface.
- The regenerated operation inventory shows drift beyond the `git_api` rows step 1
  adds.
- Any acceptance command fails twice with the same signature and no relevant byte
  progress between attempts.

## Open questions

None. The key source and its derivation rule, the conditional emission, the
one-way upgrade, the deprecation window, the sweep separation, and the nested
layout were all settled before this revision. Five alternatives were considered and
rejected with measured reasons, recorded in Context and Out of scope: keying on
`repo_common_dir` (machine-local), flattening the repo key to a single component
(abandons the prescribed nested shape), emitting `repo_key` through
`insert_optional` (would make every new record unreadable to older binaries),
deriving inside `reserve` (runs git under the global store lock), and lowering
`DEFAULT_GC_DAYS` itself (would silently shorten mailbox and registry retention).

## Review

Draft review invocation 1 returned `repair` with eight findings, all accepted. F1:
the record lives in `fanout/authority.rs` and is not JCS, so `affected_paths`
gained that file and lost `protocol.rs`. F2: a required key would hard-fail every
pre-change record, so the field is a fourth arm and is emitted only when set. F3:
resolution is by single path component across many sites, so step 3 enumerates them
and step 2 hardens creation. F4: the sweep constant drives all retention, so a
separate worktree default is introduced and the shipped documents stay true and
untouched. F5: the inventory command requires `--case`. F6: `| tail -3` masked
every exit status, so all rows are bare and the mutation rows name the `failures:`
block. F7 and F8 concerned the tmpfs refusal, which measurement showed cannot be
implemented without changing harness files and tracked evidence outside this
plan's declared set; it is deferred to its own plan and recorded under Out of
scope, which also removes the incorrect claim that the default relay home is
`~/.local/share/session-relay` — it is `$HOME/.agent-relay` (`store.rs:40-57`).

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"37b393672e30730dbf51e36f92029e7312df08e1bdd99c42a19a8aaf9293af64","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"ee1489822cb633a61f6f6d858d26693eef0c54f652e83cae04cea8a761ac0b3c","invocations":2,"result_sha256":"37b393672e30730dbf51e36f92029e7312df08e1bdd99c42a19a8aaf9293af64","state":"blocked"},"execution_parent":null,"goal_id":"6d682812-3fc7-4ddf-bd9a-f0539e5b22bb","implementation_commit":null,"plan_path":"docs/plans/active/relay-worktree-portable-layout.md","plan_sha256":"cf64c953da06c2d6c8b8d74d4126985dc365794da3da47b108ad16508283c3dc","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"d756fc6e-e272-4362-ae98-0a2b7aff6dda","schema":1,"source_base":"07229eaf498c53267ef982e52ca035d7c14dca5c","source_sha256":"c3cdceae616f18fc5a076666ec81c833201b7c640f6c695897e4f659d4e8ee56"}

## Verification Results
