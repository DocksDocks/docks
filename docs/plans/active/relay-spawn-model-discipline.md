---
title: relay spawn model/effort pinning + red-team pair-spawn pattern
goal: Give `relay spawn` explicit `--model`/`--effort` flags (per-tool argv mapping) so spawned workers never silently inherit a top-tier interactive default, encode model-discipline guidance in the session-relay skill, and document a two-worker red-team debate pattern (Codex gpt-5.5 xhigh vs Claude opus max) that writes into a plan-manager plan.
status: planned
created: "2026-07-06T19:26:49-03:00"
updated: "2026-07-06T19:26:49-03:00"
started_at: null
assignee: null
tags: [session-relay, spawn, model-discipline, red-team]
affected_paths:
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/bin/
related_plans: []
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
- **Placement decision (user, via open-question answer — see `## Open questions` until answered)**: recommended split — mechanism + tool-neutral guidance ship in session-relay; the *personal* model-ranking table (cost/intelligence/taste tiers) belongs in the consumer-side DocksDocks/public repo, per root AGENTS.md "What does NOT belong in this repo".
- **Binary stays model-name-neutral** (drafter decision): `--model`/`--effort` are verbatim pass-through — no model names or validation lists hardcoded in Rust. Model names churn; the skill body carries the current recommendations. Passing an invalid value fails visibly in the child's stderr spawn-log, which the birth-timeout error already names.
- **Live-verified flag facts (this session, 2026-07-06, claude 2.x / codex 0.142.x)**:
  - `claude --help` lists `--model <model>` and `--effort <level>`; invalid effort probe returned `Valid values: low, medium, high, xhigh, max`.
  - `codex exec --strict-config -c model_reasoning_effort=xhigh -s read-only -- "Reply with exactly: ok"` exited 0 and replied `ok` — the config key is accepted under strict config; `-m/--model` is in `codex exec --help`.
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
| 1 | `spawn.rs`: parse `--model`/`--effort` via `args.flag()`; extend `child_args()` — claude: append `--model <m>` / `--effort <e>` after the perm pair; codex: append `-m <m>` / `-c model_reasoning_effort=<e>` after `--sandbox`; update `USAGE`; add unit tests asserting both tools' argv with/without the flags (mirror `claude_argv_premints_id_and_never_sets_output_format` style, incl. flags stay before the `--` fence) | todo |
| 2 | `test/selftest.mjs`: extend the `spawn --dry` check (~line 597) with a case passing `--model M --effort E` for each tool, asserting the mapped argv appears in the `--dry` JSON | todo |
| 3 | SKILL.md: (a) spawn section — add model-discipline guidance + recommended pins (opus max / gpt-5.5 xhigh) + "never let an unsupervised child inherit a top-tier interactive default"; (b) add `--model`, `--effort` to the spawn flag list in `## Anti-hallucination` (line ~202); (c) new `## Red-team pair spawn` section per the Interfaces block below; (d) bump `metadata.updated`, run content-hash backfill | todo |
| 4 | `node scripts/ci.mjs --plugin session-relay` green (binary byte-compare warn-only locally is expected); commit code + skill | todo |
| 5 | Dispatch `build-binaries.yml`, download the 4 target binaries + launcher checksums, commit `bin/*` + `SHA256SUMS`; re-run ci green | todo |
| 6 | `node scripts/release.mjs --plugin session-relay minor`; verify tag + lockstep versions (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, marketplace catalogs via codex-plugin-mirror if prompted) | todo |

## Interfaces & data shapes

Flag mapping (step 1) — pass-through, no validation, omitted flag = omitted argv (today's behavior):

| relay spawn flag | claude child argv | codex child argv |
|---|---|---|
| `--model <m>` | `--model <m>` | `-m <m>` |
| `--effort <e>` | `--effort <e>` | `-c model_reasoning_effort=<e>` |

Red-team pattern (step 3c, skill prose — no new binary verbs):

1. Orchestrator scaffolds/holds a plan via plan-manager; adds `## Debate` with `### [a-team]` and `### [b-team]` subsections and states the question.
2. Spawn the pair (worker task prompt carries the **absolute plan path** and its own section marker, plus "edit ONLY your own section"):
   - `relay spawn <dir> --tool codex --model gpt-5.5 --effort xhigh --name a-team --reply-to <me> -- "<question + plan path + section rules>"`
   - `relay spawn <dir> --tool claude --model opus --effort max --name b-team --reply-to <me> -- "<same>"` — but **staggered**: spawn b-team only after a-team's first reply lands (sequential rounds).
3. Rounds: a-team writes its position → bus-reports to orchestrator → orchestrator `wake b-team` ("read [a-team], confirm or rebut in [b-team]") → b-team reports → (default 2 rounds, pending open question) → orchestrator writes `### Verdict`: agreements = confirmed conclusions; disagreements = open questions.
4. Guardrails ride the existing spawn prompt (branch-only, no prod mutations); section ownership is the only file-collision rule needed because rounds are sequential.

## Acceptance criteria

- `cargo test` in `plugins/session-relay/rust/` passes with the new argv unit tests; `cargo fmt --check` + `clippy -D warnings` clean.
- `bin/relay spawn /tmp --tool claude --model opus --effort max --dry -- t` (debug build ok for local check: `rust/target/debug/relay`) prints JSON whose `args` contains `["--model","opus","--effort","max"]` before the `--` fence; codex variant contains `["-m","gpt-5.5","-c","model_reasoning_effort=xhigh"]`.
- `bin/relay spawn /tmp --dry -- t` (no flags) prints argv **byte-identical** to today's shape — no default model injected.
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

Score: 88/100 · trajectory 88 · stopped: single pass (≤6 steps, no risk flag, first score ≥85). Weakest axis: goal coverage depends on three user placement/behavior choices — converted to open questions rather than guessed.

## Open questions

- id: placement
  choice: Where does each piece land?
  options:
    - split — mechanism + neutral guidance in session-relay; personal ranking table in DocksDocks/public (recommended)
    - everything in session-relay, including the ranking table
    - everything in DocksDocks/public; no session-relay changes
- id: missing-model-behavior
  choice: What should `relay spawn` do when `--model` is omitted?
  options:
    - print a one-line stderr note recommending a pin, then proceed (recommended — mirrors the existing no-`--tool` note)
    - hard error — refuse to spawn without an explicit --model
    - stay silent (today's behavior)
- id: redteam-rounds
  choice: Default debate length in the skill pattern?
  options:
    - 2 fixed rounds — position + rebuttal, then verdict (recommended)
    - orchestrator-judged — keep waking until convergence or budget
    - 1 round — parallel positions, orchestrator merges
- id: skill-names-models
  choice: Should the shipped skill name concrete models (opus / gpt-5.5)?
  options:
    - yes, as dated "current recommendation" examples with a check-your-tier-list caveat (recommended)
    - no — abstract wording only ("a deliberate mid-tier model"), concrete names live in consumer config

## Review

(placeholder — completion review writes here)
