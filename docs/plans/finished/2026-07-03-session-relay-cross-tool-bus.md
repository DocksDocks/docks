---
title: session-relay v2 — cross-tool Codex↔Claude agent bus
goal: Evolve the Claude-only session-relay plugin into a tool-agnostic bus so a Codex session and a Claude Code session register on one shared MCP mailbox and exchange message+reply both ways
status: finished
created: "2026-06-30T01:02:14-03:00"
updated: "2026-07-03T16:58:21-03:00"
started_at: "2026-06-30T01:18:08-03:00"
assignee: null
tags: [session-relay, cross-tool, codex, mcp, multi-agent]
affected_paths:
  - plugins/session-relay/lib/store.mjs
  - plugins/session-relay/mcp/bus.mjs
  - plugins/session-relay/hooks/session-start.mjs
  - plugins/session-relay/hooks/codex-hooks.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/bus.mcp.json
  - plugins/session-relay/skills/productivity/session-relay/scripts/relay.mjs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/test/selftest.mjs
  - .agents/plugins/marketplace.json
  - scripts/ci.mjs
related_plans: []
review_status: passed
ship_commit: "f9a67554c1bfdc344df6f6db2df15d1e106e1e2c"
planned_at_commit: "96243021203a362fd3db4e1ef92e168230641c73"
in_review_since: "2026-06-30T01:49:19-03:00"
---

# session-relay v2 — cross-tool Codex↔Claude agent bus

> v1 (Claude-only) is already built and committed on branch
> `feat/session-relay-cross-session-bus` (commit `9624302`). This plan adds the
> Codex side so the two tools can message each other. v1's design was chosen,
> in part, to make this extension a non-architectural change.

## Goal

A developer running a **Claude Code** session in one project and an **OpenAI
Codex** session in another can have the two agents pass a message and a reply to
each other, with neither sharing a process, a project directory, or a vendor.
Success = a live round-trip: Claude→Codex and Codex→Claude, each delivered into
the recipient's session and acted on.

This matters because the user's workflow spans both tools; today the only native
cross-agent options are single-tool (Claude Agent Teams) or single-session
(subagents). No shipped tool does cross-session **and** cross-tool relay well —
this fills that niche.

## Context & rationale

Reached after a verified prior-art study (two research workflows + adversarial
verification of 7 load-bearing claims, all confirmed; plus live probes of the
`codex` 0.142.2 binary installed on this box). Verbatim decisions:

- **Keep the v1 transport; do not adopt a new protocol.** The recommended design
  is the lightweight **shared on-disk store + stdio MCP bus + per-tool
  headless-resume doorbell**, made tool-agnostic by adding a Codex adapter. This
  is the only option needing **no new protocol on either end** — both Codex and
  Claude Code are native MCP clients.
- **Reject A2A (Agent2Agent) as the wire protocol.** A2A is real, mature
  (Google→Linux Foundation, v1.0, official SDKs) and is the right standard for
  *networked multi-vendor fleets*, but **neither Claude Code nor Codex speaks it
  natively** — you'd run an A2A HTTP server per tool. The one shipped Codex↔Claude
  bridge (`codex-claude-bridge`) rejected A2A for MCP for exactly this reason.
  A2A is kept as an optional Phase-4 *contract vocabulary* to mirror (Agent Card,
  Task lifecycle, Message/Part), not a runtime to adopt now.
- **Reject `codex mcp-server` as the backbone.** It exists, but has a confirmed
  sharp edge: the `codex` tool result omits the thread/conversation id (only in
  streamed notification `_meta`; openai/codex #3712/#8388/#8580), making multi-turn
  `codex_reply` fragile. Use `codex exec resume` instead.
- **Why the v1 design is already ~90% tool-neutral:** `store.mjs` + `bus.mjs` are
  generic. Only **three seams are Claude-bound** — the branded home path
  (`~/.claude/session-relay`), the Claude SessionStart hook event shape, and the
  hardcoded `claude` CLI in `relay.mjs wake`. Phase 1 neutralizes those; Phase 2
  adds the Codex peer.

**Prior-art placement** (the "relate to them" deliverable):

| Prior art | Approach | Cross-tool? | Borrow / avoid |
|---|---|---|---|
| **A2A** (Agent2Agent) | HTTP Agent Cards + Task/Message/Part, JSON-RPC/SSE | tool-agnostic, but neither CLI speaks it | BORROW the contract vocabulary (Phase 4); avoid the runtime now |
| **MCP-as-bus** (shared mailbox server) | one stdio MCP server both agents call | both (native MCP clients) | BORROW — this **is** our spine; caveat: MCP can't push into a sleeping client → doorbell required |
| **Codex `codex mcp add` / `[mcp_servers]`** | Codex attaches to external MCP servers | both | BORROW — lets Codex join the same `bus.mjs`, zero protocol change |
| **Codex `codex exec resume`** | headless resume by session id | codex-only | BORROW — the Codex doorbell, peer of `claude -p --resume` |
| **`codex mcp-server`** | Codex AS an MCP server | both | AVOID as backbone (thread-id omission bug) |
| **Native Claude Agent Teams** | file Mailbox + SendMessage + file-locked tasks | Claude-only | BORROW the file-mailbox+lock (already mirrored); avoid scope limits (one team/session, lost on resume) |
| **claude-swarm** | MCP tree of Claude sessions | Claude-only | BORROW per-instance dir scoping; avoid Claude-only topology |
| **claude-squad / ccmanager** | tmux + worktree launchers | both (launch only) | AVOID for messaging — they have ZERO inter-agent comms (confirms the open niche) |
| **agentapi** (Coder) | HTTP+SSE front door over one agent | tool-agnostic | AVOID as spine (one-agent-per-server, no routing); possible later substrate |
| **claude-code-router / Bifrost** | model-API proxy | client-compat only | AVOID — category trap, routes model calls not agent messages |
| **Zed ACP** (Agent Client Protocol) | JSON-RPC/stdio agent↔editor | tool-agnostic | NOTE only — wrong axis (editor↔agent), not a bus |

Our v1 is a concrete instance of the **best-fit family** (shared-MCP-mailbox +
resume-doorbell) and already ships the doorbell (`relay.mjs wake`) that the
literature faults MCP buses for lacking.

## Environment & how-to-run

- **Node** ≥ 22 (dev box: v24.15.0). **pnpm** 11.x via corepack. Repo deps:
  `corepack enable && pnpm install --frozen-lockfile`.
- **claude** CLI ≥ 2.1.169 (dev box: 2.1.196) — provides `-p`/`--resume`/`--session-id`/SessionStart hook.
- **codex** CLI (dev box: 0.142.2) — provides `codex exec resume`, `codex mcp add`, hooks, `~/.codex/sessions/`.
- **jq** for parsing `--output-format json` / `--json`.
- Commands used constantly:
  - CI gate: `node scripts/ci.mjs`  (must be green before commit)
  - Plugin self-test: `node plugins/session-relay/test/selftest.mjs`
  - Claude plugin lint: `claude plugin validate ./plugins/session-relay`
  - Skill score: `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/session-relay/skills`
  - Hash backfill: `node scripts/skills/content-hash.mjs --backfill plugins/session-relay/skills`
- **Isolation for tests:** set `AGENT_RELAY_HOME` (Phase 1+) / `SESSION_RELAY_HOME` (v1 alias) to a temp dir so tests never touch the real store.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | **Neutralize store home.** `homeDir()` defaults to `~/.agent-relay`; reads `AGENT_RELAY_HOME`, then `SESSION_RELAY_HOME` (back-compat alias), then the default. No behavior change for existing Claude users beyond the path. | `plugins/session-relay/lib/store.mjs` | — | done |
| 2 | **Add `tool` field to the registry.** `register({id,dir,name,tool})` stores `tool` (`"claude"`/`"codex"`, default `"claude"` when unset). `roster`/`resolve` unchanged otherwise. | `plugins/session-relay/lib/store.mjs` | 1 | done |
| 3 | **Make `relay.mjs wake` tool-aware.** Dispatch on `target.tool`: `claude` → existing `claude -p "<msg>" --resume <id> --output-format json` (cwd=dir); `codex` → `codex exec resume <id> "<msg>"` (cwd=dir, `--json` + `-o <tmp>` for a structured reply). | `plugins/session-relay/skills/productivity/session-relay/scripts/relay.mjs` | 2 | done |
| 4 | **Extend self-test** to cover tool-tagged registration + doorbell dispatch selection (assert the codex branch builds the right argv without spawning). | `plugins/session-relay/test/selftest.mjs` | 2,3 | done |
| 5 | **PRE-PHASE-2 VERIFY (resolves open questions, do on a live codex box).** Confirm: (a) a Codex plugin/`hooks.json` `SessionStart` hook fires with stdin `{source,session_id,cwd}`; (b) that `session_id` is the exact id `codex exec resume <id>` accepts (round-trip); (c) whether `codex exec resume` must run from the session's original cwd; (d) how Codex sets an MCP server's working dir. Record findings in `## Notes`; if (a) or (b) fails, STOP and fall back to doorbell-prompt-drives-`inbox` (no Codex hook). | (investigation; updates `## Notes`) | 3 | done |
| 6 | **Codex SessionStart hook.** Codex's SessionStart stdin is identical to Claude's, so `session-start.mjs` is **shared** — it takes a `tool` arg (`argv[2]`) and tags `register({tool})`. A Codex `hooks.json` invokes it with `codex`. | `plugins/session-relay/hooks/session-start.mjs` (shared, `codex` arg) + `plugins/session-relay/hooks/codex-hooks.json` | 5 | done |
| 7 | **Codex MCP wiring.** Document + ship the `codex mcp add bus -- node <abs>/mcp/bus.mjs` step (or a `[mcp_servers.bus]` config snippet) with `RELAY_PROJECT_DIR`/cwd set so the marker self-id resolves. `bus.mjs` already falls back to `process.cwd()`. | `plugins/session-relay/.codex-plugin/plugin.json`, SKILL.md install notes | 5 | done |
| 8 | **Codex plugin parity.** Emit `.codex-plugin/plugin.json` for session-relay (skills + hooks) via the `codex-plugin-mirror` skill; add a `session-relay` entry to `.agents/plugins/marketplace.json`. Drop "Claude Code only" from the descriptions. | `plugins/session-relay/.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json` | 6,7 | done |
| 9 | **Update the skill** body: document the cross-tool model, the two doorbells, Codex install, and the `tool` field. Bump `metadata.updated`, backfill `content_hash`. | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | 6,7 | done |
| 10 | **Extend `ci.mjs`** session-relay section for Codex parity (codex plugin.json JSON valid; marketplace entry present; selftest still green). | `scripts/ci.mjs` | 8 | done |
| 11 | **Live cross-tool round-trip** smoke test: Claude→Codex and Codex→Claude, both delivered + acted on. Capture transcript in `## Notes`. | (test script in scratchpad) | 6,7,8 | done |

Phases: **Phase 1 = steps 1–4** (neutralize, no Codex; ships independently).
**Phase 2 = steps 5–11** (the cross-tool milestone). Phase 3/4 (A2A-flavored
typed message contract; A2A facade) are out of scope here — see Out of scope.

## Interfaces & data shapes

- **Registry entry** (`registry.json` `agents[id]`), Phase 2 shape:
  `{ id: string, dir: string, name: string|null, tool: "claude"|"codex", lastSeen: ISO }`.
  `names[name] = id` index unchanged.
- **Mailbox line** (`mailbox/<id>.jsonl`, one JSON per line): unchanged —
  `{ id, ts, from, fromName, to, toName, body }`.
- **Claude doorbell:** `claude -p "<msg>" --resume <id> --output-format json` (cwd = `target.dir`); reply in `.result`.
- **Codex doorbell:** `codex exec resume <id> "<msg>"` (cwd = `target.dir`); add `--json` (JSONL events to stdout) and `-o <file>` / `--output-last-message <file>` to capture the final reply. No `--session-id` preset flag exists; never use `--ephemeral` (silently forks a new thread).
- **Codex MCP registration:** `~/.codex/config.toml`:
  `[mcp_servers.bus]` → `command = "node"`, `args = ["<abs>/plugins/session-relay/mcp/bus.mjs"]`, `env = { RELAY_PROJECT_DIR = "<project dir>" }` (Codex config is static — no `${CLAUDE_PROJECT_DIR}`-style interpolation; pin cwd or rely on `bus.mjs` `process.cwd()` fallback). Equivalent: `codex mcp add bus -- node <abs>/mcp/bus.mjs`.
- **Codex SessionStart hook stdin (to verify in step 5):** expected `{ source: "startup"|"resume"|"clear"|"compact", session_id, cwd }`; output `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`.
- **Bus tools** (`bus.mjs`, unchanged, both clients): `whoami`, `register`, `roster`, `send{to,body}`, `inbox`. Tool name surface differs per host: Claude `mcp__plugin_session-relay_bus__send`; Codex `mcp__bus__send` (or its equivalent for a `[mcp_servers.bus]` entry).

## Acceptance criteria

- **Phase 1 — store + dispatch neutral, Claude path unchanged:**
  `node plugins/session-relay/test/selftest.mjs` → `PASS: session-relay self-test — N checks` (N ≥ 12, includes tool-field + dispatch assertions).
  `AGENT_RELAY_HOME=$(mktemp -d) node -e "import('./plugins/session-relay/lib/store.mjs').then(s=>{s.register({id:'x',dir:'/d',name:'a',tool:'codex'});console.log(s.roster()[0].tool)})"` → prints `codex`.
  `node scripts/ci.mjs` → `✔ All ci.mjs checks passed`.
- **Phase 2 — live cross-tool round-trip** (step 11 script), expected final output `ALL CROSS-TOOL CHECKS PASSED`, proving:
  - a Codex session registers (via its SessionStart hook) into the shared store: `relay.mjs list` shows it with `tool=codex`;
  - Claude→Codex: a message sent from a Claude session + `relay.mjs wake <codex>` is delivered into the Codex session and the Codex agent acts on it (reply observable in its `-o` file / `--json`);
  - Codex→Claude: symmetric, delivered into the Claude session via its SessionStart hook.
- **CI green** after every phase: `node scripts/ci.mjs` exits 0.

## Out of scope / do-NOT-touch

- **Phase 3 (typed message contract)** and **Phase 4 (A2A/Agent-Card facade)** — not built here; the mailbox stays `{from,to,body,ts}`. Only build an A2A facade against a *real external-peer requirement*.
- **`codex mcp-server` / `claude mcp serve` as the backbone** — do NOT route the bus through either (thread-id omission; stateless ingress). They remain optional alternate legs only.
- **`plugins/docks/`** — do NOT modify the docks plugin; this work is entirely in `plugins/session-relay/` + the two shared catalogs/`ci.mjs`.
- **`scripts/release.mjs`** — do NOT couple session-relay into the docks release lockstep; it self-versions (`claude plugin tag ./plugins/session-relay`).
- **The mkdir-mutex / lock design** — adequate for ≤ a handful of sessions; do NOT redesign for scale in this plan (noted as a future concern).

## Known gotchas

- **MCP cannot push into a sleeping client.** Server→client is limited to sampling/elicitation/roots/notifications — delivery to an *idle* session REQUIRES the external doorbell. This is a hard dependency, not an optimization.
- **Codex `notify` is user-level only** (`~/.codex/config.toml`, ignored in project config) and fires only on agent-turn-complete. If used as a drain signal it must live in the user config.
- **Codex config has no cwd interpolation** (unlike Claude's `${CLAUDE_PROJECT_DIR}`). Pin the bus working dir or rely on `bus.mjs` `process.cwd()` so the marker self-id matches the dir the Codex SessionStart hook recorded.
- **Codex resume sharp edges:** no `--session-id` preset flag (#15271); resuming an `--ephemeral` session silently starts a NEW thread (#15538). Never preset ids; never use ephemeral for the bus.
- **Codex hooks/`--json` are recent (2026) surfaces** — event keys and the JSONL event schema have drifted between versions (e.g. `item_type`→`type`). Pin to the documented contract and version-check.
- **Keep the bus on stdio.** Codex Streamable-HTTP MCP needs `experimental_use_rmcp_client` with reported init bugs; both tools support stdio natively.

## Global constraints

- Skill body ≤ 500 lines (agentskills.io); productivity per-file score floor **8** (aim 14+).
- No author-script references in shipped skill/agent bodies (`scripts/skills/no-author-scripts.mjs`).
- No `AGENTS.md`/`CLAUDE.md` pair inside `plugins/session-relay/` (`tree/guard.mjs` walks the whole repo and would demand a complete node).
- Manifest versions agree within a plugin (its `plugin.json` ↔ its marketplace entry); session-relay self-versions independently of docks.
- Store home default `~/.agent-relay`; override `AGENT_RELAY_HOME`; `SESSION_RELAY_HOME` kept as a back-compat alias.

## Cold-handoff checklist

1. **File manifest** — every step names exact path(s); see `## Steps` + `affected_paths`. ✓
2. **Environment & commands** — versions + exact commands in `## Environment & how-to-run`. ✓
3. **Interface & data contracts** — registry/mailbox shapes, both doorbell commands, Codex MCP config, Codex hook IO in `## Interfaces & data shapes`. ✓
4. **Executable acceptance** — commands + expected output in `## Acceptance criteria`. ✓
5. **Out of scope** — stated positively in `## Out of scope / do-NOT-touch`. ✓
6. **Decision rationale** — why option (a), why not A2A/`codex mcp-server`, in `## Context & rationale`. ✓
7. **Known gotchas** — `## Known gotchas` (MCP-no-push, Codex cwd/ephemeral/notify, version drift). ✓
8. **Global constraints verbatim** — `## Global constraints`. ✓
9. **No undefined terms / forward refs** — step 5 defines the Codex-hook unknowns as a verify task with a STOP fallback, not a `TODO`. ✓

## STOP conditions

- If **step 5** shows Codex has **no SessionStart-equivalent hook**, or its `session_id` does **not** round-trip through `codex exec resume`, STOP the auto-drain approach and fall back: the Codex doorbell prompt itself instructs the woken Codex agent to call the bus `inbox` tool (Codex is an MCP client, so `inbox` works without a hook). Record the decision; do not invent a Codex hook event name.
- If `codex exec resume` requires the original cwd and the recorded dir is unavailable, STOP and surface — do not resume from an arbitrary dir.

## Self-review

Drafted then red-teamed against the rubric (single scored pass — substantive but
well-scoped, first score ≥ 85 so no hill-climb loop).

- Score: **88/100** · trajectory `88` · stopped: single-pass (first score ≥ 85).
- Standalone executability (20/22): paths, commands, data shapes, both doorbells, Codex config all present; −2 because step 5's Codex-hook specifics are verify-then-implement (honestly flagged with a STOP fallback) rather than fully pre-resolved.
- Actionability (16/16): every step has a verifiable done-condition.
- Dependency order (12/12): 1→2→3→4 (Phase 1); 5 gates 6–11.
- Evidence re-verify (8/10): Codex CLI subcommands/flags verified live on the box this session (`codex exec resume`, `codex mcp add`, rollout `session_meta`); −2 as the Codex SessionStart-hook id round-trip is research-confirmed but not yet live-verified (that IS step 5).
- Goal coverage (12/12): steps 5–11 deliver the live two-way round-trip the Goal names.
- Executable acceptance (12/12): criteria are commands + expected output.
- Failure mode (8/10): STOP conditions cover the Codex-hook risk; −2 no explicit revert for a half-applied Codex config.
- Assumption→question (6/6): the two genuine user decisions are in `## Open questions`; technical unknowns are step 5, not silent defaults.

## Review

- **Goal met:** yes — **Re-verified at HEAD 178884b on 2026-07-03T16:51:47-03:00 — capability intact through the Rust port (v0.6.0).** The cross-tool bus still stands after the bash→Rust move: both tools register on ONE shared on-disk mailbox (fixed tool-neutral home `~/.agent-relay`, `AGENT_RELAY_HOME`/`SESSION_RELAY_HOME` alias — `store.rs:26-35`) reached through one `relay bus` MCP server (Claude `.claude-plugin` map + Codex `.codex-plugin/bus.mcp.json` direct-map). Codex SessionStart auto-registers `tool=codex` (`hooks/codex-hooks.json` → `relay hook codex`; `hook.rs:42-45,200`), Claude `tool=claude` (`hooks/hooks.json` → `relay hook`); the doorbell stays tool-aware — `wake` dispatches `codex exec resume <id> --json` vs `claude -p --resume <id> --output-format json` on `target.tool` (`cli.rs:357-378`); registry carries the `tool` field, `claude` default (`store.rs:226,260,308-335`). Original Step-11 live round-trip (Claude→Codex `MANGO`, Codex→Claude `PAPAYA-FROM-CODEX`) holds and was hardened v0.2.1→v0.6.0 (live-verified Codex MCP direct-map, push-delivery, `relay watch` live-leg).
- **Regressions:** none — implementation MOVED, not lost. The `.mjs` seams this plan cites (`lib/store.mjs`, `mcp/bus.mjs`, `skills/.../scripts/relay.mjs`) are folded into the single `relay` Rust binary — every named capability has a Rust home. Stale-by-move only (cosmetic, not a defect): `affected_paths` + the Phase-1 `import('./lib/store.mjs')` one-liner + the `selftest — 15 checks` count all name the pre-port layout (store.mjs→store.rs, `relay.mjs wake`→`relay wake`, 15→62 selftest checks). Judged by capability, not file layout, as instructed — the goal capability is intact.
- **CI:** pass (cited, not re-run) — read-only re-verify with 5 concurrent reviews barred running `node scripts/ci.mjs`/selftest. Orchestrator verified `node scripts/ci.mjs -q` green at e177040 this session (only plan-file commits since; HEAD 178884b); the session-relay selftest (62 checks) ran green during today's v0.6.0 release.
- **Follow-ups:** none blocking. Optional housekeeping (NOT created): refresh this plan's `affected_paths` + Phase-1 acceptance one-liner to the Rust layout (`store.rs`/`cli.rs`/`hook.rs`; `relay register --tool codex` + `relay list`) so the archived plan matches the shipped binary.
- Filed by: plan-review (re-verify at HEAD 178884b) on 2026-07-03T16:51:47-03:00 — original review 2026-06-30T01:50:39-03:00

## Sources

- `plugins/session-relay/lib/store.mjs:13-22` — `homeDir()` currently `~/.claude/session-relay`; the seam Phase 1 neutralizes.
- `plugins/session-relay/skills/productivity/session-relay/scripts/relay.mjs` (`wake` case) — hardcoded `claude` spawn; the seam step 3 makes tool-aware.
- Live probe (`codex exec resume --help`): `Usage: codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]`; `--last`; `--json` (JSONL events), `-o/--output-last-message <FILE>`, `--output-schema` — the Codex doorbell + structured reply.
- Live probe (`codex mcp --help`): `add/list/get/remove/login/logout` — Codex is an MCP client; `codex mcp add bus -- node …` joins the same `bus.mjs`.
- Live probe (`~/.codex/config.toml`): `[hooks.state]` running `docks@docks:hooks/hooks.json:post_tool_use` + `[plugins."docks@docks"]` enabled — Codex loads docks plugin hooks (snake_case events), confirming the hooks substrate.
- Live probe (`~/.codex/sessions/.../rollout-*.jsonl` first line): `type:"session_meta"` with `session_id` + `cwd` — an id↔dir map is derivable.
- Verified (dual-lens, 7/7 confirmed): Codex MCP client config; `codex mcp-server` exists; `codex exec resume`; rollouts under `~/.codex/sessions/` + `--json`/`-o`; Codex `notify`/hooks + AGENTS.md; A2A is LF v1.0 with SDKs; `claude mcp serve` exists. Official docs: developers.openai.com/codex/cli/reference, code.claude.com/docs/en/mcp, a2a-protocol.org.
- `https://github.com/abhishekgahlot2/codex-claude-bridge` — the one shipped Codex↔Claude bridge; chose MCP over A2A (corroborates the transport decision).

## Notes

- **Step 5 live-verification (RESOLVED on this box, codex 0.142.2):**
  - Codex SessionStart hook EXISTS — same `hooks.json` shape (PascalCase events), stdin `{source:startup|resume|clear|compact, session_id, transcript_path, cwd, model, permission_mode}`, and the SAME `hookSpecificOutput.additionalContext` injection as Claude. So `hooks/session-start.mjs` serves both tools with a `tool` arg.
  - **id round-trips:** the rollout `session_meta` shows `id == session_id == thread_id` (e.g. `019f16c5-…`), and `codex exec resume <thread_id>` recalled prior context (codeword KIWI) live. So the hook's `session_id` is exactly the id the doorbell resumes.
  - **Codex resume is NOT cwd-scoped** (cross-dir recall worked) — unlike Claude. The Codex doorbell may run from any dir; we still pass `cwd=target.dir` (harmless, good for the woken agent's file ops).
  - **Codex doorbell:** `codex exec resume <id> "<msg>" --json`; session id surfaces in the `thread.started` event and the rollout filename.
  - **Codex plugin surface:** plugins bundle Skills + MCP servers + Hooks; Codex uses `${CLAUDE_PLUGIN_ROOT}` too. The Codex bus MCP ships as `.codex-plugin/bus.mcp.json` (referenced by the Codex manifest only — kept out of the plugin root so Claude never double-loads it); `codex mcp add bus` is the documented manual alternative. Receive-path needs only the hook, send-path can use the bus tool or `relay.mjs` via Bash.
- **Step 11 live cross-tool round-trip (PASSED, 2026-06-30):** a real Codex session (temp `CODEX_HOME` carrying the shared SessionStart hook) and a real Claude session (`--plugin-dir`) both auto-registered on one shared store (`roster` showed `[codex]` + `[claude]`). **Claude→Codex:** an externally-queued message was delivered into the Codex session by its hook; the agent acted (replied `MANGO`). **Codex→Claude:** the Codex agent ran `relay.mjs send`, the message landed in the store and was delivered into the Claude session by its hook, which echoed `PAPAYA-FROM-CODEX`. All cross-tool checks green; `node scripts/ci.mjs` green (incl. 5 new Codex-parity checks); `selftest` 15 checks.
- **Decisions (2026-06-30 session):** (OQ1) **fold v2 into the same PR** — do NOT open the v1 PR yet; build Phase 1+2 on `feat/session-relay-cross-session-bus`, then open one PR for the full cross-tool bus. (OQ2) **full Codex plugin** packaging — ship `.codex-plugin/plugin.json` + Codex hooks + a `.agents/plugins/marketplace.json` entry (matches docks' cross-tool plugin pattern).
- v1 already mirrors prior-art primitives: MCP-as-bus (claude-swarm spine), file-mailbox+lock (Agent Teams), named addressing (roster). Its novelty is being zero-dependency, backend-less, and surviving `/resume` because state is on disk + re-read by the SessionStart hook.
- The store self-id trick (resolve "me" from `RELAY_PROJECT_DIR` via the cwd→id marker) sidesteps MCP's "server never learns the host session id" limit identically for Codex — no new mechanism needed.
- A2A's Message/Part + Task lifecycle is the model to mirror IF Phase 3/4 is ever pursued; the mailbox line maps cleanly onto a `TextPart`.
