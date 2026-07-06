---
title: relay spawn model/effort pinning + red-team pair-spawn pattern
goal: Give `relay spawn` AND `relay wake` explicit `--model`/`--effort` flags (per-tool argv mapping) so spawned workers and doorbell wakes never silently run on the top-tier interactive default (Fable), encode a never-Fable model-discipline rule in the session-relay skill, and document a two-worker red-team debate pattern (Codex gpt-5.5 xhigh vs Claude opus max) that writes into a plan-manager plan.
status: ongoing
created: "2026-07-06T19:26:49-03:00"
updated: "2026-07-06T20:13:55-03:00"
started_at: "2026-07-06T20:05:55-03:00"
assignee: relay-md-worker (codex, via session-relay)
tags: [session-relay, spawn, model-discipline, red-team]
affected_paths:
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/bin/
related_plans: [plan-review-crosscheck]
review_status: null
planned_at_commit: "be438d6bb890e541efce42990ba952e76d662cf5"
---

# relay spawn model/effort pinning + red-team pair-spawn pattern

## Goal

`relay spawn` currently builds the child argv with **no model or effort control** (`plugins/session-relay/rust/src/spawn.rs`, `child_args()` ~line 98) — a spawned Claude child inherits the user's default model. On this machine that default is Fable: an unsupervised, detached worker burning Mythos-tier tokens with nobody watching its output. Fix in three parts:

1. **Mechanism** — `--model <m>` and `--effort <e>` flags on `relay spawn`, mapped per tool (both verified live 2026-07-06, see Context).
2. **Skill guidance** — the session-relay SKILL.md spawn section gains a model-discipline rule: spawned workers run unsupervised; always pin a deliberate, cheaper model explicitly (recommended: Claude child `--model opus --effort max`; Codex child `--model gpt-5.5 --effort xhigh`).
3. **Red-team pair spawn** — a documented pattern: orchestrator holds a plan (via plan-manager), spawns one Codex and one Claude worker, each owns a `[a-team]` / `[b-team]` section of the plan's Debate block, rounds run **sequentially over the bus** (never simultaneous writes to one file), orchestrator synthesizes the verdict.

## Context & rationale

- **User request 2026-07-06**, inspired by Theo's model-tiering CLAUDE.md tweet (x.com/theo/status/2072482460122964067): spawned sessions should not run Fable; prefer opus effort=max, and support a gpt-5.5-xhigh + opus-max red-team pair that debates into a plan file.
- **User decisions (picker, 2026-07-06)**: (1) **Placement: split** — mechanism + tool-neutral guidance ship in session-relay; the *personal* model-ranking table (cost/intelligence/taste tiers) goes to consumer-side DocksDocks/public, per root AGENTS.md "What does NOT belong in this repo". (2) **Missing `--model`: stderr nudge** — one-line note recommending an explicit pin, then proceed (mirrors the existing "no --tool given" note; non-breaking). (3) **Red-team default: 2 fixed rounds** — position + rebuttal, then verdict. (4) **Skill names concrete models** as dated "current recommendation" examples (opus max / gpt-5.5 xhigh) with a check-your-own-tier-list caveat.
- **Follow-up (user, 2026-07-06)**: fold this pattern into the plan lifecycle as an optional "review this plan with codex + claude?" gate — separate plan [[plan-review-crosscheck]] (docks plugin).
- **Scope extension (user, 2026-07-06)**: `relay wake` gets the same `--model`/`--effort` pass-through as spawn, and the skill gets an explicit **never-Fable rule** for relay children and wakes. Rationale (research-confirmed, see docs/en/prompt-caching): a `-p --resume` doorbell wake reprocesses the target's ENTIRE transcript; the system prompt embeds the git-status snapshot, so any commit since the target's last turn breaks the cache prefix and the wake bills as fully uncached input — the docs call the first turn back into a long session "the most expensive request you send". Today's wake argv (`cli.rs`, `wake` arm) passes no model flag, so every wake runs the user default = Fable at that worst-case cost. `codex exec resume --help` confirms `-m`/`-c` are accepted on the resume subcommand (verified live 2026-07-06).
- **Binary stays model-name-neutral** (drafter decision): `--model`/`--effort` are verbatim pass-through — no model names or validation lists hardcoded in Rust. Model names churn; the skill body carries the current recommendations. Passing an invalid value fails visibly in the child's stderr spawn-log, which the birth-timeout error already names.
- **Live-verified flag facts (this session, 2026-07-06, claude 2.x / codex 0.142.x)**:
  - `claude --help` lists `--model <model>` and `--effort <level>`; invalid effort probe returned `Valid values: low, medium, high, xhigh, max`.
  - `codex exec --strict-config -c model_reasoning_effort=xhigh -s read-only -- "Reply with exactly: ok"` exited 0 and replied `ok` — the config key is accepted under strict config; `-m/--model` is in `codex exec --help`.
- **Codex-first delegation (user, 2026-07-06)**: the user's ChatGPT subscription has more headroom than Claude's, so delegated workers should default to Codex. Machine fact: `~/.codex/config.toml` already sets `model = "gpt-5.5"` + `model_reasoning_effort = "xhigh"` (verified 2026-07-06), so codex children get the right pins even before the flags land. The plugin ships the **mechanism**, not the preference: a `RELAY_SPAWN_TOOL` env default (claude|codex) consulted when `--tool` is omitted — same precedent as the existing `RELAY_SPAWN_CMD_CLAUDE`/`RELAY_SPAWN_CMD_CODEX` overrides in `spawn.rs` — plus skill guidance to honor a standing user preference without asking. The user's own `RELAY_SPAWN_TOOL=codex` setting belongs in their consumer config (DocksDocks/public follow-up); the docks-project preference is recorded in session memory.
- **No CLI turn cap exists** (verified 2026-07-06: `claude --help` has no `--max-turns`; it's an Agent-SDK-only option, and `--max-budget-usd` only applies to API billing, not subscriptions). Skill guidance must NOT recommend `--max-turns`; the practical cost bound for a wake is model/effort pins + a narrow doorbell nudge ("drain inbox, reply, stop"). Machine check 2026-07-06: `ANTHROPIC_API_KEY` unset — wakes/spawns bill the subscription, as required.
- **Why sequential debate rounds**: two detached workers doing read-modify-write on one plan file will clobber each other; there is no file lock. Turn-taking over the bus (A writes → reports → orchestrator wakes B) is both safe and what makes it a debate instead of two monologues.
- **No cli.rs changes needed**: `Args::positionals()` (`rust/src/cli.rs:54-72`) auto-skips the value of any `--flag` not in `BOOL_FLAGS` — `--model x`/`--effort y` parse correctly with zero parser edits. Do NOT add them to `BOOL_FLAGS`.

## Environment & how-to-run

- Repo: `/home/docks/projects/docks`, branch `main`. Node 24 via corepack/pnpm already set up.
- Rust: toolchain pinned by `plugins/session-relay/rust/rust-toolchain.toml`; run `cargo test`, `cargo fmt --check`, `cargo clippy -- -D warnings` from `plugins/session-relay/rust/`.
- Full gate: `node scripts/ci.mjs --plugin session-relay` (repo root). **Expected local warn** on the host-leg binary byte-compare after source edits — binaries are refreshed only by step 5's workflow; that warn is not a failure locally.
- Selftest alone: `node plugins/session-relay/test/selftest.mjs`.
- Skill hash: `node scripts/skills/content-hash.mjs --backfill plugins/session-relay/skills` after any SKILL.md edit.
- Release order (verbatim from `plugins/session-relay/AGENTS.md`): merge code → dispatch `.github/workflows/build-binaries.yml` (workflow_dispatch) → download artifacts, commit binaries + refreshed `SHA256SUMS` → `node scripts/ci.mjs` green → `node scripts/release.mjs --plugin session-relay minor` (0.6.0 → 0.7.0). **Never commit a locally built binary.**

## Steps

| # | Step | Status |
|---|---|---|
| 1 | `--model`/`--effort` pass-through in BOTH verbs. **spawn** (`spawn.rs`): parse via `args.flag()`; extend `child_args()` — claude: append `--model <m>` / `--effort <e>` after the perm pair; codex: append `-m <m>` / `-c model_reasoning_effort=<e>` after `--sandbox`; when `--model` is omitted, print a one-line stderr nudge recommending an explicit pin (same style as the no-`--tool` note) and proceed. **wake** (`cli.rs`, `"wake"` arm): same two flags — claude argv gains `--model <m>` / `--effort <e>` after `--resume <id>`; codex argv gains `-m <m>` / `-c model_reasoning_effort=<e>` after the resume id; same stderr nudge when omitted. Also in spawn: when `--tool` is omitted, consult `RELAY_SPAWN_TOOL` (must be `claude` or `codex`; anything else dies with the valid values) before the existing claude-with-note fallback. Update both USAGE strings; unit tests assert both tools × both verbs' argv with/without flags (flags stay before the `--` fence; no-flag argv byte-identical to today) + the env-default resolution order (flag > env > claude+note) | done |
| 2 | `test/selftest.mjs`: extend the `spawn --dry` check (~line 597) AND the wake `--dry` path with cases passing `--model M --effort E` for each tool, asserting the mapped argv appears in the `--dry` JSON | done |
| 3 | SKILL.md: (a) model-discipline guidance covering **spawn AND wake** — a `<constraint>`-grade rule: relay children and doorbell wakes run unsupervised and reprocess full transcripts; ALWAYS pin `--model`/`--effort`; **never Fable / the top interactive tier** for a relay child or wake; recommended pins as dated current-recommendation examples (`--model opus --effort max` / `--model gpt-5.5 --effort xhigh`, "as of 2026-07 — check your own tier list"); (b) add `--model`, `--effort` to BOTH the `relay wake` and `relay spawn` flag lists in `## Anti-hallucination`; (c) new `## Red-team pair spawn` section per the Interfaces block below; (d) rewrite the "Ask the tool first" spawn rule: when a standing tool preference exists (`RELAY_SPAWN_TOOL` env, user config, or session memory), use it WITHOUT asking; ask only when no preference is discoverable; (e) bump `metadata.updated`, refresh the content hash per the skills gate | done |
| 4 | `node scripts/ci.mjs --plugin session-relay` green (binary byte-compare warn-only locally is expected); commit code + skill | done |
| 5 | Dispatch `build-binaries.yml`, download the 4 target binaries + launcher checksums, commit `bin/*` + `SHA256SUMS`; re-run ci green | done |
| 6 | `node scripts/release.mjs --plugin session-relay minor`; verify tag + lockstep versions (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, marketplace catalogs via codex-plugin-mirror if prompted) | todo — awaiting user authorization (publishes a public release; auto-mode denied 2026-07-06) |

## Interfaces & data shapes

Flag mapping (step 1, identical for `spawn` and `wake`) — pass-through, no validation, omitted flag = omitted argv (today's shape) + stderr nudge:

| relay flag | claude argv | codex argv |
|---|---|---|
| `--model <m>` | `--model <m>` | `-m <m>` |
| `--effort <e>` | `--effort <e>` | `-c model_reasoning_effort=<e>` |

Effort vocab differs per tool and is passed verbatim: claude accepts `low, medium, high, xhigh, max` (live probe 2026-07-06); codex `model_reasoning_effort` accepts `xhigh` (verified under `--strict-config`).

Red-team pattern (step 3c, skill prose — no new binary verbs):

1. Orchestrator scaffolds/holds a plan via plan-manager; adds `## Debate` with `### [a-team]` and `### [b-team]` subsections and states the question.
2. Spawn the pair (worker task prompt carries the **absolute plan path** and its own section marker, plus "edit ONLY your own section"):
   - `relay spawn <dir> --tool codex --model gpt-5.5 --effort xhigh --name a-team --reply-to <me> -- "<question + plan path + section rules>"`
   - `relay spawn <dir> --tool claude --model opus --effort max --name b-team --reply-to <me> -- "<same>"` — but **staggered**: spawn b-team only after a-team's first reply lands (sequential rounds).
3. Rounds — **default 2 fixed** (user decision): round 1 = a-team position, b-team confirm/rebut; round 2 = a-team response, b-team close. Each turn: worker writes its section → bus-reports to orchestrator → orchestrator wakes the other. Then orchestrator writes `### Verdict`: agreements = confirmed conclusions; disagreements = open questions.
4. Guardrails ride the existing spawn prompt (branch-only, no prod mutations); section ownership is the only file-collision rule needed because rounds are sequential.

## Acceptance criteria

- `cargo test` in `plugins/session-relay/rust/` passes with the new argv unit tests; `cargo fmt --check` + `clippy -D warnings` clean.
- `bin/relay spawn /tmp --tool claude --model opus --effort max --dry -- t` (debug build ok for local check: `rust/target/debug/relay`) prints JSON whose `args` contains `["--model","opus","--effort","max"]` before the `--` fence; codex variant contains `["-m","gpt-5.5","-c","model_reasoning_effort=xhigh"]`.
- `bin/relay wake --id <uuid> --dir /tmp --tool claude --model opus --effort max --dry` prints argv containing `["--model","opus","--effort","max"]` after `--resume <id>`; codex variant contains `["-m","gpt-5.5","-c","model_reasoning_effort=xhigh"]` after the resume id.
- `bin/relay spawn /tmp --dry -- t` and `bin/relay wake <who> --dry` with no model flags print argv **byte-identical** to today's shape — no default model injected by the binary.
- `RELAY_SPAWN_TOOL=codex bin/relay spawn /tmp --dry -- t` resolves `"tool":"codex"` with no stderr note; `RELAY_SPAWN_TOOL=bogus …` dies naming the valid values; unset env + no `--tool` keeps today's claude-with-note behavior.
- `node plugins/session-relay/test/selftest.mjs` → PASS including the new --dry cases.
- SKILL.md: spawn section names the two recommended pins; Anti-hallucination flag list includes `--model`/`--effort`; `## Red-team pair spawn` section present; `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills` clean.
- `node scripts/ci.mjs --plugin session-relay` green after step 5; release tag `session-relay--v0.7.0` exists after step 6.

## Out of scope / do-NOT-touch

- **Personal model-ranking table** (Theo-style cost/intelligence/taste tiers, "never Haiku") — goes to DocksDocks/public as a follow-up task there, NOT into any shipped skill.
- No new relay verbs (no `relay debate`/`relay pair`); the red-team pattern is skill prose over existing spawn/send/wake.
- No default model baked into the binary; no validation of model/effort values in Rust.
- `docks` plugin version untouched — session-relay is self-versioned.
- Do not edit `bin/*` binaries outside step 5's workflow-artifact path (binary release discipline, see AGENTS.md constraint).

## Cold-handoff checklist

- [x] File manifest with exact paths — Steps + affected_paths
- [x] Environment & commands with flags — Environment section, verbatim release order
- [x] Interface/data contracts — flag-mapping table + red-team round protocol
- [x] Executable acceptance — --dry argv strings, cargo/selftest/ci/content-hash commands
- [x] Out-of-scope — above
- [x] Decision rationale — Context (neutral binary, sequential rounds, placement split)
- [x] Known gotchas — local byte-compare warn; `positionals()` already handles value flags (don't touch BOOL_FLAGS); codex has no pre-set-id flag (irrelevant here but adjacent)
- [x] Global constraints verbatim — binary-release order quoted in Environment
- [x] No undefined/forward terms — all names are file paths or verified flags

## Self-review

Score: 88/100 · trajectory 88 · stopped: single pass (≤6 steps, no risk flag, first score ≥85). All four open questions answered via picker 2026-07-06 (all recommended options) and encoded into Context/Steps — none remain.

## Review

(placeholder — completion review writes here)
