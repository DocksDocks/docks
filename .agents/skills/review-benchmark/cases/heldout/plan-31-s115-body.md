<!-- plan-contract: v3 -->

## Goal

Delete the effect-kit plugin payload, registry descriptor, catalog entries, dependent test contracts, and every surviving cross-reference, so the repository ships exactly two plugins.

Mode: plan-and-implement

## Research

- The payload is shallow: `plugins/effect-kit/` holds `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `skills/{AGENTS.md,CLAUDE.md,engineering/{effect-ts-port,effect-ts-setup,effect-ts-specialist,effect-v4}}`, and `test/selftest.mjs`. It is deleted wholesale; its internal cross-references need no per-file handling.
- Registry and catalogs: the descriptor at scripts/lib/plugins.mjs:75-90 (plus the registry list reference at :108), the Claude marketplace entry at .claude-plugin/marketplace.json:39-41,51, and the Codex catalog entry at .agents/plugins/marketplace.json:20,23.
- Dependent contracts that name effect-kit and must be edited or removed: scripts/config/test-contracts.json:5-15 (effect-kit selftest row), scripts/tests/plan-skill-phases.mjs:333-334, scripts/tests/unit/gate-memo.test.mjs:364-397, scripts/tests/unit/tag-ci-run-identity.test.mjs:101 (fixture tag), scripts/tests/unit/skill-score-vacuity.test.mjs:16-17 (effect-specific target - retarget to a docks skill or remove), scripts/ci.mjs:347,352-353 (trigger-collision grouping audits Docks and Effect Kit together - collapses to Docks alone), and package.json:10-12 check/test globs.
- `scripts/tests/ci-plugin-targeting.mjs` builds its lanes, shard cases, and release-tag fixtures from the registry (`PLUGINS` of scripts/lib/plugins.mjs) and names no plugin literally, so removing the descriptor updates it; it needs no edit.
- Surviving prose that lists effect-kit alongside survivors and gets its lines edited, not deleted: root AGENTS.md:27,46 (repo map and context-tree table row), README.md:28,120,156, .github/AGENTS.md:9-10,56,79-81 (collision audit, core lane, and timing statements), scripts/AGENTS.md:11,37,177,189,199, scripts/release.mjs:4 (comment naming the three plugins), plugins/docks/skills/AGENTS.md:80-81 (six routes become four), plugins/docks/skills/productivity/context-tree/references/major-folder-heuristics.md:41 and node-template.md:68, plugins/plan-lifecycle/skills/AGENTS.md:87-90 (prerequisite-paragraph claim and six-route claim), and the .github/workflows/ci.yml:14 comment.
- Spaced and camel-case spellings also occur: `Effect Kit` in .github/AGENTS.md:9-10, scripts/release.mjs:4, and the test-contracts.json:7 row title. The acceptance grep covers all spellings case-insensitively.
- GNU grep matches `--exclude-dir` against the folder path under the search root, so `--exclude-dir=docs/plans/finished` skips the frozen plans and nothing else; a bare `finished` would also skip every other folder of that name.
- scripts/config/scoring.json carries zero effect references and stays untouched.
- Released tags `effect-kit--v0.2.0` through `v0.5.0` are historical release refs and stay; `docs/plans/finished/` is frozen history and stays. Removal touches neither.
- Editing plan-lifecycle and docks skill-tree AGENTS.md files may move content hashes; the gate surfaces drift and `node scripts/skills/content-hash.mjs --backfill` re-syncs it.
- CI lane resolution is registry-driven: with the descriptor gone, PR shard mapping and `--plugin` strict resolution reject effect-kit automatically; no workflow YAML logic changes beyond the stale comment.
- Durable fix chosen: delete the plugin and every live reference in one cutover. Rejected temporary fix: keep the descriptor and mark the plugin deprecated.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | payload | Delete the effect-kit payload tree | plugins/effect-kit/ | - | `local` | `planned` | `plugins/effect-kit/` no longer exists |
| 2 | registry | Remove the descriptor and both catalog entries | scripts/lib/plugins.mjs, .claude-plugin/marketplace.json, .agents/plugins/marketplace.json | 1 | `local` | `planned` | `node scripts/ci.mjs --list` shows exactly docks and plan-lifecycle |
| 3 | contracts | Remove or retarget every dependent test contract and config glob | scripts/config/test-contracts.json, scripts/tests/plan-skill-phases.mjs, scripts/tests/unit/gate-memo.test.mjs, scripts/tests/unit/tag-ci-run-identity.test.mjs, scripts/tests/unit/skill-score-vacuity.test.mjs, scripts/ci.mjs, package.json | 2 | `local` | `planned` | Every named suite exits 0 with no effect-kit reference |
| 4 | prose | Edit surviving docs and routing lines | AGENTS.md, README.md, .github/AGENTS.md, .github/workflows/ci.yml, scripts/AGENTS.md, scripts/release.mjs, plugins/docks/skills/AGENTS.md, plugins/docks/skills/productivity/context-tree/references/major-folder-heuristics.md, plugins/docks/skills/productivity/context-tree/references/node-template.md, plugins/plan-lifecycle/skills/AGENTS.md | 1 | `local` | `planned` | Zero live effect-kit/Effect Kit/effect-ts/effect-v4 references outside docs/plans/finished/ and git history |
| 5 | gate | Re-sync content hashes on drift and run the full gate | plugins/docks/skills/, plugins/plan-lifecycle/skills/ | 2, 3, 4 | `local` | `planned` | Full `node scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/ci.mjs` | Exit 0 (full gate - registry, CI topology, and multiple plugins changed) |
| A2 | `grep -ri -e effect-kit -e "effect kit" -e effect_kit -e effectkit -e effect-ts -e effect-v4 --exclude-dir=.git --exclude-dir=docs/plans/finished .` | Zero live hits (frozen history under docs/plans/finished/ excluded) |
| A3 | `node scripts/ci.mjs --list` | Exactly docks and plan-lifecycle |
| A4 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |

## Do not touch

- `docs/plans/finished/` - frozen history; effect-kit mentions there stay
- Git tags `effect-kit--v*` and GitHub releases - historical release facts
- `scripts/config/scoring.json` - carries no effect references
- Closed plan issues and their comments

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

_Not implemented yet._
