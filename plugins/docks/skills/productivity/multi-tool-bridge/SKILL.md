---
name: multi-tool-bridge
description: Use when setting up multi-tool agent compatibility in a project (Codex + Claude Code) — creates canonical AGENTS.md, migrates .claude/skills/ to .agents/skills/, symlinks Claude skill entries back, and rewrites the project CLAUDE.md to @AGENTS.md preserving Claude-specific content (content-classified). Idempotent. Not for docs/plans/ setup (use plan-init), splitting per-area rules into AGENTS.md nodes (use context-tree), or porting Claude subagents to Codex TOML (use skill-agent-pipeline).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-05"
  content_hash: "c802c0bc875f0d86a3675f41c5dfe6253281a2ad64d8541d04524984769e2b96"
---

# Multi-Tool Agent Bridge

Make a project work cleanly in Codex, Claude Code, OpenCode, VS Code Copilot, and any other agentskills.io-compliant tool by putting canonical content at the multi-tool paths (`AGENTS.md`, `.agents/skills/`) and symlinking Claude Code's paths to them. This is the pattern the agentskills.io implementation guide explicitly endorses.

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. If `git rev-parse --show-toplevel` succeeds, prefer that as the project root; otherwise use the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. Re-running on a fully-bridged project must be a complete no-op for existing targets. `AGENTS.md` already present → SKIP. `.claude/skills/<name>` already a symlink to the correct target → SKIP. `@AGENTS.md` already present in `CLAUDE.md` → SKIP the bridge insertion.
</constraint>

<constraint>
The CLAUDE.md content split is a USER decision, not an inference. When existing CLAUDE.md content is found, classify it into AGENTS.md candidates and Claude-specific keepers per `references/claude-md-classification.md`, present the proposed split as a 3-column table (Section → Destination → Reason), and **wait for explicit user confirmation** before rewriting either file. Do not auto-move ambiguous content.
</constraint>

<constraint>
Detection is read-only. Before any write, classify every target with `Read`/`Glob`/`Grep` and read-only `Bash` (`test`, `ls`, `readlink`, `git status`/`rev-parse`). Only after the classification table is approved do you switch to `Write`/`Edit`/`git mv`/`ln`. Never write blindly.
</constraint>

## When to Use

- Setting up a project to work in both Codex and Claude Code (any project where the user types "make this work with Codex too" or "set up AGENTS.md")
- Standardizing on `.agents/skills/` as the canonical location (per [agentskills.io's recommendation](https://agentskills.io/client-implementation/adding-skills-support))
- Adding the bridge to an existing Claude-only project (auto-detects layout)
- The user says "set up AGENTS.md", "wire CLAUDE.md to AGENTS.md", "make this multi-tool", or `/docks:multi-tool-bridge`

## Workflow

### Step 1 — Resolve project root + detect layout

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

Classify the project into one of three layouts (controls which steps run):

| Layout | Detection | Steps that apply |
|---|---|---|
| **consumer** | has `.claude/skills/<dir>` but no `.claude-plugin/` and no `plugins/*/skills/` | All — skills migrate + bridge |
| **plugin-author** | has `.claude-plugin/` at root OR `plugins/*/.claude-plugin/plugin.json` | Bridge only (skills stay inside the plugin; not migrated) |
| **greenfield** | none of `.claude/`, `.claude-plugin/`, `plugins/*/` exists | Stub AGENTS.md + bridge stub CLAUDE.md only |

### Step 2 — Audit (read-only)

```bash
test -f AGENTS.md            && echo "EXISTS AGENTS.md"          || echo "MISSING AGENTS.md"
test -f CLAUDE.md            && echo "EXISTS CLAUDE.md (root)"   || echo "MISSING CLAUDE.md (root)"
test -f .claude/CLAUDE.md    && echo "EXISTS .claude/CLAUDE.md" || echo "MISSING .claude/CLAUDE.md"
test -d .agents/skills       && echo "EXISTS .agents/skills/"   || echo "MISSING .agents/skills/"
test -d .claude/skills       && echo "EXISTS .claude/skills/"   || echo "MISSING .claude/skills/"
test -d .claude/agents       && echo "EXISTS .claude/agents/"   || echo "MISSING .claude/agents/"
test -d .claude/rules        && echo "EXISTS .claude/rules/"    || echo "MISSING .claude/rules/"
```

A project CLAUDE.md is valid at EITHER `./CLAUDE.md` OR `./.claude/CLAUDE.md` (Claude Code loads and concatenates both when both exist — neither overrides the other). Record which of the two exist; the rewrite target is decided in Step 5. `.claude/rules/` is inventoried as a Claude-specific rules directory — that claim is volatile; re-verify it against the current memory docs (<https://code.claude.com/docs/en/memory>) before reporting it in Step 7.

Enumerate `.claude/skills/*/SKILL.md` via Glob. For each, capture the skill name (directory basename). These are the migration candidates.

### Step 3 — Classify existing CLAUDE.md (when `./CLAUDE.md` and/or `./.claude/CLAUDE.md` exists)

When a project CLAUDE.md already exists at EITHER location, the Bridge Insertion is NOT just an `@AGENTS.md` prepend — it's a content split. Per the constraints above:

1. `Read` whichever project CLAUDE.md exists — `./CLAUDE.md`, `./.claude/CLAUDE.md`, or both. If BOTH exist, both are already loaded and concatenated by Claude Code (neither wins): classify the UNION of their sections and WARN the user before rewriting either, so a rule living in one file isn't duplicated or contradicted by the other.
2. Load `references/claude-md-classification.md` for the keyword rules.
3. Walk the file section by section (split on `^##` and `^###` headings). For each section, score:
   - **GENERIC** (move to AGENTS.md): no Claude-specific keywords; covers build/test/style/security/repo-layout/engineering rules.
   - **CLAUDE-SPECIFIC** (keep in CLAUDE.md): contains `.claude/`, `.claude-plugin/`, `subagent_type`, `Plan Mode`, `ExitPlanMode`, `Skill tool`, `Agent tool`, `Anthropic`, `claude-opus`/`claude-sonnet`/`claude-haiku`, RTK references, auto memory (`~/.claude/projects/`), `CLAUDE_CODE_*` env vars.
   - **MIXED** (propose split): generic content with isolated Claude-specific references; recommend splitting paragraph-by-paragraph.
4. Build the proposal table and show it to the user — no writes yet:

```
| Section                    | Destination       | Reason                                |
|----------------------------|-------------------|---------------------------------------|
| Repository purpose         | → AGENTS.md       | no Claude-specific keywords           |
| Environment / commands     | → AGENTS.md       | generic build/test/dev commands       |
| Engineering rules          | → AGENTS.md       | tool-agnostic principles              |
| Auto memory section        | KEEP in CLAUDE.md | references ~/.claude/projects/        |
| Plan Mode workflow         | KEEP in CLAUDE.md | references ExitPlanMode + Skill tool  |
| Project Skills (.claude/…) | KEEP in CLAUDE.md | references .claude/skills/ directly   |
```

5. **Approval gate** — print the proposal table as your final message and end the turn. Do not call Write/Edit/`git mv` until the user approves (or amends) the split in their reply.

### Step 4 — Build the action table

After classification (or in greenfield/plugin-author layouts where classification is skipped), build the full action table:

```
| Target                                              | Action          | Reason                          |
|-----------------------------------------------------|-----------------|---------------------------------|
| AGENTS.md                                           | CREATE          | not present                     |
| .agents/skills/                                     | CREATE DIR      | not present                     |
| .claude/skills/code-review → .agents/skills/...     | MIGRATE+SYMLINK | found in .claude/skills/        |
| CLAUDE.md                                           | REWRITE+@IMPORT | exists, content split approved  |
| .claude/agents/                                     | SURFACE ONLY    | Codex .toml format mismatch     |
| .claude/rules/ (2 files)                            | SURFACE ONLY    | Claude-specific loader (re-verify: memory docs) |
```

`SURFACE ONLY` means: list with one-line summaries in the final report, do NOT touch.

### Step 5 — Apply

For each row classified `CREATE` / `MIGRATE+SYMLINK` / `REWRITE+@IMPORT`:

0. **Backup anchor** — in a git repo, `git stash push -u -m "multi-tool-bridge-pre-rewrite-<ISO>"` before the first destructive write (a botched split is then one `git stash pop` from recovery), and copy the source CLAUDE.md aside for the per-section presence check in Anti-Hallucination.

1. **AGENTS.md** —
   - **CREATE** (greenfield/plugin-author): write the verbatim content from `references/agents-md-template.md`, filling in project-specific placeholders the user provides (or marking them `<!-- TODO -->`).
   - **CREATE+POPULATE** (consumer with existing CLAUDE.md): write the generic sections moved from CLAUDE.md.

2. **`.agents/skills/`** — `mkdir -p .agents/skills` if missing.

3. **Per-skill migration** (consumer layout only):
   ```bash
   git mv .claude/skills/<name> .agents/skills/<name>
   ln -s ../../.agents/skills/<name> .claude/skills/<name>
   ```
   Skip when destination already exists. If `.claude/skills/<name>` is already a symlink pointing at the right target → SKIP. If it's a symlink pointing somewhere else → STOP and ask the user (do not silently fix).

4. **CLAUDE.md rewrite** — first pick the TARGET file:
   - Default to root `./CLAUDE.md` (conventional, team-visible). Create it there when neither location exists.
   - If the ONLY existing project CLAUDE.md is `./.claude/CLAUDE.md`, rewrite THAT file — but the import must be `@../AGENTS.md`, because `@path` resolves relative to the file containing it (an `@AGENTS.md` inside `.claude/` would wrongly resolve to `.claude/AGENTS.md`).
   - If BOTH exist, rewrite root `./CLAUDE.md` with the import and leave `./.claude/CLAUDE.md` in place after showing its classified content — only consolidate on explicit user approval (never silently merge two memory files).

   Then apply the matching case (use the import form the target rule dictates):
   - **CREATE STUB** (greenfield/plugin-author without existing CLAUDE.md): write a one-line root file: `@AGENTS.md`
   - **APPEND BRIDGE** (existing CLAUDE.md, nothing Claude-specific to keep): rewrite as `@AGENTS.md` (or `@../AGENTS.md` when the target is `./.claude/CLAUDE.md`) + one blank line + (nothing else)
   - **SPLIT** (existing CLAUDE.md with Claude-specific keepers): rewrite as:
     ```
     @AGENTS.md

     ## Claude Code

     <approved Claude-specific sections, verbatim>
     ```

### Step 6 — Verify

After all writes, run:

```bash
# Every .claude/skills/* must resolve
find .claude/skills -maxdepth 1 -mindepth 1 \( -type l -o -type d \) -print0 \
  | while IFS= read -r -d '' path; do
      test -e "$path" || echo "BROKEN: $path"
    done
# @AGENTS.md import must resolve
grep -q '^@AGENTS.md' CLAUDE.md && test -f AGENTS.md \
  && echo "OK: CLAUDE.md → AGENTS.md import resolves" \
  || echo "BROKEN: @AGENTS.md import does not resolve"

# git status sanity
git status --short
```

If any `BROKEN:` line appears, STOP and report — do not claim success.

### Step 7 — Report

Final report (markdown):

1. Layout detected (consumer / plugin-author / greenfield)
2. Files created / moved / symlinked (full paths)
3. CLAUDE.md content split (lines moved → AGENTS.md, lines kept)
4. `.claude/agents/` and `.claude/rules/` SURFACE inventory (human decides)
5. How to test in Codex (`codex` CLI reads `.agents/skills/` + AGENTS.md)
6. How to test in Claude Code (`/skills` to list, verify each entry shows up)
7. Risks / known limitations (subagent format mismatch, etc.)

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| Existing CLAUDE.md gets `@AGENTS.md` prepended without classifying content | Generic content stays orphaned in CLAUDE.md when it should move | Step 3 classification with user approval gate — never split content silently |
| Symlink target overwrites a directory the user had at `.claude/skills/<name>` | `ln -sf` blasts the original | `test -L` first; if a real dir exists, ABORT and ask the user |
| `.claude/agents/*.md` auto-converted to `.codex/agents/*.toml` | Quietly translating format and model names | SURFACE ONLY — Codex subagents are TOML with different model namespace; let the user decide whether to port |
| Plugin-author repo migrates `plugins/docks/skills/` to `.agents/skills/` | Treats plugin-internal skills as project-level skills | Layout detection (Step 1) skips skills migration when `.claude-plugin/` is present |
| `git mv` fails outside a git repo | Falling back to silent `mv` and losing rename tracking | Use `git mv` when in a repo; plain `mv` otherwise; report which was used |
| `@AGENTS.md` import added but AGENTS.md doesn't exist | Broken import in CLAUDE.md | Write AGENTS.md BEFORE rewriting CLAUDE.md; verify with `test -f AGENTS.md` |
| Mixed-content section split paragraph-by-paragraph without user input | Author intent lost | Show the proposed split, wait for approval; mixed sections default to STAY in CLAUDE.md if unsure |
| Only `./CLAUDE.md` checked; project keeps memory at `./.claude/CLAUDE.md` | Skill reports "no CLAUDE.md" and skips the bridge | Audit BOTH locations (Step 2) — both are valid project memory and may coexist |
| `@AGENTS.md` written into `./.claude/CLAUDE.md` | Import resolves to `.claude/AGENTS.md` (wrong path) | Inside `.claude/`, the import is `@../AGENTS.md`; prefer rewriting root `./CLAUDE.md` |

## Anti-Hallucination Checks

- Before reporting "migrated", run `test -L .claude/skills/<name>` and `test -e .agents/skills/<name>/SKILL.md` — both must succeed
- Before reporting "@AGENTS.md import wired", `grep -c '^@AGENTS.md' CLAUDE.md` must return ≥1
- After the rewrite, confirm every original `^#{1,3}` section of the source CLAUDE.md appears in CLAUDE.md or AGENTS.md — **per-section presence**, not a byte-%. The split adds scaffolding, so combined output should be ≥ the original; a net shrink, or any missing section that wasn't an explicit user `DROP`, ⇒ restore from the Step 5 backup and stop (do not claim "migrated")
- `git status --short` at the end must only show paths this skill touched; investigate any other entries before reporting "done"
- Do NOT claim a layout type without the detection check in Step 1 actually returning matches
- Before reporting "no project CLAUDE.md", confirm BOTH `test -f CLAUDE.md` AND `test -f .claude/CLAUDE.md` returned missing — a project may keep its CLAUDE.md under `.claude/`
- When the import target is `./.claude/CLAUDE.md`, verify the relative form resolved: `grep -c '^@\.\./AGENTS.md' .claude/CLAUDE.md` must return ≥1 (not `^@AGENTS.md`)

## References

- `references/agents-md-template.md` — the AGENTS.md scaffold for greenfield writes, agents.md-spec-compliant
- `references/claude-md-classification.md` — keyword rules and section-by-section heuristics for splitting existing CLAUDE.md content
- Companion: when porting Claude subagents to Codex (`.claude/agents/*.md` → `.codex/agents/*.toml`), use the `skill-agent-pipeline` skill — its Phase 5 drafts every agent in BOTH formats; format mismatch and model-name translation make symlinks unsuitable. Out of scope here.
