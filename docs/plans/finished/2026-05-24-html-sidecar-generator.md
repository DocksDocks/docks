---
title: Add plan-sidecar skill + simplified HTML standard
goal: Ship a plan-sidecar skill that authors plan HTML sidecars + the index.html dashboard from shared assets (per-plan latitude), simplify the AGENTS.md standard, and wire plan-manager to invoke it
status: finished
created: 2026-05-24
updated: 2026-05-25
started_at: 2026-05-24
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: 56869c392d17c8df2df087b8fd5fe188edfecffb
tags: [plans, html, skill, dashboard]
affected_paths:
  - plugins/docks/skills/productivity/plan-sidecar/SKILL.md
  - plugins/docks/skills/productivity/plan-sidecar/references/templates.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - docs/plans/AGENTS.md
  - docs/plans/index.html
  - docs/plans/finished/2026-05-24-scaffold.html
  - docs/plans/planned/20260512-plan-review-smoke.html
related_plans: [pipelines-to-skills, tree-skill]
review_status: passed
---

# Add plan-sidecar skill + simplified HTML standard

## Goal

Make the HTML sidecar contract real — as a **skill**, not a generator script. The standard exists (`docs/plans/AGENTS.md` § "HTML sidecar") and the shared assets exist (`docs/plans/_assets/dashboard.{css,js}`, commit `6c73fe3`), but **no `.html` has ever been authored** — plan-manager claims it "regenerates" sidecars, yet nothing does. Build a cross-tool `plan-sidecar` skill that turns a plan `.md` into its `.html` sidecar and (re)builds `docs/plans/index.html`, using the shared assets and the documented `data-*` contract, with **per-plan latitude** (a plan may add visualization beyond the floor as long as every css/js hook still resolves). Simplify the AGENTS.md standard from a deterministic-generation spec into a skill-authoring contract, and replace plan-manager's hand-generation language with an invocation of the skill. Ship the skill + the dashboard + 2 exemplar sidecars (one finished, one planned) — not a full backfill; the skill authors the rest on each plan's next touch.

## Context

Re-spec of the original "deterministic plan HTML sidecar generator" plan. The user's call (2026-05-24): **a separate skill, not a `scripts/gen-plan-html.sh` generator** — "instead of just creating a generator that doesn't fit for us, I wanted just a standard for the html as we would have a .js and .css file for all of them, but some cases may differ according to each plan, since it's for a better visualization of a plan." So: one shared standard (css + js + `data-*` contract) that every sidecar conforms to, authored by a skill that has latitude to tailor each plan's view. This mirrors the kit's own direction — cross-tool skills over Claude-only scripts (see `pipelines-to-skills`) — and the saved preference "skill + documented standard over a deterministic generator script."

The `.md` stays canonical and is the only thing agents read; the `.html` is a derived, browser-only artifact (collapsible sections, click-to-copy, status color). Because authoring it well needs judgment (per-plan emphasis, "better visualization"), it belongs in a skill an agent runs — not a rigid transform.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Lock decisions: skill (not script); simplified standard; per-plan latitude; check in `.html`; 2 exemplars (not full backfill) | — | — | done | self |
| 2 | Create `plugins/docks/skills/productivity/plan-sidecar/SKILL.md` + `references/templates.md` (sidecar + dashboard modes, shared-asset contract, latitude) | 1 | — | done | self |
| 3 | Simplify `docs/plans/AGENTS.md` § HTML sidecar for skill-authoring — keep the load-bearing `data-*` contract, drop the generator-script language, point to `plan-sidecar` | 1 | with #4 | done | self |
| 4 | Wire `plan-manager` SKILL.md — constraint + Step 7.5 invoke `plan-sidecar` instead of describing hand-generation | 1 | with #3 | done | self |
| 5 | Author `docs/plans/index.html` dashboard — every plan across categories, filter/sort, shared assets | 2 | with #6 | done | self |
| 6 | Author 2 exemplar sidecars: `finished/2026-05-24-scaffold.html` + `planned/20260512-plan-review-smoke.html` | 2 | with #5 | done | self |
| 7 | `content_hash` backfill (plan-sidecar, plan-manager) + `bash scripts/ci.sh` green | 2, 4 | — | done | self |
| 8 | Ship — feat commit, plan-manager ship (→ finished, regen this plan's own sidecar), plan-review | 3–7 | — | done | self |

### Step details

- **#2** — One skill, two modes by argument: `plan-sidecar <plan.md>` authors one sidecar; `plan-sidecar dashboard` (re)builds `index.html`. Body holds the workflow + contract essentials + BAD/GOOD + gotchas + latitude; the full HTML skeletons live in `references/templates.md` (loaded on demand). `user-invocable: true` (plan-* family) so it runs standalone AND is invoked by plan-manager.
- **#3** — AGENTS.md keeps the policy (md-canonical, assets path, the `data-*` attribute table, checked-in default) and points to the skill for the authoring template. Removes the verbose full-template block and the script-oriented "Generation contract" (byte-identical no-op / hash skip-write → one-line "skip if unchanged").
- **#4** — plan-manager Step 7.5 becomes "activate the `plan-sidecar` skill for the touched plan, then `dashboard` mode" — keeping the .md-canonical / never-read-the-.html rules. Step 8 still re-runs it after plan-review writes `## Review`.
- **#6** — Exemplars chosen for variety: scaffold (finished — green badge, full Steps/Mistakes/Review) and plan-review-smoke (planned — gray badge, queued token, empty Review auto-collapses). Dashboard links these two to `.html`; the other rows link to `.md` until their sidecars are authored on next touch.

## Acceptance criteria

- [x] `plan-sidecar` skill exists (scores 15/15, well above the productivity floor 8) and documents sidecar + dashboard modes + the shared-asset `data-*` contract + per-plan latitude
- [x] `docs/plans/AGENTS.md` § HTML sidecar is simplified for skill-authoring (keeps the `data-*` contract; points to `plan-sidecar`; no generator-script language)
- [x] `plan-manager` SKILL.md invokes `plan-sidecar` instead of describing hand-generation (constraint + Step 7.5)
- [x] `docs/plans/index.html` lists every plan with working filter/sort, using `_assets/dashboard.{css,js}`
- [x] 2 exemplar sidecars render correctly (status badge, sections, steps `data-status`, embedded `plan-data` JSON, `_assets` refs, zero inline styles)
- [x] `bash scripts/ci.sh` green; `content_hash` re-synced for changed skills

## Out of scope

- A `scripts/gen-plan-html.sh` generator or any deterministic transform — superseded by the skill (the whole point of this re-spec)
- Full backfill of all plans' sidecars — only 2 exemplars now; the skill authors the rest on each plan's next plan-manager touch
- Restyling `dashboard.css` / `dashboard.js` — consumed as-is
- A CI freshness guard (`guard-plan-html.sh`) — sidecars are skill-authored, not lockstep-generated, so a byte-freshness guard doesn't apply; revisit if drift becomes a problem
- Rendering non-plan markdown

## Mistakes & Dead Ends

- **2026-05-24** (re-spec: script → skill): the plan originally specced `scripts/gen-plan-html.sh`, a deterministic bash+python generator, plus a CI freshness guard. → The user rejected a generator that "doesn't fit for us" and asked for a standard + a skill with per-plan latitude ("some cases may differ according to each plan… for a better visualization"). A rigid transform can't exercise that judgment, and a freshness guard only makes sense for lockstep-generated output. → Rewrote as the cross-tool `plan-sidecar` skill consuming the existing shared assets; AGENTS.md simplified from a generation spec to an authoring contract; plan-manager invokes the skill. Slug kept (`html-sidecar-generator`) as the stable ID; title updated.

## Sources

- `docs/plans/AGENTS.md` § "HTML sidecar (browser view)" (repo) — the standard being simplified: sidecar structure, dashboard structure, the `data-*` attribute table the css/js depend on
- `docs/plans/_assets/dashboard.css` + `dashboard.js` (repo, commit `6c73fe3`) — shared assets the skill references (status colors, collapsible sections, click-to-copy, dashboard filter/sort)
- `plugins/docks/skills/productivity/plan-manager/SKILL.md` (repo) — the HTML-sidecar constraint + Step 7.5 / Step 8 this plan rewires to invoke the skill
- `plugins/docks/skills/productivity/scaffold/SKILL.md` (repo) — sibling generative-skill pattern (modes by argument, references/ for verbose templates)

## Blockers

(none — actionable immediately; shared assets already landed in `6c73fe3`)

## Notes

- **Origin**: deferred out of the pipelines-to-skills ship review (2026-05-24). Earlier ships (foundation, skill-maintainer, scaffold, tree) all skipped sidecar generation, confirming the gap was the missing author — now filled by the skill, not a script.
- **Checked-in `.html`**: per the user ("Check in all .html") and the AGENTS.md default. No `.gitignore` stanza.
- **Dogfood at ship**: when this plan moves ongoing → finished, plan-manager runs `plan-sidecar` on it, so the finished plan gets its own sidecar — the skill validated end-to-end on its own plan.

## Review

- **Goal met:** yes — `plan-sidecar` skill ships (scores 15/16, above the productivity floor of 8) documenting sidecar + dashboard modes, the shared-asset `data-*` contract, and per-plan latitude; `docs/plans/AGENTS.md` simplified to a skill-authoring contract (6 `data-*` refs retained, zero generator-script language, points to the skill); `plan-manager` constraint + Step 7.5 rewired to invoke the skill; `index.html` lists all 8 plans with live filter/sort; 2 exemplar sidecars conform. All 6 `[x]` acceptance criteria verified against the `56869c3` diff and current tree.
- **Regressions:** none — no inline `<style>` or external `<script src="http…">` in any of the 3 authored HTML files; both exemplars link `../_assets/`, the dashboard links `_assets/` (no `../`); steps use the hyphenated `in-flight` key the CSS targets (`docs/plans/planned/20260512-plan-review-smoke.html:74`); the empty Review section auto-collapses (`...smoke.html:165`); JSON island present in both. The 2-exemplar count (not full backfill) is an explicit Out-of-scope descope, not drift.
- **Scope drift:** none against `affected_paths` — all 7 listed paths appear in the ship commit. Unannounced (expected): the plan file's own `planned/ → ongoing/` `git mv` (later `→ finished/` at ship).
- **CI:** pass — `bash scripts/ci.sh` exit 0, every section green; `content_hash` for `plan-sidecar` + `plan-manager` in sync (idempotency check passed). The workflow-YAML step skips gracefully (no local pyyaml; tag-CI validates on GitHub).
- **Follow-ups:** none — remaining sidecars author themselves on each plan's next `plan-manager` touch, by design.
- Filed by: plan-review on 2026-05-25T00:02:00-03:00
