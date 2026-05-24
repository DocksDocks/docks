---
name: zoom-out
description: "Use when tunneling in code-level detail and you need a system-level map — modules, callers, data flow, seams — using the project's domain vocabulary. Triggers: user says \"zoom out\", \"give me a map\", \"I'm lost in this code\", \"how does this fit\"; OR you've been reading the same file for 10+ minutes without a model of the surrounding system; OR an architectural question landed and the next action isn't obvious. Output is a labelled diagram or tight bullet list, not prose."
user-invocable: true
metadata:
  pattern: micro-skill
  updated: "2026-05-17"
  content_hash: "420a929a00cb2e15c0e4207ffe7ab0848df30b30bc96f47c91cef1bd183397a8"
---

# Zoom Out

Stop reading the file. Go up a layer of abstraction. Produce a map of the relevant modules, their interfaces, the call edges between them, and where state and IO cross. The map's job is to make the system visible enough that the next action is obvious.

<constraint>
The output of a zoom-out is a MAP, not a write-up. Aim for a labelled diagram (fenced ASCII / text), a tight bullet list of the form `ModuleA → ModuleB (calls X) → ModuleC (writes Y)`, or a table. Prose paragraphs about what each module "kind of does" defeat the purpose — that's the noise you were already drowning in.
</constraint>

<constraint>
Use the project's domain vocabulary first. If `.claude/skills/solid/references/depth-and-seams.md` exists, the structural vocabulary is locked to Module / Interface / Implementation / Depth / Seam / Adapter — use those terms exactly, don't drift into "component," "service," "API," "wrapper," "boundary." Domain nouns come from the project's `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md` (whichever exists) — use those rather than inventing labels.
</constraint>

## What to produce

1. **Module list** — name + one-line role each. **Cap at ~7 modules**; if you have more, you haven't zoomed out far enough — collapse adjacent ones until ≤ 7. The 7-item cap is the discipline.
2. **Call edges** — `A → B (what A asks B for)`. Direction matters — caller on the left.
3. **Data flow** — where state mutates, where IO crosses (network / disk / DB / queue), where the seams sit (places behaviour can be altered without editing in place).
4. **The user's question, restated against the map** — "you were asking about X; X lives in Module M, called from N callers, gated by …". This closes the loop.

## When NOT to use

- You already have a mental model and the next action is obvious — just take the action.
- The bug is in one function with no upstream / downstream callers — read the function, fix it, don't draw a map.
- A research question better served by `Explore` ("where is X defined", "find all callers of Y") — that's grep + Glob, not zoom-out.
- The user asked for an implementation, not an explanation — implement, then briefly describe; don't gate work behind a diagram.

## Quick template

```
modules:
  - Foo          — receives X from clients, normalizes to Y
  - Bar          — owns persistence for Y; writes to Postgres `things` table
  - Baz adapter  — fan-out to N downstream services (real seam: 3 adapters)

edges:
  Client → Foo (POST /things)
  Foo    → Bar (insertThing)
  Bar    → Baz (notifyThing)
  Baz    → [Slack | Email | Webhook]

state / IO:
  - mutates: Bar (Postgres) — only writer
  - reads:   Foo, Baz (Bar.findThing)
  - IO:      Foo (HTTP in), Bar (DB), Baz (HTTP out × N)

your question restated:
  "Why does deleting a thing leave dangling notifications?" — the delete path
  goes Client → Foo → Bar but skips Baz. Baz's notifications are not lifecycle-
  bound to Bar's rows. Fix is at the Foo→Bar→Baz seam, not inside Bar.
```

## Companion skills

- `solid` + `references/depth-and-seams.md` — the architectural vocabulary used in maps.
- `Explore` (built-in) — for "find where X is" lookups. Faster than a full zoom-out when you just need a location.

## Source

Pattern adapted from Matt Pocock's `zoom-out` skill (MIT): <https://github.com/mattpocock/skills/blob/main/skills/engineering/zoom-out/SKILL.md>. Matt's is 5 lines and assumes a richer CONTEXT.md / glossary discipline; this expansion encodes the discipline inline so it works without those files.
