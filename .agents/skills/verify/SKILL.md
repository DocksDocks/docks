---
name: verify
description: "Use when checking a change to this docks repository end to end: install both plugins from this checkout into an isolated omp state, drive the plan helper against the fake gh, drive the docks omp extensions in scripted omp sessions, run the plan-lifecycle self-test, and run the agent-first-setup and multi-tool-bridge check scripts. Not for the full CI gate (run bun scripts/ci.mjs), reviewer benchmarks (use review-benchmark), or plugin release."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-11-19"
---

# Verify docks

This skill runs the surfaces of this repository the way a user or a host program does. omp installs and loads the plugins. A user drives the plan helper. omp calls the docks extensions (`verify-gate` and `context-tree-nudge`) on its tool events. Run the commands from the repository root. Each one finishes in seconds. V1 and V3 each start one local fake model server and stop it before they exit.

This skill does not replace the gate. The gate choice is in the root `AGENTS.md` (Tool-agnostic rules).

<constraint>
Report a check as passed only when you ran its command in this session and saw the expected result. A unit-test run does not replace V1 to V6.
</constraint>

<constraint>
Run V3 only through `omp-smoke.mjs hooks`. It gives omp a `XDG_STATE_HOME` in its scratch folder, so the extensions do not write test lines into the user log at `~/.local/state/docks/verify-gate.jsonl`.
</constraint>

<constraint>
Do not create a commit in this repository, push, or call the real `gh` to verify a change. The commands here drive each surface with sample input only. V3 makes commits only in its scratch git repository.
</constraint>

```text
BAD  — "The extensions work": the agent read the extension source and ran the unit tests.
GOOD — The agent ran V3, and its output matched the expected results of V3 and V4.

BAD  — V1 printed a warning count above 0, and the agent reports V1 as passed.
GOOD — The agent reads every line and the exit code. A `FAIL` line or a
       non-zero exit is a failure; a warning count above 0 prints a `FAIL`
       line, and the agent reports each warning.
```

## Prerequisites

| Need | Check command | Expected result |
|---|---|---|
| omp CLI | `omp --version` | A line that starts with `omp/` |
| Node and Bun | `node --version && bun --version` | Two version lines |
| docks-kit CLI (V1 and V3 scratch folders) | `docks-kit --version` | One version line |
| Dependencies | `bun install --frozen-lockfile` | Exit 0 |

## V1 — Install the plugins into an isolated omp state

`omp-smoke.mjs` creates a docks-kit scratch folder and points `PI_CONFIG_DIR` at it, so omp keeps all its state there and the real `~/.omp` stays unchanged. omp gets only `PATH`, `HOME`, `USER`, `LANG`, `LC_*`, `TERM`, and `TMPDIR` from the environment, so no credential reaches it, plus `PI_CONFIG_DIR` and a `XDG_STATE_HOME` in the scratch folder. It starts a fake local model. It adds this checkout as the `docks` marketplace, and installs `docks@docks` and `plan-lifecycle@docks`. It then lists the plugins, the skills, and the task agents of one `omp -p` session. At the end it removes the scratch folder, also after a failure.

```bash
bun .agents/skills/verify/scripts/omp-smoke.mjs; echo "exit=$?"
```

Expected, in order: `docks@docks <version>` and `plan-lifecycle@docks <version>`, where each version equals its entry in `.omp-plugin/marketplace.json`; then `skills: 33`, `agents: code-reviewer,plan-reviewer`, `warnings: 0`, and `exit=0`. A `FAIL <reason>` line and `exit=1` mean that the install or the discovery failed, or that omp reported a warning about the plugins. A `Failed to load extension` record of omp for a plugin file counts as a warning, and the `FAIL` line names the file and the error. `FAIL real state changed: <file>` means that the run changed a real omp registry file, or added a line with a `cwd` inside the scratch folder to the real `verify-gate.jsonl`. `FAIL could not remove scratch folder <path>` and `exit=1` mean that the folder stays; remove it with `docks-kit scratch remove <path>`.

## V2 — Drive the plan helper against the fake `gh`

The shipped plan helper runs under Node against a fake `gh` that keeps issues in a temporary folder. No network call occurs.

```bash
node scripts/tests/plan-cli.mjs; echo "exit=$?"
```

Expected: the `node --test` summary shows `ℹ fail 0`, and the last line is `exit=0`.

## V3 — Drive the docks extensions in omp sessions

`omp-smoke.mjs hooks` installs both plugins as V1 does. It then makes a scratch git repository with its own git config. The repository holds a root `AGENTS.md`, a root `README.md`, `notes.txt`, and the nested node `scripts/AGENTS.md` with `scripts/ci.mjs`. The fake model plays scripted tool calls, one call for each turn, in `omp -p --mode json` sessions, and the script reads the JSON event stream, `git log`, and the `verify-gate.jsonl` log of each session. Each session has its own `XDG_STATE_HOME` in the scratch folder. V4 reads the gate lines of the same run.

```bash
bun .agents/skills/verify/scripts/omp-smoke.mjs hooks; echo "exit=$?"
```

Expected, in order, one line for each check:

```text
ok install
ok gate-enforce-1-blocked
ok gate-enforce-2-blocked
ok gate-enforce-3-allowed
ok gate-enforce-trailer-allowed
ok gate-observe-commit-runs
ok gate-observe-log
ok gate-off-commit-runs
ok gate-off-no-log
ok gate-log-no-text
ok nudge-node-edit
ok nudge-root-edit-none
ok nudge-failed-edit-none
ok nudge-url-write-none
ok extensions-loaded
ok sessions
ok real-state
exit=0
```

The `context-tree-nudge` session reads `scripts/ci.mjs` and `README.md`, and edits each of them with the `edit` tool. Its session folder is inside the `scripts` node, so the `local://` write of the last row resolves to a file inside the node.

| Line | Tool call | Expected result |
|---|---|---|
| `nudge-node-edit` | `edit` of `scripts/ci.mjs` | The edit succeeds. After the tool result, the event stream holds a separate added-context message (role `developer`) with `Edited files inside context-tree node(s): scripts`. The tool result itself does not hold that text. |
| `nudge-root-edit-none` | `edit` of the root `README.md` | The edit succeeds. No added-context message follows. |
| `nudge-failed-edit-none` | `edit` of `scripts/ci.mjs` with the stale snapshot tag of the first read | The edit fails. No added-context message follows. |
| `nudge-url-write-none` | `write` to `local://notes.md` | The write succeeds. No added-context message follows. |
| `extensions-loaded` | All sessions | omp reported no warning about the plugins, and no `Failed to load extension` record. |
| `real-state` | The whole run | The real omp registry files kept their modification times. The real `verify-gate.jsonl` has no new line with a `cwd` inside the scratch folder. Lines that other omp sessions add during the run do not count. |

A `FAIL <name>: <reason>` line and `exit=1` mean that the check failed; the reason tells what the run saw. `install` and `sessions` fail when an omp command exits with a status other than 0.

## V4 — Read the `verify-gate` lines of the V3 run

The gate runs before each call of the `bash` tool. It looks for a `Verified:` git trailer in the message of each `git commit`. The `DOCKS_VERIFY_GATE` value is in the environment of the omp process. Before each bare commit the script stages a change of `notes.txt`.

| Line | Session and tool calls | Expected result |
|---|---|---|
| `gate-enforce-1-blocked`, `gate-enforce-2-blocked` | `enforce`: `bash` `git commit -m 'docs: fix typo'`, two times | Each call is blocked. Its tool result is an error with the reason that names the `Verified:` trailer. |
| `gate-enforce-3-allowed` | `enforce`, same session: the same commit a third time | The gate allows the commit after two denials in one session. `git log` holds one new `docs: fix typo` commit. |
| `gate-enforce-trailer-allowed` | `enforce`, same session: `git commit --allow-empty -m 'x' -m 'Verified: none - probe'` | The commit runs, and the last commit holds the trailer. |
| `gate-observe-commit-runs`, `gate-observe-log` | `observe` (`DOCKS_VERIFY_GATE` unset): one bare commit | The commit runs. The log holds one line with only the fields `time`, `session_id`, `cwd`, `mode` (`observe`), and `message_sources` (`["-m"]`). |
| `gate-off-commit-runs`, `gate-off-no-log` | `off`: one bare commit | The commit runs. The log holds no line. |
| `gate-log-no-text` | The logs of all gate sessions | No line holds the command or the message text (`git commit`, `fix typo`, `Verified`, `probe`). |

## V5 — Run the plan-lifecycle self-test

```bash
bun plugins/plan-lifecycle/test/selftest.mjs; echo "exit=$?"
```

Expected: `plan-lifecycle self-test PASSED: manifest/catalog agreement (<version>), ...`, then `exit=0`.

## V6 — Run the agent-first-setup and multi-tool-bridge check scripts

The skills run these read-only scripts with `node`. The block runs them in this repository and in a new fixture repository that holds only a `CLAUDE.md`.

```bash
root=$PWD
afs=$root/plugins/docks/skills/agent-first-setup/scripts/agent-first-check.mjs
mtb=$root/plugins/docks/skills/multi-tool-bridge/scripts/bridge-check.mjs
node "$afs" detect | grep -E '^(root AGENTS.md|pull-request template|verify)'; echo "exit=${PIPESTATUS[0]}"
node "$afs" check | grep -E '^(FAIL|ERROR)'; echo "exit=${PIPESTATUS[0]}"
node "$mtb" verify; echo "exit=$?"
fixture=$(mktemp -d)
git -C "$fixture" init -q
printf '# Rules\n' > "$fixture/CLAUDE.md"
(cd "$fixture" && node "$afs" detect | tail -n +2; echo "exit=${PIPESTATUS[0]}")
(cd "$fixture" && node "$afs" check; echo "exit=$?")
(cd "$fixture" && node "$mtb" verify; echo "exit=${PIPESTATUS[0]}")
rm -r "$fixture"
```

Expected, in order:

| Call | Expected result |
|---|---|
| `detect` here | `root AGENTS.md: present`, `pull-request template: .github/pull_request_template.md (file)`, `verify skill: present`, `verify link: present`, then `exit=0` |
| `check` here | No `FAIL` or `ERROR` line, then `exit=0` |
| `verify` here | No output, then `exit=0` |
| `detect` in the fixture | `root AGENTS.md: missing`, `.agents/skills: missing`, `.claude/skills: missing`, `legacy: CLAUDE.md`, `pull-request template: none`, `verify skill: missing`, `verify link: missing`, then `exit=0` |
| `check` in the fixture | `FAIL C1 root AGENTS.md missing`, `FAIL C3 CLAUDE.md without an @AGENTS.md import makes Claude read it instead of AGENTS.md: CLAUDE.md`, `FINDING C9 no .agents/skills/verify/SKILL.md (add it in Step 2b, or accept: the repo has no runnable surface)`, `FINDING C10 no usable pull-request template (add it in Step 2c, or accept: the repository wants none)`, then `exit=0` |
| `verify` in the fixture | `BROKEN: AGENTS.md missing`, `BROKEN: legacy CLAUDE.md still present: CLAUDE.md`, then `exit=0` |

## Failure signs

| Sign | Meaning | Next step |
|---|---|---|
| `Validation passed with warnings` and exit 1 under `--strict` | A manifest, skill, or agent file has a warning | Read the warning and fix the named file |
| `ℹ fail` above `0` in V2 | A plan-helper case broke | Run the failing case file under `node --test` alone |
| V3 prints `FAIL extensions-loaded` or V1 prints `warnings:` above `0` with `Failed to load extension` | An extension throws when omp loads it | Fix the file that the `FAIL` line names in `plugins/docks/extensions/` |
| V3 prints a `FAIL gate-` line | The gate blocked, allowed, or logged a commit by mistake | Check `checkCommand` in `plugins/docks/extensions/verify-gate-core.mjs` and the adapter `verify-gate.ts`; run `bun test scripts/tests/unit/verify-gate.test.mjs` |
| V3 prints a `FAIL nudge-` line | The nudge took the wrong edited paths or the wrong node | Check `nudgeText` in `plugins/docks/extensions/context-tree-core.mjs` and `editedPaths` in `context-tree-nudge.ts`; run `bun test scripts/tests/unit/context-tree-nudge.test.mjs` |
