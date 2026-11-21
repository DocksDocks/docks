### Code review round 2, lens correctness

Code-review: pass

## Standards

- [MEDIUM] Bug - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs:746-747 - For a passed yolo plan whose Goal specifies literal fenced output, changing `a\n\nb` to `a\n\n\nb` changes the required output, but `goalWork` collapses both to the same text. Static inference: `editPlan` therefore suppresses re-review advice. The final `trim()` similarly hides changes to leading code indentation. - Normalize only separators affected by removing live metadata; preserve reviewed example whitespace and add regression cases. - class: whole-section whitespace normalization hides semantic edits

## Spec

None.

### Code review round 2, lens spec-and-tests

Code-review: pass

## Standards

None.

## Spec

- [MEDIUM] Spec - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs:739-753, plan-111.md:60 - For a passed yolo plan containing a fenced exact-output example, decision 6 exempts only an edit that “sets the Mode or Delegation line.” Static inference: changing the example from `a\n\n\nb` to `a\n\nb` produces no re-review advice because `goalWork` collapses blank-line runs throughout the Goal, including inside fences. This hides a changed output requirement even when metadata is unchanged. - Restrict separator normalization to removed live metadata, preserve example whitespace, and add this regression case. - class: metadata comparison normalizes reviewed example content
- [MEDIUM] Spec - .agents/skills/review-benchmark/scripts/score.mjs:1702-1710, plan-111.md:49 - For `DocksDocks "docks-kit" -site:github.com/DocksDocks/docks/issues`, decision 1 permits an owner-only query only when an exclusion “excludes the repository or the owner.” The exclusion here removes only issue pages. Static inference: the scorer nevertheless treats it as excluding the entire repository because it checks name mentions without the remaining path. Assuming no forbidden result URL is cited, the run incorrectly remains valid. - Check that an exclusion covers the repository or owner, rather than merely mentioning it; add partial-path exclusion coverage while retaining result-URL checks. - class: partial site exclusion treated as repository-wide exclusion

### Code review round 2, lens text-and-safety

Code-review: pass

## Standards

None.

## Spec

None.
