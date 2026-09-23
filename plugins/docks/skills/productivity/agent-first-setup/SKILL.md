---
name: agent-first-setup
description: "Use when making a repository agent-first in one pass — root AGENTS.md, nested AGENTS.md nodes, .agents/skills with .claude/skills symlinks, no CLAUDE.md, durable docs — or auditing whether a repo is. Runs multi-tool-bridge, then context-tree init, then an agent-first check with a pass/fail report. Not for one step alone: CLAUDE.md migration or skill symlinks (use multi-tool-bridge), nested nodes only (use context-tree), or plan workspace setup (use plan-workspace)."
user-invocable: true
metadata:
  pattern: pipeline
  updated: "2026-09-23"
  content_hash: "173e85c47e47eb22a8146235f6a51b51b15ce5f7b2bd15167bcd3186c59a869e"
---

# Agent-First Setup

Make a repository easy for any coding agent to use, in one pass. An agent-first repository is:

- **Findable** — a root `AGENTS.md` routes to every nested `AGENTS.md` node; skills live in `.agents/skills/`, and `.claude/skills/<name>` is a symlink to them.
- **Fast to understand** — the root states build/test/lint commands and repo-wide rules only; folder rules live in the folder `AGENTS.md`; each fact has one home.
- **Trustworthy** — docs hold durable facts only: no line anchors, no live counts or versions, no time-relative phrases; a volatile value carries the command that re-derives it.
- **Verifiable** — the check in Step 3 is a set of commands, not prose.
- **Free of CLAUDE.md** — any `CLAUDE.md` or `.claude/CLAUDE.md` suppresses native AGENTS.md loading in Claude Code (native AGENTS.md support: see https://code.claude.com/docs/en/memory).

This skill is an orchestrator. `multi-tool-bridge` and `context-tree` do the work; this skill puts them in order and ends with the check.

<constraint>
Delegate, do not re-implement. For Step 1 and Step 2, load the named skill and follow its workflow as written, including its detection, classification, and verification steps. Do not copy, shorten, or reorder its steps here. If a named skill (`multi-tool-bridge`, `context-tree`) or a prerequisite it names is not available, STOP before any write and name the missing skill or plugin in your final message.
</constraint>

<constraint>
Every write stays behind the approval gate of the skill that owns it. When that skill says to print a proposal and end the turn, end the turn; resume this workflow only after the user replies. This skill adds no writes of its own. `audit` mode never writes: it runs Step 0, the owning skills' read-only modes, and Step 3, then reports. Step 3 reports findings; it never auto-fixes them.
</constraint>

## Modes

| Invocation | Runs | Writes? |
|---|---|---|
| `agent-first-setup` (default) | Step 0 → Step 1 → Step 2 → Step 3 → Step 4 | only through the owning skills' approval gates |
| `agent-first-setup audit` | Step 0 → read-only detection of Step 1 → `context-tree audit` → Step 3 → Step 4 | never |

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

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

Run every later command from that root. Record the state; do not write:

```bash
test -f AGENTS.md          && echo "root AGENTS.md: present"     || echo "root AGENTS.md: missing"
test -d .agents/skills     && echo ".agents/skills: present"     || echo ".agents/skills: missing"
test -d .claude/skills     && echo ".claude/skills: present"     || echo ".claude/skills: missing"
git ls-files -co --exclude-standard -- ':(glob)**/CLAUDE.md' | sed 's/^/legacy: /'
git ls-files -co --exclude-standard -- ':(glob)**/AGENTS.md' | grep -v '^AGENTS\.md$' | sed 's/^/node: /'
find .claude/skills -mindepth 1 -maxdepth 1 ! -type l 2>/dev/null | sed 's/^/not-a-symlink: /'
```

Outside git, replace each `git ls-files` line with `find . -path ./.git -prune -o -path '*/node_modules' -prune -o -name <FILE> -print`. The `:(glob)**/CLAUDE.md` pathspec also matches `.claude/CLAUDE.md` at any depth.

If Step 0 shows root `AGENTS.md` present, no legacy path, no non-symlink skill entry, and at least one node or a small repo, go directly to Step 3. A pass there means the repo is already agent-first.

### Step 1 — Run `multi-tool-bridge`

Load `multi-tool-bridge` and follow it from its first step. It owns: layout detection, root `AGENTS.md` creation, legacy CLAUDE.md classification and removal (root and nested), and the `.claude/skills` → `.agents/skills` symlinks. Its approval gate ends the turn; continue here after the user approves and its own verification prints no `BROKEN:` line. If it reports `BROKEN:`, STOP and report; do not start Step 2.

In `audit` mode, run only its read-only detection and audit steps and record what it would change.

### Step 2 — Run `context-tree`

- No nested node exists → load `context-tree` and run `init`. It decides which folders earn a node; a small repo can correctly get none.
- Nodes exist → run `context-tree audit`. If it reports drift and the user asks to fix it, run `context-tree refresh` through that skill's own handoff.
- `context-tree` names its own prerequisites (the `plan-lifecycle` plugin). If it stops on one, report that blocker and continue to Step 3 in read-only form.

In `audit` mode, run `context-tree audit` only.

### Step 3 — Agent-first check (read-only)

Run the block below from the repository root. Every line it prints is `FAIL` (a contract break) or `FINDING` (a durable-doc risk a human must judge). No output means every check passed. Outside git, replace `ls_repo` with a `find` that skips `.git` and `node_modules`.

```bash
ls_repo() { git ls-files -co --exclude-standard -- "$@"; }
# C1 root AGENTS.md exists and names its build, test, and lint commands
if test -f AGENTS.md; then
  for k in build test lint; do grep -qiw "$k" AGENTS.md || echo "FINDING C1 root AGENTS.md names no $k command (add it, or accept: the repo has none or one gate covers it)"; done
else echo "FAIL C1 root AGENTS.md missing"; fi
# C2 every nested node is a row in a root table, and every table row resolves
ls_repo ':(glob)**/AGENTS.md' | grep -v '^AGENTS\.md$' | while IFS= read -r n; do
  grep -E '^\|' AGENTS.md 2>/dev/null | grep -qF "\`$n\`" || echo "FAIL C2 node not routed from root: $n"
done
grep -E '^\|' AGENTS.md 2>/dev/null | grep -oE '`[^` ]*AGENTS\.md`' | tr -d '`' | sort -u | while IFS= read -r p; do
  test -f "$p" || echo "FAIL C2 dead route in root table: $p"
done
# C3 no CLAUDE.md or .claude/CLAUDE.md anywhere (each suppresses AGENTS.md)
ls_repo ':(glob)**/CLAUDE.md' | sed 's/^/FAIL C3 legacy file: /'
test -f CLAUDE.local.md && echo "FINDING C3 CLAUDE.local.md also suppresses AGENTS.md (personal file; user decides)"
# C4 every .claude/skills entry is a symlink that resolves into .agents/skills
for e in .claude/skills/*; do
  { test -e "$e" || test -L "$e"; } || continue
  test -L "$e" || { echo "FAIL C4 not a symlink: $e"; continue; }
  case "$(readlink "$e")" in ../../.agents/skills/*) ;; *) echo "FAIL C4 target outside .agents/skills: $e";; esac
  test -f "$e/SKILL.md" || echo "FAIL C4 broken symlink: $e"
done
# C5 durable-doc scan: fenced blocks, URLs, inline code spans, and quoted text skipped; findings only, never auto-fixed.
# A line anchor counts only when its path exists (fictional example paths pass), like a durable-anchors guard.
ls_repo ':(glob)**/AGENTS.md' ':(glob)**/SKILL.md' ':(glob)**/skills/**/references/*.md' | while IFS= read -r f; do
  awk -v f="$f" '
    /^[[:space:]]*```/ { fence = !fence; next }
    fence { next }
    { s = $0; gsub(/https?:\/\/[^ )>]*/, "", s); t = s; gsub(/`[^`]*`/, "", t); gsub(/"[^"]*"|“[^”]*”/, "", t); l = tolower(t); gsub(/(phase|step|tier)[ -]?[0-9]+/, "", l) }
    { r = s; while (match(r, /[A-Za-z0-9_.\/-]+\.[A-Za-z]+:[0-9]+/)) { a = substr(r, RSTART, RLENGTH); sub(/:[0-9]+$/, "", a); print "ANCHOR " a " " f ":" NR; r = substr(r, RSTART + RLENGTH) } }
    l ~ /(^|[^a-z])(currently|as of|now has|recently)([^a-z]|$)/ { print "FINDING C5 time-relative " f ":" NR }
    l !~ /verify:/ && l ~ /(^|[^0-9.])[0-9]+ (skills|nodes|files|tests|tables|tabs|commands|agents|plugins|rules)([^a-z]|$)/ { print "FINDING C5 bare-count " f ":" NR }
  ' "$f"
done | while read -r kind a loc; do
  if [ "$kind" = ANCHOR ]; then test -e "$a" && echo "FINDING C5 line-anchor $loc ($a exists)"; else echo "$kind $a $loc"; fi
done
ls_repo ':(glob)**/AGENTS.md' | while IFS= read -r f; do
  grep -qF 'Pointers here name concepts, not coordinates' "$f" || echo "FINDING C5 no stale-tolerance line: $f"
done
# C6 every skill description starts with "Use when" (block scalars `>`, `|`, `>-`, `|-` read the first indented line)
ls_repo ':(glob)**/SKILL.md' | while IFS= read -r s; do
  awk '/^description:[[:space:]]*[>|][-+]?[[:space:]]*$/ { blk = 1; next }
       blk && NF { sub(/^[[:space:]]+/, ""); print; exit }
       /^description:/ { sub(/^description:[[:space:]]*["'\'']?/, ""); print; exit }' "$s" | grep -q '^Use when' \
    || echo "FAIL C6 description does not start with 'Use when': $s"
done
```

Read each `FINDING` line before you report it. A line anchor on a fictional example path, a count that is a stated policy threshold, or a time phrase inside a quoted BAD example is not a defect: mark it `accepted` with the reason.

### Step 4 — Report

Print one table. `Result` is `pass`, `fail (<count>)`, or `findings (<count>)`; copy the counts from the Step 3 output.

| Check | Result | Fix owner |
|---|---|---|
| C1 root AGENTS.md + commands | | `multi-tool-bridge` (creates the file); the user supplies the commands |
| C2 root routing ↔ nodes on disk | | `context-tree` (`init` / `refresh`) |
| C3 no CLAUDE.md | | `multi-tool-bridge` |
| C4 `.claude/skills` symlinks | | `multi-tool-bridge` |
| C5 durable-doc findings | | `context-tree audit` for nodes; `skill-maintenance` for skills |
| C6 skill descriptions | | `skill-maintenance` |

Below the table, list: files written by Step 1 and Step 2 (from their reports), every open `FAIL` line, every `FINDING` with its accepted/defect decision, and blockers that stopped a step. In Claude Code, tell the user to run `/memory` and confirm `AGENTS.md` is listed.

**Idempotency:** on a repository that is already agent-first, Step 1 and Step 2 are no-ops by their own contracts, Step 3 prints nothing, and the report is all `pass` with no files written. Any write on such a repository is a defect: report it.

## Common Traps

```text
BAD  — Step 1 copies the CLAUDE.md classification rules into this run and
       splits the file without the owning skill's approval table.
GOOD — Load multi-tool-bridge, print its proposal table, end the turn, and
       resume here after the user approves.

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
| A CLAUDE.md holds only `@AGENTS.md` | Leave it as harmless | It suppresses AGENTS.md; `multi-tool-bridge` deletes it behind its gate |
| `audit` mode finds a fixable problem | Fix it in the same run | Report it; the user runs the default mode or the owning skill |

## Anti-Hallucination Checks

- Do not report a check as `pass` unless you ran the Step 3 block in this session and it printed no line for that check.
- Do not claim Step 1 or Step 2 finished unless that skill's own verification ran and printed no failure line.
- Do not claim "no writes" in idempotent runs without `git status --short` showing no path changed by this run.
- Do not claim Claude Code loads `AGENTS.md` from file checks alone; the user's `/memory` output is the confirmation.
- A skill you could not load is a blocker to name, not a step to reconstruct from memory.

## References

- `multi-tool-bridge` — root AGENTS.md, legacy CLAUDE.md migration, `.agents/skills` symlinks (Step 1).
- `context-tree` — nested AGENTS.md nodes: `init`, `audit`, `refresh` (Step 2).
- `skill-maintenance` — fixes for C5 and C6 findings in SKILL.md files.
- Claude Code memory and native AGENTS.md support: https://code.claude.com/docs/en/memory
- agentskills.io specification: https://agentskills.io/specification
