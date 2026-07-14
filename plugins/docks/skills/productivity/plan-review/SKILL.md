---
name: plan-review
description: Use when plan-manager needs internal draft or completion evidence from two independent reviewers over one sealed input, including fresh-context X/S collection and per-finding reproduction. Returns typed evidence only. Not for direct user invocation, lifecycle writes, general code review, or follow-up-plan creation.
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-07-13"
  content_hash: "50e569366e0be24afe4dcc016679d652b6e4eba8a8527ec5bca18839b801b8b8"
---

# Plan Review Evidence Runner

Produce read-only evidence for main-context plan-manager. This skill never edits
the source plan, writes a receipt, changes status, or decides whether an intent
may execute. Its bundled `scripts/review-policy.mjs` is the canonical plan-view,
bundle, schema, hashing, and validation implementation.

<constraint>
**Evidence-only ownership.** Accept only a typed request from plan-manager. Return `NeedsMainReviewDispatch`, `DraftRunResult`, or `CompletionRunResult`; never Edit/Write the source plan, create a follow-up, apply a lifecycle transition, or reconcile accepted/rejected findings. Plan-manager is the only public entry, dispatcher, reconciler, receipt writer, and lifecycle writer.
</constraint>

<constraint>
**One immutable input, two fresh reviewers.** X and S consume the same sealed non-git bundle and byte-identical `ReviewRequestEnvelope`. Every launch pins company/model/effort/transport explicitly. Never resume an old session, inherit ambient model/effort, read the moving source worktree, or use session-relay in schema v1.
</constraint>

<constraint>
**Host policy is authoritative.** `cross_company_consent=always` suppresses only Docks' X-consent picker. It cannot override sandbox/export policy. Record an authoritative denial as `platform_denied`, with no launch and no alternate-transport retry. Ambiguous failure is `unavailable_unknown`; free-form stderr is never denial proof.
</constraint>

## Input contract

`prepare` supplies a closed request:

```text
ReviewRequestEnvelope = {
  schema: 1, request_id: uuid, phase: draft|completion,
  lifecycle_intent: none|start|schedule_fire|auto_execute,
  reviewed_commit_or_head: 40hex,
  planned_at_commit: null|40hex, execution_base_commit: null|40hex,
  diff_sha256: null|64hex, acceptance_inventory_sha256: null|64hex,
  input_sha256: 64hex, bundle_sha256: 64hex,
  author: {company:openai|anthropic,tool,model,effort},
  policy: ResolvedReviewPolicy, policy_sha256: 64hex
}
```

The helper must revalidate the complete envelope and policy before launch.
Policy provenance is closed to `current_user | runtime_global | skill_default`.
Author identity is already persisted in plan frontmatter and byte-bound in the
request; do not infer it from the current executor. X is the other company. S is
an independent reviewer from the author's company.

Default dated tiers (2026-07; honor a higher-precedence resolved tier list):

| Company | Ordered tiers | Effort | Eligible transport |
|---|---|---|---|
| OpenAI | `gpt-5.6-sol` | `xhigh` | in-session, CLI |
| Anthropic | `fable`, then `opus` | `high`, then `max` | in-session, CLI |

`orchestrator_preference=auto` prefers an available in-session fresh reviewer,
then CLI. `in_session` or `cli` narrows selection. `relay` is invalid in schema
v1. Select transport once before attempts; an authoritative denial never causes
a transport switch.

## Prepare result

After plan-manager commits the non-executing input, use the helper to:

1. Parse the closed plan-frontmatter grammar and render `plan.review.md`.
2. Export sorted `affected_paths` at the immutable commit/head into
   `/tmp/docks-plan-review/<request_id>/`; absent CREATE/deleted paths are
   explicit tombstones. Symlinks are target bytes, never followed.
3. Add distinct generated X and S reviewer JSON Schemas and a manifest without a
   bundle hash; each launch selects its exact leg schema path. Never export the
   raw source plan through `affected_paths`; only canonical `plan.review.md` is
   reviewer-visible. Completion also seals canonical binary `completion.diff`
   and the nonempty ordered `acceptance-inventory.json`.
4. Hash canonical manifest bytes plus length-prefixed file bytes, chmod the
   bundle read-only, then create one request carrying `bundle_sha256`.
5. Re-hash manifest, file bytes, modes, and read-only directories before each
   launch and after each leg. Any mutation, escape, duplicate, submodule, commit/tree
   mismatch, or unsupported file type is a STOP, not a degraded review.

Return `NeedsMainReviewDispatch = { schema:1, request, bundle_path,
reviewer_schema_path, X_dispatch, S_dispatch }`. A manager subagent returns this
to main context; it never launches the collector itself.

## Reviewer launches

Use a direct argv API, never a shell-assembled command. Append this literal block
to both findings-only prompts:

```text
REQUEST_JCS_BEGIN
<compact JCS ReviewRequestEnvelope>
REQUEST_JCS_END
```

The reviewer copies the object into `ReviewerOutput.request`; the collector JCS
canonicalizes and compares it with the source. No base64 decoding or byte-perfect
prose transcription is required.

Codex CLI argv:

```text
codex exec -C <bundle> --skip-git-repo-check -s read-only
  -m <model> -c model_reasoning_effort=<effort>
  --output-schema <bundle>/reviewer-output.<X|S>.schema.json -- <prompt>
```

Claude CLI argv (cwd is the bundle):

```text
claude -p --permission-mode plan --model <model> --effort <effort>
  --json-schema <closed-schema-json> --output-format json -- <prompt>
```

Use a 600-second monotonic deadline. GNU hosts may wrap the child with
`timeout 600`; otherwise the orchestrator/tool deadline must terminate the child
and record `timeout_mode=orchestrator_tool`. A deadline expiry is not a transport
ETIMEDOUT.

## Attempt and result rules

Availability preflight is `codex login status` or `claude auth status` after
binary lookup. Model availability is attempt-as-probe through the ordered tier.
Unknown-model/entitlement failure falls through without consuming the transient
retry.

One transient retry exists per leg, not per tier. It repeats the same
model/transport only after an execution-layer typed, pre-output `EAGAIN`,
`ETIMEDOUT`, or `ECONNRESET`. Strings, output-started errors, deadline expiry,
signals, nonzero exits, and schema errors never retry. Attempts are bounded by
`eligible_tier_count + 1`.

Classify in order: matching waiver → `waived`; X consent denied →
`not_authorized`; authoritative denial → `platform_denied`; auth failure →
`unavailable_auth`; all tiers unavailable → `unavailable_model`; deadline →
`timed_out`; exit-zero/schema-invalid → `failed_unparseable`; valid output →
`passed`; otherwise `unavailable_unknown`.

Each raw leg returns exact request, ordered attempts, selected tier or null,
typed result, schema-valid findings or none, hashes/severity totals, matching
waiver or null, prompted decision or null, and reason. A passed leg also retains
the exact structured reviewer verdict, score, confirmations, and SHA-256 of the
full JCS `ReviewerOutput`; the helper reconstructs and validates that object.
`not_ready` is always pre-execution-ineligible in schema v1. IDs are unique and
leg-prefixed (`X1…`, `S1…`). Never construct reconciliation here.

## Draft evidence

In writable main context, independently reproduce each schema-valid finding:

- Re-read the cited bundle path and locator.
- If it claims an executable defect, run the narrow read-only check in the
  immutable bundle where possible.
- Record method, command/exit code when used, and evidence SHA-256.
- Drop failed reproductions from `reproduced`; do not silently convert them to
  accepted or rejected findings.

Return closed `DraftRunResult` with request, X, S, reproduced findings, prompted
decision evidence or null, `outcome=dual|single|zero_degraded|blocked`, and
`pre_execution_eligible`. One passed leg permits `single`; zero passed delegates
to the separately resolved zero-review decision. This skill does not apply the
intent.

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

- Keep X/S and any other independent audit read-only, same-input, and parallel
  where possible; one writable main context owns all shared-worktree changes.
- Run syntax/structural and direct acceptance checks before focused regressions,
  then run the required broad/full gate once at the final pre-commit boundary.
  A relevant edit after a gate invalidates its evidence.
- Reuse a result only while all bound input, author, policy/provenance,
  decision/waiver, bundle, commit/head/tree, diff, acceptance-inventory, and
  compatibility identities match byte-for-byte.
- This ordering never removes X/S review, the ordered acceptance inventory or
  one-to-one primary evidence, lifecycle identity commits, the plan-only
  `in_review` transition, the broad gate, or final completion verification.
  Main context still runs each inventory row exactly once in its defined order.

Acceptance inventories remain nonempty and task-specific. Omit a broad check
only when the plan records the exact project CI command and retains a fast
independent acceptance row that proves that command's composition or strict
containment of the omitted surface; if containment is uncertain or the
independent proof is absent, retain the row. Newly authored inventories omit
the project CI command itself because completion executes that exact recorded
command separately once after the ordered inventory. This is
plan-manager/plan-review evidence only; schema-v1 validators and receipts remain
unchanged.

Completion-review repairs remain `in_review`, preserve the original
`in_review_since`, reopen affected Step rows, and invalidate prior completion
input without inventing an undocumented lifecycle transition.

## Completion evidence

Completion begins only after plan-manager has committed the plan-only
`in_review` transition and asserted the plan plus affected paths are clean.
Plan-manager supplies immutable `planned_at_commit`, `execution_base_commit`,
`reviewed_head`, and original snapshot. X/S wrappers remain read-only
findings-only reviewers; they never clone, run acceptance/CI, or clean up.

1. Validate exact commits and ancestry: execution base descends from planned
   base, is the single-parent plan-only first-start transition, and is an
   ancestor of reviewed head. Capture canonical plan input and exact
   `execution_base_commit..reviewed_head` binary diff bytes with rename,
   external diff, textconv, and color disabled. Seal/hash that diff and an
   acceptance inventory derived from the canonical plan's ordered table.
2. In writable main context, create `/tmp/docks-plan-verify/<request_id>` with `git clone --no-local
   --no-checkout <original> <temp>` and detached checkout of `reviewed_head`.
3. Verify temp HEAD/tree. Main-context completion runs any plan-documented repository setup inside the disposable checkout before acceptance/CI; setup failure stops without a receipt; the generic helper never selects a package manager or copies/symlinks dependencies.
   Then run each nonempty inventory row exactly once in order, focused
   reproduction, and the project's CI only inside that checkout.
4. Record each acceptance ID/command/expected/exit/output hash with exact
   one-to-one inventory coverage, plus CI command/exit/
   first failure/output hash, goal verdict, regressions, and follow-ups.
5. Delete only a helper-created sentinel-bearing request directory. Cleanup
   accepts the exact prepare identity, never a root path, and validates its
   random token, original snapshot, reviewed head, source tree, canonical path,
   owner/mode, and sentinel before deletion; then re-hash the
   original tracked modes/blobs, untracked content, complete Git metadata tree,
   and cleanliness. Any delta is a STOP.

Return closed `CompletionRunResult` with `plan_input_sha256`, `diff_sha256`,
acceptance inventory/hash, X, S, reproduced findings, decision evidence, outcome, and primary completion
evidence plus derived `completion_verdict=passed|partial|regressed`. `regressed`
means either passed X/S reviewer returned `not_ready`, CI failed, a regression
was recorded, or a primary high finding exists;
otherwise `passed` requires `goal_met=yes` and every acceptance `met=true`; all
other cases are `partial`. Never write `## Review` or `review_status`;
plan-manager applies the validated result and requires frontmatter status to
match the receipt.

## Output format

`ReviewerOutput` is closed recursively:

```text
{ schema:1, leg:X|S, request:<exact envelope>, verdict:ready|not_ready,
  score:0..100, findings:[{id,severity,section,path,locator,defect,fix,evidence}],
  confirmations:[non-empty string] }
```

Unknown/missing/mistyped fields, cross-leg IDs, duplicate IDs, request mismatch,
bad hashes, or output outside the structured object are invalid evidence. Hash
raw stdout/stderr before extracting Codex's final schema object or Claude's
`structured_output`.

## Anti-Hallucination checks

- Confirm both raw legs echo the exact same request and bundle hash.
- Re-verify sealed bundle manifest, bytes, modes, and read-only directories
  before launch and after each leg.
- Confirm every started attempt has child id, timeout mode, exit/signal, and raw
  output hashes consistent with its typed result.
- Confirm waiver uniqueness by `(phase,input_sha256,leg)`; duplicate/conflicting
  waivers STOP.
- Confirm every reproduced finding id exists in its raw leg; do not invent
  primary X/S findings.
- Confirm the original repo snapshot is byte-identical after completion work.
- Return evidence to plan-manager even when both legs degrade; never advance
  lifecycle state here.

## Success criteria

- Both legs are fresh, explicit, read-only, same-bundle, and findings-only.
- Requests/results are closed, echoed, hashed, and attempt-bounded.
- Host denial, consent denial, unavailability, timeout, and schema failure remain
  distinct outcomes with no forbidden retry.
- X/S evidence carries no write authority; only writable main context creates
  the sentinel disposable clone and proves original immutability.
- The caller receives typed evidence only; plan-manager remains sole writer.
