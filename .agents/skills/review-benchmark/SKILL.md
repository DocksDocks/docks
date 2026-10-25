---
name: review-benchmark
description: "Use when measuring a change to the plan-lifecycle reviewers in this repository (code-reviewer or plan-reviewer prompts, skills, lenses, or delta rounds) or to their model, effort, or service tier: replays recorded and seeded review cases through baseline and candidate arms at each configuration, scores recall, wrong findings, time, and tokens with a blind judge, and records the keep-or-drop decision. Not for reviewing a plan or a diff (use plan-manager), skill trigger checks (use write-skill), or CI gates."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-10-25"
---

# Review benchmark

This skill measures a reviewer change before it ships. It replays frozen review cases through the released reviewer (the baseline) and the working-tree reviewer (the candidate), or through plan-reviewer variants at git refs, at each configuration of model, effort, and service tier. A judge from another model family matches the findings with the known defects. `results.md` holds the decision rule and the results of every run.

| Path (in this skill folder) | Content |
|---|---|
| `scripts/prepare.mjs` | Builds the agent files of the configurations, of the plan-reviewer variants, and of the fixer agent, one workspace per case, the probe, and the rounds of review loops |
| `scripts/score.mjs` | Parses the returned blocks, builds judge pairs, writes the report, and plans the fix step of a loop round |
| [references/judge.md](references/judge.md) | The judge's instructions: match pass and adjudication pass |
| `cases/dev/`, `cases/heldout/` | Case files and their inputs; held-out answer keys are in `<id>.key.json` |
| `results.md` | Decision rule and the append-only results log |

<constraint>
Held-out cases decide whether a change generalizes, so the person or agent who changes reviewer prompts never sees their defects. That author does not open any file under `cases/heldout/`, and does not open the workspace, `pairs.json`, or `judgments.json` of a held-out run. The author reads only the held-out `report.md`. Held-out cases run once per decision, after the dev iterations.
</constraint>

## Cases

A case is `cases/<split>/<id>.json` plus the files it names in the same folder.

| Field | Kinds | Meaning |
|---|---|---|
| `id`, `kind`, `split` | all | Case name (also the file name), `code`, `code-delta`, `plan`, or `plan-delta`, and `dev` or `heldout` |
| `issue`, `round` | all | Plan issue number and review round that the prompt names |
| `plan` | all | Plan body file (the plan export; for `plan-delta`, the new body) |
| `base`, `head` | code kinds | Commits; the reviewed tree is `head` plus `patch` |
| `patch` | code kinds | Optional patch that plants defects into `head` |
| `delta_base`, `previous_review` | `code-delta` | Head of the previous round, and that round's comment |
| `repo_ref` | plan kinds | Repository commit for the plan's facts |
| `previous_body`, `previous_review` | `plan-delta` | Body and comment of the previous round |
| `rejection` | delta kinds | Optional rejection comment of the previous round |
| `external` | all | Optional list of the file fields (`plan`, `patch`, `previous_review`, `previous_body`, `rejection`) whose files are in the key folder |
| `show_benchmark` | all | Optional `true` for a case whose plan changes this skill: the snapshot and the diffs then hold this skill folder without its `cases/` folder (see Workspace) |
| `known` | dev only | Known defects: `id`, `title`, `locator`, and `severity` (code) or `kind` (plan). A code defect adds `fix`, its fix patch (a file in the case folder), and optionally `fix_after`, the ids of the known defects whose patches its patch needs first |

A held-out case file has no `known` field. Its known defects are in `<id>.key.json`, in the same form as the `known` list of a dev case, and the fix patches are in the folder of the key file. Of the agents, only the judge reads key files; `score.mjs` and `prepare.mjs loop` read them too. The keys of the current held-out cases are in `cases/heldout/`: plans #100, #109, and #111 published them after their decisions, so these cases build and score without `--keys`. While reviewers run on a new held-out set, keep its keys outside the repository until its decision, because a reviewer can search the checkout: for example in `$XDG_STATE_HOME/docks/review-bench/keys/` with mode 0700. Give that folder to `score.mjs pairs` and `score.mjs report` with `--keys <dir>`. `pairs` then reads `<dir>/<id>.key.json` for each case without `known`, and never the key file next to the case file. `report` stops when a key in that folder has other known-defect ids than `pairs.json`; run `pairs` again.

With `--keys`, every key comes from the keys folder, also the key of a case whose key file is in `cases/heldout/` (plan #109, decision 6). So when a held-out set mixes cases with published keys and cases whose keys stay outside the repository, copy the published `<id>.key.json` files into the keys folder before `pairs`, `report`, and `loop`, and for a code case also its fix patches. A plan known defect has no fix patch, so its key file is enough.

A held-out case can keep its input files in the key folder too: `external` names their fields, for example `["plan", "patch"]`. Give the key folder to `prepare.mjs case` and `prepare.mjs loop` with `--keys <dir>`; without it, they stop before they write. The workspace gets these inputs under its own names (`plan.md`, the snapshot, and the diffs), so no file of the key folder lands in a workspace under its own name.

To add a case, commit its inputs and add the case file. Turn each defect that escaped a real review into a new dev case: use the base, head, and plan of the round that missed it, and give the defect one `known` entry with its fix patch. A held-out case is built by an agent that does not change reviewer prompts, and that agent reports only paths and counts.

## Configurations

A configuration is a model, an effort, and a service tier. `prepare.mjs agents` writes every model at every effort with every tier. The grid of plan #100 is `openai-codex/gpt-6.1-sol` at `low`, `medium`, `high`, and `xhigh`, each with the tiers `priority` and `default`: eight configurations.

| Option of `agents` | Values | Part of the configuration name |
|---|---|---|
| `--model <m>[,<m>...]` | model selectors without an effort suffix | with two or more models, the model slug (the last path segment, in lower case) and a hyphen come first |
| `--efforts <list>` | omp thinking levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` | the effort |
| `--tiers <list>` | omp OpenAI service tiers: `none`, `auto`, `default`, `flex`, `scale`, `priority`, `ultrafast` | nothing for `default`, `-fast` for `priority`, `-<tier>` for the other tiers |
| `--fixer-model <m>`, `--fixer-effort <e>`, `--fixer-tier <t>` | the model, effort, and tier of the fixer agent; defaults `openai-codex/gpt-6.1-sol`, `high`, and `priority` | none: one fixer serves every configuration |
| `--variants <name>=<git ref>[,...]` | plan-reviewer variants: a name of lower-case letters and digits, given one time, and a ref that holds `plugins/plan-lifecycle/agents/plan-reviewer.md` | none: each variant gets one plan agent per configuration (see Arms) |
| `--full-only <name,...>` | variants of `--variants` without a delta mode, for example the 0.16.0 prompt | none |
| `--contract-overlay <name,...>` | variants of `--variants` whose commit changes `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` against its first parent | none: `agents` records the change, and `case` applies it to a copy of the plan contract for each run of the variant (see Arms) |

For example, `--efforts low,xhigh --tiers priority,default` gives `low-fast`, `low`, `xhigh-fast`, and `xhigh`. With a second model, the names become `gpt-6.1-sol-low-fast` and so on. The same lists always give the same names, because the report uses them as column names.

Give `--efforts` only the thinking levels that the model supports: `omp models find <model>` lists them. omp runs an unsupported level at another level and shows no error (for `openai-codex/gpt-6.1-sol`, `minimal` ran as `low`). Only the probe shows this.

`agents` applies each configuration through omp agent files, so each reviewer runs as a task subagent, as in production:

- `.omp/agents/review-bench-<side>-<role>-<config>.md`: one agent for each side (`baseline`, `candidate`), role (`code`, `plan`), and configuration. The frontmatter pins `model` and `thinking-level`.
- `.omp/agents/review-bench-variant-<name>-plan-<config>.md`: with `--variants`, one plan agent for each variant and configuration, with the model, effort, and tier of the configuration. Its text is `plugins/plan-lifecycle/agents/plan-reviewer.md` at the ref of the variant. `agents` extracts `plugins/plan-lifecycle` at that ref to the folder `variant-<name>-plugin/` next to the baseline copy, and the agent names that folder as its plugin root (see Read scope). `agents` refuses a variant whose agent does not name its skill as `${CLAUDE_PLUGIN_ROOT}/skills/<folder>/plan-reviewer/SKILL.md`, because the read scope finds the plugin root of a reviewer through that path. Put that path in backticks or quotes, as the plugin agent does: then the path can hold spaces, so the plugin copies can be in a folder whose path has a space. It also refuses a `--baseline-dir` whose folder is the folder of a variant copy, because the variant copy would replace the plugin of the baseline agents, and a `--contract-overlay` variant whose commit does not change the plan contract. `--full-only` and `--contract-overlay` need `--variants`, and each name in them must be a variant. `agents` makes these checks before it changes a file.
- `.omp/agents/review-bench-fixer.md`: the fixer agent of review loops (see Review loop). It repairs the valid extra findings of a round, with the same model, effort, and tier for every configuration, so that only the reviewer setup varies.
- `.omp/agents/review-bench-selfreview-<config>.md`: one self-review agent for each configuration, with the model, effort, and tier of the reviewer agents of that configuration. It is the self-review of the plan manager before code-review round 1 (#98). It loads `skill://code-review` and `skill://code-clarity`, applies both skills to the candidate diff, and returns one block in the code-review block format: the heading, `Code-review: pass` or `Code-review: fixes-required`, and `## Standards` and `## Spec` with finding lines `- [SEVERITY] Category - locator - text`. The agent has no plugin folder, so its text names the path of its own agent file (see Read scope). The arms `S1` and `S3` use it.
- `.omp/settings.json`: one entry `task.agentServiceTierOverrides.<agent>` for each agent and for the fixer agent, with the tier of its configuration or of the fixer. omp merges `.omp/config.yml` over this file. The script keeps every other setting in the file and does not change the user's global config.
- `.omp/agents/review-bench-configs.json`: `configs`, the list of configurations, which `case` and `probe` read; `fixer`, the model, effort, and tier of the fixer agent; and `variants`, one `{ name, ref, sha, delta }` per variant (`delta` is false for a `--full-only` variant), which gives `case` the variant arms. A `--contract-overlay` variant also has `contractDiff`: the diff of the plan contract from the first parent of the variant commit to the commit. `case --loop` records `fixer` in each loop run (see Workspace), and it stops when the file has no `fixer`.

omp reads project agents and project settings from the working folder of the session. Write them where the dispatching omp session runs: by default the repository root of `prepare.mjs`, or the folder that `--project <dir>` names (for example the main checkout, when the script comes from a worktree). Give `case`, `probe`, and `clean` the same `--project`.

`agents` removes the output of an earlier `agents` call before it writes. `clean` removes every `review-bench-*` file of `.omp/agents/` and `.claude/agents/`, every `review-bench-*` entry of `task.agentServiceTierOverrides`, `.omp/settings.json` when no other setting stays in it, and each folder that it empties.

`--runtime claude` writes the agents to `.claude/agents/` with the Claude Code `effort` key (`low`, `medium`, `high`, `xhigh`, or `max`). Claude Code loads them in a new session or after `/agents`. Claude Code sets no service tier per agent, so this runtime takes no `--tiers` and no `--fixer-tier`, and each configuration records the tier `null`. It needs `--fixer-model`, because the default fixer model is an omp selector. The `CLAUDE_CODE_EFFORT_LEVEL` variable overrides the `effort` key, so keep it unset. Claude Code reads no `skill://` URI, so run the self-review arms `S1` and `S3` with omp.

## Arms

| Arm | Case kinds | Agent | Reviewers | Round policy with `--loop` |
|---|---|---|---|---|
| `B0` | code, code-delta | `review-bench-baseline-code-<config>` | `full` (on code-delta: today's full re-review) | `full` |
| `B1` | code | `review-bench-baseline-code-<config>` | the three lenses, described in the prompt | `panel-delta` |
| `C1` | code | `review-bench-candidate-code-<config>` | `full` | `full-delta` |
| `C3` | code | `review-bench-candidate-code-<config>` | `correctness`, `spec-and-tests`, `text-and-safety` | `panel-delta` |
| `Cd` | code-delta | `review-bench-candidate-code-<config>` | `delta` | none |
| `P0` | plan, plan-delta | `review-bench-baseline-plan-<config>` | `plan`, full round | none |
| `P1` | plan | `review-bench-candidate-plan-<config>` | `plan`, full round | none |
| `Pd` | plan-delta | `review-bench-candidate-plan-<config>` | `plan`, delta mode | none |
| `V<name>` | plan, plan-delta | `review-bench-variant-<name>-plan-<config>` | `plan`: a full round on a plan case; on a plan-delta case the delta mode, or a full round for a `--full-only` variant | none |
| `S1` | code | `review-bench-selfreview-<config>` | `self-review`: the full diff, with the prompt of `C1` | none |
| `S3` | code | `review-bench-selfreview-<config>` | `self-review-correctness`, `self-review-spec-and-tests`, `self-review-text-and-safety`: the focus diff and the lens description of the `B1` lens | none |

Without `--loop`, a run is one review by the reviewers of its arm. With `--loop`, a run is a review loop, and the round policy that the `meta.json` of the run records picks the mode of each round (see Review loop). `case --loop` records the policy of the arm.

The baseline agents are the released `code-reviewer.md` and `plan-reviewer.md` of `plugins/plan-lifecycle/agents/`; the candidate agents are the working-tree copies. In each configuration, both sides get the same model, effort, and tier, so only the instructions differ.

A panel prompt of a baseline agent holds the lens text: the panel rules and the scope of its lens. The released 0.16.0 agent does not know the lenses. A candidate panel prompt only names the lens, and the candidate agent loads the lens text from a lens reference of its skill. When the baseline ref has the same reviewer as the working tree, for example `--baseline-ref plan-lifecycle--v0.17.1` on a checkout without later reviewer changes, `B1 --loop` and `C3 --loop` differ only in the dispatch of a panel round: the `B1` dispatch also holds the lens text. Both agents can load the lens reference of their skill. The `delta` and `full` prompts of `B1` are the prompts of `C3`, with the baseline agent.

The self-review arms `S1` and `S3` measure the self-review of #98 on the candidate of code-review round 1, as one agent and as one agent per lens. Each run is one review in `run-<k>/blocks/<reviewer>.md`, so `case` refuses these arms with `--loop`. Their blocks have the code-review block format, so `score.mjs` reads them as code-review blocks.

The variant arms compare plan-reviewer prompts at git refs in one workspace, for example the released prompts and candidates on local refs (plan #109). `case` takes `V<name>` for each variant of the list of configurations, on plan and plan-delta cases only. The prompt of a variant arm is the prompt of `P0` and `P1` in full mode, or of `Pd` in delta mode; only the agent on line 1 differs. One `V<name>` folder holds the plan and the plan-delta runs of a variant, so its report column covers both kinds. On a plan-delta case, a `--full-only` variant runs a full round, so that case measures its prompt and its mode together. A candidate keeps the line `${CLAUDE_PLUGIN_ROOT}/skills/productivity/plan-reviewer/SKILL.md` in its agent and puts each new instruction file under `skills/productivity/plan-reviewer/`: of a plugin root, the read scope allows only the agent file, the reviewer skill folder, and the plan contract.

Every reviewer reads the plan contract of the case snapshot, so that a later contract fix stays out of the runs. A candidate that also changes the plan contract (plan #109, decision 7) is then measured without its contract change. `--contract-overlay` gives such a variant its contract change: for each run of the variant, `case` copies the plan contract of the snapshot to `run-<k>/plan-contract.md` and applies the change to the copy with `git apply`. The snapshot stays the same. The `meta.json` of the run records `contractOverlay`: `applied`, or `not applicable` when the snapshot contract holds no line that the change removes (blank lines aside), so it does not hold the text that the change changes. The copy then holds the snapshot contract. When `git apply` fails on a snapshot contract that holds a removed line, for example because the context lines differ, `case` stops with the message of git and the run folder, and writes nothing for that case. The prompt of the run tells the reviewer to read the plan contract at the copy and every other repository file under the snapshot root. `case` stops when the snapshot has no plan contract. The runs of every other arm keep the prompt that sends every plan contract read to the snapshot root.

`case` prepares each arm once per configuration, in the arm folder `<arm>-<config>`. `--configs <name,...>` selects the configurations; the default is every configuration that `agents` wrote. One workspace can so hold every configuration of an arm. `score.mjs` reports each arm folder as one arm.

`case` refuses a case folder that exists. To add arms to a case folder, for example a variant with a contract overlay after the first runs, give `--extend`: `case` then adds the folders of the arms and keeps the snapshot, the diffs, and every other arm folder. `--extend` refuses a missing case folder, a case folder whose `case.json` differs from the case file, and an arm folder that exists. When it stops, it removes only the arm folders that it wrote. With `--loop`, it builds the reviewed tree again to get the size of the full diff, which picks the round 1 mode.

## Workspace

```text
<ws>/<case-id>/
  case.json  snapshot/  plan.md
  full.diff  focus-correctness.diff  focus-spec-and-tests.diff  focus-text-and-safety.diff
  delta.diff  previous-review.md  rejection.md      (code-delta)
  plan.diff   previous-review.md  rejection.md      (plan-delta)
  <arm>-<config>/run-<k>/prompts/<reviewer>.txt     line 1: agent: <name>, line 2 empty, then the prompt
  <arm>-<config>/run-<k>/blocks/<reviewer>.md       the returned review block
  <arm>-<config>/run-<k>/meta.json                  {"config": {...}, "reviewers": {"<reviewer>": {...}}}; of a loop: {"policy": "<policy>"}
  <arm>-<config>/run-<k>/plan-contract.md           the plan contract with the contract change of a --contract-overlay variant
  <arm>-<config>/run-<k>/round-<r>/                 one review round of a loop: prompts/, blocks/, meta.json
  <arm>-<config>/run-<k>/round-<r>/snapshot/  full.diff  delta.diff  previous-review.md  rejection.md
                                                    the inputs of a loop round after round 1 (see Review loop)
  <arm>-<config>/run-<k>/round-<r>/fixer/           the fixer prompt, patch, and snapshot of the fix step after round r
<ws>/trees/<run label>/                             the judge's copy of the reviewed tree of a loop round after round 1
<ws>/findings.json  <ws>/pairs.json  <ws>/judgments.json  <ws>/judgments-second.json  <ws>/report.md
```

`case` writes `config` to the `meta.json` of each run, or of `round-1/` of a loop run: the `name`, `model`, `effort`, and `tier` of the run's configuration. `case --loop` also writes `fixerConfig` to each `round-1/meta.json`: the `model`, `effort`, and `tier` of the fixer agent, from the list of configurations that `agents` wrote. For each run of a `--contract-overlay` variant, `case` also writes `contractOverlay`, `applied` or `not applicable` (see Arms). `score.mjs transcripts` adds one entry per reviewer under `reviewers` and keeps every other field:

| Field | Value |
|---|---|
| `seconds`, `tokens` | the time from the first user message to the last assistant message of `config.model`, and the tokens of the messages of `config.model`; without `config`, of every assistant message. The time also counts a failed request (see `messages`) of another model, because its time is real wall time |
| `requestedTier` | the last requested OpenAI tier (`service_tier_change`) |
| `messages` | for each assistant message, in transcript order: the `model`, the `effort` that was active at the message (the `thinkingLevel` of the last `thinking_level_change` before it, else `null`), and the `servedTier`. A request that stopped on an error (`stopReason` `error`) and has no served tier also gets `failed: true` |
| `sideCalls` | the `model`, `purpose`, and `tokens` of each `model_usage` record, for example a title call of a helper model; their tokens stay out of `tokens` |
| `readScope` | only for a reviewer that called tools: `outside`, the targets of its tool calls outside the inputs of its run, and, only for a reviewer that searched the web, `queries`, the query of each web search (see Read scope); `meta.json` keeps no tool calls |

A run of several review rounds keeps each round in a `round-<r>` folder, from `round-1` without a gap, with its own `prompts/`, `blocks/`, and `meta.json`. A round `meta.json` can add `mode` (the round mode), the fix step after the round (`fix`, `fixAlreadyApplied`, `fixedByFixer`, `fixLeftOut`, `fixerChangedNothing`, and `fixRepairedNothing`), and `fixer` (the time, the transcript facts, and the reply of the fixer after the round), see Review loop. `report` reads `config` and `fixerConfig` from the run's `meta.json`, else from its `round-1/meta.json`. A run without round folders is round 1, and its finding ids and scores do not change. Each round folder is a dispatch of its own: the dispatch names of its prompts have `K<round>` after the run part, for example `Code7C1LowR1K2Delta`, and `transcripts` writes the `meta.json` of the round folder.

The snapshot is the reviewed tree without Git history. This skill folder holds the held-out answer keys, so the snapshot, every diff, and the changed-path list of the focus diffs leave it out. A case with `show_benchmark: true`, whose plan changes this skill, gets the skill folder without its `cases/` folder instead, so that the reviewer can check the claims of the plan about the scripts and the skill text. Focus diffs split the changed paths by class:

| Path class | Rule | Focus diffs |
|---|---|---|
| Test | a `test`, `tests`, `spec`, `__tests__`, or `fixtures` folder, or `.test.` or `.spec.` in the name | spec-and-tests |
| Prose | ends in `.md`, `.txt`, or `.rst` | text-and-safety |
| Registry or config | ends in `.json`, `.yml`, `.yaml`, or `.toml` | correctness, spec-and-tests |
| Production | every other path | correctness |

A path can be in more than one class. When no changed path is in a lens's scope, its focus diff is a copy of `full.diff`.

## Read scope

The reviewers run in the working folder of the dispatching session, the live checkout, which holds the fixes of the corpus defects. A reviewer that reads a file outside the inputs of its run can see a fix, so its recall does not count. Each prompt tells the reviewer to give every Read, Grep, and Glob call an absolute path under the snapshot root or a file that the prompt names. The prompt also tells the reviewer that its own instruction files are its agent file and the files of its own skill folder, and that it reads every other file, also the plan contract and other skills, under the snapshot root. The prompt of a run of a `--contract-overlay` variant tells the reviewer to read the plan contract at the copy `plan-contract.md` in its run folder instead (see Arms). It tells the reviewer not to read `skill://code-reviewer` and `skill://plan-reviewer`, because these URIs resolve to another version of the reviewer instructions. `score.mjs transcripts` reads the tool calls of each reviewer transcript and writes the targets outside the inputs to `readScope.outside` of the reviewer entry, each target once, in call order. The `path` argument of a `grep`, `glob`, or `ast_grep` call can hold several targets separated by `;`, as the omp tool docs (`omp://tools/<tool>.md`) tell. The `path` of every other call, for example of a `read` or a `find`, is one target, also when it holds a `;`. When no file or folder has the path of a target, omp can read the target as a list of the paths between `;`, `,`, or white space outside `{}` (`omp://tools/read.md`, Flow step 7), and it resolves a relative path of the list against its working folder. For a `read` call whose tool result records the paths of such a list (`displayReadTargets` in the details of the result), these paths decide, and a path that omp could not read (a `Could not read <path>` note) counts for nothing. For every other target, `transcripts` checks the files as omp does: a target whose whole path exists, with or without its read selector, is one target, for example a snapshot file whose name holds a space or a `;`, or a target in a workspace folder whose name holds a space. Else omp takes the first split that it can: on `;`; on `,` when some part exists; on white space, or on all three delimiters, when each part exists. Without a record, `transcripts` cannot see which paths omp could not read, so each path of the split counts. A URI target is a list only on `;`, and only when each part is a URI. A list target is allowed only when each of its paths is allowed, and `readScope.outside` gets the whole target as the reviewer wrote it. Every other target loses its read selector (for example `:1-260`). A relative path resolves against the `cwd` of the `session` entry of the transcript. The prompt also lets the reviewer read official documentation on the web, but no page of the benchmark repository, as a production reviewer does; the judge gets the same documentation evidence (`references/judge.md`). A `web_search` call has a `query` and no path: `transcripts` writes each query once, in call order, to `readScope.queries`. The query is outside when it targets the benchmark repository: after its `-site:` exclusions are removed, it mentions the owner `DocksDocks` without the name of another repository of the owner (for example `DocksDocks/public`). `transcripts` also reads the URLs that the tool result of the search cites, and each page of the benchmark repository among them is outside, because the reviewer saw its text. A `read` of a local file with an omp JSON query selector (`<file>?q=<filter>`) reads the file before `?q=`. A target is allowed when it is:

- under an input of the run: `snapshot/`, `prompts/`, the `*.diff` files, `plan.md`, `previous-review.md`, and `rejection.md` of the case folder, and of the run folder or of each `round-<j>` folder up to the round of the reviewer
- the copy `plan-contract.md` of the plan contract in the run folder, which the prompt of a run of a `--contract-overlay` variant names (see Arms). It is an input of its run only: the copy of another run is outside. The case-change rule below does not apply to it, because the copy is the contract of the case snapshot with the change of the variant, not a later version of the contract
- under `<ws>/trees/<run label>/` of a round of the run up to the round of the reviewer
- an instruction file of the reviewer, which stays allowed also when the case changes it (see the limit below): `agents/<name>-reviewer.md`, or a file in the `code-reviewer` or `plan-reviewer` skill folder, of the plugin root that the agent text names (the candidate `plugins/plan-lifecycle/` of the live checkout, the baseline plugin folder, or the `variant-<name>-plugin/` folder of a variant). `transcripts` finds that root in the system prompt of the `session_init` entry of the transcript. A path in backticks or quotes in the agent text can hold spaces; a bare path ends at the first space. The self-review agent has no plugin root, so its instruction files are its own agent file, `<dir>/.omp/agents/review-bench-selfreview-<config>.md` (or the same file in `.claude/agents/`), which its agent text names, and the two skills that it loads: a `skill://` URI of the `code-review` or `code-clarity` skill, and a file of these skills in an installed plugin cache copy (see below). For another reviewer, these skill reads are optional instruction reads
- an optional instruction read, when the case does not change its file (see the case-change rule below):
  - the plan contract `skills/[<folder>/]plan-manager/references/plan-contract.md` of that plugin root (this exact file). The plan-reviewer checklist tells the reviewer to read this contract in its own plugin, so the contract is part of the instructions of the reviewer
  - a `skill://` URI of the `code-review` or `code-clarity` skill
  - a file under the folder of one of these two skills in an installed plugin cache copy: a path `<any>/plugins/cache/plugins/<plugin dir>/skills/[<folder>/]<skill>/…` without a `..` segment. A `skill://` URI of these skills can resolve to this copy, so the reviewer reads the same text as through the URI
- an `artifact://` URI (the spilled output of the reviewer)
- a web URL that is not a page of the benchmark repository: `github.com/DocksDocks/docks`, `raw.githubusercontent.com/DocksDocks/docks`, and `api.github.com/repos/DocksDocks/docks` are outside

Every other target is outside: `case.json` (it can hold the known defects of a dev case), `meta.json`, the blocks, the `fixer/` folders (their snapshot holds fixed code), a later round, another run, every other file of the live checkout or of the repository that holds a plugin root (other skills can hold fixed shipped text), every other path, and every other URI, for example `issue://` and `pr://`. For example, `plugins/docks/skills/engineering/code-review/` of the repository that holds a plugin root is outside: a skill that the plan names has its production copy, the copy of the reviewed repository, under `snapshot/`. A `grep`, `glob`, `find`, or `ast_grep` call without a path searches the working folder, so it is outside too. A glob is allowed only when the folder before its first glob segment is allowed and no later segment holds `..`. A web search whose query names the owner of the benchmark repository (`DocksDocks` anywhere in the query, in any case, for example `DocksDocks docks plan-lifecycle archive fix`) can find the pages of the repository, so it is outside, with the target `web_search: <query>`. A run with an outside target is invalid (see step 4 of the procedure).

A `skill://` URI of the `code-reviewer` or `plan-reviewer` skill, with or without a path after the skill name, and a file of these skills in an installed plugin cache copy are outside for every reviewer. They resolve to the installed plan-lifecycle release, which can be another version than the arm: a baseline reviewer then reads the instructions of another release. The own reviewer skill of a reviewer is the skill folder under its plugin root, which stays allowed. A `skill://` URI that leaves the folder of the `code-review` or `code-clarity` skill with a `..` segment for another skill is outside too.

Case-change rule: the reviewer setup under test (the plugin roots and the installed skills) is newer than every case. When a case changes the file of an optional instruction read, the read shows a later version of a file under review, and that version can show the fix. So an optional instruction read is outside when the case changes the same file. `transcripts` compares paths from the skill folder name on:

- the plan contract `<root>/skills/[<folder>/]plan-manager/references/plan-contract.md` gives `plan-manager/references/plan-contract.md`
- a cache path `…/skills/[<folder>/]<skill>/<rest>` gives `<skill>/<rest>`, for example `…/docks___docks___0.21.0/skills/engineering/code-review/references/perf.md` gives `code-review/references/perf.md`
- `skill://<skill>` gives `<skill>/SKILL.md`, and `skill://<skill>/<rest>` gives `<skill>/<rest>`
- a changed repository path `plugins/<plugin>/skills/[<folder>/]<skill>/<rest>` gives `<skill>/<rest>`

The changed files of a run are, for a `plan` or `plan-delta` case, the paths in the Files cells of the `## Steps` table of the `plan.md` of the case folder (split on commas and white space); for a run with round folders, the paths in the `diff --git` and `+++ b/` lines of the `full.diff` of the round (round 1: the `full.diff` of the case folder); and for a single-review code run, the paths in these lines of each diff file of the case folder. `transcripts` stops when such an input file is missing, or when a row of the Steps table does not have 8 cells. The comparison is lexical and conservative. A read is outside when its path and a changed path are the same or one is a folder above the other, so a read of a folder (for example a grep) is outside when a changed file is under it. A glob counts as the folder before its first glob segment, so a glob that could match a changed file is outside. A changed path that ends with `/` or whose last segment has no `.` can be a folder, and a changed folder that can hold skill folders (a folder directly in `skills/`, `plugins/<plugin>/skills/`, or a folder above it) makes every optional instruction read outside.

Limit: the instruction files of a reviewer stay allowed also when the case changes them, because the reviewer cannot work without them: the agent file and the own skill folder of a reviewer, and the `code-review` and `code-clarity` skills of the self-review agent. A reviewer of such a case reads a later version of a file under review, and the read scope does not show it.

## Probe

The probe proves that each configuration reaches its reviewer. Run it after `agents` and before the first case, and again after a change of the model, the omp version, or the tier settings. `probe` refuses an existing probe folder, so before you probe again, move the old probe folder away or give another `--out`.

1. `node "$skill/scripts/prepare.mjs" probe --out "$bench/probe"` writes the case folder `probe/` with an empty `full.diff` and one run `C1-<config>/run-1/` per configuration. The probe changes no file, so its `full.diff` is empty; `transcripts` reads it for the read scope of the run. Its prompt `full.txt` gives the candidate code agent of the configuration a short task with the path of its run folder, because `transcripts` needs a path of the workspace in each task (see step 3 of the procedure). Its `meta.json` records the configuration. `--configs` and `--project` work as for `case`.
2. Dispatch every probe prompt in one message, as in step 3 of the procedure.
3. Read the transcripts. The task tool writes `<task name>.jsonl` to the session folder: the path of the dispatching session's `.jsonl` file without the extension. For a nested dispatch, omp can write `<session>/<parent>/<parent>.<task name>.jsonl`, so change the paths of the script below to match.

   ```bash
   sessions="<session folder>"
   node "$skill/scripts/score.mjs" names "$bench/probe" | while IFS=$'\t' read -r prompt name; do
     echo "$prompt"
     jq -c 'select(.type == "model_change" or .type == "thinking_level_change" or .type == "service_tier_change")
       | [.type, .model // .thinkingLevel // .serviceTier]' "$sessions/$name.jsonl"
     jq -c 'select(.type == "message" and .message.role == "assistant")
       | [.message.provider, .message.model, .message.serviceTier]' "$sessions/$name.jsonl"
   done
   ```

A run used its configuration when its transcript shows these values. The same check applies to every benchmark run: `score.mjs transcripts` records the values in `meta.json`, and `report` checks them (see step 4 of the procedure).

| Transcript entry | Field | Expected value |
|---|---|---|
| last `model_change` | `model` | the model of the configuration |
| the last `thinking_level_change` before each assistant message | `thinkingLevel` | the effort (the effort of that message). A change before the first assistant message is setup |
| last `service_tier_change` | `serviceTier` | the tier for the provider family of the model (the requested tier), for example `{"openai": "default"}` |
| each assistant message | `provider` and `model` | the model of the configuration |
| each assistant message | `serviceTier` | the tier (the tier that served the response) |

An assistant message from another model (for example after a usage fallback), a message of the configured model at another effort, or a message of the configured model with another served tier shows that the run did not use its configuration. A failed request, an assistant message with `stopReason` `error` and no `serviceTier`, stays out of the model and served-tier checks, because no model served it.

## Review loop

A loop run replays a code-review loop of plan-lifecycle (`plan-contract.md`, Code-review rounds) on one run of a `code` case, with the round policy that the `meta.json` of the run records. Each round is a folder `run-<k>/round-<r>/`. The judge's answers score each round and decide the fix step, but they do not end the loop: the loop ends after a round that leaves no finding open, or after round 5. Plan cases run one round per run.

1. Build the workspace with `case --loop`. With `--loop`, an arm gives the side of the agent and the round policy of the loop. The fix step is the same for every policy.

   | Policy | Arms | Round modes |
   |---|---|---|
   | `panel-delta` | `C3`, `B1` | the rules of plan-lifecycle 0.17.1, the production loop. Round 1 is a `panel` round when the full diff changes 50 or more lines (added plus removed lines), else a `full` round. A later round is a `delta` round when step 6 allows it, else a `panel` or `full` round by the same size rule |
   | `full-delta` | `C1` | the rules of `panel-delta` with one full reviewer: a `full` round where `panel-delta` gives a `panel` round |
   | `full` | `B0` | the policy of plan-lifecycle 0.16.0, which had no panel round and no delta round: every round is a `full` round on the full diff |

   Two arms of one side so run different loops, and one workspace can hold them all, for example `--arms B0,B1,C1,C3`. `case` refuses `S1` and `S3` with `--loop` (see Arms), and `--loop` takes `code` cases only. Each run gets `meta.json` with `policy`, the round policy of its arm, and `round-1/` with the prompts of the round-1 mode. The `meta.json` of `round-1/` holds `config`, `fixerConfig` (the fixer setting, see Workspace), `mode`, and `fullLines`. `loop` takes the round policy from the `meta.json` of the run, not from the arm. It stops when that `meta.json` records no policy or a policy that is not in the table above. The loops of the plan #100 grid in `results.md` ran before the arms had round policies: they used the rules of `panel-delta` under the arm name `C1`, and their runs have no `meta.json` with a policy. To continue such a loop under its own rules, write `{ "policy": "panel-delta" }` to the `meta.json` of its run folder.

   ```bash
   node "$skill/scripts/prepare.mjs" case --case "$skill/cases/dev/<id>.json" --arms C3 --runs 3 --out "$bench/dev" --loop
   ```

2. Dispatch the prompts of the last round folder of each run, as in step 3 of the procedure, and save each block in `blocks/<reviewer>.md` of that round folder. `score.mjs names` prints the task name of each prompt, with the round after the run part, for example `Code7C3LowR1K2Delta`.
3. Score and judge the round: run `score.mjs findings` and `score.mjs pairs`, and dispatch the judge as in step 4 of the procedure. `judgments.json` keeps the answers of the earlier rounds and gets an answer for each new candidate pair and a rating for each new finding without a `match` answer. For a round after round 1, the judge reads the reviewed tree in `<ws>/trees/<run label>/`, because the loop has changed the tree since the case snapshot. When no finding needs an answer, for example after a round without findings, do not dispatch the judge: `loop` and `report` read a missing `judgments.json` as a file without answers.
4. Run `loop` on the run folder:

   ```bash
   node "$skill/scripts/prepare.mjs" loop --run "$bench/dev/<id>/C3-<config>/run-1" --cases "$skill/cases"
   ```

   `loop` reads `findings.json`, `judgments.json`, and the known defects of the case. It works on the last round, round r, and stops before the fix step in these cases:

   - Round r did not complete: a reviewer of the round has no block, a block without a verdict line, or the verdict `blocked`. `loop` names each such reviewer with its reason (`no block`, `no verdict line`, or `blocked`). The production loop dispatches such a reviewer again before it posts the round. Dispatch it again, replace its block, and do step 3 again.
   - The judge did not answer a candidate pair of a finding of round r, or did not rate a finding of round r that has no `match` answer. `loop` names the missing answers, as `report` does. Get them from the judge and run `loop` again.

   Then `loop` plans the fix step for the findings of round r:

   | Finding of round r | Fix step |
   |---|---|
   | matches a known defect | the `fix` patch of the defect, after the patches that its `fix_after` list needs. A needed patch that no finding of the round matched and that no earlier round fixed is pulled in. A defect that an earlier round fixed also gets its patch, because a later repair can bring the defect back. Step 6 drops a patch when the tree of round r still holds the fix, and gives the fix step when a patch does not apply |
   | has no `match` answer and the rating `valid` | a patch from the fixer agent |
   | has no `match` answer and the rating `wrong` or `unknown` | a line in `rejection.md`, with the judge's reason as the evidence |

   When the plan has no fix patch and no valid extra finding, or when r is 5, `loop` prints that the loop ends and writes nothing.
5. When round r has findings for the fixer, the first `loop` call writes `round-<r>/fixer/` and stops with the list of the findings. The findings for the fixer are the valid extra findings and the findings that match a known defect whose fix patch does not apply (step 6). A round has one fixer, as production has one manager who repairs every finding of a round together. `fixer/snapshot/` holds the tree of round r after the fix patches that apply, and `fixer/fixer-1.txt` is the fixer prompt: it lists each finding for the fixer with its id and finding line, and names the snapshot, the plan export, and the patch file `fixer/fixer-1.patch`. Dispatch the prompt one time: the agent is `review-bench-fixer`, and the task name is the one that `names` prints, for example `Code7C1LowR1K1Fixer1`. `names` lists the fixer prompt only until `fixer/fixer-1.patch` exists (an empty patch also counts); `transcripts` still finds the transcript of the fixer after that. The fixer repairs each listed finding that the snapshot still shows. A finding that the snapshot no longer shows, because a fix patch of the round or an earlier repair already repaired it, needs no change. The fixer writes all repairs as one unified diff to `fixer/fixer-1.patch`, or an empty file when no listed finding needs a change, and replies with one line per finding id: `repaired` or `not present`. Then run `loop` again. For tests, you can also give one patch that repairs every finding for the fixer with `--fixer-patch <file>`; then delete the fixer prompt of the round, because `transcripts` expects a transcript for each prompt. Such a round has no transcript facts of a fixer, so `report` makes the run invalid (`round-<r>/fixer-1: no transcript facts`, see step 8): do not use `--fixer-patch` for a run that you measure. A `fixer-2.patch` or higher in `fixer/` comes from the earlier design with one fixer per finding, and `loop` stops with its name: delete the patch files in `fixer/` and run `loop` again.
6. `loop` applies the fix patches in plan order, then the fixer patch, to the tree of round r with `git apply`. An earlier repair can change the lines of a fix patch, so a fix patch that does not apply after the patches before it does not stop `loop`:

   | Fix patch that does not apply | Fix step | Field of `round-<r>/meta.json` |
   |---|---|---|
   | applies in reverse: the tree already holds the fix | none, and later rounds count the defect as fixed | `fixAlreadyApplied` |
   | of a known defect that a finding of round r matches | the fixer repairs each finding of round r that matches the defect (step 5), and later rounds count the defect as fixed | `fixedByFixer` |
   | pulled in: no finding of round r matches its defect | none, and later rounds do not count the defect as fixed | `fixLeftOut` |

   A fix patch that applies in reverse shows that the tree of round r already holds the fix, so the findings that match its defect do not stand. `loop` uses this check also for a defect that an earlier round fixed. When round r has no valid extra finding and each fix patch of a matched defect applies in reverse, no finding of round r stands: `loop` prints that the loop ends and writes nothing.

   A missing fix patch, or a fix patch that git cannot read, stops `loop`. Which fix patches apply depends only on the tree of round r and the fix patches, so each `loop` call on round r sorts the patches into the same rows, also the call after the fixer wrote its patch. An empty fixer patch changes nothing. `loop` compares the tree hashes before and after the fixer patch. When the fixer patch leaves the tree as the fix patches left it, the fixer repaired no finding, and `loop` records `fixerChangedNothing: true`. A pulled-in patch repairs no finding of round r, also when it changes the tree. So when no fix patch that is not pulled in applied and the fixer patch changed nothing, the fix step repaired no finding of round r, for example when the fixer finds each listed finding `not present`. Production rejects a finding that does not reproduce, so the loop ends: `loop` adds `fix`, each field of the table above that has a defect, `fixerChangedNothing`, and `fixRepairedNothing: true` to `round-<r>/meta.json`, prints that the loop ends, and writes no round folder. Else `loop` commits the result as the reviewed head of round r + 1, with the head of round r as parent (for round 1, the case head) and the author and committer `Review loop`. No branch or tag points to these commits, so finish each loop before `git gc` can prune them (two weeks by default). Then `loop` adds `fix` (the fix plan: `fixes`, `extras`, and `rejections`) to `round-<r>/meta.json`, each field of the table above that has a defect, with the ids of its defects, and `fixerChangedNothing` when it applies. Then it writes `round-<r+1>/`:

   | File | Content |
   |---|---|
   | `snapshot/` | the new tree, without this skill folder |
   | `full.diff`, `delta.diff` | the diff from the case base, and the diff from the head of round r; a `panel` round also gets the focus diffs |
   | `previous-review.md` | the blocks of round r in reviewer order |
   | `rejection.md` | only when round r has rejected findings: `Rejected review findings, round <n>`, then each finding with its evidence |
   | `prompts/`, `blocks/` | one prompt per reviewer of the round mode, and an empty folder |
   | `meta.json` | `config`, `mode`, `head`, `repairsOnly`, `fullLines`, and `deltaLines`. The `loop` call after round r + 1 adds `fix`, `fixAlreadyApplied`, `fixedByFixer`, `fixLeftOut`, `fixerChangedNothing`, and `fixRepairedNothing` as for round r |

   The round policy in the `meta.json` of the run picks the mode (see step 1). Under `panel-delta` and `full-delta`, the mode follows `plan-contract.md`: `delta` only when round r completed (each block has the verdict `pass` or `fixes-required`; `loop` refuses every other round, see step 4), no pulled-in patch changed the tree (`repairsOnly`: each change repairs a finding of round r), and the delta diff is at most half the full diff. Otherwise the size rule of round 1 gives `panel` or `full`, and `full-delta` gives `full` in place of `panel`. Under `full`, every round is a `full` round. `loop` also writes the judge's copy of the new tree to `<ws>/trees/<run label>/`, where the run label is the label of the round in `pairs.json`.
7. Do steps 2 to 6 again for round r + 1, until `loop` prints that the loop ends.
8. After the last dispatch of the workspace, run `score.mjs transcripts`, then `score.mjs report`. `transcripts` fills the reviewer entries of each round folder. For the fixer of round r, it writes `fixer` in `round-<r>/meta.json`: `agents` (the time, tokens, and transcript facts of the fixer, under `fixer-1`), `seconds` and `tokens` (the time and tokens of the fixer), and `replies` (each finding id that the reply of the fixer names, with `repaired` or `not present`; no field when the reply names no finding). omp gives the reply of a subagent as the arguments of its `yield` call, so `transcripts` reads each line of each string in the arguments of the last `yield` call, or without such a call, of the text of the last assistant message. `report` checks the transcript facts of each fixer against the fixer setting of the loop (`fixerConfig`), as it checks a reviewer against the configuration (see step 4 of the procedure). A loop whose fixer ran another setting is invalid, and the reason names the round, for example `round-2/fixer-1: effort low, not high`. A round whose fix step gave findings to the fixer (`fix.extras` or `fixedByFixer`) must have the transcript facts of its fixer, because a repair by hand or by another agent changes the later rounds. Without a fixer entry, for example after `--fixer-patch` or when `transcripts` found no transcript of the fixer, the loop is invalid with `round-<r>/fixer-1: no transcript facts`.

For held-out cases, give the key folder with `--keys <dir>` to `case`, `loop`, `pairs`, and `report`. `loop` then reads the key and the fix patches from that folder.

In `## Configurations: <split>`, the table `### Code loops: <split>` gives these rows for the loops of the case group:

| Rows | Content |
|---|---|
| `Model`, `Effort`, `Served tier` | the models, efforts, and served tiers of the reviewer messages of the loops, from the transcripts, as in the decision table |
| `Round <r> seconds median`, `min`, `max`, `Round <r> modes`, `Round <r> known found per run` | the time, the mode counts, and the known defects found of round r, over the loops that reached round r |
| `Rounds median`, `Rounds max` | the rounds of each loop |
| `Loop seconds median` | the sum of the round seconds of each loop; the fix steps stay out |
| `Known found per run`, `Escaped per run` | the known defects that the loop found by its end, and the others |
| `Valid extras per run`, `Extra-only rounds per run` | the valid extra findings, and the rounds that only extra findings caused: rounds whose previous fix step repaired valid extra findings and no known defect. The fixer repaired the valid extras when it got them (step 5), the fixer patch changed the tree (no `fixerChangedNothing`), and the fixer did not reply `not present` for each of them (`fixer.replies`). A known defect that a finding of a round matches counts as repaired when its fix patch applied, or when the fixer got it (step 6), the fixer patch changed the tree, and the fixer did not reply `not present` for each finding of the round that matches the defect. A defect whose fix the tree already held, such as a repeat of a fixed defect or a defect that an earlier fix step pulled in, needs no repair, so it causes no round |
| `Loops with a fixer`, `Fixer seconds median`, `Fixer tokens median` | the loops that have `fixer` in the `meta.json` of a round, and the sum of `fixer.seconds` and the sum of `fixer.tokens` over the rounds of each loop, over these loops only |

## Run the grid for a new model

This section measures a new reviewer model with the same tables as plan #100. The model, the efforts, and the tiers are parameters. The cases, the arms, and the decision rule do not change. Run the commands below in the checkout whose skill version you use; `$project` is only the checkout from which omp dispatches the reviewers. Dispatch every prompt of a workspace from one omp session that runs in `$project`, because `transcripts` reads one session folder. Run only one benchmark at a time per dispatching checkout: `agents` and `clean` remove every `review-bench-*` agent file and tier override of `$project`, and `clean` removes `$project/.omp/` when nothing else is in it.

Before `agents`, run `omp models find <model>` and give `--efforts` only the thinking levels that it lists. omp runs an unsupported level at another level and shows no error; the probe in step 2 shows it (see Configurations). In a linked worktree, `--git-path docks-review` gives a folder of that worktree. That folder is also correct, because the workspace must only be outside the reviewed snapshots and readable by the reviewers.

```bash
repo="$(git rev-parse --show-toplevel)"
skill="$repo/.agents/skills/review-benchmark"
bench="$(git rev-parse --path-format=absolute --git-path docks-review)/bench-<label>"
ref="$(git describe --tags --match 'plan-lifecycle--v*' --abbrev=0 origin/main)"
project="<dispatching checkout>"
node "$skill/scripts/prepare.mjs" agents --baseline-ref "$ref" --model <model> --efforts <list> --tiers <list> \
  --project "$project" --out "$bench/dev"
```

1. `agents` writes to `$project/.omp/agents/` one agent file for each side, role, and configuration, one self-review agent for each configuration, the fixer agent `review-bench-fixer`, and the list of configurations. With `--variants`, it also writes one plan agent for each variant and configuration, and the plugin copy `variant-<name>-plugin/` of each variant next to the baseline copy. It writes the tier of each agent to `task.agentServiceTierOverrides` in `$project/.omp/settings.json` (see Configurations). Dispatch the reviewers from the top-level omp session, or from a subagent that you start after `agents`: in the a6 check of plan #100, a subagent that started before `agents` dispatched reviewers with the parent's tier, not with the override.
2. Probe: run `node "$skill/scripts/prepare.mjs" probe --out "$bench/probe" --project "$project"`, dispatch its prompts, and run `node "$skill/scripts/score.mjs" transcripts "$bench/probe" --omp-sessions <session folder>`. Each line of the command below gives the configuration name, the configuration effort, and the configuration tier, and then, for each reviewer, the efforts of its messages, the requested tier, and the served tiers. The message efforts must hold only the configuration effort. The requested tier must equal the configuration tier, and the served tiers must hold only the configuration tier (see Probe). Do not continue until each line does. When the requested tier is another tier, the dispatching session did not use the override: dispatch the probe again from a session or subagent that started after `agents`. To probe again, for example after a new `agents` call, move `$bench/probe` away first or give another `--out`, because `probe` refuses an existing probe folder.

   ```bash
   jq -c '[.config.name, .config.effort, .config.tier, (.reviewers[] | ([.messages[].effort] | unique), .requestedTier, ([.messages[].servedTier] | unique))]' \
     "$bench/probe"/probe/C1-*/run-1/meta.json
   ```

3. Build the workspace of a split. A `code` case runs as a loop with `C3`, the production loop, a `plan` case with `P1`, a `plan-delta` case with `Pd`, and a `code-delta` case with `Cd`. The current held-out keys are in the repository, so `keys` stays empty; a new held-out set keeps its keys outside the repository (see Cases) and gives their folder with `--keys`.

   ```bash
   split=dev; ws="$bench/$split"; keys=()   # held-out: split=heldout; ws="$bench/heldout"; a new held-out set: keys=(--keys <keys dir>)
   for f in "$skill/cases/$split"/*.json; do
     [[ $f == *.key.json ]] && continue
     case "$(jq -r .kind "$f")" in
       code) arms=(--arms C3 --loop) ;; plan) arms=(--arms P1) ;;
       plan-delta) arms=(--arms Pd) ;; code-delta) arms=(--arms Cd) ;;
     esac
     node "$skill/scripts/prepare.mjs" case --case "$f" "${arms[@]}" --runs 3 --out "$ws" --project "$project" "${keys[@]}"
   done
   ```

4. Do these steps again until `loop` prints that the loop ends for each run under `"$ws"/*/C3-*/`. A split without a `code` case has no loop run: then do steps 4.1 and 4.2 once.
   1. Dispatch each reviewer prompt that `node "$skill/scripts/score.mjs" names "$ws"` lists and that has no block yet, and each fixer prompt that it lists, as in step 3 of the procedure. A fixer prompt never gets a block, so `names` lists a fixer prompt only until its `fixer/fixer-1.patch` exists (an empty patch also counts). Do not dispatch a fixer prompt again while its fixer runs, because `transcripts` takes the latest transcript of a name. Line 1 of each prompt names the agent. The omp task tool can need a non-empty context and adds its own text before each task; this is correct, because the task text stays as written. Run at most 16 agents at a time, and keep the same load for every configuration. Save each block in `blocks/<reviewer>.md` of its round folder. A reviewer that hit provider errors and then returned its block is valid. A reviewer that returned no block needs a new dispatch of the same prompt: save the new block over the file of that reviewer. `score.mjs findings` then drops the judge answers of the findings whose text changed, so the judge answers those findings again.
   2. Run `node "$skill/scripts/score.mjs" findings "$ws"` and `node "$skill/scripts/score.mjs" pairs "$ws" --cases "$skill/cases" "${keys[@]}"`. Then dispatch the judge, a model of another family than the reviewers, as `references/judge.md` and step 4 of the procedure tell. A task-tool judge runs on the model of the dispatching session, so run that session on a model of another family, or dispatch the judge through an agent file that sets such a model. After round 1 of a loop, the judge reads the tree of the round in `<ws>/trees/` (see Review loop). When `pairs.json` holds no finding without an answer (for example after a round with no findings), do not dispatch the judge, and go to the next step. `loop` and `report` read a missing `judgments.json` as no answers.
   3. For each loop run that has not ended, run `node "$skill/scripts/prepare.mjs" loop --run <run dir> --cases "$skill/cases" "${keys[@]}"`. When `loop` writes `round-<r>/fixer/` and stops, dispatch the fixer prompt (`names` lists it until the fixer writes `fixer/fixer-1.patch`) and run `loop` again. When `loop` writes the next round, its prompts are the next prompts to dispatch.
5. After the last dispatch, run `node "$skill/scripts/score.mjs" transcripts "$ws" --omp-sessions <session folder>`. Give the session folder itself: omp can write the transcripts of a nested dispatch to a subfolder (`<session>/<parent>/<parent>.<name>.jsonl`), and `transcripts` searches the session folder and all its subfolders. Give a random 10% of the judge answers to a second judge, which writes `judgments-second.json` (see step 4 of the procedure). Then run `node "$skill/scripts/score.mjs" report "$ws" "${keys[@]}" --configs <name,...>`, with the configuration names in the column order.
6. Do steps 3 to 5 for the dev split, then once for the held-out split. Apply the decision rule of plan #100 in `results.md` (`Decision rule (plan #100, fixed before any run)`) to the table `### Decision: heldout` of the held-out `report.md`.
7. Append a new entry to `results.md` with the setup, the tables, and the decision. A check run that must not change the repository skips this entry. Then remove the generated agents and the tier overrides with `node "$skill/scripts/prepare.mjs" clean --project "$project"`, and delete the workspaces and the `baseline-plugin` and `variant-*-plugin` folders next to them.

## Procedure

1. Pick the arms and the configurations for the decision (see `results.md`), and use the last plan-lifecycle release as the baseline ref. Run every arm at least twice. Put dev cases and held-out cases in separate workspaces, so that the dev `pairs.json` holds no held-out text.
2. Build the agents and the workspaces. Keep workspaces outside the working tree, because each snapshot is a full repository copy. Do not use a path that contains the words benchmark or judge, because the prompts name it and `prepare.mjs` refuses it.

   ```bash
   repo="$(git rev-parse --show-toplevel)"
   skill="$repo/.agents/skills/review-benchmark"
   bench="$(git rev-parse --path-format=absolute --git-path docks-review)/bench-<label>"
   ref="$(git describe --tags --match 'plan-lifecycle--v*' --abbrev=0 origin/main)"
   node "$skill/scripts/prepare.mjs" agents --baseline-ref "$ref" --model openai-codex/gpt-6.1-sol \
     --efforts low,medium,high,xhigh --tiers priority,default --out "$bench/dev"
   node "$skill/scripts/prepare.mjs" probe --out "$bench/probe"
   for c in code-96-r1 code-89; do
     node "$skill/scripts/prepare.mjs" case --case "$skill/cases/dev/$c.json" --arms B0,C1,C3 --runs 2 --out "$bench/dev"
   done
   node "$skill/scripts/score.mjs" names "$bench/dev"
   ```

   Dispatch and check the probe (see Probe) before the cases. `prepare.mjs` stops with a message when a commit is missing (fetch it) or a patch does not apply. For loop runs, add `--loop` to `case` and follow Review loop.

   To compare a candidate that also changes the plan contract, give its variant to `agents --contract-overlay` (see Arms). `agents` removes the agents of its earlier call, so give it every variant that you still run. To add arms to case folders that a workspace already holds, run `case` again with only the new arms and `--extend`. `--extend` keeps each arm folder that exists, so a variant that already ran there needs a new name, for example `ao` for candidate A with its contract change. Before you dispatch the new runs, check that the `meta.json` of each run of the variant records the `contractOverlay` that you expect. After the runs, check in their transcripts that each reviewer read the copy `plan-contract.md` of its run:

   ```bash
   node "$skill/scripts/prepare.mjs" agents --baseline-ref "$ref" --model <model> --efforts <list> --tiers <list> \
     --variants a=<ref of candidate A>,ao=<ref of candidate A> --contract-overlay ao --out "$bench/heldout"
   node "$skill/scripts/prepare.mjs" case --case "$skill/cases/heldout/<id>.json" --arms Vao --runs 5 \
     --out "$bench/heldout" --extend
   jq -r '.contractOverlay' "$bench/heldout"/<id>/Vao-*/run-*/meta.json
   ```
3. Dispatch from an omp session that runs in the `--project` folder of `agents`. One message holds every prompt of one arm folder and run, one subagent per prompt file: the agent is the name on the first line, the task is the text after the empty line, and the task name is the one that `score.mjs names` prints for that file. Do not set the `effort` field of a task: with `task.enableEffort`, it replaces the `thinking-level` of the agent. The task name drops separators and case, so `names` and `transcripts` stop when two prompts get the same name (for example cases `code-7` and `code_7`); rename one case. Alternate the arms and the configurations from message to message. Load changes round time, so keep the same load for every arm. Save each returned block as plain Markdown in `blocks/<reviewer>.md`; `score.mjs` also unwraps JSON-wrapped output from runtimes that return structured text. Fill `meta.json` with `score.mjs transcripts <ws> --omp-sessions <session folder>`. `transcripts` finds the transcript of each prompt by its task name: `<name>.jsonl`, `<parent>.<name>.jsonl` for a nested task, or `<name>-<n>.jsonl` for a repeated name. Two workspaces that one session dispatches can use the same task names, so `transcripts` keeps only the transcripts whose first user message (the task) names a path under the case folder of the prompt in `<ws>`. Each prompt of `prepare.mjs` names such a path. Of these transcripts, `transcripts` takes the latest repeat. When no transcript of a prompt names such a path, `transcripts` gives the task name of the prompt as missing. The prompts hold absolute paths, so `<ws>` must give the same absolute path as the `--out` folder of `prepare.mjs`; a path through a symbolic link does not match. A run with a `config` needs the transcript facts of each reviewer, so write seconds and tokens by hand only for a run without `config`. For another runtime than omp, write the same fields from its transcripts.
4. Score and judge:

   ```bash
   node "$skill/scripts/score.mjs" findings "$bench/dev"
   node "$skill/scripts/score.mjs" pairs "$bench/dev" --cases "$skill/cases"
   node "$skill/scripts/score.mjs" report "$bench/dev"
   ```

   For held-out cases, add `--keys <dir>` to `pairs` and `report` (see Cases). `--configs <name,...>` of `report` sets the columns of the configuration tables and their order; the default is the configuration names in run order. `--arms <folder,...>` compares arm folders in place of configurations; give `--configs` or `--arms`, not both. `--reference <folder>` goes with `--arms` only and names one of its folders: the interval rows compare each column with that folder in place of the best column. For example, `--arms V16-xhigh,V17-xhigh,Va-xhigh --reference V17-xhigh` compares each variant with the current prompt. `--lead <folder,...>` with `--lead-ref <folder>` adds the self-review lead. These options are described below.

   `findings` parses the blocks into `findings.json`. A finding id names the place of the finding (the case, arm, run, round, reviewer, and position in the block), not its text. So before it writes, `findings` compares each finding with the previous `findings.json`. When the text of an id changed (its severity, category, locator, or text) or the id is gone, for example after a reviewer was dispatched again, `findings` removes the answers of that id from `judgments.json` and `judgments-second.json` and prints the ids. Then the judge answers these findings again.

   Between `pairs` and `report`, dispatch one judge agent from another model family than the reviewers. Give it `references/judge.md`, the workspace path, and the cases path (and the keys folder, with `--keys`). The judge reads `pairs.json`, the key files, and the snapshots, and writes `judgments.json` with an answer for every candidate pair in `pairs.json` and a rating for every finding without a `match` answer. `report` stops and names the pairs that have no answer and the findings that have neither a `match` answer nor a rating. When no pair and no finding needs an answer (for example when the reviewers returned no findings), do not dispatch the judge: `loop` and `report` read a missing `judgments.json` as no answers. The judge does not read `findings.json` or the arm folders, because they name the arms.

   Then spot-check the judge. Pick a random 10% of the `matches` and `adjudications` entries of `judgments.json`, and give their pairs and findings, without the answers, to a second judge from another model family than the first judge. It follows the Second judge section of `references/judge.md` and writes `judgments-second.json`. When that file exists, `report` compares each of its answers with the same answer of `judgments.json` and gives the agreement rate under Judge agreement. It stops when the second judge answers a pair or a finding that `judgments.json` does not answer.

   `report.md` has one summary row for each case and arm and one row for each run. The summary gives the mean, median, minimum, and maximum of recall; the mean of valid extras, wrong, unknown, unresolved, and unknown pairs per run; and the median, minimum, and maximum of seconds and tokens. Valid extras, wrong, unknown, and unjudged count the findings that match no known defect, by their adjudication rating. Unknown pairs counts every `unknown` answer of the judge for a pair of a finding of the run and a known defect. Such an answer can hide a missed match, or a valid extra that only repeats a found defect. Unresolved is the subset that can change recall: the known defects that the run did not find, where the judge answered `unknown` for a pair of the defect with a finding of the run. In a dev workspace, read the `unknown` pairs in `judgments.json` before the decision. A run of several rounds adds the seconds and tokens of its rounds, and its recall and finding counts cover every round.

   `report` checks each run that has a `config` against the transcript facts of each reviewer. It also checks the fixer of each round of such a loop against the fixer setting `fixerConfig` in the same way. The run is invalid when an assistant message comes from another model (for example after a usage fallback), when a message of the configured model ran at another effort (the effort that was active at the message; an effort change before the first assistant message is setup), when a message of the configured model shows another served tier (only for a configuration with a tier), when an agent has no transcript facts or no served assistant message, when a loop round gave findings to the fixer (`fix.extras` or `fixedByFixer`) but has no fixer entry (`round-<r>/fixer-1: no transcript facts`, for example after `loop --fixer-patch`), or when a loop has a fixer entry but no `fixerConfig`. A failed request (an assistant message with `stopReason` `error` and no served tier) stays out of the model and served-tier checks, but its time counts in the seconds. The reason of a fixer names its round, for example `round-2/fixer-1: model <model>, not <fixer model>`. Every run, also a run without a `config`, is invalid when a reviewer read outside its inputs (see Read scope); the reason is `<reviewer>: read outside its inputs:` and the first three outside targets. Every run is also invalid when a round has a reviewer block that holds no review: the block is missing, has no verdict line (`unreadable`, for example a JSON object with only an `acknowledgment` field), or has the verdict `blocked`. Such a run does not show the review of its arm, and a loop must not continue after such a round (see step 4 of Review loop). The reason is `round-<r>/<reviewer>: no review (<verdict>)`, or `<reviewer>: no review (<verdict>)` for a run without round folders, with the verdict `missing`, `unreadable`, or `blocked` of `findings.json`. The Runs table keeps invalid runs; `## Invalid runs` names them with their reasons, and the summary, the configuration or arm tables, and the self-review lead leave them out.

   `## Configurations: <split>` gives one section per case group (`dev`, `heldout`), from the valid runs that have a `config`. Each table of a section has one column per configuration. A loop run is a run with `round-<r>` folders (a `code` case built with `case --loop`, see Review loop). Each other run is a single review, for example of a `plan`, `plan-delta`, or `code-delta` case. A section has these tables, and it leaves out a table that has no runs:

   - `### Decision: <split>` covers all runs of the case group, loops and single reviews together. It gives the runs, the known defects found and escaped per run, the escaped defects per 50 known defects, and the model, effort, and served tier from the transcripts. The last three rows give the 90% paired bootstrap interval of the difference from the reference column, over the cases that both columns ran, for round 1 recall, escaped defects per 50 known defects, and loop seconds. The loop seconds row compares loop runs only. The reference column is the best configuration of the decision rule: the column with the fewest escaped defects per 50 known defects (the first on a tie). The bootstrap draws 10,000 resamples of the cases with a fixed seed, so a rerun gives the same intervals.
   - `### Code loops: <split>` covers the loop runs. It gives the runs; the model, effort, and served tier from the transcripts, as the decision table; for each round index, the median, minimum, and maximum round seconds, the mode counts, and the known defects found per loop that reached the round; the rounds per loop; the loop seconds (the sum of the round seconds); the known defects found and escaped, the valid extra findings, the extra-only rounds, and the wrong, unjudged, and unknown answers per run; the tokens and side-call tokens; the loops with a fixer and their fixer seconds and fixer tokens; and the known defects found per loop minute.
   - `### Single reviews: <split>` covers the other runs. It gives the runs, the model, effort, and served tier from the transcripts, the median, minimum, and maximum seconds, the known defects found and escaped, the valid extra findings, and the wrong, unjudged, and unknown answers per run, and the tokens.

   `--arms <folder,...>` compares arm folders at one configuration or more, for example `--arms C1-xhigh-fast,B0-xhigh-fast` or `--arms C1-xhigh-fast,C3-xhigh-fast,S1-xhigh-fast,S3-xhigh-fast`. `report` then writes one `## Arms: <split>` section per case group in place of `## Configurations: <split>`. The sections have the same tables from the valid runs of these arm folders, with one column per arm folder in the order of the list. The reference column of the intervals is the folder that `--reference` names, else the best column of the case group, as in the configuration tables; the report text names the reference that it used. The arm folders can hold different cases, for example when an arm ran only part of the cases. So the decision table also gives `Cases`, the cases of each column, and `Cases shared with <reference>`, the cases that the column and the reference column both ran. The interval rows pair only these shared cases.

   `--lead <folder,...> --lead-ref <folder>` adds `## Self-review lead`, which measures the self-review arms (`S1` and `S3`, see Arms) against a reviewer arm, for example `--lead S1-xhigh-fast,S3-xhigh-fast --lead-ref C3-xhigh-fast`. Give the two options together. The reference can be a loop arm folder, such as `C3-xhigh-fast` built with `case --loop` (the production code-review loop), or a single-round arm folder, such as `C1-xhigh-fast` built without `--loop`. The section has one table `### Self-review lead: <split>` per case group, from the valid runs. The table has one column per lead folder, then a column for the reference folder. Each run counts with its round 1 only: a single-round run is one round, and a loop counts only its first round. These are the rows:

   | Row | Content |
   |---|---|
   | `Runs`, `Cases` | the valid runs and their cases |
   | `Round 1 seconds median`, `min`, `max` | the round 1 seconds of the runs. A round takes the time of its slowest reviewer, so a run of a split arm such as `S3` takes the time of its slowest reviewer |
   | `Known found in a run` | the known defects that round 1 of at least one run found, as `<case>: <ids>` |
   | `Known found that no <reference> run found` | for each case that the reference ran, the known defects that the column found and round 1 of no reference run found: the defects that only this column found. The reference column gets `-` |
   | `Cases without a <reference> run` | the cases of the column that the reference did not run. The row above leaves out these cases |
5. Apply the decision rule in `results.md` to `report.md`. For a losing candidate, read the transcripts of its misses before the next dev iteration.
6. After the dev iterations, prepare and run the held-out cases once in their own workspace, under the constraint above.
7. Append the result tables, the commit, the baseline ref, the configurations, and the decision to `results.md`.
8. Turn each defect that escaped review into a new case (see Cases).
9. Remove the agent files (also the fixer agent), the list of configurations, and the tier overrides with `node "$skill/scripts/prepare.mjs" clean` (with the same `--project` as `agents`). Then delete the workspaces and the `baseline-plugin` and `variant-*-plugin` folders next to them.
