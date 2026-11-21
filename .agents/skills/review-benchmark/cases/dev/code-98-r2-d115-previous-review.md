### Code review round 1, lens correctness

Code-review: pass

## Standards

- [MEDIUM] Bug - .agents/skills/review-benchmark/scripts/score.mjs:346-368 - An `unknown` match judgment followed by a `valid` adjudication loses its uncertainty: a one-finding, one-defect run reports recall 0, one valid extra, and zero unknown or unjudged results. `readJudgments` discards every non-match verdict, so unresolved matching can silently distort reviewer comparisons. - Preserve per-pair uncertainty and expose unresolved matches in the report, separately from finding validity. - class: discarded match uncertainty

## Spec

None.

### Code review round 1, lens spec-and-tests

Code-review: pass

## Standards

None.

## Spec

- [MEDIUM] Spec - plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md:154, plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md:32 - Decision 1 requires “the returned blocks unchanged in one issue comment,” but the loaded publication reference still instructs one comment per reviewer. Following that obsolete instruction lets a later panel pass replace an earlier failure under latest-comment selection. - Remove the per-reviewer publication rule and defer to the canonical per-round rule. - class: obsolete publication guidance
- [MEDIUM] Spec - .agents/skills/review-benchmark/scripts/score.mjs:417-452 - Decision 8 requires “median round time and tokens,” but the scorer reports only their means. With baseline times 100/100/400 and candidate times 140/140/140, those summaries show savings despite a 40% median regression. Decision 6’s required cost ranges are also absent. - Report cost medians and ranges, and cover skewed three-run inputs in the scorer tests. - class: incorrect benchmark aggregation
- [MEDIUM] Spec - .agents/skills/review-benchmark/scripts/score.mjs:347-363 - Decision 6 requires reporting “unresolved judgments,” but non-match outcomes are discarded. When one finding matches D1 and has an `unknown` match against D2, the report records no unknown or unjudged result, hiding uncertainty that affects recall. - Preserve and report unresolved pair judgments independently of unmatched-finding ratings; add this partially matched case to the tests. - class: discarded judgment uncertainty

### Code review round 1, lens text-and-safety

Code-review: pass

## Standards

None.

## Spec

None.
