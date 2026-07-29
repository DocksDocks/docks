---
title: Separate the relay release protocol from one release instance
goal: Move every release-instance identity out of the Session Relay release lane into per-version instance files so a release edits only the version declaration.
status: blocked
created: "2026-07-29T12:10:41-03:00"
updated: "2026-07-29T18:40:58.806+00:00"
started_at: null
finished_at: null
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
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
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
release contract suites. Step 8 does edit other lines in two of those files, so the
control is scoped to the historical expectation lines specifically, not to whole
files.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Write a failing contract that scans all seven lane modules for the five identity classes named in Context - requiring zero for the four quoted-literal classes, and for `escapedident` exactly the one permitted historical 0.13 pin and no current-version occurrence - reporting per-module and deduplicated counts. | `plugins/session-relay/test/release-instance-contract.mjs` | — | `local` | `planned` | `node plugins/session-relay/test/release-instance-contract.mjs` exits non-zero and its deduplicated report reads 6 uuid, 6 commit40, 15 digest64, 10 planpath. If those four numbers differ, the scan disagrees with the Context census: reconcile before continuing rather than editing the census to match. |
| 2 | Define the instance shape and its validator with exactly one field group per row of the Context inventory table, which is the single authority for that list; do not restate the groups here. Reject unknown keys. Add `--case validator` feeding four malformed instances, and `--case coverage` mapping every scanned literal to exactly one field. | `scripts/lib/session-relay-release-instances/schema.mjs`, `plugins/session-relay/test/release-instance-contract.mjs` | 1 | `local` | `planned` | `--case validator` exits 0 with four rejection messages no two of which match, and `--case coverage` exits 0 reporting zero unmapped literals. STOP if a literal maps to no field or to two, since the executor would then have to invent schema shape. |
| 3 | Extract the 0.14.0 values verbatim from the lane into an instance file and prove byte equality against today's constants. | `scripts/lib/session-relay-release-instances/0.14.0.json` | 2 | `local` | `planned` | A temporary equality assertion shows every extracted value equals the lane constant it came from. Any mismatch STOPS: the extraction is wrong, not the lane. |
| 4 | Extract the 0.13.0 historical values the same way, so historical validation keeps its own instance. | `scripts/lib/session-relay-release-instances/0.13.0.json` | 2 | `local` | `planned` | Same verbatim equality against the `LEGACY_*` and `HISTORICAL_RECEIPTS_0_13` constants. STOP on any mismatch. |
| 5 | Add instance loading to the lane core, selecting by version and failing closed on an absent or invalid file. | `scripts/lib/session-relay-release-core.mjs` | 3, 4 | `local` | `planned` | Loading a known version returns the validated instance; an unknown version fails with a message naming the expected path. |
| 6 | Replace the preparation constants with instance reads, deleting the literals. | `scripts/lib/session-relay-release-preparation.mjs` | 5 | `local` | `planned` | `node scripts/ci.mjs --plugin session-relay` green and the step-1 scan reports zero across all four classes for this module, down from 31. |
| 7 | Replace the promotion constants with instance reads, deleting the literals. | `scripts/lib/session-relay-release-promotion.mjs` | 5 | `local` | `planned` | Same gate green and zero across all four classes for this module, down from 18. |
| 8 | Move the remaining identity out of `publication` and `fixture`. Move only the CURRENT version's fixture data into the instance files; every 0.13 and 0.14 historical expectation stays a literal in the suite that asserts it, so a mis-migrated value cannot validate itself against the file it came from. | `scripts/lib/session-relay-release-publication.mjs`, `scripts/lib/session-relay-release-fixture.mjs`, `scripts/lib/session-relay-release-instances/0.14.0.json`, `plugins/session-relay/test/release-instance-contract.mjs`, `plugins/session-relay/test/release-publication-contract.mjs`, `plugins/session-relay/test/release-promotion-contract.mjs` | 6, 7 | `local` | `planned` | Both modules report zero across all four classes, and the assertions reading `prerelease body must announce` and `retained promotion fixture must be the exact` pass against an instance file rather than a literal, in the suites that own them, while every historical 0.13 and 0.14 expectation in those suites remains a literal. STOP if greening a historical assertion requires it to read the instance file. |
| 9 | Register the new contract in the plugin descriptor so CI runs it. | `scripts/lib/plugins.mjs` | 8 | `local` | `planned` | `node scripts/ci.mjs` - the FULL gate, because `plugins.mjs` is shared registry infrastructure that other plugins read - exits 0 and runs the new contract; removing it from the descriptor makes the gate stop reporting it. |
| 10 | Prove the outcome as a disposable probe owning no repository bytes: in a throwaway git worktree, add a synthetic `0.15.0` instance with fixture identity values, bump the single `VERSION` declaration, then run A1 and the instance-contract cases only. | — | 9 | `local` | `planned` | Inside the throwaway worktree A1, A7, and A9 pass with a synthetic instance and no edit to any identity literal in a lane module, `loadReleaseInstance('0.15.0')` returns the validated synthetic instance, and at least one lane consumer reads a field from it - so the probe cannot pass with a loader that is present but unused. The full gate is explicitly NOT required here: `plugins/session-relay/test/distribution-contract.mjs` derives the tag from the bumped manifest and then requires the frozen archived 0.14.0 plan to contain it, which no bump can satisfy. Then `git worktree remove` plus `git worktree prune`, and A1 plus A2 pass again on the untouched repository. Any identity edit needed inside a lane module STOPS the plan as not achieved. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/release-instance-contract.mjs` | Exit 0; zero matches for the four quoted-literal Context identity classes across all seven lane modules, and `escapedident` reporting exactly one occurrence, the permitted historical 0.13 pin. |
| A2 | `node scripts/ci.mjs` | Exit 0. The full gate, since step 9 edits shared registry infrastructure. |
| A3 | `grep -cE "'[0-9a-f]{8}-[0-9a-f]{4}\|'[0-9a-f]{40}'\|'[0-9a-f]{64}'" scripts/lib/session-relay-release-preparation.mjs scripts/lib/session-relay-release-promotion.mjs` | `0` for both files. |
| A4 | `grep -cE "'docs/plans/(active\|finished)/" scripts/lib/session-relay-release-preparation.mjs scripts/lib/session-relay-release-promotion.mjs scripts/lib/session-relay-release-fixture.mjs` | `0` for all three files. Runtime-composed paths are excluded by the quoted-literal pattern. |
| A5 | `node -e "import('./scripts/lib/session-relay-release-core.mjs').then((m) => m.loadReleaseInstance('0.13.0'))"` | Exit 0; the historical instance validates. |
| A6 | `node -e "import('./scripts/lib/session-relay-release-core.mjs').then((m) => m.loadReleaseInstance('9.9.9')).catch((e) => { console.log(e.message); process.exit(0); })"` | Exit 0 printing a message that names the expected instance path. |
| A7 | `node plugins/session-relay/test/release-instance-contract.mjs --case validator` | Exit 0; the validator rejects a missing key, an unknown key, a malformed run id, and a non-40-hex commit, and prints four distinct messages. |
| A8 | Loosen step 2's validator to accept unknown keys, then run A7 | A7 fails on the unknown-key case specifically, proving the closed-key rejection is load-bearing rather than decorative. Restore afterwards. |
| A9 | `node plugins/session-relay/test/release-instance-contract.mjs --case coverage` | Exit 0; every literal the step-1 scan finds maps to exactly one schema field, and the report names zero unmapped literals. |
| A10 | Run step 10's disposable probe end to end, then `git worktree remove` and `git worktree prune` | The probe greens A1, A7, A9 and the loader check inside the worktree after editing only the single `VERSION` declaration and adding one instance file, which is the plan's success claim observed directly rather than inferred; afterwards A1 and A2 pass again on the untouched repository and `git status --porcelain` is empty. |
| A11 | `grep -rnE '0\\\.[0-9]+\\\.[0-9]+' scripts/lib/session-relay-release-*.mjs` | Exactly one line, the historical 0.13 pin at `session-relay-release-promotion.mjs:57`. A second line means a current-version identity is hiding in escaped regex form where the quoted-literal scan cannot see it, which is the shape `5d6b7c9` fixed. |

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

## Open questions

None. The identity-class list, the seven-module scan set, instance directory
layout, per-version file naming, closed-key validation, the exclusion of
runtime-composed paths, and the decision to keep two literal tripwires in
`distribution-contract.mjs` are all settled above.

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"5443a3360f6edbf27e566d72328983711c7e0acf8463446dce58b38c190a9d5d","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"c1aad0578ffbe052d6993d66e71f7e53fca161d2c6b68add7b4dfe380b8850c9","invocations":2,"result_sha256":"5443a3360f6edbf27e566d72328983711c7e0acf8463446dce58b38c190a9d5d","state":"blocked"},"execution_parent":null,"goal_id":"5c1600a6-7116-4e94-add0-978924b40ab9","implementation_commit":null,"plan_path":"docs/plans/active/relay-release-instance-separation.md","plan_sha256":"a9634fe8b645478732c41fd656ad979820e5a65bfe5f2a467313d899517ab0b8","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"e50732d6-3f43-4a7b-9f2e-1ac3426d1190","schema":1,"source_base":"8f837731f6fec5373825619986c63a3add4b7ee1","source_sha256":"2938a6df16ea96c9e5e0380432d6a506ab3672bded188cf79e73e50ac122cf23"}

## Review

Draft review invocation 1 returned `repair` with one finding.

`PR-1` (`contradiction`, locator "Acceptance criteria A7; Steps 1, 2, and 8"):
A7 expected A1's lane-literal scan to fail after loosening the instance
validator, but A1 never exercises that validator, so step 2 had no executable
acceptance check. Reproduced and accepted: A1 scans lane modules for identity
literals and is independent of key strictness, so the old A7 could not fail for
the stated reason.

Repair applied, adopting the reviewer's prescribed fix: A7 is now
`release-instance-contract.mjs --case validator`, asserting four distinct
rejection messages; A8 carries the non-vacuity proof by mutating the validator
against A7 rather than A1; and step 2 owns that command as its done-condition and
declares both files it touches. Step 8 was left unchanged because it only moves
fixture data and never depended on the A1/A7 coupling.

Invocation 2 is the last permit for this phase and has NOT been spent.

Before spending it, the repaired draft was read twice by unpermitted passes -
plain reads that seal no bundle, reserve nothing, and are not review evidence.
They returned six further defects, all real, so the permit was deliberately not
spent. Recorded here so the next session repairs from measurement rather than
re-deriving:

|Source|Defect|
|---|---|
|A|The lane has six modules, not five. `scripts/lib/session-relay-release-fixture.mjs` is imported by `session-relay-release-cli.mjs:2`, so the Context table, the step-1 scan set, and A1 all undercount.|
|A|The eight-group inventory is asserted exhaustive but is not.|
|A|A4 can never pass: `session-relay-release-promotion.mjs:997` and `:1306` build `docs/plans/active/${CURRENT_PUBLIC_PLAN_BASENAME}.md` inline, and that prefix is protocol rather than attempt identity, so a zero-match demand is wrong.|
|A|Step 1's done-when cites "6 UUIDs, 6 commits, 11 plan paths", conflating deduplicated totals with the per-module table; no single pattern reproduces both.|
|B|Scope omits identity that publication and promotion still hold, and the scan classes miss 64-hex receipt digests and regex-escaped version patterns entirely, so A1 and A9 cannot reach zero as written.|
|B|The disposable 0.15.0 probe cannot pass: `distribution-contract.mjs` derives the tag from the bumped manifest and then requires the frozen archived 0.14.0 plan to contain that new tag.|

The common root cause is that the Context measurement counted only three literal
classes - UUID, 40-hex, and `docs/plans/` - across five of six modules. Every
count, scope claim, and acceptance threshold downstream inherited that narrow
scan. The repair is to re-measure across all six modules and all identity
classes, including 64-hex digests and escaped version regexes, then rebuild the
inventory, scope, and thresholds from that.

The two passes disagreed substantially: source A found the module count, the
inline path construction, and the count arithmetic; source B found the digest and
regex scan gap and the probe impossibility. Neither found the other's. That is a
single observation, not a measurement, but it is a concrete counterexample to the
document-review null result recorded in
`plugins/docks/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md`,
where two sources agreed 88.6% of the time on a plan read with no tools. These
passes had repository access and cited exact file lines.

Two structural directives for that repair, so the same drift cannot recur:

1. State the literal-class list exactly once, in Context, and have the step-1
   scan, A1, and A9 all cite that one list. R1 exists because the scan classes and
   the inventory were authored independently and drifted apart.
2. Re-check `## Out of scope / do-NOT-touch` by hand after any scope change.
   Nothing validates it: the self-check enforces `affected_paths` against the
   Steps rows and nothing else, so moving `session-relay-release-publication.mjs`
   into scope while that section still lists it as untouchable would be a fresh
   contradiction the reviewer can see.

## Verification Results

Not yet started.
