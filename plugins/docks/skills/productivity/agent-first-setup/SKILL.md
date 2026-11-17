---
name: agent-first-setup
description: "Use when making a repository agent-first in one pass — root AGENTS.md, nested AGENTS.md nodes, .agents/skills with .claude/skills symlinks, no CLAUDE.md, durable docs — or auditing whether a repo is. Runs multi-tool-bridge and context-tree init, adds a project verify skill, and ends with a pass/fail check. Not for one step alone: CLAUDE.md migration or skill symlinks (use multi-tool-bridge), nested nodes only (use context-tree), or plan workspace setup (use plan-workspace)."
user-invocable: true
metadata:
  pattern: pipeline
  updated: "2026-11-17"
  content_hash: "37b5da1359ec1bf6f7a1f3dcebd00f11e99d83120d3a52e768183fc49549b511"
---

# Agent-First Setup

Make a repository easy for any coding agent to use, in one pass. An agent-first repository is:

- **Findable** — a root `AGENTS.md` routes to every nested `AGENTS.md` node; skills live in `.agents/skills/`, and `.claude/skills/<name>` is a symlink to them. Codex reads `AGENTS.md` files only from the project root down to the directory where the session starts, so the root routing table is how a Codex session finds a deeper node. Claude Code loads a nested node when it reads a file in that folder.
- **Fast to understand** — the root states build/test/lint commands and repo-wide rules only; folder rules live in the folder `AGENTS.md`; each fact has one home.
- **Trustworthy** — docs hold durable facts only: no line anchors, no live counts or versions, no time-relative phrases; a volatile value carries the command that re-derives it.
- **Verifiable** — the check in Step 3 is a set of commands, not prose. A project `verify` skill names the commands that start, drive, inspect, and stop the real product.
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

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

Run every later command from that root. Record the state; do not write:

```bash
test -f AGENTS.md          && echo "root AGENTS.md: present"     || echo "root AGENTS.md: missing"
test -d .agents/skills     && echo ".agents/skills: present"     || echo ".agents/skills: missing"
test -d .claude/skills     && echo ".claude/skills: present"     || echo ".claude/skills: missing"
git ls-files -co --exclude-standard -- ':(glob)**/CLAUDE.md' | sed 's/^/legacy: /'
git ls-files -co -- ':(glob)**/CLAUDE.local.md' | sed 's/^/personal: /'
git ls-files -co --exclude-standard -- ':(glob)**/AGENTS.md' | grep -v '^AGENTS\.md$' | sed 's/^/node: /'
find .claude/skills -mindepth 1 -maxdepth 1 ! -type l 2>/dev/null | sed 's/^/not-a-symlink: /'
test -f .agents/skills/verify/SKILL.md && echo "verify skill: present" || echo "verify skill: missing"
grep -n 'not observed:' .agents/skills/verify/SKILL.md 2>/dev/null | sed 's/^/verify unverified: /'
pr_templates() (
  root=$(git rev-parse --show-toplevel) && cd "$root" || exit 2
  for d in . docs .github; do
    test -d "$d" || continue
    find "$d" -mindepth 1 -maxdepth 1 \( -type f \( -iname pull_request_template -o -iname pull_request_template.md -o -iname pull_request_template.txt \) -o -type d -iname pull_request_template \) -print || exit 2
  done
)
if t=$(pr_templates); then printf '%s\n' "${t:-none}" | sed 's/^/pull-request template: /'
else echo "ERROR pull-request template check failed (see the message above)"; fi
```

Outside git, replace each `git ls-files` line with `find . \( -path ./.git -o -path '*/node_modules' -o -path '*/vendor' \) -prune -o -name <FILE> -print`. The `:(glob)**/CLAUDE.md` pathspec also matches `.claude/CLAUDE.md` at any depth. The `CLAUDE.local.md` line has no `--exclude-standard`, because that personal file is usually gitignored. The `pr_templates` detection needs git; outside git it prints an `ERROR` line. Report that error. An error is not a missing template.

If Step 0 shows root `AGENTS.md` present, no `legacy:` or `personal:` path, no non-symlink skill entry, and at least one node or a small repo, go directly to Step 2b. Step 2b is a no-op when it shows `verify skill: present` and no `verify unverified:` line. A `verify unverified:` line is a command that failed in an earlier run; Step 2b reruns it. Step 2c is a no-op when Step 0 printed a `pull-request template:` line with a path. A pass in Step 3 means the repo is already agent-first.

### Step 1 — Run `multi-tool-bridge`

Load `multi-tool-bridge` and follow it from its first step. It owns: layout detection, root `AGENTS.md` creation, legacy CLAUDE.md classification and removal (root and nested), and the `.claude/skills` → `.agents/skills` symlinks. Its approval gate ends the turn; continue here after the user approves and its own verification prints no `BROKEN:` line. If it reports `BROKEN:`, STOP and report; do not start Step 2.

In `audit` mode, run only its read-only detection and audit steps and record what it would change.

### Step 2 — Run `context-tree`

- No nested node exists → load `context-tree` and run `init`. It decides which folders earn a node; a small repo can correctly get none.
- Nodes exist → run `context-tree audit`. If it reports drift and the user asks to fix it, run `context-tree refresh` through that skill's own handoff.
- `context-tree` names its own prerequisites (the `plan-lifecycle` plugin). If it stops on one, report that blocker and continue to Step 2b.

In `audit` mode, run `context-tree audit` only.

### Step 2b — Create the project `verify` skill

A project `verify` skill tells an agent how to run the real product the way a user or another program does. This skill owns this write. The template, the surface recipes, and a worked example are in [references/verify-skill-template.md](references/verify-skill-template.md).

1. If `.agents/skills/verify/SKILL.md` exists and Step 0 printed no `verify unverified:` line, make no change and go to Step 2c. If Step 0 printed a `verify unverified:` line, the skill is not verified yet. Print the unverified rows, ask for approval through the harness question tool to run them and update them, and then go to step 7. In step 7, run Start, the flows that each `not observed:` row names, and Stop.
2. Find each runnable surface. Read the root `AGENTS.md`, the build files (for example `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, `compose.yaml`), and the entry points. Match each surface to a row of the template's "Surface recipes" table.
3. If the repository has no runnable surface, write nothing. Record "no runnable surface" for the report and go to Step 2c.
4. Fill the template for each surface. Use only commands that the repository defines or that the recipes name. Ask the user through the harness question tool for a missing start command, port, or test account.
5. Print the draft `SKILL.md` and the symlink `.claude/skills/verify` → `../../.agents/skills/verify`. Ask for approval through the harness question tool. The approval covers the write and one run of each command.
6. After approval, write `.agents/skills/verify/SKILL.md`. Then create the symlink and check it:

   ```bash
   mkdir -p .claude/skills
   ln -s ../../.agents/skills/verify .claude/skills/verify
   test -f .claude/skills/verify/SKILL.md && echo "verify skill: linked" || echo "BROKEN: .claude/skills/verify"
   ```

7. Run each command of the new skill once, in order: start, drive and inspect, stop. Replace each expected result, and each `not observed:` entry, with the result that you observed. If a command fails:
   1. Run the Stop and cleanup commands of the skill at once, before you report or ask. No process, port, or temporary folder from this run stays.
   2. Keep the failed command in the skill. Do not remove it. In place of its expected result, write `not observed: <first line of the failure>`.
   3. Do not report the skill as verified. Name the failed command and its output in the report.
   4. Ask the user through the harness question tool for the fix, for example a missing service, dependency, or test account. If the harness has no such tool, end the turn and report Step 2b as blocked.

   Step 2b is complete only when each command ran and showed its expected result, and the skill holds no `not observed:` entry.

In `audit` mode, run step 1 to step 3 only and record whether the skill exists, each `verify unverified:` row, or the surface that needs it.

### Step 2c — Offer the pull-request template

A pull-request template gives each pull request on GitHub the same task list, and GitHub shows its progress as `k of n tasks`. GitHub reads a template from the root, from `docs/`, or from `.github/`: a file named `pull_request_template`, with an extension such as `.md` or `.txt`, in any letter case, or a `PULL_REQUEST_TEMPLATE/` folder that holds several templates (source: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates). The `pr_templates` detection in Step 0 matches only the files `pull_request_template`, `pull_request_template.md`, and `pull_request_template.txt`, and the folder `PULL_REQUEST_TEMPLATE`, in any letter case; a name such as `pull_request_template.md.bak` is not a template. Step 0 and C10 use the same detection. This skill owns this write.

1. If Step 0 printed a `pull-request template:` line with a path, make no change and go to Step 3. Never overwrite or edit an existing template. If Step 0 printed an `ERROR pull-request template check failed` line, report the error, write nothing, and go to Step 3. An error is not a missing template. Continue only on `pull-request template: none`.
2. Read the check command from the root `AGENTS.md`, for example `bun run check`. When it names none, write the first item as `- [ ] Checks pass`.
3. Print the draft below with the real check command, and the path `.github/pull_request_template.md`. Ask for approval through the harness question tool. Without approval, write nothing.
4. After approval, write the file. Tell the user that GitHub uses the template only after it is on the default branch, and that the repository can add its own items later. Keep each item a top-level task item.

```markdown
## Checklist

- [ ] `<check command>` passes
- [ ] Tested locally with the `verify` skill
- [ ] Code review passed
```

In `audit` mode, run step 1 only and record whether a template exists.

### Step 3 — Agent-first check (read-only)

Run the block below from the repository root. Every line it prints is `FAIL` (a contract break), `FINDING` (a risk or cleanup item a human must judge), or `ERROR` (a check that could not run; report its message, never as a pass). No output means every check passed. Outside git, replace `ls_repo` with a `find` that skips `.git`, `node_modules`, and `vendor`. The block only reads; it writes no file.

```bash
ls_repo() { git ls-files -co --exclude-standard -- "$@"; }
# C1 root AGENTS.md exists and names its build, test, and lint commands
if test -f AGENTS.md; then
  for k in build test lint; do grep -qiw "$k" AGENTS.md || echo "FINDING C1 root AGENTS.md names no $k command (add it, or accept: the repo has none or one gate covers it)"; done
else echo "FAIL C1 root AGENTS.md missing"; fi
# C2 every nested node is a row in a root table, and every row resolves.
# A row is a table line whose first cell is `<dir>/AGENTS.md` in backticks; a leading @ inside the backticks is stripped.
routes=$(awk -F'|' '/^[[:space:]]*\|/ { c = $2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", c); if (c ~ /^`@?[^` ]*AGENTS\.md`$/) { gsub(/`/, "", c); sub(/^@/, "", c); sub(/^\.\//, "", c); print c } }' AGENTS.md 2>/dev/null | sort -u)
ls_repo ':(glob)**/AGENTS.md' | grep -v '^AGENTS\.md$' | while IFS= read -r n; do
  printf '%s\n' "$routes" | grep -qxF "$n" || echo "FAIL C2 node not routed from root: $n"
done
printf '%s\n' "$routes" | while IFS= read -r p; do
  if [ -n "$p" ] && ! test -f "$p"; then echo "FAIL C2 dead route in root table: $p"; fi
done
# C3 CLAUDE.md files. Claude reads a CLAUDE.md, .claude/CLAUDE.md, or CLAUDE.local.md instead of AGENTS.md.
# A file that imports AGENTS.md still delivers it: a stub is redundant (FINDING, cleanup); a CLAUDE.md with no import is a FAIL.
{ ls_repo ':(glob)**/CLAUDE.md'; git ls-files -co -- ':(glob)**/CLAUDE.local.md' 2>/dev/null; } | sort -u | while IFS= read -r f; do
  case "$f" in .claude/CLAUDE.md|*/.claude/CLAUDE.md) imp='@\.\./AGENTS\.md';; *) imp='@AGENTS\.md';; esac
  if test -L "$f" && [ "$(basename "$(readlink "$f")")" = AGENTS.md ]; then
    echo "FINDING C3 redundant symlink to AGENTS.md (content still loads; cleanup): $f"
  elif ! grep -qE "(^|[[:space:]])$imp([[:space:]]|$)" "$f"; then
    case "$f" in
      *CLAUDE.local.md) echo "FINDING C3 CLAUDE.local.md without an @AGENTS.md import makes Claude read it instead of AGENTS.md (personal file; user decides): $f";;
      *) echo "FAIL C3 CLAUDE.md without an @AGENTS.md import makes Claude read it instead of AGENTS.md: $f";;
    esac
  elif grep -vE "^[[:space:]]*$imp[[:space:]]*$" "$f" | grep -q '[^[:space:]]'; then
    echo "FINDING C3 CLAUDE.md imports AGENTS.md and holds other lines (move them, then delete the file): $f"
  else echo "FINDING C3 redundant import stub (AGENTS.md still loads; cleanup): $f"; fi
done
# While the root has a CLAUDE.md file, Claude does not load a nested AGENTS.md by itself; only a sibling import stub (or symlink) delivers it.
claude_mode=; for c in CLAUDE.md .claude/CLAUDE.md CLAUDE.local.md; do test -e "$c" && claude_mode=1; done
if [ -n "$claude_mode" ]; then
  ls_repo ':(glob)**/AGENTS.md' | grep -v '^AGENTS\.md$' | while IFS= read -r n; do
    d=${n%/AGENTS.md}
    { test -L "$d/CLAUDE.md" && [ "$(basename "$(readlink "$d/CLAUDE.md")")" = AGENTS.md ]; } \
      || grep -qsE '(^|[[:space:]])@AGENTS\.md([[:space:]]|$)' "$d/CLAUDE.md" || grep -qsE '(^|[[:space:]])@\.\./AGENTS\.md([[:space:]]|$)' "$d/.claude/CLAUDE.md" \
      || echo "FAIL C3 node hidden from Claude (the root has a CLAUDE.md file and $d has no import stub): $n"
  done
fi
# C4 every .claude/skills entry is a symlink that resolves into .agents/skills
for e in .claude/skills/*; do
  { test -e "$e" || test -L "$e"; } || continue
  test -L "$e" || { echo "FAIL C4 not a symlink: $e"; continue; }
  case "$(readlink "$e")" in ../../.agents/skills/*) ;; *) echo "FAIL C4 target outside .agents/skills: $e";; esac
  test -f "$e/SKILL.md" || echo "FAIL C4 broken symlink: $e"
done
# C5 durable-doc scan: fenced blocks and URLs skipped everywhere; inline code spans and quoted text skipped for the time and count checks only
# (a line anchor inside backticks still counts); findings only, never auto-fixed.
# A line anchor counts only when its path exists from the repo root or from the file's folder (fictional example paths pass).
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
  if [ "$kind" = ANCHOR ]; then d=$(dirname "${loc%:*}"); { test -e "$a" || test -e "$d/$a"; } && echo "FINDING C5 line-anchor $loc ($a exists)"; else echo "$kind $a $loc"; fi
done
ls_repo ':(glob)**/AGENTS.md' | while IFS= read -r f; do
  grep -qiE 'pointers (here )?name concepts' "$f" || echo "FINDING C5 no stale-tolerance line: $f"
done
# C6 every skill description starts with "Use when" (block scalars `>`, `|`, `>-`, `|-` read the first indented line)
ls_repo ':(glob)**/SKILL.md' | while IFS= read -r s; do
  awk '/^description:[[:space:]]*[>|][-+]?[[:space:]]*$/ { blk = 1; next }
       blk && NF { sub(/^[[:space:]]+/, ""); print; exit }
       /^description:/ { sub(/^description:[[:space:]]*["'\'']?/, ""); print; exit }' "$s" | grep -q '^Use when' \
    || echo "FAIL C6 description does not start with 'Use when': $s"
done
# C7 no bare @path import in an AGENTS.md: Claude expands it into context every time that file loads.
# Code spans and fenced blocks are not imports, so `@<dir>/AGENTS.md` in a routing row passes. Relative paths resolve from the file's folder.
ls_repo ':(glob)**/AGENTS.md' | while IFS= read -r f; do
  awk -v f="$f" '
    /^[[:space:]]*```/ { fence = !fence; next }
    fence { next }
    { t = $0; gsub(/`[^`]*`/, "", t)
      while (match(t, /(^|[[:space:](\[])@[A-Za-z0-9._~\/-]*[A-Za-z0-9_-]\.[A-Za-z0-9]+/)) { a = substr(t, RSTART, RLENGTH); sub(/^[^@]*@/, "", a); print a, f ":" NR; t = substr(t, RSTART + RLENGTH) } }
  ' "$f"
done | while read -r a loc; do
  case "$a" in /*) p=$a;; "~/"*) p=$HOME/${a#"~/"};; *) p=$(dirname "${loc%:*}")/$a;; esac
  if test -f "$p"; then echo "FINDING C7 eager import $loc: @$a ($p, $(wc -l < "$p") lines, loads with this file)"
  else echo "FINDING C7 eager import $loc: @$a (no file at $p)"; fi
done
# C8 every AGENTS.md is at most 500 lines (kit policy, not an Anthropic doc limit)
ls_repo ':(glob)**/AGENTS.md' | while IFS= read -r f; do
  n=$(wc -l < "$f"); if [ "$n" -gt 500 ]; then echo "FINDING C8 over the 500-line kit policy: $f ($n lines)"; fi
done
# C9 project verify skill: .agents/skills/verify/SKILL.md exists, and .claude/skills/verify resolves to it
if test -f .agents/skills/verify/SKILL.md; then
  test -f .claude/skills/verify/SKILL.md || echo "FAIL C9 .claude/skills/verify does not resolve to .agents/skills/verify"
else echo "FINDING C9 no .agents/skills/verify/SKILL.md (add it in Step 2b, or accept: the repo has no runnable surface)"; fi
# C9 every command of the verify skill showed its expected result (no `not observed:` entry from a failed run)
grep -n 'not observed:' .agents/skills/verify/SKILL.md 2>/dev/null | sed 's|^|FAIL C9 unverified command (rerun it in Step 2b): .agents/skills/verify/SKILL.md:|'
# C10 a pull-request template exists in the root, docs/, or .github/ (the same detection as Step 0; an error is not a missing template)
pr_templates() (
  root=$(git rev-parse --show-toplevel) && cd "$root" || exit 2
  for d in . docs .github; do
    test -d "$d" || continue
    find "$d" -mindepth 1 -maxdepth 1 \( -type f \( -iname pull_request_template -o -iname pull_request_template.md -o -iname pull_request_template.txt \) -o -type d -iname pull_request_template \) -print || exit 2
  done
)
if t=$(pr_templates); then [ -n "$t" ] || echo "FINDING C10 no pull-request template (add it in Step 2c, or accept: the repository wants none)"
else echo "ERROR C10 pull-request template check failed (see the message above)"; fi
```

Read each `FINDING` line before you report it. A line anchor on a fictional example path, a count that is a stated policy threshold, a time phrase inside a quoted BAD example, and a value inside a dated record (a file or sentence that carries its own date, such as an incident note or "Measured <date>") are not defects: mark each `accepted` with the reason. If the root `AGENTS.md` names a repository doc guard (a lint script for doc pointers), run it too and add its output to the report.

### Step 4 — Report

Print one table. `Result` is `pass`, `fail (<count>)`, or `findings (<count>)`; copy the counts from the Step 3 output.

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

Below the table, list: files written by Step 1, Step 2, Step 2b, and Step 2c (from their reports), the `verify` skill commands that failed in Step 2b, every open `FAIL` line, every `FINDING` with its accepted/defect decision, and blockers that stopped a step. In Claude Code, tell the user to run `/memory` and confirm `AGENTS.md` is listed (Claude Code v2.1.280 and later list it; on an older version, ask Claude what its project instructions say).

**Idempotency:** on a repository that is already agent-first, Step 1, Step 2, Step 2b, and Step 2c are no-ops by their own contracts, Step 3 prints no `FAIL` line and no unaccepted `FINDING`, and no file is written. Any write on such a repository is a defect: report it.

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
| A `verify` command fails because a service or a dependency is not available | Remove the command from the skill, or ask the user while the server still runs | Run Stop and cleanup first. Keep the command and mark it `not observed:`. Report the failure and ask the user for the fix. Step 2b stays open until the command shows its expected result, also on a later run |

## Anti-Hallucination Checks

- Do not report a check as `pass` unless you ran the Step 3 block in this session and it printed no line for that check.
- Do not claim Step 1 or Step 2 finished unless that skill's own verification ran and printed no failure line.
- Do not claim "no writes" in idempotent runs without `git status --short` showing no path changed by this run.
- Do not claim Claude Code loads `AGENTS.md` from file checks alone; the user's `/memory` output (v2.1.280 and later) or Claude's own answer on an older version is the confirmation.
- A skill you could not load is a blocker to name, not a step to reconstruct from memory.
- Do not write an expected result into the `verify` skill unless you observed it in this session.

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
