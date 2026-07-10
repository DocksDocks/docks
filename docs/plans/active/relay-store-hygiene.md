---
title: Session-relay store hygiene — inactivity GC, spawn-log bounding, long-runner memory audit
goal: Give ~/.agent-relay self-cleanup (14d-inactive sessions self-delete), bound the unbounded spawn-log growth, and audit/fix memory behavior of the relay's long-running loops.
status: ongoing
created: "2026-07-10T18:26:49-03:00"
updated: "2026-07-10T19:44:05-03:00"
started_at: "2026-07-10T18:28:20-03:00"
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
review_status: null
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
| 3 | Spawn-log bounding in `spawn.rs`: cap live growth (streaming tail-cap or size-capped writer — child stderr must keep flowing; document the chosen mechanism) so a single spawn log cannot exceed ~4MB, keeping the newest content (the diagnostic tail). Existing oversized logs are handled by Step 2's age GC; additionally `relay spawn` truncates ITS OWN target log file at spawn start (already `File::create` — verify). | pending |
| 4 | Selftest coverage (extend `test/selftest.mjs`, `AGENT_RELAY_HOME` sandbox): seeded store with (i) aged-out session (fake old mtimes + old `last_seen`) → GC removes exactly its surfaces; (ii) aged-out but HELD watcher lock → survives; (iii) young session → survives; (iv) invoker's own session aged → survives; (v) `AGENT_RELAY_GC_DAYS=0` → no-op; (vi) gc-stamp throttle honored; (vii) spawn-log cap enforced. Re-derive the selftest count from its summary line. | pending |
| 5 | Docs: update the `session-relay` skill + plugin AGENTS.md sections that describe the store (new GC behavior, env knob, spawn-log cap); `node scripts/ci.mjs --plugin session-relay` fully green (PATH note above). | pending |

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

The GC safety clarification from the orchestrator: `store::gc(now, self_id: Option<&str>)` is the approved entry point. Hook passes its event session id; bus passes its marker-resolved id when known; `None` still runs GC. An explicit `AGENT_RELAY_HOME` or legacy `SESSION_RELAY_HOME` authorizes that root (including `/tmp`); otherwise the canonical store root must remain beneath canonical `$HOME`. Every known-surface deletion is checked lexically and after symlink resolution, the store root itself is never removed, and registry entries are removed last.

Step 2 manual proof used `/tmp/relay-gc-proof-f1q6ED`: one aged session's exact mailbox, marker, watcher lock+progress, resume lock, spawn log, registry entry, and name were removed; young, invoking-self, and aged-with-held-watcher-lock sessions survived with every surface; a fresh `gc-stamp` preserved a newly aged session on the immediate second bus startup. The proof returned `{ "pass": true }`.

## Mistakes & Dead Ends

- **2026-07-10T19:02:00-03:00**: The first 30-minute controller captured a 15 MiB `relay inbox` response with Node `spawnSync`; its default output buffer terminated the controller at drain and the process group was reaped at ~29 minutes. The mailbox had drained, but the duration was not rounded up or accepted. Re-ran with inbox stdout discarded, per-minute samples persisted independently, and an explicit 1,800,000 ms completion interval; the corrected run completed 30.01 minutes.

## Review

(placeholder — completion review writes this)
