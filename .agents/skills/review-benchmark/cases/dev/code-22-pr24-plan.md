<!-- plan-contract: v3 -->

## Goal

Make the shipped plan lifecycle create the linked plan branch when implementation starts, replace the two-round code-review dead-end with a bounded repair loop that never strands uncommitted work, give plan review the same bounded repair loop so a repaired plan is always re-reviewed until it passes or a user-only decision blocks it, move review records from the issue body to issue comments, and make the frozen-history rule unambiguous across every mirror. This is needed now because a real run stopped after a `fixes-required` re-review with repaired code left uncommitted, because `Plan-review: repair` today ends phase 4 with repaired plan bytes that no round ever reviewed, and because per-round body appends carry an avoidable export-and-edit write cycle.

Mode: plan-and-implement

## Research

- Reproduced the dead-end: `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md` (phase 6) and `references/plan-contract.md` (Review records) force exactly one repair re-review, then `Code-review: blocked`. The observed failure mode is an agent stopping with repaired, uncommitted work and no pull request.
- Reproduced the phase-4 twin: after `Plan-review: repair`, the manager fixes findings and proceeds; the skill forbids a second round, so no round ever reviews the repaired plan bytes.
- The landing sentence "ensure a non-default branch" is the only branch rule and first applies after `Code-review: pass`. It appears in five mirrors: `plan-manager/SKILL.md`, `references/plan-contract.md`, `references/github-issue-publication.md`, `plan-workspace/references/plan-md-template.md`, and this repository's `docs/PLAN.md`. Implementation can therefore legally run on the default branch.
- `gh issue develop` verified against the installed GitHub CLI 2.86.0 help output: `--base`, `--checkout`, `--list`, `--name`, and inherited `--repo` exist; a created branch links in the issue Development panel; the default branch name derives from the issue number and title. Source: `gh issue develop --help` (manual: cli.github.com/manual).
- Decided branch rule (revised after plan review): every `gh issue develop` call passes `--repo <nameWithOwner>` for the repository the publication preflight resolved. At implement start, after `plan.mjs status <issue> ongoing`, reuse an existing linked branch from `gh issue develop --list`; otherwise create with `--base <default-branch> --checkout`. After any failure, re-run `--list`; when a linked branch exists, verify it belongs to the resolved repository, fetch it, and check it out. When no linked branch exists after recovery, set the plan blocked; implementation never proceeds on an unlinked branch. This action is routine under the settled mode, like issue publication. Plan-only runs never reach implement, so they never create a branch.
- Decided loop rule (revised after plan review): both review phases loop. On `fixes-required` or `repair`, fix every named finding, then dispatch a fresh re-review — code review on a fresh diff, plan review on a fresh export. A loop ends on `pass`, on a user-only `blocked` decision, when a named finding survives its own fix attempt in the next round, when a round resolves no prior finding, or at a hard ceiling of five rounds in that phase. Before any block after implementation started, commit and push the current work to the plan branch.
- Decided record rule: the reviewer still returns one markdown block; the manager posts it as one issue comment. The body `## Review` section carries a static line. `checkPlan` in `scripts/plan.mjs` validates section order only and needs no change. `archivePlan` greps `^Code-review: pass$` in the body `## Review` section and must instead paginate issue comments and accept only the latest well-formed code-review record authored by the plan's owner; a legacy body pass counts only when no trusted comment record exists. `plan.mjs show <issue>` adds the latest trusted review verdict per kind, read from comments, so a resuming session observes that reviews ran; `export` stays body-only.
- Decided blocked-verdict rule (revised after re-review): a reviewer-returned `blocked` verdict is phase-specific. A technical `Code-review: blocked` (unreadable or contradictory review input) ends the loop by committing and pushing the current work to the plan branch, recording the blocker, and setting the plan blocked. A `Plan-review: blocked` surfaces the user-only decision in `## Open questions` through `ask` and is not a lifecycle block.
- Verbatim assertions in `scripts/tests/plan-skill-phases.mjs` pin the current wording and must change in the same cutover, per the sync rule in `plugins/plan-lifecycle/skills/AGENTS.md`: `code-review-repair-bound`, `code-review-fixes-required-verdict`, `default-pr-landing`, `archive-verifier`, `repository-landing-summary`, `lifecycle-authoring-landing-boundary`, and `issue-write-precondition`. The pinned surfaces include `plan-workspace/references/codex-agent-templates.md` and `plugins/plan-lifecycle/skills/AGENTS.md`; the CLI tests drive `scripts/tests/fixtures/gh-stub/gh`, whose JSON field set must learn comments.
- Frozen-history drift: the root `AGENTS.md` allows reading `docs/plans/finished/` as history, while `docs/PLAN.md` and the contract say no lifecycle command reads it. Resolution keeps the repository-wide read-as-history rule and narrows the lifecycle surfaces: no lifecycle command and no workspace migration operation opens or inventories frozen files.
- Durable fix chosen: change the contract and every synchronized mirror plus tests in one cutover. Rejected temporary fix: patch only `plan-manager/SKILL.md` and let the contract, template, wrappers, and verbatim tests drift.
- Out of scope, recorded for a follow-up plan: read-only audit findings on `scripts/plan.mjs` write safety (unsafe `claim` write, `retire` close-before-cleanup, `new` prevalidation, narrow absolute-path detection, mutators and `archive` skipping the full checks, selftest behavioral coverage).
- Descriptor surface found before implementation: `plugins/plan-lifecycle/.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `.claude-plugin/marketplace.json` still promise an issue-body review record and one plan review. They join `repo_mirrors`; existing descriptor-coherence assertions stay strict.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | contract_reference | Rewrite the contract: comment-based review records, bounded repair loops for both review phases, implement-start branch rule with repository selector and blocked recovery, landing update, lifecycle-scoped frozen-history wording | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | — | `local` | `done` | The contract states the comment record rule with owner trust, the five-round progress-bounded loops, and the `gh issue develop --repo` implement-start rule |
| 2 | manager_skill | Update phases 4-6, Landing, Git boundary, CLI table, and BAD/GOOD pairs to the new branch, loop, and comment rules | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1 | `local` | `done` | The skill names branch creation at `ongoing` with failure recovery, both review loops with commit-before-block, and comment posting for records |
| 3 | publication_reference | Mirror the landing and branch changes in the publication reference | plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md | 1 | `local` | `done` | The reference matches the contract landing wording |
| 4 | reviewer_surfaces | Replace the one-repair-re-review wording in the reviewer skill, all four wrapper files, and the workspace codex templates | plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/agents/code-reviewer.md, .codex/agents/plan-reviewer.toml, .codex/agents/code-reviewer.toml, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md | 1 | `local` | `done` | No shipped surface still says exactly one repair re-review |
| 5 | workspace_mirrors | Update the workspace template and generated root section: phases, records, landing, and migration wording that never opens or inventories frozen files | plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md | 1 | `local` | `done` | Template and generated section match the contract |
| 6 | plan_mjs | Make `archive` trust only the latest well-formed owner-authored code-review comment with legacy body fallback, add the trusted verdict summary to `show`, and set the new `## Review` template line | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | 1 | `local` | `done` | `archive` passes with a trusted comment verdict, refuses a foreign or superseded pass, and accepts a legacy body verdict only without comment records; `show` prints the latest trusted verdicts |
| 7 | repo_mirrors | Mirror the settled wording into root context, plan standard, lifecycle authoring node, both public READMEs, and all three public plan-lifecycle descriptors | AGENTS.md, docs/PLAN.md, plugins/plan-lifecycle/skills/AGENTS.md, README.md, plugins/docks/README.md, plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 5 | `local` | `done` | Every public summary describes comment-backed review records and repeated review repair |
| 8 | test_sync | Update the verbatim phase assertions, the CLI test fixtures, and the GitHub stub for comment-based archive proof | scripts/tests/plan-skill-phases.mjs, scripts/tests/plan-cli.mjs, scripts/tests/fixtures/gh-stub/gh | 2,3,4,5,6,7 | `local` | `done` | Both test files pass against the new wording and behavior |
| 9 | hash_gate | Re-sync skill content hashes and run the full repository gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md | 8 | `local` | `done` | The full gate exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0 |
| A2 | `node scripts/tests/plan-cli.mjs` | Exit 0 |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |
| A4 | `node scripts/ci.mjs` | Exit 0 |

## Do not touch

- `docs/plans/finished/` — frozen history; no file there is opened or changed.
- Plugin manifest version numbers — release is a separate action.
- `scripts/plan.mjs` write-safety defects from the audit (`claim`, `retire`, `new` prevalidation, path detection, mutator checks) — owned by the follow-up plan.
- `plugins/docks/` and `plugins/effect-kit/` skill bodies.

## Open questions

None

## Review

### Plan review — 2026-08-24
Plan-review: repair
- [goal_fit] `## Research` — Decided loop rule — resolving at least one prior finding is not a finite bound because each round can fix all prior findings while introducing a new `HIGH`, so the loop can run forever despite the Goal's bounded-loop requirement — add a hard round ceiling or another strictly decreasing finite budget, with commit and push before that bound blocks
- [goal_fit] `## Research` — Decided branch rule — the local fallback is not a linked branch, and current `gh issue develop` creates the remote linked branch before later config, fetch, or checkout operations that can still return failure, so a nonzero exit can leave a linked remote branch while implementation continues on an unrelated local branch — after every failure re-list linked branches, recover and check out the created branch when present, and block implementation rather than continue without a verified linked branch
- [goal_fit] `scripts/tests/plan-skill-phases.mjs:82-91,165-180` — Steps omit `CODE_REVIEWER_TEMPLATE` and `LIFECYCLE_SKILLS_AGENTS`, although the verbatim gate pins both the old one-repair verdict and the old publication boundary there — add `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md` and `plugins/plan-lifecycle/skills/AGENTS.md` to the cutover and update their clauses with the corresponding assertions
- [research_gap] `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs:604-645` — `showPlan` and `exportPlan` expose only body bytes, while the manager says a later plan-only session resumes by reading the body; replacing `## Review` with a static line therefore removes the only observable proof that phase 4 ran, and the test-sync row also omits `scripts/tests/fixtures/gh-stub/gh`, whose JSON field set cannot represent comments — specify a comment-reading resume path and add the GitHub stub to the test-sync row so comment records are modeled end to end
- [research_gap] `scripts/tests/plan-skill-phases.mjs:158-181,205-209` — Research's four-item assertion inventory misses `repository-landing-summary`, `lifecycle-authoring-landing-boundary`, and `issue-write-precondition`, all changed by routine implement-start branch publication or append-only review comments — update these pins in lockstep rather than leaving their old authorization and read-modify-write claims in place
- [security_risk] `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs:885-900` — accepting an exact pass line from unspecified issue comments lets an unrelated commenter or an obsolete earlier pass satisfy archive despite a later trusted `fixes-required`; the existing ownership guard authenticates only the actor running archive, not the comment author — paginate comments, accept only the latest well-formed code-review record from the plan's trusted writer, and use a legacy body pass only when no trusted comment review records exist
- [security_risk] `## Research` — Decided branch rule — both proposed `gh issue develop` invocations use a bare issue number and omit the official `--repo` selector even though authorization is limited to the repository resolved by preflight, so a mismatched checkout with a colliding issue number can create a remote branch in the wrong repository — pass the resolved `nameWithOwner` to list, create, and recovery operations and verify the returned branch URL belongs to that repository

All seven findings reproduced and are fixed in this revision. A session advisory additionally extended the Goal: phase 4 gets the same bounded repair loop as phase 6.

### Plan review — 2026-08-24 (round 2)
Plan-review: repair
- [goal_fit] `## Research` — Decided loop rule — the repaired shared stop list handles only a user-only `blocked` decision, but `plugins/plan-lifecycle/agents/code-reviewer.md:88` defines `Code-review: blocked` for unreadable or contradictory review input, leaving that valid phase-6 verdict without a prescribed terminal path and risking another stranded-work dead end — define phase-specific blocked handling so a technical code-review block commits and pushes current work, records the blocker, sets the plan blocked, and stops

The finding reproduced and is fixed in this revision: the blocked-verdict rule in `## Research` now gives each phase its terminal path. All round-1 findings stayed resolved.


### Plan review — 2026-08-24 (round 3)
Plan-review: repair
- [research_gap] scripts/tests/plan-skill-phases.mjs:162-172 — the round-1 assertion-inventory finding survives: `readme-landing-summary` and `shipped-readme-landing-summary` still pin README.md:90-96 and plugins/docks/README.md:64-69 to commit and push only after review, but neither public mirror is in any Steps `Files` cell — add both README paths to the cutover and update their lifecycle summaries and corresponding assertions to place linked-branch creation at implementation start and describe the bounded review loops

The finding reproduced and is fixed in this revision: both README paths are now part of `repo_mirrors`. The prior blocked-verdict repair stayed resolved.

### Plan review — 2026-08-24 (round 4)
Plan-review: pass

### Plan review — 2026-08-24 (pre-implementation descriptor repair)
Plan-review: repair
- [goal_fit] Public descriptors still promise an issue-body record and one plan review — include all three descriptors and their coherence checks in the synchronized cutover.

The finding reproduced and is fixed in this revision. No implementation bytes had changed; the plan returned through `blocked` to `planned` before this repair.

### Plan review — 2026-08-24 (round 5)
Plan-review: pass

## Verification Results

- A1 `node scripts/tests/plan-skill-phases.mjs` — exit 0: `three-skill, two-wrapper v3 plan workflows passed`.
- A2 `node scripts/tests/plan-cli.mjs` — exit 0: 13 checks, lifecycle repairs, comment pagination, trusted/superseded/foreign/malformed archive records, and legacy fallback passed.
- A3 `node plugins/plan-lifecycle/test/selftest.mjs` — exit 0: routing prerequisites, manifest/catalog agreement, closed CLI API.
- A4 `node scripts/ci.mjs` — exit 0: `All ci.mjs checks passed — 3 plugin(s) + repo-wide; safe to release.`
