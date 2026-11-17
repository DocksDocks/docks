---
name: verify
description: "Use when checking a change to this docks repository end to end: validate both plugins and the marketplace with the Claude Code CLI, drive the plan helper against the fake gh, run each docks hook with sample stdin, and run the plan-lifecycle self-test. Not for the full CI gate (run bun scripts/ci.mjs), reviewer benchmarks (use review-benchmark), or plugin release."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-11-17"
---

# Verify docks

This skill runs the surfaces of this repository the way a user or a host program does. Claude Code loads the plugins. A user drives the plan helper. Claude Code and Codex call the hooks with JSON on stdin. Run the commands from the repository root. Each one finishes in seconds and starts no server.

This skill does not replace the gate. The gate choice is in the root `AGENTS.md` (Tool-agnostic rules).

<constraint>
Report a check as passed only when you ran its command in this session and saw the expected result. A unit-test run does not replace V1 to V5.
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

BAD  — V1 printed a plugin-directory warning, so the agent reports V1 as failed.
GOOD — The agent reads the result line and the exit code. `✔ Validation passed`
       with exit 0 is a pass. The report names the warning.
```

## Prerequisites

| Need | Check command | Expected result |
|---|---|---|
| Claude Code CLI | `claude --version` | A version line that ends with `(Claude Code)` |
| Node and Bun | `node --version && bun --version` | Two version lines |
| Dependencies | `bun install --frozen-lockfile` | Exit 0 |

## V1 — Validate the plugins and the marketplace

`claude plugin validate` checks a plugin manifest and its skills, agents, and hooks. `--strict` turns each warning into a failure (exit 1).

```bash
for p in plugins/docks plugins/plan-lifecycle .; do claude plugin validate --strict "$p" || echo "FAIL $p"; done
```

Expected: each run prints `✔ Validation passed`, and no `FAIL` line appears. The plugin folders also print plugin-directory warnings, such as `ICON_MISSING`. The CLI says that these warnings "do not change the result below". The `.` run validates `.claude-plugin/marketplace.json`.

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
| `cat` of the log | The `observe` line, and a second line with `"mode":"enforce"` and `"allowed_after_denials":2`. |

## V5 — Run the plan-lifecycle self-test

```bash
bun plugins/plan-lifecycle/test/selftest.mjs; echo "exit=$?"
```

Expected: `plan-lifecycle self-test PASSED: manifest/catalog agreement (<version>), ...`, then `exit=0`.

## Failure signs

| Sign | Meaning | Next step |
|---|---|---|
| `Validation passed with warnings` and exit 1 under `--strict` | A manifest, skill, agent, or hook file has a warning | Read the warning and fix the named file |
| `ℹ fail` above `0` in V2 | A plan-helper case broke | Run the failing case file under `node --test` alone |
| V3 or V4 prints a stack trace | The hook failed to parse its input | Fix the hook; a hook must exit 0 on bad input |
| V4 `observe` writes no log line | The hook did not see a commit or read the trailer by mistake | Check `findCommits` and `hasVerifiedTrailer` in `plugins/docks/hooks/verify-gate.mjs` |
