# PlanRunV1

```text
ReviewPhaseV1 = {
  state:"not_required"|"not_started"|"reserved"|"transport_retried"|"retryable"|"repairing"|"passed"|"degraded"|"blocked"|"cancelled",
  invocations:0|1|2, input_sha256:null|64hex, result_sha256:null|64hex
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
```

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
