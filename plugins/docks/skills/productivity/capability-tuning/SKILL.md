---
name: capability-tuning
description: "Use when tuning Claude Code or Codex for maximum model capability — choosing model (fable/best, gpt-5.6-sol), effort (effortLevel / model_reasoning_effort xhigh), thinking toggles, 1M context, web_search, sandbox network access, subagent model pinning, AGENTS.md/CLAUDE.md size budgets, or compaction triggers. Grounded in context engineering (Karpathy's method). Not for authoring skills (write-skill) or multi-tool repo layout (multi-tool-bridge)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-09"
  content_hash: "ab7b747f54a22492271085705e0efbbb52602894b1baddff7fac4af88bf9bc99"
---

# Capability Tuning (Claude Code + Codex)

Most setups run below the model's ceiling: defaults pick a mid-tier model, mid effort, capped context, and instruction files that either starve the model or drown it. This skill is the checklist for the opposite posture — "I don't care about token spend, give me the best the harness can do" — for both Claude Code and Codex, plus the context-engineering rules that make the extra capability actually land. Facts verified against live docs and the openai/codex source on 2026-07-05.

<constraint>
Config keys drift fast in both harnesses. Before writing a settings.json or config.toml key you have not verified THIS session, check the live reference (code.claude.com/docs/en/settings + /model-config; developers.openai.com/codex/config-reference) — a key that worked in early 2026 may be renamed, deprecated, or session-only today. Never invent keys from memory.
</constraint>

<constraint>
Capability tuning never silently removes safety rails. `danger-full-access`, `approval_policy = "never"`, and `bypassPermissions` are real capability levers ONLY in throwaway sandboxes — present them as an explicit user opt-in with the risk named, never as part of a default "max" recommendation.
</constraint>

<constraint>
More instructions ≠ more capability. Context engineering is "filling the context window with just the right information for the next step" (Karpathy) — too much or too-irrelevant context measurably degrades output and adherence. Every line added to an always-loaded instruction file must pass: "would removing this cause the agent to make mistakes?" If not, cut it or move it to a lazily-loaded scope.
</constraint>

## Lever map — same intent, two harnesses

| Capability lever | Claude Code | Codex |
|---|---|---|
| Frontier model | `"model": "fable"` (or `"best"` alias) | `model = "gpt-5.6-sol"` |
| Effort ceiling | `"effortLevel": "xhigh"` (`max` persists via `CLAUDE_CODE_EFFORT_LEVEL` env; `ultracode` via `/effort`) | `model_reasoning_effort = "xhigh"` (no level above it; Claude `max` maps to `xhigh`) |
| Thinking | `"alwaysThinkingEnabled": true` (effort is the real control on adaptive models) | covered by reasoning effort |
| Long context | Fable 5 / Opus 4.8 / Sonnet 5 are 1M-by-default on the API; `opus[1m]` alias for plans | window auto-resolved from model catalog |
| Web research | WebSearch/WebFetch tools | `web_search = "live"` + `[tools.web_search] context_size = "high"` |
| Unblocked sandbox work | `permissions.allow` list for known-safe commands | `sandbox_mode = "workspace-write"` + `network_access = true` |
| Subagent quality | leave `CLAUDE_CODE_SUBAGENT_MODEL` unset/`inherit` so per-agent `model:` is honored | per-agent TOML files in `~/.codex/agents/` / `.codex/agents/`; mini model only on grunt roles |
| Second opinion | `"advisorModel": "opus"` | spawn a reviewer role agent |
| Instruction budget | root CLAUDE.md < 200 lines; lazy `.claude/rules/` with `paths:` | raise `project_doc_max_bytes` (default 32 KiB — no longer documented, re-verify; truncates silently) |
| Long-task headroom | `BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS` env | `tool_output_token_limit`, `model_auto_compact_token_limit` |

## Claude Code — capability template

`~/.claude/settings.json` (project scope `.claude/settings.json` wins over user; local > project > user):

```json
{
  "model": "fable",
  "fallbackModel": ["opus", "sonnet"],
  "effortLevel": "xhigh",
  "alwaysThinkingEnabled": true,
  "showThinkingSummaries": true,
  "advisorModel": "opus",
  "autoMemoryEnabled": true,
  "skillListingBudgetFraction": 0.02,
  "env": {
    "BASH_DEFAULT_TIMEOUT_MS": "300000",
    "BASH_MAX_TIMEOUT_MS": "600000",
    "MAX_MCP_OUTPUT_TOKENS": "50000"
  },
  "permissions": {
    "allow": ["Bash(npm run lint)", "Bash(npm run test *)"],
    "deny": ["Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)"]
  }
}
```

Key facts (full key-by-key table: `references/claude-code-config.md`):

- `"fable"` is NOT the default on any plan — it must be opted into (`/model fable`, the setting, or `"best"` = Fable 5 where available, else latest Opus).
- Settings accept `effortLevel` up to `xhigh`; `max` ("no constraint on token spending", overthinking-prone) persists via the `CLAUDE_CODE_EFFORT_LEVEL` env var; `ultracode` (xhigh + dynamic-workflow orchestration) is reachable only via `/effort` or `--settings '{"ultracode":true}'` — not `--effort`/env.
- Effort replaced thinking budgets: Opus 4.7+/4.8 and Fable 5 are adaptive-only — the `MAX_THINKING_TOKENS` budget is dead on them. Nuance: `MAX_THINKING_TOKENS=0` still works as a thinking kill-switch on the API for Opus 4.7/4.8/Sonnet 5; thinking cannot be disabled on Fable 5 at all.
- Only the literal keyword `ultrathink` still triggers deeper one-off reasoning — "think hard" is plain text now.
- `/fast` (research preview) serves the same Opus weights ~2.5× faster at premium pricing — speed lever, not a quality downgrade. Opus 4.8 only now (Opus 4.7 deprecated 2026-06-25, removed 2026-07-24).
- `MAX_MCP_OUTPUT_TOKENS` (in the template above) is absent from the current env-vars doc — re-verify at code.claude.com/docs/en/env-vars before leaning on it.

## Codex — capability template

`~/.codex/config.toml`:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "xhigh"
plan_mode_reasoning_effort = "xhigh"
model_reasoning_summary = "detailed"
web_search = "live"

approval_policy = "on-request"
sandbox_mode = "workspace-write"
[sandbox_workspace_write]
network_access = true

[tools.web_search]
context_size = "high"

project_doc_max_bytes = 131072

[agents]
max_depth = 1
```

Profiles are overlay files, not `[profiles.*]` tables: `codex --profile <name>` loads `~/.codex/config.toml`, then `~/.codex/<name>.config.toml` on top.

```toml
# ~/.codex/max.config.toml — overlaid by `codex --profile max`
model = "gpt-5.6-sol"
model_reasoning_effort = "xhigh"
web_search = "live"
```

```toml
# ~/.codex/cheap-subagent.config.toml — overlaid by `codex --profile cheap-subagent`
model = "gpt-5.4-mini"
model_reasoning_effort = "medium"
```

Key facts (full table: `references/codex-config.md`):

- The `-codex` model line ended at gpt-5.3-codex — mainline gpt-5.4+ absorbed it. `gpt-5.6-sol` is the current frontier (family: `gpt-5.6-sol`/`gpt-5.6-terra`/`gpt-5.6-luna`; `gpt-5.5` is previous-gen); there is no `-codex` variant.
- `model_reasoning_effort` accepts `minimal|low|medium|high|xhigh` — `none` is no longer in this set; it survives only on `plan_mode_reasoning_effort`. `xhigh` is the config ceiling (model-dependent — not every model exposes it); Codex's own migration tooling maps Claude's `max` effort to `xhigh`. The models page lists product-side `Max` (settings-gated) and `Ultra` (subagent mode) levels above it — not valid config.toml values as of 2026-07-09; re-verify before pinning.
- Web search is on by default in `cached` mode; `"live"` forces fresh results. The old `tools.web_search = true` boolean is deprecated.
- `project_doc_max_bytes` (default 32 KiB — the default is no longer documented; re-verify at developers.openai.com/codex/config-reference) caps ALL merged AGENTS.md content and truncates silently — a rich instruction tree loses its tail with no warning. Raise it.
- Skills load from `.agents/skills/` (repo) and `~/.agents/skills/` (user); `~/.codex/skills` is deprecated.

## Instruction files — where capability is won or lost

```text
BAD  — one 600-line root CLAUDE.md/AGENTS.md: style guide + API docs +
       per-folder conventions + "CRITICAL: YOU MUST ..." emphasis.
       Always loaded, half-ignored ("bloated CLAUDE.md files cause
       Claude to ignore your actual instructions"), overtriggers on
       4.6+ models, silently truncated at 32 KiB by Codex.

GOOD — root file < 200 lines: commands the agent can't guess, deviations
       from defaults, repo etiquette. Per-area detail in lazily-loaded
       scopes: nested AGENTS.md per directory (Codex merges root→cwd;
       Claude Code descends CLAUDE.md / @AGENTS.md imports), or
       .claude/rules/*.md with paths: globs that load only when a
       matching file is read. Plain phrasing — current models follow
       it literally without the shouting.
```

Cross-model phrasing rules (verified against the model prompting guides):

| Model behavior | Rule for your instruction files |
|---|---|
| Opus 4.8 follows instructions literally, won't silently generalize | State scope explicitly ("in every handler under src/api/") instead of expecting generalization |
| Fable 5 generalizes more; over-prescriptive skills degrade its output | Prefer goals + constraints over step-by-step micro-instructions |
| 4.6+ overtriggers on MUST/CRITICAL emphasis | Write "Use X when Y", delete "If in doubt, use X" |
| Codex models stop prematurely when told to present upfront plans | Don't demand plan-first preambles in AGENTS.md for Codex |
| CLAUDE.md arrives as a user message, not system prompt | It's advisory — enforce must-happen with hooks, must-not-happen with `permissions.deny` |

## The Karpathy layer — workflow, not just config

| Principle (verified source) | Mechanization |
|---|---|
| "Give it your hardest problems" — route by difficulty | Frontier model + top effort as the default; escalate a thrashing task to the strongest reasoning model in the *other* ecosystem, then feed the answer back |
| Declarative > imperative: "give it success criteria and watch it go" | Define done as a runnable check (tests, build, a scored metric); Claude Code `/goal` holds the condition across turns |
| Agents "make wrong assumptions … don't push back" | Instruction-file rules: state assumptions before coding, surface inconsistencies, surgical diffs only |
| Review is the bottleneck, generation is free | Keep diffs in head-sized chunks; spend the saved tokens on adversarial review passes, not longer outputs |
| Ride the LLM cycle — leaderboards lie | Rotate dailies, A/B the same task across models; council pattern (parallel answers, cross-rank, synthesize) for high-stakes calls |
| Prompts/skills are the new source code | Version instruction files and skills in git; review their diffs like code |
| File-based memory, "file over app" | Markdown notes/wiki the agent maintains; Claude auto memory on, Codex `memories` feature experimental |

## Gotchas

| Gotcha | Reality |
|---|---|
| "Set MAX_THINKING_TOKENS high for more thinking" | Budget semantics dead on Opus 4.7+/Fable 5 — adaptive only; effort is the control. `=0` still kill-switches thinking on Opus 4.7/4.8/Sonnet 5 (not Fable 5) |
| "Claude Code reads AGENTS.md natively" | It reads CLAUDE.md only; `@AGENTS.md` import or symlink is the documented bridge |
| "Codex trims the skills catalog tail-first at 8,000 chars" | Budget is 2% of the context window in tokens (8,000 chars only when the window is unknown); descriptions truncate EVENLY first, but Codex may still omit skills from the initial list with a warning |
| "Nested instruction files always survive compaction" | Root CLAUDE.md + unscoped rules re-inject after compaction; nested CLAUDE.md and `paths:`-scoped rules are lost until a matching file is read again |
| "opusplan's plan phase is stuck at 200K" | Reversed: the plan phase uses the Opus model's window — it gets the 1M upgrade; `opusplan[1m]` exists to force it |
| "[1m] works on every model string" | Documented aliases are `opus[1m]` / `sonnet[1m]`; Fable 5, Opus 4.8/4.7, and Sonnet 5 are already 1M-by-default on the API — Sonnet 5 is always-1M (no `[1m]` suffix, no usage credits, auto-compacts ~967K), so `sonnet[1m]` is a no-op |
| "Subagents default to a cheap model" | Custom subagents default to `inherit`; since v2.1.198 the built-in Explore agent inherits the conversation model (capped at Opus) — a custom `Explore` agent with `model: haiku` restores the old pin |

## Verification loop

1. Claude Code: `/doctor` (skill budget overflow, config errors), `/context` (window breakdown), `/model` + `/effort` (confirm active model and effort).
2. Codex: `codex --profile max` then check the TUI status line shows the intended model + effort; confirm AGENTS.md isn't truncated (total bytes vs `project_doc_max_bytes`).
3. Run one hard, previously-thrashed task as an A/B against the old config — capability tuning should show up as fewer turns and less hand-holding, not just bigger bills.

## References

- `references/claude-code-config.md` — key-by-key settings.json + env table with doc citations
- `references/codex-config.md` — key-by-key config.toml table with source citations
- Live docs: code.claude.com/docs/en/settings · code.claude.com/docs/en/model-config · developers.openai.com/codex/config-reference · agents.md
- Karpathy primary sources: context-engineering post (x.com/karpathy/status/1937902205765607626), agent-coding inflection thread (status/2015883857489522876), autoresearch + llm-council repos
