---
name: plan-sidecar
description: "Use when a plan .md is written, moved, or shipped and its browser-view .html sidecar — or the docs/plans/index.html dashboard — needs (re)authoring: render a plan's frontmatter + body into a styled, collapsible HTML view wired to the shared docs/plans/_assets/dashboard.{css,js}. Invoked by plan-manager after every plan touch; also standalone (\"rebuild plan sidecars\", \"build the plans dashboard\"). Not for reading plan state (the .md is canonical) or non-plan markdown."
user-invocable: true
metadata:
  pattern: generative-skill
  updated: "2026-05-24"
  content_hash: "2357febeb13045595b48608722ae7230511deaf1c9658f597626e12f82666a47"
---

# Plan Sidecar — author a plan's browser view

`plan-sidecar` renders a plan `.md` into its `.html` sidecar and (re)builds `docs/plans/index.html`, the cross-plan dashboard. The `.md` stays canonical — the `.html` is a derived, browser-only view (collapsible sections, status color, click-to-copy) that no agent ever reads. One shared standard: every sidecar links the same `docs/plans/_assets/dashboard.{css,js}` and emits the `data-*` hooks those assets target. Within that contract you have latitude to tailor a plan's view for clearer reading.

<constraint>
**The `.md` is canonical; the `.html` is write-only.** NEVER read a sidecar to answer "what's the state of plan X" — read the `.md`. The sidecar is regenerated from the `.md`; if they disagree, the `.md` wins and the sidecar is stale.
</constraint>

<constraint>
**Link the shared base first; never inline.** Every sidecar links `../_assets/dashboard.css` + `../_assets/dashboard.js` (the dashboard uses `_assets/…`, no `../`) and emits the load-bearing `data-*` hooks (table below). NEVER inline a `<style>`/`<script>` block or copy CSS rules into the file — styling lives in asset *files* so one edit restyles every plan. Adding EXTRA plan-specific asset files is allowed (constraint 3); inlining is not.
</constraint>

<constraint>
**Per-plan latitude — including extra `.css`/`.js` files.** A plan may need richer visualization than the shared base. You MAY add a callout, reorder sections, highlight a metric, AND ship a plan-specific stylesheet/script — put it at `_assets/<slug>.css` / `_assets/<slug>.js` and `<link>`/`<script src>` it AFTER `dashboard.{css,js}` so it extends or overrides the base. Non-negotiable even then: link the shared base first, keep every required `data-*` hook resolving, and never inline (extra styling/behavior goes in a linked file, not a `<style>`/`<script>` block). The contract is the floor; per-plan assets build on top.
</constraint>

## Modes

| Invocation | Mode | What it does | Writes |
|---|---|---|---|
| `plan-sidecar <path/to/plan.md>` | sidecar | Render one plan's `.md` → sibling `.html` | `<same-dir>/<slug>.html` |
| `plan-sidecar dashboard` | dashboard | Rebuild the cross-plan index from every plan's frontmatter | `docs/plans/index.html` |
| `plan-sidecar` (bare) | — | Ask: one sidecar, or the dashboard? | — |

plan-manager invokes both after any plan touch: the sidecar for the touched plan, then `dashboard`.

## The shared-asset contract

Assets live at `docs/plans/_assets/dashboard.css` + `dashboard.js` — this skill **consumes** them (restyling the base is out of scope). Reference them relatively: `../_assets/…` from a sidecar in a category dir; `_assets/…` from `index.html`. A plan needing more than the base may add `_assets/<slug>.css` / `_assets/<slug>.js`, linked AFTER the shared files (constraint 3) — the base stays untouched so "one edit restyles all" still holds. Full HTML skeletons (sidecar + dashboard) with every hook annotated: [`references/templates.md`](references/templates.md).

Load-bearing hooks the css/js target — emit these exactly:

| Element | Required attribute | Drives |
|---|---|---|
| `<body>` (sidecar) | `data-status="<category>"` | page theming |
| `<body>` (dashboard) | `class="dashboard"` | switches dashboard.js into dashboard mode |
| `.status-badge` | `data-status="<category>"` | badge color per lifecycle |
| `.plan-section` | `data-section="<slug>"` (+ `--mistakes`/`--review`/`--blockers` modifier where apt) | collapse + section tint |
| steps `<section>` | `data-progress="<M>/<N>"` | progress display |
| steps `<td class="status">` | `data-status="done\|in-flight\|planned\|blocked\|skipped"` | per-step color |
| dashboard `<tr>` | `data-status` + `data-assignee` + `data-tags` | filter |
| dashboard `<th>` | `data-sort="<key>"` (+ cell `data-sort-value` for non-text) | sort |
| `<script id="plan-data">` | `type="application/json"` | frontmatter for JS — no YAML re-parse in the browser |

dashboard.js auto-collapses any `.plan-section__content` whose text is empty — emit empty optional sections as empty (heading + empty content div) and they collapse on load.

## Workflow — sidecar mode (`plan-sidecar <plan.md>`)

1. **Read the `.md`** (canonical). Parse frontmatter, body sections, and the `## Steps` table.
2. **Compute the age token** — category-specific (see `docs/plans/AGENTS.md`): planned `Xd queued`, ongoing `Xd in flight`, blocked `blocked Xd`, scheduled `fires in Xd`, finished `shipped Xd ago` (from the filename date; `shipped today` at 0d).
3. **Author the `.html`** next to the `.md` (`<slug>.html`) from the `references/templates.md` skeleton:
   - `<head>`: title `{title} · {status}`; `<link …="../_assets/dashboard.css">`; `<script type="application/json" id="plan-data">` holding the frontmatter as JSON.
   - header: `.status-badge[data-status]`, age token, `<h1>`, goal, `.plan-meta` `<dl>`.
   - one `<section class="plan-section plan-section--<slug>" data-section="<slug>">` per body section; steps → `data-progress` + `table.steps` with `<td class="status" data-status>`; mistakes/review/blockers get the tint modifier class.
   - footer: `<a href="./<slug>.md">source</a>` + generated timestamp; `<script src="../_assets/dashboard.js">`.
4. **Render the body Markdown** to HTML for the subset plans use — ATX headings, GFM tables, `-`/`[x]` lists, fenced + inline code, links, bold. No images, no HTML passthrough.
5. **Skip if unchanged** — if the parsed projection matches the existing `.html`, do not rewrite (keep git noise down).
6. **Verify** — the file contains no `<style` and no `<script src="http`; every required `data-*` hook from the table is present.

## Workflow — dashboard mode (`plan-sidecar dashboard`)

1. **Enumerate** every plan `.md` across `planned/ ongoing/ blocked/ scheduled/ finished/` (skip `.gitkeep`).
2. **Per plan**, read frontmatter + count `## Steps` rows (M done / N total).
3. **Author `docs/plans/index.html`** (assets via `_assets/…`, no `../`): `<body class="dashboard">`, the `.filters` block, and `table.plans-table` with one `<tr data-status data-assignee data-tags>` per plan. The title cell links to that plan's `.html` when it exists, else its `.md`. The age cell carries `data-sort-value="<ISO date>"` so sorting works on the display token.
4. **Populate** the `assignee` + `tag` `<select>` options from the plans actually present (empty `assignee` → `null`).

## BAD / GOOD

```html
<!-- BAD — inline styles + raw YAML dumped as text; forks the standard -->
<body style="font-family: sans-serif">
  <pre>status: ongoing
title: ...</pre>

<!-- GOOD — shared assets + structured hooks + JSON island -->
<head>
  <link rel="stylesheet" href="../_assets/dashboard.css" />
  <script type="application/json" id="plan-data">{"status":"ongoing","title":"…"}</script>
</head>
<body data-status="ongoing" data-slug="20260524-foo">
  <span class="status-badge" data-status="ongoing">ongoing</span>
```

## Gotchas

| Gotcha | Fix |
|---|---|
| Used `../_assets/` in `index.html` | The dashboard sits at `docs/plans/`, not a category dir — use `_assets/…` (no `../`). |
| Inlined CSS / copied rules into a sidecar | All styling is in the shared assets; emit classes + `data-*`, never `<style>`. |
| Read the `.html` to answer a plan-state question | The `.md` is canonical; the `.html` may be stale. Read the `.md`. |
| Step status `in_flight` / `inflight` | The css key is `in-flight` (hyphen). Map the plan status enum to `in-flight`. |
| Dropped an empty optional section | Emit it empty (heading + empty `.plan-section__content`); dashboard.js auto-collapses it. |
| `shipped` token on an ongoing plan | The age token is category-specific — see the table in `docs/plans/AGENTS.md`. |
| Dashboard links every title to `.html` but most don't exist | Link `.html` only when the sidecar exists; otherwise link the `.md`. |

## When NOT to use

- Answering "what's the state of plan X" — read the `.md` (canonical), never the sidecar.
- Non-plan markdown (skills, agents, docs) — this skill renders the plan structure only.
- Changing the shared look — edit `docs/plans/_assets/dashboard.{css,js}` directly; this skill consumes them.

## References

- [`references/templates.md`](references/templates.md) — full sidecar + dashboard HTML skeletons, every `data-*` hook annotated.
- `docs/plans/AGENTS.md` § "HTML sidecar" — the standard (assets, `data-*` contract, age tokens, checked-in default).
- Companion skills: `plan-manager` (invokes this after every plan touch) · `plan-init` (bootstraps `docs/plans/`).
