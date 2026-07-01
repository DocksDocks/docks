---
title: Adopt LLM-Wiki Lint checklist + OKF/Karpathy prior-art citations
goal: Fold Karpathy's LLM-Wiki Lint checks into context-tree audit + skill-maintenance drift, and cite OKF + Karpathy LLM-Wiki as convergent prior art — no vendoring.
status: in_review
created: "2026-07-01T15:56:09-03:00"
updated: "2026-07-01T17:36:35-03:00"
in_review_since: "2026-07-01T17:34:39-03:00"
started_at: "2026-07-01T17:31:29-03:00"
assignee: claude
tags: [skills, context-tree, skill-maintenance, prior-art, documentation]
affected_paths:
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md
  - plugins/docks/skills/productivity/skill-maintenance/SKILL.md
  - plugins/docks/skills/productivity/write-skill/SKILL.md
related_plans: []
review_status: passed
planned_at_commit: "7ee6a0de28bdae9109282cfba3acc5803df69242"
---

# Adopt LLM-Wiki Lint checklist + OKF/Karpathy prior-art citations

## Goal

Turn the investigation's one genuinely-additive finding into shipped improvements: (1) enrich the `context-tree audit` op (and `skill-maintenance` drift detection) with **Karpathy's LLM-Wiki "Lint" checklist** — the checks docks does not yet run; and (2) add **prior-art citations** noting that Google's Open Knowledge Format (OKF) and Karpathy's LLM-Wiki independently validate docks' own markdown-plus-frontmatter-plus-progressive-disclosure design. **No content is vendored** — patterns are reimplemented in docks' own words. Success = the new Lint items appear in the audit op, the citations are present, and `node scripts/ci.mjs` is green (content hashes re-synced).

## Context & rationale

- **Why citation, not adoption (the gate):** the investigation found `claude-mega-brain` (MIT) is architecture-mismatched (its value is a Claude hook + a homegrown `type:` convention docks doesn't ship), OKF (Apache-2.0) is a *data-asset* metadata format with no OKF-aware consumer in docks and would collide with the agentskills.io schema, and the Karpathy gist is **unlicensed** (all-rights-reserved) so its prose can't be vendored. All three are convergent descendants of the same LLM-Wiki pattern docks already implements. Therefore the correct, proportionate action is a citation + borrowing one uncopyrightable idea — not importing schema, files, or a dependency.
- **Why the Lint checklist is the additive slice:** docks' `context-tree audit` already checks "AGENTS.md claims that no longer match current source." Karpathy's Lint adds checks docks lacks: **contradictions between nodes, orphan nodes (no inbound links), concepts mentioned but lacking their own node, missing cross-references, and web-fillable data gaps.** These map cleanly onto the existing read-only audit.
- **docks already cites Karpathy** (`capability-tuning` — "Grounded in context engineering (Karpathy's method)"), so this extends an acknowledged lineage rather than introducing a new dependency.

## Environment & how-to-run

- **Setup:** `corepack enable && pnpm install --frozen-lockfile` (once).
- **Gate:** `node scripts/ci.mjs` — must be green; it includes the `skill content_hash in sync` check, so any SKILL.md prose change requires re-syncing `metadata.content_hash` + bumping `metadata.updated`.
- **Content-hash re-sync:** run `node scripts/skills/content-hash.mjs --backfill` — it recomputes each skill's `content_hash` from its body **plus its sorted `references/*.md`**, so editing a reference file re-drives the OWNING SKILL.md's hash even if the body was untouched. Bump `metadata.updated` per the `skill-maintenance` procedure. Do NOT hand-edit hashes to pass CI.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Add the LLM-Wiki **Lint checklist** to the `context-tree audit` op: extend the audit row + the audit workflow bullet, and the audit procedure reference, with the five new checks (contradictions between nodes · orphan nodes with no inbound links · concepts mentioned but lacking a node · missing cross-references · web-fillable data gaps). Keep `audit` **read-only** (report drift, never write). | `plugins/docks/skills/productivity/context-tree/SKILL.md:36,103` (audit op row + workflow bullet), `plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md` (audit procedure) | — | done |
| 2 | Extend `skill-maintenance` **Drift Detection** with ONLY the checks that map to a single skill (it has no node graph): **intra-skill contradiction** and **stale claim superseded by newer source**. Do NOT add the graph-only checks (orphan / no-inbound-link, cross-node contradiction, missing cross-reference) — those live in `context-tree audit` alone. | `plugins/docks/skills/productivity/skill-maintenance/SKILL.md` (Drift Detection §, ~L91-101) | — | done |
| 3 | Add the **prior-art citations**: in `write-skill` (alongside the existing Matt Pocock / skill-creator citation, ~L184) note that Google's OKF (Apache-2.0) and Karpathy's LLM-Wiki independently standardize the same markdown+frontmatter+progressive-disclosure pattern; and add a one-line prior-art note to `context-tree` (near L13 "The pattern is canon, not invention"). Cite URLs; vendor nothing. | `plugins/docks/skills/productivity/write-skill/SKILL.md:184`, `plugins/docks/skills/productivity/context-tree/SKILL.md:13` | — | done |
| 4 | Re-sync metadata: run `node scripts/skills/content-hash.mjs --backfill` and bump `metadata.updated` on every changed SKILL.md — including `context-tree/SKILL.md`, whose hash is re-driven by the Step-1 `references/conflict-resolution.md` edit even though its body is untouched; confirm `node scripts/ci.mjs` passes. | `context-tree/SKILL.md`, `skill-maintenance/SKILL.md`, `write-skill/SKILL.md` frontmatter | 1, 2, 3 | done |

## Interfaces & data shapes

N/A — doc/skill prose edits; no cross-task data contract.

## Acceptance criteria

- **All five Lint checks present — one grep per check, each ≥1 match** (a single summed `≥5` can be gamed: overlapping alternatives can score 2+ on one line while another check is absent entirely). Over `F="plugins/docks/skills/productivity/context-tree/SKILL.md plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md"`, each of these exits 0:
  - `grep -qiE 'contradiction[s]? between nodes' $F` (cross-node contradiction)
  - `grep -qiE 'no inbound link' $F` (orphan node)
  - `grep -qiE 'lacking (a |its own )?node' $F` (concept mentioned but node-less)
  - `grep -qiE 'missing cross-referenc' $F` (missing cross-references — the check the old summed criterion never verified)
  - `grep -qiE 'web-fillable' $F` (data gaps)

  (The bare words `orphan`/`coverage gap` already exist at `conflict-resolution.md:19,62`; every pattern above is distinctive new phrasing.)
- **Citations present:** `grep -niE 'open knowledge format|OKF|LLM-Wiki|llm wiki' plugins/docks/skills/productivity/{write-skill,context-tree}/SKILL.md` → matches the new prior-art notes.
- **Audit stays read-only:** `grep -n 'never writes' plugins/docks/skills/productivity/context-tree/SKILL.md` still matches and the `context-tree audit` op row's `Writes?` column is still `no`; `grep -niE 'audit.*(\bWrite\b|\bEdit\b|git mv)' plugins/docks/skills/productivity/context-tree/SKILL.md` → no match (no write verb added to the audit op).
- **Gate green:** `node scripts/ci.mjs` → exits 0, including `docks skill content_hash in sync` and `docks skill frontmatter valid`.
- **No vendored files:** `grep -rn 'upstream:' plugins/docks/skills/productivity/{context-tree,skill-maintenance,write-skill}/SKILL.md` → no match (this is reimplementation/citation, not vendoring).

## Out of scope / do-NOT-touch

- **No `claude-mega-brain` file, script, or SKILL.md is vendored** — no `upstream:` block, no Python hook. Reimplement ideas only.
- **No OKF schema/frontmatter** (`type`, `resource`) is added to any docks skill — it has no consumer and collides with agentskills.io.
- **No new "knowledge-base" skill** in this plan (that was a separate, larger option the maintainer did not select).
- **Do NOT quote the Karpathy gist prose** — it is unlicensed; cite it as prior art and describe the idea in docks' own words.
- The `context-tree` **approval-gate / relocation** machinery is untouched — this only extends the read-only `audit` and adds citations.

## Known gotchas

- Editing a SKILL.md body **without** re-syncing `metadata.content_hash` fails `ci.mjs`'s content-hash gate. Step 4 exists precisely to avoid this; run it last.
- Keep each SKILL.md ≤ 500 lines — if a Lint addition pushes `context-tree` over, extract detail into `references/conflict-resolution.md` rather than bloating the body.
- The `context-tree audit` and `skill-maintenance` descriptions are CSO-scored; don't reword the `description:` frontmatter (only the body) unless you re-run the scorer.

## Global constraints

- Skill descriptions start with "Use when…" and stay ≤ 1024 chars (agentskills.io + kit CSO).
- `references/*.md` files are 30–150 lines each, loaded on demand.
- Attribution: OKF is Apache-2.0 (per the `knowledge-catalog` repo LICENSE — citation/quote fine); the Karpathy gist has no license (idea reimplemented, prose not copied).

## Cold-handoff checklist

1. **File manifest** — ✓ every step names exact path(s) (`context-tree/SKILL.md:13,36,103`, `references/conflict-resolution.md`, `skill-maintenance/SKILL.md:91-101`, `write-skill/SKILL.md:184`).
2. **Environment & commands** — ✓ `node scripts/ci.mjs` (gate), `node scripts/skills/content-hash.mjs --backfill` (hash resync).
3. **Interface & data contracts** — N/A — prose/skill edits, no cross-task contract.
4. **Executable acceptance** — ✓ grep-based criteria with expected match counts.
5. **Out of scope** — ✓ no vendoring, no OKF schema, no new skill, no gist prose.
6. **Decision rationale** — ✓ citation-not-adoption gate (license + architecture mismatch) in Context.
7. **Known gotchas** — ✓ content-hash gate, references-drive-parent-hash, ≤500-line cap, CSO description.
8. **Global constraints verbatim** — ✓ CSO ≤1024, references 30–150 lines, OKF Apache-2.0 / gist unlicensed.
9. **No undefined terms / forward refs** — ✓ no TBD/TODO; every path/command resolves in-repo.

## STOP conditions

- If `node scripts/ci.mjs` is still red after `node scripts/skills/content-hash.mjs --backfill` (step 4) → STOP; do NOT hand-edit `content_hash` to force green. A persistent red means the body/reference change wasn't captured — re-run the backfill or investigate the diff, don't paper over it.

## Open questions

_None — scope (citations + Lint checklist, no new skill, no vendoring) was chosen by the maintainer._

## Self-review

Score: 87 → ~90/100 · trajectory 73→89→87→~90 (two fresh-context `plan-review` red-teams; all findings applied pre-start) · stopped: second review pass, fixes applied. A web-verification pass (2026-07-01) fixed one **mis-sourced** claim: OKF's Apache-2.0 license was cited to the Google Cloud blog, which doesn't state it — the actual source is the `knowledge-catalog` repo LICENSE (claim itself confirmed true). Format + Karpathy Lint items verified verbatim (see Sources → External research). **Second re-review (87/100)** caught that the Lint acceptance grep was gameable (summed `≥5` satisfiable by overlapping alternatives on one line) and silently omitted the "missing cross-references" check — replaced with five per-check greps, each required to match. Step 2's over-declared dependency on Step 1 corrected to `—` (different files, disjoint check subsets). The `capability-tuning:24,181` lineage anchors were re-verified this session (Karpathy context-engineering quote + primary-source list — both hold).

Red-team caught and fixed: (1) acceptance criterion 1's Lint grep false-passed on pre-existing "orphan"/"coverage gap" text in `conflict-resolution.md` — now greps distinctive new phrases with a min count; (2) Step 2 mapped graph-only checks onto per-skill `skill-maintenance` (which has no node graph) — now scoped to intra-skill contradiction + stale-claim only; (3) the required `## Cold-handoff checklist` spine section was missing and the exact hash command wasn't inlined — both added (`node scripts/skills/content-hash.mjs --backfill`); (4) reference edits silently re-drive the parent SKILL.md hash, and step 4 had no CI-red STOP — both now stated. All 10 cited anchors resolved; two minor line-number imprecisions corrected (skill-maintenance L91-101, capability-tuning L3).

## Mistakes & Dead Ends

- **2026-07-01T17:34:39-03:00**: Graph-Lint addition pushed `conflict-resolution.md` from 87 → 101 lines → `refs-guard` failed (references >100 lines with 3+ headings need a `## Contents` TOC), which also failed the scaffold seed test downstream → fixed by adding the TOC; the plan's gotchas listed the 500-line SKILL cap and the 30–150-line reference band but missed the >100-line TOC rule — check `refs-guard.mjs` thresholds when growing any reference file.

## Review

- **Goal met: yes** — work commit `4303561` lands both slices: the LLM-Wiki graph Lint (5 checks) in `context-tree audit` (op row L36, workflow bullet L103, Graph Lint table in `references/conflict-resolution.md`) plus the two per-skill drift rows in `skill-maintenance` (intra-skill contradiction + stale-claim), and the OKF/Karpathy prior-art citations in `write-skill:184` + `context-tree:13`. All 5 acceptance criteria pass (five per-check Lint greps exit 0; citations grep matches both files; `never writes` present + audit op-row `Writes? = no` + no write-verb on audit; no `upstream:` blocks). Scope clean: `git show 4303561 --stat` touches only the 3 skills' 4 files; CSO `description:` frontmatter unchanged; graph-only checks kept out of `skill-maintenance`; nothing vendored.
- **Regressions:** none — no source-anchored claim in the touched skills failed reproduction; `content_hash` re-synced on all three skills.
- **CI:** pass — `node scripts/ci.mjs` exits 0, including `docks skill content_hash in sync` and `docks skill frontmatter valid`.
- **Follow-ups:** none.
- **Filed by:** plan-review (completion) 2026-07-01T17:36:35-03:00

## Sources

- `plugins/docks/skills/productivity/context-tree/SKILL.md:36` — `context-tree audit` op row (read-only drift report, "claims that no longer match current source").
- `plugins/docks/skills/productivity/context-tree/SKILL.md:103` — audit workflow bullet (verifies source-anchored claims, never writes).
- `plugins/docks/skills/productivity/context-tree/SKILL.md:13` — "The pattern is canon, not invention" (citation anchor).
- `plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md` — full audit procedure.
- `plugins/docks/skills/productivity/skill-maintenance/SKILL.md:91-101` — Drift Detection table.
- `plugins/docks/skills/productivity/write-skill/SKILL.md:184` — existing Matt Pocock / skill-creator prior-art citation (add OKF + Karpathy here).
- `plugins/docks/skills/productivity/capability-tuning/SKILL.md:3` — the quoted "Grounded in context engineering (Karpathy's method)" (description); `:24,181` — Karpathy lineage anchors.
**External research (web-verified 2026-07-01, not from memory):**
- [Google Cloud OKF announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) — "Published by the Google Cloud Data Cloud team … an open specification"; "OKF v0.1 represents knowledge as a **directory of markdown files with YAML frontmatter**, with a small set of agreed-upon conventions" (fields: type/title/description/resource/tags/timestamp). → format claim verified. The blog itself does **not** state a license.
- [GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog) (contains the `okf/` spec) — repo README + LICENSE: **"All solutions within this repository are provided under the Apache 2.0 license."** → the Apache-2.0 claim's actual source (the blog is not).
- [Karpathy "LLM Wiki" gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — verified verbatim: three layers (raw sources / wiki / schema), operations Ingest/Query/**Lint**; Lint health-checks for *"contradictions between pages, stale claims that newer sources have superseded, orphan pages with no inbound links, important concepts … lacking their own page, missing cross-references, data gaps."* No license stated → idea reimplemented, prose not copied. (These are exactly the checks Step 1–2 map onto `context-tree audit` + `skill-maintenance` drift.)

## Notes

The three sources are one convergent pattern; docks already runs it (skills + context-tree + `references/` progressive split). This plan captures the delta (Lint checks) and records the lineage (citations) without importing anything.
