# Phase 2c — Content-Accuracy Audit

Verify every checkable claim in each EXISTING skill and agent against the source **as it is now** — file:line refs, quoted snippets, and named identifiers. This is the phase that gives the pipeline its purpose: it is the only check that catches drift baked in *before* the recorded baseline. Distinct from Phase 2b (which extracts *new* patterns for the builder) — 2c looks *backward* at what the artifacts already assert.

<constraint>
Vertical accuracy, not horizontal change. `metadata.updated`, `content_hash`, and git history prove only that text CHANGED — never that it MATCHES source. Ignore all three here. Open and read the cited source for EVERY claim: a skill "updated today" can document an API that never existed.
</constraint>

<constraint>
No artifact may be reported accurate without stating how many claims were opened and verified. A `CLEAN` verdict with "0 claims checked" is a fail, not a pass — that spot-check false-confidence is exactly what this phase exists to kill.
</constraint>

<constraint>
Per-finding reproduction is mandatory. Before a drift finding lands, re-open the cited source and confirm the mismatch at the current `file:line`. DROP anything you cannot reproduce under `## Dropped (failed reproduction)` with a reason.
</constraint>

## What counts as a checkable claim

| Claim type | Example | Verify by |
|---|---|---|
| file:line / path ref | `src/db.ts:42`, `routes/checkout.ts` | read the line/file; confirm it says what the artifact asserts — not merely that it resolves |
| code snippet from source | a fenced block attributed to a file | grep the snippet; confirm it still appears (reformat OK, logic drift NOT) |
| named identifier | function / class / method / env var / route / config key / CLI command | grep the symbol; confirm it is DEFINED, not just mentioned |

Soft prose with no source anchor — heuristics, style advice ("prefer early returns"), rationale — is **not** a checkable claim. Mark it `unverifiable`; never bucket it as drift.

## Drift taxonomy (one verdict per claim)

| Verdict | Meaning |
|---|---|
| `confirmed` | source matches the claim |
| `broken-ref` | path / file / line no longer resolves |
| `stale-snippet` | snippet exists in source but the text has drifted |
| `fictional-api` | identifier asserted to exist is NOT defined anywhere (e.g. `getEntry()`, `ApiClient.processPayment`) |
| `drifted-description` | identifier exists but is shaped / behaves differently than described |
| `line-anchor` | a live `path:NN` in a long-lived body (the path resolves in the project) — even if currently accurate, it rots on the next edit; fix = CONVERT to a durable anchor (`path` — `symbol` — purpose — `verify:` command), not just re-point the number. Fictional example paths are exempt. |
| `unverifiable` | soft/heuristic claim, no source anchor — not counted as drift |

## Procedure — per existing skill (`SKILL.md` + every `references/*.md`)

1. Enumerate EVERY checkable claim (the three types above). **Count them.**
2. For each, run its verification and assign a verdict. Audit **full** — every ref and every snippet, not a sample.
3. Reproduce each drift before recording it; drop unreproducible ones.
4. Derive `cited_source_files` = the set of source files actually opened. This is a *floor* (what the skill currently cites), not a complete set — a coverage gap is Phase 2a's job. It seeds the next run's git-delta pre-filter and Phase 3 frontmatter.
5. Roll per-claim verdicts into the artifact verdict (deterministic, so two runs agree):
   - `CLEAN` — zero drift (broken + stale + fictional + drifted = 0).
   - `REWRITE` — **any** `fictional-api`, OR drift ≥ 30% of claims checked.
   - `REFRESH` — otherwise, ≥1 drift.

## Agents (existing) — same loop, lighter

Run the identical enumerate → verify → taxonomy over each on-disk agent body (`.claude/agents/*.md`). Audit the **logical** agent once — the `.codex/agents/*.toml` twin shares its prose, so don't double-count. A non-`CLEAN` agent escalates to **regenerate** in Phase 5 (agents are not part of the Phase 2a skills delta).

## 2a reconciliation (feedback to the delta)

After this phase, return to the `## Phase 2a` block and amend each non-`CLEAN` **skill** action inline: append `→ escalated by 2c: REFRESH|REWRITE (<top finding>)`. Route non-`CLEAN` **agents** to the Phase 5 regenerate list. The gate then reads one reconciled delta, not two conflicting ones.

## Optional Claude-only acceleration (output-identical, non-normative)

On Claude Code only, the orchestrator MAY dispatch one read-only auditor per artifact in parallel and merge results into the single `## Phase 2c` heading — the output table MUST be byte-identical to the sequential procedure. This is a runtime accelerator, not part of the portable pipeline; other runtimes run the loop sequentially in this context. This is the most expensive phase by design — that cost is the point; it is the only one that catches pre-baseline drift, so never substitute a sample to make it cheaper.

## Output (write under `## Phase 2c: Content-Accuracy Audit`)

One row per skill and per agent:

| Artifact | claims checked | confirmed | broken-ref | stale-snippet | fictional-api | drifted-desc | verdict |
|---|---|---|---|---|---|---|---|

Then a roll-up line — total claims checked / total drift / skills CLEAN·REFRESH·REWRITE / agents CLEAN·REGEN — and a `## Dropped (failed reproduction)` block. Every artifact gets a row even when CLEAN (with its non-zero claims-checked count); if the whole tree is clean, still write the table — never "no changes" without the counts.

## Gotcha

| Gotcha | Fix |
|---|---|
| Reporting a skill CLEAN after reading 3 of 40 refs | State claims-checked; CLEAN requires every checkable claim opened |
| Treating `metadata.updated`="today" or a matching `content_hash` as accuracy | They prove the text changed, not that it matches source — re-verify regardless |
| Bucketing a heuristic ("prefer early return") as `drifted-description` | Mark it `unverifiable` — only source-anchored assertions get a drift verdict |
| Auditing the `.toml` twin separately from its `.md` | One logical agent, one audit — the prose is shared |
| Reading git history to judge staleness | Pre-baseline drift predates every diff — judge against current source only |
