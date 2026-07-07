---
title: relay token efficiency — usage visibility + wake discipline + lean boot (Claude & Codex)
goal: Make session-relay's subscription burn visible and bounded on BOTH tools — token-discipline rules in the skill (wake-model tiering, never doorbell the main session, fresh-spawn-over-long-wake, scoped nudges, batch-then-wake), a per-wake usage summary printed by the relay binary, and a researched lean-boot option for spawned/woken children.
status: blocked
created: "2026-07-06T21:06:46-03:00"
updated: "2026-07-06T23:09:31-03:00"
started_at: "2026-07-06T23:06:54-03:00"
assignee: relay-eff-worker (codex, via session-relay)
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
blocked_reason: "Step 1 STOP: Claude scratch -p session did not resume by id; orchestrator decision needed before any alternate probe shape."
blocked_since: "2026-07-06T23:09:31-03:00"
---

# relay token efficiency — usage visibility + wake discipline + lean boot

## Goal

Session-relay wakes and spawns burn subscription usage invisibly, and the Claude side burns fastest (research-confirmed in [[relay-spawn-model-discipline]]: a `-p --resume` wake reprocesses the target's full transcript uncached whenever the git snapshot moved or the cache TTL lapsed). Three deliverables, each covering **both** tools:

1. **Skill token-discipline rules** — five usage rules stated once, cross-tool, in the session-relay skill.
2. **Per-wake usage visibility** — `relay wake` prints a one-line token summary after each doorbell turn, turning "it feels expensive" into a number. **Wake only**: `relay spawn` children are detached with null stdout by design, so spawn burn is bounded by guidance + model pins, not measured (codex review finding 1).
3. **Lean boot (researched, then ship-or-document)** — measure what actually cuts a child's fixed boot cost per tool; ship a flag only if the measurement AND functional-safety probes justify it.

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
- **Release coupling**: decide with `git tag -l 'session-relay--v0.7.0'` — empty means 0.7.0 is unshipped and this work rides it; non-empty means this is v0.8.0. Binary discipline (verbatim from `plugins/session-relay/AGENTS.md`): merge code → dispatch `.github/workflows/build-binaries.yml` (workflow_dispatch) → `gh run download <id>` artifacts, commit the 4 `bin/relay-<triple>` binaries + rebuilt `SHA256SUMS` (concatenate the per-runner `SHA256SUMS-*.part` files) → `node scripts/ci.mjs` green → release only with explicit user authorization. **Never commit a locally built binary.**
- **Codex cross-check decisions (review 2026-07-06, all 10 findings accepted)**:
  - *Byte pass-through (finding 2)*: today's wake path runs child stdout through `String::from_utf8_lossy` and appends a missing newline — step 2 explicitly changes it to raw `stdout().write_all(&out.stdout)`, with no-trailing-newline and invalid-UTF-8 fixtures proving stdout is untouched.
  - *Wake test seam (finding 5)*: `doorbell_args` hardcodes the `claude`/`codex` commands — step 2 adds `RELAY_WAKE_CMD_CLAUDE`/`RELAY_WAKE_CMD_CODEX` env overrides mirroring the spawn ones, which is also what the selftest stubs use. Both names join the selftest `envFor` scrub list.
  - *Lean functional-safety gate (finding 3)*: `--setting-sources`/`--strict-mcp-config` can drop the session-relay plugin itself from the child — killing its SessionStart registration and inbox drain. Step 4's gate therefore requires BOTH the token cut AND functional probes: a lean-spawned child must still register on the bus within the birth timeout, and a lean wake must still drain a queued message.
  - *Probe argv fidelity (finding 4)*: usage shapes are captured from the REAL code-path argv — wake shapes via `claude -p --resume <scratch-session>` / `codex exec resume <scratch-thread>` on purpose-made tiny scratch sessions, not bare one-shots.
  - *Fixtures (finding 6)*: checked-in files at `plugins/session-relay/test/fixtures/wake-usage-{claude,codex}.json`, captured verbatim then redacted ONLY of message text and machine paths (token/cost fields and structure stay exact); Rust unit tests embed them via `include_str!`.
  - *`relay watch --auto-turn` (finding 7)*: it DOES bill the ChatGPT subscription (app-server turns) — explicitly out of scope here because it is codex-billed and turn-scoped by design, not because it is free.
  - *`--lean` touchpoints (finding 8, refined by the 2nd review)*: `--lean` applies to **both verbs** — threaded through `child_args` in `spawn.rs` (spawn) AND `doorbell_args` in `cli.rs` (wake), matching the functional probes which exercise both paths. The flag is boolean — `BOOL_FLAGS` in `cli.rs` is a fixed-size array (`[&str; 7]` today) so adding `"lean"` requires bumping the size annotation to 8, or the build fails. Usage surfaces are THREE, not two: the `USAGE` const in `spawn.rs`, the inline wake usage string in `cli.rs`'s die call, and the top-level usage line in `main.rs`. Plus: `--dry` JSON assertions per tool per verb, the skill's Anti-hallucination flag lists, and the selftest env scrub list.
  - *Measurement spec (finding 9)*: per variant take the MEDIAN of 3 runs, each from a fresh scratch cwd (cold cache), fixed run order baseline→lever1→lever2, `claude --version`/`codex --version` recorded in Notes; ship gate = ≥25% relative AND ≥5,000 absolute input-token cut on the median.

## Environment & how-to-run

- Same as the parent plan: `cargo fmt --check` / `clippy -- -D warnings` / `cargo test` from `plugins/session-relay/rust/`; `node scripts/ci.mjs --plugin session-relay` from repo root (local binary-digest warn expected after source edits); selftest via `node plugins/session-relay/test/selftest.mjs`; skill hash via `node scripts/skills/content-hash.mjs --backfill plugins/session-relay/skills`.
- Live probes bill subscriptions — keep them tiny ("Reply with exactly: ok") and run each once, capturing output to a fixture file under the plan's Notes for the Rust unit tests.

## Steps

| # | Step | Status |
|---|---|---|
| 1 | Capture usage-output shapes from the REAL code-path argv. Claude: `claude -p --session-id <new-uuid> -- "say ok"` in a scratch dir, then `claude -p --resume <that-id> --model sonnet --effort low --output-format json -- "Reply with exactly: ok"` — `-p` sessions ARE resumable by id (documented in the session-relay SKILL's Anti-hallucination section: "`-p`/SDK sessions aren't in the picker but are resumable by id — exactly how the doorbell reaches them"); if the resume nonetheless fails, STOP per STOP conditions. Codex: `codex exec -s read-only -c model_reasoning_effort=low --json -- "say ok"`, extract the thread id from the **`thread.started` event** in the JSONL stream (the id also appears in the rollout filename and equals the hook's `session_id` — same source, session-relay SKILL Cross-tool section), then `codex exec resume <thread-id> --json -- "Reply with exactly: ok"`. Commit redacted-per-policy captures as `plugins/session-relay/test/fixtures/wake-usage-claude.json` + `wake-usage-codex.json`; record field names + CLI versions in `## Notes` before writing any Rust | blocked |
| 2 | Rust wake changes in `cli.rs`: (a) replace the lossy stdout echo with raw `stdout().write_all(&out.stdout)` (byte pass-through, no newline mutation); (b) add `RELAY_WAKE_CMD_CLAUDE`/`RELAY_WAKE_CMD_CODEX` env overrides in `doorbell_args`' command choice; (c) parse the captured stdout per step-1 shapes and print one stderr line `[relay wake] <tool>: <in> in (<cached> cached) / <out> out[, $<cost>]`; parse failure → no line, exit code and stdout unchanged. Unit tests `include_str!` the step-1 fixtures + no-trailing-newline and invalid-UTF-8 stdout cases | todo |
| 3 | SKILL.md: add a `## Token discipline` section with the five rules (cross-tool wording, dated model examples, one BAD/GOOD wake pair); bump `metadata.updated`, refresh hash | todo |
| 4 | Lean-boot measurement per the Context spec (median of 3, fresh scratch cwd each run, fixed order, versions recorded): claude baseline vs `--strict-mcp-config` vs `--setting-sources user`; codex baseline vs `--ignore-user-config`. Ship gate = ≥25% relative AND ≥5k absolute median input-token cut AND the functional-safety probes pass (lean child registers on the bus within birth timeout; lean wake drains a queued message). If shipped: `--lean` per-tool mapping recorded in Interfaces first, `BOOL_FLAGS` entry, both USAGE strings + `main.rs` usage, skill flag lists, selftest scrub list. If not: medians + verdict in `## Notes` and one line in the skill section | todo |
| 5 | selftest: wake usage-line checks via `RELAY_WAKE_CMD_*` stubs echoing the committed fixtures (assert stderr line present AND stdout byte-identical to stub output, incl. the no-trailing-newline case); garbage-stdout stub → no usage line, same exit; if `--lean` shipped, `--dry` argv assertions per tool | todo |
| 6 | `node scripts/ci.mjs --plugin session-relay` green; then the binary + release flow exactly as inlined in Context ("Release coupling") — version decided by `git tag -l 'session-relay--v0.7.0'`; the public release step needs explicit user authorization | todo |

## Interfaces & data shapes

Usage line (stderr, one line, best-effort). **Omission rule**: the `(<n> cached)` segment renders only when the parsed payload carries a cached-tokens field, and `, $<cost>` only when a cost field is present — never render zero-placeholders like `(0 cached)` or a bare `$` (codex payloads typically lack both):

```
[relay wake] claude: 142310 in (3200 cached) / 1180 out, $0.9421
[relay wake] codex: 17186 in / 412 out
```

Lean-flag mapping (ONLY if step 4's gate passes; exact flags fixed by step 4's measurements):

| relay flag | claude argv (candidates) | codex argv (candidate) |
|---|---|---|
| `--lean` | `--strict-mcp-config` and/or `--setting-sources <winning subset>` | `--ignore-user-config` |

## STOP conditions

- Step 1: the scratch claude session does not resume by id (contradicting the documented doorbell behavior), OR no `thread.started` id can be extracted from the codex `--json` stream → STOP and report to the user with the raw output; do not improvise alternate probe shapes (each retry bills the subscription).
- Step 2a (stdout echo change): if any selftest byte-identity assertion fails against real-CLI output shapes after the raw `write_all` switch, revert the echo commit and STOP — callers may depend on behavior the fixtures didn't capture.
- Step 4: any lean variant that fails a functional-safety probe (child fails to register / wake fails to drain) is disqualified immediately regardless of its token cut — never ship a lever that breaks the bus.

## Acceptance criteria

- Step-1 fixtures committed at `plugins/session-relay/test/fixtures/wake-usage-{claude,codex}.json` (field structure verbatim, redaction per policy) with field names + CLI versions in `## Notes`, before any parsing code exists.
- With a `RELAY_WAKE_CMD_*` stub returning the claude fixture: `relay wake …` shows the `[relay wake] claude: …` line on stderr AND stdout is **byte-identical** to the stub's output (proven for a no-trailing-newline payload). Same for the codex fixture. Stub returning garbage → no usage line, exit code unchanged.
- SKILL.md `## Token discipline` present with all five rules; `content-hash --check-only` clean; skill still scores ≥ the productivity floor via the repo gate.
- Step 4 outcome recorded either way: shipped `--lean` mapping + `--dry` argv proof, or measured numbers + "not worth a flag" note in `## Notes` and the skill.
- `cargo test` + selftest + `node scripts/ci.mjs --plugin session-relay` green.

## Out of scope / do-NOT-touch

- No changes to `send`/`inbox` (token-free file ops) or `watch` — note `watch --auto-turn` DOES bill the ChatGPT subscription; it stays out of scope because it is codex-billed and turn-scoped by design, not because it is free.
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

Score: 91/100 · trajectory 87→93→83→91 · stopped: after second external review (both external passes ingested).
Cross-check (2026-07-06): [codex gpt-5.5 xhigh, read-only, 161k tokens] 10 findings (4 high / 5 med / 1 low) — ALL accepted and encoded: spawn-visibility overreach narrowed (1), stdout byte pass-through made an explicit code change with UTF-8/newline fixtures (2), lean gate extended with functional-safety probes (3), probes moved to real resume argv (4), `RELAY_WAKE_CMD_*` test seam added (5), fixture paths + redaction policy fixed (6), watch-auto-turn rationale corrected (7), `--lean` touchpoints enumerated incl. `BOOL_FLAGS` (8), measurement statistic + absolute floor defined (9), release flow inlined verbatim (10). [claude] independently verified findings 2, 3, and 5 against `cli.rs`/`spawn.rs` before accepting.
Second pass (2026-07-06): [claude plan-review, fresh context] scored the post-codex draft 83/100 with 8 findings targeting exactly the axes codex didn't probe (failure mode, assumption→question) — ALL accepted: codex thread-id capture pinned to the `thread.started` event (1), claude `-p` resumability grounded in the shipped skill's documented doorbell behavior + STOP fallback (2), `--lean` surface fixed to both verbs with both builder functions named (3), usage surfaces corrected to three (4), `## STOP conditions` added incl. stdout-change revert trigger (5), `BOOL_FLAGS` fixed-size-array bump noted (6), usage-line omission rule stated (7), the two open assumptions resolved as evidence-plus-STOP rather than silent defaults (8). Release-coupling note: `session-relay--v0.7.0` now exists, so this ships as v0.8.0.

## Notes

- **2026-07-06T23:09:31-03:00 - STOP Step 1 (Claude resume by id failed):**
  - CLI versions checked before the probe: `claude --version` -> `2.1.202 (Claude Code)`; `codex --version` -> `codex-cli 0.142.5` (with a PATH-alias warning caused by the read-only sandbox).
  - Scratch directory: `/tmp/relay-token-efficiency/claude-39c0c666-3336-4701-be05-2a40ecc1fb52`.
  - Seed command: `claude -p --session-id 39c0c666-3336-4701-be05-2a40ecc1fb52 -- "say ok"` returned exit code 0 and stdout `ok`.
  - Required resume command: `claude -p --resume 39c0c666-3336-4701-be05-2a40ecc1fb52 --model sonnet --effort low --output-format json -- "Reply with exactly: ok"` returned exit code 1 with raw stderr:

    ```text
    No conversation found with session ID: 39c0c666-3336-4701-be05-2a40ecc1fb52
    ```

  - This matches the Step 1 STOP condition, so no alternate probe shape was attempted and steps 2-5 were not started.

## Review

(placeholder — completion review writes here)
