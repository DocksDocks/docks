---
title: optional codex + claude cross-check in the plan lifecycle
goal: Teach plan-manager and plan-review to offer an optional cross-tool second opinion — "review this plan with codex + claude?" — via the native question picker, gated on the Codex CLI being installed and logged in, dispatching a pinned-model Codex review (gpt-5.5 xhigh, read-only) alongside the Claude-side review and merging attributed findings back into the plan.
status: planned
created: "2026-07-06T19:33:07-03:00"
updated: "2026-07-06T19:43:19-03:00"
started_at: null
assignee: null
tags: [docks, plan-manager, plan-review, codex, cross-check]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - docs/plans/AGENTS.md
related_plans: [relay-spawn-model-discipline]
review_status: null
planned_at_commit: "fc76121f985d1503e41930f9acdfb6d745d0eb5f"
---

# optional codex + claude cross-check in the plan lifecycle

## Goal

Plan reviews today are single-model: the drafting Claude self-reviews, and plan-review (Mode 0 draft red-team or completion review) runs on the same tool family. Add an **optional, user-gated** cross-tool pass: when the Codex CLI is available and authenticated, the plan machinery offers "cross-check this plan with codex + claude?" through the native picker; on yes, a **pinned-model** Codex reviewer (gpt-5.5, `model_reasoning_effort=xhigh`, read-only sandbox) reviews the same plan independently, and its findings land in the plan **attributed** (`[codex]` / `[claude]`) so disagreements surface instead of averaging away.

## Context & rationale

- **User request 2026-07-06** (follow-up to [[relay-spawn-model-discipline]]): "could it be added to plan-manager reviews as well? … before starting the plan we can ask 'want to review the plan with codex + claude'".
- **Availability gate, verified live 2026-07-06**: `command -v codex` + `codex login status` → prints `Logged in using ChatGPT`, exit 0 when authenticated. Both checks are cheap and offline. If either fails, the offer is silently skipped — never error, never mention codex.
- **Billing**: `codex exec` runs under the ChatGPT login — subscription pool, no API key (consistent with the machine's subscription-only billing rule).
- **Pinned model, never inherited**: the Codex leg always passes `-m gpt-5.5 -c model_reasoning_effort=xhigh -s read-only` explicitly — same never-inherit discipline as [[relay-spawn-model-discipline]].
- **Consumer-safety (shipped-skill constraints)**: plan-manager/plan-review ship to consumer repos. The crosscheck wording must (a) reference Codex generically and degrade gracefully when absent; (b) name **no docks author scripts**; (c) use durable anchors only (no `path:NN`); (d) keep the offer wording readable as plain prose for the Codex runtime (which reads bodies as plain markdown). In the Codex runtime the picker is `ask_user_question`; the reverse direction (Codex session cross-checking with Claude) uses `claude -p --model opus --effort max` one-shot, gated on `command -v claude`.
- **Return-only contract preserved**: for draft reviews, plan-manager stays the sole writer — the Codex reviewer's stdout is ingested by the orchestrating agent and recorded into `## Self-review` (draft) or merged into the `## Review` block (completion), attributed per finding. plan-review's "idempotent replace" and "per-finding reproduction" constraints apply unchanged; a codex-attributed finding that fails reproduction is dropped like any other.
- **Four-home contract sync** (per `plugins/docks/skills/AGENTS.md`): if the crosscheck changes the plans contract (new attributed-findings format in `## Self-review`/`## Review`), the same change lands in plan-manager, plan-review, this repo's `docs/plans/AGENTS.md`, AND plan-init's `references/plans-agents-md-template.md` in the same commit.
- **User decisions (picker, 2026-07-06)**: (1) **Offer point: on `start <slug>`** (pre-execution) **+ on-demand** "cross-check <slug>" anytime. (2) **Review form: one-shot `codex exec`** — orchestrator merges attributed findings; NO session-relay dependency, so this plan does not wait on [[relay-spawn-model-discipline]]. (3) **Completion review also gets the offer** — when plan-manager Step 8 dispatches the completion review with codex available, ask "include a codex second opinion?" in the same picker turn.

## Environment & how-to-run

- Repo `/home/docks/projects/docks`, branch `main`. Gate: `node scripts/ci.mjs --plugin docks` (author-side; skills scorer floor: productivity 8, aim 14+; structural guard + no-author-scripts + durable-anchors + trigger-collision all run inside it).
- Skill hash after edits: `node scripts/skills/content-hash.mjs --backfill plugins/docks/skills` (author-side only — never named inside the shipped bodies).
- Codex leg smoke (also the acceptance probe): `codex exec -s read-only -m gpt-5.5 -c model_reasoning_effort=xhigh --skip-git-repo-check -- "Reply with exactly: ok"` → exit 0, prints `ok` (verified 2026-07-06).
- Release: docks is at 0.11.0 (`plugins/docks/.claude-plugin/plugin.json`); ship as docks minor via `node scripts/release.mjs --plugin docks minor` after ci green.

## Steps

| # | Step | Status |
|---|---|---|
| 1 | `plan-manager/SKILL.md`: crosscheck offer (a) on `start <slug>` before dispatch, (b) on-demand via a "cross-check <slug>" intent row in Step 1's table, (c) alongside the Step-8 completion-review dispatch — availability gate (`command -v codex` + `codex login status`, generic wording), picker question, one-shot Codex leg per the Interfaces block, ingest of attributed findings into `## Self-review` (plan-manager remains sole writer); bump `metadata.updated` | todo |
| 2 | `plan-review/SKILL.md`: add a `## Cross-tool second opinion` section — one-shot leg only (no bus), how a crosscheck finding is verified (per-finding reproduction applies), how attribution renders in the `## Review` block for completion reviews, and the reverse (Codex-runtime) leg using `claude -p --model opus --effort max`; bump `metadata.updated` | todo |
| 3 | Contract sync: mirror the attributed-findings format into `docs/plans/AGENTS.md` and `plan-init/references/plans-agents-md-template.md` (same commit as steps 1–2 if format changes; else record `N/A — no contract change`) | todo |
| 4 | Refresh skill content hashes (author-side backfill), run the docks CI gate green — scorer floors hold, no-author-scripts + durable-anchors + collision guards pass | todo |
| 5 | Live smoke: run the crosscheck end-to-end on a real draft plan in this repo (offer → yes → codex leg returns findings → attributed ingest) and paste the resulting `## Self-review` excerpt into this plan's `## Notes` | todo |
| 6 | Release docks minor; verify manifest lockstep (`.claude-plugin` + `.codex-plugin` + marketplace catalogs) | todo |

## Interfaces & data shapes

Codex review leg (one-shot form — decided):

```bash
codex exec -s read-only -m gpt-5.5 -c model_reasoning_effort=xhigh \
  --skip-git-repo-check -- "You are an independent plan reviewer. Read the plan below and red-team it: [rubric summary]. Return findings as a markdown list, each with severity and the plan line it targets. PLAN: <plan body inlined>"
```

Attributed ingest format (draft example, exact shape decided in step 1):

```markdown
## Self-review
Score: 88/100 · …
Cross-check (2026-07-06): [codex gpt-5.5 xhigh] 2 findings — <one-line each, accepted/rejected+why>; [claude] concurred on 1, disputed 1 (kept: <decision>).
```

Offer gate pseudocode (skill prose, tool-generic): available = codex on PATH AND `codex login status` exits 0 → ask via native picker; unavailable → skip silently.

## Acceptance criteria

- With codex present + logged in: the chosen offer point asks via the picker; declining changes nothing; accepting produces a crosscheck line in the target plan attributing findings per tool. Verified live in step 5 with pasted output.
- With codex absent (`PATH` without codex): no offer, no error, no codex mention — verify by running the same flow with `PATH` stripped of codex.
- `codex exec -s read-only -m gpt-5.5 -c model_reasoning_effort=xhigh --skip-git-repo-check -- "Reply with exactly: ok"` → `ok` (leg-liveness probe).
- Docks CI gate green; both edited skills still score ≥14; no shipped body names an author script or a `path:NN` anchor.
- Release tag for docks minor exists; versions in lockstep.

## Out of scope / do-NOT-touch

- No changes to the session-relay plugin here (that's [[relay-spawn-model-discipline]]).
- No auto-run: the crosscheck NEVER fires without an explicit picker yes — "if authorized" is the user's answer, per request.
- No new agents; no changes to `plugins/docks/agents/*` wrappers beyond what the skill bodies already imply.
- Personal model rankings stay out of shipped skills (dated-example rule from plan 1 applies).

## Cold-handoff checklist

- [x] File manifest with exact paths — Steps + affected_paths
- [x] Environment & commands with flags — Environment (verified codex probe, ci gate, release)
- [x] Interface/data contracts — codex leg command + attributed ingest format
- [x] Executable acceptance — liveness probe, PATH-stripped negative test, CI gate
- [x] Out-of-scope — above
- [x] Decision rationale — Context (gate, billing, return-only, four-home sync, conditional dependency)
- [x] Known gotchas — consumer-safety constraints (no author scripts, durable anchors, plain-prose for Codex runtime); silent-skip when unavailable
- [x] Global constraints verbatim — four-home sync quoted; shipped-body rules referenced to their source node
- [x] No undefined/forward terms — open questions cover the two undecided shapes

## Self-review

Score: 86/100 · trajectory 86 · stopped: single pass (6 steps, no risk-flagged step, first score ≥85). All three open questions answered via picker 2026-07-06 (all recommended options) and encoded into Context/Steps — none remain.

## Review

(placeholder — completion review writes here)
