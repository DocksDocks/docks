---
name: plan-improver
description: "Use when plan-manager has independently reproduced and explicitly accepted blocking plan-review findings and needs the one allowed minimal section-level repair. Not for nonblocking gaps, reviewing plans, accepting findings, implementation work, receipts, lifecycle transitions, or direct user invocation."
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-07-17"
  content_hash: "3e2ad4a71115986422653af2222f8f2030078879356d7dc20769f1e6cc833a1f"
---

# Plan Improver

Repair one canonical Docks plan from an exact accepted-blocker set supplied by
main-context plan-manager. The improver is the single optional transformation
between full round 1 and repair round 2; plan-manager remains the sole writer
and decides whether the returned patch is applied.

<constraint>
**Accepted blockers are the complete scope.** Accept only `blocking_gap`
findings that plan-manager independently reproduced and explicitly accepted.
Each carries its reproduced defect, fix, source id, criterion, and round-1
identity. Reject nonblocking, rejected, unreproduced, empty, duplicate, or stale
targets. Do not add findings, revisit rejected findings, or turn advisory
follow-ups into requirements.
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
  schema: 5,
  request_id: uuid,
  round_index: 2,
  current_input_sha256: 64hex,
  repair_targets_sha256: 64hex,
  literal_user_request: non-empty string,
  canonical_plan: non-empty string,
  accepted_findings: [{
    id,
    source: "primary",
    criterion: standalone_executability|actionability|dependency_order|
               evidence_reverification|goal_coverage|executable_acceptance|
               failure_modes|open_questions,
    status: "blocking_gap",
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
reproduction, any status other than
`blocking_gap`, or any field outside the closed request. Finding order is the
canonical accepted order supplied by plan-manager. This request may be issued
once, only between full round 1 and repair round 2.

### Historical policy-v4 compatibility

Historical schema-1 improvement requests retain `round_index:2..10`,
`current_input_sha256`, `repair_targets_sha256`, and X/S-sourced accepted
findings with their original closed shape. Historical schema-1 results retain
their original validation behavior. They are validation-only and never
authorize a current round 3, reset, continuation, or nonblocking repair.

## Output contract

Return exactly one closed result:

```text
PlanImprovementResult =
  {schema:5, status:"patched", request_id, changed_sections:[string],
   patch:string, addressed_finding_ids:[string]}
| {schema:5, status:"cannot-repair", request_id, reason:string,
   blocked_finding_ids:[string]}
```

For `patched`, `addressed_finding_ids` exactly equals the accepted input ids and
`changed_sections` names only sections touched by the patch. The result must
produce input bytes different from `current_input_sha256`; plan-manager
recomputes and validates that identity before round 2. For `cannot-repair`,
`blocked_finding_ids` is a nonempty subset and the reason names the conflicting
fact or missing decision. Historical policy-v4 schema-1 results keep their
persisted shape and meaning.

## Workflow

1. Re-read the literal request, canonical plan, and every accepted blocking
   finding.
2. Map each blocker to its named checklist criterion, section, and exact
   reproduced defect.
3. Check whether the proposed fix is compatible with existing user decisions,
   global constraints, STOP conditions, and out-of-scope boundaries.
4. Draft the smallest patch that addresses every accepted id.
5. Re-read the patched section in context. Remove incidental cleanup,
   reformatting, nonblocking suggestions, and policy not required by an accepted
   blocker.
6. Return the typed result to plan-manager. Make no filesystem or lifecycle
   claim.

## Repair rules

| Situation | Result |
|---|---|
| Exact accepted blocking wording or acceptance gap with a supported fix | Patch that section only |
| Finding requires a new user decision | `cannot-repair` with the decision named |
| Two accepted blocker fixes conflict | `cannot-repair` with both ids |
| Fix would broaden affected paths or scope | `cannot-repair` |
| Nonblocking, rejected, or unreproduced finding is supplied | Reject the request |
| Reviewer suggests unrelated polish | Exclude it; it is not an accepted blocker |
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

- Every patch hunk traces to one accepted reproduced `blocking_gap` id.
- Every accepted blocker id appears exactly once in the result.
- No nonblocking, rejected, unreproduced, or merely observed finding appears in
  the patch.
- The patch does not touch machine-record lines or lifecycle frontmatter.
- A claimed section exists in the supplied canonical plan.
- A patched result changes canonical input bytes before repair round 2.
- A `cannot-repair` result names evidence, not model uncertainty.

## Success criteria

- The result is closed, schema 5, and bound to the current request.
- A patch is minimal and addresses the complete accepted blocker set.
- Plan-manager can apply it without granting this skill independent authority.
- The only next request is changed-input repair round 2 bound to the exact
  repair-target digest.
