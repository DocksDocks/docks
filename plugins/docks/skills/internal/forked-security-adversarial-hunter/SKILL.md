---
name: forked-security-adversarial-hunter
description: "Use when /security Phase 2c fans out parallel scanners — wraps the security-adversarial-hunter agent with `context: fork` so siblings reuse the orchestrator's cached prompt prefix instead of re-paying full input-token cost per sibling (issue #16803, v2.1.101 fix). Not for direct user invocation."
context: fork
agent: security-adversarial-hunter
user-invocable: false
metadata:
  pattern: orchestration-wrapper
  source_files:
    - "plugins/docks/agents/security-adversarial-hunter.md"
    - "plugins/docks/commands/security.md"
  updated: "2026-05-06"
---

# Forked Security Adversarial Hunter

`/security` Phase 2c — parallel scanner fan-out via `context: fork`.

<constraint>
Plan-file IPC: write output to `$0` under heading `## Phase 2c: Adversarial Findings` (verbatim). The orchestrator runs `Grep('^## Phase 2c:', $0)` to gate the next phase — wrong heading or missing write fails the pipeline.
</constraint>

<constraint>
Thin envelope only. Attacker-mindset prompts, chain-of-low-severity reasoning, abuse-of-feature heuristics, the research-gate for security tooling, and the anti-hallucination contract are owned by `plugins/docks/agents/security-adversarial-hunter.md` — do not re-derive them here.
</constraint>

<constraint>
Hunt for what 2a and 2b missed. Chains of two or more low-severity findings that combine into a high-severity exploit are the signature value-add of this phase — flag them with explicit chain reasoning, not as separate low-severity items.
</constraint>

## Task

Run /security Phase 2c. Plan file: `$0`. Scope: `$1` (empty = full project).

Hunt for vulnerabilities the systematic vulnerability scanner (2a) and the logic analyzer (2b) miss. Think like an attacker: chain low-severity issues into high-severity exploits, target authentication-state machines, look for abuse-of-feature paths, examine error-handling for information leaks, and probe trust assumptions per the system prompt. Each finding cites `file:line`, the attack chain, and the resulting impact.

Write findings to the plan file under:

```text
## Phase 2c: Adversarial Findings
```

## Output discipline

| | Behavior | Why |
|---|---|---|
| BAD | Restate 2a's findings without new attack chains | Phase 3 dedupes against 2a; this phase only earns its slot via novel chains |
| GOOD | Write findings to `$0` under `## Phase 2c: Adversarial Findings` (verbatim) with explicit chain reasoning | Phase 3 weights chained findings higher when consolidating |

## Wrapper args

| Arg | Value | Required |
|---|---|---|
| `$0` | plan-file path | yes |
| `$1` | scope (path or empty for full project) | no |
