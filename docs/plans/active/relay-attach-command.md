---
title: relay attach — hand a human the worker's chat
goal: New `relay attach <nameOrId>` verb that safely hands the user the exact interactive-resume command (or execs it) for any relay session, plus documented attach recipes and the split-brain warning.
status: in_review
created: "2026-07-10T19:18:24-03:00"
updated: "2026-07-10T21:44:22-03:00"
started_at: "2026-07-10T21:03:47-03:00"
in_review_since: "2026-07-10T21:44:22-03:00"
assignee: relay-hygiene-worker (codex gpt-5.6-sol relay session)
tags: [session-relay, rust, attach, ux]
affected_paths:
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/skills/
  - docs/plans/active/relay-attach-command.md
related_plans:
  - relay-store-hygiene.md
  - relay-live-view.md
review_status: passed
planned_at_commit: 072c830dfedec6de3288f06f3139909d17012d13
---

## Goal

The user wants to open a relay worker's conversation in their own terminal ("via `codex` or `claude` when I want to"). Research (2026-07-10, verified against codex-cli 0.144.1 + current Claude Code docs) established this is possible TODAY with exact commands but has sharp edges a human shouldn't have to memorize: exact-UUID-only (pickers omit headless sessions), cwd constraints, and an unlocked concurrent-writer hazard. `relay attach` packages the safe path.

## Context & rationale (research evidence, 2026-07-10)

- Codex: `codex resume <UUID>` resolves an exact id GLOBALLY (no cwd filter — tui/src/lib.rs L649-681 @ rust-v0.144.1) and restores the persisted transcript via `thread/read` (thread_transcript.rs L28-50). On cwd mismatch the TUI prompts current-vs-saved. Interactive picker may omit exec-created sessions (upstream issue openai/codex#24502) — exact id is the reliable path.
- Claude: `claude --resume <session-id>` resumes a `-p`-created session interactively from the session's project directory; same session id continues; not shown in the picker (code.claude.com/docs/en/sessions.md#resume-a-session).
- Concurrent-writer hazard (the reason attach needs guardrails): NEITHER tool locks a session against two writers. Codex: no global ownership lock — `LocalThreadStore` live-writer check is process-scoped, rollout recorder opens append without flock (thread-store/src/local/live_writer.rs L38-107; rollout/src/recorder.rs L813-825 @ rust-v0.144.1) → split-brain history. Claude: two resumes interleave into one transcript (sessions.md#branch-a-session). The relay's own resume lock (cli.rs — `~/.agent-relay/locks/resume-<id>.lock`, exit 3 when busy) serializes only relay-launched wakes.
- Attach semantics chosen: attach is a HUMAN takeover, not co-driving. Guardrails, not co-existence (co-existence is the separate `relay-live-view` plan).

## Environment & how-to-run

- Repo `/home/vagrant/projects/docks`; branch `codex/relay-attach-command`; never push; no `bin/` commits.
- `export PATH="$HOME/.cargo/bin:$PATH"`; gates: `node scripts/ci.mjs --plugin session-relay` (treat silent cargo-skip as failure); selftest standalone: `node plugins/session-relay/test/selftest.mjs`; tests use `AGENT_RELAY_HOME` sandboxes only.
- Drift base UPDATED to `072c830` (the shipped `relay-store-hygiene` merge — it heavily reworked `store.rs` with the GC/deletion path and touched `cli.rs`/`main.rs`/selftest, and `is_uuid`/lock helpers now live there). Read the merged `store.rs` before adding anything: reuse the existing `is_uuid` and resume-lock probe helpers rather than re-implementing them; the resume-lock file is `~/.agent-relay/locks/resume-<id>.lock` as before.

## Steps

| # | Task | Status |
|---|------|--------|
| 1 | Add `relay attach <nameOrId>` to `cli.rs` + dispatcher (`main.rs` header contract comment): resolve via registry (name→id, tool, dir); if unregistered, fall back to discovery by exact id. Validate tool ∈ {claude, codex}. Compose the command: codex → `codex resume <id>` (append `-C <dir>` when the stored dir exists); claude → `cd <dir> && claude --resume <id>`. **Server-aware branch (coordinates with `relay-live-view`):** when the registration carries an app-server `server` field (schema added by that plan; treat as optional/absent until it merges), compose `codex --remote unix://<server>` guidance INSTEAD of `codex resume` — a raw `codex resume` against an app-server-owned thread re-opens the second-writer split-brain that plan exists to kill. Default behavior PRINTS the command plus a one-line context block (name, tool, dir, last_seen) and the hazard warning; `--exec` replaces the process with the command (codex from anywhere, claude after chdir; refuse `--exec` if the stored dir is missing). | done |
| 2 | Guardrails: exit 3 with a clear message when the relay resume lock for that id is currently held (a wake is in flight — attaching now would double-write; reuse the existing lock probe); ALWAYS print the split-brain warning (neither CLI locks sessions; attaching while automation drives the session interleaves two writers; prefer attach when the worker is idle — `relay doctor --id` shows watcher/lock state). Refuse ids that are not UUID-shaped (existing validation convention). | done |
| 3 | Selftest additions (`AGENT_RELAY_HOME` sandbox): name and id resolution; per-tool command composition incl. `-C`/cd forms; held-resume-lock → exit 3; missing dir → print-mode still works, `--exec` refuses; non-UUID rejection. Re-derive the selftest count from its summary line. | done |
| 4 | Docs: `session-relay` skill gains an "Attach to a session" section — the `relay attach` verb, the manual per-tool recipes (exact commands from Context), the picker-omission caveat (#24502), and the split-brain warning verbatim. Full gate `node scripts/ci.mjs --plugin session-relay` green. | done |

## Acceptance criteria

- In a sandbox store with a seeded codex registration: `relay attach <name>` prints a command containing `codex resume <id>`; with a claude registration it prints `claude --resume <id>` prefixed by the cd; both include the warning text.
- With `~/.agent-relay/locks/resume-<id>.lock` held by a live process: `relay attach` exits 3 naming the wake-in-flight reason.
- `--exec` path: verified by selftest with a stub `codex`/`claude` on PATH recording argv (no real session needed).
- `node scripts/ci.mjs --plugin session-relay` exit 0 with cargo legs verifiably run; selftest green with new cases; `main.rs` header verb list updated (it is the multi-call contract).

## Out of scope / do-NOT-touch

- Live co-driving / app-server / channels — that is `relay-live-view`.
- Releasing (binaries, version bump) — batched with other relay plans, user-gated.
- Any change to wake/watch semantics.

## Cold-handoff checklist

- File manifest: cli.rs, main.rs (verb contract comment), store.rs (only if a lock-probe helper is needed), selftest, skill. ✔
- Environment & commands: gates + sandbox rule + expected-drift note. ✔
- Interface/data contracts: exact per-tool command forms and flag semantics in Steps 1–2. ✔
- Executable acceptance: sandboxed probes + exit codes + argv-recording stubs. ✔
- Out of scope: listed. ✔
- Decision rationale: attach = human takeover with guardrails; print-by-default because execing a TUI from a helper surprises; exit 3 mirrors the wake-refusal convention. ✔
- Known gotchas: picker omission upstream #24502; no upstream session locks (the WHY of the warning); cargo-skip-silently. ✔

## Self-review

Score: 95/100 · trajectory 95 · stopped: single-pass (4 steps, no risk flag — read-mostly feature with print-default). Executability: exact commands, exit codes, and stub-based tests specified; the one judgment call left to the executor (whether a store.rs lock-probe helper is needed vs reusing cli.rs code) is harmless either way. No open questions — behavior was fixed by research facts and the user's request.

## Notes

Steps 1–3 use the hardened store's existing `is_uuid` and `resume_status` helpers without duplicating lock logic or touching `store.rs`. The future live-view integration is a pure optional `server` argument on command composition; current registry resolution deliberately passes `None` until that later plan adds the schema. Exact-id discovery scans the raw tool stores with a 100-year window and no row limit after registry resolution misses.

TDD evidence: the initial red baseline produced three `attach_invocation` compile failures and the old top-level usage error for the black-box verb. The frozen specs then passed without assertion changes. Current re-derived source-binary summary after Fix Round 2: `PASS: session-relay self-test — 101 checks (binary: rust/target/x86_64-unknown-linux-musl/release/relay)`.

Step 4 updates only the affected shipped skill. The new section documents print and `--exec` takeover, exact manual Codex/Claude recipes, picker omission, exit-3 wake contention, and the split-brain warning byte-for-byte with CLI output. The skill is 326 lines; `content_hash` refresh wrote `61519e1e09352fb0e11710896c9ba69b791521a2adfce92a058a2949f30998a1`, and an immediate check reported `unchanged productivity/session-relay`. Per orchestrator instruction the plan remains `status: ongoing` and `review_status: null` for independent review.

### Fix Round 1 — strict grammar and fail-closed lock probe

Independent review found that attach inherited the permissive global `Args` behavior: extra operands were ignored and `Args::has("exec")` scanned beyond a bare `--`. Attach now owns a strict parser accepting exactly one target and at most one `--exec` before the terminator. `--exec` works before or after the target; extra operands, duplicate/unknown flags, and a second operand after `--` produce the attach usage warning and exit 2. A sole target after `--` remains valid standard terminator behavior. Execution is derived only from the parsed result. The red baseline was five missing-`parse_attach_args` compile errors plus a black-box extra-operand exit 0; the frozen parser and argv-recording regressions now pass.

The resume-lock guard also now fails closed on `LockStatus::Unknown`. Confirmed live locks retain exit 3; an unprobeable lock exits 4, keeps the required split-brain warning, and directs the user to `relay doctor --id`, permission restoration, and stale-lock removal only after confirming no wake is running. A mode-000 sandbox lock regression proves attach refuses rather than printing or executing.

### Fix Round 2 — isolate attach-only flag parsing

Independent review found that retaining `exec` in the global `BOOL_FLAGS` table changed positional parsing for every other verb even though attach now reads raw argv through its dedicated strict parser. The frozen black-box regression invokes `relay send agent-B --exec must-not-send`: the red baseline exited 0 and delivered mail, while the restored legacy behavior treats `--exec` as a value flag, leaves the send body empty, exits 1 with send usage, and enqueues nothing. Removing only `exec` from the shared table restores that contract without changing attach parsing. The re-derived self-test count is 101.

## Review

- **Goal met:** yes — the safe `relay attach <nameOrId>` verb ships: registry-then-exact-id resolution (`cli.rs` `attach`/`discovered_target`), per-tool composition (`codex resume <id> -C <dir>` / `cd <dir> && claude --resume <id>` via `attach_invocation`), print-by-default with a name/tool/dir/last_seen context line + the split-brain warning, a guarded `--exec` process-replace (refuses a missing stored dir), and a documented "Attach to a session" skill section. All 4 acceptance criteria verified against the diff + selftest. (`affected_paths` lists `store.rs`, intentionally untouched — Step 1 scoped it as conditional and the plan reuses the merged store's existing `is_uuid`/`resume_status` helpers; declared, not drift. No unannounced changes; `bin/` diff empty.)
- **Regressions:** none — Fix Round 1's `--exec`-leak-into-global-`BOOL_FLAGS` regression is closed: `BOOL_FLAGS` is back to `[&str; 8]` with `exec` removed (74c8453) and `selftest.mjs:169-173` asserts `send agent-B --exec must-not-send` → exit 1 (send usage), recipient inbox count 0. Attach owns a strict parser (exit 2 on extra operands / unknown flags / `--`-terminator `--exec`, `selftest.mjs:294-306`) and fails closed on an unprobeable resume lock (exit 4, `selftest.mjs:333-347`); a live-held lock still exits 3 (`selftest.mjs:1252-1255`).
- **CI:** pass — `node scripts/ci.mjs --plugin session-relay` exit 0; cargo fmt/clippy legs ran, self-test 101 checks green. Only warning is the documented `⚠ host rebuild digest differs … locally this is expected path/linker variance`.
- **Cross-check:** [codex gpt-5.6-sol high] across 3 review passes — initial NOT READY (2 MED: `--` terminator bypass + fail-open on `LockStatus::Unknown`) → fixed f500396; round-1 re-verify NOT READY (1 MED: `exec` leaked into global `BOOL_FLAGS`, altering other verbs' parsing) → fixed 74c8453; round-2 re-verify READY, findings none — final verdict READY. [claude] independently live-probed the verb in an `AGENT_RELAY_HOME` sandbox each round and re-verified every finding against source before accepting.
- **Follow-ups:** none — the `server`-aware app-server branch is deliberately deferred to `relay-live-view`; `attach_invocation` already accepts the optional `server` arg (passes `None` today) so no rework is owed here.
- Filed by: plan-review on 2026-07-10T21:44:22-03:00
