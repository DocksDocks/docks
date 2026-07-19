# Data preservation for transforming skills

Read this when authoring or editing a skill that **moves, splits, migrates, or rewrites existing content** (root → nodes, `CLAUDE.md` → `AGENTS.md`, `SKILL.md` → `references/`, code refactors). These skills can drop content with no error. The discipline below is the kit standard.

This file is **author-facing** — you read it while writing a skill, inside the docks repo. The runtime check (the bash in Template C) is **copied into each skill's own body or `references/`**, never linked from here at runtime. Duplication across skills is acceptable; a cross-skill link is a dangling pointer (agentskills.io: "keep file references one level deep").

## Why a byte-percentage floor is the WRONG primary check

A split/migration *adds* scaffolding (new headings, `@AGENTS.md` imports, sibling files, breadcrumbs), so total output is normally **≥100%** of input. A "fail if output < 95% of input" floor therefore (a) is too lenient — a whole lost section hides under added scaffolding — and (b) is backwards for the common case. **Per-section presence is the real invariant**; byte-delta is only a crude net-shrink tripwire.

## The 10-point checklist

1. **Inventory first.** Before any write, snapshot every source file you'll read or modify: path, byte count, and the list of `^#{1,3}` section headings.
2. **Account for every section.** Each source section must end up in some destination, or be **explicitly marked DROP** by the user at the gate. No silent omission.
3. **Route MIXED content paragraph-by-paragraph.** When a section is part-keep/part-move, split on blank lines and route each paragraph; default the unclassified remainder to **STAY** in the source.
4. **Show the plan, not just the targets.** The approval gate renders a `Section | Destination | Reason` table — never just a folder/file list. The user cannot catch a lost section they never see.
5. **Turn-ending approval gate.** There is no runtime "pause" primitive for skills. The only enforceable pause is *ending the turn* (Template B).
6. **Two-phase write for relocations.** Write the new destinations first and verify they parse; prune the source **only after** a second confirmation. A halt mid-way then leaves *duplicated* (recoverable) content, never *lost* content.
7. **Copy verbatim when relocating.** Reformatting (heading level, list markers) is fine; **rewording is not**. Relocation must be content-preserving, not a paraphrase.
8. **Back up before destructive writes.** `git stash push -u -m "<skill>-pre-<op>-<ISO>"` is a one-command recovery anchor when in a repo.
9. **Verify by reading back.** After writing, re-read destinations and confirm every source section heading still appears downstream (Template C). Fail loud on a miss — do not claim success.
10. **Report real numbers.** The final report cites filesystem facts (`sections_preserved/total`, `bytes_in`, `bytes_out`), not narration.

## Template A — preservation constraint (top of body)

Place near the top so it survives the 5,000-token post-compaction re-attachment window. Write it as a literal checklist (Opus 4.7/4.8 follow instructions literally). Readable as plain markdown so Codex (no XML weighting) still parses it.

```markdown
<constraint>
**No content loss across the transform.** Before any Write/Edit/git-mv:
1. Inventory every source section (`^#{1,3}` headings) + byte count.
2. Show a `Section | Destination | Reason` table; unclassified → KEEP in source.
3. Relocate verbatim (reformat OK, reword NOT). Two-phase: write destinations,
   verify, prune source last.
4. After writing, confirm every source section appears downstream AND total
   output is not a net shrink. On any miss: stop, locate it, do NOT report success.
</constraint>
```

## Template B — turn-ending approval gate

```markdown
<constraint>
**Approval gate — turn-ending, not a soft pause.** At the "propose" step:
print the Section→Destination table as your FINAL message and END THE TURN.
Do NOT call Write/Edit/git-mv/Bash-write until the user replies. Silence is not
consent; ambiguous replies → re-show the table. The next turn re-enters here.
</constraint>
```

## Template C — inline verification block (copy into the skill, plain bash)

Pure POSIX + `grep`/`wc` (portable Linux + macOS). No Claude-only tools — Codex reads it as advisory text.

```bash
## Verification (run before reporting success — fail loud)

# 1. Per-section presence: every source heading must appear in some destination.
while IFS= read -r h; do
  grep -rqF "$h" <destination-files> || echo "LOST SECTION: $h"
done < <(grep -E '^#{1,3} ' "$SOURCE_BEFORE")

# 2. Net-shrink tripwire (a split ADDS scaffolding → expect output >= input bytes).
before=$(wc -c < "$SOURCE_BEFORE")
after=$(cat <every-file-written> | wc -c)
awk -v b="$before" -v a="$after" 'BEGIN{ if (a < b) print "NET SHRINK — investigate" }'

# Any non-empty line above ⇒ stop, locate the content, do NOT claim success.
```

## What a CI lint can and cannot check

`scripts/skills/transform-guard.mjs` validates **this repo's committed skill files** — it flags a docks SKILL.md that describes a transform but omits a preservation constraint + `## Verification` block. It is a *structure* lint. It canNOT check consumer runtime data loss: `scripts/` is author-side-only and never ships, and the skill runs in the consumer's repo where these scripts don't exist. That is exactly why the runtime check lives **inline in the skill body**, not in a shipped script.
