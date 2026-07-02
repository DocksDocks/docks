---
title: session-relay — push inbox delivery (no user ask)
goal: Surface relay mail without the user asking — a Claude Monitor watch armed via a SessionStart nudge, plus a UserPromptSubmit drain on both tools
status: planned
created: "2026-07-02T15:29:47-03:00"
updated: "2026-07-02T16:03:07-03:00"
started_at: null
assignee: claude
tags: [session-relay, hooks, push-delivery, monitor, codex, rust, userpromptsubmit]
affected_paths:
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/hooks/hooks.json
  - plugins/session-relay/hooks/codex-hooks.json
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/bin/
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - .claude-plugin/marketplace.json
related_plans: [session-relay-cross-tool-bus, session-relay-auto-discovery, session-relay-rust-port]
review_status: null
planned_at_commit: "d985799413457f905e20067be27bb4c453cf0889"
---

# session-relay — push inbox delivery (no user ask)

## Goal

Today relay mail is surfaced only at session start (the SessionStart hook drains
the inbox into `additionalContext`) or when the user explicitly tells the agent
to check its inbox. This plan adds **push delivery**: mail reaches the agent
without the user asking. Two independent surfacing paths, one per what each
runtime can do:

- **Claude Code** — the SessionStart hook emits a one-line standing instruction
  telling the model to arm a persistent `Monitor` background watch on this
  session's mailbox file. When new mail lands, Monitor re-invokes the model and
  it reads its inbox — mid-session, no user turn required.
- **Codex** — no in-session watcher primitive exists, so mail is drained on the
  next `UserPromptSubmit` hook event (same output contract as Claude): the user's
  next prompt silently carries any pending mail as injected context.

Success = a fresh Claude session surfaces mail sent from another session with no
user ask (Monitor fires), and a fresh trusted Codex session surfaces mail on its
next user prompt. Idle Claude/Codex sessions were already covered by the shipped
`relay wake` doorbell; this closes the *live-session* gap on Claude and the
*between-turns* gap on Codex.

## Context & rationale

All mechanics below were live-verified in the drafting (parent) session on
2026-07-02; each is load-bearing for a design choice.

- **Claude `Monitor` is a real harness tool** — a persistent background command
  (e.g. `tail -n0 -F <mailbox>.jsonl`) that re-invokes the model when the command
  emits output. Verified: armed in the parent session, it *survived context
  compaction* (the tail PID kept running). **Why a nudge, not a hook call:** hooks
  CANNOT invoke harness tools (Monitor included). But `SessionStart`
  `additionalContext` is read by the model on its first turn, so a one-line
  standing instruction reliably gets Monitor armed — the exact pattern docks'
  `context-tree-nudge` PostToolUse hook already uses. This is why the arming is a
  *nudge string*, not a programmatic guarantee.
- **Codex 0.142.5 exposes `UserPromptSubmit`** with the SAME hook I/O contract as
  Claude: stdin JSON `{ session_id, cwd, prompt, ... }`, stdout JSON
  `hookSpecificOutput.additionalContext` injected as developer context (verified
  against https://developers.openai.com/codex/hooks). Codex has **no**
  Monitor-equivalent, so `UserPromptSubmit` is the only push seam it offers —
  hence Claude gets both paths, Codex gets prompt-drain only.
- **Multiple surfacing paths can't duplicate or lose a message.** `store::drain`
  (`plugins/session-relay/rust/src/store.rs:422`) reads-then-removes the mailbox
  file *inside* `with_lock` — an exclusive kernel `flock(2)`
  (`store.rs:205`, `FlockOperation::NonBlockingLockExclusive`). So a
  Monitor-triggered MCP `inbox` read and a `UserPromptSubmit` drain racing the
  same mailbox are serialized: whichever wins drains the file, the other reads a
  now-missing file and returns empty (`drain` returns `Ok(Vec::new())` on
  `read_to_string` error, `store.rs:425-427`). No new locking is needed.
- **Prompt-turn overhead must stay zero.** The `UserPromptSubmit` path emits NO
  output when the inbox is empty (the common case on every prompt), so a
  no-mail turn adds nothing to the model's context.

Verbatim scope decisions from the parent session:
- Default `hook` event stays SessionStart (unchanged wiring for existing installs).
- The Monitor-arm nudge is **Claude + SessionStart only** — Codex never gets it
  (no Monitor), and no event other than SessionStart emits it (Monitor is armed
  once per session; re-arming on every prompt is waste).
- `RELAY_NO_WATCH=1` opts out of the nudge (for harnesses/users that don't want a
  background watch).
- Zero new crates — the crate's dependency budget is `tinyjson` + `rustix` only
  (`plugins/session-relay/rust/Cargo.toml:9-11`); reuse the existing UNTRUSTED
  DATA fence + `defuse()` for the prompt-drain injection.
- The version bump is **minor** (`0.2.2 → 0.3.0`) — a new user-facing feature.

## Environment & how-to-run

- **Node** 22.x, **pnpm** via corepack; **Rust** pinned by
  `plugins/session-relay/rust/rust-toolchain.toml` (rust-version floor 1.85,
  edition 2024, `Cargo.toml:3-4`).
- One-time: `corepack enable && pnpm install --frozen-lockfile`.
- **Repo gate (green before every commit):** `node scripts/ci.mjs` — runs the
  session-relay per-plugin gate: `cargo fmt --check`, `cargo clippy --all-targets
  -- -D warnings`, a `--locked` host-leg release build, committed-`SHA256SUMS`
  verification, then the self-test (`gateRust` + `nodeOk`, `scripts/ci.mjs:141-185`).
- **Rust unit tests:** `cargo test` (run in `plugins/session-relay/rust/`).
- **Self-test (black-box, throwaway store):**
  `node plugins/session-relay/test/selftest.mjs` — currently prints
  `PASS: session-relay self-test — 39 checks`.
- **Manual Rust build (host leg):** in `plugins/session-relay/rust/`,
  `cargo build --release --locked --target $(rustc -vV | sed -n 's/host: //p')`.
- **Store home** for the nudge path: `~/.agent-relay` by default, overridable via
  `AGENT_RELAY_HOME` (or legacy `SESSION_RELAY_HOME`) — `store::home_dir()`
  (`store.rs:26-36`). Mailbox file for a session id is
  `<home>/mailbox/<sanitize(id)>.jsonl` (`store::mailbox_path`, `store.rs:41-45`).

## Interfaces & data shapes

New/changed signatures the tasks cross:

- **`plugins/session-relay/rust/src/main.rs:14`** — currently
  `Some("hook") => relay::hook::run(argv.get(1).map(String::as_str))`. Change to
  pass the full argv tail: `relay::hook::run(&argv[1..])`. Reason: with a new
  `--event` flag, argv[1] is no longer always the tool tag (it can be `--event`
  or `codex`), so `hook::run` must parse the whole tail.
- **`plugins/session-relay/rust/src/cli.rs`** — make the existing flag parser
  reusable: change `struct Args(Vec<String>)` → `pub(crate) struct Args(pub(crate)
  Vec<String>)` and mark `flag`, `has`, `positionals` `pub(crate)`. `hook.rs`
  reuses it rather than a second parser. `--event` is a *value* flag, so
  `positionals()` already skips its value (only `BOOL_FLAGS = ["dry","json"]` are
  valueless, `cli.rs:23,54-58`); no change to `BOOL_FLAGS`.
- **`plugins/session-relay/rust/src/store.rs:41`** — change `fn mailbox_path`
  → `pub(crate) fn mailbox_path`, so `hook.rs` interpolates the exact mailbox path
  into the nudge instead of re-deriving the `home_dir()/mailbox/…` join (single
  source of the path scheme).
- **`plugins/session-relay/rust/src/hook.rs`** — new shapes:
  - `enum HookEvent { SessionStart, Prompt }`.
  - `pub fn run(args: &[String]) -> !` (was `run(tool_arg: Option<&str>)`).
    Because `run` diverges (`-> !`, exits the process) it is not unit-testable,
    so the tool/event derivation is factored into a **pure** helper `run` calls:
  - `fn parse_invocation(args: &[String]) -> (&'static str /* tool */, HookEvent)`
    — via `cli::Args(args.to_vec())`: `tool = "codex"` iff the first positional
    == `"codex"` else `"claude"`; `event = Prompt` iff `args.flag("event") ==
    Some("prompt")` else `SessionStart`. **Read positionals from index 0**:
    `main.rs` passes `&argv[1..]`, already stripped of the `"hook"` verb, so the
    `codex` tag sits at positional 0 — do NOT copy cli.rs's own `positionals(1)`
    idiom (that skips a leading verb this slice no longer has). Both `run` and the
    Step-5 parse test call `parse_invocation` directly.
  - Pure, unit-testable emit decision — factor the matrix out of `inner`:
    `fn render_context(tool: &str, event: HookEvent, msgs: &[JsonValue],
    no_watch: bool, mailbox_path: &str) -> Option<String>`. `None` ⇒ emit nothing
    (no stdout); `Some(ctx)` ⇒ that string is the `additionalContext`.
  - `inner` derives `hookEventName` from `event` (`SessionStart` → `"SessionStart"`,
    `Prompt` → `"UserPromptSubmit"`), reads `no_watch =
    std::env::var("RELAY_NO_WATCH").as_deref() == Ok("1")`, calls `render_context`,
    and only writes the `hookSpecificOutput` JSON when it returns `Some`.

**Emit matrix** (what `render_context` returns):

| tool | event | inbox empty | inbox non-empty |
|---|---|---|---|
| claude | SessionStart | `Some(nudge)` unless `no_watch` → `None` | `Some(mail-block + nudge)`; `no_watch` drops the nudge |
| codex | SessionStart | `None` | `Some(mail-block)` (no nudge — Codex has no Monitor) |
| claude | Prompt | `None` | `Some(mail-block)` (no nudge — Monitor is armed at SessionStart) |
| codex | Prompt | `None` | `Some(mail-block)` |

`mail-block` = the existing UNTRUSTED-DATA fence built at `hook.rs:112-123`
(`defuse()` on each name+body, wrapped in `<session-relay-mail>…</session-relay-mail>`).

**Nudge line (verbatim), interpolated with the resolved mailbox path** — appended
as the last line of the Claude+SessionStart `additionalContext`:

```
If a background file-watch/Monitor tool is available and you have not already armed one this session, arm a persistent watch on <MAILBOX_PATH> (e.g. tail -n0 -F <MAILBOX_PATH>) so new session-relay mail surfaces mid-session without waiting for the next user turn; if no such tool exists, ignore this line.
```

`<MAILBOX_PATH>` = `store::mailbox_path(&id)` rendered as a string. The
"not already armed one this session" clause is the model's own idempotency guard
against SessionStart re-fires (startup / resume / compact all fire SessionStart);
the hook cannot know whether a watch is already running, so the instruction owns
the check — same as `context-tree-nudge`.

**Hook output JSON** (unchanged shape, only `hookEventName` varies):

```json
{ "hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "…" } }
```

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Dispatch the full argv tail to the hook | `plugins/session-relay/rust/src/main.rs:14` | — | planned |
| 2 | Expose the flag parser to `hook.rs` | `plugins/session-relay/rust/src/cli.rs:30-64` (struct/methods → `pub(crate)`) | — | planned |
| 3 | Expose `mailbox_path` for the nudge | `plugins/session-relay/rust/src/store.rs:41` (`fn` → `pub(crate) fn`) | — | planned |
| 4 | Add `HookEvent`, new `run(&[String])`, pure `render_context`, event-derived `hookEventName`, `RELAY_NO_WATCH` read; move the empty-inbox early-return into `render_context` | `plugins/session-relay/rust/src/hook.rs` | 1,2,3 | planned |
| 5 | In-module unit tests for `render_context` + event parsing | `plugins/session-relay/rust/src/hook.rs` (`#[cfg(test)]`) | 4 | planned |
| 6 | Wire the `UserPromptSubmit` Claude hook (exec form) | `plugins/session-relay/hooks/hooks.json` | 4 | planned |
| 7 | Wire the `UserPromptSubmit` Codex hook (shell form) | `plugins/session-relay/hooks/codex-hooks.json` | 4 | planned |
| 8 | Extend the black-box self-test with 5 push-delivery checks | `plugins/session-relay/test/selftest.mjs` | 4,6,7 | planned |
| 9 | Rebuild 4-arch binaries, commit into `bin/` + `SHA256SUMS` | `.github/workflows/build-binaries.yml`, `plugins/session-relay/bin/` | 1-8 | planned |
| 10 | Release session-relay `0.3.0` (minor) | via `scripts/release.mjs --plugin session-relay minor` (bumps both `plugin.json`s + marketplace) | 9 | planned |

Step detail for the non-obvious rows:

- **Step 4** — the current `inner` early-returns on `msgs.is_empty()`
  (`hook.rs:92-94`) and hardcodes `hookEventName: "SessionStart"`
  (`hook.rs:127-129`). Both move behind `render_context` + the derived event name.
  `register` still runs on *every* event (including Prompt) before the drain — a
  bonus that keeps the registry `last_seen` fresh on each prompt, aiding
  `discover` liveness. Keep the `defuse()` fence for the Prompt path (bodies are
  still untrusted).
- **Step 5** — unit tests call `render_context` directly (no store needed, since
  it takes `&[JsonValue]`): (a) `Prompt` + non-empty → `Some`, and `inner`'s event
  name maps to `"UserPromptSubmit"`; (b) `Prompt` + empty → `None`; (c) `claude` +
  `SessionStart` + empty → `Some` containing the nudge + the mailbox path; (d)
  `codex` + `SessionStart` + empty → `None`; (e) `claude` + `SessionStart` +
  non-empty + `no_watch=true` → `Some` *without* the nudge. Plus one parse test
  calling the pure helper directly:
  `parse_invocation(&["codex".into(), "--event".into(), "prompt".into()])`
  → `("codex", HookEvent::Prompt)`; and `parse_invocation(&[])` → `("claude",
  HookEvent::SessionStart)` (the default-event, no-tag case).
- **Step 6** — add a sibling `"UserPromptSubmit"` array to `hooks.json` mirroring
  the SessionStart exec entry, with `"args": ["hook","--event","prompt"]`.
- **Step 7** — add a `"UserPromptSubmit"` array to `codex-hooks.json` mirroring
  the SessionStart shell entry, command
  `"\"${CLAUDE_PLUGIN_ROOT}/bin/relay\" hook codex --event prompt"`.
- **Step 8** — the 5 new checks (all through the binary, throwaway store):
  1. `relay hook --event prompt` with mail pending → stdout
     `hookSpecificOutput.hookEventName === "UserPromptSubmit"` and the body is in
     `additionalContext`.
  2. `relay hook --event prompt` with an empty inbox → **empty stdout** (no JSON).
  3. `relay hook` (claude, SessionStart) with an empty inbox → stdout
     `additionalContext` contains the Monitor nudge + the mailbox path substring.
  4. `relay hook codex` (SessionStart) with an empty inbox → **empty stdout**.
  5. `relay hook` (claude, SessionStart) with an empty inbox and
     `RELAY_NO_WATCH=1` in the env → **empty stdout** (nudge suppressed; nothing
     else to emit). Set it via the per-spawn `extra` env, which is spread AFTER
     the deletes in `envFor` so it overrides the scrub.
  Also amend `envFor` (`selftest.mjs:41-45`): **add `RELAY_NO_WATCH` to the
  delete-list** alongside the other host vars. Without this, a developer/CI host
  that exports `RELAY_NO_WATCH=1` would leak into checks #3/#4 and suppress the
  nudge, flaking check #3 (nudge-present) — not just check #5. Check #5 still
  works because its `extra` is spread after the deletes.
- **Step 9** — `build-binaries.yml` is `workflow_dispatch`-only and must run from
  the **default branch**; it produces the 4 target binaries as artifacts. Download
  them, copy into `plugins/session-relay/bin/` mode `100755`, regenerate
  `SHA256SUMS` (`shasum -a 256 relay-*`), then `node scripts/ci.mjs` green.
- **Step 10** — `node scripts/release.mjs --plugin session-relay minor` bumps
  `0.2.2 → 0.3.0` in `.claude-plugin/plugin.json` + `.codex-plugin/plugin.json` +
  the Claude marketplace entry, commits, tags `session-relay--v0.3.0`, waits for
  tag-CI, then `gh release create`. `release.mjs` refuses to tag unless all 4
  target binaries + the launcher are committed executable with a verifying
  `SHA256SUMS` (`release.mjs:64-66`).
- **Step 10b (release-notes caveat — executable sub-step).** `release.mjs`
  auto-generates the release body from commit subjects only
  (`release.mjs:159`, `git log PREV..HEAD --pretty=format:- %s`), so the Codex
  `trusted_hash` re-trust caveat (gotcha 1) would never reach consumers. After
  `gh release create`, append it to the published body:
  `gh release edit session-relay--v0.3.0 --notes-file <file>` (or
  `gh release view … --json body -q .body` → append → `--notes-file -`), adding
  the line: *"Codex users must re-trust the plugin hooks after upgrading
  (`/hooks` in an interactive session) — hook definitions changed and headless
  `codex exec` silently skips untrusted hooks."*
  **Done-condition:** `gh release view session-relay--v0.3.0 --json body -q .body
  | rg -q "re-trust"` exits 0.

## Acceptance criteria

1. `node plugins/session-relay/test/selftest.mjs` →
   `PASS: session-relay self-test — 44 checks` (39 existing + 5 new).
2. `cargo test` in `plugins/session-relay/rust/` → `test result: ok.` with the new
   `hook::tests` present (event parsing + the 5 `render_context` cases + defuse).
3. `node scripts/ci.mjs` exits 0 — `session-relay cargo fmt --check clean`,
   `cargo clippy -D warnings clean`, host leg built `--locked`, self-test passed.
4. `rg -n "UserPromptSubmit" plugins/session-relay/hooks/` → exactly two matches
   (one in `hooks.json`, one in `codex-hooks.json`).
5. `rg -n "RELAY_NO_WATCH" plugins/session-relay/rust/src/hook.rs` → at least one
   match (the opt-out is read).
6. **Live Claude leg:** open a fresh Claude session in a project, from another
   session `relay send <that-session> hi`; the Monitor fires and the mail is
   surfaced with no user ask (agent reports/acts on "hi" mid-session).
7. **Live Codex leg:** a fresh *trusted* Codex session (see gotcha 1); send mail
   while it sits idle between turns; the next user prompt surfaces the mail via
   injected developer context.
8. After release: `git tag --list 'session-relay--v0.3.0'` is non-empty and the
   GitHub Release exists.
9. Release-notes caveat present:
   `gh release view session-relay--v0.3.0 --json body -q .body | rg -q "re-trust"`
   exits 0 (the Codex re-trust caveat landed in the published body — Step 10b).

## Out of scope / do-NOT-touch

- **LIVE Codex session idle between user turns** gets nothing until its next
  prompt — Codex has no in-session watcher primitive, so there is no push there.
  The fix (an external `relay watch` daemon polling the mailbox + a desktop
  notification) is a **separate** follow-up — slug **`session-relay-watch`**. Do
  NOT fold it into this plan.
- **No new crates.** Do not add a filesystem-notify crate to get a Rust-side
  watcher; the crate budget is `tinyjson` + `rustix` only.
- **Do NOT change the doorbell** (`relay wake`, `cli.rs:291-401`) — idle sessions
  are already covered by it; this plan only adds live/between-turns surfacing.
- **Do NOT change `store::drain`/`with_lock`/the fence/`defuse()`** semantics — the
  atomicity this plan relies on already exists; reuse, don't rewrite.
- **Do NOT overwrite the committed `bin/` binaries by hand from a local build** —
  they must come from `build-binaries.yml` (byte-identity is CI-enforced against
  that same image; `scripts/AGENTS.md`).
- **Do NOT bump the `docks` plugin version** — this release is `session-relay`
  only; versions are per-plugin.

## Known gotchas

1. **Codex trusts hooks by hash.** Codex gates each hook by `trusted_hash` in
   `~/.codex/config.toml` `[hooks.state]`; a new/changed hook definition requires
   the consumer to re-trust via an interactive session (`/hooks`). Headless
   `codex exec` **silently skips untrusted hooks** — so the live Codex leg (and
   any consumer) must re-trust after upgrading. Operationalized in **Step 10b**
   (append the caveat to the published release body; acceptance #9).
2. **Hooks cannot call Monitor.** The nudge is delivered as `additionalContext`
   read on the model's first turn — there is no way for the hook process itself to
   arm a harness tool. Graceful degradation is built into the nudge wording ("if
   no such tool exists, ignore this line").
3. **SessionStart re-fires** on startup, resume, and compact (the stdin `source`
   field). The nudge must not double-arm; the "not already armed one this session"
   clause makes the model responsible for that check.
4. **`main.rs` currently reads only `argv[1]`** as the tool tag. Without the
   Step-1 change, `relay hook --event prompt` would be misparsed (`--event` read as
   the tool tag → defaults to claude but never sees the event). Step 1 is a
   prerequisite for Step 4.
5. **`hookEventName: "UserPromptSubmit"`** is emitted for the Prompt event on both
   tools per the parent directive; whether Codex validates vs ignores that field
   is confirmed only on the live leg (acceptance #7). Claude ignores unknown
   `hookEventName` values gracefully; the field mirrors Claude's own contract.
6. **Self-test env scrubbing.** `envFor` (`selftest.mjs:41-45`) deletes a fixed
   key set; Step 8 **adds `RELAY_NO_WATCH` to that delete-list** so a host
   exporting `RELAY_NO_WATCH=1` can't leak into the nudge-present checks (#3/#4)
   and flake them. Check #5 re-enables it via the per-spawn `extra` env, which is
   spread AFTER the deletes and therefore overrides the scrub.

## Global constraints

- Crate dependency budget: `tinyjson` + `rustix` only (`Cargo.toml:9-11`) — no
  additions.
- Skill/agent/body rules are unaffected; this is Rust + JSON + a test only.
- `node scripts/ci.mjs` must be green before every commit (repo constraint,
  `scripts/AGENTS.md`).
- Version bump is `minor` → `0.3.0`; keep all three manifests in lockstep (done by
  `release.mjs`).

## Cold-handoff checklist

1. **File manifest** — every step names exact path(s), most with line ranges
   (Steps table + Interfaces). ✅
2. **Environment & commands** — versions, the exact ci/test/build commands with
   flags, store-home env vars (`## Environment & how-to-run`). ✅
3. **Interface & data contracts** — new signatures, the `HookEvent` enum, the
   `render_context` contract, the emit matrix, the verbatim nudge line, the output
   JSON shape (`## Interfaces & data shapes`). ✅
4. **Executable acceptance** — 8 criteria, each a command + expected output or a
   named live procedure (`## Acceptance criteria`). ✅
5. **Out of scope** — the `session-relay-watch` follow-up, no new crates, doorbell
   untouched, no hand-built binaries, docks version frozen (`## Out of scope`). ✅
6. **Decision rationale** — why a nudge not a hook call, why Codex is prompt-only,
   why drain is already race-safe, why minor bump (`## Context & rationale`). ✅
7. **Known gotchas** — Codex trusted_hash, hooks-can't-call-Monitor, SessionStart
   re-fires, argv parse order, hookEventName echo, self-test env scrubbing. ✅
8. **Global constraints verbatim** — crate budget, ci-green, lockstep version
   (`## Global constraints`). ✅
9. **No undefined terms / forward refs** — every cited symbol (`store::drain`,
   `render_context`, `home_dir`, `mailbox_path`, `defuse`, `with_lock`,
   `BOOL_FLAGS`, `envFor`) is defined here or at a cited `file:line` read this
   session. ✅

## Self-review

Score: 90/100 · trajectory 90 · stopped: plateau (single scored pass — normal
substantive plan, first score ≥ 85, no hardening requested).

Per-check (weighted): Standalone executability 20/22 (every file:line opened this
session; the one residual is the executor identity → Open question). Actionability
16/16 (each step has a command/edit + a done-condition). Dependency order 12/12
(Steps 1-3 are independent prerequisites of 4; 6-8 depend on 4; 9-10 gate on the
rest). Evidence re-verify 10/10 (hook.rs, cli.rs, main.rs, store.rs, selftest.mjs,
hooks JSON, build-binaries.yml, ci.mjs, plugins.mjs all read this session; drain
atomicity confirmed at `store.rs:422-433` + `205`). Goal coverage 11/12 (both push
paths delivered; the acknowledged residual — live-Codex-idle — is explicitly out of
scope, not a silent gap). Executable acceptance 11/12 (6 of 8 are shell commands
with expected output; 2 are unavoidably manual live legs, procedurally specified).
Failure mode 6/10 (revert is `git revert` of a self-contained diff; no destructive
step; the binary rebuild is additive and CI-gated). Assumption → question 4/6 (the
one genuine guess — who executes — is surfaced as an Open question).

The adversarial cold-read surfaced three would-be guesses, all now resolved in the
body: (a) how `--event` coexists with the `codex` tool tag → Interfaces + Step 1/2;
(b) the exact mailbox path in the nudge → `store::mailbox_path`, made `pub(crate)`;
(c) the empty-inbox × `RELAY_NO_WATCH` behavior → the emit matrix. The only residue
needing a human is the executor/assignee.

### Draft red-team (plan-review dispatch — 2026-07-02T16:03:07-03:00, gate before start)

All cited `file:line` re-opened this session and confirmed against HEAD (`c706053`):
`main.rs:14`, `hook.rs:51/92-94/112-129/21-42`, `cli.rs:23/30/54-58/291-401`,
`store.rs:41/205/422-433`, `hooks.json`, `codex-hooks.json`, `selftest.mjs`
(39-check baseline verified by count), `release.mjs:56-68/159`, `build-binaries.yml`,
`ci.mjs` gateRust, `plugins.mjs` descriptor (4 targets), all three manifests at 0.2.2.
**Emit matrix is complete (8 cells + the `no_watch` modifier) and contradiction-free:**
UserPromptSubmit+empty emits nothing on both tools; claude SessionStart always nudges
(unless `RELAY_NO_WATCH`); codex SessionStart+empty emits nothing. **CLI parse composes
unambiguously** — `--event` is a value flag skipped by `positionals` and absent from
`BOOL_FLAGS`, so `codex --event prompt` yields tool=codex, event=Prompt. **Nudge line**
guards double-arm ("not already armed one this session"), degrades without Monitor ("if
no such tool exists, ignore this line"), interpolates the path twice. **Verified-vs-guess
is correctly quarantined:** the Codex `hookEventName` echo is the only genuine guess
(gotcha 5, live-leg-confirmed); the Codex `additionalContext` contract is doc-verified;
the Claude leg mirrors the already-shipped SessionStart `hookSpecificOutput` path.

**Verdict: fix-first** — three small gaps touch executable acceptance / a stated
deliverable (none block the code; all are quick plan edits):

1. **Self-test determinism (acceptance #1 flake).** `envFor` (`selftest.mjs:41-45`) does
   NOT scrub `RELAY_NO_WATCH`. Gotcha 6's remedy (pass it via `extra` for check #5) makes
   #5 work but does not stop a host that exports `RELAY_NO_WATCH=1` from leaking into
   checks #3/#4 and suppressing the nudge → check #3 flakes. Fix: add `RELAY_NO_WATCH` to
   the envFor delete-list (check #5 still overrides — `extra` is spread AFTER the deletes).
2. **Parse unit test not cleanly executable (acceptance #2).** Step 5's parse case
   (`Args(["codex","--event","prompt"]) → tool codex, event Prompt`) needs a pure mapping
   fn, but Interfaces factors only `render_context`; the tool/event derivation lives inside
   `run(&[String]) -> !`, which exits and can't be unit-tested. Name a pure
   `fn parse_invocation(args: &[String]) -> (&str /*tool*/, HookEvent)` that both `run` and
   the test call — otherwise the test can only assert `cli::Args` primitives, not the mapping.
3. **Release-notes deliverable won't land (gotcha 1).** Gotcha 1 says "call the Codex
   `trusted_hash` re-trust out in the v0.3.0 release notes," but Step 10's `release.mjs`
   auto-generates notes from commit subjects only (`release.mjs:159`,
   `git log PREV..HEAD --pretty=format:- %s`) — nothing operationalizes the caveat. Fix:
   land it in a commit subject inside the `0.2.2..0.3.0` range, or add an explicit
   "edit the GitHub release body to add the re-trust caveat" sub-step to Step 10.

Non-blocking notes: (a) `hook::run` must call `positionals(0)` — `main`'s `&argv[1..]`
already strips `hook`, so the cli.rs `positionals(1)` idiom would miss the `codex` tag;
inferable but unstated. (b) "Prompt-turn overhead must stay zero" is CONTEXT-only —
`set_marker`+`register`+`drain` still do three flock'd disk ops per prompt (disclosed as a
`discover`-liveness bonus, so a design choice, not a defect). (c) Citation nit:
`Cargo.toml` rust-version is line 5 (cited `:3-4`); `main.rs` doc + usage strings
("hook [codex]") go stale after `--event` — cosmetic. (d) context7 was unavailable to this
review agent; the Claude `UserPromptSubmit` `additionalContext` claim is grounded on the
identical, already-shipped in-repo SessionStart path rather than a fresh doc fetch.

**Fixes applied 2026-07-02T16:11:57-03:00 (all three fix-first items + non-blocking note a):**
(1) `envFor` gains `RELAY_NO_WATCH` in its delete-list — Step 8 + gotcha 6. (2) pure
`fn parse_invocation(args) -> (tool, HookEvent)` added to Interfaces, called by `run` and the
Step-5 parse test; positionals read from index 0 (main.rs strips the `hook` verb) is now
stated, not just inferable. (3) Step 10b operationalizes the Codex re-trust caveat via
`gh release edit` with a `rg -q "re-trust"` done-condition + acceptance #9. Verdict cleared
to proceed; started immediately after.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/session-relay/rust/src/hook.rs:51-141` — current `run(tool_arg)` +
  `inner`: register→drain→inject; empty-inbox early return (92-94); hardcoded
  `hookEventName: "SessionStart"` (127-129); the UNTRUSTED fence (112-123);
  `defuse()` (21-42).
- `plugins/session-relay/rust/src/main.rs:14` — `hook` dispatch passes only
  `argv.get(1)` today; must pass the full tail.
- `plugins/session-relay/rust/src/cli.rs:23,30-70,291-401` — `Args` parser +
  `BOOL_FLAGS`; the `wake` doorbell (out of scope, untouched).
- `plugins/session-relay/rust/src/store.rs:26-45,205,422-433` — `home_dir` (pub),
  private `mailbox_path` + `sanitize` (pub), `with_lock` exclusive flock, atomic
  `drain` (read-then-remove, empty on missing file).
- `plugins/session-relay/rust/Cargo.toml:3-4,9-11` — edition 2024 / rust 1.85;
  the `tinyjson` + `rustix` dependency budget.
- `plugins/session-relay/hooks/hooks.json` / `hooks/codex-hooks.json` — the
  existing SessionStart wirings to mirror for UserPromptSubmit.
- `plugins/session-relay/test/selftest.mjs:41-52,139-146` — `envFor` scrub list,
  `runHook`, the existing SessionStart injection assertions; 39-check baseline.
- `.github/workflows/build-binaries.yml` — `workflow_dispatch`, 4 targets,
  commit-into-`bin/`-before-tag flow.
- `scripts/ci.mjs:141-185` + `scripts/lib/plugins.mjs:42-66` — the session-relay
  descriptor + `gateRust` (fmt/clippy/`--locked` build) + self-test gate.
- `scripts/release.mjs:9,64-66,80-90` — `--plugin session-relay`, semver bump, the
  committed-binary + `SHA256SUMS` precondition; tag `session-relay--v0.3.0`.

## Notes

- **Executor decided 2026-07-02** (open-question `executor`, answered via the
  native picker): **self-execute here** — the main Claude Code session runs this
  plan when the user says go. Recorded as `assignee: claude` (this repo's value
  for main-session self-execution, matching `session-relay-rust-port`).
- Bonus side effect of Step 4: `register` runs on every `UserPromptSubmit`, so a
  Codex/Claude session's registry `last_seen` refreshes on each prompt — improves
  `discover` liveness accuracy at no extra cost.
- Follow-up idea captured, not scheduled: `session-relay-watch` (external daemon +
  desktop notification for the live-Codex-idle gap).
