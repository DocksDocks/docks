# Codex — capability key reference (verified 2026-06-10)

Sources: openai/codex source @ main (config_toml.rs, profile_toml.rs, openai_models.rs, agents_md.rs, core-skills/loader.rs + render.rs) cross-checked with developers.openai.com/codex/{config-reference, models, subagents, skills, guides/agents-md}. The old GitHub `docs/config.md` is a stub — the live config-reference pages are canonical.

## Model & effort

| Key | Effect |
|---|---|
| `model` | `"gpt-5.5"` is the current frontier and recommended default. The `-codex` checkpoint line ended at `gpt-5.3-codex` (merged into mainline at 5.4) — there is no gpt-5.4/5.5-codex. `gpt-5.4-mini` = cheap/fast tier; `gpt-5.3-codex-spark` = near-instant research preview. |
| `model_reasoning_effort` | `"none"`/`"minimal"`/`"low"`/`"medium"`/`"high"`/`"xhigh"` (`none` is the newer no-reasoning mode; both minimal and none remain valid). `xhigh` is the ceiling — nothing above it exists; Codex's external-agent migration maps Claude `max` → `xhigh`. |
| `plan_mode_reasoning_effort` | Separate effort for plan/collaboration mode. |
| `model_reasoning_summary` | `"auto"`/`"concise"`/`"detailed"`/`"none"`. |
| `model_verbosity` | `"low"`/`"medium"`/`"high"` (GPT-5-family final-text verbosity). |
| `service_tier` | `"fast"`/`"flex"` paid speed tiers, where the plan exposes them. |
| Model catalog | Hardcoded CLI model presets were removed — listings come from the server-side catalog (`model_catalog_json` to override). Don't trust early-2026 preset lists. |

## Sandbox, approvals, web

| Key | Effect |
|---|---|
| `sandbox_mode` | `"read-only"` / `"workspace-write"` / `"danger-full-access"`. Daily-driver capability posture: `workspace-write` + escalation, not full access. |
| `[sandbox_workspace_write] network_access = true` | The biggest single in-sandbox unlock: installs, curls, package fetches run un-prompted. |
| `approval_policy` | `"untrusted"`/`"on-failure"`/`"on-request"`/`"never"`. `--full-auto` = workspace-write + on-failure. `never` + full-access only in throwaway sandboxes — explicit opt-in. |
| `default_permissions` | Named permission profiles; built-ins `":read-only"`, `":workspace"`, `":danger-full-access"`. |
| `web_search` | Top-level `"disabled"`/`"cached"`/`"live"` — on by default (cached); `"live"` = fresh results. The boolean `tools.web_search = true` form is deprecated. Options: `[tools.web_search] context_size = "low"|"medium"|"high"`, optional `allowed_domains`. |

## Subagents

| Key | Effect |
|---|---|
| `[agents] max_depth` | Nesting depth, root = 0, default 1 — one level of dispatch works out of the box; deeper fan-out is a deliberate (costly) opt-in. |
| `[agents] max_threads` | Concurrent agent-thread cap (docs cite default 6). |
| `[agents.roles.<name>]` | Custom roles over the built-ins `default`/`worker`/`explorer`; a role's config file may set `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`. Project agents: `.codex/agents/*.toml`. |
| `[profiles.<name>]` | Bundled presets switched with `codex --profile <name>`; a `max` profile (gpt-5.5 + xhigh + live search) and a `cheap-subagent` profile (gpt-5.4-mini + medium) cover both ends. |

## Instruction files (AGENTS.md)

| Fact | Detail |
|---|---|
| Discovery | Global `~/.codex/AGENTS.md` (`AGENTS.override.md` wins) + one file per directory from project root down to cwd (`AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames`), concatenated in that order. Deeper files effectively override earlier ones; directories below cwd are not scanned. |
| `project_doc_max_bytes` | Default 32768 (32 KiB) across ALL merged project docs — overflow is truncated silently. Raise it (e.g. 131072) for rich instruction trees; `0` disables project docs. |
| `project_doc_fallback_filenames` | e.g. `["CLAUDE.md"]` — lets Codex read a Claude-first repo without duplication. |
| Injection | Merged content arrives as a user-role message before the prompt — advisory, like Claude's CLAUDE.md. |
| Style warning | The Codex prompting guide says NOT to demand upfront plans/preambles in instruction files — that causes premature stops on codex models; anti-over-engineering is already trained in. |

## Skills & plugins

| Fact | Detail |
|---|---|
| Skill roots | `.agents/skills/` per directory cwd→root (repo) and `~/.agents/skills/` (user). `~/.codex/skills` is deprecated but still scanned. |
| Caps | name ≤ 64 chars, description ≤ 1024 chars (also `short_description` and `interface.default_prompt`). |
| Catalog budget | 2% of the model context window in tokens (`SKILL_METADATA_CONTEXT_WINDOW_PERCENT = 2`); 8,000 chars only as a fallback when the window is unknown. Under pressure descriptions truncate EVENLY so every skill stays listed (priority System > Admin > Repo > User) — front-load the first ~100 chars of every description. |
| Plugin manifests | Codex discovers `.codex-plugin/plugin.json` AND `.claude-plugin/plugin.json` natively (`DISCOVERABLE_PLUGIN_MANIFEST_PATHS`). Marketplaces: `~/.agents/plugins/marketplace.json` (personal), `<root>/.agents/plugins/marketplace.json` (repo). |

## Context & compaction

| Key | Effect |
|---|---|
| `model_auto_compact_token_limit` (+ `_scope`) | Override the auto-compaction trigger (`"total"` or `"body_after_prefix"`). |
| `tool_output_token_limit` | Per-tool-call output budget — raise for log-heavy work. |
| `compact_prompt` | Custom compaction prompt (file variant: `experimental_compact_prompt_file`). |
| `[history] persistence` | `"save-all"` (default) / `"none"`. |
