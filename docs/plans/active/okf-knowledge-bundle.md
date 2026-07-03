---
title: Evaluate OKF knowledge bundles for consumer projects (parked stub)
goal: Decide whether docks ships an op/skill that seeds an OKF-conformant knowledge/ bundle (project facts as an LLM-wiki) wired into context-tree — and implement it if yes.
status: ongoing
created: "2026-07-01T17:56:26-03:00"
updated: "2026-07-03T13:40:00-03:00"
started_at: "2026-07-03T13:40:00-03:00"
assignee: claude
tags: [okf, knowledge, skills, exploration, parked]
affected_paths: []
related_plans: [knowledge-format-lint-and-citations]
review_status: null
planned_at_commit: "7faa53fd14ff30c20eb835e0612040050dc8abd8"
---

# Evaluate OKF knowledge bundles for consumer projects (parked stub)

## Goal

Docks organizes **conventions** (skills, AGENTS.md nodes); OKF bundles organize **knowledge** (project/org facts an agent would otherwise re-derive from raw documents — the Karpathy LLM-wiki pattern, up to ~95% token reduction in his experiments). The two are complementary, not competing. Decide whether docks should ship a way to seed an **OKF v0.1-conformant `knowledge/` bundle** in consumer projects, wired into the context-tree — and if yes, implement it. Deliberately NOT a retrofit of OKF frontmatter onto skills (schema collision with agentskills.io) or AGENTS.md (inert frontmatter noise) — that was already decided against in [[knowledge-format-lint-and-citations]].

## Context & rationale

- OKF released 2026-06-12, Apache-2.0, formalizes the LLM-wiki pattern (and explicitly cites the AGENTS.md/CLAUDE.md convention as prior art). Docks already implements the *pattern*; this stub is about interop with the *format* where it fits: project knowledge, not conventions.
- A third-party toolchain exists: `scaccogatto/okf-skills` (Claude Code plugin + skills for authoring/validating/visualizing OKF bundles, with a conformance checker). **Untrusted until reviewed** — read-only evaluation first, per repo security policy.
- Maintainer direction (2026-07-01, verbatim intent): park the idea so it doesn't evaporate; the Rust port takes priority.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Read the OKF spec (`GoogleCloudPlatform/knowledge-catalog` → `okf/`) — read-only; record the v0.1 conformance surface (frontmatter fields, directory conventions, linking) | notes → this plan | — | planned |
| 2 | Review `scaccogatto/okf-skills` read-only (treat as untrusted): what its skills/checker do, license, quality, whether to recommend/vendor/reimplement | notes → this plan | — | planned |
| 3 | Decide the shape via the open question below (surface options through the native picker); encode the decision here | this plan | 1, 2 | planned |
| 4 | Implement per the decision (new skill / scaffold-op extension / documented recommendation) + run the kit gate | TBD by step 3 | 3 | planned |

## Acceptance criteria

- Steps 1–2 produce recorded findings in this plan (conformance surface + okf-skills verdict), each with source links.
- Step 3's decision is encoded here with rationale; the open question below is removed.
- If step 4 implements: new/changed skill passes the kit's skill scorer per-file floor and `node scripts/ci.mjs` exits 0; if the decision is "don't ship", this plan moves to `finished/` as decided-not-to-build with the reasoning kept.

## Cold-handoff checklist

1. **File manifest** — N/A until step 3 decides the shape; steps 1–3 write only to this plan file.
2. **Environment & commands** — ✓ `node scripts/ci.mjs` (gate); evaluation steps need only a browser/WebFetch.
3. **Interface & data contracts** — N/A — deferred to step 3 (the OKF v0.1 conformance surface recorded by step 1 becomes this contract).
4. **Executable acceptance** — partial by design (stub): concrete commands attach at step 4 once the shape exists.
5. **Out of scope** — ✓ no OKF frontmatter on skills or AGENTS.md (decided in [[knowledge-format-lint-and-citations]]); no execution of third-party code during review.
6. **Decision rationale** — ✓ conventions-vs-knowledge split in Goal/Context.
7. **Known gotchas** — ✓ okf-skills is untrusted third-party; OKF is v0.1 (young spec, may move).
8. **Global constraints verbatim** — ✓ OKF Apache-2.0; treat third-party plugin sources as untrusted (repo security policy).
9. **No undefined terms / forward refs** — ✓ TBDs are explicit step-3 outputs, not silent gaps.

## Open questions

- `shape` (choice, decided at step 3): **(a)** new docks skill that scaffolds + maintains a `knowledge/` OKF bundle wired into context-tree `(recommended for evaluation)` · **(b)** extend the existing `scaffold` skill with an optional OKF seed · **(c)** don't ship — document okf-skills as a compatible companion plugin instead · custom allowed. NEEDS CLARIFICATION — blocked on steps 1–2 findings.

## Self-review

Score: 58/100 (parked-stub tier: one score + single critique pass, no iteration). Intentionally under-specified: Standalone executability and Executable acceptance score low because the deliverable shape is itself the step-3 decision — the stub's job is to preserve the idea, the sources, and the already-made negative decisions (no skill/AGENTS.md retrofit) so a future session starts warm. Critique pass caught: the original draft let step 4 float with no gate — now conditioned on the scorer floor + ci.mjs; and the "don't ship" outcome now has an explicit terminal path (finished/ as decided-not-to-build).

**Draft-review addendum (2026-07-02, parked-stub tier — one adversarial pass, no hill-climb):** Re-verified sound and NOT obsoleted now that [[knowledge-format-lint-and-citations]] has fully shipped (`finished/2026-07-01-knowledge-format-lint-and-citations.md`, `ship_commit 9e7a732`; the wiki-link + `related_plans` entry now resolve under `finished/`, not `active/`). Premises hold: the OKF/Karpathy prior-art citations this stub leans on landed verbatim at `context-tree/SKILL.md:13` + `write-skill/SKILL.md:184`, and the negative decisions (no OKF frontmatter on skills/AGENTS.md) are locked into that shipped plan's Out-of-scope. The stub's own deliverable — a seeded OKF `knowledge/` bundle — remains untouched (no `knowledge/` dir, no OKF bundle skill in the tree), i.e. exactly the "separate, larger option the maintainer did not select" the shipped plan left out of scope; the `shape` open question (a/b/c) is still genuinely open, blocked on steps 1–2 findings. Cold entry point unchanged: steps 1–2 are read-only research needing only WebFetch. **One stale anchor corrected:** the Context parking rationale "the Rust port takes priority" is superseded — that port shipped (`finished/2026-07-02-session-relay-rust-port.md`, v0.2.1→v0.2.2); the stub stays validly parked, now behind newer session-relay work rather than the rust port.

## Review

(filled by plan-review on completion)

## Sources

- [Google Cloud OKF announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) — OKF v0.1 = directory of markdown + YAML frontmatter; spec lives in the knowledge-catalog repo.
- [GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog) — Apache-2.0 (repo LICENSE), `okf/` spec dir.
- [scaccogatto/okf-skills](https://github.com/scaccogatto/okf-skills) — third-party Claude Code plugin + skills for OKF bundles; conformance checker; UNREVIEWED.
- [Karpathy LLM-Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — the pattern + the token-reduction experiments; Lint op already adapted into `context-tree audit` by [[knowledge-format-lint-and-citations]].
- [OKF: The Markdown Standard Built for AI Agents](https://agenticaidecode.substack.com/p/open-knowledge-format-okf-the-markdown) — 2026-06 framing: OKF formalizes the LLM-wiki + AGENTS.md lineage.
