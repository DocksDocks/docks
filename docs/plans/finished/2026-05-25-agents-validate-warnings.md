---
title: Resolve plugin-validate warnings from the agents/ context-tree node
goal: Eliminate (or formally accept) the "No frontmatter" warnings claude plugin validate/tag emit for agents/AGENTS.md + CLAUDE.md, which fail validate --strict.
status: finished
created: "2026-05-25T00:00:00-03:00"
updated: "2026-05-25T00:00:00-03:00"
started_at: "2026-05-25T00:00:00-03:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: 911210634fcc26599e0cbee49165cd0bf3a35754
tags: [ci, plugin, context-tree, validate, low-priority]
affected_paths:
  - plugins/docks/agents/AGENTS.md
  - plugins/docks/agents/CLAUDE.md
  - plugins/docks/.claude-plugin/plugin.json
  - AGENTS.md
related_plans: []
review_status: passed
---

# Resolve plugin-validate warnings from the agents/ context-tree node

## Goal

`claude plugin validate ./plugins/docks` and `claude plugin tag` (run by
`release.sh` on every release) emit two warnings:

```
Validating agent: .../plugins/docks/agents/AGENTS.md
  ❯ frontmatter: No frontmatter block found.
Validating agent: .../plugins/docks/agents/CLAUDE.md
  ❯ frontmatter: No frontmatter block found.
```

The plugin's agent loader auto-discovers **every** `*.md` in `agents/` as a
subagent. Two of those files are not agents — they are the context-tree node
(`AGENTS.md` authoring doc + `CLAUDE.md` `@AGENTS.md` import) required as a pair
by `guard-tree.sh`. Success = those two warnings no longer appear (so
`claude plugin validate --strict` passes), OR the warnings are formally accepted
with the stale supporting docs corrected — and `guard-tree.sh` + `ci.sh` stay
green either way.

## Context

Surfaced during the v0.4.1 release: `claude plugin tag` printed the warnings on
every run. They are **non-blocking today** — `validate`/`tag` exit 0, and CI's
`claude plugin validate` (no `--strict`) passes. The runtime *tolerates* the
files (confirmed: `validate --strict --help` says it fails on "issues that the
runtime tolerates"). So consumers do **not** get broken agents.

The one real risk: `claude plugin validate --strict` **fails** on these warnings
(verified, exit 1). The `--strict` help text recommends it "in CI to fail on …
issues the runtime tolerates," so the repo cannot adopt that hardening until this
is resolved. This is the entire reason the item is worth a plan rather than being
ignored — severity is otherwise **low**.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Decide approach: **A** accept+document · **B** remove agents/ node, fold authoring into root AGENTS.md · **C** experiment: declare agents via a manifest subdir (mirror skills) to keep a clean agents/ node | — | — | done | user |
| 2 | (C-first) Spike: move the 2 agent files into `agents/<subdir>/`, declare that subdir in plugin.json `agents`, run `claude plugin validate --strict` — does `agents/AGENTS.md` (now above the scanned path) stop warning? | 1 | — | done | self |
| 3 | (B fallback, if C fails) Migrate agent-authoring content from `agents/AGENTS.md` into root `AGENTS.md` ("Authoring agents" section); delete `agents/AGENTS.md` + `agents/CLAUDE.md` | 2 | — | done | self |
| 4 | Update root `AGENTS.md` context-tree table to match the chosen layout (drop or relocate the `agents/` node row) | 2 | with #3 | done | self |
| 5 | Correct the premise about the manifest `agents` field — resolved by deleting `agents/AGENTS.md`; `validate --strict` proved the array is **rejected** (`agents: Invalid input`), see Notes | 1 | — | done | self |
| 6 | Verify: `claude plugin validate --strict ./plugins/docks` passes (0 warnings, or documented for option A) · `bash scripts/guard-tree.sh` passes · `bash scripts/ci.sh` green | 2,3,4,5 | — | done | self |
| 7 | (A only) If accepting: add a one-line note in `agents/AGENTS.md` explaining the expected warnings + record "do not adopt validate --strict in CI until resolved" | 1 | — | skipped | self |

### Step details

- **#1** — This is a genuine design decision, hence the plan. See `## Notes` for the
  recommendation (try C → fall back to B; A only if minimal change is preferred).
- **#2** — The decisive open question. Skills avoid this exact problem because they
  are declared as **subdirs** (`skills/engineering`), leaving `skills/AGENTS.md`
  above the scanned paths — that node is validator-clean today. The spike tests
  whether the same trick works for agents. **Risk:** the explicit-file-array test
  (Mistakes & Dead Ends) showed the validator still scanned all of `agents/`, so
  the validator may always scan the default `agents/` dir regardless — in which
  case C fails and B is the fix.

## Acceptance criteria

- [x] A decision is recorded in Step 1 (A, B, or C). → **B** (C spike failed).
- [x] For B/C: `claude plugin validate --strict ./plugins/docks` exits 0 with **no**
      "No frontmatter" warnings for `agents/AGENTS.md` / `agents/CLAUDE.md`. → "✔ Validation passed".
- [ ] For A: the warnings are documented as expected, with the `--strict` caveat noted. → n/a (B chosen).
- [x] `bash scripts/guard-tree.sh` passes (context-tree pairs still valid). → 6 nodes valid.
- [x] `bash scripts/ci.sh` green. → all checks passed.
- [x] The stale "manifest rejects an agents field" claim is corrected wherever it lives. → `agents/AGENTS.md` deleted; Notes corrected (the claim was actually right).

## Out of scope

- Moving the agent **files** out of `agents/` to a non-`agents/` directory — the
  repo rule "agents stay flat at `agents/<name>.md`" governs their location. (C only
  proposes a subdir *within* `agents/`, and only if the user reopens that rule — see Notes.)
- Adopting `claude plugin validate --strict` in CI — a separate hardening change,
  unblocked once this lands.
- Any change to the Codex manifest — agents are Claude-only; Codex does not load
  plugin-shipped subagents.

## Mistakes & Dead Ends

- **2026-05-25**: Added `"agents": ["./agents/plan-manager.md", "./agents/plan-review.md"]`
  to plugin.json expecting it to replace directory auto-discovery → `claude plugin
  validate` STILL validated `agents/AGENTS.md` + `CLAUDE.md` and warned (output
  byte-identical) → the validator scans the default `agents/` dir regardless of the
  manifest array; the array changes the *runtime* loader (doc: "the plugin still loads
  using the manifest paths") but not the validator. Reverted. Avoid assuming validate
  honors the manifest the way the runtime loader does.
- **2026-05-25**: Tried relocating the node to the plugin root (`plugins/docks/AGENTS.md`
  + `CLAUDE.md`) → validator then reported `Validating plugin: .../plugins/docks/CLAUDE.md`
  with a warning (3 warnings total, worse) → no `AGENTS.md`/`CLAUDE.md` is safe anywhere
  the plugin validator scans, including the plugin root. Removed the test files. Avoid
  putting any context node *inside* the plugin payload tree.
- **2026-05-25 (option C — the decisive spike, RULED OUT)**: Moved the two real agents into
  `agents/lifecycle/` and added `"agents": ["./agents/lifecycle"]` to plugin.json, expecting the
  node files (`agents/AGENTS.md` + `CLAUDE.md`) to sit above the scanned path the way `skills/AGENTS.md`
  does. `claude plugin validate --strict` failed on BOTH pillars: (1) `agents: Invalid input` — the
  manifest rejected that array shape (so the "bonus finding" below was wrong; `agents/AGENTS.md`'s
  original "rejects an agents field" claim was right); (2) `agents/AGENTS.md` + `CLAUDE.md` STILL warned
  "No frontmatter" — a subdir does NOT lift them above the agents/ scan. C is dead either way. Reverted
  (agents back to flat, array removed); executed **B**. Lesson: the validator scans `agents/` recursively;
  there is no in-`agents/` location safe for non-agent `*.md`.

## Sources

- https://code.claude.com/docs/en/plugins-reference — agents default location is `agents/`
  ("Subagent Markdown files"); manifest supports an explicit `agents` array of file paths
  ("These paths replace the plugin's default directories"); line ~548: with both a default
  folder and the manifest key, the plugin "still loads using the manifest paths," and "no
  warning is shown when the manifest key points into the default folder."
- `claude plugin validate --strict --help` — "Treat warnings as errors (exit 1). Use in CI
  to fail on … issues that the runtime tolerates." Confirms (a) runtime tolerates these files,
  (b) --strict turns the warnings into hard failures.
- `scripts/guard-tree.sh` — requires the `AGENTS.md`+`CLAUDE.md` pair in any folder that has
  either; does NOT require a node in every folder (so removing the `agents/` node is allowed).
- `plugins/docks/skills/AGENTS.md` — the skills node is validator-clean precisely because
  skills are declared as subdirs, leaving the node above the scanned paths (the model for C).

## Blockers

None — the Step-1 decision (**B**) was made and the work is complete.

## Notes

**Recommendation:** try **C** first (it is the ideal outcome — keeps a clean,
lazily-loaded `agents/` context node AND silences the validator, consistent with how
skills already work). If the Step-2 spike shows the validator always scans `agents/`
regardless (likely, per the first dead-end), fall back to **B** (remove the `agents/`
node; fold its ~36 lines of authoring conventions into root `AGENTS.md`). **A**
(accept + document) is the proportionate minimum if no structural change is wanted —
severity is low and there is zero functional impact today.

**Bonus finding — CORRECTED (Step 5):** an earlier draft of this note claimed the manifest
"accepts an `agents` array of paths (same shape as `skills`)," contradicting `agents/AGENTS.md`'s
"rejects an `agents` field" claim. The C spike **disproved that correction**: `claude plugin
validate --strict` returned `agents: Invalid input` for `"agents": ["./agents/lifecycle"]`, so the
manifest does **not** accept that array shape — the original "agents stay flat" rule stood on solid
ground. Moot now regardless: option **B deleted** `agents/AGENTS.md`, so the claim no longer lives
anywhere; the agent-authoring rules now live in root `AGENTS.md` under "Authoring agents (Claude-only)".

## Evidence log

- 2026-05-25 — Investigation: confirmed validator lints all `agents/*.md`; runtime tolerates
  (per --strict help); `--strict` fails (exit 1); explicit `agents` array did not silence
  validate; plugin-root node added a 3rd warning. Baseline restored (2 warnings, ci.sh green).
- 2026-05-25 — Execution: ran the option-C spike (agents→`lifecycle/` subdir + manifest `agents`
  array) → `validate --strict` failed with `agents: Invalid input` AND both node files still warned
  → C ruled out on both pillars. Reverted. Executed **B**: deleted `agents/AGENTS.md` +
  `agents/CLAUDE.md`, folded authoring into root `AGENTS.md` ("Authoring agents (Claude-only)"),
  removed the context-tree table row, removed the manifest `agents` array, moved agents back to flat
  `agents/<name>.md`. Result: `validate --strict` → **✔ Validation passed** (exit 0); `guard-tree` →
  6 nodes valid; `ci.sh` → all checks passed (`score-agents 29 ≥ floor 28 = 2×14`; no depth-1
  scoring cascade). Pending: commit + ship.

## Review

- **Goal met:** yes — option B shipped in 9112106: both `agents/` node files deleted, authoring folded into root `AGENTS.md` ("Authoring agents (Claude-only)"), context-tree row dropped; `claude plugin validate --strict ./plugins/docks` now exits 0 with **no** "No frontmatter" warnings. All 5 binding `[x]` criteria reproduced this turn (validate --strict ✔, guard-tree 6 nodes ✔, ci.sh ✔, stale claim grep-clean, decision=B recorded).
- **Regressions:** none — agents stay flat (`plan-manager.md`, `plan-review.md`); depth-1 scorers untouched (`score-agents 29 ≥ floor 28`); full `ci.sh` green.
- **CI:** pass (`bash scripts/ci.sh` exit 0 — "✔ All ci.sh checks passed"; plus `validate --strict` exit 0 and `guard-tree` 6 nodes valid, all re-run this turn).
- **Scope:** minor drift — `plugins/docks/.claude-plugin/plugin.json` is in `affected_paths` but absent from the ship commit; benign and self-documented (it was the anticipated option-C `agents` array, reverted when B was chosen — B needs no manifest change). All 3 actually-changed files are listed; no unannounced changes.
- **Follow-ups:** none — the unblocked hardening ("adopt `validate --strict` in CI") is already captured in the plan's Out of scope; create it via "new plan" only if/when you want to track it.
- Filed by: plan-review on 2026-05-25T02:30:50-03:00
