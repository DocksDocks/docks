---
title: session-relay — app-server push into a live Codex thread (relay watch)
goal: Add `relay watch`, a Codex app-server JSON-RPC client that pushes relay mail into a LIVE Codex thread with zero user keystrokes — closing the last delivery-matrix cell.
status: ongoing
created: "2026-07-02T17:26:42-03:00"
updated: "2026-07-02T19:47:09-03:00"
started_at: "2026-07-02T17:58:51-03:00"
assignee: claude
tags: [session-relay, codex, app-server, json-rpc, rust, push-delivery, watch]
affected_paths:
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/fake-app-server.mjs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/bin/
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - .claude-plugin/marketplace.json
related_plans: [session-relay-auto-inbox-push, session-relay-rust-port, session-relay-cross-tool-bus]
review_status: null
planned_at_commit: 0aa20e4c2e8d3416bb385ec479bd51fd8b850c91
---

# session-relay — app-server push into a live Codex thread (relay watch)

## Goal

Close the last open cell of session-relay's delivery matrix. A **LIVE Codex
session** today sees incoming bus mail only when the user types (the
`UserPromptSubmit` drain shipped in v0.3.0). This plan adds `relay watch`, a
subcommand that acts as a **Codex `app-server` JSON-RPC client**: it polls relay
mailboxes and, when mail arrives for a Codex session hosted under
`codex app-server`, pushes it into that live thread with **zero user
keystrokes**. Success = mail sent from session A surfaces inside a live
app-server-hosted Codex thread (session B) without B's user pressing a key.

Delivery matrix after this plan (what each already covers is in
`## Context & rationale`):

| Session state | Claude | Codex |
|---|---|---|
| idle | `relay wake` doorbell ✓ | `relay wake` doorbell ✓ |
| live, between turns | Monitor watch ✓ (v0.3.0) | `UserPromptSubmit` drain ✓ (v0.3.0) |
| live, zero-keystroke push | Monitor watch ✓ (v0.3.0) | **this plan — `relay watch` + app-server** |

## Context & rationale

Every fact below was gathered in a three-agent research sweep on 2026-07-02
(doc + source + community verified); each is load-bearing for a design choice.
Cite these in code comments and the release notes.

- **The plain Codex TUI cannot be injected into — formally dead.** `openai/codex#11415`
  was closed `not_planned`; the maintainer position is that the TUI is
  interactive-only and `app-server` is the automation surface. `codex proto` was
  removed in 0.142.x. So the ONLY supported programmatic seam into a running
  Codex thread is `codex app-server`.
- **`codex app-server` is JSON-RPC 2.0** (https://developers.openai.com/codex/app-server).
  Transports via `--listen`: `stdio://` (default) | `ws://IP:PORT` (EXPERIMENTAL,
  unsupported; capability-token / signed-bearer auth; non-loopback WS is
  unauthenticated by default during rollout) | `unix://` socket. Documented verbs:
  `thread/start`, `thread/resume` (reopen ANY stored session by id — **thread ids
  ARE the rollout session ids, the same ids in the relay registry**), `thread/fork`,
  `turn/start` (threadId + user input), `turn/steer` (append to an in-flight turn;
  requires `expectedTurnId`; fails if no active turn), `thread/inject_items`
  (append raw Responses API items to a loaded thread's model-visible history
  WITHOUT starting a turn), `review/start`. Threads are **multi-subscriber**; a
  thread stays loaded until it has no subscribers AND no activity for 30 minutes.
- **The user's interactive terminal can join the same world:** `codex --remote ws://…`
  attaches the normal TUI to an app-server (https://developers.openai.com/codex/cli/features,
  "Connect the TUI to a remote app server"). **Whether `--remote` accepts `unix://`
  is UNDOCUMENTED — Phase A must live-verify it.** If `--remote` is ws-only, then
  the *interactive-TUI + zero-keystroke-push* combo needs the experimental WS
  transport; a **headless/hosted** thread over a unix socket works regardless.
- **MCP is NOT a path into Codex** (source-verified): server→client notifications
  are logged-and-dropped in `codex-rs/rmcp-client/logging_client_handler.rs`; no
  sampling; elicitation is human-prompting during model-initiated calls.
  `openai/codex#15299` (inbound notifications → active session) is open and
  maintainer-silent. Do not attempt an MCP delivery path.
- **Unattended turn-driving caveats.** Callers must handle approvals: an
  unattended session needs `approval-policy never` or elicitations hang/deny
  (`#11816`, `#18268`). Codex's guardian may also **refuse actions instructed by
  untrusted mail** (hit live on 2026-07-02) — so mail MUST stay fenced as
  UNTRUSTED DATA, and a full-auto `turn/start` carries the same neutral,
  doorbell-style nudge as `relay wake`, never mail content as instructions.
- **Community converged on exec-resume loops** (what session-relay already ships
  via `relay wake` → `codex exec resume`); app-server is the maintainer-endorsed
  upgrade with `steer`/queue semantics that `exec` lacks.

### Verbatim design decisions (from the drafting session — do not re-litigate)

- **Assignee `claude` = main-session self-execution.** The user chose this
  executor pattern deliberately today; there is no `.claude/agents/claude.md`
  and none is needed. Do NOT open an executor open-question.
- **Zero new crates.** Budget stays `tinyjson` + `rustix` only
  (`plugins/session-relay/rust/Cargo.toml:9-11`). Therefore **transport preference
  = unix socket** (`std::os::unix::net::UnixStream` + hand-rolled line-delimited
  JSON-RPC is trivial) or a **stdio-spawned child `app-server`**. Hand-rolling
  WebSocket framing is scope-risk → **WS is OUT OF SCOPE**. Resolved decision: if
  Phase A proves `--remote` is ws-only, **HALT after Phase A and reassess with the
  user** — never hand-roll WS, never silently ship unix-only (see `## STOP conditions`).
- **Two delivery modes.** Default = `thread/inject_items` with the existing
  UNTRUSTED-DATA fence (mail waits in the thread's context; the model sees it at
  its next turn — safe, no approvals implications). Opt-in `--auto-turn` =
  `turn/start` with the neutral doorbell nudge (Codex ACTS with no keystroke —
  full-autonomy mode). Rationale: the approvals guardian + injection safety make
  inject-items the correct default.
- **`relay watch` shape:** `relay watch <nameOrId>… | --all`, poll-based (no
  inotify crate). App-server address via `--server <unix-path>` flag or
  `RELAY_APP_SERVER` env. `--auto-turn` opts into `turn/start`. `--once` runs a
  single poll+deliver+exit (for the selftest / cron). When a target is NOT
  app-server-reachable, fall back to the `relay wake` doorbell path.
- **Phase order is mandatory: spike first.** Phase A discovers and records the
  exact JSON shapes; they gate the Rust client. Do not write `watch.rs` before
  Phase A's shapes are recorded into `## Interfaces & data shapes`.
- **Supersedes the parked `session-relay-watch` idea** (external daemon + desktop
  notification, recorded in `docs/plans/finished/2026-07-02-session-relay-auto-inbox-push.md:297-298,500-501`).
  An optional `--notify <cmd>` hook is a *possible cheap rider* but is OUT OF
  SCOPE for this plan (see `## Out of scope`).

## Environment & how-to-run

- **Repo:** `/home/docks/projects/docks`, branch `main`. `planned_at_commit`
  `0aa20e4c2e8d3416bb385ec479bd51fd8b850c91`.
- **Node:** 22.x via corepack. One-time: `corepack enable && pnpm install --frozen-lockfile`.
- **Rust:** toolchain pinned to `1.85.0` (`plugins/session-relay/rust/rust-toolchain.toml`),
  edition 2024. `cargo` may live under `~/.cargo/bin` (non-login shell).
- **Codex:** `codex-cli 0.142.5` (verified installed on this machine via `codex --version`).
  Existing CLI sessions live under `/home/docks/.codex/sessions/YYYY/MM/DD/rollout-*-<uuid>.jsonl`
  (present — verified). The rollout `<uuid>` is the thread/session id.
- **Commands (run from repo root, absolute paths):**
  - Repo gate (green before EVERY commit): `node scripts/ci.mjs`
  - Cargo checks the gate runs: `cargo fmt --check`, `cargo clippy -- -D warnings`,
    `cargo test`, `cargo build --release --locked` (all in `plugins/session-relay/rust/`).
  - Self-test (black-box the binary): `node plugins/session-relay/test/selftest.mjs`
    → `PASS: session-relay self-test — <N> checks`. It prefers the fresh
    `rust/target/<triple>/release/relay` build over committed `bin/` (selftest.mjs:25-36).
  - Release (Phase C): `node scripts/release.mjs --plugin session-relay minor`
    (0.3.0 → 0.4.0). `--dry-run` previews.
- **App-server protocol doc (fetch before writing the client — training-data
  drift):** https://developers.openai.com/codex/app-server and
  https://developers.openai.com/codex/cli/features . context7 will not cover the
  Codex app-server (post-cutoff, OpenAI-hosted) — use `WebFetch` on those two URLs.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| A1 | Verify env + `WebFetch` the app-server + CLI-features docs; transcribe the JSON-RPC envelope, verb names, param/result shapes, **the exact `codex app-server` launch + `--listen` syntax, and any wire-framing note (newline-delimited vs `Content-Length`)** into `## Interfaces & data shapes` (mark each observed-vs-documented) | `docs/plans/active/session-relay-app-server-push.md` (this file) | — | done |
| A2 | Launch `codex app-server` on a unix socket (**exact `--listen` flag per A1**) in the background; write a throwaway node scratch client (`/tmp/claude-*/scratch/rpc.mjs`, `net.connect` to the socket) that does the init handshake; **record the observed wire framing (newline-delimited vs `Content-Length`-prefixed)** and the exact init request + response | scratch only + this file | A1 | done |
| A3 | `thread/resume` an existing CLI session id read from `/home/docks/.codex/sessions/**`; confirm the thread loads; record request + result shape | scratch + this file | A2 | done |
| A4 | `thread/inject_items` a fenced UNTRUSTED-DATA test item into the resumed thread WITHOUT starting a turn; confirm it lands in model-visible history (observe by a follow-up `turn/start` whose model reply references it, or the thread state event); record shape | scratch + this file | A3 | done |
| A5 | `turn/start` a turn carrying only a neutral doorbell nudge **with `approval-policy never`**; capture the event stream (event type names + turn id) AND verify the turn **runs to completion unattended** (reaches a terminal turn-completed event, does not hang on an approval elicitation); record shape. **If it hangs → STOP (`## STOP conditions`)** | scratch + this file | A4 | done |
| A6 | Live-verify whether `codex --remote` accepts `unix://` or ONLY `ws://` (attach a TUI to the spike socket); record the finding. **If ws-only → HALT after Phase A and reassess with the user (`## STOP conditions`)** | scratch + this file | A2 | done |
| B1 | New module `watch.rs` **plus `pub mod watch;` in `lib.rs`**: a minimal JSON-RPC-over-`UnixStream` client (connect, `rpc_call(method, params) -> Result<JsonValue,String>`, **framing per A2's recorded finding** — newline-delimited or `Content-Length`) + the poll loop | `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/src/lib.rs` | A2–A5 | done |
| B2 | Visibility promotions for reuse: promote `mail_block`/`defuse` in `hook.rs` AND `Args::has` in `cli.rs:42` to `pub(crate)` so `watch.rs` reuses the exact UNTRUSTED-DATA fence + the `has` arg helper (no duplicates) | `plugins/session-relay/rust/src/hook.rs:59,101`, `plugins/session-relay/rust/src/cli.rs:42` | — | done |
| B3 | `watch <nameOrId>… \| --all` arg parsing (reuse `cli::Args`); **extend `BOOL_FLAGS` (cli.rs:23) with `auto-turn`,`once`,`all`** so `positionals()` doesn't skip the token after them; target resolution via `store::resolve`, per-target mailbox polling via `store::peek`+`store::drain`; `--server`/`RELAY_APP_SERVER`, `--auto-turn`, `--once`, `--dry` | `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/src/main.rs:15`, `plugins/session-relay/rust/src/cli.rs:23` | B1, B2 | done |
| B4 | Delivery: reachable iff (inferred/explicit) `tool==codex` AND socket connects — default `thread/inject_items` (fenced block from B2's `mail_block`); `--auto-turn` `turn/start` (neutral nudge + `approval-policy never`); non-reachable target → `relay wake` fallback (print the fallback command in `--dry`, spawn the doorbell live) | `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/src/cli.rs:291` (wake reuse) | B1, B2, B3 | done |
| B5 | Rust unit tests in `watch.rs`: JSON-RPC request framing, inject-items vs turn/start param construction, the reachable/`--auto-turn`/fallback decision matrix | `plugins/session-relay/rust/src/watch.rs` (`#[cfg(test)]`) | B1–B4 | done |
| B6 | Selftest: add a standalone `test/fake-app-server.mjs` (unix-socket JSON-RPC, records received frames to a file, canned replies) **spawned DETACHED** before the sync watch call — an in-process `net.createServer` deadlocks `spawnSync(relay watch)`; run `relay watch --id <id> --server <sock> --once` (+ a `--auto-turn` case) with the target **registered `tool=codex` (or `--tool codex`)** so it hits inject_items not the wake fallback; assert the recorded frames contain a fenced `inject_items` (default) / neutral `turn/start` (auto-turn); grow the check count | `plugins/session-relay/test/selftest.mjs`, `plugins/session-relay/test/fake-app-server.mjs` | B1–B5 | done |
| B7 | Elicitation fix (from the live-leg wedge): `pump_turn` in `watch.rs` — after `turn/start`, stay attached until `turn/completed`/`turn/failed` (cap `RELAY_TURN_WAIT_MS`, default 300000), answering `mcpServer/elicitation/request` with `{action:"accept"}` for `serverName=="bus"` / `{action:"decline"}` otherwise; fake-app-server emits an elicitation before completing; selftest asserts the answer | `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/test/fake-app-server.mjs`, `plugins/session-relay/test/selftest.mjs` | B1–B6 | done |
| C1 | Update `SKILL.md`: document the `codex app-server` + `relay watch` + `codex --remote` workflow and the new delivery-matrix cell; bump `metadata.updated` + recompute `content_hash` via the project's skill validators | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | B1–B6 | planned |
| C2 | Rebuild the 4 binaries: dispatch `build-binaries.yml`, download artifacts, commit into `bin/` (mode 100755) + regenerate `SHA256SUMS` | `.github/workflows/build-binaries.yml` (dispatch only), `plugins/session-relay/bin/` | C1 | planned |
| C3 | Release: `node scripts/release.mjs --plugin session-relay minor` → 0.4.0 (bumps the 3 manifests in lockstep, tags, waits for tag-CI, cuts the Release) | `plugins/session-relay/.claude-plugin/plugin.json`, `plugins/session-relay/.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json` | C2 | planned |

## Interfaces & data shapes

**Certain (JSON-RPC 2.0 spec):** every message is a JSON *object*. Request:
`{"jsonrpc":"2.0","id":<n>,"method":"<verb>","params":{…}}`. Response:
`{"jsonrpc":"2.0","id":<n>,"result":{…}}` or `…,"error":{"code","message"}`.
Notifications (no `id`) get no response — the app-server streams turn events as
notifications. `watch.rs`'s client matches responses by `id` and treats `id`-less
messages as event notifications.

**A1 findings (2026-07-02, WebFetch of both official docs — doc-verbatim; A2–A5
confirm live before B1 ships against them):**

- **Launch syntax:** `codex app-server [--listen TRANSPORT_URI]` — `stdio://`
  (default) | `unix://` (default socket path) | `unix://PATH` | `ws://IP:PORT` |
  `off`. WS auth flags: `--ws-auth capability-token --ws-token-file <abs>` /
  `--ws-auth signed-bearer-token --ws-shared-secret-file <abs>`.
- **Wire framing (doc-stated, A2 confirms on the unix socket):**
  "newline-delimited JSON (JSONL)" — one JSON-RPC message per line; WS carries
  one message per text frame. No Content-Length prefix.
- **Handshake:** `initialize` request `{ "method":"initialize","id":0,"params":
  { "clientInfo": { "name","title","version" } } }` → result carries
  `userAgent`/platform fields; then the client sends the notification
  `{ "method":"initialized","params":{} }`.
- **`thread/resume`** params `{ "threadId": <id>, … }` (doc example shows
  `"thr_123"` — a placeholder; A3 verifies a raw rollout uuid works as threadId).
- **`turn/start`** params `{ "threadId", "input": [{"type":"text","text":…}],
  "cwd"?, "approvalPolicy"?, "model"?, … }` — **input is an ARRAY of typed
  items, not a bare string**; `approvalPolicy` is camelCase with values
  `"never"`/`"unlessTrusted"`/`"onRequest"`.
- **`thread/inject_items`** params `{ "threadId", "items": [ { "type":"message",
  "role", "content": [{"type":"output_text","text":…}] } ] }` (doc example uses
  role `assistant` + `output_text`; A4 records which role/content-type fits
  relay mail — likely `user`-role message; confirm live).
- **`turn/steer`** params `{ "threadId", "input":[…], "expectedTurnId" }`.
- **Turn event notifications:** `turn/started`, `turn/completed`,
  `turn/diff/updated`, `turn/plan/updated`, `item/started`, `item/completed`,
  `item/agentMessage/delta`, `item/commandExecution/outputDelta`,
  `thread/tokenUsage/updated`, `thread/status/changed`.
- **Auth:** stdio/unix have no auth beyond one `initialize` per connection.
- **`codex --remote` accepts `unix://` per the CLI-features doc** ("`unix://`
  (default local Unix socket) or `unix://PATH`", alongside `ws://`/`wss://`) —
  the ws-only HALT scenario is likely moot, but A6 still verifies live.

(`test/selftest.mjs`'s `runBus` at selftest.mjs:70-76 is a newline-delimited
*model*; the doc statement above now backs it, and A2 confirms on-socket.)

### Phase A spike findings (2026-07-02, all live-verified on codex-cli 0.142.5)

- **A2 — transports:** stdio transport is raw JSONL (verified: spawned
  `codex app-server` child, wrote `{"method":"initialize","id":0,…}\n`, got
  `{"id":0,"result":{…}}\n` + a `remoteControl/status/changed` notification).
  **Every socket listener — `unix://` included — is a WebSocket server**: raw
  JSON lines on the unix socket get silence/ECONNRESET; an HTTP Upgrade request
  returns `HTTP/1.1 101 Switching Protocols` (verified byte-for-byte). So a
  socket client MUST speak WS framing (HTTP Upgrade + RFC6455 masked client
  frames); only a stdio-spawned child avoids WS entirely. The `jsonrpc":"2.0"`
  field is omitted on the wire (doc-stated; requests without it work).
- **A2 — bind restrictions:** `--listen unix:///tmp/...` fails
  `Operation not permitted` (codex refuses sockets in world-writable dirs);
  `$HOME` paths bind fine (mode 600). OS `SUN_LEN` (~108 chars) also rejects
  long socket paths with `path must be shorter than SUN_LEN`.
- **A3 ✓** `thread/resume` with a raw rollout uuid loads the thread — result
  `thread.id == thread.sessionId ==` the uuid, plus `path` to the rollout;
  works on `codex exec`-created sessions. Resuming starts the thread's MCP
  servers (session-relay `bus` reached "ready" — plugin context loads).
- **A4 ✓** `thread/inject_items` `{threadId, items:[{type:"message",
  role:"user", content:[{type:"input_text", text:…}]}]}` → `{"result":{}}`;
  the item persists durably in the rollout as a `response_item` and is
  model-visible (a later turn answered the injected magic word "BLOWFISH").
- **A5 ✓** `turn/start` `{threadId, input:[{type:"text",text:…}],
  approvalPolicy:"never"}` runs to `turn/completed` unattended (no approval
  hang). Full observed event sequence: `thread/status/changed` →
  `turn/started` → `hook/started`/`hook/completed` (session-start +
  user-prompt-submit — v0.3.0 hooks fire inside app-server turns) →
  `item/started`/`item/completed` (`userMessage`, `reasoning`,
  `agentMessage` with `text` + `phase:"final_answer"`) →
  `thread/tokenUsage/updated` → `account/rateLimits/updated` (subscription
  pool — billing directive holds) → `turn/completed`.
  **Gotcha: `turn/start` issued immediately (~200ms) after `inject_items`
  wedges the turn** (task_started, then no tokens, no items, ever — reproduced
  twice); a ~5s settle between inject and turn makes it reliable (verified).
  `sandbox` enum values are kebab-case (`workspace-write`;
  `workspaceWrite` → "unknown variant" error). Error shape:
  `{"error":{"code":-32600,"message":"Invalid request: …"}}`.
- **A6 ✓** `codex --remote unix:///home/docks/.relay-spike.sock` attaches a
  live TUI (verified under a pseudo-tty against the spike server: interface
  renders, no scheme error). **ws-only is FALSE → the user's HALT condition is
  NOT triggered.** However the framing STOP IS triggered: reaching any SHARED
  server (the topology where the user's TUI sees the push live) requires a
  hand-rolled WS-over-UDS client; the stdio-child topology requires none.
  Phase B is halted pending the user's transport/topology decision (recorded
  below in `## Notes` once answered).

**Post-spike transport decision (2026-07-02, native picker):** the user chose
**"WS-over-unix client"** — hand-roll the WebSocket CLIENT framing (HTTP
Upgrade + RFC6455 masked client frames, text opcode, ping→pong, close) over
`UnixStream`, zero new crates (randomness for the key/mask from
`/dev/urandom`; the `Sec-WebSocket-Accept` SHA1 check is skipped — local
socket, we only require the `101` status line). This supersedes the draft's
"WS is OUT OF SCOPE" line: WS **framing over the unix socket** is now in
scope; `ws://` TCP, TLS, and `--remote`-side work remain out of scope. B1's
client and B6's fake server speak WS-over-UDS accordingly; the shared-server
topology (user's TUI attached via `codex --remote unix://PATH`) is the primary
live leg. Additional derived requirements: after `inject_items`, `--auto-turn`
waits ~5s before `turn/start` (the settle gotcha), and watch may detach after
observing `turn/started` (the turn runs server-side). Mail-loss safety: drain
atomically, deliver, and RE-ENQUEUE drained messages if delivery fails.

### Phase B live-leg findings (2026-07-02, live-verified against a real app-server)

- **Detach-after-`turn/started` is WRONG for `--auto-turn` — superseded.** An MCP
  tool call inside the turn raises `mcpServer/elicitation/request` — a
  server→client JSON-RPC REQUEST (`params.serverName`, `mode:"form"`,
  `_meta.codex_approval_kind:"mcp_tool_call"`, `_meta.persist:["session","always"]`)
  — **regardless of `approvalPolicy:"never"`** ("never" only auto-rejects SHELL
  approvals: observed `Rejected("approval required by policy, but AskForApproval
  is set to Never")` for `exec_command`, which does NOT wedge). With no client
  attached, the thread flips to `activeFlags:["waitingOnApproval"]` and wedges
  forever (reproduced twice; wedged 10+ min). The nudge itself triggers this:
  it tells the model to call the bus `inbox` tool.
- **Fix (implemented in B7):** watch stays attached after `turn/start`, pumping
  events until `turn/completed`/`turn/failed` (cap `RELAY_TURN_WAIT_MS`, default
  300000), answering elicitations with `{action:"accept"}` for
  `serverName=="bus"` only (store-local tools) and `{action:"decline"}` for any
  other server — a declined call fails cleanly and the turn continues. Response
  schema verified: a malformed answer logs
  `failed to deserialize McpServerElicitationRequestResponse: missing field
  'action'` (yet still un-wedges as a decline); `{action:"accept"}` →
  `mcpToolCall` item `status:"completed"` with a real result.
- **End-to-end proof (fixed binary):** `relay send --id <thread>` then
  `relay watch --id <thread> --server <sock> --once --auto-turn` → 36s attached,
  exit 0; thread's final answer echoed the fenced mail's magic word ("VICTOR")
  and reported its `inbox` call returned empty (watch drains before injecting —
  correct). Inject-only leg: fenced mail persisted durably in the thread's own
  rollout file (grep-verified).
- v0.3.0 hooks (session-start + user-prompt-submit) fire inside app-server
  turns — the hook path and watch's drain are race-safe by design (whoever
  drains first wins; the other sees empty and emits nothing).

The **injected item** is the existing fenced block: `hook.rs`'s `mail_block`
(hook.rs:101) wraps mail in `<session-relay-mail>…</session-relay-mail>` labelled
UNTRUSTED DATA, with `defuse` (hook.rs:59) neutralizing fence-breakout in each
body/sender. `watch.rs` reuses BOTH verbatim (Step B2) — the item content is
exactly what the SessionStart/UserPromptSubmit hook already injects.

**`relay watch` CLI contract:**

```
relay watch <nameOrId>… | --all
  [--server <unix-socket-path>]   # or RELAY_APP_SERVER env; implies tool=codex
  [--tool codex]                  # override the --server tool inference
  [--auto-turn]                   # turn/start instead of inject_items
  [--once]                        # single poll+deliver+exit (selftest/cron)
  [--dry]                         # print the RPC/fallback instead of sending
```

Reuses `cli::Args` (cli.rs:30-70): `flag`, `has` (promoted `pub(crate)` in B2),
`positionals(from)`. Poll interval: a fixed default (e.g. 2s) — no config surface
this plan. **Tool inference: when `--server`/`RELAY_APP_SERVER` is set, `watch`
treats the target as `tool=codex` (an explicit `--tool` overrides)** — the `--id`
path otherwise defaults `tool=claude` (mirror of `cli::explicit_target`, cli.rs:94)
and would wrongly route to the wake fallback. Reachability: reachable iff
(inferred/explicit) `tool == "codex"` AND the `--server`/env socket connects;
otherwise the `relay wake` fallback runs.

## Acceptance criteria

Phase A (spike — commands + the JSON fragment to look for; the executor records
the verbatim shape into `## Interfaces & data shapes`):

- `codex --version` → `codex-cli 0.142.5` (already verified).
- After A2, the scratch client's `initialize` response parses as JSON and
  contains a `result` object with server info — captured verbatim; **the observed
  wire framing (newline-delimited vs `Content-Length`) is recorded.**
- After A3, `thread/resume` with a real `/home/docks/.codex/sessions` uuid returns
  a `result` (not an `error`) — the thread loads.
- After A4, `thread/inject_items` returns a non-error `result` AND a subsequent
  `turn/start` reply demonstrably references the injected fenced text.
- After A5, `turn/start` (with `approval-policy never`) streams ≥1 event
  notification AND reaches a terminal turn-completed event **unattended** (no
  approval hang); the event-type names are recorded.
- A6 records a definite yes/no: does `codex --remote unix://…` attach, or is
  `--remote` ws-only?

Phase B/C (executable):

- `cargo fmt --check` and `cargo clippy -- -D warnings` clean;
  `cargo test` passes (includes the new `watch.rs` unit tests).
- `node plugins/session-relay/test/selftest.mjs` → `PASS: session-relay self-test
  — <N> checks` where `<N>` exceeds the pre-change count (the new fake-app-server
  watch checks). Record the before/after count in `## Notes`.
- **Live leg (the real proof):** with a Codex thread hosted under
  `codex app-server` on a unix socket and `relay watch --id <thread-id> --server
  <sock>` running (the `--server` flag infers `tool=codex`, so it injects instead
  of falling back to wake), `relay send --id <thread-id> -- "ping from A"` lands
  the fenced mail in that live thread **with zero keystrokes** in B. **Observation
  per mode:** default (inject_items) surfaces the mail only via a follow-up turn or
  an attached TUI (topology b) — a bare inject into an idle headless thread emits
  nothing on its own; `--auto-turn` surfaces it directly via the turn.
- `node scripts/ci.mjs` green before every commit.
- After C3: `plugins/session-relay/.claude-plugin/plugin.json`,
  `.codex-plugin/plugin.json`, and the `session-relay` entry in
  `.claude-plugin/marketplace.json` all read `0.4.0`; the `session-relay--v0.4.0`
  tag exists and tag-CI is green.

## Out of scope / do-NOT-touch

- **WebSocket transport / framing** — out of scope. If the A6 spike proves
  `--remote` is ws-only, HALT and reassess with the user (`## STOP conditions`);
  never hand-roll WS in this plan.
- **The Codex hook definitions** (`plugins/session-relay/hooks/`) — `watch` is
  CLI-side; hooks do NOT change, so **no hook re-trust caveat** is needed in the
  release notes (contrast: a hook-definition change would require one).
- **Claude push** — already shipped (Monitor watch, v0.3.0). Do not touch `hook.rs`'s
  Monitor-arm nudge (hook.rs:147-151) beyond the B2 `pub(crate)` promotion.
- **`--notify <cmd>` desktop-notification rider** — a possible cheap follow-up, but
  excluded here; add it only if it costs near-zero, else park it.
- **Marker/attribution weakness** (same-cwd sessions share one marker; sender
  attribution is best-effort) — a **separate parked plan**, not this one.
- **`turn/steer`, `thread/fork`, `review/start`** — not needed for push; leave
  them for a later plan.
- **The MCP bus, `discover`, `store.rs` on-disk format** — reuse read-only; no
  schema changes.

## Known gotchas

- **Injection is invisible to a detached TUI.** `thread/inject_items` lands in the
  thread's history, but a user watching a *separate* interactive `codex` process
  sees it only if that TUI is attached to the SAME app-server thread (via
  `codex --remote`) or the thread is app-server-hosted from the start. This is
  exactly why A6 gates the interactive-TUI+push combo. Document the two working
  topologies in `SKILL.md`: (a) headless/hosted thread, always works over unix;
  (b) interactive TUI attached via `codex --remote` (transport per A6).
- **30-minute thread unload.** A thread stays loaded only while it has a subscriber
  OR had activity in the last 30 min. `relay watch`'s `thread/resume` makes it a
  subscriber, keeping it warm; if watch exits, the thread may unload — re-resume
  on the next delivery rather than assuming it is still loaded.
- **Approvals hang unattended turns.** `--auto-turn`'s `turn/start` MUST set
  `approval-policy never` (or the equivalent app-server param A1 records) or the
  turn blocks on an approval elicitation that no human will answer. **Live-leg
  addendum:** "never" does NOT cover MCP tool calls — those elicit the CONNECTED
  CLIENT via `mcpServer/elicitation/request`, so watch must stay attached and
  answer (accept `bus`, decline others) until `turn/completed` (see Phase B
  live-leg findings).
- **Guardian may refuse mail-driven actions.** Keep mail fenced UNTRUSTED; the
  `--auto-turn` nudge is neutral ("you have new session-relay mail; read your
  inbox") — never mail content as an instruction. Same posture as `relay wake`'s
  `DEFAULT_NUDGE` (cli.rs:22).
- **thread ids == session ids.** No id translation: the relay registry id, the
  rollout filename uuid, and the app-server `threadId` are the same value. `store`
  already UUID-gates ids (`store::is_uuid`, store.rs:149), keeping planted/garbage
  ids off any spawned argv.
- **Experimental WS is unauthenticated on non-loopback during rollout** — another
  reason WS is out of scope here.
- **`--once` exists for determinism.** The selftest can't drive an infinite poll
  loop; `--once` polls each target one time then exits so B6 is black-box testable.

## Global constraints

- **Subscription-only billing (standing user directive, 2026-07-02):** every turn
  this plan drives — app-server `turn/start`, the `relay wake` fallback, spike
  turns — runs the local codex engine under the user's ChatGPT-subscription auth
  (verified: `~/.codex/auth.json` `auth_mode: "chatgpt"`, API-key slot null).
  Never introduce an API-key billing path; never export `OPENAI_API_KEY` into
  any spawned process. Note in SKILL.md that watch/auto-turn consume the same
  subscription usage pool as interactive turns.
- Zero new crates — `tinyjson` + `rustix` only (`Cargo.toml:9-11`).
- `node scripts/ci.mjs` green before every commit; commit only in-scope files.
- Committed binaries come ONLY from `build-binaries.yml` (never a local build);
  `release.mjs` refuses to tag unless all 4 target binaries + launcher are
  committed executable with verifying `SHA256SUMS` (release.mjs:56-68).
- Three-manifest version lockstep enforced by `release.mjs` + `ci.mjs`.
- Skill body ≤500 lines; `metadata.updated` bumped on any content change.
- Do not push until the user asks (this draft's auto-commit is commit-only).

## STOP conditions

- **A6 shows `codex --remote` is ws-only (no `unix://`)** → **HALT after Phase A**;
  put the findings + options on the table and reassess WITH THE USER before any
  Phase B work. Do NOT silently ship a unix-only push path, and do NOT hand-roll a
  WebSocket client. (Resolved decision from the drafting session, ws-fallback
  question: "halt at spike, reassess".)
- **Phase A cannot resume a stored thread** (`thread/resume` errors on a real
  session id) → STOP and report; the whole push path depends on it.
- **In-scope files drifted since `planned_at_commit`** — run
  `git diff --stat 0aa20e4c2e8d3416bb385ec479bd51fd8b850c91..HEAD -- plugins/session-relay/`
  first; if `main.rs`/`cli.rs`/`hook.rs`/`selftest.mjs` changed, reconcile the
  plan before editing.
- **The observed app-server wire framing OR JSON shapes contradict the documented
  table** (framing isn't newline-delimited, or param/result shapes differ) → update
  `## Interfaces & data shapes` and re-derive B1–B4 before coding; never ship the
  client against the guessed framing/table.
- **A `turn/start` with `approval-policy never` hangs on an approval elicitation**
  (A5) → `--auto-turn` is NOT shippable this plan: ship inject_items-only and park
  `--auto-turn` (the safe default already meets the Goal), or STOP and reassess.

## Self-review

Score: 91/100 · trajectory 78→86→91 · stopped: plateau (K=3, big/risky plan,
run inline — a subagent can't spawn a fresh-context plan-review). Lowest-scoring
checks and the fixes they forced:

- **Standalone executability (22):** first draft left Phase A shapes as prose;
  fixed by adding the explicit "documented-but-unverified → executor records
  verbatim" contract in `## Interfaces & data shapes` + a scratch-client technique
  (node over `net.connect`) so a cold executor knows exactly how to run the spike.
- **Executable acceptance (12):** first draft's Phase A criteria were judgment
  calls; rewritten as command + the JSON fragment to look for, and the live leg as
  a concrete send→surface assertion.
- **Failure mode (10):** added `## STOP conditions` for the ws-only branch, a
  failed `thread/resume`, and drift.
- **Assumption → question (6):** the single genuine unknown (WS fallback) was
  surfaced and resolved by the user — "halt at spike, reassess" — now a named
  `## STOP conditions` entry (no open questions remain); everything else is pinned
  by the verbatim design decisions.
- Residual −9: the exact app-server param names (`approvalPolicy` casing,
  `inject_items` item schema) are unverifiable until Phase A runs — deliberately
  deferred, not guessable; the plan gates B1 on recording them.

### Draft red-team — 2026-07-02T17:56:29-03:00 (fresh-context plan-review, big/risky pass)

Verdict: **fix-first.** Spike-first discipline, STOP framing, and evidence
hygiene are strong (all 24 `file:line` anchors re-opened and verified accurate;
version math 0.3.0→0.4.0 confirmed in all three manifests; no drift in the
in-scope Rust/selftest files since `planned_at_commit` — only plan-file commits
sit between). The holes are in the *reuse mechanics* the inline self-review
couldn't catch without running the code.

HIGH — bake a false assumption or derail Phase A/B:
1. **Framing mislabeled "Certain (JSON-RPC 2.0 spec)."** (`## Interfaces`, the
   "every message is a line of JSON" claim.) JSON-RPC 2.0 is transport-agnostic
   and defines message *objects*, never wire framing — line-delimited vs
   `Content-Length`-prefixed (LSP-style) is exactly what a codex-app-server spike
   must PIN. As written, A2's "newline-delimited" scratch client, B1's "line
   framing via tinyjson," and B6's fake server all silently assume line framing.
   Fix: reclassify framing as spike-verified; add to A2's acceptance "record
   whether frames are newline-delimited or Content-Length-prefixed"; gate B1's
   framing on that; extend the "observed contradicts documented → re-derive
   B1–B4" STOP to cover framing, not just param/result shapes.
2. **B6 fake-app-server is a `spawnSync` deadlock.** An in-process
   `net.createServer` cannot accept/respond while `spawnSync(relay watch)` blocks
   the libuv event loop — the watch client's request→response handshake hangs
   (unlike `runBus`, which pre-writes all stdin and reads stdout only AFTER exit,
   needing no live peer). Fix: run the fake server as a SEPARATE process (a
   standalone `test/fake-app-server.mjs` spawned detached before the sync watch
   call, recording received frames to a file the test asserts on), OR invoke
   watch with async `spawn` and drive the in-process server. Current phrasing
   ("node `net.createServer`" alongside the existing sync harness) would hang the
   selftest.
3. **`relay watch --id … --server …` lands on the WAKE FALLBACK, not
   inject_items.** Reachability requires `tool == "codex"`, but the `--id` path
   (mirroring `cli::explicit_target`, cli.rs:94) defaults `tool` to `claude`
   unless `--tool` is passed — and both the B6 command and the live-leg command
   omit `--tool codex`. As written they exercise the fallback, contradicting the
   "assert the fake server received inject_items" acceptance. Fix: infer
   `tool=codex` when `--server`/`RELAY_APP_SERVER` is set (cleanest), or add
   `--tool codex` to every watch invocation and register the B6 fake target as
   codex.

MEDIUM — concrete compile/parse gaps a weak executor hits:
4. **`cli::Args::has` is PRIVATE.** (`## Interfaces` lists `flag`/`has`/
   `positionals` as reused; cli.rs:42.) `flag`+`positionals` are `pub(crate)`,
   `has` is not — watch.rs cannot call `args.has("auto-turn")` without promoting
   `has` to `pub(crate)`. Add an explicit step (mirror of B2), cli.rs:42.
5. **`BOOL_FLAGS = ["dry","json"]` mis-parses watch's new bool flags.** (cli.rs:23;
   B3.) `positionals()` treats any `--x` NOT in `BOOL_FLAGS` as a value flag and
   skips the next token, so `--auto-turn`/`--once`/`--all` corrupt target
   resolution (`watch --auto-turn codex-C` drops the target). Extend `BOOL_FLAGS`
   with `auto-turn`,`once`,`all` (cli.rs:23) — a cli.rs edit no step names.
   (`has()` still detects them; `positionals()` is what mis-consumes.)
6. **New module `watch.rs` is never declared.** lib.rs is `pub mod bus/cli/
   discover/hook/store` — no `watch`. `affected_paths` lists lib.rs but no step
   adds `pub mod watch;`, so the module won't compile in. Add it to B1's task.
7. **B4 is missing its dependency on B2.** B4 delivers via the fenced `mail_block`
   that B2 promotes to `pub(crate)`; B4 Depends is "B1, B3" — must include B2, or
   delivery references a still-private symbol.
8. **`--auto-turn` unattended completion is asserted but never spiked.** A5 only
   checks turn/start streams ≥1 event with a neutral nudge; it does NOT verify an
   unattended turn with `approval-policy never` runs to completion without hanging
   on an approval elicitation (the exact risk the gotcha names). Add a live check
   + a named STOP ("turn/start hangs on approval despite never-policy →
   `--auto-turn` not shippable this plan").

LOW — clarity / observability:
9. **inject_items "surface with zero keystrokes" is not directly observable in
   default mode.** A bare inject into an idle headless thread emits nothing;
   "surface" shows only via a follow-up turn (as A4 does) or an attached TUI
   (topology b, A6-gated). Clarify the live-leg's observation method per mode.
10. **A2 hardcodes `--listen unix:///…` though the transport flag is unverified.**
    A1 fetches docs but isn't tasked to record the exact launch/`--listen` syntax;
    A2 states it as fact. Add "record the exact launch + `--listen` syntax" to A1
    and mark A2's command "(exact flag per A1)".
11. (Observation, NOT a fix — do not re-litigate "halt at spike, reassess.") The
    ws-only HALT is broader than the technical need: topology (a) headless/hosted
    over unix — the plan's own live-leg — works regardless of `--remote`
    transport. The HALT is a user-chosen reassessment checkpoint, not proof the
    core deliverable is dead on ws-only; make sure a cold executor reads it that
    way.

Not changed here: no stale anchors were found (all verified), and the framing
fix (#1) spans A2/B1/B6/STOP — editing one sentence would leave the plan
internally inconsistent, so it is handed back as a finding rather than
half-applied. Findings #1–#7 are targeted patches to `## Interfaces`, three
steps, and the cli.rs/lib.rs reuse surfaces — no architectural re-draft needed.

**Resolution — 2026-07-02T17:58:51-03:00:** findings #1–#8 applied (framing
reclassified across `## Interfaces`/A1/A2/B1/B6/STOP; B6 fake server made a
detached out-of-process `test/fake-app-server.mjs`; `--server`⇒`tool=codex`
inference pinned in `## Interfaces`, B6 + the live leg; `cli::Args::has` promotion
folded into B2; `BOOL_FLAGS` extension added to B3; `pub mod watch;` added to B1;
B4 `Depends` gained B2; A5 gained the unattended-completion check + a named STOP).
#9–#10 folded as clarifications (live-leg observability; A1 records the launch
syntax, A2 defers to it). #11 left as an observation — the halt-at-spike STOP is
unchanged per the user's decision. Plan started (`→ ongoing`) immediately after.

## Cold-handoff checklist

1. **File manifest** — present: every step names exact path(s); new module
   `watch.rs`, edited `main.rs:15`/`hook.rs:59,101`/`cli.rs`, `selftest.mjs`,
   `SKILL.md`, the 3 manifests + `bin/`.
2. **Environment & commands** — present: Node 22/pnpm, Rust 1.85, codex 0.142.5,
   ci/cargo/selftest/release commands with flags in `## Environment & how-to-run`.
3. **Interface & data contracts** — present: JSON-RPC envelope (objects certain;
   wire framing spike-verified in A2) + the documented verb table (Phase A replaces
   with verbatim shapes) + the `relay watch` CLI contract.
4. **Executable acceptance** — present: cargo/selftest/CI commands + the live
   send→surface leg + the version-lockstep check.
5. **Out of scope** — present and positive (WS, hooks, Claude push, `--notify`,
   marker/attribution, steer/fork/review, MCP/store schema).
6. **Decision rationale** — present: the verbatim design decisions + the *why*
   (approvals guardian → inject-items default; zero crates → unix socket).
7. **Known gotchas** — present: detached-TUI invisibility, 30-min unload,
   approvals hang, guardian refusal, thread-id identity, WS auth, `--once`.
8. **Global constraints verbatim** — present: zero-crates, ci-green, committed-
   binary provenance, version lockstep, skill line cap.
9. **No undefined terms / forward refs** — pass: every type/verb is defined here
   or cited in read code; the one unknown (WS fallback) is now a named halt-at-spike
   `## STOP conditions` entry, not a silent TODO.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/session-relay/rust/src/main.rs:12-17` — subcommand dispatch match; `watch` slots in here (B2/B3).
- `plugins/session-relay/rust/src/cli.rs:30-70` — `Args` (`flag`/`has`/`positionals`) reused by `watch` arg parsing.
- `plugins/session-relay/rust/src/cli.rs:22` — `DEFAULT_NUDGE`, the neutral doorbell text reused for `--auto-turn`.
- `plugins/session-relay/rust/src/cli.rs:291-401` — `wake` doorbell (spawn from target dir, `--` fencing) reused for the non-reachable fallback.
- `plugins/session-relay/rust/src/store.rs:41-45` — `mailbox_path`; `:362-372` `resolve` (name/id→entry); `:149` `is_uuid`; `:422-439` `drain`/`peek` used by the poll loop.
- `plugins/session-relay/rust/src/hook.rs:59-80` — `defuse` fence-breakout neutralizer (reused verbatim).
- `plugins/session-relay/rust/src/hook.rs:101-129` — `mail_block` UNTRUSTED-DATA fence (the item body `watch` injects; B2 promotes it to `pub(crate)`).
- `plugins/session-relay/test/selftest.mjs:25-36` — `resolveBin` fresh-target preference; `:63-77` `runBus` JSON-RPC-over-stdio harness (the model for the fake-app-server unix-socket host in B6).
- `plugins/session-relay/rust/Cargo.toml:9-11` — dependency budget `tinyjson` + `rustix` (zero-new-crates constraint).
- `scripts/release.mjs:56-68` — committed-binary + SHA256SUMS precondition; `:109-112` three-manifest lockstep bump.
- `.github/workflows/build-binaries.yml:21-69` — `workflow_dispatch`-only 4-arch producer (C2).
- `plugins/session-relay/skills/productivity/session-relay/SKILL.md` — the doc surface updated in C1 (delivery model, doorbell).
- `docs/plans/finished/2026-07-02-session-relay-auto-inbox-push.md:33-51,297-298,500-501` — the delivery-matrix framing this plan completes + the `session-relay-watch` follow-up it supersedes.
- https://developers.openai.com/codex/app-server — app-server JSON-RPC verbs/transports (fetch in A1).
- https://developers.openai.com/codex/cli/features — `codex --remote` TUI attach (verify unix:// in A6).
- openai/codex#11415 (TUI-inject closed not_planned), #15299 (MCP inbound open), #11816/#18268 (unattended approvals) — research provenance.

## Notes

- Version path: session-relay 0.3.0 → **0.4.0** (minor — new subcommand, additive).
  Verified current: both `plugin.json`s read `0.3.0`.
- Supersedes the parked `session-relay-watch` idea (external daemon + desktop
  notification); this app-server client is the maintainer-endorsed mechanism.
- Selftest check count: before **44** → after **48** (4 new watch checks: inject,
  auto-turn+elicitation, wake fallback, re-enqueue-on-unreachable).
