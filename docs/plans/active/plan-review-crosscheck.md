---
title: optional codex + claude cross-check in the plan lifecycle
goal: Teach plan-manager and plan-review to offer an optional cross-tool second opinion — "review this plan with codex + claude?" — via the native question picker, gated on the Codex CLI being installed and logged in, dispatching a pinned-model Codex review (gpt-5.5 xhigh, read-only) alongside the Claude-side review and merging attributed findings back into the plan.
status: ongoing
created: "2026-07-06T19:33:07-03:00"
updated: "2026-07-06T22:06:10-03:00"
started_at: "2026-07-06T22:00:26-03:00"
assignee: crosscheck-worker (codex, via session-relay)
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
- **Consumer-safety (shipped-skill constraints)**: plan-manager/plan-review ship to consumer repos. The crosscheck wording must (a) reference Codex generically and degrade gracefully when absent; (b) name **no docks author scripts**; (c) use durable anchors only (no `path:NN`); (d) keep the offer wording readable as plain prose for the Codex runtime (which reads bodies as plain markdown). In the Codex runtime the picker is `ask_user_question`; the reverse direction (Codex session cross-checking with Claude) uses `claude -p --model opus --effort max` one-shot, gated on `command -v claude` — **live-verified 2026-07-06** (returned `ok`).
- **Shell-safety decision (draft-review finding, 2026-07-06)**: plan bodies contain backticks, `$`, and quotes — they are NEVER inlined into a shell argument. The reviewer leg receives the plan's file path and reads it itself (read-only sandbox); the rubric text is fixed verbatim in Interfaces. `--skip-git-repo-check` rides the codex leg only when invoked outside a git repo (consumer scratch contexts); inside a repo it is unnecessary but harmless.
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
| 1 | `plan-manager/SKILL.md`: crosscheck offer (a) on `start <slug>` before dispatch, (b) on-demand via a "cross-check <slug>" intent row in Step 1's table, (c) alongside the Step-8 completion-review dispatch — availability gate (`command -v codex` + `codex login status`, generic wording), picker question, one-shot Codex leg per the Interfaces block, ingest of attributed findings into `## Self-review` (plan-manager remains sole writer); bump `metadata.updated` | done |
| 2 | `plan-review/SKILL.md`: add a `## Cross-tool second opinion` section — one-shot leg only (no bus), how a crosscheck finding is verified (per-finding reproduction applies), how attribution renders in the `## Review` block for completion reviews, and the reverse (Codex-runtime) leg using `claude -p --model opus --effort max`; bump `metadata.updated` | done |
| 3 | Contract sync — **unconditional** (steps 1–2 introduce a new attributed-findings format, so the four-home rule is already triggered): mirror the pinned format from Interfaces verbatim into `docs/plans/AGENTS.md` and `plan-init/references/plans-agents-md-template.md`, same commit as steps 1–2 | done |
| 4 | Refresh skill content hashes (author-side backfill), run the docks CI gate green — scorer floors hold, no-author-scripts + durable-anchors + collision guards pass | done |
| 5 | Live smoke: run the crosscheck end-to-end on a real draft plan in this repo (offer → yes → codex leg returns findings → attributed ingest) and paste the resulting `## Self-review` excerpt into this plan's `## Notes` | todo |
| 6 | Release docks minor; verify manifest lockstep (`.claude-plugin` + `.codex-plugin` + marketplace catalogs) | todo |

## Interfaces & data shapes

Codex review leg — the plan is passed by **file path, never inlined** (the read-only sandbox reads it directly; this sidesteps all shell-escaping of plan bodies and matches the live run that validated this pattern on 2026-07-06). The rubric text is FIXED verbatim below; run from the repo root:

```bash
timeout 600 codex exec -s read-only -m gpt-5.5 -c model_reasoning_effort=xhigh -- \
  "You are an independent plan reviewer red-teaming a draft before execution. Read <plan path> fully, plus any file it cites in affected_paths. Red-team it: (1) missed failure modes, wrong assumptions, cheaper alternatives; (2) steps whose done-condition is vague or unverifiable; (3) anything a cold executor with only this file would have to guess. Do NOT rewrite the plan. Return a numbered findings list — severity (high/med/low), section, one-sentence defect, one-sentence fix — and end with a one-line verdict."
```

(`-s read-only` makes file writes impossible; the fixed `-m`/`-c` pins are the never-inherit discipline from [[relay-spawn-model-discipline]], written as a dated 2026-07 recommendation — consumer skills carry the "check your own tier list" caveat so staleness is visible.)

Reverse leg (Codex-runtime session cross-checking with Claude), live-verified 2026-07-06 (`claude -p --model opus --effort max -- "Reply with exactly: ok"` → `ok`):

```bash
timeout 600 claude -p --model opus --effort max -- "<same fixed rubric text + plan path>"
```

Attributed ingest format — **pinned now, verbatim into all four contract homes** (step 3):

```markdown
Cross-check (<YYYY-MM-DD>): [codex <model> <effort>] <N> findings (<sev breakdown>) — <accepted count> accepted, <rejected count> rejected (one-line reason each); [claude] independently verified <finding ids> against source before accepting.
DISAGREEMENT: <topic> — [codex] <position> / [claude] <position>. Kept: <choice> — decided by <the orchestrating agent | user via picker>, because <one line>.
```

- Draft reviews: these lines append inside `## Self-review`. Completion reviews: a `- **Cross-check:** …` bullet inside the `## Review` block (same line grammar).
- **Reconciliation rule**: both positions are always retained and attributed; a disagreement is never silently dropped or averaged. The orchestrating agent decides and names itself; if the disagreement changes scope, behavior, or a user-made decision, it escalates via the native picker instead.

Offer gate (skill prose, tool-generic): available = codex on PATH AND `codex login status` exits 0 → ask via native picker; unavailable → skip silently. On `start <slug>`: ask → (if yes) run the leg + ingest → THEN dispatch the executor — the crosscheck completes before execution begins.

## STOP conditions

- Codex leg errors, times out (600s), or returns unparseable output AFTER the user accepted → record `Cross-check attempted <date>: codex leg failed (<one-line reason>)` in the plan, continue with the Claude-only review, and NEVER block the lifecycle transition on the failed leg.
- Same rule mirrored for the reverse (claude) leg in a Codex runtime.
- `codex login status` non-zero at offer time → no offer, no error, no codex mention (silent skip is the designed path, not a failure).

## Acceptance criteria

- With codex present + logged in: the chosen offer point asks via the picker; declining changes nothing; accepting produces a crosscheck line in the target plan attributing findings per tool. Verified live in step 5 with pasted output — this positive check is environment-gated (needs codex + login); later executors READ step 5's pasted evidence rather than re-running it.
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
- [x] Interface/data contracts — codex + claude leg commands with fixed rubric text, pinned attributed-line grammar, reconciliation rule
- [x] Executable acceptance — liveness probes both legs, PATH-stripped negative test, CI gate; env-gated positive check flagged as read-the-evidence
- [x] Out-of-scope — above
- [x] Decision rationale — Context (gate, billing, return-only, four-home sync, shell-safety file-path decision)
- [x] Known gotchas — shell-escaping of plan bodies (file-path pattern, never inline), consumer-safety constraints, silent-skip when unavailable, STOP conditions for a failing accepted leg
- [x] Global constraints verbatim — four-home sync quoted; shipped-body rules referenced to their source node
- [x] No undefined/forward terms — findings format, rubric text, and reconciliation are pinned in Interfaces; nothing deferred to execution

## Self-review

Score: 88/100 · trajectory 86→69→88 · stopped: post-external-review rewrite (initial self 86; fresh-context draft review scored 69 with 10 findings; all addressed).
Cross-check (2026-07-06): [claude plan-review, fresh context] 10 findings (3 high / 4 med / 3 low) — ALL accepted: attributed-line grammar + rubric text pinned verbatim (1, 2), plan passed by file path never shell-inlined (2), `## STOP conditions` added for accepted-then-failing legs (3), reverse claude leg live-probed → `ok` (4), step 3 made unconditional (5), reconciliation rule with named decision-maker + picker escalation (6), risk mis-tiering acknowledged — this external pass was the correction (7), model pins kept but framed as dated recommendations with staleness caveat (8), env-gated acceptance flagged read-not-rerun (9), `--skip-git-repo-check` rationale + offer-before-dispatch ordering stated (10). Earlier picker decisions (offer points, one-shot form, completion-too) unchanged.

## Review

(placeholder — completion review writes here)
