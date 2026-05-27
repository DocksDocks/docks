---
name: refactor
description: "Use when auditing a codebase for structural issues — dead code, duplication, missing abstractions, SOLID violations (all 5 incl. Liskov), modernization candidates. Runs exploration → dead-code scan → duplication scan → SOLID analysis → planning → pre-verify sequentially, gates on the plan lifecycle, then implements one change at a time with test-revert and a post-verify SOLID delta. Not for security audits (use security) or single bug fixes (use fix-workflow)."
user-invocable: true
metadata:
  pattern: pipeline
  updated: "2026-05-24"
  # content_hash: auto-managed by scripts/skills/content-hash.sh --backfill
  content_hash: "4788c5d44583ae03a67a3b524a506b9db30500e8fec93c8672e644c0ae6ff35b"
---

# Refactor (cross-tool pipeline)

Detect and fix structural issues — dead code, duplication, SOLID violations, modernization — as one sequential pass with a tiered plan, an approval gate, and test-guarded implementation. Single-agent and cross-tool: no slash command, no subagent dispatch, no Plan Mode. Each phase's expertise lives in `references/<phase>.md`; this body is the orchestration.

<constraint>
Single-agent sequential. Execute the phases IN ORDER, in THIS context. There is no parallel fan-out or subagent dispatch — those are runtime-specific and not portable. Before running each phase, read its `references/<phase>.md` and apply it. Append each phase's output to the plan file as you finish it, so a mid-run compaction can resume by re-reading it.
</constraint>

<constraint>
Two-stage gate, not Plan Mode. Phases 1–5 are READ-ONLY analysis. After Phase 5, STOP: the plan file is the deliverable for approval. Do NOT call `ExitPlanMode` (Claude-only) and do NOT edit code yet. Implementation (Phases 7–8) runs only after the user approves via the plan lifecycle (`start <slug>`).
</constraint>

<constraint>
Implementation discipline (Phases 7–8). ONE refactoring at a time — never batch before testing. Run tests after each change; on failure REVERT immediately (`git restore`, or `git restore --staged` + `git restore` for a re-staged `git rm`) and log `REVERTED: <reason>` — do not try to "fix" it. Delete files with `git rm` only (never raw `rm`). Do not touch code beyond the planned change.
</constraint>

## When to use

- A structural cleanup pass over a module, package, or whole repo.
- After a feature leaves behind dead code, duplication, or a growing switch.
- When you want a tiered, test-strategied plan you can approve before anything changes.

## When NOT to use

| Situation | Use instead |
|---|---|
| Security audit (OWASP, injection, authz) | `security` |
| One known bug to fix | `fix-workflow` |
| Dependency / CVE triage | `dep-vuln-workflow` |
| Style / maintainability review only | `code-review` |

## Pipeline

Run in order. Each phase reads its reference, then writes output to the plan file under the exact heading (the heading is the resume anchor — keep it verbatim).

| # | Phase | Reference | Output heading |
|---|---|---|---|
| 1 | Exploration (stack, tools, abstractions, DI) | `references/explorer.md` | `## Phase 1: Exploration Results` |
| 2a | Dead-code scan (safety-tiered) | `references/dead-code-scanner.md` | `## Phase 2a: Dead Code Findings` |
| 2b | Duplication & modernization scan | `references/duplication-scanner.md` | `## Phase 2b: Duplication Findings` |
| 3 | SOLID analysis (S/O/L/I/D + monorepo) | `references/solid-analyzer.md` | `## Phase 3: SOLID Analysis Results` |
| 4 | Planning (3 tiers, 9 fields/change) | `references/planner.md` | `## Phase 4: Refactoring Plan` |
| 5 | Pre-implementation verification | `references/pre-verifier.md` | `## Phase 5: Pre-Verifier Results` |
| — | **GATE** — present plan, await approval | (this body) | `## Phase 6: Plan Presentation` |
| 7 | Implementation (one change at a time) | (this body) | `## Phase 7: Implementation Log` |
| 8 | Post-implementation verification | `references/post-verifier.md` | `## Phase 8: Post-Verifier Results` |

Phase 3 uses Phase 2a's SAFE tier to skip files about to be deleted. Phase 4 merges 2a + 2b + 3.

## How to run each phase

1. Anchor the date once (`date "+%Y-%m-%d"`), record scope (a path, or the whole project).
2. Create/open the plan file; write an `## Environment` block (date, branch, short git status).
3. For each read-only row (1 → 5), in order: read `references/<phase>.md`, perform it, write under the row's heading, confirm the heading landed before the next phase. If a phase finds nothing, write "no findings" — never silently skip.
4. At the GATE, hand off (below). Resume at Phase 7 only after approval.

## The plan file (IPC + deliverable)

```text
docs/plans/planned/<YYYYMMDD>-refactor-<scope>.md   (preferred — tracked by plan-manager)
docs/refactor-plan-<YYYYMMDD>.md                    (fallback when docs/plans/ is absent)
```

Write as you go — do not hold all phase output in context and dump it at the end. Downstream phases and a resumed run locate prior output by grepping the headings.

## The gate (replaces Plan Mode)

After Phase 5, write `## Phase 6: Plan Presentation` to the plan file:

1. Refactorings by tier (1 Quick Wins / 2 Consolidation / 3 Structural) — each with `file:line`, what-changes, Pattern (SOLID entries), risk.
2. Estimated impact: files modified, lines removed, duplicates eliminated, SOLID resolved by principle.
3. Skipped findings (including over-engineering and unreproducible drops).
4. Any MUST FIX from the pre-verifier requiring plan adjustment first.

Then STOP and tell the user: "Refactoring plan written to `<path>`; review and say `start <slug>` to implement." Approval flows through the plan lifecycle — never `ExitPlanMode`.

## Implementation (Phases 7–8, after approval)

1. Run the full test suite first to establish a baseline. If tests already fail, note which and proceed carefully.
2. For each refactoring in tier order (1 → 2 → 3):

```bash
# per change: characterize → change → test → keep or revert
# edit-only change → Edit tool; file deletion → git rm <path>  (never raw rm)
# on test failure → git restore <path>  (staged deletion: git restore --staged <path> && git restore <path>)
```

   - Write characterization tests first if the change needs them; verify they pass.
   - Make the change. Run the test suite. On failure, REVERT immediately and log `REVERTED: <reason>`; continue to the next.
   - Run the linter; fix issues introduced. Log `APPLIED: <description>`.
3. After all changes, run the full suite once more. Then Phase 8: read `references/post-verifier.md`, verify the diff against the plan, run tests/linter/type-checker, re-analyze every changed file for NEW SOLID violations, and report the compliance delta. Any new violation → revert the offending change.

| | Example finding (any phase) |
|---|---|
| BAD | "This file has some duplication and could be cleaner." |
| GOOD | "`src/utils/format.ts:45` + `src/api/fmt.ts:12` — 18-line duplicate of currency formatting; consolidate into `src/shared/money.ts`. Risk: low. Tests: `pnpm test money`." |

## References

| Read before running | File |
|---|---|
| Phase 1 — stack, tools, abstractions, DI | `references/explorer.md` |
| Phase 2a — dead-code scan + safety tiers | `references/dead-code-scanner.md` |
| Phase 2b — duplication, reuse, modernization | `references/duplication-scanner.md` |
| Phase 3 — per-principle SOLID + TS class gate | `references/solid-analyzer.md` |
| Phase 4 — tiered plan, 9 fields, over-engineering guard | `references/planner.md` |
| Phase 5 — pre-impl checks + reproduction | `references/pre-verifier.md` |
| Phase 8 — post-impl verify + SOLID delta | `references/post-verifier.md` |

## Gotchas

| Gotcha | Consequence | Right move |
|---|---|---|
| Editing code during Phases 1–5 | Breaks the read-only-then-approve contract | Analysis only until `start <slug>` |
| Batching several changes before testing | Can't tell which change broke the suite | One refactoring → test → keep/revert |
| Raw `rm` to delete dead code | Unstaged, harder to recover | `git rm` only; revert via `git restore` |
| Flagging modernization from memory | Ships a backwards "fix" (e.g. Next.js `proxy.ts`) | Verify against current docs for the installed version |
| Resolving one SOLID violation but adding another | Net-negative refactor ships | Phase 8 re-checks all 5 principles; revert on any new violation |
| Assuming `docs/plans/` exists in a consumer repo | Write fails or lands nowhere | Check first; `plan-init` or use the fallback path |
