# Phase 6 — Verification

Validate the Phase 3 Skills Plan and (on Claude) the Phase 5 Agents Plan before the user sees the plan. Verify only the phases that ran — skills always; agents only if present.

<constraint>
Per-finding reproduction is mandatory. Before any finding lands in `## Issues to Fix`: re-check the claim against the actual artifact — list the path to confirm a "missing path" claim; read the cited `file:line` to confirm an accuracy claim; re-count identifiers for a CSO-vague flag; re-read frontmatter for a rule violation. DROP anything that fails reproduction; log it under `## Dropped (failed reproduction)` with a reason.
</constraint>

## Skill checks (every Phase 3 skill)

| Check | Rule |
|---|---|
| Frontmatter | valid YAML; `name` (lowercase+hyphens), quoted `description`, `user-invocable`, `metadata.pattern`, `source_files`, `updated` |
| CSO | starts `Use when…`; ≥5 project-specific identifiers; ≤1024 chars; no angle brackets; no unquoted `: ` or `#` hazards |
| Existing-skill cap | any ON-DISK skill whose parsed `description` >1024 chars that Phase 2a did NOT flag `rewrite-description` → **hard fail** (Codex silently skips an over-cap skill, so it never loads) |
| Size | body ≤500 (hard cap). **Hard fail** 310–500 lines with NO references/ — split required |
| Reference accuracy | spot-check ≥5 `file:line` refs by reading |
| Maintenance skill | use plugin `docks:skill-maintenance` when available; local copy only for project-specific rules; `pattern: reviewer`, `user-invocable: false`; **hard fail** if body references kit-internal validators that do not ship downstream |
| No prose-config edits | Phase 3 must contain no AGENTS.md / CLAUDE.md edits |

## Agent checks (every Phase 5 agent — BOTH formats)

**Claude `.claude/agents/*.md`:** `name` kebab-case ≤64, no "anthropic"/"claude" · description <1024, 3rd person, specific · system prompt <200 lines · tools minimal · no scope overlaps.

**Codex `.codex/agents/*.toml`:** parses as TOML; all three required keys present (`name`, `description`, `developer_instructions`); `model` ∈ the known Codex IDs or omitted; `sandbox_mode` ∈ {`read-only`, `workspace-write`, `danger-full-access`} or omitted; `name` matches its Claude twin. An `Agent`-dispatching agent STILL ships a `.toml` (single-level dispatch ports under Codex `agents.max_depth: 1`) — verify it routes delegation to a `worker`/`explorer` child and notes the depth cap; **hard fail** only a `.toml` that assumes deeper-than-default nesting works.

## Cross-layer integrity (critical)

Every `.claude/skills/…` path referenced by a Phase 5 agent MUST exist in the Phase 3 Skills Plan. Split→two skills or merged→sibling: flag for path update. Path neither on disk nor proposed: **hard fail**, regenerate Phase 5.

## Replaced-skill sentinel

For each split/merge in Phase 3, the gate presentation MUST include `git rm -r .claude/skills/<old-name>/` for cleanup. Flag if missing.

## SKILL.md split preservation (per-section, not byte-%)

For every Phase 3 split of a `SKILL.md` into `references/`, verify no content was lost — splitting adds pointers, so output ≥ input; a byte-% floor is the wrong check. Per-section presence + a line-parity tripwire:

```bash
# original snapshot taken before the split (e.g. /tmp/skill.before)
while IFS= read -r h; do
  grep -rqF "$h" <skill>/SKILL.md <skill>/references/ || echo "LOST SECTION: $h"
done < <(grep -E '^#{1,3} ' /tmp/skill.before)
before=$(wc -l < /tmp/skill.before); after=$(cat <skill>/SKILL.md <skill>/references/*.md | wc -l)
awk -v b="$before" -v a="$after" 'BEGIN{ if (a < b) print "NET SHRINK after split" }'
```

Any `LOST SECTION` (relocated prose must be verbatim) / `NET SHRINK` ⇒ **hard fail**, restore the original.

## Output (write under `## Phase 6: Verification`)

`Skills Report` · `Agents Report` · `Cross-Layer Integrity` · `Replaced-Skill Sentinel` · `Issues to Fix` (hard fail → should-fix → minor) · `Dropped (failed reproduction)`.

## Gotcha

| Gotcha | Fix |
|---|---|
| Flagging a path "missing" from a stale earlier scan | Re-list it now — paths drift between scan and verify |
| Skipping Codex `.toml` validation as "agents are Claude-only" | Both formats now ship — validate the `.toml` schema (required keys, model/sandbox values, name parity) too |
| Letting an overlong or invalid YAML description through because the body is good | Fix frontmatter first — Codex skips invalid skills before reading the body |
