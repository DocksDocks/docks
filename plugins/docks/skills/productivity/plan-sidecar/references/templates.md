# Sidecar + dashboard HTML skeletons

Copy these, substitute the `{ }` placeholders, keep every `data-*` hook. Styling and behavior come entirely from `docs/plans/_assets/dashboard.{css,js}` — never inline a `<style>` or `<script src="http…">`.

Path rule: a **sidecar** in `docs/plans/<category>/` references `../_assets/…`; the **dashboard** at `docs/plans/index.html` references `_assets/…` (no `../`).

## Sidecar — `docs/plans/<category>/<slug>.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} · {status}</title>
  <link rel="stylesheet" href="../_assets/dashboard.css" />
  <script type="application/json" id="plan-data">
{ "title": "{title}", "goal": "{goal}", "status": "{status}", "slug": "{slug}",
  "created": "{created}", "updated": "{updated}", "started_at": {started_at|null},
  "assignee": {assignee|null}, "ship_commit": {ship_commit|null}, "tags": [{tags}] }
  </script>
</head>
<body data-status="{status}" data-slug="{slug}">
  <header class="plan-header">
    <div class="plan-header__top">
      <span class="status-badge" data-status="{status}">{status}</span>
      <span class="age-token">{age token}</span>
    </div>
    <h1>{title}</h1>
    <p class="plan-goal-summary">{goal}</p>
    <dl class="plan-meta">
      <div><dt>slug</dt><dd>{slug}</dd></div>
      <div><dt>created</dt><dd>{created}</dd></div>
      <div><dt>updated</dt><dd>{updated}</dd></div>
      <div><dt>started_at</dt><dd>{started_at or "—"}</dd></div>
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

    <!-- repeat one <section data-section="…"> per body section, in canonical order:
         context · acceptance · out-of-scope · mistakes · sources · blockers · notes · evidence · review
         add the tint modifier where apt: -->
    <section class="plan-section plan-section--mistakes" data-section="mistakes">
      <h2>Mistakes &amp; Dead Ends</h2>
      <div class="plan-section__content markdown">{rendered Markdown, or empty → auto-collapses}</div>
    </section>
    <!-- plan-section--review (green tint) and plan-section--blockers (amber tint) likewise -->
  </main>

  <footer>
    <a href="./{slug}.md">source: {slug}.md</a>
    <span class="generated-at">generated {ISO timestamp}</span>
  </footer>

  <script src="../_assets/dashboard.js"></script>
</body>
</html>
```

Notes:
- `{status}` is the lifecycle category (`planned`/`ongoing`/`blocked`/`scheduled`/`finished`).
- Section `--slug` values map to CSS modifiers: only `mistakes` (red), `review` (green), `blockers` (amber) are tinted; the rest use the base `plan-section--<slug>` with no special style.
- Steps `data-status` uses the step enum with `in-flight` hyphenated.
- Per-plan assets: to extend the base look, add `<link rel="stylesheet" href="../_assets/<slug>.css" />` (and/or a `<script src="../_assets/<slug>.js">`) AFTER the shared `dashboard.css`/`dashboard.js` so it overrides. Never inline.
- Empty optional sections: emit the heading + an empty `.plan-section__content` — `dashboard.js` collapses them on load.

## Dashboard — `docs/plans/index.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Plans</title>
  <link rel="stylesheet" href="_assets/dashboard.css" />
</head>
<body class="dashboard">
  <h1>Plans</h1>

  <div class="filters">
    <input type="search" data-filter="search" placeholder="filter…" />
    <select data-filter="status">
      <option value="">all statuses</option>
      <option value="planned">planned</option>
      <option value="ongoing">ongoing</option>
      <option value="blocked">blocked</option>
      <option value="scheduled">scheduled</option>
      <option value="finished">finished</option>
    </select>
    <select data-filter="assignee">
      <option value="">all assignees</option>
      <!-- one <option> per distinct assignee present (omit/—for null) -->
    </select>
    <select data-filter="tag">
      <option value="">all tags</option>
      <!-- one <option> per distinct tag present -->
    </select>
  </div>

  <table class="plans-table">
    <thead>
      <tr>
        <th data-sort="status">Status</th>
        <th data-sort="title">Title</th>
        <th data-sort="age">Age</th>
        <th data-sort="assignee">Assignee</th>
        <th data-sort="progress">Steps</th>
      </tr>
    </thead>
    <tbody>
      <!-- one row per plan; link title to <slug>.html if it exists, else <slug>.md -->
      <tr data-status="{status}" data-assignee="{assignee or ''}" data-tags="{tag,tag}">
        <td><span class="status-badge" data-status="{status}">{status}</span></td>
        <td class="title"><a href="{category}/{slug}.html">{title}</a></td>
        <td data-sort-value="{ISO date}">{age token}</td>
        <td>{assignee or "—"}</td>
        <td>{M}/{N}</td>
      </tr>
    </tbody>
  </table>

  <script src="_assets/dashboard.js"></script>
</body>
</html>
```

Notes:
- `data-sort-value` on the Age cell is the **full ISO 8601 datetime with offset** from the source frontmatter field (`created` / `started_at` / `blocked_since` / `scheduled_date` / `updated`), e.g. `2026-05-26T17:23:40-03:00`. The display token is the human form (`47m queued`, `6d queued`); the datetime backs deterministic sorting when two rows share a display token.
- `data-tags` is comma-joined; `dashboard.js` splits on `,` for the tag filter.
- The `assignee`/`tag` selects must list only values that actually appear, or filtering offers dead options.
