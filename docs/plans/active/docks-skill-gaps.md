---
title: docks skill gaps — author commit-discipline + a11y skills
goal: Fill the two coverage gaps the 2026-07-05 kit audit surfaced — a commit/PR-hygiene skill (no current owner) and an accessibility skill (missing from the UI-polish trio) — each through the full write-skill authoring cycle.
status: planned
created: "2026-07-05T18:31:55-03:00"
updated: "2026-07-05T18:31:55-03:00"
started_at: null
assignee: claude
tags: [docks, skills, authoring, coverage-gap]
affected_paths:
  - plugins/docks/skills/engineering/
  - plugins/docks/skills/productivity/
related_plans: [docks-kit-refresh]
review_status: null
planned_at_commit: "fbba04dce8c6716f9c5554d46175f881042cb1a4"
---

# docks skill gaps — author commit-discipline + a11y skills

## Goal

The 26-skill audit (see [[docks-kit-refresh]]) found two glaring coverage gaps: (1) **commit/PR hygiene has no owner** — dep-vuln (split security-vs-hygiene commits), fix-workflow (one-commit-per-tier), refactor (per-change revert protocol), and plan-manager (auto-commit) each legislate commit discipline in passing, but "split this into reviewable commits / write the PR description" routes to nothing; (2) **zero accessibility coverage** in a kit that owns UI polish — the trio (design-tokenization / make-interfaces-feel-better / react-component-patterns) covers tokens, motion, and composition, but no focus management, keyboard navigation, ARIA, or reduced-motion (notable since MIFB prescribes animations). User decision 2026-07-05 (picker, verbatim): "create a separate plan for both" — this is that plan.

## Context & rationale

- **Why separate from [[docks-kit-refresh]]:** that plan is a refresh of existing content; new skills deserve the full write-skill authoring cycle (research, CSO description with near-miss pass, references, scoring) and their own review round.
- **commit-discipline also becomes the single home** for the currently-scattered commit rules — the four skills above get pointer lines to it (a follow-up edit inside this plan, not kit-refresh).
- **a11y boundary risk:** must route cleanly against the UI trio — its description needs "Not for…" clauses against MIFB (visual polish) and react-component-patterns (composition), and reduced-motion content must complement, not contradict, MIFB's animation guidance.
- Category/name decisions (engineering vs productivity for commit-discipline; exact a11y skill name) are deliberately open — the write-skill near-miss pass decides them at execution time.

## Environment & how-to-run

Author via the `write-skill` skill (docks bundled). Gates: scorer `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/docks/skills` (engineering floor 10 / productivity floor 8 per file) · hash `node scripts/skills/content-hash.mjs --backfill plugins/docks/skills` · collision `node tests/skill-trigger-collision.mjs plugins/docks/skills` · full `node scripts/ci.mjs` exit 0 before any commit · release (if bundled with a docks release, user-gated at that time).

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Author `commit-discipline` via write-skill: research current commit/PR conventions, draft CSO description (near-miss vs fix-workflow/dep-vuln/refactor/plan-manager), body + references, scorer ≥ floor | new dir under plugins/docks/skills/ (category decided by write-skill pass) | — | planned |
| 2 | Add pointer lines from the four commit-rule-scattering skills to commit-discipline (one line each, no restructuring) | dep-vuln-workflow, fix-workflow, refactor, plan-manager SKILL.md files | 1 | planned |
| 3 | Author the a11y skill via write-skill: focus management, keyboard, ARIA, reduced-motion; description routes against the UI trio | new dir under plugins/docks/skills/engineering/ | — | planned |
| 4 | Gates: hash backfill, scorer, collision, full ci.mjs green; fold into the next docks release (user-gated) | — | 1-3 | planned |

## Acceptance criteria

- Both new SKILL.md files pass `skill-guard.mjs score --per-file` at or above their category floor with honest content.
- `node tests/skill-trigger-collision.mjs plugins/docks/skills` stays green; a ≥3-prompt near-miss table per new skill (vs the named neighbors) is recorded in `## Notes`.
- `node scripts/ci.mjs` → exit 0.

## Out of scope / do-NOT-touch

- Everything [[docks-kit-refresh]] owns (the refresh fixes) — this plan only ADDS skills + four pointer lines.
- effect-kit / session-relay plugins.

## Cold-handoff checklist

1 file manifest — partial by design (new-dir names decided by the write-skill pass; the four pointer-target files are named) · 2 environment & commands ✓ · 3 contracts ✓ (floors, CSO, collision) · 4 executable acceptance ✓ · 5 out-of-scope ✓ · 6 rationale ✓ · 7 gotchas — a11y/MIFB boundary noted in Context · 8 constraints ✓ (floors never loosened) · 9 no undefined terms ✓.

## Self-review

Score: 86/100 (parked-tier single pass — scaffolded as a queued plan per the user's "create a separate plan for both"; converges out of the hill-climb). Known softness, accepted: exact skill names/categories and reference lists are execution-time decisions owned by the write-skill pipeline — pre-deciding them here without its research pass would be guessing. `planned_at_commit` is set to the scaffold-time HEAD and MUST be re-baselined at start if [[docks-kit-refresh]] ships first (same re-baseline rule that plan used).

## Review

(filled by plan-review on completion)

## Sources

- The 2026-07-05 six-auditor sweep (overlap/removability report, sections B–C) — gap evidence: dep-vuln:70-97 split commits, fix-workflow:159 one-commit-per-tier, MIFB 40×40 hit-area as the kit's only a11y-adjacent rule.
- [[docks-kit-refresh]] `## Notes` — the audit record this plan's gaps were filed from.
