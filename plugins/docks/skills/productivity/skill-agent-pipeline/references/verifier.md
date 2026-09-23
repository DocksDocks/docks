# Phase 6 — Verification

Validate the Phase 3 Skills Plan and the Phase 5 Agents Plan before the user sees the plan. Verify only the phases that ran — skills always; agents only if present.

<constraint>
Per-finding reproduction is mandatory. Before any finding lands in `## Issues to Fix`: re-check the claim against the actual artifact — list the path to confirm a "missing path" claim; read the cited `file:line` to confirm an accuracy claim; re-count identifiers for a CSO-vague flag; re-read frontmatter for a rule violation. DROP anything that fails reproduction; log it under `## Dropped (failed reproduction)` with a reason.
</constraint>

## Skill checks (every Phase 3 skill)

| Check | Rule |
|---|---|
| Frontmatter | valid YAML; `name` (lowercase+hyphens), quoted `description`, `user-invocable`, `metadata.pattern`, `source_files`, `updated` |
| CSO | starts `Use when…`; ends with a `Not for …` clause; ≥5 project-specific identifiers; ≤1024 chars; no angle brackets; no unquoted `: ` or `#` hazards |
| Existing-skill cap | any ON-DISK skill whose parsed `description` >1024 chars that Phase 2a did NOT flag `rewrite-description` → **hard fail** (Codex silently skips an over-cap skill, so it never loads) |
| Size | body ≤500 (hard cap). **Hard fail** 310–500 lines with NO references/ — split required |
| Content accuracy | apply `references/content-auditor.md` to every drafted/refreshed skill — verify EVERY ref, code snippet, and asserted identifier against current source, **not a sample**. State claims-checked; pass only at zero unreproduced drift |
| Durable anchors | `grep -nE '[A-Za-z0-9_./-]+\.[a-z]{1,5}:[0-9]+'` over each drafted body + references/ — any hit whose path EXISTS in the project is a `line-anchor` finding: convert to the durable grammar (`path` — `symbol` — purpose — `verify:` command). Fictional example paths (no such file) pass. **Hard fail** a plan that ships live line anchors |
| Durable facts | apply `references/skills-builder.md` § Durable anchors to each drafted body + references/: `grep -nEi '\b(currently\|as of today\|now has\|recently)\b'` hits outside a BAD example; a version, count, size, or port with no `verify:` command; a hand-maintained list of routes/tables/skills/nodes; a fact copied from an `AGENTS.md` node or config file instead of pointed at; a backticked path that does not resolve → `volatile-fact` finding. `grep -qF 'Pointers here name concepts, not coordinates'` must hit once per drafted `SKILL.md`. **Hard fail** a plan that ships any of these |
| Maintenance skill | use plugin `docks:skill-maintenance` when available; local copy only for project-specific rules; `pattern: reviewer`, `user-invocable: false`; **hard fail** if body references kit-internal validators that do not ship downstream |
| Prompt style | apply `references/content-auditor.md` § Prompt-style sub-check to each drafted/refreshed body + references/, keep list included. Each kept finding goes to `Issues to Fix` as should-fix with its proposed rewrite. It is not a hard fail, because a removal stays a hypothesis until a baseline check confirms it |
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

## Behavioral grading (drafted or refreshed skills)

Apply these rules whenever the pipeline checks a drafted or refreshed skill behaviorally, for example a baseline check (see `write-skill`) that runs realistic prompts with and without the skill. Each run is a fresh agent, subagent, or session, so it works on every runtime; on Claude Code, the `skill-creator` skill is an optional tool for full benchmarks. The static checks above prove the text is well formed; only a behavioral run shows that the skill changes what the agent does. Grade each expectation of each run, ideally in a separate agent that did not produce the run:

1. **Quoted evidence for every verdict.** A pass needs a quote from the transcript or the output files that shows the expectation is true. Read the output files themselves, not the run's own summary of them. With no quote, or when you are unsure, the expectation fails: the expectation must prove itself.
2. **No partial credit.** Each expectation is pass or fail. "Mostly done" is a fail with the missing part named in the evidence.
3. **Surface compliance fails.** The right file name with empty or wrong content, a required heading with a wrong body, or a command that is printed but never run is a fail. The pass must reflect the real task outcome, not a match by coincidence.
4. **Flag non-discriminating assertions.** An assertion that a clearly wrong output also passes gives false confidence, which is worse than no assertion. Also flag an important outcome (good or bad) that no assertion covers, and an assertion that the available output cannot show. Raise only clear gaps, not style preferences.

Output, under `## Phase 6: Verification` → `Behavioral Grading`:

| Skill | Prompt | Expectation | with skill | without skill (or old version) | Evidence (quoted) |
|---|---|---|---|---|---|

Then an `Assertion critique` list. A drafted skill that does not beat its baseline on the expectations it exists for goes to `Issues to Fix` as should-fix. Write "not run" with the reason when no behavioral check ran; never leave the heading out.

## Output (write under `## Phase 6: Verification`)

`Skills Report` · `Agents Report` · `Cross-Layer Integrity` · `Replaced-Skill Sentinel` · `Behavioral Grading` · `Issues to Fix` (hard fail → should-fix → minor) · `Dropped (failed reproduction)`.

## Gotcha

| Gotcha | Fix |
|---|---|
| Flagging a path "missing" from a stale earlier scan | Re-list it now — paths drift between scan and verify |
| Skipping Codex `.toml` validation as "agents are Claude-only" | Both formats now ship — validate the `.toml` schema (required keys, model/sandbox values, name parity) too |
| Letting an overlong or invalid YAML description through because the body is good | Fix frontmatter first — Codex skips invalid skills before reading the body |
| Passing a freshly-drafted skill on a 5-ref spot-check | Newly authored skills hallucinate APIs too — run `content-auditor.md` over every drafted/refreshed skill, all claims not a sample |
| Passing a baseline-check expectation because the output file exists | Open the file and quote the content that proves the expectation; existence alone is surface compliance |

## Sources

The behavioral grading rules adapt the grader agent from the Anthropic `skill-creator` skill (Apache-2.0), paraphrased for the docks plan record: https://github.com/anthropics/skills/blob/main/skills/skill-creator/agents/grader.md
