---
title: relay token efficiency — usage visibility + wake discipline + lean boot (Claude & Codex)
goal: Make session-relay's subscription burn visible and bounded on BOTH tools — token-discipline rules in the skill (wake-model tiering, never doorbell the main session, fresh-spawn-over-long-wake, scoped nudges, batch-then-wake), a per-wake usage summary printed by the relay binary, and a researched lean-boot option for spawned/woken children.
status: planned
created: "2026-07-06T21:06:46-03:00"
updated: "2026-07-06T21:06:46-03:00"
started_at: null
assignee: null
tags: [session-relay, token-efficiency, codex, claude, wake, spawn]
affected_paths:
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/bin/
related_plans: [relay-spawn-model-discipline, plan-review-crosscheck]
review_status: null
planned_at_commit: "79aad728aa61a3cc534d6184ad370471651a7338"
---

# relay token efficiency — usage visibility + wake discipline + lean boot

## Goal

Session-relay wakes and spawns burn subscription usage invisibly, and the Claude side burns fastest (research-confirmed in [[relay-spawn-model-discipline]]: a `-p --resume` wake reprocesses the target's full transcript uncached whenever the git snapshot moved or the cache TTL lapsed). Three deliverables, each covering **both** tools:

1. **Skill token-discipline rules** — five usage rules stated once, cross-tool, in the session-relay skill.
2. **Per-wake usage visibility** — `relay wake` prints a one-line token summary after each doorbell turn, turning "it feels expensive" into a number.
3. **Lean boot (researched, then ship-or-document)** — measure what actually cuts a child's fixed boot cost per tool; ship a flag only if the measurement justifies it.

## Context & rationale

- **User request 2026-07-06**: "be aware if we are being token efficient with these session relays, mainly in claude… can you spot anyway to improve this experience?" — follow-up scaffolded for both Claude and Codex.
- **Grounding from the parent plan (all live-verified 2026-07-06)**: no `--max-turns` on the Claude CLI (prompt scoping is the only turn bound); `ANTHROPIC_API_KEY` unset on this machine (subscription billing); wake/spawn `--model`/`--effort` flags exist as of the parent plan's merge; codex-first default shipped (`resolve_spawn_tool` in `spawn.rs`).
- **The five rules (deliverable 1) — decided content, not open**:
  1. *Tier the wake model by purpose*: ack/drain-only wakes run cheap (Claude example `--model sonnet --effort low`; Codex example `--effort low`); decision-needing wakes run the deliberate tier (opus max / gpt-5.5 xhigh). Dated-example caveat style from the parent plan applies.
  2. *Never doorbell the main/interactive session*: workers reply via `send` (free file write, drained at the next user turn / Monitor watch). A 1M-context main session woken headlessly can reprocess its whole transcript.
  3. *Fresh spawn beats waking a long transcript*: wake cost scales with target history, spawn cost is ~fixed boot. Continue existing context → wake; new task → fresh short-lived worker.
  4. *Scope every wake nudge*: end with "reply over the bus and stop — do not start new work". No CLI turn cap exists; the prompt is the cap.
  5. *Batch sends, wake once*: `send` costs nothing; each wake costs boot + transcript.
- **Usage-line (deliverable 2) principle**: the doorbell already captures the child's stdout. Claude `--output-format json` carries usage fields; Codex `--json` emits JSONL events carrying token counts. Exact field names are **step 1's job to verify with live probes** — do not code against remembered shapes. The summary prints to **stderr** (stdout pass-through must stay byte-identical for callers parsing the reply), and a parse failure degrades silently to today's behavior.
- **Lean boot (deliverable 3) is measure-first**: candidate levers — Claude `--strict-mcp-config` (skip MCP servers), `--setting-sources` (skip project settings/plugins); Codex `--ignore-user-config`. A flag ships ONLY if measurement shows a worthwhile cut (defined in step 4); otherwise the finding lands as skill guidance ("what's not worth it" is a valid outcome).
- **Release coupling**: if session-relay v0.7.0 is still unreleased when this plan's binary work lands, both can ship in one release; otherwise this is v0.8.0. Binary discipline identical to the parent plan (workflow-built binaries only).

## Environment & how-to-run

- Same as the parent plan: `cargo fmt --check` / `clippy -- -D warnings` / `cargo test` from `plugins/session-relay/rust/`; `node scripts/ci.mjs --plugin session-relay` from repo root (local binary-digest warn expected after source edits); selftest via `node plugins/session-relay/test/selftest.mjs`; skill hash via `node scripts/skills/content-hash.mjs --backfill plugins/session-relay/skills`.
- Live probes bill subscriptions — keep them tiny ("Reply with exactly: ok") and run each once, capturing output to a fixture file under the plan's Notes for the Rust unit tests.

## Steps

| # | Step | Status |
|---|---|---|
| 1 | Verify usage-output shapes with one tiny live probe per tool: `claude -p --model sonnet --effort low --output-format json -- "Reply with exactly: ok"` → record the exact `usage` / cost field names + a sanitized fixture; `codex exec -s read-only -m gpt-5.5 -c model_reasoning_effort=low --json -- "Reply with exactly: ok"` → record which JSONL event carries token counts + fixture. Paste both shapes into `## Notes` before writing any Rust | todo |
| 2 | Rust usage summary in the wake path (`cli.rs`, after the doorbell `Command` output is captured): parse per step-1 shapes, print one stderr line `[relay wake] <tool>: <in> in (<cached> cached) / <out> out[, $<cost>]`; stdout pass-through byte-identical; parse failure → no line, no error. Unit tests feed the step-1 fixtures | todo |
| 3 | SKILL.md: add a `## Token discipline` section with the five rules (cross-tool wording, dated model examples, one BAD/GOOD wake pair); bump `metadata.updated`, refresh hash | todo |
| 4 | Lean-boot measurement (both tools, from a scratch dir): run the step-1 claude probe 3× each — baseline, `--strict-mcp-config`, `--setting-sources user` — and compare `usage` input tokens; same for codex baseline vs `--ignore-user-config` via its token event. Decision gate: any lever cutting ≥25% of the child's fixed input tokens ships as a `--lean` pass-through on spawn+wake (per-tool mapping recorded in Interfaces before coding); below that, record numbers in `## Notes` and fold the finding into the skill section instead | todo |
| 5 | selftest: fixture-driven checks for the usage line (fake child echoing a canned JSON reply via `RELAY_SPAWN_CMD_*`-style stub) and, if `--lean` ships, `--dry` argv assertions per tool | todo |
| 6 | `node scripts/ci.mjs --plugin session-relay` green; dispatch `build-binaries.yml`, commit workflow binaries + `SHA256SUMS`; version bump rides the next session-relay release (with 0.7.0 if unshipped, else 0.8.0) — release itself needs explicit user authorization | todo |

## Interfaces & data shapes

Usage line (stderr, one line, best-effort):

```
[relay wake] claude: 142310 in (3200 cached) / 1180 out, $0.9421
[relay wake] codex: 17186 in / 412 out
```

Lean-flag mapping (ONLY if step 4's gate passes; exact flags fixed by step 4's measurements):

| relay flag | claude argv (candidates) | codex argv (candidate) |
|---|---|---|
| `--lean` | `--strict-mcp-config` and/or `--setting-sources <winning subset>` | `--ignore-user-config` |

## Acceptance criteria

- Step-1 fixtures recorded verbatim in `## Notes` (both tools) before any parsing code exists.
- With a stubbed child returning the claude fixture: `relay wake … 2>&1` shows the `[relay wake] claude: …` line on stderr AND stdout is byte-identical to the stub's output. Same for the codex fixture. Stub returning garbage → no usage line, exit code unchanged.
- SKILL.md `## Token discipline` present with all five rules; `content-hash --check-only` clean; skill still scores ≥ the productivity floor via the repo gate.
- Step 4 outcome recorded either way: shipped `--lean` mapping + `--dry` argv proof, or measured numbers + "not worth a flag" note in `## Notes` and the skill.
- `cargo test` + selftest + `node scripts/ci.mjs --plugin session-relay` green.

## Out of scope / do-NOT-touch

- No changes to `send`/`inbox`/`watch` paths — they are already token-free or codex-side.
- No auto-tiering in the binary (guessing wake intent belongs to the agent via the skill, not to Rust).
- No personal config (env vars, dotfiles) — consumer-side, DocksDocks/public.
- Release execution (public tag) stays user-authorized, per the parent plan's precedent.

## Cold-handoff checklist

- [x] File manifest with exact paths — Steps + affected_paths
- [x] Environment & commands with flags — Environment + step commands verbatim
- [x] Interface/data contracts — usage-line format + lean mapping table (gated)
- [x] Executable acceptance — stub-driven wake checks, hash check, ci gate
- [x] Out-of-scope — above
- [x] Decision rationale — Context (stderr-not-stdout, measure-first lean gate, five rules fixed)
- [x] Known gotchas — stdout must stay byte-identical; probes bill subscriptions (keep tiny); field names verified not remembered; binary discipline
- [x] Global constraints verbatim — binary release order inherited by reference to the parent plan's Environment (same file tree)
- [x] No undefined/forward terms — lean flags explicitly gated on step 4

## Self-review

Score: 87/100 · trajectory 87 · stopped: single pass (6 steps, no risk flag, ≥85). Cross-check: pending — codex red-team runs after this draft commits; its findings will be ingested here attributed.

## Notes

(step-1 fixtures and step-4 measurements land here)

## Review

(placeholder — completion review writes here)
