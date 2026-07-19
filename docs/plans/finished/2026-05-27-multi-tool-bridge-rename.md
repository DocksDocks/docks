---
title: Rename agents skill to multi-tool-bridge + detect .claude/CLAUDE.md
goal: Rename the agents bridge skill to multi-tool-bridge (dir, name, inbound refs, hash) and extend its CLAUDE.md audit/classification/rewrite to cover ./.claude/CLAUDE.md alongside ./CLAUDE.md.
status: finished
created: "2026-05-27T12:29:38-03:00"
updated: "2026-05-27T13:09:38-03:00"
started_at: "2026-05-27T12:47:25-03:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: "920d1f3248826fa4836e4bf8bc9b000c19bb859c"
tags: [skills, rename, multi-tool, claude-md]
affected_paths:
  - plugins/docks/skills/productivity/multi-tool-bridge/SKILL.md
  - plugins/docks/skills/productivity/multi-tool-bridge/references/claude-md-classification.md
  - plugins/docks/skills/productivity/multi-tool-bridge/references/agents-md-template.md
  - plugins/docks/skills/productivity/docs/SKILL.md
  - plugins/docks/skills/productivity/docs/references/skills-builder.md
  - .agents/skills/codex-plugin-mirror/SKILL.md
related_plans: [skill-agent-pipeline-rename]
review_status: passed
---

# Rename agents skill to multi-tool-bridge + detect .claude/CLAUDE.md

## Goal
Two coupled changes to the cross-tool bridge skill currently named `agents`
(`plugins/docks/skills/productivity/agents/`, title "Multi-Tool Agent Bridge"):

1. **Rename `agents` → `multi-tool-bridge`.** The name is misleading: the skill
   does NOT create subagents — it bridges `CLAUDE.md ↔ AGENTS.md`, migrates
   `.claude/skills/ → .agents/skills/`, and symlinks. The name collides with the
   *subagent* concept and with the `docs` skill that genuinely emits
   `.claude/agents/`. Rename the directory, the `name:` frontmatter, every inbound
   reference, re-sync `content_hash`, and bump `metadata.updated`. CI green.

2. **Detect `./.claude/CLAUDE.md`.** Claude Code recognises a project CLAUDE.md at
   EITHER `./CLAUDE.md` OR `./.claude/CLAUDE.md` (both load and concatenate when
   both exist). The skill's audit only does `test -f CLAUDE.md` and the
   classification reference scopes to root only, so a project that keeps its
   CLAUDE.md under `.claude/` is silently skipped. Extend detection, classification,
   and the rewrite-target logic to cover both locations — including the both-exist
   case and the `@import` relative-path gotcha.

Success = the skill loads as `docks:multi-tool-bridge`, `bash scripts/ci.sh` is
green, no stale `agents`-skill references remain, and a project whose only CLAUDE.md
lives at `.claude/CLAUDE.md` is correctly audited, classified, and bridged.

## Context
The `agents` skill is one of two skills the user flagged for renaming (the other,
`docs`, is the sibling plan `skill-agent-pipeline-rename`). The two renames touch
overlapping files — the `docs` skill body references "the `agents` bridge skill" in
three places — so they are coupled; see Notes for sequencing. Research agents
confirmed the `.claude/CLAUDE.md` location and a relative-path import gotcha against
the official Claude memory docs and the agentskills.io / Codex AGENTS.md specs (see
Sources).

## Steps
| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | `git mv plugins/docks/skills/productivity/agents plugins/docks/skills/productivity/multi-tool-bridge` | — | — | done | self |
| 2 | Update SKILL.md frontmatter `name: agents → multi-tool-bridge`; keep/refine title; review the `When to Use` `/docks:agents` trigger line | 1 | with 3 | done | self |
| 3 | Update every inbound reference to the skill (see Step details) | 1 | with 2 | done | self |
| 4 | Extend Step 2 audit (`test -f .claude/CLAUDE.md`) + Step 1/3 to classify both CLAUDE.md locations | — | with 3 | done | self |
| 5 | Rewrite `references/claude-md-classification.md`: dual-location detection, both-exist warning, `@../AGENTS.md` relative-path rule, rewrite-target selection | 4 | — | done | self |
| 6 | Add Common Traps + Anti-Hallucination entries for the dual-location case | 4, 5 | — | done | self |
| 7 | Re-sync `content_hash` (`bash scripts/skills/content-hash.sh --backfill`), bump `metadata.updated` to ship date, run `bash scripts/ci.sh` green | 2,3,4,5,6 | — | done | self |

### Step details
- **Step 3 — exact inbound references** (grep-confirmed; rename only *skill* references, never the `.claude/agents/` *subagent-dir* meaning):
  - `plugins/docks/skills/productivity/docs/SKILL.md:39` — "Multi-tool AGENTS.md ↔ skills symlink bridging | `agents`" → `multi-tool-bridge`
  - `plugins/docks/skills/productivity/docs/SKILL.md:94` — "that is the `agents` bridge skill's job" → `multi-tool-bridge`
  - `plugins/docks/skills/productivity/docs/SKILL.md:119` — "Use the `agents` bridge skill" → `multi-tool-bridge`
  - `plugins/docks/skills/productivity/docs/references/skills-builder.md:69` — "use the `agents` bridge skill" → `multi-tool-bridge`
  - `plugins/docks/skills/productivity/agents/SKILL.md:36` — "`/docks:agents`" → `/docks:multi-tool-bridge`
  - `.agents/skills/codex-plugin-mirror/SKILL.md:3` — description "(use plan-init or agents)" → "(use plan-init or multi-tool-bridge)"
  - `.agents/skills/codex-plugin-mirror/SKILL.md:144` — "use the `agents` skill instead" → `multi-tool-bridge`
  - **DO NOT TOUCH** `plugins/docks/skills/productivity/scaffold/references/spec-schema.md:70` — that line refers to a *different, already-removed* `agents` skill, not this bridge. Verify and leave as historical.
  - Note: if `skill-agent-pipeline-rename` shipped first, the two `docs/SKILL.md` + `skills-builder.md` paths become `productivity/skill-agent-pipeline/...` — rebase the edits onto the new paths.
- **Step 4/5 — dual-location bridge logic** (from research):
  - Audit BOTH `./CLAUDE.md` and `./.claude/CLAUDE.md`; either or both may exist.
  - **Rewrite target:** prefer root `./CLAUDE.md` for the `@AGENTS.md` import (conventional, team-visible). The `@path` import resolves relative to the *containing* file, so an import written into `./.claude/CLAUDE.md` MUST be `@../AGENTS.md`, not `@AGENTS.md`.
  - **Both exist:** warn before rewriting either — both are already concatenated into context, so editing one while the other carries conflicting instructions risks duplication. Classify both; surface the union in the proposal table.
  - **Neither exists:** create root `./CLAUDE.md` (greenfield/plugin-author stub path unchanged).
  - Keep user-level `~/.claude/CLAUDE.md` OUT of scope (already documented).

## Acceptance criteria
- [x] Skill directory and `name:` are both `multi-tool-bridge`; `bash scripts/skills/guard.sh` passes (name-matches-dir check).
- [x] `grep -rn -E "docks:agents|/docks:agents|\`agents\` bridge"` returns nothing except the historical scaffold spec-schema line.
- [x] Audit detects a project whose only CLAUDE.md is `./.claude/CLAUDE.md`; classification runs on it.
- [x] Rewrite writes `@AGENTS.md` into root `./CLAUDE.md` (or `@../AGENTS.md` only when writing inside `.claude/`).
- [x] Both-exist case emits a warning before any rewrite.
- [x] `content_hash` re-synced and `metadata.updated` bumped; `bash scripts/ci.sh` is green.

## Out of scope
- Renaming the `docs` skill — that is `skill-agent-pipeline-rename`.
- Porting Claude subagents to Codex `.codex/agents/*.toml` — that is the `docs`/`skill-agent-pipeline` plan's work.
- User-level `~/.claude/CLAUDE.md` and managed-policy CLAUDE.md (intentionally out of bridge scope).
- `.claude/rules/*.md` migration/classification.
- The `.agents/skills/` "canonical name is convention, not hard spec" nuance — note only.

## Mistakes & Dead Ends
- **2026-05-27**: Pre-emptive warning carried from finished plan `2026-05-24-skill-maintainer-fixes` — the `agents` bridge skill does AGENTS.md/symlink bridging, NOT subagent or maintenance machinery. During the rename, do not alter `.claude/agents/` semantics or conflate it with `skill-maintenance`. Grep the actual machinery before trusting a reference.

## Sources
- https://code.claude.com/docs/en/memory.md — confirms `./CLAUDE.md` OR `./.claude/CLAUDE.md` are both project memory; all discovered files concatenate (no precedence); `@path` import resolves relative to the containing file (max depth 4); `ln -s AGENTS.md CLAUDE.md` needs Admin/Dev-mode on Windows (prefer `@AGENTS.md`).
- https://code.claude.com/docs/en/claude-directory — ".claude/CLAUDE.md if you prefer to keep the project root clean."
- https://agentskills.io/client-implementation/adding-skills-support — `.agents/skills/` is the cross-client convention (not a hard-mandated path); clients scan native + shared paths; `.claude/skills/` is a pragmatic extra scan.
- https://developers.openai.com/codex/guides/agents-md — Codex reads root + nested `AGENTS.md` (root→leaf concat, last wins; 32 KiB cap; `AGENTS.override.md` variant) — root AGENTS.md is sufficient, no extra wiring.
- `plugins/docks/skills/productivity/agents/SKILL.md:57` — current audit is `test -f CLAUDE.md` (root only).
- `plugins/docks/skills/productivity/agents/references/claude-md-classification.md:97` — current scope note: "project-level CLAUDE.md only" (root only).

## Blockers

## Notes
- **Coupling with `skill-agent-pipeline-rename`:** both plans edit `docs/SKILL.md` and `skills-builder.md`. Recommended order: ship this plan (the bridge rename) FIRST so the inbound-reference edits land on the current `productivity/docs/` paths; the sibling plan then renames the `docs` dir. If the sibling ships first, rebase Step 3's two `docs` paths onto `productivity/skill-agent-pipeline/`.
- **Name choice:** `multi-tool-bridge` chosen over `agentsmd-bridge` / `cross-tool-setup` (user decision 2026-05-27).
- **Title:** "Multi-Tool Agent Bridge" already reads fine; optionally drop "Agent" to "Multi-Tool Bridge" to fully de-collide — leave to implementer judgment, keep body title in sync with whatever ships.
- **Relative-path gotcha** is the single most load-bearing new rule — it is the reason the rewrite defaults to root `./CLAUDE.md`.

## Evidence log
- **2026-05-27T12:29:38-03:00** — Plan scaffolded after investigation + 2 parallel research agents (Claude CLAUDE.md locations; AGENTS.md cross-tool spec) confirmed the `.claude/CLAUDE.md` location and the `@import` relative-path gotcha — by plan-manager (main context).
- **2026-05-27T12:47:25-03:00** — Started (planned → ongoing); self-executed.
- **2026-05-27T12:52:23-03:00** — All 7 steps implemented: dir renamed to `multi-tool-bridge`, `name:` + 6 inbound refs updated (`docs/SKILL.md` ×3, `skills-builder.md`, `codex-plugin-mirror` ×2), audit + Step 3/5 classification extended for `./.claude/CLAUDE.md` (+ `@../AGENTS.md` rule), traps + anti-hallucination added, `content_hash` re-synced, `metadata.updated` bumped. `bash scripts/ci.sh` fully green. Not yet committed/shipped (awaiting user). — by plan-manager (main context).

## Review
- **Goal met:** yes — `agents` skill renamed to `multi-tool-bridge` (dir, `name:`, 6 inbound refs, `content_hash`) and the `./.claude/CLAUDE.md` detection/classification/rewrite landed (audit probe, Step 3 union+warn, Step 5 rewrite-target + `@../AGENTS.md` relative-import rule, traps + anti-hallucination). Matches the plan goal.
- **Regressions:** none — `bash scripts/ci.sh` fully green: plugin validate, structural guards, quality + per-file score floors, skill-maintainer idempotency (content_hash in sync), scaffold render.
- **CI:** pass (all `ci.sh` checks).
- **Follow-ups:** `skill-agent-pipeline-rename` (sibling) — renames `docs` and adds Codex `.codex/agents/*.toml` output; sequencing/coupling documented there.
- Filed by: plan-review (inline, executing agent) on 2026-05-27T13:09:38-03:00 — ship_commit `920d1f3`.
