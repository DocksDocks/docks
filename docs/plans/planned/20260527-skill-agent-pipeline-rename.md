---
title: Rename docs skill to skill-agent-pipeline + emit Codex agents
goal: Rename docs skill to skill-agent-pipeline; emit both Claude .md and Codex .toml agents; wire stale skill-maintenance removal; drop in-project guard dependence; confirm references/ convention.
status: planned
created: "2026-05-27T12:29:38-03:00"
updated: "2026-05-27T12:43:33-03:00"
started_at: null
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: [skills, rename, codex, agents, pipeline]
affected_paths:
  - plugins/docks/skills/productivity/docs/SKILL.md
  - plugins/docks/skills/productivity/docs/references/skills-builder.md
  - plugins/docks/skills/productivity/docs/references/verifier.md
  - plugins/docks/skills/productivity/docs/references/agents-builder.md
  - plugins/docks/skills/productivity/docs/references/role-mapper.md
  - plugins/docks/skills/productivity/docs/references/pattern-extractor.md
  - plugins/docks/skills/productivity/docs/references/categorizer.md
  - plugins/docks/skills/engineering/human-docs-workflow/SKILL.md
  - .claude-plugin/marketplace.json
  - .agents/plugins/marketplace.json
  - plugins/docks/.claude-plugin/plugin.json
  - plugins/docks/.codex-plugin/plugin.json
  - AGENTS.md
related_plans: [multi-tool-bridge-rename]
review_status: null
---

# Rename docs skill to skill-agent-pipeline + emit Codex agents

## Goal
Reshape the pipeline skill currently named `docs`
(`plugins/docks/skills/productivity/docs/`, title "Skills & Agents Pipeline") on
five axes:

1. **Rename `docs` → `skill-agent-pipeline`.** `docs` collides with prose docs and
   `human-docs-workflow` already owns README/AGENTS.md prose. Rename dir + `name:`,
   update body self-references, all inbound prose (manifests, marketplace catalogs,
   root AGENTS.md, human-docs-workflow), re-sync `content_hash`, bump `metadata.updated`.
2. **Emit Codex agents too (both formats always).** Today phases 4a/4b/5 are gated
   "Claude only" and hard-skip on Codex (`SKILL.md:20`). Codex has supported
   project-local subagents since GA 2026-03-16: TOML files at `.codex/agents/*.toml`.
   Un-gate the agent track so every run emits BOTH `.claude/agents/*.md` AND
   `.codex/agents/*.toml` for each logical agent, via a new
   `references/codex-agents-builder.md` carrying the Claude→Codex translation table.
3. **Wire stale local `skill-maintenance` removal.** The plugin now ships
   `docks:skill-maintenance` (fixes skills for both Codex and Claude), so a project
   should NOT keep a generated local copy. The pipeline must detect a stale local
   `skill-maintenance` and PROPOSE its removal (with a `git rm` sentinel in the gate),
   not regenerate one.
4. **Drop in-project guard dependence.** When the pipeline runs inside a consumer
   project, it must not depend on this repo's `scripts/` guards (they don't ship).
   Sweep the skill + references so all validation rules are inline/self-sufficient.
5. **Confirm the `references/` convention.** The pipeline already mandates a
   references/ split past 310 lines; confirm and strengthen so generated skills follow
   the full docks convention (constraint blocks, BAD/GOOD, references files).
6. **Enforce the ≤1024-char description cap on PRE-EXISTING skills.** Today the cap
   only governs descriptions the pipeline *generates*; the audit never measures the
   length of descriptions already on disk, so an existing skill over Codex's 1024
   hard cap (Codex silently skips it) goes undetected. Add the length check to the
   exploration, categorization, and verification phases.

Success = the skill loads as `docks:skill-agent-pipeline`, `bash scripts/ci.sh` is
green, a run emits valid `.codex/agents/*.toml` alongside `.claude/agents/*.md`, a
stale local `skill-maintenance` is flagged for removal, and no in-project path
references `scripts/...`.

## Context
Second of the two user-requested renames (sibling: `multi-tool-bridge-rename`). The
"emit Codex agents" axis is the substantive one — research agents confirmed the full
`.codex/agents/*.toml` schema and a Claude→Codex translation against the official
Codex docs AND the repo's two real Claude agent files (see Sources). Scope note: this
plan changes what the pipeline generates IN CONSUMER PROJECTS. The plugin's OWN
`plugins/docks/agents/` (plan-manager, plan-review) stays Claude-only per repo policy
— it is not touched here.

## Steps
| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | `git mv plugins/docks/skills/productivity/docs plugins/docks/skills/productivity/skill-agent-pipeline` | — | — | planned | — |
| 2 | SKILL.md `name: docs → skill-agent-pipeline`; update body self-references + "Use instead" table; keep title | 1 | with 3 | planned | — |
| 3 | Update all inbound prose references (see Step details) | 1 | with 2 | planned | — |
| 4 | Un-gate agent track: rewrite `SKILL.md:20` constraint + pipeline table runtime column so 4a/4b/5 run on ALL runtimes emitting BOTH formats | 1 | — | planned | — |
| 5 | Author `references/codex-agents-builder.md` — Codex TOML schema + Claude→Codex translation table + model mapping + `Agent`-tool hard-warn | 4 | with 6 | planned | — |
| 6 | Update `agents-builder.md`, `role-mapper.md`, `pattern-extractor.md`, `verifier.md` for dual-format output + Codex TOML validation | 4 | with 5 | planned | — |
| 7 | Wire stale local `skill-maintenance` detection→removal (categorizer 2a + skills-builder + gate `git rm` sentinel) | 1 | with 8,9 | planned | — |
| 8 | Guard-independence sweep: no `bash scripts/...` in any in-project path; inline validation rules in references | 1 | with 7,9 | planned | — |
| 9 | Confirm/strengthen `references/` convention for generated skills (constraint blocks, BAD/GOOD, split rule) | 1 | with 7,8 | planned | — |
| 10 | Enforce ≤1024-char description audit on PRE-EXISTING skills (explorer length capture + categorizer 6th check + verifier over-cap hard-fail) | 1 | with 7,8,9 | planned | — |
| 11 | Re-sync `content_hash`, bump `metadata.updated`, run `bash scripts/ci.sh` green | 2–10 | — | planned | — |

### Step details
- **Step 3 — inbound prose references to the `docs` skill** (grep-confirmed; update the catch-all by re-running `grep -rn -E "docks:docs|/docs\b|skills-audit/docs"` and excluding `docs/plans/` + historical `docs/*.md` audits):
  - `plugins/docks/skills/engineering/human-docs-workflow/SKILL.md` — description ("use /docs which has irreducible 8-phase pipeline value"), line 34, line 218 → `skill-agent-pipeline`
  - `AGENTS.md:3` ("security, refactor, and docs") and `AGENTS.md:14` ("incl. security/refactor/docs pipelines") → `skill-agent-pipeline`
  - `.claude-plugin/marketplace.json:3` and `:11` ("skills-audit/docs") → name it `skill-agent-pipeline`
  - `plugins/docks/.claude-plugin/plugin.json` + `plugins/docks/.codex-plugin/plugin.json` description ("skills-audit/docs") → `skill-agent-pipeline`
  - `.agents/plugins/marketplace.json` — check for the same description string and update
  - LEAVE historical `docs/optimization-audit-may-2026.md` + `docs/authoring-audits.md` `/docs` mentions (explicitly marked historical record).
- **Step 4 — un-gate** : `SKILL.md:20` constraint flips from "Agent generation is Claude-Code-specific … SKIP on Codex" to "emit BOTH `.claude/agents/*.md` and `.codex/agents/*.toml` on every runtime". Pipeline table (`SKILL.md:46-56`) runtime column for 4a/4b/5: `Claude only` → `all`. Gotchas table (`SKILL.md:113`) row about "Running agent phases on Codex" is inverted (now expected).
- **Step 5 — Codex `.codex/agents/*.toml` schema** (confirmed):
  - Required: `name`, `description`, `developer_instructions`. Optional: `model`, `model_reasoning_effort` (`"medium"`/`"high"`; `"xhigh"` broader config), `sandbox_mode` (`"read-only"`/`"workspace-write"`/`"danger-full-access"`), `nickname_candidates`, `mcp_servers`, `skills.config`. One agent per file; project `.codex/agents/` overrides personal `~/.codex/agents/`; `name` field is identity (match filename by convention). Built-in agents: `default`/`worker`/`explorer`.
  - **Claude → Codex translation table:**

    | Claude (`.claude/agents/*.md`) | Codex (`.codex/agents/*.toml`) | Rule | Confidence |
    |---|---|---|---|
    | `name` | `name` | 1:1 (kebab-case) | confirmed |
    | `description` (CSO, 3rd person) | `description` | 1:1 — Codex reads it as "when to use this agent" | confirmed |
    | markdown system-prompt body | `developer_instructions` | triple-quoted TOML multiline; no documented cap | confirmed |
    | `model: opus` | `model = "gpt-5.5"` | frontier-tier map | confirmed (agent D) |
    | `model: sonnet` | `model = "gpt-5.3-codex"` (alt `gpt-5.4`) | coding-tuned standard tier | SYNTHESIS — confirm |
    | `model: haiku` | `model = "gpt-5.4-mini"` | mini tier | SYNTHESIS — confirm |
    | `model: inherit`/absent | omit `model` | Codex inherits parent session | confirmed |
    | `tools` incl. `Edit`/`Write` | `sandbox_mode = "workspace-write"` | agent writes files | confirmed |
    | `tools` read-only (Read/Glob/Grep) | `sandbox_mode = "read-only"` | | confirmed |
    | `tools` incl. `Agent` | **NO EQUIVALENT — hard warn** | Codex subagents cannot spawn subagents | confirmed (key finding) |
    | `maxTurns` | (drop) | no per-agent equivalent (global `agents.job_max_runtime_seconds`) | confirmed |
    | — | `model_reasoning_effort` | optional; omit by default | confirmed |
    | — | `nickname_candidates` | Codex-only; omit | confirmed |
    | (Bash w/ destructive intent) | never auto `danger-full-access` | surface to user | confirmed |

  - **Cannot-auto-translate / surface to user:** (a) any agent whose `tools` include `Agent` — its dispatch purpose is inert on Codex (the repo's own plan-manager/plan-review are exactly this case); (b) sonnet/haiku model rows are a judgment call — make project-configurable; (c) `danger-full-access` never auto-selected.
- **Step 6 — verifier Codex checks**: valid TOML, all three required keys present, `model` ∈ known IDs (or omitted), `sandbox_mode` ∈ the three values, warn if `developer_instructions` references an `Agent`/spawn primitive. Cross-layer: each Codex agent's `skills.config` path (if used) must resolve to a Phase-3 skill path.
- **Step 7 — stale skill-maintenance**: Phase 0 already records whether a local `skill-maintenance` and `docks:skill-maintenance` exist. Add to categorizer (2a): when a local `skill-maintenance` exists, `docks:skill-maintenance` is available, AND the local copy adds no project-specific rules → propose REMOVAL (not regeneration). skills-builder already prefers the plugin one (`skills-builder.md:55`); extend it to emit the removal proposal. Gate presentation includes `git rm -r .claude/skills/skill-maintenance/` (and `.agents/skills/...`) sentinel. Mirror the plugin skill-maintenance's "Local Skill-Maintenance Cleanup" logic; require explicit user approval before the delete lands in Phase 8.
- **Step 8 — guard independence**: `skills-builder.md:57` and `verifier.md:17` already forbid kit-internal validators downstream and the gate says "do not report missing Docks tooling" — confirm NO residual `bash scripts/...` in the in-project path, and ensure the verifier's checks are fully inline (frontmatter/CSO/size/reference-accuracy already are). The repo's own `bash scripts/ci.sh` stays the dev-loop check for THIS plan (it runs in this repo, where scripts exist).
- **Step 10 — existing-skill description length** (user-flagged): today the ≤1024 cap only governs *generated* descriptions (`categorizer.md:6` constraint + `verifier.md`); pre-existing skills are never length-checked — the Phase-2a audit has 5 checks (Size=body-lines / Staleness / Coverage / CSO-quality / Deleted-source) and none measures description chars, and `explorer.md:23` truncates to ~120 chars. Add: (a) Phase 1 explorer records each existing skill's FULL description char-count; (b) Phase 2a categorizer gains a 6th audit check — `description >1024 chars → rewrite-description`, noting Codex hard-skips an over-cap skill (load-bearing, not cosmetic); (c) Phase 6 verifier hard-fails any existing skill still over cap. Applies to BOTH `.agents/skills/` and `.claude/skills/` entries.

## Acceptance criteria
- [ ] Skill dir + `name:` are `skill-agent-pipeline`; guard passes name-matches-dir.
- [ ] No stale `docks:docs` / `/docs` skill references outside historical `docs/*.md` audits.
- [ ] A pipeline run drafts BOTH `.claude/agents/<name>.md` and `.codex/agents/<name>.toml` for each agent; the TOML has the three required keys and a valid `model`/`sandbox_mode`.
- [ ] An agent whose Claude `tools` include `Agent` triggers a "cannot port dispatch to Codex" warning.
- [ ] A stale local `skill-maintenance` is flagged for removal with a `git rm` sentinel; none is regenerated.
- [ ] A pre-existing skill whose description exceeds 1024 chars is flagged with a `rewrite-description` action (Phase 2a) and hard-failed by the verifier (Phase 6) until fixed.
- [ ] `grep -rn "scripts/" ` across the skill + references shows no in-project (downstream) dependency — only this-repo dev-loop references remain.
- [ ] `content_hash` re-synced; `metadata.updated` bumped; `bash scripts/ci.sh` green.

## Out of scope
- Renaming the `agents` bridge skill — sibling plan `multi-tool-bridge-rename`.
- Touching the plugin's own `plugins/docks/agents/` (plan-manager, plan-review stay Claude-only, plugin-shipped).
- AGENTS.md / CLAUDE.md prose rewrites in consumer projects (that is the bridge skill's job).
- Porting the repo's own plan-manager/plan-review to Codex TOML (they depend on the `Agent` tool — untranslatable; documented as a known limit only).
- Codex `mcp_servers` auto-wiring beyond passing through what a source agent already declares.

## Mistakes & Dead Ends
- **2026-05-27**: Agent D's returned message referenced a translation table built earlier in its own transcript but not included in the result; no `SendMessage` tool is exposed to retrieve it. → Table reconstructed from agent C (full schema) + agent D's addendum; synthesis rows (sonnet/haiku model map) explicitly flagged "confirm" rather than asserted. Avoid: when a research agent's deliverable is a multi-part artifact, ask it to inline the full artifact in its FINAL message.

## Sources
- https://developers.openai.com/codex/subagents and .../subagents.md — `.codex/agents/*.toml` schema: required `name`/`description`/`developer_instructions`; optional `model`/`model_reasoning_effort`/`sandbox_mode`/`nickname_candidates`/`mcp_servers`/`skills.config`; one agent/file; project overrides personal; `/agent` lists threads; built-ins default/worker/explorer.
- https://developers.openai.com/codex/sandbox — canonical `sandbox_mode` values: read-only / workspace-write / danger-full-access.
- https://developers.openai.com/codex/models — model IDs: gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5.3-codex-spark, gpt-5.2.
- https://simonwillison.net/2026/Mar/16/codex-subagents/ — subagents GA 2026-03-16.
- https://code.claude.com/docs/en/sub-agents — Claude agent frontmatter (name/description/tools/model/maxTurns) + markdown body, source format for the translation.
- `plugins/docks/agents/plan-manager.md:1-6` + `plan-review.md:1-6` — real Claude agents grounding the translation; BOTH depend on `tools: …, Agent` → would be inert as Codex dispatchers (the canonical "cannot auto-translate" case).
- `plugins/docks/skills/productivity/docs/SKILL.md:20` — current "Claude only" agent-gate constraint to invert.
- `plugins/docks/skills/productivity/docs/references/skills-builder.md:55,57` + `verifier.md:17` — existing "prefer docks:skill-maintenance" + "no kit-internal validators downstream" rules to extend.
- `plugins/docks/skills/productivity/docs/references/categorizer.md:13-21` — the Phase-2a "5 checks" audit (Size/Staleness/Coverage/CSO/Deleted-source) has NO description-length check; `explorer.md:23` truncates existing descriptions to ~120 chars. The 1024 hard cap is established in `plugins/docks/skills/AGENTS.md` ("≤1,024 hard cap") and `skill-maintenance/SKILL.md` (Codex skips over-cap skills) — so existing over-cap descriptions are silently broken on Codex.

## Blockers

## Notes
- **Name choice:** `skill-agent-pipeline` chosen over `skills-pipeline` / `skills-audit` (user decision 2026-05-27) — it is the most literal: the pipeline produces both skills and agents.
- **Codex agents decision:** "both formats always" (user decision 2026-05-27) — even a Claude-only project gets `.codex/agents/*.toml`, matching the kit's cross-tool ethos. Trade-off: extra TOML files in Claude-only projects; acceptable per the canonical-multi-tool stance.
- **Coupling with `multi-tool-bridge-rename`:** that plan edits two files in this skill's tree (`SKILL.md`, `skills-builder.md`) to update `agents`→`multi-tool-bridge` references. Recommended order: ship the bridge rename FIRST (its edits land on current `productivity/docs/` paths), then this rename moves the dir. If this ships first, the bridge plan rebases onto `productivity/skill-agent-pipeline/`.
- **Model mapping is a judgment call** beyond opus→gpt-5.5 — make it project-configurable; the synthesis rows above are defaults to confirm at implementation, not hard facts.
- **References question answered:** the pipeline ALREADY emits `references/` for generated skills (`skills-builder.md:5` mandatory split >310 lines; output format emits `### File: .../references/<topic>.md`). Step 9 is confirmation + tightening, not a new capability.

## Evidence log
- **2026-05-27T12:29:38-03:00** — Plan scaffolded after investigation + 2 parallel research agents (Codex subagent TOML schema; Claude→Codex translation grounded against the repo's real agent files) confirmed the schema and translation rules — by plan-manager (main context).
- **2026-05-27T12:43:33-03:00** — Added Step 10 (enforce ≤1024-char description audit on pre-existing skills) + acceptance criterion after the user flagged that the cap only governed generated skills, not the existing ones being audited — by plan-manager.

## Review
(filled by plan-review on completion)
