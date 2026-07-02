---
title: session-relay — app-server push into a live Codex thread (relay watch)
goal: Add `relay watch`, a Codex app-server JSON-RPC client that pushes relay mail into a LIVE Codex thread with zero user keystrokes — closing the last delivery-matrix cell.
status: planned
created: "2026-07-02T17:26:42-03:00"
updated: "2026-07-02T17:26:42-03:00"
started_at: null
assignee: claude
tags: [session-relay, codex, app-server, json-rpc, rust, push-delivery, watch]
affected_paths:
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/test/selftest.mjs
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
  WebSocket framing is scope-risk → **WS is OUT OF SCOPE** unless Phase A proves
  `--remote` is ws-only AND the user then explicitly opts in (see `## Open questions`
  + `## STOP conditions`).
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
| A1 | Verify env + `WebFetch` the app-server + CLI-features docs; transcribe the JSON-RPC envelope, verb names, and param/result shapes into `## Interfaces & data shapes` (mark each observed-vs-documented) | `docs/plans/active/session-relay-app-server-push.md` (this file) | — | planned |
| A2 | Launch `codex app-server --listen unix:///tmp/relay-spike.sock` in the background; write a throwaway node scratch client (`/tmp/claude-*/scratch/rpc.mjs`, `net.connect` to the socket, newline-delimited JSON-RPC) that does the init handshake; record the exact init request + response | scratch only + this file | A1 | planned |
| A3 | `thread/resume` an existing CLI session id read from `/home/docks/.codex/sessions/**`; confirm the thread loads; record request + result shape | scratch + this file | A2 | planned |
| A4 | `thread/inject_items` a fenced UNTRUSTED-DATA test item into the resumed thread WITHOUT starting a turn; confirm it lands in model-visible history (observe by a follow-up `turn/start` whose model reply references it, or the thread state event); record shape | scratch + this file | A3 | planned |
| A5 | `turn/start` a turn carrying only a neutral doorbell nudge; capture the event stream (event type names + turn id); record shape | scratch + this file | A4 | planned |
| A6 | Live-verify whether `codex --remote` accepts `unix://` or ONLY `ws://` (attach a TUI to the spike socket); record the finding. **If ws-only → the `## Open questions` WS-fallback decision governs** | scratch + this file | A2 | planned |
| B1 | New module `watch.rs`: a minimal JSON-RPC-over-`UnixStream` client (connect, `rpc_call(method, params) -> Result<JsonValue,String>`, line framing via `tinyjson`) + the poll loop | `plugins/session-relay/rust/src/watch.rs` | A2–A5 | planned |
| B2 | Make the fence reusable: promote `mail_block`/`defuse` in `hook.rs` to `pub(crate)` so `watch.rs` reuses the exact UNTRUSTED-DATA block (no duplicate fence) | `plugins/session-relay/rust/src/hook.rs:59,101` | — | planned |
| B3 | `watch <nameOrId>… \| --all` arg parsing (reuse `cli::Args`), target resolution via `store::resolve`, per-target mailbox polling via `store::peek`+`store::drain`; `--server`/`RELAY_APP_SERVER`, `--auto-turn`, `--once`, `--dry` | `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/src/main.rs:15` | B1, B2 | planned |
| B4 | Delivery: default `thread/inject_items` (fenced block); `--auto-turn` `turn/start` (neutral nudge + `approval-policy never`); non-reachable target → `relay wake` fallback (print the fallback command in `--dry`, spawn the doorbell live) | `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/src/cli.rs:291` (wake reuse) | B1, B3 | planned |
| B5 | Rust unit tests in `watch.rs`: JSON-RPC request framing, inject-items vs turn/start param construction, the reachable/`--auto-turn`/fallback decision matrix | `plugins/session-relay/rust/src/watch.rs` (`#[cfg(test)]`) | B1–B4 | planned |
| B6 | Selftest: host a FAKE app-server on a unix socket (node `net.createServer`, minimal JSON-RPC), run `relay watch --id <id> --server <sock> --once` (+ a `--auto-turn` case), assert the fake server received a fenced `inject_items` (default) / neutral `turn/start` (auto-turn); grow the check count | `plugins/session-relay/test/selftest.mjs` | B1–B5 | planned |
| C1 | Update `SKILL.md`: document the `codex app-server` + `relay watch` + `codex --remote` workflow and the new delivery-matrix cell; bump `metadata.updated` + recompute `content_hash` via the project's skill validators | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | B1–B6 | planned |
| C2 | Rebuild the 4 binaries: dispatch `build-binaries.yml`, download artifacts, commit into `bin/` (mode 100755) + regenerate `SHA256SUMS` | `.github/workflows/build-binaries.yml` (dispatch only), `plugins/session-relay/bin/` | C1 | planned |
| C3 | Release: `node scripts/release.mjs --plugin session-relay minor` → 0.4.0 (bumps the 3 manifests in lockstep, tags, waits for tag-CI, cuts the Release) | `plugins/session-relay/.claude-plugin/plugin.json`, `plugins/session-relay/.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json` | C2 | planned |

## Interfaces & data shapes

**Certain (JSON-RPC 2.0 spec):** every message is a line of JSON. Request:
`{"jsonrpc":"2.0","id":<n>,"method":"<verb>","params":{…}}`. Response:
`{"jsonrpc":"2.0","id":<n>,"result":{…}}` or `…,"error":{"code","message"}`.
Notifications (no `id`) produce no response — the app-server streams turn events
as notifications. `watch.rs`'s client matches responses by `id` and treats
`id`-less lines as event notifications (same discipline as `test/selftest.mjs`'s
`runBus` at selftest.mjs:70-76).

**Documented-but-unverified (Phase A A1–A5 replaces this table with the verbatim
observed shapes — do NOT ship the client against these guesses):**

| Verb | params (expected) | result / effect |
|---|---|---|
| `initialize` (handshake) | client info + protocol version | server info + capabilities |
| `thread/resume` | `{ threadId: <session-uuid> }` | loads the stored thread; the client becomes a subscriber |
| `thread/inject_items` | `{ threadId, items: [<Responses-API item>] }` | appends to model-visible history; **no turn starts** |
| `turn/start` | `{ threadId, input: <user text>, approvalPolicy?: "never" }` | starts a turn; streams turn events as notifications |

The **injected item** is the existing fenced block: `hook.rs`'s `mail_block`
(hook.rs:101) wraps mail in `<session-relay-mail>…</session-relay-mail>` labelled
UNTRUSTED DATA, with `defuse` (hook.rs:59) neutralizing fence-breakout in each
body/sender. `watch.rs` reuses BOTH verbatim (Step B2) — the item content is
exactly what the SessionStart/UserPromptSubmit hook already injects.

**`relay watch` CLI contract:**

```
relay watch <nameOrId>… | --all
  [--server <unix-socket-path>]   # or RELAY_APP_SERVER env
  [--auto-turn]                   # turn/start instead of inject_items
  [--once]                        # single poll+deliver+exit (selftest/cron)
  [--dry]                         # print the RPC/fallback instead of sending
```

Reuses `cli::Args` (cli.rs:30-70): `flag`, `has`, `positionals(from)`. Poll
interval: a fixed default (e.g. 2s) — no config surface this plan. Reachability:
a target is app-server-reachable iff `tool == "codex"` AND a `--server`/env
socket path exists and connects; otherwise the `relay wake` fallback runs.

## Acceptance criteria

Phase A (spike — commands + the JSON fragment to look for; the executor records
the verbatim shape into `## Interfaces & data shapes`):

- `codex --version` → `codex-cli 0.142.5` (already verified).
- After A2, the scratch client's `initialize` response line parses as JSON and
  contains a `result` object with server info — captured verbatim into the plan.
- After A3, `thread/resume` with a real `/home/docks/.codex/sessions` uuid returns
  a `result` (not an `error`) — the thread loads.
- After A4, `thread/inject_items` returns a non-error `result` AND a subsequent
  `turn/start` reply demonstrably references the injected fenced text.
- After A5, `turn/start` streams ≥1 event notification; the event-type names are
  recorded.
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
  <sock>` running, `relay send --id <thread-id> -- "ping from A"` causes the
  fenced mail to surface inside that live thread **with zero keystrokes** in B.
- `node scripts/ci.mjs` green before every commit.
- After C3: `plugins/session-relay/.claude-plugin/plugin.json`,
  `.codex-plugin/plugin.json`, and the `session-relay` entry in
  `.claude-plugin/marketplace.json` all read `0.4.0`; the `session-relay--v0.4.0`
  tag exists and tag-CI is green.

## Out of scope / do-NOT-touch

- **WebSocket transport / framing** — out unless the A6 spike proves `--remote` is
  ws-only AND the user opts in (`## Open questions`). Do not hand-roll WS otherwise.
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
  turn blocks on an approval elicitation that no human will answer.
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

- Zero new crates — `tinyjson` + `rustix` only (`Cargo.toml:9-11`).
- `node scripts/ci.mjs` green before every commit; commit only in-scope files.
- Committed binaries come ONLY from `build-binaries.yml` (never a local build);
  `release.mjs` refuses to tag unless all 4 target binaries + launcher are
  committed executable with verifying `SHA256SUMS` (release.mjs:56-68).
- Three-manifest version lockstep enforced by `release.mjs` + `ci.mjs`.
- Skill body ≤500 lines; `metadata.updated` bumped on any content change.
- Do not push until the user asks (this draft's auto-commit is commit-only).

## STOP conditions

- **A6 shows `codex --remote` is ws-only** AND the delivered scope requires the
  interactive-TUI + zero-keystroke-push combo → STOP; the WS-fallback open
  question governs (hand-rolled WS is out of scope by default).
- **Phase A cannot resume a stored thread** (`thread/resume` errors on a real
  session id) → STOP and report; the whole push path depends on it.
- **In-scope files drifted since `planned_at_commit`** — run
  `git diff --stat 0aa20e4c2e8d3416bb385ec479bd51fd8b850c91..HEAD -- plugins/session-relay/`
  first; if `main.rs`/`cli.rs`/`hook.rs`/`selftest.mjs` changed, reconcile the
  plan before editing.
- **The observed app-server JSON shapes contradict the documented table** → update
  `## Interfaces & data shapes` and re-derive B1–B4 before coding; never ship
  against the guessed table.

## Open questions

- **id:** `ws-fallback` · **type:** choice (custom allowed) · resolved-by-spike
  (A6). If the Phase A spike proves `codex --remote` is **ws-only** (no `unix://`),
  how should the interactive-TUI + zero-keystroke-push combo be handled?
  - **Keep WS out of scope; ship unix-socket push for headless/hosted threads
    only, and document `codex --remote` as ws-transport for the interactive combo
    without implementing a WS client** *(recommended)* — honors the zero-new-crates
    budget; the headless topology already delivers the goal.
  - Opt into a hand-rolled WebSocket client in THIS plan (scope + risk increase;
    still no new crate, but non-trivial framing).
  - Halt at Phase A and reassess scope with fresh findings.

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
- **Assumption → question (6):** the single genuine unknown (WS fallback) is the
  lone `## Open question`, resolved-by-spike; everything else is pinned by the
  verbatim design decisions.
- Residual −9: the exact app-server param names (`approvalPolicy` casing,
  `inject_items` item schema) are unverifiable until Phase A runs — deliberately
  deferred, not guessable; the plan gates B1 on recording them.

## Cold-handoff checklist

1. **File manifest** — present: every step names exact path(s); new module
   `watch.rs`, edited `main.rs:15`/`hook.rs:59,101`/`cli.rs`, `selftest.mjs`,
   `SKILL.md`, the 3 manifests + `bin/`.
2. **Environment & commands** — present: Node 22/pnpm, Rust 1.85, codex 0.142.5,
   ci/cargo/selftest/release commands with flags in `## Environment & how-to-run`.
3. **Interface & data contracts** — present: JSON-RPC envelope (certain) + the
   documented verb table (Phase A replaces with verbatim shapes) + the `relay
   watch` CLI contract.
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
   or cited in read code; the one unknown is explicitly an open question, not a
   silent TODO.

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
- Selftest check count (fill during B6): before `<N>` → after `<N+k>`.
