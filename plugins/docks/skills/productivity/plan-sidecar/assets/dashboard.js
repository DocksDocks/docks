/* docs/plans/_assets/dashboard.js — shared behavior for plan sidecars + the dashboard.
   Sidecar: collapsible sections, auto-collapse empties, click-to-copy code.
   Dashboard (body.dashboard): filter + sort the plans table. */
(() => {
  "use strict";

  const isDashboard = document.body.classList.contains("dashboard");
  isDashboard ? initDashboard() : initSidecar();
  renderAgeTokens(isDashboard);

  /* ---------- live age tokens ----------
     Computed at view time from the ISO datetime already in the markup
     (dashboard: td[data-sort-value]; sidecar: the #plan-data island), so
     generated HTML never goes stale. Baked-in text is the no-JS fallback. */
  function renderAgeTokens(dashboard) {
    if (dashboard) {
      document.querySelectorAll(".plans-table tbody tr").forEach((tr) => {
        const cell = tr.querySelector("td[data-sort-value]");
        const token = ageToken(tr.getAttribute("data-status"), cell?.getAttribute("data-sort-value"));
        if (token) cell.textContent = token;
      });
      return;
    }
    const island = document.getElementById("plan-data");
    const el = document.querySelector(".age-token");
    if (!island || !el) return;
    let plan;
    try { plan = JSON.parse(island.textContent); } catch { return; }
    const status = document.body.getAttribute("data-status");
    const source = {
      planned: plan.created,
      ongoing: plan.started_at || plan.created,
      blocked: plan.blocked_since,
      scheduled: plan.scheduled_date,
      finished: plan.updated,
    }[status];
    const token = ageToken(status, source);
    if (!token) return;
    el.textContent = status === "ongoing" && !plan.started_at ? `${token} (approx)` : token;
  }

  function ageToken(status, iso) {
    if (!iso) return null;
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return null;
    const delta = Date.now() - then;

    if (status === "scheduled") {
      if (Math.abs(delta) < 60_000) return "DUE";
      return delta < 0 ? `fires in ${span(-delta)}` : `OVERDUE by ${span(delta)}`;
    }
    const t = delta < 60_000 ? null : span(delta);
    switch (status) {
      case "planned":  return t ? `${t} queued` : "queued just now";
      case "ongoing":  return t ? `${t} in flight` : "started just now";
      case "blocked":  return t ? `blocked ${t}` : "blocked just now";
      case "finished": return t ? `shipped ${t} ago` : "shipped just now";
      default: return null;
    }
  }

  function span(ms) {
    const m = Math.floor(ms / 60_000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 365) return `${d}d`;
    return `${Math.floor(d / 30)}mo`;
  }

  /* ---------- sidecar ---------- */
  function initSidecar() {
    document.querySelectorAll(".plan-section").forEach((section) => {
      const content = section.querySelector(".plan-section__content");
      const heading = section.querySelector("h2");
      const empty = !content || content.textContent.trim() === "";

      if (empty) {
        section.classList.add("plan-section--empty", "plan-section--collapsed");
        return;
      }
      heading.addEventListener("click", () => {
        section.classList.toggle("plan-section--collapsed");
      });
    });

    document.querySelectorAll("code").forEach((el) => {
      if (el.closest("pre")) return;
      el.addEventListener("click", () => copy(el.textContent, el));
    });

    buildMetaStrip();
    initOpenQuestions();
    initPlanNav();
  }

  /* ---------- plan nav sidebar ----------
     Rendered at view time from window.PLANS_DATA (the sidecar includes
     ../_assets/plans-data.js): "← All plans" + every view grouped by
     status, current plan highlighted. Plans change → only the data file
     changes → every sidecar's nav updates by itself. */
  function initPlanNav() {
    if (!Array.isArray(window.PLANS_DATA) || !window.PLANS_DATA.length) return;

    const here = decodeURIComponent(location.pathname.split("/").pop());
    const nav = document.createElement("nav");
    nav.className = "plan-nav";

    const all = document.createElement("a");
    all.className = "all-plans";
    all.href = "../index.html";
    all.textContent = "← All plans";
    nav.appendChild(all);

    const search = document.createElement("input");
    search.type = "search";
    search.className = "nav-search";
    search.placeholder = "filter plans…";
    nav.appendChild(search);

    /* status groups collapse; choices persist across views ("finished"
       starts collapsed unless it holds the current plan) */
    const collapseKey = "plan-nav:collapsed";
    let collapsed;
    try { collapsed = new Set(JSON.parse(localStorage.getItem(collapseKey)) ?? ["finished"]); }
    catch { collapsed = new Set(["finished"]); }

    const groups = [];
    for (const status of ["planned", "ongoing", "blocked", "scheduled", "finished"]) {
      const group = window.PLANS_DATA.filter((p) => p.status === status);
      if (!group.length) continue;

      const h4 = document.createElement("h4");
      h4.setAttribute("data-status", status);
      const dot = document.createElement("span");
      dot.className = "dot";
      h4.append(dot, `${status} (${group.length})`);
      nav.appendChild(h4);

      const ul = document.createElement("ul");
      const items = [];
      let hasCurrent = false;
      for (const p of group) {
        const li = document.createElement("li");
        if (p.href.endsWith(`/${here}`)) {
          hasCurrent = true;
          const span = document.createElement("span");
          span.className = "current";
          span.textContent = p.title;
          li.appendChild(span);
        } else {
          const a = document.createElement("a");
          a.href = `../${p.href}`;
          a.textContent = p.title;
          li.appendChild(a);
        }
        ul.appendChild(li);
        items.push({ li, title: p.title.toLowerCase() });
      }
      nav.appendChild(ul);
      groups.push({ h4, ul, items });

      if (collapsed.has(status) && !hasCurrent) h4.classList.add("collapsed");
      h4.addEventListener("click", () => {
        h4.classList.toggle("collapsed");
        h4.classList.contains("collapsed") ? collapsed.add(status) : collapsed.delete(status);
        localStorage.setItem(collapseKey, JSON.stringify([...collapsed]));
      });
    }

    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      nav.classList.toggle("searching", Boolean(q));
      for (const g of groups) {
        let matches = 0;
        for (const item of g.items) {
          const hit = !q || item.title.includes(q);
          item.li.hidden = !hit;
          if (hit) matches++;
        }
        g.h4.hidden = q && !matches;
        g.ul.hidden = q && !matches;
      }
    });
    document.body.appendChild(nav);

    const toggle = document.createElement("button");
    toggle.className = "plan-nav-toggle";
    toggle.textContent = "☰";
    toggle.title = "Plans navigation";
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
    document.body.appendChild(toggle);
  }

  /* ---------- compact meta strip ----------
     The raw .plan-meta <dl> is low-value for readers (slug, "—" fields).
     Rebuild it as chips (assignee, tags, created, ship) with a "details"
     toggle revealing the full <dl>. Pure view transform — markup untouched. */
  function buildMetaStrip() {
    const dl = document.querySelector(".plan-meta");
    if (!dl) return;

    const meta = {};
    dl.querySelectorAll("div").forEach((row) => {
      const dt = row.querySelector("dt")?.textContent.trim();
      const dd = row.querySelector("dd")?.textContent.trim();
      if (dt) meta[dt] = dd;
    });

    const strip = document.createElement("div");
    strip.className = "meta-strip";
    const chip = (text, mod) => {
      const s = document.createElement("span");
      s.className = "chip" + (mod ? ` chip--${mod}` : "");
      s.textContent = text;
      strip.appendChild(s);
    };

    if (meta.assignee && meta.assignee !== "—") chip(meta.assignee, "assignee");
    if (meta.tags && meta.tags !== "—") meta.tags.split(",").forEach((t) => chip(t.trim(), "tag"));
    if (meta.created) chip(`created ${meta.created}`);
    if (meta.ship_commit && meta.ship_commit !== "—") chip(`ship ${meta.ship_commit.slice(0, 7)}`);

    const more = document.createElement("button");
    more.className = "meta-strip__more";
    more.textContent = "details";
    more.addEventListener("click", () => dl.classList.toggle("plan-meta--collapsed"));
    strip.appendChild(more);

    dl.classList.add("plan-meta--collapsed");
    dl.before(strip);
  }

  /* ---------- open questions ----------
     When a #plan-questions JSON island exists, the sidecar gains a
     [Plan | Open questions] tab pair. Answers persist to localStorage
     while the user works; "Copy JSON" / "Download" exports them for the
     agent (file:// pages cannot write into the repo — the user pastes the
     JSON in chat or saves the download to docs/plans/_open_questions/). */
  function initOpenQuestions() {
    const island = document.getElementById("plan-questions");
    if (!island) return;
    let spec;
    try { spec = JSON.parse(island.textContent); } catch { return; }
    const questions = spec.questions || [];
    if (!questions.length) return;

    const slug = document.body.getAttribute("data-slug");
    const storeKey = `plan-answers:${slug}`;
    let answers = {};
    try { answers = JSON.parse(localStorage.getItem(storeKey)) || {}; } catch { /* fresh */ }
    const save = () => localStorage.setItem(storeKey, JSON.stringify(answers));

    const header = document.querySelector(".plan-header");
    const main = document.querySelector("main.plan-body");

    /* tabs */
    const tabs = document.createElement("div");
    tabs.className = "plan-tabs";
    tabs.setAttribute("role", "tablist");
    const btnPlan = tabButton("Plan");
    const btnQs = tabButton("Open questions");
    const count = document.createElement("span");
    count.className = "count";
    btnQs.appendChild(count);
    tabs.append(btnPlan, btnQs);
    header.after(tabs);

    const panel = document.createElement("div");
    panel.className = "questions-panel";
    panel.setAttribute("role", "tabpanel");
    panel.hidden = true;
    main.after(panel);

    const select = (showPlan) => {
      btnPlan.setAttribute("aria-selected", String(showPlan));
      btnQs.setAttribute("aria-selected", String(!showPlan));
      main.hidden = !showPlan;
      panel.hidden = showPlan;
    };
    btnPlan.addEventListener("click", () => select(true));
    btnQs.addEventListener("click", () => select(false));
    select(true);

    /* answers bar: progress + per-question nav + export actions */
    const bar = document.createElement("div");
    bar.className = "answers-bar";
    const progress = document.createElement("span");
    progress.className = "progress-label";
    const nav = document.createElement("div");
    nav.className = "q-nav";
    const actions = document.createElement("div");
    actions.className = "actions";
    const feedback = document.createElement("span");
    feedback.className = "copy-feedback";
    bar.append(progress, nav, actions);
    panel.appendChild(bar);

    /* pagination: 10 questions per page (pager hidden when one page) */
    const PAGE_SIZE = 10;
    const pages = Math.ceil(questions.length / PAGE_SIZE);
    let page = 0;
    let pagerLabel, pagerPrev, pagerNext;
    const showPage = (p) => {
      page = Math.max(0, Math.min(pages - 1, p));
      cards.forEach((c, i) => { c.hidden = Math.floor(i / PAGE_SIZE) !== page; });
      if (pagerLabel) {
        pagerLabel.textContent = `page ${page + 1}/${pages}`;
        pagerPrev.disabled = page === 0;
        pagerNext.disabled = page === pages - 1;
      }
    };
    if (pages > 1) {
      const pager = document.createElement("div");
      pager.className = "q-pager";
      pagerPrev = barButton("‹", false, () => showPage(page - 1));
      pagerLabel = document.createElement("span");
      pagerLabel.className = "progress-label";
      pagerNext = barButton("›", false, () => showPage(page + 1));
      pager.append(pagerPrev, pagerLabel, pagerNext);
      actions.before(pager);
    }

    const navBtns = questions.map((q, i) => {
      const b = document.createElement("button");
      b.textContent = String(i + 1);
      b.title = q.id;
      b.addEventListener("click", () => {
        select(false);
        showPage(Math.floor(i / PAGE_SIZE));
        document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.appendChild(b);
      return b;
    });

    const isAnswered = (q) => {
      const a = answers[q.id];
      if (!a) return false;
      if (q.type === "text") return Boolean(a.text?.trim());
      return Boolean(a.selected?.length || a.custom?.trim());
    };

    const cards = [];
    const update = () => {
      let done = 0;
      questions.forEach((q, i) => {
        const ok = isAnswered(q);
        if (ok) done++;
        navBtns[i].classList.toggle("answered", ok);
        cards[i]?.classList.toggle("answered", ok);
      });
      progress.textContent = `${done}/${questions.length} answered`;
      count.textContent = `${done}/${questions.length}`;
    };

    /* question cards */
    questions.forEach((q, i) => {
      const card = document.createElement("article");
      card.className = "question-card";
      card.id = `q-${q.id}`;

      const num = document.createElement("div");
      num.className = "q-num";
      num.textContent = `Question ${i + 1} of ${questions.length} · ${q.id}`;
      const h3 = document.createElement("h3");
      h3.textContent = q.title;
      card.append(num, h3);

      if (q.context) {
        const ctx = document.createElement("div");
        ctx.className = "q-context";
        ctx.append(...inlineCode(q.context));
        card.appendChild(ctx);
      }

      if (q.type === "text") {
        const ta = document.createElement("textarea");
        ta.rows = 3;
        ta.placeholder = q.placeholder || "Your answer…";
        ta.value = answers[q.id]?.text || "";
        ta.addEventListener("input", () => {
          answers[q.id] = { text: ta.value };
          save(); update();
        });
        card.appendChild(ta);
      } else {
        const grid = document.createElement("div");
        grid.className = "choice-grid";
        const state = () => (answers[q.id] ??= { selected: [], custom: "" });

        (q.options || []).forEach((opt) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "choice-card";
          if (opt.recommended) {
            const rec = document.createElement("span");
            rec.className = "recommended";
            rec.textContent = "recommended";
            btn.appendChild(rec);
          }
          const label = document.createElement("span");
          label.className = "choice-label";
          label.textContent = opt.label;
          btn.appendChild(label);
          if (opt.description) {
            const desc = document.createElement("span");
            desc.className = "choice-desc";
            desc.append(...inlineCode(opt.description));
            btn.appendChild(desc);
          }
          const sync = () => btn.classList.toggle("selected", state().selected.includes(opt.value));
          btn.addEventListener("click", () => {
            const s = state();
            if (q.multi) {
              s.selected = s.selected.includes(opt.value)
                ? s.selected.filter((v) => v !== opt.value)
                : [...s.selected, opt.value];
            } else {
              s.selected = s.selected.includes(opt.value) ? [] : [opt.value];
            }
            save();
            grid.querySelectorAll(".choice-card").forEach((c, j) => {
              c.classList.toggle("selected", state().selected.includes(q.options[j].value));
            });
            update();
          });
          grid.appendChild(btn);
          sync();
        });
        card.appendChild(grid);

        if (q.allowCustom) {
          const input = document.createElement("input");
          input.type = "text";
          input.placeholder = "Other / custom answer…";
          input.value = answers[q.id]?.custom || "";
          input.addEventListener("input", () => {
            state().custom = input.value;
            save(); update();
          });
          card.appendChild(input);
        }
      }

      panel.appendChild(card);
      cards.push(card);
    });

    /* export actions */
    const exportJson = () =>
      JSON.stringify({ slug, exportedAt: new Date().toISOString(), answers }, null, 2);

    const flash = (msg) => {
      feedback.textContent = msg;
      setTimeout(() => { feedback.textContent = ""; }, 1800);
    };

    const btnCopy = barButton("Copy JSON", true, () => {
      const json = exportJson();
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(json).then(() => flash("copied ✓"), () => fallbackCopy(json));
      } else fallbackCopy(json);
      function fallbackCopy(text) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        flash("copied ✓");
      }
    });
    const btnDownload = barButton("Download", false, () => {
      const blob = new Blob([exportJson()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}.answers.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      flash(`→ move to _open_questions/`);
    });
    const btnClear = barButton("Clear", false, () => {
      localStorage.removeItem(storeKey);
      location.reload();
    });
    actions.append(feedback, btnCopy, btnDownload, btnClear);

    showPage(0);
    update();
  }

  function tabButton(label) {
    const b = document.createElement("button");
    b.setAttribute("role", "tab");
    b.textContent = label;
    return b;
  }

  function barButton(label, primary, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    if (primary) b.className = "primary";
    b.addEventListener("click", onClick);
    return b;
  }

  /* Render a context string with `inline code` spans, safely (no innerHTML). */
  function inlineCode(text) {
    return text.split(/`([^`]+)`/).map((part, i) => {
      if (i % 2 === 0) return document.createTextNode(part);
      const c = document.createElement("code");
      c.textContent = part;
      return c;
    });
  }

  function copy(text, el) {
    navigator.clipboard?.writeText(text).then(() => {
      const prev = el.style.outline;
      el.style.outline = "2px solid var(--ongoing)";
      setTimeout(() => { el.style.outline = prev; }, 600);
    });
  }

  /* ---------- dashboard ---------- */
  function initDashboard() {
    const table = document.querySelector(".plans-table");
    if (!table) return;
    if (Array.isArray(window.PLANS_DATA) && window.PLANS_DATA.length) {
      renderDashboardRows(table, window.PLANS_DATA);
    }
    const rows = Array.from(table.querySelectorAll("tbody tr"));

    const filters = { search: "", status: "", assignee: "", tag: "" };
    document.querySelectorAll("[data-filter]").forEach((ctrl) => {
      const key = ctrl.getAttribute("data-filter");
      ctrl.addEventListener("input", () => {
        filters[key] = ctrl.value.toLowerCase();
        applyFilters(rows, filters);
      });
    });

    table.querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => sortBy(table, rows, th));
    });
  }

  /* Build tbody rows + filter options from window.PLANS_DATA (plans-data.js).
     index.html stays a static skeleton; updating the dashboard = editing only
     the data file. Emits the same data-* contract as baked rows, so filters,
     sort, CSS, and renderAgeTokens work identically. Baked rows (no
     PLANS_DATA) keep working as a fallback. */
  function renderDashboardRows(table, plans) {
    const tbody = table.querySelector("tbody");
    tbody.textContent = "";

    for (const p of plans) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-status", p.status);
      tr.setAttribute("data-assignee", p.assignee || "");
      tr.setAttribute("data-tags", (p.tags || []).join(","));

      const tdStatus = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "status-badge";
      badge.setAttribute("data-status", p.status);
      badge.textContent = p.status;
      tdStatus.appendChild(badge);

      const tdTitle = document.createElement("td");
      tdTitle.className = "title";
      const link = document.createElement("a");
      link.href = p.href;
      link.textContent = p.title;
      tdTitle.appendChild(link);
      if (p.questions) {
        const q = document.createElement("span");
        q.className = "q-badge";
        q.textContent = `?${p.questions}`;
        q.title = `${p.questions} open question(s) awaiting answers`;
        tdTitle.appendChild(q);
      }

      const tdAge = document.createElement("td");
      tdAge.setAttribute("data-sort-value", p.iso);

      const tdAssignee = document.createElement("td");
      tdAssignee.textContent = p.assignee || "—";

      const tdSteps = document.createElement("td");
      tdSteps.textContent = `${p.steps.done}/${p.steps.total}`;
      if (p.steps.note) {
        const small = document.createElement("small");
        small.textContent = ` (${p.steps.note})`;
        tdSteps.appendChild(small);
      }

      tr.append(tdStatus, tdTitle, tdAge, tdAssignee, tdSteps);
      tbody.appendChild(tr);
    }

    fillSelect("assignee", plans.map((p) => p.assignee).filter(Boolean));
    fillSelect("tag", plans.flatMap((p) => p.tags || []));
  }

  function fillSelect(key, values) {
    const select = document.querySelector(`select[data-filter="${key}"]`);
    if (!select || select.options.length > 1) return; // baked options win
    for (const v of [...new Set(values)].sort()) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
  }

  function applyFilters(rows, f) {
    rows.forEach((tr) => {
      const title = (tr.querySelector(".title")?.textContent || "").toLowerCase();
      const status = (tr.getAttribute("data-status") || "").toLowerCase();
      const assignee = (tr.getAttribute("data-assignee") || "").toLowerCase();
      const tags = (tr.getAttribute("data-tags") || "").toLowerCase().split(",");
      const show =
        (!f.search || title.includes(f.search)) &&
        (!f.status || status === f.status) &&
        (!f.assignee || assignee === f.assignee) &&
        (!f.tag || tags.includes(f.tag));
      tr.hidden = !show;
    });
  }

  function sortBy(table, rows, th) {
    const key = th.getAttribute("data-sort");
    const idx = Array.from(th.parentNode.children).indexOf(th);
    const asc = th.getAttribute("aria-sort") !== "ascending";

    table.querySelectorAll("th[data-sort]").forEach((h) => h.removeAttribute("aria-sort"));
    th.setAttribute("aria-sort", asc ? "ascending" : "descending");

    const value = (tr) => {
      const cell = tr.children[idx];
      if (key === "age") return cell.getAttribute("data-sort-value") || "";
      if (key === "progress") {
        const [m, n] = (cell.textContent.split("/").map(Number));
        return n ? m / n : 0;
      }
      return cell.textContent.trim().toLowerCase();
    };

    rows.sort((a, b) => {
      const va = value(a), vb = value(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return asc ? cmp : -cmp;
    });
    const tbody = table.querySelector("tbody");
    rows.forEach((tr) => tbody.appendChild(tr));
  }
})();
