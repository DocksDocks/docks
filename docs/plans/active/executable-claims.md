---
title: Executable claims — behavior/automation claims carry an exercising cue
goal: Shipped skill prompts require every "X enforces/automates/blocks Y" claim to carry a verify cue that EXERCISES the behavior, so generated artifacts are born auditable; fix the two recorded guard/doc bugs; retrofit this repo's nodes.
status: ongoing
created: "2026-07-03T16:18:19-03:00"
updated: "2026-07-03T16:18:19-03:00"
started_at: "2026-07-03T16:18:19-03:00"
assignee: claude
tags: [skills, context-tree, write-skill, skill-agent-pipeline, drift, conventions]
affected_paths:
  - plugins/docks/skills/productivity/write-skill/references/durable-anchors.md
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md
  - plugins/docks/skills/productivity/context-tree/references/node-template.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/references/content-auditor.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/references/skills-builder.md
  - scripts/skills/no-author-scripts.mjs
  - .github/AGENTS.md
  - AGENTS.md
  - plugins/docks/skills/AGENTS.md
  - scripts/AGENTS.md
related_plans: [durable-anchors]
review_status: null
planned_at_commit: "e0b220e0c1a7bd82b69ecf85767c82b13e02726c"
---

# Executable claims — behavior/automation claims carry an exercising cue

## Goal

The durable-anchors dogfood exposed a drift class no `path:NN` guard can catch: **prose describing what a tool DOES** ("guard X enforces Y", "Renovate updates the SHAs") that reality contradicts. Maintainer direction (2026-07-03, verbatim intent): *"the prompt in the skill itself is what could improve, since the skill is what will be used in other places, improving the ci doesnt change that much, we cant catch everything with a script, but we can make rules that avoid the issue in the skill prompt."* So the fix lands in the SHIPPED skill bodies: a behavior/enforcement/automation claim is a volatile fact — it carries a `verify:` cue that **exercises** the behavior (a should-fail probe beats an existence check), or it is not written. Plus: fix the two recorded follow-up bugs, and retrofit this repo's nodes as the dogfood.

## Context & rationale

- **Why "exercise", not "exists":** the no-author-scripts gap was invisible to existence checks (the script exists, runs, passes) — it was caught only by FEEDING it an input it claimed to reject (`PATTERN.test("node scripts/ci.mjs") → false`). The rule must encode that technique.
- **Why skill prompts, not more CI:** guards protect one repo; skill bodies ship to every consumer project. A regex that verifies prose-matches-program cannot exist; a rule that makes authors write claims WITH their probe can.
- **The two bugs (follow-ups from [[durable-anchors]]):** (1) `scripts/skills/no-author-scripts.mjs` PATTERN matches only stale `.sh` entry-point forms — `scripts/ci.mjs`/`scripts/release.mjs` pass; safe to fix, the only shipped bodies naming them are allowlisted (scaffold, write-skill — verified this session). (2) `.github/AGENTS.md` promises "Renovate/Dependabot update the SHA + comment for you" — neither is configured; the truthful statement is manual SHA bumps.

## Environment & how-to-run

Same gate stack as [[durable-anchors]]: `node scripts/ci.mjs` (full gate) · scorer `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file` (productivity floor 8) · hash sync `node scripts/skills/content-hash.mjs --backfill plugins/docks/skills` · release `node scripts/release.mjs --plugin docks minor` (gated on user approval).

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Convention: extend `durable-anchors.md` with the **behavior-claim rule** — claims of the form "X enforces/automates/blocks/validates/updates Y" are volatile facts; cue = a command that EXERCISES the behavior (should-fail probe), with BAD/GOOD | `plugins/docks/skills/productivity/write-skill/references/durable-anchors.md` | — | planned |
| 2 | context-tree: node-authoring rule + template checklist row gain the behavior-claim cue requirement; audit claim table gains a `behavior claim` row (verify by exercising, not existence) | `…/context-tree/SKILL.md`, `…/references/node-template.md`, `…/references/conflict-resolution.md` | 1 | planned |
| 3 | skill-agent-pipeline: `content-auditor.md` claim table gains the behavior-claim row; `skills-builder.md` durable-anchor block gains the one-line rule for emitted bodies | 2 files under `…/skill-agent-pipeline/references/` | 1 | planned |
| 4 | Bug fixes: `no-author-scripts.mjs` PATTERN gains `scripts/(ci\|release)\.mjs`; `.github/AGENTS.md` Renovate sentence → truthful manual-bump statement with an exercising cue | `scripts/skills/no-author-scripts.mjs`, `.github/AGENTS.md` | — | planned |
| 5 | Retrofit: concrete exercising cues on the enforcement/automation claims in root `AGENTS.md`, `plugins/docks/skills/AGENTS.md`, `scripts/AGENTS.md`, `.github/AGENTS.md`; run each cue once and record | the 4 nodes | 1,4 | planned |
| 6 | Gates (hash backfill, scorer floors, `ci.mjs`) + release docks minor (user-gated) | manifests via release.mjs | 2,3,5 | planned |

## Acceptance criteria

- `echo "run node scripts/ci.mjs" | node -e "const{PATTERN}=await import('./scripts/skills/no-author-scripts.mjs').catch(()=>({}));"` is not testable directly (no export) — instead: append `node scripts/ci.mjs` to a non-allowlisted shipped skill body → `node scripts/skills/no-author-scripts.mjs` exits 1 naming it; revert (temp edit, verify `git status` clean after).
- `grep -n "Renovate/Dependabot update" .github/AGENTS.md` → no match (exit 1).
- `grep -c "verify:" AGENTS.md plugins/docks/skills/AGENTS.md scripts/AGENTS.md .github/AGENTS.md` → ≥1 each (concrete cues present).
- Every retrofit cue executed once this session, each re-deriving its stated fact (recorded in the plan).
- `grep -rn "behavior claim\|exercis" plugins/docks/skills/productivity/write-skill/references/durable-anchors.md …/context-tree/references/conflict-resolution.md …/skill-agent-pipeline/references/content-auditor.md` → the rule present in all three audit/authoring surfaces.
- Scorer: touched skills ≥ floor; `node scripts/ci.mjs` exit 0.

## Out of scope / do-NOT-touch

- The other durable-anchors follow-ups (`session-relay-context-node`, `skills-agents-name-desc-required`, `agents-score-constraint-floor`, `ci-mjs-stale-bash-comment`) — separate concerns, unchanged.
- `docs/plans/` conventions and point-in-time artifacts — file:line remains correct there.
- No new CI guards — per the maintainer direction, this plan strengthens prompts, not scripts (the PATTERN fix repairs an EXISTING guard's stated contract, not a new gate).

## Cold-handoff checklist

1–9: file manifest ✓ (steps name exact paths) · environment ✓ (inherited stack stated) · contracts ✓ (the behavior-claim rule IS the contract; grammar in durable-anchors.md) · executable acceptance ✓ · out-of-scope ✓ · rationale ✓ (exercise-vs-exists, prompts-vs-CI) · gotchas: hash backfill after skill edits; `git restore` reverts whole files (plant probes via temp copy or re-apply edits) · constraints verbatim: "we can make rules that avoid the issue in the skill prompt" ✓ · no TBDs ✓.

## Self-review

Score: 88/100 (normal tier, one pass — actionability and executable acceptance strong; standalone executability capped by inherited-environment shorthand, acceptable given [[durable-anchors]] shipped in the same repo with full commands). Caught in the pass: the first acceptance criterion originally imported a non-exported PATTERN — rewritten as a live probe against a temp-edited skill body; the `git restore` whole-file trap from the durable-anchors run is now a recorded gotcha.

## Review

(filled by plan-review on completion)

## Sources

- `scripts/skills/no-author-scripts.mjs` — `PATTERN` — the author-script matcher missing `.mjs` entry forms (verify: `node -e 'console.log(/scripts\/(ci|release)\.sh/.test("node scripts/ci.mjs"))'` → currently the doc-claimed behavior is absent).
- `.github/AGENTS.md` — the Renovate/Dependabot sentence (verify: `ls .github/dependabot.yml renovate.json 2>&1` → no such files).
- Dogfood audit record in `docs/plans/finished/2026-07-03-durable-anchors.md` — the findings this plan operationalizes.
