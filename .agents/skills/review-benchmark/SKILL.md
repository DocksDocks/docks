---
name: review-benchmark
description: "Use when measuring a change to the plan-lifecycle reviewers in this repository (code-reviewer or plan-reviewer prompts, skills, lenses, or delta rounds) or to their model, effort, or service tier: replays recorded and seeded review cases through baseline and candidate arms at each configuration, scores recall, wrong findings, time, and tokens with a blind judge, and records the keep-or-drop decision. Not for reviewing a plan or a diff (use plan-manager), skill trigger checks (use write-skill), or CI gates."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-10-23"
---

# Review benchmark

This skill measures a reviewer change before it ships. It replays frozen review cases through the released reviewer (the baseline) and the working-tree reviewer (the candidate), at each configuration of model, effort, and service tier. A judge from another model family matches the findings with the known defects. `results.md` holds the decision rule and the results of every run.

| Path (in this skill folder) | Content |
|---|---|
| `scripts/prepare.mjs` | Builds the agent files of the configurations, one workspace per case, and the probe |
| `scripts/score.mjs` | Parses the returned blocks, builds judge pairs, and writes the report |
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
| `known` | dev only | Known defects: `id`, `title`, `locator`, and `severity` (code) or `kind` (plan) |

A held-out case file has no `known` field. Only the judge reads `<id>.key.json`. While reviewers run, keep the held-out keys outside the repository, because a reviewer can search the checkout: for example in `$XDG_STATE_HOME/docks/review-bench/keys/` with mode 0700. Give that folder to `score.mjs pairs` and `score.mjs report` with `--keys <dir>`. `pairs` then reads `<dir>/<id>.key.json` for each case without `known`, and never the key file next to the case file. `report` stops when a key in that folder has other known-defect ids than `pairs.json`; run `pairs` again.

To add a case, commit its inputs and add the case file. Turn each defect that escaped a real review into a new dev case: use the base, head, and plan of the round that missed it, and give the defect one `known` entry. A held-out case is built by an agent that does not change reviewer prompts, and that agent reports only paths and counts.

## Configurations

A configuration is a model, an effort, and a service tier. `prepare.mjs agents` writes every model at every effort with every tier. The grid of plan #100 is `openai-codex/gpt-6.1-sol` at `low`, `medium`, `high`, and `xhigh`, each with the tiers `priority` and `default`: eight configurations.

| Option of `agents` | Values | Part of the configuration name |
|---|---|---|
| `--model <m>[,<m>...]` | model selectors without an effort suffix | with two or more models, the model slug (the last path segment, in lower case) and a hyphen come first |
| `--efforts <list>` | omp thinking levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` | the effort |
| `--tiers <list>` | omp OpenAI service tiers: `none`, `auto`, `default`, `flex`, `scale`, `priority`, `ultrafast` | nothing for `default`, `-fast` for `priority`, `-<tier>` for the other tiers |

For example, `--efforts low,xhigh --tiers priority,default` gives `low-fast`, `low`, `xhigh-fast`, and `xhigh`. With a second model, the names become `gpt-6.1-sol-low-fast` and so on. The same lists always give the same names, because the report uses them as column names.

`agents` applies each configuration through omp agent files, so each reviewer runs as a task subagent, as in production:

- `.omp/agents/review-bench-<side>-<role>-<config>.md`: one agent for each side (`baseline`, `candidate`), role (`code`, `plan`), and configuration. The frontmatter pins `model` and `thinking-level`.
- `.omp/settings.json`: one entry `task.agentServiceTierOverrides.<agent>` for each agent, with the tier of its configuration. omp merges `.omp/config.yml` over this file. The script keeps every other setting in the file and does not change the user's global config.
- `.omp/agents/review-bench-configs.json`: the list of configurations, which `case` and `probe` read.

omp reads project agents and project settings from the working folder of the session. Write them where the dispatching omp session runs: by default the repository root of `prepare.mjs`, or the folder that `--project <dir>` names (for example the main checkout, when the script comes from a worktree). Give `case`, `probe`, and `clean` the same `--project`.

`agents` removes the output of an earlier `agents` call before it writes. `clean` removes every `review-bench-*` file of `.omp/agents/` and `.claude/agents/`, every `review-bench-*` entry of `task.agentServiceTierOverrides`, `.omp/settings.json` when no other setting stays in it, and each folder that it empties.

`--runtime claude` writes the agents to `.claude/agents/` with the Claude Code `effort` key (`low`, `medium`, `high`, `xhigh`, or `max`). Claude Code loads them in a new session or after `/agents`. Claude Code sets no service tier per agent, so this runtime takes no `--tiers`, and each configuration records the tier `null`. The `CLAUDE_CODE_EFFORT_LEVEL` variable overrides the `effort` key, so keep it unset.

## Arms

| Arm | Case kinds | Agent | Reviewers |
|---|---|---|---|
| `B0` | code, code-delta | `review-bench-baseline-code-<config>` | `full` (on code-delta: today's full re-review) |
| `B1` | code | `review-bench-baseline-code-<config>` | the three lenses, described in the prompt |
| `C1` | code | `review-bench-candidate-code-<config>` | `full` |
| `C3` | code | `review-bench-candidate-code-<config>` | `correctness`, `spec-and-tests`, `text-and-safety` |
| `Cd` | code-delta | `review-bench-candidate-code-<config>` | `delta` |
| `P0` | plan, plan-delta | `review-bench-baseline-plan-<config>` | `plan`, full round |
| `P1` | plan | `review-bench-candidate-plan-<config>` | `plan`, full round |
| `Pd` | plan-delta | `review-bench-candidate-plan-<config>` | `plan`, delta mode |

The baseline agents are the released `code-reviewer.md` and `plan-reviewer.md` of `plugins/plan-lifecycle/agents/`; the candidate agents are the working-tree copies. In each configuration, both sides get the same model, effort, and tier, so only the instructions differ.

`case` prepares each arm once per configuration, in the arm folder `<arm>-<config>`. `--configs <name,...>` selects the configurations; the default is every configuration that `agents` wrote. One workspace can so hold every configuration of an arm. `score.mjs` reports each arm folder as one arm.

## Workspace

```text
<ws>/<case-id>/
  case.json  snapshot/  plan.md
  full.diff  focus-correctness.diff  focus-spec-and-tests.diff  focus-text-and-safety.diff
  delta.diff  previous-review.md  rejection.md      (code-delta)
  plan.diff   previous-review.md  rejection.md      (plan-delta)
  <arm>-<config>/run-<k>/prompts/<reviewer>.txt     line 1: agent: <name>, line 2 empty, then the prompt
  <arm>-<config>/run-<k>/blocks/<reviewer>.md       the returned review block
  <arm>-<config>/run-<k>/meta.json                  {"config": {...}, "reviewers": {"<reviewer>": {...}}}
  <arm>-<config>/run-<k>/round-<r>/                 one review round of a loop: prompts/, blocks/, meta.json
<ws>/findings.json  <ws>/pairs.json  <ws>/judgments.json  <ws>/judgments-second.json  <ws>/report.md
```

`case` writes `config` to each `meta.json`: the `name`, `model`, `effort`, and `tier` of the run's configuration. `score.mjs transcripts` adds one entry per reviewer under `reviewers` and keeps every other field:

| Field | Value |
|---|---|
| `seconds`, `tokens` | the time from the first user message to the last assistant message of `config.model`, and the tokens of the messages of `config.model`; without `config`, of every assistant message |
| `effort`, `requestedTier` | the last requested effort (`thinking_level_change`) and the last requested OpenAI tier (`service_tier_change`) |
| `messages` | the `model` and `servedTier` of each assistant message, in transcript order |
| `sideCalls` | the `model`, `purpose`, and `tokens` of each `model_usage` record, for example a title call of a helper model; their tokens stay out of `tokens` |

A run of several review rounds keeps each round in a `round-<r>` folder, from `round-1` without a gap, with its own `prompts/`, `blocks/`, and `meta.json`. A round `meta.json` can add `mode` (the round mode) and `fixer.seconds` (the time of the fix step after the round). `report` reads `config` from the run's `meta.json`, else from its `round-1/meta.json`. A run without round folders is round 1, and its finding ids and scores do not change. `names` and `transcripts` stop on a workspace with round folders, because the rounds of a run have no dispatch names of their own.

The snapshot is the reviewed tree without Git history. This skill folder holds the held-out answer keys, so the snapshot, every diff, and the changed-path list of the focus diffs leave it out. Focus diffs split the changed paths by class:

| Path class | Rule | Focus diffs |
|---|---|---|
| Test | a `test`, `tests`, `spec`, `__tests__`, or `fixtures` folder, or `.test.` or `.spec.` in the name | spec-and-tests |
| Prose | ends in `.md`, `.txt`, or `.rst` | text-and-safety |
| Registry or config | ends in `.json`, `.yml`, `.yaml`, or `.toml` | correctness, spec-and-tests |
| Production | every other path | correctness |

A path can be in more than one class. When no changed path is in a lens's scope, its focus diff is a copy of `full.diff`.

## Probe

The probe proves that each configuration reaches its reviewer. Run it after `agents` and before the first case, and again after a change of the model, the omp version, or the tier settings.

1. `node "$skill/scripts/prepare.mjs" probe --out "$bench/probe"` writes the case folder `probe/` with one run `C1-<config>/run-1/` per configuration. Its prompt `full.txt` gives the candidate code agent of the configuration a one-line task, and its `meta.json` records the configuration. `--configs` and `--project` work as for `case`.
2. Dispatch every probe prompt in one message, as in step 3 of the procedure.
3. Read the transcripts. The task tool writes `<task name>.jsonl` to the session folder: the path of the dispatching session's `.jsonl` file without the extension.

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
| last `thinking_level_change` | `thinkingLevel` | the effort (the requested effort) |
| last `service_tier_change` | `serviceTier` | the tier for the provider family of the model (the requested tier), for example `{"openai": "default"}` |
| each assistant message | `provider` and `model` | the model of the configuration |
| each assistant message | `serviceTier` | the tier (the tier that served the response) |

An assistant message from another model (for example after a usage fallback) or with another served tier shows that the run did not use its configuration.

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
   for c in code-96 code-89; do
     node "$skill/scripts/prepare.mjs" case --case "$skill/cases/dev/$c.json" --arms B0,C1,C3 --runs 2 --out "$bench/dev"
   done
   node "$skill/scripts/score.mjs" names "$bench/dev"
   ```

   Dispatch and check the probe (see Probe) before the cases. `prepare.mjs` stops with a message when a commit is missing (fetch it) or a patch does not apply.
3. Dispatch from an omp session that runs in the `--project` folder of `agents`. One message holds every prompt of one arm folder and run, one subagent per prompt file: the agent is the name on the first line, the task is the text after the empty line, and the task name is the one that `score.mjs names` prints for that file. Do not set the `effort` field of a task: with `task.enableEffort`, it replaces the `thinking-level` of the agent. The task name drops separators and case, so `names` and `transcripts` stop when two prompts get the same name (for example cases `code-7` and `code_7`); rename one case. Alternate the arms and the configurations from message to message. Load changes round time, so keep the same load for every arm. Save each returned block as plain Markdown in `blocks/<reviewer>.md`; `score.mjs` also unwraps JSON-wrapped output from runtimes that return structured text. Fill `meta.json` with `score.mjs transcripts <ws> --omp-sessions <session folder>`. A run with a `config` needs the transcript facts of each reviewer, so write seconds and tokens by hand only for a run without `config`. For another runtime than omp, write the same fields from its transcripts.
4. Score and judge:

   ```bash
   node "$skill/scripts/score.mjs" findings "$bench/dev"
   node "$skill/scripts/score.mjs" pairs "$bench/dev" --cases "$skill/cases"
   node "$skill/scripts/score.mjs" report "$bench/dev"
   ```

   For held-out cases, add `--keys <dir>` to `pairs` and `report` (see Cases). `--configs <name,...>` of `report` sets the columns of the configuration tables and their order; the default is the configuration names in run order.

   Between `pairs` and `report`, dispatch one judge agent from another model family than the reviewers. Give it `references/judge.md`, the workspace path, and the cases path (and the keys folder, with `--keys`). The judge reads `pairs.json`, the key files, and the snapshots, and writes `judgments.json` with an answer for every candidate pair in `pairs.json` and a rating for every finding without a `match` answer. `report` stops and names the pairs that have no answer and the findings that have neither a `match` answer nor a rating. The judge does not read `findings.json` or the arm folders, because they name the arms.

   Then spot-check the judge. Pick a random 10% of the `matches` and `adjudications` entries of `judgments.json`, and give their pairs and findings, without the answers, to a second judge from another model family than the first judge. It follows the Second judge section of `references/judge.md` and writes `judgments-second.json`. When that file exists, `report` compares each of its answers with the same answer of `judgments.json` and gives the agreement rate under Judge agreement. It stops when the second judge answers a pair or a finding that `judgments.json` does not answer.

   `report.md` has one summary row for each case and arm and one row for each run. The summary gives the mean, median, minimum, and maximum of recall; the mean of valid extras, wrong, unknown, unresolved, and unknown pairs per run; and the median, minimum, and maximum of seconds and tokens. Valid extras, wrong, unknown, and unjudged count the findings that match no known defect, by their adjudication rating. Unknown pairs counts every `unknown` answer of the judge for a pair of a finding of the run and a known defect. Such an answer can hide a missed match, or a valid extra that only repeats a found defect. Unresolved is the subset that can change recall: the known defects that the run did not find, where the judge answered `unknown` for a pair of the defect with a finding of the run. In a dev workspace, read the `unknown` pairs in `judgments.json` before the decision. A run of several rounds adds the seconds and tokens of its rounds, and its recall and finding counts cover every round.

   `report` checks each run that has a `config` against the transcript facts of each reviewer. The run is invalid when an assistant message comes from another model (for example after a usage fallback), when the requested effort is another one, when a message of the configured model shows another served tier (only for a configuration with a tier), or when a reviewer has no transcript facts. The Runs table keeps invalid runs; `## Invalid runs` names them with their reasons, and the summary and the configuration tables leave them out.

   `## Configurations: <split>` gives one table per case group (`dev`, `heldout`) with one column per configuration, from the valid runs that have a `config`. Each round index gets the median, minimum, and maximum round seconds, the mode counts, and the known defects found per run that reached the round. Then come the rounds per run, the loop seconds (the sum of the round seconds), the known defects found and escaped per run, the valid extra and wrong findings per run, the extra-only rounds (rounds whose previous round found no known defect and had a valid extra), the unjudged and unknown answers, tokens, side-call tokens, fixer seconds, the model, effort, and served tier from the transcripts, and the known defects found per loop minute. The last three rows give the 90% paired bootstrap interval of the difference from the reference column, over the cases that both columns ran, for round 1 recall, escaped defects per 50 known defects, and loop seconds. The reference column has the fewest escaped defects per run (the first on a tie). The bootstrap draws 10,000 resamples of the cases with a fixed seed, so a rerun gives the same intervals.
5. Apply the decision rule in `results.md` to `report.md`. For a losing candidate, read the transcripts of its misses before the next dev iteration.
6. After the dev iterations, prepare and run the held-out cases once in their own workspace, under the constraint above.
7. Append the result tables, the commit, the baseline ref, the configurations, and the decision to `results.md`.
8. Turn each defect that escaped review into a new case (see Cases).
9. Remove the agent files, the list of configurations, and the tier overrides with `node "$skill/scripts/prepare.mjs" clean` (with the same `--project` as `agents`). Then delete the workspaces and the `baseline-plugin` folder next to them.
