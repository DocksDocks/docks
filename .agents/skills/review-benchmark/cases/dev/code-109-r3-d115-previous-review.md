### Code review round 2, lens correctness

Code-review: pass

## Standards

- [MEDIUM] Bug - .agents/skills/review-benchmark/scripts/prepare.mjs:1531-1535, .agents/skills/review-benchmark/scripts/score.mjs:110 - Assuming a valid variant ref, `agents --variants a=<ref> --out "/work/review runs/heldout"` rejects the prescribed backticked skill path: the root parser excludes whitespace, so substitution produces no recognized root (inference from the regex and refusal branch). Variant preparation therefore fails solely because its output parent contains a space - Parse quoted instruction paths with interior spaces while preserving the same-root check - class: whitespace-unsafe instruction path parsing

## Spec

None.

### Code review round 2, lens spec-and-tests

Code-review: pass

## Standards

- [MEDIUM] Maintainability - scripts/tests/unit/review-benchmark.test.mjs:6061-6072, .agents/skills/review-benchmark/scripts/prepare.mjs:1228,1277-1288 - For a supported `show_benchmark` code case run with `--loop`, no test covers the changed filtering of fixer snapshots, later-round snapshots/diffs, or judge trees. The new fixture runs only `case`; existing loop fixtures place their repositories outside the harness skill, making their exclusion list empty. Inference: losing filter propagation in these callers would remain undetected, leaving answer-key exclusion unprotected across repairs. - Extend the copied-harness fixture through a fixer repair and another review round; assert benchmark visibility and `cases/` exclusion in every generated input. - class: untested diff-filter propagation

## Spec

None.

### Code review round 2, lens text-and-safety

Code-review: pass

## Standards

- [MEDIUM] Maintainability - .agents/skills/review-benchmark/scripts/prepare.mjs:824-826 - When the snapshot contains the old contract sentence but surrounding patch context differs, `git apply` rejects the hunk. This fallback discards its diagnostic and reports `not applicable`, indistinguishable from the intended absent-text case, then dispatches the unchanged contract. Inference: subsequent comparisons can measure a variant without its contract change. - Preserve the confirmed absent-text fallback, but surface other application failures with Git’s diagnostic and add regression coverage - class: swallowed overlay application errors

## Spec

None.
