---
name: multi-tool-bridge
description: Use when setting up multi-tool agent compatibility in a project (Codex + Claude Code) — creates canonical AGENTS.md, migrates .claude/skills/ to .agents/skills/, symlinks Claude skill entries back, migrates legacy CLAUDE.md content, root or nested (generic → AGENTS.md or the folder AGENTS.md, Claude-specific → .claude/rules/claude-code.md or a path-scoped .claude/rules/ file), and removes every CLAUDE.md so Claude Code loads AGENTS.md natively. Idempotent. Not for plan workspace setup or refresh (use plan-workspace), splitting per-area rules into AGENTS.md nodes (use context-tree), porting Claude subagents to Codex TOML (use skill-agent-pipeline), or one-shot full repo setup (use agent-first-setup).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-09-23"
  content_hash: "35fb38181b862134067865c890bb5db4df79c9cd5265c0b3828cb43bdadb08bf"
---

# Multi-Tool Agent Bridge

Make a project work cleanly in Codex, Claude Code, OpenCode, VS Code Copilot, and any other agentskills.io-compliant tool. Canonical content lives at the multi-tool paths (`AGENTS.md`, `.agents/skills/`). Claude Code v2.1.277+ reads `AGENTS.md` natively, so no `CLAUDE.md` is needed. Claude Code does not read `.agents/`, so `.claude/skills/<name>` stays a symlink to `.agents/skills/<name>`. This is the pattern the agentskills.io implementation guide endorses.

A legacy CLAUDE.md is any `CLAUDE.md` or `.claude/CLAUDE.md` in the project: at the root, or nested in a subdirectory (`<dir>/CLAUDE.md`, `<dir>/.claude/CLAUDE.md`). It suppresses native AGENTS.md loading in Claude Code: when one exists, Claude Code reads the CLAUDE.md files only and ignores AGENTS.md. This skill never creates a CLAUDE.md.

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. If `git rev-parse --show-toplevel` succeeds, prefer that as the project root; otherwise use the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. Re-running on a fully-bridged project must be a complete no-op. Fully bridged = `AGENTS.md` present with the stale-tolerance line and a `## Context map` row for every nested `AGENTS.md`, every `.claude/skills/<name>` a symlink to `../../.agents/skills/<name>`, and no legacy CLAUDE.md present at the root OR nested (the Step 2 enumeration returns no `CLAUDE.md` / `.claude/CLAUDE.md` path). `AGENTS.md` already present → SKIP creation. `.claude/skills/<name>` already a symlink to the correct target → SKIP.
</constraint>

<constraint>
The legacy CLAUDE.md content split is a USER decision, not an inference. When a legacy CLAUDE.md (root or nested) holds more than an `@AGENTS.md` stub, classify its content into AGENTS.md candidates and Claude-specific keepers for `.claude/rules/` per `references/claude-md-classification.md`, present the proposed split as a table (File → Section → Destination → Reason), and **wait for explicit user confirmation** before writing any file or deleting CLAUDE.md. Do not auto-move ambiguous content.
</constraint>

<constraint>
Detection is read-only. Before any write, classify every target with `Read`/`Glob`/`Grep` and read-only `Bash` (`test`, `ls`, `readlink`, `find`, `git status`/`rev-parse`/`ls-files`). Only after the action table is approved do you switch to `Write`/`Edit`/`git mv`/`git rm`/`ln`. Never write blindly.
</constraint>

<constraint>
Everything this skill writes into `AGENTS.md` is durable: read as current state in every session. Written text carries no line-number anchors (`path:NN`), no live versions, counts, sizes, or dates, and no "currently"/"now"/"recently". Name the file or config key that owns a value and add `(verify: <command>)`. A fact owned by another file gets a backticked path, not a copy. Content moved from a legacy CLAUDE.md is moved verbatim (user decision); report its volatile lines in Step 7 instead of rewriting them.
</constraint>

## When to Use

- Setting up a project to work in both Codex and Claude Code (any project where the user types "make this work with Codex too" or "set up AGENTS.md")
- Standardizing on `.agents/skills/` as the canonical location (per [agentskills.io's recommendation](https://agentskills.io/client-implementation/adding-skills-support))
- Adding the bridge to an existing Claude-only project (auto-detects layout)
- Removing a legacy CLAUDE.md (including a one-line `@AGENTS.md` stub) so Claude Code loads AGENTS.md natively
- The user says "set up AGENTS.md", "migrate CLAUDE.md to AGENTS.md", "make this multi-tool", or `/docks:multi-tool-bridge`

## Workflow

### Step 1 — Resolve project root + detect layout

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

Classify the project into one of three layouts (controls which steps run):

| Layout | Detection | Steps that apply |
|---|---|---|
| **consumer** | has `.claude/skills/<dir>` but no `.claude-plugin/` and no `plugins/*/skills/` | All — skills migrate + legacy CLAUDE.md migration |
| **plugin-author** | has `.claude-plugin/` at root OR `plugins/*/.claude-plugin/plugin.json` | AGENTS.md + legacy CLAUDE.md migration (skills stay inside the plugin; not migrated) |
| **greenfield** | none of `.claude/`, `.claude-plugin/`, `plugins/*/` exists | Stub AGENTS.md only |

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
git ls-files -co --exclude-standard -- ':(glob)**/CLAUDE.md' ':(glob)**/CLAUDE.local.md' \
  ':(exclude,glob)**/node_modules/**'
```

Outside git:

```bash
find . \( -name .git -o -name node_modules -o -name dist -o -name build -o -name out \
  -o -name target -o -name .next \) -prune -o -type f \( -name CLAUDE.md -o -name CLAUDE.local.md \) -print
```

Each `CLAUDE.md` / `.claude/CLAUDE.md` path in the output is a legacy file. For a nested hit, record its folder `<dir>`: the folder that holds `CLAUDE.md`, or the parent of `.claude/` for `<dir>/.claude/CLAUDE.md`. Record also whether `<dir>/AGENTS.md` exists. Step 6 runs the same command.

Any of `./CLAUDE.md`, `./.claude/CLAUDE.md`, or `./CLAUDE.local.md` suppresses native AGENTS.md loading in Claude Code. A nested `CLAUDE.md` / `.claude/CLAUDE.md` suppresses that folder's AGENTS.md the same way. All of them are legacy CLAUDE.md files: migrate and delete them in Steps 3–5. `CLAUDE.local.md`, root or nested, is personal and usually gitignored: report it only, and tell the user it also suppresses AGENTS.md.

`.claude/rules/*.md` files load alongside AGENTS.md and do not suppress it. `.claude/rules/claude-code.md` is the destination for Claude-specific content. Nested Claude-specific content goes to `.claude/rules/<dir-slug>.md` at the project root (`<dir>` with `/` replaced by `-`, e.g. `packages/api` → `packages-api.md`). Leave existing rule files untouched; record whether `claude-code.md` and each `<dir-slug>.md` exist, because Step 5 then appends instead of creating.

Enumerate `.claude/skills/*/SKILL.md` via Glob. For each, capture the skill name (directory basename). These are the migration candidates.

### Step 3 — Classify legacy CLAUDE.md (when Step 2 found any, root or nested)

1. `Read` each legacy file. If a file holds only an `@AGENTS.md` or `@../AGENTS.md` line (plus blank lines), it is a stub from an earlier workaround: mark it `DELETE` with no classification.
2. If BOTH files exist in one folder (`CLAUDE.md` and `.claude/CLAUDE.md` at the root, or both under the same `<dir>`), Claude Code loaded and concatenated both: classify the UNION of their sections, so a rule in one file is not duplicated or contradicted by the other. Both files are deleted after the content moves. Files in different folders are classified separately; each keeps its own destinations.
3. Load `references/claude-md-classification.md` for the keyword rules.
4. Walk each non-stub file section by section (split on `^##` and `^###` headings). Drop a leading `@AGENTS.md` / `@../AGENTS.md` line; it has no destination. For each section, score:
   - **GENERIC** (root file → `AGENTS.md`; nested file → `<dir>/AGENTS.md`): no Claude-specific keywords; covers build/test/style/security/repo-layout/engineering rules.
   - **CLAUDE-SPECIFIC** (root file → `.claude/rules/claude-code.md`; nested file → `.claude/rules/<dir-slug>.md` with `paths:` frontmatter `- "<dir>/**"`, so the content keeps its folder scope): contains `.claude/`, `.claude-plugin/`, `subagent_type`, `Plan Mode`, `ExitPlanMode`, `Skill tool`, `Agent tool`, `Anthropic`, `claude-opus`/`claude-sonnet`/`claude-haiku`, RTK references, auto memory (`~/.claude/projects/`), `CLAUDE_CODE_*` env vars.
   - **MIXED** (propose split): generic content with isolated Claude-specific references; recommend splitting paragraph-by-paragraph.
5. Build ONE proposal table for all legacy files and show it to the user — no writes yet. The File column names the source of each row:

```
| File           | Section                    | Destination                     | Reason                                |
|----------------|----------------------------|---------------------------------|---------------------------------------|
| CLAUDE.md      | Repository purpose         | → AGENTS.md                     | no Claude-specific keywords           |
| CLAUDE.md      | Environment / commands     | → AGENTS.md                     | generic build/test/dev commands       |
| CLAUDE.md      | Auto memory section        | → .claude/rules/claude-code.md  | references ~/.claude/projects/        |
| CLAUDE.md      | Plan Mode workflow         | → .claude/rules/claude-code.md  | references ExitPlanMode + Skill tool  |
| api/CLAUDE.md  | Endpoint conventions       | → api/AGENTS.md                 | generic, folder-scoped                |
| api/CLAUDE.md  | Subagent for API tests     | → .claude/rules/api.md          | references subagent_type; paths api/** |
| web/CLAUDE.md  | (stub: @AGENTS.md only)    | DELETE                          | legacy stub                           |
```

6. **Approval gate** — print the proposal table as your final message and end the turn. Do not call Write/Edit/`git mv`/`git rm` until the user approves (or amends) the split in their reply.

### Step 4 — Build the action table

After classification (or in layouts without a legacy CLAUDE.md, where classification is skipped), build the full action table:

```
| Target                                              | Action          | Reason                              |
|-----------------------------------------------------|-----------------|-------------------------------------|
| AGENTS.md                                           | CREATE          | not present                         |
| .agents/skills/                                     | CREATE DIR      | not present                         |
| .claude/skills/code-review → .agents/skills/...     | MIGRATE+SYMLINK | found in .claude/skills/            |
| .claude/rules/claude-code.md                        | MOVE→RULES      | Claude-specific keepers approved    |
| api/AGENTS.md                                       | CREATE+POPULATE | generic sections of api/CLAUDE.md   |
| AGENTS.md (`## Context map` + stale-tolerance line)  | APPEND          | root exists but does not route api/ |
| .claude/rules/api.md (paths: "api/**")              | MOVE→RULES      | nested Claude-specific keepers      |
| CLAUDE.md                                           | DELETE          | legacy; suppresses AGENTS.md        |
| api/CLAUDE.md                                       | DELETE          | legacy; suppresses api/AGENTS.md    |
| CLAUDE.local.md, api/CLAUDE.local.md                | SURFACE ONLY    | personal; also suppresses AGENTS.md |
| .claude/agents/                                     | SURFACE ONLY    | Codex .toml format mismatch         |
```

`SURFACE ONLY` means: list with one-line summaries in the final report, do NOT touch.

### Step 5 — Apply

Apply the approved rows in this order. Write every destination (root and folder AGENTS.md files, every rules file) BEFORE any CLAUDE.md is deleted.

0. **Backup anchor** — in a git repo, `git stash push -u -m "multi-tool-bridge-pre-rewrite-<ISO>"` before the first destructive write (a botched split is then one `git stash pop` from recovery), and copy each legacy CLAUDE.md aside for the per-section presence check in Anti-Hallucination.

1. **AGENTS.md** —
   - **CREATE** (greenfield/plugin-author, or no generic content to move): write the verbatim content from `references/agents-md-template.md`, filling in project-specific placeholders the user provides (or marking them `<!-- TODO -->`). Follow the template's fill rules: commands plus the file that defines them, no version numbers or counts, one `## Context map` row per nested `AGENTS.md`.
   - **CREATE+POPULATE** (legacy CLAUDE.md with generic sections): write the generic sections moved from CLAUDE.md. If AGENTS.md already exists, append them; never overwrite it.
   - **Nested** (`<dir>/CLAUDE.md` with generic sections): write them to `<dir>/AGENTS.md` the same way — create it if missing, else append a `## Migrated from CLAUDE.md` section. Never overwrite it.
   - **Routing** (every layout): the root `AGENTS.md` must carry the stale-tolerance line and a `## Context map` row (`<dir>/AGENTS.md` + one-line purpose) for every nested `AGENTS.md`, including ones this run creates. Add what is missing from `references/agents-md-template.md` as an approved `APPEND` row in the action table; never rewrite existing sections.

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
  | sed 's/^/BROKEN: legacy CLAUDE.md still present (suppresses AGENTS.md): /'
# Only when MOVE→RULES ran: each written rules file and folder AGENTS.md exists
test -f .claude/rules/claude-code.md || echo "BROKEN: rules file missing"
test -f .claude/rules/<dir-slug>.md  || echo "BROKEN: .claude/rules/<dir-slug>.md missing"
test -f <dir>/AGENTS.md              || echo "BROKEN: <dir>/AGENTS.md missing"
# Root AGENTS.md routes to every nested node, and every routed node exists
git ls-files -co --exclude-standard -- ':(glob)*/**/AGENTS.md' \
  | while IFS= read -r p; do grep -qF "\`$p\`" AGENTS.md || echo "BROKEN: unrouted node $p"; done
grep -oE '`[^`]*AGENTS\.md`' AGENTS.md | tr -d '`' \
  | while IFS= read -r p; do test -f "$p" || echo "BROKEN: dead pointer $p"; done
grep -qF 'Pointers here name concepts, not coordinates' AGENTS.md || echo "BROKEN: stale-tolerance line missing"
# Volatile values (report only; migrated text stays verbatim)
git ls-files -co --exclude-standard -- ':(glob)**/AGENTS.md' \
  | xargs -r grep -nEi '[A-Za-z0-9_./-]+\.[a-z]{1,5}:[0-9]+|\b(currently|as of today|recently)\b' \
  | sed 's/^/VOLATILE: /'

# git status sanity
git status --short
```

If any `BROKEN:` line appears, STOP and report — do not claim success.

Tell the user to open Claude Code in the project and run `/memory`: `AGENTS.md` must be listed (requires Claude Code v2.1.277+).

### Step 7 — Report

Final report (markdown):

1. Layout detected (consumer / plugin-author / greenfield)
2. Files created / moved / symlinked / deleted (full paths)
3. Legacy CLAUDE.md split per file (root and nested): sections → AGENTS.md or `<dir>/AGENTS.md`, sections → `.claude/rules/claude-code.md` or `.claude/rules/<dir-slug>.md`, files deleted (stubs included)
4. `.claude/agents/` and `CLAUDE.local.md` SURFACE inventory (human decides)
5. How to test in Codex (`codex` CLI reads `.agents/skills/` + AGENTS.md)
6. How to test in Claude Code (`/memory` lists AGENTS.md; `/skills` lists each skill)
7. Risks / known limitations (subagent format mismatch; Claude Code < v2.1.277 does not read AGENTS.md)
8. `VOLATILE:` lines from Step 6 as follow-ups: replace each with the owning file or rule plus a `(verify: <command>)`

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| Legacy CLAUDE.md left in place, even a one-line `@AGENTS.md` stub | Claude Code reads CLAUDE.md only and ignores AGENTS.md | Delete every `CLAUDE.md` / `.claude/CLAUDE.md` after its content moves; verify with `test ! -e` |
| Claude-specific keepers written into CLAUDE.md | Recreates the file that suppresses AGENTS.md | Put keepers in `.claude/rules/claude-code.md`; it loads alongside AGENTS.md |
| Existing `.claude/rules/claude-code.md` overwritten | User rules lost | Append a `## Migrated from CLAUDE.md` section; never overwrite |
| CLAUDE.md deleted before its content is written elsewhere | Content lost if a later write fails | Write AGENTS.md and the rules file first; delete CLAUDE.md last |
| Legacy CLAUDE.md split without classifying content | Sections land in the wrong file or get dropped | Step 3 classification with user approval gate — never split content silently |
| Symlink target overwrites a directory the user had at `.claude/skills/<name>` | `ln -sf` blasts the original | `test -L` first; if a real dir exists, ABORT and ask the user |
| `.claude/skills/` symlinks removed because Claude Code reads AGENTS.md now | Claude Code loses every skill | Keep the symlinks; Claude Code does not read `.agents/` |
| `.claude/agents/*.md` auto-converted to `.codex/agents/*.toml` | Quietly translating format and model names | SURFACE ONLY — Codex subagents are TOML with different model namespace; let the user decide whether to port |
| Plugin-author repo migrates `plugins/docks/skills/` to `.agents/skills/` | Treats plugin-internal skills as project-level skills | Layout detection (Step 1) skips skills migration when `.claude-plugin/` is present |
| `git mv` fails outside a git repo | Falling back to silent `mv` and losing rename tracking | Use `git mv` / `git rm` when in a repo; plain `mv` / `rm` otherwise; report which was used |
| Mixed-content section split paragraph-by-paragraph without user input | Author intent lost | Show the proposed split, wait for approval; unsure mixed sections default to `.claude/rules/claude-code.md` |
| Only `./CLAUDE.md` checked; project keeps memory at `./.claude/CLAUDE.md` | Skill reports "no CLAUDE.md" and AGENTS.md stays suppressed | Audit BOTH locations (Step 2) |
| Nested `api/CLAUDE.md` skipped, or its keepers put in `claude-code.md` | `api/AGENTS.md` stays suppressed, or folder rules load in every session | Enumerate nested files (Step 2); generic → `api/AGENTS.md`, keepers → `.claude/rules/api.md` with `paths: - "api/**"` |
| Nested `AGENTS.md` created but the root does not name it | Agents never find the folder rules; the root looks complete | Add a `## Context map` row per nested node; Step 6 prints `unrouted node` until it exists |
| Template filled with a Node version, a test count, or a directory tree | The root lies after the next upgrade or new folder | Name the file that pins the value plus `(verify: …)`; route folders through the checked `## Context map` only |

## Anti-Hallucination Checks

- Before reporting "migrated", run `test -L .claude/skills/<name>` and `test -e .agents/skills/<name>/SKILL.md` — both must succeed
- Before reporting "AGENTS.md loads natively", confirm `test -f AGENTS.md` succeeds and the Step 6 enumeration prints no legacy path
- After the move, confirm every original `^#{1,3}` section of each non-stub legacy CLAUDE.md, root AND nested, appears in its approved destination (`AGENTS.md`, `<dir>/AGENTS.md`, `.claude/rules/claude-code.md`, or `.claude/rules/<dir-slug>.md`) — **per-section presence**, not a byte-%. A missing section that was not an explicit user `DROP` ⇒ restore from the Step 5 backup and stop (do not claim "migrated")
- `git status --short` at the end must only show paths this skill touched; investigate any other entries before reporting "done"
- Do NOT claim a layout type without the detection check in Step 1 actually returning matches
- Before reporting "no legacy CLAUDE.md", confirm the Step 2 enumeration returned no `CLAUDE.md` / `.claude/CLAUDE.md` path, root or nested
- Do NOT claim Claude Code loads AGENTS.md from the file checks alone; the `/memory` check in Step 6 is the user's confirmation

## References

- `references/agents-md-template.md` — the AGENTS.md scaffold (agents.md-spec-compliant) with its durable-fact fill rules, the checked `## Context map` routing table, and the stale-tolerance line
- `references/claude-md-classification.md` — keyword rules and section-by-section heuristics for splitting legacy CLAUDE.md content between AGENTS.md and `.claude/rules/`, including nested destinations and the `paths:` frontmatter format
- Companion: when porting Claude subagents to Codex (`.claude/agents/*.md` → `.codex/agents/*.toml`), use the `skill-agent-pipeline` skill — its Phase 5 drafts every agent in BOTH formats; format mismatch and model-name translation make symlinks unsuitable. Out of scope here.
