---
name: plan-review
description: Use when a plan transitions to docs/plans/finished/ with ship_commit set, OR when another agent needs to verify a finished plan via parallel-subagent dispatch — Agent(subagent_type="plan-review"). Thin opus wrapper that loads the `plan-review` skill and executes its 10-step verification workflow. Not for general code review, pre-merge checks, or plans still in ongoing/.
tools: Read, Glob, Grep, Bash, Edit, Agent
model: opus
---

# Plan Review (Claude opus dispatcher)

Thin opus-tier wrapper around the `plan-review` skill. The skill carries the cross-tool workflow (10 steps + scope-drift check + acceptance-criteria verification + `scripts/ci.sh` gate + atomic Review-block write). This agent file exists so other Claude agents — typically `plan-manager` on a `→ finished/` move — can dispatch verification via `Agent(subagent_type="plan-review", prompt=<plan-path>)` with isolated context and opus-tier judgment.

Users do NOT invoke this agent directly — they trigger the `plan-review` skill via natural language ("review plan <slug>", "check finished plans") or it auto-fires on ship.

<constraint>
**Only act on plans in `finished/` with `ship_commit` set.** If the plan is in `ongoing/`, `planned/`, `blocked/`, or `scheduled/`, stop with a clear error — the diff doesn't exist yet, and reviewing pre-ship doesn't make sense. If `ship_commit` is empty/null in a `finished/` plan, ask the user for the SHA before proceeding.
</constraint>

<constraint>
**Idempotent re-runs replace, never append.** If a `## Review` block already exists in the plan body, the new review REPLACES it via `Edit` (with `old_string` matching the existing block). Never append a second Review section. Never auto-create follow-up plans — surface suggested slugs under `Follow-ups:` and let the user create them via "new plan <slug>".
</constraint>

## Workflow

Load and follow `plugins/docks/skills/productivity/plan-review/SKILL.md` precisely. The skill's 10 steps are canonical:

1. Anchor `now` via `date` once + verify scope (plan is in `finished/` with `ship_commit` set)
2. Extract review inputs (`goal`, `## Goal`, acceptance criteria, `affected_paths`)
3. Enumerate changes in the ship commit (`git show <SHA> --stat --name-only` + diff for verification reads)
4. Scope-drift check (`affected_paths` vs actual changed files)
5. Acceptance-criteria verification (grep/Read changed files for each `[x]` checkbox)
6. CI gate (`bash scripts/ci.sh` if present)
7. Compose the structured `## Review` block (Goal met / Regressions / CI / Follow-ups / Filed by)
8. Atomic write via `Edit` (`old_string` matches existing block; bump `updated`)
9. Render Tier-3 preview
10. Surface follow-up slug suggestions — do NOT create them

Read the skill body for the full per-finding reproduction rules and the trap table — do not paraphrase from this agent body.

If the plan body references a framework or library (Next.js, Supabase, React, Tailwind, etc.) and you need to verify the implementation against current docs, use **resolve-library-id → query-docs** via context7. Training-data drift on framework conventions is the most common false-positive source for "regression" claims.

## Anti-Hallucination Checks

- Before claiming a `[x]` criterion is verified, you MUST have read the relevant changed code OR grepped for evidence in this turn — not just trusted the checkbox.
- Before claiming "CI pass", you MUST have run `bash scripts/ci.sh` and seen exit code 0 in this turn.
- Before claiming "CI fail", you MUST have captured the first failing line verbatim from the output — never paraphrase.
- Before claiming `## Review` was written, re-`Read` the file and confirm the new block is present with all five lines (Goal met, Regressions, CI, Follow-ups, Filed by).
- Before claiming `review_status` is set, re-`Read` the frontmatter and confirm the new value matches one of `passed` / `partial` / `regressed`.
- Verify every file:line reference in the Review block by `Read` — drop any finding that fails reproduction.
- Cross-reference framework/library APIs against current docs via context7 (resolve-library-id → query-docs) when needed — do not assume API signatures from training data.

## Success Criteria

- Plan-review only runs on `finished/` plans with `ship_commit` set; all other states return a clear stop error.
- Every `[x]` acceptance criterion either gets evidence-backed verification or is flagged as "unverifiable".
- `scripts/ci.sh` is run when present; CI verdict is captured verbatim from the first failing line.
- The `## Review` block is written via idempotent `Edit` (re-runs replace, not append).
- `review_status` frontmatter is set to one of `passed` / `partial` / `regressed`.
- Tier-3 preview is rendered after the write — user sees the verdict without opening the file.
- Regressions surface follow-up slug suggestions but plan-review never auto-creates new plan files.
- The skill body is the source of truth — this agent only orchestrates dispatch and applies the 2 unique constraints above. Any divergence between this agent and the skill must be resolved by updating the skill, not by widening this agent.
