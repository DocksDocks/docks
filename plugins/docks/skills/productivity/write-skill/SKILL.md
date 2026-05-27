---
name: write-skill
description: "Use when authoring a new skill for the docks plugin skill tree or any kit that follows docks conventions — agentskills.io frontmatter, CSO description starting `Use when…`, ≤500-line body with 80-310 sweet spot, constraint blocks, BAD/GOOD pairs, `references/` extraction past 310 lines, `metadata.updated` bump, and the `bash scripts/ci.sh` validation loop. Not for Anthropic's global `skill-creator` workflow (that handles evals/benchmarking)."
user-invocable: true
metadata:
  pattern: meta-skill
  updated: "2026-05-26"
  content_hash: "5f3540a1d585db78d0699c7764d11a472070e699d2eb7bd95f6896ec2fd87b5d"
---

# Write a Skill (docks conventions)

The description is the only thing your agent sees when deciding which skill to load. Get it wrong and the skill never fires. Get it right and the body content barely matters.

This skill encodes docks' specific authoring conventions — the 16-point scorer rubric in `scripts/skills/score.sh`, the structural guards in `scripts/skills/guard.sh`, the body sweet spot, the `<constraint>` block reward, the references/ extraction rule. Anthropic's `skill-creator` and Matt Pocock's `write-a-skill` (MIT, framing inspiration) are both generic; this one is docks-shaped.

<constraint>
Description-first. The description is surfaced in the skill listing every session — it loads always, the body loads only on invocation. Spend disproportionate effort here. CSO rules: (1) starts with `Use when …` (2 pts), (2) ≤500 chars (2 pts; > 1000 = 0 pts; the guard hard-caps at 1024), (3) contains concrete trigger keywords ("Use when running pnpm audit, …") rather than abstract capability prose, (4) zero slop words (`comprehensive`, `robust`, `elegant`, `seamless` — each occurrence costs 1 pt, max −2). Verify with `bash scripts/skills/score.sh --per-file | grep <name>` before considering the description done.
</constraint>

<constraint>
Body sweet spot: 80–310 lines (`scripts/skills/score.sh` awards 2 pts here). ≤80 lines is allowed but loses the 2 pts. >310 is also allowed (≤500 hard cap per agentskills.io) but you're past Claude Code's post-compaction re-attachment window (5,000 tokens ≈ 310 lines), so content past that may be silently dropped after auto-compaction. When the body crosses ~280 lines, move detail into `references/<topic>.md` files (30–150 lines each) and leave a one-line pointer in the body. Pattern: see `react-component-patterns/SKILL.md` and its three references.
</constraint>

## The minimum viable docks skill

```yaml
---
name: <kebab-case-name>           # must match directory name
description: "Use when <specific trigger words and contexts>. <Concrete pattern keywords>. <When NOT to use — narrows the match surface>."
user-invocable: false             # true only for slash-command-style skills (e.g., zoom-out)
metadata:
  pattern: tool-wrapper           # or: micro-skill, meta-skill
  updated: "YYYY-MM-DD"           # bump ONLY on a real content change
  # content_hash: auto-managed by scripts/skills/content-hash.sh --backfill
---

# Skill Name

<short paragraph framing the problem this skill addresses>

<constraint>
<non-negotiable rule the agent must follow when this skill is active>
</constraint>

## Quick BAD/GOOD or Decision Tree
<concrete pattern matching the agent can do without reading paragraphs>

## When to Use / NOT to Use
<crisp triggers + exclusions>

## References
<links to references/ files, companion skills, official docs>
```

## Score rubric (out of 16) — internalize before authoring

| # | Bucket | Pts | What earns it |
|---|---|---|---|
| 1 | CSO description starts `Use when` | 2 | Anthropic doc convention; literal prefix match |
| 2 | Description tightness | 2 | ≤500 chars = 2; ≤1000 = 1; >1000 = 0 |
| 3 | Freshness | 1 | `metadata.updated` within last 180 days |
| 4 | `<constraint>` blocks | up to 3 | 1 pt each, max 3 — promote non-negotiable rules to constraint blocks |
| 5 | BAD/GOOD examples | 2 | both `BAD` and `GOOD` (or "Wrong fix" / "Right fix") idioms present |
| 6 | Slop word check | up to 2 | `comprehensive`/`robust`/`elegant`/`seamless` each cost 1, max −2 |
| 7 | Markdown table for rules | 1 | at least one `\| … \|` table |
| 8 | Code fence with language tag | 1 | ` ```ts `, ` ```bash `, etc. — not bare ` ``` ` |
| 9 | Body 80–310 lines | 2 | sweet spot; either side loses the 2 pts |

**Per-file floor (per category):** engineering 10, productivity 8, internal 8 (`scripts/config/scoring.json`). CI fails any skill below its category floor. Aim for 14+ on new skills — leaves headroom when CSO rules tighten.

## The authoring loop

1. **Draft the description.** Write 3 candidates. Verify ≤500 chars on each (`echo -n "$desc" | wc -c`). Pick the one with the most concrete trigger keywords (file types, command names, error messages, named patterns).
2. **Draft the body** in `SKILL.md`. Target 80–310 lines. Include at least: one `<constraint>`, one BAD/GOOD pair, one table, one fenced code block with a language tag.
3. **Score check.** `bash scripts/skills/score.sh --per-file | grep <name>`. If < 14, look at the rubric and find the missing point.
4. **Structural check.** `bash scripts/skills/guard.sh`. Failures are non-negotiable — fix them.
5. **Full CI.** `bash scripts/ci.sh`. Must be green before commit.
6. **Iterate.** Per the kit's literal-instruction culture, "score it" is a real instruction — don't ship until the score plateaus.

## BAD / GOOD descriptions

```yaml
# BAD — abstract capability prose, no triggers, slop words
description: A comprehensive, robust solution for working with dependencies in your project.

# GOOD — triggers + concrete keywords + "Not for" exclusion
description: "Use when running pnpm/npm/yarn audit, pip-audit, cargo audit, or govulncheck; responding to a CVE/GHSA advisory; bumping framework majors (next/react/typescript/django/fastapi); handling peer-dep conflicts after an upgrade. Not for general lint suppressions (use lint-no-suppressions)."
```

The good example fires reliably because every italicized phrase pattern-matches an actual moment the user will hit. The bad example matches nothing specific — Claude can't disambiguate it from any other dep-related skill.

## When to add `references/`

| Trigger | Action |
|---|---|
| Body crosses ~280 lines OR you're about to add another ~50 | Pull the most-detailed section into `references/<topic>.md`. Keep a 1–2 line pointer in the body. |
| Multiple languages share the same principle but need per-language code | One body section explaining the principle, language-specific BAD/GOOD in `references/<lang>-<topic>.md`. Pattern: `solid/references/typescript-solid.md`, `…/rust-solid.md`. |
| A scenario applies but is the exception, not the rule | `references/` keeps it out of the per-session-loaded body. |

Reference file sweet spot: 30–150 lines. Past 150, split again.

## Constraint block discipline

The scorer rewards up to 3 `<constraint>` blocks per skill — promote rules that meet the test below into constraints; leave softer guidance as prose.

| Promote to `<constraint>` when | Leave as prose when |
|---|---|
| Violation has shipped a real bug or wasted user time before | "Generally a good idea" |
| The model's training pulls it toward the wrong default | Aligns with default model behaviour anyway |
| It costs the user trust if Claude gets it wrong silently | Cosmetic preference |
| A concrete consequence is statable in the rule itself ("…because X breaks Y") | Vague "this is cleaner" |

A skill with 4 constraint blocks scores the same as 3. Pick the 3 most load-bearing rules; demote the rest.

## Common authoring traps

| Trap | Fix |
|---|---|
| Description = "Skill for working with X" | Replace with triggers: "Use when running X, fixing Y, debugging Z" |
| Body restates what Claude already knows ("TypeScript is a typed superset of JavaScript…") | Cut. The body is for project-specific knowledge the agent lacks. |
| BAD/GOOD pair is two snippets of similar code with no annotation | Add the `// BAD — <one-line reason>` and `// GOOD — <one-line reason>` comments; the agent pattern-matches on the comments |
| Every paragraph wrapped in `<constraint>` | Demote to prose — past 3 constraints the scorer gives nothing, and the pattern stops signalling "non-negotiable" |
| `name:` doesn't match directory name | Guard fails. Rename directory to match (kebab-case, `[a-z0-9-]+`, ≤64 chars). |
| Forgot `metadata.updated` bump after editing | Bump to today (`date "+%Y-%m-%d"`) **only if content actually changed**, then re-sync the hash: `bash scripts/skills/content-hash.sh --backfill`. CI's idempotency check fails if a stored `content_hash` drifts from the body. |
| Body crossed 310 → just left it there | Move detail to `references/`. Past 310 lines, post-compaction re-attachment drops content silently. |
| Used `comprehensive`/`robust`/`elegant`/`seamless` because it "reads better" | Each occurrence costs 1 pt. Rewrite or cut. |

## When this skill does NOT apply

- Authoring an **agent** (not a skill) — different conventions live in `scripts/agents/score.sh` (model declared, "Not …" exclusion clause, anti-hallucination checks, 60-300 body). The CLAUDE.md "Authoring skills & agents" section is the source of truth for agents.
- Modifying an existing skill — read it first, preserve constraint blocks, bump `metadata.updated`, re-score before commit.

## Source attribution

Framing ("the description is the only thing your agent sees") adapted from Matt Pocock's `write-a-skill` (MIT, <https://github.com/mattpocock/skills/blob/main/skills/productivity/write-a-skill/SKILL.md>). Body / rubric / loop are docks-specific — Anthropic's `skill-creator` covers evals and benchmarking; this one covers the kit conventions neither generic skill knows.
