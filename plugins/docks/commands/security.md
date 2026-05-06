---
name: security
description: Use when running a security audit on a codebase — OWASP Top 10 coverage, logic flaws, authentication/authorization weaknesses, cryptographic misuse, race conditions, dependency vulnerabilities. Three parallel scanners (Vulnerability, Logic, Adversarial) followed by a Synthesizer that challenges every finding. Read-only; to fix issues, pipe findings into /fix.
argument-hint: "[path-or-scope]"
allowed-tools: >-
  Read Write Glob Grep Agent Skill WebFetch WebSearch
  Bash(date) Bash(git status) Bash(git log:*) Bash(rtk:*)
---

# Security Audit

Security and logic analysis across the entire codebase using parallel specialized subagents with a final synthesis pass.

---

<constraint>
If not already in Plan Mode, call `EnterPlanMode` NOW before doing anything else. All phases are read-only until the user approves the plan.
</constraint>

<constraint>
Phase Transition Protocol — Orchestrator Behavior:

Between phases, do NOT stop to summarize, analyze, or present intermediate results to the user. Process each phase's output, write it to the plan file, and IMMEDIATELY launch the next subagent(s) in the same turn. Do not end your turn between phases.

The ONLY time you stop and wait for user input is after the Phase 4 ExitPlanMode gate.

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

Working tree (short):

```!
git status --short 2>/dev/null | head -30 || echo "(clean)"
```

Recent commits:

```!
git log --oneline -5 2>/dev/null || echo "(no commits)"
```

Before invoking the first subagent, write this rendered block to the plan file as `## Environment` so downstream phases can reference git state without re-running the shell.

## Phase 1: Discovery

Invoke `subagent_type: security-explorer`. Prompt:

> Run /security Phase 1. Map the entire codebase for security-relevant areas (auth handlers, authz checks, API endpoints, DB queries, file I/O, user input, sessions, crypto, external APIs, configs, env usage). Plan file: {plan-file-path}. Scope: $ARGUMENTS (or full project if empty). Write your output to the plan file under `## Phase 1: Discovery Results`.

After the explorer returns, write its output to the plan file under that heading, then immediately launch Phase 2.

## Phase 2: Parallel Analysis

<constraint>
Launch ALL THREE wrappers below in a SINGLE tool-call turn via the Skill tool. The wrappers use `context: fork` (issue #16803, v2.1.101) so siblings 2-N share the cached prompt prefix instead of re-paying full input-token cost per sibling.
</constraint>

Parallel invocations (in one turn) — pass the plan-file path as `$0` and `$ARGUMENTS` (scope) as `$1`:
- `Skill(skill: "docks:forked-security-vulnerability-scanner", args: "{plan-file-path} $ARGUMENTS")` — wraps `security-vulnerability-scanner`; writes under `## Phase 2a: Vulnerability Findings`.
- `Skill(skill: "docks:forked-security-logic-analyzer", args: "{plan-file-path} $ARGUMENTS")` — wraps `security-logic-analyzer`; writes under `## Phase 2b: Logic Findings`.
- `Skill(skill: "docks:forked-security-adversarial-hunter", args: "{plan-file-path} $ARGUMENTS")` — wraps `security-adversarial-hunter`; writes under `## Phase 2c: Adversarial Findings`.

The wrapper bodies carry the per-phase task brief and the IPC heading; do not duplicate them in the Skill args. After all three return, confirm their outputs landed in the plan file under their respective `## Phase 2a:`, `## Phase 2b:`, and `## Phase 2c:` headers, then immediately launch Phase 3.

## Phase 3: Synthesis

Invoke `subagent_type: security-synthesizer`. Prompt:

> Run /security Phase 3. Plan file: {plan-file-path}. Read Phase 2a, 2b, 2c findings; challenge, reconcile, and produce the final Security Audit Report per your system prompt. Write your report to the plan file under `## Phase 3: Security Audit Report`.

## Phase 4: Present Plan + Exit Plan Mode

Write the synthesizer's final report to the plan file as the presentation, then call `ExitPlanMode`.

Plan Mode handles user approval. This command is read-only; to fix issues, pipe findings into `/fix`.

---

## Allowed Tools

See frontmatter. Orchestrator uses read-only tools + `Skill` for the Phase 2 forked-wrapper fan-out + `Agent` for the sequential Phase 1 (Explorer) and Phase 3 (Synthesizer) invocations + `Write` for plan-file I/O. Implementation is not part of this command — pipe findings to `/fix` for remediation.

## Usage

```bash
# Full codebase security audit
/security

# Focus on specific area (still checks entire codebase but emphasizes this area)
/security $ARGUMENTS
```
