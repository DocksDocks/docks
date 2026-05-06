# Embedded Template — `docs/roadmap/CLAUDE.md`

Verbatim content to write at `docs/roadmap/CLAUDE.md`. Substitute `{{ISO_DATE}}` placeholders with the current ISO 8601 timestamp at write time (run `date +"%Y-%m-%dT%H:%M:%S%:z"`).

````markdown
# Roadmap Conventions

All non-trivial plans live here. A plan is anything that takes more than one
commit to finish and/or needs checkbox tracking across sessions.

## Lifecycle folders

| Folder | When a plan lives here |
|--------|------------------------|
| `planned/` | Plan is written + approved, but no code has landed yet |
| `ongoing/` | At least one commit toward the plan has landed |
| `finished/` | All steps closed; prefixed with completion date `YYYY-MM-DD-<slug>.md` |

Move the file with `git mv` between folders so history is preserved.

## File header (required)

Every plan starts with a YAML metadata block and a status line:

```markdown
---
created: {{ISO_DATE}}
updated: {{ISO_DATE}}
finished: null
status: planned
---

# <Plan Title>
```

Rules:

- **`created`** — set once, never change.
- **`updated`** — bump to the current timestamp on every edit, including state flips.
- **`finished`** — `null` until the plan moves to `finished/`, then set to the completion timestamp.
- **`status`** — one of `planned`, `ongoing`, `finished`. Must match the folder.

Timestamps are ISO 8601 with explicit local offset
(`YYYY-MM-DDTHH:MM:SS±HH:MM`). Never use relative phrasing like "today" or
"last week" inside the plan. Fetch a fresh timestamp:

```bash
date +"%Y-%m-%dT%H:%M:%S%:z"
```

## Real-time task tracking — tri-state checkboxes

Every actionable step is a GitHub-style checkbox in one of three states:

| State | Meaning | Commit policy |
|-------|---------|---------------|
| `- [ ]` | Planned, not started | Lives in commits |
| `- [~]` | Active / in-progress / partial | **Uncommitted scratch state — flip freely without a commit** |
| `- [x]` | Done — code landed | Flip in the commit that lands the step (or the next commit if batched) |

The `[~]` state is the working scratch marker. It exists so you can:

- Mark several steps as "currently touching" during exploratory work without
  generating a commit per micro-step.
- Recover state after auto-compaction: the file on disk is the source of
  truth, so progress isn't lost when the conversation context gets summarized.
- Sweep `[~]` → `[x]` when steps actually land — either step-by-step or in a
  small batch within the same logical commit.

**Hard rule:** never flip `[x]` for a step you didn't actually land in code.
`[~]` is permissive; `[x]` is a binding claim that the step shipped.

If a step is abandoned mid-flight, strike it through (`~~…~~`) with a
one-line reason rather than silently deleting it.

If scope changes, update the plan in the same commit that enacts the change.

## Auto-compact resilience

The plan file on disk is the source of truth — it is not part of conversation
context, so auto-compact never touches it. Practices that exploit this:

- **Re-read before resume** — when picking up work after a gap or after a
  compaction event, start by re-reading the plan file rather than relying on
  conversation memory.
- **Update as you go** — flip `[~]` and `[x]` in the file, not just in chat.
  Conversation state is volatile; file state is durable.
- **Don't track state only in chat** — if a TodoWrite list is the only place a
  step's status lives, auto-compact can drop it. Mirror anything important to
  the plan file.

## Lifecycle transitions

| Transition | What to do |
|------------|------------|
| New plan | Create in `planned/<slug>.md` with the header, status `planned`. |
| First commit toward plan | `git mv` to `ongoing/`, flip status to `ongoing`, bump `updated`. |
| Last `[~]` / `[ ]` flips to `[x]` | `git mv` to `finished/YYYY-MM-DD-<slug>.md`, set `finished`, flip status to `finished`, bump `updated`. |
| Plan superseded | Move to `finished/` with `status: superseded` and a one-paragraph note explaining what replaces it. |

## Slugs

Lowercase, hyphenated, descriptive. Match the primary commit scope where
possible (e.g. `auth-rate-limit`, `image-cdn-migration`).

When a plan lands in `finished/`, prefix with the completion date to keep the
folder chronologically browsable:

```
finished/2026-05-04-auth-rate-limit.md
```

## Not a plan

Reference docs, architecture notes, and API contracts do **not** belong here —
they belong in `.claude/skills/`, `.claude/agents/`, or the project's root
`CLAUDE.md`. This folder is strictly for time-boxed work items where progress
needs to be tracked across sessions.
````
