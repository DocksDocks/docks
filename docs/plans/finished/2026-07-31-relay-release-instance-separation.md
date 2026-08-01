---
title: Separate the relay release protocol from one release instance
goal: Move every release-instance identity out of the Session Relay release lane into per-version instance files so a release edits only the version declaration.
status: finished
created: "2026-07-29T12:10:41-03:00"
updated: "2026-08-01T04:50:13.846+00:00"
started_at: "2026-08-01T04:33:46.199+00:00"
finished_at: "2026-08-01T04:50:13.846+00:00"
assignee: null
tags: [plans, session-relay, release, refactor]
affected_paths:
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-publication.mjs
  - scripts/lib/session-relay-release-fixture.mjs
  - scripts/lib/session-relay-release-instances/0.13.0.json
  - scripts/lib/session-relay-release-instances/0.14.0.json
  - scripts/lib/session-relay-release-instances/schema.mjs
  - plugins/session-relay/test/release-instance-contract.mjs
  - plugins/session-relay/test/fixtures/release-identity-inventory.json
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
  - scripts/lib/plugins.mjs
related_plans: []
---

# Separate the relay release protocol from one release instance

## Goal

A Session Relay release stops requiring edits to release-attempt identity in lane
source. The single `export const VERSION` declaration stays the one intended lane
edit; every value that identifies one particular release attempt lives in a
per-version instance file that the lane loads by version, and the lane keeps only
protocol logic. Historical validation for 0.13.0 and 0.14.0 continues to pass
unchanged.

## Context & rationale

### Identity classes

Stated once here. The step-1 scan and acceptance rows A1, A3, A4, A9, and A11 all
cite this list and no other,
because an earlier draft let the scan classes and the inventory drift apart.

|Class|Pattern (quoted string literals only)|
|---|---|
|`uuid`|`'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'`|
|`commit40`|`'[0-9a-f]{40}'`|
|`digest64`|`'[0-9a-f]{64}'`|
|`planpath`|`'docs/plans/(active\|finished)/…'`|
|`escapedident`|`0\\.[0-9]+\\.[0-9]+` appearing in a regex literal, which a quoted-literal scan cannot see|

The first four classes count **quoted literals** only. `escapedident` exists
because a quoted-literal scan is structurally blind to a backslash-escaped version
inside a regex, which is how `CURRENT_PUBLIC_FINISHED_PLAN_PATH` kept a stale
0.14 binding past a version grep until `5d6b7c9` derived it. Exactly one
`escapedident` occurrence is permitted lane-wide: the historical 0.13 pin at
`scripts/lib/session-relay-release-promotion.mjs:57`. Any occurrence naming the
current version is a defect.

A path composed at runtime, such as
`` `docs/plans/active/${CURRENT_PUBLIC_PLAN_BASENAME}.md` `` at
`scripts/lib/session-relay-release-promotion.mjs:997` and `:1306`, is protocol
structure rather than attempt identity and is deliberately out of the scan.
Version literals and escaped version regexes are a separate concern, now closed:
`8df5adf` and `9a3a7f2` reduced the literals to the single `VERSION`
declaration, and `5d6b7c9` derived the one remaining current-version regex,
`CURRENT_PUBLIC_FINISHED_PLAN_PATH`, which had restated both versions in
backslash-escaped form where a version-literal grep could not see it. Exactly one
escaped version pattern remains in the lane, the historical 0.13 pin at
`scripts/lib/session-relay-release-promotion.mjs:57`, and it is meant to stay.

### Measured surface

Seven modules make up the lane. Census over each, counting the four
quoted-literal classes; `escapedident` is counted separately below because its
single permitted occurrence is a historical pin rather than a zero target:

|Module|`uuid`|`commit40`|`digest64`|`planpath`|total|
|---|--:|--:|--:|--:|--:|
|`session-relay-release.mjs`|0|0|0|0|0|
|`session-relay-release-core.mjs`|0|0|0|0|0|
|`session-relay-release-cli.mjs`|0|0|0|0|0|
|`session-relay-release-preparation.mjs`|6|5|10|10|31|
|`session-relay-release-promotion.mjs`|5|3|7|3|18|
|`session-relay-release-publication.mjs`|0|0|1|0|1|
|`session-relay-release-fixture.mjs`|0|0|0|1|1|

Deduplicated across the lane: **6 uuids, 6 commit40, 15 digest64, 10 planpath**.
Four modules hold identity, not two: `publication` holds one retained receipt
digest and `fixture` holds one plan path, so both are in scope. Only the barrel,
`core`, and `cli` hold none.

### Why a retry cannot reuse the lane

The lane carries **two distinct attempt identities**, not one:

|Group|Constants|
|---|---|
|current attempt|`CURRENT_GOAL_ID`, `CURRENT_DOCKS_RUN_ID`, `CURRENT_DOCKS_PLAN_PATH`, `CURRENT_DOCKS_SOURCE_BASE`, `CURRENT_PUBLIC_RUN_ID`|
|PlanRun attempt|`PLANRUN_DOCKS_RUN_ID`, `PLANRUN_DOCKS_PLAN_PATH`, `PLANRUN_DOCKS_SOURCE_BASE`, `PLANRUN_RELEASE_TAG_COMMIT`, `PLANRUN_DOCKS_AFFECTED_PATHS`|
|retained promotion|`RETAINED_PROMOTION_DOCKS_RUN_ID`|
|continuation paths|`CURRENT_BINDER_CONTINUATION_PATHS`, `PLANRUN_BINDER_CONTINUATION_PATHS`|
|public child|`CURRENT_PUBLIC_PLAN_PATH`, `CURRENT_PUBLIC_VERSION`, `CURRENT_PUBLIC_TAG`|
|legacy 0.13|`LEGACY_PUBLIC_PLAN_PATH`, `LEGACY_PUBLIC_BLOCKED_REASON`, `LEGACY_COMPANION_BASE_COMMIT`, `PINNED_LEGACY_COMPLETION`, `PINNED_LEGACY_COMPLETION_POLICY`, `PINNED_LEGACY_COMPLETION_STATE`|
|historical receipts|`HISTORICAL_RECEIPTS_0_13`, plus the retained digest in `publication`|
|authorized base|`AUTHORIZED_CURRENT_MAIN_BASE`|
|fixture|the plan path in `session-relay-release-fixture.mjs`|

`PLANRUN_DOCKS_AFFECTED_PATHS` freezes the exact path set that the 0.14.0 release
commit touched. Each new attempt has a new plan file, run id, and source base, so
the lane must be edited before it will accept the attempt. The 0.14.0 release ran
as `session-relay-correlated-results-release-remediation` base plus v2 through v9,
of which v9 alone reached `status: finished`; the rest are `blocked`. That is the
mechanism this plan removes.

A bump measured after `9a3a7f2` still leaves the release contracts red on 0.14-era
fixture data rather than version strings, on assertions reading
`prerelease body must announce Session Relay 0.…` and
`retained promotion fixture must be the exact i…`. Those fixtures are instance
data and belong in the instance files with the identity.

### What this run changes

The implementation already exists. The terminal predecessor built it and committed it at
`ff2465f6`, where it is fully green: the full gate exits 0, all eleven acceptance rows were
measured, and its completion review raised no defect in the code. What it raised was two
contradictions between that code and this plan's own acceptance text, and `plan_sha256` is
frozen once a run starts, so neither could be corrected in place.

This run therefore re-authorizes an implementation that is already on the branch, with both
wordings fixed. No lane byte changes. The acceptance manifest over the same fourteen
declared paths is identical at `ff2465f6` and at this run's implementation commit, because
the bytes those paths hold are the same; if a lane byte does change, that is a defect in
this run and STOP condition 8 applies. The Steps below stay `planned` because they describe
the work that commit performs, and they move to `done` at the implementation transition in
the ordinary way.

## Environment & how-to-run

Repository `DocksDocks/docks`, Node 24 with pnpm through corepack:

```
corepack enable && pnpm install --frozen-lockfile
node scripts/ci.mjs --plugin session-relay
```

The selected-plugin gate is authoritative for the lane, because
`scripts/lib/session-relay-release-*.mjs` is descriptor-owned release tooling for
`session-relay`. Run full `node scripts/ci.mjs` only if `scripts/lib/plugins.mjs`
changes in a way other plugins read.

No step contacts GitHub, npm, or any remote. Nothing here tags, pushes, or
publishes; the release itself is a separate goal with its own authority.

### The instance loader {mechanism}

`loadReleaseInstance(version)` in `scripts/lib/session-relay-release-core.mjs`
resolves `scripts/lib/session-relay-release-instances/<version>.json`, parses it,
and passes it through the closed-key validator from `schema.mjs` before returning
it frozen. It fails closed: an absent file, an unknown key, a malformed UUID, or a
non-40-hex commit each throw with a message naming the offending key. No caller
may read a raw instance file directly, so every consumer inherits validation.

Executable check: `node -e "import('./scripts/lib/session-relay-release-core.mjs').then((m) => m.loadReleaseInstance('0.13.0'))"`
exits 0, and substituting `9.9.9` exits non-zero naming the expected path.

### Behaviour preservation {mechanism}

The refactor is proven by the historical instances, not by the current one.
`0.13.0.json` and `0.14.0.json` carry the values extracted verbatim from the lane
constants they replace, so the existing 0.13 and 0.14 assertions in the release
contract suites must keep passing without their expectations being edited. If an
expectation has to change, behaviour changed and STOP condition 3 applies.

Executable check: `node scripts/ci.mjs --plugin session-relay` exits 0, and
`git diff` reports no change to the 0.13 and 0.14 expectation lines in the three
release contract suites - `release-promotion-contract.mjs`,
`release-publication-contract.mjs`, and `release-evidence-contract.mjs`, the last
of which holds 25 references to the modules being refactored and is declared for
that reason. Step 8 edits other lines in two of those files, and in the third only if a lane
export it imports moves, so the control is scoped to the historical expectation
lines specifically, not to whole files.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Write a failing contract that scans all seven lane modules for the five identity classes named in Context - requiring zero for the four quoted-literal classes, and for `escapedident` exactly the one permitted historical 0.13 pin and no current-version occurrence - reporting per-module and deduplicated counts. Persist that pre-migration census, the literal strings included, to `plugins/session-relay/test/fixtures/release-identity-inventory.json`, because steps 6-8 delete the very literals a later coverage check must still reason about. | `plugins/session-relay/test/release-instance-contract.mjs`, `plugins/session-relay/test/fixtures/release-identity-inventory.json` | — | `local` | `planned` | `node plugins/session-relay/test/release-instance-contract.mjs` exits non-zero and its deduplicated report reads 6 uuid, 6 commit40, 15 digest64, 10 planpath. The frozen inventory carries those same four counts and the literal behind each. If those four numbers differ, the scan disagrees with the Context census: reconcile before continuing rather than editing the census to match. |
| 2 | Define the instance shape and its validator with exactly one field group per row of the Context inventory table, which is the single authority for that list; do not restate the groups here. Reject unknown keys. Add `--case validator` feeding four malformed instances, `--case modules` reporting the per-module scan, and `--case coverage` mapping every literal in the **frozen** step-1 inventory - never a live re-scan - to a declared field. | `scripts/lib/session-relay-release-instances/schema.mjs`, `plugins/session-relay/test/release-instance-contract.mjs` | 1 | `local` | `planned` | `--case validator` exits 0 with four rejection messages no two of which match. `--case coverage` exits 0, first asserting the frozen inventory is non-empty and still holds 6 uuid, 6 commit40, 15 digest64, 10 planpath, then that no literal maps to zero fields. A literal MAY occupy more than one declared field when it is one value filling distinct roles, which the lane itself does - the same run id is both the current attempt and the retained promotion. Do not collapse two roles into one field because their values happen to match today. The split is pinned: 30 literals with a single home and 7 with several. STOP if a literal maps to NO field, or if the pinned split changes, since either means the schema no longer mirrors the lane. |
| 3 | Extract the 0.14.0 values verbatim from the lane into an instance file and prove byte equality against today's constants. | `scripts/lib/session-relay-release-instances/0.14.0.json` | 2 | `local` | `planned` | A temporary equality assertion shows every extracted value equals the lane constant it came from. Any mismatch STOPS: the extraction is wrong, not the lane. |
| 4 | Extract the 0.13.0 historical values the same way, so historical validation keeps its own instance. | `scripts/lib/session-relay-release-instances/0.13.0.json` | 2 | `local` | `planned` | Same verbatim equality against the `LEGACY_*` and `HISTORICAL_RECEIPTS_0_13` constants. STOP on any mismatch. |
| 5 | Add instance loading to the lane core, selecting by version and failing closed on an absent or invalid file. | `scripts/lib/session-relay-release-core.mjs` | 3, 4 | `local` | `planned` | Loading a known version returns the validated instance; an unknown version fails with a message naming the expected path. |
| 6 | Replace the preparation constants with instance reads, deleting the literals. | `scripts/lib/session-relay-release-preparation.mjs` | 5 | `local` | `planned` | `node scripts/ci.mjs --plugin session-relay` green and the step-1 scan reports zero across all four classes for this module, down from 31. |
| 7 | Replace the promotion constants with instance reads, deleting the literals. | `scripts/lib/session-relay-release-promotion.mjs` | 5 | `local` | `planned` | Same gate green and zero across all four classes for this module, down from 18. |
| 8 | Move the remaining identity out of `publication` and `fixture`. Move only the CURRENT version's fixture data into the instance files; every 0.13 and 0.14 historical expectation stays a literal in the suite that asserts it, so a mis-migrated value cannot validate itself against the file it came from. `release-evidence-contract.mjs` holds 25 references to these lane modules, more than either other suite, so update it only where the binder's runtime dependency graph requires it: that suite copies the current binder into a synthetic tree and imports it, so when the binder starts loading identity through the lane core and an instance file, the fixture must copy those with it or fail at import before reaching any assertion. Its 0.13 and 0.14 expectation lines stay literal like the rest, and no expectation value may change. | `scripts/lib/session-relay-release-publication.mjs`, `scripts/lib/session-relay-release-fixture.mjs`, `scripts/lib/session-relay-release-instances/0.14.0.json`, `plugins/session-relay/test/release-instance-contract.mjs`, `plugins/session-relay/test/release-publication-contract.mjs`, `plugins/session-relay/test/release-promotion-contract.mjs`, `plugins/session-relay/test/release-evidence-contract.mjs` | 6, 7 | `local` | `planned` | Both modules report zero across all four classes, and the assertions reading `prerelease body must announce` and `retained promotion fixture must be the exact` pass against an instance file rather than a literal, in the suites that own them, while every historical 0.13 and 0.14 expectation in those suites remains a literal. STOP if greening a historical assertion requires it to read the instance file. |
| 9 | Register the new contract in the plugin descriptor so CI runs it. | `scripts/lib/plugins.mjs` | 8 | `local` | `planned` | `node scripts/ci.mjs` - the FULL gate, because `plugins.mjs` is shared registry infrastructure that other plugins read - exits 0 and runs the new contract; removing it from the descriptor makes the gate stop reporting it. |
| 10 | Prove the outcome as a disposable probe owning no repository bytes: in a throwaway git worktree, add a synthetic `0.15.0` instance with fixture identity values, bump the single `VERSION` declaration, then run A1 and the instance-contract cases, the loader check, and a proof that a lane consumer reads a field from the synthetic instance. The full gate is deliberately not run here. | — | 9 | `local` | `planned` | Inside the throwaway worktree A1, A7, and A9 pass with a synthetic instance and no edit to any identity literal in a lane module, `loadReleaseInstance('0.15.0')` returns the validated synthetic instance, and at least one lane consumer reads a field from it - so the probe cannot pass with a loader that is present but unused. The full gate is explicitly NOT required here: `plugins/session-relay/test/distribution-contract.mjs` derives the tag from the bumped manifest and then requires the frozen archived 0.14.0 plan to contain it, which no bump can satisfy. Then `git worktree remove` plus `git worktree prune`, and A1 plus A2 pass again on the untouched repository. Any identity edit needed inside a lane module STOPS the plan as not achieved. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/release-instance-contract.mjs` | Exit 0; zero matches for the four quoted-literal Context identity classes across all seven lane modules, and `escapedident` reporting exactly one occurrence, the permitted historical 0.13 pin. |
| A2 | `node scripts/ci.mjs` | Exit 0. The full gate, since step 9 edits shared registry infrastructure. |
| A3 | `node plugins/session-relay/test/release-instance-contract.mjs --case modules` | Exit 0; the per-module report reads zero for all four quoted-literal classes in each of the seven lane modules. The alternation lives in the script's own regex rather than in a shell string, because a markdown table cell cannot carry a bare pipe character, and the backslash-escaped form means a **literal pipe** to `grep -E` - a pattern that matches nothing and so reports the success value before any work is done. |
| A4 | `sh -c "! grep -qE -e \"'[0-9a-f]{8}-[0-9a-f]{4}\" -e \"'[0-9a-f]{40}'\" -e \"'[0-9a-f]{64}'\" -e \"'docs/plans/\" scripts/lib/session-relay-release-preparation.mjs scripts/lib/session-relay-release-promotion.mjs scripts/lib/session-relay-release-publication.mjs scripts/lib/session-relay-release-fixture.mjs"` | Exit 0. An independent tripwire that shares no code with A1's scanner, wrapped in `sh -c` so the whole cell is one runnable command, and using repeated `-e` so no pipe character appears in it at all. Measured in both directions before being written down: against the pre-migration lane it exits 1 because the literals are still present, and against a file holding none it exits 0. It deliberately restates the patterns in shell form; that duplication is the point of an independent check, and STOP condition 6 catches the two drifting apart. |
| A5 | `node -e "import('./scripts/lib/session-relay-release-core.mjs').then((m) => m.loadReleaseInstance('0.13.0'))"` | Exit 0; the historical instance validates. |
| A6 | `node -e "import('./scripts/lib/session-relay-release-core.mjs').then((m) => m.loadReleaseInstance('9.9.9')).catch((e) => { console.log(e.message); process.exit(0); })"` | Exit 0 printing a message that names the expected instance path. |
| A7 | `node plugins/session-relay/test/release-instance-contract.mjs --case validator` | Exit 0; the validator rejects a missing key, an unknown key, a malformed run id, and a non-40-hex commit, and prints four distinct messages. |
| A8 | Loosen step 2's validator to accept unknown keys, run A7, then restore with `git checkout -- scripts/lib/session-relay-release-instances/schema.mjs` | observable: A7 fails on the unknown-key case specifically, proving the closed-key rejection is load-bearing rather than decorative. The restore is mechanical rather than hand-edited, because `schema.mjs` is a declared path whose bytes acceptance digests: after restoring, `git status --porcelain` must report nothing before any later row runs. A non-byte-exact restore would seal acceptance evidence over a mutated tree. |
| A9 | `node plugins/session-relay/test/release-instance-contract.mjs --case coverage` | Exit 0 against the frozen step-1 inventory. The case asserts the inventory is non-empty, that its deduplicated counts still equal the Context census - 6 uuid, 6 commit40, 15 digest64, 10 planpath - that no literal maps to zero fields, and that the declared split holds at exactly 30 single-home literals and 7 filling several roles. A path listed in an array that a scalar field already declares counts as a reference to it, not a second home. The census assertion is what keeps the row honest: steps 6-8 delete the literals, so coverage over a live re-scan would pass trivially on an empty set. |
| A10 | Run step 10's disposable probe end to end, then `git worktree remove` and `git worktree prune` | observable: the probe greens A1, A7, A9 and the loader check inside the worktree after editing only the single `VERSION` declaration and adding one instance file, which is the plan's success claim observed directly rather than inferred. Afterwards A1 and A2 pass again on the untouched repository and `git status --porcelain` is empty. The probe owns no repository bytes, so unlike A8 it cannot drift the tree acceptance digests. |
| A11 | `grep -rnE '0\\\.[0-9]+\\\.[0-9]+' scripts/lib/session-relay-release-*.mjs` | Exactly one line, and that line is the historical 0.13 pin in `session-relay-release-promotion.mjs`. The line NUMBER is deliberately not asserted: step 7 deletes constants above the pin, so a correct migration moves it - measured, from line 57 to line 65. A second line means a current-version identity is hiding in escaped regex form where the quoted-literal scan cannot see it, which is the shape `5d6b7c9` fixed. |

## Out of scope / do-NOT-touch

- Releasing Session Relay. This plan performs no tag, push, publication, or
  promotion, and the release is a separate goal needing its own live authority.
- `scripts/lib/session-relay-release.mjs` and `session-relay-release-cli.mjs`.
  Measured zero occurrences in all five identity classes; leave them.
- Runtime-composed plan paths such as
  `` `docs/plans/active/${CURRENT_PUBLIC_PLAN_BASENAME}.md` ``. They are protocol
  structure, and the quoted-literal patterns deliberately exclude them.
- The two deliberate source-text pins in
  `plugins/session-relay/test/distribution-contract.mjs` at the `Cargo.lock` and
  core `VERSION` assertions. They are the loud-bump tripwire and stay literal.
- `plugins/session-relay/rust/`. No Rust behaviour changes.
- Every plan under `docs/plans/finished/`. Historical records stay byte-identical,
  including the blocked 0.14.0 remediation attempts this plan cites.
- Retained receipt bytes under the operator's local state directory. They are
  evidence, not repository content, and are never rewritten.
- The record's own `repository_id`. It is inherited legacy identity in the older
  form - a `docks:` prefix ahead of an absolute working-copy path - rather than
  the `DocksDocks/docks` remote form adopted on 2026-07-29, the day this plan was
  created. Four plans carrying the older form have since passed review and
  archived. In `drafting` the self-check rule set runs enforcing and objects to it,
  but `repository_id` is an identity field bound by `assertPersistedTransition`:
  changing it is not a body edit, it would mean minting a further replacement whose
  identity disagrees with its own attempt history. `node scripts/ci.mjs` does not
  run that rule set, both gate plan checks pass, and the reviewer has already seen
  this identity twice - the predecessor spent both draft permits on a body carrying
  it and neither result mentions it. Disclosed rather than silenced, and left
  alone.

## STOP conditions

1. Step 3 or 4 finds a lane constant whose extracted value differs from the
   literal. The extraction is wrong; stop rather than "fixing" the lane to match.
2. Step 10 needs an edit to identity - a uuid, commit40, digest64, or planpath
   literal - inside a lane module to green the probe. The single `VERSION`
   declaration is exempt, being the intended one-line bump. The separation is
   otherwise incomplete and the plan has not met its goal; record which value
   forced the edit.
3. A historical assertion for 0.13.0 or 0.14.0 changes meaning to make the new
   loader pass. Historical validation is the control that proves the refactor
   preserved behaviour.
4. `node scripts/ci.mjs --plugin session-relay` fails twice with the same
   signature and no change in the relevant bytes between attempts.
5. The step-1 scan's deduplicated counts disagree with the Context census. One of
   them is wrong; reconcile by re-measuring, never by editing the census to match
   a scan.

6. A3 and A4 disagree - the contract's scanner reports zero while the independent
   shell tripwire still matches, or the reverse. A4 restates the identity patterns
   deliberately, so a disagreement means the two have drifted; reconcile them
   before trusting either, and never delete the one that is failing.
7. Step 8 has to change the exported signature of
   `scripts/lib/session-relay-release-fixture.mjs`. `session-relay-release-cli.mjs:2`
   imports `{ positionalPlugin, runFixture }` from it and is out of scope, so the
   move must keep both exports and source the plan path from the instance
   internally. A signature change pulls `cli` into scope, which is a scope change
   rather than an implementation detail.

8. A lane source byte differs between `ff2465f6` and this run's implementation commit.
   This run re-authorizes existing work and is not licensed to change it; a difference
   means the run has quietly become a second implementation and must stop.

## Open questions

None. The identity-class list, the seven-module scan set, instance directory
layout, per-version file naming, closed-key validation, the exclusion of
runtime-composed paths, and the decision to keep two literal tripwires in
`distribution-contract.mjs` are all settled above.

Plan-run: {"acceptance":{"source_sha256":"a5c5f97025f56baf85e057faac0afd8b2e0f067e2dfb462b7569b040db771ccb","verification_sha256":"958ac654528a29053854da4b8845612aa32bf18852495684bc84008f29dd997e"},"blocker":null,"completion_review":{"input_sha256":"0f8c5fd3c065fe433e0165104b10d87ebbd8ee2e722cad9f82280240723b3f21","invocations":1,"result_sha256":"219482f861b05acbc267f23afa95ad0459fab9867fe687545d9062486edfe373","state":"passed"},"draft_review":{"input_sha256":"3a7093f2651334cb130007c27f7e26c4e4d9d5038529012f94f2edab905213dc","invocations":2,"result_sha256":"9473e23f8a5519950342dff8d9fb5dbac3e7eac0b8ed53917bd55f729e0f1590","state":"passed"},"execution_parent":"8adee1ec1b541698ffe830ef9ef9377c55b60892","goal_id":"5c1600a6-7116-4e94-add0-978924b40ab9","implementation_commit":"968baa3e05c59d88fe6029cfa67d3b2264c3ae02","plan_path":"docs/plans/active/relay-release-instance-separation.md","plan_sha256":"0dc5e0cf7cf698deb234caa000fcde7e8f663a99687f1fcf2773d2af5397a847","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"5f914768-8da2-4202-b40a-fe41a0d265b2","schema":1,"source_base":"8adee1ec1b541698ffe830ef9ef9377c55b60892","source_sha256":"17e0795d0a5209c17893220d90001d0411d859b204b096b2463d902c871a38c3"}

## Review

Plan-attempt-history: {"authorization_source_sha256":"9df6158bcbc909c5f8bad59e17a1a82ad4a1e182c74679812f3af92c1dedd3e5","plan_bytes_sha256":"39279a1bcc0bb79fe0618985994dff9c5f204f677fd754e232c3ac4ffae8bdf0","replacement_run_id":"864d76a0-cfba-4791-a4f1-21e82e167e4b","run":{"acceptance":null,"blocker":{"evidence_sha256":"5443a3360f6edbf27e566d72328983711c7e0acf8463446dce58b38c190a9d5d","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"c1aad0578ffbe052d6993d66e71f7e53fca161d2c6b68add7b4dfe380b8850c9","invocations":2,"result_sha256":"5443a3360f6edbf27e566d72328983711c7e0acf8463446dce58b38c190a9d5d","state":"blocked"},"execution_parent":null,"goal_id":"5c1600a6-7116-4e94-add0-978924b40ab9","implementation_commit":null,"plan_path":"docs/plans/active/relay-release-instance-separation.md","plan_sha256":"a9634fe8b645478732c41fd656ad979820e5a65bfe5f2a467313d899517ab0b8","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"e50732d6-3f43-4a7b-9f2e-1ac3426d1190","schema":1,"source_base":"8f837731f6fec5373825619986c63a3add4b7ee1","source_sha256":"2938a6df16ea96c9e5e0380432d6a506ab3672bded188cf79e73e50ac122cf23"},"schema":1,"status":"blocked","successor_run_sha256":"ce074c1d9192218d350006013b71015e9a073016fa83f3fd8fa9d3dcb458c8d1"}

Plan-attempt-history: {"authorization_source_sha256":"9df6158bcbc909c5f8bad59e17a1a82ad4a1e182c74679812f3af92c1dedd3e5","plan_bytes_sha256":"6ac51e5db1d3c4419382990c7a9da6a95d94041abc3837c63124e45aa0218dfa","replacement_run_id":"5f914768-8da2-4202-b40a-fe41a0d265b2","run":{"acceptance":{"source_sha256":"82f8e659acc0135bc48d365ca2625be9d6d49ee91116efb1295418b1f7e914b5","verification_sha256":"9755bc775ec3bbf68d3ed40bb03a1d9f782921c52787e914fb3e52763987fabc"},"blocker":{"evidence_sha256":"4a1fc725c2f0f19177559e93411f6435e8fdd58b5d2e76938f669fbce55d5086","kind":"user_cancelled"},"completion_review":{"input_sha256":"c5424510b84ee7a406677c68818b270c36331dc96fbfd579c81d2f4bc14b5db3","invocations":1,"result_sha256":"4a1fc725c2f0f19177559e93411f6435e8fdd58b5d2e76938f669fbce55d5086","state":"cancelled"},"draft_review":{"input_sha256":"8cf72127f9bc791124caf9664dab8e2a67817756995e19a86897ddae789e83a1","invocations":1,"result_sha256":"935f7384bf3a68270d21122cf2f60fc4987fd3e54255672e7354e19bd361feda","state":"passed"},"execution_parent":"911c18d0df9e8c628c83e651fd87e37927b380d1","goal_id":"5c1600a6-7116-4e94-add0-978924b40ab9","implementation_commit":"ff2465f6b2f2fc844f387d1c99c47e3aa1521d9d","plan_path":"docs/plans/active/relay-release-instance-separation.md","plan_sha256":"aa26134d4b6a148a0ab493b0ce10f5c4817b158c6a6222e49403f1424a36efc3","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"864d76a0-cfba-4791-a4f1-21e82e167e4b","schema":1,"source_base":"911c18d0df9e8c628c83e651fd87e37927b380d1","source_sha256":"0ee34c5a7b863d8116154802dd347932610c478fb917e5c7377c76a360de37b0"},"schema":1,"status":"blocked","successor_run_sha256":"1b5cfcd51f8ea9db2f7f8683958d5247f5ac1aa785c0e6baac1b3f526a05fae2"}

This run replaces `864d76a0`, which reached a green implementation and then stopped. Its
completion review returned `repair` with two findings; both were reproduced against the
tree and accepted, and main context declined to spend the second permit on a repair that
only a replacement plan can make. The implementation stands at `ff2465f6`.

`C1` (`contradiction`, "Plan Step 2 and A9"): step 2's done-when said to stop if a frozen
literal maps to two schema fields, and A9 required each literal to map to exactly one.
Measured, 30 of 37 do and 7 fill two or three distinct declared roles - the same run id is
both the current attempt and the retained promotion, and the two legacy evidence records
each restate three digests. That is the lane's own shape: it declares those values twice
under different names. Collapsing the roles because the values match today would model them
wrongly, and the reviewer said so explicitly. The predecessor disclosed the gap in its
Verification Results and reported A9 as passed anyway, which is what made it a
contradiction rather than a note. Repaired by saying what is true in both places: step 2 and
A9 now authorize a literal occupying more than one declared field when it is one value in
distinct roles, pin the split at 30 and 7, and stop on a literal that maps to nothing or on
the pinned split changing.

`C2` (`contradiction`, "Plan Step 8"): step 8 permitted editing
`release-evidence-contract.mjs` only where a lane export it imports moves. Measured, that
suite imports no lane export at all - only Node builtins - and the core gained an export
rather than moving one, so the precondition never held. The change was still necessary: the
suite copies the current binder into a synthetic tree and imports it, and the binder now
loads identity through the core and an instance file, so copying it alone fails at import
before any assertion runs. The dependency graph changed, not an export. Repaired by saying
that: the clause now covers the binder's runtime dependencies, and still forbids any
expectation value from changing.

Both repairs are wording. No acceptance row was weakened to fit the implementation: A9 gained
a pinned split that fails if the multiplicity changes, and step 8 kept its prohibition on
touching historical expectations. The rows the predecessor already satisfied are unchanged.

## Verification Results

This run re-authorizes an implementation that already existed. The terminal predecessor
built and committed it at `ff2465f6`; this run corrects the acceptance wordings that
contradicted it and re-runs every row. STOP condition 8 was checked first and holds:
`git diff ff2465f6 HEAD` over all fourteen declared paths is empty, so no lane byte
changed and the evidence below describes the same bytes the predecessor measured.

Every command below was run at the repository root. Exit codes, counts and summary lines
are copied from the runs rather than reconstructed.

### A1 - the lane holds no identity literal

```
node plugins/session-relay/test/release-instance-contract.mjs
exit: 0
  deduplicated: 0 uuid, 0 commit40, 0 digest64, 0 planpath
  escapedident: 1 occurrence(s)
release instance contract: lane scan clean across 7 modules
```

Before the migration the same command exited non-zero reporting `6 uuid, 6 commit40,
15 digest64, 10 planpath`, which is step 1's done-when and the control that makes this
zero meaningful: the scanner is known to detect these literals, so finding none is the
work rather than a scan that never matched.

### A2 - the full gate

```
node scripts/ci.mjs
exit: 0
All ci.mjs checks passed - 3 plugin(s) + repo-wide; safe to release.
```

The full gate rather than the selected-plugin gate, because step 9 edits
`scripts/lib/plugins.mjs`, which other plugins read.

**One failure is on the record**, from the predecessor run on these same bytes. Across both
runs the gate has now run five times on this implementation: green, green, one failure,
green, and green again here on the first attempt.

```
✘ session-relay source check failed (run: node plugins/session-relay/test/workspace-smoke.mjs
  --case single-session-compat --bin <ci temp>/relay)
```

The case was then run alone against a release binary built from the same tree and passed:
`PASS workspace_smoke case=single-session-compat`, exit 0. No repository byte changed
between any of the four attempts - the tree was committed at `ff2465f6` and
`git status --porcelain` was empty throughout. `workspace-smoke` exercises relay workspace
coordination, which this plan does not touch; the migration is confined to release-lane
identity and cannot reach it. This host has already produced one environment-dependent
failure in the same lane earlier today, a missing delegated cgroup, so I record it as
environmental. STOP condition 4 needs two failures with the same signature and no byte
change; there was one, so the condition did not fire.

### A3 - per-module, inside the contract

```
node plugins/session-relay/test/release-instance-contract.mjs --case modules
exit: 0
release instance contract: per-module scan clean across 7 modules
```

### A4 - an independent tripwire

```
sh -c "! grep -qE -e \"'[0-9a-f]{8}-[0-9a-f]{4}\" -e \"'[0-9a-f]{40}'\" -e \"'[0-9a-f]{64}'\" \
  -e \"'docs/plans/\" <the four identity-bearing lane modules>"
exit: 0
```

Non-vacuity was measured, not assumed. The same command against the pre-migration lane
matched 32, 18, 1 and 1 lines and exited 1; against a file holding none it exits 0. It
shares no code with A1's scanner.

### A5 and A6 - the loader

```
node -e "import('./scripts/lib/session-relay-release-core.mjs').then((m) => m.loadReleaseInstance('0.13.0'))"
exit: 0

node -e "...loadReleaseInstance('9.9.9')).catch((e) => { console.log(e.message); process.exit(0); })"
exit: 0
release instance for 9.9.9 is missing: expected scripts/lib/session-relay-release-instances/9.9.9.json
```

### A7 - the validator rejects four shapes distinctly

```
node plugins/session-relay/test/release-instance-contract.mjs --case validator
exit: 0
  rejects a missing key        probe is missing required field fixture.plan_path
  rejects an unknown key       probe carries unknown field fixture.extra
  rejects a malformed run id   probe field current_attempt.goal_id must be a uuid, received "not-a-uuid"
  rejects a non-40-hex commit  probe field authorized_base.current_main_base must be a 40-hex commit, received "abc123"
release instance contract: validator rejected 4 shapes distinctly
```

The case also pins a loader defect found while writing it. `loadReleaseInstance` memoises
per version, and the required-group check originally rode along with the parse, so the
first call for a version decided the requirement for every later one - a caller needing
`current_attempt` would have passed because an earlier caller loaded the same version
without requiring it. The check now runs against the cache on every call, and the case
loads `0.13.0` unrequired and then required, asserting the second call still throws.

### A8 - the closed-key rejection is load-bearing

`if (!(key in fields))` in the validator replaced with `if (false)`, then A7 re-run:

```
node plugins/session-relay/test/release-instance-contract.mjs --case validator
exit: 1
AssertionError: the validator accepted an unknown key
```

Exactly the unknown-key case failed. Restored mechanically rather than by hand, because
`schema.mjs` is a declared path whose bytes acceptance digests:

```
git checkout -- scripts/lib/session-relay-release-instances/schema.mjs
git status --porcelain   ->  0 entries
node plugins/session-relay/test/release-instance-contract.mjs --case validator  ->  exit 0
```

### A9 - coverage, against the frozen inventory

```
node plugins/session-relay/test/release-instance-contract.mjs --case coverage
exit: 0
  literals in the frozen inventory : 37
  mapped to exactly one field      : 30
  one value, several roles         : 7
release instance contract: every scanned identity literal maps to a declared field
```

Zero literals map to no field, and the frozen census still reads 6 uuid, 6 commit40,
15 digest64, 10 planpath. The census assertion is what stops the row being vacuous: steps
6-8 delete these literals, so coverage over a live re-scan would map an empty set.

Proven non-vacuous by injection. Replacing one inventory literal with an unmapped value,
leaving the census untouched, fails the case naming it -
`identity literals map to no schema field: ffffffffffffffffffffffffffffffffffffffff`,
exit 1 - and restoring the file byte-identically returns it to exit 0.

The split matches what the plan now requires. Step 2 and A9 authorise a literal occupying
more than one declared field when it is one value in distinct roles, and pin the count at
30 single-home and 7 multi-role; the case fails if either number moves. The seven are the
lane's own duplication - the same run id is both the current attempt and the retained
promotion, and the two legacy evidence records each restate three digests. They are printed
on every run:

|Value|Roles|
|---|---|
|`88732ba0-…`|`current_attempt.docks_run_id` + `retained_promotion.docks_run_id`|
|`cd8ec18d-…`|`legacy_0_13.pinned_completion.seriesId` + `…pinned_completion_state.series_id`|
|`064e08a4…`|`…pinned_completion.settledStateSha256` + `…pinned_completion_state.state_sha256`|
|`52753996…`|`…pinned_completion.planInputSha256` + `…_state.initial_input_sha256` + `…_state.current_input_sha256`|
|`docs/plans/active/…-remediation-v4.md`|`current_attempt.docks_plan_path` + `retained_promotion.docks_plan_path`|
|`docs/plans/active/…-workspace-publication.md`|`authorized_base.shipped_to_promoted_paths` + `…authorized_base_to_promoted_paths`|
|`docs/plans/active/…-recertification.md`|`current_attempt.release_plan_path` + `legacy_0_13.pinned_completion_state.plan_path`|

A path listed in an array that a scalar field already declares counts as a reference to it
rather than a second home, which is the rule A9 states.

### A10 - the disposable probe

A detached worktree under `$XDG_DATA_HOME/agent-worktrees/`, never `/tmp`, carrying the
staged migration, then two edits: `VERSION` bumped to `0.15.0` - asserted to change exactly
one line - and one synthetic `0.15.0` instance whose identity values appear nowhere else.

```
  carried 12 staged path(s) into the probe worktree
  ok: plugins/session-relay/test/release-instance-contract.mjs
  ok: plugins/session-relay/test/release-instance-contract.mjs --case validator
  ok: plugins/session-relay/test/release-instance-contract.mjs --case coverage
  lane consumer resolved the synthetic instance with 0.14.0.json absent
  worktree removed and pruned: gone
probe: releasing needs one VERSION line plus one instance file
exit: 0
```

`git status` inside the worktree showed only those two paths beyond the carried migration.
`loadReleaseInstance('0.15.0')` returned the synthetic goal id, not the real one. The
consumer check is the part that cannot be faked: `0.14.0.json` is moved aside and
`session-relay-release-preparation.mjs` still imports cleanly in a fresh process, so the
binder followed `VERSION` to the new instance rather than keeping a 0.14.0 binding. A
loader that were present but unused would fail there.

Afterwards, on the untouched repository at `ff2465f6`:

```
node plugins/session-relay/test/release-instance-contract.mjs   ->  exit 0
node scripts/ci.mjs                                             ->  exit 0
git status --porcelain                                          ->  0 entries
```

The probe writes nothing to the repository. An earlier draft of it appended to
`.git/info/exclude`; from a linked worktree `git rev-parse --git-path info/exclude`
resolves to the parent repository, so that would have left a permanent mark. Measured,
removed, and the real exclude file still contains no such entry.

### A11 - exactly one escaped version pattern

```
grep -rnE '0\\.[0-9]+\\.[0-9]+' scripts/lib/session-relay-release-*.mjs
scripts/lib/session-relay-release-promotion.mjs:65:  /^docs\/plans\/finished\/\d{4}-\d{2}-\d{2}-session-relay-cli-0\.13\.0-production-release\.md$/;
lines: 1
```

A11 deliberately does not assert a line number. Step 7 deletes constants above the pin, so
a correct migration moves it - measured, from line 57 to line 65 - while the property the
row protects is unchanged: exactly one escaped version pattern lane-wide, it is the
historical 0.13 declaration in `session-relay-release-promotion.mjs`, and none names the
current version. The contract asserts it by module and occurrence count for the same reason.

### Behaviour preservation

The historical 0.13 and 0.14 expectations in the three release contract suites are
unchanged and still pass. The migration is behaviour-preserving by construction: all 37
identity values were extracted from the lane by importing the modules and reading the
constants, then 48 of them were byte-compared against the literals in the source before
any file was written.

`release-evidence-contract.mjs` needed one change. It copies the current binder into a
synthetic tree and imports it, and the binder now imports `loadReleaseInstance` from the
lane core, which loads an instance file. The fixture copied the binder alone, so the import
failed before reaching any assertion. It now copies the binder together with the core and
the instance files it needs. No 0.13 or 0.14 expectation value changed, so STOP condition 3
did not fire; that condition covers a historical assertion changing meaning to make the new
loader pass, which is not what happened.

### Controls that held

STOP condition 5 was exercised and passed: the step-1 scan's deduplicated counts had to
match the Context census before the inventory would freeze, and they matched exactly at
6 uuid, 6 commit40, 15 digest64, 10 planpath. STOP condition 7 was not reached:
`session-relay-release-fixture.mjs` still exports `positionalPlugin` and `runFixture`
unchanged, so `session-relay-release-cli.mjs` stayed out of scope as declared.
