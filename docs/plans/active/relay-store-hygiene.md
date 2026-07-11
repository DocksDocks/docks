---
title: Session-relay store hygiene — inactivity GC, spawn-log bounding, long-runner memory audit
goal: Give ~/.agent-relay self-cleanup (14d-inactive sessions self-delete), bound the unbounded spawn-log growth, and audit/fix memory behavior of the relay's long-running loops.
status: in_review
created: "2026-07-10T18:26:49-03:00"
updated: "2026-07-10T20:57:51-03:00"
started_at: "2026-07-10T18:28:20-03:00"
in_review_since: "2026-07-10T20:57:51-03:00"
assignee: relay-hygiene-worker (codex gpt-5.6-sol relay session)
tags: [session-relay, rust, hygiene, gc]
affected_paths:
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/skills/
  - docs/plans/active/relay-store-hygiene.md
related_plans:
  - finished/2026-07-10-relay-notify-reliability.md
review_status: passed
planned_at_commit: 866312af540b905b9a5cb4e96f9bb2b41d1b2a10
---

## Goal

The shared store `~/.agent-relay/` grows without bound and holds state for sessions that will never return. User directive (2026-07-10): sessions inactive for ~14 days self-delete, and "fix memory management and possible memory leaks". Three deliverables: (1) an opportunistic, throttled inactivity GC over every store surface; (2) a hard bound on spawn-log growth (the store's dominant weight); (3) a measured audit — and fixes where real — of the long-running processes' memory behavior (`relay bus`, `relay watch` doorbell and `--follow` modes).

## Context & rationale (audited 2026-07-10, live store + source)

- Live store evidence: `~/.agent-relay` = **52M** total; `spawn-logs/` = 52M of it (8 files; top two `.stderr` files are 28.1M and 18.0M — full codex event streams). `locks/` 8K, `mailbox/` 20K (4 files), `markers/` 28K (6), `watchers/` 12K (2), `registry.json` 11.6K (2 entries).
- `spawn.rs:341-361`: every `relay spawn` creates `spawn-logs/<id>.stderr` (`File::create`, child stderr piped in) — no cap, no rotation, no deletion anywhere.
- The crate has **no GC of any kind**: the only `remove_file`/`remove_dir` calls are the stale mkdir-lock reclaim (`store.rs:434`) and one drain-path removal (`store.rs:670`).
- Mailboxes are bounded in the happy path: `drain()` truncates via `set_len(0)` (`store.rs:251`) — but a session that dies and never drains keeps its mailbox forever; same for its registry entry, cwd markers, watcher offset/lock files.
- Registry entries carry `last_seen` (`store.rs:467`, refreshed `iso_now()` at `store.rs:577`) — the primary inactivity signal. Sessions can also exist store-side WITHOUT registry entries (markers/mailboxes from discover-path wakes), so GC must key off per-surface mtimes too, not registry alone.
- Long-runner loops to audit: `watch.rs:230-299` doorbell loop (bounded `woken`/`wake_retries` maps keyed by target — fine at a glance, but `store::peek` re-reads the whole mailbox every 1s-ish tick), `read_follow_bytes` (`watch.rs:302-322`, `pending` drains per newline — bounded unless a mailbox line is pathological), `relay bus` (per-request allocs; long-lived per session), `hook.rs` (short-lived).
- Policy decisions taken (defaults, not open questions): threshold **14 days** (user-named), env override `AGENT_RELAY_GC_DAYS` (0 disables), GC runs opportunistically (no daemon) from `relay hook` and `relay bus` startup, throttled to at most once per 6h via a `gc-stamp` mtime file in the store root.

## Environment & how-to-run

- Repo `/home/vagrant/projects/docks`; branch `codex/relay-store-hygiene`; never push.
- Rust gates need `export PATH="$HOME/.cargo/bin:$PATH"` (rustup 1.85.0 + musl target installed on this box; if `cargo` is missing from a gate's output, the gate silently skipped — treat as failure).
- Full plugin gate: `node scripts/ci.mjs --plugin session-relay` (fmt, clippy -D warnings, --locked host rebuild + byte-compare vs committed binary [warns locally, fails CI], SHA256SUMS, shellcheck launcher, hooks JSON, skills gate, selftest).
- Selftest alone: `node plugins/session-relay/test/selftest.mjs`. Store override for tests: `AGENT_RELAY_HOME=<tmpdir>`.
- Do NOT commit locally built binaries — `bin/` changes only via build-binaries.yml artifacts at release time (plugin AGENTS.md constraint).

## Steps

| # | Task | Status |
|---|------|--------|
| 1 | Memory/growth audit of the long-runners with MEASUREMENTS in `## Notes`: (a) `relay bus` RSS across a scripted 500-message send/inbox session; (b) `relay watch` doorbell RSS across ≥30min simulated polling with a growing-then-drained mailbox; (c) `--follow` RSS across a large appended mailbox incl. one pathological no-newline line ≥8MB (documents the known unbounded `pending` case: cap or accept with a recorded bound); (d) confirm/refute the per-tick full-mailbox `peek` read as a growth/IO concern given drain-truncation. Fix what is real; record verdicts per item. | done |
| 2 | Inactivity GC in `store.rs` (single entry point `store::gc(now)`): a session is GC-eligible when ALL its surfaces are older than the threshold (registry `last_seen` when present, plus mtimes of its mailbox/markers/watcher-offset/lock/spawn-log files) AND its watcher lock and resume lock are NOT currently held (held lock = active regardless of age). Eligible → remove its registry entry, mailbox file, cwd markers, watcher offset+lock files, spawn-log files. Orphan surfaces without registry entries age out by mtime alone. Threshold: 14d default, `AGENT_RELAY_GC_DAYS` override (`0` = disabled). Trigger: `relay hook` (both tools) and `relay bus` startup, throttled via `gc-stamp` mtime (≥6h between sweeps); never GC the invoking session's own id. GC only relay-owned paths inside the store root — refuse to operate if the store root resolves outside `$HOME`/`AGENT_RELAY_HOME`. | done |
| 3 | Spawn-log bounding in `spawn.rs`: cap live growth (streaming tail-cap or size-capped writer — child stderr must keep flowing; document the chosen mechanism) so a single spawn log cannot exceed ~4MB, keeping the newest content (the diagnostic tail). Existing oversized logs are handled by Step 2's age GC; additionally `relay spawn` truncates ITS OWN target log file at spawn start (already `File::create` — verify). | done |
| 4 | Selftest coverage (extend `test/selftest.mjs`, `AGENT_RELAY_HOME` sandbox): seeded store with (i) aged-out session (fake old mtimes + old `last_seen`) → GC removes exactly its surfaces; (ii) aged-out but HELD watcher lock → survives; (iii) young session → survives; (iv) invoker's own session aged → survives; (v) `AGENT_RELAY_GC_DAYS=0` → no-op; (vi) gc-stamp throttle honored; (vii) spawn-log cap enforced. Re-derive the selftest count from its summary line. | done |
| 5 | Docs: update the `session-relay` skill + plugin AGENTS.md sections that describe the store (new GC behavior, env knob, spawn-log cap); `node scripts/ci.mjs --plugin session-relay` fully green (PATH note above). | done |

## Acceptance criteria

- Step 1's measurement table exists in `## Notes` (component → scenario → RSS start/end → verdict fixed/bounded/accepted-with-bound).
- Selftest: all new GC/cap cases pass; full selftest green; count re-derived.
- `node scripts/ci.mjs --plugin session-relay` exit 0 (with cargo present in PATH — verify the fmt/clippy legs actually ran in the output).
- Manual proof on a THROWAWAY `AGENT_RELAY_HOME`: seed aged surfaces, run `relay hook`, verify exact removal set and that a second immediate run is throttled by the stamp.
- The live `~/.agent-relay` is untouched by all testing (every test uses `AGENT_RELAY_HOME`).
- No committed `bin/` changes in this plan (binaries move only at release).

## Out of scope / do-NOT-touch

- Releasing (build-binaries dispatch, version bump, tagging) — separate step after ship, user-gated.
- Mailbox message-level retention/archival semantics beyond existing drain-truncation.
- The docks/effect-kit plugins; the public repo.
- `bin/` committed binaries and `SHA256SUMS`.

## Cold-handoff checklist

- File manifest: exact files + line cites in Context. ✔
- Environment & commands: cargo PATH gotcha, gate commands, store override env. ✔
- Interface/data contracts: GC eligibility rule, trigger+throttle, env knob, cap size stated in Steps. ✔
- Executable acceptance: seeded-store proofs + selftest + ci.mjs exits. ✔
- Out of scope: listed. ✔
- Decision rationale: 14d user-named; opportunistic+throttled GC because there is no daemon; held-lock-wins because liveness beats age (0.9.0's lock semantics); tail-cap because the diagnostic value of spawn logs is in the newest output. ✔
- Known gotchas: cargo-absent silent skip; sessions existing without registry entries; never GC self; store-root safety refusal; binaries-not-from-local-builds. ✔

## Self-review

Score: 94/100 · trajectory 94 · stopped: single-pass (5 steps, no risk-flagged step; audit-first citations from live store + source this session). Standalone executability: every step names files, mechanisms, thresholds, and proof; Step 1 is measurement-gated so "fix memory leaks" cannot be hand-waved; Step 2's eligibility rule is stated precisely enough to implement without guessing. Residual: the exact spawn-log cap mechanism is left as a named choice (streaming tail-cap vs capped writer) with the constraint set — deliberate, implementation-informed. No open questions: threshold and behavior were user-directed; the rest is engineering with recorded defaults.

## Notes

### Step 1 memory and growth measurements

All processes used the source-matching release binary and an explicit throwaway `AGENT_RELAY_HOME` under `/tmp`; no measurement touched `~/.agent-relay`. RSS values come from `/proc/<pid>/status` (`VmRSS`).

| Component | Scenario | RSS start | RSS end / peak | Verdict |
|---|---|---:|---:|---|
| `relay bus` | One persistent MCP server, 500 cycles of a 1 KiB `send` followed by explicit-recipient `inbox` (1,000 tool calls) | 2,540 KiB | 2,740 KiB end and peak; flat from cycle 200 through 500 | **Bounded; no fix.** Per-request allocations are released and the process reaches a stable plateau. |
| `relay watch` doorbell | 30.01 minutes wall clock; append 1 MiB/min for 15 samples, drain, then poll an empty mailbox through the end | 2,712 KiB | 12,604 KiB end; 29,904 KiB peak at a 12,583,167-byte mailbox | **Fixed.** RSS did not grow after drain, so this was not retained-map leakage; the poll loop now uses file metadata instead of whole-mailbox parsing. |
| `relay watch --follow` | Fresh watcher; append one 8 MiB + 1 byte record without a newline, then append the newline | 2,632 KiB | 10,828 KiB while pending; 19,020 KiB after whole-line clone/drain | **Bounded/fixed.** Reads now stream in 64 KiB chunks; an incomplete record is capped at 8 MiB and an overlong record is discarded through its newline without a completion-time clone. |
| Doorbell `peek` I/O | Same 30.01-minute run, `/proc/<pid>/io` | 2,712 KiB RSS; `rchar` 9,760 | `rchar` 3,146,864,933 at drain and 3,146,866,849 at end | **Confirmed I/O concern.** The growing phase reread about 2.93 GiB from cache (`read_bytes` stayed 0); 15 empty minutes added only 1,916 bytes. Replace the parse with a metadata-only presence check. |

Doorbell post-drain RSS stayed exactly 12,604 KiB for every persisted minute 15–30.01. The `woken` and `wake_retries` maps are target-bounded and showed no growth. Chosen follow bound: retain at most 8 MiB of an incomplete JSONL record, drop the remainder through its newline with one warning, then resume normal delivery; complete records within that bound remain byte-identical.

Post-fix probes: the same fresh 8 MiB + 1 byte follow fixture measured 2,732 KiB start, 11,056 KiB pending, and 11,056 KiB after newline (bounded and no completion-time doubling). A doorbell watcher polling a 12 MiB mailbox for 6.5 seconds measured 2,728 → 2,792 KiB RSS and only 13,550 bytes of `rchar`, rather than rereading the 12 MiB file every tick.

The GC safety clarification from the orchestrator: `store::gc(now, self_id: Option<&str>)` is the approved entry point. Hook passes its event session id; bus passes its marker-resolved id when known; `None` still runs GC. An explicit `AGENT_RELAY_HOME` or legacy `SESSION_RELAY_HOME` authorizes that root (including `/tmp`); otherwise the canonical store root must remain beneath canonical `$HOME`. The store root and each present surface directory are opened and pinned with no-follow directory descriptors before the GC-only lock can create or mutate anything. Every deletion is an inode-revalidated `unlinkat` relative to its pinned surface directory; the store root itself is never removed, and registry entries are removed last.

Step 2 manual proof used `/tmp/relay-gc-proof-f1q6ED`: one aged session's exact mailbox, marker, watcher lock+progress, resume lock, spawn log, registry entry, and name were removed; young, invoking-self, and aged-with-held-watcher-lock sessions survived with every surface; a fresh `gc-stamp` preserved a newly aged session on the immediate second bus startup. The proof returned `{ "pass": true }`.

Step 3 mechanism: `relay spawn` synchronously `File::create`s its unique target (preserving the truncate-at-start contract), starts a hidden relay stderr-pump process, and passes that pump's stdin to the detached child. The pump reads fixed 64 KiB chunks; after the file crosses 4 MiB it compacts to the newest 3 MiB, so live size stays at approximately 4 MiB while stderr continues flowing after the parent returns. Once a Codex child registers, its initially random log name is renamed to the born session id so GC can correlate it. Direct proof streamed 6 MiB plus `TAILMARKER`: final size 4,071,434 bytes and the newest marker remained intact.

Step 4 current selftest re-derived summary after Fix Round 3: `PASS: session-relay self-test — 94 checks (binary: rust/target/x86_64-unknown-linux-musl/release/relay)`.

Step 5 skill maintenance changed only the affected shipped session-relay skill and plugin-local conventions. The skill remains 308 lines; frontmatter is valid for Codex and Claude, its refreshed `content_hash` is idempotent (`unchanged productivity/session-relay`), and `status: ongoing` / `review_status: null` remain unchanged for the orchestrator's independent review.

### Fix Round 1 — GC deletion safety

Independent review found three safety gaps in the first GC implementation. The generic store lock called `ensure_dirs`, so GC could follow and chmod a symlinked `watchers/` or `locks/` directory before validating deletion paths. Pathname enumeration plus `canonicalize`/`remove_file` also left a check/use window in which a surface directory could redirect deletion outside the store. Finally, filename suffixes alone allowed non-UUID foreign files to be claimed as relay surfaces.

The fix uses a GC-only `.lock` acquisition that never calls `ensure_dirs`; the canonical root and all present surface directories are pinned with `open`/`openat(O_DIRECTORY | O_NOFOLLOW)` before the lock file is created. Enumeration uses the pinned directory descriptors. Candidates require exact UUID-backed mailbox/watcher/resume/spawn filenames, or a valid UUID inside a regular marker file. Deletion revalidates the recorded device/inode and uses descriptor-relative `unlinkat`; registry and stamp reads/writes are likewise rooted at the pinned store descriptor. Held watcher/resume locks are probed through the pinned directories, preserving the all-surfaces-aged, no-held-locks, never-self eligibility rule.

Three black-box bus-entry regressions cover the findings: a symlinked external `watchers/` directory causes GC refusal before `.lock` creation while its target file and mode remain unchanged; aged foreign non-UUID files survive in all five surface directories; and a `mailbox/` symlink to an internal future/victim layout cannot delete the aged UUID-shaped victim. All tests use per-case throwaway `AGENT_RELAY_HOME` roots.

### Fix Round 2 — GC denial and live-pump freshness

Independent review confirmed the Round 1 fixes, then found two medium gaps introduced by the descriptor-based rework. First, enumeration opened every entry before classifying non-marker filenames, so a mode-000 foreign file could deny the sweep. Non-marker names are now classified as exact UUID-backed relay names before any open or stat; unreadable markers are preserved as unknown instead of aborting GC. The regression plants aged mode-000 foreign files in all five surface directories, verifies an eligible relay session is still collected, verifies the foreign files survive, and verifies the sweep stamp is written.

Second, final deletion revalidated only device/inode even though the detached spawn-log pump writes without the store lock. GC now records size plus mtime, performs a whole-candidate freshness preflight immediately before the first unlink, and skips the candidate intact if any surface changed or disappeared. Per-file unlink revalidation checks the same snapshot again. A Rust regression refreshes a surface after enumeration and proves the candidate fails preflight without deletion.

The live pump additionally acquires a shared `locks/spawn-pump.lock` before opening or writing its log. Acquisition is serialized through the global store lock; GC probes the pump lock exclusively while holding that same global lock and preserves every spawn-log candidate while any pump is active. This closes the residual preflight/unlink window and remains correct when a Codex spawn log is renamed from its provisional UUID to the born session UUID. A black-box regression holds the hidden pump open and verifies a fully aged candidate survives intact.

### Fix Round 3 — unknown-marker fail-closed and per-log pump locks

Independent review confirmed both Round 2 fixes and found two remaining scope errors. Fresh unreadable or invalid markers were omitted from inventory, which could make an otherwise-aged session appear fully old. Marker entries are now statted before their content is read. A valid UUID marker remains a normal candidate surface; an aged unknown marker is ignored and preserved; a fresh unknown marker is matched by its encoded cwd name to registry entries and participates as a fresh surface, conservatively suppressing deletion of that whole session. The black-box regression makes a legitimate session marker fresh and mode 000 after aging every other surface, then proves every surface and the registry entry survive.

The Round 2 global pump lock was also over-broad: any pump protected every historical candidate with a spawn log. It is replaced by a shared flock on each pump's own log inode. The pump opens and locks its log while holding the global store lock, while GC takes and holds a nonblocking exclusive flock on each candidate's own spawn log through the whole-candidate preflight and unlink sequence. A new pump therefore cannot open/write during a sweep; a live pump protects only its own inode; rename preserves the inode lock; and process exit releases it automatically. Regressions prove an unrelated aged spawn-log candidate is collected while log A's pump is live, and prove a provisional log renamed to a born session UUID remains protected under the born name.

## Mistakes & Dead Ends

- **2026-07-10T19:02:00-03:00**: The first 30-minute controller captured a 15 MiB `relay inbox` response with Node `spawnSync`; its default output buffer terminated the controller at drain and the process group was reaped at ~29 minutes. The mailbox had drained, but the duration was not rounded up or accepted. Re-ran with inbox stdout discarded, per-minute samples persisted independently, and an explicit 1,800,000 ms completion interval; the corrected run completed 30.01 minutes.
- **2026-07-10T19:50:00-03:00**: The first spawn-pump gate hung on the existing timeout fixture because the parent `Command` retained a duplicate stderr-pipe writer while waiting for the pump. Stopped the failed gate, dropped `Command` immediately after spawning the child, and re-ran fmt/clippy/tests before retrying the full gate.

## Review

- **Goal met:** yes — all three deliverables landed: 14d inactivity GC (`store::gc(now, self_id)`, every store surface, all-surfaces-old + held-lock-safe, 6h `gc-stamp` throttle, never-self, `AGENT_RELAY_GC_DAYS` knob with `0`=off), spawn-log bounding (`spawn.rs` 4 MiB cap / newest-3 MiB compaction pump + `File::create` truncate-at-start), and the measured long-runner audit (`## Notes` RSS table for `relay bus`, doorbell, `--follow`, and doorbell `peek` I/O — bus bounded, follow capped at 8 MiB, doorbell poll switched to metadata-only). Every acceptance criterion verified against the diff.
- **Regressions:** none — three adversarial fix rounds fully resolved (Round 1 symlink/TOCTOU in the deletion path; Round 2 sweep-abort DoS + mtime freshness race vs the lockless pump; Round 3 fresh-unreadable-marker fail-open + over-broad global pump lock). Re-read the hardened path: `O_DIRECTORY|O_NOFOLLOW`-pinned surface dirs, freshness preflight, per-log nonblocking exclusive flock, inode-revalidated `unlinkat`, registry removed last, never-self. Scope note: `affected_paths` lists `rust/src/cli.rs` (not needed — no change) and omits `plugins/session-relay/AGENTS.md` (doc-updated per Step 5) — both benign; the two other-session plan files in the range ride a shared branch and are out of scope.
- **CI:** pass — `node scripts/ci.mjs --plugin session-relay` exit 0 (cargo fmt --check clean, clippy -D warnings clean, bin checksums verify 4/4, selftest 94 checks pass; the single `⚠ host rebuild digest differs` line is the documented local linker variance, enforced byte-identical only in CI, not a failure).
- **Cross-check:** [codex gpt-5.6-sol xhigh] across 4 review passes, final verdict READY 0 findings; [claude] independently re-ran the full plugin gate green after each fix round and read the hardened deletion path.
- **Follow-ups:** none
- Filed by: plan-review on 2026-07-10T20:57:51-03:00
