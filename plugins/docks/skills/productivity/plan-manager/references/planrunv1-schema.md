# PlanRunV1

```text
ReviewPhaseV1 = {
  state:"not_required"|"not_started"|"reserved"|"transport_retried"|"retryable"|"repairing"|"passed"|"degraded"|"blocked"|"cancelled",
  invocations:integer, input_sha256:null|64hex, result_sha256:null|64hex,
  accepted_classes?:sorted-unique-array<closed-v1-plan-finding-class>
}
PlanRunV1 = {
  schema:1, goal_id:uuid, run_id:uuid, repository_id:string,
  plan_path:normalized-relative-path, requested_effects:["local", ...external],
  risk:"local"|"sensitive"|"external",
  plan_sha256:64hex, source_base:null|40hex, source_sha256:64hex,
  draft_review:ReviewPhaseV1, execution_parent:null|40hex,
  implementation_commit:null|40hex, completion_review:ReviewPhaseV1,
  acceptance:null|{source_sha256:64hex,verification_sha256:64hex},
  blocker:null|{kind:"user_decision"|"missing_authority"|"concurrent_change"|"user_cancelled"|"verification_failed"|"review_failed"|"legacy_invalid",evidence_sha256:64hex}
}

PlanAttemptHistoryV1 = {
  schema:1, authorization_source_sha256:64hex, plan_bytes_sha256:64hex,
  replacement_run_id:uuid, successor_run_sha256:64hex,
  run:PlanRunV1, status:"blocked"
}

PlanRunReplacementAuthorityV1 = {
  schema:1, goal_id:uuid, repository_id:string,
  plan_path:normalized-relative-path, run_id:predecessor-uuid,
  source_sha256:64hex, successor_run_sha256:64hex
}
```

On read, an absent `accepted_classes` field is the empty set. Every legal draft
review transition emits the field. Draft review permits are bounded by one
initial invocation plus the eleven closed v1 finding classes. An accepted
`repair` atomically unions only explicit, validated, previously unseen finding
classes into the persisted sorted set; a result containing any already accepted
class, including a mixed seen/unseen result, enters the terminal
`review_failed` block without adding classes. Completion review never continues
by class: its accepted set remains empty and its invocation ceiling remains two.
The first transport failure still refunds one invocation in either phase.

`repository_id + plan_path + run_id` is the run identity. Exact current-user
`PlanRunReplacementAuthorityV1` binds the terminal predecessor and exact
successor-run digest for the same goal/repository/path. Append predecessor
run/bytes/authority digests, then install fresh review baselines in that file.
Replacement is never automatic and never reuses predecessor permits or evidence.
Cross-repository goals join repository-qualified child runs by `goal_id`; effects
are unique, canonical-ordered, and begin with `local`.

`plan_sha256` excludes only lifecycle status/timestamps, `Plan-run`, `## Review`,
and `## Verification Results`. Goal, scope, paths, steps, effects, safety,
acceptance, and decisions stay bound. `source_base + source_sha256` binds a
sorted existence/kind/mode/content manifest of every affected path at review
time, including dirty/untracked bytes and tombstones. Acceptance binds the final
affected-path manifest and canonical Verification Results bytes. Never list the
plan record in `affected_paths`; acceptance writes to it and breaks that bind.

`source_base` is null only before draft review starts and is required thereafter.
`execution_parent` is null before start and is required, immutable, and exclusive
to `ongoing`, post-start `blocked`, and `finished` tuples.
`successor_run_sha256` is the exact install-time successor digest checked by the
replacement transaction and retained as audit evidence; normal later lifecycle
transitions neither recompute nor rewrite it.
