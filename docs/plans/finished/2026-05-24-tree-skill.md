---
title: Add context-tree skill for lazy per-folder context
status: finished
goal: Generate and auto-refresh nested AGENTS.md+CLAUDE.md pairs per major folder so root context stays sparse and per-area conventions load lazily
created: "2026-05-24T00:00:00-03:00"
updated: "2026-05-24T00:00:00-03:00"
started_at: "2026-05-24T00:00:00-03:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: 079a2716f6dc0ce9ed06ec7349d6e72f3871dfc5
tags: [context-tree, lazy-context, hooks, multi-tool]
affected_paths:
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/context-tree/references/major-folder-heuristics.md
  - plugins/docks/skills/productivity/context-tree/references/node-template.md
  - plugins/docks/skills/productivity/context-tree/references/conflict-resolution.md
  - plugins/docks/hooks/hooks.json
  - plugins/docks/hooks/context-tree-nudge.sh
  - plugins/docks/.codex-plugin/plugin.json
  - AGENTS.md
  - CLAUDE.md
  - scripts/guard-tree.sh
  - scripts/guard-agents.sh
  - scripts/score-agents.sh
  - scripts/ci.sh
  - plugins/docks/skills/AGENTS.md
  - plugins/docks/skills/CLAUDE.md
  - plugins/docks/agents/AGENTS.md
  - plugins/docks/agents/CLAUDE.md
  - scripts/AGENTS.md
  - scripts/CLAUDE.md
  - .github/AGENTS.md
  - .github/CLAUDE.md
related_plans: [foundation-categorization-scoring, skill-maintainer-fixes, scaffold]
review_status: passed
---

# Add context-tree skill for lazy per-folder context

## Goal

Ship a `context-tree` skill that scaffolds, audits, and refreshes one `AGENTS.md` + one-line `CLAUDE.md` per major folder of a repo. Pair with a plugin-shipped `PostToolUse` hook (Claude Code) that nudges Claude to refresh the nearest node after edits inside a tracked subtree, and a parity Codex hook for Codex. Dogfood on this repo: root `CLAUDE.md` shrinks by relocating per-area conventions into nested nodes that load only when relevant.

## Context

Both Codex and Claude Code natively support hierarchical context discovery. Codex walks root → cwd combining every `AGENTS.md` (88 separate AGENTS.md files in OpenAI's own Codex repo); Claude Code descendant-loads `CLAUDE.md` on demand when files in the subtree are read. The pattern is canon, not invention — this repo already runs it for `docs/plans/` (one AGENTS.md, one CLAUDE.md `@AGENTS.md` import). `context-tree` generalizes that one-off into a systematic convention applied to every major folder.

**Why the CLAUDE.md pair is load-bearing.** Claude Code's descendant discovery walks for `CLAUDE.md` (and `CLAUDE.local.md`), NOT for `AGENTS.md`. Without the one-line CLAUDE.md pair, the nested AGENTS.md is invisible to Claude Code's lazy-loading (Codex still walks it natively). So every node is a pair: `<folder>/AGENTS.md` (canonical content for both tools) + `<folder>/CLAUDE.md` (one line: `@AGENTS.md`, resolves relative to itself).

**Why each node must be self-sufficient.** Descendant loading has known gaps ([#3529](https://github.com/anthropics/claude-code/issues/3529), [#4607](https://github.com/anthropics/claude-code/issues/4607)). Plus `--continue` sessions don't reattach nested CLAUDE.md. Each node must restate the rules it cares about, not write "see root for X." When it loads, it stands alone.

The payoff: the root context file stays sparse (loaded once per session by every agent). Per-area conventions live close to the code they govern. Plan foundation-categorization-scoring shipped first so the per-folder structure inside `plugins/docks/{skills,agents}/` is clean enough for one rolled-up AGENTS.md per parent to make sense.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Confirm major-folder detection list for dogfood pass | — | — | done | self |
| 2 | Add "Context tree" section (node map table) to root `AGENTS.md` | 1 | with #3 | done | self |
| 3 | Create `plugins/docks/skills/productivity/context-tree/SKILL.md` + 3 references files | 1 | with #2 | done | self |
| 4 | Create `plugins/docks/hooks/hooks.json` — PostToolUse `Edit\|Write` **command** hook + `context-tree-nudge.sh` helper (revised from prompt-hook; see Mistakes) | 3 | with #5 | done | self |
| 5 | Codex parity hook — **implemented** cross-tool (Claude `file_path` + Codex `apply_patch` headers; declared in `.codex-plugin/plugin.json`) | 3 | with #4 | done | self |
| 6 | Add `scripts/guard-tree.sh` (wired into ci.sh) — every tracked node has both files, CLAUDE.md is `@AGENTS.md` only, AGENTS.md ≤500 lines | 3 | — | done | self |
| 7 | Run `context-tree init` on this repo, approve node list, write all pairs | 2, 3, 6 | — | done | self |
| 8 | Relocate authoring sections from root `CLAUDE.md` into 4 nodes (skills/agents/scripts/.github); collapse root CLAUDE.md → `@AGENTS.md` | 7 | — | done | self |
| 9 | `bash scripts/ci.sh` including new guard | 6, 7, 8 | — | done | self |
| 10 | `./scripts/release.sh minor` (user-run — new skill + hook = minor bump) | 9 | — | planned | self |

### Step details

- **#1** — Expected dogfood nodes (corrected for current repo after pipelines-to-skills):
  - `docs/plans/` (already a node — detect, leave untouched)
  - `plugins/docks/skills/`
  - `plugins/docks/agents/` (now just plan-manager + plan-review)
  - `scripts/`
  - `.github/`
  - *deferred:* `docs/scaffold/` lands with the scaffold plan; `context-tree` picks it up on next refresh
  - *removed:* `plugins/docks/commands/` no longer exists (deleted by pipelines-to-skills)
- **#3** — Skill operations (covered in SKILL.md body):
  - `context-tree init` — first-time scaffold; detect, propose, await approval, write all pairs, insert root section. Idempotent.
  - `context-tree audit` — read-only; flag drift between AGENTS.md claims and disk.
  - `context-tree refresh <folder>` — re-generate one node; calls skill-maintainer-fixes' `--check-only` predicate first to avoid no-op writes.
  - `context-tree refresh` — re-generate every node when convention itself changes.
- **#4** — Hook shape:
  ```json
  {
    "hooks": {
      "PostToolUse": [{
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "prompt",
          "prompt": "If $EDITED_PATH is inside a tracked context-tree node (a folder with AGENTS.md + CLAUDE.md), invoke the context-tree skill: context-tree refresh <node>. The skill is a no-op when no semantic change occurred (per skill-maintainer-fixes content_hash check)."
        }]
      }]
    }
  }
  ```
- **#5** — Codex hooks are stable; configurable inline. Parity adds maintenance surface but prevents Codex users silently getting worse refresh discipline. Verify the current Codex hook config shape before writing.
- **#7** — Approval gate uses the same pattern the existing `agents` bridge skill uses for its CLAUDE.md split — show table, wait for user confirmation, then write. This is the consequential step (writes ~8 new files + edits root context); checkpoint with the user here.
- **#8** — The authoring section becomes the body of `plugins/docks/skills/AGENTS.md`. Claude lazy-loads it only when working inside that subtree, saving tokens in every other session.

## Acceptance criteria

- [x] `context-tree init` produces the proposed node list, waits for approval, writes all pairs
- [x] Every node is a pair: `<folder>/AGENTS.md` + `<folder>/CLAUDE.md` (one-line `@AGENTS.md`)
- [x] Every node's AGENTS.md is self-sufficient (no "see root for X" pointers)
- [x] Root `AGENTS.md` has the "Context tree" section
- [x] Root `CLAUDE.md` line count drops after dogfood (catches accidental content push-back)
- [x] `PostToolUse` hook fires on `Edit|Write`; the called `context-tree refresh` no-ops when nothing semantic changed
- [x] `scripts/guard-tree.sh` green; `bash scripts/ci.sh` green
- [x] Existing `docs/plans/AGENTS.md` + `CLAUDE.md` left untouched (context-tree detects it's already a node)

## Out of scope

- A CONTEXT.md convention. Neither tool auto-loads CONTEXT.md; shared-language content goes in root AGENTS.md instead
- Per-category AGENTS.md inside `skills/<category>/` — one rolled-up `skills/AGENTS.md` is enough until categories diverge on authoring rules
- A generic site-wide doc generator — `context-tree` operates on the major-folder convention only
- Migration of existing user-project AGENTS.md files that don't follow the pair convention — auto-detect and surface, don't auto-rewrite

## Mistakes & Dead Ends

- **2026-05-24**: plan specced the refresh-nudge as a `"type": "prompt"` PostToolUse hook reading `$EDITED_PATH`. → Research against the current Claude Code hooks reference showed (a) prompt-type hooks are for yes/no LLM *decisions* (poor fit for a nudge, and an LLM call on every edit), and (b) there is no `$EDITED_PATH` — command hooks receive `tool_input.file_path` via JSON on stdin. → Adapted: a `"type": "command"` hook running `hooks/context-tree-nudge.sh`, which parses stdin, walks up to the nearest node, and emits `hookSpecificOutput.additionalContext` only when the edit is inside a node. Deterministic, no per-edit LLM cost. Verified with 3 simulated payloads (in-node nudges, root silent, empty stdin safe).
- **2026-05-24**: Codex hook parity was first scoped as deferred, then implemented once research closed the gap. → The current Codex hooks doc confirms (a) Codex exposes `CLAUDE_PLUGIN_ROOT` for compatibility, so the same command path resolves on both tools; (b) the `apply_patch` PostToolUse payload carries file paths as `*** Add|Update|Delete File: <path>` headers inside `tool_input.command`; (c) matcher aliases `apply_patch|Edit|Write` cover both runtimes. → The helper now extracts BOTH Claude `file_path` and Codex apply_patch headers, falls back to `git rev-parse` for the repo root when `CLAUDE_PROJECT_DIR` is unset (Codex), and is declared via `"hooks": "./hooks/hooks.json"` in `.codex-plugin/plugin.json`. Verified with 5 simulated payloads (Claude single-file, Codex single + multi-file, root-silent, empty-safe). Still untested on a live Codex run — degrades to a silent no-op if the real payload differs, so no harm.

- **2026-05-24** (validator-glob collision, surfaced by the dogfood): writing the `agents/` node (`plugins/docks/agents/AGENTS.md` + `CLAUDE.md`) turned CI red — `guard-agents.sh`, `score-agents.sh`, and `ci.sh`'s agent-count each glob `agents/*.md` and treated the two node files as agent definitions (they scored 4 + 2, and the per-file/total agent floor jumped to 4×14=56). → Root cause: in this repo the flat agent-definition directory and a context-tree node directory are the *same* directory, and the agent tooling assumed every `.md` is an agent. → Fix: skip the reserved filenames `AGENTS.md`/`CLAUDE.md` in all three (they can never be valid agents — uppercase fails the kebab-case `name` rule and "CLAUDE" is a forbidden substring). General hardening, not a one-off: any repo pairing flat agents with context-tree hits this.

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

(none — actionable now; foundation-categorization-scoring + skill-maintainer-fixes already landed)

## Notes

- **2026-05-24 start**: renamed the skill `tree` → `context-tree` (user call — `tree` is overloaded with file trees / data structures and sits next to the `docs`/`agents` skills; `context-tree` self-documents). Corrected the dogfood node list for current repo: removed `plugins/docks/commands/` (deleted by pipelines-to-skills), deferred `docs/scaffold/` (scaffold plan not yet run). Step #8's relocated section is now "Authoring skills & agents" (commands dropped from the heading by pipelines-to-skills).
- **2026-05-24 dogfood outcome**: root `CLAUDE.md` collapsed fully to the one-line `@AGENTS.md` (was 147 lines), not just trimmed. Per-area authoring relocated into FOUR nodes — wider than step #8's original `skills/`-only scope: `plugins/docks/skills/AGENTS.md` (skill authoring), `plugins/docks/agents/AGENTS.md` (agent authoring), `scripts/AGENTS.md` (validators + release flow + versioning), `.github/AGENTS.md` (CI trigger model). Root `AGENTS.md` keeps only repo-wide content + the Context tree map. Scope expansion approved by the user ("shouldn't it be stored all in AGENTS.md since this plugin focuses on both"). `guard-tree.sh` now validates root as a 6th node (root exemption dropped). **Open question resolved** — node-body ceiling kept at 500 (root AGENTS.md is well under). **Ship-side caveat:** the two `plugins/docks/{skills,agents}/AGENTS.md` nodes ship to consumers as inert bloat — harmless, accepted.
- Open questions:
  - Hook scope — fire only inside tracked nodes, or also nudge when an edit creates conditions for a *new* major folder (e.g., dropping `package.json` into a previously-trivial dir)? Lean: existing nodes only; new-node detection happens via explicit `context-tree audit`.
  - Frontmatter on AGENTS.md — not required by spec; a `tree:` metadata block (last-refreshed, source-files-considered) would let audit flag drift without rescanning. Worth it or heavy?
  - Node-body ceiling — 500 lines (Anthropic doc max) or tighter 310 (SKILL.md sweet spot)? `docs/plans/AGENTS.md` is ~480 today; tightening would force refactor. Lean: keep AGENTS.md ceiling at 500, distinct from SKILL.md's 310.
- Pairs with skill-maintainer-fixes: the hook calls `context-tree refresh` which calls the maintainer's `--check-only`. Without that plan landing first, the hook would write-loop. (It landed — `8e1946e`.)
- Pairs with scaffold: the `scaffold` skill reads the context-tree spec to seed new projects. Without context-tree, scaffold has no structured template.

## Review

- **Goal met:** yes — all 8 acceptance criteria evidence-verified against ship_commit 079a271: 5 node pairs on disk (each AGENTS.md + one-line `@AGENTS.md` CLAUDE.md), root CLAUDE.md collapsed 147→1 line, root AGENTS.md carries the Context tree section (AGENTS.md:26), nodes self-sufficient (no "see root" pointers), the PostToolUse hook nudges in-node / stays silent at root / is empty-stdin-safe (4-payload simulation), and docs/plans/{AGENTS,CLAUDE}.md were left untouched (detected as an existing node).
- **Regressions:** none — validator hardening verified: guard-agents.sh + score-agents.sh skip reserved `AGENTS`/`CLAUDE` basenames (scripts/guard-agents.sh:29, scripts/score-agents.sh:43), ci.sh adds `guard-tree` to structural guards and excludes the two reserved files from the agent-count floor (scripts/ci.sh:155,190). Hook is executable (100755) with a valid `#!/bin/bash` shebang and exits 0 on every path.
- **CI:** pass — `bash scripts/ci.sh` exit 0; all guards green (incl. guard-tree: 6 nodes valid), score floors clear (productivity 117/72 over 9 skills, agents 29/28), content_hash idempotent.
- **Follow-ups:** none — deferred `docs/scaffold/` node lands with the scaffold plan (out of scope here); the two `plugins/docks/{skills,agents}/AGENTS.md` nodes shipping to consumers as inert bloat is a documented, accepted trade-off.
- Filed by: plan-review on 2026-05-24T23:01:54-03:00
