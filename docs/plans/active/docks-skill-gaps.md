---
title: docks skill gaps — author commit-discipline + a11y skills
goal: Fill the two coverage gaps the 2026-07-05 kit audit surfaced — a commit/PR-hygiene skill (no current owner) and an accessibility skill (missing from the UI-polish trio) — each through the full write-skill authoring cycle.
status: ongoing
created: "2026-07-05T18:31:55-03:00"
updated: "2026-07-05T20:47:46-03:00"
started_at: "2026-07-05T20:47:46-03:00"
assignee: claude
tags: [docks, skills, authoring, coverage-gap]
affected_paths:
  - plugins/docks/skills/engineering/
  - plugins/docks/skills/productivity/
related_plans: [docks-kit-refresh]
review_status: null
planned_at_commit: "cf00b5c73e67b69cb0c2351251a6b9bb07c98a04"
---

# docks skill gaps — author commit-discipline + a11y skills

## Goal

The 2026-07-05 26-skill audit (see [[docks-kit-refresh]]; kit now 25 after caveman's removal) found two glaring coverage gaps: (1) **commit/PR hygiene has no owner** — dep-vuln (split security-vs-hygiene commits), fix-workflow (one-commit-per-tier), and refactor (per-change revert protocol) each legislate commit discipline in passing, but "split this into reviewable commits / write the PR description" routes to nothing (plan-manager's auto-commit rule is plan-lifecycle — deliberately single-file, one commit per transition — NOT a commit-discipline neighbor; a pointer from it would wrongly imply plan-`.md` commits follow the split-reviewable-commits protocol); (2) **zero accessibility coverage** in a kit that owns UI polish — the trio (design-tokenization / make-interfaces-feel-better / react-component-patterns) covers tokens, motion, and composition, but no focus management, keyboard navigation, ARIA, or reduced-motion (notable since MIFB prescribes animations). User decision 2026-07-05 (picker, verbatim): "create a separate plan for both" — this is that plan.

## Context & rationale

- **Why separate from [[docks-kit-refresh]]:** that plan is a refresh of existing content; new skills deserve the full write-skill authoring cycle (research, CSO description with near-miss pass, references, scoring) and their own review round.
- **commit-discipline also becomes the single home** for the currently-scattered commit rules — the three skills above get pointer lines to it (a follow-up edit inside this plan, not kit-refresh).
- **a11y boundary risk:** must route cleanly against the UI trio — its description needs "Not for…" clauses against MIFB (visual polish) and react-component-patterns (composition). Reduced-motion is a pure ADD: MIFB has no `prefers-reduced-motion` content (grep empty), so the a11y skill supplies the guard MIFB's animation recipes currently lack — a complement, not an overlap.
- **Contrast decision (user via picker, 2026-07-05, verbatim: "Exclude — tokens own it"):** color-contrast (WCAG 1.4.3) stays OUT of the a11y skill — design-tokenization keeps owning contrast (it already covers dark-mode contrast bugs and token parity); the a11y description routes contrast asks there via a "Not for…" clause.
- commit-discipline lands in `engineering/` — its three routing neighbors are all engineering, so the category is decided; only the exact leaf names (commit-discipline slug, a11y skill name) and reference lists stay open for the write-skill near-miss pass to decide at execution time.

## Environment & how-to-run

Author via the `write-skill` skill (docks bundled). Gates: scorer `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/docks/skills` (engineering floor 10 / productivity floor 8 per file) · hash `node scripts/skills/content-hash.mjs --backfill plugins/docks/skills` · collision `node tests/skill-trigger-collision.mjs plugins/docks/skills` · full `node scripts/ci.mjs` exit 0 before any commit · release (if bundled with a docks release, user-gated at that time).

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Author `commit-discipline` via write-skill: research current commit/PR conventions, draft CSO description (near-miss vs fix-workflow/dep-vuln/refactor), body + references, scorer ≥ floor | new dir under plugins/docks/skills/engineering/ (leaf name decided by write-skill pass) | — | planned |
| 2 | Add pointer lines from the three commit-rule-scattering skills to commit-discipline (one line each, no restructuring) | dep-vuln-workflow, fix-workflow, refactor SKILL.md files | 1 | planned |
| 3 | Author the a11y skill via write-skill: research, CSO description with near-miss pass vs the UI trio (Not-clauses incl. touch-target → MIFB, contrast → design-tokenization), body + references covering focus management, keyboard, ARIA, reduced-motion, scorer ≥ floor | new dir under plugins/docks/skills/engineering/ | — | planned |
| 4 | Gates: hash backfill, scorer, collision, full ci.mjs green; fold into the next docks release (user-gated) | — | 1-3 | planned |

## Acceptance criteria

- Both new SKILL.md files pass `skill-guard.mjs score --per-file` at or above their category floor with honest content.
- `node tests/skill-trigger-collision.mjs plugins/docks/skills` stays green; a ≥3-prompt near-miss table per new skill (vs the named neighbors) is recorded in `## Notes`.
- `node scripts/ci.mjs` → exit 0.

## Out of scope / do-NOT-touch

- Everything [[docks-kit-refresh]] owns (the refresh fixes, now shipped) — this plan only ADDS skills + three pointer lines.
- effect-kit / session-relay plugins.
- **Touch-target / hit-area sizing stays in MIFB** (make-interfaces-feel-better SKILL.md, the 40×40px rule; its surfaces reference carries the WCAG 44×44 note) — the a11y skill routes users there via its "Not for…" clause and must NOT duplicate the rule.
- **Color-contrast (WCAG 1.4.3) stays in design-tokenization** (user decision, picker 2026-07-05) — the a11y skill routes contrast asks there via its "Not for…" clause; no contrast-audit section in a11y.

## STOP conditions

- If `node tests/skill-trigger-collision.mjs plugins/docks/skills` flags the a11y skill vs make-interfaces-feel-better or react-component-patterns, narrow the a11y description to accessibility-specific verbs (focus / keyboard / ARIA / screen-reader / `prefers-reduced-motion`) — do NOT loosen or exclude-list the collision test to force it green.
- If a step-2 pointer line would require restructuring a target skill's body (anything beyond a one-line add), STOP and report — restructuring is out of this plan's scope.

## Cold-handoff checklist

1 file manifest — partial by design (leaf names decided by the write-skill pass; categories fixed to engineering/; the three pointer-target files are named) · 2 environment & commands ✓ · 3 contracts ✓ (floors, CSO, collision) · 4 executable acceptance ✓ · 5 out-of-scope ✓ (incl. touch-target → MIFB, contrast → design-tokenization fences) · 6 rationale ✓ · 7 gotchas — a11y/MIFB boundary noted in Context + STOP conditions · 8 constraints ✓ (floors never loosened) · 9 no undefined terms ✓.

## Self-review

Score: 86/100 at scaffold (parked-tier single pass). A fresh-context draft audit (plan-review, 2026-07-05, post-kit-refresh-ship) re-scored it 86/100 and returned 5 should-fixes + 3 nits, all ingested: re-baseline done, plan-manager dropped from the pointer targets (its auto-commit rule is plan-lifecycle, not commit discipline), commit-discipline category fixed to engineering/, touch-target and contrast fences added to Out-of-scope, STOP conditions added, reduced-motion reframed as a pure ADD, step 3 now enumerates the full authoring cycle. Known softness, accepted: exact leaf names and reference lists are execution-time decisions owned by the write-skill pipeline — pre-deciding them without its research pass would be guessing. `planned_at_commit` was re-baselined `fbba04d → cf00b5c` on 2026-07-05 after [[docks-kit-refresh]] shipped; the audit's drift check (54 files changed in plugins/docks/skills/) confirmed no cited anchor moved — dep-vuln:70-97 and fix-workflow:159 hold at HEAD.

## Review

(filled by plan-review on completion)

## Sources

- The 2026-07-05 six-auditor sweep (overlap/removability report, sections B–C) — gap evidence: dep-vuln:70-97 split commits, fix-workflow:159 one-commit-per-tier, MIFB 40×40 hit-area as the kit's only a11y-adjacent rule (all re-verified at `cf00b5c`, post-kit-refresh; MIFB grep for `prefers-reduced-motion` still empty).
- [[docks-kit-refresh]] `## Notes` — the audit record this plan's gaps were filed from.
