<!-- plan-contract: v3 -->

## Goal

Make the shipped plan lifecycle create the linked plan branch when implementation starts, replace the two-round code-review dead-end with a bounded repair loop that never strands uncommitted work, give plan review the same bounded repair loop so a repaired plan is always re-reviewed until it passes or a user-only decision blocks it, move review records from the issue body to issue comments, and make the frozen-history rule unambiguous across every mirror. This is needed now because a real run stopped after a `fixes-required` re-review with repaired code left uncommitted, because `Plan-review: repair` today ends phase 4 with repaired plan bytes that no round ever reviewed, and because per-round body appends carry an avoidable export-and-edit write cycle. The user asked for the plan-review loop: phase 4 gets the same bounded repair loop as phase 6.

Mode: plan-and-implement

## Research

- Reproduced the dead-end: `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md` (phase 6) and `references/plan-contract.md` (Review records) force exactly one repair re-review, then `Code-review: blocked`. The observed failure mode is an agent stopping with repaired, uncommitted work and no pull request.
- Reproduced the phase-4 twin: after `Plan-review: repair`, the manager fixes findings and proceeds; the skill forbids a second round, so no round ever reviews the repaired plan bytes.
- The landing sentence "ensure a non-default branch" is the only branch rule and first applies after `Code-review: pass`. It appears in four mirrors: `plan-manager/SKILL.md`, `references/plan-contract.md`, `plan-workspace/references/plan-md-template.md`, and this repository's `docs/PLAN.md`. Implementation can therefore legally run on the default branch.
- `gh issue develop` verified against the installed GitHub CLI 2.86.0 help output: `--base`, `--checkout`, `--list`, `--name`, and inherited `--repo` exist; a created branch links in the issue Development panel; the default branch name derives from the issue number and title. Source: `gh issue develop --help` (manual: cli.github.com/manual).
- Decided branch rule: every `gh issue develop` call passes `--repo <nameWithOwner>` for the repository the publication preflight resolved. At implement start, after `plan.mjs status <issue> ongoing`, reuse an existing linked branch from `gh issue develop --list`; otherwise create with `--base <default-branch> --checkout`. After any failure, re-run `--list`; when a linked branch exists, verify it belongs to the resolved repository, fetch it, and check it out. When no linked branch exists after recovery, set the plan blocked; implementation never proceeds on an unlinked branch. This action is routine under the settled mode, like issue publication. Plan-only runs never reach implement, so they never create a branch.
- Decided loop rule: both review phases loop. On `fixes-required` or `repair`, fix every named finding, then dispatch a fresh re-review — code review on a fresh diff, plan review on a fresh export. A loop ends on `pass`, on a user-only `blocked` decision, when a named finding survives its own fix attempt in the next round, when a round resolves no prior finding, or at a hard ceiling of five rounds in that phase. Before any block after implementation started, commit and push the current work to the plan branch.
- Decided record rule: the reviewer still returns one markdown block; the manager posts it as one issue comment. The body `## Review` section carries a static line. `checkPlan` in `scripts/plan.mjs` validates section order only and needs no change. `archivePlan` greps `^Code-review: pass$` in the body `## Review` section and must instead read the issue comments with `gh api repos/{owner}/{repo}/issues/<issue>/comments` and accept only the latest well-formed code-review record authored by the plan's owner; a legacy body pass counts only when no trusted comment record exists. The REST endpoint returns comments newest first (https://docs.github.com/en/rest/issues/comments#list-issue-comments), so `archive` reads the first page and stops at the first well-formed code-review record of the owner. `plan.mjs show <issue>` adds the latest trusted review verdict per kind from the same read, so a resuming session observes that reviews ran; `export` stays body-only.
- Decided blocked-verdict rule: a reviewer-returned `blocked` verdict is phase-specific. A technical `Code-review: blocked` (unreadable or contradictory review input) ends the loop by committing and pushing the current work to the plan branch, recording the blocker, and setting the plan blocked. A `Plan-review: blocked` surfaces the user-only decision in `## Open questions` through `ask` and is not a lifecycle block.
- Verbatim assertions in `scripts/tests/plan-skill-phases.mjs` pin the current wording and must change in the same cutover, per the sync rule in `plugins/plan-lifecycle/skills/AGENTS.md`: `code-review-repair-bound`, `code-review-fixes-required-verdict`, `default-pr-landing`, `archive-verifier`, `repository-landing-summary`, `lifecycle-authoring-landing-boundary`, and `issue-write-precondition`. The pinned surfaces include `plan-workspace/references/codex-agent-templates.md` and `plugins/plan-lifecycle/skills/AGENTS.md`. The CLI tests drive `scripts/tests/fixtures/gh-stub/gh`, which already answers `gh api` calls for any REST path from its state file, so it serves issue comments without a change; the CLI cases only seed comments into the state.
- Frozen-history drift: the root `AGENTS.md` allows reading `docs/plans/finished/` as history, while `docs/PLAN.md` and the contract say no lifecycle command reads it. Resolution keeps the repository-wide read-as-history rule and narrows the lifecycle surfaces: no lifecycle command and no workspace migration operation opens or inventories frozen files.
- Descriptor surface: `plugins/plan-lifecycle/.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `.claude-plugin/marketplace.json` still promise an issue-body review record and one plan review. They join `repo_mirrors`; existing descriptor-coherence assertions stay strict.
- Release: `step:release` cuts plan-lifecycle 0.8.0 with `node scripts/release.mjs --plugin plan-lifecycle minor` after the gate, so that consumers get the loop and the comment records at once. The settled `plan-and-implement` mode authorizes it like issue publication, so it runs without another question.
- Durable fix chosen: change the contract and every synchronized mirror plus tests in one cutover. Rejected temporary fix: patch only `plan-manager/SKILL.md` and let the contract, template, wrappers, and verbatim tests drift.
- Out of scope, recorded for a follow-up plan: read-only audit findings on `scripts/plan.mjs` write safety (unsafe `claim` write, `retire` close-before-cleanup, `new` prevalidation, narrow absolute-path detection, mutators and `archive` skipping the full checks, selftest behavioral coverage).

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | contract_reference | Rewrite the contract: comment-based review records, bounded repair loops for both review phases, implement-start branch rule with repository selector and blocked recovery, landing update, lifecycle-scoped frozen-history wording | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | — | `local` | `planned` | The contract states the comment record rule with owner trust, the five-round progress-bounded loops, and the `gh issue develop --repo` implement-start rule |
| 2 | manager_skill | Update phases 4-6, Landing, Git boundary, CLI table, and BAD/GOOD pairs to the new branch, loop, and comment rules | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1 | `local` | `planned` | The skill names branch creation at `ongoing` with failure recovery, both review loops with commit-before-block, and comment posting for records |
| 3 | reviewer_surfaces | Replace the one-repair-re-review wording in the reviewer skill, all four wrapper files, and the workspace codex templates | plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/agents/code-reviewer.md, .codex/agents/plan-reviewer.toml, .codex/agents/code-reviewer.toml, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md | 1 | `local` | `planned` | No shipped surface still says exactly one repair re-review |
| 4 | workspace_mirrors | Update the workspace template and generated root section: phases, records, landing, and migration wording that never opens or inventories frozen files | plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md | 1 | `local` | `planned` | Template and generated section match the contract |
| 5 | plan_mjs | Make `archive` trust only the latest well-formed owner-authored code-review comment with legacy body fallback, add the trusted verdict summary to `show`, and set the new `## Review` template line | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | 1 | `local` | `planned` | `archive` passes with a trusted comment verdict, refuses a foreign or superseded pass, and accepts a legacy body verdict only without comment records; `show` prints the latest trusted verdicts |
| 6 | repo_mirrors | Mirror the settled wording into root context, plan standard, lifecycle authoring node, both public READMEs, and all three public plan-lifecycle descriptors | AGENTS.md, docs/PLAN.md, plugins/plan-lifecycle/skills/AGENTS.md, README.md, plugins/docks/README.md, plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 4 | `local` | `planned` | Every public summary describes comment-backed review records and repeated review repair |
| 7 | test_sync | Update the verbatim phase assertions and the CLI test fixtures for comment-based archive proof | scripts/tests/plan-skill-phases.mjs, scripts/tests/plan-cli.mjs | 2,3,4,5,6 | `local` | `planned` | Both test files pass against the new wording and behavior |
| 8 | hash_gate | Re-sync skill content hashes and run the full repository gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md | 7 | `local` | `planned` | The full gate exits 0 |
| 9 | release | Cut plan-lifecycle 0.8.0 with `node scripts/release.mjs --plugin plan-lifecycle minor` and push the release tag | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 8 | `release` | `planned` | The tag `plan-lifecycle--v0.8.0` exists on the remote |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0 |
| A2 | `node scripts/tests/plan-cli.mjs` | Exit 0 |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |
| A4 | `node scripts/ci.mjs` | Exit 0 |

## Do not touch

- `docs/plans/finished/` — frozen history; no file there is opened or changed.
- `scripts/plan.mjs` write-safety defects from the audit (`claim`, `retire`, `new` prevalidation, path detection, mutator checks) — owned by the follow-up plan.
- `plugins/docks/` and `plugins/effect-kit/` skill bodies.

## Open questions

None

## Review

_No review yet._

## Verification Results

_Not implemented yet._
