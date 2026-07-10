---
title: Relay notification reliability — spawn completion signal + lock-based unified watcher liveness
goal: Close the three orchestration gaps found 2026-07-10 — fire-and-forget spawn, undetectable dead mailbox watcher, and unguarded wake-while-live — with a child-wait completion signal, one lock-holding watcher implementation for both tools, and a doctor command.
status: ongoing
created: "2026-07-10T04:03:30-03:00"
updated: "2026-07-10T11:28:17-03:00"
started_at: "2026-07-10T11:13:07-03:00"
assignee: relay-reliability-worker
tags: [session-relay, reliability, doorbell, follow-up]
affected_paths:
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/test/selftest.mjs
related_plans: []
review_status: null
planned_at_commit: 579b55cd7af213355267c13a4a4317bf2d98e66f
---

# Relay notification reliability — spawn completion signal + lock-based unified watcher liveness

## Goal

Three reliability gaps, two incidents (2026-07-10, recorded in Context):

1. **`relay spawn` emits no completion signal.** `spawn` returns at registration and the child works detached; if the orchestrator's mailbox watcher is dead, the child's finished-work mail sits undelivered until an unrelated turn.
2. **A dead mailbox watcher is silent and undetectable.** Nothing detects or re-arms a watcher that dies (environment crash, /tmp exhaustion, harness restart); delivery degrades from push to next-turn-drain with no signal.
3. **`relay wake` on a live session races.** A wake against a session whose relay-launched resume is still running starts a second concurrent resume in the same worktree.

After this plan: `relay spawn --watch` blocks on the actual child process and reports its first-turn outcome; both Claude and Codex sessions are watched by ONE implementation (`relay watch`) that holds an OS file lock whose held/free state is the liveness truth; every MCP `send` result reports `recipient_watch: live|dead|never|unknown`; `relay wake` refuses when a relay-launched resume already holds the session's resume lock; `relay doctor` verifies a session's receive path.

## Context & rationale

- Incident 1 (2026-07-10 overnight): the orchestrator's mailbox Monitor died during a /tmp ENOSPC crash; a detached spawn worker's finished-work mail sat undelivered ~25 minutes. Mail was durably queued (no loss) — the gap is latency/visibility.
- Incident 2 (same night): `relay wake` on a session whose previous resume process was still alive started a SECOND concurrent `codex exec resume` — two processes racing in one shared worktree, duplicate work reports, near-miss on conflicting edits.
- **Verbatim user decisions (2026-07-10, via picker):** heartbeat coverage — "cross tool hearbears for sure"; mechanism — "cant we use that unified watcher + lock + PID" → adopted: unified `relay watch` for both tools, OS advisory file lock as the liveness truth, PID **as diagnostic metadata inside the locked file, never as the truth signal** (PID reuse, `kill -0` races).
- **Why lock, not mtime heartbeat (v1 of this plan):** an mtime freshness window (touch every 2 min, fresh <5 min) leaves up to 5 minutes where a dead watcher still reads fresh — exactly the window where a sender would wrongly trust push delivery. A held lock is released by the kernel even on SIGKILL: liveness is instant truth with no periodic touching. mtime survives only as an optional **progress diagnostic** (a held lock proves the process exists, not that it is making forward progress — see Known gotchas on the 300 s blocking pump).
- **Why one watcher implementation:** v1 required two watcher kinds (Claude's raw `tail -n0 -F` Monitor one-liner and Codex's `relay watch`) to cooperate on a heartbeat convention. Making `relay watch --follow` the Claude Monitor command too puts all liveness bookkeeping in one Rust code path, cross-platform, with no bash convention to honor.
- **Why refuse-not-queue on wake:** mail is already durable; a queued doorbell becomes stale/duplicate work by the time it fires. A refusal (exit 3) is a clean retry signal; the caller falls back to `relay send`.
- Cross-check provenance and per-finding dispositions live in `## Self-review`.

## Environment & how-to-run

- Repo root: `~/projects/docks`; Rust source: `plugins/session-relay/rust/src/`. Read `plugins/session-relay/AGENTS.md` before editing — it owns layout and binary-release discipline.
- Gate (must be green before every commit): `node scripts/ci.mjs --plugin session-relay` — runs `cargo fmt --check`, `clippy -D warnings`, the `--locked` host-leg rebuild + byte-compare (warns locally, fails in CI), `SHA256SUMS` verification, shellcheck on the `bin/relay` launcher, hooks-config JSON validation, the skills gate, and `node plugins/session-relay/test/selftest.mjs`.
- Locking: use the in-tree **rustix 1.1.4** `flock` with `NonBlockingLockExclusive` (already powers `store.rs`). Do NOT add fs2 or any new lock dependency.
- Committed binaries in `bin/` come ONLY from the `build-binaries.yml` workflow artifacts — never commit a local `cargo build` output. Release rides `node scripts/release.mjs --plugin session-relay <bump>` AFTER binaries are committed (see `plugins/session-relay/AGENTS.md` release order); release is the orchestrator's job, not this plan's executor.
- Work on branch `codex/relay-notify-reliability` (already checked out; currently pointer-equal to main at 135c2a4). Commit green slices; NEVER push.

## Interfaces & data shapes

- **Lock files** (paths derived from `store.rs`'s home-dir helper, honoring the `AGENT_RELAY_HOME` override; dirs/files created with private permissions):
  - Watcher: `<relay-home>/watchers/<session-id>.lock`
  - Resume: `<relay-home>/locks/resume-<session-id>.lock`
  - Content (written only AFTER acquiring the lock): `{"pid": <u32>, "started_at": "<ISO8601>", "tool": "claude"|"codex", "mode": "follow"|"doorbell"|"once"|"resume"}`. NEVER store argv or message content (a wake nudge can contain untrusted or secret text). Readers tolerate partial/unreadable metadata while still classifying liveness from the lock.
  - Hygiene: lock files are NEVER unlinked, atomic-renamed, or recreated while possibly locked (two processes would lock different inodes under one path). Tombstones persist: `never` = no file (never armed); `dead` = file exists, lock free.
- **Status probe** (in `store.rs`, reused by `bus.rs` send and doctor): open EXISTING file only; classify `ENOENT → never`, `EWOULDBLOCK → live`, transient successful acquisition (released immediately) `→ dead`, any other IO/permission/unsupported error `→ unknown` (never lie toward dead). Watcher startup retries acquisition for a short bounded window (~2 s) so a status probe's transient hold is not misread as a duplicate watcher.
- **`recipient_watch`** in the MCP bus `send` tool result (bus.rs, after enqueue): always present, value `"live"|"dead"|"never"|"unknown"`. CLI `relay send` stdout stays byte-identical (`queued -> <name>`); no new CLI output surface in this plan.
- **`relay watch --follow <session-id>`**: acquires the session's watcher lock (RAII guard held for process life), then tails the mailbox with `tail -n0 -F` semantics — skip preexisting bytes at startup, buffer partial lines, emit each complete JSONL line verbatim to stdout, reopen after delete/recreate and handle truncation/inode replacement. Diagnostics to stderr only. Runs until killed. This is the command the SessionStart hook nudge (hook.rs `render_context`) tells Claude to arm as its Monitor, rendered as `<current relay executable> watch --follow <session-id>`.
  - Existing Codex/multi-target watch path: acquires one guard per resolved target after target resolution, retained across the outer poll loop. Duplicate policy: explicit single target already live → fail; `--all` skips already-live targets and watches the remainder. `--once` holds transiently (its tombstone reads `dead` afterward, correctly).
  - Optional progress timestamp: the watcher atomically updates a status/progress stamp the doctor can WARN on (alive-but-stuck detection); it is NEVER the live/dead truth.
- **`relay spawn --watch`**: retains the spawned `Child` and blocks on it — `try_wait` while awaiting birth registration (fast child failure returns immediately with its exit/log instead of burning the birth timeout), `wait` after. Stdout one line: `spawned <name>; first turn complete; <duration>` or `...; first turn failed (exit <N>); <duration>`. Relay exit mirrors the child (signaled child maps to nonzero, 128+signal on Unix — `status.code() == None` is NOT success). If the waiting parent is interrupted, the child's process group is NOT killed (fire-and-forget preserved). Without `--watch`: unchanged immediate return after registration. `cli.rs` BOOL_FLAGS gains boolean `watch`; `--follow` is value-taking and must NOT go in BOOL_FLAGS.
- **`relay wake` refusal**: the wake wrapper in `cli.rs` acquires and holds the target's resume lock immediately before `Command::output` and through child completion/usage parsing (spawn.rs does NOT own resume locks — spawn creates a new session; watch.rs `wake_fallback` self-execs `relay wake` and inherits the gate). Held lock → stderr `wake refused: resume already running for <name> (pid <p>, started <age> ago)` (pid/age best-effort from metadata), exit 3, no doorbell queued. Guarantee scope: concurrent RELAY-LAUNCHED wakes only; user-run `codex exec resume`/`claude --resume`/TUI/older binaries hold no lock and stay undetectable (documented).
- **`relay doctor [--id <session-id-or-name>]`**: `--id` is the authoritative identity; without it, the cwd marker fallback is used and a `single-session-only fallback` notice names the resolved identity. One line per check — `PASS <check>: <detail>` / `WARN <check>: <detail>` / `FAIL <check>: <detail> — fix: <command>`. Checks: registration (registry entry exists); mailbox (path derivable; absent file = PASS `no mail yet`); watcher lock (`live` required — `dead`/`never` FAIL with the exact re-arm command, string-equal to the hook nudge renderer's output); watcher progress (WARN when the progress stamp is stale — lock held does not prove the Codex app-server socket is reachable or Claude stdout is consumed); resume lock (informational line); store lock health (acquirable within 3 s). Exit 0 iff no FAIL. New verb wired in `main.rs` (dispatcher match + usage header).

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Lock substrate: home-derived lock paths, RAII exclusive-lock guard (rustix `NonBlockingLockExclusive`), metadata write-after-acquire with private perms, four-way status probe (`never/live/dead/unknown`), bounded acquire-retry, no-unlink hygiene | `rust/src/store.rs` | — | done |
| 2 | `spawn --watch`: retain Child, `try_wait` during birth wait, `wait` after, exit mapping incl. 128+signal, one-line outcome, fire-and-forget preserved on parent interrupt; BOOL_FLAGS `watch` | `rust/src/spawn.rs`, `rust/src/cli.rs` | — | done |
| 3 | Unified watcher: `--follow` mode in `watch.rs::run` (flag parsed before server/target resolution; dedicated `follow_mailbox` loop with tail `-n0 -F` semantics), per-target guards in the Codex path (dup policy, `--once` transient), progress stamp; hook nudge → `<relay-exe> watch --follow <id>`; `recipient_watch` in bus `send` result | `rust/src/watch.rs`, `rust/src/hook.rs`, `rust/src/bus.rs` | 1 | done |
| 4 | Wake resume lock: wake wrapper acquires/holds resume lock around `Command::output`; refusal exit 3 + stderr with best-effort pid/age | `rust/src/cli.rs` | 1 | done |
| 5 | `relay doctor`: verb in `main.rs` dispatcher + usage; checks per Interfaces (reuse store probes; re-arm fix string from the hook renderer); `--id` identity | `rust/src/main.rs`, `rust/src/cli.rs` (or a new `doctor.rs` — implementer's choice, named in the commit) | 1, 3 | planned |
| 6 | Selftests for AC1–AC5 (separate-OS-process lock assertions; delayable/exit-configurable fake child; follow-semantics cases) + SKILL.md delivery-matrix rows (dead-watcher row, doctor, `spawn --watch`, wake refusal, NFS caveat, old-raw-tail sessions read `dead`/`never` until restart) + `metadata.updated`; full gate green | `test/selftest.mjs`, `skills/productivity/session-relay/SKILL.md` | 1–5 | planned |

## Acceptance criteria

All are selftest cases (exact expectations; run via `node plugins/session-relay/test/selftest.mjs`, and the full `node scripts/ci.mjs --plugin session-relay` must be green):

- [ ] **AC1 spawn --watch**: stub child that delays then exits 0 → stdout matches `spawned <name>; first turn complete`, relay exit 0. Stub exiting 7 → stdout contains `failed (exit 7)`, relay exit 7. Stub failing before birth registration → prompt nonzero return (well under the birth timeout). Without `--watch`: immediate post-registration return (existing behavior pinned).
- [ ] **AC2 wake refusal**: with the resume lock held by a live separate stub process, `relay wake <name>` exits 3 and stderr contains `wake refused`; after the stub is killed, wake proceeds; doorbell argv byte-unchanged against the pinned expectation.
- [ ] **AC3 liveness**: a separate-process `relay watch --follow` holding the lock → MCP `tools/call` send result contains `"recipient_watch":"live"`; SIGKILL the watcher → next send `"dead"`; never-armed session → `"never"`; forced probe IO error (permissions) → `"unknown"`. CLI `relay send` stdout byte-unchanged. All live/dead assertions use separate OS processes (same-process flock re-lock is not portable).
- [ ] **AC4 follow semantics**: appended line emitted verbatim; preexisting mailbox content skipped at startup; delete/recreate of the mailbox file → follow resumes on the new inode; a partial line is flushed only once its newline arrives.
- [ ] **AC5 doctor**: healthy session (live watcher) → all PASS, exit 0; killed watcher → exit 1 with a FAIL watcher line whose re-arm command is string-equal to the hook nudge render; two sessions sharing a dir → `doctor --id` resolves each correctly, and no `--id` prints the single-session-only fallback notice.
- [ ] **AC6**: `node scripts/ci.mjs --plugin session-relay` green (fmt, clippy `-D warnings`, selftest, checksums, skills gate).

## Out of scope / do-NOT-touch

- Wake/doorbell **argv shapes** (security-reviewed surface) — refusal wraps around them, never alters them.
- Mail format and mailbox JSONL layout — `--follow` reads, never rewrites.
- CLI `relay send` stdout — `recipient_watch` is MCP-response-only this plan (no `--json` flag now).
- No auto-re-arm of a dead watcher, no auto-escalation of `send` to `wake`, no push-notification transport — detection and signaling only.
- Store layout beyond the additive `watchers/` and `locks/` directories.
- Binary release flow (workflow-built binaries, `release.mjs`) — separate, orchestrator-owned step after merge.

## Known gotchas

- **Never unlink/rename a lock file** that may be locked — path-vs-inode divergence lets two processes both "hold" it.
- **Same-process re-lock is not portable** (Linux open-description vs BSD/macOS ownership differences): every live/dead selftest assertion spawns separate OS processes.
- **PID reuse**: pid in metadata is diagnostic only; the lock is the truth.
- **NFS/SMB advisory-lock variance**: `AGENT_RELAY_HOME` on network filesystems is unsupported for authoritative liveness (document in SKILL.md).
- **Held lock ≠ forward progress**: watch.rs can block in its RPC pump up to ~300 s, and a follow writer can block on unconsumed stdout — hence the progress stamp as a doctor WARN signal, never as live/dead truth.
- **Scoped wake guarantee**: user-launched resumes (`codex exec resume`, `claude --resume`, TUI, older relay binaries) hold no lock; there is also a narrow SIGKILL-the-wrapper/child-survives hole — do not claim stronger coverage in docs.
- **Old sessions still running raw `tail`** read `never`/`dead` until their next SessionStart re-arm — accurate and self-healing; delivery-matrix row explains it.
- **Status-probe transient hold**: a probe briefly acquires a dead lock; watcher startup's bounded retry absorbs the race.

## Global constraints

- Locking via in-tree rustix 1.1.4 `flock(NonBlockingLockExclusive)`; no new dependencies.
- `clippy -D warnings`; `cargo fmt --check`; committed binaries only from `build-binaries.yml` artifacts (verbatim from `plugins/session-relay/AGENTS.md`).
- Manifest versions stay in lockstep across `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the marketplace catalog (root `AGENTS.md` rule; enforced by `ci.mjs`/`release.mjs`).

## STOP conditions

- If hosting `--follow` in `watch.rs` requires restructuring beyond ~200 lines, STOP and report design options — do not improvise a rewrite.
- If advisory locks prove unusable on a supported platform in selftest, STOP — no silent fallback to mtime as truth.
- If wake refusal cannot be implemented without touching doorbell argv, STOP (security-reviewed surface).
- If the `--locked` rebuild/byte-compare gate behaves unexpectedly around your changes, STOP and report — never regenerate `bin/` binaries locally.

## Cold-handoff checklist

1. File manifest — every step names exact paths; doctor's `main.rs` dispatcher edit named. ✔
2. Environment & commands — gate command with sub-checks, selftest entry, branch, release discipline pointer. ✔
3. Interface & data contracts — lock paths/JSON shape, probe classification, `recipient_watch` enum, wake refusal exit/stderr, spawn `--watch` output/exit mapping, doctor line grammar. ✔
4. Executable acceptance — AC1–AC6 with exact commands/expected output/exit codes. ✔
5. Out of scope — stated positively per surface. ✔
6. Decision rationale — lock-vs-mtime, unified watcher, refuse-not-queue, PID-as-metadata in Context. ✔
7. Known gotchas — eight, each from a reviewed failure mode. ✔
8. Global constraints verbatim — rustix pin, binary discipline, lockstep rule. ✔
9. No undefined terms / forward refs — all names resolve to files in affected_paths or cited docs. ✔

## Self-review

- Score: 87/100 (v1, light parked-plan audit) → 53/100 (cross-check re-score of v1) → 94/100 (this v2) · trajectory 87→53→94 · stopped: single amendment pass after dual codex review. v2 sub-scores: standalone executability 20/22, actionability 15/16, dependency order 12/12, evidence 9/10, goal coverage 12/12, executable acceptance 11/12, failure modes 9/10, assumption→question 6/6.
- Cross-check (2026-07-10): [codex gpt-5.6-sol xhigh] Phase-1 draft review of v1 — 10 findings (6 high, 4 med), re-score 53/100, verdict AMEND FIRST — 10 accepted, 0 rejected; [claude] independently verified findings 1, 3, 4, 6 against source (main.rs:16-20 verb match, store.rs:227-337 lastSeen write sites, watch.rs existence, cwd-marker shared-dir ambiguity) before accepting.
- Cross-check (2026-07-10): [codex gpt-5.6-sol xhigh] Phase-1.5 design opinion on the lock-based v2 — verdict ADOPT V2 WITH AMENDMENTS, 10 amendments (unknown state; progress-vs-liveness separation; multi-target dup policy; --once tombstone; no tombstone deletion; no argv in metadata; acquire-retry; scoped resume guarantee; doctor --id authoritative; follow-semantics spec+tests) — 10 accepted, 0 rejected and encoded above; [claude] verified the rustix flock claim against docs.rs and the watch.rs/cli.rs integration points named.
- DISAGREEMENT: liveness mechanism — [codex Phase-1] pin the v1 mtime heartbeat constants (120 s touch / 300 s staleness, boundary tests) / [claude] mtime leaves a ≤5-minute blind window; a held OS lock is instant truth. Kept: lock-based unified watcher with PID metadata, mtime demoted to a progress diagnostic — decided by user via picker ("cross tool hearbears for sure"; "cant we use that unified watcher + lock + PID"); codex Phase-1.5 concurred on review.

## Notes

- 2026-07-10: OQ-1 (v1) resolved as heartbeat-file via picker; **superseded** the same day by the lock-based v2 (user decision above). The 120 s/300 s mtime constants survive only as the optional progress-stamp diagnostic.
- Branch note: `codex/relay-notify-reliability` exists and is pointer-equal to main at 135c2a4 (both prior commits are plan-only).

## Review

(filled by plan-review on completion)

## Sources

- `plugins/session-relay/rust/src/main.rs:16-20` — verb dispatcher enumerates every verb; `watch` already dispatched at line 19; `doctor` requires a new arm (finding 4 evidence).
- `plugins/session-relay/rust/src/store.rs:227-337` — registry entry shape with `lastSeen` written at registration; no turn-completion state exists (finding 1 evidence).
- `plugins/session-relay/rust/src/hook.rs:9` — hook keeps `last_seen` fresh for `discover`; `render_context` is the nudge renderer to change.
- `plugins/session-relay/AGENTS.md` — gates, binary-release discipline, selftest entry (read 2026-07-10).
- rustix 1.1.4 `flock` / Linux `flock(2)` / Apple `flock(2)` — advisory-lock semantics, open-description ownership, release-on-death, NFS variance: https://docs.rs/rustix/1.1.4/rustix/fs/fn.flock.html · https://man7.org/linux/man-pages/man2/flock.2.html · https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html
