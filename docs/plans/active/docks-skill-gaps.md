---
title: docks skill gaps — author commit-discipline + a11y skills
goal: Fill the two coverage gaps the 2026-07-05 kit audit surfaced — a commit/PR-hygiene skill (no current owner) and an accessibility skill (missing from the UI-polish trio) — each through the full write-skill authoring cycle.
status: in_review
created: "2026-07-05T18:31:55-03:00"
updated: "2026-07-05T21:34:27-03:00"
started_at: "2026-07-05T20:47:46-03:00"
in_review_since: "2026-07-05T21:32:54-03:00"
assignee: claude
tags: [docks, skills, authoring, coverage-gap]
affected_paths:
  - plugins/docks/skills/engineering/
  - plugins/docks/skills/productivity/
related_plans: [docks-kit-refresh]
review_status: passed
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
| 1 | Author `commit-discipline` via write-skill: research current commit/PR conventions, draft CSO description (near-miss vs fix-workflow/dep-vuln/refactor), body + references, scorer ≥ floor | new dir under plugins/docks/skills/engineering/ (leaf name decided by write-skill pass) | — | done |
| 2 | Add pointer lines from the three commit-rule-scattering skills to commit-discipline (one line each, no restructuring) | dep-vuln-workflow, fix-workflow, refactor SKILL.md files | 1 | done |
| 3 | Author the a11y skill via write-skill: research, CSO description with near-miss pass vs the UI trio (Not-clauses incl. touch-target → MIFB, contrast → design-tokenization), body + references covering focus management, keyboard, ARIA, reduced-motion, scorer ≥ floor | new dir under plugins/docks/skills/engineering/ | — | done |
| 4 | Gates: hash backfill, scorer, collision, full ci.mjs green; fold into the next docks release (user-gated) | — | 1-3 | done |

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

## Notes

**Execution record (2026-07-05).** Steps 1 and 3 ran as parallel fresh-context authoring agents (disjoint neighbor sets and target dirs), each following write-skill + the skills AGENTS.md contract with live-source research; step 2 and the gates ran in the main session.

- **commit-discipline** (`engineering/commit-discipline/`, SKILL.md 237 lines, no references). Name kept over `commit-hygiene` (dep-vuln's "Security vs Hygiene" split owns the word "hygiene") and `pr-hygiene` (under-claims the commit half); parallels `type-safety-discipline`. Description 495 chars. Sources fetched live: Conventional Commits v1.0.0, GitHub PR-merge + review docs, git-rebase docs (`--autosquash`, `--fixup=amend:/reword:`, `--update-refs`).
- **accessibility** (`engineering/accessibility/`, SKILL.md 213 lines + references/focus-management.md 136 + references/aria-widget-patterns.md 114, both with `## Contents` TOCs). Name kept full-word per kit style (`security`, `refactor`); rejected `a11y-foundations`. Description 496 chars. Both fences honored: zero touch-target sizing values and zero contrast content in the body — the WCAG 2.5.8 row and contrast asks route via Not-clauses. Sources fetched live: WAI-ARIA APG (patterns, read-me-first, keyboard-interface, dialog-modal), WCAG 2.2 new-SC list, MDN (`prefers-reduced-motion`, `<dialog>`, `:focus-visible`), react.dev common components, motion.dev reduced-motion. STOP condition never triggered — accessibility appears in no top-40 overlap pair.
- **Step-2 pointer lines (one each, no restructuring):** dep-vuln-workflow Split-Strategy paragraph → sentence routing generic hygiene to commit-discipline · fix-workflow "Pairing With Other Skills" → new row (tier grouping stays) · refactor "When NOT to use" → new row (per-change revert protocol stays).

**Near-miss table — commit-discipline** (vs named neighbors): "split this dependency bump into security and hygiene commits" → dep-vuln-workflow ✓ · "group these fixes into commits by tier" → fix-workflow ✓ · "commit after each refactoring step and revert on red tests" → refactor ✓ · "review this PR diff for bugs" → code-review ✓ · "split this into reviewable commits" / "write the PR description" / "squash or rebase?" → commit-discipline ✓.

**Near-miss table — accessibility** (vs the UI trio): "the dark-mode button text is unreadable" → design-tokenization ✓ · "make the button feel better on press" → make-interfaces-feel-better ✓ · "this tap target is too small" → make-interfaces-feel-better ✓ · "build a compound Tabs component API" → react-component-patterns ✓ · "the modal doesn't trap focus" / "add keyboard navigation to this menu" / "respect reduced motion" / "screen reader doesn't announce the error toast" → accessibility ✓.

**Adversarial verification (ultracode workflow, 2026-07-05).** Before commit, both skills were run through an 8-finder × 4-lens adversarial pass (fact-accuracy with live web fetch / boundary-fence / cso-routing / kit-convention), each raw finding refuted by an independent skeptic defaulting to not-real. Result: 6 lenses clean, 2 raw findings → **1 confirmed, 1 refuted**. Confirmed (commit-discipline, fact-accuracy, high-confidence): the `Closes #N`/`Fixes #N` auto-close was stated unconditionally but GitHub only auto-closes on merge into the DEFAULT branch — and this skill recommends stacked PRs on non-default bases, where the keyword is ignored and no link is even created (silent failure). **Fixed** at SKILL.md "Linked issues" with a default-branch qualifier + re-verify cue. Refuted (accessibility, cso-routing, nit): the word "audits" in the contrast Not-clause slightly over-promises design-tokenization's token-pairing ownership — skeptic ruled it acceptable-as-written (routing target correct, nobody misrouted); left unchanged to avoid churn on a passing skill.

**Gates (all green after the fix, 2026-07-05):** hash backfill re-run for commit-discipline · scorer: both new skills 16/16 (all 27 files 16/16; floor 10) · `node tests/skill-trigger-collision.mjs plugins/docks/skills` → "PASSED: 27 skills, 4 high-overlap pair(s) all routed" · `node scripts/ci.mjs` → "All ci.mjs checks passed — 3 plugin(s) + repo-wide". Work commit: `165ee37` (both skills + 3 pointer lines + the confirmed fix). **Release fold: user-gated — deferred to the next docks release; this plan's goal (author + wire + gate the two skills) is met independent of when that release ships.**

## Review

- **Goal met:** yes — both coverage gaps closed: `commit-discipline` + `accessibility` authored via the write-skill cycle (both 16/16, engineering floor 10), three single-line pointers wired FROM dep-vuln-workflow/fix-workflow/refactor with no body restructuring, and both boundary fences hold under independent grep.
- **Regressions:** none — `node scripts/ci.mjs` → exit 0 ("All ci.mjs checks passed — 3 plugin(s) + repo-wide"); collision test green (27 skills, 4 high-overlap pairs all routed); the adversarial-confirmed `Closes #N`/`Fixes #N` default-branch qualifier fix is present (commit-discipline SKILL.md, "Linked issues").
- **Boundary fences (grep-verified, not trusted from Notes):** accessibility touch-target/contrast grep → 1 hit, the "Companion skills" routing label ("hit areas"), zero sizing values and zero contrast ratios; the 2.5.8 target-size row routes to make-interfaces-feel-better and 1.4.x contrast audits route to design-tokenization. commit-discipline plan-ref grep → 0 hits (no plan-manager / docs/plans / plan file). Both descriptions carry the required "Not for…" clauses.
- **CI:** pass
- **Follow-ups:** none — release fold is deliberately user-gated/deferred to the next docks release and is NOT a completion gap (plan goal = author + wire + gate, met independent of release timing).
- Filed by: plan-review on 2026-07-05T21:34:27-03:00

## Sources

- The 2026-07-05 six-auditor sweep (overlap/removability report, sections B–C) — gap evidence: dep-vuln:70-97 split commits, fix-workflow:159 one-commit-per-tier, MIFB 40×40 hit-area as the kit's only a11y-adjacent rule (all re-verified at `cf00b5c`, post-kit-refresh; MIFB grep for `prefers-reduced-motion` still empty).
- [[docks-kit-refresh]] `## Notes` — the audit record this plan's gaps were filed from.
