---
title: Research-driven capability tuning for Claude + Codex prompt surfaces
goal: Ship a capability-tuning skill + refresh kit prompt surfaces with verified mid-2026 Claude/Codex facts so both runtimes run at max capability
status: finished
created: "2026-06-10T02:52:22+00:00"
updated: "2026-06-10T03:13:57+00:00"
started_at: "2026-06-10T02:52:22+00:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: d1ded7538d459d7f57ad76122814e3567711a835
tags: [skills, capability, research, codex, claude]
affected_paths:
  - plugins/docks/skills/
  - plugins/docks/.claude-plugin/plugin.json
  - plugins/docks/.codex-plugin/plugin.json
  - plugins/docks/README.md
  - .claude-plugin/marketplace.json
  - README.md
  - scripts/skills/codex-facts.sh
  - docs/plans/
related_plans: []
review_status: passed
---

# Research-driven capability tuning for Claude + Codex prompt surfaces

## Goal

The kit's prompt surfaces (root AGENTS.md tree, shipped skills, the two plan agents) and its configuration guidance should reflect the *current* (June 2026) capability levers of both runtimes — Claude Code (Fable 5 / Opus 4.8 era: effort tuning, adaptive thinking, literal instruction-following, subagent/memory under-triggering) and Codex (gpt-5.5 era: reasoning effort, AGENTS.md discovery, skills catalog caps). Deliverables: (1) a new shipped skill that encodes capability-maximizing configuration for both runtimes (settings.json / config.toml levers + instruction-file design + session hygiene, grounded in Karpathy-style context engineering), and (2) surgical updates to existing prompt surfaces where research shows facts drifted or model-behavior guidance is stale.

## Context

User goal (via /goal): "improve current settings and system prompts to achieve the best model capabilities in both claude and codex … based on Karpathy's method, don't care about spending tokens." Consumer-side settings live in DocksDocks/public (out of session scope), so this repo's contribution is the kit itself: the skills and instruction files every project consumes, plus shipped guidance for runtime settings. Three deep-research agents (Karpathy method, Claude Code config, Codex config) are gathering verified facts from live docs.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Research fan-out: Karpathy method, Claude Code 2026 config, Codex 2026 config | — | 3-way | done | research agents |
| 2 | Author new productivity skill encoding capability-max config for both runtimes | 1 | — | done | main |
| 3 | Verify + refresh codex-agents-builder.md / codex-facts.sh pinned facts if drifted | 1 | with #4 | done | main |
| 4 | Refresh skills/AGENTS.md cross-tool wording + root AGENTS.md where research contradicts | 1 | with #3 | done | main |
| 5 | Apply model-behavior tuning to highest-leverage shipped surfaces (code-review recall, agent dispatch claims) | 1 | — | done | main |
| 6 | content-hash backfill, scripts/ci.sh green, commit + push | 2–5 | — | done | main |

### Step details

- #2 → `productivity/capability-tuning` (SKILL.md 171 lines + 2 references), scores 16/16. user-invocable. Listed in plugin README, root README, and all three manifest descriptions.
- #3 → codex-agents-builder.md: added `"none"` effort value, Claude `max`→`xhigh` mapping note, sonnet→`gpt-5.4` (mainline absorbed the codex line), sunset annotations; codex-facts.sh now pins `none` too.
- #4 → skills/AGENTS.md: catalog truncation corrected (EVEN truncation, 2%-of-window-in-tokens primary, 8,000 chars fallback — was "tail-first"); new rule 6 (goals over step-lists for Fable 5 / explicit scope for Opus 4.8); root AGENTS.md needed no change. Agent dispatch claims (subagents-can't-spawn) re-checked — still accurate per current sub-agents docs, left as is.
- #5 → code-review: evidence-vs-confidence rejection rule + self-censoring trap row (Opus 4.7/4.8 follow conservative filters literally; recall protection), still 16/16.

## Acceptance criteria

- [x] New skill passes guard + scores ≥14, description CSO-compliant (≤500 chars, "Use when…", "Not …") — scored 16/16, description 445 chars
- [x] Every factual claim in the new skill carries a verified mid-2026 source — Sources section lists doc pages + openai/codex source files, all fetched 2026-06-10; UNVERIFIED research items excluded from the skill
- [x] codex-agents-builder.md facts re-verified or corrected; codex-facts.sh still green — guard strengthened to pin `none`
- [x] Stale model-behavior claims in existing surfaces corrected (none left contradicting live docs)
- [x] bash scripts/ci.sh exits 0 — all checks green incl. claude plugin validate
- [x] Pushed to claude/dreamy-dijkstra-xu8opp — ship commit d1ded75

## Out of scope

- Consumer-side env vars / permissions / RTK config (live in DocksDocks/public — unreachable from this session)
- Adding a repo-local .claude/settings.json (root AGENTS.md explicitly excludes consumer settings from this repo)
- Release tagging (release.sh) — separate post-merge step

## Mistakes & Dead Ends

- **2026-06-10T02:52:22+00:00**: Tried to reach DocksDocks/public via list_repos → tool not available in this session → scope the work to this repo's shipped surfaces instead.

## Sources

- plugins/docks/skills/AGENTS.md — skill authoring conventions, cross-tool wording rules (verified 2026-05-28)
- plugins/docks/skills/productivity/skill-agent-pipeline/references/codex-agents-builder.md — pinned Codex facts (verified 2026-05-27)
- scripts/skills/codex-facts.sh — CI pin of Codex model ids / sandbox / effort sets
- code.claude.com/docs/en/{settings,memory,model-config,fast-mode,skills,sub-agents,hooks,context-window,best-practices} (fetched 2026-06-10) — model: fable / "best" alias; effortLevel low–xhigh in settings (max+ultracode session-only); alwaysThinkingEnabled; advisorModel; .claude/rules/ with paths: lazy loading; CLAUDE.md is a user message (enforce via hooks/permissions); nested CLAUDE.md + path-scoped rules don't survive compaction; skill bodies re-attach ≤5,000 tokens each in a 25,000 shared budget; Claude Code reads CLAUDE.md not AGENTS.md (@AGENTS.md import is the documented bridge)
- platform.claude.com prompting guides (Fable 5, Opus 4.8) — 4.8 literal instruction-following; Fable 5 generalizes more, over-prescriptive skills degrade output; MUST/CRITICAL overtriggers on 4.6+
- openai/codex source @ main 2026-06-10 (config_toml.rs, loader.rs, render.rs, agents_md.rs) + developers.openai.com/codex/* — gpt-5.5 current frontier (codex line merged into mainline at 5.4); model_reasoning_effort none|minimal|low|medium|high|xhigh (xhigh = ceiling; Claude max→xhigh in external-agent migration); web_search = "disabled"|"cached"|"live" top-level (on by default, cached); project_doc_max_bytes default 32768 with SILENT truncation; skills catalog budget = 2% of context window in tokens (8,000 chars fallback), even truncation across descriptions — NOT tail-first; skills roots .agents/skills + ~/.agents/skills (~/.codex/skills deprecated); Codex natively discovers .claude-plugin/plugin.json
- Karpathy (verified primary posts + repos): context-engineering definition (Jun 2025); "give it your hardest problems" (Sep 2025); 80% agent coding since Dec 2025; canonical agent failure modes (Jan 2026); declarative success criteria > imperative steps; prompts/skills as source code (nanochat skills, llm-council CLAUDE.md, autoresearch program.md); review is the bottleneck; "give it the beans" = NOT a Karpathy quote

## Blockers

## Notes

- The claude-api bundled skill (cached 2026-05-26) supplies Claude model facts: Fable 5 ($10/$50, 1M ctx), Opus 4.8, effort levels minimal→max incl. xhigh (Claude Code default for coding), adaptive thinking only on 4.7+, literal instruction-following, prescriptive "call this when…" tool descriptions giving measurable lift, subagent/memory under-triggering on 4.8, report-everything-filter-downstream for review harnesses.
- Skill placement: productivity/ category (per-file floor 8, aim 14+).

## Evidence log

- **2026-06-10T02:52:22+00:00** — Plan created; 3 research agents in flight — main
- **2026-06-10T03:11:09+00:00** — All research in; skill authored (16/16); 4 surfaces refreshed; ci.sh green — main
- **2026-06-10T03:11:57+00:00** — Shipped as d1ded75; affected_paths reconciled to actuals (plugins/docks/agents/ dropped — investigated, dispatch claims still accurate, no edit needed) — main

## Review

- **Goal met:** yes — capability-tuning skill shipped (16/16, 445-char CSO description) and every stale Claude/Codex fact found by research was corrected; all 6 `[x]` criteria evidence-verified against the d1ded75 diff.
- **Regressions:** none — codex-facts guard strengthened (now pins `none`) and full guard+scorer suite green; code-review and skill-agent-pipeline re-score at 16 and pass idempotency.
- **CI:** pass (`✔ All ci.sh checks passed`, exit 0, re-run at review time)
- **Follow-ups:** codex-mirror-native-manifest-note — `.agents/skills/codex-plugin-mirror` could note that Codex now natively discovers `.claude-plugin/plugin.json`, narrowing the mirror's job to the marketplace catalog.
- Filed by: plan-review on 2026-06-10T03:13:57+00:00
