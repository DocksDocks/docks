---
title: Migrate CI validators from bash to .mjs (parity-gated)
goal: Port the parsing-heavy CI validators from bash to Node .mjs — one at a time, each gated by a parity check that proves identical output — keeping the calibrated scorers/hashers byte-identical and the bash orchestrators in place
status: planned
created: "2026-06-14T05:49:26+00:00"
updated: "2026-06-14T05:49:26+00:00"
started_at: null
assignee: null
tags: [tooling, ci, dx]
affected_paths:
  - scripts/skills/score.sh
  - scripts/skills/content-hash.sh
  - scripts/skills/transform-guard.sh
  - scripts/skills/no-author-scripts.sh
  - scripts/skills/codex-facts.sh
  - scripts/skills/guard.sh
  - scripts/agents/guard.sh
  - scripts/agents/score.sh
  - scripts/tree/guard.sh
  - scripts/config/read-floor.sh
  - scripts/ci.sh
  - .github/workflows/ci.yml
  - plugins/docks/skills/productivity/write-skill/scripts/skill-guard.sh
related_plans: [plans-v2-md-only]
review_status: null
---

# Migrate CI validators from bash to .mjs (parity-gated)

## Goal

Move the parsing-heavy CI validators from bash to Node `.mjs` so the tooling is
one language, unit-testable, free of the shellcheck dependency, and free of
GNU-vs-BSD `date`/`shasum` forks — **without changing a single skill's score or
hash.** Each port is gated by a parity check (run old `.sh` and new `.mjs` over
the same inputs; the diff must be empty) before the `.sh` is retired.

## Context

The repo is already trending this way — `validate-skills.mjs`, `refs-guard.mjs`,
and `skill-trigger-collision.mjs` are `.mjs`; `codex.sh`/`claude.sh` are already
13-line shims over `validate-skills.mjs`. The bash validators do fragile
`awk`/`sed`/`grep` gymnastics on YAML and markdown that Node parses cleanly.

The **risk** is the *calibrated* scripts — `score.sh`, `content-hash.sh`,
`agents/score.sh` emit numbers/hashes the whole gate depends on. A port that is
off by one point re-tiers skills; a port that hashes differently invalidates
every stored `content_hash`. So the migration is incremental and parity-gated,
not a big-bang.

User decisions are captured under `## Open questions` below — answer them before
implementation starts.

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | Build the reusable **parity harness** (`tests/parity.mjs <old.sh> <new.mjs> -- <args>`): runs both, normalizes, asserts identical stdout + exit code; non-zero diff fails. This is the de-risking tool every port is gated on. | — | planned |
| 2 | Port the calibrated trio FIRST (highest risk, proves the approach): `score.sh`→`score.mjs` (parity: identical `--per-file` + total over all skills), `content-hash.sh`→`content-hash.mjs` (parity: identical hash for every skill + `--check-only`/`--backfill` behavior), `agents/score.sh`→`agents/score.mjs`. Keep each `.sh` until its parity test is green. | 1 | planned |
| 3 | Port the structural guards: `transform-guard`, `no-author-scripts`, `codex-facts`, `agents/guard`, `tree/guard`, `scaffold/guard-spec`, `read-floor`. `codex.sh`/`claude.sh` already call `validate-skills.mjs` — fold or keep per OQ-3. | 1 | planned |
| 4 | Port the orchestrators (D-1): `ci.sh`→`ci.mjs` and `release.sh`→`release.mjs` (release is behavioral-parity, highest care — dry-run it); rewire `ci.yml` + `guard.sh` to call the `.mjs` validators. | 2,3 | planned |
| 5 | **Single-source collapse (D-2):** merge the skill frontmatter guard (`validate-skills.mjs` + `codex.sh`/`claude.sh`) + the scorer (`score.sh`) + the bash mirror (`skill-guard.sh`) into ONE bundled `write-skill/scripts/skill-guard.mjs`; point the repo CI at that shipped file over `plugins/docks/skills`; delete the duplicates; bump write-skill `metadata.updated` (bundled `scripts/` aren't content-hashed). | 2,3 | planned |
| 6 | Retire the ported `.sh` (delete or thin-shim per OQ-3); shrink the shellcheck glob to the bash that remains (`ci.sh`, `release.sh`, `lib/skills.sh`, idempotency test) or drop the gate if none remain. | 4,5 | planned |
| 7 | Update `docs/scaffold/spec.yaml` (seeds the validators), `scripts/AGENTS.md`, `.github/AGENTS.md`. | 4 | planned |
| 8 | Validate: every parity test green, `bash scripts/ci.sh` green, scaffold seed still starts green, no skill/agent score or hash changed. Commit + push. | 6,7 | planned |

## Acceptance criteria

- A `tests/parity.mjs` exists and is run for every ported validator; each asserts the old `.sh` and new `.mjs` produce **identical** output over all skills/agents (zero diff), captured before the `.sh` is retired.
- `node scripts/skills/score.mjs --per-file` equals `bash scripts/skills/score.sh --per-file` for every skill (and the totals match); same for `agents/score`.
- `content-hash.mjs` reproduces every skill's currently-stored `content_hash` exactly — the idempotency check stays green with no `metadata.updated` churn.
- `bash scripts/ci.sh` green; `ci.yml` updated in lockstep; the shellcheck glob covers exactly the bash that remains.
- `git diff` shows **no** change to any skill/agent `score` or `content_hash` attributable to this migration.

## Out of scope

- Changing any scoring rule, floor, or guard threshold (this is a language port, not a rubric change — a rubric change is a separate plan).
- Rewriting `release.sh` (git/tag/process orchestration — stays bash unless OQ-1 says otherwise).

## Decisions (open questions resolved 2026-06-14)

- **D-1 (OQ-1) — port everything**, including `ci.sh` → `ci.mjs` and `release.sh` → `release.mjs`. Note: a validator's "parity" is an output diff; `release.sh` has no deterministic output, so its parity is **behavioral** (still bumps versions in lockstep, tags `docks--v*`, pushes, gates the GH Release on tag-CI) — verify by dry-run, and keep a `release` npm-script entrypoint. Treat `release.mjs` as the highest-care port (touches git tags + GH releases).
- **D-2 (OQ-2) — single source of truth for the skill validator.** Collapse the skill frontmatter guard (`scripts/lib/validate-skills.mjs` + `codex.sh`/`claude.sh`) AND the scorer (`scripts/skills/score.sh`) AND the shipped bash mirror (`write-skill/scripts/skill-guard.sh`) into **one** bundled `.mjs` at `write-skill/scripts/skill-guard.mjs`. The repo's own CI calls that same shipped file over `plugins/docks/skills` — so there's one implementation used by both the repo and consumers, no mirror, no sync contract. The author-only validators (agents, tree, scaffold, manifests) stay in `scripts/` as `.mjs` — consumers never needed them.
- **D-3 (OQ-3) — delete each `.sh`** once its `.mjs` passes the parity gate (git history preserves it).
- **D-4 (OQ-4) — one `.mjs` per validator**, mirroring today's layout (easy parity mapping), except the D-2 collapse which is deliberately one file.

## Self-review (rubric pass on this draft)

- **Evidence re-verify:** inventory taken from the live tree — `score.sh` (138), `content-hash.sh` (130), `agents/score.sh` (124) are the calibrated trio; `codex.sh`/`claude.sh` (13 each) already shim `validate-skills.mjs`; `validate-skills.mjs`/`refs-guard.mjs`/`skill-trigger-collision.mjs` already `.mjs`.
- **Goal coverage:** added Step 7 (scaffold spec + node docs) after noticing Steps 1–6 port the scripts but leave `docs/scaffold/spec.yaml` seeding the old `.sh` names and the AGENTS nodes describing them — a fresh agent would ship a broken seed.
- **Checkable acceptance:** "no score/hash change" is the real success signal, expressed as a `git diff` + a parity command, not a judgment call.
- **Assumption → question:** scope, mirror fate, `.sh` retirement, and file structure were all guesses → each is an OQ, not a silent default.
- **Failure mode:** the parity harness (Step 1) IS the revert trigger — a non-empty diff blocks retiring the `.sh`, so a mis-port can't silently change scores.
- **Dependency order:** Step 1 (harness) gates everything; the calibrated trio (Step 2) goes first to prove the riskiest case before the easy guards.

## Sources

- `scripts/skills/score.sh:1` — the 16-pt scorer (calibrated; UTF-8 char counting, slop-strip, body-line awk) — the highest-risk port; parity = identical per-file scores.
- `scripts/skills/content-hash.sh:1` — deterministic skill hash (normalize → sha256 over SKILL.md-minus-bookkeeping + sorted references) — parity = identical stored hashes.
- `scripts/agents/score.sh:1` — agent scorer (max 15) — calibrated.
- `scripts/skills/guard.sh:1` — orchestrator that already mixes bash + `node refs-guard.mjs`; the rewire point.
- `scripts/lib/validate-skills.mjs:1` + `scripts/skills/{codex,claude}.sh:1` — the existing `.mjs` validator + its 13-line bash shims (the pattern to extend).
- `scripts/ci.sh:1` + `.github/workflows/ci.yml:1` — the orchestrator + its CI mirror (kept in lockstep per `.github/AGENTS.md`).
- `docs/scaffold/spec.yaml:41` — seeds the validator scripts into new projects; names must track the rename.
- `plugins/docks/skills/productivity/write-skill/scripts/skill-guard.sh:1` — the portable consumer-facing mirror (OQ-2).

## Review

(filled by plan-review on completion)
