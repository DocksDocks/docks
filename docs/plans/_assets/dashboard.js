/* docs/plans/_assets/dashboard.js
 * Shared client behaviour for plan sidecar .html files and the optional
 * docs/plans/index.html cross-plan dashboard.
 *
 * No build step, no framework. Plain DOM + a `<script type="application/json"
 * id="plan-data">` element holding the plan's frontmatter (so JS doesn't have
 * to re-parse YAML in the browser).
 *
 * Two modes:
 *   - Single plan page  → toggleable sections, copy-slug, copy-ship-commit.
 *   - Dashboard         → filter (status / assignee / tag / text), sortable.
 */

(function () {
  "use strict";

  const isDashboard = document.body.classList.contains("dashboard");

  if (isDashboard) initDashboard();
  else initPlanPage();

  // ============================================================
  // single plan page
  // ============================================================
  function initPlanPage() {
    // Collapse / expand sections on header click.
    document.querySelectorAll(".plan-section").forEach((section) => {
      const heading = section.querySelector("h2");
      if (!heading) return;
      heading.addEventListener("click", () => {
        const collapsed = section.dataset.collapsed === "true";
        section.dataset.collapsed = String(!collapsed);
      });
    });

    // Default-collapse empty sections (heading present, body empty).
    document.querySelectorAll(".plan-section").forEach((section) => {
      const content = section.querySelector(".plan-section__content");
      if (content && content.textContent.trim().length === 0) {
        section.dataset.collapsed = "true";
      }
    });

    // Click-to-copy on slug + ship_commit in the meta block.
    document.querySelectorAll(".plan-meta dd").forEach((dd) => {
      const text = dd.textContent.trim();
      if (!text || text === "—") return;
      dd.style.cursor = "copy";
      dd.title = "Click to copy";
      dd.addEventListener("click", () => {
        navigator.clipboard.writeText(text).then(() => {
          const original = dd.textContent;
          dd.textContent = "copied!";
          setTimeout(() => { dd.textContent = original; }, 800);
        });
      });
    });
  }

  // ============================================================
  // index / dashboard
  // ============================================================
  function initDashboard() {
    const table = document.querySelector("table.plans-table");
    if (!table) return;
    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);

    // ---- filtering ----
    const search = document.querySelector("input[data-filter='search']");
    const status = document.querySelector("select[data-filter='status']");
    const assignee = document.querySelector("select[data-filter='assignee']");
    const tag = document.querySelector("select[data-filter='tag']");

    function applyFilters() {
      const q = (search?.value || "").toLowerCase().trim();
      const s = status?.value || "";
      const a = assignee?.value || "";
      const t = tag?.value || "";
      rows.forEach((row) => {
        const matchesText = !q || row.textContent.toLowerCase().includes(q);
        const matchesStatus = !s || row.dataset.status === s;
        const matchesAssignee = !a || row.dataset.assignee === a;
        const matchesTag = !t || (row.dataset.tags || "").split(",").includes(t);
        row.style.display =
          matchesText && matchesStatus && matchesAssignee && matchesTag ? "" : "none";
      });
    }
    [search, status, assignee, tag].forEach((el) => el && el.addEventListener("input", applyFilters));

    // ---- sorting ----
    Array.from(table.tHead.rows[0].cells).forEach((th, colIdx) => {
      const sortKey = th.dataset.sort;
      if (!sortKey) return;
      th.addEventListener("click", () => {
        const ascending = th.dataset.sortDir !== "asc";
        table.tHead.querySelectorAll("th").forEach((t) => {
          delete t.dataset.sortActive;
          delete t.dataset.sortDir;
        });
        th.dataset.sortActive = "1";
        th.dataset.sortDir = ascending ? "asc" : "desc";
        const sorted = [...rows].sort((a, b) => {
          const va = sortValue(a, colIdx, sortKey);
          const vb = sortValue(b, colIdx, sortKey);
          if (va < vb) return ascending ? -1 : 1;
          if (va > vb) return ascending ? 1 : -1;
          return 0;
        });
        sorted.forEach((r) => tbody.appendChild(r));
      });
    });

    function sortValue(row, colIdx, key) {
      // Prefer a `data-sort-value` attribute when present (e.g., ISO date
      // for an "Age" column whose display string is "6d queued"). Falls
      // back to text content for plain columns.
      const cell = row.cells[colIdx];
      const v = cell?.dataset.sortValue ?? cell?.textContent ?? "";
      // Numeric sort if both sides look numeric.
      const n = Number(v);
      return Number.isFinite(n) ? n : v.toLowerCase().trim();
    }
  }
})();
