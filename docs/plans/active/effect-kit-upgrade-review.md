---
title: effect-kit post-migration review + upgrade roadmap
goal: After the migration lands, audit the three Effect skills' current state (API currency, descriptions, conventions) against live Effect 3.x docs and docks conventions, then propose and ship an agreed upgrade round.
status: planned
created: "2026-07-03T17:07:03-03:00"
updated: "2026-07-03T17:07:03-03:00"
started_at: null
assignee: claude
tags: [effect-kit, audit, effect-ts, upgrade]
affected_paths:
  - plugins/effect-kit/skills/engineering/effect-ts-setup/
  - plugins/effect-kit/skills/engineering/effect-ts-specialist/
  - plugins/effect-kit/skills/engineering/effect-ts-port/
  - plugins/effect-kit/skills/AGENTS.md
related_plans: [effect-kit-migration]
review_status: null
planned_at_commit: "2fb11fab830bce13a5940e00bfc553f808ae9f2e"
---

# effect-kit post-migration review + upgrade roadmap

## Goal

The migration plan deliberately moves the payload byte-faithfully — content quality is THIS plan's job. effect-kit's skills were authored ~June 2026 against Effect 3.x and haven't been audited since; they also predate the docks conventions that landed after (durable anchors, behavior-claim exercising cues, the near-miss description pass against docks siblings). Audit first, then propose an upgrade round the user picks from, then ship it as an effect-kit release.

**Blocked-by-design on [[effect-kit-migration]]**: do not start until that plan is `finished` — every path below assumes `plugins/effect-kit/` exists in this repo and is CI-green.

## Context & rationale

- **Why a separate plan** (maintainer decision, 2026-07-03): migration diff stays mechanical/reviewable; content changes get their own review cycle and release.
- **Known deferred item inherited from migration**: cross-plugin trigger near-misses — the mechanical collision test is per-plugin only, so effect-ts-* descriptions were never checked against docks' engineering siblings (typescript/react/test skills share vocabulary).
- **Known starting scores**: effect-ts-port 16, effect-ts-setup 14, effect-ts-specialist 16 (docks bundled scorer, engineering floor 10) — headroom exists on setup.
- **The skills' own grounding rule** (from their node): version-specific API claims (`effect/Schema`, `@effect/platform` HttpApi, `@effect-atom/atom-react`) must be verified against current docs before changing — this plan's audit step IS that verification, run via context7/official docs, never from training data.

## Environment & how-to-run

Requires [[effect-kit-migration]] shipped. Gates: `node scripts/ci.mjs --plugin effect-kit` · scorer `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/effect-kit/skills` · hash sync `node scripts/skills/content-hash.mjs --backfill plugins/effect-kit/skills` · docs research via context7 (`resolve-library-id` → `query-docs` for effect, @effect/platform, @effect-atom/atom-react) with WebFetch on effect.website as fallback · release `node scripts/release.mjs --plugin effect-kit minor` (user-gated).

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | API-currency audit: for each of the 3 skills + 12 references, verify every version-specific claim against CURRENT Effect 3.x docs (context7 first); classify findings per the content-audit taxonomy (confirmed / drifted / stale-snippet / fictional-api) with the claim text + the doc evidence | audit notes in this plan's `## Notes` | — | planned |
| 2 | Conventions audit: durable-anchors pass (guard already enforces `path:NN`; manually check for uncued volatile facts + behavior claims without exercising probes), description CSO + manual near-miss pass against docks engineering siblings (3 near-miss prompts each, routing via "Not for…" clauses) | same | — | planned |
| 3 | Fix round: apply every `drifted`/`stale-snippet`/`fictional-api` finding + convention gaps; lift effect-ts-setup toward 16 only if the rubric points are honest content (never padding); bump `metadata.updated` + hash backfill | the 3 skill dirs | 1,2 | planned |
| 4 | Upgrade roadmap: propose candidate additions grounded in audit gaps (e.g. references for newer Effect surfaces the skills don't cover — candidates to be derived from step 1 evidence, not assumed); present via the open-questions picker; implement ONLY what the user selects | proposal in `## Open questions`, then chosen dirs | 1,2 | planned |
| 5 | Gates + release: `node scripts/ci.mjs` exit 0; release `effect-kit` minor (user-gated picker) | manifests via release.mjs | 3,4 | planned |

## Acceptance criteria

- Every version-specific API claim in the 3 skills carries either a confirmation (evidence in `## Notes`: claim → doc source) or a fix commit — zero unchecked claims (count them in step 1; the audit table in `## Notes` is the record).
- `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/effect-kit/skills` → all ≥ pre-audit scores (no regressions; setup's uplift is optional, honest-only).
- Near-miss table (≥3 prompts per skill vs docks siblings) recorded in `## Notes`; any unrouted pair fixed via a "Not for…" clause in the description.
- `node scripts/ci.mjs` → exit 0.
- Step-4 additions: each shipped item was explicitly picked by the user; nothing implemented from the proposal silently.

## Out of scope / do-NOT-touch

- The migration mechanics (registry, catalogs, node wiring) — [[effect-kit-migration]]'s territory; if the audit finds a migration defect, file it back as a finding, don't fix silently here.
- docks / session-relay skills — even where a near-miss fix could also be made on the docks side, prefer the effect-kit description; touching a docks skill triggers its own release cycle (flag it as a follow-up instead).
- Rewriting skills to new Effect MAJORS (4.x if it exists by then) — that's a rewrite plan, not an audit; this plan tracks 3.x currency only.

## Known gotchas

- context7 may resolve multiple effect libraries — pin to the official Effect-TS org libraries; cross-check surprising claims against effect.website before editing.
- The skills' example code blocks are teaching artifacts — verify the APIs they call exist, but don't churn style; surgical fixes only.
- Every content edit needs `metadata.updated` + hash backfill or the idempotency gate fails.

## Cold-handoff checklist

1–9: file manifest ✓ · environment & commands ✓ (incl. research tooling) · contracts ✓ (audit taxonomy + evidence-table shape) · executable acceptance ✓ · out-of-scope ✓ · rationale ✓ · gotchas ✓ · constraints ✓ (user-picked additions only; blocked on migration) · no TBDs — step 4's candidates are derived at execution time by design, recorded as such ✓.

## Self-review

Score: 87/100 (normal tier, one pass — first score ≥85, no hill-climb). Strongest: executable acceptance (audit-evidence table + scorer non-regression + user-picked-only additions) and the explicit blocked-on-migration gate. Known softness, accepted by design: step 4's upgrade candidates are derived from step-1 evidence at execution time rather than pre-enumerated — pre-guessing Effect surface gaps from memory would violate the research-before-implementation rule the skills themselves mandate.

## Review

(filled by plan-review on completion)

## Sources

- Pre-migration scorer run: 16/14/16 over `~/projects/effect-kit/plugins/effect-kit/skills` (this session).
- `~/projects/effect-kit/plugins/effect-kit/skills/AGENTS.md` — the grounding rule for version-specific claims (read this session).
- `docs/plans/active/effect-kit-migration.md` — the deferred cross-plugin near-miss item this plan inherits.
