# `docks` Plugin Optimization Audit on Opus 4.7 — May 2026

**Scope:** the `docks` plugin (repo: `~/projects/docks`, published as [DocksDocks/docks](https://github.com/DocksDocks/docks)) ships the multi-agent pipeline kit — 3 commands (`/docks:security`, `/docks:docs`, `/docks:refactor`), 15 skills, 20 subagents, and the author-side validators (`scripts/guard-*.sh`, `scripts/score-*.sh`). Counts are accurate as of this audit (2026-05-06) and may drift as the plugin evolves; the plugin README is the source of truth for current inventory. Consumer-facing pieces — settings.json, hooks, status line, sync — live in `public` and are tracked at `docs/roadmap/planned/optimization-audit-may-2026.md` in the [DocksDocks/public](https://github.com/DocksDocks/public) repo.

## TL;DR

- **Three high-confidence wins for `docks`:** (1) selectively add `effort: xhigh` (or `medium`) to Sonnet-tier subagent frontmatter where current `max` inheritance from the parent is wasteful — the parallel scanners and explorers in particular; (2) opt the parallel-scanner agents into `context: fork` so they actually benefit from the kit's `CLAUDE_CODE_FORK_SUBAGENT=1` env var (children 2-N inherit prompt-cache prefix, ~10× input-token reduction on fan-outs per Anthropic v2.1.117 patch notes); (3) extend the Builder-Verifier pattern by requiring verifier agents to **reproduce** their findings (re-grep the cited line, re-run the failing test) rather than only check syntactic citations — `/ultrareview`'s reported sub-1% false-positive rate comes from this step.
- **The plugin's architectural choices are mostly defensible and sometimes ahead of the curve.** Plan-file-as-IPC matches OpenHands' event-stream substrate and Cursor's January 2026 dynamic-context-discovery (46.9% token reduction). Builder→Verifier matches Aider's architect/editor split, Anthropic's lead/subagent research pattern, and Anysphere's Bugbot fixer. CSO-style "Use when… Not for…" descriptions are the documented agentskills.io standard. Per-phase model tiering (Opus synthesis / Sonnet exploration) is exactly what Anthropic's research multi-agent system used to beat single-Opus by 90.2%. **20 agents is on the conservative end** vs community kits like wshobson/agents (185 across 80 plugins).
- **The most impactful new patterns the plugin is *not* using:** the **advisor tool** (`advisor_20260301`, GA April 9, 2026) which lets a Sonnet executor consult Opus mid-loop without orchestration code (good fit for the Phase-4-planner cost concentration); **task budgets** (`task-budgets-2026-03-13` beta) for long agentic phases instead of relying on `max_tokens` alone — but blocked because Claude Code subscription clients can't pass arbitrary beta headers (verify via API helper if planning to ship); **per-finding reproduction** in verifier agents (the strongest signal-to-noise pattern documented anywhere as of May 2026); and **dynamic skill discovery** (Cursor's "files-not-tools" — expose only names + 1-line desc, defer full body to grep on demand).

---

## Tasks

Top-10 actionable items derived from §1 below.

- [ ] **(HIGH)** Add `effort:` overrides to Sonnet-tier agent frontmatter per the table in §A.1 (`xhigh` for scanners/analyzers, `medium` for explorers; keep `max` on synthesis tier and on `security-vulnerability-scanner` / `security-adversarial-hunter`).
- [ ] **(HIGH)** Opt parallel-scanner agents into `context: fork` so they benefit from `public`'s `CLAUDE_CODE_FORK_SUBAGENT=1` (§A.3). Linux/macOS only — issue #47350 on Windows.
- [ ] **(HIGH)** Add reproduce-step to verifier agents (`refactor-pre-verifier`, `refactor-post-verifier`, `security-synthesizer`, `docs-verifier`) — re-grep cited line / re-run failing test before report (§D.1).
- [ ] **(HIGH)** Pilot advisor tool (`advisor_20260301`) on `refactor-pre-verifier` — Sonnet executor + Opus advisor (§A.4).
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
| 1 | Add `effort: xhigh` (or `medium`) to Sonnet-tier subagent frontmatter where parent inheritance of `max` is wasteful — `*-explorer.md`, `*-pattern-scanner.md`, `*-dead-code-scanner.md`, `*-duplication-scanner.md`. | HIGH | trivial | 20–40% token reduction on Sonnet phases without quality loss; preserves `max` on Opus orchestrator + per-agent on synthesis tier. |
| 2 | Opt parallel-scanner agents into `context: fork` so they benefit from `public`'s `CLAUDE_CODE_FORK_SUBAGENT=1`. | HIGH | trivial | ~10× input-token cut on parallel-scanner children 2-N (Anthropic patch notes). Hard requirement: scanners must NOT need to mutate cached state. |
| 3 | Add a **reproduce step** to verifier agents (`*-pre-verifier`, `*-post-verifier`, `*-verifier`, `security-synthesizer`). Each finding must be reproduced (file:line re-grepped, failing test re-run) before landing in the report. | HIGH | moderate | Drives false-positive rate toward `/ultrareview`'s sub-1% bar. Highest signal-to-noise pattern documented as of May 2026. |
| 4 | Pilot the **advisor tool** (`advisor_20260301`) on `refactor-pre-verifier`. Configure as Sonnet-executor + Opus-advisor; consult Opus only on findings flagged low-confidence. | HIGH | moderate | Anthropic benchmark: Sonnet+Opus-advisor > Sonnet-solo on SWE-bench Multilingual at 11.9% lower cost than Opus-solo. Could reshape the 12/20 Opus-Sonnet split. |
| 5 | Move long enumeration content from skill `description` fields into bodies. The `description` loads every session and is capped at 1,536 chars (and silently truncated past that); the body loads only on activation. | MED | moderate | Cleans system-prompt prefix; per-skill scorer rewards ≤500 char descriptions. |
| 6 | Restructure skill listings to **Cursor's "names + 1-line desc" pattern** (Jan 2026 blog, 46.9% MCP token reduction). Defer full body to grep-on-demand. | MED | high | Major prefix-size reduction; re-architects the way skills load. Highest-effort item in this list. |
| 7 | Add **OODA framing** to orchestrator command bodies (`/docks:security`, `/docks:docs`, `/docks:refactor`). Anthropic's research multi-agent paper uses OODA for the lead-research-agent. | MED | trivial | Tighter loop discipline on the orchestrator; not relevant to Sonnet sub-scanners. |
| 8 | Audit plan-file IPC for **chain-of-thought leakage**. The plan file should carry decisions/conclusions only; reasoning trace stays in the planner's working context. | MED | low | Reduces verifier's input-token cost (planner reasoning is unrelated to verification). Was the original justification for splitting Builder-Verifier (per Aider). |
| 9 | Add **plan-brittleness mitigation** — re-plan triggers on execution failures. Currently plan-and-execute is "brittle when plans need mid-run adaptation" per Digital Applied Team's 2026 Agent Architecture Patterns taxonomy. | MED | moderate | Recovers gracefully when a scanner hits unexpected input or a fixture moves. |
| 10 | Verify `disable-model-invocation: true` on any skill that performs destructive operations (e.g. ones that author writes to repo state). | LOW | trivial | Defense-in-depth; agentskills.io spec calls it out. Not yet known if any current docks skill warrants it. |

---

## Section A — Per-Agent Frontmatter

### A.1 Effort tiering — push wasteful `max` inheritance down to `xhigh`/`medium` (HIGH / trivial / low risk)

Public repo policy is `CLAUDE_CODE_EFFORT_LEVEL=max` (kept intentional — see `agent_optimization.md` §2.1). Subagents inherit that effort unless their frontmatter declares otherwise. **Inheritance is wasteful** on Sonnet-tier explorers and scanners that do bounded I/O work (file lists, grep, simple categorization) where `max` thinking budget is overkill.

**Recommended overrides** (set `effort:` in frontmatter, leaving model decisions untouched):

| Agent | Current model | Recommended effort | Why |
|---|---|---|---|
| `refactor-explorer.md` | sonnet | `medium` | Maps stack/tools — bounded discovery work |
| `refactor-dead-code-scanner.md` | sonnet | `xhigh` | Deeper than explorer; needs reasoning on classification |
| `refactor-duplication-scanner.md` | sonnet | `xhigh` | Same |
| `refactor-solid-analyzer.md` | sonnet | `xhigh` | Per-principle analysis; complex but bounded |
| `security-explorer.md` | sonnet | `medium` | Attack-surface mapping — discovery work |
| `security-vulnerability-scanner.md` | sonnet | **`max`** | Keep — Anthropic's 4.7 cybersecurity refusals are sensitive to effort drop |
| `security-adversarial-hunter.md` | sonnet | **`max`** | Keep — same |
| `security-logic-analyzer.md` | sonnet | `xhigh` | Logic-flaw analysis is deep but not as effort-sensitive as vuln-scanning |
| `docs-explorer.md` | sonnet | `medium` | Repo-mapping work |
| `docs-categorizer.md` | sonnet | `xhigh` | Skill-set proposal; non-trivial reasoning |
| `docs-pattern-scanner.md` | sonnet | `xhigh` | Same |
| `docs-pattern-extractor.md` | sonnet | `xhigh` | Same |
| `docs-role-mapper.md` | sonnet | `xhigh` | Same |
| `refactor-planner.md` | opus | **`max`** | Keep — synthesis tier |
| `refactor-pre-verifier.md` | opus | **`max`** | Keep — synthesis tier |
| `refactor-post-verifier.md` | opus | **`max`** | Keep |
| `security-synthesizer.md` | opus | **`max`** | Keep — synthesis tier |
| `docs-skills-builder.md` | opus | **`max`** | Keep |
| `docs-agents-builder.md` | opus | **`max`** | Keep |
| `docs-verifier.md` | opus | **`max`** | Keep |

**Rationale:** Anthropic's post-launch best-practices guide explicitly states `max` "shows diminishing returns and is more prone to overthinking" on routine work. Hex's CTO measured "low-effort Opus 4.7 ≈ medium-effort Opus 4.6"; DataCamp's benchmark found `xhigh` produced over-verbose output on routine tasks. The `public` repo accepts that on the orchestrator turn but the per-subagent overrides above are where the savings actually compound.

**Risk:** the `security-vulnerability-scanner` and `security-adversarial-hunter` keep `max` because 4.7-specific cybersecurity refusals are sensitive to effort drop (Anthropic-flagged in 4.7 release notes).

**Validation:** the existing `scripts/score-agents.sh` does NOT yet score the `effort` field. Consider adding a per-agent floor for the synthesis tier (must declare `max`) so a contributor can't accidentally drop it.

### A.2 Task budgets (beta) — partially blocked (HIGH if shippable / moderate effort)

Add `task_budget: {type: "tokens", total: 200000}` to `refactor-planner` (Phase 4) and `task_budget: {type: "tokens", total: 100000}` to `refactor-pre-verifier` (Phase 5). The model gets a running countdown and finishes gracefully — directly attacks the documented 203K/26-min concentration in the original audit's baseline.

**Blocker:** task budgets require the `task-budgets-2026-03-13` beta header on the API request. Claude Code subscription clients (Pro/Max/Team/Enterprise) cannot pass arbitrary beta headers; only direct-API or Bedrock/Vertex clients can. **Verify** whether Claude Code v2.1.123+ exposes this through the agent frontmatter `task_budget` field; if not, this is blocked until Anthropic surfaces it.

If it ships:
- Combine with `max_tokens` as hard ceiling (Anthropic spec: "the two values are independent; one is not required to be at or below the other").
- Pilot at 200K–300K and tune up; minimum recommended is 20K (too-restrictive budget → model refuses or scopes down, Anthropic-documented).

### A.3 Fork subagents — opt parallel scanners into `context: fork` (HIGH / trivial / medium risk on first launch)

`public` sets `CLAUDE_CODE_FORK_SUBAGENT=1` (see `agent_optimization.md` §2.2). That env var is a **no-op** without docks-side opt-in.

Add `context: fork` to the parallel-scanner agents that:
1. Run in parallel from a single tool-call turn (Phase 2 of `/docks:security` and `/docks:refactor`),
2. Don't need to mutate cached state.

Candidates:
- `security-vulnerability-scanner`, `security-logic-analyzer`, `security-adversarial-hunter` (Phase 2 of `/docks:security`)
- `refactor-dead-code-scanner`, `refactor-duplication-scanner`, `refactor-solid-analyzer` (Phase 2 of `/docks:refactor`)
- `docs-pattern-scanner`, `docs-categorizer` (Phase 2 of `/docks:docs`)

**Caveats from research:**
- Issue #47350: `context: fork` skills can degrade output quality when paired with non-default models on Windows. Test on Linux/macOS first.
- Fork only fires when `subagent_type` is omitted in the Agent tool call (Build-This-Now reverse-engineering); named-agent fan-outs may not trigger it. The plugin's commands invoke agents by name — **verify** that `context: fork` overrides this by reading the v2.1.117+ plugins reference.
- Forks cannot spawn further forks (documented).

**Combine with policy-island pattern:** declare `allowed_tools` at the agent level for predictable execution.

### A.4 Advisor tool retrofit (HIGH if scoped / moderate / low risk)

Wrap the `refactor-pre-verifier` API call with `advisor_20260301` configured to consult Opus 4.7 from a Sonnet executor. Anthropic's BrowseComp data: Haiku-with-Opus-advisor went from 19.7% → 41.2%. On code tasks the lift is smaller but still positive at lower cost than Opus-solo.

**Best fit:** any verifier that's currently a borderline Sonnet/Opus call. The plugin's pre-verifier and post-verifier are top candidates.

**Pilot:** run `refactor-pre-verifier` (Sonnet+Opus-advisor) vs current (Opus-solo) on the same fixture. Hypothesis: equal or better quality at 30–50% lower cost.

Note: the advisor tool is GA as of April 9, 2026. The `/advisor` slash command (Claude Code v2.1.101+) is the user-facing wrapper around the same `advisor_20260301` server tool; per-agent integration requires API-level access.

---

## Section B — Command-Body and Orchestration Patterns

### B.1 OODA framing for orchestrator commands (MED / trivial)

Anthropic's research multi-agent paper explicitly instructs the lead-research-agent on OODA loops with parallel-tool-call instructions: "leave any extensive tool calls to subagents; focus on running subagents in parallel efficiently."

The plugin's three commands (`/docks:security`, `/docks:docs`, `/docks:refactor`) are exactly this orchestrator role. Add a one-paragraph OODA framing near the top of each command body:

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
- Validate cross-scanner consistency (do all three scanners agree on file ownership?)
- Trigger an early Builder phase if all scanners agree (skip the synthesis-merge step)

Hook itself is configured in `public/ssot/.claude/settings.json` (see `agent_optimization.md` §3.3) but the consumer pattern lives here. Pilot on `/docks:security` Phase 2.

### B.5 Phase-4/5 cost concentration — additional levers beyond the existing audit

The original audit's conclusion (don't merge Builder/Verifier; sample the verifier's research-gate ~30–50K tokens) holds. Two **additional** levers:

1. **Forked subagents on the verifier** (cache-prefix sharing, see §A.3).
2. **Advisor tool on the pre-verifier** (Sonnet-executor + Opus-advisor on Phase 5, see §A.4).
3. **Partial result streaming via PostToolBatch:** if the planner emits a checklist, fire the verifier on each item as it's completed, in parallel with the planner finishing. Hard to implement, high payoff.
4. **Re-run the merge audit** after enabling §A.3 fork and §A.4 advisor — the 44% concentration may shift enough that the merge-vs-sample tradeoff changes.

---

## Section C — agentskills.io Structural Compliance

### C.1 Description bloat — push enumerations into body (HIGH / moderate)

Per `docks/CLAUDE.md`:
> "the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing"; first 100 chars matter most for matching.

Every session loads the description. Audit existing skills for `Covers X, Y, Z…` enumerations in the description that should live in the body.

The `score-skills.sh` validator already rewards ≤500 char descriptions (2 pts ≤500, 1 pt ≤1000, 0 else) and deducts for slop words (`comprehensive`, `robust`, `elegant`, `seamless`). **Verify scores haven't regressed** since the most recent additions.

Worth running `bash scripts/score-skills.sh --per-file` and looking for any skill scoring below the 8/16 floor.

### C.2 Cursor's "names + 1-line desc" listing pattern (MED / high effort)

Right now `skillListingBudgetFraction: 0.025` injects ~25 full skill descriptions into the system-prompt prefix. Cursor's January 2026 dynamic-context-discovery blog measured **46.9% MCP token reduction** by:
- Loading only `name + 1-line description` statically
- Letting the agent grep `.claude/skills/*/SKILL.md` for full content on demand

This is now the documented agentskills.io progressive-disclosure pattern. Implementation: shrink the description field to a single sentence and put trigger details in a `when_to_use` body section.

**Why MED, not HIGH:** the rewrite is high-effort (touches every skill) and breaks existing semantic match on descriptions that have grown rich for matching. Pilot with one skill first; measure prefix size and false-trigger rate before/after.

### C.3 Vendored skills — `upstream:` block discipline (kept; verify)

Third-party / vendored skills already get the `upstream:` frontmatter block (`source`, `license`, `vendored_at: "YYYY-MM-DD"`) per the kit standard. This signals validators to relax kit-specific checks while preserving universal structural ones. Working as designed; verify any new vendored skill follows it.

### C.4 `disable-model-invocation: true` for destructive operations (LOW / trivial)

agentskills.io spec calls out this field for skills that perform destructive operations. The plugin doesn't appear to ship any such skill currently (all 15 are read-mostly), so this is preemptive: if a future skill writes to repo state in non-trivial ways (file deletes, schema migrations), set the flag.

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
- `security-synthesizer` — for each finding from the three parallel scanners, re-grep the cited file:line and verify the pattern matches.
- `docs-verifier` — for each "skill X cites missing path Y" claim, verify path Y is missing.

This is the strongest signal-to-noise pattern documented anywhere as of May 2026 (Aider, Anthropic research multi-agent, Bugbot, /ultrareview all converge on it). It's also the largest Phase-5 payoff lever.

**Cost:** verifier agents take longer because they re-execute. Pair with §A.4 advisor tool to keep cost bounded.

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

2. **Fork + intra-agent parallelism (§A.3 + §B.3).** Capture `cache_read_input_tokens` on parallel-scanner children 2-N before/after enabling `context: fork`. Hypothesis: 5–10× reduction (Anthropic patch notes).

3. **Advisor tool on `refactor-pre-verifier` (§A.4).** Sonnet+Opus-advisor vs current Opus-solo on Phase 5. Hypothesis: equal quality at 30–50% lower cost.

4. **Reproduce-step on verifiers (§D.1).** Inject 10 known-false findings into the input to `refactor-post-verifier`. Hypothesis: reproduce-step drops 9–10 of them; check-only drops 0–3.

5. **/ultrareview comparison.** Run Anthropic's multi-agent reviewer fleet against `/docks:security` on the same diffs. Sub-1% false-positive rate is the bar. If `/docks:security` matches or beats it, publish; if not, study the per-finding-reproduction step and adopt it (this is §D.1 already, with measurement).

6. **Skill-listing budget (§C.2).** Measure system-prompt prefix size and cache-hit rate before/after switching one skill to "names + 1-line desc, body fetched on demand." Decide whether to roll out to all 15.

7. **Phase-4/5 merge audit, redux.** Re-run the original audit's merge-vs-sample analysis *after* §A.3 (fork) and §A.4 (advisor) land. The 44% concentration may shift enough that the tradeoff changes.

8. **Plan-brittleness (§D.2).** Inject a deliberate mid-run failure (delete a file the planner expects) and measure whether the orchestrator re-plans gracefully. Anthropic 2026 Architecture Patterns lists this as the #1 plan-and-execute failure mode.

9. **Description-bloat sweep (§C.1).** Run `bash scripts/score-skills.sh --per-file` and `bash scripts/score-agents.sh --per-file`. Any score below the floor → trim to ≤500 chars and re-run.

10. **Adaptive thinking vs explicit budgeting on Phase 4.** If task budgets become reachable from Claude Code (§A.2), run `xhigh + adaptive` vs `xhigh + task_budget=200000` on `refactor-planner`. Hypothesis: task budget is more predictable on long phases without quality loss.

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

5. **Author-side validators** (`guard/score` scripts in `scripts/`) — CI-quality gate on the kit itself, mirroring Anthropic's Skilljar plugin-eval framework (LLM judge + Elo). Not common in community kits. The count-derived total floors (`artifact_count × per-file_floor`) automatically scale with growth — a clean design.

6. **Plan-file-as-IPC** — matches OpenHands' state/event-stream architecture (arXiv:2407.16741), Cursor's January 2026 "files as the primary interface" (46.9% token reduction), claudefa.st Code Kit's `claude-progress.txt` substrate, and Anthropic's research multi-agent memory pattern.

7. **20-agent count is conservative** vs the community (wshobson/agents ships 185 across 80 plugins). The original audit's "41 agents" figure appears to have conflated the plugin with the broader installed-skill landscape — actual plugin count is `ls plugins/docks/agents/*.md | wc -l = 20`.

8. **Marketplace + plugin in one repo, double-layered release gating.** Local `ci.sh` catches stage issues fast; GitHub-side `tag-CI` is the authoritative gate before `gh release create`. Two layers because each catches different failure modes.

9. **Plugin namespace** (`docks:fix`, `docks:security-vulnerability-scanner`) — clean and avoids collision with user agents.

10. **Body sweet-spot rule (80–310 lines)** in `docks/CLAUDE.md` matches Anthropic's auto-compaction reattachment behavior (first 5,000 tokens of each invoked skill, 25K shared budget). Engineering-grade authoring guidance.

---

## Section G — Caveats

- **Source weighting:** where Anthropic's official docs and a community blogger disagree, both views are reported. The plugin's per-phase model tiering and Builder-Verifier patterns are *empirically* validated (Anthropic research blog, Aider benchmarks); the advisor tool and reproduce-step are newer and have less independent corroboration.

- **Task budgets blocked:** `task-budgets-2026-03-13` requires beta header on the API request. Claude Code subscription clients cannot pass arbitrary beta headers; verify whether v2.1.123+ surfaces it through agent frontmatter before assuming §A.2 is actionable.

- **Agent count:** the original audit's "41 agents" appears stale or counts something other than `plugins/docks/agents/*.md` (which is 20 as of 2026-05). The Augment Code coordination-overhead concern still applies to any specialization/orchestration tradeoff but is moot at 20.

- **Issue #47350** (`context: fork` model degradation on Windows) is OPEN. If the kit ships forks before that closes, document the platform caveat.

- **Cursor "files-not-tools" 46.9% reduction** is measured on Cursor's MCP-heavy workload, not Claude Code's plugin/skill workload. Magnitude on the docks plugin is workload-dependent — pilot before rolling out (§E.6).

- **Advisor tool benchmarks** (BrowseComp, SWE-bench Multilingual) come from Anthropic's own publication. Independent corroboration is limited as of May 2026.

- **`/ultrareview` sub-1% false-positive rate** comes from Anthropic internal data; no external reproduction yet. Treat as the bar to aim for, not a proven benchmark.

- **Empirical numbers** (10×, 30%, 90.2%, etc.) are derived from cited sources; on the plugin's specific workload, expect variance. §E is the way to confirm.

---

## Cross-references

- Consumer-side optimizations (`ssot/.claude/settings.json` env vars, hooks, status line, sync, global `~/.claude/CLAUDE.md` heuristics, RTK, plugin selection): see `docs/roadmap/planned/optimization-audit-may-2026.md` in the [DocksDocks/public](https://github.com/DocksDocks/public) repo.
