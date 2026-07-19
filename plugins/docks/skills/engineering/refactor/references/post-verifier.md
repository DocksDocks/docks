# Phase 8 — Post-Implementation Verification

Verify applied refactorings against the plan via `git diff`, run tests/linter/type-checker, and re-analyze every changed file for NEW SOLID violations introduced while fixing old ones.

<constraint>
Per-finding reproduction before reporting. New SOLID violation: read the `file:line`, confirm the pattern is currently present, quote it. Lint violation: re-run the linter on the file, confirm the rule still fires. Test failure: re-run the specific test, capture output. Type error: re-run the type-checker on the file. DROP any claim that fails reproduction — log under `## Dropped (failed reproduction)`.
</constraint>

## Steps

1. **Applied-change verification** (per diff hunk): dead-code removals leave no dangling refs (search the removed symbol); consolidations updated all call sites; extractions are called from the original location; SOLID refactors actually resolve the stated violation; each change matches the approved plan.
2. **Test suite**: `npm test` / `pnpm test` / `pytest` / `cargo test` / `go test ./...` — capture full output.
3. **Linter + type-checker**: `npx eslint` / `ruff check` / `golangci-lint`; `npx tsc --noEmit` / `mypy`.
4. **New SOLID violation check** (the differentiator): re-analyze every refactored file against all 5 principles. Did Extract Class create a new god module? Did Strategy introduce a new enum dispatch? Did composition break a parent contract? Did interface splits create inconsistent impls? Did DI changes add new concrete coupling?
5. **Compliance delta**: by identity `(file:line, principle)` — `surviving` = in both pre and post; `resolved` = pre not surviving; `new` = post not surviving.

## Output (write under `## Phase 8: Post-Verifier Results`)

`Verified Correct` (by plan entry #) · `ERRORS FOUND - Must Revert` (entry, problem, evidence, action) · `New Violations Introduced` (`file:line`, principle, evidence, action: revert) · `SOLID Compliance Delta` · `Summary` (applied/reverted counts, lines removed, files modified/deleted, test/lint/type-check status).

```text
SOLID violations — before: N | after: M | resolved: R | new: N_new
```

Any new violation triggers an immediate revert recommendation for the offending refactoring.

## Gotcha

| Gotcha | Fix |
|---|---|
| Reporting a test failure from a stale run | Re-run the specific test now and capture fresh output before claiming failure |
| Accepting a refactor that resolved one violation but added another | Zero new violations is the bar — revert the offending change |
