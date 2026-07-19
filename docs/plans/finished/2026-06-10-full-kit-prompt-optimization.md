---
title: Optimize all skill prompts, harden validator scripts, revalidate kit
goal: Every shipped skill + reference audited and improved (CSO, facts, structure), validator scripts hardened, all guards/scorers green, queued codex-mirror plan shipped
status: finished
created: "2026-06-10T05:31:43+00:00"
updated: "2026-06-10T06:07:27+00:00"
started_at: "2026-06-10T05:31:43+00:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: 0027054823454ef3dcf15e1852e4a3bb62e66139
tags: [skills, scripts, audit, quality]
affected_paths:
  - plugins/docks/skills/
  - scripts/
  - .agents/skills/codex-plugin-mirror/SKILL.md
  - docs/plans/
related_plans: [20260610-codex-mirror-native-manifest-note, 2026-06-10-capability-tuning-research-rollout]
review_status: passed
---

# Optimize all skill prompts, harden validator scripts, revalidate kit

## Goal

Auto-mode full-kit pass (user /goal): (1) audit every shipped skill body + references for prompt quality — CSO descriptions, factual drift, constraint placement, slop, cross-tool wording, structure rewards — and apply improvements; (2) review validator scripts (guards/scorers/ci) for hardening and tooling gaps and apply safe upgrades; (3) revalidate everything (guards + scorers + plugin validate green); (4) execute the queued codex-mirror-native-manifest-note plan as part of the skill-review sweep.

## Context

Follows the capability-tuning research rollout (d1ded75). Baseline at start: 27 shipped skills scoring 8–16 (floors eng 10 / prod 8); low scorers caveman 8, zoom-out 9, make-interfaces-feel-better 10 (vendored — body frozen), lint-no-suppressions 13, write-skill 14. Three sub-80-line bodies lose the 2-pt sweet-spot reward legitimately fixable with real content (gotchas, BAD/GOOD).

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Fan out 3 read-only audits: engineering skills, productivity skills, scripts | — | 3-way | done | engineering by agent; productivity + scripts in-context after agent kills |
| 2 | Implement queued codex-mirror-native-manifest-note plan (start → ship) | — | with #1 | done | main |
| 3 | Apply per-skill prompt improvements from audit findings (evidence-gated) | 1 | — | done | main |
| 4 | Apply script/guard hardening from audit findings (no floor-loosening) | 1 | — | done | main |
| 5 | Bump metadata.updated + content-hash backfill for every meaning-changed skill | 3 | — | done | main |
| 6 | Full revalidation: ci.sh green, per-file scores ≥ baseline, commit + push | 4, 5 | — | done | main |

### Step details

- #3 engineering (commit 8d41f52): factual drift killed (tokio-2.x fabrication, Tailwind v4 auto-scan, useEffectEvent experimental, #private-on-objects, PEP-661 misattribution, non-compiling dyn-async Rust example, uv pip audit), retired-architecture refs (/security parallel scanners, /refactor command) replaced across 7 sites, three approval gates rephrased to the enforceable turn-ending form, security skill's constraint contradiction removed, lint-no-suppressions enriched (BAD/GOOD fence, bare-suppression scope gotchas, Rust #[expect]) 13→16, two descriptions trimmed under 500.
- #3 productivity (this commit): plan-init + skill-agent-pipeline descriptions trimmed ≤500 (15→16 each), write-skill third constraint (bookkeeping rule) 14→16, zoom-out 7-module-cap constraint + situation→output-form table + BAD/GOOD + tagged fences 9→16, caveman persistence constraint + rules table + BAD/GOOD labels 8→12 (stays sub-16 by design — brevity skill, padding defeats it). Remaining productivity skills: deep-read or spot-swept; no stale facts found (recent dedicated sweeps 05-28 / 06-03 + today's capability rollout).
- #4 scripts: shellcheck -S warning gate added to ci.sh (§3b, self-skips locally) + ci.yml guard job + scripts/AGENTS.md validator table; 6 shellcheck findings fixed (cd||exit ×2, unused loop var, xargs→sed path derivation, 2 documented SC2043 disables); slop check now strips fenced blocks + code spans (quoting a banned word ≠ prose slop); BSD date fallback for the freshness point; UTF-8 locale forced for char-not-byte description tiers; dead extract_yaml_value removed; agents scorer credits full claude-* model IDs.
- Agents: plan-review gained its missing ## Output Format section (14→15); both shipped agents now 15/15.

## Acceptance criteria

- [x] Every shipped skill reviewed with per-file disposition (improved / clean / vendored-frozen) — see Step details
- [x] No skill scores below its baseline; low scorers raised with real content: caveman 8→12, zoom-out 9→16, lint-no-suppressions 13→16, write-skill 14→16; category totals 212→218 (eng) / 189→204 (prod); agents 29→30
- [x] Scripts reviewed; safe hardening applied (shellcheck gate, slop precision, locale, BSD date); no validator floor loosened
- [x] codex-mirror-native-manifest-note shipped (71bfdb7) + reviewed (passed)
- [x] bash scripts/ci.sh exits 0 (incl. new shellcheck gate); pushed to claude/dreamy-dijkstra-xu8opp

## Out of scope

- Rewriting the vendored make-interfaces-feel-better body (upstream-verbatim by policy)
- Release tagging / version bumps
- New skills beyond what audits justify

## Mistakes & Dead Ends

- **2026-06-10T05:50:00+00:00**: First productivity + scripts audit agents were killed by a user interrupt mid-run → task IDs invalidated, results lost → relaunched both with identical prompts; engineering results were already collected and applied.

## Sources

- bash scripts/skills/score.sh --per-file baseline 2026-06-10T05:31 — see Context
- plugins/docks/skills/AGENTS.md — authoring + cross-tool wording rules (refreshed 2026-06-10)

## Blockers

## Notes

- Goal set via /goal (auto mode) — no approval gates; CI is the gate.

## Evidence log

- **2026-06-10T05:31:43+00:00** — Plan created; baseline scores captured — main
- **2026-06-10T05:50:00+00:00** — Engineering audit applied (21 files, commit 8d41f52): all non-vendored engineering skills at 16/16; ci.sh green — main
- **2026-06-10T06:06:22+00:00** — Productivity + scripts pass done in-context; shellcheck gate live; every kit skill 16 except caveman 12 (by design) + vendored 10; agents 15/15; ci.sh green — main

## Review

- **Goal met:** yes — all 5 criteria evidence-verified: 27 shipped skills + 2 agents dispositioned (improved / clean / vendored-frozen), scores at ceiling everywhere structurally possible (eng 218, prod 204, agents 30), validator hardening landed incl. the new shellcheck gate, codex-mirror sub-plan shipped+passed, work spread across commits 8d41f52 (engineering) and 0027054 (productivity+scripts), both pushed.
- **Regressions:** none — no per-file score dropped vs the 05:31 baseline; ci.sh green at every commit; slop-check precision fix verified to change only quoting skills (write-skill).
- **CI:** pass (`✔ All ci.sh checks passed`, exit 0, including the new shell-lint section)
- **Follow-ups:** none — the audit's only deliberate non-ceiling scores are documented dispositions (caveman 12 brevity-by-design, make-interfaces 10 vendored-frozen).
- Filed by: plan-review on 2026-06-10T06:07:27+00:00
