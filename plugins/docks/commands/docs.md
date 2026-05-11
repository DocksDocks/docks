---
name: docs
description: Use when bootstrapping or auditing a project's .claude/skills/ and .claude/agents/ directories. Covers skill health (CSO descriptions, size limits, staleness, coverage gaps), agent generation from skills, skill-maintenance skill creation, and cross-layer reference validation between agents and skills.
argument-hint: "[path-or-scope]"
allowed-tools: >-
  Read Write Glob Grep Agent Skill WebFetch WebSearch
  Bash(date) Bash(git log:*) Bash(git status)
  Bash(rtk:*) Bash(mkdir:*)
  Edit(.claude/skills/**) Edit(.claude/agents/**)
  Write(.claude/skills/**) Write(.claude/agents/**)
---

# Project Skills & Agents Manager

Bootstrap and audit project-specific skills (`.claude/skills/`) and project-specific agents (`.claude/agents/`) in a single non-interactive pass. Every improvement found is presented as one plan; the `ExitPlanMode` gate is the only decision point.

---

<constraint>
If not already in Plan Mode, call `EnterPlanMode` NOW before doing anything else. All phases are read-only until the user approves the plan.
</constraint>

<constraint>
Phase Transition Protocol — Orchestrator Behavior:

Between phases, do NOT stop to summarize, analyze, or present intermediate results to the user. Process each phase's output, write it to the plan file, and IMMEDIATELY launch the next subagent(s) in the same turn. Do not end your turn between phases.

The ONLY time you stop and wait for user input is Phase 7 (ExitPlanMode gate).

If auto-compaction triggers between phases, re-read the plan file to recover prior phase results, then continue with the next phase.
</constraint>

<constraint>
Phase Output Integrity — Orchestrator Behavior:

Before launching any subsequent phase, verify the prior phase's output landed in the plan file. Use `Grep('^## Phase N:', <plan-file-path>)` (substituting the actual phase number) — if zero matches, abort with: "Phase N (<agent>) produced no plan-file output. Aborting pipeline." Do NOT launch the next phase on stale state.

This catches silent subagent failures (failed Write, malformed output, wrong heading) before they propagate. Cost is one Grep call per phase transition — cheap relative to the cost of a Phase N+1 working from missing inputs.
</constraint>

---

## Pre-flight context

Environment snapshot (rendered at command-invoke time via Claude Code `!`-injection — no tool calls needed):

- Date: !`date '+%Y-%m-%d %H:%M:%S %Z'`
- Branch: !`git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(not a git repo)"`
- Scope: $ARGUMENTS  (empty = full project; if non-empty, restricts knowledge-area discovery and pattern scanning to this directory)

Working tree (short):

```!
git status --short 2>/dev/null | head -30 || echo "(clean)"
```

Recent commits:

```!
git log --oneline -5 2>/dev/null || echo "(no commits)"
```

Before invoking the first subagent, write this rendered block to the plan file as `## Environment` so downstream phases can reference git state without re-running the shell.

## Phase 0: State Detection

Deterministic filesystem inspection — no subagent. Run inline, then immediately launch Phase 1.

1. `Glob(".claude/skills/*/SKILL.md")` → `skills_count`
2. `Glob(".claude/agents/*.md")` → `agents_count` (exclude `*.bak`)
3. `Glob(".claude/skills/skill-maintenance/SKILL.md")` → `has_maintenance_skill` (yes/no)
4. `Bash("date '+%Y-%m-%d'")` → `today`

Write to plan file under `## Phase 0: State`:
- Skills: {skills_count} | Agents: {agents_count} | Maintenance skill: {yes/no} | Today: {today}

## Phase 1: Exploration

Invoke `subagent_type: docs-explorer` with the prompt:

> "Run /docs Phase 1. You are the Explorer. Plan file path: {plan-path}. Scope: $ARGUMENTS (may be empty). Read Phase 0 State and the `## Environment` block from the plan file. Map the project profile, enumerate ALL existing skills and agents with frontmatter parsed (skill/agent enumeration always covers the full `.claude/skills/` and `.claude/agents/` regardless of scope), and identify knowledge areas — when scope is non-empty, restrict knowledge-area discovery to that directory or sub-tree. Write output to the plan file under `## Phase 1: Exploration Results`."

## Phase 2: Skills Analysis

<constraint>
Launch BOTH wrappers below in a SINGLE tool-call turn via the Skill tool. Do NOT wait for one to finish before launching the next. The wrappers use `context: fork` (issue #16803, v2.1.101) so siblings 2-N share the cached prompt prefix instead of re-paying full input-token cost per sibling.
</constraint>

Parallel invocations (in one turn) — pass the plan-file path as `$0` and `$ARGUMENTS` (scope) as `$1`:
- `Skill(skill: "docks:forked-docs-categorizer", args: "{plan-path} $ARGUMENTS")` — wraps `docs-categorizer`; writes under `## Phase 2a: Categorizer Proposals`.
- `Skill(skill: "docks:forked-docs-pattern-scanner", args: "{plan-path} $ARGUMENTS")` — wraps `docs-pattern-scanner`; writes under `## Phase 2b: Pattern Scanner Findings`.

The wrapper bodies carry the per-phase task brief and the IPC heading; do not duplicate them in the Skill args. The forked subagents inherit the orchestrator's plan-file context (Phase 0 State, Phase 1 Exploration, `## Environment` block) by reading the plan file at `$0`. After both return, append their outputs to the plan file, then immediately launch Phase 3.

## Phase 3: Skills Builder

Invoke `subagent_type: docs-skills-builder` with the prompt:

> "Run /docs Phase 3. You are the Skills Builder. Plan file: {plan-path}. Scope: $ARGUMENTS (may be empty — flows through from Phase 2). Load Phase 2a Categorizer Proposals and Phase 2b Pattern Scanner Findings. Draft complete SKILL.md bodies and references/ files for every skill delta — proposals already respect the scope from Phase 2; ensure source_files and patterns referenced stay within scope when non-empty. Write output under `## Phase 3: Skills Plan`."

After it returns, append output to the plan file, then immediately launch Phase 4.

## Phase 4: Agents Analysis

<constraint>
Launch BOTH wrappers below in a SINGLE tool-call turn via the Skill tool. Do NOT wait for one to finish before launching the next. The wrappers use `context: fork` (issue #16803, v2.1.101) so siblings 2-N share the cached prompt prefix instead of re-paying full input-token cost per sibling.
</constraint>

Parallel invocations (in one turn) — pass the plan-file path as `$0` and `$ARGUMENTS` (scope) as `$1`:
- `Skill(skill: "docks:forked-docs-role-mapper", args: "{plan-path} $ARGUMENTS")` — wraps `docs-role-mapper`; writes under `## Phase 4a: Role Mapper Proposals`.
- `Skill(skill: "docks:forked-docs-pattern-extractor", args: "{plan-path} $ARGUMENTS")` — wraps `docs-pattern-extractor`; writes under `## Phase 4b: Pattern Extractor Content`.

The wrapper bodies carry the per-phase task brief and the IPC heading; do not duplicate them in the Skill args. The forked subagents inherit the Phase 1 Exploration Results, Phase 3 Skills Plan, and Phase 2b Pattern Scanner Findings by reading the plan file at `$0`. After both return, append outputs to the plan file, then immediately launch Phase 5.

## Phase 5: Agents Builder

Invoke `subagent_type: docs-agents-builder` with the prompt:

> "Run /docs Phase 5. You are the Agents Builder. Plan file: {plan-path}. Scope: $ARGUMENTS (may be empty — flows through from Phase 4). Load Phase 4a Role Mapper Proposals and Phase 4b Pattern Extractor Content. Draft complete agent file content (frontmatter + system prompt) for every agent delta. Write output under `## Phase 5: Agents Plan`."

After it returns, append output to the plan file, then immediately launch Phase 6.

## Phase 6: Unified Verifier

Invoke `subagent_type: docs-verifier` with the prompt:

> "Run /docs Phase 6. You are the Verifier. Plan file: {plan-path}. Scope: $ARGUMENTS (may be empty). Validate Phase 3 Skills Plan and Phase 5 Agents Plan against all checks: frontmatter, CSO compliance, size limits, file:line accuracy (spot-check 5+ — when scope is non-empty, sample preferentially from within scope), cross-layer integrity (every agent skill reference must resolve to a Phase 3 path), and replaced-skill sentinel. Write output under `## Phase 6: Verification`."

After it returns, append output to the plan file, then proceed to Phase 7.

## Phase 7: Present Plan + Exit Plan Mode

Write the following to the plan file, then call `ExitPlanMode`:

1. **Skills delta** — every create/update/split/merge/refresh/rewrite-description with before/after summaries and line counts.
2. **Agents delta** — every create/update/regenerate/delete with roles, tools, and skill references.
3. **Cross-layer check summary** — every agent → skill reference, confirmed resolvable.
4. **All files to be created, modified, or deleted** (full paths).
5. **Total knowledge surface** — lines across all SKILL.md + references.
6. **Issues (if any)** from Phase 6 Verifier — hard fails block implementation.
7. **Post-implementation cleanup** — `git rm -r .claude/skills/<old-name>/` commands for any skills replaced by splits/merges.

Plan Mode handles user approval. Once approved, proceed to Phase 8.

---

## Phase 8: Implementation + Final Verification

After approval:

1. Create `.claude/skills/` and `.claude/agents/` directories (and all `<skill-name>/references/` subdirs) via `Bash(mkdir -p …)` as needed.
2. For every **skill action** from Phase 3: write SKILL.md and `references/` files. For splits/merges: write the new skill directories; do NOT delete old ones (listed in Phase 7 cleanup instructions). For refreshes: overwrite existing SKILL.md body and bump `metadata.updated`.
3. For every **agent action** from Phase 5: write the agent file. For regenerate: Read existing file, Write its content to `.claude/agents/<name>.md.bak`, then Write new content to `.claude/agents/<name>.md`. For delete: Write stub with `disable-model-invocation: true` and empty description.
4. Verify in-session: all SKILL.md ≤500 lines; all `references/` 30-150 lines; all agent system prompts <200 lines; all agent skill references resolve on disk; `.claude/skills/skill-maintenance/SKILL.md` exists; AGENTS.md and CLAUDE.md not modified (use the `agents` bridge skill if those need work).
5. Report: skills created/updated/split/merged/refreshed, agents created/updated/regenerated, total lines, backup files written.

---

## Allowed Tools

See frontmatter. Planning phases: read-only — `Skill` dispatches the Phase 2 (Skills Analysis) and Phase 4 (Agents Analysis) parallel-scanner wrappers; `Agent` handles sequential phases (Explorer, Skills Builder, Agents Builder, Verifier). Implementation: `Edit` and `Write` scoped to `.claude/skills/**` and `.claude/agents/**`.

## Usage

```bash
/docs          # Full audit + generation pass
/docs <path>   # Scoped to a specific directory
```
