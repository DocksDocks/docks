### Code review round 4, lens correctness

Code-review: pass

## Standards

- [MEDIUM] Bug - .agents/skills/review-benchmark/scripts/prepare.mjs:367-374 - When a replay’s base/head changes the benchmark corpus, such as a future replay of #98, the generated diffs include held-out answer files. Excluding the skill from `snapshot` does not exclude it from these diffs, so reviewers receive answers and contaminate subsequent measurements. - Exclude answer material consistently from full, focus, and delta diffs. - class: answer-key contamination
- [MEDIUM] Bug - .agents/skills/review-benchmark/scripts/score.mjs:330-355, .agents/skills/review-benchmark/scripts/score.mjs:410-420 - If the judge omits a required candidate-pair judgment but adjudicates its finding `valid`, a one-finding, one-defect run reports recall 0, one valid extra, and zero unjudged, unresolved, or unknown-pair results. `scoreRuns` never checks the candidate-pair lists, so incomplete judging silently biases comparisons. - Compare returned judgments with required pairs; reject omissions or expose them as unjudged pairs. - class: unchecked match-pass completeness

## Spec

None.

### Code review round 4, lens spec-and-tests

Code-review: pass

## Standards

None.

## Spec

- [MEDIUM] Spec - .agents/skills/review-benchmark/scripts/score.mjs:410-420 - Decision 6 (`.git/docks-review/plan-98.md:77`) requires reporting “unresolved judgments”, but scoring ignores the candidate-pair lists. If the judge omits a finding/known-defect pair and rates the finding `valid`, the report counts a valid extra and a missed known defect while showing zero unresolved or unjudged items. This silently makes incomplete matching evidence look complete and can distort the keep/drop decision. - Check every requested pair for an answer, rejecting incomplete matching or explicitly reporting missing judgments; add a regression using generated pairs. - class: omitted match judgments treated as resolved

### Code review round 4, lens text-and-safety

Code-review: pass

## Standards

- [MEDIUM] Security - .agents/skills/review-benchmark/scripts/prepare.mjs:367-374 - A replay spanning changes to the benchmark’s held-out files, such as this branch, includes those files in reviewer-facing diffs. Only the snapshot excludes them, so reviewers receive answer material despite the isolation boundary. - Apply the snapshot’s exclusion to full, focus, and delta diffs. - class: incomplete held-out isolation
- [MEDIUM] Bug - .agents/skills/review-benchmark/scripts/prepare.mjs:179,472 - Generated prompts allow reads only inside the snapshot or explicitly named inputs, but candidate agents must load skills and checklists from the working-tree plugin outside those locations. The instructions conflict; inference: a reviewer honoring the restriction can skip the candidate instructions being measured. - Explicitly permit loading the selected reviewer’s instructions and references while retaining the evidence boundary. - class: contradictory reviewer read scope

## Spec

None.
