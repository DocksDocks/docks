---
title: Extract the plan lifecycle into its own cross-tool plugin
goal: Register the decision to move the three plan-lifecycle skills, their machinery, and the plan-reviewer agent out of docks into a self-versioned plugin, with the Codex dependency gap closed before any move.
status: drafting
created: "2026-08-01T21:18:16-03:00"
updated: "2026-08-01T21:18:16-03:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plugins, architecture, registered-idea]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager
  - plugins/docks/skills/productivity/plan-workspace
  - plugins/docks/skills/productivity/plan-reviewer
  - plugins/docks/agents/plan-reviewer.md
  - plugins/docks/.claude-plugin/plugin.json
  - plugins/docks/.codex-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - .agents/plugins/marketplace.json
  - scripts/ci.mjs
  - docs/plans/AGENTS.md
related_plans: []
---

# Extract the plan lifecycle into its own cross-tool plugin

## Goal

The plan lifecycle becomes a self-versioned plugin, and `docks` keeps only the
generic engineering skills. This plan is registered rather than started: the owner
asked for the idea to be recorded and deferred the work explicitly.

## Context & rationale

Every count below came from a command run on this checkout at `2298bbc`.

The lifecycle is already a subsystem wearing a skill costume:

| Artifact | Lines |
|---|---|
| `plan-manager/scripts/plan-run.mjs` | 2380 |
| `plan-manager/scripts/legacy-review-records.mjs` | 3446 |
| `plan-manager/scripts/lifecycle/*.mjs` | 2541 |
| `docs/plans/AGENTS.md` contract | 461 |
| total | 8828 |

It is 3 of 27 docks skills, yet it carries its own contract, its own schema
history, its own transaction and lock protocol, and the only plugin-shipped agent
in the repository. Two precedents exist: `session-relay` is self-versioned with
its own gate section, and `effect-kit` ships skills only and declares a
dependency on `docks`.

The dependency graph improves under a split, because `docks` today bundles both
the generic kit and the lifecycle engine, and `effect-kit` reaches the lifecycle
only by depending on the whole of `docks`.

### The gap that makes this deferred rather than ready

Codex plugin manifests declare no dependencies anywhere in this repository:

| Manifest | `dependencies` |
|---|---|
| `effect-kit/.claude-plugin/plugin.json` | present, naming `docks` |
| `effect-kit/.codex-plugin/plugin.json` | absent |
| `docks/.codex-plugin/plugin.json` | absent |
| `session-relay/.codex-plugin/plugin.json` | absent |

Five skills across two plugins route to the lifecycle by name. A Codex user who
installed only `docks` after a naive split would get `security`, `refactor`,
`skill-agent-pipeline`, and `effect-ts-port` routing to a skill that is not
installed. Claude Code would refuse or warn; Codex would fail silently at routing
time. Silent routing failure is the worst available outcome, so closing that gap
is a precondition of the move rather than a follow-up.

### Why no compiled binary

`session-relay` earns a binary because it is a long-lived message bus with
inter-process concerns. The lifecycle is file transactions, digests, locks, and
canonical JSON serialisation, measured at 0.1 to 0.3 seconds for a self-check. A
binary would add a four-platform build, a checksum manifest, and a release lane.
The release lane is the scarcest resource here: the 0.14.0 chain consumed 16 run
records. Excluded by measurement, not by omission.

## Environment & how-to-run

Run every command from the repository root of this checkout. Do not write an
absolute machine path into plan text: the bounded-workflow contract test rejects
any active plan citing a checkout path.

```bash
corepack enable && pnpm install --frozen-lockfile   # Node 24
node scripts/ci.mjs                                  # full gate: multi-plugin change
```

A split touches the registry and more than one plugin, so the full gate applies
rather than a single-plugin gate.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Make absent-lifecycle routing fail loudly, closing the Codex gap | the five routing skill bodies plus a shared preflight | — | `local` | `planned` | Each routing skill states a precondition naming the lifecycle plugin, and a probe run with the lifecycle skill hidden emits a message naming it instead of proceeding. Failure: STOP; silent routing failure on Codex is worse than no split. |
| 2 | Choose and record the plugin name | `docs/plans/AGENTS.md` | 1 | `local` | `planned` | The chosen name appears in the contract and does not equal the name of a skill it would contain. Failure: STOP and ask the owner; naming is the owner's call. |
| 3 | Create the plugin skeleton with both manifests and one catalog entry per marketplace | new plugin directory, `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json` | 2 | `local` | `planned` | Both manifests carry the same version, both catalogs list the plugin, and the full gate's lockstep check passes. Failure: STOP; a version disagreement is exactly what the lockstep check exists to catch. |
| 4 | Move the three skills and the reviewer agent, preserving history | the three skill directories, `plugins/docks/agents/plan-reviewer.md` | 3 | `local` | `planned` | For one moved file per skill, history following reaches a pre-move commit, and no moved path exists in both the old and the new location. Failure: STOP; a copy that leaves the original behind creates two divergent lifecycles. |
| 5 | Move docks' own version and description to match a smaller payload | `plugins/docks/.claude-plugin/plugin.json`, `plugins/docks/.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json` | 4 | `local` | `planned` | Both docks manifests and the versioned Claude catalog entry carry one identical new version, and neither manifest description still advertises a `docs/plans` lifecycle it no longer ships. No skills array needs editing, because docks globs skills by directory. Failure: STOP; the lockstep check treats a partial bump as a disagreement, and a description promising a removed capability is a false claim to consumers. |
| 6 | Re-point every reference and add the plugin's gate section | `scripts/ci.mjs`, the routing skills, `docs/plans/AGENTS.md` | 5 | `local` | `planned` | The full gate exits 0 and a repository-wide search finds no reference to a moved skill at its old path. Failure: STOP; do not relax a validator floor to pass. |
| 7 | Archive this plan | this plan record | 6 | `local` | `planned` | Plan is `finished` at the dated archive path with a local commit. Failure: leave `ongoing`. |

## Acceptance criteria

Each row names a command together with the output shape that satisfies it. That
pairing is deliberate: the run that preceded this one lost three review rounds to
commands whose output could not produce the claim written beside them.

1. `node scripts/ci.mjs` exits 0 with a clean working tree.
2. `node scripts/tests/plan-orchestration.mjs` exits 0. This is the suite that
   reaches the dispatch probes, so it covers the lifecycle driver after the move.
3. For one moved file per skill, `git log --follow -- <new-path>` prints at least
   one commit that predates the move. The `--follow` flag is required: without it
   the command reports post-move history only, and the row would pass while
   proving nothing.
4. No reference to a moved skill's old path remains, expressed as a satisfiable
   observable: `! git grep -q <old-path>` exits 0. The negation is deliberate,
   because `git grep` exits 1 with empty output when it finds no match, so
   phrasing this as a command that "returns nothing" and expecting exit 0 would
   be unsatisfiable.
5. With the lifecycle skill hidden, a routing skill emits a message naming the
   missing plugin. Asserting only that routing "handles" absence would be a
   criterion with no observable, which is the mirror of a check that cannot fail.

Every row is anchored to a command and an output shape rather than to a row
number, so renumbering the Steps table cannot desync it.

## Out of scope / do-NOT-touch

- Publishing or releasing the new plugin. Extraction and gating are local work; a
  first release is a separate plan with its own effects and authority.
- Any change to the review permit budget or the contract's review rules. That is
  a separate goal, and the owner asked for it first.
- The `session-relay` and `effect-kit` payloads, apart from re-pointing their
  references to the lifecycle skills.
- Every plan under `docs/plans/finished/` — historical records stay
  byte-identical.
- Compiling any part of the lifecycle to a binary. Excluded by the measurement
  above.

## STOP conditions

1. Any row whose `Effect` column is not `local` is reached. This plan requests
   local effects only, so a step needing to publish, push, or release means the
   scope changed and the plan must be re-drafted with new effects and live
   authority rather than stretched to fit.
2. A routing skill is moved before its absent-lifecycle failure path is
   observable on Codex.
3. The gate needs a floor lowered, a census edited to match a scan, or a golden
   hand-edited to pass. Any of these means the change is wrong, not the check.
4. A move is performed as copy-then-delete across separate commits, which breaks
   history following and cannot be repaired afterwards.
5. The owner has not chosen the plugin name.

## Open questions

1. The plugin name. `plan-manager` collides with the skill of that name it would
   contain; `plan-lifecycle` reads unambiguously. The owner decides.
2. Whether a version-compatibility matrix between the lifecycle plugin and
   `docks` is needed, or whether both track the same major. To be measured
   against how `effect-kit` already pins `docks`, not guessed.
3. Whether the Codex gap is better closed in each routing skill or once in a
   shared preflight. Measure the duplication before choosing.

## Review

Not dispatched. This plan is registered at the owner's explicit instruction and
holds a full review budget. No permit has been reserved or spent.

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"execution_parent":null,"goal_id":"2ee17ed0-f3e0-483a-9c79-15bc68bf39a8","implementation_commit":null,"plan_path":"docs/plans/active/plan-lifecycle-plugin-extraction.md","plan_sha256":"c3368dcd763ee0e415a737566ee4e8e3a41d44ef42c71849aca279ca5ffdec36","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"84b7d04d-b23a-4313-9793-a330a4f65a4d","schema":1,"source_base":"2298bbc7fac269b57ce6915ff82d84e452b661b8","source_sha256":"8232968504c46ac2961fe72dc2da202bfacd54a4af7f3e70035d953a3f6c1c70"}

## Verification Results

Manager-written after execution. Empty at registration time.
