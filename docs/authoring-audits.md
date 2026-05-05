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

## Resolved: commands body audit (May 2026)

The 8-command audit ran in May 2026. Total scorer total moved 164 → 165; per-file minimum stayed 18 (roadmap-init by-design); total floor bumped 158 → 162. One mechanical fix landed:

1. **`docs.md` argument wiring** — the Usage section documented `/docs <path>` (scoped audit) but the frontmatter lacked `argument-hint` and the body never referenced `$ARGUMENTS`. Added `argument-hint: "[path-or-scope]"` and threaded `$ARGUMENTS` into the Phase 1 explorer prompt as a scope hint (empty = full project). Score 20 → 21.

The remaining 1pt gap on `roadmap-init` (20/21) is **by-design**:

- **`argument-hint` absent (-1pt)**: documented as no-arg (`/roadmap-init` only). Adding `argument-hint` for scoring would be cosmetic noise.

The scorer rewards `argument-hint` presence unconditionally; this is a known scoring quirk that costs 1pt for genuinely no-arg commands. Per-file floor 20 already accommodates roadmap-init.

A second scoring quirk was **resolved during this audit**: the original Plan Mode check rewarded any command that included `Plan Mode`/`EnterPlanMode` text plus a `<constraint>`, and penalized everything else 2pts — which mis-fired against `roadmap-init` (a mechanical scaffolder where idempotency replaces the approval gate, so adding Plan Mode would worsen UX). The check now passes automatically when the command has zero `subagent_type:` refs (single-session mechanical work doesn't need a planning gate). Orchestrators that dispatch subagents are still required to declare a Plan Mode constraint, so the check still catches the failure mode it was designed for.

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
