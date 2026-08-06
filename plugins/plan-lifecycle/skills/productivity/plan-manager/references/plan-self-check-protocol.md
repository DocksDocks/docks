# Plan self-check: the unit-gated protocol

Every rule here replaced a rule that was measured to fail. The measurements are quoted because
the failure modes are counter-intuitive: the discarded design was reasonable, popular, and wrong.

## Contents

- [What this is not](#what-this-is-not)
- [The measurement that killed scoring](#the-measurement-that-killed-scoring)
- [Units, not documents](#units-not-documents)
- [The scoping rule](#the-scoping-rule)
- [What the script decides](#what-the-script-decides)
- [Literal scope coupling](#literal-scope-coupling)
- [No bespoke gate per plan](#no-bespoke-gate-per-plan)
- [Declaring mechanisms](#declaring-mechanisms)
- [Approvals expire on dependency change](#approvals-expire-on-dependency-change)
- [Fixes arrive as bytes](#fixes-arrive-as-bytes)
- [Judge independence](#judge-independence)
- [The unscored hunt](#the-unscored-hunt)
- [Reviewing after implementation](#reviewing-after-implementation)
- [Evidence summary](#evidence-summary)
- [The pre-bundle scope boundary](#the-pre-bundle-scope-boundary)
- [Running it](#running-it)
- [Transport and egress](#transport-and-egress)

## What this is not

This is **not** the canonical plan-review path, and its verdicts are never `PlanReviewV1` evidence.

|          |canonical review|this self-check|
|---|---|---|
|owner|the `plan-reviewer` skill|the plan's author|
|contract|`PlanReviewV1`, validated by `plan-reviewer/scripts/review-policy.mjs`|no wire contract; a local ledger|
|verdicts|`pass` / `repair` / `blocked`|`pass` / `fail` / `unverified` / `not_applicable`|
|input|one immutable bundle, digest-bound|the live working document|
|budget|counted review permits per phase|none; run it as often as you like|
|authority|gates the lifecycle at every risk|is the draft gate at local risk only|

<constraint>
The verdict vocabularies are deliberately disjoint so a return from one can never be mistaken for
the other. A self-check ledger never produces `PlanReviewV1` and never satisfies a review permit:
at sensitive or external risk it is what you run before spending one, so the permit is spent on a
document that already passes its own mechanical checks. At local risk it is the whole draft gate —
a passing ledger settles `draft_review` to `not_required`, which spends no permit and freezes the
draft body exactly as a passed review does. It never settles a completion review at any risk: local
work still spends its one substantive completion invocation on the implementation diff.
</constraint>

## The measurement that killed scoring

One plan was reviewed eleven times, every finding repaired between rounds, scored out of 100 on
six weighted axes, gated at 90. Scores: 42, 58, 48, 40, 54, 58, 73, 59, 63, 56.

Then the same document — byte-identical, 41,352 bytes — was scored seven times in fresh contexts
with the same model, effort, and prompt: 38, 55, 51, 60, 64, 62, 56.

|                                        | mean | sd  | range |
|----------------------------------------|-----:|----:|------:|
| eleven rounds of **real repair**       | 55.1 | 9.3 | 33    |
| seven scorings of **one unchanged doc**| 55.1 | 8.1 | 26    |

The means agree to one decimal. Eleven rounds of repair produced a distribution indistinguishable
from re-scoring one unchanged document, so the scalar measured the judge.

The gate was also unreachable. The cheapest defect kind cost 2 points, so 90 demanded at most five
findings; the fewest ever returned in eighteen passes was twelve. Best observed: 73.

Two supporting measurements. Absolute findings per round stayed at 17.2 ± 3.9 while the document
grew from 17 KB to 43 KB — output flat, document 2.5× larger, so each pass sampled a defect pool
it could not exhaust. And the largest jump in the series, +15 to the best score of all, landed on
a document that was eight of eleven sections byte-identical with 79% of the prior round's findings
unrepaired; 12.7 of those 15 points were re-scoring of unchanged text.

<constraint>
Never gate on a score, a ratio, or any threshold over a judged quantity. A coverage percentage is
the same defect wearing a denominator: it invites arguing about the cut line instead of naming
what is wrong. Gate on a finite set of named items, each individually resolvable.
</constraint>

## Units, not documents

A property is judged once per **unit**, over a set the script enumerates. Units come from bounded,
author-visible structure: acceptance rows, Steps rows, declared mechanisms.

Document-level booleans were tried first and are unusable. Judged on the known-bad pre-probe
bundle, fourteen mandatory properties blocked; judged on the corrected bundle quoting 33 of 33
passing probes, **the same fourteen still blocked — 0 cleared.** A property reading "every numeric
claim cites its command" is false in any 40 KB document, on every revision, so it discriminates
nothing while sounding rigorous.

Unit judgements are also more reproducible. Across replicates the document boolean for one property
flipped 4/7, while replicates naming concrete units agreed on exactly `{A22, A25, A27}` in 3 of 3
contexts, and three properties reached full unit consensus in the 7-context run.

**A unit passes, is fixed, or carries a recorded waiver** naming the reason and who accepted it.
That terminates: the set is finite and every member is individually resolvable.

## The scoping rule

|Quantification|Disposition|
|---|---|
|universal over a **bounded** set|gates, judged per unit|
|universal over an **unbounded** set|**advisory only** — feeds the hunt, never blocks|
|existential|gates at document level, since one witness satisfies it|

Advisory properties are not decoration. The unbounded ones produced true, specific findings —
naming `2,345 lines`, `22 exports`, `65 scratch drivers` as uncited counts. They route to the
work queue without holding a gate they can never open.

## What the script decides

Five properties never reach a model: mechanism existence, declared paths versus Steps, step
dependency ordering, stable step identifiers, and literal scope coupling. Each is mechanically
decidable, so asking a reviewer to repeat it would add variance rather than evidence.

The step-dependency property earned its way here by measurement: the model reached only 29%
unit-level consensus on it, the worst of any property, while a topological check is exact.

<constraint>
When a property is mechanically decidable, the script decides it. Model variance is a cost paid
only for judgements that genuinely require reading. Moving a decidable property into the model is
how a gate acquires a coin flip.
</constraint>

## Literal scope coupling

When supplied a repository root, P21 runs the deterministic scope check:
for each declared path P, it scans tracked files whose extension is one of `.mjs`, `.js`,
`.cjs`, `.ts`, `.json`, `.toml`, `.yml`, `.yaml`, `.sh`, `.rs`, excluding `.git/`,
`node_modules/`, `docs/plans/`, any `target/`, and `fixtures/legacy-regression-tree/`, and
matches only inside quoted string literals: a literal containing the full declared path, or —
only when that path's basename is unique across tracked files — a literal equal to the basename
or ending in `/` plus the basename. Any matching file not itself in `affected_paths` is an
undeclared coupling.

Markdown is deliberately outside this mechanical check, and binary-looking files (those
containing a NUL byte) are skipped.

Waivers are a separate closed JSON input: `{ "schema": 1, "waivers": [{ "file": "...", "path":
"...", "reason": "..." }] }`. A waiver names one exact coupling — the offending file AND the
declared path it couples to — must be unique, must reference a declared path, and must carry a
non-empty reason. `--scope-waivers` supplies the file to the self-check and the dispatch driver.
Malformed, empty-reason, duplicate, or undeclared-path waivers are refused.

Waiving a declared path wholesale is deliberately impossible, and the reason is measured. An
earlier path-keyed shape let one waiver on a widely-referenced module clear all of its couplings
at once: two were genuine second-order references, the third was a first-order caller whose
fixture tree copied a facade without its runtime modules. The check had reported it; the waiver
hid it, and the defect surfaced only as a failing repository-wide gate. Pair keying makes each
suppression a specific reviewable claim, and a newly appearing coupling of an
already-waived path is reported instead of inherited.

This boundary is measured, not complete. Against the predecessor's 26-path declaration it caught
7 of 11 real omissions. It missed `mutations.mjs` and `fixtures/plan-run-v1.mjs` because they
couple through the symbol `accepted_classes`, not a path; `sample-review.mjs` because it imports a
module that was itself undeclared; and `plan-self-check-protocol.md` because it is a Markdown
contract mirror. Literal-path couplings in code are caught. Symbol-expressed couplings, Markdown
contract mirrors, and second-order references to shared infrastructure still require judgment or
a reasoned waiver. A plugin manifest description that enumerates MCP tool names is another
symbol/tool-name coupling this check cannot discover.

## No bespoke gate per plan

`scripts/plans/no-bespoke-gates.mjs` is a repository guard, not a rubric property: it judges the
repository, runs no model, and gates the shared tooling rather than one plan. It scans every
shipped `.mjs`, `.js` and `.cjs` module outside `.git/`, `node_modules/`, `target/`, `dist/` and
any `test/`, `tests/` or `fixtures/` directory, and considers every exported function that
collects findings into a local array and hands that array back. Such a function is reported when
four measurements hold at once: at least one finding is pushed inside a loop over a set derived
from the function's own parameters while nothing outside the loops requires that set to be
non-empty; the body validates against a versioned schema identity it declares itself; at most one
other shipped module names the export; and a plan body under `docs/plans/` names it. It exits 1
naming each reported gate and the four measurements behind it, 2 on an unreadable root.

The rule it enforces is that **a gate certifying one member of a set at a time must require that
set to be non-empty**, and that a verification mechanism must answer to more than one caller.

A plan invented an accepted-class sweep: its own ledger schema, digest helpers, CLI subcommand and
test surface, built for a review budget a later change removed. With an empty accepted class set
its clearance loop never ran and only an empty-verdict ledger validated, so it asserted nothing
while looking like a gate, and it was deleted at net gain in `28135d3`. It was the second
plan-specific verification mechanism to be invented, go stale and be removed. Run against the tree
as it stood immediately before that deletion the guard names `validateAcceptedClassSweep`, its one
consumer, and the finished plan that named it; run against the tree after, it reports nothing.

This boundary is measured, not complete. Two current exports — `structuralPlanRules` and
`validateReturn`, both in `plan-self-check.mjs` — have the empty-tolerant coverage shape and are
cleared only because they mint no artifact of their own and no plan body names them. A bespoke
gate that declares no schema, or that a plan invents without naming it, is outside the check. The
shape it does catch is the one that has now cost two removals.

## Declaring mechanisms

A mechanism is declared by appending `{mechanism}` to its heading. It is **not** inferred from
heading depth: inference was tried, and of five `###` headings in a real plan only two were
mechanisms, so the probe properties would have demanded executable evidence for a facts table and
a path list — forcing waivers on units that were never in scope. Depth also encodes freeze
granularity, so reformatting would silently alter the mechanism set.

An opt-in marker carries the opposite hazard: declare nothing, and the five probe properties
quantify over an empty set and all pass. That is the `acceptance-vacuous` class from this rubric's
own source corpus, so an existential property requires at least one declared mechanism, or a
waiver recording that the plan has none.

## Approvals expire on dependency change

An approval survives only while everything it depended on is unchanged: the section's bytes, the
repository HEAD it was judged against, and the digests of the probes it relied on.

Keying on section bytes alone is insufficient, and the failure is on record: one round legitimately
re-judged eight byte-identical sections because probe evidence appeared **elsewhere** in the
document. That is a dependency change, and an approval keyed only to its own bytes would have
frozen a stale verdict.

## Fixes arrive as bytes

Every failing item carries `replaced_text` — the exact existing bytes, which must appear **exactly
once** — and `replacement_text`. `DELETE:` removes the unit. Fixes apply in a stated order.

Both fields are required because the author's translation from review prose into an edit is where
stale text is born: round after round, findings read "X still says the old thing" when the
mechanism had been fixed and its description had not. Ordering matters because every regressive
round in the eleven came from applying interacting fixes simultaneously — an added escape hatch
that became a safety bypass, a restore that would have reverted a third party's staged work, and
an amend seeded from the wrong commit that dropped implementation files.

## Judge independence

The reviewer SHOULD be a different model from the one that authored the plan, and preferably from a
different vendor: a judge sharing the author's training data plausibly shares its blind spots. This
is a SHOULD, not a MUST — a consumer with one provider configured must still be able to clear this
gate.

For the canonical review path this is already settled and is not this document's to decide: that
path selects a primary reviewer from a resolved candidate chain that prefers the other company's
model, with same-company selection as an availability-only fallback, so a single-subscription user
is never blocked. Nothing below overrides that; it only measures how much independence buys.

Record it instead of assuming it. `ledger --reviewer <label>` stores an opaque caller-supplied label
per verdict; `gate` reports the distribution over passing units and notes when every pass came from
one reviewer. The tool never learns or names a vendor: routing is the caller's business, and
hardcoding a pair here would break single-provider consumers.

<constraint>
Do not claim a measured benefit from cross-vendor review **of a plan document with no tools**. That
regime was tested — prompt bytes, harness, tool grant (none) and effort held constant, only the model
varied; two frontier models from different vendors, three runs each, 70 comparable (property, unit)
pairs — and the result does not support the claim:

|Comparison|Gate-bit agreement|
|---|---:|
|within vendor A|90.5%|
|within vendor B|89.5%|
|**across vendors**|**88.6%**|

Cross-vendor disagreement exceeded same-vendor run-to-run noise by 1.4 points. A tempting
"complementary blind spots" story — every unique find of one vendor landing in a property class the
other under-weighted — did not survive its null control: forming pseudo-vendors by splitting the six
runs every possible way, **6 of 10 random splits produced an equally clean class-disjoint
partition** (p ≈ 0.60), and the largest per-property gap ranked only 4th of 10 (p ≈ 0.40), with a
random split beating it. Of seven unique findings, one was unanimous within its vendor; the rest
were split votes inside the ~90% agreement band.
</constraint>

That negative result is **scoped to tool-free reading of a document**, and says nothing about the
regime where review actually has leverage. Nothing above tests a reviewer that can execute: its
failure surface is which commands it thinks to run and how it reads the output, not how it parses
prose. The seventeen corrections that only executing code ever produced were found by no reviewer in
eleven rounds of document review by either vendor, so document-review agreement is the wrong place to
look for the value of a second opinion.

Prefer an independent judge on principle and for defence in depth, at a cost of one extra dispatch.
For post-implementation review — where probes run — treat vendor diversity as untested here rather
than as unhelpful.

## The unscored hunt

Each round also runs one pass with **no rubric supplied**, returning findings and no score.

This exists because the rubric's author is the plan's author, so the rubric is written in the shape
of the plan and cannot see what its author cannot see. A hunt finding matching no property is a
rubric hole, recorded as a proposed property and adopted as non-mandatory. Promotion to mandatory
requires human ratification; neither the plan author nor the judging model may promote.

Completion blocks while any hunt finding is untriaged, or any triaged critical or high finding is
unresolved.

## Reviewing after implementation

Of 133 findings in the derivation corpus, 89 — **67%** — were wrong-mechanism or unbacked-claim.
Those classes are settled by execution and not by prose, which is why review is most valuable
pointed at running code.

Seventeen corrections to one plan were found by executing a probe suite against a scratch
repository. **None was found by any reviewer in eleven rounds.** Two would have caused data loss:
restoring owned-path bytes would have destroyed the author's own edits, and an amend seeded from
the wrong commit silently dropped implementation files.

Triggers — not step completion:

- a probe result contradicts the plan text
- the implementer declares uncertainty about a mechanism
- the next action crosses an irreversible boundary: push, release, deploy, production access

<constraint>
A post-implementation review must probe destructive transitions, rollback, and negative cases in
isolation. The plan's own acceptance gates may encode the same misconception the plan does, so
"the suite passes" is not evidence that the mechanism is right.
</constraint>

A probe a cold implementer cannot run is not evidence. Probe paths must be repository-relative and
present; an operator-local path outside the repository fails the gate. That defect was real — a
plan's strongest evidence lived outside its repository, and eleven rounds of prose review never
noticed, while the property rubric refused it on the first pass.

## Evidence summary

|Claim|How it was measured|
|---|---|
|scalar scores measure the judge|7 scorings of one byte-identical document: sd 8.1 vs sd 9.3 across 11 real rounds, identical means|
|the 90 gate was unreachable|cheapest kind 2 pts ⇒ ≤5 findings needed; observed floor 12 over 18 passes|
|document booleans do not discriminate|0 of 14 blocked properties cleared on a corrected bundle|
|unit verdicts are stable|16 of 17 mandatory properties identical across 7 fresh contexts|
|the rubric is not blanket refusal|one property passed 7/7 on the same bundle|
|the probe properties catch real defects|5 of 5 refused the pre-probe bundle in 7 of 7 runs|
|the property set partly generalises|derived from rounds 1–8; 96% class-level recall on held-out rounds 9–11 — **author-contaminated**, since those rounds had been read before the properties were written, so it is weaker than a clean holdout|
|it catches what review missed|17 of 17 probe-only corrections map to a property; one property accounts for 6|

## The pre-bundle scope boundary

`dispatch-review.mjs` runs P21 against the exact candidate `--body` bytes and repository root
before it creates the bundle directory, seals a bundle, or calls `reserve_review`.
`--scope-waivers=<file>` supplies reasoned exact file/path waivers. Scope failure exits before
bundle creation, permit reservation, or reviewer dispatch. The sealed reviewer prompt then
carries bundle identity and the judgment contract only; it does not restate deterministic
property statements.

## Running it

`plan-self-check.mjs` — `units` · `check` · `sections` · `prompt` (`--hunt`) · `validate` ·
`ledger` · `waive` · `gate` · `apply` (`--commit`). No subcommand computes, prints, or accepts a
score, and a return carrying one is refused. `check` accepts `--repo <root>` and
`--scope-waivers <file>`; `gate` takes the review ledger positionally and accepts both flags.
Without `--repo`, either command uses its current working directory.

Verify with `node <plan-manager-dir>/scripts/lifecycle/plan-self-check.mjs check <plan.md>`.

Per round: `prompt` the plan, dispatch it, `validate` the return, `apply` the fixes in order,
`ledger` the result, then `gate`. Run `prompt --hunt` in parallel as the unscored pass.

## Transport and egress

The tooling performs no network access and dispatches no reviewer. It formats state and validates
returns, so the transport is the caller's: a local model, a colleague, a CI job, or a vendor.

<constraint>
Sending plan text to a third party ships whatever the plan describes — architecture, paths,
embargoed work — to that party. Only the repository's owner can make that decision, under their
own authorization. A grant in one operator's agent configuration does not travel with this skill,
and no vendor or model is named here by design.
</constraint>
