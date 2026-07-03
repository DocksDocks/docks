---
title: Evaluate OKF knowledge bundles for consumer projects (parked stub)
goal: Decide whether docks ships an op/skill that seeds an OKF-conformant knowledge/ bundle (project facts as an LLM-wiki) wired into context-tree — and implement it if yes.
status: in_review
in_review_since: "2026-07-03T15:08:00-03:00"
created: "2026-07-01T17:56:26-03:00"
updated: "2026-07-03T14:10:29-03:00"
started_at: "2026-07-03T13:40:00-03:00"
assignee: claude
tags: [okf, knowledge, skills, exploration, parked]
affected_paths:
  - plugins/docks/skills/productivity/okf-bundle/SKILL.md
related_plans: [knowledge-format-lint-and-citations]
review_status: passed
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
| 1 | Read the OKF spec (`GoogleCloudPlatform/knowledge-catalog` → `okf/`) — read-only; record the v0.1 conformance surface (frontmatter fields, directory conventions, linking) | notes → this plan | — | done |
| 2 | Review `scaccogatto/okf-skills` read-only (treat as untrusted): what its skills/checker do, license, quality, whether to recommend/vendor/reimplement | notes → this plan | — | done |
| 3 | Decide the shape via the open question below (surface options through the native picker); encode the decision here | this plan | 1, 2 | done |
| 4 | Implement per the decision (new skill / scaffold-op extension / documented recommendation) + run the kit gate | `plugins/docks/skills/productivity/okf-bundle/SKILL.md` (new), this plan | 3 | done |

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

## Step 1 findings — OKF v0.1 conformance surface (recorded 2026-07-03, fetched from primary source)

Source of truth: `okf/SPEC.md` in `GoogleCloudPlatform/knowledge-catalog`, header **"Version 0.1 — Draft"**. "A directory of markdown files with YAML frontmatter. There is no schema registry, no central authority, and no required tooling."

- **Directory conventions:** no required root name (`knowledge/` is a free, conformant choice). A bundle MAY be "a subdirectory within a larger repository" — the docks case, sanctioned verbatim. Layout: optional `index.md` + `log.md` at any level, `<concept>.md` files, arbitrary nesting. **Reserved filenames** (MUST NOT be concept docs): `index.md` (§6 listing; "contain no frontmatter", except the bundle-root one MAY carry `okf_version: "0.1"` only) and `log.md` (§7 history; date headings MUST be ISO `YYYY-MM-DD`).
- **Frontmatter (§4.1):** `type` (short string) is the ONLY **required** field — "not registered centrally… consumers MUST tolerate unknown types". Recommended: `title`, `description`, `resource` (URI of the underlying asset). Optional: `tags` (list), `timestamp` (ISO 8601). Extensions: any additional keys allowed; consumers SHOULD preserve unknown keys and SHOULD NOT reject them. Body: no required sections; conventional `# Schema` / `# Examples` / `# Citations` (numbered `[1] [label](url)`).
- **Linking (§5):** standard markdown links only — NO wiki-links, no id scheme. Concept ID = bundle-relative path minus `.md`. Bundle-absolute form `[x](/tables/x.md)` is "recommended"; relative links equally conformant. Normative: "Consumers MUST tolerate broken links" (a broken link = not-yet-written knowledge, not malformed).
- **Conformance (§9 — the whole surface):** (1) every non-reserved `.md` **in the bundle tree** has parseable YAML frontmatter; (2) every frontmatter block has non-empty `type`; (3) reserved files follow §6/§7 when present. Everything else is soft; consumers MUST NOT reject over missing optional fields, unknown types/keys, broken links, or missing indexes.
- **Stability risk (Draft, 57 open issues):** most churn-likely: required field rename `type`→`kind` (#154) and reserved-filename renames `index.md`→`README.md`/`_index.md`, `log.md`→`CHANGELOG.md` (#146/#164). #157: bundle-absolute links render broken on GitHub — prefer relative links for GitHub readability. Mitigation: pin `okf_version: "0.1"` in the bundle-root `index.md`.
- **License:** `okf/LICENSE.md` is standard Apache-2.0 (verified raw) — the spec text itself is covered.
- **Collision analysis for docks wiring:**
  - Criterion 1 scopes to the **bundle tree only** — skills/AGENTS.md/CLAUDE.md outside `knowledge/` are untouched by design; the decided "no retrofit" stance costs nothing.
  - **A context-tree node INSIDE the bundle breaks conformance**: `AGENTS.md`/`CLAUDE.md` are not reserved names, so inside `knowledge/` they'd be frontmatter-less concept documents violating criteria 1–2. Resolution: document `knowledge/` from the PARENT node (e.g. root AGENTS.md context-tree table row), never nest a node in the bundle.
  - A SKILL.md inside a bundle would violate criterion 2 (no `type`); keep skills out of the bundle tree. Only `description` overlaps by name across vocabularies; keep OKF `timestamp` and skill `metadata.updated` independent.
  - Claude Code skill discovery scans only `*/SKILL.md` — no discovery collision. Audit any pre-existing `index.md`/`log.md` under a chosen root before claiming conformance (criterion 3 claims them).

## Step 2 findings — `scaccogatto/okf-skills` review (recorded 2026-07-03, read-only, nothing executed)

Repo public, "The OKF toolkit for Claude Code". 29 stars, single author (Marco Boffo), 11 commits 2026-06-14→06-28, v0.3.3 (7 releases in 14 days).

- **Ships:** 3 skills (`okf` author/maintain/consume with vendored SPEC.md + templates; `validate` conformance checker; `visualize` HTML graph). Plugin manifest is minimal and clean: **no hooks (by design, documented ADR), no MCP servers, no commands/agents** — nothing runs on install. Dual distribution (Claude marketplace + skills.sh).
- **Checker (`okf_validate.py`, ~220 lines):** pure linter — stdlib + PyYAML only, `yaml.safe_load` exclusively, zero writes/network/subprocess/eval/env-reads/telemetry. ERRORs = the three §9 criteria; warnings = soft guidance (`--strict` promotes). CI runs it strict on two bundles + a negative self-test.
- **License:** the toolkit is **MIT** (NOT Apache-2.0 as this plan's Context assumed — corrected; only the vendored SPEC.md is Apache-2.0 © Google, with the full rider in LICENSE). Both permissive; an `upstream:` vendoring block would cite MIT.
- **Quality:** SKILL.md files meet agentskills.io structure (fenced frontmatter, name-matches-dir, "Use when"-style descriptions, allowed-tools, <500 lines); no docks-style `<constraint>` blocks or `metadata.updated`. Good practice: the skill instructs agents to read the vendored spec and run the deterministic checker rather than trust memory.
- **Red flags:** none material. Two soft items: (1) generated `viz.html` loads cytoscape+marked from cdn.jsdelivr.net at view time (runtime CDN surface; not offline); (2) non-`uv` fallback pip-installs `pyyaml`.
- **Verdict lean (evidence-based):** **(i) recommend-with-caveats** — small, auditable in one sitting, safe by construction, zero overlap with what docks ships; caveats = 3 weeks old, bus factor 1, tracks a draft spec. (ii) vendoring freezes a fast-moving 0.x into docks' cadence (stale within weeks) — only if OKF becomes first-class in docks. (iii) reimplementing a 220-line linter over someone else's spec buys no differentiation and forks conformance semantics — unless docks specifically wants a Node port inside `ci.mjs` to avoid the Python/uv dependency. (iv) ignore has the worst risk/reward given upstream's backing (Google Cloud, 6k stars in 2 months) and the near-zero cost of a caveated recommendation.

## Step 3 decision — RESOLVED: implement Google's OKF natively as shape (a)

**User direction (2026-07-03, verbatim):** *"i wanted the OKF from google, and i wanted you to implement it, use agent-browser skill to search properly. use opus agents to research for you."* — i.e. IMPLEMENT (rules out (c) companion-only and (d) re-park); the docks deliverable targets **Google's** OKF spec directly. Shape **(a)** (new docks skill, not a scaffold-only extension) chosen because it reaches EXISTING consumer projects, not just newly scaffolded ones.

**Canonical-identity verification (2026-07-03, two opus agents, live browsing via agent-browser):** the official Google Cloud announcement (2026-06-12, authors Sam McVeety + Amir Hormati, Google Cloud Data Cloud team) links the spec to exactly `github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf` ("The repo, the spec, and the sample bundles are available in GitHub"). No Google-owned OKF site exists beyond that repo. Lookalikes found and ruled out: **Open Knowledge Foundation** (okfn.org — unrelated nonprofit, the classic OKF/OKFN abbreviation), **okf.md** (third-party MIT community docs site that itself names Google's repo as canonical), **openknowledgeformat.com** (third-party builder guide), **okf.kr** (unrelated Korean company). The spec deep-read agent independently re-derived the Step 1 surface from the live pages — **identical on every point** (required `type`, reserved `index.md`/`log.md`, §9 clause verbatim, Apache-2.0). New facts from the browse: Google's own sample bundles use RELATIVE links (deviating from the spec's "recommended" absolute form; open PR #165 proposes flipping that recommendation — reinforces our relative-links choice) and don't set `okf_version` in their root indexes (we still pin it — §11 permits and it hedges draft churn); the repo README carries the standard GoogleCloudPlatform OSS disclaimer "not an official Google product"; issue #43 proposes giving OKF its own repo (watch for a canonical-home move).

**Implementation contract (step 4):**
1. New cross-tool skill `plugins/docks/skills/<category>/okf-bundle/` — seeds and maintains an OKF v0.1 bundle at `knowledge/` in consumer projects: root `index.md` (frontmatter = `okf_version: "0.1"` only), starter concept(s) with `type` (+ recommended `title`/`description`/`tags`/`timestamp`), optional `log.md` (ISO date headings).
2. Conformance discipline embedded in the skill (the §9 three criteria as a validation loop) — docks ships NO checker script; relative links throughout (GitHub-safe, matches Google's own samples).
3. Context-tree wiring FROM THE PARENT node (a row in the root AGENTS.md pointing at `knowledge/`); NEVER an AGENTS.md/CLAUDE.md inside the bundle tree (breaks §9 criteria 1–2 — verified twice).
4. Routing vs `context-tree` skill (conventions vs knowledge split) so the overlap guard passes; CSO description with "Use when…" + "Not …".
5. Gate: skill scorer per-file floor + `node scripts/skills/content-hash.mjs --backfill plugins/docks/skills` + `node scripts/ci.mjs` exit 0.

## Self-review

Score: 58/100 (parked-stub tier: one score + single critique pass, no iteration). Intentionally under-specified: Standalone executability and Executable acceptance score low because the deliverable shape is itself the step-3 decision — the stub's job is to preserve the idea, the sources, and the already-made negative decisions (no skill/AGENTS.md retrofit) so a future session starts warm. Critique pass caught: the original draft let step 4 float with no gate — now conditioned on the scorer floor + ci.mjs; and the "don't ship" outcome now has an explicit terminal path (finished/ as decided-not-to-build).

**Draft-review addendum (2026-07-02, parked-stub tier — one adversarial pass, no hill-climb):** Re-verified sound and NOT obsoleted now that [[knowledge-format-lint-and-citations]] has fully shipped (`finished/2026-07-01-knowledge-format-lint-and-citations.md`, `ship_commit 9e7a732`; the wiki-link + `related_plans` entry now resolve under `finished/`, not `active/`). Premises hold: the OKF/Karpathy prior-art citations this stub leans on landed verbatim at `context-tree/SKILL.md:13` + `write-skill/SKILL.md:184`, and the negative decisions (no OKF frontmatter on skills/AGENTS.md) are locked into that shipped plan's Out-of-scope. The stub's own deliverable — a seeded OKF `knowledge/` bundle — remains untouched (no `knowledge/` dir, no OKF bundle skill in the tree), i.e. exactly the "separate, larger option the maintainer did not select" the shipped plan left out of scope; the `shape` open question (a/b/c) is still genuinely open, blocked on steps 1–2 findings. Cold entry point unchanged: steps 1–2 are read-only research needing only WebFetch. **One stale anchor corrected:** the Context parking rationale "the Rust port takes priority" is superseded — that port shipped (`finished/2026-07-02-session-relay-rust-port.md`, v0.2.1→v0.2.2); the stub stays validly parked, now behind newer session-relay work rather than the rust port.

## Step 4 record — implemented 2026-07-03

Shipped `plugins/docks/skills/productivity/okf-bundle/SKILL.md` (new, 182 lines, `user-invocable: true`, pattern meta-skill): 3 ops (seed / add concept / audit), 3 constraints (the §9 triad + no nested context nodes; relative links + okf_version pin; verified-facts-only + conventions-vs-knowledge boundary), reachability rule for indexes, reserved-file structures, self-contained bash conformance loop (parameterized `B=<root>`, checks §9.1/9.2, frontmatter in ANY reserved file, and the version pin), context-tree wiring from the parent node, gotchas incl. draft-churn hedges. Scorer: **16/16** (floor 8); description exactly 500 chars, CSO + routing vs context-tree/scaffold; trigger-collision test green; `node scripts/ci.mjs` exit 0.

**Fresh-instance QA (Claude-B cold run, per write-skill loop):** a zero-context subagent executed all 3 ops in a scratch project using only the skill file. Verdict FIX FIRST with 4 must-fix defects — all fixed and re-verified: (1) add-concept could leave a concept invisible from the root index → reachability rule added; (2) audit overclaimed "empty output = conformant" while missing log.md frontmatter and the pin → loop extended (both now caught) + honest wording of what stays manual; (3) audit path-coupled (`! -path knowledge/index.md` false-positives on relocation) → parameterized `B=` + cwd stated; (4) reserved-file structures undefined → concrete index/log formats added. Re-ran the loop against the QA bundle: silent on clean, catches all four break classes, no false positive relocated to `sub/kb`. Follow-ups also applied: seed gained a fact-sourcing step; the dangling in-bundle citation example became an external URL with an in-bundle caveat.

## Review

- **Goal met:** yes — the decision (step 3: implement Google's OKF v0.1) is made and shipped as the new `plugins/docks/skills/productivity/okf-bundle/SKILL.md` (seed / add-concept / audit ops, the §9 conformance triad as constraints, relative links + `okf_version` pin, context-tree wiring from the PARENT node).
- **Regressions:** none — the OKF-scoped diff adds `okf-bundle/SKILL.md` and edits this plan file only; no existing skill, script, or manifest is touched. `node scripts/ci.mjs` exits 0.
- **CI:** pass — `node scripts/ci.mjs` exit 0 (skill scorer 16/16, productivity floor 8; `tests/skill-trigger-collision.mjs` 28 skills, 6 high-overlap pairs all routed). The one non-blocking `⚠` is a pre-existing session-relay host-rebuild digest local-variance note, unrelated to this plan.
- **Follow-ups:** none
- Filed by: plan-review on 2026-07-03T14:10:29-03:00

## Sources

- [Google Cloud OKF announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) — OKF v0.1 = directory of markdown + YAML frontmatter; spec lives in the knowledge-catalog repo.
- [GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog) — Apache-2.0 (repo LICENSE), `okf/` spec dir.
- [scaccogatto/okf-skills](https://github.com/scaccogatto/okf-skills) — third-party Claude Code plugin + skills for OKF bundles; conformance checker; REVIEWED 2026-07-03 (step 2): MIT (toolkit) + Apache-2.0 (vendored SPEC.md only), no hooks/MCP, pure-linter checker — see Step 2 findings.
- [okf/SPEC.md raw](https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md) — the v0.1 Draft spec text, fetched verbatim 2026-07-03 (basis of Step 1 findings; §3 layout, §4.1 frontmatter, §5 links, §9 conformance, §11 versioning).
- [knowledge-catalog issues](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues) — 57 open at review time; churn signals #146/#154/#157/#164 (reserved-filename + `type` renames, absolute-link rendering).
- [okf_validate.py raw](https://raw.githubusercontent.com/scaccogatto/okf-skills/main/skills/validate/scripts/okf_validate.py) — the ~220-line checker read line-by-line for the step-2 security/quality verdict.
- [Karpathy LLM-Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — the pattern + the token-reduction experiments; Lint op already adapted into `context-tree audit` by [[knowledge-format-lint-and-citations]].
- [OKF: The Markdown Standard Built for AI Agents](https://agenticaidecode.substack.com/p/open-knowledge-format-okf-the-markdown) — 2026-06 framing: OKF formalizes the LLM-wiki + AGENTS.md lineage.
