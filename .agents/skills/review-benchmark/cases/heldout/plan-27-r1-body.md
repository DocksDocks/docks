<!-- plan-contract: v3 -->

## Goal

Cut the plan record grammar and lifecycle text over from em dashes to hyphens, refuse em dashes in plan bodies, and require every plan to deliver durable solutions with temporary fixes allowed only on an explicit user request

Mode: plan-and-implement

## Research

- Load-bearing em-dash grammar in plan.mjs: Depends empty cell (246, 904), review heading regexes (454, 455), plan and code finding-line regexes (467, 472), and the queue empty "Depends on" cell (965). No cosmetic em dashes in plan.mjs.
- The hyphen forms after cutover: `### Plan review - <UTC date>`, `### Code review round <n> - <UTC date>`, finding separator " - " (space hyphen space), empty Depends and "Depends on" cells `-`. Em-dash records become ineligible; the latest well-formed hyphen record per kind wins as today.
- Documented grammar carrying em dashes: plan-contract.md (114, 123, 168, 170, 174, 176, 185), plan-md-template.md (127, 311, 313, 317, 319), docs/PLAN.md (123, 307, 309, 313, 315), plan-reviewer SKILL (70, 72, 73), codex-agent-templates.md (98, 100), agents/plan-reviewer.md (67, 74, 76, 82), agents/code-reviewer.md (100, 102, 108), .codex/agents/code-reviewer.toml (62, 64). Zero em dashes in github-issue-publication.md and .codex/agents/plan-reviewer.toml.
- Cosmetic prose em dashes to remove in the same cutover so the ban is total inside lifecycle-owned text: plan-manager SKILL (50, 182 twice, 183), plan-contract.md (85, 109, 140, 151, 223), plan-workspace SKILL (210, 211), plan-md-template.md (1, 5, 295, 363), plan-reviewer SKILL (49), docs/PLAN.md (1, 291, 359), codex-agent-templates.md (1), selftest.mjs comment (2). docs/PLAN.md is byte-identical to the template's terminal fence, so both change together.
- Test pins on the em-dash grammar: plan-cli.mjs fixture rows and review-record assertions (160, 524, 783, 792, 794, 795, 798, 800, 803, 836, 1420, 1456, 1498, 1513, 1516, 1523, 1546, queue fixtures 2254, 2273, 2293) and plan-skill-phases.mjs (171, a prose pin that also carries an em dash).
- Enforcement: checkPlan gains an em-dash refusal for the whole body, folded into the check 10 family with its own message, keeping the pinned "13 checks" count. The hardened mutators from plan 23 then refuse any em-dash body before writing.
- Migration: this plan's own body legally carries em-dash Depends cells under the current grammar. After the cutover lands in the working tree, the first lifecycle write converts this body to hyphen grammar through `edit`, which validates with the new checks; later `step` and `status` writes then pass the full-validation gate. Closed plans keep their em-dash records as history; no lifecycle command re-reads a finished plan's verdicts after archive.
- Durable-solutions policy: one shared wording lands in the plan-manager drafting rules, the plan-reviewer finding lens, both shipped reviewer wrappers, both repo Codex wrapper TOMLs, and the workspace codex templates. Reviewers treat an unrequested temporary fix as a finding: goal_fit in plan review, Spec severity by impact in code review.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | grammar_cutover | Switch parser and check grammar in plan.mjs to hyphen forms: review headings, finding separators, empty Depends and queue cells; update every plan-cli fixture and assertion that pins the em-dash forms | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | — | `local` | `planned` | Hyphen records parse as trusted; em-dash records are ineligible; empty Depends is `-`; plan-cli suite passes |
| 2 | body_dash_ban | Refuse any em dash in a plan body inside checkPlan, with its own check 10 message and test coverage | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 1 | `local` | `planned` | `check` exits 1 naming the em-dash rule for a body containing one; hyphen bodies pass; the "13 checks" count is unchanged |
| 3 | durable_policy | Add the shared durable-solutions rule to plan-manager drafting, plan-reviewer findings, both shipped wrappers, both Codex wrapper TOMLs, and the codex templates | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/agents/code-reviewer.md, .codex/agents/plan-reviewer.toml, .codex/agents/code-reviewer.toml, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md | — | `local` | `planned` | Each surface states: durable root-cause solutions only; a temporary fix requires an explicit user request recorded in the plan; reviewers treat an unrequested temporary fix as a finding |
| 4 | docs_grammar | Rewrite the documented record grammar and remove every remaining em dash across the contract, docs/PLAN.md, the workspace template and SKILLs, the reviewer SKILL, codex templates, and selftest comment; update plan-skill-phases pins | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, docs/PLAN.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/test/selftest.mjs, scripts/tests/plan-skill-phases.mjs | 1 | `local` | `planned` | Zero U+2014 bytes remain in lifecycle-owned skills, references, wrappers, docs/PLAN.md, and both test suites; docs/PLAN.md stays byte-identical to the template fence; phase tests pass |
| 5 | hash_gate | Re-sync skill content hashes and pass the plugin gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md | 1, 2, 3, 4 | `local` | `planned` | `node scripts/ci.mjs --plugin plan-lifecycle` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0 with hyphen-grammar records trusted, em-dash records ineligible, and the body em-dash refusal covered |
| A2 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0 with updated pins |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |
| A4 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0; the full `node scripts/ci.mjs` also exits 0 because the diff spans repo-wide surfaces |

## Do not touch

- `docs/plans/finished/` - frozen history
- Closed plan issues and their em-dash review comments: history, never migrated
- The hardened write paths from plan 23: assignee verification, retire recovery, prevalidation, mutator validation semantics

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

_Not implemented yet._
