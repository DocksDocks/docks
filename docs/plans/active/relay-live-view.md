---
title: relay live-view — watch and co-drive relay conversations from open chats
goal: Make relay traffic visible live inside the user's own open sessions — codex via app-server-native delivery (shared-thread co-driving, split-brain eliminated), claude via an experimental relay channel.
status: ongoing
created: "2026-07-10T19:18:24-03:00"
updated: "2026-07-10T23:39:16-03:00"
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
| 2 | Server configuration recording the socket path. Precedence: a per-registration `server` field on the registry `Entry` (set at `relay spawn --server <path>` / `relay register`) wins; the store-wide `RELAY_APP_SERVER` env (already read by `watch.rs:181-185` — reuse that name, do NOT introduce a second `AGENT_RELAY_*` variant) is the fallback. NOTE: `store::Entry` (store.rs:462-468) has no `server` field today — this is a registry-schema addition (add field + `to_json`/`from_json`, default `None` for legacy entries). `relay doctor` reports reachability (connect + initialize). Absence semantics documented in the skill. | done |
| 3a | Visible-injection INVESTIGATION (STOP-gated, no production code): against a real `codex app-server`, determine which `thread/inject_items` payload types render in an attached `codex --remote` TUI (Context fact: raw items are ignored). Also determine how to detect a turn-in-flight on a thread (thread status / loaded-list APIs) for the contention rule in 3b. STOP: mail findings + the chosen delivery design to the orchestrator and wait for confirmation before 3b. **DONE — findings 2026-07-10, real app-server on codex 0.144.1 (see `## Notes` → 3a):** NO `thread/inject_items` payload renders in the TUI (confirmed the Context suspicion); the fenced-inject-then-neutral-ack-turn fallback IS visible (agent's reply renders, marker verified). Turn state = `ThreadStatus{notLoaded\|idle\|systemError\|active}` via `thread/read` + `thread/status/changed`, BUT the API accepts a second `turn/start` while `active` and has NO start-if-idle param → check-then-start is a cross-client TOCTOU that cannot be closed atomically. | done |
| 3b | App-server-native delivery per the confirmed 3a design: `relay wake` and `relay watch` doorbell prefer the app-server route when a socket is configured AND reachable — `thread/resume` + visible mail delivery + optional auto-turn — falling back to today's `codex exec resume` path (with its lock) when no server is configured OR the configured server is unreachable (per Step 2's probe; note `decide()` in watch.rs:111-117 currently routes on `server.is_some()` alone — this widens it). **Visible-delivery design (confirmed):** inject the mail as a fenced model-visible user item (durable context; NOT rendered), then `turn/start` with a NEUTRAL acknowledgement nudge (never quote/copy mail into the turn input) — the worker's normal reply is what the attached TUI renders. **Turn contention rule (USER DECISION 2026-07-10: Option A, best-effort visible):** before a relay-initiated `turn/start`, `thread/read` the status; `active` → skip and retry next tick; `idle` → apply the settle delay, RE-READ status immediately before `turn/start` to shrink the window, then start. This is best-effort, NOT atomic: the relay serializes its own starters but cannot exclude a simultaneous human `turn/start` (API limitation from 3a) — a same-instant race yields two concurrent turns (interleaved output, no corruption). Do NOT claim or imply an absolute no-competing-turn guarantee anywhere in code comments, logs, or docs; document the residual race in the skill. **Delivery-idempotency contract (decided 2026-07-10 — the crux of duplicate-free retry):** "delivered" = the fenced inject succeeded. On a successful inject the mailbox drain is FINAL — NEVER re-enqueue the mail even if the visible `turn/start` is skipped/deferred (busy thread). Re-enqueue ONLY when the inject step itself fails (network/protocol). This makes re-`wake` naturally idempotent (a retry finds an empty mailbox → clean no-op busy). The visible ack turn is a SEPARATE best-effort layer: **watch** keeps in-memory pending-ack state per target (model it like the existing `woken`/`wake_retries` maps), never re-injects, retries ONLY the neutral ack turn on later idle ticks, fires once, clears (`--once` exits success after inject even if the turn was deferred); **wake** is one-shot — first-read `active` → exit 3 (nothing injected, mailbox untouched, clean retry), second-read `active` after a successful inject → exit 3 too but with a DISTINCT message ("mail delivered to thread context; visible turn deferred — thread busy") so the human isn't misled; no timeout-polling inside wake. Accepted degradation: if the thread stays busy forever or the watcher dies with a pending ack, the visible turn never fires — the mail is still in the model's durable context and surfaces on the thread's next turn; document this. **Elicitation trust rule:** auto-accept `bus` elicitations ONLY on threads the relay itself spawned (registry origin marker, Step 4); on joined/foreign threads decline ALL elicitations. | done |
| 4 | Spawn integration: `relay spawn --tool codex --server <path>` creates the thread under the app-server (`thread/start` + first turn) instead of `codex exec`; keep `codex exec` as the no-server default. **Birth/identity duties the SessionStart hook normally performs move to the spawner** (no `codex exec` process runs, so no hook fires): (a) the relay self-registers the returned thread id (same registry shape, plus an origin marker `spawned_via: app-server` used by 3b's elicitation rule); (b) the bus-worker identity + guardrail prompt (today built by `spawn.rs` for the founding exec) rides in the `thread/start` first turn. Wake/watch then co-drive the same thread the user opens with `codex --remote`. **DECIDED 2026-07-10 — detached relay-owned turn pump (Option B):** foreground ordering is `thread/start` → self-register origin → build prompt with `--from <id>` → synchronously confirm initial `turn/start` → detach the existing app-server event pump. No `--watch` returns immediately after confirmed start; `--watch` waits for the pump result. Thread/start or initial turn/start failure is foreground non-zero with no detached pump. The pump owns the live connection, accepts `bus` only for the registered relay-owned origin, and exits on completion, error, or the existing spawn timeout hard cap. | done |
| 5 | Codex-track live proof (manual, scripted where possible): real `codex app-server --listen unix://<tmp>` with a throwaway CODEX_HOME **whose config includes the session-relay `bus` MCP server** (otherwise the elicitation-accept path and the worker's bus replies cannot be exercised); spawn a worker via the server; attach a real `codex --remote` TUI; `relay send` + wake → the human-visible TUI shows the worker's responding turn live; no `codex exec resume` process involved; rollout has a single writer. Record the command transcript in `## Notes`. | done |
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
- Known gotchas: raw injected items invisible to TUI (3a-CONFIRMED — the visible path is fenced-inject + a neutral ack turn); inject→turn/start needs settle delay; **turn-start is NOT atomic — the app-server accepts a second `turn/start` while `active` and has no start-if-idle param (3a-CONFIRMED), so the contention rule is best-effort (read-idle → settle → re-read → start), NEVER a guarantee; do not claim otherwise in code/logs/docs**; WS handshake quirks (see watch.rs header); picker/#11415 walls; cargo-skip-silently; channels version gate; **`bus`-by-name elicitation trust** (watch.rs:561-567 accepts any elicitation whose `serverName == "bus"`) holds only while the app-server runs the relay's OWN MCP config — under a user-launched app-server a differently-owned server named `bus` would be auto-accepted, so restrict auto-accept to relay-spawned threads; **app-server threads skip the SessionStart hook** (no `codex exec` process ⇒ no auto-register + no identity/guardrail injection — the parent must register the thread id and the first turn must carry the bus-worker prompt). ✔

## Self-review

Score: 91/100 · trajectory 88→91 · stopped: plateau. Big/risky plan (7 steps, protocol work) — reviewed against the rubric with emphasis on failure modes: the two version-dependent facts (inject rendering, channels availability) are STOP-gated rather than assumed; the refactor step is separately gated so protocol churn can't hide a regression; the live proof is a recorded acceptance artifact, not a claim. Residual: Step 4's thread/start parameter surface is left to executor investigation against the same docs — bounded by the fake-server contract tests. Open questions: none for the user — experimental labeling and fallback design were set by policy above; executor STOPs route back here when facts land.

Orchestrator ingest (2026-07-10): findings 3/5/6/9 encoded — Step 3 split into 3a (STOP-gated investigation incl. turn-state API) / 3b (delivery + turn-contention rule + tightened elicitation policy keyed to a new `spawned_via` origin marker); Step 4 now owns the hook-less birth/identity duties (self-register + first-turn guardrail prompt); Step 5 requires the bus MCP in the throwaway CODEX_HOME. Finding 7 resolved in `relay-attach-command` (server-aware attach). Finding 10 DECISION: Step 4 stays in scope — spawn-then-open is the user's explicit wish; the Step-3-only MVP is the recorded descope option if 3a/4 investigation explodes. Decided by the orchestrating agent.

Draft cross-check (2026-07-10): [claude opus] 10 findings (3 high, 5 med, 2 low) — corrected the app-server env var to the shipped `RELAY_APP_SERVER` (Step 2, was `AGENT_RELAY_APP_SERVER`); resolved Step 3's reachability contradiction (fall back to the doorbell when a configured server is unreachable, not only when unconfigured); replaced Step 2's undecided env-vs-field "and/or" with a stated precedence and flagged the missing `server` field on the registry `Entry`; named watch.rs + spawn.rs in the drift note (both are in relay-store-hygiene's `affected_paths`, the highest-risk merge); added gotchas for co-drive turn contention, `bus`-by-name elicitation trust under a user-owned app-server, and the skipped SessionStart hook. Left as findings for the author (judgment-changing, not auto-applied): app-server birth/identity rework spanning Steps 4–5 (self-register + first-turn prompt + bus MCP in the throwaway CODEX_HOME); the elicitation-trust boundary; a turn-contention design/STOP; the relay-attach-command split-brain interaction (`codex resume` vs `codex --remote`); Step 3 over-bundling five deliverables around a mid-step STOP; and the leaner Step-3-only MVP scope.

## Notes

Step 1 pure-refactor gate: moved the Unix-socket WebSocket transport, JSON-RPC request/pump logic, app-server delivery flow, payload builders, and their six unit tests from `watch.rs` to the shared `appserver.rs` module. The metadata-only mailbox presence poll, 64 KiB follow reads, and 8 MiB incomplete-record cap remain in `watch.rs`. `cargo test --locked` stayed at 50 Rust tests total (47 unit + 1 bus smoke + 2 lock race), and the sandboxed source-binary summary remained `PASS: session-relay self-test — 101 checks (binary: rust/target/x86_64-unknown-linux-musl/release/relay)`. The full `node scripts/ci.mjs --plugin session-relay` gate passed with cargo fmt and clippy active; only the documented local host-build digest warning appeared.

Step 2 added the optional registry `server` field with legacy default `None` and preservation across hook upserts; CLI/MCP register and post-birth spawn can set it. Watch precedence is registered entry, invocation `--server`, then `RELAY_APP_SERVER`; attach consumes the registered socket; doctor performs WebSocket connect plus initialize and treats absence as a healthy doorbell fallback. TDD red was two `Entry.server` compile errors. Green evidence: 51 Rust tests total (48 unit + 1 bus smoke + 2 lock race) and `PASS: session-relay self-test — 104 checks (binary: rust/target/x86_64-unknown-linux-musl/release/relay)`. The shipped skill documents the intermediate semantics and its refreshed content hash verified unchanged on an immediate maintenance pass. Full plugin + repo CI passed with cargo fmt/clippy active and only the expected local host-build digest warning.

### 3a investigation (2026-07-10, real `codex app-server` on codex-cli 0.144.1, throwaway mode-700 CODEX_HOME, attached real `codex --remote` TUI)

**Rendering:** `thread/inject_items` accepts and persists raw Responses API items, but NONE of the probed payloads render as a TUI chat row — canonical user message + `input_text`, official-doc assistant message + `output_text`, and ThreadItem-shaped `userMessage`/`agentMessage` all returned `result {}` and their unique markers never appeared in the attached TUI. This confirms the Context suspicion (raw items ignored, tui/src/chatwidget/protocol.rs L194-203). **Viable visible path (proven):** inject a fenced raw user message carrying a hidden marker, then `turn/start` with a neutral acknowledgement nudge — the TUI rendered the normal user turn and the agent reply "Received the relay mail containing marker MODEL-SEES-MAIL-8V7J." So the model sees the fenced mail and its normal reply is human-visible.

**Turn state:** generated `ThreadStatus = notLoaded | idle | systemError | active{activeFlags}`; `thread/read` returns it and `thread/status/changed` emits transitions. Observed a brief post-`turn/start` window where `thread/read` still returns `idle` before the `active` notification. **CRITICAL:** while `thread/read` was already `active`, a second `turn/start` was ACCEPTED and returned a distinct in-progress turn id; the 0.144.1 schema exposes no conditional / expected-status / start-if-idle parameter. **An atomic "never compete with a human turn" guarantee is therefore impossible via check-then-start across app-server clients** — this invalidates the original absolute contention wording.

**USER DECISION (2026-07-10, via picker) — Option A "best-effort visible":** relay checks status, skips + retries next tick when `active`, and only starts when `idle` (settle delay + immediate re-read before start to shrink the window). The user SEES the agent respond to relay mail live. The unavoidable residual: a same-instant human+relay `turn/start` yields two concurrent turns (interleaved output, no corruption). Rejected: Option B (strict race-free but joined-thread mail is hidden-inject-only, which loses the live-view the user asked for). Step 3b + gotchas updated to forbid any absolute-guarantee claim.

**Investigation hygiene:** one discarded probe — backticks in a temp shell command caused harmless launcher-side command substitution; repeated with safe quoting. No repo or live-relay state changed.

### 3b implementation (2026-07-10)

`relay wake` and `relay watch` now choose their delivery writer by configured app-server reachability. A reachable server receives fenced mailbox mail and explicit custom wake text through `thread/inject_items`; an unreachable/unconfigured server uses the existing locked doorbell. The app-server client separates failures before inject from failures after inject, so only the former re-enqueue mailbox mail. First-read active leaves the mailbox untouched. A second active read after successful inject defers the neutral acknowledgement: one-shot wake exits 3 with the required distinct wording, while long-running watch records an in-memory pending acknowledgement and retries only that turn. Joined/foreign threads pass `allow_bus: false` and decline every elicitation; Step 4 will wire the relay-owned origin marker to the already-unit-tested true branch.

TDD RED evidence: `cargo test` exited 101 on the missing `ACK_NUDGE` and ownership-aware `elicitation_action(..., allow_bus)` contract; the prior source binary's selftest exited 1 at the new double-`thread/read` assertion. Green evidence: 51 Rust tests total (48 unit + 1 bus smoke + 2 lock race) and `PASS: session-relay self-test — 110 checks (binary: rust/target/x86_64-unknown-linux-musl/release/relay)`. `node scripts/ci.mjs --plugin session-relay` passed with cargo fmt/clippy active, skill hash in sync, and only the expected local host-build digest warning. The shipped skill documents the non-atomic human-turn race and the accepted pending-ack degradation.

### Step 4 approach decision (2026-07-10, orchestrator Option B)

App-server-native spawn preserves the existing asynchronous birth contract with a detached relay-owned turn pump. Foreground work is ordered: (1) `thread/start` returns the thread id; (2) relay self-registers it with `spawned_via: app-server` before any turn can elicit; (3) relay builds the worker/guardrail prompt with `--from <id>`; (4) the initial `turn/start` must succeed synchronously; (5) only then may the already-shared app-server event pump detach and own the connection through turn completion. A thread/start or initial turn/start failure returns non-zero in the foreground and creates no detached pump.

Without `--watch`, spawn returns immediately after the turn-start response while the pump continues handling events. With `--watch`, spawn waits and mirrors the pump result. The pump is self-bounded by the existing `--timeout` / 30-second default and exits on completion, protocol/socket error, or timeout; GC may reap only relay-owned stale files, never processes. This preserves async fan-out and prevents a leaked unbounded pump. Elicitation trust remains origin-based (`bus` accepted only for `spawned_via: app-server`; joined/foreign decline all), and the Step 3a residual cross-client turn race remains explicitly non-atomic.

Step 4 tests must pin: no-watch foreground returns before turn completion; the detached pump keeps the connection alive and answers a later `bus` elicitation after foreground exit; synchronous thread-start failure leaves no pump and returns non-zero; `--watch` blocks through completion; timeout terminates the pump.

Step 4 implementation uses a hidden relay helper whose configuration and trusted first task travel over stdin, not process arguments. The helper owns one shared `appserver.rs` connection from `thread/start` through confirmed initial `turn/start` and the existing event pump. It self-registers `spawned_via: app-server` before starting the turn, so the first prompt carries `--from <id>` and only relay-owned turns enable `bus` elicitation acceptance. The foreground parent reads one start-confirmation record: no-watch exits immediately after that boundary, while `--watch` waits and mirrors completion/error/timeout. Spawn stderr still uses the bounded relay-owned spawn-log pump and origin survives later hook/register upserts.

TDD RED evidence: `cargo test` exited 101 on the missing `Entry.spawned_via` field; the prior source binary's selftest exited 1 because `spawn --server` still launched the legacy fake Codex child and failed before birth. Green evidence before the full gate: 51 Rust tests total and `PASS: session-relay self-test — 114 checks (binary: rust/target/x86_64-unknown-linux-musl/release/relay)`. The new black-box cases prove delayed post-foreground `bus` acceptance, synchronous thread/turn-start errors, watched completion, and timeout connection close.

### Step 5 real app-server proof (2026-07-10, codex-cli 0.144.1)

The proof used only a mode-700 throwaway project, `CODEX_HOME`, and `AGENT_RELAY_HOME` under `/tmp/relay-step5-q5OTr3`; the live `~/.agent-relay` was untouched. The throwaway `config.toml` pinned `gpt-5.6-sol` / `xhigh` and configured `[mcp_servers.bus]` to run the source-built relay with the throwaway store. `auth.json` was a read-only symlink to the existing login. The real server and worker birth were:

```bash
ROOT=/tmp/relay-step5-q5OTr3
RELAY=/home/vagrant/projects/docks/plugins/session-relay/rust/target/x86_64-unknown-linux-musl/release/relay
CODEX_HOME="$ROOT/codex" AGENT_RELAY_HOME="$ROOT/relay" \
  codex app-server --listen "unix://$ROOT/codex/app3.sock"
AGENT_RELAY_HOME="$ROOT/relay" "$RELAY" register proof-parent \
  --id 75757575-7575-4575-8575-757575757575 --tool codex
CODEX_HOME="$ROOT/codex" AGENT_RELAY_HOME="$ROOT/relay" "$RELAY" spawn \
  "$ROOT/project" --tool codex --server "$ROOT/codex/app3.sock" \
  --model gpt-5.6-sol --effort xhigh --name proof-worker \
  --reply-to proof-parent --timeout 120 -- \
  "Reply exactly READY-LIVE-PROOF. Do not call tools."
```

Spawn returned thread `019f4f01-d224-7cc3-992a-5e0669d2248b` after synchronous `turn/start` confirmation. The registry recorded `server: /tmp/relay-step5-q5OTr3/codex/app3.sock` and `spawned_via: app-server`. A second raw app-server client performed `initialize` then `thread/resume` for that exact thread and stayed subscribed; this is the automatable equivalent of the `codex --remote` subscriber. While it was attached, the final delivery transcript was:

```bash
AGENT_RELAY_HOME="$ROOT/relay" "$RELAY" send proof-worker \
  --from proof-parent -- \
  "Live proof marker: TARGET-ARGV-8C1D. Please acknowledge this information in your response."
CODEX_HOME="$ROOT/codex" AGENT_RELAY_HOME="$ROOT/relay" \
  RELAY_TURN_WAIT_MS=120000 "$RELAY" wake proof-worker
```

```text
queued -> proof-worker
ASSERT attached_assistant_output=PASS text=Acknowledged receipt of live proof marker: TARGET-ARGV-8C1D.
ASSERT target_codex_exec_resume_processes_during_turn=PASS thread=019f4f01-d224-7cc3-992a-5e0669d2248b matches=0
ASSERT single_rollout_writer=PASS rollout_files=1 turn_started=1 turn_completed=1
```

The exact target-process assertion sampled `pgrep -af '^([^ ]*/)?codex exec resume 019f4f01-d224-7cc3-992a-5e0669d2248b( |$)'` every 20 ms from before send through observer completion; its log was 0 bytes. The observer captured one `turn/started`, the normal final `agentMessage` above, and one `turn/completed`. Exactly one rollout file matched the worker UUID; it contains the fenced `UNTRUSTED DATA` mail, the separate neutral acknowledgement input, and the final answer. The proof target (`019f4f01…`) differs from this implementation worker (`019f4dee…`), so unrelated orchestrator wake processes cannot affect the assertion.

Human-eye handoff is intentionally separate from the automated assertion: run `relay attach proof-worker --exec` (equivalent to `codex --remote unix:///tmp/relay-step5-q5OTr3/codex/app3.sock`, then select the registered thread) before the send/wake pair. The normal neutral user row and `agentMessage` above are the two events the attached TUI renders; raw fenced mail remains hidden. The shipped skill now records this exact attach-before-send flow. The orchestrator approved this split between protocol-level automation and a user-run visual check; no headless test claims to inspect terminal pixels.

Two process-count approaches were discarded rather than counted as evidence. A machine-global `pgrep` saw this implementation session's unrelated relay wake. An unanchored target substring then matched a shell whose quoted instruction happened to contain the proof UUID. Anchoring the executable argv prefix preserves the intended full-strength assertion while excluding both false positives.

## Mistakes & Dead Ends

- Step 2 frozen-test correction (orchestrator-approved): the spawn persistence assertion initially tried `registry.agents[dry.id]`, incorrectly assuming the established `wake --dry` JSON carried an `id`; its contract is exactly `{tool, cmd, args, cwd}`. Read-only inspection proved the born entry already persisted the expected server. The corrected test resolves the born UUID through `registry.names.w2` and still asserts the unchanged contract, `registry.agents[id].server === spawnServer`. Production output was deliberately not widened to make the test pass.

## Review

(placeholder — completion review writes this)
