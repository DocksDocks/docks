---
title: Bootstrap Codex plan agents
goal: Add Codex repo-local plan-agent bootstrap support without changing Claude plugin subagent behavior.
status: ongoing
created: "2026-06-23T20:15:44-03:00"
updated: "2026-06-23T20:17:14-03:00"
started_at: "2026-06-23T20:17:14-03:00"
assignee: null
tags: [codex, plans, agents, scaffold]
affected_paths:
  - AGENTS.md
  - README.md
  - plugins/docks/README.md
  - .codex/agents/plan-manager.toml
  - .codex/agents/plan-review.toml
  - docs/scaffold/spec.yaml
  - docs/scaffold/templates/codex-plan-manager.toml.template
  - docs/scaffold/templates/codex-plan-review.toml.template
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/scaffold/SKILL.md
  - plugins/docks/skills/productivity/scaffold/references/spec-schema.md
related_plans: [codex-plan-agents]
review_status: null
planned_at_commit: "793889afd056bc141a73c6e315136d33a684e41f"
---

# Bootstrap Codex Plan Agents

## Goal

Make `plan-init` and greenfield scaffolded Docks-style projects create thin project-local Codex wrappers for `plan-manager` and `plan-review`, while keeping the installable plugin's shipped subagents Claude-only and preserving the cross-tool skills as the source of truth.

## Context

- The user asked to adapt bootstrap scripts like `plan-init`, include Codex invocations for `plan-manager` / `plan-review`, research other skills that create agents, and check whether skills.sh listing is possible.
- The current worktree already contains partial repo-local Codex wrappers and root `AGENTS.md` wording from the prior pass; this plan adopts and finishes that work instead of replacing it.
- Current Codex docs say subagents are enabled by default, project custom agents live under `.codex/agents/`, and Codex spawns subagents only when explicitly asked. That means bootstrap can create agents, but skill instructions must still gate actual dispatch on explicit delegation or runtime policy.
- The existing `skill-agent-pipeline` already creates `.claude/agents/*.md` plus `.codex/agents/*.toml`; `multi-tool-bridge` deliberately does not auto-convert Claude agents. This work should not broaden that behavior beyond plan lifecycle defaults.
- skills.sh inclusion looks possible later through the public curated list and CLI ecosystem, but contribution guidance requires a public working repo with documentation and real community usage. This change should not submit an external PR or add install claims that have not been verified for Docks.

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | Tighten the existing repo-local `.codex/agents/plan-manager.toml` and `plan-review.toml` wrappers so they are thin, explicit-delegation wrappers around the canonical skills. Done when both files parse as TOML and do not duplicate full skill bodies. | - | planned |
| 2 | Teach `plan-init` to seed missing default Codex plan-agent wrappers alongside `docs/plans/`, while preserving idempotency, migration behavior, and the plugin/consumer boundary. Done when the skill tells agents exactly which files to create and when to skip existing custom files. | 1 | planned |
| 3 | Update the docs/plans template plus `plan-manager` and `plan-review` skills so review dispatch resolves Claude agents or Codex project agents, then falls back to inline skill execution when no explicit delegation or resolved agent exists. Done when the lifecycle text no longer implies Codex must use skills only. | 2 | planned |
| 4 | Update scaffold support for greenfield Docks-style projects to include Codex plan-agent templates. Done when `docs/scaffold/spec.yaml`, schema docs, and scaffold skill text describe/render `.codex/agents/*.toml` without changing plugin manifests. | 2 | planned |
| 5 | Refresh root and plugin READMEs to distinguish Claude plugin-shipped agents from repo-local/generated Codex agents, and remove stale "Codex skills cannot dispatch subagents" wording. Done when public docs match the verified Codex behavior. | 3 | planned |
| 6 | Refresh content hashes for changed shipped skills and run the scaffold guards plus full CI. Done when `node scripts/scaffold/guard-spec.mjs`, `node scripts/scaffold/test.mjs`, and `node scripts/ci.mjs` exit 0. | 1-5 | planned |

## Acceptance criteria

- [ ] This repo has `.codex/agents/plan-manager.toml` and `.codex/agents/plan-review.toml`, and scaffold templates can create the same defaults in new repos.
- [ ] No plugin manifest starts shipping Codex agents; Claude plugin agents remain under `plugins/docks/agents/`.
- [ ] `plan-init` instructions seed only missing default Codex plan-agent files and avoid overwriting project-customized agents.
- [ ] `docs/plans` template, `plan-manager`, and `plan-review` describe Codex agent dispatch with explicit permission or policy and inline fallback.
- [ ] Root and plugin READMEs no longer say Codex cannot dispatch subagents; they state the plugin boundary accurately.
- [ ] `node scripts/scaffold/guard-spec.mjs`, `node scripts/scaffold/test.mjs`, and `node scripts/ci.mjs` pass.

## Out of scope

- Submitting Docks to skills.sh / awesome-agent-skills in this change; that is an external publishing decision and depends on the repo satisfying their public/maturity criteria.
- Changing Claude plugin subagent files or adding Codex agents to plugin manifests.
- Autonomously spawning Codex subagents during this implementation; current policy still requires explicit delegation.

## STOP conditions

- If scaffold rendering makes a fresh seed fail its own `scripts/ci.mjs`, stop and fix the seed instead of loosening scaffold guards.
- If a validator rejects `.codex/agents/*.toml` as an output location, stop before changing plugin manifest behavior.
- If current Codex docs conflict with the assumed custom-agent TOML fields, stop and update the plan before editing more files.

## Self-review

Score: 92/100 · trajectory 92 · stopped: first pass above threshold.

- Actionability 19/20: every step has a concrete done-condition.
- Dependency order 15/15: agent templates precede bootstrap docs, which precede public docs and validation.
- Evidence re-verify 14/15: local files and current external docs were inspected this session; exact validation commands are named.
- Goal coverage 14/15: covers plan-init, scaffold, invocation wording, and skills.sh research while preserving Claude compatibility.
- Checkable acceptance 10/10: executable validation commands are listed.
- Failure mode 12/15: STOP conditions cover scaffold, validator, and docs drift risks.
- Assumption to question 8/10: skills.sh submission is intentionally out of scope rather than left as a silent implementation decision.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/docks/skills/productivity/plan-init/SKILL.md:53` shows current idempotent detection for the active/finished plans model.
- `plugins/docks/skills/productivity/plan-init/SKILL.md:84` shows the current greenfield bootstrap step that should grow Codex-agent seeding.
- `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md:181` shows completion review currently auto-dispatches `plan-review`.
- `plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md:20` shows the existing Docks skill that emits both Claude and Codex agent formats.
- `plugins/docks/skills/productivity/scaffold/SKILL.md:82` shows scaffold seed mode already delegates `docs/plans/` population through bundled `plan-init`.
- `plugins/docks/skills/productivity/scaffold/references/spec-schema.md:38` shows templated files are rendered to arbitrary output paths, which fits `.codex/agents/*.toml`.
- `scripts/scaffold/test.mjs:33` and `scripts/scaffold/test.mjs:38` show scaffold tests render both templated files and tree nodes.
- `README.md:51` and `plugins/docks/README.md:63` contain stale wording that Codex only uses skills directly or cannot dispatch subagents.
- `.codex/agents/plan-manager.toml:1` and `.codex/agents/plan-review.toml:1` show the current partial repo-local wrappers.
- OpenAI Codex manual, current cached copy: subagents enabled by default, project agents under `.codex/agents/`, explicit user request required for spawning.
- skills.sh homepage/docs and awesome-agent-skills CONTRIBUTING: Codex is a supported skill path, the CLI ecosystem exists, but listings are curated, unaudited, and require a public working skill repo with maturity/community usage.
