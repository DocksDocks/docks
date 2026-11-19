---
name: multi-tool-bridge
description: Use when setting up multi-tool agent compatibility in a project (Codex + Claude Code) — creates canonical AGENTS.md, migrates .claude/skills/ to .agents/skills/, symlinks Claude skill entries back, migrates legacy CLAUDE.md content, root or nested (generic → AGENTS.md or the folder AGENTS.md, Claude-specific → .claude/rules/claude-code.md or a path-scoped .claude/rules/ file), and removes every CLAUDE.md so Claude Code loads AGENTS.md natively. Idempotent. Not for plan workspace setup or refresh (use plan-workspace), splitting per-area rules into AGENTS.md nodes (use context-tree), porting Claude subagents to Codex TOML (use skill-agent-pipeline), or one-shot full repo setup (use agent-first-setup).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-11-19"
  content_hash: "2e51925050720158b5e85ba03a9cc2bc664e55daa79670ae9c00b967496d3dcf"
---

# Multi-Tool Agent Bridge

Make a project work cleanly in Codex, Claude Code, OpenCode, VS Code Copilot, and any other agentskills.io-compliant tool. Canonical content lives at the multi-tool paths (`AGENTS.md`, `.agents/skills/`). Claude Code v2.1.277+ reads `AGENTS.md` natively, so no `CLAUDE.md` is needed. Claude Code does not read `.agents/`, so `.claude/skills/<name>` stays a symlink to `.agents/skills/<name>`. This is the pattern the agentskills.io implementation guide endorses.

A legacy CLAUDE.md is any `CLAUDE.md` or `.claude/CLAUDE.md` in the project: at the root, or nested in a subdirectory (`<dir>/CLAUDE.md`, `<dir>/.claude/CLAUDE.md`). By default, when a `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` exists in the working directory or above, Claude Code reads the CLAUDE.md files, not AGENTS.md. A CLAUDE.md without an `@AGENTS.md` import makes Claude read it instead of AGENTS.md: that is the defect this skill fixes (migrate the content, then delete the file). A stub that holds only `@AGENTS.md` / `@../AGENTS.md` still delivers AGENTS.md through the import; it is redundant, not harmful. Kit policy removes it as cleanup, behind the approval gate. This skill never creates a CLAUDE.md.

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. If `git rev-parse --show-toplevel` succeeds, prefer that as the project root; otherwise use the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. Re-running on a fully-bridged project must be a complete no-op. Fully bridged = `AGENTS.md` present, every `.claude/skills/<name>` a symlink to `../../.agents/skills/<name>`, and no legacy CLAUDE.md present at the root OR nested (the Step 2 audit prints no `legacy:` line). `AGENTS.md` already present → SKIP creation. `.claude/skills/<name>` already a symlink to the correct target → SKIP. The root routing table belongs to `context-tree`: Step 6 reads it with the shared row rule (`## Context tree` section, first cell `` `<dir>/AGENTS.md` ``, a leading `@` inside the backticks tolerated) and reports gaps to `context-tree`. A routing gap is never a write action for this skill.
</constraint>

<constraint>
The legacy CLAUDE.md content split is a USER decision, not an inference. When a legacy CLAUDE.md (root or nested) holds more than an `@AGENTS.md` stub, classify its content into AGENTS.md candidates and Claude-specific keepers for `.claude/rules/` per `references/claude-md-classification.md`, present the proposed split as a table (File → Section → Destination → Reason), and **wait for explicit user confirmation** before writing any file or deleting CLAUDE.md. Do not auto-move ambiguous content.
</constraint>

<constraint>
Detection is read-only. Before any write, classify every target with `Read`/`Glob`/`Grep` and read-only `Bash` (`test`, `ls`, `readlink`, `find`, `git status`/`rev-parse`/`ls-files`, and the `audit` and `verify` commands of `scripts/bridge-check.mjs`). Only after the user approves the action table (Step 4 approval gate) do you switch to `Write`/`Edit`/`git mv`/`git rm`/`ln`. Never write blindly.
</constraint>

<constraint>
Everything this skill writes into `AGENTS.md` is durable: read as current state in every session. Written text carries no line-number anchors (`path:NN`), no live versions, counts, sizes, or dates, and no "currently"/"now"/"recently". Name the file or config key that owns a value and add `(verify: <command>)`. A fact owned by another file gets a backticked path, not a copy. Content moved from a legacy CLAUDE.md is moved verbatim (user decision); report its volatile lines in Step 7 instead of rewriting them.
</constraint>

## When to Use

- Setting up a project to work in both Codex and Claude Code (any project where the user types "make this work with Codex too" or "set up AGENTS.md")
- Standardizing on `.agents/skills/` as the canonical location (per [agentskills.io's recommendation](https://agentskills.io/client-implementation/adding-skills-support))
- Adding the bridge to an existing Claude-only project (auto-detects layout)
- Removing a legacy CLAUDE.md so Claude Code loads AGENTS.md natively: migrate a content file, delete a redundant `@AGENTS.md` stub
- The user says "set up AGENTS.md", "migrate CLAUDE.md to AGENTS.md", "make this multi-tool", or `/docks:multi-tool-bridge`

## Workflow

### Step 1 — Resolve project root + detect layout

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

Classify the project into one of three layouts. The layout controls only the skills migration. Root `AGENTS.md` creation and legacy CLAUDE.md migration run in EVERY layout when Step 2 finds a legacy file (a repo with only a root `CLAUDE.md` is greenfield and still migrates it).

| Layout | Detection | Skills step |
|---|---|---|
| **consumer** | has `.claude/skills/<dir>` but no `.claude-plugin/` and no `plugins/*/skills/` | Migrate `.claude/skills/` → `.agents/skills/` + symlinks |
| **plugin-author** | has `.claude-plugin/` at root OR `plugins/*/.claude-plugin/plugin.json` | None (skills stay inside the plugin) |
| **greenfield** | no project skills to migrate: no `.claude/skills/<dir>` and no plugin (includes a `.claude/` without `skills/`) | None |

### Step 2 — Audit (read-only)

`<skill-dir>` is the folder that holds this `SKILL.md`. Its `scripts/bridge-check.mjs` holds the read-only checks of Step 2 and Step 6. Run the audit from any folder inside the project:

```bash
node <skill-dir>/scripts/bridge-check.mjs audit
```

It prints nine `EXISTS <entry>` or `MISSING <entry>` lines, in this order: `AGENTS.md`, `CLAUDE.md (root)`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.agents/skills/`, `.claude/skills/`, `.claude/agents/`, `.claude/rules/`, `.claude/rules/claude-code.md`. Then it enumerates every legacy file, root and nested, in one read-only pass:

- `legacy: <path>` for each `CLAUDE.md` and `.claude/CLAUDE.md`. In a git repo, the listing holds tracked and untracked files, and it skips gitignored build output and `node_modules`.
- `personal: <path>` for each `CLAUDE.local.md` at any depth. `CLAUDE.local.md` is usually gitignored, so this listing walks the folder, also in a git repo.

The `personal:` walk, and every listing outside git, skips each `.git`, `node_modules`, `vendor`, `dist`, `build`, `out`, `target`, and `.next` folder. Paths are relative to the project root, without a leading `./`.

Each `legacy:` path is a legacy file. For a nested hit, record its folder `<dir>`: the folder that holds `CLAUDE.md`, or the parent of `.claude/` for `<dir>/.claude/CLAUDE.md`. Record also whether `<dir>/AGENTS.md` exists. Step 6 runs the same enumeration.

Any of `./CLAUDE.md`, `./.claude/CLAUDE.md`, or `./CLAUDE.local.md` makes Claude Code read the CLAUDE.md files instead of AGENTS.md. While one exists, a nested `<dir>/AGENTS.md` does not load natively either (Claude Code lazy-loads a subdirectory AGENTS.md only when no CLAUDE.md counts). A nested `CLAUDE.md` / `.claude/CLAUDE.md` without an import makes Claude read it instead of `<dir>/AGENTS.md`. All `CLAUDE.md` / `.claude/CLAUDE.md` files are legacy: migrate and delete them in Steps 3–5. `CLAUDE.local.md`, root or nested, is personal and usually gitignored: report it only, and tell the user it also makes Claude read CLAUDE.md files instead of AGENTS.md.

`.claude/rules/*.md` files load alongside AGENTS.md and do not count for the CLAUDE.md check. `.claude/rules/claude-code.md` is the destination for Claude-specific content. Nested Claude-specific content goes to `.claude/rules/<dir-slug>.md` at the project root (`<dir>` with `/` replaced by `-`, e.g. `packages/api` → `packages-api.md`). Leave existing rule files untouched; record whether `claude-code.md` and each `<dir-slug>.md` exist, because Step 5 then appends instead of creating.

Enumerate `.claude/skills/*/SKILL.md` via Glob. For each, capture the skill name (directory basename). These are the migration candidates.

### Step 3 — Classify legacy CLAUDE.md (when Step 2 found any, root or nested)

1. `Read` each legacy file. If a file holds only an `@AGENTS.md` or `@../AGENTS.md` line (plus blank lines), it is a stub from an earlier workaround. It still delivers AGENTS.md through the import, so it is redundant, not a defect: mark it `DELETE` (cleanup) with no classification.
2. If BOTH files exist in one folder (`CLAUDE.md` and `.claude/CLAUDE.md` at the root, or both under the same `<dir>`), Claude Code loaded and concatenated both: classify the UNION of their sections, so a rule in one file is not duplicated or contradicted by the other. Both files are deleted after the content moves. Files in different folders are classified separately; each keeps its own destinations.
3. Load `references/claude-md-classification.md` for the keyword rules.
4. Walk each non-stub file section by section (split on `^##` and `^###` headings). Drop a leading `@AGENTS.md` / `@../AGENTS.md` line; it has no destination. For each section, score:
   - **GENERIC** (root file → `AGENTS.md`; nested file → `<dir>/AGENTS.md`): no Claude-specific keywords; covers build/test/style/security/repo-layout/engineering rules.
   - **CLAUDE-SPECIFIC** (root file → `.claude/rules/claude-code.md`; nested file → `.claude/rules/<dir-slug>.md` with `paths:` frontmatter `- "<dir>/**"`, so the content keeps its folder scope): contains `.claude/`, `.claude-plugin/`, `subagent_type`, `Plan Mode`, `ExitPlanMode`, `Skill tool`, `Agent tool`, `Anthropic`, `claude-opus`/`claude-sonnet`/`claude-haiku`, RTK references, auto memory (`~/.claude/projects/`), `CLAUDE_CODE_*` env vars.
   - **MIXED** (propose split): generic content with isolated Claude-specific references; recommend splitting paragraph-by-paragraph.
5. Build ONE proposal table for all legacy files — no writes yet. The File column names the source of each row:

```
| File           | Section                    | Destination                     | Reason                                |
|----------------|----------------------------|---------------------------------|---------------------------------------|
| CLAUDE.md      | Repository purpose         | → AGENTS.md                     | no Claude-specific keywords           |
| CLAUDE.md      | Environment / commands     | → AGENTS.md                     | generic build/test/dev commands       |
| CLAUDE.md      | Auto memory section        | → .claude/rules/claude-code.md  | references ~/.claude/projects/        |
| CLAUDE.md      | Plan Mode workflow         | → .claude/rules/claude-code.md  | references ExitPlanMode + Skill tool  |
| api/CLAUDE.md  | Endpoint conventions       | → api/AGENTS.md                 | generic, folder-scoped                |
| api/CLAUDE.md  | Subagent for API tests     | → .claude/rules/api.md          | references subagent_type; paths api/** |
| web/CLAUDE.md  | (stub: @AGENTS.md only)    | DELETE                          | redundant import stub (cleanup)       |
```

6. Do not stop here. Step 4 shows this proposal together with the action table at one approval gate.

### Step 4 — Build the action table

After classification (or in layouts without a legacy CLAUDE.md, where classification is skipped), build the full action table:

```
| Target                                              | Action          | Reason                                   |
|-----------------------------------------------------|-----------------|------------------------------------------|
| AGENTS.md                                           | CREATE          | not present                              |
| .agents/skills/                                     | CREATE DIR      | not present                              |
| .claude/skills/code-review → .agents/skills/...     | MIGRATE+SYMLINK | found in .claude/skills/                 |
| .claude/rules/claude-code.md                        | MOVE→RULES      | Claude-specific keepers approved         |
| api/AGENTS.md                                       | CREATE+POPULATE | destination for generic api/CLAUDE.md    |
| .claude/rules/api.md (paths: "api/**")              | MOVE→RULES      | nested Claude-specific keepers           |
| CLAUDE.md                                           | DELETE          | content without import; Claude reads it instead of AGENTS.md |
| api/CLAUDE.md                                       | DELETE          | content without import; hides api/AGENTS.md |
| web/CLAUDE.md                                       | DELETE          | redundant `@AGENTS.md` stub (cleanup)    |
| CLAUDE.local.md, api/CLAUDE.local.md                | SURFACE ONLY    | personal; Claude reads CLAUDE.md files instead of AGENTS.md |
| .claude/agents/                                     | SURFACE ONLY    | Codex .toml format mismatch              |
| root `## Context tree` row for api/AGENTS.md        | HANDOFF         | `context-tree` adds the routing row      |
```

`SURFACE ONLY` means: list with one-line summaries in the final report, do NOT touch. `HANDOFF` means: this skill does not write it; the report names the owning skill.

**Approval gate** — print the Step 3 proposal table (when Step 3 ran) and this action table, then ask for approval with the harness question tool (omp `ask`, Claude Code `AskUserQuestion`, Codex `request_user_input` where the mode has it, OpenCode `question`; use the tool the harness registers, even when it is not listed). By default Codex offers the tool only in Plan mode; in Default mode the call returns an "unavailable" error, or, with the under-development `default_mode_request_user_input` feature, sends the request as non-blocking (`isBlocking: false`), which the client may resolve without the user. An error, empty, or default result is not approval: print the question, write nothing, and end the turn. Codex takes at most 3 questions per call, and each question needs options (Codex adds a free-text "Other"); split a larger set into consecutive calls. Batch every open question (approval, mixed-section splits) into one call. A plain-text "Approve? yes/no" in the reply is wrong when a question tool exists. If the harness registers no question tool (headless or print-mode runs), print the question as the final message and end the turn; do not invent a tool call. This is the only gate of the run. Do not call Write/Edit/`git mv`/`git rm`/`ln` until the user approves (or amends) both tables in their answer. Silence is not consent; an ambiguous answer re-shows the tables. With nothing to write (fully bridged), report the no-op and stop.

### Step 5 — Apply

Apply the approved rows in this order. Write every destination (root and folder AGENTS.md files, every rules file) BEFORE any CLAUDE.md is deleted.

0. **Backup** — before the first write, copy every existing file the approved table changes or deletes (each legacy CLAUDE.md, and each AGENTS.md or rules file that gets an append) to a directory OUTSIDE the repository, with relative paths kept. Never use `git stash` as a backup: it reverts the working tree. Moved skill directories keep their content; `git mv` (or `mv`) back reverses them.
   ```bash
   root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
   b="${XDG_STATE_HOME:-$HOME/.local/state}/multi-tool-bridge/$(basename "$root")-$(date -u +%Y%m%dT%H%M%SZ)"
   for p in <each path the table changes or deletes>; do
     test -e "$p" || continue
     mkdir -p "$b/$(dirname "$p")" && cp -p "$p" "$b/$p"
   done
   echo "backup: $b"
   ```
   Restore = copy the files back from `$b`. The per-section presence check in Anti-Hallucination reads the legacy files from `$b`.

1. **AGENTS.md** —
   - **CREATE** (no root `AGENTS.md`, and no generic content to move): write the verbatim content from `references/agents-md-template.md`, filling in project-specific placeholders the user provides (or marking them `<!-- TODO -->`). Follow the template's fill rules: commands plus the file that defines them, no version numbers or counts. Leave the `## Context tree` rows to `context-tree`.
   - **CREATE+POPULATE** (legacy CLAUDE.md with generic sections): write the generic sections moved from CLAUDE.md. If AGENTS.md already exists, append them; never overwrite it.
   - **Nested** (`<dir>/CLAUDE.md` with generic sections): `<dir>/AGENTS.md` is only the destination for that migrated content. Create it if missing, else append a `## Migrated from CLAUDE.md` section. Never overwrite it. Nested node structure and the root routing row belong to `context-tree`: do not add the row; report `context-tree` as the next step (Step 7).

2. **`.agents/skills/`** — `mkdir -p .agents/skills` if missing.

3. **Per-skill migration** (consumer layout only):
   ```bash
   git mv .claude/skills/<name> .agents/skills/<name>
   ln -s ../../.agents/skills/<name> .claude/skills/<name>
   ```
   After creating each entry, run `readlink .claude/skills/<name>`; expect `../../.agents/skills/<name>`.
   Skip when destination already exists. If `.claude/skills/<name>` is already a symlink pointing at the right target → SKIP. If it's a symlink pointing somewhere else → STOP and ask the user (do not silently fix).

4. **MOVE→RULES** (approved Claude-specific keepers exist): `mkdir -p .claude/rules`, then:
   - If `.claude/rules/claude-code.md` is missing, create it with a `# Claude Code` heading followed by the approved sections, verbatim. Write no `paths:` frontmatter, so it loads every session. A path-scoped keeper may go in its own rules file with `paths:` frontmatter on user approval.
   - If it exists, append a `## Migrated from CLAUDE.md` section with the approved sections. Never overwrite the file.
   - Nested keepers go to `.claude/rules/<dir-slug>.md`. If missing, create it with this frontmatter, then a `# <dir>` heading and the approved sections verbatim:
     ```markdown
     ---
     paths:
       - "<dir>/**"
     ---
     ```
     If it exists, append a `## Migrated from <dir>/CLAUDE.md` section; never overwrite it or change its frontmatter.

5. **DELETE CLAUDE.md** — last, only after steps 1 and 4 succeeded for every file. Delete each legacy file, root and nested, that the table marks `DELETE`. In a git repo, `git rm <path>` (e.g. `git rm CLAUDE.md .claude/CLAUDE.md api/CLAUDE.md`); outside a repo, `rm`. Report which was used. Never touch any `CLAUDE.local.md`.

### Step 6 — Verify

After all writes, run the verification and the git status check. Add one `--expect <path>` pair for each rules file and each folder `AGENTS.md` that Step 5 wrote, for example:

```bash
node <skill-dir>/scripts/bridge-check.mjs verify --expect .claude/rules/claude-code.md --expect .claude/rules/<dir-slug>.md --expect <dir>/AGENTS.md
git status --short
```

When Step 5 wrote no rules file and no folder `AGENTS.md`, run the command with no `--expect` pair. It only reads, and it prints:

| Line | Meaning |
|---|---|
| `BROKEN: <path>` | a `.claude/skills/*` entry that does not resolve |
| `BROKEN: AGENTS.md missing` | no root `AGENTS.md` |
| `BROKEN: legacy CLAUDE.md still present: <path>` | a legacy CLAUDE.md, root or nested (the same enumeration as Step 2) |
| `BROKEN: <path> missing` | an `--expect` path that is not a file |
| `HANDOFF context-tree: unrouted node <path>`, `HANDOFF context-tree: dead route <path>` | a gap in the root routing, which `context-tree` owns. The row rule is the same as agent-first-setup Step 3 C2: a row is a table line whose first cell is `<dir>/AGENTS.md` in backticks; a leading `@` inside the backticks is stripped |
| `VOLATILE time-relative <file>:<line>`, `VOLATILE bare-count <file>:<line>`, `VOLATILE line-anchor <file>:<line> (<path> exists)` | a volatile value in an `AGENTS.md`. Migrated text stays verbatim. The scan is the same as agent-first-setup Step 3 C5: fenced blocks and URLs are skipped everywhere; code spans and quoted text are skipped for the time and count rules only |
| `ERROR <part>: cannot read <file>`, `ERROR <part>: file listing failed (see the message above)` | a file or a file listing that the check cannot read (the Step 2 audit prints these lines too). The cause is on stderr, and the command exits with status 2. Report it and stop; it is never a pass |

No output from the verification means that the bridge is complete. If any `BROKEN:` line appears, STOP and report — do not claim success. `HANDOFF` and `VOLATILE` lines are report items, not failures.

Tell the user to open Claude Code in the project and run `/memory`: `AGENTS.md` must be listed. Claude Code v2.1.280+ lists it; on v2.1.277–v2.1.279, `/memory` does not list an AGENTS.md that Claude read directly, so ask Claude what its project instructions say instead.

### Step 7 — Report

Final report (markdown):

1. Layout detected (consumer / plugin-author / greenfield)
2. Files created / moved / symlinked / deleted (full paths)
3. Legacy CLAUDE.md split per file (root and nested): sections → AGENTS.md or `<dir>/AGENTS.md`, sections → `.claude/rules/claude-code.md` or `.claude/rules/<dir-slug>.md`, files deleted (stubs included)
4. `.claude/agents/` and `CLAUDE.local.md` SURFACE inventory (human decides)
5. How to test in Codex: `codex` reads `.agents/skills/` and loads the AGENTS.md files from the project root down to the working directory at session start. It does not load a nested node below the working directory until an agent opens it, so the root `## Context tree` table is how a Codex session finds a node.
6. How to test in Claude Code (`/memory` lists AGENTS.md on v2.1.280+; `/skills` lists each skill)
7. Risks / known limitations: subagent format mismatch. Claude reads CLAUDE.md files only, and so no AGENTS.md, in these sessions: Claude Code before v2.1.277; the built-in `agents-md` plugin disabled; sometimes the first session after an upgrade from v2.1.276 or earlier; before v2.1.281, some sessions such as Amazon Bedrock or telemetry disabled. The documented workaround there is an `@AGENTS.md` import in a CLAUDE.md, which kit policy removes: tell the user.
8. `VOLATILE` lines from Step 6 as follow-ups: replace each with the owning file or rule plus a `(verify: <command>)`
9. `HANDOFF context-tree` lines and every nested `<dir>/AGENTS.md` this run created: run `context-tree` next to add the routing rows (and the stale-tolerance line if the root lacks it)

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| CLAUDE.md with content and no `@AGENTS.md` import left in place | Claude reads it instead of AGENTS.md | Migrate its content (Steps 3–5), then delete it; verify with `test ! -e` |
| One-line `@AGENTS.md` stub | Report it as a load failure, though it still delivers AGENTS.md through the import | Report it as redundant and delete it as cleanup behind the approval gate; while any root CLAUDE.md exists, a nested AGENTS.md without its own stub does not load |
| Claude-specific keepers written into CLAUDE.md | Recreates a CLAUDE.md without an import, so Claude reads it instead of AGENTS.md | Put keepers in `.claude/rules/claude-code.md`; it loads alongside AGENTS.md |
| `git stash push -u` used as the backup | It reverts the working tree, so later writes run on HEAD and uncommitted edits disappear | Copy the files to the backup directory outside the repo (Step 5.0) |
| Existing `.claude/rules/claude-code.md` overwritten | User rules lost | Append a `## Migrated from CLAUDE.md` section; never overwrite |
| CLAUDE.md deleted before its content is written elsewhere | Content lost if a later write fails | Write AGENTS.md and the rules file first; delete CLAUDE.md last |
| Legacy CLAUDE.md split without classifying content | Sections land in the wrong file or get dropped | Step 3 classification with user approval gate — never split content silently |
| Symlink target overwrites a directory the user had at `.claude/skills/<name>` | `ln -sf` blasts the original | `test -L` first; if a real dir exists, ABORT and ask the user |
| `.claude/skills/` symlinks removed because Claude Code reads AGENTS.md now | Claude Code loses every skill | Keep the symlinks; Claude Code does not read `.agents/` |
| `.claude/agents/*.md` auto-converted to `.codex/agents/*.toml` | Quietly translating format and model names | SURFACE ONLY — Codex subagents are TOML with different model namespace; let the user decide whether to port |
| Plugin-author repo migrates `plugins/docks/skills/` to `.agents/skills/` | Treats plugin-internal skills as project-level skills | Layout detection (Step 1) skips skills migration when `.claude-plugin/` is present |
| `git mv` fails outside a git repo | Falling back to silent `mv` and losing rename tracking | Use `git mv` / `git rm` when in a repo; plain `mv` / `rm` otherwise; report which was used |
| Mixed-content section split paragraph-by-paragraph without user input | Author intent lost | Show the proposed split and ask with the harness question tool at the Step 4 gate; unsure mixed sections default to `.claude/rules/claude-code.md` |
| Only `./CLAUDE.md` checked; project keeps memory at `./.claude/CLAUDE.md` | Skill reports "no CLAUDE.md" and Claude keeps reading CLAUDE.md instead of AGENTS.md | Audit BOTH locations (Step 2) |
| Nested `api/CLAUDE.md` skipped, or its keepers put in `claude-code.md` | Claude keeps reading `api/CLAUDE.md` instead of `api/AGENTS.md`, or folder rules load in every session | Enumerate nested files (Step 2); generic → `api/AGENTS.md`, keepers → `.claude/rules/api.md` with `paths: - "api/**"` |
| Only `git ls-files --exclude-standard` used to find `CLAUDE.local.md` | Ignored files are skipped, so a gitignored nested `CLAUDE.local.md` is never reported | Use the `personal:` lines of the Step 2 audit; its walk also finds an ignored file |
| Nested `AGENTS.md` created by migration, then this skill adds the root row | Two skills own the routing table | Report `HANDOFF context-tree`; `context-tree` adds the `## Context tree` row |
| Template filled with a Node version, a test count, or a directory tree | The root lies after the next upgrade or new folder | Name the file that pins the value plus `(verify: …)`; route folders through the checked `## Context tree` table only |

## Anti-Hallucination Checks

- Before reporting "migrated", run `test -L .claude/skills/<name>` and `test -e .agents/skills/<name>/SKILL.md` — both must succeed
- Before reporting "AGENTS.md loads natively", confirm `test -f AGENTS.md` succeeds and the Step 6 verification prints no `BROKEN: legacy CLAUDE.md still present:` line
- After the move, confirm every original `^#{1,3}` section of each non-stub legacy CLAUDE.md, root AND nested, appears in its approved destination (`AGENTS.md`, `<dir>/AGENTS.md`, `.claude/rules/claude-code.md`, or `.claude/rules/<dir-slug>.md`) — **per-section presence**, not a byte-%. Read the source sections from the Step 5 backup directory. A missing section that was not an explicit user `DROP` ⇒ restore from the backup and stop (do not claim "migrated")
- `git status --short` at the end must only show paths this skill touched; investigate any other entries before reporting "done"
- Do NOT claim a layout type without the detection check in Step 1 actually returning matches
- Before reporting "no legacy CLAUDE.md", confirm the Step 2 audit printed no `legacy:` line, root or nested
- Do NOT claim Claude Code loads AGENTS.md from the file checks alone; the `/memory` check in Step 6 is the user's confirmation

## References

- `references/agents-md-template.md` — the AGENTS.md scaffold (agents.md-spec-compliant) with its durable-fact fill rules, the `## Context tree` routing section (rows owned by `context-tree`), and the stale-tolerance line
- `references/claude-md-classification.md` — keyword rules and section-by-section heuristics for splitting legacy CLAUDE.md content between AGENTS.md and `.claude/rules/`, including nested destinations and the `paths:` frontmatter format
- Companion: when porting Claude subagents to Codex (`.claude/agents/*.md` → `.codex/agents/*.toml`), use the `skill-agent-pipeline` skill — its Phase 5 drafts every agent in BOTH formats; format mismatch and model-name translation make symlinks unsuitable. Out of scope here.

## Report a problem with this skill

When this skill gives a wrong, outdated, or unsafe instruction, or a script that it ships fails, report the problem in the public DocksDocks/docks repository. Use the docks `report-skill-issue` skill for the report. If that skill is not installed, do not file anything: give the user a draft instead. The draft names this skill and its plugin version, quotes the instruction, and states what happened and what you expected. Leave out secrets and private names.
