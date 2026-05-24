---
title: Add tree skill for lazy per-folder context
status: planned
goal: Generate and auto-refresh nested AGENTS.md+CLAUDE.md pairs per major folder so root context stays sparse and per-area conventions load lazily
created: 2026-05-24
updated: 2026-05-24
started_at: null
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: [tree, lazy-context, hooks, multi-tool]
affected_paths:
  - plugins/docks/skills/productivity/tree/SKILL.md
  - plugins/docks/skills/productivity/tree/references/major-folder-heuristics.md
  - plugins/docks/skills/productivity/tree/references/node-template.md
  - plugins/docks/skills/productivity/tree/references/conflict-resolution.md
  - plugins/docks/hooks/hooks.json
  - AGENTS.md
  - CLAUDE.md
  - scripts/guard-tree.sh
  - scripts/ci.sh
  - plugins/docks/skills/AGENTS.md
  - plugins/docks/skills/CLAUDE.md
  - plugins/docks/agents/AGENTS.md
  - plugins/docks/agents/CLAUDE.md
  - plugins/docks/commands/AGENTS.md
  - plugins/docks/commands/CLAUDE.md
  - scripts/AGENTS.md
  - scripts/CLAUDE.md
  - .github/AGENTS.md
  - .github/CLAUDE.md
related_plans: [foundation-categorization-scoring, skill-maintainer-fixes, scaffold]
review_status: null
---

# Add tree skill for lazy per-folder context

## Goal

Ship a `tree` skill that scaffolds, audits, and refreshes one `AGENTS.md` + one-line `CLAUDE.md` per major folder of a repo. Pair with a plugin-shipped `PostToolUse` hook (Claude Code) that nudges Claude to refresh the nearest node after edits inside a tracked subtree, and a parity `.codex/config.toml` hook for Codex. Dogfood on this repo: root `CLAUDE.md` shrinks from ~150 lines to ~40 by relocating per-area conventions into nested nodes that load only when relevant.

## Context

Both Codex and Claude Code natively support hierarchical context discovery. Codex walks root → cwd combining every `AGENTS.md` (88 separate AGENTS.md files in OpenAI's own Codex repo); Claude Code descendant-loads `CLAUDE.md` on demand when files in the subtree are read. The pattern is canon, not invention — this repo already runs it for `docs/plans/` (one AGENTS.md, one CLAUDE.md `@AGENTS.md` import). `tree` generalizes that one-off into a systematic convention applied to every major folder.

**Why the CLAUDE.md pair is load-bearing.** Claude Code's descendant discovery walks for `CLAUDE.md` (and `CLAUDE.local.md`), NOT for `AGENTS.md`. Without the one-line CLAUDE.md pair, the nested AGENTS.md is invisible to Claude Code's lazy-loading (Codex still walks it natively). So every node is a pair: `<folder>/AGENTS.md` (canonical content for both tools) + `<folder>/CLAUDE.md` (one line: `@AGENTS.md`, resolves relative to itself).

**Why each node must be self-sufficient.** Descendant loading has known gaps ([#3529](https://github.com/anthropics/claude-code/issues/3529), [#4607](https://github.com/anthropics/claude-code/issues/4607)). Plus `--continue` sessions don't reattach nested CLAUDE.md. Each node must restate the rules it cares about, not write "see root for X." When it loads, it stands alone.

The payoff: the root context file stays sparse (loaded once per session by every agent). Per-area conventions live close to the code they govern. Plan foundation-categorization-scoring ships first so the per-folder structure inside `plugins/docks/{skills,agents}/` is clean enough for one rolled-up AGENTS.md per parent to make sense.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Confirm major-folder detection list for dogfood pass | — | — | planned | self |
| 2 | Add "Context tree" section (~12 lines) to root `AGENTS.md` | 1 | with #3 | planned | self |
| 3 | Create `plugins/docks/skills/productivity/tree/SKILL.md` + 3 references files | 1 | with #2 | planned | self |
| 4 | Create `plugins/docks/hooks/hooks.json` with PostToolUse `Edit\|Write` prompt-type hook | 3 | with #5 | planned | self |
| 5 | Add `.codex/config.toml` parity hook (or document why deferred) | 3 | with #4 | planned | self |
| 6 | Add `scripts/guard-tree.sh` — every tracked node has both files, CLAUDE.md is `@AGENTS.md` only, AGENTS.md ≤500 lines | 3 | — | planned | self |
| 7 | Run `tree init` on this repo, approve node list, write all pairs | 2, 3, 6 | — | planned | self |
| 8 | Relocate "Authoring skills, commands & agents" section from root `CLAUDE.md` to `plugins/docks/skills/AGENTS.md` | 7 | — | planned | self |
| 9 | `bash scripts/ci.sh` including new guard | 6, 7, 8 | — | planned | self |
| 10 | `./scripts/release.sh minor` (new skill + hook = minor bump) | 9 | — | planned | self |

### Step details

- **#1** — Expected dogfood nodes:
  - `docs/plans/` (already exists)
  - `docs/scaffold/` (lands with scaffold plan; tree picks up on next refresh)
  - `plugins/docks/skills/`
  - `plugins/docks/agents/`
  - `plugins/docks/commands/`
  - `scripts/`
  - `.github/`
- **#3** — Skill operations (covered in SKILL.md body):
  - `tree init` — first-time scaffold; detect, propose, await approval, write all pairs, insert root section. Idempotent.
  - `tree audit` — read-only; flag drift between AGENTS.md claims and disk.
  - `tree refresh <folder>` — re-generate one node; calls skill-maintainer-fixes' `--check-only` predicate first to avoid no-op writes.
  - `tree refresh` — re-generate every node when convention itself changes.
- **#4** — Hook shape:
  ```json
  {
    "hooks": {
      "PostToolUse": [{
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "prompt",
          "prompt": "If $EDITED_PATH is inside a tracked tree node (a folder with AGENTS.md + CLAUDE.md), invoke the tree skill: tree refresh <node>. The skill is a no-op when no semantic change occurred (per skill-maintainer-fixes content_hash check)."
        }]
      }]
    }
  }
  ```
- **#5** — Codex hooks are stable; configurable inline in `config.toml`. Parity adds maintenance surface but prevents Codex users silently getting worse refresh discipline.
- **#7** — Approval gate uses the same pattern the existing `agents` bridge skill uses for its CLAUDE.md split — show table, wait for user confirmation, then write.
- **#8** — The ~80-line authoring section becomes the body of `plugins/docks/skills/AGENTS.md`. Claude lazy-loads it only when working inside that subtree, saving tokens in every other session.

## Acceptance criteria

- [ ] `tree init` produces the proposed node list, waits for approval, writes all pairs
- [ ] Every node is a pair: `<folder>/AGENTS.md` + `<folder>/CLAUDE.md` (one-line `@AGENTS.md`)
- [ ] Every node's AGENTS.md is self-sufficient (no "see root for X" pointers)
- [ ] Root `AGENTS.md` has the "Context tree" section
- [ ] Root `CLAUDE.md` line count drops below 60 after dogfood (catches accidental content push-back)
- [ ] `PostToolUse` hook fires on `Edit|Write`; the called `tree refresh` no-ops when nothing semantic changed
- [ ] `scripts/guard-tree.sh` green; `bash scripts/ci.sh` green
- [ ] Existing `docs/plans/AGENTS.md` + `CLAUDE.md` left untouched (tree detects it's already a node)

## Out of scope

- A CONTEXT.md convention. Neither tool auto-loads CONTEXT.md; shared-language content goes in root AGENTS.md instead
- Per-category AGENTS.md inside `skills/<category>/` — one rolled-up `skills/AGENTS.md` is enough until categories diverge on authoring rules
- A generic site-wide doc generator — `tree` operates on the major-folder convention only
- Migration of existing user-project AGENTS.md files that don't follow the pair convention — auto-detect and surface, don't auto-rewrite

## Mistakes & Dead Ends

(none yet — plan freshly written)

## Sources

- https://code.claude.com/docs/en/memory — Claude Code recursive CLAUDE.md discovery; descendant loading walks for CLAUDE.md not AGENTS.md
- https://dev.to/datadog-frontend-dev/steering-ai-agents-in-monorepos-with-agentsmd-13g0 — agents.md spec nested hierarchy + 88 AGENTS.md files in OpenAI's Codex repo (proof at scale)
- https://deepwiki.com/shanraisshan/claude-code-best-practice/5.3-monorepo-support — three loading patterns (ancestor / descendant / sibling isolation)
- https://github.com/anthropics/claude-code/issues/3529 — descendant CLAUDE.md loading gap (informs the self-sufficiency rule)
- https://github.com/anthropics/claude-code/issues/4607 — `--continue` doesn't reattach nested CLAUDE.md (same lesson)
- https://code.claude.com/docs/en/plugins-reference — plugin hook configuration shape
- https://developers.openai.com/codex/hooks — Codex hooks for parity step #5
- `docs/plans/AGENTS.md` + `docs/plans/CLAUDE.md` (repo prior art the convention generalizes)

## Blockers

(none — actionable after foundation-categorization-scoring lands)

## Notes

- Open questions:
  - Hook scope — fire only inside tracked nodes, or also nudge when an edit creates conditions for a *new* major folder (e.g., dropping `package.json` into a previously-trivial dir)? Lean: existing nodes only; new-node detection happens via explicit `tree audit`.
  - Frontmatter on AGENTS.md — not required by spec; a `tree:` metadata block (last-refreshed, source-files-considered) would let audit flag drift without rescanning. Worth it or heavy?
  - Node-body ceiling — 500 lines (Anthropic doc max) or tighter 310 (SKILL.md sweet spot)? `docs/plans/AGENTS.md` is 480 today; tightening would force refactor. Lean: keep AGENTS.md ceiling at 500, distinct from SKILL.md's 310.
- Pairs with skill-maintainer-fixes: the hook calls `tree refresh` which calls the maintainer's `--check-only`. Without that plan landing first, the hook would write-loop.
- Pairs with scaffold: `/scaffold` reads the tree spec to seed new projects. Without tree, scaffold has no structured template.

## Review

(filled by plan-review on completion)
