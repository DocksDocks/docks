---
title: Plans system v2 — lean, .md-only, self-reviewing
goal: Replace the 5-folder + committed-HTML plan system with active/+finished/, status-as-a-field, .md-only tracking, on-demand visual HTML for visual decisions, and a baked-in draft→self-review→open-questions loop
status: ongoing
created: "2026-06-14T05:02:06+00:00"
updated: "2026-06-14T05:09:31+00:00"
started_at: "2026-06-14T05:09:31+00:00"
assignee: null
tags: [meta, dogfood, plans-v2]
affected_paths:
  - docs/plans/AGENTS.md
  - docs/plans/CLAUDE.md
  - docs/plans/_views/
  - docs/plans/_assets/
  - docs/plans/_open_questions/
  - docs/plans/index.html
  - .gitignore
  - plugins/docks/skills/productivity/plan-init/
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-sidecar/
related_plans: []
review_status: null
---

# Plans system v2 — lean, .md-only, self-reviewing

> Written in the v2 model it proposes (lives in `active/`, status is the
> frontmatter field, no `.html`/`.js` sidecar). Step 1 makes the contract match.

## Goal

Make `docs/plans/` make the user's *and* the agent's life easier by removing every artifact that isn't the source of truth, and by making a freshly-drafted plan arrive already hole-checked.

## Context

Decisions reached with the user (2026-06-14 session):

- **One tracked format — the `.md`.** Committing derived views (`_views/*.html`, `_assets/plans-data.js`, `index.html`) is the "3 files to update" pain and a known anti-pattern; agents also parse markdown far cheaper than HTML, so HTML hurts the compaction-recovery the user values. Evidence that the dual-write already fails: only **7 of 19** finished plans have a `_views/` sidecar — the rest silently drifted.
- **Folders are the index.** `active/` + `finished/`; `ls` is the list, `plan-manager` renders the rich status/age/progress glance on demand (computed, never stored). No `index.md`, no `plans-data.js`.
- **Status is a frontmatter field**, not a directory. `planned/ongoing/blocked/scheduled` become `status:` values inside `active/`; a transition is a field edit, not a `git mv`. Only `active → finished` moves a file. Removes the dual-encoding (status was stored in both folder + field, required to match).
- **HTML earns its place only for *visual* decisions** — when an open question is about how something looks (component options, layout, palette), the agent renders the options as a *self-contained, self-styled, throwaway* `.html` and surfaces it; otherwise text/choice questions go through native multiple-choice. Ephemeral, gitignored, never a per-plan artifact. (Caveat: "open in browser" only works where a display exists; headless sessions hand back the file path.)
- **Self-review is baked in.** A plan is drafted, then red-teamed against a fixed rubric *before* it reaches the user — turning the user's manual "review each detail and revalidate" into an automatic step. Two question layers: agent→agent (verification rubric, resolved internally) and agent→user (`## Open questions`, the residue needing a human).

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | Rewrite the contract: `docs/plans/AGENTS.md` + `plan-init`'s template — two folders, status-as-field, `.md`-only, lean required spine (Goal/Steps/Acceptance/Review) + optional sections, the self-review rubric, the two question layers, on-demand visual HTML. Keep the `AGENTS.md`+`CLAUDE.md` pair (tree/guard). | — | planned |
| 2 | `.gitignore` ephemeral renders (`docs/plans/**/*.html`, `docs/plans/.rendered/`); `git rm` the tracked `_views/`, `_assets/`, `index.html`. | 1 | planned |
| 3 | Rewrite `plan-init`: seed only `active/` + `finished/` + the new `AGENTS.md`/`CLAUDE.md`; drop `_assets/_views/_open_questions/index.html` seeding and the `plan-sidecar` assets-mode call. | 1 | planned |
| 3b | **v1→v2 idempotent migration in `plan-init`.** Detect an old-model `docs/plans/` (any of `planned/ongoing/blocked/scheduled/` dirs, `_views/`, `_assets/`, `index.html`, or a contract saying "status must match directory") and migrate: `git mv` non-finished plans into `active/` (keep their `status` field as-is), keep `finished/`, `git rm` the derived artifacts, rewrite the contract + gitignore renders. No-op when already v2. | 1,3 | planned |
| 4 | Rewrite `plan-manager`: status-field transitions (edit field; `git mv` only on `→ finished`); the **draft → self-review (rubric) → open-questions** scaffold loop; `AskUserQuestion` for text/choice, on-demand visual HTML for visual choices; listing reads the `status` field; auto-commit on transition (D-4); drop Step 7.5 (sidecar refresh). | 1 | planned |
| 4b | **Deprecation detection in `plan-manager`.** On any op, if it sees an old-model layout, surface it and offer to trigger `plan-init`'s v1→v2 migration (3b) rather than operating on a mixed model. | 3b,4 | planned |
| 5 | Resolve `plan-review` vs draft-review (OQ-3): expose the self-review rubric for `planned/` drafts (fold into plan-manager or make plan-review dual-mode), keep finished-plan verification. | 1 | planned |
| 6 | Resolve `plan-sidecar` fate (OQ-2): delete + fold visual-render instruction into plan-manager, or keep a slim rescoped helper. Update `plugins/docks/skills/AGENTS.md` plan-skill list + transform-guard list if the skill set changes. | 4 | planned |
| 7 | Migrate this repo's `docs/plans/`: retire empty `planned/ongoing/blocked/scheduled` dirs; `finished/` stays; this plan stays in `active/`. Resolve OQ-5 (touch the 19 finished plans or leave). | 2 | planned |
| 8 | Update every cross-reference to the old model: root `AGENTS.md` Plans section, the plan-* skill descriptions/bodies, `scripts/AGENTS.md`/`.github` if they name plan dirs, the scaffold spec if it seeds plan structure. | 1,3,4,5,6 | planned |
| 9 | Bookkeeping + validate: `metadata.updated` bump + `content-hash --backfill` on every changed skill; per-file scores ≥ category floor; `bash scripts/ci.sh` green; commit + push. | 8 | planned |

## Acceptance criteria

- `git ls-files 'docs/plans/**/*.html' 'docs/plans/**/*.js'` returns **nothing** (no tracked derived artifacts).
- `docs/plans/` contains only `active/`, `finished/`, `AGENTS.md`, `CLAUDE.md` — no `_views/ _assets/ _open_questions/ index.html`.
- A new plan scaffolded by `plan-manager` arrives with the self-review rubric already applied and a populated `## Open questions` (or an explicit "none") — verify on one throwaway plan.
- No `plan-*` skill body or `docs/plans/AGENTS.md` references committed sidecars, `plans-data.js`, the dashboard, or the 5-folder model.
- Running `plan-init` on an old-model `docs/plans/` migrates it to v2 idempotently (re-run = no-op); `plan-manager` flags a deprecated layout and offers the migration instead of silently operating on it.
- `bash scripts/ci.sh` green; `plan-*` skills each ≥ productivity floor (8); idempotency check passes.

## Out of scope

- A TUI/board renderer (the on-demand glance is `plan-manager`'s chat output; richer viewers are a later idea).
- Changing the `## Steps` table shape or the pretty-print tiers beyond what status-as-field requires.
- Auto-executing plans on a schedule beyond what OQ-1 decides.

## Decisions (open questions resolved 2026-06-14)

- **D-1 (was OQ-1) — `scheduled` stays as a status** inside `active/` (`scheduled_date` + `date`/`manual-approval` trigger), but the `.misfires.log` machinery is dropped.
- **D-2 (was OQ-2) — delete `plan-sidecar`.** The "render visual open-question options to a throwaway HTML and surface it" behavior folds into `plan-manager` as an instruction; no standalone skill.
- **D-3 (was OQ-3) — self-review is inline always, plus a fresh-context subagent review** for big/risky plans (steps > 6 or a risk-flagged step). Small stubs get the inline rubric only — proportional.
- **D-4 (was OQ-4) — `plan-manager` auto-commits the `.md`** on each status transition, with a clear message; the user can amend. This plan's `planned → ongoing` flip is the first dogfood.
- **D-5 (was OQ-5) — leave the 19 `finished/` plans untouched** as an archive (their `status:` already reads `finished`).
- **D-6 (was OQ-6) — keep a lean *text* open-questions fallback** for headless/Codex (no `AskUserQuestion` UI); drop the file-based `_open_questions/*.answers.json` + HTML-export path entirely.

## Self-review (rubric pass on this draft)

Dogfooding the loop — holes caught while drafting and how they were resolved:

- **Evidence re-verify:** confirmed `_views/` holds 7 sidecars for 19 finished plans (drift is real, not assumed); confirmed `planned/ongoing/blocked/scheduled` are currently empty, so Step 7 is "retire empties," not "migrate contents."
- **Goal coverage:** added Step 8 (cross-references) after noticing Steps 1–7 changed the system but left the root `AGENTS.md` Plans section and skill descriptions pointing at the old model — a fresh agent would have shipped a contradiction.
- **Checkable acceptance:** replaced "no committed HTML" (judgment) with a `git ls-files` command that returns nothing.
- **Assumptions → questions:** every place this draft would otherwise *guess* (scheduled, sidecar fate, review depth, commit cadence, finished migration, fallback) became an OQ instead of a silent default.
- **Dependency order:** Step 6 depends on Step 4 (the visual-render instruction must exist before plan-sidecar is folded into it); Step 9 gates on all.
- **User-caught hole (2026-06-14):** the draft migrated only *this* repo's plans (Step 7) but never said what happens when the v2 skills meet an existing consumer project on the old layout. Added Steps 3b (idempotent v1→v2 migration in plan-init) + 4b (deprecation detection in plan-manager). The cold-handoff check *should* have caught "what about existing installs?" — the human review layer did, which is the loop working as designed.

## Sources

- `plugins/docks/skills/productivity/plan-manager/SKILL.md` — Step 5 `git mv` transitions + Step 7.5 sidecar refresh + the `status` field edit that must match the directory (the dual-encoding); the parts Steps 4/6 rewrite.
- `plugins/docks/skills/productivity/plan-sidecar/SKILL.md` — the committed-HTML + `_assets/` machinery Steps 2/6 retire.
- `plugins/docks/skills/productivity/plan-init/SKILL.md` + `references/plans-agents-md-template.md` — the contract template Steps 1/3 rewrite (embedded-template, written verbatim into consumers).
- `docs/plans/_views/` (7 files) + `_assets/{dashboard.css,dashboard.js,plans-data.js}` + `index.html` — tracked derived artifacts Step 2 `git rm`s.
- `docs/plans/AGENTS.md` — the per-project contract (source of truth) Step 1 rewrites; `scripts/AGENTS.md` "plan-skill contract sync" rule means all plan-* skills change in lockstep.

## Mistakes & Dead Ends

(none yet)

## Notes

`plan-sidecar`'s `metadata.updated`/`content_hash` were bumped earlier today by the skill-optimization pass; if Step 6 deletes the skill, drop it from the transform-guard list and the scaffold spec too.

## Review

(filled by plan-review on completion)
