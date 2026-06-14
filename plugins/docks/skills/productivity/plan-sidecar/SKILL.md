---
name: plan-sidecar
description: "Use when a plan .md is written, moved, or shipped and its browser view needs (re)authoring — renders the .md into docs/plans/_views/, syncs the _assets/plans-data.js dashboard data file, mirrors `## Open questions` into a #plan-questions island, and seeds the shared dashboard assets. Invoked by plan-manager after every plan touch; also standalone (\"rebuild plan sidecars\", \"refresh the plans dashboard\"). Not for reading plan state (the .md is canonical) or non-plan markdown."
user-invocable: true
metadata:
  pattern: generative-skill
  updated: "2026-06-14"
  content_hash: "e4c01f65cbdb1f79903c14bfbf052e6b7e475734a7136e910f6e8caa68eb44e8"
---

# Plan Sidecar — author a plan's browser view

`plan-sidecar` renders a plan `.md` into its `.html` sidecar (fixed home: `docs/plans/_views/`), keeps the dashboard data file `docs/plans/_assets/plans-data.js` in sync, and seeds the shared assets from masters bundled with this skill. The `.md` stays canonical — the `.html` is a derived, browser-only view that no agent ever reads. The per-project contract this skill implements lives in the project's `docs/plans/AGENTS.md` (written by `plan-init`) — that file is the source of truth when the two disagree.

<constraint>
**The `.md` is canonical; the `.html` is write-only.** NEVER read a sidecar to answer "what's the state of plan X" — read the `.md`. The sidecar is regenerated from the `.md`; if they disagree, the `.md` wins and the sidecar is stale.
</constraint>

<constraint>
**Sidecars live in `docs/plans/_views/`, and only the `.md` ever moves.** Every sidecar sits at `_views/<basename>.html` where `<basename>` is the plan's scaffold basename — NEVER renamed afterwards (on ship the `.md` gains the `YYYY-MM-DD-` prefix; the `.html` keeps its name, so URLs stay stable). On a lifecycle move the sidecar is regenerated IN PLACE — a cheap edit updating `data-status`, the badge, and the source link recomputed from the new category (`../planned/<file>.md`, `../finished/<date>-<slug>.md`, …). No `git mv`, ever.
</constraint>

<constraint>
**Values render at view time; never rewrite to refresh time.** `dashboard.js` computes age tokens in the browser from the ISO datetimes in the markup (sidecar: the `#plan-data` island; dashboard: each entry's `iso`). Baked age text is a no-JS fallback ONLY — never rewrite a sidecar or a `plans-data.js` entry just to refresh an age token, and skip-if-unchanged comparisons MUST exclude time-derived text (baked age token, `generated` footer timestamp). Content-derived values (titles, goals, steps `M/N`) stay baked — they only change when the `.md` changes, which already triggers regeneration.
</constraint>

<constraint>
**Link the shared base; never inline.** Every sidecar links `../_assets/dashboard.css` and ends with `<script src="../_assets/plans-data.js">` + `<script src="../_assets/dashboard.js">` (in that order — the data file powers the nav sidebar). NEVER inline a `<style>`/`<script>` block — styling and behavior live in asset files so one edit restyles every plan. Per-plan latitude is allowed on top: extra sections, callouts, and plan-specific `_assets/<slug>.{css,js}` linked AFTER the shared base, as long as every required `data-*` hook still resolves. Nav-sidebar and meta-strip markup are rendered by `dashboard.js` at view time — never bake them.
</constraint>

## Modes

| Invocation | Mode | What it does | Writes |
|---|---|---|---|
| `plan-sidecar <path/to/plan.md>` | sidecar | Render one plan's `.md` → `_views/<basename>.html` | `docs/plans/_views/<basename>.html` |
| `plan-sidecar dashboard` | dashboard | Sync the data file from every plan's frontmatter | `docs/plans/_assets/plans-data.js` |
| `plan-sidecar assets` | assets | Seed missing shared assets from this skill's masters | `docs/plans/_assets/*`, `docs/plans/index.html` |
| `plan-sidecar` (bare) | — | Ask: sidecar, dashboard, or assets? | — |

plan-manager invokes sidecar + dashboard modes after any plan touch; plan-init invokes assets mode at bootstrap. `index.html` is a static skeleton written ONCE (assets mode) and never edited again — a dashboard refresh edits only `plans-data.js`.

## The shared-asset contract

Master copies of the four assets ship in this skill's `assets/` directory: `dashboard.css`, `dashboard.js` (live age tokens, data-driven rows, nav sidebar, open-questions tab, meta strip — they depend on each other; seed both together), `index.html` (static dashboard skeleton), `plans-data.js` (empty data skeleton). Consumer copies live at `docs/plans/_assets/` (+ `docs/plans/index.html`). Reference them relatively: `../_assets/…` from `_views/`; `_assets/…` from `index.html`.

Load-bearing hooks the css/js target — emit these exactly:

| Element | Required attribute | Drives |
|---|---|---|
| `<body>` (sidecar) | `data-status="<category>"` + `data-slug="<basename>"` | page theming · localStorage keys |
| `<body>` (dashboard) | `class="dashboard"` | switches dashboard.js into dashboard mode |
| `.status-badge` | `data-status="<category>"` | badge color per lifecycle |
| `.plan-section` | `data-section="<slug>"` (+ `--mistakes`/`--review`/`--blockers` modifier) | collapse + section tint |
| steps `<section>` | `data-progress="<M>/<N>"` | progress display |
| steps `<td class="status">` | `data-status="done\|in-flight\|planned\|blocked\|skipped"` | per-step color |
| `<script id="plan-data">` | `type="application/json"`; MUST carry the category's age-source field (`created` / `started_at` / `blocked_since` / `scheduled_date` / `updated`) | live age token |
| `<script id="plan-questions">` | `type="application/json"` (only when `## Open questions` exists) | [Plan \| Open questions] tab pair |

dashboard.js auto-collapses any `.plan-section__content` whose text is empty — emit empty optional sections as heading + empty content div. The `.plan-meta` `<dl>` is emitted plain; dashboard.js rebuilds it into a compact chip strip at view time.

The single mistake that breaks the "one edit restyles every plan" guarantee:

```html
<!-- BAD — inlined styling/behavior; now this plan can't be restyled centrally -->
<head><style>.status-badge{background:#e8a}</style></head>

<!-- GOOD — link the shared base; theming comes from the data-* hook -->
<head><link rel="stylesheet" href="../_assets/dashboard.css" /></head>
<body data-status="ongoing"> … <span class="status-badge" data-status="ongoing"></span>
```

## Workflow — sidecar mode (`plan-sidecar <plan.md>`)

1. **Read the `.md`** (canonical). Parse frontmatter, body sections, the `## Steps` table, and `## Open questions` if present.
2. **Compute the baked age token** (no-JS fallback only) — category-specific grammar per `docs/plans/AGENTS.md`: planned `<X> queued`, ongoing `<X> in flight` (+ `(approx)` when `started_at` is null), blocked `blocked <X>`, scheduled `fires in <X>` / `DUE` / `OVERDUE by <X>`, finished `shipped <X> ago` (`shipped just now` at <60s). Units: `just now` / `<X>m` / `<X>h` / `<X>d` / `<Y>mo`. Legacy date-only frontmatter is treated as `T00:00:00<offset>`.
3. **Author the `.html`** at `docs/plans/_views/<basename>.html` from the [`references/templates.md`](references/templates.md) skeleton — `#plan-data` island (frontmatter as JSON including the category's age-source field), header, one `<section data-section>` per body section, `#plan-questions` island when `## Open questions` exists, footer source link `../<category>/<current-md-filename>`, the two script tags.
4. **Render the body Markdown** to HTML for the subset plans use — ATX headings, GFM tables, `-`/`[x]` lists, fenced + inline code, links, bold. No images, no HTML passthrough.
5. **Clean up a stale co-located sidecar** — if `docs/plans/<category>/<file>.html` exists from the pre-`_views/` convention, delete it (`git rm` when tracked) after writing the `_views/` copy.
6. **Skip if unchanged** — if the parsed projection matches the existing `.html` ignoring time-derived text (baked age token, `generated` timestamp), do not rewrite.
7. **Verify** — no `<style`, no `<script src="http`; every required hook present; the island carries the age-source field for the plan's category.

## Workflow — dashboard mode (`plan-sidecar dashboard`)

1. **Enumerate** every plan `.md` across `planned/ ongoing/ blocked/ scheduled/ finished/` (skip `.gitkeep`).
2. **Per plan**, build one entry: `status`, `title`, `href` (`_views/<basename>.html` when the sidecar exists, else `<category>/<file>.md`), `iso` (the category's age-source datetime), `assignee` (`""` = none), `tags`, `steps {done,total,note?}`, and `questions: N` when `## Open questions` holds N questions (renders a `?N` badge).
3. **Edit `docs/plans/_assets/plans-data.js`** — only this file. Never touch `index.html` (if it's missing, run assets mode first). Skip the write when entries are unchanged ignoring nothing — entries hold no time-derived text, so plain comparison works.

## Workflow — assets mode (`plan-sidecar assets`)

1. For each master in this skill's `assets/` dir: `dashboard.css` + `dashboard.js` → `docs/plans/_assets/`; `plans-data.js` → `docs/plans/_assets/` (NEVER overwrite — it's data); `index.html` → `docs/plans/` (NEVER overwrite — written once).
2. Copy only files that are missing. On an explicit "refresh assets" ask, overwrite `dashboard.{css,js}` only — always both together, and warn if the existing copies differ from the masters (the project may have customized them).

## Migration (projects with sidecars in category dirs)

The pre-`_views/` convention co-located `<slug>.html` next to its `.md` and `git mv`'d both on every transition. Old sidecars keep working with the new assets — migrate lazily: the next time a plan is touched, sidecar mode writes to `_views/` (keeping the file's CURRENT basename, even a date-prefixed finished one — basenames freeze at migration) and deletes the co-located copy (step 5). Migrating a whole repo at once is just running sidecar mode over every plan, then dashboard mode once.

## Gotchas

| Gotcha | Fix |
|---|---|
| Rewrote a sidecar or data entry only to refresh an age token | Forbidden — ages render at view time; baked text is a no-JS fallback. |
| `git mv`'d the sidecar alongside its `.md` | Sidecars never move — regenerate in place at `_views/` with the new category baked in. |
| Renamed the sidecar to the `YYYY-MM-DD-` prefix on ship | Only the `.md` is renamed; the `.html` basename is frozen at scaffold time. |
| Loaded plan data via `fetch()` + `.json` | Chrome blocks fetch/XHR on `file://` (CORS) — the data ships as a `.js` assigning `window.PLANS_DATA`, loaded via `<script src>`. |
| Edited `index.html` to add a dashboard row | `index.html` is a write-once skeleton — rows render client-side; edit `plans-data.js` only. |
| Baked nav-sidebar or meta-strip markup into a sidecar | Both are rendered by `dashboard.js` at view time from `plans-data.js` / the `<dl>` — emit only the two script tags and the plain `<dl>`. |
| `#plan-data` island missing `blocked_since` / `scheduled_date` | The island must carry the age-source field for the plan's category or the live token can't render. |
| Inlined CSS / copied rules into a sidecar | All styling is in the shared assets; emit classes + `data-*`, never `<style>`. |
| Step status `in_flight` / `inflight` | The css key is `in-flight` (hyphen). |
| Read the `.html` to answer a plan-state question | The `.md` is canonical; the sidecar may be stale. |

## When NOT to use

- Answering "what's the state of plan X" — read the `.md` (canonical), never the sidecar.
- Non-plan markdown (skills, agents, docs) — this skill renders the plan structure only.
- Changing the shared look for one project — edit that project's `docs/plans/_assets/dashboard.{css,js}` directly; this skill seeds and consumes them.

## Staleness check (per-project contract)

If the project's `docs/plans/AGENTS.md` lacks a section this skill relies on (the `_views/` fixed-location rules, the view-time age-token contract, the data-driven dashboard, or Open questions), offer to append the missing section from plan-init's template — never silently diverge from what the project's own contract documents.

## References

- [`references/templates.md`](references/templates.md) — sidecar + dashboard skeletons, `plans-data.js` entry format, `#plan-questions` island schema, answers-export shape.
- `assets/` (this skill) — master copies of `dashboard.css`, `dashboard.js`, `index.html`, `plans-data.js`.
- `docs/plans/AGENTS.md` (per project) — the per-project contract; plan-init's template is its source. A contract change here must land in that template too.
- Companion skills: `plan-manager` (invokes this after every plan touch; ingests open-question answers) · `plan-init` (bootstraps `docs/plans/`, invokes assets mode).
