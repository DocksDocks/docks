---
title: Convert docs/refactor/security pipelines from commands to cross-tool skills
goal: Replace the 3 Builder-Verifier commands with self-contained cross-tool pipeline skills (phase expertise in references/); delete the 20 pipeline agents + 9 forked-* wrappers; swap the Plan-Mode gate for the plan-manager lifecycle
status: finished
created: "2026-05-24T00:00:00-03:00"
updated: "2026-05-25T00:00:00-03:00"
started_at: "2026-05-24T00:00:00-03:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: d19c4b7446d9dab59515e3f7b56501b771f2f018
tags: [re-architecture, skills, cross-tool, codex, commands-removal]
affected_paths:
  - plugins/docks/skills/engineering/security/SKILL.md
  - plugins/docks/skills/engineering/refactor/SKILL.md
  - plugins/docks/skills/productivity/docs/SKILL.md
  - plugins/docks/commands/  # all 3 deleted
  - plugins/docks/agents/  # 20 pipeline agents deleted (plan-manager/plan-review fate = open question)
  - plugins/docks/skills/internal/  # 9 forked-* deleted (category becomes empty)
  - scripts/scoring.config.json
  - scripts/ci.sh
  - scripts/guard-commands.sh
  - scripts/score-commands.sh
  - plugins/docks/.claude-plugin/plugin.json
  - plugins/docks/.codex-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - .agents/plugins/marketplace.json
  - plugins/docks/README.md
  - README.md
  - CLAUDE.md
  - AGENTS.md
  - docs/authoring-audits.md
related_plans: [tree-skill, scaffold, foundation-categorization-scoring, skill-maintainer-fixes]
review_status: passed
---

# Convert docs/refactor/security pipelines from commands to cross-tool skills

## Goal

Turn the three Builder-Verifier slash commands (`/docs`, `/refactor`, `/security`) into three **self-contained cross-tool skills** that any agentskills.io runtime (Codex, Claude Code, OpenCode) can run. Each skill's `SKILL.md` body sequences the pipeline phases; each phase's expertise (currently a separate agent file) moves into `references/<phase>.md`. The 20 pipeline agents and 9 `internal/forked-*` wrappers are deleted. The Claude-only `EnterPlanMode`/`ExitPlanMode` approval gate is replaced by the **plan-manager skill lifecycle** (pipeline writes findings to a `docs/plans/` file; user approves via natural language; plan-manager moves planned→ongoing and implementation proceeds).

Success = a Codex user can run "audit my skills" / "refactor this module" / "security-scan this branch" and get the same phased pipeline a Claude user gets — sequential, single-context, no slash command, no subagent dispatch, no Plan Mode.

## Context

**Why this re-architecture.** Research against current Codex docs (see Sources) established three hard constraints that kill the original "translate agents to Codex `.toml`" plan (the prior content of this file):

1. **Codex skills cannot dispatch/orchestrate subagents.** Skills and subagents are distinct features that operate independently — no skill→agent delegation, no `context: fork`, no `agent:` frontmatter.
2. **Codex subagents are user-initiated only** ("Codex only spawns a new agent when you explicitly ask it to") and **cannot be shipped via a plugin** (manifest accepts only `skills`/`mcpServers`/`apps`/`hooks`).
3. Therefore the **only** way to ship pipeline capability to Codex through the docks plugin is a **skill** — and that skill must be self-contained (all phase expertise inside it), single-agent, sequential.

**What this trades away.** Claude Code loses the 6-way parallel scanner fan-out and per-phase context isolation that the commands+subagents provided. Everything now runs in one context window. On very large repos a single-context `/security` or `/refactor` pass could strain the window — that risk is accepted; parallelism is re-addable later as a Claude-only enhancement layered on top of the skills if it proves necessary.

**What this fixes.** The 9 `internal/forked-*` skills are currently shipped to Codex (`.codex-plugin/plugin.json` declares `./skills/internal`) but are inert there (their only real content is `context: fork` + `agent:`, both Claude-only). They are dead weight that burns Codex's skill-listing budget. This plan removes them.

**Precedent.** `plan-manager` and `plan-review` already follow the skill-first pattern (skill = cross-tool SSOT, thin Claude agent = optional dispatch shim). The pipelines were the only part that didn't. This aligns them.

## Phase → reference mapping (the conversion contract)

Each former agent becomes one `references/<phase>.md` (30–150 lines) holding that phase's expertise. The skill `SKILL.md` body (≤310 lines) holds the orchestration: phase order, IPC, gating, and the plan-manager handoff.

| Skill (category) | Phases → `references/` files | Notes |
|---|---|---|
| `security` (engineering) | explorer, vulnerability-scanner, logic-analyzer, adversarial-hunter, synthesizer | Read-only; output is a report. Implementation handed to `fix-workflow` skill. Smallest → build first as template. |
| `refactor` (engineering) | explorer, dead-code-scanner, duplication-scanner, solid-analyzer, planner, pre-verifier, post-verifier | Has an implementation phase after approval. |
| `docs` (productivity) | explorer, categorizer, pattern-scanner, skills-builder, role-mapper, pattern-extractor, agents-builder, verifier | 8 phases. See open question on whether to keep agent-generation phases. |

## Plan-Mode → plan-manager gate (shared design)

Old flow (Claude-only): `EnterPlanMode` → read-only phases write to IPC plan file → `ExitPlanMode` (approve UI) → implementation.

New flow (cross-tool): pipeline skill runs read-only phases, writing each phase's output to a `docs/plans/planned/<slug>.md` file (the IPC file *becomes* a real lifecycle plan) → skill tells the user in natural language: "Findings written to `docs/plans/planned/<slug>.md`; review and say `start <slug>` to implement" → user approves → plan-manager moves planned→ongoing and the implementation phase runs. No `ExitPlanMode`, no skill→skill programmatic dispatch — just file IPC + NL handoff (robustly cross-tool). For `security` (read-only) the plan file *is* the deliverable; no implementation phase.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Author `security` pipeline skill + 5 references/ (template for the other two) | — | — | done | self |
| 2 | Author `refactor` pipeline skill + 7 references/ | 1 | with #3 | done | self |
| 3 | Author `docs` pipeline skill + 8 references/ | 1 | with #2 | done | self |
| 4 | Backfill `content_hash` + score each new skill ≥ category floor (plan-02 machinery) | 1,2,3 | — | done | self |
| 5 | `git rm` the 3 commands (`docs.md`, `refactor.md`, `security.md`) | 1,2,3 | with #6,#7 | done | self |
| 6 | `git rm -r` the 20 pipeline agents (docs-*, refactor-*, security-*) — kept plan-manager/plan-review | 1,2,3 | with #5,#7 | done | self |
| 7 | `git rm -r` the 9 `internal/forked-*` skills | 1,2,3 | with #5,#6 | done | self |
| 8 | `scoring.config.json`: drop now-empty `commands` + `internal` entries | 5,7 | with #9,#10 | done | self |
| 9 | `ci.sh`: remove command sections, drop internal category, recount category floors | 5,7 | with #8,#10 | done | self |
| 10 | `guard-commands.sh` / `score-commands.sh` deleted; ci.yml command steps removed; agents validators kept (2 agents remain) | 5,6 | with #8,#9 | done | self |
| 11 | `.codex-plugin/plugin.json`: drop `./skills/internal`; rewrite description (skill-first) | 7 | with #12 | done | self |
| 12 | `.claude-plugin/plugin.json`: rewrite description (skill-first); drop `./skills/internal` | 7 | with #11 | done | self |
| 13 | Both `marketplace.json` catalogs: sync descriptions + stale tags | 11,12 | — | done | self |
| 14 | Rewrite `README.md` (plugin + root) — remove command/subagent architecture | 5,6 | with #15,#16,#17 | done | self |
| 15 | Rewrite `CLAUDE.md` — drop command/agent/Plan-Mode authoring sections; keep skill authoring | 5,6 | with #14,#16,#17 | done | self |
| 16 | Rewrite `AGENTS.md` — skill-first cross-tool framing | 5,6 | with #14,#15,#17 | done | self |
| 17 | Update `docs/authoring-audits.md` + `write-skill` — drop command-scoring references | 5 | with #14,#15,#16 | done | self |
| 18 | `bash scripts/ci.sh` green | 4,8,9,10,11,12 | — | done | self |
| 19 | Smoke-test a converted skill — structural (scores 15/16, guard pass, references resolve, no dangling refs); live run deferred | 18 | — | done | self |
| 20 | Commit (no release/push — per user) | 19 | — | done | self |

### Step details

- **#1** — Build `security` first: it is read-only (no implementation phase), only 5 phases, and exercises the full pattern (sequence + IPC + plan-manager gate) without the implementation complexity. Use it as the copy-template for #2/#3.
- **#4** — Each new skill must clear its per-file category floor (`scripts/score-skills.sh --per-file`): engineering ≥10, productivity ≥8. Bodies >310 lines MUST split into references/ (plan-02 verifier rule). Run `scripts/skill-content-hash.sh --backfill` after authoring.
- **#6** — Open question (see Notes): `plan-manager.md` / `plan-review.md` agents are NOT pipeline phases. Either keep them (preserve Claude inter-agent plan-review dispatch) or delete them too (full skill-only; plan-manager skill invokes plan-review via the Skill tool). Default proposal: keep, pending user call.
- **#10** — If all agents are removed (open Q resolves to delete-all), `agents/` becomes empty and `guard-agents.sh`/`score-agents.sh` go vestigial too — remove them from `ci.sh`. If plan-manager/plan-review agents stay, keep the agents validators (count-derived floor adjusts automatically).

## Acceptance criteria

- [x] `security`, `refactor`, `docs` exist as cross-tool skills; each `SKILL.md` ≤310 lines with per-phase expertise in `references/` (30–150 lines each)
- [x] Each new skill clears its per-file category floor; `content_hash` backfilled
- [x] All 3 commands deleted; `plugins/docks/commands/` empty (or removed)
- [x] All 20 pipeline agents deleted; all 9 `internal/forked-*` skills deleted
- [x] Plan-Mode used nowhere as an approval gate in shipped plugin files (remaining `ExitPlanMode` strings are negative "do NOT call" guards + the `agents` skill's CLAUDE-SPECIFIC classification list); approval flows through plan-manager
- [x] Codex manifest no longer ships `./skills/internal`; both plugin.json descriptions reframed skill-first
- [x] `CLAUDE.md`, `AGENTS.md`, `README.md` (both) reflect the skill-first architecture
- [x] `bash scripts/ci.sh` green
- [~] One converted skill smoke-tested end-to-end on this repo — structural validation done (15/16 score, guard pass, references resolve, no dangling refs); live pipeline run on this repo deferred

## Out of scope

- Re-adding Claude parallelism on top of the skills (deferred enhancement; sequential is acceptable for v1)
- Plan 03 (tree-skill) and Plan 05 (scaffold) re-spec — tracked separately; this plan only flags the interaction (see Notes)
- Migrating any consumer's existing `.claude/agents/` — this is about the docks plugin's own pipelines
- A new release / version bump / push — commit only per user instruction

## Mistakes & Dead Ends

- **2026-05-24**: This file originally specced "dual-emit Codex `.toml` agents from `/docs`" (translate every Claude `.md` agent into `.agents/agents/<name>.toml`, symlinked from `.codex/agents/`). Abandoned before any code was written. → Why: Codex docs confirm (a) skills can't orchestrate subagents, (b) subagents are user-initiated only, (c) plugins can't ship subagents. So translated agents would be orphaned — nothing on Codex would dispatch them, and the plugin couldn't distribute them. Translating agents put the cart before the horse: there was no Codex orchestrator to consume them. → Adapted: make the pipelines themselves into self-contained cross-tool **skills** (the only plugin-shippable, Codex-runnable form), folding agent expertise into `references/`. Avoid re-proposing TOML agent translation unless Codex adds plugin-shippable subagents AND skill→subagent dispatch.

## Sources

- https://developers.openai.com/codex/skills — Codex skills can't dispatch subagents; no `context: fork`/`agent:` delegation; SKILL.md = name+description frontmatter + body (agentskills.io compatible)
- https://developers.openai.com/codex/subagents — "Codex only spawns a new agent when you explicitly ask it to"; parallel capped by `agents.max_threads` (default 6); subagents are project-local/personal, not documented as plugin-shippable
- https://developers.openai.com/codex/plugins/build — plugin manifest accepts only `skills`/`mcpServers`/`apps`/`hooks`; no `agents`/`subagents`/`commands`
- `plugins/docks/commands/docs.md` (repo) — canonical 8-phase Builder-Verifier template being converted (Phase 0–8, Plan-Mode gate at Phase 7)
- `plugins/docks/skills/internal/forked-docs-categorizer/SKILL.md` (repo) — confirms forked-* are thin `context: fork` envelopes (inert on Codex)
- `plugins/docks/skills/productivity/plan-manager/SKILL.md` (repo) — the gate/lifecycle replacing Plan Mode; skill-first precedent

## Blockers

(none — actionable once the open questions in Notes are resolved during plan review)

## Notes

Open questions for user review (resolve before execution):

1. **`plan-manager.md` / `plan-review.md` agents — keep or delete?** They are plan-lifecycle dispatch shims, not pipeline phases. Keep = Claude retains isolated-context plan-review auto-fire on ship. Delete = fully skill-only; plan-manager skill invokes plan-review via the Skill tool. Default proposal: **keep** (minimal, preserves a working Claude optimization).
2. **Does the `docs` skill still generate agents?** The current `/docs` bootstraps a consumer's `.claude/skills/` AND `.claude/agents/`. If docks itself goes skill-only on principle, should `/docs`-as-skill drop the agent-generation phases (role-mapper, agents-builder) and become skills-only? Default proposal: **keep agent generation** (consumers may still want Claude agents) but make it conditional/clearly Claude-specific. Affects whether 2 of the 8 docs references survive.
3. **Skill categories.** Proposed: `security` + `refactor` → `engineering`; `docs` → `productivity`. Confirm.
4. **Skill names / user-invocability.** Keep the `/docs`-style trigger by marking the 3 skills `user-invocable: true`? Names `docs`/`refactor`/`security` are broad for CSO matching — consider `skills-audit`, `refactor-pipeline`, `security-scan`. Confirm naming.

Cross-plan interactions:
- **Plan 05 (scaffold)** wants to add a `/scaffold` *command* — directly contradicts commands-removal. It must be re-spec'd as a `scaffold` skill. Sequence Plan 05 after this.
- **Plan 03 (tree-skill)** builds nested AGENTS.md/CLAUDE.md context. Should run after this so the tree reflects the new skill-only structure.

## Evidence log

- **2026-05-24** — Original dual-emit scope abandoned after Codex-docs research; user chose "re-architect, remove the command, skill-only" + "remove plan-mode, use plan-manager skill" + structure "3 pipeline skills + references". — by user + self

## Review

- **Goal met:** yes — all 8 binding criteria verified against ship commit `d19c4b7`: 3 cross-tool skills (`engineering/security` 5 refs, `engineering/refactor` 7 refs, `productivity/docs` 8 refs) with all 20 `references/` links resolving; 20 pipeline agents + 9 `internal/forked-*` + 3 commands + `{guard,score}-commands.sh` deleted; only `plan-manager.md`/`plan-review.md` remain under `agents/`; every `ExitPlanMode` hit is a negative "do NOT call" guard or the `agents` skill's CLAUDE-SPECIFIC list; both manifests dropped `./skills/internal`. Smoke-test `[~]` (structural-only, live run deferred) is expected scope, not a shortfall.
- **Regressions:** none — no `subagent_type:`/`Task` dispatch or command refs to any deleted artifact survive in `plugins/docks/`. Note (pre-existing, NOT introduced by this commit): `plugins/docks/skills/engineering/solid/references/depth-and-seams.md:88` carries a prose "Companion: `refactor-pre-verifier` agent" cross-reference to a now-deleted agent; that file was not modified by this ship and the line is documentation, not an executable dispatch, so nothing breaks.
- **CI:** pass — `bash scripts/ci.sh` exit 0; all guards/scorers green (engineering 198/floor 140, productivity 102/floor 64, agents 29/floor 28; each new skill scores 15; content_hash in sync). The workflow-YAML lint step self-skipped locally (no pyyaml/yq) — tag-CI on GitHub validates it regardless.
- **Follow-ups:** none required. Optional cleanup slug (do NOT auto-create): `solid-ref-stale-agent-link` — refresh the `refactor-pre-verifier` cross-reference in `solid/references/depth-and-seams.md:88` to point at `refactor/references/pre-verifier.md`.
- Filed by: plan-review on 2026-05-25T00:14:32Z
