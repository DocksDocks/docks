/* docs/plans/_assets/plans-data.js — dashboard data, rendered by dashboard.js.
   One entry per plan. Loaded via <script src> (fetch() is blocked on file://).
   Update THIS file when plans change; index.html is a static skeleton.
   Fields: status (lifecycle), title, href (sidecar in _views/ when it exists,
   else the category .md), iso (category source datetime: created / started_at /
   blocked_since / scheduled_date / updated), assignee (""=none), tags,
   steps {done,total,note?}, questions (optional open-question count → ?N badge).
   Example entry:
   { status: "planned", title: "Short imperative title",
     href: "_views/20260101-example-slug.html", iso: "2026-01-01T09:00:00-03:00",
     assignee: "", tags: ["example"], steps: { done: 0, total: 4 } },
*/
window.PLANS_DATA = [
];
