---
title: session-relay — auto-discover the running session
goal: Let an agent auto-resolve "my other running session" with no id and no prior registration, by scanning the raw on-disk Claude/Codex session stores
status: in_review
created: "2026-06-30T13:43:15-03:00"
updated: "2026-07-03T16:51:56-03:00"
started_at: "2026-06-30T13:43:15-03:00"
assignee: null
tags: [session-relay, discover, cross-tool, auto-resolve, codex]
affected_paths:
  - plugins/session-relay/lib/discover.mjs
  - plugins/session-relay/mcp/bus.mjs
  - plugins/session-relay/skills/productivity/session-relay/scripts/relay.mjs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/test/selftest.mjs
related_plans: [session-relay-cross-tool-bus]
review_status: passed
planned_at_commit: "30d055d427b92f06ed9da4749d92dc487f9d3435"
in_review_since: "2026-06-30T13:43:15-03:00"
---

# session-relay — auto-discover the running session

## Goal

When the user says "talk to / check my other running session" without giving an
id, the agent should find it by itself and connect — even if that session never
joined the bus. Success = `discover` returns the sessions running now (Claude or
Codex), the agent auto-picks the most-recent/cwd-relevant one, and reaches it via
the tool-aware doorbell. Proven when a brand-new, plugin-less session is found
from disk and answered with its own context.

## Context & rationale

The merged cross-tool bus ([[session-relay-cross-tool-bus]]) could message only
sessions that had registered via the SessionStart hook, and `roster` returned
every session that ever registered with no liveness signal — so "which session is
running NOW?" was unanswerable, and a plain `claude`/`codex` launched without the
plugin was invisible. This increment closes that gap.

Verbatim user decisions (this session):
- **Full scan, not registry-only.** Scan the raw `~/.claude/projects` +
  `~/.codex/sessions` stores so discovery works for ANY running session, not just
  plugin-equipped ones. Chosen because the session-id↔cwd map a doorbell needs is
  already encoded on disk, so the registry is just a naming/optimization layer.
- **Auto-pick, confirm only when ambiguous.** Connect to the single best match
  (most-recent active, preferring a matching cwd); only stop to ask when two
  candidates are genuinely indistinguishable.

Key facts that shaped the parser (verified live against real stores):
- Claude: `<root>/<encoded-cwd>/<session-id>.jsonl` — id is the filename; the dir
  name is a **lossy** cwd encoding (e.g. `…/backstage_wp_theme` → `-…-backstage-wp-theme`,
  underscores and slashes both become `-`), so the real cwd MUST be read from the
  file's **content** (first line carrying `"cwd"`), not decoded from the dir name.
- Codex: `<root>/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` — first line is a
  `session_meta` event with `payload.id` (== the `codex exec resume` id) + `payload.cwd`.
- Liveness = file mtime recency. The first cwd-bearing line sits within the first
  few KB even in multi-MB transcripts, so a bounded 64 KB read is sufficient.

## Environment & how-to-run

- Node ≥ 22 (dev box v24.15.0); `claude` CLI ≥ 2.1; `codex` CLI 0.142.2.
- Self-test: `node plugins/session-relay/test/selftest.mjs` → `PASS … N checks`.
- CI gate: `node scripts/ci.mjs` → `✔ All ci.mjs checks passed`.
- Test isolation: `discover` reads roots from `RELAY_CLAUDE_PROJECTS` /
  `RELAY_CODEX_SESSIONS` (default `~/.claude/projects`, `~/.codex/sessions`); the
  self-test points them at a fixture tree and controls mtime via `fs.utimesSync`.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | **`discover()` module.** Scan both stores; Claude cwd from content via a bounded 64 KB read; Codex id/cwd from the `session_meta` line; dedupe by id; cross-ref the registry for names; rank by recency with a cwd tie-break; `activeWithinMin` window; `excludeId` self-exclusion; env-overridable roots. | `plugins/session-relay/lib/discover.mjs` | — | done |
| 2 | **MCP `discover` tool.** Add to `bus.mjs` TOOLS + handler; self-exclude via `selfId()`; rank this project dir first. | `plugins/session-relay/mcp/bus.mjs` | 1 | done |
| 3 | **CLI `discover` + plugin-less connect.** `relay.mjs discover` (table/`--json`); explicit `--id/--dir/--tool` on `wake`/`send` to reach an unregistered session via an inline-message resume doorbell; fix `positionals()` so valueless `--dry`/`--json` don't swallow the message. | `plugins/session-relay/skills/productivity/session-relay/scripts/relay.mjs` | 1 | done |
| 4 | **Skill auto-resolve flow.** SKILL.md: discover → auto-pick → tool-aware connect (registered vs unregistered); description + components table + anti-hallucination updated; bump `metadata.updated`, backfill `content_hash`. | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | 2,3 | done |
| 5 | **Tests.** Self-test fixtures for both stores (controlled mtime): cwd-from-content, codex meta parse, recency ranking, self-exclude, window filter, tool filter, registry-name cross-ref, MCP-bus discover, `wake --id` argv. | `plugins/session-relay/test/selftest.mjs` | 1,2,3 | done |
| 6 | **Hardening (adversarial review).** UUID-validate ids (drop planted/flag-shaped ids; reject a non-UUID `--id` → no option-injection into the spawned doorbell); stat-gate the content read by the liveness window before opening files; `isFile` guard on the Claude scan; `--`-separator message parsing (no dropped `--`-words); `Number.isFinite` `--within` guard; head-read pop guard; refresh the MCP `initialize` instructions string; document the same-cwd self-pick limit. + 4 new self-test checks. | `plugins/session-relay/lib/discover.mjs`, `plugins/session-relay/skills/productivity/session-relay/scripts/relay.mjs`, `plugins/session-relay/mcp/bus.mjs`, `plugins/session-relay/skills/productivity/session-relay/SKILL.md`, `plugins/session-relay/test/selftest.mjs` | 1-5 | done |

## Interfaces & data shapes

- **`discover(opts) → row[]`**, `opts = { activeWithinMin=60, tool=null, excludeId=null, cwd=null, limit=50 }`.
  Row: `{ tool:'claude'|'codex', id, cwd, name|null, registered:bool, lastActivity:ISO, ageSec, active:bool }`, newest first (cwd match first when `cwd` given).
- **MCP tool `discover`** args `{ activeWithinMin?, tool? }` → `{ count, sessions:row[], note }`; self-excluded.
- **CLI:** `relay.mjs discover [--within <min>] [--tool t] [--exclude <id>] [--cwd <path>] [--json]`;
  `relay.mjs wake --id <id> --dir <cwd> --tool <claude|codex> [--] [message...]` (id must be a UUID; put a `--`-bearing message after a `--` separator).

## Acceptance criteria

- `node plugins/session-relay/test/selftest.mjs` → `PASS: session-relay self-test — 28 checks`.
- `node scripts/ci.mjs` → `✔ All ci.mjs checks passed`.
- **Live (this session):** a brand-new plugin-less `claude --session-id <U>` session in a temp dir was found by `relay.mjs discover --within 5` (`registered=false`, correct cwd read from content, 1 s old) and reached by `relay.mjs wake --id <U> --dir <dir> --tool claude -- "What is the codeword?"`, which replied with its own codeword — its own context. `discover` also surfaced a second genuinely-live Claude session in another project, ranked by recency.
- **Adversarial verification (this session):** a multi-lens review workflow (correctness / security-privacy / robustness / integration), each finding independently verified, confirmed 14 of 21 raw findings; the load-bearing ones (option-injection via planted id, full-history content reads, `--`-message corruption, directory-named-`.jsonl`, NaN `--within`, stale MCP instructions, head-read pop) are fixed in step 6 and covered by new self-test checks; the rest are documented limitations (see Known gotchas).

## Out of scope / do-NOT-touch

- Process-level liveness (`pgrep`) — mtime recency is the v1 signal; a PID→session map is not built.
- Auto-registering discovered sessions into the registry (would pollute it with dead entries) — discovery stays read-only; naming remains opt-in via `register`.
- The bus/store/hook wire formats — unchanged; this is additive.
- Pushing into a truly idle session without the doorbell — still not possible by design.

## Cold-handoff checklist

1. File manifest — yes (Steps name every path).
2. Environment & commands — yes (self-test + CI + the test-root env vars).
3. Interface & data contracts — yes (`discover` row shape, MCP args, CLI flags).
4. Executable acceptance — yes (self-test count, CI line, the live transcript).
5. Out of scope — yes (positively stated).
6. Decision rationale — yes (full-scan vs registry-only; auto-pick; content-read for cwd).
7. Known gotchas — yes (lossy dir-name encoding; bounded read; valueless-flag parsing).
8. Global constraints verbatim — N/A — no spec values beyond the store layouts captured in Context.
9. No undefined terms / forward refs — yes.

## Known gotchas

- Claude's cwd is NOT recoverable from the directory name (lossy `-` encoding) —
  always read it from file content; the self-test guards this with an
  underscore-bearing cwd that the dir name would mangle.
- `discover` exposes the ids + cwds of all local agent sessions to any caller —
  it's an information surface; treat the store and these paths as a local-trust
  boundary (already noted in the skill's untrusted-input gotcha).
- A just-idle session still appears (mtime within the window); a crafted session
  file could present an attacker-chosen cwd — the doorbell runs from that cwd, so
  it inherits the same local-trust assumption as the rest of the bus.
- **Same-cwd self-pick (documented limit, not fully fixed).** `discover`
  self-excludes via the per-dir cwd marker (`excludeId: selfId()`); when two
  sessions share one project dir, the marker holds only the most-recently-
  registered id, so the *older* caller can fail to exclude itself and — being the
  freshest same-cwd file — rank itself first. A true fix needs the host to hand
  the bus its own session id, which neither tool's MCP does. Mitigation: the skill
  tells the agent to check a candidate's `id` isn't its own (`whoami`) before
  waking, and to name sessions to disambiguate.
- **Session ids must be UUIDs.** `discover` drops any non-UUID id and `wake`
  rejects a non-UUID `--id`, so a planted/flag-shaped id can't reach the spawned
  doorbell's argv as an injectable option.

## Review

- **Goal met:** yes — the capability exists and runs: a live read-only `relay discover` found this very session (id `a65ddd8c…`, `cwd=/home/docks/projects/docks` read from file **content**, not the lossy dir name) with the spec row shape `{tool,id,cwd,name,registered,lastActivity,ageSec,active}`, no id and no prior registration required. All 6 steps landed; the implementation was ported Node→Rust (commit `08c400e`, releases through v0.6.0) — the goal is the capability, and it is met.
- **Regressions:** none. Scope note (renames, not gaps): 3 of 5 `affected_paths` — `lib/discover.mjs`, `mcp/bus.mjs`, `skills/.../scripts/relay.mjs` — were deleted and their behavior relocated to `rust/src/discover.rs`, `rust/src/bus.rs`, `rust/src/cli.rs`; `SKILL.md` (+138) and `test/selftest.mjs` (+590) remain and changed. Step-6 hardening all present in the port: UUID gate (discover.rs:237, cli.rs:92/347), window-before-content stat pass (discover.rs:211-220), `isFile` guard (discover.rs:145), head-read pop guard (discover.rs:76-78), `--` end-of-options doorbell (cli.rs:356-374), finite `--within` (cli.rs:126-130), MCP `discover` tool (bus.rs:72-77,317).
- **CI:** pass — not re-run here (5 concurrent reviews); orchestrator verified full `node scripts/ci.mjs` green at commit `e177040` this session, and the plugin's 62-check selftest ran green during today's session-relay v0.6.0 release.
- **Follow-ups:** none — optional hygiene only: repoint this plan's `affected_paths`/acceptance from the deleted `.mjs` surface to `rust/src/*.rs` before archiving.
- Filed by: plan-review on 2026-07-03T16:51:56-03:00

## Notes

- Adversarial verification was run as a multi-lens workflow (correctness /
  security-privacy / robustness / integration), each finding independently
  verified; results folded into the commit.
