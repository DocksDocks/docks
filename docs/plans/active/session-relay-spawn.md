---
title: session-relay — spawn a new full-context agent session (relay spawn)
goal: Add `relay spawn <dir>`, a verb that creates a NEW persistent Claude/Codex session in any project dir — full CLAUDE.md/skills/plugins context — and converses with it over the bus, no manual session management.
status: in_review
created: "2026-07-02T17:32:36-03:00"
updated: "2026-07-02T22:11:36-03:00"
started_at: "2026-07-02T20:23:42-03:00"
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
in_review_since: "2026-07-02T22:11:36-03:00"
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
                  [--timeout <sec>] [--read-only] [--full-access] [--dry] [--] <first task>
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
  parent bus name>`. **PRIMARY reply mechanism is the absolute `relay` binary path**
  (`<abs-relay> send "<reply-to>" -- "<message>"`), so the loop works even in a project
  where session-relay is not installed — spawn IS that binary and interpolates its own
  resolved path; the bus MCP/skill `send` tool is the secondary path. Question-mid-task
  pattern: the child sends its question as bus mail; the parent (or user) doorbells the
  answer back with `relay wake`.
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
  stuff like that."* Interpreted policy to implement (**asymmetric** — the two CLIs have
  different permission models, so "auto mode … or full access but we state some rules" maps
  differently per tool):
  - **Codex default = its native Auto preset** (`workspace-write` sandbox + auto-approvals;
    A5 pins the exact flags). Codex has a clean middle "Auto" tier that maps directly to the
    user's "auto mode".
  - **Claude default = the full-permission headless mode** (`bypassPermissions` or the
    current equivalent; A5 pins the exact flag), FENCED by the injected guardrail rules —
    the user's *"full access but we state some rules"* branch. Chosen because **Claude has no
    middle "auto" tier** (`--permission-mode` is `default`/`acceptEdits`/`plan`/`bypassPermissions`),
    a headless `claude -p` **auto-denies** interactive permission prompts (so `default`/ask is
    useless for an unattended worker), and the user **explicitly doubted `acceptEdits`**
    ("instead of acceptedits"). A Claude worker is bounded by the guardrail RULES in the
    prompt, not a sandbox tier.
  - **The spawn prompt-prefix carries guardrail RULES injected into every child**
    (pinned deliverable — see `## Interfaces & data shapes` and `## Global constraints`):
    (1) always create and work on a separate git branch, never commit directly to the
    default branch; (2) never modify live/production systems (e.g. over ssh) — read-only
    probes are allowed, mutations are not; (3) destructive or irreversible operations
    require asking the parent session over the bus first.
  - **Consequence — the flags are asymmetric:** `--full-access` is **codex-only** (the Claude
    default is already full access), and `--read-only` opts DOWN on **both** tools.

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
| A0 | Confirm `session-relay-app-server-push` has shipped (`ls docs/plans/finished/*app-server-push*`); if not, STOP — this plan is queued behind it. Re-read that plan's `## Interfaces & data shapes` for the Codex app-server `thread/start` spike outcome | `docs/plans/finished/` (read), this file | — | done |
| A1 | Verify `claude` + `codex` on PATH; record `claude --version` / `codex --version` and each CLI's relevant `--help` sections | this file (`## Interfaces & data shapes`) | A0 | done |
| A2 | Live (DOCS-ONLY probe — NOT the spawn launch): `claude -p "say READY" --output-format json` with `cwd=<scratch>`; record the EXACT key path carrying the session id. This documents the shape for the SKILL only — spawn launches DETACHED with null stdout and never reads it, so `--output-format json` is NOT on the child argv (S2 in `## Self-review`); birth is confirmed via marker-diff / pre-mint resolve | scratch + this file | A1 | done |
| A3 | **Load-bearing:** does a headless `claude -p` run FIRE the SessionStart hook (self-register on the bus)? Spawn a `-p` child in a scratch project with the session-relay plugin active; check the registry/marker gains a new id. AND does `claude -p --session-id <uuid>` accept a pre-minted id? Record both yes/no | scratch + this file | A1 | done |
| A4 | Live: `codex exec --json "say READY"` with `cwd=<scratch>`; record the session-id location (session_configured event / rollout filename), whether `codex exec` fires the Codex SessionStart hook, whether it accepts a pre-set id flag, AND whether a fresh `codex exec` still refuses a non-git `<dir>` without `--skip-git-repo-check` (known live-true — record the current bypass flag so B1's codex argv can add it when `<dir>` isn't a git repo) | scratch + this file | A1 | done |
| A5 | Pin the EXACT flag mappings for the resolved **asymmetric** posture (S3): Codex default = its Auto preset (`--sandbox workspace-write` + auto-approvals — current `--sandbox`/`--ask-for-approval`/`--full-auto` values); Claude default = full-permission headless mode (current `--permission-mode bypassPermissions` value or equivalent) — Claude has NO middle auto tier and the user rejected `acceptEdits`, so if the only options are acceptEdits vs bypass, confirm bypass+guardrail-rules is right (else surface to the user). Also record `--read-only` (down, BOTH tools) and `--full-access` (up, **codex-only** — Claude is already full). Do not guess — inventory live from each CLI's `--help` | scratch + this file (`## Interfaces & data shapes`) | A1 | done |
| B1 | New module `spawn.rs`: DETACHED launch — `std::process::Command` with null stdin+stdout, `CommandExt::process_group(0)`, `.spawn()` (NEVER `.output()`); child **stderr → a temp log** `<store home>/spawn-logs/<id-or-launch-uuid>.stderr` (S5 — a fast-failing child stays diagnosable, NOT a null stderr); per-tool child argv from A2–A5 with the **asymmetric** default (Codex Auto preset; Claude `bypassPermissions`), `--read-only` down on both, `--full-access` codex-only, `--` prompt fence, and **no `--output-format json` / `--json`** (S2); binary overridable via `RELAY_SPAWN_CMD_CLAUDE` / `RELAY_SPAWN_CMD_CODEX` | `plugins/session-relay/rust/src/spawn.rs` (new) | A2–A5 | done |
| B2 | Birth confirmation: pre-snapshot the marker for `<dir>` (or, when the tool accepts a pre-set id, mint via `store::uuid_v4` and watch for that exact id); poll `store::id_for_dir`/`store::resolve` every ~250ms up to `--timeout` (default 30s); on birth, `store::register(name, id, dir, tool)`; on timeout, exit non-zero with a message that NAMES the child's stderr log path (S5) AND a `relay discover` hint | `plugins/session-relay/rust/src/spawn.rs` (reuses `store.rs:378 id_for_dir`, `:362 resolve`, `:308 register`, `:149 is_uuid`, `:97 uuid_v4`, `:26 home_dir`) | B1 | done |
| B3 | Arg parsing + dispatch: `spawn <dir> [--tool][--name][--reply-to][--timeout][--read-only][--full-access][--dry] [--] <task>` via `cli::Args` (`flag`/`has`/`positionals`/`message_after_sep`); add a NEW `spawn` arm to `main.rs`'s dispatch match (dispatching `relay::spawn::run`, not the `cli::run` tuple) + `pub mod spawn;` to `lib.rs` | `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/main.rs:12-17`, `plugins/session-relay/rust/src/lib.rs:5` | B1, B2 | done |
| B4 | First-prompt standing prefix: resolve `--reply-to` (default = the spawn cwd's registered session — `store::id_for_dir(cwd)` returns an **id**, then `store::resolve(id).name`; **fall back to that raw id** when the parent is unnamed, since an id is a valid `send`/`peek` target); interpolate spawn's OWN absolute path via `std::env::current_exe()` so the prefix's PRIMARY reply command is `<abs-relay> send "<reply-to>" -- "…"` (works even where session-relay isn't installed, S1), with the bus MCP/skill `send` as the secondary path; build `<prefix> + <task>` (trusted — NOT fenced as untrusted mail). The prefix MUST embed the **guardrail rules block VERBATIM** from `## Interfaces & data shapes` (branch-only, no live/production mutations, ask-parent-before-destructive) — a pinned deliverable, injected on EVERY spawn regardless of `--read-only`/`--full-access`; `--dry` prints resolved tool/cmd/args/cwd/prompt (mirrors `wake --dry`, cli.rs:354-375) | `plugins/session-relay/rust/src/spawn.rs` | B3 | done |
| B5 | Tool default: `--tool` omitted → default `claude` + a printed note (`IsTerminal` gate optional); the picker lives in the SKILL, not the CLI | `plugins/session-relay/rust/src/spawn.rs` | B3 | done |
| B6 | Rust unit tests (`#[cfg(test)]` in `spawn.rs`): per-tool argv incl. the asymmetric default (Codex Auto / Claude bypassPermissions), `--read-only` (both), `--full-access` (codex-only), `--` prompt fencing (a dash-leading task stays the final positional), prefix text names `--reply-to`, carries the absolute-`relay`-path reply command `<abs-relay> send …` (S1), AND embeds all three guardrail rule lines verbatim (asserted for default + `--read-only` + `--full-access`), default-tool note, `--reply-to` resolution | `plugins/session-relay/rust/src/spawn.rs` | B1–B5 | done |
| B7 | Selftest (fake child — NO real claude/codex in CI): write a small stub executable to a temp path, point `RELAY_SPAWN_CMD_CLAUDE` at it; the stub derives the child id — **parse `--session-id <uuid>` from its own argv (pre-mint path)** or **mint its own uuid (marker-watch path)** — then re-invokes the SAME `relay` binary's `hook` verb with `{session_id, cwd, source:"startup"}` on stdin (model: `selftest.mjs:91-93`) to perform the birth registration. **Exercise BOTH birth paths, one check each** (the stub's id-derivation must match the compiled default per A3); run `relay spawn <dir> --tool claude --name w1 --timeout 5 -- "task"` and assert spawn detects birth, registers `w1`, `roster` shows it, `send w1` queues. Add `RELAY_SPAWN_CMD_CLAUDE`/`RELAY_SPAWN_CMD_CODEX` to `selftest.mjs`'s `envFor` scrub list (`:49`, alongside `RELAY_NO_WATCH`), and confirm B1 does NOT `.env_clear()` so the stub inherits `SESSION_RELAY_HOME` and writes the throwaway store. Grow the check count | `plugins/session-relay/test/selftest.mjs` | B1–B6 | done |
| C1 | SKILL.md: document `relay spawn` — the new-session-vs-subagent distinction, the tool-picker guidance (ask when `--tool` omitted, interactive), the permission posture + `--full-access`, and the reply-to loop; bump `metadata.updated` + recompute `content_hash` via the project's skill validators, if present | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | B1–B7 | done |
| C2 | Rebuild the 4 binaries: dispatch `build-binaries.yml`, download artifacts, commit into `bin/` (mode 100755) + regenerate `SHA256SUMS` | `.github/workflows/build-binaries.yml` (dispatch only), `plugins/session-relay/bin/` | C1 | done |
| C3 | Release: `node scripts/release.mjs --plugin session-relay minor` (bumps the 3 manifests in lockstep, tags, waits for tag-CI, cuts the Release) | `plugins/session-relay/.claude-plugin/plugin.json`, `plugins/session-relay/.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json` | C2 | done |

## Interfaces & data shapes

### Phase A findings (2026-07-02, live-verified: claude 2.1.198, codex-cli 0.142.5)

- **A2 ✓ (docs-only):** `claude -p … --output-format json` result is a single JSON
  object; the session id is the top-level **`.session_id`** key. (`total_cost_usd`
  appears in the JSON even under subscription OAuth — informational, not API billing.)
- **A3 ✓✓:** headless `claude -p` **FIRES the SessionStart hook** (registry gained the
  child id + the `-tmp-spawn-scratch` marker), and **`--session-id <uuid>` pre-mint
  WORKS** (result `.session_id` == the minted uuid). → Claude birth path = pre-mint +
  watch for that exact id.
- **A4 ✓:** `codex exec --json` first event is `{"type":"thread.started","thread_id":…}`
  (docs-only — spawn never reads child stdout). Headless `codex exec` **FIRES the Codex
  SessionStart hook** (registry gained the codex child for the same dir). **No pre-set-id
  flag exists on `codex exec`** (full `--help` inventoried) → Codex birth path =
  marker-diff watch. `--skip-git-repo-check` is current and REQUIRED for a non-git dir.
- **A5 ✓ — flag inventory + SUPERSEDING posture decision.** Claude 2.1.198's
  `--permission-mode` choices are `acceptEdits, auto, bypassPermissions, default,
  dontAsk, plan` — **`auto` now exists** ("auto-approves tool calls with background
  safety checks", research preview; docs: code.claude.com/docs/en/permissions), which
  voids the asymmetric posture's premise ("Claude has no middle auto tier"). `dontAsk`
  auto-denies (useless unattended). Codex `codex exec -s/--sandbox` values:
  `read-only, workspace-write, danger-full-access`; exec has no approvals flag
  (headless never prompts). **User decision (2026-07-02, native picker): "Symmetric:
  Claude auto"** — supersedes the asymmetric mapping everywhere it appears in this plan:

  | `relay spawn` flag | Claude child | Codex child |
  |---|---|---|
  | (default) | `--permission-mode auto` | `--sandbox workspace-write` |
  | `--read-only` | `--permission-mode plan` | `--sandbox read-only` |
  | `--full-access` | `--permission-mode bypassPermissions` | `--sandbox danger-full-access` |

  Both opt flags now apply to **BOTH tools** (`--full-access` is no longer codex-only).
  Guardrail rules stay injected on every spawn regardless of flag. NEVER pass
  `--dangerously-*` variants.

### Phase B live-leg evidence (2026-07-02)

`relay spawn /tmp/spawn-scratch --tool claude --name worker1 --reply-to
docks-builder -- "create HELLO.txt containing exactly: hi — then report done…"`
→ **birth confirmed in 0.5s** (`spawned worker1 (5fce6fb9-…) in /tmp/spawn-scratch`,
spawn returned detached); ~30s later the worker had written `HELLO.txt` (`hi`,
no trailing newline) AND its report arrived in the parent mailbox via the
injected PRIMARY abs-relay command (`fromName:"cli"`), where the parent's
Monitor watch pushed it into the live session — the complete zero-keystroke
loop. The worker also honored the guardrail nuance unprompted ("not a git
repository, so no branch/commit was involved").

**Codex leg (same day, on the user's ask):** `relay spawn /tmp/spawn-scratch
--tool codex --name worker2 --reply-to docks-builder -- "read HELLO.txt …"` →
birth via the marker-diff path in **2.5s**; ~40s later the reply "hi" (the
file's exact content) arrived — delivered via the **bus MCP send** with proper
attribution (`fromName:"worker2"`, `from:<its id>`), unlike the claude worker's
CLI-path (`fromName:"cli"`). Finding: headless `codex exec` calls the bus MCP
tools unattended (no elicitation hang outside app-server), and the
workspace-write sandbox doesn't block replies — the MCP server process runs
outside the exec sandbox, so the CLI-send lock-file restriction is moot when
session-relay's MCP is available; the prompt's PRIMARY/secondary ordering
already covers the fallback.

**Verbatim child argv (final, from the findings above):**

| Tool | Launch (cwd=`<dir>`, DETACHED, null stdin+stdout, stderr→spawn-log) |
|---|---|
| claude | `claude -p --session-id <minted-uuid> --permission-mode <auto\|plan\|bypassPermissions> -- <prompt>` |
| codex | `codex exec --sandbox <workspace-write\|read-only\|danger-full-access> [--skip-git-repo-check] -- <prompt>` |

**`relay spawn` CLI contract:**

```
relay spawn <dir>                         # required: the child's project dir (must exist)
  [--tool claude|codex]                   # omitted → claude + printed note (picker lives in SKILL)
  [--name <busName>]                       # registered on the bus for the child id at birth
  [--reply-to <parentBusName>]             # default: registry name for the spawn cwd
  [--timeout <sec>]                        # birth-confirmation deadline (default 30)
  [--read-only]                            # opt DOWN to a read-only sandbox (both tools)
  [--full-access]                          # codex-only opt-UP (Claude default is already full)
  [--dry]                                  # print resolved argv+cwd+prompt, do not launch
  [--] <first task>                        # verbatim; a bare `--` fences a dash-leading task
```

Default (neither flag) is **asymmetric** (S3): Codex = its Auto preset (`workspace-write`
+ auto-approvals); Claude = full-permission headless mode (`bypassPermissions`) bounded by
the injected guardrail rules — Claude has no middle auto tier and the user rejected
`acceptEdits`. A5 pins the exact flags. `--read-only` opts down on both; `--full-access` is
codex-only. The guardrail rules block below is injected into the prompt on EVERY spawn,
independent of the flag.

**Child argv per tool (documented-but-UNVERIFIED — Phase A A2–A5 replace this with
the verbatim observed forms; do NOT ship against these guesses):**

| Tool | Launch (cwd=`<dir>`, DETACHED, null stdin+stdout, stderr→temp log) |
|---|---|
| claude | `claude -p [--session-id <uuid>] <perm-flags> -- <prompt>` |
| codex | `codex exec [--skip-git-repo-check] <sandbox-flags> [<id-flag> <uuid>] -- <prompt>` |

- **No `--output-format json` (claude) / `--json` (codex)** on the child argv (S2): the
  child is detached with null stdout, so spawn never reads its result; birth is confirmed via
  marker-diff / pre-mint `resolve`. A2 records the session-id JSON key as DOCS-ONLY context
  (SKILL use), not a spawn input. The alternative — a first-line `stream-json` handshake read
  before backgrounding — is **REJECTED**: incompatible with fire-and-forget null stdout, and
  it adds a blocking read.
- `<perm-flags>` / `<sandbox-flags>` come from A5's live inventory; the DEFAULT is asymmetric
  (Claude `bypassPermissions`, Codex Auto preset), `--read-only` opts down on both,
  `--full-access` is codex-only. `--skip-git-repo-check` is added to the codex argv only when
  `<dir>` isn't a git repo (A4).
- `<uuid>` is minted via `store::uuid_v4` ONLY when A3/A4 confirm the tool accepts a
  pre-set session id; otherwise birth-confirmation falls back to the marker-diff watch.
- `<prompt>` = the standing prefix + the user's first task (below).

**Standing-prefix prompt template (concrete draft; the child's first prompt is
TRUSTED — parent instructing its own child — so it is NOT wrapped in the
`<session-relay-mail>` untrusted fence):**

```
You are a session-relay bus worker spawned by "<reply-to>". You are running in a
fresh session in this project — its CLAUDE.md/AGENTS.md, skills, and plugins apply.
When you finish, or if you need a decision, report to "<reply-to>" over the bus.
PRIMARY (works even if session-relay isn't installed in this project) — run:
  <abs-relay> send "<reply-to>" -- "<your message>"
(that is the absolute path to the relay binary that spawned you). If this project has
session-relay installed, the session-relay skill's send tool works too.

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

`<abs-relay>` = spawn's own absolute path via `std::env::current_exe()` (B4), so the
child's reply command is valid regardless of `<dir>`'s installed plugins (S1).

**Guardrail rules block = a PINNED DELIVERABLE.** B4 injects rules 1–3 above verbatim
into every spawned child's first prompt, on EVERY spawn, regardless of the permission
flag (`--read-only` / codex-only `--full-access` change the sandbox, never these rules).
A `spawn.rs` unit test (B6) asserts all three rule lines are present in the built prompt.

**Env overrides (dual-purpose: wrapper scripts AND the selftest seam):**
`RELAY_SPAWN_CMD_CLAUDE` / `RELAY_SPAWN_CMD_CODEX` replace the launched binary path.
The selftest points one at a stub that runs `relay hook` to perform the exact
self-registration a real child's SessionStart hook would.

**Reused `store.rs` functions (read/observe existing signatures — no schema change):**
`uuid_v4()` (:97), `is_uuid()` (:149), `register(id, dir, name, tool)` (:308),
`resolve(name_or_id)` (:362), `id_for_dir(dir)` (:378). Reused `cli.rs`: `Args`
(:30-70), `wake --dry` JSON shape as the `spawn --dry` model (:354-375).

**Birth-confirmation state machine:** snapshot `id_for_dir(<dir>)` (or the pre-minted
id) → launch detached (stderr → `<store home>/spawn-logs/<id-or-launch-uuid>.stderr`) →
loop {poll every 250ms; success when a NEW `is_uuid` id is registered for `<dir>` (or the
pre-minted id resolves)} until `--timeout` → on success `register(<name>)` and print
`spawned <name> (<id>) in <dir>`; on timeout exit non-zero **naming that stderr-log path**
(S5) so a fast-failing child is diagnosable.

## Acceptance criteria

Phase A (spike — each records a concrete finding into `## Interfaces & data shapes`):

- `claude --version` and `codex --version` print (both on PATH).
- A2 (docs-only probe): the `claude -p … --output-format json` output parses as JSON and
  the session-id key path is recorded verbatim — for the SKILL/docs, NOT consumed by the
  detached spawn launch (S2).
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
  a `claude` argv containing `-p` and (if A3 confirmed) `--session-id <uuid>` but NOT
  `--output-format json` (S2), `cwd`=`<dir>`, and a prompt whose reply command is
  `<abs-relay> send "<parent>" -- …` (S1) followed by `do X`.
- `relay spawn <dir> --dry -- "do X"` (no `--tool`) prints a "defaulting to claude" note
  and tool=`claude`.
- **Live leg (the real proof):** preconditions — `mkdir -p /tmp/spawn-scratch`, and the
  parent (this session) is registered under the name `<parent>` (`relay whoami` / `register`)
  so `send`/`peek <parent>` resolve; then from this repo,
  `relay spawn /tmp/spawn-scratch --tool claude --name worker1 -- "create HELLO.txt
  containing hi, then report done to <parent> over the bus"` → within the timeout
  `relay roster` lists `worker1`; the child creates `/tmp/spawn-scratch/HELLO.txt`; the
  child reports back by running the injected `<abs-relay> send "<parent>" -- …` command
  (works even though `/tmp/spawn-scratch` has no session-relay plugin, S1);
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
  exits — child tasks run minutes). `CommandExt::process_group(0)` + null stdin/stdout so a
  parent Ctrl-C / terminal signal doesn't kill the worker and the child outlives spawn
  (Unix reparents it to init; no double-fork/daemonize crate needed). Child **stderr is NOT
  null** — it redirects to `<store home>/spawn-logs/<id>.stderr` so a child that execs then
  dies fast (bad flag, auth failure) stays diagnosable; the `--timeout` error names that
  path (S5).
- **Reply loop must not assume session-relay in `<dir>` (S1).** The headline goal is "spawn
  in ANY project", but a fresh child only has the bus MCP/skill if session-relay is installed
  THERE. So the standing prefix's PRIMARY reply mechanism is the absolute `relay` binary path
  (spawn's own `std::env::current_exe()`), `<abs-relay> send "<reply-to>" -- "…"`, which works
  regardless of `<dir>`'s plugins; the MCP/skill send is only the nicety.
- **Same-cwd marker collision.** Two children in one dir race the cwd marker
  (`store.rs:374 set_marker` is last-writer-wins). Pre-mint + watch-for-specific-id
  avoids the ambiguity; without pre-mint, watch marker-diff and accept that concurrent
  same-dir spawns are undefined (document; don't try to serialize globally).
- **Permission posture is asymmetric (S3).** Codex default = its Auto preset
  (`workspace-write` + auto-approvals); Claude default = full-permission headless mode
  (`bypassPermissions`) — Claude has no middle "auto" tier, the user rejected `acceptEdits`,
  and headless `claude -p` auto-denies interactive prompts, so a Claude worker is bounded by
  the guardrail RULES, not a sandbox tier. `--read-only` opts down on both; `--full-access`
  is codex-only (Claude is already full). NEVER pass `--dangerously-*`. The guardrail rules
  block (branch-only, no live/production mutations, ask-parent-before-destructive) is injected
  into the prompt on EVERY spawn regardless of the flag — the sandbox and the prompt-rules are
  two independent layers.
- **Trusted vs untrusted prompt.** The FIRST prompt is trusted (parent → its own child)
  and is NOT wrapped in the `<session-relay-mail>` untrusted fence. Mail the child later
  receives IS untrusted and the existing `hook.rs` fence (`:59 defuse`, `:101 mail_block`)
  handles it. Do not conflate the two.
- **Child-CLI flags drift post-cutoff** (codex-cli 0.142.5). A5 inventories flags live;
  do not code against remembered flag names (`## STOP conditions`).
- **Version depends on queue order** — 0.4.0 if this ships before app-server-push,
  0.5.0 if after (`## Notes`).
- **Codex refuses a non-git `<dir>`.** A fresh `codex exec` errors in a directory with no
  git repo unless `--skip-git-repo-check` is passed (live-true on codex-cli 0.142.5; A4
  records the current flag). B1's codex argv must add it when `<dir>` isn't a git repo —
  and note guardrail rule 1 ("separate git branch") presupposes a repo, so it is a no-op
  in a non-git `<dir>`. (The live leg uses `--tool claude`, which sidesteps this.)
- **Named workers persist in the registry; `discover`'s window does NOT reap them.** The
  mtime liveness cutoff (`discover.rs:209`) only filters `discover`'s live-scan of the raw
  session stores — it never prunes `registry.json`. Because spawn's whole job is
  `register(--name)`, every spawned worker leaves a PERMANENT named entry that `roster`
  keeps listing after the one-shot child dies. This is accepted (no reaper this plan), but
  it is a registry-accumulation fact distinct from the discover-liveness rationale in
  `## Context`; do not expect `roster` to self-clean.
- **Every real spawn is a billable agent session.** A spawned `claude`/`codex` child loads
  full project context and runs a real task — it consumes API tokens/credits like any
  session (heavier than a `relay wake`, which resumes an existing one). Run the live leg
  deliberately, once; do not spawn in loops.

## Global constraints

- **Subscription-only billing (standing user directive, 2026-07-02):** spawned
  children are full agent sessions billed to the user's subscriptions — Claude
  children under the Claude-subscription OAuth login (verified: no
  `ANTHROPIC_API_KEY`/`apiKeyHelper` on this machine), Codex children under the
  ChatGPT-subscription auth (`auth_mode: "chatgpt"`). `spawn` must NEVER export
  `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` into a child's env (scrub, don't inherit,
  if present); Phase A verifies children inherit the login auth. Skill docs note
  each spawn consumes subscription usage like any interactive session.
- Zero new crates — `tinyjson` + `rustix` only (`Cargo.toml:9-11`); detach is pure std.
- `node scripts/ci.mjs` green before every commit; commit only in-scope files.
- Committed binaries come ONLY from `build-binaries.yml` (never a local build);
  `release.mjs` refuses to tag unless all 4 target binaries + launcher are committed
  executable with a verifying `SHA256SUMS` (release.mjs:56-68).
- Three-manifest version lockstep enforced by `release.mjs` + `ci.mjs`.
- Skill body ≤500 lines; `metadata.updated` bumped on any content change.
- **Permission default is asymmetric (S3, from the resolved posture):** Codex = Auto preset
  (`workspace-write` + auto-approvals); Claude = full headless (`bypassPermissions`) bounded
  by the guardrail rules; `--read-only` opts down (both), `--full-access` opts up (codex-only).
  Exact flag strings pinned by A5.
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
  the native picker (custom answer → the asymmetric per-tool posture + injected guardrail
  rules, refined by S3, encoded in `## Context`); every other guess is either pinned by a verbatim design
  decision or deferred to a Phase-A live check.
- Residual −8: exact child-CLI flag names + the session-id JSON key are unverifiable
  until Phase A runs on the installed CLIs (deliberately deferred, not guessable); B1
  is gated on recording them.

### Draft red-team (2026-07-02, fresh-context adversarial pass)

Verdict: **ready-when-queue-opens** — the plan is executable and well-gated; no
factual error blocks starting it once `app-server-push` ships. The clear factual
errors below were fixed inline this pass; the structural items are hardening to apply
at start (the plan is queued, so lazy is fine — but they change deliverables, so they
stay findings rather than silent edits). Ranked by severity.

**S1 — Goal-coverage gap: the reply loop assumes session-relay is available IN `<dir>`
(structural — apply at start).** The standing prefix (`## Interfaces`) tells the child to
"report to `<reply-to>` via the session-relay skill's send tool." A fresh child in an
*arbitrary* project (the headline goal: "spawn in ANY project dir") only has that skill /
the bus MCP tools if session-relay is installed/enabled THERE. Two halves both assume it:
(a) birth self-registration needs the child's SessionStart hook to fire, which needs the
plugin in `<dir>` (the pre-mint + parent-side-register fallback covers this); but (b) the
child REPLYING over the bus is NOT covered by pre-mint — with no session-relay in `<dir>`,
the child literally cannot `send`. Fix: inject the **absolute `relay` binary path** into the
prefix as the primary reply mechanism (`<abs>/relay send "<reply-to>" -- "…"`), so the loop
works regardless of `<dir>`'s plugins — spawn IS that binary, so it already knows the path;
keep the skill/MCP send as the nicety. Alternatively scope the goal to "any dir where
session-relay is available." Without one of these, the goal ("worker in another project
reports back over the bus") is only met for session-relay-equipped projects.

**S2 — A2's session-id-key finding + `--output-format json` on the child argv are orphaned
by the null-stdio detach (structural — reconcile at start).** B1 launches DETACHED with null
stdio, and the birth state machine (`## Interfaces`) confirms birth via marker-diff or
pre-mint `resolve` ONLY — it never reads the child's stdout. So A2's recorded session-id JSON
key is unreadable by spawn, and `--output-format json` on a fire-and-forget child has no
consumer (the child transcript persists on disk regardless of output format). Reconcile:
either (i) drop `--output-format json` from the detached child argv and mark A2 as
docs-only / SKILL-only, or (ii) if the id is meant to be captured from the child, specify a
first-line `stream-json` handshake read BEFORE backgrounding — which is incompatible with
pure null stdout and must be designed explicitly. As written, A2 and the birth path
contradict each other.

**S3 — Claude has no Codex-style "Auto" preset; the user explicitly rejected `acceptEdits`
(moderate — surface at A5).** The resolved posture is symmetric ("each tool's native auto
working mode"), but Codex has a clean Auto preset while Claude's `--permission-mode` ladder
is `default` / `acceptEdits` / `plan` / `bypassPermissions` with no middle "auto" tier. The
user's verbatim words say "auto mode maybe? **instead of acceptedits**" — so A5 landing on
`acceptEdits` contradicts the user, and the only more-autonomous option
(`bypassPermissions`) is effectively full access, colliding with `--full-access` being the
opt-UP. A5 must handle "no clean Claude auto tier": document the chosen mapping and, if it
can only be acceptEdits or bypass, surface it to the user rather than silently pick. Consider
an `## Open question` for the Claude side specifically.

**S4 — B7 fake-child stub under-pinned beyond the seam (moderate; scrub-list fixed inline).**
The `RELAY_SPAWN_CMD_*` seam is pinned, but the stub itself needs: (a) it is a small
executable written to a temp path that `RELAY_SPAWN_CMD_CLAUDE` points at; (b) how it derives
the session id — parse its own `--session-id <uuid>` argv (pre-mint path, only if A3
confirms) vs mint one (marker-watch path) — which determines WHICH birth path the selftest
exercises, so the stub must match the compiled default; (c) it re-invokes the same `relay`
binary's `hook` verb with a `{session_id, cwd, source:"startup"}` JSON on stdin (model:
`selftest.mjs:91-93`). The `envFor` scrub-list edit + "B1 must not `.env_clear()`" were added
to B7 inline this pass; the id-derivation choice still needs pinning against A3's outcome.

**S5 — Detached + null stdio makes child-startup failures invisible (moderate — failure
mode).** `.spawn()` catches exec-not-found, but a child that execs then dies fast (bad
flag, auth failure, non-git codex dir) writes its error to a null stderr, so spawn can only
report a generic 30 s `--timeout` with no cause. Consider redirecting the child's stderr to a
temp log (not a pipe — no reader) so the timeout branch can point at it. Improves cold
diagnosability of the single most likely first-run failure.

**Fixed inline this pass (factual):**
- `--reply-to` default mechanics — `store::id_for_dir(cwd)` returns an **id**, not a name;
  corrected B4 + `## Notes` to resolve→`.name` with an id fallback (a raw id is a valid
  `send`/`peek` target).
- Codex non-git-dir refusal — added to A4 (record the current `--skip-git-repo-check` state)
  and a `## Known gotchas` bullet; noted guardrail rule 1 presupposes a repo.
- Registry accumulation vs discover window — added a gotcha clarifying that `discover`'s
  mtime cutoff filters only the live-scan and never prunes the named `registry.json` entry
  spawn creates, so `roster` keeps dead workers (the `## Context` "registry hygiene" bullet
  overstates self-cleanup for NAMED registrations).
- Spawn cost — added a gotcha: every real spawn is a billable full agent session; run the
  live leg once, never in loops.
- Live-leg preconditions — added `mkdir -p /tmp/spawn-scratch` + "parent registered as
  `<parent>`" so `send`/`peek <parent>` resolve.

**Minor (optional, not fixed):**
- `affected_paths` lists `cli.rs`/`store.rs`, which are reused READ-ONLY (unchanged) — a
  completion/finished scope-drift check will flag them as "in affected_paths but not
  changed." Drop them or annotate "read-only reuse."
- B3 "add `spawn` to `main.rs` match" = a NEW arm dispatching `relay::spawn::run`, not an
  append to the `cli::run` tuple (whose `match cmd` has no `spawn` arm). Low risk; the wording
  is clear enough given `spawn.rs` is its own module.
- Cited `main.rs:12-17` / `:15` line numbers will shift once `app-server-push` adds `watch`;
  the drift STOP already forces reconciliation, so no fix — noted for the executor.

Confirmed solid (no action): A0 cross-plan coupling is a bounded re-check (ls-shipped +
re-read one section for one finding, not an open dependency); the version note is correctly
CONDITIONAL (0.4.0/0.5.0) and C3 uses `release.mjs … minor` which auto-bumps from the live
manifest — no hardcoded target; the perm-posture is encoded as BOTH a verbatim user quote
(`## Context`) AND a pinned templated deliverable (`## Interfaces` prefix + `## Global
constraints`, implemented by B4, tested by B6); dependency order is acyclic (A0→A1→A2–A5→
B1→…→C3, no step consumes a later one); the trusted-vs-untrusted prompt distinction is
correct; STOP conditions are named and plan-specific; cited `file:line` refs re-verified
this session (cli.rs, store.rs, hook.rs, discover.rs, selftest.mjs, Cargo.toml:9-11,
plugin.json 0.3.0) all resolve as claimed.

### Red-team resolutions applied (2026-07-02, this pass)

All five structural findings above are now RESOLVED in-plan (no longer deferred to start) —
the plan carries **zero unresolved structural findings**:

- **S1 (reply loop cross-project):** the standing-prefix template + B4 + the live leg now make
  the absolute `relay` binary path (`<abs-relay> send "<reply-to>" -- …`, via
  `std::env::current_exe()`) the PRIMARY reply mechanism; the bus MCP/skill send is secondary.
  Works regardless of `<dir>`'s installed plugins.
- **S2 (orphaned `--output-format json` under null-stdout detach):** dropped `--output-format
  json` (claude) / `--json` (codex) from the child argv; A2's session-id-key finding is marked
  DOCS-ONLY; birth stays marker-diff / pre-mint `resolve`. The first-line stream-json handshake
  alternative is explicitly REJECTED (incompatible with null stdout; adds a blocking read).
- **S3 (no Claude "auto" tier; user rejected `acceptEdits`):** the default posture is now
  ASYMMETRIC — Codex Auto preset; Claude `bypassPermissions` bounded by the guardrail rules (the
  user's "full access but we state some rules" branch). Consequence: `--full-access` is
  codex-only, `--read-only` opts down on both. Encoded in `## Context`, A5, `## Interfaces`,
  `## Global constraints`, and the `## Known gotchas` posture bullet.
- **S4 (fake-child stub under-pinned):** B7 now pins the stub — parse `--session-id <uuid>`
  (pre-mint path) or mint its own (marker-watch path), re-invoke `relay hook`; the selftest
  exercises BOTH birth paths, one check each.
- **S5 (fast-failing children invisible under null stderr):** child stderr redirects to
  `<store home>/spawn-logs/<id-or-launch-uuid>.stderr`; the `--timeout` error names that path.
  Encoded in B1, B2, the birth state machine, and the `## Known gotchas` detach bullet.

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
- Selftest check count: before **48** → after **52** (4 new spawn checks: dry argv+prompt, pre-mint birth, marker-watch birth, timeout-names-stderr-log).
- **A0 reconciliation (2026-07-02, at start — app-server-push SHIPPED as 0.4.0):**
  - Drift since `planned_at_commit` is exactly the sibling plan's changes:
    `main.rs` gained a `watch` arm (spawn adds its own arm alongside — no conflict);
    `cli.rs` `BOOL_FLAGS` is now 5 entries (`dry`,`json`,`auto-turn`,`once`,`all`) —
    B3 must extend it with `read-only`,`full-access`; `Args::has` is ALREADY
    `pub(crate)` (done by the sibling's B2 — spawn gets it for free); `lib.rs` has
    `pub mod watch;`; `selftest.mjs` is at **48 checks** (the "before" count for B7)
    and its `envFor` scrub list now also carries `RELAY_APP_SERVER`,
    `RELAY_TURN_SETTLE_MS`, `RELAY_TURN_WAIT_MS` — add `RELAY_SPAWN_CMD_*` beside them.
  - **Codex birth path stays `codex exec`** (as pinned in `## Out of scope`): app-server
    `thread/start` works (spike-verified) but requires a RUNNING app-server — a setup
    precondition spawn's zero-management goal shouldn't take on. Relevant inherited
    facts if that ever changes: MCP tool calls inside app-server turns raise
    `mcpServer/elicitation/request` needing an attached answering client (watch's
    `pump_turn`), and hooks DO fire inside app-server turns.
  - `watch.rs`'s `wake_fallback` uses the same `std::env::current_exe()` self-exec
    pattern B4 needs for `<abs-relay>` — reuse the idiom.
  - **Version path resolved: 0.5.0** (app-server-push shipped 0.4.0 first).
- The `--reply-to` default resolves the parent's own bus name via
  `store::id_for_dir(<spawn cwd>)` → `store::resolve(id).name` (`id_for_dir` returns an
  **id**, not a name — resolve it; fall back to the id if the parent is unnamed). If the
  parent isn't registered/named, the SKILL tells an interactive agent to `whoami` and pass
  `--reply-to <own name>` explicitly.
