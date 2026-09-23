---
name: multi-tool-bridge
description: Use when setting up multi-tool agent compatibility in a project (Codex + Claude Code) — creates canonical AGENTS.md, migrates .claude/skills/ to .agents/skills/, symlinks Claude skill entries back, migrates legacy CLAUDE.md content, root or nested (generic → AGENTS.md or the folder AGENTS.md, Claude-specific → .claude/rules/claude-code.md or a path-scoped .claude/rules/ file), and removes every CLAUDE.md so Claude Code loads AGENTS.md natively. Idempotent. Not for plan workspace setup or refresh (use plan-workspace), splitting per-area rules into AGENTS.md nodes (use context-tree), porting Claude subagents to Codex TOML (use skill-agent-pipeline), or one-shot full repo setup (use agent-first-setup).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-09-23"
  content_hash: "5fa6aae10851b119e3c16f659dfdaccf8a296d2e2f77b4d00d386f11824b3d41"
---

# Multi-Tool Agent Bridge

Make a project work cleanly in Codex, Claude Code, OpenCode, VS Code Copilot, and any other agentskills.io-compliant tool. Canonical content lives at the multi-tool paths (`AGENTS.md`, `.agents/skills/`). Claude Code v2.1.277+ reads `AGENTS.md` natively, so no `CLAUDE.md` is needed. Claude Code does not read `.agents/`, so `.claude/skills/<name>` stays a symlink to `.agents/skills/<name>`. This is the pattern the agentskills.io implementation guide endorses.

A legacy CLAUDE.md is any `CLAUDE.md` or `.claude/CLAUDE.md` in the project: at the root, or nested in a subdirectory (`<dir>/CLAUDE.md`, `<dir>/.claude/CLAUDE.md`). By default, when a `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` exists in the working directory or above, Claude Code reads the CLAUDE.md files, not AGENTS.md. A CLAUDE.md without an `@AGENTS.md` import makes Claude read it instead of AGENTS.md: that is the defect this skill fixes (migrate the content, then delete the file). A stub that holds only `@AGENTS.md` / `@../AGENTS.md` still delivers AGENTS.md through the import; it is redundant, not harmful. Kit policy removes it as cleanup, behind the approval gate. This skill never creates a CLAUDE.md.

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. If `git rev-parse --show-toplevel` succeeds, prefer that as the project root; otherwise use the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. Re-running on a fully-bridged project must be a complete no-op. Fully bridged = `AGENTS.md` present, every `.claude/skills/<name>` a symlink to `../../.agents/skills/<name>`, and no legacy CLAUDE.md present at the root OR nested (the Step 2 enumeration returns no `CLAUDE.md` / `.claude/CLAUDE.md` path). `AGENTS.md` already present → SKIP creation. `.claude/skills/<name>` already a symlink to the correct target → SKIP. The root routing table belongs to `context-tree`: Step 6 reads it with the shared row rule (`## Context tree` section, first cell `` `<dir>/AGENTS.md` ``, a leading `@` inside the backticks tolerated) and reports gaps to `context-tree`. A routing gap is never a write action for this skill.
</constraint>

<constraint>
The legacy CLAUDE.md content split is a USER decision, not an inference. When a legacy CLAUDE.md (root or nested) holds more than an `@AGENTS.md` stub, classify its content into AGENTS.md candidates and Claude-specific keepers for `.claude/rules/` per `references/claude-md-classification.md`, present the proposed split as a table (File → Section → Destination → Reason), and **wait for explicit user confirmation** before writing any file or deleting CLAUDE.md. Do not auto-move ambiguous content.
</constraint>

<constraint>
Detection is read-only. Before any write, classify every target with `Read`/`Glob`/`Grep` and read-only `Bash` (`test`, `ls`, `readlink`, `find`, `git status`/`rev-parse`/`ls-files`). Only after the user approves the action table (Step 4 approval gate) do you switch to `Write`/`Edit`/`git mv`/`git rm`/`ln`. Never write blindly.
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

```bash
test -f AGENTS.md            && echo "EXISTS AGENTS.md"          || echo "MISSING AGENTS.md"
test -f CLAUDE.md            && echo "EXISTS CLAUDE.md (root)"   || echo "MISSING CLAUDE.md (root)"
test -f .claude/CLAUDE.md    && echo "EXISTS .claude/CLAUDE.md" || echo "MISSING .claude/CLAUDE.md"
test -f CLAUDE.local.md      && echo "EXISTS CLAUDE.local.md"   || echo "MISSING CLAUDE.local.md"
test -d .agents/skills       && echo "EXISTS .agents/skills/"   || echo "MISSING .agents/skills/"
test -d .claude/skills       && echo "EXISTS .claude/skills/"   || echo "MISSING .claude/skills/"
test -d .claude/agents       && echo "EXISTS .claude/agents/"   || echo "MISSING .claude/agents/"
test -d .claude/rules        && echo "EXISTS .claude/rules/"    || echo "MISSING .claude/rules/"
test -f .claude/rules/claude-code.md && echo "EXISTS .claude/rules/claude-code.md" || echo "MISSING .claude/rules/claude-code.md"
```

Then enumerate every legacy file, root and nested, in one read-only pass. In a git repo (tracked plus untracked, gitignored build output skipped):

```bash
git ls-files -co --exclude-standard -- ':(glob)**/CLAUDE.md' ':(exclude,glob)**/node_modules/**'
```

`--exclude-standard` skips ignored files, and `CLAUDE.local.md` is usually gitignored. In a git repo, find it at any depth with `find`:

```bash
find . \( -name .git -o -name node_modules -o -name vendor -o -name dist -o -name build -o -name out \
  -o -name target -o -name .next \) -prune -o -type f -name CLAUDE.local.md -print
```

Outside git, one `find` returns both names:

```bash
find . \( -name .git -o -name node_modules -o -name vendor -o -name dist -o -name build -o -name out \
  -o -name target -o -name .next \) -prune -o -type f \( -name CLAUDE.md -o -name CLAUDE.local.md \) -print
```

Each `CLAUDE.md` / `.claude/CLAUDE.md` path in the output is a legacy file. For a nested hit, record its folder `<dir>`: the folder that holds `CLAUDE.md`, or the parent of `.claude/` for `<dir>/.claude/CLAUDE.md`. Record also whether `<dir>/AGENTS.md` exists. Step 6 runs the same commands.

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

**Approval gate** — print the Step 3 proposal table (when Step 3 ran) and this action table as your final message, then end the turn. This is the only gate of the run. Do not call Write/Edit/`git mv`/`git rm`/`ln` until the user approves (or amends) both tables in their reply. With nothing to write (fully bridged), report the no-op and stop.

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

After all writes, run:

```bash
# Every .claude/skills/* must resolve
find .claude/skills -maxdepth 1 -mindepth 1 \( -type l -o -type d \) -print0 \
  | while IFS= read -r -d '' path; do
      test -e "$path" || echo "BROKEN: $path"
    done
# AGENTS.md present
test -f AGENTS.md || echo "BROKEN: AGENTS.md missing"
# No legacy CLAUDE.md left, root or nested (same enumeration as Step 2; outside git use the Step 2 find)
git ls-files -co --exclude-standard -- ':(glob)**/CLAUDE.md' ':(exclude,glob)**/node_modules/**' \
  | sed 's/^/BROKEN: legacy CLAUDE.md still present: /'
# Only when MOVE→RULES ran: each written rules file and folder AGENTS.md exists
test -f .claude/rules/claude-code.md || echo "BROKEN: rules file missing"
test -f .claude/rules/<dir-slug>.md  || echo "BROKEN: .claude/rules/<dir-slug>.md missing"
test -f <dir>/AGENTS.md              || echo "BROKEN: <dir>/AGENTS.md missing"
# Root routing (owned by context-tree; report only). Same row rule as agent-first-setup Step 3 C2:
# a row is a table line whose first cell is `<dir>/AGENTS.md` in backticks; a leading @ inside the backticks is stripped.
routes=$(awk -F'|' '/^[[:space:]]*\|/ { c = $2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", c); if (c ~ /^`@?[^` ]*AGENTS\.md`$/) { gsub(/`/, "", c); sub(/^@/, "", c); sub(/^\.\//, "", c); print c } }' AGENTS.md 2>/dev/null | sort -u)
git ls-files -co --exclude-standard -- ':(glob)*/**/AGENTS.md' ':(exclude,glob)**/node_modules/**' | while IFS= read -r n; do
  printf '%s\n' "$routes" | grep -qxF "$n" || echo "HANDOFF context-tree: unrouted node $n"
done
printf '%s\n' "$routes" | while IFS= read -r p; do
  if [ -n "$p" ] && ! test -f "$p"; then echo "HANDOFF context-tree: dead route $p"; fi
done
# Volatile values (report only; migrated text stays verbatim). Same awk as agent-first-setup Step 3 C5:
# fenced blocks and URLs skipped everywhere; code spans and quoted text skipped for the time and count rules only.
git ls-files -co --exclude-standard -- ':(glob)**/AGENTS.md' ':(exclude,glob)**/node_modules/**' | while IFS= read -r f; do
  awk -v f="$f" '
    /^[[:space:]]*```/ { fence = !fence; next }
    fence { next }
    { s = $0; gsub(/https?:\/\/[^ )>]*/, "", s); t = s; gsub(/`[^`]*`/, "", t); gsub(/"[^"]*"|“[^”]*”/, "", t); l = tolower(t); gsub(/(phase|step|tier)[ -]?[0-9]+/, "", l) }
    { r = s; while (match(r, /[A-Za-z0-9_.\/-]+\.[A-Za-z]+:[0-9]+/)) { a = substr(r, RSTART, RLENGTH); sub(/:[0-9]+$/, "", a); print "ANCHOR " a " " f ":" NR; r = substr(r, RSTART + RLENGTH) } }
    l ~ /(^|[^a-z])(currently|as of|now has|recently)([^a-z]|$)/ { print "VOLATILE time-relative " f ":" NR }
    l !~ /verify:/ && l ~ /(^|[^0-9.])[0-9]+ (skills|nodes|files|tests|tables|tabs|commands|agents|plugins|rules)([^a-z]|$)/ { print "VOLATILE bare-count " f ":" NR }
  ' "$f"
done | while read -r kind a loc; do
  if [ "$kind" = ANCHOR ]; then d=$(dirname "${loc%:*}"); { test -e "$a" || test -e "$d/$a"; } && echo "VOLATILE line-anchor $loc ($a exists)"; else echo "$kind $a $loc"; fi
done

# git status sanity
git status --short
```

If any `BROKEN:` line appears, STOP and report — do not claim success. `HANDOFF` and `VOLATILE` lines are report items, not failures.

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
| Mixed-content section split paragraph-by-paragraph without user input | Author intent lost | Show the proposed split, wait for approval; unsure mixed sections default to `.claude/rules/claude-code.md` |
| Only `./CLAUDE.md` checked; project keeps memory at `./.claude/CLAUDE.md` | Skill reports "no CLAUDE.md" and Claude keeps reading CLAUDE.md instead of AGENTS.md | Audit BOTH locations (Step 2) |
| Nested `api/CLAUDE.md` skipped, or its keepers put in `claude-code.md` | Claude keeps reading `api/CLAUDE.md` instead of `api/AGENTS.md`, or folder rules load in every session | Enumerate nested files (Step 2); generic → `api/AGENTS.md`, keepers → `.claude/rules/api.md` with `paths: - "api/**"` |
| Only `git ls-files --exclude-standard` used to find `CLAUDE.local.md` | Ignored files are skipped, so a gitignored nested `CLAUDE.local.md` is never reported | Use the Step 2 `find` with prune |
| Nested `AGENTS.md` created by migration, then this skill adds the root row | Two skills own the routing table | Report `HANDOFF context-tree`; `context-tree` adds the `## Context tree` row |
| Template filled with a Node version, a test count, or a directory tree | The root lies after the next upgrade or new folder | Name the file that pins the value plus `(verify: …)`; route folders through the checked `## Context tree` table only |

## Anti-Hallucination Checks

- Before reporting "migrated", run `test -L .claude/skills/<name>` and `test -e .agents/skills/<name>/SKILL.md` — both must succeed
- Before reporting "AGENTS.md loads natively", confirm `test -f AGENTS.md` succeeds and the Step 6 enumeration prints no legacy path
- After the move, confirm every original `^#{1,3}` section of each non-stub legacy CLAUDE.md, root AND nested, appears in its approved destination (`AGENTS.md`, `<dir>/AGENTS.md`, `.claude/rules/claude-code.md`, or `.claude/rules/<dir-slug>.md`) — **per-section presence**, not a byte-%. Read the source sections from the Step 5 backup directory. A missing section that was not an explicit user `DROP` ⇒ restore from the backup and stop (do not claim "migrated")
- `git status --short` at the end must only show paths this skill touched; investigate any other entries before reporting "done"
- Do NOT claim a layout type without the detection check in Step 1 actually returning matches
- Before reporting "no legacy CLAUDE.md", confirm the Step 2 enumeration returned no `CLAUDE.md` / `.claude/CLAUDE.md` path, root or nested
- Do NOT claim Claude Code loads AGENTS.md from the file checks alone; the `/memory` check in Step 6 is the user's confirmation

## References

- `references/agents-md-template.md` — the AGENTS.md scaffold (agents.md-spec-compliant) with its durable-fact fill rules, the `## Context tree` routing section (rows owned by `context-tree`), and the stale-tolerance line
- `references/claude-md-classification.md` — keyword rules and section-by-section heuristics for splitting legacy CLAUDE.md content between AGENTS.md and `.claude/rules/`, including nested destinations and the `paths:` frontmatter format
- Companion: when porting Claude subagents to Codex (`.claude/agents/*.md` → `.codex/agents/*.toml`), use the `skill-agent-pipeline` skill — its Phase 5 drafts every agent in BOTH formats; format mismatch and model-name translation make symlinks unsuitable. Out of scope here.
