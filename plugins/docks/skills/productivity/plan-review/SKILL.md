---
name: plan-review
description: Use when a plan reaches status finished (in docs/plans/finished/) with ship_commit set — verifies goal vs the ship_commit diff, runs the project's CI to flag regressions, writes a `## Review` block with goal-met assessment, regression scan, follow-ups. Also the draft-review pass plan-manager dispatches on a big/risky new plan — red-teams the draft against the self-review rubric and reports holes. Not for general code review or pre-merge checks.
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-06-14"
  content_hash: "d2fd6a69344818a39ab83a54a14a2f8384d16613e70eafde656b04ea1303d9d1"
---

# Plan Review

Verify a finished plan against the diff that shipped it. Read `goal` and acceptance criteria, compare to the actual changes in `ship_commit`, run the project's CI/test command if it has one, and write a structured `## Review` block into the plan file with the verdict.

<constraint>
**Two modes, keyed on `status`.** A `finished` plan (in `finished/`) with `ship_commit` set → **finished review**: diff-vs-goal verification (Steps 1–10). A non-finished draft (in `active/`, any other status) → **draft review** (Mode 0): red-team the draft against the self-review rubric and report holes — do NOT look for a diff (there isn't one). If `ship_commit` is empty on a `finished` plan, ask the user for the SHA before proceeding.
</constraint>

<constraint>
**Idempotent re-runs replace, never append.** If a `## Review` block already exists in the plan body, the new review REPLACES it via `Edit` (with `old_string` matching the existing block). Never append a second Review section. The user should be able to invoke "review plan <slug>" repeatedly without bloating the file.
</constraint>

<constraint>
**Never auto-create follow-up plans.** When regressions or partial-goal-met findings warrant a follow-up plan, list the suggested slug(s) in the Review block under `Follow-ups:` — but DO NOT create the new files. The user keeps control of what becomes a new tracked plan.
</constraint>

<constraint>
**Per-finding reproduction (mandatory).** Before claiming a regression or scope-drift finding:
- Re-`Read` the file(s) at `file:line` and confirm the offending pattern is present in the current code.
- If the regression is a failing test, re-run the specific test command and capture the latest output.
- If the project's CI command fails, capture the first failing line verbatim — never paraphrase.
- DROP any finding that fails reproduction; log it under "Dropped (failed reproduction)" rather than including it in the Review block.
</constraint>

## Mode 0 — draft review (status ≠ finished)

When dispatched on a non-finished draft (plan-manager calls this for a big/risky
new plan, or the user asks to "review the draft"), there is no diff — you are
red-teaming the plan itself. Read the plan, then check each item:

| Check | Hole it catches |
|---|---|
| Actionability | every `## Steps` row has a verifiable done-condition — no "improve/handle X" |
| Dependency order | no step needs the output of a later one; prerequisites exist |
| Evidence re-verify | every cited `file:line` in `## Sources`/`affected_paths` resolves and says what's claimed (re-`Read` it) |
| Goal coverage | with every step done, is `## Goal` actually met? name the gap |
| Checkable acceptance | `## Acceptance criteria` are commands + expected output where natural |
| Failure mode | each risky step has a revert trigger |
| Assumption → question | anything the plan guessed should be an `## Open question`, not a silent default |

Plus the cold-handoff test: *could a fresh agent execute this with ONLY this
file? Where would it guess?* Report findings as a bulleted list (each a concrete
fix or a new open question) — append them to the plan's `## Self-review` section
or return them to the dispatching agent. Do NOT write a `## Review` block, set
`review_status`, or run CI in this mode — those are finished-review only.

## Finished review

### Step 1 — Anchor + verify scope

Run `date '+%Y-%m-%dT%H:%M:%S%:z'` once to anchor "now" for the Review timestamp.

`Read` the plan file. Confirm:
- File path is under `docs/plans/finished/`
- `ship_commit` is a 40-char SHA (or 7+ char short SHA)
- Body contains a `## Review` section (placeholder or filled — either is OK; we'll replace it)

If any condition fails, stop with the specific error.

### Step 2 — Extract review inputs

From the plan body, extract:
- `goal` (frontmatter)
- `## Goal` body section (detailed)
- `## Acceptance criteria` checkbox list (note which are `[x]`, `[~]`, `[ ]`)
- `affected_paths` (frontmatter array, may be empty)

### Step 3 — Enumerate changes in the ship commit

```bash
git show <ship_commit> --stat --name-only
```

Capture: list of files changed, total +/- lines. Also run `git show <ship_commit>` (no `--stat`) to read the actual diff for verification reads in Step 5.

### Step 4 — Scope-drift check

For each entry in `affected_paths`, confirm the file appears in the changed-files list from Step 3.
- `affected_paths` entry NOT in the changed-files list → record under "Scope drift" in the Review block.
- File changed in `ship_commit` but NOT listed in `affected_paths` → record as "Unannounced changes" (often fine, but worth surfacing).

If `affected_paths: []` (empty), record "Drift check skipped (affected_paths unset)" — don't imply verification you didn't do.

### Step 5 — Acceptance-criteria verification

For each `[x]` (claimed-shipped) checkbox:
1. Read the relevant changed files (or grep them) for the implied symbol/behavior.
2. Pattern-match: if the criterion says "rate-limits /auth/login", grep for `auth/login` in the diff and confirm a rate-limit construct (`rateLimit`, `throttle`, `RateLimiter`, etc.) is present.
3. If no evidence found, flag the criterion as "claimed-shipped but unverifiable".

For each `[ ]` or `[~]` (unfinished) checkbox: flag as "partial — criterion not marked shipped".

### Step 6 — CI gate

Find the project's CI/test command — a documented entrypoint (its README / AGENTS.md / CONTRIBUTING), a `package.json` script, a `Makefile` target, or a repo-root CI script. If one exists, run it and capture the exit code + first failing line if non-zero. If the project has no runnable CI, record "CI: n/a (no project CI command)".

### Step 7 — Compose the Review block

Build the structured Review block:

```markdown
## Review

- **Goal met:** yes | partial | no — <one-line reasoning>
- **Regressions:** none | <list with file:line>
- **CI:** pass | fail (<first failing line>) | n/a
- **Follow-ups:** none | <suggested slug 1>, <suggested slug 2>
- Filed by: plan-review on <ISO timestamp>
```

Decision rules:
- **Goal met: yes** — every `[x]` verified; no scope drift; CI pass (or n/a).
- **Goal met: partial** — at least one `[~]` or `[ ]` checkbox; OR scope drift; OR a `[x]` was unverifiable.
- **Goal met: no** — no `[x]` could be verified at all; OR CI fail.

Set frontmatter `review_status` to match: `passed` / `partial` / `regressed`.

### Step 8 — Atomic write

`Edit` the plan file with `old_string` matching the current `## Review` block (placeholder OR previous filled block) and `new_string` = the freshly composed block. Bump frontmatter `updated` to the turn-anchor ISO datetime (the same value used in the Review block's `Filed by` line) — never a bare date.

If the file's `## Review` block has changed shape (e.g., user edited the placeholder), re-`Read` the file before composing the Edit so `old_string` matches exactly.

### Step 9 — Render Tier-3 preview

Render the Tier-3 single-plan preview (per `docs/plans/AGENTS.md`) so the user sees the full Review block in chat without opening the file. Header strip uses the `finished` age token — `shipped just now`, `shipped <X>m ago`, `shipped <X>h ago`, or `shipped <X>d ago` depending on the delta from now to the plan's `updated` datetime.

### Step 10 — Surface follow-ups (do not create)

If "Follow-ups" lists any suggested slugs, end the response with a single sentence telling the user how to create them ("Run 'new plan <slug>' to create one"). Never write the new plan file yourself.

## Common traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| Looking for a diff on a non-finished draft | Reading HEAD and guessing | `status ≠ finished` → Mode 0 draft review (no diff) |
| Appending a second `## Review` block on re-run | `Write` mode adding to the body | `Edit` with `old_string` matching the existing block |
| Auto-creating follow-up plans for regressions | Calling `plan-manager` "new plan" automatically | List slug suggestions in `Follow-ups:`; user creates them |
| Claiming a regression without reproducing | Listing it from a stale grep | Per-finding reproduction — re-read the file, re-run the test |
| Paraphrasing the CI failure line | "Tests fail in some unit tests" | Quote the literal first failing line from the CI command's output |
| Skipping the `affected_paths` drift check when the field is empty | Marking "no drift" trivially | If `affected_paths: []`, record "Drift check skipped (affected_paths unset)" |
| Bumping `updated` without re-Reading the frontmatter after Edit | Trusting the Edit succeeded | Re-`Read` to confirm — silent Edit failures happen on `old_string` mismatch |

## Anti-Hallucination Checks

- Before claiming a `[x]` criterion is verified, you MUST have read the relevant changed code OR grepped for evidence — not just trusted the checkbox.
- Before claiming "CI pass", you MUST have run the project's CI command and seen exit code 0 in this turn.
- Before claiming "CI fail", you MUST have captured the first failing line verbatim from the output.
- Before claiming `## Review` was written, re-`Read` the file and confirm the new block is present with all five lines (Goal met, Regressions, CI, Follow-ups, Filed by).
- Before claiming `review_status` is set, re-`Read` the frontmatter and confirm the new value.
- If the plan mentions a framework/library and you need to verify the implementation against current docs, use **resolve-library-id → query-docs** via context7 — don't trust training-data assumptions about framework conventions.

## Success Criteria

- Plan-review only runs on `finished/` plans with `ship_commit` set; all other states return a clear stop error.
- Every `[x]` acceptance criterion either gets evidence-backed verification or is flagged as "unverifiable".
- the project's CI command is run when present; CI verdict is captured verbatim.
- The `## Review` block is written via idempotent `Edit` (re-runs replace, not append).
- `review_status` frontmatter is set to one of `passed` / `partial` / `regressed`.
- Tier-3 preview is rendered after the write — user sees the verdict without opening the file.
- Regressions surface follow-up slug suggestions but plan-review never auto-creates new plan files.

## References

- `docs/plans/AGENTS.md` — full convention; this skill writes the `## Review` block defined there.
- `plan-manager` skill — handles the `→ finished/` move that auto-triggers this skill. See its Step 8.
- `plugins/docks/agents/plan-review.md` — Claude-only thin wrapper for inter-agent dispatch via `Agent(subagent_type="plan-review", prompt=<plan-path>)`. Skill is the canonical workflow; agent is a runtime convenience.
