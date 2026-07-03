# Durable anchors — how long-lived artifacts reference code

Line numbers are the first thing to rot: every edit above a cited line shifts it, and a
stale-but-confident `file:42` actively misleads the next agent, while a purpose/symbol
anchor degrades into a still-useful search hint. So anchor form follows artifact class.

## Artifact classes

| Artifact | Class | Anchor form |
|---|---|---|
| Review/security/refactor findings, pipeline working notes, plan `## Sources` | **point-in-time** — consumed against the commit it was written at | `file:line` REQUIRED (precision at creation is the job) |
| SKILL.md bodies, `references/`, AGENTS.md nodes, knowledge-bundle concepts | **long-lived** — outlives the commit, maintained by nobody in particular | durable grammar below; bare `path:NN` forbidden unless the path is fictional (teaching example) |

The test: *will anyone read this after the cited code has changed?* Yes → long-lived.

## The durable-anchor grammar

```text
`<path>` — `<symbol or config key>` — <one-line purpose> (verify: `<command that re-derives it>`)
```

- **path** — file or directory; the coarsest pointer that still routes a reader.
- **symbol** — function, type, config key, CLI flag: greppable, moves far less than lines.
- **purpose** — what the code is FOR; survives renames and rewrites, guides re-search when the pointer dies.
- **verify** — the command that re-derives the fact from source right now.

```markdown
BAD  — The per-file floor is set in src/config/limits.json:4.
GOOD — `src/config/limits.json` — `review.per_file_floor` — the per-file review
       floor (verify: `grep -n per_file_floor src/config/limits.json`).
```

The BAD form is one edit away from lying. The GOOD form still works after the file gains
50 lines, and if the key is renamed the purpose + verify command lead straight to the truth.

## Re-verify cues for volatile facts

A **volatile fact** is anything the repo can silently change under the doc: versions,
counts, floors/thresholds, paths, port numbers, flag defaults, rate limits. Every volatile
fact in a long-lived artifact carries the cue that re-derives it — a command, a config key,
or a URI — so a reader can check before relying:

```markdown
BAD  — The selftest has 62 checks.
GOOD — The selftest prints its check count on PASS (verify: `node test/selftest.mjs | tail -1`).
```

If a fact has no re-derivation source, either it is not volatile (state it plainly) or it
should not be asserted (omit it, or mark it explicitly unverified).

## Stale-tolerance line

Every GENERATED long-lived artifact (a built skill, an emitted AGENTS.md node) includes one
standing line telling future readers how to treat its pointers:

```markdown
Pointers here name concepts, not coordinates — if a path or symbol has moved, trust the
stated purpose and re-locate it (grep the symbol) before acting; treat the `verify:`
commands as the source of truth for volatile values.
```

This is what makes a forgotten update degrade safely instead of harming the next agent.

## Self-check (inline, no tooling required)

Before shipping a long-lived artifact, scan it for live line anchors — a `path:NN` whose
path actually exists is a drift bomb; a fictional example path is fine:

```bash
grep -nE '[A-Za-z0-9_./-]+\.[a-z]{1,5}:[0-9]+' <artifact.md> | while read -r hit; do
  p=$(echo "$hit" | grep -oE '[A-Za-z0-9_./-]+\.[a-z]{1,5}:[0-9]+' | head -1 | cut -d: -f1)
  [ -e "$p" ] && echo "live line anchor (convert to durable grammar): $hit"
done
```

Convert every hit to the grammar above; leave fictional teaching paths (`src/api/users.ts:87`)
alone — they don't resolve, can't drift, and exist to teach point-in-time output formats.
