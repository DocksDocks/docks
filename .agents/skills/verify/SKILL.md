---
name: verify
description: "Use when checking a change to this docks repository end to end: install both plugins from this checkout into an isolated omp state, drive the plan helper against the fake gh, run each docks hook with sample stdin, run the plan-lifecycle self-test, and run the agent-first-setup and multi-tool-bridge check scripts. Not for the full CI gate (run bun scripts/ci.mjs), reviewer benchmarks (use review-benchmark), or plugin release."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-11-19"
---

# Verify docks

This skill runs the surfaces of this repository the way a user or a host program does. omp installs and loads the plugins. A user drives the plan helper. The hooks get JSON on stdin; child plan #173 moves them to omp extensions. Run the commands from the repository root. Each one finishes in seconds. V1 starts one local fake model server and stops it before it exits.

This skill does not replace the gate. The gate choice is in the root `AGENTS.md` (Tool-agnostic rules).

<constraint>
Report a check as passed only when you ran its command in this session and saw the expected result. A unit-test run does not replace V1 to V6.
</constraint>

<constraint>
Run V4 with a temporary `XDG_STATE_HOME`, as the block shows. Do not write test lines into the user log at `~/.local/state/docks/verify-gate.jsonl`.
</constraint>

<constraint>
Do not create a commit, push, or call the real `gh` to verify a change. The commands here drive each surface with sample input only.
</constraint>

```text
BAD  — "The hooks work": the agent read the hook source and ran the unit tests.
GOOD — The agent ran V3 and V4, and the output matched each expected result.

BAD  — V1 printed a warning count above 0, and the agent reports V1 as passed.
GOOD — The agent reads every line and the exit code. A `FAIL` line or a
       non-zero exit is a failure; a warning count above 0 is reported.
```

## Prerequisites

| Need | Check command | Expected result |
|---|---|---|
| omp CLI | `omp --version` | A line that starts with `omp/` |
| Node and Bun | `node --version && bun --version` | Two version lines |
| Dependencies | `bun install --frozen-lockfile` | Exit 0 |

## V1 — Install the plugins into an isolated omp state

`omp-smoke.mjs` creates a docks-kit scratch folder and points `PI_CONFIG_DIR` at it, so omp keeps all its state there and the real `~/.omp` stays unchanged. It starts a fake local model. It adds this checkout as the `docks` marketplace, and installs `docks@docks` and `plan-lifecycle@docks`. It then lists the plugins, the skills, and the task agents of one `omp -p` session. At the end it removes the scratch folder, also after a failure.

```bash
bun .agents/skills/verify/scripts/omp-smoke.mjs; echo "exit=$?"
```

Expected, in order: `docks@docks <version>` and `plan-lifecycle@docks <version>`, where each version equals its entry in `.omp-plugin/marketplace.json`; then `skills: 33`, `agents: code-reviewer,plan-reviewer`, `warnings: 0`, and `exit=0`. A `FAIL <reason>` line and `exit=1` mean that the install or the discovery failed.

## V2 — Drive the plan helper against the fake `gh`

The shipped plan helper runs under Node against a fake `gh` that keeps issues in a temporary folder. No network call occurs.

```bash
node scripts/tests/plan-cli.mjs; echo "exit=$?"
```

Expected: the `node --test` summary shows `ℹ fail 0`, and the last line is `exit=0`.

## V3 — Run the `context-tree-nudge` hook

The hook runs after a file edit. It prints a nudge only when the edited file is inside a nested node.

```bash
printf '%s' "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$PWD/scripts/ci.mjs\"}}" | node plugins/docks/hooks/context-tree-nudge.mjs; echo "exit=$?"
printf '%s' "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$PWD/README.md\"}}" | node plugins/docks/hooks/context-tree-nudge.mjs; echo "exit=$?"
printf '%s' '{"tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n*** Update File: scripts/ci.mjs\n*** End Patch"}}' | node plugins/docks/hooks/context-tree-nudge.mjs; echo "exit=$?"
```

Expected:

- Edit in `scripts/` (Claude shape): one JSON line with `"hookEventName":"PostToolUse"` and `Edited files inside context-tree node(s): scripts`, then `exit=0`.
- Edit of the root `README.md`: no output, then `exit=0`.
- Codex `apply_patch` shape: the same JSON line as the first command, then `exit=0`.

## V4 — Run the `verify-gate` hook in each mode

The hook runs before `git commit`. It looks for a `Verified:` git trailer in the commit message. The commands use a temporary state folder, so the user log stays clean. They do not create a commit.

```bash
state=$(mktemp -d)
bare="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m 'docs: fix typo'\"},\"session_id\":\"verify-s1\",\"cwd\":\"$PWD\"}"
trailer="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m 'docs: fix typo' -m 'Verified: bun scripts/tree/guard.mjs'\"},\"session_id\":\"verify-s1\",\"cwd\":\"$PWD\"}"
gate() { printf '%s' "$2" | XDG_STATE_HOME="$state" DOCKS_VERIFY_GATE="$1" node plugins/docks/hooks/verify-gate.mjs; echo "exit=$?"; }
gate off "$bare"
gate observe "$bare"; wc -l < "$state/docks/verify-gate.jsonl"
gate enforce "$trailer"
gate enforce "$bare"; gate enforce "$bare"; gate enforce "$bare"
cat "$state/docks/verify-gate.jsonl"
rm -r "$state"
```

Expected, in order:

| Call | Expected result |
|---|---|
| `off` | No output, `exit=0`. No log file. |
| `observe` | No output, `exit=0`. The log holds `1` line. |
| `enforce` with the trailer | No output, `exit=0`. |
| `enforce`, first and second call without the trailer | Each prints a JSON line with `"permissionDecision":"deny"` and a reason that names the `Verified:` trailer, then `exit=0`. |
| `enforce`, third call without the trailer | No output, `exit=0`. The hook allows the commit after two denials in one session. |
| `cat` of the log | Two lines of metadata only: `time`, `session_id`, `cwd`, `mode`, and `"message_sources":["-m"]`. The first line has `"mode":"observe"`. The second line has `"mode":"enforce"` and `"allowed_after_denials":2`. No line holds the command or the message text: `docs: fix typo` does not appear. |

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
| `Validation passed with warnings` and exit 1 under `--strict` | A manifest, skill, agent, or hook file has a warning | Read the warning and fix the named file |
| `ℹ fail` above `0` in V2 | A plan-helper case broke | Run the failing case file under `node --test` alone |
| V3 or V4 prints a stack trace | The hook failed to parse its input | Fix the hook; a hook must exit 0 on bad input |
| V4 `observe` writes no log line | The hook did not see a commit or read the trailer by mistake | Check `findCommits` and `hasVerifiedTrailer` in `plugins/docks/hooks/verify-gate.mjs` |
