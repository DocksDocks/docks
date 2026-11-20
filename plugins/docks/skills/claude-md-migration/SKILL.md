---
name: claude-md-migration
description: Use when a project has a legacy CLAUDE.md or .claude/CLAUDE.md, root or nested, whose content omp must load from AGENTS.md. Audits the files, classifies each section, asks about each Claude-specific section (drop it or keep it in AGENTS.md), moves the approved sections verbatim into AGENTS.md, then deletes the legacy files. Not for a new AGENTS.md without a CLAUDE.md or .claude/ cleanup (use agent-first-setup), nested AGENTS.md nodes (use context-tree), or plan workspaces (use plan-workspace).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-11-20"
  content_hash: "2fd97007a6ffa31bb49a2a4229916325a953fbcf9c0192a6a6f6192c63a5d62d"
---

# CLAUDE.md Migration

Move the content of each legacy `CLAUDE.md` and `.claude/CLAUDE.md` into `AGENTS.md`, then delete the legacy file. `AGENTS.md` is the one home of project instructions for omp.

A legacy file is any `CLAUDE.md` or `.claude/CLAUDE.md` in the project: at the root, or nested in a subfolder (`<dir>/CLAUDE.md`, `<dir>/.claude/CLAUDE.md`). omp loads context files as follows (omp docs, `context-files.md`):

- omp loads `AGENTS.md` and `CLAUDE.md` by an ancestor walk, and keeps one project context file per folder depth. At one depth, `AGENTS.md` comes before `CLAUDE.md`. Thus omp ignores a `CLAUDE.md` next to an `AGENTS.md`, and its content is lost to omp. A `CLAUDE.md` alone at its depth loads.
- omp loads `.claude/CLAUDE.md` only from the folder where the session starts, and then it loads it in place of the `AGENTS.md` of that folder. In every other folder, omp does not load it.
- omp expands `@file` imports in a loaded context file, up to five hops.

So each legacy file either hides content or hides an `AGENTS.md`. This skill never creates a `CLAUDE.md`.

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. If `git rev-parse --show-toplevel` succeeds, use that folder as the project root; otherwise use the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. A run on a migrated project must be a complete no-op. Migrated means: the root `AGENTS.md` is present, and the Step 2 audit prints no `legacy: <path>` line. The root routing table belongs to `context-tree`: Step 6 reports gaps in it to `context-tree`. A routing gap is never a write action for this skill.
</constraint>

<constraint>
The split of a legacy file is a USER decision, not an inference. Classify each section per `references/claude-md-classification.md`. Show each Claude-specific section to the user, one at a time, with the omp `ask` tool: the user drops it or keeps it in `AGENTS.md`. Then show the action table and wait for explicit approval before any write or delete. Do not move ambiguous content without an answer.
</constraint>

<constraint>
No content loss. Move each approved section verbatim to its destination. Every section of a legacy file reaches its destination, unless the user drops it. Write every destination before you delete any legacy file, and delete a legacy file only after all its approved sections are written.
</constraint>

<constraint>
Scope: this skill writes only `AGENTS.md` files, and deletes only legacy `CLAUDE.md` and `.claude/CLAUDE.md` files. It writes no rules file, no file or link under `.claude/`, and no `CLAUDE.md`. It only reports the other `.claude/` entries (agent-first-setup cleans them up) and every `CLAUDE.local.md`.
</constraint>

<constraint>
Detection is read-only. Before any write, inspect with `read`, `find`, `grep`, and read-only shell commands (`test`, `ls`, `git status`, `git rev-parse`, `git ls-files`, and the `audit` and `verify` commands of `scripts/bridge-check.mjs`). Write, `git mv`, and `git rm` come only after the approval gate of Step 4.
</constraint>

<constraint>
Everything this skill writes into `AGENTS.md` is durable: every session reads it as current state. Moved content stays verbatim (user decision). Do not rewrite its volatile lines; report them in Step 7.
</constraint>

## When to Use

- A project has a `CLAUDE.md` or `.claude/CLAUDE.md`, at the root or nested, and the user wants omp to load its content
- The user says "migrate CLAUDE.md to AGENTS.md", "remove CLAUDE.md", or `/docks:claude-md-migration`
- agent-first-setup or context-tree found a legacy file and sent the user here

## Workflow

### Step 1 — Resolve the project root and the layout

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

Run every later command from that root. Then find the layout:

```bash
test -f .omp-plugin/marketplace.json && echo plugin-author
test -f package.json && node -e 'const o = require("./package.json").omp; process.exit(o && typeof o === "object" && !Array.isArray(o) ? 0 : 1)' && echo plugin-author
```

| Layout | Detection | Effect |
|---|---|---|
| **plugin-author** | `.omp-plugin/marketplace.json` at the root, or a root `package.json` with an `omp` object | The plugin `skills/` folders are the plugin content. Do not move, link, or report them |
| **project** | neither | none |

The migration of legacy files runs in both layouts.

### Step 2 — Audit (read-only)

`<skill-dir>` is the folder that holds this `SKILL.md`. Run the audit from any folder in the project:

```bash
node <skill-dir>/scripts/bridge-check.mjs audit
ls -A .claude 2>/dev/null
```

The audit prints, in this order:

| Line | Meaning |
|---|---|
| `EXISTS <entry>` or `MISSING <entry>` | four lines: `AGENTS.md`, `CLAUDE.md (root)`, `.claude/CLAUDE.md`, `CLAUDE.local.md` |
| `legacy skills: .claude/skills` | a root `.claude/skills` folder. omp finds project skills in `.agents/skills/` |
| `legacy agents: <path>` | a `.claude/agents/*.md` file. omp reads project agents only from `.omp/agents/` |
| `legacy settings: <path>` | `.claude/settings.json` or `.claude/settings.local.json`. omp reads `.claude/settings.json` as a project settings source |
| `legacy: <path>` | a `CLAUDE.md` or `.claude/CLAUDE.md`, root or nested. In git, the list holds tracked and untracked files and skips gitignored files and `node_modules` |
| `personal: <path>` | a `CLAUDE.local.md` at any depth. The walk also finds a gitignored file |
| `ERROR <part>: ...` | a listing or a file that the audit cannot read. The cause is on stderr and the exit status is 2. Report it and stop |

Each listing outside git, and the `personal:` walk, skips each `.git`, `node_modules`, `vendor`, `dist`, `build`, `out`, `target`, and `.next` folder. Paths are relative to the project root.

Only the `legacy:` lines are work for this skill. For each nested hit, record its folder `<dir>`: the folder that holds `CLAUDE.md`, or the parent of `.claude/` for `<dir>/.claude/CLAUDE.md`. Record also whether `<dir>/AGENTS.md` exists.

The `legacy skills`, `legacy agents`, and `legacy settings` lines, and each other entry that `ls -A .claude` shows (except `CLAUDE.md`), are report items. Do not change them; agent-first-setup cleans up `.claude/` after its own approval gate.

Each `personal:` line is a personal file. omp does not load `CLAUDE.local.md`. Leave it untouched and report it in Step 7.

### Step 3 — Classify each legacy file

1. `read` each legacy file. A file that holds only an `@AGENTS.md` or `@../AGENTS.md` line (plus blank lines) is a stub from an earlier workaround. It has no content: mark it `DELETE` (cleanup) and do not classify it.
2. If `CLAUDE.md` and `.claude/CLAUDE.md` both exist in one folder, classify the UNION of their sections, so that the destination gets no duplicate or contradicting rule. Classify files in different folders separately.
3. Load `references/claude-md-classification.md` for the signs of Claude-specific content.
4. Split each non-stub file into sections at the `^##` and `^###` headings. Drop a leading `@AGENTS.md` or `@../AGENTS.md` line; it has no destination. Give each section one class:
   - **GENERIC**: no Claude-specific sign. It moves to the `AGENTS.md` at the same depth: the root file to `AGENTS.md`, a nested file to `<dir>/AGENTS.md`.
   - **CLAUDE-SPECIFIC**: it names Claude Code tools, hooks, slash commands, models, settings, or `.claude/` paths. Step 4 asks the user about it.
   - **MIXED**: generic paragraphs with Claude-specific paragraphs. Propose a split by paragraph: the generic paragraphs are GENERIC, the others are CLAUDE-SPECIFIC.
5. Build ONE proposal table for all legacy files. Write nothing yet.

```
| File           | Section                  | Class           | Destination    | Reason                          |
|----------------|--------------------------|-----------------|----------------|---------------------------------|
| CLAUDE.md      | Repository purpose       | GENERIC         | AGENTS.md      | no Claude-specific sign         |
| CLAUDE.md      | Commands                 | GENERIC         | AGENTS.md      | generic build and test commands |
| CLAUDE.md      | Hooks                    | CLAUDE-SPECIFIC | ask            | Claude Code hooks               |
| api/CLAUDE.md  | Endpoint conventions     | GENERIC         | api/AGENTS.md  | generic, folder scope           |
| web/CLAUDE.md  | (stub: @AGENTS.md only)  | -               | DELETE         | import stub, no content         |
```

### Step 4 — Questions and approval gate

1. Print the Step 3 proposal table.
2. For each CLAUDE-SPECIFIC section, one at a time: show its file, heading, and text, and ask with the omp `ask` tool. Give two options: `Drop` and `Keep in <destination>` (the `AGENTS.md` of that file's depth). A kept section moves verbatim, as a GENERIC section does. A dropped section is not written anywhere, and Step 7 names it.
3. Build the action table from the answers:

```
| Target                                       | Action      | Reason                                 |
|----------------------------------------------|-------------|----------------------------------------|
| AGENTS.md                                    | APPEND      | generic and kept sections of CLAUDE.md |
| api/AGENTS.md                                | CREATE      | destination for api/CLAUDE.md          |
| CLAUDE.md                                    | DELETE      | omp ignores it next to AGENTS.md       |
| .claude/CLAUDE.md                            | DELETE      | omp loads it in place of AGENTS.md     |
| web/CLAUDE.md                                | DELETE      | import stub (cleanup)                  |
| .claude/skills, .claude/agents/review.md     | REPORT ONLY | agent-first-setup cleans them up       |
| CLAUDE.local.md                              | REPORT ONLY | personal; omp does not load it         |
| root `## Context tree` row for api/AGENTS.md | HANDOFF     | `context-tree` adds the routing row    |
```

4. Print the action table and ask for approval with the omp `ask` tool. An error, an empty answer, or a default answer is not approval: print the question, write nothing, and end the turn. With no `ask` tool (a headless run), print the open questions as the final message and end the turn. Silence is not consent; an ambiguous answer shows the tables again. With nothing to write (the project is migrated), report the no-op and stop.

`REPORT ONLY` means: list the entry in the final report and do not touch it. `HANDOFF` means: this skill does not write it; the report names the owning skill.

### Step 5 — Apply

Apply the approved rows in this order. Write every destination before you delete any legacy file.

0. **Backup**: before the first write, copy each existing file that the approved table changes or deletes to a folder OUTSIDE the repository, with relative paths kept. Never use `git stash` as a backup: it reverts the working tree.
   ```bash
   root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
   b="${XDG_STATE_HOME:-$HOME/.local/state}/claude-md-migration/$(basename "$root")-$(date -u +%Y%m%dT%H%M%SZ)"
   for p in <each path the table changes or deletes>; do
     test -e "$p" || continue
     mkdir -p "$b/$(dirname "$p")" && cp -p "$p" "$b/$p"
   done
   echo "backup: $b"
   ```
   To restore, copy the files back from `$b`. The per-section check of Step 6 reads the legacy files from `$b`.
1. **Root `AGENTS.md`**: if it exists, append the approved sections under a `## Migrated from CLAUDE.md` heading; never overwrite it. If it is missing, create it with the approved sections. If no legacy file gives it a section (only stubs), create it from `references/agents-md-template.md` and follow the fill rules of the template; leave the `## Context tree` rows to `context-tree`.
2. **Nested `<dir>/AGENTS.md`**: create it with the approved sections of that folder, or append them under a `## Migrated from <dir>/CLAUDE.md` heading; never overwrite it. Do not add the root routing row; Step 7 hands it to `context-tree`.
3. **Delete the legacy files**: last, only after steps 1 and 2 succeeded for every file. Delete each file that the table marks `DELETE`: `git rm <path>` in a git repository (for example `git rm CLAUDE.md .claude/CLAUDE.md api/CLAUDE.md`), `rm <path>` outside git. Report which one you used. Leave an empty `.claude/` folder in place; agent-first-setup removes it. Never touch a `CLAUDE.local.md`.

### Step 6 — Verify

Run the verification and the git status check. Add one `--expect <path>` pair for each nested `AGENTS.md` that Step 5 wrote:

```bash
node <skill-dir>/scripts/bridge-check.mjs verify --expect <dir>/AGENTS.md
git status --short
```

With no nested `AGENTS.md` written, run `verify` with no `--expect` pair. It only reads, and it prints:

| Line | Meaning |
|---|---|
| `BROKEN: AGENTS.md missing` | no root `AGENTS.md` |
| `BROKEN: legacy CLAUDE.md still present: <path>` | a legacy file, root or nested (the same list as Step 2) |
| `BROKEN: <path> missing` | an `--expect` path that is not a file |
| `HANDOFF context-tree: unrouted node <path>`, `HANDOFF context-tree: dead route <path>` | a gap in the root routing, which `context-tree` owns. A row is a table line whose first cell is `<dir>/AGENTS.md` in backticks; a leading `@` inside the backticks is stripped |
| `VOLATILE time-relative <file>:<line>`, `VOLATILE bare-count <file>:<line>`, `VOLATILE line-anchor <file>:<line> (<path> exists)` | a volatile value in an `AGENTS.md`. Moved text stays verbatim. Fenced blocks and URLs are skipped everywhere; code spans and quoted text are skipped for the time and count rules only |
| `ERROR <part>: cannot read <file>`, `ERROR <part>: file listing failed (see the message above)` | a file or a listing that the check cannot read. The cause is on stderr, and the exit status is 2. Report it and stop; it is never a pass |

No output means that the migration is complete. If a `BROKEN:` line appears, STOP and report; do not claim success. `HANDOFF` and `VOLATILE` lines are report items, not failures. The `.claude/` entries are not part of this check.

Then do the per-section presence check: every `^#{1,3}` section of each non-stub legacy file in `$b` must appear in its approved `AGENTS.md` destination, unless the user dropped it. Per legacy file, the moved lines must be at least the source lines minus the dropped import line and the lines of the dropped sections (net-shrink tripwire). A missing section that the user did not drop means content loss: restore from `$b` and stop.

### Step 7 — Report

1. The layout (plugin-author or project)
2. The files created, appended, and deleted (full paths), and whether `git rm` or `rm` deleted them
3. The split per legacy file: the sections moved to each `AGENTS.md`, the Claude-specific sections kept, the sections dropped, and the stubs deleted
4. The `.claude/` entries left in place (`legacy skills`, `legacy agents`, `legacy settings`, and other entries): run agent-first-setup to clean them up
5. Each `CLAUDE.local.md`: a personal file that omp does not load, left untouched. For personal context in omp, the user can add the file name to the `contextFiles.extra` setting, or move the content to `~/.omp/agent/AGENTS.md`
6. `VOLATILE` lines from Step 6 as follow-ups: replace each with the owning file or rule plus a `(verify: <command>)`
7. `HANDOFF context-tree` lines and each nested `AGENTS.md` that this run created: run `context-tree` next to add the routing rows

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| `CLAUDE.md` next to `AGENTS.md` left in place because omp loads `AGENTS.md` | omp ignores the `CLAUDE.md`, so its content is lost | Move its content (Steps 3 to 5), then delete it |
| `.claude/CLAUDE.md` left in place | omp loads it in place of the root `AGENTS.md` when a session starts at the root | Move its content into `AGENTS.md`, then delete it |
| Claude-specific section dropped without a question | The user loses a rule that they wanted | Ask about each one with `ask` (Step 4) |
| Claude-specific section written to a new file under `.claude/` | omp does not load it, and the project has two homes for instructions | Keep it in `AGENTS.md` or drop it, as the user decides |
| `.claude/skills`, `.claude/agents`, or settings files changed by this skill | Outside the scope of this skill | Report them; agent-first-setup cleans them up behind its own gate |
| `CLAUDE.local.md` deleted or moved | Personal content lost | Report it only; name `contextFiles.extra` and `~/.omp/agent/AGENTS.md` |
| `git stash push -u` used as the backup | It reverts the working tree | Copy the files to the backup folder outside the repository (Step 5.0) |
| Existing `AGENTS.md` overwritten | Project rules lost | Append under a `## Migrated from ...` heading |
| Legacy file deleted before its content is written | Content lost if a later write fails | Write every `AGENTS.md` first; delete the legacy files last |
| Only `./CLAUDE.md` checked | `.claude/CLAUDE.md` and nested files stay | Use the `legacy:` lines of the Step 2 audit |
| Nested `api/CLAUDE.md` content put in the root `AGENTS.md` | Folder rules load in every session | Move it to `api/AGENTS.md`, at the same depth |
| Root routing row added by this skill | Two skills own the routing table | Report `HANDOFF context-tree` |
| `git rm` used outside git | The command fails | Use `git rm` in a repository and `rm` outside it; report which |

## Anti-Hallucination Checks

- Before you report "migrated", confirm `test -f AGENTS.md` succeeds and Step 6 printed no `BROKEN:` line
- Before you report "no legacy CLAUDE.md", confirm the Step 2 audit printed no `legacy:` line, root or nested
- Do the per-section presence check of Step 6 against the backup before you report a split
- `git status --short` at the end must show only paths that this skill touched; examine any other entry before you report "done"
- Do not claim a layout without the Step 1 check output

## References

- `references/claude-md-classification.md`: the signs of Claude-specific content, the split rules for mixed sections, and the nested destinations
- `references/agents-md-template.md`: the `AGENTS.md` scaffold with its durable-fact fill rules, used only when the root `AGENTS.md` is missing and no legacy section fills it

## Report a problem with this skill

When this skill gives a wrong, outdated, or unsafe instruction, or a script that it ships fails, report the problem in the public DocksDocks/docks repository. Use the docks `report-skill-issue` skill for the report. If that skill is not installed, do not file anything: give the user a draft instead. The draft names this skill and its plugin version, quotes the instruction, and states what happened and what you expected. Leave out secrets and private names.
