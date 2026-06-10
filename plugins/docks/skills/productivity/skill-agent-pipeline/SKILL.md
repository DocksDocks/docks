---
name: skill-agent-pipeline
description: "Use when bootstrapping or auditing a project's skills and agents — skill health (CSO descriptions, caps, staleness, coverage gaps), a content-accuracy audit verifying every file:line ref and snippet against current source, pattern extraction with evidence, and SKILL.md authoring + references/ splits. Emits agents in BOTH Claude (.claude/agents/*.md) and Codex (.codex/agents/*.toml) form; phases gate through the plan lifecycle. Not for prose docs like README/AGENTS.md (use human-docs-workflow)."
user-invocable: true
metadata:
  pattern: pipeline
  updated: "2026-06-10"
  content_hash: "976e7518e47d37efc1246e91580d385521ad2d71b94e54b079afa827fb12509c"
---

# Skills & Agents Pipeline (cross-tool)

Bootstrap and audit a project's `.claude/skills/` plus its agents — drafted in BOTH Claude (`.claude/agents/*.md`) and Codex (`.codex/agents/*.toml`) form — in one sequential pass: explore, propose the skill-set delta, extract codebase patterns, draft skills, verify, then implement after approval. Single-agent and cross-tool — no slash command, no subagent dispatch, no Plan Mode. Each phase's expertise lives in `references/<phase>.md`; this body is the orchestration.

<constraint>
Single-agent sequential. Execute the phases IN ORDER, in THIS context. There is no parallel fan-out or subagent dispatch — those are runtime-specific and not portable. Before running each phase, read its `references/<phase>.md` and apply it. Append each phase's output to the plan file under the exact heading shown, as you finish it, so a mid-run compaction can resume by re-reading the file.
</constraint>

<constraint>
Agents are emitted in BOTH formats, on every runtime. Phases 4a/4b/5 draft each logical agent as a Claude `.claude/agents/*.md` AND a Codex `.codex/agents/*.toml` (field-by-field translation in `references/codex-agents-builder.md`). Do NOT skip the agent track by runtime — a project bootstrapped here must work in both tools. Mind dispatch DEPTH: an agent whose Claude `tools` include `Agent` (single-level inter-agent dispatch) DOES port — Codex allows a direct child agent by default (`agents.max_depth: 1`), so emit the `.toml` and route delegation to a built-in `worker`/`explorer` child. Only agents that need their children to spawn further (depth ≥ 2) exceed the default cap — note that `agents.max_depth` must be raised, rather than calling them unportable.
</constraint>

<constraint>
Approval via the plan lifecycle, not Plan Mode. Write the full skills/agents plan to a `docs/plans/` file and surface it — do NOT call `ExitPlanMode` (Claude-only). Tell the user: "review and say `start <slug>` to implement." Implementation (Phase 8) runs only after the user starts the plan. If `docs/plans/` is absent, run `plan-init` first.
</constraint>

## When to use

- Standing up `.claude/skills/` in a project that has none, or auditing existing skills for drift.
- After a refactor changed documented patterns and skills need a refresh.
- When skill descriptions stopped triggering (CSO drift) or a SKILL.md outgrew its size budget.

## When NOT to use

| Situation | Use instead |
|---|---|
| README / AGENTS.md / CLAUDE.md / prose docs | `human-docs-workflow` |
| Writing one skill by hand | `write-skill` |
| Multi-tool AGENTS.md ↔ skills symlink bridging | `multi-tool-bridge` |
| Security / refactor analysis | `security` / `refactor` |

## Pipeline

Run in order. Each phase reads its reference, then writes output under the exact heading (the resume anchor — keep verbatim). Phase 0 is inline (no reference).

| # | Phase | Reference | Output heading | Runtime |
|---|---|---|---|---|
| 0 | State detection (counts, today) | — | `## Phase 0: State` | all |
| 1 | Exploration (profile, enumerate skills/agents, knowledge areas) | `references/explorer.md` | `## Phase 1: Exploration Results` | all |
| 2a | Skills categorization (the delta) | `references/categorizer.md` | `## Phase 2a: Categorizer Proposals` | all |
| 2c | Content-accuracy audit (every ref/snippet/identifier vs current source) | `references/content-auditor.md` | `## Phase 2c: Content-Accuracy Audit` | all |
| 2b | Pattern scan (file:line evidence) | `references/pattern-scanner.md` | `## Phase 2b: Pattern Scanner Findings` | all |
| 3 | Skills builder (draft SKILL.md + references/) | `references/skills-builder.md` | `## Phase 3: Skills Plan` | all |
| 4a | Agent role mapping | `references/role-mapper.md` | `## Phase 4a: Role Mapper Proposals` | all |
| 4b | Agent pattern extraction | `references/pattern-extractor.md` | `## Phase 4b: Pattern Extractor Content` | all |
| 5 | Agents builder (draft `.md` + `.toml`) | `references/agents-builder.md` + `references/codex-agents-builder.md` | `## Phase 5: Agents Plan` | all |
| 6 | Verification (skills + agents + cross-layer) | `references/verifier.md` | `## Phase 6: Verification` | all |

## How to run each phase

1. Anchor the date once (`date "+%Y-%m-%d"`) and record scope (a path argument, or the whole project).
2. **Phase 0** (inline): count `.agents/skills/*/SKILL.md`, `.claude/skills/*/SKILL.md`, `.claude/agents/*.md`, and `.codex/agents/*.toml`; note whether a local `skill-maintenance` exists and whether plugin `docks:skill-maintenance` is available (a stale local copy is flagged for REMOVAL in Phase 2a, not regenerated); write the counts + today under `## Phase 0: State`.
3. Create/open the plan file (see below). Run Phases 1→2a→2c→2b→3. **Phase 2c is mandatory and always runs** — it audits every existing skill and agent claim against current source (ignoring git history and `metadata.updated`); write its table even when all-clean, never skip. After 2c, **reconcile**: amend the `## Phase 2a` block in place to escalate each non-CLEAN skill to REFRESH/REWRITE (`→ escalated by 2c: …`), and route each non-CLEAN agent to the Phase 5 regenerate list — so the gate reads one delta.
4. **Agent track:** run Phases 4a→4b→5 on every runtime — they draft each agent in both `.claude/agents/*.md` and `.codex/agents/*.toml` form.
5. Run Phase 6 (verifier). It validates skills and BOTH agent formats, plus cross-layer integrity.
6. Before starting each phase, confirm the prior heading is present. If a phase found nothing, write "no changes" under its heading — never silently skip.
7. After Phase 6, present the plan (see Gate).

## The plan file (IPC + deliverable)

One Markdown file holds the whole run — inter-phase memory and the implementation spec.

```text
docs/plans/planned/<YYYYMMDD>-skills-audit.md   (tracked by plan-manager)
```

Write as you go — never hold all phase output in context and dump at the end. Downstream phases locate prior output by grepping for the headings above.

## Skill description quality (Phase 2a / 3)

Every proposed description starts `Use when…`, is valid YAML when parsed as frontmatter, is ≤1024 chars, contains no angle brackets, and carries ≥5 identifiers specific to THIS project — exported names, config keys, env vars, error types, CLI commands, route patterns. Quote descriptions by default. Generic phrases ("module boundaries", "error handling") count for nothing.

| | Example |
|---|---|
| BAD | "Use when working with the API and database operations in the project." |
| GOOD | "Use when editing `routes/checkout.ts`, touching the `STRIPE_WEBHOOK_SECRET` env var, handling the `CartExpiredError`, or running `pnpm seed:orders` — covers the order-state machine and idempotency keys." |

## Gate + implementation

Phases 1–6 are read-only. After Phase 6:

1. Write the Skills delta + Agents delta + cross-layer summary + every file to create/modify/delete into the plan file.
2. Surface it: report the counts and tell the user "review `docs/plans/planned/<slug>.md` and say `start <slug>` to implement."
3. On `start`, run **Phase 8 — Implementation**: write the SKILL.md + `references/` files and the agent files in BOTH `.claude/agents/*.md` and `.codex/agents/*.toml` form; for regenerated agents AND any SKILL.md being split into `references/`, back up the original first (`<name>.md.bak`, plus each new `references/*.md` for a split) and copy relocated prose **verbatim** (reformat OK, reword NOT); apply any 1024-char description fixes flagged in Phase 2a; if a stale local `skill-maintenance` was flagged, `git rm` it after explicit user approval (the plugin `docks:skill-maintenance` already covers both Codex and Claude). Bump `metadata.updated` only on real content change. If the project documents a `metadata.content_hash` contract and the matching tool exists, run that project's documented hash-sync command; otherwise leave hashes absent/untouched and do not report missing Docks tooling.
4. Do NOT touch `AGENTS.md` / `CLAUDE.md` here — that is the `multi-tool-bridge` skill's job.

## References

| Read before running | File | Runtime |
|---|---|---|
| Phase 1 — profile, enumerate skills/agents, knowledge areas | `references/explorer.md` | all |
| Phase 2a — the skill-set delta (create/update/split/merge/refresh) | `references/categorizer.md` | all |
| Phase 2c — content-accuracy audit of every existing claim vs current source | `references/content-auditor.md` | all |
| Phase 2b — codebase pattern extraction with file:line | `references/pattern-scanner.md` | all |
| Phase 3 — draft SKILL.md bodies + references/ splits | `references/skills-builder.md` | all |
| Phase 4a — map skills → agent roles | `references/role-mapper.md` | all |
| Phase 4b — extract per-agent system-prompt content | `references/pattern-extractor.md` | all |
| Phase 5 — draft Claude agent files (`.md`) | `references/agents-builder.md` | all |
| Phase 5 — translate each agent to Codex (`.toml`) | `references/codex-agents-builder.md` | all |
| Phase 6 — validate skills, agents, cross-layer integrity | `references/verifier.md` | all |

## Verification (Phase 6 + after any SKILL.md split — fail loud)

Splitting a `SKILL.md` into `references/` is a content transform — guard against silent loss with **per-section presence**, not a byte-percentage (the split adds pointers, so output ≥ input).

```bash
# before splitting:  cp <skill>/SKILL.md /tmp/skill.before
# every original section heading must survive across the new SKILL.md + references/
while IFS= read -r h; do
  grep -rqF "$h" <skill>/SKILL.md <skill>/references/ || echo "LOST SECTION: $h"
done < <(grep -E '^#{1,3} ' /tmp/skill.before)
# line-parity tripwire: relocated content is verbatim, so the sum must not shrink
before=$(wc -l < /tmp/skill.before)
after=$(cat <skill>/SKILL.md <skill>/references/*.md | wc -l)
awk -v b="$before" -v a="$after" 'BEGIN{ if (a < b) print "NET SHRINK after split — content dropped" }'
```

Any `LOST SECTION` / `NET SHRINK` line ⇒ restore from `/tmp/skill.before`, locate the content; no content loss across the split. Phase 6's verifier (`references/verifier.md`) runs this for every split skill.

## Gotchas

| Gotcha | Consequence | Right move |
|---|---|---|
| Calling an `Agent`-dispatching agent unportable to Codex | Codex allows one dispatch level by default (`agents.max_depth: 1`), so single-level dispatch ports | Emit BOTH files; route delegation to a Codex `worker`/`explorer` child; flag only deeper-than-1 nesting (raise `agents.max_depth`) |
| A pre-existing skill's description exceeds 1024 chars | Codex silently skips the whole skill | Phase 2a flags it `rewrite-description`; Phase 6 hard-fails until fixed |
| Implementing before the user starts the plan | Writes files the user never approved | Gate on `start <slug>`; Phases 1–6 are read-only |
| Bumping `metadata.updated` on a no-op regeneration | Timestamp churn; defeats staleness triage | Bump only on real content change; sync hashes only when the current project documents that contract |
| Declaring a skill accurate from a git-delta or a 5-ref spot-check | Pre-baseline drift and fictional APIs ship unseen | Phase 2c opens EVERY ref/snippet/identifier vs current source and states the count verified; `metadata.updated` is not accuracy evidence |
| SKILL.md body crossing 310 lines | Overflow dropped after compaction; verifier hard-fails | Split detail into `references/<topic>.md` (30–150 lines) |
| Unquoted `description:` contains `: ` or `#` | Codex skips the skill with invalid YAML or silently truncated description | Quote every generated description |
| Agent skill-references pointing at pre-split paths | Agents land with broken references | Phase 4–5 must reference Phase 3's proposed paths, not old ones |
| Editing AGENTS.md / CLAUDE.md from this pipeline | Scope bleed; clobbers cross-tool config | Use the `multi-tool-bridge` skill for those |
