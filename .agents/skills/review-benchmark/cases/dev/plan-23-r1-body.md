<!-- plan-contract: v3 -->

## Goal

Fix audited write-safety, retry, validation, absolute-path detection, archive-validation, and behavioral coverage gaps in plan.mjs without mixing them into workflow contract plan #22

Mode: plan-and-implement

## Research

- `claim` (plan.mjs:678-694) reads the plan, then writes the assignee with a direct `gh issue edit`: no body-unchanged guard and no post-write verification that the assignee landed, so a failed or partial assignment prints success. `new` (plan.mjs:643-672) trusts `--assignee @me` and validates only the returned URL. The contract's Issue-writes wording (plan-contract.md:264-285) promises read-modify-write and post-write confirmation; the assignee path is the outlier.
- `retire` (plan.mjs:967-1030) closes the issue as not-planned (1017-1026) before label cleanup (1028). A cleanup failure strands a closed issue with a stale `plan:<phase>` label, and the closed-issue guard (973) blocks a retry, so the stranding is unrecoverable through the CLI.
- `new` prevalidation (plan.mjs:643-651) checks only presence, newline, and mode. A >70-character title is accepted at create and then rejected by its own check 3 (plan.mjs:187-190). A whitespace-only goal is accepted and no current check rejects it, which leaves a plan whose Goal carries no content; prevalidating a trimmed non-empty goal is a new content rule at `new` time, not a duplicated check.
- `machinePathCitations` (plan.mjs:159-164) matches only `/home/[a-z]` and `/Users/[A-Za-z]`. `/tmp`, `/var`, `/opt`, other Unix machine roots, digit-leading user names, Windows drive letters, and UNC paths all escape, while the contract forbids any absolute machine path.
- `status` (plan.mjs:829-850), `step` (plan.mjs:852-893), and `claim` mutate a record after only the v3-marker gate (readPlanIssue, plan.mjs:583-607), ownership, and their own target parse; a malformed v3 record can be mutated. The Enforcement boundary (plan-contract.md:399-406) names command preconditions; running the full 13-check validation before each open-issue mutating write is strictly stronger and needs no contract wording change. `archive` stays a verifier with its own closed-issue proof rules.
- Already fixed, no step: the `edit` sidecar-ahead hazard is documented (plan-contract.md:278-282, pre-refresh fails closed, re-export recovery) and covered by failed-remote retry tests in scripts/tests/plan-cli.mjs.
- Label writes already route through a body-unchanged guard (`editIssueLabelsIfBodyUnchanged`, plan.mjs:601-625) but have no post-write confirmation; assignee and label post-verification travel with steps 1 and 2.
- Test inventory: scripts/tests/plan-cli.mjs covers basic claim idempotency, `/home` citations, malformed-record `check` predicates, sidecar retry, and happy retire; it does not cover assignment post-verification, retire cleanup failure, escaped absolute paths, or mutator validation bypass.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | claim_verify | Route the `claim` assignee write through a body-unchanged guard and verify the assignee by post-write read in both `new` and `claim` | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs, scripts/tests/fixtures/gh-stub/gh | — | `local` | `planned` | A failed or vanished assignment exits 1 naming the defect; success prints only after a post-write read shows the acting login as sole assignee |
| 2 | retire_recovery | Make `retire` recoverable: keep close-then-cleanup order, and let a retry on a closed not-planned plan that still carries a phase label finish the label cleanup and exit 0 | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs, scripts/tests/fixtures/gh-stub/gh | — | `local` | `planned` | An injected label-cleanup failure leaves a recoverable state and a plain `retire` retry completes cleanup; a fully retired plan stays refused |
| 3 | new_prevalidate | Validate a 1-70 character trimmed title and a trimmed non-empty goal in `new` before any write | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | — | `local` | `planned` | Oversized title and whitespace-only goal each exit 1 creating no issue; the error names the violated rule |
| 4 | path_detector | Broaden machine-path citation detection to Unix machine roots (`/home`, `/Users`, `/tmp`, `/var`, `/opt`, `/srv`, `/mnt`, `/media`, `/root`, `/etc`), Windows drive letters, and UNC paths, keeping the existing YAML-line exclusion | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | — | `local` | `planned` | `check` refuses bodies citing each broadened form; repository-relative paths and the existing exclusions still pass |
| 5 | mutator_validation | Run the full 13-check validation before the `status`, `step`, and `claim` writes | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 1 | `local` | `planned` | Each of the three mutators refuses a malformed v3 record and writes nothing; well-formed transitions keep passing |
| 6 | hash_gate | Re-sync the plan-manager skill content hash and pass the plugin gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1, 2, 3, 4, 5 | `local` | `planned` | `node scripts/ci.mjs --plugin plan-lifecycle` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0 with new coverage for assignment post-verification, retire cleanup recovery, `new` prevalidation, broadened path detection, and mutator validation |
| A2 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |
| A3 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0 |

## Do not touch

- `docs/plans/finished/` - frozen history
- Plan #22's settled workflow wording: review loops, linked-branch flow, comment-backed records, across the contract, skills, wrappers, templates, and mirrors
- `plugins/docks/` and `plugins/effect-kit/` skill bodies

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

_Not implemented yet._
