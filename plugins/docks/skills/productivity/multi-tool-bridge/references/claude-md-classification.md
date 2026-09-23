# Legacy CLAUDE.md Content Classification — Keyword Rules

## Contents

- [Stub files — delete, no classification](#stub-files-delete-no-classification)
- [CLAUDE-specific keyword set (any one hit → .claude/rules/claude-code.md)](#claude-specific-keyword-set-any-one-hit-clauderulesclaude-codemd)
- [GENERIC content (move to AGENTS.md)](#generic-content-move-to-agentsmd)
- [MIXED sections — splitting strategy](#mixed-sections-splitting-strategy)
- [Layout of the rules file](#layout-of-the-rules-file)
- [Legacy locations — `./CLAUDE.md` and `./.claude/CLAUDE.md`](#legacy-locations-claudemd-and-claudeclaudemd)
- [Nested legacy files — `<dir>/CLAUDE.md` and `<dir>/.claude/CLAUDE.md`](#nested-legacy-files-dirclaudemd-and-dirclaudeclaudemd)
- [What about user-level CLAUDE.md?](#what-about-user-level-claudemd)
- [Verification heuristic for the proposed split](#verification-heuristic-for-the-proposed-split)
- [Sources](#sources)

Claude Code v2.1.277+ reads `AGENTS.md` natively, but only when no `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` exists. A legacy CLAUDE.md therefore suppresses AGENTS.md. The bridge skill moves its content out and deletes it:

- **GENERIC** → moves to `AGENTS.md` (tool-agnostic instructions); for a nested file, to `<dir>/AGENTS.md`
- **CLAUDE-SPECIFIC** → moves to `.claude/rules/claude-code.md` (loads alongside AGENTS.md; does not suppress it); for a nested file, to the path-scoped `.claude/rules/<dir-slug>.md`
- **MIXED** → propose split; default to the file's rules destination when uncertain

The split is presented to the user as a proposal table; **no write or delete happens without explicit approval**. The skill never creates or rewrites a CLAUDE.md.

## Stub files — delete, no classification

A legacy CLAUDE.md that holds only `@AGENTS.md` or `@../AGENTS.md` (plus blank lines) is a stub from the earlier import workaround. It carries no content. Mark it `DELETE` in the action table and skip classification.

In a non-stub file, a leading `@AGENTS.md` / `@../AGENTS.md` line is dropped, not moved; AGENTS.md now loads on its own.

## CLAUDE-specific keyword set (any one hit → .claude/rules/claude-code.md)

Path / directory references:
- `.claude/`
- `.claude-plugin/`
- `~/.claude/`
- `~/.claude/projects/`

Tool / feature references (Claude Code primitives):
- `subagent_type` / `subagents`
- `Plan Mode` / `EnterPlanMode` / `ExitPlanMode`
- `Skill tool` (the Claude Code Skill activation tool specifically)
- `Agent tool` (the Claude Code Agent dispatch tool specifically — but be careful: "agent" in lowercase or referring to OpenAI Agents SDK is NOT this)
- `TaskCreate` / `TaskUpdate` / `TaskList` (Claude Code task tools)
- `Edit` / `Read` / `Write` / `Glob` / `Grep` followed by a Claude-Code-tool-context cue
- `Bash` followed by a permission-rule cue like `Bash(...)`

Environment variables:
- `CLAUDE_CODE_*` (any env var starting with this prefix)
- `SLASH_COMMAND_TOOL_CHAR_BUDGET`
- `CLAUDE_SESSION_ID`
- `CLAUDE_EFFORT`

Model identifiers:
- `claude-opus`, `claude-sonnet`, `claude-haiku` (and any specific model ID like `claude-opus-4-7`)
- `Opus 4.X` / `Sonnet 4.X` / `Haiku 4.X` (in a Claude-model-tier context)

Vendor / product references:
- `Anthropic` (the company)
- `Claude Code` (the product name)
- `Claude API` (the API product)
- `RTK` / `Rust Token Killer` (Claude-Code-specific proxy)

Auto memory:
- `auto memory` (the Claude Code feature, not generic memory talk)
- `MEMORY.md` in `~/.claude/projects/.../memory/`

Plugin marketplace:
- `.claude-plugin/marketplace.json`
- `claude plugin tag` (the CLI command)
- `plugins/<name>/.claude-plugin/`

## GENERIC content (move to AGENTS.md)

Sections that match these categories with NO keyword hits from the list above:

- **Repository purpose** — what the project is, why it exists
- **Environment** — language, runtime, package manager, install / dev / lint / test / build commands
- **Repository layout** — directory tree, module organization
- **Engineering rules** — change-size limits, review process, test-before-finish, dependency policy
- **Code style** — naming, indentation, imports, file organization
- **Security** — secrets handling, destructive-op gates, input-trust boundaries
- **Testing** — frameworks, conventions, coverage targets
- **Commit / PR conventions** — message format, branching, review process
- **Architecture decisions** — patterns the codebase uses (database, auth, cache, etc.) — generic descriptions, not Claude-specific instructions

## MIXED sections — splitting strategy

When a section contains both generic content and Claude-specific content (typical case: a `## Security` section that lists generic principles plus a Claude-specific "use Plan Mode for destructive ops" rule):

1. Identify the paragraphs containing Claude-specific keywords.
2. Propose: generic paragraphs → AGENTS.md; Claude-specific paragraphs → `.claude/rules/claude-code.md`, possibly under a new sub-section.
3. **Default to the rules file**: if a paragraph could go either way (e.g., "Always run tests before commit. In Claude Code, use the Bash tool with the test command.") and removing the Claude-specific clause would change meaning, put it in `.claude/rules/claude-code.md` and add the generic principle to AGENTS.md as a separate item.
4. Never silently delete content. Every section of the legacy CLAUDE.md must end up in its AGENTS.md or rules destination, unless the user explicitly marks it `DROP`.

## Layout of the rules file

New file (no `paths:` frontmatter, so it loads every session):

```markdown
# Claude Code

<!-- Claude-specific sections moved from the legacy CLAUDE.md, verbatim,
with sub-headings preserved (### Subagents, ### Plan Mode, etc.) -->
```

Existing `.claude/rules/claude-code.md`: append, never overwrite:

```markdown
## Migrated from CLAUDE.md

<!-- approved sections, verbatim -->
```

A keeper that applies only to some paths MAY go in its own rules file with `paths:` frontmatter, on user approval. Other files under `.claude/rules/` stay untouched.

If nothing Claude-specific survives the split, write no rules file.

## Legacy locations — `./CLAUDE.md` and `./.claude/CLAUDE.md`

A legacy CLAUDE.md can live at `./CLAUDE.md`, `./.claude/CLAUDE.md`, or both. Claude Code loads and concatenates both. Implications for the bridge:

- **Detect both.** Classify whichever exists; if both exist, classify the union so a rule in one file is not duplicated or contradicted by the other.
- **Delete both** after their content is written to AGENTS.md and the rules file. Delete last, never first.
- **`CLAUDE.local.md`** also suppresses AGENTS.md. It is personal: report it, do not touch it.

## Nested legacy files — `<dir>/CLAUDE.md` and `<dir>/.claude/CLAUDE.md`

A legacy CLAUDE.md below the root loads only when Claude reads a file in `<dir>`, and it suppresses `<dir>/AGENTS.md`. Classify it with the same keyword rules, but keep its folder scope in the destinations:

| Content | Destination | Write rule |
|---|---|---|
| Stub (`@AGENTS.md` / `@../AGENTS.md` only) | none | `DELETE` |
| GENERIC | `<dir>/AGENTS.md` | create if missing; else append a `## Migrated from CLAUDE.md` section; never overwrite |
| CLAUDE-SPECIFIC | `.claude/rules/<dir-slug>.md` at the project root | create with `paths:` frontmatter; else append a `## Migrated from <dir>/CLAUDE.md` section; never overwrite |

`<dir-slug>` is `<dir>` with `/` replaced by `-` (`packages/api` → `packages-api.md`). For `<dir>/.claude/CLAUDE.md`, `<dir>` is the parent of `.claude/`. If `CLAUDE.md` and `.claude/CLAUDE.md` both exist in one folder, classify their union, as at the root. Files in different folders are classified separately.

`paths:` frontmatter is a YAML list of glob patterns. A rules file with `paths:` loads only when Claude works with a file that matches one of the globs, so the migrated keepers keep the folder scope the nested CLAUDE.md had:

```markdown
---
paths:
  - "packages/api/**"
---

# packages/api

<!-- Claude-specific sections moved from packages/api/CLAUDE.md, verbatim -->
```

Quote each glob. Do not change the `paths:` of an existing rules file; append the sections only. A nested file never goes to `.claude/rules/claude-code.md`: that file has no `paths:` and loads in every session.

## What about user-level CLAUDE.md?

This skill scopes to the **project-level** CLAUDE.md only. User-level CLAUDE.md (`~/.claude/CLAUDE.md`) and managed-policy CLAUDE.md are out of scope. They do not suppress project AGENTS.md, and they often hold personal/org settings that do not belong in the project repo.

## Verification heuristic for the proposed split

The primary check is **per-section presence** (the same contract as the skill's Anti-Hallucination block): after the move, every `^#{1,3}` section of each non-stub legacy CLAUDE.md, root and nested, must appear in its approved destination (`AGENTS.md`, `<dir>/AGENTS.md`, `.claude/rules/claude-code.md`, or `.claude/rules/<dir-slug>.md`). A missing section that was not an explicit user `DROP` means content was lost: STOP and restore from the Step 5 backup. Pair it with a **net-shrink tripwire**: per legacy file, the moved lines in its AGENTS.md plus its rules file must be ≥ the source lines minus the dropped import line, if any. A byte-/line-percentage floor is NOT the loss check — added headings hide a dropped section.

Secondary duplication tripwire only: if the moved lines exceed the source by more than ~15%, STOP and check whether a section landed in BOTH files. The tolerance covers new headings, blank-line normalization, and minor heading adjustments.

## Sources

- <https://code.claude.com/docs/en/memory> — section "AGENTS.md" (checked 2026-09-23): Claude Code v2.1.277+ reads AGENTS.md natively; any `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` in the directory or above suppresses it; `.claude/rules/*.md` and `~/.claude/CLAUDE.md` load alongside AGENTS.md; a CLAUDE.md holding only `@AGENTS.md` can be removed. Section "Path-specific rules": a `.claude/rules/` file with `paths:` frontmatter (a YAML list of globs) loads only when Claude works with a matching file.
- <https://code.claude.com/docs/en/settings> — the `.claude/` directory, plugin/marketplace, and tool/permission primitives behind the CLAUDE-specific keyword set above.
