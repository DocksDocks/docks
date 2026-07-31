---
title: Bind plan evidence to the bytes that produced it at row, sample and measurement scale
goal: Extend the run-scale rule PlanRunV1 already enforces - evidence is bound to the bytes that produced it and is absent when those bytes move - down to the acceptance row, the review sample, and the quantitative claim.
status: ongoing
created: "2026-07-29T21:40:00-03:00"
updated: "2026-07-31T04:13:06.994+00:00"
started_at: "2026-07-31T04:13:06.994+00:00"
finished_at: null
assignee: null
tags: [plans, plan-manager, evidence, review, tooling]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-measurements.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/sample-review.mjs
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-workspace/SKILL.md
  - docs/plans/AGENTS.md
  - scripts/tests/plan-evidence-probes.mjs
  - scripts/tests/plan-skill-phases.mjs
  - scripts/tests/plan-orchestration.mjs
related_plans: [docs/plans/finished/2026-07-30-plan-dispatch-driver.md]
---

# Bind plan evidence to the bytes that produced it at row, sample and measurement scale

## Goal

An acceptance row carries a proof keyed to its own command bytes, a free review
pre-check reports agreement across samples over *unchanged* bytes, and a cited
quantity is re-derived from a committed producer. Each is the run-scale rule
PlanRunV1 already enforces, applied one scale down.

## Context & rationale

This plan is the second half of a split, and `docs/plans/finished/2026-07-30-plan-dispatch-driver.md`
is declared in `related_plans`. The coupling is informational, not blocking, and that
is a correction: when the split was made this plan was described as depending on the
driver because its sampler would dispatch reviews. Measured since, over nine sampling
rounds: the free pre-check spent zero permits and used no dispatch driver at all. The
sampler is therefore a **non-dispatching aggregator** over caller-supplied,
digest-bound reviewer results, which is what lets it stay outside the permit system.
A dispatching sampler would contradict its own acceptance row, because the driver
always reserves. The sibling plan's Out-of-scope section still describes the stronger
coupling; it passed review before this correction and its bytes are terminal at
`finished`, so this sentence is the accurate one.

The split itself was measured rather than guessed. Five rounds of free sampling over
frozen bytes returned 5, 6, 1, 6 and 6 findings with no convergence, and the
distribution was lopsided: the driver rows drew almost no findings while this
machinery drew nearly all of them. Each acceptance row is itself a falsifiable
surface, so carrying twelve rows in one plan grew the surface faster than the repairs
closed it.

### The rule, and where it is enforced

|Scale|Evidence|Bound to|Enforced today|
|---|---|---|---|
|run|reviewer verdict|`plan_sha256`, invalidated by repair|yes|
|row|falsifiability proof of one acceptance row|the row's own command bytes|no|
|sample|agreement across free review passes|fixed bundle bytes|no|
|measurement|a quantitative claim in a plan body|the producer's output|no|

### Claim classes

Every quantitative claim here carries one of three classes, and the self-check
treats them differently. Naming the class is what makes step 4 implementable and
A4 satisfiable: an unscoped "any cited number" rule is unsatisfiable, because most
numbers in this section are deliberately not enforceable.

|Class|Marker|Producer|Self-check behaviour|
|---|---|---|---|
|committed-producer|`{measurement:committed}`|a command re-runnable against the run's `source_base` commit|**enforced** - a mismatch fails and names the claim|
|snapshot|`{measurement:snapshot}`|a named command whose value moves as the repository moves|**reported** - recorded with its producer, never fails|
|operator-local|`{measurement:operator}`|untracked operator state, deleted with scratch|**motivation only** - never checked, never a denominator|

Only committed-producer claims are enforceable, so only they may back an
acceptance row.

A producer is a closed declarative form, never free-form shell. It persists as
`{op, path, matcher, timeout_ms, max_bytes}` with a single operation:

|`op`|Reads|Emits|
|---|---|---|
|`show-count`|the blob at `path` at the run's `source_base`, matched by `matcher`|a count|

One operation, because this plan contains exactly one producer and an enum declaring
forms no producer exercises is the same "declared but unbound" defect as an unkeyed
record field: an implementation supporting only the used form, or implementing the
others wrongly, would pass every acceptance row. A later plan that needs a directory
listing or a file-set count widens the enum together with the producer and the row that
exercises it.

The base commit is never a field an author can set: it is read from the record's
`source_base`, so a producer cannot be repointed by editing the body. Each `op` maps
to one fixed argv run through `execFile` with no shell, bounded by `timeout_ms` and
`max_bytes`. An unknown `op`, an extra key, or shell syntax anywhere in a field is
rejected unparsed rather than executed, and a negative probe asserts that rejection.
The fenced blocks below are the human rendering of that form, not its storage; a
weaker executor implements that single operation, never a shell string.

A committed producer reads the run's `source_base` commit, never the working
tree. This is the run-scale binding applied one scale down: `source_base` is
already pinned in the record and a commit is immutable, so the value cannot drift
and the plan cannot invalidate its own evidence by doing its own work. That
failure was real, not hypothetical - three independent review samples over
identical bytes each derived it. Measured: the producers below yield the same
values against the run's `source_base` as against the tree today, while steps 1, 4, 5 and 6
would change every one of them if they read the tree - `ls` of the lifecycle
directory alone goes from 2 to 5, `transactPlanRun` callers from 1 to 2, and
scripts performing reserve/dispatch/settle from 0 to 1.

### Measured: acceptance rows are mostly unproven, and a pre-state gate mis-fires {measurement:snapshot}

Producer, at draft time over the plans tracked then:

```
grep -hE '^\| A[0-9]+ ' docs/plans/*/*.md > /tmp/rows.txt
grep '`' /tmp/rows.txt > /tmp/exec.txt
wc -l < /tmp/rows.txt; wc -l < /tmp/exec.txt
grep -ciE 'still |unchanged|stays|remains|byte-identical|no change|lockstep|green|clean|zero |empty' /tmp/exec.txt
grep -ciE 'revert|loosen|plant|weaken|proving|load-bearing|non-vacuous' /tmp/rows.txt
```

|Quantity|Value at draft time|
|---|--:|
|acceptance rows across tracked plans|437|
|executable, containing a backtick-quoted command|398|
|prose-only|39|
|invariant-shaped, correctly passing before the change|127|
|change-demonstrating|271|
|carrying any mutation proof|13|

The obvious gate - *every row must fail against the untouched tree* - is wrong. It
would flag **127 of 398 executable rows**, or 31%, as vacuous when they are
correct: invariant rows such as manifest-lockstep or "the chronology guard still
passes" are supposed to pass before the change. A check with a 31% false-positive
rate gets disabled, so the property must be falsifiability under a named mutation,
not pre-state failure.

These counts move as plans are added, including by this plan. They are a draft-time
snapshot with their producer named, which is exactly the discipline step 4 makes
mechanical. An earlier count of the mutation-proof row reported 16 rather than 13
because it used a looser pattern; the number moved between two producers for one
claim, which is the measurement-scale defect this plan closes, observed while
drafting it.

### Measured: one review pass is a sample, not a verdict {measurement:operator}

|Condition|Outcome|
|---|---|
|planted-defect code matrix, 4 tool and vendor cells|6 of 6 in every cell - saturated, no discrimination|
|cross-vendor agreement|88.6%|
|same-vendor agreement|90.0%|
|two vendors, one pass each, on the sealed prompt|both `pass`, zero findings|
|the permitted dispatch, identical bytes|`repair`, two real defects|

Vendor diversity buys approximately nothing; sample count buys the discrimination.
Those free passes were taken one per rewrite, so no two samples shared bytes and
their agreement measured nothing. The stopping rule must hold bytes fixed. This
row set comes from a measurement campaign whose artifacts are operator-local, so
it motivates step 5 and is not an acceptance denominator.

### Measured: the exclusion precedent is one line {measurement:committed}

Producer. The commit is read from this plan's own record, never pasted as a
literal: the reserve transition may rebind `source_base`
(`plan-run.mjs:1636-1638`), and a pasted SHA would then name a different commit
than the record. The pattern is narrowed to the declaration, because an
unnarrowed `grep EXCLUDED_SECTIONS` also matches the `328:` use site and would
not equal the count recorded below.

```
P=docs/plans/active/plan-evidence-row-scales.md
B="$(sed -n 's/^Plan-run: .*"source_base":"\([0-9a-f]\{40\}\)".*/\1/p' "$P")"
git show "$B":plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs | grep -c 'EXCLUDED_SECTIONS = new Set'
```

One enforced quantity, one producer that emits it and nothing else:

|Enforced quantity|Value|
|---|--:|
|lines declaring `EXCLUDED_SECTIONS`|1|

A blocked run is immutable, so a repaired body has nowhere legal to live and
currently survives only as untracked operator state. `Proposed repair` joining that
set gives it a home without weakening immutability, because the digest already
excludes two sections by the same mechanism.

The timing is the whole design, and getting it wrong makes the step impossible.
Measured: `blocked` to `blocked` fails on **any** byte difference with "blocked
PlanRun bytes are immutable" (`plan-run.mjs:1908-1913`), so exclusion grants a blocked
run no writability whatsoever and a repair section cannot be added afterwards. The
only legal shape is to install `## Proposed repair` in the same transaction that
installs `blocked`, because that transition is itself the state event. A step that
plans to write it later has planned something the transaction layer refuses.

## Environment & how-to-run

Repository `DocksDocks/docks`, Node 24 with pnpm through corepack:

```
corepack enable && pnpm install --frozen-lockfile
node scripts/ci.mjs --plugin docks
```

The selected-plugin gate is authoritative: every path here is plugin payload or its
owned tests, except `docs/plans/AGENTS.md`, which is documentation. No step contacts
GitHub, npm, or any remote. Every step's effect is `local`.

### Falsifiability record {mechanism}

A row's proof is a record `{row_id, step_id, command_sha256, expected_sha256,
source_base, binds, observed, probe}`. `row_id` says which row the record belongs to;
the four fields below it are the **key**; `binds`, `observed` and `probe` are payload.

|Field|Role|
|---|---|
|`command_sha256`|key - digests the row's Command cell verbatim|
|`expected_sha256`|key - digests the row's Expected cell verbatim|
|`step_id`|key - the single Steps row that owns it|
|`source_base`|key - the commit the claim was made against|
|`binds`, `observed`, `probe`|payload - which observable was read, its value, the mutation that produced it|

Keying the Expected cell is what the first review round of this plan corrected. The
expectation carries the matcher and the named mutation probe, so a proof keyed on the
command alone survives an author changing what the row claims to observe or how it is
falsified. Recording `binds`, `observed` and `probe` while keying none of the text they
came from is the same "declared but unbound" defect this plan exists to remove, and it
was present in this plan's own mechanism.

**The checker verifies bindings; it never executes a row's command.** That is the
central scoping decision of this plan, and it was reached by measurement rather than
taste. Earlier drafts had the checker re-execute each row to confirm its observation,
and every review round then returned a new consequence of that one capability: an
unbounded execution surface needing a sandbox, an argv grammar and an effect gate; a
recursion with no base case, because rows invoke the checker; and a replay that cannot
work at all, because `source_base` is pinned *before* implementation and therefore
contains neither the new subcommands nor the probe files whose exits the proofs record.
Removing the capability removes all four at the root.

So the division of labour is:

|Who|Produces what|
|---|---|
|the probe, run by CI|the observation - it executes, in the tree that contains the implementation|
|the checker|the verdict on whether a recorded observation still belongs to these bytes|

A row counts as proven when its record exists and every key field equals the live
plan's. Any key moving makes the row **unproven**: the proof belonged to bytes that no
longer exist. That is the run-scale
rule one scale down, and it needs no execution to enforce - which is the point, since
a checker that executed plan-supplied text would be a capability increase an
authoring-time tool has no authority for.

Observation drift is caught where the observation is made. The probes run inside
`node scripts/ci.mjs --plugin docks`, so a recorded exit that stops reproducing fails
the gate, not the checker. Nothing is trusted that is not re-run; it is simply re-run
by the suite that owns execution.

`binds` is a closed two-value domain:

|`binds`|Observable|Rows|
|---|---|---|
|`exit`|the command's exit status|A1, A3, A4, A5, A6, A7, A8, A9, A10, A11|
|`match`|a named matcher over stdout, recorded as `{matcher, result}`|A2|

A whole-stdout digest is deliberately not an option. A2's command prints one proof
line per acceptance row, so its own proof line sits inside the output it observes, and
a raw digest of that output would be a value that changes when it is recorded - it
cannot converge. A matcher result does: the proof-line count, which must equal the
acceptance-row count, is stable under its own recording.

The one execution this plan keeps is the measurement producer defined under Claim
classes. Its single-operation closed form is why it is safe where row re-execution was not:
the one operation reads a commit through a fixed argv and cannot write.

Proofs are written into this plan's own `## Verification Results`, which needs no new
artifact and no new mechanism: `EXCLUDED_SECTIONS` already excludes that heading from
`plan_sha256` (`plan-run.mjs:102`), so recording a proof never disturbs the review
binding, and `canonicalVerificationResults` already hashes it into
`acceptance.verification_sha256` (`:395`, `:814`), enforced at `:815-816`. Proofs are
therefore digest-excluded where they must be and digest-bound where it counts, and the
contract sentence "The Markdown plan is the only tracked artifact"
(`docs/plans/AGENTS.md:4`) still holds.

The event that writes proofs while a plan is still `drafting` is the **draft
preparation** transition, and it is repeatable and free. With status `drafting` on both
sides and `draft_review.state` in `{not_started, repairing}`, `plan-run.mjs:1657-1665`
permits exactly `plan_sha256`, `source_base` and `source_sha256` to move, changes no
phase, keeps `run_id`, spends no review permit, and stays inside the preimage-checked
transaction. Measured: this pair's own bodies were installed through that transition
roughly twenty times while drafting, with `draft_review` never leaving `not_started`.
So a proof can be written, a `check` run, a defect repaired and the proof refreshed,
all before any permit is reserved - which is what makes enforcing at `drafting`
implementable rather than circular. After `drafting` the body is frozen, which is
exactly why enforcement stops there.

Exclusion is not by itself a licence to write, which is the trap here. Measured while
drafting this pair: a body edit whose record bytes do not change is refused with
"persisted PlanRun bytes cannot change without a legal state event"
(`plan-run.mjs:1914-1919`), so a byte-only write into `## Verification Results` fails
even though the section is excluded from `plan_sha256`. Proof lines are therefore
written **inside the transaction that carries a lifecycle event**, exactly as this
pair's own `## Review` sections were. No acceptance row may require proof lines to
exist before the transition that writes them.

Executable check: A1 edits each key field alone, in turn - the Command cell, the
Expected cell, `step_id`, `source_base` - and the checker must report the row unproven
and name which key moved, every time. Editing every key is the point: a key that no
probe moves is declared rather than bound, which is the defect class this plan
removes. Third check: break a probe's assertion
and run the gate; it must fail, proving observations are re-run by CI rather than
trusted from the record.

### Sample stopping rule {mechanism}

A free pre-check passes only on K consecutive zero-finding samples over
**unchanged** bundle bytes, K configurable with a floor of 3. Any finding in any
sample must be resolved, and resolving it changes the bytes, which resets the
count to zero.

Executable check: supply a result set in which one sample carries a finding; the
aggregator must place it in the union and refuse a clean stop for that digest, and must
keep refusing until the digest changes. Supply a set with no findings and it must report
clean. Detection is not asserted anywhere: the aggregator consumes results it did not
produce, so a claim that it detects a planted defect would be satisfied by its own
fixture.

## Structural plan rules {mechanism}

Eighteen deterministic rules over a plan body, each one derived from a defect a real
reviewer returned during this plan's own drafting. They exist because the expensive
findings were mechanical: across five rounds of sampling on one document, most
findings were a renamed label, a dangling reference, or a count that disagreed with a
list - and two were regressions introduced by the previous round's repair. Sampling
cost roughly fifteen minutes per round; these run in milliseconds.

Scan scope is part of the contract, because it decides what every rule sees. Rules read
the body between the frontmatter and the first `## Review` or `## Verification Results`
heading; both hold operator and reviewer prose that no rule governs. `Plan-attempt-history`
lines are exempt from the commit-literal rule, because a superseded run's recorded base is
immutable history rather than a live producer base. The `Plan-run:` record itself stays in
scope for the repository-id rule, whose target field lives there and nowhere else.
The rule table itself is exempt, by construction: each row defines its rule by quoting an
example of what that rule rejects, so any rule scanning the table would fire on its own
definition. Measured across all eighteen rows, exactly one self-matches: R4, whose row carries
a placeholder literal of the shape it rejects. The exemption is stated for the table rather than
for that row alone, because every future rule added there will carry an example for the same reason.

|Rule|Rejects|
|---|---|
|R1|a row label quoted in prose that no enforced-quantity row carries|
|R2|an acceptance row that is neither runnable nor declares a non-command observable|
|R3|enforced quantities that are not 1:1 with producer commands, in order|
|R4|an unsubstituted template placeholder such as `__UPDATED__`|
|R5|a commit literal used as a producer base outside the record|
|R6|an acceptance id referenced in prose that is not a row|
|R7|an unresolved local `docs/plans/active/` path used by a producer; foreign-repository citations and archived `docs/plans/finished/` references are exempt|
|R8|a shell variable a producer cites but the body never derives|
|R9|a `binds` table that does not partition the acceptance rows exactly once|
|R10|a `step N` prose reference that is not in the Steps table|
|R11|a `binds: X` named in prose but absent from the `binds` table|
|R12|an acceptance-row subcommand that no step names|
|R13|a producer whose `P=` differs from this plan's own `plan_path`|
|R14|a `repository_id` shaped like a local filesystem path|
|R15|a step whose number word disagrees with the subcommands it names|
|R16|a Steps table whose row numbers are not strictly increasing|
|R17|an acceptance table whose row ids are not strictly increasing|
|R18|an acceptance row that names no step, an unknown step, or more than one|

### Measured rule proof and archive precision {measurement:snapshot}

A scratch mutation harness planted one defect for each rule and asserted that the
unfiltered failure set was exactly that rule's label. All eighteen were sole detectors
of their planted class. The harness also asserted that every mutation changed the bytes;
a temporary linter with L14 replaced by a no-op exited non-zero at L14, so the harness
observes the rule rather than printing a precomputed result. This proves discrimination
of the planted classes, not that every class has appeared in production.

The archive was re-measured with frontmatter, review sections, verification results and
Plan-attempt-history snapshots excluded from semantic scans; the Plan-run repository
record remains in scope for the repository-id rule. Across the 96 finished plans present at measurement the narrowed
measurement produced 147 firings: 143 came from 75 pre-PlanRunV1 records and are not
applicable to these conventions. The current-schema stratum has 21 plans, 4 firings and
5 distinct goal IDs; 16 of the plans share one release-chain goal, so these are not 21
independent observations. Only L14 fired: all four filesystem-shaped repository IDs were
classified true across four distinct goals. Precision is therefore 4/4 (100%) by firing
in this small census; the other seventeen rules have no real-defect firing in this corpus.
The result supports the separate claims "18/18 sole detectors of planted classes" and
"one rule with confirmed real-defect evidence", not a blanket claim that all rules are
production-proven.

Two of these reproduced findings a reviewer had already returned independently, and
R14 caught a contract violation - `repository_id` carrying a filesystem path against
`docs/plans/AGENTS.md:101` - that no validator checks and that both plans in this
pair were carrying.

Every rule is **construct-conditional**: it fires only on a plan that carries the
construct it governs, and is silent otherwise. That is not a convenience, it is what
keeps the archive from lighting up. Measured over the 96 plans then in
`docs/plans/finished/`: the rules as first written fired **581** times, and 0 of those
96 plans carried an enforced-quantity table or a `binds` table while only 32 carried any
acceptance row at all - so most firings were judgements about conventions those plans
never adopted. Conditioning two rules on construct presence cut the total to **281**
without changing either live plan's result. The later scan-scope and producer-path
refinements were separate rule-set changes, so this record does not present an
unreproduced intermediate as another arithmetic step. The final narrowed census above is
**147**. A rule that fires where its construct is
absent is measuring the archive's age, not its correctness, and a check with that
false-positive rate gets switched off - the same failure this plan already avoided at
the pre-state-gate stage.

Set size at measurement was 96. `docs/plans/finished/` now holds 97: archiving
`2026-07-30-plan-dispatch-driver.md` added one. Measured on that file, it carries acceptance
rows and carries neither an enforced-quantity table nor a `binds` table. So on a
re-measurement "0 of those 96 carried an enforced-quantity table or a `binds` table" stays 0,
and "only 32 carry any acceptance row" becomes 33. The 581-firing census itself is dated
rather than re-run, because the harness that produced it is what step 1 of this plan builds -
it does not exist yet, so a fresh figure here would be unbacked.

Executable check: run the rules over a plan body carrying a known defect of each class;
each must be named. Delete one rule and rerun: its class must go unreported by **any** rule
- the whole run reporting no failure at all - which is what proves the rule load-bearing
rather than decorative and separates it from a class some other rule already covers.
Deleting the rule is the stronger form, because it exercises the rule body rather than a
reporting switch. A mutation that leaves the bytes unchanged must fail the harness rather
than score as a silent rule: both produce the same signal, and the wrong repair is deleting
a working rule. Second check: run them over
`docs/plans/finished/`; every rule whose construct is absent must stay silent, and the
run must report rather than fail.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add the falsifiability record format, its writer and its verifier. The record is keyed to `command_sha256`, `expected_sha256`, `source_base` and `step_id`, and is absent when any key drifts. The writer records the observable named by each row's `binds` field; the verifier compares keys only and spawns no child process. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs` | — | `local` | `planned` | A proven row reports proven; editing any one key field - Command cell, Expected cell, `step_id`, `source_base` - reports it unproven and names which key moved. The verifier spawns no child process, which is what makes it safe to run over an arbitrary plan. A recorded observation that stops reproducing is caught by the gate that runs the probes, not by the verifier - that division of labour is the mechanism's central decision. If a rewritten row keeps its proof, STOP: the binding is not keyed to the bytes. |
| 2 | Gate on falsifiability in the self-check's `check` subcommand, with a `report` subcommand that prints records without judging them, naming a mode for each of the contract's six statuses (`docs/plans/AGENTS.md:63`): enforcing for `drafting` only; counting-only for `planned`, `scheduled`, `ongoing`, `finished` and `blocked`. The rule is immutability, applied consistently: a plan body may only change while `drafting`, because `LIFECYCLE_TRANSITIONS` offers no edge back to it and the content-mutation branch is `drafting` to `drafting` alone. Enforcing on any later status would demand a repair the transaction layer forbids - the sibling `plan-dispatch-driver.md` is `planned` with ten rows, no `Step` column and no proofs, and could never acquire them - and a gate that blocks a passed plan on its first run gets switched off. Coverage is reported by a separate `coverage` subcommand whose exit status reflects only the falsifiability dimension. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs` | 1 | `local` | `planned` | A drafting plan with an unproven row exits non-zero naming the row; `coverage docs/plans/finished/` exits 0 with a count and never fails on an unproven row. If the finished set blocks, STOP: a retroactive cliff gets the gate disabled. |
| 3 | Add a committed measurement producer and make the self-check re-run every `{measurement:committed}` quantity and diff it against the body. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-measurements.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs` | 2 | `local` | `planned` | Editing a quantity inside a `{measurement:committed}` block makes the self-check fail naming that claim. The self-check takes the commit from the record's `source_base`, never from body text, so a rebind cannot silently repoint a producer. Blocks marked `{measurement:snapshot}` are reported with their producer and never fail; `{measurement:operator}` blocks are never checked. If a committed-producer claim can go stale silently, STOP: the producer is not authoritative. |
| 4 | Add the K-sample pre-check aggregator: fixed bundle bytes, K caller-supplied reviewer results each bound to the same bundle digest, union of findings, pass rate, and the stopping rule with a floor of 3. It dispatches nothing and reserves nothing, so it stays outside the permit system. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/sample-review.mjs` | — | `local` | `planned` | K results over one identical bundle digest report a union and a rate; a supplied finding enters the union and prevents a clean stop for that digest. The aggregator is not required to detect anything - it dispatches nothing, so detection is not a property it can have. If the harness re-seals between samples, STOP: it is measuring rewrites, not variance. |
| 5 | Add `Proposed repair` to `EXCLUDED_SECTIONS`, document the section as non-authoritative and digest-excluded in **both** copies of the lifecycle contract, and bind the new sentence in the paired-clause test. The section is installed by the transition that blocks a run, never added to an already-blocked one, because `blocked` to `blocked` rejects any byte change (`plan-run.mjs:1908-1913`). | `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs`, `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `plugins/docks/skills/productivity/plan-workspace/SKILL.md`, `scripts/tests/plan-skill-phases.mjs` | — | `local` | `planned` | Adding a `## Proposed repair` section leaves `plan_sha256` unchanged; adding the same text under any other heading changes it. The sentence is present in both contract copies and the paired-clause test names it. If both change the digest, STOP: the exclusion is not wired. The owning `plan-workspace/SKILL.md` carries a refreshed `content_hash` for the same reason. If the sentence lands in one copy only, STOP: `plan-workspace` copies the template over `docs/plans/AGENTS.md`, so a refresh regenerates it away. |
| 6 | Add the seven probes as test scaffolding - `command-drift`, `stale-quantity`, `injected-defect`, `excluded-section`, `paired-clause`, `proof-writer` and `status-mode` - each exiting 0 when its expectation holds and non-zero when it does not. A probe whose expectation is that an inner command fails still exits 0 once it observes that failure: the child's status is evidence, never the probe's verdict, which is what keeps the suite green while still proving the child fails. Every probe operates on a scratch copy outside `docs/plans/`, drives any reviewer through a scripted response sequence rather than a live model so nothing reserves a permit, and asserts the live plan and its record are byte-identical afterwards. Register the probes in the orchestration suite. This step's condition is observed on a fixture body carrying recorded proofs, never on this plan, whose own proofs step 7 writes later - depending on them here would leave step 6 uncompletable and step 7 unstartable. | `scripts/tests/plan-evidence-probes.mjs`, `scripts/tests/plan-orchestration.mjs` | 1, 2, 3, 4, 5 | `local` | `planned` | `node scripts/ci.mjs --plugin docks` exits 0, the orchestration suite case count rises, and the self-check reports one proof line per acceptance row. `plan_sha256` is byte-identical before and after the proofs are written, because the section is excluded. The plan record is deliberately absent from `affected_paths` and from this step's Files, per `docs/plans/AGENTS.md:178` - "Never list the plan record in `affected_paths`; acceptance writes to it and breaks that bind". If writing proofs moves `plan_sha256`, STOP: the proofs are landing outside the excluded section. |
| 7 | Ship the eighteen structural rules as a `rules` subcommand of the self-check, alongside the existing P13/P16/P19 checks, and register its cases in the orchestration suite. Rules are construct-conditional, and their mode map is identical to the falsifiability gate's: enforcing for `drafting` only, counting-only for every later status. The Step-mapping rule ships here rather than in `check`, so an enforcing `rules` run would otherwise fail the `planned` sibling on a column its frozen body can never gain - the same immutability argument, and it has to hold in both subcommands or only one of them is safe. Then record this plan's own acceptance proofs into its `## Verification Results`, last of all, because recording earlier would bind A9 to a failing observation that this very step changes, and the drift rule would then report it unproven with no later step to refresh it. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`, `scripts/tests/plan-orchestration.mjs` | 6 | `local` | `planned` | `rules` names one defect per planted class on a fixture body and exits non-zero; a clean body exits 0. Deleting any one rule leaves its planted defect unreported, which proves that rule load-bearing. If a rule cannot be made to fail on a planted defect, STOP: it is decorative and must not be shipped. |

## Acceptance criteria

Each row states its class. Change-demonstrating rows are falsifiable by failing
against the untouched tree; invariant rows carry a named mutation probe, because a
gate demanding pre-state failure would flag correct invariant rows and get switched
off.

| ID | Step | Command | Expected |
|---|---:|---|---|
| A1 | 1 | `node scripts/tests/plan-evidence-probes.mjs command-drift` | Invariant under mutation. Exit 0: for **each** key field in turn - Command cell, Expected cell, `step_id`, `source_base` - the probe edits that field alone in a scratch copy, runs the checker, and asserts the row reports unproven naming that key; then restores it and asserts the row reports proven again. A key no case moves would be declared but unbound.

The probe also binds the negative claim, which is otherwise the largest unchecked
assertion in this plan: one fixture row is given a command that would be *detectable if
executed* - it writes a sentinel file and exits non-zero - and the probe asserts the row
still reports proven and that no sentinel exists afterwards. "The verifier spawns no
child process" is what justified deleting the sandbox, the argv grammar and the effect
gate, and key-drift cases pass whether or not the checker also executes, so without this
observation an implementation that re-executes rows would satisfy every row while the
whole scoping argument went unenforced. The probe works on a copy at a scratch path outside `docs/plans/` and asserts the live plan bytes and its `PlanRun` record are byte-identical afterwards. |
| A2 | 2 | `node plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs report docs/plans/active/plan-evidence-row-scales.md` | Change-demonstrating on its **output**, not its exit code. Prints one proof line per acceptance row in `report` mode, which prints records without judging them, keeping the printing path separate from the judging path. Fails today, measured: `report` is not a subcommand, so it exits 2 printing the usage line, and `plan-self-check.mjs` has no per-row proof, `command_sha256`, `source_base`, or frontmatter-status handling. The observable is the proof-line count rather than the exit status, because after the change exit 0 alone would also be produced by a `report` that printed nothing. |
| A3 | 2 | `node plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs coverage docs/plans/finished/` | Change-demonstrating. Exit 0 reporting a coverage count over that set, blocking nothing. Fails today, measured: `coverage` is not a subcommand and exits 2 with the usage line, so this row cannot be classified invariant. It also asserts the count is reported rather than enforced over that set: the rules fired 581 times across the 96 archived plans present at measurement before being made construct-conditional, so enforcing there would be the retroactive cliff STOP condition 1 names. The separate subcommand is what makes this exit status reachable: `check` also runs P19/P13/P16, so any unrelated failure in an archived plan would otherwise decide this row. Probe: switch the finished set to enforcing - it must exit non-zero, showing the counting mode is deliberate rather than accidental. |
| A4 | 3 | `node scripts/tests/plan-evidence-probes.mjs stale-quantity` | Invariant under mutation. Exit 0: the probe changes `1` to `2` in the committed-producer row "lines declaring `EXCLUDED_SECTIONS`" and asserts the child self-check exits non-zero naming that claim, because its producer - the `grep -c` above with `$B` read from the record - disagrees. It then restores the value and asserts the child exits 0, and separately edits a `{measurement:snapshot}` number and asserts the child does **not** fail, which is what distinguishes the classes. The child's expected non-zero status is evidence, never the probe's own verdict. The probe also submits each forbidden producer form in turn - an unknown `op`, an extra key, and shell syntax in a field - and asserts each is rejected before execution, with a sentinel command proving nothing ran; the rejection promise is otherwise declared and unbound, which is the class this repair swept. The probe works on a copy at a scratch path outside `docs/plans/` and asserts the live plan bytes and its `PlanRun` record are byte-identical afterwards. |
| A5 | 4 | `node scripts/tests/plan-evidence-probes.mjs injected-defect` | Invariant under mutation. Exit 0: the probe seals one fixture bundle and drives the harness through a **scripted reviewer response sequence** rather than a live model, so the outcome is deterministic and no permit is spent. The assertions are about the aggregator, the only component this step ships: given a result set in which one sample names a defect it must surface that finding in the union and refuse a clean stop, and given a set in which none do it must report clean. It never asserts a defect was *detected* - a scripted result naming a defect proves only that the script named it, an assertion its own fixture satisfies. It further asserts that a configured K below 3 is rejected; that every sample shares one unchanged bundle digest; that any finding permanently taints that digest, so a finding followed by K clean samples over the **same** digest still fails while K clean samples after a byte change pass; that K-1 clean samples never pass; and that the union and pass rate are reported. It snapshots the live plan bytes and draft-review invocation count before and after and asserts both unchanged, so a harness that reserved through the dispatch driver fails here. The probe works on a copy at a scratch path outside `docs/plans/` and asserts the live plan bytes and its `PlanRun` record are byte-identical afterwards. |
| A6 | 5 | `node scripts/tests/plan-evidence-probes.mjs excluded-section` | Invariant under mutation. Exit 0: the probe adds a `## Proposed repair` section in the same transaction that installs `blocked` and asserts the write succeeds with `plan_sha256` unchanged; it then attempts a byte-only edit to that already-blocked run and asserts the refusal "blocked PlanRun bytes are immutable"; and it moves the identical text under `## Notes` and asserts the digest changes. The refusal case is the one that matters, because a row that only compared digests would pass while the step stayed impossible. The probe works on a copy at a scratch path outside `docs/plans/` and asserts the live plan bytes and its `PlanRun` record are byte-identical afterwards. |
| A7 | 6 | `node scripts/ci.mjs --plugin docks` | Invariant. Exit 0. Probe: break one probe's assertion - the gate must exit non-zero, proving the new cases run inside the gate rather than beside it. |
| A8 | 5 | `node scripts/tests/plan-evidence-probes.mjs paired-clause` | Invariant under mutation. Exit 0: the probe asserts the `Proposed repair` sentence is present in **both** `docs/plans/AGENTS.md` and the `plan-workspace` template, failing if either lacks it. It is a single invocation that asserts each file separately rather than two greps joined by `&&`. A single `grep -c` over both paths exits 0 when only one matches, so it could not fail on the drift this row exists to catch. Probe: delete the sentence from the template only, then run `node scripts/ci.mjs --plugin docks` - the paired-clause test must fail naming the template, proving the binding is load-bearing rather than decorative. |
| A9 | 7 | `node plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs rules docs/plans/active/plan-evidence-row-scales.md` | Change-demonstrating. Exit 0 on this plan, which the rules already pass. Fails today: the `rules` subcommand does not exist. Probe: build one scratch copy per defect class; each copy must be named by exactly its own rule, and with that rule deleted the run over that copy must report no failure at all. A mutation that leaves the bytes unchanged must fail the probe rather than count as a silent rule. |
| A10 | 1 | `node scripts/tests/plan-evidence-probes.mjs proof-writer` | Invariant under mutation. Exit 0: the probe starts from a scratch plan with an unproven row, writes a proof through a legal lifecycle transition, reads it back, and asserts every record field is populated, that `plan_sha256` is unchanged, and that `acceptance.verification_sha256` binds the new `## Verification Results` bytes. It then attempts a byte-only write to the same section and asserts the refusal. Probe: drop the transition and write the bytes directly - it must exit non-zero. Nothing else in this table exercises the writer, so without this row an implementation could record proofs no transaction would accept. |
| A11 | 2 | `node scripts/tests/plan-evidence-probes.mjs status-mode` | Invariant under mutation. Exit 0: the probe builds one scratch fixture per contract status - `drafting`, `planned`, `scheduled`, `ongoing`, `finished`, `blocked` - each carrying an unproven row, and asserts the gate exits non-zero naming that row for `drafting` and exits 0 reporting a count for the other five. Probe: make any one of the five enforce - it must exit non-zero. The mode map is declared in two steps but only `finished` was exercised before this row, so an implementation enforcing on `ongoing`, or on `planned` where a frozen body could never be repaired, passed every other row. |

## Out of scope / do-NOT-touch

- The crash-safe dispatch driver, its probes and its reference update. Those are
  `docs/plans/finished/2026-07-30-plan-dispatch-driver.md`, which this plan does not touch.
- The PlanRunV1 schema. No field, event, status or transition is added, removed or
  renamed. Only `EXCLUDED_SECTIONS` gains one member.
- Review budgets. Two substantive permits per phase stays exactly as it is; the
  K-sample harness spends none, being a free pre-check outside the permit system.
- The finished plan set. Their bytes stay identical and their rows are counted,
  never enforced.
- Reconciling the drift between `docs/plans/AGENTS.md` and its `plan-workspace`
  template. Measured, counting with `wc -l`: the live contract is 455 lines, the template's fenced block
  435, with 46 lines present only in the live copy and 27 only in the template, and
  17 of the 46 live-only lines are the transport-refund contract this work cites. A
  refresh today would delete them. The step below that edits the contract puts its
  own sentence in both copies so this plan's deliverable survives a refresh;
  repairing the other 46 lines, and replacing clause enumeration with one
  byte-equality assertion, is separate work.
- `plugins/session-relay/` and `plugins/effect-kit/`. No behaviour there changes.
- Operator scratch scripts. They are not repository content.

## STOP conditions

1. Enforcing mode fires on a committed plan. A retroactive cliff over the whole
   finished set gets the gate switched off, which is the failure this design already
   avoided once at the pre-state-gate stage.
2. A rewritten row inherits its proof. The binding is not keyed to the bytes and the
   plan has not met its goal; record which key failed to move.
3. Adding `## Proposed repair` changes `plan_sha256`. The exclusion is not wired and
   a repaired body still has no legal home.
4. A byte-only edit to an already-blocked run succeeds. Immutability has been
   weakened, which is worse than the problem this plan set out to solve.
5. A recorded observation stops reproducing and nothing fails. The checker verifies
   bindings by design, so the gate is the only thing that re-runs a probe; if a broken
   probe assertion leaves `node scripts/ci.mjs --plugin docks` green, the observation
   is trusted rather than evidenced, which is the vacuity this plan removes.
6. `node scripts/ci.mjs --plugin docks` fails twice with the same signature and no
   change in the relevant bytes between attempts.

## Open questions

None. The scales, the falsifiability record shape, the enforcing and counting split,
the K floor of 3, the single-member `EXCLUDED_SECTIONS` change, and the dependency on
the dispatch-driver plan are all settled above.


Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"33565c793806ef3aa7604b6effefec63171ddafa2c32e14377252f6e96f3114b","invocations":1,"result_sha256":"effb0f89c32d46022959c5fcd3616a26ff61b16bffada6271e1818bb300f8101","state":"passed"},"execution_parent":"0b7d3ed31aacf60b1c1f47ccc3837ba388a96be0","goal_id":"3a1b14a3-1e58-4ede-92a8-ea3034793c3d","implementation_commit":null,"plan_path":"docs/plans/active/plan-evidence-row-scales.md","plan_sha256":"2f5eeec2e4317e759f0ef5bd249459d336076620c262684947617765f411f545","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"2492b60a-9166-4c89-81d9-3cee5f2da5a8","schema":1,"source_base":"a3462e201707fd75fc3dbb122e1905c76383c45e","source_sha256":"0e5c236d2b1303aec340814a4617cccad709e5ba98c763f144baa03e59ed0c9b"}

## Review

Plan-attempt-history: {"authorization_source_sha256":"7fe265131d26d2993b9b11c6266e1b67354990ef5405ef37c91b4da618220369","plan_bytes_sha256":"b0873bd33128c31ee034b87432b4f9f6e0eca4447e90b378820b6a3e18657f5c","replacement_run_id":"2492b60a-9166-4c89-81d9-3cee5f2da5a8","run":{"acceptance":null,"blocker":{"evidence_sha256":"a16f17b388e6ed12e23f3b2cfcdd914ac80725579a5e41d94564f155489e4b16","kind":"concurrent_change"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"a9de10f5cd5c4bdae6b4c9a83444a48da3127b5a54e6aa206e2c5716134de4fc","invocations":2,"result_sha256":"e500729df02717a912400a1ab9ed02233a171f2be1e5237bb065334cec22753f","state":"passed"},"execution_parent":null,"goal_id":"3a1b14a3-1e58-4ede-92a8-ea3034793c3d","implementation_commit":null,"plan_path":"docs/plans/active/plan-evidence-row-scales.md","plan_sha256":"b5c10b2159362e8b01197b7328872dc050f55249301d25ca10cb75b2291e8dcb","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"0eff10d5-c904-4390-91f5-de766e89c2c1","schema":1,"source_base":"3d7b9b0047b58f1dfa5756fec19ea803496e78eb","source_sha256":"0c004bc7e79b2a7696f127674ab7e141d9575186505c8c8a1a573d1408ab65e2"},"schema":1,"status":"blocked","successor_run_sha256":"ff8247bc420d264f3709d1666759c58692d1bd62e8e5c79a77f7701d0698fc51"}

Draft review invocation 1 returned `repair` with two findings, both reproduced from
repository facts and accepted, so the phase settled to `repairing`. The driver did not
settle them itself: `repairing` is for an accepted repair verdict only
(`docs/plans/AGENTS.md:198`) and reviewer prose never mutates state (`:360-362`), so it
captured the verdict and held the reservation for adjudication.

Both findings were the same class - something declared but bound to no check - so the
repair swept the class rather than patching the two instances:

- **F1, accepted.** The record stored `binds`, `observed` and `probe` but keyed proven
  status on the command, `source_base` and `step_id` alone, so editing a row's matcher
  or its named probe kept the proof. `expected_sha256` is now a key, and A1 moves every
  key field in turn.
- **F2, accepted.** A5 asserted a planted defect was "named by at least one sample"
  while the aggregator consumes scripted results, so its own fixture satisfied the
  assertion. The row now asserts aggregator behaviour and explicitly claims no
  detection.
- **Third instance, found by sweep.** The producer schema had declared three
  operations while the body contains one producer, and was narrowed to the single
  `show-count` form; a later plan widens the
  enum together with the producer and the row that exercises it.
- **Fourth instance, found by sweep.** The six-status mode map was declared in two
  steps while only `finished` was exercised, so an implementation enforcing on
  `ongoing` - or on `planned`, whose frozen body could never be repaired - passed every
  row. A `status-mode` probe now binds all six, one scratch fixture each.
- **Fifth instance, found by sweep, and the load-bearing one.** "The verifier spawns no
  child process" justified deleting the sandbox, the argv grammar and the effect gate,
  yet nothing observed it: every key-drift case passes whether or not the checker also
  executes. `command-drift` now gives one fixture row a command that would be
  detectable if run - it writes a sentinel and exits non-zero - and asserts the row
  still reports proven with no sentinel created. The central scoping claim is now
  checked rather than asserted.

Invocation 2 is the last permit and a second substantive repair verdict blocks this
plan. The repaired bytes therefore get a fresh free pre-check first, which is the loop
that carried this plan from twelve findings to two across six rounds.


## Verification Results

Not yet started.
