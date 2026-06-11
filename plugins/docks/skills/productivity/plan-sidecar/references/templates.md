# Sidecar + dashboard skeletons, data-file format, questions island

Copy these, substitute the `{ }` placeholders, keep every `data-*` hook. Styling and behavior come entirely from `docs/plans/_assets/dashboard.{css,js}` — never inline a `<style>` or `<script src="http…">`.

Path rules: every **sidecar** lives at `docs/plans/_views/<basename>.html` and references `../_assets/…`; its source link points at the `.md`'s CURRENT category (`../planned/…`, `../finished/…`). The **dashboard** at `docs/plans/index.html` references `_assets/…` (no `../`). `<basename>` is frozen at scaffold time — on ship only the `.md` is renamed.

## Sidecar — `docs/plans/_views/<basename>.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} · {status}</title>
  <link rel="stylesheet" href="../_assets/dashboard.css" />
  <script type="application/json" id="plan-data">
{ "title": "{title}", "goal": "{goal}", "status": "{status}", "slug": "{basename}",
  "created": "{created}", "updated": "{updated}", "started_at": {started_at|null},
  "blocked_since": {blocked_since|null}, "scheduled_date": {scheduled_date|null},
  "assignee": {assignee|null}, "ship_commit": {ship_commit|null}, "tags": [{tags}] }
  </script>
</head>
<body data-status="{status}" data-slug="{basename}">
  <header class="plan-header">
    <div class="plan-header__top">
      <span class="status-badge" data-status="{status}">{status}</span>
      <span class="age-token">{baked age token — no-JS fallback only}</span>
    </div>
    <h1>{title}</h1>
    <p class="plan-goal-summary">{goal}</p>
    <dl class="plan-meta">
      <div><dt>slug</dt><dd>{basename}</dd></div>
      <div><dt>created</dt><dd>{created date}</dd></div>
      <div><dt>updated</dt><dd>{updated date}</dd></div>
      <div><dt>started_at</dt><dd>{started_at date or "—"}</dd></div>
      <div><dt>assignee</dt><dd>{assignee or "—"}</dd></div>
      <div><dt>ship_commit</dt><dd>{ship_commit or "—"}</dd></div>
      <div><dt>tags</dt><dd>{tags joined or "—"}</dd></div>
    </dl>
  </header>

  <main class="plan-body">
    <section class="plan-section plan-section--goal" data-section="goal">
      <h2>Goal</h2>
      <div class="plan-section__content markdown">{rendered Markdown}</div>
    </section>

    <section class="plan-section plan-section--steps" data-section="steps" data-progress="{M}/{N}">
      <h2>Steps <span class="progress">{M} / {N}</span></h2>
      <div class="plan-section__content">
        <table class="steps">
          <thead><tr><th>#</th><th>Task</th><th>Status</th><th>Owner</th></tr></thead>
          <tbody>
            <tr><td>{n}</td><td>{task}</td>
                <td class="status" data-status="{done|in-flight|planned|blocked|skipped}">{status}</td>
                <td>{owner}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- one <section data-section="…"> per body section, canonical order:
         context · acceptance · out-of-scope · mistakes · sources · blockers ·
         open-questions (when present) · notes · evidence · review
         tint modifiers: --mistakes (red), --review (green), --blockers (amber) -->
  </main>

  <footer>
    <a href="../{category}/{current-md-filename}">source: {current-md-filename}</a>
    <span class="generated-at">generated {ISO timestamp}</span>
  </footer>

  <script src="../_assets/plans-data.js"></script>
  <script src="../_assets/dashboard.js"></script>
</body>
</html>
```

Notes:
- The `#plan-data` island MUST include the age-source field for the plan's category: `created` (planned), `started_at` (ongoing), `blocked_since` (blocked), `scheduled_date` (scheduled), `updated` (finished). dashboard.js reads it to render the live age token; the baked `.age-token` text is only the no-JS fallback.
- The two script tags come last, in that order — `plans-data.js` powers the nav sidebar (search, status groups, current-plan highlight), which `dashboard.js` renders at view time. Never bake nav or meta-strip markup.
- Per-plan assets: `<link …="../_assets/<slug>.css">` / `<script src="../_assets/<slug>.js">` AFTER the shared pair. Never inline.
- Empty optional sections: emit heading + empty `.plan-section__content` — auto-collapsed on load.
- Skip-if-unchanged: compare ignoring `.age-token` text and `.generated-at` — never rewrite for time alone.

## `#plan-questions` island (only when the `.md` has `## Open questions`)

Add inside `<head>`, after `#plan-data`. dashboard.js then injects the [Plan | Open questions] tab pair (choice cards, textareas, per-question nav, progress counter, Copy JSON / Download / Clear, pagination at 10/page). Answers persist to localStorage (`plan-answers:<basename>`).

```html
<script type="application/json" id="plan-questions">
{ "version": 1,
  "questions": [
    { "id": "{kebab-id}", "type": "choice", "multi": false, "allowCustom": true,
      "title": "{the question}",
      "context": "{enough context to decide without reading the whole plan; `inline code` allowed}",
      "options": [
        { "value": "{kebab-value}", "label": "{Short label}", "recommended": true,
          "description": "{one-line tradeoff}" },
        { "value": "{other}", "label": "{Other label}", "description": "{tradeoff}" }
      ] },
    { "id": "{kebab-id-2}", "type": "text",
      "title": "{the question}", "context": "{context}",
      "placeholder": "{e.g. hint text}" }
  ] }
</script>
```

Mirror the `.md` section faithfully: one entry per numbered question, `(recommended)` → `"recommended": true`, `custom allowed` → `"allowCustom": true`. The user's export is JSON shaped `{ "slug": "<basename>", "exportedAt": "<ISO>", "answers": { "<id>": { "selected": ["…"], "custom": "…" } | { "text": "…" } } }` — pasted in chat or saved to `docs/plans/_open_questions/<basename>.answers.json` for plan-manager to ingest.

## Dashboard — `docs/plans/index.html` (write-once static skeleton)

Seeded verbatim from this skill's `assets/index.html`; never edited afterwards. It holds the filter controls (only the status `<select>` carries baked options), an empty `<tbody>`, a `<noscript>` note, and the two script tags. Rows, assignee/tag filter options, and live ages all render client-side from `plans-data.js`. Baked `<tr>` rows from the pre-data-file convention keep working as a no-data fallback (dashboard.js only replaces the tbody when `window.PLANS_DATA` is non-empty).

## Data file — `docs/plans/_assets/plans-data.js`

A dashboard refresh edits ONLY this file (loaded via `<script src>` — `fetch()`+`.json` is blocked on `file://`):

```js
window.PLANS_DATA = [
  { status: "planned", title: "Short imperative title",
    href: "_views/20260101-example-slug.html", iso: "2026-01-01T09:00:00-03:00",
    assignee: "", tags: ["example"], steps: { done: 0, total: 4 }, questions: 2 },
];
```

| Field | Rule |
|---|---|
| `status` | lifecycle category; drives row badge, filter, nav grouping |
| `title` | frontmatter title |
| `href` | `_views/<basename>.html` when the sidecar exists, else `<category>/<file>.md` |
| `iso` | the category's age-source datetime (same field the sidecar island carries) — never a baked human token |
| `assignee` | `""` when null |
| `tags` | array; renderer comma-joins into `data-tags` |
| `steps` | `{done, total, note?}` — `note` renders as a small suffix, e.g. `"1 skipped"` |
| `questions` | optional count of open questions → `?N` badge on the row |

The renderer emits the same `data-status` / `data-assignee` / `data-tags` / `data-sort-value` contract as baked rows, so filters, sort, and CSS work identically either way.
