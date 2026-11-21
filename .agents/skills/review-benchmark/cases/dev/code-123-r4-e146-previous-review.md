### Code review round 3, delta

Code-review: pass

## Previous findings

- Round-2 finding on `plugins/docks/skills/engineering/ci-speed/references/github-actions.md:23-28`: open — ordinary fork-PR collisions are fixed, but merged-closure events still omit PR identity; repeated under Standards.
- Round-2 finding on `plugins/docks/skills/engineering/effect-ts/references/lint-setup.md:127-128`: fixed — the cutover retains `tsc --noEmit` and requires plain-type and Effect failure probes (`lint-setup.md:128`).
- Round-2 finding on `plugins/docks/skills/engineering/ci-speed/references/js-toolchain.md:90-93`: open — statuses are captured, but raw equality rejects legitimate checker failures; repeated under Standards.
- Round-2 finding on `plugins/docks/skills/engineering/ci-speed/references/runner-fallback.md:77-90,112`: fixed — Pattern 3 explicitly requires environments and routes unsupported repositories to manual switching (`runner-fallback.md:75`).
- Round-2 Spec finding on `plugins/docks/skills/engineering/ci-speed/references/runner-fallback.md:93-98`: fixed — installation failure permits the decision step to continue; a missing CLI produces invalid cost and selects fallback (`runner-fallback.md:95-103`).

## Standards

- [MEDIUM] Bug - plugins/docks/skills/engineering/ci-speed/references/js-toolchain.md:89-94 - For the prescribed planted `TS2322` proof using stock TypeScript, `tsc --noEmit` returns 2 for ordinary semantic diagnostics, whereas Bun specifies exit 1. Inference from the [native compiler’s status selection](https://github.com/microsoft/typescript-go/blob/main/internal/execute/tsc/emit.go) and [Bun’s contract](https://bun.com/docs/runtime/check): line 92 rejects matching diagnostics before comparing their counts, so the required parity proof fails despite equivalent checking. - Validate each checker’s expected success/diagnostic-failure statuses separately rather than requiring identical integers; preserve startup rejection and planted-code checks. - class: pari…
- [LOW] Bug - plugins/docks/skills/engineering/ci-speed/references/github-actions.md:23-28, plugins/docks/skills/engineering/ci-speed/SKILL.md:76 - Unreached: the repository workflows, supplied CI fixture, and skill examples do not enable `pull_request.types: [closed]`. If a consumer enables merged-closure events, [GitHub sets their ref to the destination branch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request), not a PR-specific merge ref. Inference: two PRs merged into `main` share the new concurrency key and cancel unrelated runs. - Use a prefixed PR-number key for PR events and a separately prefixed unique run ID otherwise; correct the unconditional ref claim. - class: concurrency key omits pu…

## Spec

None.

[Some lines truncated to 768 chars. Use agent://CodeReviewR3Delta:raw:15-15 to read line 15 whole; cut lines run to line 16, each read the same way]
