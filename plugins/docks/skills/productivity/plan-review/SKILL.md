---
name: plan-review
description: Use when plan-manager needs internal read-only draft or completion evidence from one bounded primary reviewer over a sealed input, with availability-only candidate fallback. Returns typed evidence only. Not for direct user invocation, lifecycle writes, reconciliation, receipt writing, or follow-up-plan creation.
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-07-17"
  content_hash: "39ecbc8e6f5f58e757796d80c8988ce52dfdd7e08c7037f470742622f9491672"
---

# Plan Review Evidence Runner

Produce read-only evidence for main-context plan-manager. This skill never edits
the source plan, writes a receipt, changes status, or decides whether an intent
may execute. Its bundled `scripts/review-policy.mjs` is the canonical plan-view,
bundle, schema, hashing, and validation implementation.

<constraint>
**Evidence-only ownership.** Accept only a typed request from plan-manager. Return `NeedsMainReviewDispatch`, `DraftRunResult`, or `CompletionRunResult`; never Edit/Write the source plan, create a follow-up, apply a lifecycle transition, reconcile accepted/rejected findings, or accept a repair target. Plan-manager is the only public entry, dispatcher, reconciler, receipt writer, and lifecycle writer.
</constraint>

<constraint>
**One immutable input, one fresh primary review.** The selected primary candidate consumes one sealed non-git bundle and exact schema-5 `ReviewRequestEnvelope`. Every launch pins company/model/effort/service-tier/transport explicitly. Never resume an old session, inherit ambient model/effort/Fast state, or read the moving source worktree. Session Relay never transports review evidence.
</constraint>

<constraint>
**Host policy is authoritative.** Record an authoritative denial as `platform_denied`; do not launch through another candidate or transport. Ambiguous failure is terminal and free-form stderr is never denial proof. Candidate fallback is availability-only and must stop after output starts or any parsed result exists.
</constraint>

## Input contract

`prepare` supplies a recursively closed current request:

```text
ReviewRequestEnvelope = {
  schema: 5,
  request_id: uuid,
  phase: draft|completion,
  lifecycle_intent: none|start|schedule_fire|auto_execute,
  reviewed_commit_or_head: 40hex,
  planned_at_commit: null|40hex,
  execution_base_commit: null|40hex,
  diff_sha256: null|64hex,
  acceptance_inventory_sha256: null|64hex,
  input_sha256: 64hex,
  bundle_sha256: 64hex,
  author: {company:openai|anthropic,tool,model,effort},
  policy: CurrentReviewPolicyV5,
  policy_sha256: 64hex,
  review_mode: full|repair,
  round_index: 1|2,
  previous_input_sha256: null|64hex,
  repair_targets_sha256: null|64hex
}
```

Full review is exactly round 1 with both transition hashes null. Repair review
is exactly round 2 and requires a changed input, the prior input hash, and the
digest of exact independently reproduced, explicitly accepted blocking
findings. A nonblocking, rejected, or unreproduced finding cannot be a target.

The helper revalidates the complete envelope and policy before launch. Policy
provenance is closed to `current_user | runtime_global | skill_default` for
`role`, `fallback`, `max_rounds`, and `candidates`. The current policy is:

```text
{schema:5, role:"primary", fallback:"availability_only", max_rounds:2,
 candidates:[
   {company:"openai",tool:"codex",model:"gpt-5.6-sol",effort:"high",
    service_tier:"default"},
   {company:"anthropic",tool:"claude",model:"fable",effort:"high"},
   {company:"anthropic",tool:"claude",model:"opus",effort:"xhigh"}],
 provenance:{role,fallback,max_rounds,candidates}}
```

The candidate array and objects are closed, ordered, and nonempty. A
current-turn user may pin one eligible candidate for one review; this narrows
the array and never adds another reviewer. Author identity is byte-bound in the
request but does not select a same- or cross-company leg.

### Historical v1-v4 request compatibility

Historical outer schema 1 with policy v1/v2, schema 2 with policy v3, and schema
3 with policy v4 retain their persisted meanings and validation results. Their
X/S author-company rules, numeric `minimum_score`, weighted rubric,
cross-company consent, zero-review decisions, service-tier transport rules,
round indexes through 10, and policy-v4 lifetime series remain historical only.
Schema 3 still binds `review_mode`, previous input, and repair-target hashes.
Never add schema-5 fields to a historical closed request, attempt, raw leg,
reviewer output, run, receipt, waiver, bundle, prepared result, or cleanup
record. Historical waivers retain `legs:[X|S]`; current waivers use exactly
`roles:["primary"]`.

## Prepare result

After plan-manager commits the non-executing input, use the helper to:

1. Parse the closed plan-frontmatter grammar and render `plan.review.md`.
2. Export sorted `affected_paths` at the immutable commit/head into
   `/tmp/docks-plan-review/<request_id>/`; absent CREATE/deleted paths are
   explicit tombstones. Symlinks are target bytes, never followed.
3. Add only `reviewer-output.primary.v5.schema.json` to a current bundle.
   Current full bundles use manifest schema 3; current repair bundles use
   manifest schema 4 and additionally seal `previous-plan.review.md` plus
   `repair-targets.json`. Both carry `review_schema:5` and
   `reviewer_schemas:{primary:<path>}`. They contain no X/S schema files.
   Historical manifest schemas 1/2 and their exact X/S files and bytes remain
   unchanged. Never export the raw source plan through `affected_paths`; only
   canonical `plan.review.md` is reviewer-visible. Completion also seals
   canonical binary `completion.diff` and the nonempty ordered
   `acceptance-inventory.json`.
4. Hash canonical manifest bytes plus length-prefixed file bytes, chmod the
   bundle read-only, then create one request carrying `bundle_sha256`.

Invoke current sealing through `bundle --review-schema=5 ...` or
`bundle-repair --review-schema=5 ...`; omitting the selector intentionally
retains the historical manifest-1/2 format.

5. Re-hash manifest, file bytes, modes, and read-only directories before launch
   and after the attempt. Any mutation, escape, duplicate, submodule,
   commit/tree mismatch, or unsupported file type is a STOP, not degraded
   review.

Bundle destruction remains a plan-manager main-context responsibility. It calls
`node <plan-review-skill-dir>/scripts/review-policy.mjs destroy-bundle <bundle-path> <expected-bundle-sha256>`
with the path and hash from the current request. The helper verifies the sealed
bundle before restoring owner-write permissions and removing only that bundle;
the primary reviewer never performs cleanup.

Return `NeedsMainReviewDispatch = {schema:5, request, bundle_path,
reviewer_schema_path, primary_dispatch}`. A manager subagent returns this to
main context; it never launches the collector itself. Historical schemas 1-3
retain their closed `X_dispatch` and `S_dispatch` result shapes.

## Reviewer launches

Use a direct argv API, never a shell-assembled command. Append this literal block
to the findings-only prompt:

```text
REQUEST_JCS_BEGIN
<compact JCS ReviewRequestEnvelope>
REQUEST_JCS_END
```

The reviewer copies the object into `ReviewerOutput.request`; the collector JCS
canonicalizes and compares it with the source.

Current schema-5 Codex argv:

```text
codex exec -C <reviewer-workspace> --skip-git-repo-check
  --ephemeral --ignore-user-config -s read-only
  -m gpt-5.6-sol -c model_reasoning_effort=high
  -c service_tier="default"
  --output-schema <bundle>/reviewer-output.primary.v5.schema.json -- <prompt>
```

Current schema-5 Claude argv (cwd is the bundle):

```text
claude -p --permission-mode plan --model <fable|opus> --effort <high|xhigh>
  --json-schema <closed-schema-json> --output-format json -- <prompt>
```

The helper derives the exact next candidate from the validated prior-attempt
ledger and rejects any tool/model/effort/service-tier tuple that skips or
substitutes it. Do not inherit a parent model. Current Codex always sets
`service_tier:"default"` (Standard), never ambient Fast. Session Relay is
invalid review evidence.

Historical compatibility keeps its original schema-1/2 Codex bundle argv,
schema-3 helper-owned disposable-workspace argv, X/S output-schema paths,
optional policy-v3 Fast flags, and Claude plan-mode argv. These commands may
verify historical records only and never create a current X/S run.

Use a 600-second monotonic deadline. GNU hosts may wrap the child with
`timeout 600`; otherwise the orchestrator/tool deadline terminates the child and
records `timeout_mode=orchestrator_tool`. Deadline expiry is terminal, not an
availability fallback.

## Attempt and result rules

Availability preflight is binary lookup followed by `codex login status` or
`claude auth status`. The real model launch is the probe. Attempt candidates in
the exact order GPT-5.6-sol/high/`service_tier:"default"` (Standard) →
Fable/high → Opus/xhigh. The first valid output wins.

Advance only for a typed `tool_unavailable`, `auth_failed`, or
`model_unavailable` result with `output_started:false` and no parsed reviewer
result. Every candidate is attempted at most once.

The following are terminal and never rotate or retry: `platform_denied`,
deadline/timeout, transient transport failure, signal, nonzero exit,
output/parse/schema failure, any substantive output, any parsed finding, or any
parsed verdict. Never route around host policy or continue after output to seek
a different verdict. An already-running interactive parent cannot be silently
retargeted.

A failed raw review cannot discard a successful passed attempt; that
contradiction is invalid evidence, not a terminal failure.
Each current attempt records the exact candidate, whether output started,
child/deadline/exit/signal data when launched, raw stdout/stderr hashes, parsed
result or null, and one typed terminal result. The schema-5 run returns one
selected primary attempt or null, the ordered attempts, exact request, valid
reviewer output or none, hashes, waiver or null, and reason.

Historical policy v1 retains exactly one typed transient retry per X/S leg after
pre-output execution-layer `EAGAIN`, `ETIMEDOUT`, or `ECONNRESET`. Strings,
output-started errors, deadline expiry, signals, nonzero exits, and schema errors
never retry. Historical policy v2-v4 keep their existing candidate-specific
rotation classes, attempt bounds, X/S result classification, numeric ready/score
gates, and policy-v4 blocking derivation. Preserve their validation behavior;
do not use it for current schema 5.

## Draft evidence

In writable main context, plan-manager independently reproduces each
schema-valid finding:

- Re-read the cited bundle path and locator.
- If it claims an executable defect, run the narrow read-only check in the
  immutable bundle where possible.
- Record method, command/exit code when used, and evidence SHA-256.
- Exclude failed reproductions from accepted targets.

This evidence-only skill returns closed schema-5 `DraftRunResult` with the exact
request, ordered attempts, primary reviewer output or null, reproduced evidence,
matching primary-role waiver or null, outcome
`passed|not_ready|unavailable|waived`, and `pre_execution_eligible`. It does not
reconcile or accept findings.

A `pass` output has no findings. `non_blocking_gap` is terminal advisory
evidence and never enters repair. Any reported `blocking_gap` makes that run
`not_ready`, even if plan-manager later rejects the finding; reconciliation
cannot rewrite reviewer evidence into `passed`. Only independently reproduced
blocking findings that plan-manager explicitly accepts may authorize changed
plan input and an optional repair-round request. Repair is exactly round 2;
there is no round 3, reset, continuation, unchanged-input repair, or fallback
after substantive output. Round 2 passes only with no blocking findings; any
remaining or newly introduced blocker is terminal `not_ready`.

A repair series is valid only when every raw round-1 blocking finding is in the
accepted target set; one rejected blocker terminates the series. Completion
rounds additionally retain identical `planned_at_commit` and
`execution_base_commit` identities.
Every schema-5 receipt embeds the complete validated two-round-or-fewer
`ReviewSeriesV5`; its final round must equal the receipt-derived run byte for
byte. A repair series is exactly full round 1, one exact transition, and repair
round 2 with the same phase, lifecycle intent, policy, and request kind.

Historical policy-v1-v4 `DraftRunResult` retains its X/S,
`dual|single|zero_degraded|blocked`, consent/zero-review, score, and lifetime
series meaning for validation only.

## Docks-only legacy compatibility evidence

Ordinary strict execution-range validation remains first and byte-authoritative.
Only the helper's closed abbreviated historical predicate may request legacy
evidence; a plan cannot opt in through prose, frontmatter, or a waiver. Existing
closed schema-v1 request, bundle, prepared-result, completion, and cleanup
objects gain no keys.

Return exact evidence for plan-manager's contiguous `E → R → B → Q → F` chain:
E is the helper-generated historical material/diff/receipt application; R is an
ordinary review of E; B binds exact E/R; Q is the helper-generated Docks
release/cache prerequisite closure; F is a fresh ordinary review of Q. R and F
are compatible only as `dual|single`, with at least one passed leg and every
passed leg `ready` with zero findings. Reject waivers, `zero_degraded`,
`blocked`, `not_ready`, and any finding-bearing passed leg. Return applications
and typed evidence only; plan-manager applies and commits all five links.

The application, binding, prerequisite, and attributed review lines remain in
canonical plan input. Completion revalidates the immutable chain and full
execution range; stable reuse removes only the whole `## Review` partition and
still requires its exact receipt-derived rendering. Source readiness is not
active compatibility: the later Docks release/refresh prerequisite supplies
the immutable release and cache identities.


## Evidence-complete verification order

- Keep the current primary review and any additional independent audit
  read-only and same-input. One writable main context owns all shared-worktree
  changes.
- Run syntax/structural and direct acceptance checks before focused regressions,
  then run the required broad/full gate once at the final pre-commit boundary.
  A relevant edit after a gate invalidates its evidence.
- Reuse a result only while all bound input, author, policy/provenance, waiver,
  bundle, commit/head/tree, diff, acceptance-inventory, and compatibility
  identities match byte-for-byte.
- This ordering never removes the current primary review, ordered acceptance
  inventory or one-to-one primary evidence, lifecycle identity commits, the
  plan-only `in_review` transition, broad gate, or final completion
  verification. Historical compatibility still requires its exact X/S
  evidence. Main context runs each inventory row exactly once in order.

Acceptance inventories remain nonempty and task-specific. Omit a broad check
only when the plan records the exact project CI command and retains a fast
independent acceptance row that proves that command's composition or strict
containment of the omitted surface; if containment is uncertain or the
independent proof is absent, retain the row. Newly authored inventories omit
the project CI command itself because completion executes that exact recorded
command separately once after the ordered inventory. This is
plan-manager/plan-review evidence only; historical validators and receipts
remain unchanged.

Completion-review repairs remain `in_review`, preserve the original
`in_review_since`, reopen affected Step rows, and invalidate prior completion
input without inventing an undocumented lifecycle transition.

## Completion evidence

Completion begins only after plan-manager has committed the plan-only
`in_review` transition and asserted the plan plus affected paths are clean.
Plan-manager supplies immutable `planned_at_commit`, `execution_base_commit`,
`reviewed_head`, and original snapshot. The primary review wrapper remains
read-only and findings-only; it never clones, runs acceptance/CI, or cleans up.

1. Validate exact commits and ancestry: execution base descends from planned
   base, is the single-parent plan-only first-start transition, and is an
   ancestor of reviewed head. Capture canonical plan input and exact
   `execution_base_commit..reviewed_head` binary diff bytes with rename,
   external diff, textconv, and color disabled. Seal/hash that diff and an
   acceptance inventory derived from the canonical plan's ordered table.
2. In writable main context, create `/tmp/docks-plan-verify/<request_id>` with
   `git clone --no-local --no-checkout <original> <temp>` and detached checkout
   of `reviewed_head`.
3. Verify temp HEAD/tree. Main-context completion runs any plan-documented
   repository setup inside the disposable checkout before acceptance/CI; setup
   failure stops without a receipt; the generic helper never selects a package
   manager or copies/symlinks dependencies. Run each nonempty inventory row
   exactly once in order, focused reproduction, and project CI only there.
4. Record each acceptance ID/command/expected/exit/output hash with exact
   one-to-one inventory coverage, plus CI command/exit/first failure/output hash,
   goal verdict, regressions, and follow-ups.
5. Delete only a helper-created sentinel-bearing request directory. Cleanup
   accepts the exact prepare identity, never a root path, and validates its
   random token, original snapshot, reviewed head, source tree, canonical path,
   owner/mode, and sentinel before deletion; then re-hash the original tracked
   modes/blobs, untracked content, complete Git metadata tree, and cleanliness.
   Any delta is a STOP.

Return closed schema-5 `CompletionRunResult` with exact request, primary review,
reproduced evidence, waiver or null, outcome, `plan_input_sha256`,
`diff_sha256`, acceptance inventory/hash, primary completion evidence, and
derived `completion_verdict=passed|partial|regressed`. `regressed` means the
primary review is unavailable/not-ready, CI failed, a regression was recorded,
or a primary high completion finding exists. Otherwise `passed` requires
`goal_met=yes` and every acceptance `met=true`; all other cases are `partial`.
Never write `## Review` or `review_status`; return typed evidence to
plan-manager, which remains the sole lifecycle and receipt writer.
Plan-manager validates the receipt's embedded series, forwards the exact
authoritative waiver set through generic-series, draft/completion reuse,
render, and apply paths, and requires frontmatter status to match the receipt.

Historical completion run schemas retain their exact X/S ready/score and
receipt meanings.

## Output format

Current `ReviewerOutput` is recursively closed:

```text
{
  schema:5,
  role:"primary",
  request:<exact schema-5 envelope>,
  verdict:"pass"|"non_blocking_gap"|"blocking_gap",
  checklist:{
    standalone_executability:{status,evidence},
    actionability:{status,evidence},
    dependency_order:{status,evidence},
    evidence_reverification:{status,evidence},
    goal_coverage:{status,evidence},
    executable_acceptance:{status,evidence},
    failure_modes:{status,evidence},
    open_questions:{status,evidence}
  },
  findings:[{id,criterion,status,section,path,locator,defect,fix,evidence}]
}
```

Every checklist status is exactly
`pass|non_blocking_gap|blocking_gap`; every evidence string is nonempty. Verdict
equals the strongest checklist status. Every gap criterion has at least one
matching finding and every finding matches its criterion/status. `pass` has no
findings. A blocking finding names the exact user requirement, safety property,
or execution step that would fail.
Any blocking finding forces run outcome `not_ready`; accepted/rejected
reconciliation governs repair authorization only and cannot downgrade it to
`passed`.

Historical schema-1/2 reviewer outputs retain their closed X/S
`ready|not_ready`, numeric score, findings, and confirmations. Historical
schema-3 outputs additionally retain their weighted rubric, priority,
confidence, blocking, and requirement fields. Unknown/missing/mistyped fields,
duplicate ids, request mismatch, bad hashes, or output outside the structured
object are invalid evidence under every schema. Hash raw stdout/stderr before
extracting Codex's final schema object or Claude's `structured_output`.

## Anti-Hallucination checks

- Confirm the primary output echoes the exact request and bundle hash.
- Re-verify sealed bundle manifest, bytes, modes, and read-only directories
  before launch and after the attempt.
- Treat a rejected `destroy-bundle` operation as a STOP; never replace it with
  shell permission or removal commands.
- Confirm every started attempt has child id, timeout mode, exit/signal, and raw
  output hashes consistent with its typed result.
- Confirm current waiver uniqueness by `(phase,input_sha256,role)` and exactly
  `roles:["primary"]`; duplicate/conflicting waivers STOP.
- Confirm every reproduced finding id exists in the primary output; this skill
  never accepts or rejects it.
- Never advance candidates after output starts, a parsed result exists, host
  denial, timeout, transport failure, signal, nonzero exit, or invalid output.
- Confirm the original repo snapshot is byte-identical after completion work.
- Return typed evidence even when all candidates are unavailable; never advance
  lifecycle state here.

## Success criteria

- One fresh, explicit, read-only primary reviewer sees one sealed input.
- GPT/Fable/Opus fallback is limited to the three allowed pre-output
  availability outcomes; every other outcome is terminal.
- Current requests/results are schema 5, closed, echoed, hashed,
  evidence-checklisted, and attempt-bounded.
- Only accepted independently reproduced blockers can cause one changed-input
  repair round; nonblocking gaps cannot.
- Session Relay supplies no review evidence.
- The caller receives typed evidence only; plan-manager remains sole
  dispatcher, reconciler, receipt writer, and lifecycle writer.
