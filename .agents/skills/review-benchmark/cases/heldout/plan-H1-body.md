<!-- plan-contract: v4 -->

## Goal

Make plan-manager and yolo tear down the resources that a plan created. After archive succeeds, the agent stops the processes and compose stacks that the plan started, removes the plan's linked worktree with `git worktree remove` and `git worktree prune`, and deletes the merged local branch with `git branch -d`. The merge question states this teardown, so a `Merge now` answer confirms the branch delete. On an exit without a merge, the agent stops processes and stacks, keeps the worktree and branch, and lists them under Kept resources in the report and the yolo run summary. Compose volumes are kept and reported, not removed. Local resources on the workstation are development, and teardown removes them without a question. Teardown cleans up a remote resource only when its target is non-production. A production cleanup needs its own in-session `ask` immediately before it; a yolo invocation does not answer that ask. The text stays tool-neutral: git and docker commands only, and plan scratch stays in the docks-review directory. Scope: the plan-lifecycle contract, plan-manager, yolo, and the yolo run summary template. Source request: DocksDocks/public#89.

Mode: plan-and-implement

## Research

### Request and owner decisions

- Request: DocksDocks/public#89, sent by the docks-kit session. Gaps: plan-manager never removes the linked worktree after archive; no phase stops servers, watchers, test runners, or compose stacks; a yolo exit without `Merge now` says nothing about these resources; the run summary has no place for kept resources.
- Owner decision (in-session `ask`, 2026-10-21): the merge question states the full teardown, including `git branch -d`, and a `Merge now` answer confirms it. Reason: the root `AGENTS.md` Security rule requires explicit user confirmation before a branch delete.
- Owner decision (same `ask`): tool-neutral text only. No docks-kit tool names (`scratch_new`, `scratch_remove`, `tidy_report`, `workspace-hygiene`) in the shipped plugin.
- Owner decision (same `ask`): `docker compose down` without `--volumes`; kept volumes go under Kept resources.
- Owner clarification (relayed by the requester, 2026-10-21): use the contract's existing definition of a non-production target. Never stop, remove, undeploy, or delete a production resource automatically. A production cleanup needs an in-session `ask` immediately before it, must be rare, and a yolo invocation does not answer it; it works like a step after the landing merge. In a subagent, or when `ask` is unavailable, do not run it; list the resource under Kept resources with the reason `production`. The same rule goes into the contract, plan-manager, and yolo.
- Owner precision (relayed by the requester, 2026-10-21; it replaces the clarification's bullet about local resources): local resources on the workstation are always development: the linked worktree, local compose stacks, local servers and processes, and scratch files. Teardown removes them without a question. Production applies to remote resources that an agent reaches through SSH or a provider CLI, for example `wrangler`, Vercel, Netlify, Fly, Supabase, `kubectl`, or a remote Docker host. Clean up such a resource only when its target is non-production by the contract definition. Owner example: `wrangler delete` without `--env` acts on the top-level Worker, which is usually production, so it needs the ask.

### Request corrections

- Asked: use the docks-kit-omp tools `scratch_new`, `scratch_remove`, and `tidy_report` when present. Did: git and docker commands only. Reason: owner decision; docks-kit 0.21.0 is unreleased and omp-only; `scratch_new` puts scratch outside `git rev-parse --git-path docks-review`, which the contract (Helper commands and output) and the root `AGENTS.md` scratch rule require; `scratch_remove` cannot remove a worktree under `agent-worktrees`.
- Asked: run `git branch -d <branch>` "when the branch is merged". Did: run `git branch -d` after archive, keep the branch when git refuses, never use `-D`. Reason: archive already proves the merge (contract, Archive). The git experiment below shows that `-d` success does not prove a merge into the default branch, and that `-d` refuses after a squash or rebase merge once the remote branch is gone.

### Repository facts

- `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` is canonical (`plugins/plan-lifecycle/skills/AGENTS.md`, Plan-skill contract sync). Skill bodies point to it and do not copy its rules (plan-manager `SKILL.md` intro: "Do not copy contract rules here.").
- Contract `## Landing and archive proof` holds `### Linked branch`, `### Pull requests`, `### Checks and merge`, `### Steps after the landing merge`, and `### Archive`. A new `### Teardown` subsection goes after `### Archive`. The `## Contents` list names only `##` sections, so it needs no entry.
- Contract `### Checks and merge` asks with `Merge now` and `Leave pull request open`. It does not state any cleanup.
- The non-production target definition exists only in contract `## Yolo runs` / `### Effects before the landing merge`. Teardown applies to plan-manager runs too, so the definition moves to `## Steps, acceptance, and effects`, and the yolo effects text points to it.
- Contract `### Round ceiling`: on `Leave plan blocked`, or without an answer, the plan goes to `blocked` and the agent reports. It names no cleanup.
- yolo `SKILL.md` Landing step 9 is the only cleanup: after `Merge now`, remove a worktree that the run made, or switch the user's clean checkout to the default branch and `git pull --ff-only`; "Keep the merged local branch. Name it in the final report as a branch that the user can delete." Step 10 (no `Merge now`) reports only the two links.
- yolo `references/run-summary.md` has sections What changed, Decisions and corrections, Reviews, Verification, Limits and failures, After merge. After merge names "the merged local branch".
- plan-manager `SKILL.md` Landing and reporting: merge on `Merge now`, archive after the landing merge; Done when names archive output or a reported open pull request. Phase 6 commits and pushes work before recording a blocker. No cleanup.
- Linked branches: plan-manager uses `gh issue develop <n> --base <default> --checkout` in the user's clean checkout; a worktree only with an in-session approval for a dirty checkout. yolo uses a worktree at `${XDG_DATA_HOME:-$HOME/.local/share}/agent-worktrees/<repository-name>/issue-<n>` for a dirty checkout, and `check-<short-sha>` worktrees for commit checks, which it already removes.
- No test pins skill prose (`plugins/plan-lifecycle/skills/AGENTS.md`); `scripts/tests/plan-cli.mjs` and `plugins/plan-lifecycle/test/selftest.mjs` assert no phrase from the four target files. `.codex/agents/*.toml`, `plugins/plan-lifecycle/agents/*.md`, and plan-workspace templates do not mention landing cleanup or run summary sections.
- Validators for this plugin: `node scripts/ci.mjs --plugin plan-lifecycle` runs skill guard, `no-author-scripts`, `content-hash --check-only`, agent guard and score, `plugins/plan-lifecycle/test/selftest.mjs`, and `scripts/tests/plan-cli.mjs` (`scripts/lib/plugins.mjs` descriptor; `scripts/ci.mjs`). After a meaning change, `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills` resyncs `content_hash` and `metadata.updated` (`plugins/plan-lifecycle/skills/AGENTS.md`).
- Size: plan-manager `SKILL.md` has 164 lines and yolo `SKILL.md` has 336 lines. The hard cap is 500 lines; the productivity score floor is 8 (`scripts/config/scoring.json`, `node scripts/config/read-floor.mjs skills productivity`).
- Shipped bodies must not name author scripts (`no-author-scripts`). The docks-kit guards deny `find -delete`, `find -exec rm`, and `xargs rm`; the new text uses none of them.
- No CHANGELOG exists in the repository. Version bumps belong to the release flow (`scripts/AGENTS.md`, Versioning), not to this plan.

### Experiments (git 2.53.0)

Scratch: `${XDG_STATE_HOME:-$HOME/.local/state}/docks/plan-83-research/`, throwaway repositories with a bare remote and default branch `main`, `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1`.

| Case | Result |
|---|---|
| `git worktree remove -- <wt>`, only ignored files (`node_modules/`) | exit 0; the ignored files go with the worktree |
| `git worktree remove`, untracked, modified, or staged file | exit 128: `contains modified or untracked files, use --force to delete it`; worktree stays |
| `git worktree remove`, locked worktree | exit 128: `cannot remove a locked working tree`; worktree stays |
| `git worktree remove` from inside the worktree | exit 0, but the shell is left in a deleted directory and later `git` calls fail; run teardown from the main worktree |
| directory deleted by hand, then `git worktree prune` | stale record removed; a locked record stays |
| `git worktree remove` of a worktree with `docks-review` scratch under `git rev-parse --git-path docks-review` | exit 0; the worktree's scratch is removed with its admin directory |
| `git branch -d <b>` while `<b>` is checked out in a linked worktree | exit 1: `cannot delete branch ... used by worktree`; works after `git worktree remove` |
| `git branch -d` with the upstream branch still present (merge, squash, or rebase landing) | deletes, comparing against the upstream only, even when local HEAD lacks the work |
| `git branch -d` with the upstream gone, merge commit, local `main` fast-forwarded | deletes |
| `git branch -d` with the upstream gone, squash or rebase landing | exit 1: `the branch '<b>' is not fully merged`, with a hint to use `-D`; keep the branch |

Docs: `git branch -d`: "The branch must be fully merged in its upstream branch, or in HEAD if no upstream was set" (https://git-scm.com/docs/git-branch). `git worktree remove`: "Only clean worktrees (no untracked files and no modification in tracked files) can be removed." `git worktree prune`: "Remove worktree information in $GIT_DIR/worktrees for worktrees whose working trees are missing." (https://git-scm.com/docs/git-worktree).

### Compose facts

- `docker compose down` removes by default "Containers for services defined in the Compose file", networks in the networks section, the default network, and the anonymous volumes attached to those containers. `-v, --volumes` also removes named volumes. (https://docs.docker.com/reference/cli/docker/compose/down/)
- The project name comes from `-p`, then `COMPOSE_PROJECT_NAME`, then top-level `name:`, then the base name of the project directory (https://docs.docker.com/compose/how-tos/project-name/). Two worktrees with the same directory name, such as `issue-<n>` in two repositories, get the same default project name, so teardown runs `down` with the same directory, `-p`, and `-f` options that started the stack.
- Compose labels named volumes with `com.docker.compose.project` (https://docs.docker.com/reference/compose-file/volumes/). Anonymous volumes do not get that label, so a label query misses them (plan review round 1 finding, reproduced below).
- Experiment (Docker Compose v5.6.0, Docker server 29.9.1; throwaway project `plan83exp` with one anonymous volume `/anon` and one named volume, started with `docker compose -p plan83exp up -d`): `docker inspect --format '{{range .Mounts}}{{.Type}} {{.Name}} {{.Destination}}; {{end}}' $(docker compose -p plan83exp ps -a -q)` printed both volumes (`<64-hex> /anon` and `plan83exp_named /named`). `docker volume ls --filter label=com.docker.compose.project=plan83exp` and `docker compose -p plan83exp volumes` printed only `plan83exp_named`. The anonymous volume's labels were `{"com.docker.volume.anonymous":""}`. After `docker compose -p plan83exp down`, both volumes stayed. The experiment volumes were then removed with `docker volume rm`.
- Therefore teardown records the volume names from the stack's container mounts before `docker compose down`, because `down` removes the containers that hold that record.

### Decisions

- Placement: one `### Teardown` subsection in the contract owns the rule. plan-manager and yolo reference it at their landing and exit points, and repeat only the production-ask invariant in a constraint, as the contract-sync rule allows. Rejected: copying the full teardown into each skill (violates "Do not copy contract rules here").
- Order after archive: stop processes, stop stacks, leave the worktree, remove the worktree, prune, switch a clean user checkout to the default branch and fast-forward it, then `git branch -d`. Reason: `-d` refuses while the branch is checked out in any worktree; removal from inside the worktree breaks the shell.
- Branch delete: `git branch -d` only. When it refuses, keep the branch and list it under Kept resources. Never `-D` or `--force`, even when git's hint suggests it. Rejected: `git branch --delete-merged` (git 2.56.0 docs only; unknown option on 2.53.0).
- Worktree delete: `git worktree remove -- <worktree>`. When it refuses because of untracked or modified files, run `git worktree remove --force -- <worktree>`: archive has already proved that the reviewed work landed, so the leftovers are build output. Keep a locked worktree and list it with git's reason.
- Processes: track each server, watcher, test runner, and compose stack that the plan starts; stop each one when the step or check that needed it ends, and stop any that still runs at teardown. Never stop one that the plan did not start.
- Compose volumes: before `docker compose down`, record the volume names from the stack's container mounts with `docker inspect` on the IDs from `docker compose ps -a -q`, run with the same directory, `-p`, and `-f` options. This record includes anonymous volumes, which carry no project label. Run `docker compose down` without `--volumes`, and list the recorded volumes under Kept resources. Rejected: `docker volume ls --filter label=com.docker.compose.project=<project>` alone (misses anonymous volumes).
- Exit without a merge (`Leave pull request open`, a blocked plan, a stalled yolo run, or no answer): stop local processes and stacks, keep the worktree, the branch, and every remote resource, and report them under Kept resources.
- Production: local resources on the workstation (worktree, branch, compose stacks, servers, processes, scratch) are development; teardown removes them without a question. A remote resource that the plan created through SSH or a provider CLI is cleaned up only when its target is non-production by the contract definition; the merge question names it, so `Merge now` confirms that cleanup. A command that does not name a non-production target, such as `wrangler delete` without `--env`, acts on production. A remote production cleanup needs its own in-session `ask` immediately before it, also in a yolo run, and must be rare. Without `ask`, keep the resource and give the reason `production`.
- Kept resources naming: name a worktree by its branch and directory name, never by an absolute machine path (contract, Published text; run summary is the public pull request description).
- Run summary: add `### Kept resources` for resources that stay after `Merge now` (volumes, production resources) and after `Leave pull request open` (worktree and branch). The final report after the merge answer gives the actual list. After merge stops naming the merged local branch.
- Scratch: unchanged. A worktree's `docks-review` scratch goes with the worktree; a main checkout's scratch stays untracked and mode 0700. Rejected: plan-specific file deletion in the main checkout (owner decision: tool-neutral, scratch stays in docks-review).

### Engineering standards

The change is skill prose only. Steps follow the plan-lifecycle authoring node (`plugins/plan-lifecycle/skills/AGENTS.md`) and the global Simplified Technical English output standard. No code, test, or error message changes, so `code-clarity` and `tdd-workflow` do not apply.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | contract_teardown | Move the non-production target definition from Yolo runs to Steps, acceptance, and effects and point the yolo effects text to it. Make the `Merge now` option in Checks and merge state the teardown, including `git branch -d` and each remote non-production cleanup. Add `### Teardown` after `### Archive`: process and stack tracking, recording each stack's volume names from its container mounts before `docker compose down`, the after-archive order, `git worktree remove` with its `--force` retry for untracked or modified files, `git worktree prune`, the clean-checkout switch, `git branch -d` without `-D`, the exit-without-merge rule, the production rule, and Kept resources naming. Add the production-cleanup row to the Yolo runs table and the teardown exit to the Round ceiling `Leave plan blocked` path. | `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | - | local | planned | The contract has one `### Teardown` subsection with every rule in the Decisions list, the `Merge now` text names the teardown, and the non-production definition is outside Yolo runs |
| 2 | manager_teardown | In plan-manager, reference the contract's Teardown in Landing and reporting and in the phase 6 blocker path; add the production-cleanup ask to the effect constraint; make Done when require the Kept resources report. | `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md` | 1 | local | planned | plan-manager points to Teardown at archive and at every exit without a merge, and states that a production cleanup needs its own question |
| 3 | yolo_teardown | In yolo, make Landing step 8's merge question use the contract's Checks and merge options, whose `Merge now` text states the teardown, including `git branch -d`. Replace Landing step 9's cleanup bullets and the "Keep the merged local branch" rule with the contract's Teardown; give step 10 and the stall exit the exit-without-merge rule; state in a constraint that a production cleanup needs its own question and that the invocation does not answer it. Add `### Kept resources` to the run summary template and drop the merged local branch from After merge. | `plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` | 1 | local | planned | yolo's merge question states the teardown, yolo and the run summary reference Teardown and Kept resources, and no text keeps the merged local branch by rule |
| 4 | refresh_hashes | Run `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills` after steps 1 to 3. | `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`, `plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` | 2, 3 | local | planned | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/skills/content-hash.mjs --check plugins/plan-lifecycle/skills` | Exit 0 |
| A2 | `grep -c '^### Teardown' plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | `1` |
| A3 | `grep -l 'Teardown' plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` | Both paths print |
| A4 | `grep -l 'Kept resources' plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md plugins/plan-lifecycle/skills/productivity/yolo/references/run-summary.md` | All four paths print |
| A5 | `grep -rn 'Keep the merged local branch' plugins/plan-lifecycle` | No output, exit 1 |
| A6 | `grep -rnE 'find .*-delete\|-exec rm\|xargs rm' plugins/plan-lifecycle/skills` | No output, exit 1 |
| A7 | `grep -rnE '/(home\|Users)/' plugins/plan-lifecycle/skills` | No output, exit 1 |

## Do not touch

- `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`, `plugins/plan-lifecycle/test/selftest.mjs`, `scripts/tests/plan-cli.mjs`: the helper and its tests do not change.
- Plugin manifests, marketplace catalogs, `plugins/plan-lifecycle/compatibility.json`, versions, tags, and releases: the release flow owns them.
- DocksDocks/public and docks-kit: the requester owns them.
- Remote branch deletion and `gh pr merge --delete-branch`: out of scope.
- Main-checkout scratch in the docks-review directory: owner decision.
- `plugins/docks/skills/engineering/refactor/references/executor-dispatch.md`: its Claude-managed isolation worktree is outside this lifecycle's teardown.

## Open questions

## Verification Results

