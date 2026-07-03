---
title: Durable anchors — concept refs + re-verify cues in generated artifacts
goal: Generator skills (skill-agent-pipeline, context-tree, write-skill, okf-bundle) stop baking file:line anchors into long-lived artifacts; they anchor by path+symbol+purpose with re-verify cues, so forgotten updates degrade safely instead of misleading agents.
status: ongoing
created: "2026-07-03T14:21:10-03:00"
updated: "2026-07-03T14:35:20-03:00"
started_at: "2026-07-03T14:35:20-03:00"
assignee: claude
tags: [skills, context-tree, skill-agent-pipeline, okf, drift, conventions]
affected_paths:
  - plugins/docks/skills/productivity/write-skill/SKILL.md
  - plugins/docks/skills/productivity/write-skill/references/durable-anchors.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/references/skills-builder.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/references/pattern-scanner.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/references/content-auditor.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/references/verifier.md
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md
  - plugins/docks/skills/productivity/context-tree/references/node-template.md
  - plugins/docks/skills/productivity/okf-bundle/SKILL.md
  - plugins/docks/skills/engineering/human-docs-workflow/ (removed)
  - plugins/docks/README.md
  - scripts/skills/durable-anchors.mjs
  - scripts/ci.mjs
related_plans: [okf-knowledge-bundle]
review_status: null
planned_at_commit: "18d69a448b22edebea44b976af3baf654916b612"
---

# Durable anchors — concept refs + re-verify cues in generated artifacts

## Goal

Today the generator skills instruct agents to write exact `file:line` anchors into **long-lived** artifacts (generated SKILL.md files, AGENTS.md nodes), then cope with the inevitable drift through periodic repair (content-audit phases, context-tree `audit`). Maintainer direction (2026-07-03, verbatim intent): *"what i think its wrong is to mention exact lines on files … instead of sharing the concept of the files … giving them the purpose of the code and if the purpose or conditions change, we update the skill in that way, instead of having to update everytime a line is changed or added … we cant always keep the skills/AGENTS.md/context-tree updated, but we can make it in a way that doesnt harm future agents when we forgot to update something. and always enforce to re-check some informations that are valuable."*

The fix has three parts: (1) a **durable-anchor grammar** for long-lived artifacts — `path + symbol + one-line purpose + (verify: <re-derivation command>)`, never a bare line number; (2) a **re-verify discipline** — volatile facts (versions, counts, floors, paths) carry the cue that re-derives them, and generated artifacts tell future readers to trust the concept but re-verify the pointer; (3) a **mechanical guard** so the convention holds without relying on memory. Point-in-time artifacts (review findings, plan evidence, pipeline working notes) KEEP `file:line` — precision at creation is their job; they are consumed against a pinned commit, not maintained.

## Context & rationale

- **The artifact-class split is the load-bearing idea.** `file:line` is correct where the artifact is consumed immediately against the commit it was written at (code-review findings, security reports, plan `## Sources` reviewed against `planned_at_commit`, pipeline phase working notes). It is wrong where the artifact outlives the commit (skills, `references/`, AGENTS.md nodes, OKF concepts): the line number is the first thing to rot, and a stale-but-confident pointer actively misleads, while a purpose/symbol anchor degrades into a still-useful search hint.
- **Where the anti-pattern is mandated today** (all verified this session at `planned_at_commit`):
  - `skill-agent-pipeline/references/skills-builder.md` — "Every claim has a `file:line`" and body spine "`## Core Patterns` (tables, code, file:line)" for GENERATED skill bodies.
  - `skill-agent-pipeline/references/content-auditor.md` — claim taxonomy's first row is "file:line / path ref … read the line"; the audit exists to repair what the builder baked in.
  - `context-tree/SKILL.md` `audit` op — "verifies every source-anchored claim (path/file:line, snippet, identifier, count)"; `references/conflict-resolution.md` claim table has the same `file:line` row. Nodes are *expected* to carry line anchors.
  - `write-skill` — no durable-anchor guidance at all (the authoring conventions are silent on anchor form).
- **What is NOT broken:** the fictional teaching examples in engineering skills (`src/api/users.ts:87` in code-review/security/refactor BAD/GOOD blocks) — those paths don't exist anywhere, can't drift, and teach the *output format of point-in-time findings*, which legitimately requires `file:line`. This plan must not touch them.
- **Mechanical separability (verified):** a grep of every shipped skill body/reference for `path:NN` patterns found only fictional paths — none resolve in this repo. So "the referenced path exists on disk" cleanly separates a live (drift-prone) anchor from a teaching example, making the guard implementable without an annotation system.
- **Re-verify precedent already in the kit:** the memory-system contract ("verify it still exists before recommending it") and content-auditor's "vertical accuracy" constraint. This plan generalizes that stance into what generators EMIT.
- **Why okf-bundle is included (light-touch):** OKF concepts are long-lived facts; the skill already carries `timestamp` + `resource` + citations, but says nothing about anchoring volatile facts (limits, counts, versions) to a re-derivation source. One rule closes it.
- **Decisions (2026-07-03, via picker):** `guard-severity` = **(a) hard CI failure**. `human-docs-scope` = **custom: REMOVE the skill** — user verbatim: *"i think i dont even use human-docs anymore, i think the context-tree makes more sense than the human docs. we should even remove the human-docs-workflow skill, the context tree follows the correct pattern already, doesnt makes sense to keep this stale skill in my opinion."* So instead of re-pointing human-docs-workflow, this plan deletes it and re-routes its inbound references (skill-agent-pipeline description "Not for … (use human-docs-workflow)" + routing-table row; the `plugins/docks/README.md` skill-table row). `docs/authoring-audits.md` mentions stay — that file is an explicitly historical record. CI count floors are count-derived (N × per-file floor), so removing one engineering skill is floor-safe.
- **Repair stays; it just gets cheaper.** context-tree `audit` and pipeline phase 2c remain the safety net — but they verify symbols/behavior (rarely move) instead of line offsets (move constantly), and the guard stops new line anchors at authoring time.

## Environment & how-to-run

- Node 22.x via corepack/pnpm (already installed). All commands from repo root.
- Full gate: `node scripts/ci.mjs` (must exit 0 before every commit).
- Skill scorer: `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file` (max 16; floors: engineering 10, productivity 8).
- Structural guard: `node scripts/skills/guard.mjs`; references guard: `node scripts/skills/refs-guard.mjs` (long refs need `## Contents` TOC).
- Hash sync after ANY skill edit: `node scripts/skills/content-hash.mjs --backfill plugins/docks/skills` (then commit the rewritten hashes).
- New guard (step 5): `node scripts/skills/durable-anchors.mjs` (exit 0 clean; exit 1 listing `file → offending anchor`).
- Release (step 7, gated on user approval): push, then `node scripts/release.mjs --plugin docks minor`.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Write the convention once: `references/durable-anchors.md` under write-skill (artifact-class table: point-in-time keeps `file:line` / long-lived uses durable anchors; the anchor grammar `path — symbol — purpose — (verify: <command>)`; re-verify-cue rules for volatile facts; stale-tolerance wording generated artifacts must carry). Add an inline 3–5-line "Durable anchors" rule + one trap-table row to write-skill's SKILL.md body (inline because sibling-skill cross-links are dangling pointers per the kit rule). 30–150 lines; add `## Contents` TOC if >100 | `plugins/docks/skills/productivity/write-skill/references/durable-anchors.md` (new), `…/write-skill/SKILL.md` | — | planned |
| 2 | Re-point skill-agent-pipeline: `skills-builder.md` — generated bodies anchor by the durable grammar, bare `file:line` forbidden outside clearly-fictional examples (replace "Every claim has a `file:line`" and the body-spine mention); `pattern-scanner.md` — add scope note: phase-2b working notes KEEP `file:line` (ephemeral evidence), the builder converts them; `content-auditor.md` — claim taxonomy verifies symbols/paths/snippets by content, and a live `path:NN` in a generated body becomes its own defect class `line-anchor` (convert, don't just re-point); `verifier.md` — add a self-contained inline check (grep for `:NN` anchors whose path resolves; no docks author-script names — consumer-safety rule); SKILL.md body/description touch-ups + `metadata.updated` | 5 files under `plugins/docks/skills/productivity/skill-agent-pipeline/` | 1 | planned |
| 3 | Re-point context-tree: SKILL.md — node-authoring rule (durable anchors + re-verify cues in emitted nodes; audit op wording verifies claims by symbol/content and flags live `path:NN` as `line-anchor` findings); `conflict-resolution.md` — same claim-table change as content-auditor; `node-template.md` — template gains the volatile-fact cue convention + one stale-tolerance line. Preserve context-tree's data-preservation constraint + `## Verification` block untouched (transform-guard enforces them) | 3 files under `plugins/docks/skills/productivity/context-tree/` | 1 | planned |
| 4 | okf-bundle light-touch: one rule in the concept-authoring guidance — volatile facts in a concept body carry their re-derivation source (the `resource` URI, a command, or a citation) and bump `timestamp` on change; plus the stale-tolerance line in the seeded root `index.md` guidance. Keep body ≤310 lines | `plugins/docks/skills/productivity/okf-bundle/SKILL.md` | 1 | planned |
| 5 | Remove `human-docs-workflow` (user decision): `git rm -r plugins/docks/skills/engineering/human-docs-workflow/`; re-route inbound refs — skill-agent-pipeline description's "Not for prose docs like README/AGENTS.md (use human-docs-workflow)" → "(READMEs out of scope; AGENTS.md/CLAUDE.md → context-tree)" and its routing-table row `README / AGENTS.md / CLAUDE.md / prose docs` → `context-tree` for node files / out-of-scope for README prose; delete the `human-docs-workflow` row from `plugins/docks/README.md`. Leave `docs/authoring-audits.md` untouched (historical) | `plugins/docks/skills/engineering/human-docs-workflow/` (deleted), `…/skill-agent-pipeline/SKILL.md`, `plugins/docks/README.md` | 2 | planned |
| 6 | Mechanical guard `scripts/skills/durable-anchors.mjs`: scan shipped skill bodies + `references/` (docks + session-relay plugins) and repo AGENTS.md nodes for `path:NN` tokens where `path` resolves against the repo root → report `file → anchor`; exit 1 on any hit (fictional paths don't resolve → exempt by construction). Wire into `scripts/ci.mjs` beside the other skills guards. Severity: HARD FAIL (decided) | `scripts/skills/durable-anchors.mjs` (new), `scripts/ci.mjs` | 1 | planned |
| 7 | Dogfood on this repo: run the NEW guard (expect clean per the audit; fix any hit), run the UPDATED context-tree `audit` op over all 5 nodes + root, and the updated content-audit procedure over 2 sampled shipped skills — convert any live line anchors found, verify every re-verify cue's command actually re-derives the fact | repo AGENTS.md nodes + any files flagged | 2,3,4,5,6 | planned |
| 8 | Gate + ship: `content-hash.mjs --backfill`, `metadata.updated` bumps on all touched skills, scorer floors green, `node scripts/ci.mjs` exit 0, commit; release `docks` minor (gated on user approval via picker) | manifests via `scripts/release.mjs` | 7 | planned |

## Interfaces & data shapes

- **Durable-anchor grammar** (the emitted form, defined once in step 1):
  `` `<path>` — `<symbol or config key>` — <one-line purpose> (verify: `<command that re-derives it>`) ``
  Example: `` `scripts/config/scoring.json` — `skills.productivity.per_file_floor` — the productivity per-file scorer floor (verify: `grep -n per_file_floor scripts/config/scoring.json`) ``.
- **Artifact-class table** (step 1, the decision rule every generator copies):

| Artifact | Class | Anchor form |
|---|---|---|
| review/security/refactor findings, pipeline phase 2b/2c working notes, plan `## Sources` | point-in-time | `file:line` REQUIRED |
| SKILL.md bodies, `references/`, AGENTS.md nodes, OKF concepts | long-lived | durable grammar; bare `path:NN` forbidden unless the path is fictional (teaching example) |

- **Guard contract** (step 5): input = tracked `SKILL.md` + `references/*.md` under `plugins/*/skills/` + `AGENTS.md` files outside `docs/plans/`; detection = regex `[A-Za-z0-9_./-]+\.[a-z]{1,5}:\d+` where the path segment resolves via `fs.existsSync` from repo root; output = one line per hit `path/to/doc.md: <anchor>`; exit 0 = clean, 1 = hits found. No config, no allowlist file (decided: hard fail). Wiring: a SINGLE repo-wide invocation in `ci.mjs` (NOT inside the per-plugin skills-guard loop — its input spans both plugins' skills AND the AGENTS.md nodes). Paths resolve via `fs.existsSync` with CWD = repo root; a skill-relative anchor (`references/x.md:NN` written inside a skill) does not resolve from root and is out of the guard's reach by design — the durable convention discourages such anchors anyway and the content-audit `line-anchor` pass is the backstop. The step-1 `references/durable-anchors.md` must itself use only fictional paths in any `path:NN` bad-example, or the guard flags its own doc.
- **New content-audit defect class** (steps 2–3): verdict `line-anchor` — "live `path:NN` in a long-lived body; convert to the durable grammar" — sits beside `broken-ref`/`stale-snippet`/`fictional-api`/`drifted-description` in both content-auditor.md and conflict-resolution.md so the two audit procedures stay aligned.

## Acceptance criteria

- `node scripts/skills/durable-anchors.mjs` → exit 0 on the finished tree. Negative test: append `` `scripts/ci.mjs:12` `` to any shipped skill body → guard exits 1 naming that file+anchor; revert.
- `grep -n "Every claim has a" plugins/docks/skills/productivity/skill-agent-pipeline/references/skills-builder.md` → returns nothing (the `file:line` mandate string is gone, exit 1); the durable grammar appears instead: `grep -c "verify:" …/skills-builder.md` ≥ 1.
- `grep -rn "line-anchor" plugins/docks/skills/productivity/skill-agent-pipeline/references/content-auditor.md plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md` → the defect class present in BOTH audit procedures.
- `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file` → every touched skill still ≥ its category floor (productivity 8; touched: write-skill, skill-agent-pipeline, context-tree, okf-bundle).
- `node scripts/ci.mjs` → exit 0 (includes content-hash idempotency, refs-guard TOC rule on the new reference, transform-guard on context-tree/write-skill, trigger-collision).
- `test -d plugins/docks/skills/engineering/human-docs-workflow; echo $?` → `1` (directory removed); `grep -rn "human-docs-workflow" plugins/ scripts/ AGENTS.md .agents/ .github/` → zero hits (the only remaining mentions live in `docs/authoring-audits.md`, the historical record).
- Dogfood (step 7): the updated context-tree `audit` over all nodes reports 0 live line anchors; each new re-verify cue's command was executed once and re-derived the stated fact.

## Out of scope / do-NOT-touch

- `docs/plans/AGENTS.md` and the `plan-init`/`plan-manager`/`plan-review` skills' `file:line` requirements — plans are point-in-time artifacts reviewed against `planned_at_commit`; their evidence discipline is correct as-is. (Blast radius: weakening it would break the audit-first scaffolding contract.)
- The fictional `src/…:NN` teaching examples in **code-review, security, refactor** — they document point-in-time *finding* OUTPUT formats and cannot drift. Leave every one byte-identical. (`human-docs-workflow` is deliberately NOT in this bucket — decided: it is REMOVED outright (step 5) — it generated long-lived AGENTS.md/CLAUDE.md and actively instructs `file:line` for them, so its example paths being fictional does not make its *guidance* correct under this plan.)
- The 16-pt scorer rubric in write-skill's `scripts/skill-guard.mjs` — enforcement lands in the NEW guard, not the scorer (single-source rubric churn would force a `metadata.updated` cascade across every consumer).
- `plugins/session-relay/` skill BODY content (its skill is versioned with its own plugin releases; the new guard only *scans* it — if it flags a live anchor there, record as follow-up, don't edit in this plan).
- `docs/authoring-audits.md` — explicitly historical record; its `/human-docs` mentions document a past state and stay byte-identical.
- `scripts/skills/no-author-scripts.mjs`, `transform-guard.mjs`, and the existing guard set — additive wiring only in `ci.mjs`.

## Known gotchas

- **content_hash idempotency:** every touched SKILL.md/reference needs the backfill re-run afterward or CI fails on hash drift; `scripts/` and `assets/` bundles are NOT hashed — `metadata.updated` is the only signal there.
- **transform-guard:** context-tree and write-skill are on the curated transformer list — their preservation `<constraint>` and `## Verification` blocks must survive edits verbatim-in-spirit (guard checks presence).
- **Description caps:** skill-agent-pipeline's description currently *contains* "a content-accuracy audit verifying every file:line ref" — rewording it must stay ≤500 chars for full scorer credit and keep the "Not for…" clause (trigger-collision guard).
- **Consumer-safety:** the pipeline/context-tree references are SHIPPED — they must instruct the inline grep form of the check, never name `scripts/skills/durable-anchors.mjs` (that's author-side; `no-author-scripts.mjs` enforces).
- **Guard false-positive edge:** a teaching example whose fictional path coincidentally exists (e.g. `Makefile:18` if a Makefile appears later). Mitigation: keep examples on clearly-fictional paths (`src/api/users.ts`); if a collision ever arises, rewrite the example path — never add an allowlist for it.
- **Body-length ceilings** (sweet spot 80–310, hard cap 500): current bodies — okf-bundle 182, write-skill 184, context-tree 153, skill-agent-pipeline 142 — all sit comfortably under 310, so small inline additions are safe; still route anything longer than ~15 lines into a `references/` file to stay in the sweet spot. okf-bundle (182) has the least headroom against the ≤310 note in step 4.

## STOP conditions

- Drift check first: `git diff --stat 18d69a448b22edebea44b976af3baf654916b612..HEAD -- plugins/docks/skills scripts/` — if generator skills changed since scaffold, reconcile before editing.
- If the exists-on-disk heuristic proves unable to separate teaching examples from live anchors during step 5 (more than 2 false positives), STOP and surface options (annotation marker vs allowlist) — do not ship a guard that trains people to sprinkle exemptions.
- If step 6's dogfood audit surfaces >10 live line anchors in this repo's nodes/skills (audit said ~0), the premise "examples are fictional" is wrong — STOP, re-inventory, and re-scope step 6 before converting en masse.

## Cold-handoff checklist

1. **File manifest** — ✓ every step names exact paths; new files marked (new).
2. **Environment & commands** — ✓ all gate/scorer/hash/guard/release commands with flags above.
3. **Interface & data contracts** — ✓ anchor grammar, artifact-class table, guard CLI contract, `line-anchor` defect class.
4. **Executable acceptance** — ✓ each criterion is a command + expected output, incl. a negative test.
5. **Out of scope** — ✓ stated positively with blast-radius rationale per item.
6. **Decision rationale** — ✓ artifact-class split + why the scorer stays untouched + why okf-bundle is light-touch.
7. **Known gotchas** — ✓ hash idempotency, transform-guard, caps, consumer-safety, false-positive edge.
8. **Global constraints verbatim** — ✓ "Don't loosen validator floors to pass; fix the file instead" (root AGENTS.md); skill bodies ≤500 lines / sweet spot 80–310; shipped bodies never name author scripts.
9. **No undefined terms / forward refs** — ✓ the durable grammar and defect class are defined in this file; no TBDs.

## Self-review

Score: 93/100 · trajectory 82→93 · stopped: plateau (residual gated on the `human-docs-scope` user decision, not on rewriting). Fresh-context reviewer (big-plan tier) re-verified every cited anchor against source (skills-builder mandate, content-auditor taxonomy, context-tree audit wording, body line-counts, the 16-hit fictional-path grep, scoring.json key path) and caught: **D1 (blocking)** — human-docs-workflow was mis-classified as point-in-time although it generates long-lived AGENTS.md/CLAUDE.md with mandated `file:line` → surfaced as the `human-docs-scope` open question instead of a silent default; **D2** — the grammar's one worked example cited a nonexistent `perFileFloors.productivity` key (real: `skills.productivity.per_file_floor`) → fixed; **D3** — hit count corrected 15→16 line-hits; **D4** — body-length gotcha overstated (real counts recorded); **D5** — guard wiring under-specified (single repo-wide invocation, CWD-root resolution, self-flagging edge) → contract extended; **D6** — first acceptance criterion's expected output made explicit (exit 1, empty). All six replacement texts applied verbatim.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/docks/skills/productivity/skill-agent-pipeline/references/skills-builder.md` — "Every claim has a `file:line`" + spine "(tables, code, file:line)" — the mandate this plan replaces (read this session).
- `plugins/docks/skills/productivity/skill-agent-pipeline/references/pattern-scanner.md` — phase-2b evidence constraint (KEEPS file:line; working notes are point-in-time) (read this session).
- `plugins/docks/skills/productivity/skill-agent-pipeline/references/content-auditor.md` — claim taxonomy + drift verdicts the `line-anchor` class extends (read this session).
- `plugins/docks/skills/productivity/context-tree/SKILL.md` — `audit` op claim list "(path/file:line, snippet, identifier, count)" (read this session).
- `plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md` — claim table `file:line` row mirrored in content-auditor (read this session).
- Repo-wide grep for `\.(rs|mjs|js|ts|md|json|py|yml|yaml|sh):\d+` across shipped skills — 16 line-hits (15 distinct anchor tokens), every one a fictional teaching path that does NOT resolve on disk; AGENTS.md nodes: 0 hits (run this session; basis of the guard heuristic + the step-6 "expect clean" expectation).
- `plugins/docks/skills/AGENTS.md` — authoring conventions (description caps, hash discipline, no-author-scripts, transformer rules) this plan operates under.
