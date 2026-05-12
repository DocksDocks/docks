# `docks` Plugin Optimization Audit on Opus 4.7 — May 2026

**Scope:** the `docks` plugin (repo: `~/projects/docks`, published as [DocksDocks/docks](https://github.com/DocksDocks/docks)) ships the multi-agent pipeline kit — command orchestrators, portable skills, specialized subagents, and the author-side validators (`scripts/guard-*.sh`, `scripts/score-*.sh`). Inventory shifts as the plugin evolves; use the filesystem and validators for the current roster. Consumer-facing pieces — settings.json, hooks, status line, sync — live in `public` and are tracked at `docs/roadmap/planned/optimization-audit-may-2026.md` in the [DocksDocks/public](https://github.com/DocksDocks/public) repo.

## TL;DR

- **High-confidence wins for `docks`:** (1) selectively add `effort: xhigh` to the Sonnet agents whose current `max` inheritance from the parent is wasteful (the §A.1 table is the source of truth; several agents were miscategorized in the v0 draft); (2) extend the Builder-Verifier pattern by requiring verifier agents to **reproduce** their findings (re-grep the cited line, re-run the failing test) rather than only check syntactic citations — `/ultrareview`'s reported sub-1% false-positive rate comes from this step; (3) opt parallel scanners into `context: fork` via a skill-wrapper refactor (see next bullet) for the ~10× input-token cut on children 2-N.
- **The fork-wrapper win was APPLIED on 2026-05-06:** parallel-scanner agents are now opted into `context: fork` for the ~10× input-token cut on children 2-N. Issue [#16803](https://github.com/anthropics/claude-code/issues/16803) was closed in **v2.1.101** — plugin-loaded skills now honor `context: fork` and `agent` frontmatter, and the `agent:` field accepts custom plugin-defined agent names per [Anthropic's skills docs](https://code.claude.com/docs/en/skills). The kit shipped wrapper skills under `plugins/docks/skills/forked-*/SKILL.md`, each carrying `context: fork` + `agent: <scanner-name>`; the command orchestrators now invoke `Skill(skill: "docks:forked-<name>", args: "{plan-path} $ARGUMENTS")` for parallel scanner phases. No validator carve-out was needed — wrappers score above the floor. Sequential phases keep their `Agent(subagent_type: ...)` path. (§A.2)
- **The plugin's architectural choices are mostly defensible and sometimes ahead of the curve.** Plan-file-as-IPC matches OpenHands' event-stream substrate and Cursor's January 2026 dynamic-context-discovery (46.9% token reduction). Builder→Verifier matches Aider's architect/editor split, Anthropic's lead/subagent research pattern, and Anysphere's Bugbot. CSO-style "Use when… Not for…" descriptions are the documented agentskills.io standard. Per-phase model tiering (Opus synthesis / Sonnet exploration) is exactly what Anthropic's research multi-agent system used to beat single-Opus by 90.2%. The subagent roster is deliberately specialized rather than sprawling.
- **The most impactful new patterns the plugin is *not* using:** the **advisor tool** (`advisor_20260301`, **public beta** since April 9, 2026 — beta header `advisor-tool-2026-03-01`) which lets a Sonnet executor consult Opus mid-loop without orchestration code (good fit for the Phase-4-planner cost concentration); **per-finding reproduction** in verifier agents (the strongest signal-to-noise pattern documented anywhere as of May 2026); and **dynamic skill discovery** (Cursor's "files-not-tools" — expose only names + 1-line desc, defer full body to grep on demand).

---

## Tasks

Top-10 actionable items derived from §1 below.

- [ ] **(HIGH)** Add `effort: xhigh` overrides to Sonnet agents per the corrected table in §A.1; keep `max` on Opus synthesis tier and on `security-vulnerability-scanner` (cybersecurity refusal sensitivity).
- [x] **(MED) APPLIED 2026-05-06** Opt parallel scanners into `context: fork` via skill-wrapper refactor. No validator carve-out needed; wrapper skills clear the existing floor. Unblocked by v2.1.101 fix to issue [#16803](https://github.com/anthropics/claude-code/issues/16803). (§A.2). Expected: ~10× input-token cut on parallel-scanner children 2-N — to be confirmed via `cache_read_input_tokens` measurement on the next live runs.
- [ ] **(HIGH)** Add reproduce-step to verifier agents (`refactor-pre-verifier`, `refactor-post-verifier`, `security-synthesizer`, `docs-verifier`) — re-grep cited line / re-run failing test before report (§D.1).
- [ ] **(MED)** Pilot advisor tool (`advisor_20260301`) on `refactor-pre-verifier` (Sonnet) via Messages API outside the kit — beta header `advisor-tool-2026-03-01` (§A.3). Demoted from HIGH because per-agent integration is not yet exposed through Claude Code agent frontmatter.
- [ ] **(MED)** Move long enumerations from skill `description` fields to body sections (§C.1). Run `bash scripts/score-skills.sh --per-file` to verify no regressions.
- [ ] **(MED)** Restructure skill listings to Cursor's "names + 1-line desc" pattern (§C.2). Pilot with one skill before full rollout.
- [ ] **(MED)** Add OODA framing to orchestrator command bodies (`/docks:security`, `/docks:docs`, `/docks:refactor`) (§B.1).
- [ ] **(MED)** Audit plan-file IPC for chain-of-thought leakage — verifier should see decisions only, not planner's reasoning trace (§B.2).
- [ ] **(MED)** Add plan-brittleness mitigation — re-plan triggers on hard execution failures (§D.2).
- [ ] **(LOW)** Pre-emptive: `disable-model-invocation: true` on any future skill that performs destructive operations (§C.4).

---

## Section 1 — Top recommendations (docks-scoped)

Confidence: **HIGH** = multiple independent sources + empirical data; **MED** = one strong source or strong logical argument; **LOW** = speculative, pilot only.

| # | Recommendation | Confidence | Effort | Expected Impact |
|---|---|---|---|---|
| 1 | Add `effort: xhigh` to the Sonnet agents where parent inheritance of `max` is wasteful — `*-pre-verifier.md`, `docs-verifier.md`, `docs-skills-builder.md`, `docs-agents-builder.md`, plus `*-pattern-scanner.md` / `*-pattern-extractor.md` / `*-dead-code-scanner.md` / `*-duplication-scanner.md` / `*-explorer.md` already on Sonnet. | HIGH | trivial | 20–40% token reduction on those phases without quality loss; preserves `max` on Opus tier and on cybersecurity-sensitive `security-vulnerability-scanner`. |
| 2 | **APPLIED 2026-05-06** — opted parallel scanners into `context: fork` via skill wrappers (`plugins/docks/skills/forked-*/SKILL.md`), each carrying `context: fork` + `agent: <name>`; orchestrators now dispatch via `Skill(skill: "docks:forked-<name>")`. Unblocked by v2.1.101 fix to issue [#16803](https://github.com/anthropics/claude-code/issues/16803). | HIGH | applied | ~10× input-token cut on parallel-scanner children 2-N expected (Anthropic v2.1.117 patch notes); to be confirmed via `cache_read_input_tokens` on next live runs. |
| 3 | Add a **reproduce step** to verifier agents (`*-pre-verifier`, `*-post-verifier`, `*-verifier`, `security-synthesizer`). Each finding must be reproduced (file:line re-grepped, failing test re-run) before landing in the report. | HIGH | moderate | Drives false-positive rate toward `/ultrareview`'s sub-1% bar. Highest signal-to-noise pattern documented as of May 2026. |
| 4 | Pilot the **advisor tool** (`advisor_20260301`, public beta) on `refactor-pre-verifier`. Configure as Sonnet-executor + Opus-advisor; consult Opus only on findings flagged low-confidence. Run via Messages API — Claude Code can't pass arbitrary beta headers yet. | MED | moderate | Anthropic benchmark: Sonnet+Opus-advisor > Sonnet-solo on SWE-bench Multilingual (+2.7 pp) at 11.9% lower cost than Opus-solo. |
| 5 | Move long enumeration content from skill `description` fields into bodies. The `description` loads every session and is capped at 1,536 chars (and silently truncated past that); the body loads only on activation. | MED | moderate | Cleans system-prompt prefix; per-skill scorer rewards ≤500 char descriptions. |
| 6 | Restructure skill listings to **Cursor's "names + 1-line desc" pattern** (Jan 2026 blog, 46.9% MCP token reduction). Defer full body to grep-on-demand. | MED | high | Major prefix-size reduction; re-architects the way skills load. Highest-effort item in this list. |
| 7 | Add **OODA framing** to orchestrator command bodies (`/docks:security`, `/docks:docs`, `/docks:refactor`). Anthropic's research multi-agent paper uses OODA for the lead-research-agent. | MED | trivial | Tighter loop discipline on the orchestrator; not relevant to Sonnet sub-scanners. |
| 8 | Audit plan-file IPC for **chain-of-thought leakage**. The plan file should carry decisions/conclusions only; reasoning trace stays in the planner's working context. | MED | low | Reduces verifier's input-token cost (planner reasoning is unrelated to verification). Was the original justification for splitting Builder-Verifier (per Aider). |
| 9 | Add **plan-brittleness mitigation** — re-plan triggers on execution failures. Currently plan-and-execute is "brittle when plans need mid-run adaptation" per Digital Applied Team's 2026 Agent Architecture Patterns taxonomy. | MED | moderate | Recovers gracefully when a scanner hits unexpected input or a fixture moves. |
| 10 | Verify `disable-model-invocation: true` on any skill that performs destructive operations (e.g. ones that author writes to repo state). | LOW | trivial | Defense-in-depth; agentskills.io spec calls it out. Not yet known if any current docks skill warrants it. |

---

## Section A — Per-Agent Frontmatter

### A.1 Effort tiering — push wasteful `max` inheritance down to `xhigh` (HIGH / trivial / low risk)

Public repo policy is `CLAUDE_CODE_EFFORT_LEVEL=max` (kept intentional — see `agent_optimization.md` §2.1). Subagents inherit that effort unless their frontmatter declares otherwise. **Inheritance is wasteful** on Sonnet-tier explorers, scanners, builders, and verifiers that do bounded I/O work (file lists, grep, structured authoring) where `max` thinking budget is overkill. Anthropic's [Effort docs](https://platform.claude.com/docs/en/build-with-claude/effort) recommend `xhigh` as the starting point for coding and agentic work on Opus 4.7; for Sonnet that translates to "the highest tier short of `max`" — same principle.

**Recommended overrides** (set `effort: xhigh` in frontmatter, leaving model decisions untouched):

"Current model" column verified by `grep -m1 '^model:' plugins/docks/agents/*.md` on 2026-05-06.

| Agent | Current model | Recommended effort | Why |
|---|---|---|---|
| `refactor-explorer.md` | sonnet | `xhigh` | Maps stack/tools — bounded discovery work, but xhigh keeps headroom for monorepo/DI inference |
| `refactor-dead-code-scanner.md` | sonnet | `xhigh` | Deeper than explorer; needs reasoning on classification |
| `refactor-duplication-scanner.md` | sonnet | `xhigh` | Same |
| `refactor-solid-analyzer.md` | **opus** | **`max`** | Keep — Opus synthesis-tier work (per-principle deep analysis with cross-package coupling) |
| `security-explorer.md` | sonnet | `xhigh` | Attack-surface mapping — xhigh keeps headroom for endpoint/auth-flow inference |
| `security-vulnerability-scanner.md` | sonnet | **`max`** | Keep — Anthropic's 4.7 cybersecurity refusals are sensitive to effort drop |
| `security-adversarial-hunter.md` | **opus** | **`max`** | Keep — Opus + cybersecurity-sensitive (chained-finding reasoning) |
| `security-logic-analyzer.md` | **opus** | **`max`** | Keep — Opus synthesis-tier (trust-boundary / race-condition reasoning) |
| `docs-explorer.md` | sonnet | `xhigh` | Repo-mapping work — xhigh keeps headroom for skill/agent enumeration with frontmatter parsing |
| `docs-categorizer.md` | **opus** | **`max`** | Keep — Opus synthesis-tier (full skill-set proposal with CSO descriptions) |
| `docs-pattern-scanner.md` | sonnet | `xhigh` | Same |
| `docs-pattern-extractor.md` | sonnet | `xhigh` | Same |
| `docs-role-mapper.md` | **opus** | **`max`** | Keep — Opus synthesis-tier (agent-role mapping with skill-reference audit) |
| `refactor-planner.md` | opus | **`max`** | Keep — synthesis tier |
| `refactor-pre-verifier.md` | **sonnet** | `xhigh` | Verifier on Sonnet — `xhigh` override balances reproduction effort against cost (top advisor-tool pilot candidate per §A.3) |
| `refactor-post-verifier.md` | opus | **`max`** | Keep |
| `security-synthesizer.md` | opus | **`max`** | Keep — synthesis tier |
| `docs-skills-builder.md` | **sonnet** | `xhigh` | Builder on Sonnet — `xhigh` override; structured-output authoring benefits from extended exploration |
| `docs-agents-builder.md` | **sonnet** | `xhigh` | Builder on Sonnet — `xhigh` override; same rationale |
| `docs-verifier.md` | **sonnet** | `xhigh` | Verifier on Sonnet — `xhigh` override pairs with §D.1 reproduce-step |

**Rationale:** Anthropic's [Effort docs](https://platform.claude.com/docs/en/build-with-claude/effort) explicitly state `max` "can lead to overthinking" on structured-output / less intelligence-sensitive tasks. Hex's CTO measured "low-effort Opus 4.7 ≈ medium-effort Opus 4.6"; DataCamp's benchmark found `xhigh` produced over-verbose output on routine tasks. The `public` repo accepts that on the orchestrator turn but the per-subagent overrides above are where the savings actually compound.

**Where the savings really live now:** with the corrected baseline, Sonnet-tier agents become candidates for an `effort: xhigh` override — the inherited `max` is wasteful across explorers, scanners, builders, and verifiers alike. The Opus tier is largely correct as-is and keeps `max` for synthesis-tier reasoning.

**Risk:** the `security-vulnerability-scanner` keeps `max` because 4.7-specific cybersecurity refusals are sensitive to effort drop (Anthropic-flagged in 4.7 release notes; refusal rate on safety-research tasks is 33% even at high effort).

**Validation:** the existing `scripts/score-agents.sh` does NOT yet score the `effort` field. Consider adding a per-agent floor for the synthesis tier (must declare `max`) so a contributor can't accidentally drop it.

### A.2 Fork subagents — APPLIED via skill-wrapper refactor (2026-05-06)

**Status update 2026-05-06:** Issue [#16803](https://github.com/anthropics/claude-code/issues/16803) was closed in **v2.1.101** ([Anthropic collaborator confirmation](https://github.com/anthropics/claude-code/issues/16803#issuecomment-4272680635)) — plugin-loaded skills now honor `context: fork` and `agent` frontmatter fields, matching the behavior of user/project skills. Anthropic's [skills docs](https://code.claude.com/docs/en/skills) explicitly confirm that the `agent:` field accepts *"any custom subagent from `.claude/agents/`"* — not just built-ins like `Explore` / `Plan` / `general-purpose`. **Fork is now reachable from the docks plugin** via a skill-wrapper layer, and this audit's recommendation has been applied.

**The mismatch and the fix:** `context: fork` is a **skill-level** frontmatter field, not an agent-level one. The orchestrators (`commands/{refactor,security,docs}.md`) previously dispatched via `Agent(subagent_type: <name>)`, which routes through the named-agent code path and bypasses fork (per [Build This Now](https://www.buildthisnow.com/blog/guide/mechanics/claude-code-fork-subagent) reverse-engineering of the Agent tool). The fix: each parallel-scanner phase now invokes `Skill(skill: "docks:forked-<name>", args: "<plan-file-path> $ARGUMENTS")`, where each wrapper skill carries `context: fork` + `agent: <scanner-name>` and the agent's full system prompt drives execution.

**What landed:**

1. **Wrapper skills** at `plugins/docks/skills/forked-<scanner-name>/SKILL.md` — matching each parallel-scanner role (see roster below). Each wrapper is a thin task envelope (~50 lines body) with `context: fork`, `agent: <scanner-name>`, `<constraint>` blocks (IPC contract, thin-envelope rule, missing-arg abort), and a Wrapper-args table. Bodies use `$0` for the plan-file path and `$1` for the scope (per Anthropic's [`$ARGUMENTS[N]` substitution](https://code.claude.com/docs/en/skills#available-string-substitutions)).
2. **Orchestrator edits** — `refactor.md`, `security.md`, and `docs.md` use wrappers for their parallel scanner phases. Each parallel-scanner block now reads `Skill(skill: "docks:forked-<name>", args: "{plan-path} $ARGUMENTS")`. Sequential phases (Explorer, Synthesizer, Builders, Verifiers, Planner) keep the existing `Agent(subagent_type: ...)` path — fork has no sibling to share a prefix with on a one-shot call. `Skill` was added to each command's `allowed-tools`.
3. **No validator carve-out needed** — the audit predicted one, but the wrappers score above the per-file floor, driven by `<constraint>` blocks, BAD/GOOD output-discipline tables, fresh `metadata.updated`, and CSO-tight descriptions. Body-size sweet-spot (80–310 lines) was deliberately skipped — the whole point of these wrappers is to be thin task envelopes; bloating them to 80+ lines would defeat the cache-reuse goal by enlarging each fork's prompt.

**Wrapper roster:**

| Wrapper | Wraps | Phase | IPC heading |
|---|---|---|---|
| `forked-refactor-dead-code-scanner` | `refactor-dead-code-scanner` | `/refactor` 2a | `## Phase 2a: Dead Code Findings` |
| `forked-refactor-duplication-scanner` | `refactor-duplication-scanner` | `/refactor` 2b | `## Phase 2b: Duplication Findings` |
| `forked-security-vulnerability-scanner` | `security-vulnerability-scanner` | `/security` 2a | `## Phase 2a: Vulnerability Findings` |
| `forked-security-logic-analyzer` | `security-logic-analyzer` | `/security` 2b | `## Phase 2b: Logic Findings` |
| `forked-security-adversarial-hunter` | `security-adversarial-hunter` | `/security` 2c | `## Phase 2c: Adversarial Findings` |
| `forked-docs-categorizer` | `docs-categorizer` | `/docs` 2a | `## Phase 2a: Categorizer Proposals` |
| `forked-docs-pattern-scanner` | `docs-pattern-scanner` | `/docs` 2b | `## Phase 2b: Pattern Scanner Findings` |
| `forked-docs-role-mapper` | `docs-role-mapper` | `/docs` 4a | `## Phase 4a: Role Mapper Proposals` |
| `forked-docs-pattern-extractor` | `docs-pattern-extractor` | `/docs` 4b | `## Phase 4b: Pattern Extractor Content` |

The audit's original "wrapper candidates" list missed some docs fan-outs. On reading `docs.md`, more parallel fan-outs surfaced — `docs-categorizer` runs alongside `docs-pattern-scanner` in Phase 2, and `docs-role-mapper` runs alongside `docs-pattern-extractor` in Phase 4. Those docs fan-outs are now wrapped too.

**Expected benefit:** ~10× input-token cut on parallel-scanner children 2-N (per Anthropic v2.1.117 patch notes for the cache-prefix sharing the env var enables). The exact savings depend on the number of siblings in a given phase; `/docs` benefits in multiple phases.

**Validation plan:** capture `cache_read_input_tokens` on parallel-scanner children 2-N during the next live `/refactor`, `/security`, and `/docs` runs (see §G's validation section). The kit can ship the wrappers, but only a real run on `claude-opus-4-7[1m]` confirms the cache prefix is actually being reused.

**Risk surfaced:** the wrapper layer increases the skill-listing budget marginally (per Anthropic's docs the listing aggregates at 1% of context, default 8,000 chars; descriptions are silently dropped past the cap). Wrappers carry `user-invocable: false`, so they don't appear in the `/` menu — but their descriptions still load into Claude's listing. The wrapper descriptions are concise enough for the fallback budget today. If this becomes a pressure point in future, set `SLASH_COMMAND_TOOL_CHAR_BUDGET` higher or move the wrappers to `name-only` via `skillOverrides`.

(Sequential-only agents — `refactor-solid-analyzer`, `refactor-planner`, all `*-verifier`, `security-synthesizer`, `docs-skills-builder`, `docs-agents-builder`, `docs-explorer`, `refactor-explorer`, `security-explorer` — don't benefit from fork because there's no parallel sibling to share the prefix with. Skipped intentionally.)

### A.3 Advisor tool retrofit (HIGH if scoped / moderate / low risk)

Wrap the `refactor-pre-verifier` API call with `advisor_20260301` configured to consult Opus 4.7 from its existing Sonnet executor. Anthropic's BrowseComp data: Haiku-with-Opus-advisor went from 19.7% → 41.2%. SWE-bench Multilingual: Sonnet 4.6 + Opus 4.6 advisor scored 74.8% (+2.7 pp over Sonnet-solo's 72.1%) at **−11.9% cost** vs Opus-solo.

**Best fit:** Sonnet verifier/builder agents (now correctly identified — see §A.1): `refactor-pre-verifier`, `docs-verifier`, `docs-skills-builder`, `docs-agents-builder`. These are Sonnet doing structured-output authoring or verification — exactly the workload Anthropic's prompting guide for the advisor optimizes (early-call before substantive work, late-call before declaring done).

**Pilot:** run `refactor-pre-verifier` (Sonnet+Opus-advisor) on the same fixture as a current run. Hypothesis: equal or better quality at the per-task cost of Sonnet-only plus a fixed Opus surcharge per advisor call (typically 2–3 calls per task, 1,400–1,800 tokens each per [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool)).

**Status:** the advisor tool is in **public beta** (since April 9, 2026); requires the `advisor-tool-2026-03-01` beta header. The `/advisor` slash command (Claude Code v2.1.101+, shipped April 11, 2026) is the user-facing wrapper around the same `advisor_20260301` server tool. **Per-agent integration requires API-level access** — Claude Code subscription clients cannot pass arbitrary beta headers, so this can only be piloted via the Messages API outside the kit until Anthropic surfaces it through agent frontmatter.

---

## Section B — Command-Body and Orchestration Patterns

### B.1 OODA framing for orchestrator commands (MED / trivial)

Anthropic's research multi-agent paper explicitly instructs the lead-research-agent on OODA loops with parallel-tool-call instructions: "leave any extensive tool calls to subagents; focus on running subagents in parallel efficiently."

The plugin's command orchestrators are exactly this role. Add a one-paragraph OODA framing near the top of each command body:

> **Orchestrator OODA:** observe (read fixture / repo state), orient (decide which subagents to spawn for this phase), decide (set scopes), act (spawn in parallel via single tool-call turn). Subagents do the actual work; orchestrator coordinates.

Sub-scanner agents do not need OODA framing — they're inside one OODA cycle of the orchestrator's act step.

### B.2 Plan-file-as-IPC — chain-of-thought leakage audit (MED / low)

The plan-file-as-IPC pattern is best-in-class (matches OpenHands event-stream, Cursor dynamic-context-discovery, claudefa.st `claude-progress.txt`, Anthropic's research multi-agent system).

**Audit:** verify the plan files emitted by Phase-3/Phase-4 of each command don't carry the planner's reasoning trace. Aider's architect/editor design — and the original Builder-Verifier split rationale — is that the verifier should see decisions/conclusions only, not the planner's working memory. Reasoning leakage costs the verifier input tokens for content it doesn't need.

How to check: read a few real `/docks:refactor` plan files, look for sections like "I considered X but decided against it because Y" — those belong in the planner's working context, not the plan file.

### B.3 Parallel scanner fan-out — verify intra-agent parallelism (MED / trivial)

When the orchestrator decides to fan out, *also* tell each subagent to use parallel tools internally. Anthropic documents "two kinds of parallelization":
1. Fan-out across subagents (which the kit does correctly).
2. Per-subagent intra-tool parallelism (each subagent uses 3+ tools in parallel within its own turn).

Verify the scanner agents' system prompts explicitly instruct intra-agent parallelism. If they default to sequential tool use, the fan-out gain is partially squandered.

### B.4 PostToolBatch hook for cross-scanner consistency (LOW / moderate)

New hook event runs *after every tool call in a batch resolves* (per Claude API hooks reference 2026). For the "parallel scanners launched in single tool-call turns" pattern, this is the natural place to:
- Validate cross-scanner consistency (do scanners agree on file ownership?)
- Trigger an early Builder phase if all scanners agree (skip the synthesis-merge step)

Hook itself is configured in `public/ssot/.claude/settings.json` (see `agent_optimization.md` §3.3) but the consumer pattern lives here. Pilot on `/docks:security` Phase 2.

### B.5 Phase-4/5 cost concentration — additional levers beyond the existing audit

The original audit's conclusion (don't merge Builder/Verifier; sample the verifier's research-gate ~30–50K tokens) holds. Two **additional** levers:

1. **Forked subagents on parallel scanners** (cache-prefix sharing, see §A.2 — applied 2026-05-06 via skill wrappers since v2.1.101).
2. **Advisor tool on the pre-verifier** (Sonnet-executor + Opus-advisor on Phase 5, see §A.3).
3. **Partial result streaming via PostToolBatch:** if the planner emits a checklist, fire the verifier on each item as it's completed, in parallel with the planner finishing. Hard to implement, high payoff.
4. **Re-run the merge audit** after §A.2 fork wrappers and §A.3 advisor land — the 44% concentration may shift enough that the merge-vs-sample tradeoff changes.

---

## Section C — agentskills.io Structural Compliance

### C.1 Description bloat — push enumerations into body (HIGH / moderate)

Per `docks/CLAUDE.md`:
> "the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing"; first 100 chars matter most for matching.

Every session loads the description. Audit existing skills for `Covers X, Y, Z…` enumerations in the description that should live in the body.

The `score-skills.sh` validator already rewards ≤500 char descriptions (2 pts ≤500, 1 pt ≤1000, 0 else) and deducts for slop words (`comprehensive`, `robust`, `elegant`, `seamless`). **Verify scores haven't regressed** since the most recent additions.

Worth running `bash scripts/score-skills.sh --per-file` and looking for any skill scoring below the 8/16 floor.

### C.2 Cursor's "names + 1-line desc" listing pattern (MED / high effort)

Right now `skillListingBudgetFraction: 0.025` injects full skill descriptions into the system-prompt prefix. Cursor's January 2026 dynamic-context-discovery blog measured **46.9% MCP token reduction** by:
- Loading only `name + 1-line description` statically
- Letting the agent grep `.claude/skills/*/SKILL.md` for full content on demand

This is now the documented agentskills.io progressive-disclosure pattern. Implementation: shrink the description field to a single sentence and put trigger details in a `when_to_use` body section.

**Why MED, not HIGH:** the rewrite is high-effort (touches every skill) and breaks existing semantic match on descriptions that have grown rich for matching. Pilot with one skill first; measure prefix size and false-trigger rate before/after.

### C.3 Vendored skills — `upstream:` block discipline (kept; verify)

Third-party / vendored skills already get the `upstream:` frontmatter block (`source`, `license`, `vendored_at: "YYYY-MM-DD"`) per the kit standard. This signals validators to relax kit-specific checks while preserving universal structural ones. Working as designed; verify any new vendored skill follows it.

### C.4 `disable-model-invocation: true` for destructive operations (LOW / trivial)

agentskills.io spec calls out this field for skills that perform destructive operations. The plugin's current skill set appears read-mostly, so this is preemptive: if a future skill writes to repo state in non-trivial ways (file deletes, schema migrations), set the flag.

### C.5 `paths:` glob to gate auto-loading by file context (MED / trivial)

For skills tied to specific file types (e.g., `nextjs-conventions`, `react-effect-policy`, `react-reuse-components`, `typescript-typing`), set `paths: "src/**/*.{ts,tsx}"` (or similar). This gates auto-loading by current file context — the skill only triggers when the working set matches. Reduces false-trigger on non-Next.js / non-React projects.

---

## Section D — Builder-Verifier and the Reproduce Step

### D.1 Reproduce, don't just check (HIGH / moderate / high payoff)

The plugin's verifier agents currently **check** outputs (file:line citations match a regex, or the SubagentStop hook in `public` regex-matches a citation pattern). They do not **reproduce** the underlying claim.

`/ultrareview`'s reported sub-1% false-positive rate comes from per-finding reproduction:
- Each finding has a sandbox where the bug must reproduce (run the failing test, grep the cited line, verify the assertion holds).
- Findings that fail to reproduce are dropped before report.

Apply to:
- `refactor-pre-verifier` — for each "this change will break X" claim, re-grep for X and confirm the impact.
- `refactor-post-verifier` — for each "the change introduced Y violation" claim, re-run the affected linter rule.
- `security-synthesizer` — for each finding from the parallel scanners, re-grep the cited file:line and verify the pattern matches.
- `docs-verifier` — for each "skill X cites missing path Y" claim, verify path Y is missing.

This is the strongest signal-to-noise pattern documented anywhere as of May 2026 (Aider, Anthropic research multi-agent, Bugbot, /ultrareview all converge on it). It's also the largest Phase-5 payoff lever.

**Cost:** verifier agents take longer because they re-execute. Pair with §A.3 advisor tool to keep cost bounded.

### D.2 Plan brittleness — re-plan triggers on execution failures (MED / moderate)

Per Digital Applied Team's 2026 Agent Architecture Patterns taxonomy: plan-and-execute (the kit's pattern) is "brittle when plans need mid-run adaptation."

**Mitigation:** add re-plan triggers on execution failures. When a phase agent reports a hard failure (file gone, scanner crashed, dependency missing), the orchestrator should not blindly continue — it should re-invoke the planner with the failure context.

Currently the kit's commands appear to push through; verify by reading the command bodies. If absent, add a one-paragraph "on hard failure, reset to Phase N-1 with the failure context appended" rule.

**Test:** inject a deliberate mid-run failure (delete a file the planner expects after Phase 3 emits the plan) and observe whether `/docks:refactor` recovers gracefully.

### D.3 Failure compounding — verify file:line citations resolve (MED / moderate)

An incorrect upstream inference treated as ground truth is the #2 multi-agent failure mode. The plugin's `SubagentStop` hook (in `public`) regex-matches citations but does not verify them. Catching *fabricated* citations requires actually opening the cited file and confirming the line exists.

**Recommendation:** the SubagentStop hook migration to an `agent`-type hook (see `agent_optimization.md` §3.1) gives the agent `Read`/`Grep`/`Glob` access — use it to verify each `file:line` claim resolves. Plugin-side, ensure verifier agents emit citations in a format the hook can parse (`path/to/file.ts:42` is unambiguous; `near the auth handler` is not).

---

## Section E — Measurements `docks` Should Run

Each is a real decision the public web can inform but not settle. Targets live here; runs are ad-hoc for now.

1. **Per-agent effort tiering impact (§A.1).** Measure tokens-per-phase before and after applying the recommended `effort:` overrides on a fixed `/docks:refactor` fixture. Hypothesis: 20–40% reduction on Sonnet phases without quality drop on the verifier's "bugs found / regressions caught" metric.

2. **Fork + intra-agent parallelism (§A.2 + §B.3).** Skill-wrapper refactor landed 2026-05-06 — capture `cache_read_input_tokens` on parallel-scanner children 2-N during the next live `/refactor`, `/security`, and `/docs` runs. Hypothesis: 5–10× reduction (Anthropic v2.1.117 patch notes).

3. **Advisor tool on `refactor-pre-verifier` (§A.3).** Sonnet+Opus-advisor vs current Opus-solo on Phase 5, run via Messages API. Hypothesis: equal quality at 30–50% lower cost.

4. **Reproduce-step on verifiers (§D.1).** Inject 10 known-false findings into the input to `refactor-post-verifier`. Hypothesis: reproduce-step drops 9–10 of them; check-only drops 0–3.

5. **/ultrareview comparison.** Run Anthropic's multi-agent reviewer fleet against `/docks:security` on the same diffs. Sub-1% false-positive rate is the bar. If `/docks:security` matches or beats it, publish; if not, study the per-finding-reproduction step and adopt it (this is §D.1 already, with measurement).

6. **Skill-listing budget (§C.2).** Measure system-prompt prefix size and cache-hit rate before/after switching one skill to "names + 1-line desc, body fetched on demand." Decide whether to roll out broadly.

7. **Phase-4/5 merge audit, redux.** §A.2 (fork wrappers) landed 2026-05-06; §A.3 (advisor) is still gated on Messages-API access. Re-run the original audit's merge-vs-sample analysis once both are validated against live `cache_read_input_tokens` data — the 44% concentration may shift enough that the tradeoff changes.

8. **Plan-brittleness (§D.2).** Inject a deliberate mid-run failure (delete a file the planner expects) and measure whether the orchestrator re-plans gracefully. Anthropic 2026 Architecture Patterns lists this as the #1 plan-and-execute failure mode.

9. **Description-bloat sweep (§C.1).** Run `bash scripts/score-skills.sh --per-file` and `bash scripts/score-agents.sh --per-file`. Any score below the floor → trim to ≤500 chars and re-run.

---

## Section F — Things `docks` Does Exceptionally Well

Reinforcement — don't break these:

1. **CSO-compliant agent descriptions** ("Use when… Not for…") are the documented agentskills.io standard and the recommended Anthropic skill-authoring practice. Validators (`scripts/guard-agents.sh`) enforce this. Keep rigorously.

2. **Per-phase model tiering — empirically validated.** Not a folk theory:
   - Anthropic's research system: Lead Opus + Sonnet subagents outperformed single-Opus by 90.2%.
   - Aider's architect+editor benchmark: SOTA at 85% with split-model.
   - Steve Kinney's published Architect/Builder/Validator/Scribe template uses exactly this pattern.

3. **64% Opus / 78% wall-clock concentration in 3 phases** is a feature, not a bug — it's the price of the Builder-Verifier quality pattern.

4. **`<constraint>` blocks, `## Workflow` with context-acknowledgment, `## Anti-Hallucination Checks`, `## Success Criteria`** all match published frameworks (Steve Kinney's template, PubNub best-practices, Anthropic skill best practices). Rigorous structure ahead of most community kits.

5. **Author-side validators** (`guard/score` scripts in `scripts/`) — CI-quality gate on the kit itself, mirroring Anthropic's [`skill-creator` Eval/Benchmark pipeline](https://tessl.io/blog/anthropic-brings-evals-to-skill-creator-heres-why-thats-a-big-deal/) (executor → grader → comparator → analyzer subagents with blind A/B and LLM-as-judge; Elo-style preference scoring from Anthropic's [crowdworker eval research](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)). Not common in community kits. The count-derived total floors (`artifact_count × per-file_floor`) automatically scale with growth — a clean design.

6. **Plan-file-as-IPC** — matches OpenHands' state/event-stream architecture (arXiv:2407.16741), Cursor's January 2026 "files as the primary interface" (46.9% token reduction), claudefa.st Code Kit's `claude-progress.txt` substrate, and Anthropic's research multi-agent memory pattern.

7. **The subagent roster is conservative** vs broad community kits. The original audit's agent inventory appears to have conflated the plugin with the broader installed-skill landscape; use `ls plugins/docks/agents/*.md | wc -l` when the current count is actually needed.

8. **Marketplace + plugin in one repo, double-layered release gating.** Local `ci.sh` catches stage issues fast; GitHub-side `tag-CI` is the authoritative gate before `gh release create`. Two layers because each catches different failure modes.

9. **Plugin namespace** (`docks:fix`, `docks:security-vulnerability-scanner`) — clean and avoids collision with user agents.

10. **Body sweet-spot rule (80–310 lines)** in `docks/CLAUDE.md` matches Anthropic's auto-compaction reattachment behavior (first 5,000 tokens of each invoked skill, 25K shared budget). Engineering-grade authoring guidance.

---

## Section G — Caveats

- **Source weighting:** where Anthropic's official docs and a community blogger disagree, both views are reported. The plugin's per-phase model tiering and Builder-Verifier patterns are *empirically* validated (Anthropic research blog, Aider benchmarks); the advisor tool and reproduce-step are newer and have less independent corroboration.

- **Inventory caveat:** the original audit's agent inventory appears stale or counts something other than `plugins/docks/agents/*.md`. The Augment Code coordination-overhead concern still applies to any specialization/orchestration tradeoff, but current inventory should be computed from the filesystem instead of copied into prose.

- **`context: fork` is reachable via skill wrappers** since v2.1.101 closed issue [#16803](https://github.com/anthropics/claude-code/issues/16803). Direct path on agent frontmatter remains unsupported (agent-tool named-`subagent_type` calls bypass fork); the kit's skill-wrapper layer (described in §A.2 and applied 2026-05-06) bridges this. This audit is authored for a Linux/macOS-only target stack — Windows-specific caveats are not tracked.

- **Cursor "files-not-tools" 46.9% reduction** is measured on Cursor's MCP-heavy workload, not Claude Code's plugin/skill workload. Magnitude on the docks plugin is workload-dependent — pilot before rolling out (§E.6).

- **Advisor tool is in public beta** (requires `advisor-tool-2026-03-01` beta header), not GA. Per-agent integration requires Messages-API access; Claude Code subscription clients cannot pass arbitrary beta headers.

- **Advisor tool benchmarks** (BrowseComp 19.7→41.2, SWE-bench Multilingual 72.1→74.8 / −11.9% cost) come from Anthropic's own publication. Independent corroboration is limited as of May 2026.

- **`/ultrareview` sub-1% false-positive rate** comes from Anthropic internal data; no external reproduction yet. Treat as the bar to aim for, not a proven benchmark.

- **Empirical numbers** (10×, 30%, 90.2%, etc.) are derived from cited sources; on the plugin's specific workload, expect variance. §E is the way to confirm.

---

## Cross-references

- Consumer-side optimizations (`ssot/.claude/settings.json` env vars, hooks, status line, sync, global `~/.claude/CLAUDE.md` heuristics, RTK, plugin selection): see `docs/roadmap/planned/optimization-audit-may-2026.md` in the [DocksDocks/public](https://github.com/DocksDocks/public) repo.
