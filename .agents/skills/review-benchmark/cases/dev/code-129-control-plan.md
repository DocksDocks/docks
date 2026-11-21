<!-- plan-contract: v4 -->

## Goal

Fix #127: when a plan works in a separate worktree because the main checkout has uncommitted changes, that worktree can run other repository hooks than the checkout, or none, so a commit or a push there can skip a hook without any flag.

Outcome: a plan uses a separate worktree for a dirty checkout only when the checkout runs no hook. One check that does not depend on a hook manager decides it. When the checkout runs a hook, the plan blocks at linked-branch setup and names the dirty paths and the hooks. The rule covers both worktrees that the contract creates for a dirty checkout: the plan-manager worktree that the user approves (Linked branch) and the yolo worktree (Yolo runs, Linked branch timing).

Scope: the plan-lifecycle plan contract, any skill text that points to it, and the release of the plugin after the merge. The landing pull request closes #127.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Repository facts

- `plan-contract.md` Linked branch item 2: with a dirty checkout, plan-manager uses "a separate clean worktree only when the user approves it in this session through `ask`. Otherwise block the plan and report the dirty paths."
- `plan-contract.md` Yolo runs: the table row "Dirty checkout at linked-branch setup | A separate clean worktree, without a question", and Linked branch timing items 1 to 4 create that worktree with `git worktree add <worktree> <branch>` right after `new`, while the plan is drafting.
- `plan-contract.md` Repository hooks item 2 already forbids running a command from another worktree to avoid files that the plan did not make, because a new worktree can lack the hook setup (#126, code review round 2).
- #126 tried two parity checks for the yolo worktree, and code review found a gap in each (rounds 2 and 3; #126 issue comments): a push from a detached worktree runs no Husky hook, and a comparison of hook executables misses a delegated script that the Husky dispatcher skips when it is missing.
- No other plan-lifecycle file and no docks skill names the dirty-checkout worktree (search for `dirty` and `clean worktree` under `plugins/plan-lifecycle`, `plugins/docks/skills/productivity`, and `.codex/agents`).
- Repository rules: `plugins/plan-lifecycle/skills/AGENTS.md` (content-hash backfill after a meaning change; shipped text names no author script; gate `bun scripts/ci.mjs --plugin plan-lifecycle`); root `AGENTS.md` (one plugin, so the plugin gate is authoritative).

### Official sources

- `git rev-parse --git-path hooks` resolves the hooks directory with `core.hooksPath` applied: `adjust_git_path` in git's `path.c` replaces the `hooks` prefix with the configured hooks path (<https://github.com/git/git/blob/master/path.c>; `--git-path` in <https://git-scm.com/docs/git-rev-parse>).
- Git runs a hook only when its file is executable, and a relative `core.hooksPath` is read from the root of the working tree in a non-bare repository (<https://git-scm.com/docs/githooks>).
- Since git 2.54, a hook can also come from configuration, `hook.<name>.command` with `hook.<name>.event`, and `git hook list <event>` prints the hooks of an event (<https://git-scm.com/docs/git-hook>). Git 2.53.0 on this workstation has no `git hook list` (`error: unknown subcommand: 'list'`).
- Husky sets the hooks path to `.husky/_`, writes a `.gitignore` of `*` there (<https://github.com/typicode/husky/blob/main/index.js>), and its dispatcher exits 0 when the delegated `.husky/<hook>` script is missing (<https://github.com/typicode/husky/blob/v9.1.7/husky>).

### Decisions

1. With a dirty checkout, the plan runs one hook check, a short `sh` script, from the root of the checkout:
   ```sh
   hooks=$(git rev-parse --git-path hooks && echo .) || exit 1
   hooks=${hooks%?.}
   if [ -e "$hooks" ]; then
     find -L "$hooks" -mindepth 1 -maxdepth 1 ! -name '*.sample' -exec test -x {} \; -print || exit 1
   fi
   git config --get-regexp '^hook\..*\.command$'
   [ $? -le 1 ]
   ```
   Each printed line is a hook that git runs. The `echo .` and `${hooks%?.}` keep a hooks path that ends in a newline: command substitution drops every trailing newline, and the suffix removal then takes away only the newline that `git rev-parse` adds (code review round 1; on this workstation, `x=$(printf 'q\n\n' && echo .); x=${x%?.}` kept `q\n`). `find -L` follows a symlinked hooks directory and symlinked hook files, and `test -x` asks the same question as git's `find_hook`, `access(path, X_OK)` (<https://github.com/git/git/blob/master/hook.c>), so a file that only the group or others can run counts only when the acting user can run it. A missing hooks directory means no hook file. A scan that fails, such as an unreadable hooks directory, makes the script exit non-zero. `git config --get-regexp` returns 1 when no value is found (<https://git-scm.com/docs/git-config>), and the script accepts only 0 and 1 from it, so any other status fails the script. On this workstation, a pattern with no match returned 1, an invalid pattern returned 6, and a broken `.git/config` returned 128; with that broken file, `git rev-parse` already failed, and the script exited 1. The check passes only when the script exits 0 and prints nothing.
   The check covers hooks that can stop a commit, a merge, or a push. The `core.fsmonitor` helper is not one: git uses it only to limit the files it checks, and "On error, it will fall back to verifying all files and folders" (<https://git-scm.com/docs/githooks>, fsmonitor-watchman). A worktree without that helper therefore skips no check (code review round 1 finding rejected with this evidence). When the helper is an executable file in the hooks directory, the scan still prints it, so the check can only block more often.
   When the check passes, the checkout runs no hook, and the plan may create the worktree. The plan then runs the same check in the new worktree before research and before any commit, because branch-dependent configuration (`includeIf "onbranch:..."`), worktree configuration, and a relative hooks path can give the worktree hooks that the checkout lacks (<https://git-scm.com/docs/git-config>). When either check fails or prints a hook, the plan blocks at linked-branch setup, names the dirty paths and the hooks or the error, and removes the worktree that it created. The user can then commit or move their own changes, and run the plan again.
   Experiment (`$(git rev-parse --git-path docks-review)/yolo-129/exp/scan.sh`, the `find` part on a given directory): a symlinked hook file printed `d1/pre-push`, exit 0; a file with mode `------x--x` printed nothing, exit 0, because its owner cannot run it; an unreadable directory printed `find: 'd3': Permission denied`, exit 1; a missing directory printed nothing, exit 0; a symlinked directory printed `linkdir/pre-push`, exit 0. Experiment for the worktree check (`yolo-129/exp/ob`): with `includeIf.onbranch:feat.path` naming a file that sets `hook.x.command`, the script printed nothing in the checkout on `main` (exit 0) and printed `hook.x.command true` in a worktree on `feat` (exit 0).
   Rejected: prove that the worktree runs the same hooks as the checkout by running the hook setup, comparing hook programs, and tracing the files that they run. #126 code review rounds 2 and 3 found a gap in each such check, because the files that a hook reads depend on the hook manager (Husky delegates to `.husky/<hook>`, lefthook and the pre-commit framework read configuration files at the root). Rejected: `git hook list`, because it needs git 2.54 and still does not show what a hook program reads. Rejected: `find ... -type f -perm -u+x` (plan review round 1): it skips symlinks and uses the owner bit instead of the acting user's access. Rejected: `-type f` (code review round 2): git's `access(X_OK)` also accepts an executable directory at a hook name and then fails to run it, so the scan uses `-mindepth 1` and no type test, and any executable entry, a subdirectory included, blocks. Experiment: a directory `d4/pre-commit` printed `d4/pre-commit`, and an executable `d4/pre-push.sample` printed nothing.
2. The check is the same for plan-manager and yolo, so it gets one section, `### Worktree hooks`, under Landing and archive proof. Both paths set up the worktree with the commands of Linked branch timing: they create the linked branch without `--checkout`, add the worktree on that branch, and only then run the worktree check, so the check sees the branch that the plan commits on (code review round 1: a check before the branch checkout misses an `onbranch` hook). Linked branch item 2 (plan-manager) offers the worktree only when the checkout check passes and the user approves it. The Yolo runs row and Linked branch timing run the checkout check before `git worktree add` and the worktree check after it. When a check fails, the plan removes the worktree from the checkout, as Teardown's After archive items 3 and 4 say (never `--force`; keep and list it when git refuses), blocks, and lists only the branch under Kept resources. The yolo run sets the plan `blocked` with the reason, runs Teardown's exit without a merge, and reports. That needs no question, because the yolo rules already block without a question (the hook row).
3. Repository hooks item 2 points to Worktree hooks for the reason, so the two rules do not drift.
4. The plugin version changes only through the release after the merge (step `release`), because a yolo run does not release before the merge. The change is a patch.

### Engineering standards

- Step `worktree_hooks`: `commit-discipline`; the skill-authoring rules of `plugins/plan-lifecycle/skills/AGENTS.md`. The step changes no code, tests, comments, or error messages, so `code-clarity` does not apply.
- Step `hashes_gate`: `commit-discipline`.

### Request corrections

- Asked: "DocksDocks/docks#127: a yolo run that works in a separate worktree ... it". Did: read the request as "fix #127", the only open issue that the message names. Reason: #127 is open and is not a plan issue; no plan is open.

### Tool facts

- git: 2.53.0 (`git --version`, 2026-11-05).
- find: GNU findutils 4.10.0 (`find --version`, 2026-11-05).
- sh: `/bin/sh` is dash 0.5.12-12ubuntu3 (`readlink -f /bin/sh`, `dpkg-query -W dash`, 2026-11-05; dash has no `--version`).
- grep: GNU grep 3.12 (`grep --version`, 2026-11-05).
- gh: 2.103.3 (`gh --version`, 2026-11-05).
- Bun: 1.4.4 (`package.json` `packageManager`).

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | worktree_hooks | Add `### Worktree hooks` with the hook check script and its rule (decisions 1 and 2); point Linked branch item 2, the Yolo runs row "Dirty checkout at linked-branch setup", and Linked branch timing to it; point Repository hooks item 2 to it (decision 3) | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | - | local | done | The contract has one Worktree hooks section; each place that creates a worktree for a dirty checkout runs the check in the checkout before `git worktree add` and in the worktree before any commit; no text uses that worktree without both checks |
| 2 | hashes_gate | Run the content-hash backfill for plan-lifecycle skills and the plugin gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1 | local | done | Acceptance A1 to A4 hold |
| 3 | release | After the landing merge, release plan-lifecycle with a patch bump: `bun scripts/release.mjs --plugin plan-lifecycle patch` | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 2 | release | done | The release command prints the new tag and GitHub lists the release |
| 4 | review_fixes | Repair code review round 1 and its self-review (decisions 1 and 2): newline-safe capture of the hooks path, the scope of hooks that the check covers, plan-manager worktree setup through Linked branch timing with the worktree check on the linked branch, removal from the checkout with Teardown's guards, Kept resources for a blocked worktree, and sentences of 20 words or fewer; refresh the content hash and rerun the plugin gate | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 2 | local | done | The contract script equals the decision 1 script; Linked branch item 2 runs the worktree check only after the worktree is on the linked branch; Worktree hooks item 3 removes the worktree from the checkout without `--force`; Acceptance A1 to A4 hold again |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `bun scripts/ci.mjs --plugin plan-lifecycle` | Exit 0 (the gate that `plugins/plan-lifecycle/skills/AGENTS.md` and root `AGENTS.md` name for a one-plugin change) |
| A2 | `bun scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` | Exit 0 |
| A3 | Copy the hook check script from the contract's Worktree hooks section to a file in the review scratch directory, then run `sh <file>` from the repository root | Exit 0 and no output, because this repository runs no hook; the script in the file is byte-identical to the contract block |
| A4 | `grep -n "Worktree hooks" plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | The section heading and a pointer from Linked branch item 2, the Yolo runs row, Linked branch timing, and Repository hooks item 2 |

## Do not touch

- `plan.mjs` and its tests: the helper does not create worktrees.
- Repository hooks items 1, 3, and 4.

## Open questions

None.

## Verification Results

- No red baseline: no step uses `tdd-workflow`; the change is contract text only, and no test pins skill prose (`plugins/plan-lifecycle/skills/AGENTS.md`).
- A1: `bun scripts/ci.mjs --plugin plan-lifecycle`: `All ci.mjs checks passed - plugin 'plan-lifecycle'; safe to release.` (exit 0, on f73b27c0 plus the hash refresh).
- A2: `bun scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills`: exit 0, after the backfill rewrote `productivity/plan-manager`.
- A3: the script was extracted from the contract's Worktree hooks block to `$(git rev-parse --git-path docks-review)/yolo-129/hook-check.sh` (byte for byte, by the fence lines) and run with `sh` from this repository root: no output, exit 0.
- The same script in a scratch repository (`yolo-129/exp/repo`) with an executable `.git/hooks/pre-push` printed `.git/hooks/pre-push`; after `hook.lint.command` and `hook.lint.event` were set, it also printed `hook.lint.command true`; in a linked worktree of that repository it printed the shared common-directory `pre-push` and the configuration hook. The scratch worktree was removed with `git worktree remove` and `git worktree prune`.
- A4: `grep -n "Worktree hooks" .../plan-contract.md`: the heading (line 502) and pointers from Linked branch item 2, Repository hooks item 2, the Yolo runs row, and Linked branch timing items and closing paragraph.
- Review fixes (1e58eec0): the script extracted from the contract equals the decision 1 script (`cmp`); from this repository root it printed nothing, exit 0; in `yolo-129/exp/repo` it printed `.git/hooks/pre-push` and `hook.lint.command true`, exit 0. In `yolo-129/exp/ob`, the `onbranch` case printed nothing on `main` and `hook.x.command true` in a worktree on `feat`. A broken `.git/config` made the script exit 1 (`git config --get-regexp` alone returned 128). `x=$(printf 'q\n\n' && echo .); x=${x%?.}` kept `q\n`. `bun scripts/ci.mjs --plugin plan-lifecycle`: all checks passed; the content-hash backfill rewrote `productivity/plan-manager`, and A2 holds.
- Round 2 repair (f9a68299, the reviewed head): the contract script still equals the decision 1 script (`cmp`). The new scan printed `d1/pre-push`, `d3/pre-push`, `linkdir/pre-push`, and `d4/pre-commit` (a directory), and nothing for `d2` (mode `------x--x`), `d4/pre-push.sample`, or a missing directory. From this repository root the script printed nothing, exit 0 (A3); in `yolo-129/exp/repo` it printed `.git/hooks/pre-push` and `hook.lint.command true`. A1: `bun scripts/ci.mjs --plugin plan-lifecycle` passed; A2 holds after the backfill; A4 lists the heading and all four pointers.
- The `code-reviewer` wrapper was not registered for round 3, because the plugin moved to 0.20.0 during the run; round 3 ran as a fresh read-only reviewer that followed the 0.20.0 `agents/code-reviewer.md` and `code-reviewer` skill.

