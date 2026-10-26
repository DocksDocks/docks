<!-- plan-contract: v3 -->

## Goal

Reword the plan-record label blocks in the `security` and `refactor` skills to describe creation state - the issue is created with `plan:drafting` and `plan-manager` owns every later phase transition - instead of enumerating the full `plan:<phase>` label set as a shape invariant.

Mode: plan-and-implement

## Research

- A session advisory found that plan #35's lifecycle-wording change over-corrected: the record blocks (security/SKILL.md:77-80, refactor/SKILL.md:76-79) enumerate all four phase labels where the audit pipeline only ever creates a `plan:drafting` issue; creation-state wording plus explicit manager ownership is more precise and stays true across the run.
- The same enumeration is in the record block of `plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md:75-77` (`plan:drafting | plan:planned | plan:ongoing | plan:blocked`), so step:reword_blocks rewords that block too and the three pipelines stay identical.
- The reword is already implemented on branch `fix-plan-label-creation-state` (commit e81049c) and published as PR #38 BEFORE this plan existed - a process defect: push/PR is a non-`local` effect and required lifecycle authorization. This plan retroactively carries that authorization; a second advisory blocked the merge until the lifecycle completes.
- Consumers of the docks plugin can hold resumed audit issues that a reader matches against the old four-label line. Each block therefore keeps the old line under the new wording as a `legacy:` line for one release, and a follow-up plan removes the three `legacy:` lines after the next docks release.
- `node scripts/ci.mjs --plugin docks` exit 0 on the candidate bytes with content hashes re-synced (each changed skill's `metadata.content_hash` backfilled).
- Candidate diff: the fenced record blocks only; no description, frontmatter-shape, or body-structure changes.
- Durable fix chosen: state creation state and manager ownership in every record block. Rejected temporary fix: a note under the blocks that the label list is informative only.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | reword_blocks | Replace the label-set enumeration in the three record blocks with creation-state wording and manager ownership, and keep the old line as a `legacy:` line | plugins/docks/skills/engineering/security/SKILL.md, plugins/docks/skills/engineering/refactor/SKILL.md, plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md | - | `local` | `planned` | All three blocks read "created with plan:drafting; plan-manager owns every later phase transition" |
| 2 | hash_gate | Re-sync content hashes and run the docks plugin gate | plugins/docks/skills/engineering/security/SKILL.md, plugins/docks/skills/engineering/refactor/SKILL.md, plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md | 1 | `local` | `planned` | `node scripts/ci.mjs --plugin docks` exit 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `grep -q "plan:drafting" plugins/docks/skills/engineering/security/SKILL.md plugins/docks/skills/engineering/refactor/SKILL.md` | Exit 0: the reworded record blocks name the creation label |
| A2 | `node scripts/ci.mjs --plugin docks` | Exit 0 |

## Do not touch

- Everything outside the named SKILL.md record blocks.
- `plugins/plan-lifecycle/` - the lifecycle contract itself is not in scope.

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

_Not implemented yet._
