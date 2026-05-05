# Authoring audits — backlog

This file tracks **deferred audits** of the plugin's skills, commands, and agents against authoritative authoring best-practices. The first audit (skills, May 2026) lives in this repo's git history; what's recorded below is what hasn't been done yet so a future session can pick it up cold.

The starting point for any audit is `CLAUDE.md` → "Authoring skills, commands & agents" (frontmatter + description rules), plus the validators under `scripts/score-*.sh`. Those cover the description layer; what's parked here is the **body / system-prompt layer**.

## Sources to re-check before starting any audit

- <https://code.claude.com/docs/en/skills>
- <https://code.claude.com/docs/en/sub-agents>
- <https://code.claude.com/docs/en/best-practices> (especially "Write an effective CLAUDE.md")
- <https://agentskills.io/skill-creation/best-practices>
- <https://agentskills.io/skill-creation/optimizing-descriptions>

## Resolved: agents body audit (May 2026)

The 41-agent body audit ran in May 2026. Total scorer total moved 586 → 597; per-file minimum 13 → 14; floors bumped (`scripts/ci.sh` agents 560→595, per-file 11→14; GH workflow synced). Three classes of fix landed:

1. **Body-counting bug** in `score-skills.sh` / `score-agents.sh` / `guard-skills.sh` / `guard-agents.sh` — `---` lines inside YAML code fences were miscounted as a third frontmatter marker, truncating body length. Fixed with `&& c<2` cap on the awk counter. `docs-agents-builder` and `docs-skills-builder` jumped 14→15 from this fix alone.
2. **Slop trigger words in example lists** — `human-docs-writer` line 40 and `human-docs-pre-verifier` line 51 enumerated `"robust"` and `"seamless"` as inflated adjectives to flag, which the scorer (correctly) couldn't distinguish from authoring slop. Replaced with `"best-in-class"` and `"industry-leading"` — same teaching value, no scorer trigger.
3. **2nd `<constraint>` block** added to nine agents that had only the universal shell-avoidance constraint (verifier-scope for the four post-verifiers; evidence/specificity/boundary rules for `docs-pattern-scanner`, `docs-role-mapper`, `docs-categorizer`, `human-docs-analyzer`, `refactor-dead-code-scanner`).

The remaining 18 agents at 14/15 are missing the research-gate point by design — they don't touch external library docs (explorers, post-verifiers, categorizers, scanners). Per-file floor 14 captures the structural minimum without forcing unjustified context7 references.

**No CLAUDE.md prose change needed** — the per-file ≥14 floor mechanically requires 2 constraint blocks (mandatory-only ceiling is exactly 14), so "every agent gets a 2nd role-specific constraint" is now enforced by the scorer rather than documentation.

**Re-running this audit**: invariants from above carry forward; run `bash scripts/score-agents.sh --per-file | sort -k2 -n | head -20` to find the next sub-max cluster, then identify whether the gap is mechanical (research-gate, slop, missing constraint) or by-design.

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
