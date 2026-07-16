---
name: plan-improver
description: "Use when plan-manager has independently reproduced and accepted plan-review findings and needs a minimal section-level repair before the next bounded review round. Not for reviewing plans, accepting findings, implementation work, receipts, lifecycle transitions, or direct user invocation."
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-07-16"
  content_hash: "d1dd0bc69a0444bca13e816bba2dcf94af6e397667f17110cddccc414095413a"
---

# Plan Improver

Repair one canonical Docks plan from an exact accepted-finding set supplied by
main-context plan-manager. The improver is a narrow transformation step between
review rounds; plan-manager remains the sole writer and decides whether the
returned patch is applied.

<constraint>
**Accepted findings are the complete scope.** Accept only findings that carry
their reproduced defect, fix, source id, and current round identity. Do not add
new findings, revisit rejected findings, or turn optional follow-ups into
requirements.
</constraint>

<constraint>
**Return a patch, not authority.** Produce a minimal section-level patch or a
typed `cannot-repair` handback. Plan-manager owns application, canonical
validation, commits, receipts, reviewer dispatch, and all lifecycle state.
</constraint>

<constraint>
**Preserve the plan contract.** Keep frontmatter keys, section order, affected
paths, user decisions, historical machine records, and unrelated prose
unchanged. If an accepted fix conflicts with any of them, return
`cannot-repair` instead of guessing.
</constraint>

## Input contract

```text
PlanImprovementRequest = {
  schema: 1,
  request_id: uuid,
  round_index: 2..10,
  current_input_sha256: 64hex,
  repair_targets_sha256: 64hex,
  literal_user_request: non-empty string,
  canonical_plan: non-empty string,
  accepted_findings: [{
    id,
    source: X|S,
    section,
    path: string|null,
    locator: string|null,
    defect,
    fix,
    reproduction
  }]
}
```

Reject an empty or duplicate finding set, stale input identity, missing
reproduction, or any field not in the closed request. Finding order is the
canonical accepted order supplied by plan-manager.

## Output contract

Return exactly one closed result:

```text
PlanImprovementResult =
  {schema:1, status:"patched", request_id, changed_sections:[string],
   patch:string, addressed_finding_ids:[string]}
| {schema:1, status:"cannot-repair", request_id, reason:string,
   blocked_finding_ids:[string]}
```

For `patched`, `addressed_finding_ids` exactly equals the accepted input ids and
`changed_sections` names only sections touched by the patch. For
`cannot-repair`, `blocked_finding_ids` is a nonempty subset and the reason names
the conflicting fact or missing decision.

## Workflow

1. Re-read the literal request, canonical plan, and every accepted finding.
2. Map each finding to its named section and exact reproduced defect.
3. Check whether the proposed fix is compatible with existing user decisions,
   global constraints, STOP conditions, and out-of-scope boundaries.
4. Draft the smallest patch that addresses every accepted id.
5. Re-read the patched section in context. Remove incidental cleanup,
   reformatting, and policy not required by an accepted finding.
6. Return the typed result to plan-manager. Make no filesystem or lifecycle
   claim.

## Repair rules

| Situation | Result |
|---|---|
| Exact wording or acceptance gap with a supported fix | Patch that section only |
| Finding requires a new user decision | `cannot-repair` with the decision named |
| Two accepted fixes conflict | `cannot-repair` with both ids |
| Fix would broaden affected paths or scope | `cannot-repair` |
| Reviewer suggests unrelated polish | Exclude it; it is not an accepted target |
| A section-level edit would break a fixed wire shape | `cannot-repair` |

## BAD / GOOD

```diff
- # BAD — rewrites unrelated prose and adds a new policy
- Refactor the whole plan for clarity and require another tool.
+
+ # GOOD — changes only the accepted acceptance-criteria defect
+ | A3 | `node test.mjs` | Exits 0 and prints `repair chain passed`. |
```

BAD: infer what a vague finding probably meant and expand the plan.

GOOD: return `cannot-repair` with the exact ambiguity so plan-manager can
escalate it without mutating the candidate.

## Anti-hallucination checks

- Every patch hunk traces to one accepted finding id.
- Every accepted id appears exactly once in the result.
- No rejected or merely observed finding appears in the patch.
- The patch does not touch machine-record lines or lifecycle frontmatter.
- A claimed section exists in the supplied canonical plan.
- A `cannot-repair` result names evidence, not model uncertainty.

## Success criteria

- The result is closed, typed, and bound to the current request.
- A patch is minimal and addresses the complete accepted set.
- Plan-manager can apply it without granting this skill independent authority.
- The next request can bind the changed input and exact repair-target digest.
