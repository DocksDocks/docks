---
title: Repo-key the fan-out worktree layout without a record schema change
goal: Give fan-out worktrees a portable repo-keyed path and shorten only the fan-out worktree sweep to one day, keeping every existing flat worktree reapable and the FanoutRecord accepted key set unchanged.
status: ongoing
created: "2026-07-28T12:10:00-03:00"
updated: "2026-07-28T17:34:13-03:00"
started_at: "2026-07-28T17:34:13-03:00"
finished_at: null
blocked_since: null
blocked_reason: null
assignee: null
tags: [session-relay, worktrees, gc, containment, layout]
affected_paths:
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/fanout/git.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/tests/fanout.rs
  - plugins/session-relay/rust/tests/fanout_reap.rs
  - plugins/session-relay/rust/tests/support/fanout.rs
  - plugins/session-relay/rust/tests/workspace_coordination_process.rs
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/AGENTS.md
related_plans: []
---

# Repo-key the fan-out worktree layout without a record schema change

## Goal

Fan-out worktrees move from the flat `<relay home>/worktrees/<reservation_id>` to a
repo-keyed `<relay home>/worktrees/<repo-key>/<reservation_id>`, so worktrees from
different repositories are grouped and can carry per-repository policy. The abandoned
fan-out worktree sweep drops to one day. `FanoutRecord`'s accepted key set stays
exactly 20/21/25, so no binary — old or new — loses the ability to read the shared
record store.

## Context & rationale

**The layout is stored, not computed, so the record is the only location authority.**
Nothing enumerates the `worktrees` directory: the reaper iterates record keys
(`plugins/session-relay/rust/src/fanout.rs:268-270`,
`records.keys().cloned().collect::<Vec<_>>()`). `worktrees` is also not a general GC
surface — `plugins/session-relay/rust/src/store.rs:879-891`'s `gc_surface_id` matches
only `"mailbox"`, `"watchers"`, and `"locks"` and ends `_ => return None`, and the
fan-out reaper is instead reached through its own
`gc_surface_dir(&self.surface_dirs, "worktrees")` call at `store.rs:1306`. A
worktree's location lives in the record's existing `worktree` field.

**That field already exists and is already universally readable.**
`plugins/session-relay/rust/src/fanout/authority.rs:98` declares
`pub worktree: String`; `fanout/authority.rs:188` lists `"worktree"` among the 20
`LEGACY_KEYS`, so it is present in all three accepted shapes. The authority applies no
shape constraint to it: `fanout/authority.rs:593-596` stores
`worktree: request.worktree.to_string_lossy().into_owned()` verbatim, with no
flat-path join and no component check. A nested value therefore needs **no** schema
change — this plan adds no field, no fourth `has_exact_keys` arm, and no new key.
Accepted key sets remain 20/21/25 (`fanout/authority.rs:200-213`).

**Why that constraint is load-bearing.** `from_json` accepts only those three exact
key sets and otherwise returns `None` (`fanout/authority.rs:221`), which `read_records`
converts to `Err("malformed fanout record {id}")`, and that read aborts on the
**first** bad row (`fanout/authority.rs:1043-1059`). The store is per-user, not
per-repository: it is `root.join(FANOUT_FILE)` (`fanout/authority.rs:1025-1027`) under
a relay home defaulting to `$HOME/.agent-relay` (`store.rs:51-57`), with no repository
component in the join. So a single unreadable record breaks fan-out for **every**
repository sharing that relay home. Mixed binary versions are normal here —
`plugins/session-relay/bin/relay:41-66` resolves `SESSION_RELAY_BIN`, then
`command -v session-relay`, then `${HOME}/.local/bin/session-relay`, with no home
isolation, and prebuilts ship alongside locally built binaries
(`scripts/lib/plugins.mjs:121-131`). Adding a key would have turned a storage-layout
change into a cross-repository outage; keeping the key set fixed confines the
**compatibility** cost — what a binary *lacking* this change suffers — to the reap
path described next. That is distinct from the migration cost inside this change,
which also covers the rollback path (step 4).

**What an older binary does with a nested record.** It parses the record normally, and
every site that *consumes* the persisted string keeps working — collect assigns
`let worktree = PathBuf::from(&record.worktree);` (`fanout.rs:742`) and passes it to
`remove_merged_worktree` (`fanout.rs:768`). Only sites that **recompute** a flat path
diverge, and they fail closed: the reap guard compares
`Path::new(&snapshot.worktree) != fanout.root().join("worktrees").join(&snapshot.reservation_id)`
and on mismatch executes a bare `continue` (`fanout.rs:276-285`) with no log and no
report entry, while `abandoned_worktree_decision` returns `Skipped`
(`fanout.rs:218-250`), which the reporter never records —
`FanoutGcOutcome::Skipped` produces no report row (`fanout.rs:49-57`). The result is a
silent leak — the exact failure this plan's one-day sweep bounds. For a binary
lacking this change that leak is the whole exposure, and it reaches no user-visible
verb. The rollback path is not part of that exposure, because it never diverges
across versions: its comparison always runs in the same process that wrote the path,
as the paragraph after next establishes. It still needs migrating in-version, which
is step 4.

**The persisted path is absolute, so the replacement check is a prefix test plus a
component walk.** `prepare_worktree` builds
`let worktrees = fanout.root().join("worktrees");` then
`let worktree = worktrees.join(&reservation_id);` (`fanout.rs:393-395`), and that
absolute string is what the record stores. The single helper this plan adds therefore
takes the absolute persisted string together with the **locally derived**
`fanout.root().join("worktrees")`, requires the persisted string to sit under that
root, strips the prefix, and validates only the remainder's components. The prefix
requirement is the containment boundary: it is computed from the store root, never
read from the record, so it cannot be satisfied by record content alone.

**Exact equality is one layer of the reap path's defense, not its only guard.** Before
deletion, `reap_abandoned_worktrees` also requires
`repo_identity(Path::new(&snapshot.worktree))` to satisfy
`identity.matches_record(&snapshot)`, with `Ok(_) | Err(_) => continue`
(`fanout.rs:290-292`) — so a candidate path must be a genuine git worktree whose
`repo_common_dir`, `repo_dev`, and `repo_ino` match the record. It then requires
`uncollected_commit_count(...) == Ok(0)` and a successful `ensure_clean`
(`fanout.rs:316-334`) before reaching
`remove_unstarted_worktree(Path::new(&record.repo_common_dir), Path::new(&record.worktree))`
(`fanout.rs:344-347`), which runs
`run_git(repo, &["worktree", "remove", &worktree_arg])` (`fanout/git.rs:135-138`).
`repo_identity(...).matches_record(...)` is the primary gate and stays untouched. What
exact equality contributed was a cheap structural layer in front of it, and removing
the flat expectation would remove that layer — so this plan restores it as a bounded
parse rather than claiming the parse is what prevents out-of-tree deletion. Acceptance
matches: the layer is proven by a direct test on the parser, because an end-to-end
"delete an arbitrary outside directory" probe is unconstructible while `matches_record`
stands.

**The rollback path needs the same structural resolution, because its comparison runs
in a different process whose input is untrusted.** `rollback_before_process_start`
currently rebuilds the flat path and hard-fails with
`Err("fanout worktree path is not the exact reserved path")` (`fanout.rs:445-447`),
guarding `remove_unstarted_worktree` at `fanout.rs:460`. Both of its callers
(`spawn.rs:1331` and `spawn.rs:1372`) sit inside `run_fanout_supervisor`
(`spawn.rs:1308`), which is a **separate process**: it is launched with
`.arg("__fanout-supervisor")` (`spawn.rs:1051`) and dispatched from argv by
`Some("__fanout-supervisor") => relay::spawn::run_fanout_supervisor(),`
(`plugins/session-relay/rust/src/main.rs:41`). That process takes its whole
configuration from standard input —
`let config = FanoutSpawnConfig::from_stdin()` (`spawn.rs:1309`) — and the parser
stores `cwd: required("cwd")?` (`spawn.rs:167`) with no path validation.
`prepare_worktree` runs in a different function and process, `run_fanout_spawn`
(`spawn.rs:1002-1004`). So `config.cwd` is **not** a trusted value in the comparing
process, and using it as the sole expectation would let one caller supply both sides of
the equality while also supplying `command`, whose failure drives the rollback. The
locally derived root is available there — the supervisor builds
`FanoutStore::new(store::home_dir())` (`spawn.rs:1310`) — so rollback resolves the
record through the same helper against `fanout.root().join("worktrees")`, and
`config.cwd` may only narrow that result, never replace it.

**Symlink safety is leaf-only today and must become per-component.** Resolution is by
a single path component: `statat(&worktrees.fd, reservation_id, AtFlags::SYMLINK_NOFOLLOW)`
at `fanout.rs:98-103` and again at `fanout.rs:120-125`, protecting only the named
leaf. Creation is weaker — `ensure_worktree_root` (`fanout/git.rs:56-68`) checks
whether the final `path` is a symlink, calls path-based `fs::create_dir_all`, which
follows intermediates, then re-checks only the final metadata. An intermediate
`<repo-key>` is therefore unprotected unless creation and resolution both walk
component by component. `rustix` 1.1 with the `fs` feature is already in use
(`plugins/session-relay/rust/Cargo.toml:17-19`; `fanout.rs:32` has
`use rustix::fs::{AtFlags, FileType, statat};` and `store.rs:22-23` already imports
`openat`), so `openat` with `DIRECTORY|NOFOLLOW` expresses the walk with no new
dependency. The walk is anchored on a borrowed descriptor rather than on
`GcSurfaceDir` itself, because that type and its fields are `pub(crate)`
(`store.rs:738-741`) and no integration test can construct one.
`workspace/schema.rs:490-507`'s `AbsPath::parse` is not reusable: it validates
absolute canonical paths, while this needs the remainder below an open directory fd.

**Depth is bounded, not open-ended.** The derivation in step 5 emits at most
`owner/repo` — two segments — so a valid remainder below `worktrees` is 1 component
(legacy flat), 2 (single-segment remote, or the digest and sentinel fallbacks), or 3
(`owner/repo` plus the reservation). The parser accepts exactly that range and rejects
anything deeper, because an unbounded walk over a record-supplied string is a larger
surface than the layout needs.

**The one-day age must not touch general retention.** `DEFAULT_GC_DAYS` is 14
(`store.rs:34`) and produces the single cutoff that `store.rs:1306-1313` passes to
`reap_abandoned_worktrees`. The fan-out age is introduced as that call's third
argument only, leaving `DEFAULT_GC_DAYS`, `AGENT_RELAY_GC_DAYS`, and every
mailbox/marker/watcher/lock/spawn-log age untouched. A reaper failure is externally
invisible at both callers — `bus.rs:612-614` logs `GC skipped: {e}` and
`hook.rs:299-301` prints `[session-relay/hook] GC skipped: {e}`, each continuing —
which is why the acceptance rows assert filesystem and record state rather than reaper
output.

**Both frozen inventories move, and both are declared.**
`plugins/session-relay/test/reentry-inventory.mjs:149-166` censuses runtime source for
operation patterns including `git_api`, which matches `run_git(`. Measured today,
`fanout.rs` contributes zero rows of any category while `fanout/git.rs` carries
eleven `git_api` rows (twelve `git`-category rows, the twelfth being
`direct_git_command`), out of 372 rows total. Step 5's derivation **adds exactly two**
`git_api` sites there — the remote read and the `git rev-list` fallback — and drifts
that census — `reentry-inventory.json` is therefore declared and regenerated rather
than asserted unchanged. Its `filesystem_probe` entries are only `statx` and `openat2`
and its `platform` entry matches `libc::<fn>(`, so using `rustix::fs::openat` adds no
row there. `rust-test-inventory.json` keys on cargo test-name sets
(`plugins/session-relay/test/rust-test-inventory.mjs:60-76`) and is asserted with the
message `<target>: executable test inventory drifted` (`rust-test-inventory.mjs:193`),
so added tests must be regenerated into it too.

**Test helpers must be shared, not duplicated.** `mutate_fanout_record` currently lives
in the `fanout` target at `plugins/session-relay/rust/tests/fanout.rs:1165`, and
integration-test targets are separate crates, so `tests/fanout_reap.rs` cannot call it.
Both files already declare `pub mod support;`, and the shared tree exists at
`plugins/session-relay/rust/tests/support/fanout.rs`, so the helper moves there.

## Environment & how-to-run

Repository: `DocksDocks/docks`, branch `main`. Run every command from the repository
root. Node 24 with pnpm via corepack; the Rust toolchain is pinned by
`plugins/session-relay/rust/rust-toolchain.toml`. Acceptance commands are bare, so
each row's exit status is its own.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add `pub fn resolve_worktree_path(worktrees_root: &Path, worktrees_fd: BorrowedFd<'_>, persisted: &str, reservation_id: &str) -> Result<PathBuf, String>`. First require `persisted` to sit under `worktrees_root` using **`Path::strip_prefix`, never `str::starts_with`** — a textual prefix test would admit `<root>/worktreesEVIL/<reservation_id>`, a different directory, turning the containment boundary into the hole it exists to close. `worktrees_root` is derived from the store root by the caller, never from the record. Split the stripped remainder on `/` manually rather than through `Path::components()` so empty components stay observable, then apply five rules in a fixed order, each returning its **own distinct error string**: empty component, `.` or `..`, a component outside `[a-z0-9._-]+`, depth outside 1-3 components, and a final component that is not `reservation_id`. Then walk from `worktrees_fd`, opening each non-final component with `rustix::fs::openat` under `OFlags::RDONLY \| OFlags::DIRECTORY \| OFlags::NOFOLLOW \| OFlags::CLOEXEC` and `statat(.., AtFlags::SYMLINK_NOFOLLOW)` on the leaf, distinguishing absent from symlink/non-directory with two further distinct messages. It takes a borrowed descriptor rather than `&store::GcSurfaceDir` because that type is `pub(crate)` (`store.rs:738-741`), and it is `pub` so the integration test reaches it as `relay::fanout::resolve_worktree_path`, the way `tests/fanout.rs:3` already imports `relay::fanout`. Use `rustix` only — no `libc::`, no `openat2` | `plugins/session-relay/rust/src/fanout.rs` | - | `local` | `planned` | A2 passes with every case asserting its own error message, and deleting any one of the six rules (the `strip_prefix` boundary plus the five component rules) fails at least one named case; if a bounded per-component walk cannot be expressed with `rustix` 1.1's `openat`, STOP |
| 2 | Retarget `old_worktree_snapshot` (`fanout.rs:98-116`) and `worktree_matches_snapshot` (`fanout.rs:120-133`) to take the persisted path plus `reservation_id` and resolve through step 1, preserving each function's current contract — `Ok(None)`/`false` for `NOENT` and for a non-directory, `Err` for other I/O failures, and the exact `dev`/`ino`/`mtime`/`mtime_nsec` equality in the matcher | `plugins/session-relay/rust/src/fanout.rs` | 1 | `local` | `planned` | A3 and A4 pass; if either contract cannot be preserved, STOP rather than widening what counts as absent |
| 3 | Replace the reap-path recomputations with step 1's helper: `abandoned_worktree_decision` (`fanout.rs:218-250`) and `reap_abandoned_worktrees` (`fanout.rs:276-285`). Keep each site's existing failure behaviour — `Skipped` and the bare `continue` respectively — and leave the `repo_identity(...).matches_record(...)` gate at `fanout.rs:290-292` and the commit-count and cleanliness gates at `fanout.rs:316-334` exactly as they are | `plugins/session-relay/rust/src/fanout.rs` | 1, 2 | `local` | `planned` | A3, A4, and A6 pass; a missed site shows as a nested worktree that is never reaped |
| 4 | Resolve the rollback path through step 1 as well. In `rollback_before_process_start`, replace the rebuilt flat expectation (`fanout.rs:445-447`) with `resolve_worktree_path` against the locally derived `fanout.root().join("worktrees")`, keeping the hard `Err` on failure so `remove_unstarted_worktree` (`fanout.rs:460`) stays guarded. A `&config.cwd` equality may be added as an extra narrowing check but must **not** replace the resolution: both call sites are inside `run_fanout_supervisor` (`spawn.rs:1308`), a separate process whose config arrives via `FanoutSpawnConfig::from_stdin()` (`spawn.rs:1309`) with `cwd: required("cwd")?` unvalidated (`spawn.rs:167`) | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/spawn.rs` | 1 | `local` | `planned` | A8 and A12 pass — A12 proving an out-of-tree record is refused. If the resolution is replaced by a `config.cwd` comparison alone, STOP |
| 5 | Derive the repo key in a new `pub(super) fn repo_key_from_repo(repo: &Path) -> Result<String, String>` in `fanout/git.rs`, called once from `prepare_worktree` before `fanout.reserve` (`fanout.rs:393-396`). It must live in `git.rs` because `run_git` (`fanout/git.rs:235`) and `run_git_bytes` (`:241`) are module-private while every export there is `pub(super)` (`:39`, `:43`, `:56`, `:70`, `:79`, `:83`, `:125`, `:135`, `:144`, `:148`, `:183`, `:224`) — so `fanout.rs` cannot invoke git at all, and widening `run_git` would put a new `git_api` census row in a file that has none. From the remote, strip scheme, userinfo, host and port including the scp-style `host:` form, strip a trailing `.git`, take the last two non-empty segments, and lowercase them. **If any resulting segment is empty, contains a separator, or falls outside step 1's charset `[a-z0-9._-]+`, fall through to the digest fallback rather than failing** — the digest is hex and therefore in-charset by construction, so no reachable remote can make `prepare_worktree` fail where it succeeds today. This matters because `prepare_worktree` reads no remote at all now (`fanout.rs:378-395`) and is the sole creator of fan-out worktrees (`spawn.rs:1004`), so returning `Err` on an exotic remote — a percent-encoded segment, an scp-style `~user`, a non-ASCII name — would be a new user-visible regression. The fallback chain is therefore: remote-derived key, else a digest of sorted root-commit oids from `git rev-list --max-parents=0 HEAD`, else a fixed sentinel when there are no commits; never the local path. Separately, replace `ensure_worktree_root`'s path-based `fs::create_dir_all` (`fanout/git.rs:56-68`) with a per-component create-and-open walk under step 1's flags, so no intermediate component can be a symlink. `ensure_worktree_root` has one caller (`fanout.rs:394`), so no other surface changes | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/fanout/git.rs` | 1 | `local` | `planned` | A1, A4, A5, A10, and A13 pass; if the digest fallback itself cannot yield an in-charset key, STOP |
| 6 | Introduce a fan-out-worktree-specific one-day default and pass its cutoff **only** as the third argument of the `reap_abandoned_worktrees` call at `store.rs:1306-1313`. Leave `DEFAULT_GC_DAYS` at 14 (`store.rs:34`) and `AGENT_RELAY_GC_DAYS`'s meaning unchanged | `plugins/session-relay/rust/src/store.rs` | 3 | `local` | `planned` | A6 passes, showing a two-day-old fan-out worktree reaped while a two-day-old shared-store surface is retained; if the cutoff cannot be scoped to that argument, STOP |
| 7 | Move `mutate_fanout_record` from `tests/fanout.rs:1165` into `tests/support/fanout.rs` so both targets can plant values, updating its five existing callers (`tests/fanout.rs:1190`, `:1742`, `:1754`, `:1897`, `:2147`). `tests/support/mod.rs` already declares `pub mod fanout;`, so it needs no edit. Convert the flat worktree counts to recursive reservation-leaf counts in `authority_child_depth_and_root_are_not_caller_forgeable` (`tests/fanout.rs:320`, asserting at `:324` and `:334`), `authority_managed_worker_cannot_create_a_nested_root` (`:342`, asserting at `:345` and `:356`), `authority_terminal_root_cannot_admit_a_new_leaf` (`:364`, asserting at `:374` and `:388`), and `corrupt_result_never_self_heals_merges_or_releases_capacity` (`:1715`, asserting at `:1797` and `:1813`), because a flat count cannot see an extra reservation added under an existing repo-key directory. Convert the same count in `workspace_and_legacy_fanout_share_repository_gate` (`tests/workspace_coordination_process.rs:873`, asserting at `:973-977`), which is not optional: its flat `== 0` breaks outright under the nested layout. Add the tests named in A1-A8, A12, and A13, including both fixture remotes those rows require — a plain `origin` for A5's two-segment key, and an scp-style `git@host:~user/repo.git` for A13's out-of-charset case — then regenerate both fixtures | `plugins/session-relay/rust/tests/fanout.rs`, `plugins/session-relay/rust/tests/fanout_reap.rs`, `plugins/session-relay/rust/tests/support/fanout.rs`, `plugins/session-relay/rust/tests/workspace_coordination_process.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json`, `plugins/session-relay/test/fixtures/reentry-inventory.json` | 1, 2, 3, 4, 5, 6 | `local` | `planned` | A7, A9, A10, and A13 pass. Leaving the `workspace_coordination_process` count flat fails A7's second command immediately; leaving a `tests/fanout.rs` count flat is caught by A7's probe, not by the unmutated run |
| 8 | Amend the retention sentence at `plugins/session-relay/AGENTS.md:28` so the fan-out worktree sweep is stated as one day while the shared-store threshold stays 14 days and `AGENT_RELAY_GC_DAYS` keeps its documented meaning. Do not describe a filesystem path there — the file documents no fan-out path today | `plugins/session-relay/AGENTS.md` | 6 | `local` | `planned` | A11 passes with both ages present and distinguished; if the sentence cannot separate them without describing a path, STOP |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout` | Passes. A nested reservation is created through the already-`pub` `fanout::prepare_worktree`; the test then reads `home.join("fanout-v1.json")` directly — the mechanism `tests/fanout.rs:1896` already uses — and asserts the record's serialized key set is exactly today's and its `worktree` is the nested path, then reparses through the already-`pub` `FanoutStore::read` (`fanout/authority.rs:301`) and asserts the same `worktree`. It does **not** call `to_json`/`from_json`, which are private inherent methods (`fanout/authority.rs:116`, `:176`) unreachable from this integration crate. Mutation probe: add any 26th key to the record writer; the key-set assertion fails. No earlier guard can shadow the row, because it reads the persisted object rather than travelling the reap or spawn paths |
| A2 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout` | Passes. A direct test on step 1's parser rejects seven cases, each asserting the **exact error message** of the rule that rejected it rather than mere `is_err()`. Every persisted value is absolute, so the cases are: `/etc/<reservation_id>` (outside `worktrees_root`); `<root>/worktreesEVIL/<reservation_id>`, which shares the textual prefix but is a different directory and is the case that pins `Path::strip_prefix` against a `str::starts_with` implementation; `<root>/worktrees/../<reservation_id>` (relative component); `<root>/worktrees/a//<reservation_id>` (empty component); `<root>/worktrees/A/<reservation_id>` (component charset); `<root>/worktrees/a/b/c/<reservation_id>` (depth 4); and `<root>/worktrees/<repo-key>/<other-uuid>` (leaf is not the reservation id). Asserting the message is what makes each case falsifiable: several inputs trip more than one rule, so an `is_err()` assertion would survive deleting the rule under test, whereas the observed message changes and the case fails. Mutation probe: delete any one rule, or swap `strip_prefix` for `starts_with`; every case naming that rule's message fails. It lives in the `fanout` integration target rather than an in-crate `#[cfg(test)]` module because the inventory's `runnableTargets` (`rust-test-inventory.mjs:19-20`) contains no `lib` case and `--case` rejects unknown names (`rust-test-inventory.mjs:114`), so a `--lib` test would sit outside the frozen inventory A9 asserts. Deliberately not an end-to-end deletion test: `repo_identity(...).matches_record(...)` (`fanout.rs:290-292`) rejects any out-of-tree path before deletion is reached |
| A3 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout_reap` | Passes. A legacy record whose `worktree` is `<root>/worktrees/<reservation_id>`, aged past the fan-out cutoff, is still reaped. Mutation probe: narrow step 1's accepted depth to 2-3 so a one-component remainder is refused; this row fails by name. Single-site proof that the migration window exists |
| A4 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout_reap` | Passes. A nested `<root>/worktrees/<repo-key>/<reservation_id>` record aged past the cutoff is reaped and its directory is gone. Mutation probe: leave `abandoned_worktree_decision` recomputing the flat path while updating only the reap loop; the nested worktree is skipped and this row fails. Distinct from A3 because each probe breaks exactly one shape |
| A5 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout` | Passes. The test first gives its fixture repository an `origin` remote so step 5's derivation yields a **two-segment** key `<owner>/<repo>`: the existing `init_repo` (`tests/fanout.rs:46-49`) creates no remote, and with none the derivation falls to the single-segment digest fallback, which would make the symlink a *final* component rather than an intermediate. It pre-creates `worktrees/<owner>` as a symlink to a directory outside the relay home, then asserts `prepare_worktree` fails with the exact message emitted by step 5's per-component walk, and that the symlink's target tree contains **no reservation leaf at any depth** — equivalently that `<symlink target>/<repo>/<reservation_id>` does not exist. The depth matters: with a two-segment key the leaf would land one component below the target, so asserting `<symlink target>/<reservation_id>` would name a path absent under both builds and prove nothing. The check runs against the target directory the test created, because `add_worktree` hands git the path as a string (`fanout/git.rs:131`), so under the mutation the leaf lands at the target while the record still reads the logical path. Mutation probe: drop `OFlags::NOFOLLOW` from step 5's walk; a leaf appears under the target and this row fails. The intermediate is essential: `ensure_worktree_root`'s pre-existing leading refusal (`fanout/git.rs:57-59`) already rejects a symlinked *final* component, so a one-segment key would let this row pass without exercising step 5 |
| A6 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout_reap` | Passes. A two-day-old abandoned fan-out worktree is reaped while a two-day-old shared-store surface under the same relay home is retained; together these pin the one-day cutoff to the third argument at `store.rs:1306-1313`. **Two mutation probes, one per direction**, because each half needs its own: pass the shared 14-day cutoff at that argument and the reaped half fails; set `DEFAULT_GC_DAYS` (`store.rs:34`) to 1 and the retained half fails. A single probe would leave one assertion unable to fail, since a two-day-old shared surface is retained under both 14 and 1 |
| A7 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout` and `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test workspace_coordination_process` | Both pass. The second command is required because the load-bearing conversion is `workspace_and_legacy_fanout_share_repository_gate` (`tests/workspace_coordination_process.rs:873`), whose flat `== 0` count at `:973-977` fails outright under the nested layout: its two successful reservations (`:886` root, `:894` child) create repo-key directories, and collection (`:915`, `:933`) removes only the reservation leaf via `run_git(parent_dir, &["worktree", "remove", ...])` (`fanout/git.rs:198-201`), with no `remove_dir` anywhere in `fanout.rs` or `fanout/git.rs` to prune the empty parent — so the key directories survive and `fs::read_dir(legacy_home.join("worktrees")).count()` is 1 rather than 0. Only a recursive reservation-leaf count still reads 0. Mutation probe: make the refusal path leave a reservation leaf behind under an existing repo-key directory — the reservation is still refused, so each `tests/fanout.rs` test's pre-existing `.unwrap_err()` (`:326`, `:347-348`, `:376-377`, `:1800-1810`) still succeeds and execution reaches the counts; the recursive assertion then fails while a flat `fs::read_dir(home.join("worktrees")).unwrap().count()` would not notice, because the leaked leaf sits below what it observes. A probe that merely lets the reservation succeed is useless: it trips `.unwrap_err()` first and the row fails without saying anything about the conversion |
| A8 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout` | Passes. A nested reservation whose spawn fails before process start reaches `FanoutState::FailedNoProcess` with its worktree removed. The deterministic pre-start failure mechanism already exists and is adapted rather than invented: `tests/fanout.rs:432-452` launches `CARGO_BIN_EXE_relay` with a tool whose command environment variable is unset and asserts the launch fails, then `tests/fanout.rs:461-470` asserts the persisted `FailedNoProcess` state, the absent worktree, and the released capacity. Mutation probe: keep `fanout.rs:445-447` rebuilding the flat path; rollback returns `fanout worktree path is not the exact reserved path`, the record stays `Reserved`, and this row fails |
| A9 | `node plugins/session-relay/test/rust-test-inventory.mjs --case fanout` and `node plugins/session-relay/test/rust-test-inventory.mjs --case fanout_reap` | Both exit 0, after regeneration with `node plugins/session-relay/test/rust-test-inventory.mjs --generate`. `--case` is mandatory: `rust-test-inventory.mjs:111-112` asserts `caseIndex >= 0 && process.argv[caseIndex + 1]` with `usage: node rust-test-inventory.mjs --case <name>`, and only `--generate` (`:67`) exits 0 earlier, so a bare invocation cannot pass and would leave the fixture ungated. Mutation probe: add any test this plan names without regenerating; the matching case fails with `<target>: executable test inventory drifted` (`rust-test-inventory.mjs:193`), which is reachable only under `--case` because `actual = listTests(name)` (`:192`) runs per named target |
| A10 | `node plugins/session-relay/test/reentry-inventory.mjs` | Exits 0 against a fixture regenerated with `node plugins/session-relay/test/reentry-inventory.mjs --generate`. Expected: **exactly two** new rows, both `git_api` in `fanout/git.rs` — a file whose baseline is eleven `git_api` rows (twelve `git`-category) — arising from step 5's `repo_key_from_repo` reading the remote and running its `git rev-list` fallback. `fanout.rs` must still contribute zero rows of any category, which is why step 5 places the derivation behind a `pub(super)` helper rather than widening `run_git` (`fanout/git.rs:235`). Expected also: no `filesystem_probe` or `platform` row appears anywhere, since the walk uses `rustix::fs::openat`/`statat` and the census matches only `statx`, `openat2`, and `libc::<fn>(` (`reentry-inventory.mjs:149-166`). Mutation probe: replace one `rustix::fs::openat` with `libc::openat`; a `platform`/`libc` row appears and this row fails |
| A11 | `node scripts/ci.mjs --plugin session-relay` | Exits 0. The authoritative selected-plugin gate, run last, and the row that observes the `AGENTS.md` edit through the plugin's own checks |
| A12 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout` | Passes. The test creates the out-of-tree directory as a real directory, plants it as the `worktree` of a `Reserved` record with the relocated `mutate_fanout_record` helper, then drives rollback by invoking `CARGO_BIN_EXE_relay __fanout-supervisor` — the hidden subcommand dispatched at `src/main.rs:41` — writing a `FanoutSpawnConfig` to its stdin (`spawn.rs:1309`) whose `cwd` is that same path and whose `command` is a missing binary, so `command.spawn()` fails at `spawn.rs:1368` and the rollback branch runs. The preconditions at `fanout.rs:436-441` are met without the test pre-binding anything: the supervisor mints its own `worker_id` and `generation` via `create_managed_birth` (`spawn.rs:1312-1318`) and binds them with `bind_managed` (`spawn.rs:1322`), which performs no worktree-path validation (`fanout/authority.rs:348-383`). This route is necessary because `rollback_before_process_start` is `pub(crate)` (`fanout.rs:424`) and unreachable from this crate, and the `relay spawn --fanout` path A8 uses offers no window to rewrite the record between reservation and rollback — `run_fanout_spawn` sets `cwd: reservation.worktree.clone()` (`spawn.rs:1029`) in one invocation. **The assertion is on the suffix, not the whole string.** On rollback `Err` the supervisor reports `format!("{message}; rollback retained capacity: {rollback_error}")` (`spawn.rs:1381-1383`) where only `rollback_error` is step 4's resolution message; the `message` prefix is `format!("failed to launch {}: {error}", config.command)` (`spawn.rs:1371`) and embeds OS-dependent io text, so the row asserts that the value after `"; rollback retained capacity: "` equals step 4's message and deliberately does not pin the prefix. The value is read by parsing the supervisor's **stdout** as JSON: `pump_fail` (`spawn.rs:678-680`) routes through `pump_report`, which `println!`s a one-key `{"error": ...}` object (`spawn.rs:666-675`), and the launcher pipes stdout while nulling stderr (`spawn.rs:1052-1054`). The row also asserts the out-of-tree directory still exists and the record has not reached `FailedNoProcess`. The suffix is what makes it falsifiable: rollback's later `repo_identity(worktree)?` (`fanout.rs:450`) and `ensure_clean(worktree, ...)` (`fanout.rs:452`) reject an out-of-tree path anyway, so both state assertions hold with step 4's resolution deleted. Mutation probe: make step 4 compare only against `&config.cwd`; the two sides are then equal by construction, rollback proceeds past step 4, and the suffix becomes `repo_identity`'s message instead — or vanishes entirely if the rollback succeeds, since `Ok(_) => message` (`spawn.rs:1380`) reports no suffix at all. Either way the row fails |
| A13 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test fanout` | Passes. A fixture repository whose `origin` remote carries an out-of-charset segment — an scp-style `git@host:~user/repo.git` — still reserves successfully, and the resulting `worktree` path's key components are all `[a-z0-9._-]+`, proving step 5 fell through to the digest fallback instead of failing. Mutation probe: make step 5 return `Err` on an out-of-charset segment instead of falling through; `prepare_worktree` fails and this row fails. This row exists because that regression would be invisible otherwise: no other row exercises a remote step 5's charset rejects, and `prepare_worktree` reads no remote at all today (`fanout.rs:378-395`) |

## Out of scope / do-NOT-touch

- **Any `FanoutRecord` schema change.** No new field, no fourth `has_exact_keys` arm,
  no change to the 20/21/25 accepted key sets (`fanout/authority.rs:200-213`), and no
  `schema_version` bump — `read_records` rejects a changed envelope schema for the
  whole file (`fanout/authority.rs:1035-1042`), which would break every record
  including untouched ones. `fanout/authority.rs` is absent from `affected_paths`
  because `fanout/authority.rs:593-596` stores the supplied path verbatim with no
  shape validation.
- **The `repo_identity` and cleanliness gates.** `fanout.rs:290-292` and
  `fanout.rs:316-334` are the reap path's primary guards and are not modified,
  reordered, or weakened; step 1's parser is added in front of them, not instead of
  them.
- **Collect's removal path.** `remove_merged_worktree` (`fanout/git.rs:183`) consumes
  `record.worktree` at its `run_git(parent_dir, &["worktree", "remove", record.worktree.as_str()])`
  (`fanout/git.rs:198-201`) and is guarded by its own clean and identity checks
  (`ensure_clean` at `fanout/git.rs:194`, `repo_identity(worktree)?.matches_record(record)`
  at `fanout/git.rs:195-197`) rather than by path equality, so it is left exactly as it
  is; this plan does not widen or narrow it.
- **The Rust test inventory harness.** `plugins/session-relay/test/rust-test-inventory.mjs`
  is not edited: every new test lands in the existing `fanout` or `fanout_reap`
  targets, which are already `runnableTargets` (`rust-test-inventory.mjs:19-20`), so
  only the generated fixtures change.
- **`protocol.rs` and `WorkerResultV1`.** A different, JCS closed-key record type.
- **Refusing a tmpfs relay home.** Deferred to its own plan: the guard belongs where
  every relay command passes, and this repository's own harness roots fan-out homes at
  `os.tmpdir()` (`plugins/session-relay/test/fanout-smoke.mjs:14`,
  `plugins/session-relay/test/workspace-smoke.mjs:165` and `:501`), with
  `fanout-smoke.mjs` tracked as evidence in
  `plugins/session-relay/test/release-evidence-contract.mjs:78` and
  `plugins/session-relay/test/remediation-contract.mjs:48`. Separate blast radius;
  none of those files are declared here.
- **The root `AGENTS.md` worktree rule.** `AGENTS.md:146` governs *agent scratch*
  worktrees under `$XDG_DATA_HOME/agent-worktrees/<repo>/<slug>`, a different subject
  from Session Relay fan-out worktrees. Not edited.
- **`SKILL.md` and its `content_hash`.** Its fan-out text
  (`plugins/session-relay/skills/productivity/session-relay/SKILL.md:248-250`) states
  only the logical topology and its 14-day text
  (`plugins/session-relay/skills/productivity/session-relay/SKILL.md:97`) concerns
  shared-session hygiene; neither names a fan-out path or the fan-out sweep age, so no
  edit and no `content-hash.mjs --backfill` run is required.
- **General retention.** `DEFAULT_GC_DAYS` stays 14 and `AGENT_RELAY_GC_DAYS` keeps
  its meaning; mailbox, marker, watcher, resume-lock, hook-state, and spawn-log ages
  are untouched.
- **Making committed work collectable.** The sweep still retains any worktree with
  commits beyond base, pushed or not; a `pushed` predicate would loosen a guarantee
  and is a separate decision.
- **The public workspace surface.** `plugins/session-relay/AGENTS.md:52` lists
  `relay workspace preserve|start|list|inspect|handback|integrate|recover|finish|abort`;
  no verb, flag, or output shape changes.
- **Reclaiming worktrees already stranded at unexpected paths.** Pre-existing
  worktrees whose recorded path resolves under neither shape stay skipped, exactly as
  today.

## STOP conditions

1. A bounded per-component walk cannot be expressed with `rustix` 1.1's `openat`
   without adding a dependency or a `libc::` call — the latter would add a `platform`
   census row that A10 forbids.
2. Any acceptance row's mutation probe passes, meaning the row cannot fail.
3. The one-day cutoff cannot be confined to the third argument at
   `store.rs:1306-1313` without altering `DEFAULT_GC_DAYS` or `AGENT_RELAY_GC_DAYS`.
4. Preserving `old_worktree_snapshot`'s or `worktree_matches_snapshot`'s
   absent-vs-error contract proves impossible, so a resolution failure would be
   reported as "no worktree" and silently widen what the reaper deletes.
5. Step 4 cannot resolve the record against a locally derived root and would have to
   trust `config.cwd`, which arrives unvalidated from standard input
   (`spawn.rs:167`, `spawn.rs:1309`).
6. Implementing step 1 or step 3 would require touching the `repo_identity` or
   cleanliness gates, which this plan declares out of scope.
7. The regenerated `reentry-inventory.json` shows a new row in any file other than
   `fanout/git.rs`, or any `filesystem_probe` or `platform` row anywhere.

## Open questions

None. The mechanism, the containment contract, and the version target were settled
before drafting. The rejected alternative — adding a `repo_key` field and a fourth
26-key arm — is recorded above with its measured cross-repository blast radius, and a
`schema_version` bump was measured to be strictly worse than that.

## Review

Pending.

Plan-attempt-history: {"authorization_source_sha256":"70d3144989e996dcd695c2ff5005a65413ec6ace75c91dcc08a7dfb032eba1e8","plan_bytes_sha256":"b1199ab13f01a1e1cf572671487127e702ea604fc61830d6857ef57e746b2d85","replacement_run_id":"3082c785-e6b0-488d-93e6-851de2a9bcae","run":{"acceptance":null,"blocker":{"evidence_sha256":"37b393672e30730dbf51e36f92029e7312df08e1bdd99c42a19a8aaf9293af64","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"ee1489822cb633a61f6f6d858d26693eef0c54f652e83cae04cea8a761ac0b3c","invocations":2,"result_sha256":"37b393672e30730dbf51e36f92029e7312df08e1bdd99c42a19a8aaf9293af64","state":"blocked"},"execution_parent":null,"goal_id":"6d682812-3fc7-4ddf-bd9a-f0539e5b22bb","implementation_commit":null,"plan_path":"docs/plans/active/relay-worktree-portable-layout.md","plan_sha256":"cf64c953da06c2d6c8b8d74d4126985dc365794da3da47b108ad16508283c3dc","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"d756fc6e-e272-4362-ae98-0a2b7aff6dda","schema":1,"source_base":"07229eaf498c53267ef982e52ca035d7c14dca5c","source_sha256":"c3cdceae616f18fc5a076666ec81c833201b7c640f6c695897e4f659d4e8ee56"},"schema":1,"status":"blocked","successor_run_sha256":"8259209db03c38e2abab050d86d5d6413890a7bdd392ee5ebf0e8cfb9e520fb3"}
Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"3d30d8348b448ba75ab71f77bcb87b74caae8c4e4b9171503cb952e631f4a908","invocations":2,"result_sha256":"daf04c472cb805ae16487b02a4cd51aed9cff5f7f1f931008ba4d67e513aa9cc","state":"passed"},"execution_parent":"3ebf1e9703ad56649965b98d37698a5bf52afd90","goal_id":"6d682812-3fc7-4ddf-bd9a-f0539e5b22bb","implementation_commit":null,"plan_path":"docs/plans/active/relay-worktree-portable-layout.md","plan_sha256":"7b8fb6df4791987aafdad69d703b98327252f64d201dbf2b038a002e17a43bb1","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"3082c785-e6b0-488d-93e6-851de2a9bcae","schema":1,"source_base":"9659e831eabb45cddcc83d1c7ebe26145ace768b","source_sha256":"0aef1f40fbc99da8c3d412c546d9d852e4f98ccdcc77474fa07e82963f0f7f85"}

## Verification Results

Pending.
