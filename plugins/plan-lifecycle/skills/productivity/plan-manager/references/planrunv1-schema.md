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
Review phase ranges are closed:

| Phase state | Draft invocations | Completion invocations |
|---|---:|---:|
| `not_required` | 0, local risk only | 0 |
| `not_started` | 0 | 0 |
| `reserved` | 1–2 | 1–2 |
| `transport_retried` | 1–2 | 1–2 |
| `retryable` | 0–1 | 0–1 |
| `repairing` | 1 | 1 |
| `passed` | 1–2 | 1–2 |
| `degraded` | 1–2 | forbidden |
| `blocked` | 1–2 | 1–2 |
| `cancelled` | 1–2 | 1–2 |


On read, an absent `accepted_classes` field is the empty set.
`accepted_classes` remains valid for historical records but is written by no
current transition. Draft review has one initial review and, only after an
accepted repair, one mandatory fresh verification, with a ceiling of two
substantive invocations. A draft repair verdict is accepted at most once; any
further repair or new finding after the mandatory verification terminal-blocks
the run with `review_failed` evidence. Completion review has the same
two-invocation ceiling. The first transport failure still refunds one invocation
in either phase.

At local risk the deterministic self-check gate is the draft gate and
`draft_review` may be `not_required`; sensitive or external risk always requires
a passed substantive draft review, and no risk reduces the completion review. The
gate transition is `not_started → not_required`: it spends no permit and binds no
digests.

`repository_id + plan_path + run_id` is the run identity. Exact current-user
`PlanRunReplacementAuthorityV1` binds the terminal predecessor and exact
successor-run digest for the same goal/repository/path. Append predecessor
run/bytes/authority digests, then install fresh review baselines in that file.
Replacement is never automatic and never reuses predecessor permits or evidence.
Cross-repository goals join repository-qualified child runs by `goal_id`; effects
are unique, canonical-ordered, and begin with `local`.

For an unmarked plan, `plan_sha256` keeps its byte-compatible legacy canonical
view: it excludes only lifecycle status/timestamps, `Plan-run`, `## Review`, and
`## Verification Results`. Goal, scope, paths, steps, effects, safety,
acceptance, and decisions stay bound.

A new or successor plan opts into `plan_hash_mode: status-excluded-v1`. Its
canonical view requires exactly one unfenced `## Steps` section containing the
canonical legacy or `Id`-bearing Steps table and normalizes only each validated
row's `Status` cell. The header, row identity/order, every non-Status cell, all
non-Steps tables, and fenced examples remain bound. Malformed rows, duplicate
identities, and unknown states fail closed. An all-`planned` marked bootstrap
validates with either its legacy full-body digest or normalized digest.

Only `transactPlanRun` may advance Steps state. The write requires an `ongoing`
run, no `reserved` or `transport_retried` review phase, at least one row change,
unchanged row identities/order, and only closed transitions:
`planned → in-flight | done | blocked | skipped`; `in-flight → done | blocked |
skipped`; and `blocked → in-flight | done | skipped`. `done` and `skipped` are
terminal. The same atomic write may change only the matching frontmatter
`updated` timestamp and, on the first progress from a legacy-digest bootstrap,
`plan_sha256` to the normalized digest. Every other byte is unchanged. Blocked
and finished PlanRun bytes remain immutable.

`source_base + source_sha256` binds a sorted existence/kind/mode/content
manifest of every affected path at review time, including dirty/untracked bytes
and tombstones. Acceptance binds the final affected-path manifest and canonical
Verification Results bytes. Never list the plan record in `affected_paths`;
acceptance writes to it and breaks that bind.

A scope omission — most often an `affected_paths` gap — discovered before
acceptance is amended in place. One `ongoing -> ongoing` transition may change
`plan_sha256`, `source_base`, and `source_sha256` and no other field, provided
neither review phase is `reserved` or `transport_retried`,
`completion_review.state` is not `passed`, and `acceptance` is null. After
acceptance is minted its scope is settled and only a replacement may change it.

`source_base` is null only before draft review starts and is required thereafter,
including once the self-check gate settles `draft_review` to `not_required`.
`execution_parent` is null before start and is required, immutable, and exclusive
to `ongoing`, post-start `blocked`, and `finished` tuples.
`successor_run_sha256` is the exact install-time successor digest checked by the
replacement transaction and retained as audit evidence; normal later lifecycle
transitions neither recompute nor rewrite it.
