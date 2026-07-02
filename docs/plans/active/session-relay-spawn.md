---
title: session-relay — spawn a new full-context agent session (relay spawn)
goal: Add `relay spawn <dir>`, a verb that creates a NEW persistent Claude/Codex session in any project dir — full CLAUDE.md/skills/plugins context — and converses with it over the bus, no manual session management.
status: planned
created: "2026-07-02T17:32:36-03:00"
updated: "2026-07-02T17:48:59-03:00"
started_at: null
assignee: claude
tags: [session-relay, spawn, rust, cross-tool, claude, codex, multi-agent]
affected_paths:
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/bin/
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - .claude-plugin/marketplace.json
related_plans: [session-relay-app-server-push, session-relay-per-session-identity, session-relay-cross-tool-bus, session-relay-auto-discovery]
review_status: null
planned_at_commit: c3be09c29f3d9588aa9dad2b2434585f957741d4
---

# session-relay — spawn a new full-context agent session (relay spawn)

## Goal

Add a `relay spawn` verb: from any session, **create a NEW persistent agent
session** (Claude or Codex) rooted in a specified project directory and converse
with it over the existing bus. Because the child is a real session in that
project, it natively loads that project's `CLAUDE.md`/`AGENTS.md`, its skills,
and its plugins — **full project context**, which a native subagent (same
session, same project dir, turn-scoped, no separate resumable id) structurally
cannot provide. Success = one command spins up a worker in another project,
that worker does a first task and reports back over the bus, and the parent can
resume the conversation with `relay wake` — **zero manual session management**.

CLI shape:

```
relay spawn <dir> [--tool claude|codex] [--name <busName>] [--reply-to <parentBusName>]
                  [--timeout <sec>] [--full-access] [--dry] [--] <first task>
```

"Persistent" means the child's **session id is durable and resumable**, not that
its process stays alive: a headless `claude -p` / `codex exec` child runs its
first task and exits, but its transcript + id live on disk and in the bus
registry, so `relay wake <name>` resumes the SAME session later. That resume-loop
is what makes the parent↔child conversation work; only the birth verb is missing.

## Context & rationale

### Why now / what it unblocks

session-relay v0.3.0 already ships every piece EXCEPT birth:

- **Bus MCP** (`whoami`/`register`/`roster`/`send`/`inbox`/`discover`) over a shared
  on-disk store (`store.rs`).
- **SessionStart hook** (`hook.rs`) auto-registers ANY new Claude or Codex session
  (writes the cwd→id marker + upserts `{id, dir, tool}`) — so a spawned child
  self-registers on the bus at birth, IF headless sessions fire SessionStart (the
  load-bearing unknown; Phase A verifies — `## STOP conditions`).
- **UserPromptSubmit drain** + **Claude Monitor push** — mail surfaces in a live
  session.
- **`relay wake` doorbell** (`cli.rs:291-401`) — tool-aware headless resume
  (`claude -p --resume <id>` / `codex exec resume <id>`) from the target's dir,
  with `--` message fencing and UUID gating.

So the parent↔child conversation loop already works the moment a child EXISTS on
the bus. The one missing primitive is *creating* that child. `relay spawn` is that
primitive: launch the child detached, confirm its birth on the bus, register the
requested `--name`, and hand back a worker the parent already knows how to talk to.

### Verbatim design decisions (from the drafting session — do not re-litigate)

- **Queued behind `session-relay-app-server-push`.** User directive 2026-07-02,
  verbatim: *"park and start after the app-server-plan"*. Do NOT start this plan
  until `session-relay-app-server-push` ships. Its Phase-A spike may upgrade the
  Codex spawn path (app-server `thread/start` vs `codex exec`) — **re-check those
  findings at start** (`## STOP conditions`, `## Notes`).
- **Assignee `claude` = main-session self-execution.** The user chose this executor
  deliberately; there is no `.claude/agents/claude.md` and none is needed. Do NOT
  open an executor open-question.
- **Launch DETACHED.** Child first-tasks can run minutes; spawn must not block on
  them. Birth confirmation is via watching the relay registry/marker for the child's
  registration (the SessionStart hook provides it), with a timeout — NOT by waiting
  for the child's final JSON result.
- **Tool picker split (user directive, verbatim):** *"if not specified the session
  asks which we want to use"* — when `--tool` is omitted AND the caller is an
  interactive agent session, the SKILL instructs the agent to ask via the native
  question UI (Claude `AskUserQuestion` / Codex `ask_user_question`) BEFORE invoking
  the CLI. The bare CLI with no tty context defaults to `claude` with a printed note.
- **First-prompt standing prefix.** At birth the child's first prompt carries a
  standing prefix: it is a bus worker; report results/questions to `<reply-to
  parent bus name>` via the session-relay `send` tool. Question-mid-task pattern:
  the child sends its question as bus mail; the parent (or user) doorbells the answer
  back with `relay wake`.
- **Registry hygiene = the existing `discover` liveness window, no new lifecycle
  state.** A dead one-shot worker's session file goes stale; `discover` drops it
  once its mtime ages past the window (`discover.rs:209` cutoff). Spawn adds NO
  registry lifecycle field and NO cleanup daemon. Stale registry accumulation is the
  pre-existing marker/attribution concern already parked in
  `session-relay-per-session-identity`, not this plan.
- **Zero new crates.** Budget stays `tinyjson` + `rustix` only (`Cargo.toml:9-11`).
  Detach is pure std (`process_group(0)` + null stdio); no daemonize crate.
- **Permission posture (resolved 2026-07-02 via the native picker, CUSTOM answer).**
  User's verbatim words: *"auto mode maybe? instead of acceptedits? or full access but
  we state some rules, like it always have to use another branch and never modify real
  live files like production via ssh and etc, only probes via ssh and scripts that do
  stuff like that."* Interpreted policy to implement:
  - **Default child posture = each tool's native "auto" working mode** (Codex: the Auto
    preset / `workspace-write` sandbox with auto-approvals; Claude: the closest
    auto-accepting working mode) — NOT read-only, NOT unfenced full access. **A5 pins
    the EXACT current flag names** for "auto" per tool; do not guess them now.
  - **The spawn prompt-prefix carries guardrail RULES injected into every child**
    (pinned deliverable — see `## Interfaces & data shapes` and `## Global constraints`):
    (1) always create and work on a separate git branch, never commit directly to the
    default branch; (2) never modify live/production systems (e.g. over ssh) — read-only
    probes are allowed, mutations are not; (3) destructive or irreversible operations
    require asking the parent session over the bus first.
  - **`--full-access` opts UP** to full access (the guardrail rules are STILL injected);
    **`--read-only` opts DOWN** to a read-only sandbox.

### The persistent-but-one-shot reconciliation (why this isn't a contradiction)

`claude -p` / `codex exec` are one-shot headless runs: they execute the first task
and exit. "Persistent session" here means the **id/transcript persists and is
resumable**, not a long-lived process. The full loop:

1. spawn launches the child DETACHED in `<dir>` with `<standing-prefix> + <task>`.
2. the child's SessionStart hook registers it → spawn's watch detects birth →
   spawn registers the `--name` → spawn returns fast (well before the task ends).
3. the child works (minutes), then per the prefix `send`s its result to
   `<reply-to>` over the bus, then the `-p`/`exec` process exits.
4. the parent receives the mail (Monitor push / next SessionStart / `inbox`).
5. to continue: `relay wake <name> -- "<follow-up>"` resumes the SAME id.

## Environment & how-to-run

- **Repo:** `/home/docks/projects/docks`, branch `main`. `planned_at_commit`
  `c3be09c29f3d9588aa9dad2b2434585f957741d4`.
- **Node:** 22.x via corepack. One-time: `corepack enable && pnpm install --frozen-lockfile`.
- **Rust:** toolchain pinned `1.85.0` (`plugins/session-relay/rust/rust-toolchain.toml`),
  edition 2024. `cargo` may live under `~/.cargo/bin` (non-login shell) — see
  `scripts/lib/rust-bin.mjs findCargo()`.
- **Child CLIs (installed on this machine — Phase A live-verifies versions/flags):**
  `claude` and `codex` (codex-cli 0.142.5 per the sibling plan). Claude sessions
  live under `~/.claude/projects/<encoded-cwd>/<id>.jsonl`; Codex under
  `~/.codex/sessions/YYYY/MM/DD/rollout-*-<uuid>.jsonl`.
- **Commands (run from repo root, absolute paths):**
  - Repo gate (green before EVERY commit): `node scripts/ci.mjs`
  - Cargo checks the gate runs (in `plugins/session-relay/rust/`): `cargo fmt --check`,
    `cargo clippy -- -D warnings`, `cargo test`, `cargo build --release --locked`.
  - Self-test (black-box the binary): `node plugins/session-relay/test/selftest.mjs`
    → `PASS: session-relay self-test — <N> checks`. It prefers the fresh
    `rust/target/<triple>/release/relay` build over committed `bin/` (selftest.mjs:25-36).
  - Release (Phase C): `node scripts/release.mjs --plugin session-relay minor`.
    `--dry-run` previews. Version depends on queue order (`## Notes`).
- **Child-CLI flag docs (fetch before coding — training-data drift, post-cutoff):**
  context7 will NOT cover the `claude`/`codex` CLIs reliably. Use each CLI's own
  `--help` output live in Phase A, plus `WebFetch` on the official docs. Do NOT code
  against remembered flags (`## STOP conditions`).

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| A0 | Confirm `session-relay-app-server-push` has shipped (`ls docs/plans/finished/*app-server-push*`); if not, STOP — this plan is queued behind it. Re-read that plan's `## Interfaces & data shapes` for the Codex app-server `thread/start` spike outcome | `docs/plans/finished/` (read), this file | — | planned |
| A1 | Verify `claude` + `codex` on PATH; record `claude --version` / `codex --version` and each CLI's relevant `--help` sections | this file (`## Interfaces & data shapes`) | A0 | planned |
| A2 | Live: `claude -p "say READY" --output-format json` with `cwd=<scratch>`; capture the result JSON; record the EXACT key path carrying the session id (skill notes `.result` is the reply — pin the session-id key) | scratch + this file | A1 | planned |
| A3 | **Load-bearing:** does a headless `claude -p` run FIRE the SessionStart hook (self-register on the bus)? Spawn a `-p` child in a scratch project with the session-relay plugin active; check the registry/marker gains a new id. AND does `claude -p --session-id <uuid>` accept a pre-minted id? Record both yes/no | scratch + this file | A1 | planned |
| A4 | Live: `codex exec --json "say READY"` with `cwd=<scratch>`; record the session-id location (session_configured event / rollout filename), whether `codex exec` fires the Codex SessionStart hook, and whether it accepts a pre-set id flag | scratch + this file | A1 | planned |
| A5 | Pin the EXACT flag mappings for the **auto-mode default** (the resolved posture): the current "auto" working mode per tool — Codex the Auto preset / `workspace-write` + auto-approvals (`--sandbox`/`--ask-for-approval`/`--full-auto` current values), Claude the closest auto-accepting mode (`--permission-mode` current values). Also record the `--full-access` (up) and `--read-only` (down) flag mappings. Do not guess — inventory live from each CLI's `--help` | scratch + this file (`## Interfaces & data shapes`) | A1 | planned |
| B1 | New module `spawn.rs`: DETACHED launch — `std::process::Command` with null stdio + `CommandExt::process_group(0)`, `.spawn()` (NEVER `.output()`); per-tool child argv from A2–A5, defaulting to the **auto-mode** flags (`--full-access` opts up, `--read-only` opts down) + `--` prompt fence; binary overridable via `RELAY_SPAWN_CMD_CLAUDE` / `RELAY_SPAWN_CMD_CODEX` | `plugins/session-relay/rust/src/spawn.rs` (new) | A2–A5 | planned |
| B2 | Birth confirmation: pre-snapshot the marker for `<dir>` (or, when the tool accepts a pre-set id, mint via `store::uuid_v4` and watch for that exact id); poll `store::id_for_dir`/`store::resolve` every ~250ms up to `--timeout` (default 30s); on birth, `store::register(name, id, dir, tool)`; on timeout, exit non-zero with a `relay discover` hint | `plugins/session-relay/rust/src/spawn.rs` (reuses `store.rs:378 id_for_dir`, `:362 resolve`, `:308 register`, `:149 is_uuid`, `:97 uuid_v4`) | B1 | planned |
| B3 | Arg parsing + dispatch: `spawn <dir> [--tool][--name][--reply-to][--timeout][--full-access][--dry] [--] <task>` via `cli::Args` (`flag`/`has`/`positionals`/`message_after_sep`); add `spawn` to `main.rs` match + `pub mod spawn;` to `lib.rs` | `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/main.rs:12-17`, `plugins/session-relay/rust/src/lib.rs:5` | B1, B2 | planned |
| B4 | First-prompt standing prefix: resolve `--reply-to` (default = registry name for the spawn cwd via `store::id_for_dir(cwd)`); build `<prefix> + <task>` (trusted — NOT fenced as untrusted mail). The prefix MUST embed the **guardrail rules block VERBATIM** from `## Interfaces & data shapes` (branch-only, no live/production mutations, ask-parent-before-destructive) — a pinned deliverable, injected on EVERY spawn regardless of `--full-access`/`--read-only`; `--dry` prints resolved tool/cmd/args/cwd/prompt (mirrors `wake --dry`, cli.rs:354-375) | `plugins/session-relay/rust/src/spawn.rs` | B3 | planned |
| B5 | Tool default: `--tool` omitted → default `claude` + a printed note (`IsTerminal` gate optional); the picker lives in the SKILL, not the CLI | `plugins/session-relay/rust/src/spawn.rs` | B3 | planned |
| B6 | Rust unit tests (`#[cfg(test)]` in `spawn.rs`): per-tool argv incl. auto-mode / `--full-access` / `--read-only` flags, `--` prompt fencing (a dash-leading task stays the final positional), prefix text names `--reply-to` AND embeds all three guardrail rule lines verbatim (asserted for auto + `--full-access` + `--read-only`), default-tool note, `--reply-to` resolution | `plugins/session-relay/rust/src/spawn.rs` | B1–B5 | planned |
| B7 | Selftest (fake child — NO real claude/codex in CI): a stub via `RELAY_SPAWN_CMD_CLAUDE` that runs `relay hook` to simulate the child's birth registration; run `relay spawn <dir> --tool claude --name w1 --timeout 5 -- "task"`; assert spawn detects birth, registers `w1`, `roster` shows it, and `send w1` queues. Grow the check count | `plugins/session-relay/test/selftest.mjs` | B1–B6 | planned |
| C1 | SKILL.md: document `relay spawn` — the new-session-vs-subagent distinction, the tool-picker guidance (ask when `--tool` omitted, interactive), the permission posture + `--full-access`, and the reply-to loop; bump `metadata.updated` + recompute `content_hash` via the project's skill validators, if present | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | B1–B7 | planned |
| C2 | Rebuild the 4 binaries: dispatch `build-binaries.yml`, download artifacts, commit into `bin/` (mode 100755) + regenerate `SHA256SUMS` | `.github/workflows/build-binaries.yml` (dispatch only), `plugins/session-relay/bin/` | C1 | planned |
| C3 | Release: `node scripts/release.mjs --plugin session-relay minor` (bumps the 3 manifests in lockstep, tags, waits for tag-CI, cuts the Release) | `plugins/session-relay/.claude-plugin/plugin.json`, `plugins/session-relay/.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json` | C2 | planned |

## Interfaces & data shapes

**`relay spawn` CLI contract:**

```
relay spawn <dir>                         # required: the child's project dir (must exist)
  [--tool claude|codex]                   # omitted → claude + printed note (picker lives in SKILL)
  [--name <busName>]                       # registered on the bus for the child id at birth
  [--reply-to <parentBusName>]             # default: registry name for the spawn cwd
  [--timeout <sec>]                        # birth-confirmation deadline (default 30)
  [--full-access]                          # opt UP to full access (guardrail rules still injected)
  [--read-only]                            # opt DOWN to a read-only sandbox
  [--dry]                                  # print resolved argv+cwd+prompt, do not launch
  [--] <first task>                        # verbatim; a bare `--` fences a dash-leading task
```

Default (neither `--full-access` nor `--read-only`) = each tool's native **auto**
working mode (A5 pins the exact flags). The guardrail rules block below is injected
into the prompt on EVERY spawn, independent of the permission flag.

**Child argv per tool (documented-but-UNVERIFIED — Phase A A2–A5 replace this with
the verbatim observed forms; do NOT ship against these guesses):**

| Tool | Launch (cwd=`<dir>`, DETACHED) |
|---|---|
| claude | `claude -p [--session-id <uuid>] --output-format json <perm-flags> -- <prompt>` |
| codex | `codex exec --json <sandbox-flags> [<id-flag> <uuid>] -- <prompt>` |

- `<perm-flags>` / `<sandbox-flags>` come from A5's live inventory; the DEFAULT is each
  tool's **auto** working mode, `--full-access` opts up, `--read-only` opts down.
- `<uuid>` is minted via `store::uuid_v4` ONLY when A3/A4 confirm the tool accepts a
  pre-set session id; otherwise birth-confirmation falls back to the marker-diff watch.
- `<prompt>` = the standing prefix + the user's first task (below).

**Standing-prefix prompt template (concrete draft; the child's first prompt is
TRUSTED — parent instructing its own child — so it is NOT wrapped in the
`<session-relay-mail>` untrusted fence):**

```
You are a session-relay bus worker spawned by "<reply-to>". You are running in a
fresh session in this project — its CLAUDE.md/AGENTS.md, skills, and plugins apply.
When you finish, or if you need a decision, report to "<reply-to>" via the
session-relay skill's send tool (send to "<reply-to>").

Guardrail rules (non-negotiable):
1. Always create and work on a separate git branch; never commit directly to the
   default branch.
2. Never modify live/production systems (e.g. over ssh). Read-only probes are
   allowed; mutations are not.
3. Destructive or irreversible operations require asking "<reply-to>" over the bus
   first and waiting for approval.

Your task:

<first task>
```

**Guardrail rules block = a PINNED DELIVERABLE.** B4 injects rules 1–3 above verbatim
into every spawned child's first prompt, on EVERY spawn, regardless of the permission
flag (`--full-access` / `--read-only` change the sandbox, never these rules). A
`spawn.rs` unit test (B6) asserts all three rule lines are present in the built prompt.

**Env overrides (dual-purpose: wrapper scripts AND the selftest seam):**
`RELAY_SPAWN_CMD_CLAUDE` / `RELAY_SPAWN_CMD_CODEX` replace the launched binary path.
The selftest points one at a stub that runs `relay hook` to perform the exact
self-registration a real child's SessionStart hook would.

**Reused `store.rs` functions (read/observe existing signatures — no schema change):**
`uuid_v4()` (:97), `is_uuid()` (:149), `register(id, dir, name, tool)` (:308),
`resolve(name_or_id)` (:362), `id_for_dir(dir)` (:378). Reused `cli.rs`: `Args`
(:30-70), `wake --dry` JSON shape as the `spawn --dry` model (:354-375).

**Birth-confirmation state machine:** snapshot `id_for_dir(<dir>)` (or the pre-minted
id) → launch detached → loop {poll every 250ms; success when a NEW `is_uuid` id is
registered for `<dir>` (or the pre-minted id resolves)} until `--timeout` → on
success `register(<name>)` and print `spawned <name> (<id>) in <dir>`; on timeout
exit non-zero.

## Acceptance criteria

Phase A (spike — each records a concrete finding into `## Interfaces & data shapes`):

- `claude --version` and `codex --version` print (both on PATH).
- A2: the `claude -p … --output-format json` output parses as JSON and the session-id
  key path is recorded verbatim.
- A3: a definite yes/no for (i) does headless `claude -p` fire SessionStart
  (self-register), (ii) does `--session-id <uuid>` pre-mint work.
- A4: a definite yes/no for the Codex equivalents + the session-id location recorded.
- A5: the permission/sandbox flag inventory for both CLIs is recorded verbatim.

Phase B/C (executable):

- `cargo fmt --check` and `cargo clippy -- -D warnings` clean; `cargo test` passes
  (includes the new `spawn.rs` unit tests).
- `node plugins/session-relay/test/selftest.mjs` → `PASS: session-relay self-test —
  <N> checks` where `<N>` exceeds the pre-change count (record before/after in `## Notes`).
- `relay spawn <dir> --tool claude --name w1 --dry -- "do X"` prints tool=`claude`,
  a `claude` argv containing `-p` and (if A3 confirmed) `--session-id <uuid>`, `cwd`=`<dir>`,
  and a prompt containing the standing prefix naming the reply-to parent + `do X`.
- `relay spawn <dir> --dry -- "do X"` (no `--tool`) prints a "defaulting to claude" note
  and tool=`claude`.
- **Live leg (the real proof):** from this repo,
  `relay spawn /tmp/spawn-scratch --tool claude --name worker1 -- "create HELLO.txt
  containing hi, then report done to <parent> via the session-relay send tool"` →
  within the timeout `relay roster` lists `worker1`; the child creates
  `/tmp/spawn-scratch/HELLO.txt`; the child sends a bus message to `<parent>`;
  `relay peek <parent>` shows that message — all with ZERO manual session management.
- `node scripts/ci.mjs` green before every commit.
- After C3: `plugins/session-relay/.claude-plugin/plugin.json`,
  `.codex-plugin/plugin.json`, and the `session-relay` entry in
  `.claude-plugin/marketplace.json` all read the new version; the
  `session-relay--v<new>` tag exists and tag-CI is green.

## Out of scope / do-NOT-touch

- **`relay wake` (the doorbell, cli.rs:291-401)** — reused verbatim for the reply/resume
  loop; NOT modified by this plan.
- **The per-session-identity marker weakness** (same-cwd sessions share one marker;
  best-effort attribution) — a separate parked plan (`session-relay-per-session-identity`),
  not this one. Spawn only snapshots the marker for birth-detection; it does not fix
  the collision model.
- **App-server transport / `relay watch`** — the other queued plan
  (`session-relay-app-server-push`). Spawn may LATER adopt Codex app-server
  `thread/start` for birth, but only after that plan ships; NOT implemented here.
- **WebSocket / any new crate** — the budget is `tinyjson` + `rustix` only.
- **Child lifecycle / cleanup state** — no new registry field, no reaper daemon; dead
  workers age out of `discover` via the existing mtime window.
- **The MCP bus tools, `discover`, and the `store.rs` on-disk schema** — reused
  read-only; no schema changes.
- **A blocking `--wait` mode** (spawn returns the child's first result inline) — parked;
  detached is the pinned default.

## Known gotchas

- **Headless SessionStart is the load-bearing assumption.** If `claude -p` /
  `codex exec` do NOT fire the SessionStart hook, the child never self-registers and
  the registry-watch never resolves. A3/A4 verify live; the fallback is parent-side
  registration (spawn pre-mints the id, passes `--session-id`, and calls
  `store::register` itself instead of waiting on the child's hook). STOP if neither the
  hook fires NOR a pre-set id is accepted for a tool.
- **Detach correctly.** Use `.spawn()`, NEVER `.output()` (which blocks until the child
  exits — child tasks run minutes). `CommandExt::process_group(0)` + null stdio so a
  parent Ctrl-C / terminal signal doesn't kill the worker and the child outlives spawn
  (Unix reparents it to init; no double-fork/daemonize crate needed).
- **Same-cwd marker collision.** Two children in one dir race the cwd marker
  (`store.rs:374 set_marker` is last-writer-wins). Pre-mint + watch-for-specific-id
  avoids the ambiguity; without pre-mint, watch marker-diff and accept that concurrent
  same-dir spawns are undefined (document; don't try to serialize globally).
- **Permission posture.** Default = each tool's native **auto** working mode (A5 pins
  the flags); `--full-access` opts up, `--read-only` opts down. NEVER pass
  `--dangerously-*` by default. The guardrail rules block (branch-only, no
  live/production mutations, ask-parent-before-destructive) is injected into the prompt
  on EVERY spawn regardless of the flag — the sandbox and the prompt-rules are two
  independent layers.
- **Trusted vs untrusted prompt.** The FIRST prompt is trusted (parent → its own child)
  and is NOT wrapped in the `<session-relay-mail>` untrusted fence. Mail the child later
  receives IS untrusted and the existing `hook.rs` fence (`:59 defuse`, `:101 mail_block`)
  handles it. Do not conflate the two.
- **Child-CLI flags drift post-cutoff** (codex-cli 0.142.5). A5 inventories flags live;
  do not code against remembered flag names (`## STOP conditions`).
- **Version depends on queue order** — 0.4.0 if this ships before app-server-push,
  0.5.0 if after (`## Notes`).

## Global constraints

- Zero new crates — `tinyjson` + `rustix` only (`Cargo.toml:9-11`); detach is pure std.
- `node scripts/ci.mjs` green before every commit; commit only in-scope files.
- Committed binaries come ONLY from `build-binaries.yml` (never a local build);
  `release.mjs` refuses to tag unless all 4 target binaries + launcher are committed
  executable with a verifying `SHA256SUMS` (release.mjs:56-68).
- Three-manifest version lockstep enforced by `release.mjs` + `ci.mjs`.
- Skill body ≤500 lines; `metadata.updated` bumped on any content change.
- **Spawn guardrail rules (injected into every child's first prompt, verbatim, on EVERY
  spawn — independent of the permission flag):** (1) always create/work on a separate
  git branch, never commit to the default branch; (2) never modify live/production
  systems (e.g. over ssh), read-only probes only; (3) destructive/irreversible ops
  require asking the parent over the bus first. This is a pinned deliverable, not
  advisory — B4 templates it and B6 tests for it.
- Do not push until the user asks (this draft's auto-commit is commit-only).

## STOP conditions

- **`session-relay-app-server-push` has NOT shipped** → this plan is queued behind it
  (user directive). Do not start; verify `docs/plans/finished/*app-server-push*` first.
- **A3/A4: neither tool fires SessionStart on a headless spawn AND neither accepts a
  pre-set session id** → STOP; birth-confirmation has no mechanism. Report and reassess
  (e.g. Codex app-server `thread/start` from the sibling plan).
- **In-scope files drifted since `planned_at_commit`** — run
  `git diff --stat c3be09c29f3d9588aa9dad2b2434585f957741d4..HEAD -- plugins/session-relay/`
  first; if `main.rs`/`cli.rs`/`store.rs`/`hook.rs`/`selftest.mjs` changed (the
  app-server-push plan edits several), reconcile before editing.
- **Observed permission/sandbox flags differ from the guessed table** → update
  `## Interfaces & data shapes` and re-derive B1 before coding; never ship against
  remembered flags.

## Self-review

Score: 92/100 · trajectory 74→84→89→92 · stopped: plateau (K=3). Big/risky plan
(15 steps + a spike phase + a load-bearing STOP-gated unknown); run inline — a
subagent can't spawn a fresh-context plan-review. Lowest-scoring checks and the
fixes they forced:

- **Standalone executability (22):** first draft assumed headless `-p` fires
  SessionStart; the adversarial cold-read flagged it as an unproven load-bearing
  assumption. Fixed by promoting it to A3/A4 live checks + a STOP condition + a
  documented parent-side-registration fallback, so a cold executor knows exactly what
  to prove and what to do if it fails.
- **Goal coverage (12):** the "persistent session" vs one-shot `-p` process looked
  contradictory on a cold read; added the reconciliation sub-section (persistent =
  resumable id, not a live process) and the explicit 5-step loop, so the Goal is
  demonstrably met by the steps.
- **Executable acceptance (12):** first draft's Phase A criteria were prose; rewrote
  them as concrete yes/no recordings, and the live leg as a concrete
  spawn→file→bus-reply→peek assertion.
- **Actionability (16):** the fake-child selftest was vague; pinned the exact seam
  (`RELAY_SPAWN_CMD_*` → a stub running `relay hook`) so B7 has a verifiable
  done-condition with no real CLI in CI.
- **Assumption → question (6):** the one genuine user-facing decision (permission
  posture / blast radius) was surfaced as an open question and RESOLVED 2026-07-02 via
  the native picker (custom answer → auto-mode default + injected guardrail rules,
  encoded in `## Context`); every other guess is either pinned by a verbatim design
  decision or deferred to a Phase-A live check.
- Residual −8: exact child-CLI flag names + the session-id JSON key are unverifiable
  until Phase A runs on the installed CLIs (deliberately deferred, not guessable); B1
  is gated on recording them.

## Cold-handoff checklist

1. **File manifest** — present: new `spawn.rs`; edited `main.rs:12-17`, `lib.rs:5`,
   `cli.rs`(reuse), `store.rs`(reuse), `selftest.mjs`, `SKILL.md`, the 3 manifests + `bin/`.
2. **Environment & commands** — present: Node 22/pnpm, Rust 1.85, claude+codex CLIs,
   ci/cargo/selftest/release commands with flags in `## Environment & how-to-run`.
3. **Interface & data contracts** — present: the `relay spawn` CLI grammar, the
   per-tool child argv (Phase A replaces with verbatim), the standing-prefix template,
   the env-override seam, the reused `store.rs`/`cli.rs` signatures, the birth state machine.
4. **Executable acceptance** — present: cargo/selftest/`--dry`/CI + the live
   spawn→file→bus-reply→peek leg + the version-lockstep check.
5. **Out of scope** — present and positive (wake, marker weakness, app-server/watch, WS,
   lifecycle state, MCP/store schema, `--wait`).
6. **Decision rationale** — present: the verbatim design decisions + the *why*
   (detached → non-blocking; zero crates → std detach; discover window → no new lifecycle;
   persistent = resumable id).
7. **Known gotchas** — present: headless-SessionStart assumption, `.spawn()` vs `.output()`,
   marker collision, permission posture, trusted-vs-untrusted prompt, flag drift, version order.
8. **Global constraints verbatim** — present: zero-crates, ci-green, committed-binary
   provenance, version lockstep, skill line cap, no-push.
9. **No undefined terms / forward refs** — pass: every flag/type/function is defined here
   or cited in read code; the permission policy is resolved (auto-mode + guardrail rules,
   `## Context`/`## Global constraints`) and the exact flag names are explicit Phase-A
   recordings, not silent TODOs.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/session-relay/rust/src/main.rs:12-17` — subcommand dispatch match; `spawn` slots in here (B3).
- `plugins/session-relay/rust/src/lib.rs:1-5` — module list; add `pub mod spawn;` (B3).
- `plugins/session-relay/rust/src/cli.rs:30-70` — `Args` (`flag`/`has`/`positionals`/`message_after_sep`) reused by `spawn` arg parsing.
- `plugins/session-relay/rust/src/cli.rs:291-401` — `wake`: tool-aware spawn-from-dir + `--` fencing + UUID gating (the template for the child launch); `:354-375` the `--dry` JSON shape reused by `spawn --dry`; `:384-388` uses `.output()` (blocking) — spawn deliberately uses `.spawn()` (detached) instead.
- `plugins/session-relay/rust/src/store.rs:97` `uuid_v4`; `:149` `is_uuid`; `:308-348` `register` (upsert id/dir/name/tool); `:362-372` `resolve`; `:374-386` `set_marker`/`id_for_dir` — the birth-confirmation + registration primitives (no schema change).
- `plugins/session-relay/rust/src/hook.rs:159-208` — the SessionStart handler that self-registers a new session (`set_marker` + `register`); `:59 defuse` / `:101 mail_block` — the UNTRUSTED-DATA fence that applies to later mail, NOT the trusted first prompt.
- `plugins/session-relay/rust/src/discover.rs:207-217` — the mtime liveness window that ages out dead one-shot workers (why no new lifecycle state is needed).
- `plugins/session-relay/test/selftest.mjs:25-58` — `resolveBin` + `envFor`/`relay` harness; `:91-98` `runHook` seeds a registration exactly as the fake-child stub will (the B7 model); `:200-213` `wake --dry` assertions (the `spawn --dry` test model).
- `plugins/session-relay/rust/Cargo.toml:9-11` — dependency budget `tinyjson` + `rustix` (zero-new-crates constraint); detach uses only std `CommandExt::process_group`.
- `plugins/session-relay/skills/productivity/session-relay/SKILL.md:16-18,68,109` — the subagent-vs-session distinction, `claude --session-id <uuid>` pre-agreement, and `-p`/SDK sessions being resumable-by-id (the C1 doc surface).
- `plugins/session-relay/.claude-plugin/plugin.json:4` — current version `0.3.0`.
- `scripts/release.mjs:56-68` — committed-binary + SHA256SUMS precondition; `:96-112` three-manifest lockstep bump.
- `.github/workflows/build-binaries.yml:21-69` — `workflow_dispatch`-only 4-arch producer (C2).
- `docs/plans/active/session-relay-app-server-push.md:92-121` — the queued sibling this plan waits behind; its Codex app-server spike may upgrade the Codex birth path.

## Notes

- **Queue order (user directive 2026-07-02, verbatim: "park and start after the
  app-server-plan"):** start only after `session-relay-app-server-push` ships. At start,
  re-read that plan's `## Interfaces & data shapes` — its Codex `app-server`
  `thread/start` findings may replace `codex exec` as the Codex spawn path.
- **Version path:** session-relay is `0.3.0` today. This is a minor (new additive
  subcommand) → **0.4.0** if it ships before app-server-push, **0.5.0** if after
  (app-server-push is also a minor). Confirm the current manifest version at Phase C.
- Selftest check count (fill during B7): before `<N>` → after `<N+k>`.
- The `--reply-to` default resolves the parent's own bus name via
  `store::id_for_dir(<spawn cwd>)`; if the parent isn't registered/named, the SKILL tells
  an interactive agent to `whoami` and pass `--reply-to <own name>` explicitly.
