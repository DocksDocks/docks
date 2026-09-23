# Authoring skills (plugins/docks/skills/)

Skills are the cross-tool payload — every skill here surfaces in Claude Code, Codex, and any agentskills.io runtime. Each skill is a directory `<category>/<name>/SKILL.md` (+ optional `references/`) (categories: verify `ls -d plugins/docks/skills/*/`). The description is surfaced in the session listing (loaded every session); the body loads only on activation — spend the effort on the description.

Pointers here name concepts, not coordinates — if a path or symbol moved, trust the stated purpose and re-locate it (grep the symbol) before acting.

<constraint>
During skill iteration, run the narrow validators and checks relevant to the change. After a meaningful batch, you may run the owning plugin gate (`node scripts/ci.mjs --plugin docks` here); do not rerun unrelated plugins during the edit loop. Reserve full `node scripts/ci.mjs` for the final relevant implementation tree before commit, push, or release. Don't loosen validator floors to make a file pass; fix the file. The validator/CI contract lives in `scripts/AGENTS.md`.
</constraint>

<constraint>
After changing a skill's meaning, run `node scripts/skills/content-hash.mjs --backfill`. It re-syncs `content_hash` and stamps `metadata.updated` in the same write, and it writes only when the hash actually differs — so a formatting-only or otherwise meaning-preserving edit leaves both fields alone and the recorded date keeps describing the last real change. That is the point: readers use `metadata.updated` to judge staleness, so the date must never be bumped by a formatting pass. CI's idempotency check fails if the stored `content_hash` drifts from the body + references. Editing only `updated:` does not change the hash.
</constraint>

<constraint>
Shipped skill bodies (SKILL.md + `references/`) are consumer-facing — never name docks plugin-author scripts (`scripts/ci.mjs`, `scripts/skills/*`, `scripts/tree/*`, `scripts/agents/*`, `scripts/release.mjs`, `scripts/config/*`, `scripts/lib/*`) as a step. They are author-side only (`scripts/AGENTS.md`) and absent from a consumer's project, so the instruction breaks the moment the skill runs anywhere but this repo. Make verification SELF-CONTAINED (an inline check) or refer GENERICALLY to "the project's CI / validators, if present". `scripts/skills/no-author-scripts.mjs` enforces this; only the tooling-authoring skills that seed/describe that tooling (`scaffold`, `write-skill`) are allowlisted. This applies to plugin-shipped agent bodies too.
</constraint>

## Durable docs and agent-first (kit rules)

**Durable docs.** Skill bodies, `references/`, and every AGENTS.md node are durable docs. The one home of the rules (durable vs point-in-time, one fact one home, durable facts only) is `plugins/docks/skills/productivity/write-skill/references/durable-anchors.md`. A skill that emits docs restates the rules it needs inline (references stay one level deep).

**Agent-first.** Every skill that writes or changes files in a user repo must leave that repo easier for an agent to use:

1. Findable: a root AGENTS.md routes to every nested node and every canonical location (skills in `.agents/skills/`, symlinked from `.claude/skills/`); names say what a thing does.
2. Fast to understand: the root states commands (build/test/lint) and repo-wide rules only; per-folder rules live in the folder AGENTS.md; no duplicated facts.
3. Trustworthy: durable facts only; every volatile value has a verify command; behavior claims carry a probe.
4. Verifiable: the skill ends with a check an agent can run (commands, not prose).
5. No CLAUDE.md files (they suppress native AGENTS.md loading).

One-shot whole-repo setup and audit go through the `agent-first-setup` skill.

## Description (the thing that gets matched)

1. **Lead with "Use when …"** — the guard enforces this prefix (verify: temporarily reword one description to drop the prefix → `node scripts/skills/guard.mjs` must fail on it; revert).
2. **Key use case first** — Claude Code truncates the combined description in the listing (limit: Skills docs in `## Sources`); the first ~100 chars matter most.
3. **≤500 chars** for full scorer credit; the hard cap is 1,024 (agentskills.io spec). Point values: `plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs` (verify: `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file | grep <name>`).
4. **Say what the skill does as well as when.** After the "Use when" trigger, name the job the skill does (for example "produces a tiered fix plan"). The agent picks a skill from the description alone, so a description with triggers but no job cannot be told apart from a neighbor. Move long "Covers X, Y, Z" enumerations into the body, but keep one clause that states the job. Source: the agentskills.io spec `description` field (`## Sources`).
5. **Name categories of user intent; concrete nouns are fine.** "Use when running bun audit, pnpm audit, pip-audit…" beats "Use when working with dependency security", because commands and file types are what users type. But group them under the user intent they serve, and do not add one keyword per missed query: an ever-growing list overfits to the queries you saw, uses up the shared listing budget, and still misses the next phrasing. When a skill under-triggers, fix the intent category and confirm with the `write-skill` trigger check, not by adding tokens. Source: upstream anthropics/skills skill-creator `improve_description.py` (`## Sources`).
6. **No slop words** (`comprehensive`, `robust`, `elegant`, `seamless`) — each costs scorer points (`skill-guard.mjs`).
7. **Collision-check against siblings** — 3 near-miss prompts (share keywords, belong to a neighboring skill) must each route away via a `Not for…` clause. `tests/skill-trigger-collision.mjs` fails an unrouted pair whose shared positive-surface trigger tokens reach its `OVERLAP_FAIL` threshold, but the subtle collisions still need the manual near-miss pass; `write-skill`'s near-miss table is the procedure.

## Frontmatter

Structural rules are enforced by `scripts/skills/guard.mjs`.

| Field | Rule |
|---|---|
| `name` | **required** (kit CI errors on missing/empty); ≤64 chars, `[a-z0-9-]+`, must match parent dir (agentskills.io spec) |
| `description` | **required** (kit CI errors on missing/empty); ≤1,024 hard cap; ≤500 for full credit; starts "Use when" |
| `user-invocable` | `true` for slash-command-style skills, else `false` |
| `metadata.updated` | `YYYY-MM-DD`; bump only on a real content change |
| `metadata.content_hash` | auto-managed by `scripts/skills/content-hash.mjs --backfill` |
| `allowed-tools` | pre-approves tools while the skill is active |
| `license` | optional; a license name or the name of a bundled license file (agentskills.io spec). Set it on a skill that carries its own license terms, so a consumer who copies the folder knows the terms |
| `compatibility` | optional; ≤500 chars (agentskills.io spec); states environment requirements (intended product, system packages, network access). Add it only when the skill cannot run without them, so a runtime or user can tell before activation. Check the length by hand unless the guard enforces it (verify: `grep -n compatibility plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs`) |
| third-party | add an `upstream:` block (`source`/`license`/`vendored_at`) to relax kit checks for vendored skills |

## Body (loads on activation — every line is a recurring cost)

Conciseness test: "would removing this line cause Claude to make mistakes? If not, cut it." Don't restate what Claude already knows.

**No surprises.** A skill must do only what its name and description say. Do not put in actions a user would be surprised by if the skill's intent were described to them: no hidden network calls or data exfiltration, no unrelated file or git changes, no malware. Docks skills run in other people's repositories with the agent's permissions, and the user approves a skill by its description, not by reading the body. Source: the Principle of Lack of Surprise in skill-creator `SKILL.md` (`## Sources`).

| Pattern | When |
|---|---|
| `<constraint>` block | non-negotiable rule; the scorer rewards a capped number (`skill-guard.mjs`) |
| Lookup table | high-density mapping (smell→fix, before→after) |
| BAD/GOOD code blocks | fragile decisions; scorer rewards both idioms |
| Gotchas | concrete corrections to repeat mistakes |
| Validation loop | do → run validator → fix → repeat |
| `references/<topic>.md` | when body crosses ~310 lines, split detail out (30–150 lines each); a long reference with several headings needs a `## Contents` TOC (thresholds: `scripts/skills/refs-guard.mjs`, Anthropic best-practice) |
| `scripts/` / `assets/` bundle | executable helpers every invocation would re-derive (execution is token-free) / copy-only output templates; neither is content-hashed — bump `metadata.updated` manually when they change |
| Durable anchors | reference code as `` `path` — `symbol` — purpose (verify: `command`) ``, never a live `path:NN` line anchor. CI's repo-wide durable-anchors guard fails on any `path:NN` whose path resolves (verify: append a `<real-repo-path>:1` anchor to a body → `node scripts/skills/durable-anchors.mjs` exits 1 naming it; revert). Rules for volatile facts and behavior claims: `plugins/docks/skills/productivity/write-skill/references/durable-anchors.md` |

Body sweet spot **80–310 lines** (scorer; ≤500 hard cap). Past ~310, post-compaction re-attachment may silently drop content (Cross-tool wording, item 1).

## Data preservation for transforming skills

A skill that **moves, splits, migrates, or rewrites existing content** (root → nodes, `CLAUDE.md` → `AGENTS.md`, `SKILL.md` → `references/`, code refactors) can drop content with no error. The kit standard (checklist + copy-paste templates) lives in `plugins/docks/skills/productivity/write-skill/references/data-preservation.md`. Two non-negotiables, both **copied inline** into the skill (never cross-linked — a sibling-skill reference is a dangling pointer; agentskills.io says keep references one level deep):

1. A preservation `<constraint>` near the top of the body (survives the post-compaction window).
2. A `## Verification` block doing **per-section presence** + a net-shrink tripwire — NOT a byte-percentage floor, which is backwards for a split (scaffolding makes output ≥100% of input, so a lost section hides under it).

`scripts/skills/transform-guard.mjs` enforces both across the curated transformer list (`scripts/AGENTS.md`).

## Plan-skill routing (lifecycle lives in plan-lifecycle)

Use direct implementation for one clear, reversible, low-risk local diff with
one bounded acceptance path; it creates no plan issue, reviewer, or automatic
commit. Canonical planning is for explicit planning, multi-commit or
cross-repository work, cold handoff, unresolved decisions,
cross-subsystem/public-contract changes, security-sensitive/destructive work, or
external effects.

The `plan-*` skills, their shipped `plan.mjs`, the v2 issue-body contract,
and the read-only reviewer wrappers live in the `plan-lifecycle` plugin
(`plugins/plan-lifecycle/skills/AGENTS.md` owns their authoring and contract
sync). Some skills under this tree are lifecycle ROUTES: each carries one
byte-identical absent-lifecycle prerequisite paragraph, asserted verbatim by the
plan-lifecycle self-test only. The route list lives in
`plugins/plan-lifecycle/skills/AGENTS.md`. Change that paragraph only in
lockstep across all routes and that self-test.

## Cross-tool wording (Claude Code + Codex)

Skills run in both runtimes; phrase for both. Sources: the Claude Code skills docs (`## Sources`) and the openai/codex source.

1. **Constraints at the top.** After compaction Claude Code re-attaches only the first ~5,000 tokens of each invoked skill (25,000-token shared budget, oldest-invoked dropped first). Put non-negotiable/safety rules in `<constraint>` blocks near the top — a rule at the bottom is dropped first.
2. **Turn-ending approval gates.** No runtime "pause" primitive exists for skills (`disable-model-invocation` only gates auto-invoke). The only enforceable pause is ending the turn: "print the proposal as your final message and STOP; don't call Write/Edit until the user replies." "STOP and await" alone gets bypassed (frontier models follow instructions literally).
3. **Front-load the description.** When the Codex skills *catalog* overflows its budget (2% of the context window in tokens; the ~8,000-char figure is only the fallback when the window is unknown), descriptions are truncated EVENLY first — every description loses its tail — but Codex may still omit skills from the initial list with a warning. The per-skill `description` cap is still 1,024. Primary trigger in the first ~100 chars (Claude truncates its listing too).
4. **Codex reads bodies as plain markdown** — it does not weight `<constraint>` XML. A safety rule must read correctly as plain prose, not lean on the tag for emphasis.
5. **`isolation: worktree` is Claude-only.** Don't rely on it (or plugin-subagent `hooks`/`mcpServers`/`permissionMode`) for cross-tool safety.
6. **Goals over step-lists for frontier models.** Frontier-model prompting guides warn that skills written for prior models are often too prescriptive and can degrade output; literal-following models won't generalize an instruction beyond its stated scope. Write the goal + the non-negotiable constraints, state scope explicitly, and skip micro-step choreography the model can derive.
7. **Test on the smallest model expected to run the skill.** A larger model fills gaps in a thin instruction; a smaller model follows the text literally and shows where the skill is under-specified. Run the `write-skill` baseline check on the smallest model tier (and runtime) the skill targets, not only on the model you author with. Source: the Agent Skills best-practices guide, "test with all models you plan to use" (`## Sources`).

## Scoring

`node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file | grep <name>` prints the skill's score; the rubric and its maximum live in that script. Per-file floor by category: `scripts/config/scoring.json` (verify: `node -p "JSON.stringify(require('./scripts/config/scoring.json').skills)"`). Aim 14+ on new skills. Structural gate: `node scripts/skills/guard.mjs`. To author a new skill from scratch, use the `write-skill` skill.

**Single source, not a mirror:** the scorer lives ONCE in the bundled `write-skill/scripts/skill-guard.mjs` (`score` / `validate`), shipped so it runs in consumer repos AND used by this kit's own `ci.mjs` to score (`skill-maintenance` points at it too). There is no author-side `score.sh` to keep in sync — one rubric. Bundled `scripts/` sit outside the `content_hash` surface, so bump write-skill's `metadata.updated` when the rubric changes.

## Namespace

Artifacts surface as `<plugin>:<name>` (e.g. `docks:security`, `docks:write-skill`) from `name` in `plugins/docks/.claude-plugin/plugin.json`.

## Sources

- Skills: <https://code.claude.com/docs/en/skills>
- agentskills.io spec: <https://agentskills.io/specification>
- Agent Skills best practices: <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
- skill-creator `SKILL.md` (Apache-2.0): <https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md>
- upstream anthropics/skills skill-creator `improve_description.py` (Apache-2.0): <https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/improve_description.py>
