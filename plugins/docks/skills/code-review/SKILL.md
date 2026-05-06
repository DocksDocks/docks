---
name: code-review
description: Use when reviewing code for bugs, security vulnerabilities (OWASP Top 10), performance issues, maintainability problems, or AI slop — on a path, a diff, or the working tree. Produces a categorized findings list with file:line references, severity, and suggested fixes. Optional fix-application phase after the user approves. Not for full security audits (use the /security command for OWASP-coverage with parallel adversarial scanning) or refactoring sprees (use /refactor).
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-05-06"
---

# Code Review

<constraint>
Every finding MUST cite a `file:line` reference and the actual code that triggered it. "There may be a race condition somewhere in the auth flow" is not a finding — it's a vibe. A finding is `src/auth/login.ts:42 — read-modify-write of session.expiresAt without a lock; concurrent calls can stale-write`. Without the file:line + evidence, the finding gets dropped before reporting.
</constraint>

<constraint>
Severity must match exploitability and blast radius, not surface scariness. A `dangerouslySetInnerHTML` with user input is critical. The same call with a hardcoded string from a config file is low. Mis-rating severity is the most common review failure — when in doubt, write down the attack scenario before assigning the rating; if you can't articulate the scenario, drop the severity.
</constraint>

<constraint>
The review phase is READ-ONLY. Don't apply fixes during analysis — produce the findings list, present it to the user, and only apply fixes if the user explicitly approves. Mid-review edits pollute the diff and make it impossible to distinguish findings from fixes.
</constraint>

## When to Use

- The user says "review this", "check this code", "find issues in X", "what's wrong with Y"
- Reviewing a PR diff before merging
- Quick audit of unfamiliar code before extending it
- Triage pass on a path that's been flagged as buggy
- Pre-merge sanity check after a round of AI-generated changes

NOT for:
- Full OWASP Top 10 coverage with adversarial perspective — use the `/security` command (3 parallel scanners + synthesizer adds genuine value there)
- Whole-codebase refactor / dead code / SOLID audit — use `/refactor`
- Test coverage gaps — use `test-coverage` skill

## The Five-Step Procedure

### Step 1 — Scope and stack

Confirm what you're reviewing:

- A specific path? Glob it; verify it exists
- A diff? `git diff` (vs main, vs HEAD, vs a sha) — capture the actual hunks
- The working tree? `git status --short` to see what's changed

Confirm the stack: `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` / `*.csproj` for language + framework + test runner. The right vocabulary changes the review entirely — Go nullability ≠ TypeScript nullability ≠ Rust borrow-checker rules.

### Step 2 — Read the target with multiple search passes

Apply the kit-level **multi-pass search heuristic** (see `## Agentic Harness Heuristics #3` in CLAUDE.md). One pass biased toward what you expect to find; another with deliberately different framing. Examples:

- Pass 1: "How does this handle errors?"
- Pass 2: "What inputs are not validated?"
- Pass 3: "Where does data cross a trust boundary?"

For diffs: read the surrounding context, not just the patched lines. A removed null check looks fine in isolation but breaks the caller two functions up.

### Step 3 — Categorize findings into four buckets

Every finding lands in exactly one:

- **Bug** — code does something other than what it appears to. Off-by-one, wrong operator, missing await, dangling resource, race condition.
- **Security** — exploitable by malicious input or insider. OWASP Top 10 vocabulary: injection, broken access, IDOR, SSRF, XSS, deserialization, path traversal, weak crypto.
- **Performance** — N+1 queries, unbounded loops, sync I/O on hot paths, missing indexes, unnecessary re-renders, allocation in tight loops.
- **Maintainability / AI slop** — dead code, duplicated logic, contradictory comments, unused imports, "smart" abstractions, defensive code for impossible cases, made-up error messages.

Cap severity at the bucket's worst-case: a "performance" finding capped at *high* (causing prod outage), a "maintainability" finding capped at *medium* (slows future development).

### Step 4 — Self-verify before reporting (the false-positive guard)

Before listing a finding, run these checks:

- **Is the finding real in THIS code?** Re-read the actual file:line. The most common false positive is "code that would be wrong in a different language/framework" — verify it's wrong here, in this project's idioms.
- **Is the severity calibrated?** Articulate the worst-case scenario in one sentence. If the sentence is hand-wavy ("could be a problem"), drop the severity by one.
- **Is the fix actually a fix?** A proposed fix that breaks an existing test or invalidates a different invariant isn't a fix; it's a swap. Note this.
- **Spot-check 5+ file:line refs** by re-reading them. If any are off-by-one or pointing at the wrong block, ALL findings in this run are suspect — re-do the analysis.

Reject findings that fail these checks. A short list of solid findings beats a long list of shaky ones.

### Step 5 — Report (and optionally fix)

Format the report by severity (critical → high → medium → low), each finding with:

```text
SEVERITY · CATEGORY · file:line
  Evidence: <the actual code, 1-3 lines>
  Why it's a problem: <one sentence; the attack scenario / failure mode>
  Suggested fix: <one sentence or short snippet>
```

Then ask: "Apply fixes? (all / critical-only / specific findings / none)". Wait for user choice.

If the user approves fixes:

1. Apply in severity order, critical first
2. Run the project's tests + linter + type-checker after each change (or batched if changes are independent)
3. If a fix breaks a test or introduces a regression, **revert with `git restore`** and report the revert — don't try to fix the fix in the same review cycle
4. After all approved fixes land, re-run the full check suite and report final state

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| "Findings" without code evidence | "Authentication seems weak" with no file:line | Drop the finding; an audit without evidence is worse than no audit |
| Severity inflation to look thorough | Mark everything HIGH so the report looks weighty | Calibrate to actual blast radius; drop unjustified severity |
| Reviewing code in a vacuum (no test/lint context) | Skip Step 1; jump straight to reading source | Read `package.json` scripts; know what the project's quality bar already is before adding "issues" |
| Same false positive appears every run | Project uses an idiom that looks wrong but isn't | Document the idiom in `.claude/skills/` so future runs skip it |
| Mid-review fix pollution | Edit a "obviously broken" line during analysis | Stay read-only until Step 5. Never edit mid-analysis. |
| Reporting "potential issues" | "There MIGHT be a SQL injection here" | Either it is one (file:line + evidence) or you don't know yet (run another search pass before deciding) |
| Missing the surrounding context on a diff | Review only `+` lines | Always read 5-10 lines above and below the hunk; bugs live in deletions and at boundaries |

## Output Example

```
HIGH · Bug · src/api/orders.ts:118
  Evidence:
    const order = await db.orders.findById(req.params.id)
    return res.json(order)
  Why it's a problem: No null-check after findById. If id doesn't exist,
    `order` is null and `res.json(null)` returns 200 — caller can't
    distinguish "missing" from "found-but-empty".
  Suggested fix: if (!order) return res.status(404).json({ error: "not_found" });

MEDIUM · Maintainability · src/api/orders.ts:45-62
  Evidence:
    18-line if/else chain mapping order.state → response shape
  Why it's a problem: New states require touching the chain in 3 places
    (validation, mapping, error path). Drift risk on every state addition.
  Suggested fix: state-to-shape lookup table; new states become single-line additions.
```

## Anti-Hallucination Checks

- Re-Read every cited file:line before adding it to the report — pasted-from-memory references rot fast
- If a tool/lint/type-check command was claimed run, the report includes its actual output (stderr + exit code), not paraphrase
- "I think this is a bug" is not a finding. Either prove it (file:line + scenario) or run another search pass
- Apply the kit-level rule #4 (trace symbols): when claiming a function "does X", read the function and the call sites; don't trust the name

## References

- Pairs with: `/security` for OWASP Top 10 coverage with adversarial perspective; `/refactor` for SOLID and dead-code analysis at scale; `lint-no-suppressions` if your fix would otherwise involve silencing a linter rule
- Kit-level `## Agentic Harness Heuristics`: rule #3 (multi-pass search) anchors Step 2; rule #4 (trace symbols) anchors evidence-gathering
- OWASP Top 10 vocabulary: https://owasp.org/Top10/
