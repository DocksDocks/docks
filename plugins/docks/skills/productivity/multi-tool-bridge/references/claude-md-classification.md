# CLAUDE.md Content Classification — Keyword Rules

## Contents

- [CLAUDE-specific keyword set (any one hit → keep in CLAUDE.md)](#claude-specific-keyword-set-any-one-hit-keep-in-claudemd)
- [GENERIC content (move to AGENTS.md)](#generic-content-move-to-agentsmd)
- [MIXED sections — splitting strategy](#mixed-sections-splitting-strategy)
- [Heading hierarchy in the rewritten CLAUDE.md](#heading-hierarchy-in-the-rewritten-claudemd)
- [Project CLAUDE.md location — `./CLAUDE.md` vs `./.claude/CLAUDE.md`](#project-claudemd-location-claudemd-vs-claudeclaudemd)
- [What about user-level CLAUDE.md?](#what-about-user-level-claudemd)
- [Verification heuristic for the proposed split](#verification-heuristic-for-the-proposed-split)
- [Sources](#sources)

When an existing `CLAUDE.md` is present, the bridge skill must split it into:

- **GENERIC** → moves to `AGENTS.md` (tool-agnostic instructions)
- **CLAUDE-SPECIFIC** → stays in `CLAUDE.md` under a `## Claude Code` section
- **MIXED** → propose split; default to STAY in CLAUDE.md when uncertain

The split is presented to the user as a proposal table; **no rewrite happens without explicit approval**.

## CLAUDE-specific keyword set (any one hit → keep in CLAUDE.md)

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
2. Propose: generic paragraphs → AGENTS.md; Claude-specific paragraphs → CLAUDE.md, possibly under a new sub-section.
3. **Default-to-stay**: if a paragraph could go either way (e.g., "Always run tests before commit. In Claude Code, use the Bash tool with the test command.") and removing the Claude-specific clause would change meaning, KEEP it in CLAUDE.md and add the generic principle to AGENTS.md as a separate item.
4. Never silently delete content. Every line in the original CLAUDE.md must end up either in AGENTS.md or in the new CLAUDE.md, with the user able to verify line-count parity.

## Heading hierarchy in the rewritten CLAUDE.md

```markdown
@AGENTS.md

## Claude Code

<!-- All Claude-specific content kept from the original, optionally under
sub-headings preserved from the original (### Subagents, ### Plan Mode, etc.) -->
```

If nothing Claude-specific survives the split, CLAUDE.md becomes a one-line file:

```markdown
@AGENTS.md
```

(A symlink `CLAUDE.md -> AGENTS.md` is also officially supported by Claude Code per the memory docs, but the bridge skill defaults to the `@AGENTS.md` import form so the user can add Claude-specific content later without restructuring.)

## Project CLAUDE.md location — `./CLAUDE.md` vs `./.claude/CLAUDE.md`

A project CLAUDE.md is recognized at EITHER `./CLAUDE.md` OR `./.claude/CLAUDE.md`. When both exist they are both loaded and **concatenated** by Claude Code — neither takes precedence. Implications for the bridge:

- **Detect both.** Classify whichever exists; if both exist, classify the union and warn before rewriting either, so a rule in one file isn't silently duplicated or contradicted by the other.
- **Rewrite target = root `./CLAUDE.md`** by default (conventional, team-visible, committed). Create it there when neither exists.
- **Relative-import gotcha.** `@path` imports resolve relative to the file containing them, so `@AGENTS.md` is correct only in root `./CLAUDE.md`. If the target is `./.claude/CLAUDE.md`, the import must be `@../AGENTS.md` (an `@AGENTS.md` there resolves to the non-existent `.claude/AGENTS.md`).
- **Never consolidate two files silently.** When both exist, wire the import into root `./CLAUDE.md` and leave `./.claude/CLAUDE.md` in place; merge only on explicit user approval.

## What about user-level CLAUDE.md?

This skill scopes to the **project-level** CLAUDE.md only. User-level CLAUDE.md (`~/.claude/CLAUDE.md`) and managed-policy CLAUDE.md are out of scope — they often contain personal/org settings that don't generalize and shouldn't be bridged to the project repo.

## Verification heuristic for the proposed split

Before applying the rewrite, the skill computes:

- `lines_before = wc -l CLAUDE.md`
- `lines_after = wc -l <new CLAUDE.md> + wc -l <new AGENTS.md>`
- If `lines_after < lines_before * 0.95` → STOP, report potential content loss
- If `lines_after > lines_before * 1.15` → STOP, report potential content duplication

The 5% / 15% tolerances allow for the `@AGENTS.md` import line, blank-line normalization, and minor heading adjustments — but catch accidental section deletion or duplication.

## Sources

- <https://code.claude.com/docs/en/memory> — confirms (2026-05-27) the facts this file relies on: a project CLAUDE.md is valid at EITHER `./CLAUDE.md` OR `./.claude/CLAUDE.md`; all discovered memory files are **concatenated** (neither overrides the other); `@path` imports resolve **relative to the file containing the import** (so `@../AGENTS.md` is required inside `.claude/CLAUDE.md`); a `CLAUDE.md -> AGENTS.md` symlink is officially supported.
- <https://code.claude.com/docs/en/settings> — the `.claude/` directory, plugin/marketplace, and tool/permission primitives behind the CLAUDE-specific keyword set above.
