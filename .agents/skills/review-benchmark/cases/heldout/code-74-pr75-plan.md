<!-- plan-contract: v4 -->

## Goal

Add an explicit-only `yolo` skill to the `plan-lifecycle` plugin. A user invokes it with a request. It runs the whole plan lifecycle without questions: issue, linked branch, research (codebase, web, experiments), plan review, implementation that applies the docks engineering skills, and code review until pass. It then opens a pull request, prints a short run summary, and asks one question: merge or not. The contract gains a Yolo runs section that is the only home for the autonomy rules. Before merge, a yolo run never accesses production, deploys to production, publishes, or releases. Scope: plan-contract.md, plan-manager and plan-reviewer hooks, the new yolo skill, and the documents and manifests that name the plugin skill set.

Mode: plan-and-implement

## Research

### User decisions (settled in session)

- Explicit invocation only. omp is the main runtime; Claude Code and Codex must also keep the skill out of implicit selection.
- Before merge: no production access, no production deploy. Deploys may go only to local, dev, homolog (staging), or preview targets. `publish` and `release` wait until after the merge.
- The run applies the docks engineering skills (behavior-only tests, SOLID, clarity, no suppressions, and the rest).
- The linked branch is created right after the issue, before research.
- No questions during review rounds. After a 10-round ceiling or a stall, ask one question (`Continue yolo` or `Leave plan blocked`).
- Fix every reproduced review finding at every severity.
- Never put secrets or absolute machine paths in published text.
- The user's global omp rule (`ask` before any issue, pull request, or comment) conflicts with yolo. A separate plan in `DocksDocks/public` (`SoT/.omp/AGENTS.md`) fixes it. That plan runs after this one.

### Repository facts

- `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` is canonical (`plugins/plan-lifecycle/skills/AGENTS.md`, Plan-skill contract sync). Override points that a yolo run changes: Record and mode (`Settle Mode with the user`), Steps, acceptance, and effects (`Every non-local step requires an in-session ask`), Phases and review comments (review-loop item 5: round 5 ceiling and user question), Linked branch item 2 (dirty checkout needs `ask`). Decision: add one `## Yolo runs` section at the end and one pointer sentence at each override point, so the autonomy rules have one home.
- Line 3 of the contract says `three lifecycle skills`; it becomes `lifecycle skills`. Root `AGENTS.md` Context tree row and `plugins/docks/README.md` (`It includes three skills,`) and root `README.md` (layout tree line `three skills + plan.mjs`, Plan lifecycle owner table, ask sentence) name the skill set and are updated in the same change.
- `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md` (`Use pass for no findings, ... blocked when a finding needs a user decision.`) and `plugins/plan-lifecycle/agents/plan-reviewer.md` Workflow item 7 (`blocked`) return `blocked` for decisions. Without a delegation exception, a yolo run stalls on every decision. Decision: a Goal line `Yolo: the user delegated every decision except the merge to the agent.` makes reviewers return `repair` and name the evidence-backed option. `.codex/agents/plan-reviewer.toml` loads the agent file, so it needs no edit. The plan-review Output Format block stays identical in both files.
- `code-reviewer` stays unchanged: its `blocked` means unreadable input.
- `plan.mjs` `createPlan`: `new --mode` outranks any Mode line in `--goal`; extra `--label` values must already exist, so yolo adds no label.
- Shipped skill bodies must not name author scripts (`scripts/skills/no-author-scripts.mjs`). The yolo body names only shipped plugin files.
- `scripts/skills/refs-guard.mjs` checks only `](references/...)` links; omp `skill://` rejects `..`. Decision: the yolo body names sibling files as backticked relative paths, not links.
- No skill in this repository ships `agents/openai.yaml` yet; `make-interfaces-feel-better` omitted the upstream one because docks carries distribution metadata in SKILL.md. Yolo needs it because Codex ignores `disable-model-invocation` and enables implicit invocation by default (https://learn.chatgpt.com/docs/build-skills). Decision: the file is required and is never removed. If a validator rejects it, fix the validator or the file shape so that `policy.allow_implicit_invocation: false` ships.
- Content hash and date: `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills` (constraint in `plugins/plan-lifecycle/skills/AGENTS.md`). Skill score floor for productivity: 8 (`node scripts/config/read-floor.mjs skills productivity`).
- The change spans `plan-lifecycle` and `plugins/docks/README.md`, so the full `node scripts/ci.mjs` gate applies (root `AGENTS.md`, Tool-agnostic rules).
- Manifest versions stay unchanged here; `scripts/release.mjs` bumps them in `release_plan_lifecycle`.

### Official sources

- Claude Code skills: `disable-model-invocation: true` keeps a skill out of model selection and leaves user invocation. https://code.claude.com/docs/en/skills
- omp skills (`omp://skills.md`): `disable-model-invocation` normalizes to `disableModelInvocation`; the skill is hidden from the prompt list and stays reachable through `/skill:yolo` and `skill://yolo`.
- Codex skills: `agents/openai.yaml` `policy.allow_implicit_invocation: false` disables implicit selection; explicit `$yolo` still works. https://learn.chatgpt.com/docs/build-skills. A lowercase `display_name` avoids the `$`-picker casing issue (https://github.com/openai/codex/issues/40600, https://github.com/openai/codex/issues/43727).

### Yolo runs rules (contract section content)

- The invocation settles path = plan and Mode = `plan-and-implement`, and is the in-session answer for every routine action until the merge question.
- Effects before merge: `local` runs; `probe` only against a non-production target or a public read-only source; `push` only to the linked branch; `deploy` only to a non-production environment (named local, development, dev, test, homolog, homologation, staging, or preview by repository configuration or docs); `production_access`, `publish`, `release` never before the landing merge.
- Linked branch right after `new`; a dirty checkout uses a worktree under `${XDG_DATA_HOME:-$HOME/.local/share}/agent-worktrees/<repository-name>/issue-<n>` without a question (matches the root `AGENTS.md` worktree rule). Never stash, move, or commit user work.
- Round ceiling 10 per review phase, every reproduced finding fixed at every severity, rejected findings posted as `Rejected review findings, round <k>`. Stall: round 10 without pass, the same finding after two different repairs, or two dispatch failures without a relevant change. On a stall: push current work, set `blocked`, ask once (`Continue yolo` / `Leave plan blocked`).
- Merge question after checks, with the run summary. Steps after merge each need their own question.
- Published text: remove secrets, tokens, credentials, private hostnames, environment values, absolute machine paths. A sensitive disclosure stops the run before any write.

### Engineering standards

The yolo skill maps step kinds to docks skills (`tdd-workflow`, `test-coverage`, `fix-workflow`, `solid`, `code-clarity`, `type-safety-discipline`, `lint-no-suppressions`, `code-guardrails`, `dep-vuln-workflow`, `commit-discipline`, `react-component-patterns`, `design-tokenization`, `accessibility`, `make-interfaces-feel-better`, `code-review`) and carries a fallback rule list for runtimes without docks. It does not start `security`, `refactor`, or `skill-agent-pipeline`, because each opens its own plan. This change itself: skill prose and validators only; no new permanent tests, because `scripts/tests/plan-cli.mjs` covers helper behavior and no test pins skill prose (`plugins/plan-lifecycle/skills/AGENTS.md`).

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | contract_yolo_runs | Change `three lifecycle skills` to `lifecycle skills`; add the Contents entry; add one pointer sentence at Record and mode, Steps/acceptance/effects, Phases (owner line and review-loop item 5), and Linked branch item 2; append the `## Yolo runs` section (delegation line, effect table, linked-branch timing, round ceiling, merge question, published text) | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | - | local | done | The section and pointers exist; refs-guard passes |
| 2 | manager_reviewer_hooks | plan-manager second constraint: Yolo runs replaces every question except merge. plan-reviewer skill and agent: with the delegation line in Goal, return `repair`, not `blocked`, and name the evidence-backed option | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/agents/plan-reviewer.md | 1 | local | done | Both reviewer files carry the same sentence; Output Format blocks unchanged |
| 3 | yolo_skill | Create the yolo skill: frontmatter (`user-invocable: true`, `disable-model-invocation: true`, pattern pipeline), three constraints (invocation guard, production and publication safety, durable solution and request corrections), run order, draft, research order, engineering-standards table, review loops, landing, run summary, recovery, BAD/GOOD; Codex `agents/openai.yaml` with `allow_implicit_invocation: false` | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md, plugins/plan-lifecycle/skills/productivity/yolo/agents/openai.yaml | 1 | local | done | Skill validators pass; score at least 14 |
| 4 | roles_docs | Name yolo in Roles, root Context tree row and Plans, root README (layout line, owner table, ask sentence), docks README companion section, and the three plugin descriptions (identical text) | plugins/plan-lifecycle/skills/AGENTS.md, AGENTS.md, README.md, plugins/docks/README.md, plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 3 | local | done | Every skill-set mention names yolo; descriptions are identical |
| 5 | gate | Backfill content hashes; check hashes; score; run the full gate | plugins/plan-lifecycle/skills | 2, 3, 4 | local | done | `content-hash --check-only` exits 0; full `node scripts/ci.mjs` passes |
| 6 | omp_discovery_smoke | Run omp print mode with `--plugin-dir ./plugins/plan-lifecycle`: `skill://yolo` resolves, and yolo is absent from the model-visible skill list | - | 5 | local | done | Prints `name: yolo`; list has plan-manager, plan-reviewer, plan-workspace, no yolo |
| 7 | e2e_smoke | Create private scratch repository `<private scratch repository>`; run a headless omp yolo run with the planned public rule appended; check issue, verdicts, corrections, pull request, behavior test, summary, and no machine paths | - | 6 | probe | done | All A3 rows hold |
| 8 | release_plan_lifecycle | After the landing merge: `node scripts/release.mjs --plugin plan-lifecycle minor` | plugins/plan-lifecycle | 7 | release | planned | Release tag exists for the new minor version |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` | Exit 0 |
| A2 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/plan-lifecycle/skills` | `productivity/yolo` scores at least 14 |
| A3 | `node scripts/ci.mjs` | Exit 0 |
| A4 | `grep -n 'allow_implicit_invocation: false' plugins/plan-lifecycle/skills/productivity/yolo/agents/openai.yaml` | One line |
| A5 | `omp -p --no-session --plugin-dir ./plugins/plan-lifecycle "Read skill://yolo and reply with only its frontmatter name line."` | `name: yolo` |
| A6 | `omp -p --no-session --plugin-dir ./plugins/plan-lifecycle "Without reading files, list every skill name in your system prompt that contains plan or yolo, one per line."` | Lists plan-manager, plan-reviewer, plan-workspace; no yolo |
| A7 | Headless `omp -p --no-session --mode json --plugin-dir <plan-A-checkout>/plugins/plan-lifecycle "/skill:yolo <greet.mjs request with a source-text test>"` in a clone of the private scratch repository | One plan issue with `reviews: plan=pass code=pass`; body has the delegation line, `Mode: plan-and-implement`, a `https://nodejs.org/` URL, and a `### Request corrections` line starting `Asked:`; one open pull request from the linked branch with `Closes #<n>`; `node --test` passes and fails after `Hello` becomes `Hi`; last message has `## Yolo run:` and `Merge pull request #`; no `/home/` path in issue comments |

## Do not touch

- `code-reviewer` skill and agent wrappers.
- `.codex/agents/plan-reviewer.toml` and `.codex/agents/code-reviewer.toml`.
- Manifest version numbers (release tooling bumps them).
- `plan.mjs` behavior.
- The user's global instruction files (Plan B in `DocksDocks/public` owns that change).

## Open questions

## Verification Results

- A1 `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills`: exit 0.
- A2 skill score: `productivity/yolo 16` (floor 8); plan-manager 14, plan-reviewer 13, plan-workspace 15.
- A3 `node scripts/ci.mjs`: exit 0 with the lockfile-pinned Claude Code CLI on `PATH`, as CI materializes it. Without that CLI, only the two `claude plugin validate` checks fail with "claude CLI could not run". Rerun after the smoke-driven skill edit: exit 0.
- A4 `grep -n 'allow_implicit_invocation: false' .../yolo/agents/openai.yaml`: one line (line 5).
- A5 omp `Read skill://yolo ...`: printed `name: yolo`.
- A6 omp skill list: `plan-manager`, `plan-reviewer`, `plan-workspace` (plus namespaced duplicates of the installed plugin); no `yolo`.
- A7 headless yolo run in the private scratch repository `<private scratch repository>` (about 18 minutes, exit 0). The run read `skill://yolo`.
  - One plan issue #1; `show 1` printed `reviews: plan=pass code=pass`.
  - The body has the delegation line, `Mode: plan-and-implement`, four `https://nodejs.org/` URLs, and a `### Request corrections` line `Asked: a test that reads greet.mjs and checks that the source contains console.log. Did: a test that runs greet.mjs ...`.
  - One open pull request #2 with `Closes #1` on its own line. Its head `1-add-greetmjs-command-line-greeting-script` is the branch that the run created with `gh issue develop 1 --base main --checkout` and listed. After the pull request opened, `gh issue develop 1 --list` printed nothing, and GraphQL `linkedBranches` was empty; `closedByPullRequestsReferences` names #2. The same empty list shows for this repository's merged plan #72, so GitHub drops the linked branch once a pull request exists. This acceptance clause cannot hold after the pull request; the branch identity was checked through the run's own listing and the pull request head.
  - `node --test`: 4 pass. After `Hello` became `Hi` in `greet.mjs`: 1 pass, 3 fail. Reverted; 4 pass.
  - The last assistant message contains `## Yolo run:` and `Merge pull request #2 into main?`, and reports that `ask` is unavailable in print mode, so the pull request stays open.
  - `/home/` count in issue comments and in the pull request body: 0.
- Smoke-driven skill changes (step `yolo_skill` Files): the run loaded `code-clarity`, `commit-discipline`, and `code-review` only after code review round 1. Engineering standards now says to read matching skills during Research, apply them again in each step, and run the `code-review` self-review before code review round 1. Recover after compaction now reads the branch from `closedByPullRequestsReferences` once the pull request exists.
- Scratch repository left for the user: `gh repo delete <private scratch repository>`.
