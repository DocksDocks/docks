# Authoring audits — backlog

This file tracks **deferred audits** of the plugin's skills, commands, and agents against authoritative authoring best-practices. The first audit (skills, May 2026) lives in this repo's git history; what's recorded below is what hasn't been done yet so a future session can pick it up cold.

> **Historical record — counts below predate v0.2.** The May 2026 audits ran against an 8-command / 41-agent / 7-skill inventory. The v0.2 rebalance (`a8a3ecc`) demoted `/fix`, `/review`, `/test`, `/human-docs`, `/roadmap-init` from commands to skills, leaving 3 commands / 20 agents / 15 skills. Hardcoded floors (e.g. `560→595`) also predate `93db77e`, which switched CI to count-derived floors (`N × per-file_floor`). For current inventory and floors, see `bash scripts/score-<type>.sh --per-file` and `CLAUDE.md` → "Validators".

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

**Audit followup #4 — research-gate spot-check (May 2026)**: sampled 5 of the 18 sub-max agents (`fix-explorer`, `refactor-explorer`, `security-explorer`, `docs-pattern-extractor`, `docs-verifier`). All 5 are correctly research-gate-N/A:
- *Explorers* enforce a 2nd constraint "enumerate; do not diagnose" — research-gate would conflict with this. They map facts; downstream phases use them.
- *Pattern-extractors* extract from existing code; no framework recommendation.
- *Verifiers* validate structural integrity (frontmatter, paths, sizes) — they don't write framework claims.

Conclusion: the research-gate scorer correctly gates this point on agents that produce or recommend framework code (writers, builders, fixers). For enumerate/extract/verify roles, the 14/15 ceiling is the right shape.

**No CLAUDE.md prose change needed** — the per-file ≥14 floor mechanically requires 2 constraint blocks (mandatory-only ceiling is exactly 14), so "every agent gets a 2nd role-specific constraint" is now enforced by the scorer rather than documentation.

**Re-running this audit**: invariants from above carry forward; run `bash scripts/score-agents.sh --per-file | sort -k2 -n | head -20` to find the next sub-max cluster, then identify whether the gap is mechanical (research-gate, slop, missing constraint) or by-design.

## Resolved: commands body audit (May 2026)

The 8-command audit ran in May 2026. Total scorer total moved 164 → 165; per-file minimum stayed 18 (roadmap-init by-design); total floor bumped 158 → 162. One mechanical fix landed:

1. **`docs.md` argument wiring** — the Usage section documented `/docs <path>` (scoped audit) but the frontmatter lacked `argument-hint` and the body never referenced `$ARGUMENTS`. Added `argument-hint: "[path-or-scope]"` and threaded `$ARGUMENTS` into the Phase 1 explorer prompt as a scope hint (empty = full project). Score 20 → 21.

All 8 commands now score 21/21 (the per-file maximum). Two follow-up audits closed remaining gaps:

1. **`docs.md` `$ARGUMENTS` propagation (Audit followup #1)**: the initial argument-wiring fix only threaded `$ARGUMENTS` into the Phase 1 explorer prompt; phases 2–6 operated on the full project regardless. Updated the pre-flight Environment block to render `Scope: $ARGUMENTS` (so it lands in the plan file once), and added explicit scope handling to each subagent prompt (Phase 2a/2b/3/4a/4b/5/6). When a user runs `/docs src/api`, the scope flows through every phase: pattern-scanner restricts source-line searches; categorizer prioritizes new-skill proposals tied to the directory; verifier samples within scope when spot-checking file:line refs.

2. **`argument-hint` scoring quirk (Audit followup #2)**: the original check rewarded `argument-hint` presence unconditionally, costing 1pt for genuinely no-arg commands. Mirrored the orchestrator-aware Plan Mode rule — the check now passes automatically when the command's body never references `$ARGUMENTS` (no-args by design). Brings `roadmap-init` to 21/21.

Two scoring quirks resolved during the broader command audit:

- **Plan Mode quirk**: original check unconditionally required `Plan Mode`/`EnterPlanMode` text — mis-fired against mechanical scaffolders. Now skipped when zero `subagent_type:` refs (single-session work doesn't need a planning gate).
- **`argument-hint` quirk** (above).

Both quirk fixes share the same shape: detect "feature-applicable by orchestration shape" and skip the check when not applicable. The result is a scoring rubric that doesn't penalize genuinely simple commands, while still catching real authoring failures in orchestrators.

**Allowed-tools surface audit (Audit followup #3)**: trimmed `Bash(ls:*) Bash(find:*) Bash(wc:*)` from `docs.md`, `human-docs.md`, and `refactor.md` — these were declared but never used in the orchestrator body, and conflict with the kit's shell-avoidance philosophy (orchestrator + agents both use `Glob`/`Read`/`Grep` instead of shell utilities). The other 5 commands had clean allowed-tools lists.

**`<task>` block retirement (Audit followup #6)**: roadmap-init was the last command using `<task>...</task>` blocks; the other 7 had already moved to thin orchestrator (subagent_type refs) or plain markdown. `<task>` was a kit-internal visual-grouping convention with no Claude Code semantics — Anthropic's docs (skills, commands, subagents, plugins) do not document or parse it. Plain markdown sections (`## Phase`, `### Success Criteria`) achieve the same grouping with less ceremony, so the kit retired the convention. The guard now rejects `<task>` blocks anywhere to keep all 8 commands consistent.

**Other audit checklist points evaluated:**
- **Structural alignment**: 7 of 8 commands follow Plan Mode → multi-phase → ExitPlanMode → Implementation; `roadmap-init` deliberately diverges (mechanical, idempotent). Aligned.
- **Phase Transition Protocol**: enforced by `guard-commands.sh` for 3+ phase commands; passes.
- **subagent_type references**: enforced by `guard-commands.sh` to resolve to existing agent files; passes.
- **allowed-tools surface**: not audited line-by-line; left for future iteration if drift surfaces.
- **Description tightness**: done in earlier audit; all commands ≤500 chars (one-pt tier).

**Re-running this audit**: `bash scripts/score-commands.sh --per-file | sort -k2 -n` to surface sub-max commands; investigate per-checklist gap by-design vs mechanical fix.

## When picking up either audit

1. Re-fetch the source URLs above — Anthropic's docs evolve.
2. Run `bash scripts/ci.sh` first to confirm green baseline.
3. Run `bash scripts/score-<type>.sh --per-file` to get current per-file scores.
4. Work through the audit checklist file-by-file.
5. Apply low-risk fixes; list higher-risk recommendations for user review.
6. Update `CLAUDE.md` with any new universally-applicable rules.
7. Update `scripts/score-<type>.sh` if the audit reveals a new mechanical check worth enforcing.
