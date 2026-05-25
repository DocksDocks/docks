---
title: Add a deterministic plan HTML sidecar generator
goal: Build a scripts/ generator that renders each plan .md into its .html sidecar + index.html dashboard per the AGENTS.md standard, backfill all plans, and wire it into plan-manager
status: planned
created: 2026-05-24
updated: 2026-05-24
started_at: null
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: [plans, html, tooling, dashboard]
affected_paths:
  - scripts/gen-plan-html.sh
  - scripts/ci.sh
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - docs/plans/AGENTS.md
  - docs/plans/index.html
  - .gitignore
related_plans: [pipelines-to-skills]
review_status: null
---

# Add a deterministic plan HTML sidecar generator

## Goal

Make the HTML sidecar contract real. The standard exists (`docs/plans/AGENTS.md` § "HTML sidecar (browser view)") and the shared assets exist (`docs/plans/_assets/dashboard.{css,js}`, commit `6c73fe3`), but **no `.html` sidecar has ever been generated** — the plan-manager skill says it "regenerates" them, yet there is no generator, so in practice every ship skips it. Hand-authoring conformant HTML per ship is unsustainable. Build a deterministic generator that turns any plan `.md` into its `.html` sidecar and rebuilds `docs/plans/index.html`, backfill all existing plans, and replace the plan-manager "regenerate by hand" step with a call to the generator.

## Context

Surfaced by the pipelines-to-skills ship (2026-05-24): the plan-manager contract (constraint block + Step 7.5 + Step 8 in `plugins/docks/skills/productivity/plan-manager/SKILL.md`) mandates sidecar + dashboard regeneration on every plan touch, but the generation logic was never implemented. The `.md` is canonical and is the only thing agents read; the `.html` is a derived, browser-only artifact. Because it is purely a deterministic transform of the `.md` + the shared assets, it belongs in a script — not in per-ship manual authoring.

The AGENTS.md standard is the spec to implement against: per-section `data-section`, status `data-status`, steps `data-progress`, dashboard rows `data-status`/`data-assignee`/`data-tags`, frontmatter embedded as JSON in `<script id="plan-data">`, assets referenced via `../_assets/dashboard.{css,js}`.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Decide generator language + markdown-subset scope (open Q) | — | — | planned | self |
| 2 | Write `scripts/gen-plan-html.sh <plan.md>` — frontmatter→JSON, body→sections, steps table→`<table class="steps">`, emit per AGENTS.md template | 1 | — | planned | self |
| 3 | Add dashboard mode — `gen-plan-html.sh --dashboard` rebuilds `docs/plans/index.html` from every plan across categories | 2 | — | planned | self |
| 4 | Idempotency: re-running on an unchanged plan produces byte-identical output (skip-write parity with the AGENTS.md contract) | 2 | with #3 | planned | self |
| 5 | Backfill — generate sidecars for all existing plans + `index.html` | 2, 3 | — | planned | self |
| 6 | Decide checked-in vs gitignored (open Q); update `.gitignore` if gitignored | 5 | — | planned | self |
| 7 | Wire into plan-manager — replace the hand-regenerate language in SKILL.md Step 7.5 / Step 8 with a `scripts/gen-plan-html.sh` invocation | 2, 3 | — | planned | self |
| 8 | (Optional) `scripts/guard-plan-html.sh` — every tracked plan `.md` has an up-to-date `.html` (skip if gitignored); add to ci.sh | 5, 6 | — | planned | self |
| 9 | `bash scripts/ci.sh` green | 7, 8 | — | planned | self |

### Step details

- **#1** — Markdown→HTML in bash+sed is fragile (tables, code fences, nested lists). Lean: a small Python (stdlib-only, no pip deps) renderer covering exactly the subset plan files use — ATX headings, GFM tables, `-`/`[x]` lists, fenced code, inline code, links, bold. Bash wrapper (`gen-plan-html.sh`) shells to it so ci.sh stays shell-uniform. Alternative: pure-bash if the subset proves small enough. Confirm with user.
- **#2** — Emit the exact structure documented in `docs/plans/AGENTS.md` § "Sidecar HTML structure". The `data-*` attributes are load-bearing for `dashboard.css`/`dashboard.js` — generate them, don't inline styles.
- **#4** — The AGENTS.md "Generation contract" requires skip-write when the parsed projection is unchanged. Hash the generated HTML (or its parsed inputs) to detect no-ops, mirroring the `skill-content-hash.sh` pattern.
- **#7** — After this lands, the plan-manager skill's Step 7.5 becomes "run `bash scripts/gen-plan-html.sh <path>` then `--dashboard`" instead of "hand-render per the standard". Keep the .md-is-canonical / never-read-the-.html rules intact.

## Acceptance criteria

- [ ] `scripts/gen-plan-html.sh <plan.md>` emits a sidecar matching the AGENTS.md structure (data-status, data-section, data-progress, embedded frontmatter JSON, `../_assets/` refs)
- [ ] `--dashboard` rebuilds `docs/plans/index.html` with filter/sort over every plan
- [ ] Re-running the generator on an unchanged plan is a byte-identical no-op
- [ ] All existing plans have sidecars; `index.html` lists them all
- [ ] plan-manager SKILL.md invokes the generator instead of describing hand-authoring
- [ ] Checked-in vs gitignored decision recorded and applied
- [ ] `bash scripts/ci.sh` green

## Out of scope

- A live-reload dev server or any runtime for the dashboard — it's a static file
- Markdown features beyond what plan files actually use (no images, footnotes, HTML passthrough)
- Rendering non-plan markdown (skills/agents/docs stay out)
- Restyling `dashboard.css` / `dashboard.js` — this plan consumes the existing assets as-is

## Mistakes & Dead Ends

(none yet — plan freshly written)

## Sources

- `docs/plans/AGENTS.md` § "HTML sidecar (browser view)" (repo) — the standard to implement: sidecar structure, dashboard structure, generation contract, data-* attribute table
- `docs/plans/_assets/dashboard.css` + `dashboard.js` (repo, commit `6c73fe3`) — shared assets the generator references
- `plugins/docks/skills/productivity/plan-manager/SKILL.md` (repo) — Step 7.5 / Step 8 + the HTML-sidecar constraint block this plan wires the generator into
- `scripts/skill-content-hash.sh` (repo) — idempotency/no-op-write pattern to mirror for skip-write detection

## Blockers

(none — actionable immediately; independent of the other planned plans)

## Notes

- Origin: deferred out of the pipelines-to-skills ship review (2026-05-24). The two earlier ships (foundation, skill-maintainer) also skipped sidecar generation, confirming the gap is the missing generator, not a one-off miss.
- Open questions:
  - Generator language — Python stdlib renderer (robust on tables/code fences) vs pure bash+sed (shell-uniform, fragile). Lean: Python stdlib, no pip deps.
  - Checked-in vs gitignored — AGENTS.md default is checked-in until plan count makes the noise tedious. With ~8 plans today, lean: gitignore the per-plan sidecars, keep `index.html` + `_assets/` tracked (the `.gitignore` stanza is already documented in AGENTS.md). Revisit if teammates need GitHub-rendered views.
  - CI guard — worth a freshness guard, or trust plan-manager to always regenerate? Lean: add the guard only if sidecars are checked in (freshness matters); skip if gitignored.

## Review

(filled by plan-review on completion)
