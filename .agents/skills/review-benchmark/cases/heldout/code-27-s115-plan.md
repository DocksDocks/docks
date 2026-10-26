<!-- plan-contract: v3 -->

## Goal

Cut the plan record grammar and the lifecycle text over from em dashes (U+2014) to ASCII hyphens. Refuse em dashes in plan bodies and in the text that lifecycle commands write into a body or a new issue. Require every plan to deliver a durable solution. Allow a temporary fix only when the user explicitly asks for it.

Mode: plan-and-implement

## Research

- `plan.mjs` uses the em dash as grammar in these places: the empty `Depends` cell in `checkPlan` and `setStepStatus`, the two review heading regexes and the two finding-line regexes in `parseReviewComment`, and the empty `Depends on` cell in `parseQueue`. It has no other em dash.
- After the cutover, the forms are `### Plan review - <YYYY-MM-DD>`, `### Code review round <n> - <YYYY-MM-DD>`, the finding separator ` - ` (space, hyphen, space), and `-` for an empty `Depends` cell or `Depends on` cell. An em-dash record is ineligible, the same as a malformed record. The latest well-formed hyphen record of each kind wins, as today.
- These files document the em-dash grammar: plan-contract.md, plan-md-template.md, docs/PLAN.md, the plan-reviewer SKILL.md, codex-agent-templates.md, both reviewer wrappers in plugins/plan-lifecycle/agents, and .codex/agents/code-reviewer.toml. github-issue-publication.md and .codex/agents/plan-reviewer.toml have no em dash.
- Prose em dashes are also in the plan-manager, plan-workspace, and plan-reviewer SKILL.md files, plan-contract.md, plan-md-template.md, docs/PLAN.md, codex-agent-templates.md, the lifecycle authoring node plugins/plan-lifecycle/skills/AGENTS.md, and a selftest.mjs comment. The ban must be total in lifecycle-owned text, so this cutover removes them too. docs/PLAN.md is byte-identical to the terminal fence of plan-md-template.md, so both files change together.
- scripts/tests/plan-cli.mjs pins the em-dash forms in fixture rows, review-record assertions, and queue fixtures. scripts/tests/plan-skill-phases.mjs pins one prose clause that contains an em dash.
- Enforcement: `checkPlan` gets an em-dash refusal for the whole body. The refusal is in the check 10 family with its own message, so the pinned "13 checks" count does not change. The mutators of plan #23 validate the body, so they then refuse an em-dash body before they write. `new` refuses U+2014 in the title and in the goal before `gh issue create`. `status <n> blocked --reason` refuses an em-dash reason before the composed-body write.
- Migration: the live queue docs/PLAN-QUEUE.md has one empty `Depends on` cell. It changes to `-`, so `next` can read the queue after the cutover. Closed plans keep their em-dash records as history. `show` and `archive` read the verdicts again through `reviewSummary` and the archive verifier. After the cutover, an em-dash record is ineligible: `show` on such a closed plan reports no trusted verdict, and `archive` refuses for a missing `Code-review: pass`. This is the accepted cost of a total ban. Fixtures pin both behaviors.
- Durable-solutions policy: one shared clause goes into the plan-manager drafting rules, the plan-reviewer finding lens, both shipped reviewer wrappers, both Codex wrapper TOML files, the codex templates, plan-contract.md, docs/PLAN.md, and plan-md-template.md. Reviewers treat an unrequested temporary fix as a finding: `goal_fit` in plan review, `Spec` in code review. scripts/tests/plan-skill-phases.mjs pins the clause on each surface.
- Durable fix: cut the grammar over in one pass and refuse em dashes on every write path. Rejected temporary fix: accept both dash forms for a transition period.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | grammar_cutover | Change the parser and check grammar in plan.mjs to the hyphen forms: review headings, finding separators, and empty Depends and queue cells. Update every plan-cli fixture and assertion that pins the em-dash forms. Change the empty `Depends on` cell of the live queue to `-` | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs, docs/PLAN-QUEUE.md | - | `local` | `done` | Hyphen records parse as trusted; em-dash records are ineligible; an empty Depends cell is `-`; `next` reads the migrated queue; the plan-cli suite passes |
| 2 | body_dash_ban | Refuse any em dash in a plan body in checkPlan with its own check 10 message. Refuse U+2014 in the title and the goal in the `new` prevalidation before `gh issue create`. Refuse U+2014 in the `status <n> blocked --reason` text before the composed-body write. Add tests for each refusal | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 1 | `local` | `done` | `check` exits 1 and names the em-dash rule for a body that contains one; `new` with an em-dash title or goal exits 1 and creates no issue; `status <n> blocked --reason` with an em dash exits 1 and leaves the issue unchanged; hyphen bodies pass; the "13 checks" count does not change |
| 3 | durable_policy | Add the shared durable-solutions clause to the plan-manager drafting rules, the plan-reviewer findings, both shipped wrappers, both Codex wrapper TOML files, the codex templates, and the record standard with its byte-identical mirrors. Pin the clause in the phase tests | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/agents/code-reviewer.md, .codex/agents/plan-reviewer.toml, .codex/agents/code-reviewer.toml, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, docs/PLAN.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md, scripts/tests/plan-skill-phases.mjs | - | `local` | `done` | Each surface states the clause: durable root-cause solutions only, a temporary fix only on an explicit user request that the plan records, and an unrequested temporary fix is a finding; the phase tests pin the clause; docs/PLAN.md stays byte-identical to the template fence |
| 4 | docs_grammar | Rewrite the documented record grammar. Remove every remaining em dash from the contract, docs/PLAN.md, the workspace template and SKILL.md files, the reviewer SKILL.md, the lifecycle authoring node, the codex templates, and the selftest comment. Update the plan-skill-phases pins. Add finished-plan fixtures that pin that em-dash records are ineligible under the new grammar | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, docs/PLAN.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/skills/AGENTS.md, plugins/plan-lifecycle/test/selftest.mjs, scripts/tests/plan-skill-phases.mjs, scripts/tests/plan-cli.mjs | 1 | `local` | `done` | No U+2014 byte remains in the lifecycle-owned skills, references, wrappers, authoring node, docs/PLAN.md, or selftest.mjs; docs/PLAN.md stays byte-identical to the template fence; a legacy em-dash record on a closed plan gives no trusted verdict in `show`; the phase tests pass |
| 5 | hash_gate | Re-sync the skill content hashes and pass the plugin gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md | 1, 2, 3, 4 | `local` | `done` | `node scripts/ci.mjs --plugin plan-lifecycle` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0; hyphen records are trusted, em-dash records are ineligible, and the body em-dash refusal is covered |
| A2 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0 with the updated pins |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |
| A4 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0; the full `node scripts/ci.mjs` also exits 0, because the diff changes repo-wide surfaces |

## Do not touch

- `docs/plans/finished/`: frozen history.
- Closed plan issues and their em-dash review comments: history, never migrated.
- The write paths of plan #23: assignee verification, retire recovery, prevalidation, and the validation semantics of the mutators.

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

- A1 `node scripts/tests/plan-cli.mjs`: exit 0. Hyphen grammar is trusted, em-dash records are ineligible, the U+2014 refusals for body, title, goal, and reason are covered, and legacy finished-plan records give no trusted verdict.
- A2 `node scripts/tests/plan-skill-phases.mjs`: exit 0. The durable-policy clause is pinned on every surface, the hyphen grammar is pinned, and the zero-U+2014 assertions pass.
- A3 `node plugins/plan-lifecycle/test/selftest.mjs`: exit 0.
- A4 `node scripts/ci.mjs --plugin plan-lifecycle`: exit 0. The full `node scripts/ci.mjs` also exits 0.
