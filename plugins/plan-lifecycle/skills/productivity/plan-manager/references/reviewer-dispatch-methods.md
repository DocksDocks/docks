# Reviewer dispatch methods

Review transport is a direct reviewer subprocess. Session Relay is never review
evidence and never a required dependency.


## Contents

- [Direct transport adapter contract](#direct-transport-adapter-contract)

- [Methods](#methods)
- [Judge independence: what is measured](#judge-independence-what-is-measured)
- [Reviewing code versus reviewing a document](#reviewing-code-versus-reviewing-a-document)
- [One pass is a sample, not a verdict](#one-pass-is-a-sample-not-a-verdict)
- [Flag traps](#flag-traps)

## Direct transport adapter contract

<constraint>
The controller must reserve, dispatch, capture complete stdout, validate the
closed result schema, bind the result to the exact live reservation, and settle
in one crash-aware process. A transport status alone never mutates PlanRun.
Clipped console or transcript text is not evidence. Never ask for compact or
single-line output, and never reconstruct a returned object by hand.
</constraint>

Draft review has one initial review and, only after an accepted repair, one mandatory fresh verification, with a ceiling of two substantive invocations.
Completion review has exactly two substantive invocations and an empty `accepted_classes` set.
A draft repair verdict is accepted at most once. Any further repair or new finding after the mandatory verification terminal-blocks the run and requires a new user-authorized successor.
A transport-only failure refunds its reservation and allows one fresh `transport_retried` dispatch without changing substantive bindings; a second transport failure degrades only local draft work at local risk and otherwise blocks. One retry, never two.
`accepted_classes` remains valid on read for historical records and is written by no current transition. Historical records are read-only inputs to the historical adapter and never current authority.

Reserve the phase and read back before dispatch. Capture the child process's
complete stdout to a private file, re-read that file, validate its schema and
bindings, hash canonical bytes, and only then settle the matching reservation.
Session Relay may carry an optional reference later, but no Relay row or receipt
can become plan authority or review evidence.


### What "a sealed bundle" means on disk

The word *bundle* is not a synonym for *a copy of the plan*. The protocol requires
the reviewer to verify the bundle's shape **before** evaluating any content and to
map a missing or malformed binding to `bundle_binding_mismatch`, a closed
invalid-input result that ends the invocation. Treat that as the reviewer's
obligation, not as your safety net: a flat `.md` plan copy passed as the bundle
path has been observed being accepted and reviewed anyway, so the shape check
cannot be relied on to catch your mistake in either direction. A hand-rolled
transport is permitted, so a hand-rolled transport owns producing this layout:

```text
plan-review-v1-<rand>/
  plan.md          immutable plan bytes, exactly as reserved
  manifest.json    {paths:[{kind,mode,path,sha256,state}],schema,source_base,source_sha256}
  binding.json     {invocation,manifest_sha256,plan_bytes_sha256,plan_sha256,run_id,schema,source_sha256}
```

Both JSON files are compact JCS, one line, keys in canonical order.
`plan_bytes_sha256` digests `plan.md`; `manifest_sha256` digests `manifest.json`;
`plan_sha256` is the canonical-view digest and is *not* the digest of `plan.md`.
The phase's `input_sha256` is the composite bundle digest, so it matches none of
the three files individually — derive it, never guess it.

<constraint>
Passing a bare `.md` plan copy as the bundle path is the classic failure, and its
real cost is not a lost permit. The review may come back usable, which is worse:
the phase's `input_sha256` then digests a bundle shape that never existed, so the
plan's own audit trail asserts a review nobody can re-derive. If you are not using
a conforming implementation, diff your output against a precedent bundle directory
**before** reserving — reserving pins `input_sha256` over whatever you built, so
resealing afterwards can never bind, and there is no path back that does not spend
another permit or end the run.
</constraint>

## Methods

|Method|Invocation|Notes|
|---|---|---|
|omp|`omp --model <vendor>/<model>:<effort> -p '<prompt>'`|Any authenticated model gets the same harness, tool surface, repository mount, and output handling. `--mode json` emits a JSONL event stream.|
|Claude CLI|`claude -p --permission-mode plan`|Read-only permission mode; the historical portable baseline.|
|Codex CLI|`codex exec -s read-only`|Read-only sandbox; the other half of the historical portable baseline.|

Per-agent model pinning differs by runtime and outranks any file: Claude Code
uses `CLAUDE_CODE_SUBAGENT_MODEL`, omp uses `task.agentModelOverrides.<agent>`,
which outranks both agent frontmatter and the session model.

The `-p` methods are equivalent for the protocol's purposes. One measured
difference: for the same GPT model, `omp --model openai-codex/<model> -p` carried
tool access and repository mount where a bare `codex exec` invocation did not, so
prefer omp when it is installed and the model is authenticated. This is a
convenience ranking, not a requirement.

### One conforming implementation

The shipped dispatch controller performs seal, reserve, dispatch, complete
stdout capture, schema validation, result binding, and settle in one process, so
no window exists where the run sits cold-`reserved` with nobody holding it. This
ordering is the Adapter contract, not permission to split authority across
transport callbacks.

Crash accounting covers catchable signals. The controller persists a
transport-only failure and lets the reducer choose the closed successor: a
refund from `reserved`, and from `transport_retried` either local-risk draft
degradation or a block. A second refund or retry is forbidden.

The controller settles only validated bound bytes: `pass`, a closed
`ReviewInvalidInputV1`, or a transport-only failure. A `repair` or `blocked`
verdict is written to its private result file with the phase deliberately left
`reserved`; main context reproduces each finding and settles the accepted
verdict. Neither process exit status nor any transport receipt is review
evidence.

<constraint>
Run the controller detached. A caller-side timeout that SIGKILLs it cannot be
handled, so it leaves a bare `reserved` for cold entry to block. Only catchable
signals enter the refund path.
</constraint>

After changing a transport adapter, run the project's CI and validators, if
present.

## Judge independence: what is measured

<constraint>
Do not claim a measured benefit from cross-vendor review. Preferring a judge from
a different vendor than the author is a principled hedge against shared blind
spots, not a demonstrated improvement, and it must never become a hard gate: a
consumer with one provider configured has to be able to clear review.
</constraint>

On a plan document reviewed with no tools, two vendors agreed with each other
88.6% of the time while one vendor re-run against itself agreed 90.0% — so
cross-vendor disagreement exceeded same-vendor run-to-run noise by 1.4 points.
An appealing "complementary blind spots" pattern in the same data did not
survive its null control: regrouping the runs at random produced an equally
clean partition in 6 of 10 splits, and one random split produced a larger gap
than the real vendor split.

## Reviewing code versus reviewing a document

The document result above does not transfer to code review, which was measured
separately against ground truth: six single-line defects planted in real commits,
each presented as a realistic 220-290 line diff across four or five files, three
of them invisible to the repository's own 130-case suite.

|Cell|Detection|
|---|---|
|vendor A, tools|6/6|
|vendor A, no tools|6/6|
|vendor B, tools|6/6|
|vendor B, no tools|6/6|

Detection saturated in every cell, including the three defects no existing test
catches, so at this difficulty neither tool access nor vendor choice can be
distinguished. The tool-enabled runs did genuinely use tools — 3 to 28 calls of
reading, grepping, and running commands — so the null result is "no-tools was
already sufficient", not "tools went unused".

Discrimination, not detection, is where the reviewers failed. Two changes in the
corpus were semantically identical rewrites, and each vendor reported one of them
as a defect. Both wrong findings asserted a mechanism the reviewer had not
executed: one claimed a canonicalizer could return `undefined` and defeat a loose
comparison, which is impossible because that function throws on `undefined`; the
other blamed a date-parsing rewrite for a millisecond-truncation limitation that
is identical before and after the change.

<constraint>
Require a finding to name the check that produced it. Both false findings above
would have been withdrawn by running one command, and the sole real limitation
either of them surfaced — sub-millisecond timestamp inversions are invisible to a
guard that compares parsed millisecond integers — was true of the code before and
after the change it was attributed to. A confident mechanism with no executed
check is the failure mode to reject.
</constraint>

## One pass is a sample, not a verdict

The dominant source of disagreement is not the vendor. It is variance between
passes under identical conditions.

Measured on one real plan across six rounds of repair. Before spending the last
review permit, the sealed bundle's own prompt — identical bytes, identical rubric —
was read by two independent unpermitted passes. Both returned `pass` with zero
findings. The permitted review that followed, on those same bytes, returned
`repair` with two defects, both reproducible:

- `grep -c` prints `0` and exits `1`, so two acceptance rows returned a failing
  status in exactly the state they declared as success.
- A coverage check consumed a scan whose inputs earlier steps delete, so it could
  report success vacuously at the end state.

Earlier rounds behaved the same way: each round of two passes surfaced defects the
previous round's passes had missed, on text they had already approved.

Rounds are not what converges a document. Counting findings per round over frozen
bytes, across two plans and eleven rounds:

|Document|Rounds|Findings per round|
|---|--:|---|
|one plan carrying four evidence scales|4|6, 1, 6, 6|
|its narrower successor|7|12, 10, 13, 5, 11, 2, 10|

Neither series trends down. The successor's only real drops each followed a reduction
in scope rather than a repair: 13 to 5 when the plan was narrowed, then down to 2 -
two of three passes clean - immediately after one capability was deleted outright.
Every rise followed surface being added back, and the last round went from 2 to 10
after a new schema and three new acceptance rows landed. Findings track surface, not
iteration count.

<constraint>
Never treat "an independent pass returned pass" as evidence the document is clean.
It is one sample from a pool whose size you do not know, and the false-negative
rate per pass is high enough that two agreeing passes still missed two
reproducible defects. Unpermitted passes are a cheap filter — across these rounds
they cut findings from eight to two — and they are not a substitute for the gate.
When more confidence is needed, take more samples of the same condition rather
than more rounds of rewriting, because rewriting between single samples cannot
distinguish a fixed document from a lucky pass. Cap the rounds at three on
substantially unchanged bytes: if findings have not dropped materially by the third,
the defect is scope rather than wording, so split the document or delete a capability
instead of spending a fourth round. A round following a large rewrite is a first
measurement of new bytes rather than a repeat, so it does not count toward the cap,
and a counter that keeps resetting is itself the non-convergence signal.
</constraint>

## Flag traps

- `--no-tools` disables built-in tools only. MCP server tools remain callable:
  in a measured no-tools run, a reviewer still reached a session bus and tried to
  recruit a peer. Withhold the MCP configuration too if the run must be tool-free.
- A returned object is evidence only while its phase is still live with a
  matching run id, invocation, and input digest. Discard anything else.
