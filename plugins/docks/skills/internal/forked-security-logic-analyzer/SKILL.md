---
name: forked-security-logic-analyzer
description: "Use when /security Phase 2b fans out parallel scanners — wraps the security-logic-analyzer agent with `context: fork` so siblings reuse the orchestrator's cached prompt prefix instead of re-paying full input-token cost per sibling (issue #16803, v2.1.101 fix). Not for direct user invocation."
context: fork
agent: security-logic-analyzer
user-invocable: false
metadata:
  pattern: orchestration-wrapper
  source_files:
    - "plugins/docks/agents/security-logic-analyzer.md"
    - "plugins/docks/commands/security.md"
  updated: "2026-05-06"
  content_hash: "104cba2010aeb45f284fded6f062450cab53fe888a284b4d2e1212b1c0fa6923"
---

# Forked Security Logic Analyzer

`/security` Phase 2b — parallel scanner fan-out via `context: fork`.

<constraint>
Plan-file IPC: write output to `$0` under heading `## Phase 2b: Logic Findings` (verbatim). The orchestrator runs `Grep('^## Phase 2b:', $0)` to gate the next phase — wrong heading or missing write fails the pipeline.
</constraint>

<constraint>
Thin envelope only. Trust-boundary mapping, race-condition heuristics, edge-case enumeration, the research-gate for framework auth/session APIs, and the anti-hallucination contract are owned by `plugins/docks/agents/security-logic-analyzer.md` — do not re-derive them here.
</constraint>

<constraint>
Stay out of OWASP injection / crypto / dep-vuln scope — Phase 2a (vulnerability scanner) owns those. This phase covers business-logic flaws, trust-boundary violations, race conditions, and edge cases that pattern-based scans miss.
</constraint>

## Task

Run /security Phase 2b. Plan file: `$0`. Scope: `$1` (empty = full project).

Analyze the codebase for business-logic flaws, trust-boundary violations, race conditions, time-of-check-to-time-of-use issues, and security-relevant edge cases per the system prompt. Each finding cites `file:line`, the data-flow / trust-boundary / race-window narrative, and a concrete exploitation scenario.

Write findings to the plan file under:

```text
## Phase 2b: Logic Findings
```

## Output discipline

| | Behavior | Why |
|---|---|---|
| BAD | Re-flag SQL injection or weak crypto already covered by Phase 2a | Phase 3 dedupes against 2a; restating wastes synthesizer budget |
| GOOD | Write findings to `$0` under `## Phase 2b: Logic Findings` (verbatim), logic-only | Phase 3 challenges, reconciles, and merges with 2a + 2c into the final report |

## Wrapper args

| Arg | Value | Required |
|---|---|---|
| `$0` | plan-file path | yes |
| `$1` | scope (path or empty for full project) | no |
