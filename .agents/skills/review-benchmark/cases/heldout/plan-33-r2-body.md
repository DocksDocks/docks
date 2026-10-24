<!-- plan-contract: v3 -->

## Goal

Fix the three verified gating defects - prefix-evadable no-author-scripts matcher, silently skipped declared payload directories, uncorroborated agent-scorer output - and settle the cross-tool hook claim with a runtime check.

Mode: plan-and-implement

## Research

- Finding 1 (verified): scripts/skills/no-author-scripts.mjs:24 uses a negative lookbehind that rejects a match when a slash character precedes `scripts`, so any author-script path spelled with a prefix (for example `./scripts/ci.mjs`) evades the guard while bare `scripts/ci.mjs` fails. The slash exclusion is partly deliberate: it permits the shipped bundled path `write-skill/scripts/skill-guard.mjs` named at plugins/docks/skills/productivity/skill-maintenance/SKILL.md:148, which consumers really have. The fix must keep bundled plugin-internal script references legal while catching author scripts under any prefix. A fixed tail list rots as the tree moves (the current tree already holds `scripts/ci-target.mjs`, `scripts/capture-tdd-red.mjs`, and `scripts/plans/` beyond the first draft's list), so the hardened matcher derives the author-script tails from the on-disk repository `scripts/` inventory at guard runtime, while an allowlisted bundled-path shape (a plugin-internal path segment before `scripts`) stays legal.
- Finding 2 (verified): scripts/ci.mjs:430 and :432 gate skills and agents behind `fs.existsSync`, so a descriptor that declares a skills or agents root whose directory is missing gets no validation and no failure. Fix: declared-but-absent roots become explicit `fail` lines.
- Finding 3 (verified): scripts/ci.mjs:440-448 parses `scripts/agents/score.mjs --per-file` stdout without checking the subprocess exit status, corroborating row names against on-disk agent files, or rejecting non-finite scores; an empty agents directory passes vacuously (0 >= 0). The skill path has vacuity coverage in scripts/tests/unit/skill-score-vacuity.test.mjs; the agents path has none. Fix mirrors the skill checks: fail on non-zero scorer exit, corroborate row count and names against the directory listing, reject NaN, and add unit coverage.
- Finding 4 withdrawn after an executable probe: malforming plugins/docks/hooks/hooks.json makes `claude plugin validate ./plugins/docks` print "Validation failed" - ci.mjs:406 already gates hooks JSON syntax; registering it in extraJson would be redundant.
- Finding 5 resolved by documentation: the official Codex plugin documentation states that Codex sets `CLAUDE_PLUGIN_ROOT` for compatibility, so the invocation at plugins/docks/hooks/hooks.json:9 is portable by documented contract and the cross-tool claim in plugins/docks/hooks/context-tree-nudge.mjs:2-10 stands. Step 4 corroborates that documented contract against the current official documentation and records the citation; the hook changes only if current documentation contradicts the shipped claim. An unobservable runtime probe is not evidence for narrowing support.
- Root AGENTS.md documents the guard's verify loop ("append a line naming `node scripts/ci.mjs` to a non-allowlisted skill body -> the guard run must FAIL"); the hardened matcher must keep that loop true and extend it to prefixed spellings.
- All three code fixes live in author-side tooling (`scripts/`), shared repo-wide; the hook step may touch plugins/docks/hooks/. Repo-wide tooling plus a possible docks payload touch means the full `node scripts/ci.mjs` gate is authoritative.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | matcher | Harden the no-author-scripts matcher against prefixed author-script paths while keeping bundled `*/scripts/` references legal | scripts/skills/no-author-scripts.mjs | - | `local` | `planned` | Planting `./scripts/ci.mjs` or `node scripts/ci.mjs` in a non-allowlisted skill body fails the guard naming that file; skill-maintenance's bundled skill-guard reference still passes |
| 2 | presence | Fail the gate when a descriptor declares a skills or agents root whose directory is absent | scripts/ci.mjs | - | `local` | `planned` | A descriptor with a missing declared root produces an explicit fail line instead of a silent skip |
| 3 | scorer | Check agent-scorer exit status, corroborate rows against on-disk agents, reject non-finite scores, and add vacuity unit coverage | scripts/ci.mjs, scripts/tests/unit/agent-score-vacuity.test.mjs | - | `local` | `planned` | Scorer failure or row/name mismatch fails the gate; the new unit test passes and covers the empty-directory vacuous pass |
| 4 | hook | Corroborate the documented Codex `CLAUDE_PLUGIN_ROOT` compatibility contract against current official documentation and record the citation; change the hook only if documentation contradicts the shipped claim | plugins/docks/hooks/hooks.json, plugins/docks/hooks/context-tree-nudge.mjs | - | `probe` | `planned` | The documented contract is cited in the verification record and the shipped claim matches it, or a documented contradiction is fixed in the hook files |
| 5 | gate | Re-sync content hashes on drift and run the full gate | plugins/docks/skills/ | 1, 2, 3, 4 | `local` | `planned` | Full `node scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/ci.mjs` | Exit 0 with preserved exit code |
| A2 | Plant `./scripts/ci.mjs` in a non-allowlisted docks skill body, run `node scripts/skills/no-author-scripts.mjs`, revert | Guard fails naming that file; after revert it passes |
| A3 | `node --test scripts/tests/unit/agent-score-vacuity.test.mjs` | Exit 0; covers empty-dir vacuity, scorer failure, and name mismatch |
| A4 | `node scripts/tests/ci-plugin-targeting.mjs` | Exit 0 - targeting contracts unaffected |

## Do not touch

- `docs/plans/finished/` - frozen history
- Validator floors in `scripts/config/scoring.json` - hardening adds checks, never loosens floors
- `plugins/plan-lifecycle/` - out of scope

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

_Not implemented yet._
