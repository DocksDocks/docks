---
title: relay live-view — watch and co-drive relay conversations from open chats
goal: Make relay traffic visible live inside the user's own open sessions — codex via app-server-native delivery (shared-thread co-driving, split-brain eliminated), claude via an experimental relay channel.
status: ongoing
created: "2026-07-10T19:18:24-03:00"
updated: "2026-07-10T21:58:21-03:00"
started_at: "2026-07-10T21:50:05-03:00"
assignee: relay-hygiene-worker (codex gpt-5.6-sol relay session)
tags: [session-relay, rust, app-server, channels, live-view]
affected_paths:
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/fake-app-server.mjs
  - plugins/session-relay/skills/
  - plugins/session-relay/hooks/
  - docs/plans/active/relay-live-view.md
related_plans:
  - relay-attach-command.md
  - relay-store-hygiene.md
review_status: null
planned_at_commit: 52227e92e165183ea0b5e5111dda7d4b734808d3
---

## Goal

User desire (2026-07-10): "if I already have a session open... talk to the relay and it continues in the chat and I can see what they are talking." Two tracks. **Codex**: the plain TUI cannot be injected into (upstream openai/codex#11415), but the app-server multi-client model is built for exactly this — one server owns the thread, the user's TUI (`codex --remote unix://…`) and the relay are both clients, every turn streams to every subscriber. Make relay delivery app-server-native when a server is configured, render relay mail VISIBLY, and thereby also eliminate the split-brain hazard of `codex exec resume` beside an open TUI. **Claude**: build an experimental relay *channel* (Claude Code v2.1.80+ research preview: MCP servers that push visible, model-reactive events into running sessions started with `--channels`).

## Context & rationale (research evidence, 2026-07-10, codex-cli 0.144.1 / rust-v0.144.1 source)

- The relay already speaks the app-server protocol: `watch.rs` Mode::Push opens a hand-rolled WS client over a unix socket, does `initialize`/`thread/resume`/`thread/inject_items`, and with `--auto-turn` runs `turn/start` (approvalPolicy "never") and pumps to `turn/completed`, answering elicitations (accept own `bus`, decline others). Spike notes in the watch.rs header are the protocol ground truth (settle delay RELAY_TURN_SETTLE_MS between inject and turn/start; WS-everywhere on sockets; jsonrpc field omitted).
- CRITICAL rendering fact: injected raw items do NOT render in the TUI — app-server emits `RawResponseItemCompleted` and the TUI explicitly ignores it (tui/src/chatwidget/protocol.rs L194-203). Normal turn/item events DO render. So "seeing the mail" requires either injecting a visible item type or carrying mail content in a turn the worker takes. Executor must investigate what `thread/inject_items` payloads render (STOP-and-ask with findings if none do — fallback design: auto-turn quoting policy, see gotchas).
- `thread/resume` cold-loads ANY persisted thread visible to that server's CODEX_HOME — the thread need not have originated under the server (researcher-verified). Multi-client: `ThreadStateManager` keeps per-thread connection sets; a second `thread/resume` atomically returns history and subscribes (app-server/src/thread_state.rs L252-283; request_processors/thread_processor.rs L3070-3186).
- Split-brain today: `codex exec resume` beside an open TUI appends divergent history to one rollout with no lock (thread-store/src/local/live_writer.rs L38-107; rollout/src/recorder.rs L813-825). App-server-native wake removes the second writer entirely.
- Docs: learn.chatgpt.com/docs/app-server (#connect-the-cli-terminal-ui, #inject-items-into-a-thread, #events, #protocol). Current relay `--server` takes a RAW socket path (UnixStream::connect), no bearer auth — unix permissions are the boundary; keep that model.
- Claude channels: code.claude.com/docs/en/channels.md — channels are MCP servers pushing `<channel source="…">` events into RUNNING sessions; Telegram/Discord/iMessage exist; custom channels buildable; requires session started with `--channels plugin:…`; research preview → ship as experimental, verify the installed Claude Code version supports it first (STOP-and-report if not).
- Security constants (plugin AGENTS.md): mail is UNTRUSTED DATA — fences stay; auto-turn nudges never carry mail content as instructions; never `--dangerously-*`.

## Environment & how-to-run

- Repo `/home/vagrant/projects/docks`; branch `codex/relay-live-view`; never push; no `bin/` commits.
- `export PATH="$HOME/.cargo/bin:$PATH"`; gate `node scripts/ci.mjs --plugin session-relay`; selftest sandboxes via `AGENT_RELAY_HOME`; `test/fake-app-server.mjs` already stubs the WS protocol for watch-leg tests — extend it rather than requiring a real codex.
- Live verification against a REAL `codex app-server --listen unix://…` is required for the codex track's acceptance (this box has codex 0.144.1); use a throwaway CODEX_HOME.
- Drift base UPDATED to `52227e9` — BOTH prerequisite plans have now MERGED to main (store-hygiene at 072c830, attach at 52227e9). READ the merged code before starting; the landed changes you build on:
  - `watch.rs` (Step 1 refactors this): the doorbell loop now does a **metadata-only presence poll** (`FileSnapshot::from_metadata`) instead of the old whole-mailbox parse, and `--follow` has an **8 MiB incomplete-record cap** with 64 KiB streaming reads. Your `appserver.rs` extraction must preserve these — do not reintroduce the whole-mailbox reparse.
  - `spawn.rs` (Step 4 rewrites this): spawn now runs a **detached stderr-pump** that caps each log at ~4 MiB (newest 3 MiB) and holds a **per-log liveness flock** GC treats as active; a Codex child's log is **renamed to the born session id**. The app-server spawn path (`thread/start`, no `codex exec`) must keep the log-cap + GC-correlation properties or explicitly note their N/A.
  - `store.rs`: owns the GC, `is_uuid`, resume-lock probe, and the registry `Entry` schema — REUSE these; Step 2's `server` field is a new `Entry` addition (default `None`, back-compat with the GC/legacy readers).
  - `cli.rs`: attach added a strict per-verb parser and the exit-3/exit-4 lock semantics — follow that parsing discipline for any new verb; `main.rs` header is the multi-call contract.
  Run the drift check (`git diff --stat 866312a..52227e9 -- plugins/session-relay/`) to see the full delta, then reconcile.

## Steps

| # | Task | Status |
|---|------|--------|
| 1 | Refactor the WS/app-server client out of `watch.rs` into a shared module (e.g. `appserver.rs`) with no behavior change; `node scripts/ci.mjs --plugin session-relay` green before proceeding (pure-refactor gate). | done |
| 2 | Server configuration recording the socket path. Precedence: a per-registration `server` field on the registry `Entry` (set at `relay spawn --server <path>` / `relay register`) wins; the store-wide `RELAY_APP_SERVER` env (already read by `watch.rs:181-185` — reuse that name, do NOT introduce a second `AGENT_RELAY_*` variant) is the fallback. NOTE: `store::Entry` (store.rs:462-468) has no `server` field today — this is a registry-schema addition (add field + `to_json`/`from_json`, default `None` for legacy entries). `relay doctor` reports reachability (connect + initialize). Absence semantics documented in the skill. | pending |
| 3a | Visible-injection INVESTIGATION (STOP-gated, no production code): against a real `codex app-server`, determine which `thread/inject_items` payload types render in an attached `codex --remote` TUI (Context fact: raw items are ignored). Also determine how to detect a turn-in-flight on a thread (thread status / loaded-list APIs) for the contention rule in 3b. STOP: mail findings + the chosen delivery design to the orchestrator and wait for confirmation before 3b. | pending |
| 3b | App-server-native delivery per the confirmed 3a design: `relay wake` and `relay watch` doorbell prefer the app-server route when a socket is configured AND reachable — `thread/resume` + visible mail delivery + optional auto-turn — falling back to today's `codex exec resume` path (with its lock) when no server is configured OR the configured server is unreachable (per Step 2's probe; note `decide()` in watch.rs:111-117 currently routes on `server.is_some()` alone — this widens it). If no injected payload renders (3a), the fallback design: inject fenced mail (model-visible) + auto-turn whose nudge tells the worker to acknowledge mail receipt in its visible reply. **Turn contention rule:** before any relay-initiated `turn/start`, check the thread's turn state; a human/user turn in flight → skip and retry on the next tick, never fire a competing turn. **Elicitation trust rule:** auto-accept `bus` elicitations ONLY on threads the relay itself spawned (registry origin marker, Step 4); on joined/foreign threads decline ALL elicitations. | pending |
| 4 | Spawn integration: `relay spawn --tool codex --server <path>` creates the thread under the app-server (`thread/start` + first turn) instead of `codex exec`; keep `codex exec` as the no-server default. **Birth/identity duties the SessionStart hook normally performs move to the spawner** (no `codex exec` process runs, so no hook fires): (a) the relay self-registers the returned thread id (same registry shape, plus an origin marker `spawned_via: app-server` used by 3b's elicitation rule); (b) the bus-worker identity + guardrail prompt (today built by `spawn.rs` for the founding exec) rides in the `thread/start` first turn. Wake/watch then co-drive the same thread the user opens with `codex --remote`. | pending |
| 5 | Codex-track live proof (manual, scripted where possible): real `codex app-server --listen unix://<tmp>` with a throwaway CODEX_HOME **whose config includes the session-relay `bus` MCP server** (otherwise the elicitation-accept path and the worker's bus replies cannot be exercised); spawn a worker via the server; attach a real `codex --remote` TUI; `relay send` + wake → the human-visible TUI shows the worker's responding turn live; no `codex exec resume` process involved; rollout has a single writer. Record the command transcript in `## Notes`. | pending |
| 6 | Claude channel (experimental): verify installed Claude Code supports channels (version + `--channels` flag present; STOP-and-report if not, descoping this track to a documented recipe). Build a minimal relay channel MCP server (new `relay channel` verb or a small mjs under the plugin) that emits a channel event per new bus mail for the registered session; wire an opt-in recipe (`claude --channels …`) into the skill; mark EXPERIMENTAL everywhere. Selftest what is testable without a live session (event emission from a seeded mailbox). | pending |
| 7 | Docs + selftest sweep: skill gains "Live view" section (codex app-server recipe end-to-end incl. `codex --remote`, claude channel recipe, security notes: unix-perm auth boundary, untrusted-mail fences unchanged); extend `fake-app-server.mjs` for thread/start + visible-item cases; full gate green; `main.rs` verb contract updated if verbs were added. | pending |

## Acceptance criteria

- Step 1 refactor: gate green with zero behavior diff (selftest count unchanged at that point).
- Fake-app-server selftests: server-preferred wake path chosen when configured+reachable, fallback taken when not; spawn-via-server produces a registry entry whose id matches the fake server's thread id; visible-delivery payload shape pinned.
- Step 5 live proof recorded in `## Notes` with the exact commands and observed TUI behavior (worker turn visible in the attached `codex --remote` TUI; no second rollout writer).
- Claude track: either the channel demonstrably emits events for new mail (recorded probe) or a STOP-and-report descope with version evidence — both are acceptable outcomes, silence is not.
- `node scripts/ci.mjs --plugin session-relay` exit 0 (cargo legs verifiably run); selftest green; no `bin/` changes.
- Security invariants intact: mail fenced as untrusted in every new delivery path; auto-turn nudge carries no mail-derived instructions; elicitation policy TIGHTENED per 3b (auto-accept `bus` only on relay-spawned threads; decline all on joined threads) — fake-server test pins both branches.
- Turn-contention rule pinned by a fake-server test: a thread with a turn in flight receives no relay `turn/start` that tick.

## Out of scope / do-NOT-touch

- `relay attach` (separate plan); store GC (separate plan).
- Releasing/binaries (user-gated, batched).
- Any weakening of the untrusted-mail fencing or approval policies.
- Claude-side injection beyond the channels seam (no transcript writing, no TUI hacks).

## Cold-handoff checklist

- File manifest: named per step; protocol ground truth lives in watch.rs header + Context URLs. ✔
- Environment & commands: real-server proof requirements, fake-server test seam, drift expectation. ✔
- Interface/data contracts: config precedence (Step 2), delivery preference + fallback (Step 3), spawn parity (Step 4). ✔
- Executable acceptance: fake-server selftests + recorded live proof + gate exits. ✔
- Out of scope: listed. ✔
- Decision rationale: app-server-native because upstream endorses it and it removes the second writer; channel marked experimental because upstream calls it research preview; visible-delivery investigation gated by STOP because the rendering fact is version-dependent. ✔
- Known gotchas: raw injected items invisible to TUI; inject→turn/start needs settle delay; WS handshake quirks (see watch.rs header); picker/#11415 walls; cargo-skip-silently; channels version gate; **turn contention** when a human co-drives the same thread (relay auto-turn `approvalPolicy:never` vs the user's in-flight turn — the settle-delay gotcha only covers a quiet thread); **`bus`-by-name elicitation trust** (watch.rs:561-567 accepts any elicitation whose `serverName == "bus"`) holds only while the app-server runs the relay's OWN MCP config — under a user-launched app-server a differently-owned server named `bus` would be auto-accepted; **app-server threads skip the SessionStart hook** (no `codex exec` process ⇒ no auto-register + no identity/guardrail injection — the parent must register the thread id and the first turn must carry the bus-worker prompt). ✔

## Self-review

Score: 91/100 · trajectory 88→91 · stopped: plateau. Big/risky plan (7 steps, protocol work) — reviewed against the rubric with emphasis on failure modes: the two version-dependent facts (inject rendering, channels availability) are STOP-gated rather than assumed; the refactor step is separately gated so protocol churn can't hide a regression; the live proof is a recorded acceptance artifact, not a claim. Residual: Step 4's thread/start parameter surface is left to executor investigation against the same docs — bounded by the fake-server contract tests. Open questions: none for the user — experimental labeling and fallback design were set by policy above; executor STOPs route back here when facts land.

Orchestrator ingest (2026-07-10): findings 3/5/6/9 encoded — Step 3 split into 3a (STOP-gated investigation incl. turn-state API) / 3b (delivery + turn-contention rule + tightened elicitation policy keyed to a new `spawned_via` origin marker); Step 4 now owns the hook-less birth/identity duties (self-register + first-turn guardrail prompt); Step 5 requires the bus MCP in the throwaway CODEX_HOME. Finding 7 resolved in `relay-attach-command` (server-aware attach). Finding 10 DECISION: Step 4 stays in scope — spawn-then-open is the user's explicit wish; the Step-3-only MVP is the recorded descope option if 3a/4 investigation explodes. Decided by the orchestrating agent.

Draft cross-check (2026-07-10): [claude opus] 10 findings (3 high, 5 med, 2 low) — corrected the app-server env var to the shipped `RELAY_APP_SERVER` (Step 2, was `AGENT_RELAY_APP_SERVER`); resolved Step 3's reachability contradiction (fall back to the doorbell when a configured server is unreachable, not only when unconfigured); replaced Step 2's undecided env-vs-field "and/or" with a stated precedence and flagged the missing `server` field on the registry `Entry`; named watch.rs + spawn.rs in the drift note (both are in relay-store-hygiene's `affected_paths`, the highest-risk merge); added gotchas for co-drive turn contention, `bus`-by-name elicitation trust under a user-owned app-server, and the skipped SessionStart hook. Left as findings for the author (judgment-changing, not auto-applied): app-server birth/identity rework spanning Steps 4–5 (self-register + first-turn prompt + bus MCP in the throwaway CODEX_HOME); the elicitation-trust boundary; a turn-contention design/STOP; the relay-attach-command split-brain interaction (`codex resume` vs `codex --remote`); Step 3 over-bundling five deliverables around a mid-step STOP; and the leaner Step-3-only MVP scope.

## Notes

Step 1 pure-refactor gate: moved the Unix-socket WebSocket transport, JSON-RPC request/pump logic, app-server delivery flow, payload builders, and their six unit tests from `watch.rs` to the shared `appserver.rs` module. The metadata-only mailbox presence poll, 64 KiB follow reads, and 8 MiB incomplete-record cap remain in `watch.rs`. `cargo test --locked` stayed at 50 Rust tests total (47 unit + 1 bus smoke + 2 lock race), and the sandboxed source-binary summary remained `PASS: session-relay self-test — 101 checks (binary: rust/target/x86_64-unknown-linux-musl/release/relay)`. The full `node scripts/ci.mjs --plugin session-relay` gate passed with cargo fmt and clippy active; only the documented local host-build digest warning appeared.

## Review

(placeholder — completion review writes this)
