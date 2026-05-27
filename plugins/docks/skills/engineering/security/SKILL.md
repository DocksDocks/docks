---
name: security
description: "Use when running a security audit on a codebase — OWASP Top 10, injection (SQLi/XSS/command/path), auth & authz weaknesses, IDOR, SSRF, crypto misuse, race conditions, mass assignment, dependency CVEs. Runs discovery → vulnerability scan → logic analysis → adversarial hunt → synthesis sequentially in one context. Read-only; pipe findings to fix-workflow. Not for dependency-only triage (use dep-vuln-workflow)."
user-invocable: true
metadata:
  pattern: pipeline
  updated: "2026-05-24"
  # content_hash: auto-managed by scripts/skills/content-hash.sh --backfill
  content_hash: "22bc507386db284eabe4eb9f083aac99c2fab5f3cd99f34ffaf4dc7ec373c368"
---

# Security Audit (cross-tool pipeline)

A full OWASP-aware security audit run as one sequential pass: discovery, three analysis lenses, and a synthesis that challenges every finding before it reaches the report. Single-agent and cross-tool — no slash command, no subagent dispatch, no Plan Mode. The expertise for each phase lives in `references/<phase>.md`; this body is the orchestration.

<constraint>
Single-agent sequential. Execute the five phases IN ORDER, in THIS context. There is no parallel fan-out or subagent dispatch — those are runtime-specific and not portable. Before running each phase, read its `references/<phase>.md` and apply that checklist. Append each phase's output to the audit file as you finish it, so a mid-run compaction can resume by re-reading the file.
</constraint>

<constraint>
Read-only. This pipeline never modifies source. Its only deliverable is the audit report. Remediation is a separate step — hand confirmed findings to the `fix-workflow` skill. Do not edit code while auditing, even to "quickly fix" something you find.
</constraint>

<constraint>
Approval via the plan lifecycle, not Plan Mode. Write the report to a plan file under `docs/plans/` and surface it — do NOT call `ExitPlanMode` (Claude-only). If `docs/plans/` does not exist, run `plan-init` first, or write the report to `docs/security-audit-<date>.md` and tell the user where it is.
</constraint>

## When to use

- A broad security review of a service, module, or branch before shipping.
- After a feature touches auth, payments, file handling, deserialization, or external requests.
- When you want OWASP Top 10 coverage with per-finding `file:line` evidence, not a checklist opinion.

## When NOT to use

| Situation | Use instead |
|---|---|
| Only need a dependency / CVE audit | `dep-vuln-workflow` |
| One known bug to fix | `fix-workflow` |
| General code quality / dead code / SOLID | `refactor` |
| Style / maintainability review | `code-review` |

## Pipeline

Run these in order. Each phase reads its reference, then writes its output to the audit file under the exact heading shown (the heading is the resume anchor — keep it verbatim).

| # | Phase | Reference | Output heading |
|---|---|---|---|
| 1 | Discovery (attack surface map) | `references/explorer.md` | `## Phase 1: Discovery Results` |
| 2a | Vulnerability scan (OWASP/CWE patterns) | `references/vulnerability-scanner.md` | `## Phase 2a: Vulnerability Findings` |
| 2b | Logic analysis (business logic, races, edge cases) | `references/logic-analyzer.md` | `## Phase 2b: Logic Findings` |
| 2c | Adversarial hunt (bypasses, chained attacks) | `references/adversarial-hunter.md` | `## Phase 2c: Adversarial Findings` |
| 3 | Synthesis (challenge, dedupe, prioritize) | `references/synthesizer.md` | `## Phase 3: Security Audit Report` |

Phases 2a–2c are independent lenses over the same Phase 1 map — on a runtime with parallel workers you MAY run them concurrently, but the portable default is sequential.

## How to run each phase

1. Anchor the date once (`date "+%Y-%m-%d"`) and record scope (a path argument, or the whole project).
2. Create or open the audit file (see below). Write an `## Environment` block: date, branch, short git status.
3. For each pipeline row, in order:
   - Read `references/<phase>.md`.
   - Perform that analysis against the scope, using Phase 1's map as the starting point for phases 2–3.
   - Write the result to the audit file under the row's heading.
   - Before starting the next phase, confirm the prior heading is present in the file. If a phase produced nothing, note "no findings" under its heading — never silently skip.
4. After Phase 3, present the report (see Handoff).

## The audit file (IPC + deliverable)

One Markdown file holds the whole run. It doubles as inter-phase memory and the final artifact.

```text
docs/plans/planned/<YYYYMMDD>-security-audit.md   (preferred — tracked by plan-manager)
docs/security-audit-<YYYYMMDD>.md                 (fallback when docs/plans/ is absent)
```

Write as you go — do not hold all phase output in context and dump it at the end. The headings above are the contract; downstream phases (and a resumed run) locate prior output by grepping for them.

## Finding quality (applies to every phase)

Every finding carries `file:line`, a CWE (where applicable), quoted evidence, a concrete attack path, and a minimal fix. No theoretical findings.

```text
BAD  — "The app has issues with user input handling."
GOOD — "src/api/users.ts:87 — CWE-89 SQL Injection:
        db.query(`SELECT * FROM users WHERE id = ${req.params.id}`)
        Attacker injects via the :id URL param.
        Fix: parameterize — db.query('SELECT ... WHERE id = $1', [req.params.id])."
```

Synthesis (Phase 3) re-greps each pattern and traces taint to a real input source; it DROPS anything it cannot reproduce, logging it under `## Dropped (failed reproduction)`. This is what keeps the false-positive rate low — do not skip it.

## Handoff

The report is terminal for this pipeline (read-only). After Phase 3:

1. Tell the user where the report is and give the executive-summary counts (Critical/High/Medium/Low).
2. If the report was written into `docs/plans/`, it is a tracked plan — the user can `start` it to drive remediation.
3. To remediate, hand confirmed findings to the `fix-workflow` skill:

```bash
# example: feed a confirmed finding into the fix pipeline
# "fix the SQL injection at src/api/users.ts:87 from the security audit"
```

Never auto-remediate from this skill.

## References

| Read before running | File |
|---|---|
| Phase 1 — attack-surface map, entry points, trust boundaries | `references/explorer.md` |
| Phase 2a — OWASP/CWE vulnerability scan checklist | `references/vulnerability-scanner.md` |
| Phase 2b — business-logic, concurrency, edge-case analysis | `references/logic-analyzer.md` |
| Phase 2c — attacker mindset, bypasses, chained attacks | `references/adversarial-hunter.md` |
| Phase 3 — challenge/reconcile/prioritize + OWASP coverage | `references/synthesizer.md` |

## Gotchas

| Gotcha | Consequence | Right move |
|---|---|---|
| Editing code to "fix" a finding mid-audit | Breaks read-only guarantee; muddies the diff under review | Record it; remediate later via `fix-workflow` |
| Dumping all findings at the end instead of writing per-phase | A compaction mid-run loses every prior phase | Write each phase's output to the audit file immediately |
| Reporting a grep hit without reading context | False positives; erodes trust in the whole report | Read 5+ lines around each cited line; trace taint before asserting severity |
| Skipping synthesis because the scanners "already found everything" | Duplicate, mis-severitied, unreproducible findings ship | Always run Phase 3 — challenge, dedupe, drop unreproducible |
| Assuming `docs/plans/` exists in a consumer repo | Write fails or lands nowhere | Check first; `plan-init` or use the fallback path |
| Trusting a library API from memory in a suggested fix | A wrong security fix is worse than none | Verify the API against current docs before recommending it |
