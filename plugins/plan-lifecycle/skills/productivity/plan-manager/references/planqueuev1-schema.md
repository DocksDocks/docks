# PlanQueueV1 schema

PlanQueueV1 is an optional discovery and prioritization view for a plan workspace. It grants no lifecycle, review,
mutation, scheduling, or external-effect authority. It never starts work. PlanRunV1 records, current user intent, and
the applicable effect authority remain authoritative.

## Contents

- [File shape](#file-shape)
- [Columns](#columns)
- [Goal resolution](#goal-resolution)
- [Dependency validation](#dependency-validation)
- [Eligibility and blocking](#eligibility-and-blocking)
- [Rejections](#rejections)
- [Setters and durability](#setters-and-durability)

## File shape

A present `docs/plans/QUEUE.md` contains exactly one unfenced marker line:

```text
Plan-queue: PlanQueueV1
```

It also contains exactly one unfenced queue table with these literal first two lines:

```text
| Stage | Goal ID | Plan | Depends on | Why |
|---:|---|---|---|---|
```

The table may have zero or more rows. It is an explicit subset of the workspace, not an inventory. Creating or
archiving an unrelated plan does not invalidate it. A workspace with no queue file remains valid.

Rows are ordered by increasing `Stage`; existing table order breaks ties. Same-stage rows may run in parallel.

## Columns

- `Stage` is a positive base-10 integer. It controls priority among otherwise eligible rows, not permission to work.
- `Goal ID` is a lowercase UUID and is the row identity. Each queued goal id occurs once.
- `Plan` is nonempty text enclosed in one pair of backticks. It MUST equal the resolved current record's frontmatter
  `title` character for character. It is rendered convenience derived from that title and is never an identity or a
  selection input. A title change makes the queue stale until a setter refreshes the label.
- `Depends on` is an em dash (`—`) or a comma-separated list of queued goal ids. Every dependency is unique in its
  row and must be in a strictly earlier stage.
- `Why` is a nonempty, single-line human reason. It conveys intent but grants no authority.

## Goal resolution

Resolution recursively scans Markdown files below `docs/plans/active/` and `docs/plans/finished/`. Each file is
attempted with `validatePlanRun` in recorded-proof mode. A file that cannot bind as a current PlanRunV1 record is
silently skipped; historical schema-1 through schema-6 evidence and record-free Markdown therefore do not block a
valid queue.

For each QUEUED goal id, exactly one current PlanRunV1 record must resolve across both directories. Zero records is
a dangling goal; two or more records is an ambiguous goal. Both fail. Global goal uniqueness is false and MUST NOT
be asserted: historical archives can legitimately repeat a goal id, and only queued ids receive this cardinality
check. The resolved repository-relative path and PlanRun status are derived data. Moving the one current record from
active to finished does not change queue identity.

## Dependency validation

Dependencies must name queued rows at earlier stages. The complete directed graph must be acyclic. Direct and
transitive dependency closure is computed from goal ids only.

A resolved row in `ongoing` or `finished` state contradicts the queue when any dependency in its closure is not
`finished`; validation fails rather than treating the queue as retrospective authority. Planned, scheduled, or
blocked rows may wait on unfinished dependencies.

## Eligibility and blocking

A row is eligible exactly when both conditions hold:

1. its resolved PlanRun status is `planned` or `scheduled`; and
2. every explicit direct and transitive dependency resolves to a `finished` PlanRun.

`next` returns EVERY eligible row, ordered by stage and then by table order within a stage. More than one plan may be
started at once, so the result is a startable set and its order is a priority recommendation, not a permission ladder:
the caller may start any row in the set, and starting one never invalidates another. `next` imposes no global stage
barrier — a non-finished row blocks only its transitive dependents, so an independent higher-stage row is returned even
while lower-stage work is still open. The blocked report lists each waiting row and every non-finished goal in its
dependency closure, in table order. `ongoing`, `blocked`, and `finished` rows are never eligible.

## Rejections

Validation rejects with a specific reason for each of the following:

- a missing or duplicated unfenced marker;
- a missing, duplicated, or malformed queue table or row;
- a non-positive or non-integer stage, or rows not ordered by stage;
- a non-lowercase UUID or duplicated queued goal id;
- an empty reason;
- a dependency naming an unqueued goal;
- a dependency at the same or a later stage;
- a dependency cycle;
- a `Plan` label different from the resolved frontmatter title;
- a queued goal resolving to zero or more than one current PlanRunV1 record; or
- dependency state contradicting the resolved PlanRun statuses.

## Setters and durability

`add`, `move`, and `remove` require the exact SHA-256 of the current queue bytes. They mutate queue bytes only. A
move also refreshes its derived `Plan` label from the uniquely resolved record title. No setter writes a plan,
reserves review, transitions a PlanRun, schedules time, dispatches work, or grants an effect.

Before changing queue bytes, a setter verifies the preimage and validates the complete successor. It then acquires
one exclusive lock with O_EXCL creation. The owner record carries hostname, pid, expected preimage, and a random
nonce. A held live or foreign lock fails. A stale lock may be reclaimed only after verifying that its same-host owner
pid is dead and that the exact queue preimage is unchanged.

Under the lock, the setter verifies the preimage and complete successor again. It writes a same-directory temporary
file, fsyncs that file, rechecks the preimage, atomically renames the temporary file, and fsyncs the directory. It
then reads the committed bytes back, checks byte equality, revalidates the full queue, and returns the new byte
SHA-256 and resolved rows. Stale, contended, or invalid operations fail before any queue write.
