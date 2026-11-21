### Code review round 1

Code-review: pass

## Standards

- [MEDIUM] Bug - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs:1139 - If another agent claims the plan after the final snapshot, `preWriteIssue` can return that foreign assignee, but `writeReopen` discards everything except `id` and proceeds to reopen, comment, and claim using stale ownership. This bypasses the foreign-owner refusal. Carry the acting viewer ID into this function, recheck the returned assignees, and derive the claim from that latest read before constructing the mutation.

## Spec

None.
