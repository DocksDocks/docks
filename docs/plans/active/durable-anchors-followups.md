---
title: Durable-anchors follow-ups — 4 recorded drift findings
goal: Close the four dogfood-audit findings deferred by durable-anchors — session-relay context node, skills-node name/description truth, agents-score floor wording, ci.mjs stale bash comment.
status: in_review
created: "2026-07-03T16:42:26-03:00"
updated: "2026-07-03T16:46:45-03:00"
started_at: "2026-07-03T16:42:26-03:00"
in_review_since: "2026-07-03T16:45:39-03:00"
assignee: claude
tags: [context-tree, drift, docs, ci]
affected_paths:
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/CLAUDE.md
  - AGENTS.md
  - plugins/docks/skills/AGENTS.md
  - scripts/ci.mjs
related_plans: [durable-anchors, executable-claims]
review_status: passed
planned_at_commit: "a15234528032b7302987a8c6aba2fd70031caf98"
---

# Durable-anchors follow-ups — 4 recorded drift findings

## Goal

The durable-anchors dogfood audit recorded six drifted-claim findings; two (no-author-scripts `.mjs` entry points, the Renovate mismatch) shipped in [[executable-claims]]. This plan closes the remaining four. All are documentation-truth fixes plus one new context node — no shipped skill bodies change, so **no release** is needed (the new `plugins/session-relay/AGENTS.md` rides along in the next session-relay release naturally).

## Context & rationale

Evidence, each re-verified this session:

1. **session-relay-context-node** — `plugins/session-relay/` is a multi-capability plugin (rust/ crate, bin/ committed binaries + POSIX-sh launcher, hooks/, skills/, test/ selftest) with release discipline that currently lives only in conversation/finished plans. It qualifies for its own node per the major-folder heuristics; the root Context tree table has no row for it.
2. **skills-agents-name-desc-required** — `plugins/docks/skills/AGENTS.md` frontmatter table says `name` "optional (dir-name fallback)" and `description` "recommended", but `scripts/lib/validate-skills.mjs` — `validateCommon` — errors unconditionally on a missing/empty `name` OR `description` ("must be a non-empty string"). Both are REQUIRED by kit CI; the doc understates the contract.
3. **agents-score-constraint-floor** — root `AGENTS.md` claims the agents floor "mechanically needs 2 `<constraint>` blocks". False: `scripts/agents/score.mjs` caps the constraint bucket at 2 pts (`Math.min(2, count)`), max total 15, floor 14 — so 1 block + perfect elsewhere = 14 = floor, passes. The truthful statement: floor 14 of max 15 leaves one point of slack; 2 blocks are the safe default, not a mechanical requirement.
4. **ci-mjs-stale-bash-comment** — `scripts/ci.mjs` shell-lint section comment says "currently a no-op (zero bash in the repo)" but the section actively lints session-relay's `bin/relay` sh launcher via `shellHooks(p)` (the run prints "shellcheck -S warning clean").

## Environment & how-to-run

`node scripts/ci.mjs` (full gate; includes `tree/guard.mjs` pair check and the repo-wide durable-anchors guard that will scan the NEW node) · no hash backfill needed (no SKILL.md/references change) · no release.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | New context node `plugins/session-relay/AGENTS.md` (+ one-line `CLAUDE.md` = `@AGENTS.md`): layout map (rust/ crate → bin/ four target binaries + `relay` sh launcher + SHA256SUMS, hooks/, skills/, test/ selftest), the binary-release discipline (binaries come ONLY from build-binaries.yml artifacts committed before tagging — never a local build), version lockstep, selftest + fake-app-server commands. Durable anchors only; volatile facts carry verify cues; behavior claims carry exercising probes or are omitted | `plugins/session-relay/AGENTS.md` (new), `plugins/session-relay/CLAUDE.md` (new) | — | done |
| 2 | Root `AGENTS.md` Context tree table gains the `plugins/session-relay/AGENTS.md` row | `AGENTS.md` | 1 | done |
| 3 | `plugins/docks/skills/AGENTS.md` frontmatter table: `name` and `description` rows → required (matching `validateCommon`), keeping the format rules | `plugins/docks/skills/AGENTS.md` | — | done |
| 4 | Root `AGENTS.md` agents-score wording: "mechanically needs 2 `<constraint>` blocks" → truthful floor arithmetic (14/15 = one point of slack; 2 blocks safe default) | `AGENTS.md` | — | done |
| 5 | `scripts/ci.mjs` shell-lint comment: "currently a no-op (zero bash in the repo)" → reflects that `shellHooks(p)` feeds session-relay's `bin/relay` launcher (and any `hooks/*.sh`) to shellcheck | `scripts/ci.mjs` | — | done |
| 6 | Gates: `node scripts/ci.mjs` exit 0 (tree pair + durable-anchors over the new node); commit + push (no release) | — | 1–5 | done |

## Cue exercise log (2026-07-03)

- **SHA256SUMS probe** (the new node's constraint cue) — flipped the first hex char of `plugins/session-relay/bin/SHA256SUMS` → `node scripts/ci.mjs --plugin session-relay -q` FAILED: "session-relay bin checksum failures: relay-x86_64-apple-darwin (checksum mismatch)"; reverted → `git status` clean, full CI green.
- Acceptance greps all ran: tree/guard 7 nodes valid, pair present, root row present, the three stale phrases gone (each grep exit 1), `node scripts/ci.mjs -q` exit 0 (durable-anchors guard scans the new node — 105 docs).

## Acceptance criteria

- `node scripts/tree/guard.mjs` → exit 0 with the new pair; `test -f plugins/session-relay/AGENTS.md -a -f plugins/session-relay/CLAUDE.md` → 0; `grep -c "@AGENTS.md" plugins/session-relay/CLAUDE.md` → 1.
- `grep -n "session-relay/AGENTS.md" AGENTS.md` → the Context tree row exists.
- `grep -n "optional (dir-name fallback)" plugins/docks/skills/AGENTS.md` → no match (exit 1); `grep -n "recommended;" plugins/docks/skills/AGENTS.md` → no match on the description row.
- `grep -n "mechanically needs 2" AGENTS.md` → no match (exit 1).
- `grep -n "zero bash in the repo" scripts/ci.mjs` → no match (exit 1).
- `node scripts/ci.mjs` → exit 0 (durable-anchors guard now scans 105+ docs incl. the new node).

## Out of scope / do-NOT-touch

- No release (docks or session-relay) — nothing consumer-behavioral changes; do not bump manifests.
- `scripts/agents/score.mjs` and `scripts/lib/validate-skills.mjs` — the docs move to match the code, never the reverse (the code is the correct contract).
- The shell-lint logic in `ci.mjs` — comment-only change.

## Cold-handoff checklist

1–9: file manifest ✓ (exact paths per step) · environment ✓ · contracts ✓ (node-pair convention: both files, CLAUDE.md exactly `@AGENTS.md`, AGENTS.md ≤500 lines; durable-anchors + behavior-claim rules apply to the new node) · executable acceptance ✓ · out-of-scope ✓ · rationale ✓ (each finding's evidence with the code symbol) · gotchas: the new AGENTS.md is scanned by the durable-anchors guard — no live `path:NN`; `claude plugin validate` lints `*.md` under an `agents/` dir but session-relay has none, so a root-level node pair is safe · constraints: no release ✓ · no TBDs ✓.

## Self-review

Score: 90/100 (small tier, one pass). Caught: (a) the initial draft had the new node's content unspecified — now enumerated in step 1 (layout, binary discipline, lockstep, selftest); (b) flagged the `claude plugin validate` agents-scan risk and resolved it (no `agents/` dir in session-relay); (c) release question resolved explicitly (none — docs only).

## Review

- **Goal met:** yes — all four drift findings closed. New node `plugins/session-relay/AGENTS.md` (+ `CLAUDE.md` = `@AGENTS.md`) present with root Context-tree row; skills-node `name`/`description` now say **required** (matches `validate-skills.mjs` `validateCommon`, which errors on missing/empty for both — lines 90, 104); the "mechanically needs 2 constraint blocks" claim replaced with the truthful floor arithmetic (matches `score.mjs:53` `Math.min(2, count)`, floor 14/max 15); the `ci.mjs` shell-lint comment now reflects `shellHooks(p)` (matches `plugins.mjs:95-105` — hooks/*.sh + rust launcher `bin/relay`). New node cold-read clean: 32 lines, no live path:NN anchors (durable-anchors green), behavior claims carry probes; facts verified against repo (four `bin/relay-<triple>` binaries, both hooks configs carry SessionStart+UserPromptSubmit, `test/` holds selftest.mjs + fake-app-server.mjs, `selftest` descriptor path matches `plugins.mjs:48`).
- **Regressions:** none — out-of-scope held: no plugin.json/marketplace.json touched, `score.mjs` and `validate-skills.mjs` unchanged, `ci.mjs` change is comment-only (two lines).
- **CI:** pass — `node scripts/ci.mjs -q` exit 0 ("All ci.mjs checks passed — 2 plugin(s) + repo-wide"); `tree/guard` 7 nodes valid; `durable-anchors` 105 docs incl. the new node. SHA256SUMS corruption probe already exercised this session (logged in Cue exercise log); `git status --porcelain plugins/session-relay/bin/SHA256SUMS` empty — not re-run.
- **Follow-ups:** none
- Filed by: plan-review on 2026-07-03T16:46:45-03:00

## Sources

- `scripts/lib/validate-skills.mjs` — `validateCommon` — errors on missing/empty `name` and `description` unconditionally (verify: `grep -n "must be a non-empty string" scripts/lib/validate-skills.mjs` → both fields).
- `scripts/agents/score.mjs` — constraint bucket `Math.min(2, count)` of max 15 vs floor 14 (verify: `grep -n "Math.min(2" scripts/agents/score.mjs`).
- `scripts/ci.mjs` — shell-lint section comment vs its own `shellHooks(p)` behavior (verify: `grep -n "zero bash" scripts/ci.mjs` + run `node scripts/ci.mjs -q` and observe the shellcheck line).
- `scripts/tree/guard.mjs` — pair contract: both files, one-line `@AGENTS.md`, ≤500 lines (read this session).
- Dogfood record: `docs/plans/finished/2026-07-03-durable-anchors.md` § Follow-ups.
