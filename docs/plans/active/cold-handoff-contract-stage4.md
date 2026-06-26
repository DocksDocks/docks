---
title: Stage 4 — kit-wide cold-handoff/authoring sweep
goal: Apply the research's Stage 4 across the kit — reframe guidance all-caps imperatives to "rule + why", quality-audit skill/agent descriptions, add a minimal hand-written Codex commands block, and document the Claude-A/Claude-B fresh-instance test as standing QA.
status: planned
created: "2026-06-26T04:59:29+00:00"
updated: "2026-06-26T04:59:29+00:00"
started_at: null
assignee: null
tags: [plans, kit-wide, authoring, codex, follow-up]
affected_paths:
  - plugins/docks/skills
  - plugins/docks/agents
  - AGENTS.md
  - plugins/docks/skills/productivity/write-skill/SKILL.md
related_plans: [cold-handoff-contract]
review_status: null
planned_at_commit: 463a3fbd5c88d67399381b91119cb1660cabd929
---

# Stage 4 — kit-wide cold-handoff/authoring sweep

## Goal

The deferred follow-up to `cold-handoff-contract` (Stages 1–3 shipped). Apply the
research artifact's **Stage 4** kit-wide recommendations that are in scope for
THIS repo: (1) reframe *guidance* `MUST/ALWAYS/NEVER` imperatives to "state the
rule, then why" so models generalize, while keeping genuinely load-bearing/safety
imperatives emphatic; (2) a quality audit of every skill/agent description
(front-loaded trigger, collision routing, within the listing budget) — beyond the
"Use when" prefix the guard already enforces; (3) add a minimal, hand-written
build/test/lint commands block early in the root `AGENTS.md` for Codex
portability; (4) document the Claude-A/Claude-B fresh-instance test as the
standing QA method (it already proved its worth on `cold-handoff-contract`).
Success: each landed without loosening any validator floor, CI green, scores held.

## Context & rationale

Parent plan `cold-handoff-contract` shipped Stages 1–3 and explicitly parked
Stage 4 as too broad to bundle. Grounding audit (this session, at
`planned_at_commit`):

- `grep -rE '\b(MUST|ALWAYS|NEVER)\b'` over `plugins/docks/skills` + `agents`
  → **39 occurrences**. Not all are defects: the research flags bare imperatives
  as a "yellow flag to reframe", but enforcement-critical/safety rules SHOULD stay
  emphatic. So the step reframes *guidance* imperatives only.
- Descriptions already pass the `Use when` prefix guard and the
  `skill-trigger-collision` test (CI green), so this is a **quality pass** (trigger
  front-loading in the first ~100 chars, near-miss routing per `write-skill`), not
  a structural fix. Do not "fix" descriptions the guard already accepts.
- Root `AGENTS.md` mentions `node scripts/ci.mjs` only in prose ("Tool-agnostic
  rules", line ~77), not as an early, explicit commands block. The research
  ("agents.md lessons") wants executable commands early.

Decisions (pre-resolved so this is execution-ready, not blocked on questions):
- **All-caps reframe = guidance only.** Keep safety/enforcement imperatives (e.g.
  data-preservation, "never force-push", approval gates) emphatic; the skill
  scorer rewards `<constraint>` blocks, so reframing must not delete them.
- **Codex commands block = yes, but minimal** (`corepack enable && pnpm install
  --frozen-lockfile`, then `node scripts/ci.mjs`). Heeds Gloaguen et al.
  (arXiv:2602.11988): context files can *reduce* agent success and raise cost
  >20%, so keep it to the commands an agent would otherwise get wrong, and no more.
- **RTK hook enforcement is OUT OF SCOPE** — RTK config lives in
  `DocksDocks/public`, not this repo (root `AGENTS.md`, "What does NOT belong").

## Environment & how-to-run

- Runtime: Node `22.x`, pnpm `11.5.1` via `corepack`.
- Install: `corepack enable && pnpm install --frozen-lockfile`
- Gate (green before commit): `node scripts/ci.mjs`
- After any SKILL.md body / `references/` change: `node scripts/skills/content-hash.mjs --backfill` (then re-run CI's idempotency check).
- Score a skill: `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file`
- Score agents: `node scripts/agents/score.mjs --per-file`

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Enumerate the 39 `MUST/ALWAYS/NEVER` occurrences; classify each as guidance (reframe to "rule + why") vs load-bearing/safety (keep). Produce the keep/reframe list | `plugins/docks/skills/**/SKILL.md`, `plugins/docks/agents/*.md` | — | planned |
| 2 | Apply the guidance reframes; bump `metadata.updated` + `content-hash --backfill` on every touched skill | touched `SKILL.md` + frontmatter | 1 | planned |
| 3 | Quality-audit each skill/agent description (trigger in first ~100 chars, near-miss routing per `write-skill`, ≤1536-char listing); tighten where weak | descriptions in frontmatter | — | planned |
| 4 | Add a minimal hand-written build/test/lint commands block early in root `AGENTS.md` (install + `node scripts/ci.mjs`) | `AGENTS.md` | — | planned |
| 5 | Document the Claude-A/Claude-B fresh-instance test as standing QA for plan/skill authoring | `plugins/docks/skills/productivity/write-skill/SKILL.md` (or `plugins/docks/skills/AGENTS.md`) | — | planned |
| 6 | `node scripts/ci.mjs` green; per-file scores hold; self-review; commit | all touched | 2,3,4,5 | planned |

## Interfaces & data shapes

No code interfaces — this is authoring/wording. The relevant invariants the steps
must not break:

- Skill per-file score floors (`scripts/config/scoring.json`): engineering 10,
  productivity 8; agents 14. Reframing must not drop a skill below its floor
  (the scorer rewards `<constraint>` blocks, BAD/GOOD, tables — don't delete them).
- `metadata.content_hash` = hash of body + `references/`; any body edit needs a
  matching `metadata.updated` bump + `--backfill` or CI's idempotency check fails.
- Description hard cap 1,024 chars; listing truncates at 1,536; "Use when" prefix
  required (guard) — the audit tightens within these, never violates them.

## Acceptance criteria

- `node scripts/ci.mjs; echo $?` → `✔ All ci.mjs checks passed`, exit `0`
  (guards, trigger-collision, per-file score floors, content-hash idempotency).
- Reframe applied without floor regressions:
  `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file`
  → every skill ≥ its category floor; `node scripts/agents/score.mjs --per-file` → each ≥ 14.
- Guidance imperatives reduced (not zeroed):
  `grep -rE '\b(MUST|ALWAYS|NEVER)\b' plugins/docks/skills plugins/docks/agents -o | wc -l`
  → `< 39` and `> 0` (safety imperatives intentionally kept).
- Codex commands block present:
  `grep -nE 'pnpm install --frozen-lockfile|node scripts/ci\.mjs' AGENTS.md` → matches an early block.
- Claude-A/B method documented: `grep -rl -i 'fresh-instance\|Claude A.*Claude B\|fresh-context' plugins/docks/skills/productivity/write-skill/SKILL.md` → matches.

## Out of scope / do-NOT-touch

- **RTK hook enforcement / consumer settings** — RTK config lives in
  `DocksDocks/public` (root `AGENTS.md`); never add it here.
- **Loosening any validator floor** to make a reframed file pass — fix the file.
- **The plan contract itself** (`docs/plans/AGENTS.md` + plan-init template) —
  Stages 1–3 shipped in `cold-handoff-contract`; this plan does not re-touch it.
- **`finished/` archive** and the shipped `cold-handoff-contract` plan.
- **Instruction-budget measurement** (the "~150–200 instructions" tuning) — needs
  real session traces; a separate, measured effort, not this wording sweep.

## Known gotchas

- A blanket find/replace of `MUST/ALWAYS/NEVER` would gut load-bearing
  `<constraint>` blocks and tank skill scores — classify first (step 1), then edit.
- Editing a skill body without bumping `metadata.updated` + `--backfill` breaks
  the content-hash idempotency check (silent until CI).
- The Gloaguen finding means "more context" can hurt — the Codex block stays
  minimal; resist the urge to document everything in root `AGENTS.md`.
- Some skills use a folded YAML description scalar; "audit" means reading the
  parsed value, not grepping `^description: Use when` (which misses folded forms).

## Global constraints

- `node scripts/ci.mjs` exits 0 before any commit (`scripts/AGENTS.md`).
- Per-file floors: engineering 10 / productivity 8 / agents 14 (`scripts/config/scoring.json`).
- Skill body sweet spot 80–310 lines, hard cap 500.
- Develop on the designated branch; no plugin version bump in prose.

## Cold-handoff checklist

1. **File manifest** — present: Steps `Files` column + `affected_paths` (dir-level where the sweep spans many files; step 1 narrows to a concrete list before edits).
2. **Environment & commands** — present: `## Environment & how-to-run`.
3. **Interface & data contracts** — present: `## Interfaces & data shapes` (score floors, hash rule, description caps).
4. **Executable acceptance** — present: `## Acceptance criteria` are commands + expected output.
5. **Out of scope** — present: `## Out of scope / do-NOT-touch`.
6. **Decision rationale** — present: `## Context & rationale` pre-resolves the two judgment calls.
7. **Known gotchas** — present: `## Known gotchas`.
8. **Global constraints verbatim** — present: `## Global constraints`.
9. **No undefined terms / forward refs** — present: every file/command/threshold named resolves; no `TBD`.

Adversarial cold-read: an executor can run step 1 (enumerate via the grep given),
classify, edit, and verify via the acceptance commands. The one genuinely
discovery-shaped step (which descriptions are "weak" in step 3) is bounded by the
`write-skill` near-miss procedure — not an open guess.

## Self-review

Scored against the rubric in `docs/plans/AGENTS.md` (planned-tier: score + one
critique, no iteration — first score ≥ 85):

- Standalone executability 20/22 — checklist present + justified; −2: step 1's
  output (the keep/reframe list) is produced at execution, so `affected_paths`
  is dir-level until then (the contract permits this for a sweep, but it is less
  than a per-file manifest).
- Actionability 15/16 — every step verifiable; −1: step 3 "tighten where weak" is
  inherently judgment-bounded (mitigated by the write-skill near-miss procedure).
- Dependency order 12/12 — acyclic; 1→2, 3/4/5 independent, all → 6.
- Evidence re-verify 10/10 — the 39-count, prose-only ci.mjs mention, RTK-in-public,
  and hooks inventory were all grep/Read-confirmed this session.
- Goal coverage 12/12 — steps cover all four goal clauses.
- Executable acceptance 12/12 — criteria are commands with expected output.
- Failure mode 9/10 — CI + `git restore` is the revert; −1: no per-skill rollback.
- Assumption→question 6/6 — the two judgment calls are pre-resolved decisions, not silent guesses.

`Score: 96/100 · trajectory 96 · stopped: planned-tier single pass (first score ≥ 85)`

## Review

(filled by plan-review on completion)

## Sources

- `docs/plans/finished/2026-06-26-cold-handoff-contract.md` — parent plan; its Out-of-scope deferred exactly this Stage 4.
- Uploaded research artifact "Closing the Cold-Handoff Gap in `DocksDocks/docks`", §6–§7 (kit-wide + Codex) and Recommendations Stage 4.
- `AGENTS.md` (root) line ~77 — `node scripts/ci.mjs` mentioned in prose, not an early commands block; "What does NOT belong" — RTK config is in DocksDocks/public.
- `scripts/config/scoring.json` — per-file floors (engineering 10, productivity 8, agents 14).
- `plugins/docks/hooks/` — `context-tree-nudge.mjs` + `hooks.json` (the repo's only hook surface).
