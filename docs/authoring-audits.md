# Authoring audits — backlog

This file tracks **deferred audits** of the plugin's skills, commands, and agents against authoritative authoring best-practices. The first audit (skills, May 2026) lives in this repo's git history; what's recorded below is what hasn't been done yet so a future session can pick it up cold.

The starting point for any audit is `CLAUDE.md` → "Authoring skills, commands & agents" (frontmatter + description rules), plus the validators under `scripts/score-*.sh`. Those cover the description layer; what's parked here is the **body / system-prompt layer**.

## Sources to re-check before starting any audit

- <https://code.claude.com/docs/en/skills>
- <https://code.claude.com/docs/en/sub-agents>
- <https://code.claude.com/docs/en/best-practices> (especially "Write an effective CLAUDE.md")
- <https://agentskills.io/skill-creation/best-practices>
- <https://agentskills.io/skill-creation/optimizing-descriptions>

## Parked: agents body audit

**Question to answer:** Are the 41 subagent system prompts in `plugins/docks/agents/` doing the right amount of work, or are they over-/under-engineered relative to Anthropic's documented patterns?

**What we already know (from the May 2026 research):**
- The Anthropic sub-agents doc shows minimal example prompts (2–3 sentences). Our agents are richer (60–300 line bodies) — that's either appropriate specialization or over-engineering.
- The scorer at `scripts/score-agents.sh` rewards `## Workflow`, `## Success Criteria`, `<constraint>` blocks, anti-hallucination checks, research-gate (`context7`/`resolve-library-id`), no-slop, model declared, tools declared, body 60–300 lines.
- Agents inherit ALL parent tools when `tools:` is omitted. Plugin-shipped agents silently ignore `hooks` / `mcpServers` / `permissionMode`.

**Audit checklist:**
1. **Body sweet spot** — `awk '/^---$/{c++;next} c==2{print}' <file> | wc -l` per agent. Sweet spot is 60–300 (scorer); flag any outside.
2. **Tools tightness** — every agent should declare `tools:` (allowlist) or `disallowedTools:` (denylist). An omitted `tools:` field means inherit-all, which is permissive. Verify each agent's declared toolset matches its actual workflow needs (no surplus, no missing).
3. **Research-gate** — agents that touch framework / library / API decisions should mention `context7` / `resolve-library-id` / `query-docs`. Audit which agents legitimately need this and add the constraint where missing.
4. **Workflow ordering** — Anthropic's skills doc emphasizes "state what to do, not how/why." Audit each agent's `## Workflow` for narration vs imperative steps.
5. **Anti-hallucination checks** — every agent that emits file:line refs should have an explicit checklist (verify file exists, verify line content, verify import paths). Audit which have it; add where missing.
6. **Constraint block calibration** — `agentskills.io/skill-creation/best-practices` says "Match specificity to fragility." Audit which `<constraint>` blocks are appropriately strict vs over-specified for the agent's actual fragility.
7. **Per-file score gap** — 22 of 41 agents are 1-2 pts below scorer max (15). Run `bash scripts/score-agents.sh --per-file` and triage each gap: real improvement opportunity, or by-design (e.g., agent doesn't need research-gate)?

**Sub-max files at last audit (May 2026):** test-post-verifier (13), test-explorer (14), security-explorer (14), review-post-verifier (13), review-explorer (14), refactor-explorer (14), refactor-dead-code-scanner (13), human-docs-writer (14), human-docs-pre-verifier (14), human-docs-post-verifier (13), human-docs-explorer (14), human-docs-analyzer (13), fix-post-verifier (13), fix-explorer (14), docs-verifier (14), docs-skills-builder (14), docs-role-mapper (13), docs-pattern-scanner (13), docs-pattern-extractor (14), docs-explorer (14), docs-categorizer (13), docs-agents-builder (14).

## Parked: commands body audit

**Question to answer:** Our 8 commands are thin orchestrators (Plan Mode → multi-phase subagent dispatch → ExitPlanMode gate). Is this orchestrator structure aligned with any documented Anthropic pattern, or is it purely a project convention?

**What we already know:**
- Per code.claude.com/docs/en/skills: "Custom commands have been merged into skills." Files in `commands/` continue to work but skills are the recommended path.
- Anthropic's example command/skill files in the docs are SHORT (under 30 lines) — a description plus a numbered list of steps. Our commands are 200–400 lines because they orchestrate multi-phase subagent pipelines.
- The orchestration pattern (Plan Mode constraint, Phase Transition Protocol, subagent_type cross-refs, $ARGUMENTS, allowed-tools enumeration) is unique to this plugin — Anthropic doesn't document this pattern.

**Audit checklist:**
1. **Structural alignment** — does each command's structure (Plan Mode → Phases → ExitPlanMode → Implementation) actually correspond to its task, or is some boilerplate copied unnecessarily?
2. **Phase Transition Protocol clarity** — every multi-phase command must include the Phase Transition Protocol per the guard. Audit whether the wording is consistent + whether the orchestrator behavior section in each command is actually being read by Claude (vs ignored when it's too verbose).
3. **subagent_type references** — every reference must resolve to `plugins/docks/agents/<name>.md` (guard already enforces this). Audit whether the references reflect the latest agent set or have drift.
4. **$ARGUMENTS wiring** — commands that accept arguments via `argument-hint:` must use `$ARGUMENTS` somewhere in the body. Already scored; verify no drift.
5. **allowed-tools surface** — every command lists an `allowed-tools` set. Audit each set against the actual tools the command + its subagents need; trim surplus.
6. **Description tightness** — already done in the May 2026 audit. Commands are 302–421 chars; `roadmap-init` is the longest at 421.
7. **Per-file score gap** — `roadmap-init` was the lowest at 18/21 (3 short). Investigate which checks it's missing and whether they apply.

**Sub-max files at last audit (May 2026):** roadmap-init (18/21), docs (20/21).

## When picking up either audit

1. Re-fetch the source URLs above — Anthropic's docs evolve.
2. Run `bash scripts/ci.sh` first to confirm green baseline.
3. Run `bash scripts/score-<type>.sh --per-file` to get current per-file scores.
4. Work through the audit checklist file-by-file.
5. Apply low-risk fixes; list higher-risk recommendations for user review.
6. Update `CLAUDE.md` with any new universally-applicable rules.
7. Update `scripts/score-<type>.sh` if the audit reveals a new mechanical check worth enforcing.
