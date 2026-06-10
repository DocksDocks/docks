# Claude Code — capability key reference (verified 2026-06-10)

Sources: code.claude.com/docs/en/{settings, model-config, memory, fast-mode, skills, sub-agents, env-vars, context-window}. Scope precedence (high → low): managed policy → CLI args → `.claude/settings.local.json` → `.claude/settings.json` (project) → `~/.claude/settings.json` (user).

## Model & effort

| Key | Effect |
|---|---|
| `model` | `"fable"` = Claude Fable 5, the most capable model — opt-in only, never a default. `"best"` = Fable 5 where the org has access, else latest Opus. `"opus"` → Opus 4.8, `"sonnet"` → Sonnet 4.6. Pin exact versions with full IDs or `ANTHROPIC_DEFAULT_{FABLE,OPUS,SONNET,HAIKU}_MODEL` env vars (`ANTHROPIC_SMALL_FAST_MODEL` is deprecated). |
| `fallbackModel` | Availability-fallback chain (array, max 3, applies to the current turn). Distinct from Fable 5's content-based safety fallback to Opus 4.8. |
| `effortLevel` | Persists effort: `low`/`medium`/`high`/`xhigh`. Defaults: `high` on Fable 5/Opus 4.8/4.6/Sonnet 4.6, `xhigh` on Opus 4.7. `max` and `ultracode` are session-only (`/effort`, `--effort`). Precedence: `CLAUDE_CODE_EFFORT_LEVEL` env > setting > model default; skill/subagent `effort:` frontmatter overrides session, not env. |
| `alwaysThinkingEnabled` | Thinking on by default. On adaptive models effort is the depth control; thinking cannot be disabled on Fable 5 at all. |
| `showThinkingSummaries` | Expanded thinking summaries in interactive sessions (`Ctrl+O`). Display-only. |
| `advisorModel` | Model for the server-side advisor tool (second-opinion consult mid-task): `opus`/`sonnet`/`fable` or full ID. |
| 1M context | Fable 5 / Opus 4.8 / 4.7 run the 1M window by default on the Anthropic API (no premium past 200K). Aliases `opus[1m]` / `sonnet[1m]`; suffix appends to full model names. `opusplan`'s plan phase stays capped at 200K. Kill-switch: `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`. |
| `fastMode` / `/fast` | Research preview: same Opus weights ~2.5× faster, premium pricing, identical quality. Opus-only (not Sonnet/Haiku/Fable). Enable at session start — mid-session enable re-pays uncached input. |

## Subagents & memory

| Key | Effect |
|---|---|
| `CLAUDE_CODE_SUBAGENT_MODEL` (env) | Forces ONE model on all subagents — outranks per-invocation params and agent frontmatter. For max capability leave unset or `inherit` so a `model: opus` reviewer is honored. |
| `autoMemoryEnabled` | Default true. Agent-maintained `MEMORY.md` + topic files per project; first 200 lines / 25 KB load each session; audit with `/memory`. |
| Subagent `memory:` frontmatter | `user`/`project`/`local` — persistent per-agent memory directories. |

## Instruction-file & skill budgets

| Key | Effect |
|---|---|
| Root CLAUDE.md | Target < 200 lines ("longer files consume more context and reduce adherence"). Delivered as a user message — advisory, not system-prompt-enforced. |
| `.claude/rules/*.md` | First-class rules; with `paths:` frontmatter globs they load only when a matching file is read (the documented way to shrink the always-loaded root). Without `paths:` they load at launch. |
| `@imports` | `@path/file` in CLAUDE.md, max 4 hops, loaded at launch (imports do NOT defer cost). `@AGENTS.md` is the documented bridge — Claude Code does not read AGENTS.md natively. |
| `skillListingBudgetFraction` | Share of context for the skill listing (default 0.01; raise to 0.02 with many skills). `maxSkillDescriptionChars` default 1536. Overflow diagnosis: `/doctor`. |
| `skillOverrides` | Per skill: `"on"`/`"name-only"`/`"user-invocable-only"`/`"off"`. |
| Compaction survival | Root CLAUDE.md, unscoped rules, and auto memory re-inject after compaction; nested CLAUDE.md and `paths:`-scoped rules are lost until re-triggered. Invoked skill bodies re-attach at ≤ 5,000 tokens each inside a 25,000-token shared budget, most-recent-first. |
| Compaction tuning (env) | `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (default ≈95%, can only be lowered), `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (token capacity used for the trigger math). |

## Execution headroom

| Key | Effect |
|---|---|
| `BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS` | Default 2 min / ceiling 10 min — raise for long builds and test suites. |
| `MAX_MCP_OUTPUT_TOKENS` | Caps MCP tool output entering context. |
| `permissions.allow` | Pre-approve known-safe commands (`Bash(npm run test *)`) so capability isn't lost to prompt-fatigue denials; pair with `deny` for secrets (`Read(./.env)`). |
| `hooks` | Enforcement layer for must-happen behavior (CLAUDE.md can't guarantee compliance). `Stop` hooks gate turn-end; `/goal` re-checks a success condition every turn. |
