---
name: agent-first-setup
description: "Use when making a repository agent-first in one pass — root AGENTS.md, nested AGENTS.md nodes, .agents/skills with .claude/skills symlinks, no CLAUDE.md, durable docs — or auditing whether a repo is. Runs multi-tool-bridge and context-tree init, adds a project verify skill, and ends with a pass/fail check. Not for one step alone: CLAUDE.md migration or skill symlinks (use multi-tool-bridge), nested nodes only (use context-tree), or plan workspace setup (use plan-workspace)."
user-invocable: true
metadata:
  pattern: pipeline
  updated: "2026-11-19"
  content_hash: "a5c6ca198c8f8040cf4abc90535dad58faab71970f57ad4be497e8d0a219a6cb"
---

# Agent-First Setup

Make a repository easy for any coding agent to use, in one pass. An agent-first repository is:

- **Findable** — a root `AGENTS.md` routes to every nested `AGENTS.md` node; skills live in `.agents/skills/`, and `.claude/skills/<name>` is a symlink to them. Codex reads `AGENTS.md` files only from the project root down to the directory where the session starts, so the root routing table is how a Codex session finds a deeper node. Claude Code loads a nested node when it reads a file in that folder.
- **Fast to understand** — the root states build/test/lint commands and repo-wide rules only; folder rules live in the folder `AGENTS.md`; each fact has one home.
- **Trustworthy** — docs hold durable facts only: no line anchors, no live counts or versions, no time-relative phrases; a volatile value carries the command that re-derives it.
- **Verifiable** — the check in Step 3 is a command, not prose. A project `verify` skill names the commands that start, drive, inspect, and stop the real product.
- **Free of CLAUDE.md** — a `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` without an `@AGENTS.md` import makes Claude read it instead of `AGENTS.md`. A stub that only imports `AGENTS.md` still delivers it; it is redundant, and the kit removes it as cleanup (source: https://code.claude.com/docs/en/memory, section "AGENTS.md").

This skill is an orchestrator. `multi-tool-bridge` and `context-tree` do the work; this skill puts them in order, adds the project `verify` skill in Step 2b, offers a pull-request template in Step 2c, and ends with the check.

<constraint>
Delegate, do not re-implement. For Step 1 and Step 2, load the named skill and follow its workflow as written, including its detection, classification, and verification steps. Do not copy, shorten, or reorder its steps here. If a named skill (`multi-tool-bridge`, `context-tree`) or a prerequisite it names is not available, STOP before any write and name the missing skill or plugin in your final message.
</constraint>

<constraint>
Every write stays behind the approval gate of the skill that owns it. At that gate, print the owning skill's proposal and ask for approval with the harness question tool (see "Asking the user"); if the harness has no such tool, end the turn. Resume this workflow only after the user answers. This skill owns two writes, each behind its own approval gate: the project `verify` skill and its symlink in Step 2b, and the pull-request template in Step 2c. It never overwrites an existing pull-request template. `audit` mode never writes: it runs Step 0, the owning skills' read-only modes, the Step 2b and Step 2c detection, and Step 3, then reports. Step 3 reports findings; it never auto-fixes them.
</constraint>

## Modes

| Invocation | Runs | Writes? |
|---|---|---|
| `agent-first-setup` (default) | Step 0 → Step 1 → Step 2 → Step 2b → Step 2c → Step 3 → Step 4 | only through the owning skills' approval gates and the Step 2b and Step 2c gates |
| `agent-first-setup audit` | Step 0 → read-only detection of Step 1 → `context-tree audit` → Step 2b detection → Step 2c detection → Step 3 → Step 4 | never |

## Asking the user

Ask every question through the question tool of the harness that runs this session. This includes approval gates, owner choices, and missing build, test, or lint commands. The tool blocks until the user answers and records the answer in the transcript. A question in plain reply text does neither.

| Harness | Question tool |
|---|---|
| Oh My Pi (omp) | `ask` |
| Claude Code | `AskUserQuestion` |
| Codex | `request_user_input` (Plan mode by default; see the note below) |
| OpenCode | `question` |

Use the tool that your harness registers, even when it is not in this table. By default Codex offers the tool only in Plan mode; in Default mode the call returns an "unavailable" error, or, with the under-development `default_mode_request_user_input` feature, sends the request as non-blocking (`isBlocking: false`), which the client may resolve without the user. An error, empty, or default result is not approval: print the question, write nothing, and end the turn. Codex takes at most 3 questions per call, and each question needs options (Codex adds a free-text "Other"); split a larger set into consecutive calls. Put all open questions for one gate into one call. If no question tool is registered (for example, in a headless or print-mode run), do not invent a call: print the questions, take no write, and end the turn.

## When to Use

- A new or inherited repository must work for Codex, Claude Code, and other agentskills.io runtimes, and the user wants it done in one pass.
- The user says "make this repo agent-first", "set up this repo for agents", or `/docks:agent-first-setup`.
- A health check after a large restructure: run `audit` for a pass/fail table with the owning skill for each fix.

## When NOT to use

| Situation | Use instead |
|---|---|
| Only migrate a legacy CLAUDE.md or add `.claude/skills` symlinks | `multi-tool-bridge` |
| Only add, audit, or refresh nested AGENTS.md nodes | `context-tree` |
| Set up or refresh the GitHub-issue plan workspace (`docs/AGENTS.md`, `docs/PLAN.md`) | `plan-workspace` |
| Fix a stale or invalid SKILL.md found by the check | `skill-maintenance` |
| Author a new skill | `write-skill` |

## Workflow

### Step 0 — Resolve root and detect state (read-only)

`<skill-dir>` is the folder that holds this `SKILL.md`. Its `scripts/` folder holds the read-only checks of Step 0 and Step 3. Run the detection from any folder inside the repository:

```bash
node <skill-dir>/scripts/agent-first-check.mjs detect
```

The first line is the repository root (the current folder outside git). Run every later command from that root. Record the state; do not write. The command only reads, and it prints these lines:

| Line | Meaning |
|---|---|
| `root AGENTS.md:`, `.agents/skills:`, `.claude/skills:` | `present` or `missing` |
| `legacy: <path>` | a `CLAUDE.md` or a `.claude/CLAUDE.md`, at any depth |
| `personal: <path>` | a `CLAUDE.local.md`, also a gitignored one, because that personal file is usually gitignored |
| `node: <path>` | an `AGENTS.md` below the root; a file under `node_modules` is package content, not a node |
| `not-a-symlink: <path>` | a `.claude/skills` entry that is not a symlink |
| `pull-request template:` | the detection of [references/pull-request-template.md](references/pull-request-template.md) |
| `verify skill:`, `verify link:`, `verify unverified:` | the Detect lines of [references/verify-skill-template.md](references/verify-skill-template.md) |

Outside git, the command walks the folder itself and skips each `.git`, `node_modules`, and `vendor` folder. The `pull-request template:` lines tell a usable template from an unusable entry, such as a broken symlink or an empty template folder, and `pull-request template: none` means that no usable template exists. That detection needs git; outside git, it prints an `ERROR` line. Report that error. An error is not a missing template. The verify lines are a `verify skill:` line, a `verify link:` line for `.claude/skills/verify`, and one `verify unverified:` line for each result that no run has shown. The verify detection prints an `ERROR` line when it cannot read the skill; report that error. After an `ERROR` line, the command exits with status 2 and its cause is on stderr; read every line that it printed. Status 1 is a usage error; otherwise the status is 0.

If Step 0 shows root `AGENTS.md` present, no `legacy:` or `personal:` path, no non-symlink skill entry, and at least one node or a small repo, go directly to Step 2b. Step 2b is a no-op when Step 0 shows `verify skill: present`, `verify link: present`, and no `verify unverified:` or `ERROR` line. Step 2c is a no-op when Step 0 printed a usable `pull-request template:` line and no `pull-request template: none` line. A pass in Step 3 means the repo is already agent-first.

### Step 1 — Run `multi-tool-bridge`

Load `multi-tool-bridge` and follow it from its first step. It owns: layout detection, root `AGENTS.md` creation, legacy CLAUDE.md classification and removal (root and nested), and the `.claude/skills` → `.agents/skills` symlinks. Its approval gate ends the turn; continue here after the user approves and its own verification prints no `BROKEN:` line. If it reports `BROKEN:`, STOP and report; do not start Step 2.

In `audit` mode, run only its read-only detection and audit steps and record what it would change.

### Step 2 — Run `context-tree`

- No nested node exists → load `context-tree` and run `init`. It decides which folders earn a node; a small repo can correctly get none.
- Nodes exist → run `context-tree audit`. If it reports drift and the user asks to fix it, run `context-tree refresh` through that skill's own handoff.
- `context-tree` names its own prerequisites (the `plan-lifecycle` plugin). If it stops on one, report that blocker and continue to Step 2b.

In `audit` mode, run `context-tree audit` only.

### Step 2b — Create the project `verify` skill

A project `verify` skill tells an agent how to run the real product the way a user or another program does. This skill owns this write. Follow the Create or re-verify section of [references/verify-skill-template.md](references/verify-skill-template.md). It runs `node <skill-dir>/scripts/verify-skill.mjs detect` again first, because Step 1 can move `.claude/skills/verify` to `.agents/skills/verify`. Its write gate, entry gate, and link commands are `verify-skill.mjs write-gate <path>...`, `entry-gate`, and `link` in the same folder. Ask each question of that section through the harness question tool (see "Asking the user"). If the harness has no such tool, end the turn and report Step 2b as blocked.

- When the section stops without a write, record its reason for the report, for example "no runnable surface" or an occupied `.claude/skills/verify`, and go to Step 2c.
- Step 2b is complete only when the section leaves the skill verified: each command ran and showed its expected result, and the skill holds no `not observed:` entry. A failed command stays in the report with its output.

In `audit` mode, use the Step 0 output and run only step 4 and step 5 of that section, which write nothing. Record whether the skill exists, its link state, each `verify unverified:` or `ERROR` line, or the surface that needs the skill.

### Step 2c — Offer the pull-request template

This skill owns this write, behind its own approval gate. Follow [references/pull-request-template.md](references/pull-request-template.md). Offer the template only when Step 0 printed `pull-request template: none`, and list each `unusable` line with it. On a usable template, make no change; on an `ERROR` line, report the error and write nothing. Fill in the check command from the root `AGENTS.md` (or `Checks pass` when it names none), print the draft and the path `.github/pull_request_template.md`, and ask through the harness question tool. After approval, run the write gate of the reference, `node <skill-dir>/scripts/pr-template.mjs gate`, and write only on `target free`. On `target occupied`, report the entry that occupies the path and write nothing; the user resolves it. Never write through a symlink. Tell the user that GitHub uses the template only after it is on the default branch. In `audit` mode, record the Step 0 lines only.

### Step 3 — Agent-first check (read-only)

Run the check from the repository root. It only reads; it writes no file.

```bash
node <skill-dir>/scripts/agent-first-check.mjs check
```

Every line it prints is `FAIL` (a contract break), `FINDING` (a risk or cleanup item a human must judge), or `ERROR` (a check that could not run; report its message, never as a pass). Each line starts with its kind and its check id, for example `FAIL C2 node not routed from root: api/AGENTS.md`. The lines come in the order C1 to C10. No output means every check passed. After an `ERROR` line, the command exits with status 2 and the cause is on stderr; the other lines still count. A check prints `ERROR C<n> cannot read <file>` for a file that it cannot read, and `ERROR C<n> file listing failed (see the message above)` for a file listing that fails. Outside git, the check walks the folder itself and skips each `.git`, `node_modules`, and `vendor` folder.

| Check | Rule | Lines |
|---|---|---|
| C1 | The root `AGENTS.md` exists and names its build, test, and lint commands (a whole word, any letter case). | `FAIL` when the file is missing; one `FINDING` for each command word that it does not name (add it, or accept: the repo has none or one gate covers it) |
| C2 | Every nested node is a row in a root table, and every row resolves. A row is a table line whose first cell is `<dir>/AGENTS.md` in backticks; a leading `@` inside the backticks is stripped. | `FAIL` for a node that no row routes, and for a dead route |
| C3 | Claude reads a `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` instead of `AGENTS.md`. A file that imports `AGENTS.md` (`@AGENTS.md`; `@../AGENTS.md` in a `.claude/CLAUDE.md`) still delivers it. While the root has a CLAUDE.md file, Claude does not load a nested `AGENTS.md` by itself; only a sibling import stub (or symlink) delivers it. | `FAIL` for a `CLAUDE.md` without an import, and for a node hidden from Claude; `FINDING` for a redundant stub or symlink (cleanup), for a file that imports `AGENTS.md` and holds other lines (move them, then delete the file), and for a `CLAUDE.local.md` without an import (personal file; user decides) |
| C4 | Every `.claude/skills` entry is a symlink that resolves into `.agents/skills`. | `FAIL` for a non-symlink, a target outside `.agents/skills`, or a broken symlink |
| C5 | The durable-doc scan of each `AGENTS.md`, `SKILL.md`, and `skills/**/references/*.md`. Fenced blocks and URLs are skipped everywhere. Inline code spans and quoted text are skipped for the time and count rules only (a line anchor inside backticks still counts). A line anchor counts only when its path exists from the repo root or from the folder of the file (fictional example paths pass). The count rule skips a line that holds `verify:`; a phase, step, or tier number is not a count. | `FINDING C5 time-relative`, `bare-count`, and `line-anchor` with `<file>:<line>`, and `FINDING C5 no stale-tolerance line` for an `AGENTS.md` without the "Pointers here name concepts" line. Findings only; never auto-fix them |
| C6 | Every skill description starts with "Use when". A block scalar (`>`, `\|`, `>-`, `\|-`) reads its first indented line. | `FAIL` |
| C7 | No bare `@path` import in an `AGENTS.md`: Claude expands it into context every time that file loads. Code spans and fenced blocks are not imports, so `` `@<dir>/AGENTS.md` `` in a routing row passes. A relative path resolves from the folder of the file; a `~/` path resolves from the home folder. | `FINDING` with the line count of the imported file, or with `no file at <path>` |
| C8 | Every `AGENTS.md` is at most 500 lines (kit policy, not an Anthropic doc limit). | `FINDING` |
| C9 | `.agents/skills/verify/SKILL.md` exists, `.claude/skills/verify` resolves to it, and every command of the skill showed its expected result (a `not observed:` entry is a command that failed or that no run finished). | `FAIL` for a link that does not resolve, and for each unverified command (rerun every command in Step 2b); `FINDING` for a missing skill (add it in Step 2b, or accept: the repo has no runnable surface); `ERROR` when the skill cannot be read |
| C10 | A usable pull-request template exists (the detection of Step 0). Each unusable entry is named. An error is not a missing template. | `FINDING` for each unusable entry, and for no usable template (add it in Step 2c, or accept: the repository wants none); `ERROR` when the detection fails |

Read each `FINDING` line before you report it. A line anchor on a fictional example path, a count that is a stated policy threshold, a time phrase inside a quoted BAD example, and a value inside a dated record (a file or sentence that carries its own date, such as an incident note or "Measured <date>") are not defects: mark each `accepted` with the reason. If the root `AGENTS.md` names a repository doc guard (a lint script for doc pointers), run it too and add its output to the report.

### Step 4 — Report

Print one table. `Result` is `pass`, `fail (<count>)`, `findings (<count>)`, or `error (<count>)`; copy the counts from the Step 3 output. A check with an `ERROR` line is `error`, never `pass`, also when it printed no other line. When a check printed lines of more than one kind, show each kind, for example `fail (1), error (1)`.

| Check | Result | Fix owner |
|---|---|---|
| C1 root AGENTS.md + commands | | `multi-tool-bridge` (creates the file); the user supplies the commands |
| C2 root routing ↔ nodes on disk | | `context-tree` (`init` / `refresh`) |
| C3 CLAUDE.md import rule | | `multi-tool-bridge` (moves content, deletes stubs behind its gate) |
| C4 `.claude/skills` symlinks | | `multi-tool-bridge` |
| C5 durable-doc findings | | `context-tree audit` for nodes; `skill-maintenance` for skills |
| C6 skill descriptions | | `skill-maintenance` |
| C7 no eager `@path` imports | | `context-tree` (`audit` / `refresh`) |
| C8 node size (500-line kit policy) | | `context-tree` (`audit` / `refresh`; split the folder) |
| C9 project `verify` skill and its symlink | | this skill, Step 2b |
| C10 pull-request template | | this skill, Step 2c |

Below the table, list: files written by Step 1, Step 2, Step 2b, and Step 2c (from their reports), the `verify` skill commands that failed or did not run in Step 2b, every open `FAIL` line, every `FINDING` with its accepted/defect decision, every `ERROR` line from Step 0 and Step 3 with the message above it, and blockers that stopped a step. In Claude Code, tell the user to run `/memory` and confirm `AGENTS.md` is listed (Claude Code v2.1.280 and later list it; on an older version, ask Claude what its project instructions say).

**Idempotency:** on a repository that is already agent-first, Step 1, Step 2, Step 2b, and Step 2c are no-ops by their own contracts, Step 3 prints no `FAIL` line, no `ERROR` line, and no unaccepted `FINDING`, and no file is written. Any write on such a repository is a defect: report it.

## Common Traps

```text
BAD  — Step 1 copies the CLAUDE.md classification rules into this run and
       splits the file without the owning skill's approval table.
GOOD — Load multi-tool-bridge, print its proposal table, ask for approval
       with the harness question tool (omp `ask`, Claude Code
       `AskUserQuestion`), and resume here after the user approves.

BAD  — "Approve these changes? (yes/no)" as plain reply text.
GOOD — The same question through the harness question tool, one call per gate.

BAD  — C5 reports a line anchor, so the agent rewrites the node on the spot.
GOOD — Report it as FINDING with the fix owner; context-tree refresh makes
       the change behind its own gate.

BAD  — "All checks pass" after Step 1 printed a BROKEN line.
GOOD — STOP at the BROKEN line; the report shows the step that failed.
```

| Trap | Wrong fix | Right fix |
|---|---|---|
| Nodes already exist | Run `context-tree init` again and expect new nodes | Run `context-tree audit`; `init` leaves existing nodes alone |
| Small repo gets no node | Force a node so C2 has rows | Zero nodes is a pass when `context-tree` finds no major folder |
| `.claude/skills` symlinks look redundant with native AGENTS.md support | Delete them | Keep them; Claude Code does not read `.agents/` |
| A CLAUDE.md holds only `@AGENTS.md` | Report it as a FAIL, or say it hides AGENTS.md | It still delivers AGENTS.md through the import, so it is redundant: a C3 `FINDING`. `multi-tool-bridge` deletes it behind its gate. While the root has a CLAUDE.md, each nested node needs its own stub (C3 checks this) |
| A CLAUDE.md holds rules and no `@AGENTS.md` import | Treat it like a stub | A CLAUDE.md without an `@AGENTS.md` import makes Claude read it instead of AGENTS.md: a C3 `FAIL`. `multi-tool-bridge` moves the content, then deletes the file |
| A root table row reads `@scripts/AGENTS.md` without backticks | Keep it; it is only a link | A bare `@path` is an import: Claude loads that file into every session (C7). Put the path in backticks |
| `audit` mode finds a fixable problem | Fix it in the same run | Report it; the user runs the default mode or the owning skill |
| The `verify` skill lists only the unit-test command | Accept it as verification | A unit test does not drive the product. Add a row that starts the surface, drives a main flow, and names the observable result |
| The `verify` skill waits with `sleep 5` | Raise the sleep until the run passes | Wait on a readiness signal: an open port, a health URL, or a log line |
| A `verify` command fails because a service or a dependency is not available | Remove the command from the skill, overwrite its expected result with the failure, ask the user while the server still runs, or on a later run rerun only the marked rows | Run Stop and cleanup first. Keep the command and mark it `not observed: expect <result>; got <first line of the failure>`; the commands after it keep their `expect` marks. Report the failure and ask the user for the fix. A later run first marks every result again, then reruns every command in order, because a flow can depend on an earlier flow. Step 2b stays open until each command shows its expected result |

## Anti-Hallucination Checks

- Do not report a check as `pass` unless you ran the Step 3 command in this session and it printed no line for that check. A check that printed an `ERROR` line did not run: report it as `error`.
- Do not claim Step 1 or Step 2 finished unless that skill's own verification ran and printed no failure line.
- Do not claim "no writes" in idempotent runs without `git status --short` showing no path changed by this run.
- Do not claim Claude Code loads `AGENTS.md` from file checks alone; the user's `/memory` output (v2.1.280 and later) or Claude's own answer on an older version is the confirmation.
- A skill you could not load is a blocker to name, not a step to reconstruct from memory.
- Do not write an expected result into the `verify` skill without a `not observed:` mark unless you observed it in this session.

## References

- `multi-tool-bridge` — root AGENTS.md, legacy CLAUDE.md migration, `.agents/skills` symlinks (Step 1).
- `context-tree` — nested AGENTS.md nodes: `init`, `audit`, `refresh` (Step 2).
- `skill-maintenance` — fixes for C5 and C6 findings in SKILL.md files.
- [references/verify-skill-template.md](references/verify-skill-template.md) — the project `verify` skill template, surface recipes, and a worked example (Step 2b).
- Codex AGENTS.md discovery (project root down to the working directory): https://developers.openai.com/codex/guides/agents-md
- Claude Code memory and native AGENTS.md support: https://code.claude.com/docs/en/memory
- agentskills.io specification: https://agentskills.io/specification

## Report a problem with this skill

When this skill gives a wrong, outdated, or unsafe instruction, or a script that it ships fails, report the problem in the public DocksDocks/docks repository. Use the docks `report-skill-issue` skill for the report. If that skill is not installed, do not file anything: give the user a draft instead. The draft names this skill and its plugin version, quotes the instruction, and states what happened and what you expected. Leave out secrets and private names.
