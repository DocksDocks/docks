---
name: write-skill
description: "Use when authoring a new skill for the docks plugin skill tree or any kit that follows docks conventions — agentskills.io frontmatter, CSO description starting `Use when…`, ≤500-line body with 80-310 sweet spot, constraint blocks, BAD/GOOD pairs, `references/` extraction past 310 lines, near-miss trigger checks, `metadata.updated` bump, and the kit-CI / bundled `skill-guard.mjs` validation loop. Not for Anthropic's global `skill-creator` workflow (that handles evals/benchmarking)."
user-invocable: true
metadata:
  pattern: meta-skill
  updated: "2026-06-14"
  content_hash: "4c2cd53413c33a2fd15e59477f0438d9b034fa0df2c76883cf2acc99214a5d87"
---

# Write a Skill (docks conventions)

The description is the only thing your agent sees when deciding which skill to load. Get it wrong and the skill never fires. Get it right and the body content barely matters.

This skill encodes docks' specific authoring conventions — the 16-point scorer rubric in the bundled `scripts/skill-guard.mjs` (the single source the kit CI also scores with), the structural guards in `scripts/skills/guard.mjs`, the body sweet spot, the `<constraint>` block reward, the references/ extraction rule. Anthropic's `skill-creator` and Matt Pocock's `write-a-skill` (MIT, framing inspiration) are both generic; this one is docks-shaped.

<constraint>
Description-first. The description is surfaced in the skill listing every session — it loads always, the body loads only on invocation. Spend disproportionate effort here. CSO rules: (1) starts with `Use when …` (2 pts), (2) ≤500 chars (2 pts; > 1000 = 0 pts; the guard hard-caps at 1024), (3) contains concrete trigger keywords ("Use when running pnpm audit, …") rather than abstract capability prose, (4) zero slop words (`comprehensive`, `robust`, `elegant`, `seamless` — each occurrence costs 1 pt, max −2). Verify with `node scripts/skill-guard.mjs score --per-file | grep <name>` — the bundled scorer the kit CI also uses — before considering the description done.
</constraint>

<constraint>
Body sweet spot: 80–310 lines (the bundled `skill-guard.mjs` scorer awards 2 pts here). ≤80 lines is allowed but loses the 2 pts. >310 is also allowed (≤500 hard cap per agentskills.io) but you're past Claude Code's post-compaction re-attachment window (5,000 tokens ≈ 310 lines), so content past that may be silently dropped after auto-compaction. When the body crosses ~280 lines, move detail into `references/<topic>.md` files (30–150 lines each) and leave a one-line pointer in the body. Pattern: see `react-component-patterns/SKILL.md` and its three references.
</constraint>

<constraint>
Bookkeeping is part of the edit, not an afterthought. After any change to a skill's meaning, bump `metadata.updated` to today AND re-sync the stored content hash with the project's documented hash command (in this kit: the content-hash backfill script) — CI's idempotency gate fails on a stale hash, and editing only `updated:` does not change the hash.
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

1. **Draft the description.** Write 3 candidates. Verify ≤500 chars on each (`echo -n "$desc" | wc -m` — characters, not bytes; em-dashes inflate `wc -c` 3×). Pick the one with the most concrete trigger keywords (file types, command names, error messages, named patterns).
2. **Collision-check the triggers.** Write 3 realistic should-trigger prompts and 3 near-miss should-NOT-trigger prompts, then read the descriptions of the 2–3 sibling skills closest in domain: every near-miss must route cleanly to its sibling via a `Not for…` clause. The kit's `tests/skill-trigger-collision.mjs` catches gross keyword overlap mechanically (a pair sharing ≥5 positive-surface trigger tokens with no routing fails CI), but only this manual near-miss pass catches the subtle ones — this step is where collisions die. See "Near-miss negatives" below.
3. **Draft the body** in `SKILL.md`. Target 80–310 lines. Include at least: one `<constraint>`, one BAD/GOOD pair, one table, one fenced code block with a language tag. Pick prescriptiveness per "Degrees of freedom" below.
4. **Score check.** `node <write-skill-dir>/scripts/skill-guard.mjs score --per-file | grep <name>` — the bundled scorer the kit CI also scores with (one rubric, no mirror). Validate one skill: `node …/skill-guard.mjs validate <skill-dir>`. If < 14, find the missing point in the rubric.
5. **Structural check.** Kit: `node scripts/skills/guard.mjs` (frontmatter for both runtimes + `refs-guard.mjs`: broken `references/` links, orphan reference files, the long-reference TOC rule below). Elsewhere: `node skill-guard.mjs validate --strict` covers the portable subset. Failures are non-negotiable — fix them.
6. **Full CI.** `node scripts/ci.mjs` where present. Must be green before commit.
7. **Iterate.** Per the kit's literal-instruction culture, "score it" is a real instruction — don't ship until the score plateaus.

## Fresh-instance QA (the Claude-A / Claude-B test)

The author of a skill (or plan) can't see its own gaps — they fill them from memory the description and body never state. Standing QA: hand the finished artifact to a **fresh instance** with no authoring context (Claude-A authors, Claude-B reviews cold — in this kit, a fresh-context subagent). Claude-B does exactly one thing: act on the artifact using only what it says, and every place it has to guess is a handoff defect Claude-A could not perceive. This caught a 96→89 self-score inflation on the `cold-handoff-contract` plan that the in-context author had rated clean. Run it before shipping any skill, agent, or substantive plan — a fresh-context read finding no material gap is a stronger stop than the author's own re-read.

## BAD / GOOD descriptions

```yaml
# BAD — abstract capability prose, no triggers, slop words
description: A comprehensive, robust solution for working with dependencies in your project.

# GOOD — triggers + concrete keywords + "Not for" exclusion
description: "Use when running pnpm/npm/yarn audit, pip-audit, cargo audit, or govulncheck; responding to a CVE/GHSA advisory; bumping framework majors (next/react/typescript/django/fastapi); handling peer-dep conflicts after an upgrade. Not for general lint suppressions (use lint-no-suppressions)."
```

The good example fires reliably because every italicized phrase pattern-matches an actual moment the user will hit. The bad example matches nothing specific — Claude can't disambiguate it from any other dep-related skill.

## Near-miss negatives (trigger collision)

The only valuable negative test is the near-miss: a prompt that shares keywords with this skill but belongs to a sibling. "Write a fibonacci function" tells you nothing about a PDF skill — it would never trigger anyway. Realistic near-misses are messy: file paths, typos, casual phrasing, no skill named.

| Near-miss prompt | Must route to | Via |
|---|---|---|
| "pnpm audit flags lodash, fix it" | dep-vuln-workflow, not fix-workflow | "Not for fixing the vulnerable code path itself" |
| "add tests for the existing parser" | test-coverage, not tdd-workflow | "Not for test-first development" |
| "review this diff for SQLi" | code-review, not security | "Not for full security audits" |

If a near-miss has no clean route, the new skill's `Not for…` clause (or the sibling's) is missing a case — fix the description, not the prompt. For skills shipped at scale, Anthropic's `skill-creator` plugin automates this empirically (a 20-query train/test description-optimization loop); the manual check above is the cheap version that catches most collisions.

## When to add `references/`

| Trigger | Action |
|---|---|
| Body crosses ~280 lines OR you're about to add another ~50 | Pull the most-detailed section into `references/<topic>.md`. Keep a 1–2 line pointer in the body. |
| Multiple languages share the same principle but need per-language code | One body section explaining the principle, language-specific BAD/GOOD in `references/<lang>-<topic>.md`. Pattern: `solid/references/typescript-solid.md`, `…/rust-solid.md`. |
| A scenario applies but is the exception, not the rule | `references/` keeps it out of the per-session-loaded body. |

Reference file sweet spot: 30–150 lines. Past 150, split again. Any reference file over **100 lines** with 3+ section headings needs a `## Contents` TOC at the top — Claude often partial-reads long references (`head`-style), and the TOC keeps the full scope visible (Anthropic best-practice). `refs-guard.mjs` enforces this; the heading gate auto-exempts embedded output templates whose sections live inside a verbatim code fence.

### `scripts/` and `assets/` — the other two bundles

| Bundle | Ship it when | Cost model |
|---|---|---|
| `scripts/<tool>` | Every invocation would re-derive the same helper — the smell: three test runs each wrote the same `create_docx.py` | Execution is token-free; only stdout enters context |
| `assets/<file>` | Output needs a template or binary copied, never read (HTML shells, fonts, dashboard masters) | Zero until copied |

State intent explicitly: "Run `scripts/x.py`" (execute) vs "Read `scripts/x.py`" (load as reference). Neither directory is covered by `content_hash` (it hashes SKILL.md + references/ only) — bump `metadata.updated` manually when they change. This skill eats its own cooking: `scripts/skill-guard.mjs` here is the bundled portable validator AND the single source of the scorer rubric the kit CI uses.

## Constraint block discipline

The scorer rewards up to 3 `<constraint>` blocks per skill — promote rules that meet the test below into constraints; leave softer guidance as prose.

| Promote to `<constraint>` when | Leave as prose when |
|---|---|
| Violation has shipped a real bug or wasted user time before | "Generally a good idea" |
| The model's training pulls it toward the wrong default | Aligns with default model behaviour anyway |
| It costs the user trust if Claude gets it wrong silently | Cosmetic preference |
| A concrete consequence is statable in the rule itself ("…because X breaks Y") | Vague "this is cleaner" |

A skill with 4 constraint blocks scores the same as 3. Pick the 3 most load-bearing rules; demote the rest.

## Degrees of freedom (how prescriptive to be)

Match prescriptiveness to fragility, not to how much you know about the task. Frontier models follow literal instructions but won't generalize them past their stated scope — over-prescriptive skills degrade output exactly where judgment was the right tool.

| Freedom | When | Form |
|---|---|---|
| High — goal + constraints | Many valid paths; context decides (reviews, refactors) | Prose goal, non-negotiables in `<constraint>`, no step choreography |
| Medium — preferred pattern | One good default exists, variation acceptable | Template or pseudocode with parameters, escape hatch named |
| Low — exact sequence | Fragile, one safe path (migrations, releases) | Exact commands, "do not modify", validation between steps |

Writing ALWAYS/NEVER in caps is the yellow flag: state the consequence instead ("two-phase write, because a halt mid-relocation loses content"). A rule carrying its why survives paraphrase, model upgrades, and the edge cases the caps-lock version never anticipated.

## Common authoring traps

| Trap | Fix |
|---|---|
| Description = "Skill for working with X" | Replace with triggers: "Use when running X, fixing Y, debugging Z" |
| Body restates what Claude already knows ("TypeScript is a typed superset of JavaScript…") | Cut. The body is for project-specific knowledge the agent lacks. |
| BAD/GOOD pair is two snippets of similar code with no annotation | Add the `// BAD — <one-line reason>` and `// GOOD — <one-line reason>` comments; the agent pattern-matches on the comments |
| Every paragraph wrapped in `<constraint>` | Demote to prose — past 3 constraints the scorer gives nothing, and the pattern stops signalling "non-negotiable" |
| `name:` doesn't match directory name | Guard fails. Rename directory to match (kebab-case, `[a-z0-9-]+`, ≤64 chars). |
| Forgot `metadata.updated` bump after editing | Bump to today (`date "+%Y-%m-%d"`) **only if content actually changed**. If this project documents `metadata.content_hash`, run its documented hash-sync command; otherwise do not add a hash or report missing Docks tooling. |
| Body crossed 310 → just left it there | Move detail to `references/`. Past 310 lines, post-compaction re-attachment drops content silently. |
| Used `comprehensive`/`robust`/`elegant`/`seamless` because it "reads better" | Each occurrence costs 1 pt. Rewrite or cut. |
| Mixed terminology — "field"/"box"/"element" for the same thing | Pick one term and use it throughout; the model treats synonyms as potentially distinct concepts. |
| Dated conditionals — "before Aug 2025 use the old API" | Document the current method; park legacy in a collapsed "old patterns" block. |
| Bare MCP tool names (`create_issue`) | Fully qualify as `Server:tool` (`GitHub:create_issue`) — bare names misresolve when several servers are connected. |

## Transforming skills (split / migrate / rewrite existing content)

A skill that MOVES, SPLITS, or REWRITES existing files can drop content with no error. Before authoring one, read [`references/data-preservation.md`](references/data-preservation.md): inventory → per-section approval table → two-phase write → read-back verification. Two non-negotiables, copied **inline** into the skill (never cross-linked): a preservation `<constraint>` near the top (survives the 5,000-token compaction window) and a `## Verification` block doing per-section presence + a net-shrink tripwire — NOT a byte-percentage floor, which is backwards for a split. `scripts/skills/transform-guard.mjs` enforces both on the curated transformer list.

## When this skill does NOT apply

- Authoring an **agent** (not a skill) — different conventions live in `scripts/agents/score.mjs` (model declared, "Not …" exclusion clause, anti-hallucination checks, 60-300 body). The CLAUDE.md "Authoring skills & agents" section is the source of truth for agents.
- Modifying an existing skill — read it first, preserve constraint blocks, bump `metadata.updated`, re-score before commit.

## Source attribution

Framing ("the description is the only thing your agent sees") adapted from Matt Pocock's `write-a-skill` (MIT, <https://github.com/mattpocock/skills/blob/main/skills/productivity/write-a-skill/SKILL.md>). Degrees-of-freedom and the near-miss negative idea adapted from Anthropic's skill authoring best practices (<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>) and its `skill-creator` plugin. Body / rubric / loop are docks-specific — `skill-creator` covers evals and benchmarking; this one covers the kit conventions neither generic skill knows.
