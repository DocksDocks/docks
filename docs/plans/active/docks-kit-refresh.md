---
title: docks kit refresh — fix the 26-skill staleness audit findings, routing clauses, release
goal: Apply every finding from the 2026-07-05 six-auditor sweep of plugins/docks/skills (external drift, v1-plans residue, broken snippets, routing gaps, structural nits), keep codex-facts.mjs in lockstep, and ship a docks minor.
status: ongoing
created: "2026-07-05T18:10:32-03:00"
updated: "2026-07-05T19:17:07-03:00"
started_at: "2026-07-05T18:31:55-03:00"
assignee: claude
tags: [docks, audit, staleness, skills, refresh]
affected_paths:
  - plugins/docks/skills/
  - plugins/docks/skills/AGENTS.md
  - scripts/skills/codex-facts.mjs
  - .claude-plugin/marketplace.json
related_plans: [effect-kit-upgrade-review]
review_status: null
planned_at_commit: "2e5ae8d6e0e0a74b4fb0e0cd90f3c4f2ac52cc0d"
---

# docks kit refresh — fix the 26-skill staleness audit findings, routing clauses, release

## Goal

On 2026-07-05 a six-auditor sweep read all 26 docks skills (4,352 body lines + 72 references) against the current repo state and live external docs. Verdict: no merge candidates, one removal candidate (`caveman`), 10 skills needing refresh, 2 urgent items (code-review's v1-plans glob; capability-tuning's 9 drifted external facts, one of which `scripts/skills/codex-facts.mjs` mechanically pins). The user approved fixing **everything noted**. This plan applies all of it — content fixes, routing clauses, structural relocations — and releases docks minor. The full finding→fix map is in `## Notes` (the executor's worklist; every row carries file:line + the exact fix).

## Context & rationale

- **User decision (2026-07-05, verbatim):** "yes i approve everything, include the substantial fixes as well in the plan, everything noted is important."
- **OQ answers (user via picker, 2026-07-05):** caveman → **remove entirely** · coverage gaps → **"create a separate plan for both"** (verbatim custom answer; commit-discipline + a11y live in [[docks-skill-gaps]], NOT in this plan) · release → **ship docks minor** on green · start → immediately.
- **Why one plan:** the findings interlock — codex-facts.mjs pins facts in two skills, so guard + docs must move in one commit (step 1); OWASP renumber spans two skills' twin catalogs; routing clauses must land together so the near-miss re-run is meaningful.
- **Audit provenance:** all findings were produced this session by six fresh-context auditors that read every file and verified external claims against live docs (sources in `## Sources`). Claim classes: stale-internal (repo moved), stale-external/drifted (world moved, with the current truth captured in `## Notes`), stale-snippet (broken as written), uncued-volatile (fact fine today, no re-verify cue).
- **Vendored-skill protocol (decided, minor):** `make-interfaces-feel-better` is vendored (upstream jakubkrehel, body verbatim per root AGENTS.md). Its confirmed-broken easing snippet gets a **local patch + a `patches:` note appended to the upstream block** documenting the deviation — silent divergence and leaving a broken snippet are both worse. `caveman` (vendored, mattpocock) is handled by OQ-1.
- **Baselines (scorer, captured 2026-07-05 at `2e5ae8d`):** all 26 skills score 16/16 except `productivity/caveman` 12 and `productivity/skill-agent-pipeline` 15. Floors: engineering 10, productivity 8 per file. Acceptance = no file drops below its captured baseline (caveman's baseline is void if OQ-1 = remove).
- **Not in scope by prior decision:** `docks:tdd-workflow`'s migration-exclusion clause was already identified in the effect-kit round; it lands here (step 4) — recorded so the effect-kit plan's follow-up is closed by this plan.

## Environment & how-to-run

Node 24 + pnpm via corepack (`corepack enable && pnpm install --frozen-lockfile`, already done). Gates: full `node scripts/ci.mjs` (exit 0 required before every commit) · scorer `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/docks/skills` · hash sync after ANY content edit: `node scripts/skills/content-hash.mjs --backfill plugins/docks/skills` · collision matrix on description edits: `node tests/skill-trigger-collision.mjs plugins/docks/skills` (repo-root `tests/`; takes a skills-dir positional — the form ci.mjs uses) · release (step 9, OQ-3-gated): `node scripts/release.mjs --plugin docks minor` (bumps 3 manifests in lockstep, pushes, tags `docks--vX.Y.Z`, waits tag-CI, creates the GitHub Release; `--dry-run` first). Every touched SKILL.md gets `metadata.updated: "2026-07-05"` (or the execution date).

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | **Codex-facts lockstep commit** — capability-tuning's 9 drifted facts + 4 nuances + cue pass; `codex-facts.mjs` drops `none` from the required `model_reasoning_effort` set (re-scope to `plan_mode_reasoning_effort`) and extends its scan to capability-tuning's codex reference; skill-agent-pipeline's pinned codex reference fixed (effort set, model example, Sources line); skills/AGENTS.md "no skill is dropped" fact softened. ONE commit — guard and docs move together or CI breaks | plugins/docks/skills/productivity/capability-tuning/{SKILL.md,references/claude-code-config.md,references/codex-config.md} · scripts/skills/codex-facts.mjs · plugins/docks/skills/productivity/skill-agent-pipeline/references/codex-agents-builder.md · plugins/docks/skills/AGENTS.md | — | done |
| 2 | **v1-plans glob + OWASP 2025** — code-review's spec-source glob → plans-v2 paths (×2), slash-command wording, "Current Opus" cue, Step-5 tier boundary (inline apply only single-file/low-blast; else hand findings to fix-workflow); OWASP Top 10:2025 renumber in BOTH twin catalogs + twin-pointer maintenance notes; synthesizer's csurf example replaced | plugins/docks/skills/engineering/code-review/{SKILL.md,references/security.md} · plugins/docks/skills/engineering/security/references/{vulnerability-scanner.md,synthesizer.md} | — | done |
| 3 | **Engineering externals batch** — dead commands (pipenv/safety), golangci v2 schema, Vitest forks default, solid's non-compiling LazyLock snippet + 404 upstream links, Radix URL, Slot types-19 note, `ssr:false` constraint note, Rust-book URL, MIFB easing local patch (+ upstream-block note per Context) | plugins/docks/skills/engineering/{dep-vuln-workflow,lint-no-suppressions,test-coverage,solid,react-component-patterns,type-safety-discipline,make-interfaces-feel-better}/… (exact file:line rows in `## Notes` §3) | — | done |
| 4 | **tdd-workflow refresh** — description → the 487-char rewrite in `## Notes` §4 (adds migration exclusion + keeps ≤500); reword the refactoring-safety-net bullet to route to test-coverage; add version bound/probe cue to the "0 tests run" claim; cue the Cursor link | plugins/docks/skills/engineering/tdd-workflow/SKILL.md | — | done |
| 5 | **Authoring/meta batch** — write-skill phantom category + dead pointer; skill-agent-pipeline "on Claude" leftovers + phase-numbering footnote; multi-tool-bridge classification-reference verification rewrite (per-section presence primary, byte-% demoted) + TOML-porting pointer; skill-maintenance codex CLI cues; context-tree node-list refresh + re-derive cue; plan-init Codex-TOML relocation to references/ + template-divergence note; scaffold spec-schema disclaimer; fix-workflow phase→step renumber + wording nits; zoom-out consumer-path phrasing; the 3 structural twin/sync notes (SOLID-rubric twin, TS class-gate ×3 twins, hill-climb-params ×4 sync-rule extension in plugins/docks/skills/AGENTS.md) | files per `## Notes` §5 + "Structural drift surfaces" | — | done |
| 6 | **Routing clauses** — 5 mutual/one-sided "Not for…" description edits (skill-agent-pipeline↔skill-maintenance, multi-tool-bridge↔context-tree, design-tokenization→MIFB); verify each stays ≤500 chars (count with `node -e`); re-run the 5 near-miss prompts from `## Notes` §6 — all must route unambiguously; collision matrix green | the 5 SKILL.md frontmatter descriptions | 1-5 | done |
| 7 | **caveman removal (OQ answered: remove)** — `git rm -r` the skill dir; collision/scorer floors are count-derived and self-adjust; verify no dangling references (`grep -rn caveman plugins/docks .claude-plugin` → only historical plan/finished mentions allowed) | plugins/docks/skills/productivity/caveman/ | 6 | planned |
| 8 | **Coverage-gap skills (OQ answered: separate plan)** — N/A here; both skills (commit-discipline + a11y) are scoped in [[docks-skill-gaps]] (`docs/plans/active/docks-skill-gaps.md`), scaffolded alongside this plan | — | — | skipped |
| 9 | **Gates + release** — `metadata.updated` bumps verified on every touched skill; hash backfill; scorer ≥ baseline per file (Context table); full `node scripts/ci.mjs` exit 0; release docks minor per OQ-3 (`--dry-run` first) | manifests via release.mjs | 1-8 | planned |

## Interfaces & data shapes

- **codex-facts.mjs pin contract** (`scripts/skills/codex-facts.mjs`): scans named reference files for required fact tokens; today it requires `"none"` in the `model_reasoning_effort` value set (lines ~30-31) and scans only `skill-agent-pipeline/references/codex-agents-builder.md` (line ~10). Step 1 changes BOTH sides in one commit: docs list `minimal|low|medium|high|xhigh` (with `none` re-scoped to `plan_mode_reasoning_effort`), guard requires exactly that; add capability-tuning's `references/codex-config.md` to the scan list.
- **Description constraints** (steps 4, 6, 7): must start `Use when`, contain a "Not …" clause, ≤1024 hard / ≤500 for full scorer credit; verify length with `node -e 'console.log("<desc>".length)'` before writing.
- **Vendored upstream block shape** (step 3, MIFB): frontmatter `upstream:` gains a `patches:` list entry — one line per local deviation with date + reason (e.g. `- "2026-07-05: animations.md easing string → ease-[cubic-bezier(...)] — upstream snippet emits a non-class"`).

## Acceptance criteria

- `grep -rn "docs/plans/{ongoing" plugins/docks/skills` AND `grep -rn "ongoing,blocked,finished" plugins/docks/skills` → 0 hits.
- `grep -rn "pipenv check" plugins/docks/skills` → 0 hits; `grep -rnE "safety check( |$|\`)" plugins/docks/skills` → 0 command-form hits.
- `grep -rn "linters-settings" plugins/docks/skills` → 0 hits.
- `grep -rn "Lazy::new" plugins/docks/skills/engineering/solid` → 0 hits (LazyLock form only).
- `grep -rn '"cubic-bezier' plugins/docks/skills/engineering/make-interfaces-feel-better` → only `ease-[cubic-bezier(...)]` forms remain.
- `grep -rn '\bnone\b' scripts/skills/codex-facts.mjs` shows `none` only in a `plan_mode_reasoning_effort` context (or absent).
- `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/docks/skills` → every file ≥ its baseline in `## Context & rationale` (caveman row void if removed).
- `node tests/skill-trigger-collision.mjs plugins/docks/skills` must STAY green (regression guard — it already passes at baseline). The decisive routing check: the 5 near-miss prompts in `## Notes` §6 each route to exactly one skill by descriptions alone (record the re-run table in `## Notes` §6).
- `node scripts/ci.mjs` → exit 0.
- If OQ-3 = ship: tag `docks--v0.10.0` exists, tag-CI green, GitHub Release created.
- Every step-1..8 content edit is reflected in `metadata.updated` + a green `node tests/idempotency.mjs` (repo-root `tests/`; runs inside ci.mjs).

## Out of scope / do-NOT-touch

- `plugins/effect-kit/` and `plugins/session-relay/` — separate plugins, own release cycles (effect-kit was refreshed by [[effect-kit-upgrade-review]]).
- Upstream repos (mattpocock/skills, jakubkrehel) — local patches only, documented via the `patches:` upstream-block note; no PRs filed from this plan.
- The four named structural drift surfaces (OWASP catalog ×2, SOLID rubric ×2, TS class-gate ×3, hill-climb params ×4) get **pointer/maintenance notes only** — no restructuring, no sibling-reference imports (kit policy forbids them).
- Validator floors and scoring.json — never loosened to make a file pass (repo constraint).
- `docs/plans/AGENTS.md` and the plans contract — nothing in the findings requires changing the contract itself.

## Known gotchas

- **Step 1 is atomic**: fixing the `none` effort fact in docs without moving codex-facts.mjs (or vice versa) makes `node scripts/ci.mjs` fail — same commit, always.
- Every content edit needs `metadata.updated` bump + hash backfill or the idempotency gate fails.
- refs-guard requires a `## Contents` TOC on any `references/*.md` that ends >100 lines with ≥3 headings — the multi-tool-bridge rewrite and plan-init relocation can cross that line.
- plan-init's body currently embeds ~106 lines of copy-only TOML; after relocation the body must still score ≥ its 16 baseline (the relocation removes lines — re-check the 80-310 sweet-spot bucket).
- OWASP renumber: keep edition tags (`:2025`) + re-verify cues; both twin catalogs in the SAME commit (step 2).
- `gpt-5.2` / `gpt-5.3-codex` are deprecated on the models page but still in codex-facts' allowed set — examples must RECOMMEND current ids (`gpt-5.4`+); historical mentions may remain.
- codex-facts scan extension is effort-scoped: require the 5-value `model_reasoning_effort` set in `codex-config.md`, NOT the sandbox_mode / `agents.max_depth` tokens (those stay pinned to `codex-agents-builder.md`). Adding codex-config.md to the shared all-facts loop fails the guard on missing sandbox/max_depth tokens.

## STOP conditions

- If any skill drops below its scorer baseline after an edit, revert that edit and re-approach — never pad content or lower a floor to pass.
- If `claude plugin validate` or ci.mjs fails on something NOT caused by this plan's edits (upstream repo drift mid-flight), STOP and report; don't fix unrelated breakage inside this plan.
- If a "current truth" recorded in `## Notes` no longer matches live docs at execution time (they move fast — capability-tuning proved it), re-verify against the named source and update the Notes row BEFORE editing the skill; don't apply a stale fix.

## Cold-handoff checklist

1 file manifest ✓ (steps name paths; `## Notes` carries every file:line) · 2 environment & commands ✓ · 3 contracts ✓ (codex-facts pin contract, description constraints, upstream-patches shape) · 4 executable acceptance ✓ (greps + scorer + ci + tag) · 5 out-of-scope ✓ · 6 decision rationale ✓ (Context) · 7 gotchas ✓ · 8 global constraints ✓ (floors never loosened; ≤500 descriptions; hash discipline) · 9 no undefined terms ✓ — steps 7/8 branch on OQ answers by design, recorded as such.

## Self-review

Fresh-context draft review (plan-review Mode 0, 2026-07-05): **87/100** — verdict "start after edits". All ~20 spot-checked `## Notes` anchors held (incl. the non-compiling LazyLock snippet and the codex-agents-builder internal contradiction); the tdd rewrite verified at 487 chars. Applied all 6 findings: `tests/` command paths corrected (×3 — the scripts live at repo root, not `scripts/tests/`), collision check reframed as keep-green guard vs the decisive manual near-miss re-run, the 3 structural twin/sync notes wired into step 5, pip-playbook anchor tightened to :34, `affected_paths` gains the marketplace catalog (release.mjs owns the plugin.json pair), and an effort-scoped codex-facts extension gotcha added.

## Review

(filled by plan-review on completion)

## Notes — finding → fix map (the executor's worklist)

All claims verified 2026-07-05 by six fresh-context auditors; external truths sourced in `## Sources`. Classes: SI=stale-internal, SE=stale-external/drifted, SS=stale-snippet (broken as written), UV=uncued-volatile (add cue only).

### §1 Codex-facts lockstep

capability-tuning (`plugins/docks/skills/productivity/capability-tuning/`):

| file:line | finding | fix |
|---|---|---|
| references/claude-code-config.md:9 | SE: `"sonnet"` → Sonnet 4.6 | `sonnet` resolves to **Sonnet 5** on the Anthropic API (4.6 = AWS platform, 4.5 = Bedrock/GCP/Foundry); Sonnet 5 is adaptive-only and appears in the effort table |
| SKILL.md:166 + ref claude:15 | SE (reversed): "opusplan plan-phase capped at 200K" | opusplan's plan phase uses the opus model's window — it **gets the 1M upgrade**; `opusplan[1m]` exists to force it |
| SKILL.md:168 | SE: "only built-in Explore pins Haiku" | Since v2.1.198 Explore **inherits the conversation model, capped at Opus**; a custom `Explore` agent with `model: haiku` restores the old behavior |
| SKILL.md:34,167 + ref claude:15 | SE (incomplete): 1M-by-default = Fable 5/Opus 4.8/4.7 | Add **Sonnet 5**: always-1M on the API, no `[1m]` suffix, no usage credits, auto-compacts ~967K; `sonnet[1m]` is a no-op |
| SKILL.md:113 + ref codex:10 | SE: `model_reasoning_effort` accepts `none…xhigh` | Current set: `minimal\|low\|medium\|high\|xhigh` — **`none` only on `plan_mode_reasoning_effort`**; note `xhigh` is model-dependent |
| SKILL.md:164 + ref codex:52 | SE: catalog overflow "no skill is dropped" | Descriptions shorten first, but Codex **may omit skills** from the initial list with a warning; 2%-of-window/8,000-char budget still true |
| SKILL.md:100-107 + ref codex:34 | SE: `[profiles.max]` tables in config.toml | Documented mechanism is **overlay files**: `--profile name` loads `~/.codex/config.toml` then `~/.codex/name.config.toml` |
| ref codex:33 | SE (half): `[agents.roles.<name>]` | Built-in role names hold, but the mechanism is **standalone agent TOML files** in `~/.codex/agents/` or `.codex/agents/` (name/description/developer_instructions + inheritable model/effort/sandbox/mcp/skills.config) |
| ref codex:23 | SE: `approval_policy` incl. `on-failure`; `--full-auto` | Values now `untrusted\|on-request\|never\|{granular}`; `--full-auto` deprecated → `codex exec --sandbox workspace-write`; `--yolo` = `--dangerously-bypass-approvals-and-sandbox` |
| SKILL.md:72,162 + ref claude:12 | nuance | `MAX_THINKING_TOKENS=0` still disables thinking on the API **except Fable 5** (works on Opus 4.7/4.8/Sonnet 5); keep "budget is dead", add the kill-switch nuance |
| SKILL.md:71 + ref claude:11 | nuance | `max` persists via `CLAUDE_CODE_EFFORT_LEVEL`; `ultracode` reachable only via `/effort` or `--settings '{"ultracode":true}'` — not `--effort`/env |
| ref claude:33 | SE (rename): `maxSkillDescriptionChars` | → **`skillListingMaxDescChars`** (1,536 cap holds); add env `SLASH_COMMAND_TOOL_CHAR_BUDGET`; Claude overflow = least-invoked skills' descriptions dropped first |
| ref claude:16 + SKILL.md:74 | freshness | Fast mode: drop Opus 4.7 (deprecated 2026-06-25, removed 2026-07-24); keep 4.8 |
| SKILL.md:59 + ref claude:43 · SKILL.md:39,115 + ref claude:41 · ref claude:36,40 · ref codex:50,52,53 | UV ×7 | Add per-claim re-verify cues (settings/env-vars/skills doc URLs): `MAX_MCP_OUTPUT_TOKENS` (absent from current docs), `project_doc_max_bytes` default 32768 (default no longer documented), autocompact "default ≈95%", `AGENTS.override.md` order, `~/.codex/skills` deprecated (+ current docs add `/etc/codex/skills`), catalog priority chain, Codex plugin-manifest discovery |
| both "verified 2026-06-10" stamps | — | bump to execution date alongside `metadata.updated` |

Guard + pinned reference + node fact:

| file:line | finding | fix |
|---|---|---|
| scripts/skills/codex-facts.mjs:~30-31 | guard pins the drifted `none` fact | Remove `none` from the required `model_reasoning_effort` set; re-scope the pin to `plan_mode_reasoning_effort`; extend the scan list (line ~10) to `capability-tuning/references/codex-config.md` |
| skill-agent-pipeline/references/codex-agents-builder.md:23 | SE: 6-value effort set incl. `none` | 5-value set + "`none` on plan_mode only" note |
| codex-agents-builder.md:64 | SI: example emits `gpt-5.3-codex`, contradicting its own map (line 49: sonnet→gpt-5.4) | Example emits `gpt-5.4`; note gpt-5.2/gpt-5.3-codex now flagged deprecated on the models page |
| codex-agents-builder.md:89 | SI: Sources line lists 5-value effort set inconsistently with line 23 | Align both to the corrected 5-value set |
| plugins/docks/skills/AGENTS.md (cross-tool wording pt. 3) | SE: "no skill is dropped" | Same softening as capability-tuning's row |

### §2 v1-plans glob + OWASP 2025

| file:line | finding | fix |
|---|---|---|
| code-review/SKILL.md:26 + :133 | SI (HIGH): spec glob `docs/plans/{ongoing,blocked,finished}/<slug>.md` | → `docs/plans/active/<slug>.md` (live) + `docs/plans/finished/<YYYY-MM-DD>-<slug>.md` (shipped) |
| code-review/SKILL.md:119-124 | structural: Step-5 apply loop lacks a tier boundary | Inline apply only for single-file, low-blast-radius fixes; cross-file/architectural → hand the findings list to fix-workflow (which advertises that contract at its :173) |
| code-review/SKILL.md:209 + fix-workflow/SKILL.md:187 | SI (low): "Pairs with `/security` `/refactor`" slash framing | → "the `security` / `refactor` skills" (they are cross-tool pipelines, no slash) |
| code-review/SKILL.md:104 | UV: "Current Opus models…" | Anchor to model families or add a re-verify cue |
| code-review/references/security.md:5,62 | SE: OWASP Top 10 presented as 2021 | Renumber to Top 10:**2025** (Injection→A05; SSRF folded into A01; new A03 Software Supply Chain Failures; new A10 Mishandling of Exceptional Conditions); keep edition tags + re-verify cue; add twin-pointer note → security/references/vulnerability-scanner.md |
| security/references/vulnerability-scanner.md:31 | SE: untagged 2021 A-numbers | Same renumber + edition tag + twin-pointer note (same commit) |
| security/references/synthesizer.md:10 | UV: `csurf` as remediation example | Replace with a maintained example (csurf archived) |

### §3 Engineering externals

| file:line | finding | fix |
|---|---|---|
| dep-vuln/references/pip-playbook.md:23 | SE: `pipenv check` | → `pipenv scan` (check unsupported since 2025-06) |
| pip-playbook.md:34 | SE: `safety check --full-report` | → `safety scan` (Safety 3; note account/auth requirement — attaches to the `pip install safety` line :33; the :79 "safety vs pip-audit" prose inherits the rename) |
| dep-vuln/references/go-mod-playbook.md:28 | UV: `osv-scanner -L go.sum` v1 form | Update toward v2 `osv-scanner scan` + re-verify cue |
| dep-vuln/references/cargo-playbook.md:12 | UV: `cargo audit fix` unqualified | Note `cargo install cargo-audit --features=fix` requirement |
| dep-vuln/references/npm-pnpm-playbook.md:97 | UV: old Next upgrade-guide URL | → `/docs/app/guides/upgrading` |
| lint-no-suppressions/references/per-tool-catalog.md:130 | SE: nolintlint reason "required by default" | `require-explanation` defaults **false** — opt-in; align SKILL.md:139 phrasing |
| per-tool-catalog.md:133 | SE: `linters-settings.*` v1 schema | golangci-lint v2: `linters: settings: <linter>:` |
| test-coverage/references/jest-vitest.md:135 | SE: "`--pool=threads` (default)" | Vitest ≥2.0 defaults to **forks** |
| solid/references/rust-solid.md:67-71 | SS (doesn't compile): imports `LazyLock`, uses `Lazy` | `static FORMATTERS: LazyLock<…> = LazyLock::new(…)` |
| solid/SKILL.md:153 + references/depth-and-seams.md:3,89 | SE (404): upstream `LANGUAGE.md` | → upstream's `docs/engineering/improve-codebase-architecture.md` (restructured) |
| react-component-patterns/SKILL.md:108 + references/composition.md:316 | SE (404): Radix `Slot.tsx` | → lowercase `slot/src/slot.tsx` |
| composition.md:99-104 | SS (PLAUSIBLE): `cloneElement(children, {...children.props})` fails typecheck under @types/react 19 | Add types-19 note + cast or `isValidElement<Props>` narrowing; flag as typecheck-verified-or-noted |
| references/effects.md:154-156 | UV: `next/dynamic ssr:false` | Note: Client-Component-only in Next 15+ (rejected in Server Components) |
| type-safety-discipline/SKILL.md:306 + references/rust-newtype.md:139 | SE (redirect): Rust book ch20-04 | → ch20-03 (renumbered) |
| make-interfaces-feel-better/references/animations.md:254,265 (+ SKILL.md:68 if mirrored) | SS: `"cubic-bezier(0.2, 0, 0, 1)"` as a class | → `ease-[cubic-bezier(0.2,0,0,1)]`; append `patches:` note to the upstream block (see Interfaces) |

### §4 tdd-workflow

| file:line | finding | fix |
|---|---|---|
| SKILL.md:3 | SI (confirmed routing gap): no migration exclusion | Replace description with (487 chars): "Use when the user asks for TDD, test-first, \"write the test first then implement\", \"spec it out with tests\", red-green-refactor, or describes a feature as input/output pairs and wants tests to drive the implementation. Also for NEW behavior with no test coverage where tests act as the spec. Not for adding tests to existing code (use test-coverage). Not for migrations/ports (\"failing test per route before porting\") — characterization, not spec; use the porting skill or test-coverage." |
| SKILL.md:22 | SI: "Refactoring with safety net" bullet contradicts test-coverage's pairing table (:157) and tdd's own exclusion | Reword bullet to route to test-coverage (characterization) or delete |
| SKILL.md:134 | UV: "older Jest / certain Python configs report 0 tests on import failure" | Add version bound or a should-fail probe cue |
| SKILL.md:154 | UV: Cursor blog URL | Add re-verify cue |

### §5 Authoring/meta

| file:line | finding | fix |
|---|---|---|
| write-skill/SKILL.md:73 | SI: phantom "internal 8" scoring category | scoring.json has engineering 10 / productivity 8 only — drop "internal" |
| write-skill/SKILL.md:190 | SI: cites "CLAUDE.md Authoring section" | → root `AGENTS.md` `## Authoring agents` |
| write-skill/SKILL.md:18 | nit: bare `node scripts/skill-guard.mjs` path | Use the `<write-skill-dir>/scripts/skill-guard.mjs` form (as line 80 does) |
| skill-agent-pipeline/references/explorer.md:3 + verifier.md:3 | SI: "(on Claude)" on now-cross-tool phases 4a/5 | Drop the qualifiers (phase table + role-mapper already say all-runtimes) |
| skill-agent-pipeline/SKILL.md:24,94 | nit: phases 0-6 then "Phase 8" | Renumber or add a one-line footnote |
| skill-agent-pipeline/references/agents-builder.md:19 | UV: `maxTurns: 100` frontmatter fact | Add re-verify cue (sub-agents doc) |
| multi-tool-bridge/references/claude-md-classification.md:119-128 | SI: byte-% window taught as THE verification | Rewrite: per-section presence + net-shrink tripwire primary (matching SKILL.md:199 + kit standard); % window demoted to secondary duplication tripwire |
| multi-tool-bridge/SKILL.md:209 | nit: "use a separate skill" (unnamed) for TOML porting | Name it: skill-agent-pipeline Phase 5 |
| multi-tool-bridge/SKILL.md:63,107 | UV: `.claude/rules/` inventory claim | Add re-verify cue |
| skill-maintenance/SKILL.md:151 + references/REFERENCES.md:23,112 | UV: `codex debug prompt-input` / `codex plugin list` | Add re-verify cues |
| context-tree/references/major-folder-heuristics.md:40 | SI: "This repo's nodes" lists 5 — repo has 7 (adds plugins/session-relay, plugins/effect-kit/skills) | Update list + add re-derive cue (`find . -name CLAUDE.md -not -path "*/node_modules/*"`) |
| context-tree/references/node-template.md:64-71 | same, in the example table | Refresh alongside |
| plan-init/SKILL.md:132-238 | structural: ~106 lines of copy-only Codex TOML in-body | Relocate to `references/codex-agent-templates.md` (add `## Contents` if >100L/≥3 headings); body keeps a 3-line pointer; re-check score ≥16 after |
| plan-init/references/plans-agents-md-template.md:25-32 | divergence vs docs/plans/AGENTS.md (Runtime-agent-dispatch section) | Add a one-line deliberate-divergence note (template ships extras; contract omits them) |
| scaffold/references/spec-schema.md:41-51 | nit: 9-entry example reads as complete (live spec has 13) | Add the "not a complete inventory" disclaimer the sibling section has |
| fix-workflow/references/feedback-loops.md:69,78,87 | SI: "Phase 3/5/6" numbering from upstream — fix-workflow has Steps 1-6 | Renumber to this skill's steps; fix the cross-skill Phase-5-Refactor pointer |
| fix-workflow/SKILL.md:14 vs 70,189 | nit: "Step 0" naming inconsistency | Unify |
| zoom-out/SKILL.md:20 | SI (consumer path): `.claude/skills/solid/references/…` never exists for plugin installs | → "if the `solid` skill's depth-and-seams vocabulary is available" |

### §6 Routing clauses + near-miss re-run

Clauses (verify ≤500 after each edit):
1. skill-maintenance += "Not for whole-set bootstrap/audit with agent emission (use skill-agent-pipeline)."
2. skill-agent-pipeline += "Not for a targeted post-source-change refresh of individual skills (use skill-maintenance)."
3. multi-tool-bridge += "Not for splitting per-area conventions into nested AGENTS.md nodes (use context-tree)."
4. context-tree += "Not for CLAUDE.md↔AGENTS.md canonicalization / multi-tool setup (use multi-tool-bridge)."
5. design-tokenization += "Not for spacing/motion/radius polish (use make-interfaces-feel-better)." (its first Not-clause)

Near-miss prompts that must each route to exactly one skill after the edits: "Our skills went stale after the refactor — refresh them" → skill-maintenance · "My root CLAUDE.md is 700 lines, reorganize it" → depends on ask (canonicalization → bridge; per-folder lazy-loading → context-tree) — clauses must make the split legible · "Write characterization tests before I refactor this" → test-coverage · "The dark-mode button text feels off / unreadable" → design-tokenization (contrast) with MIFB excluded · "Be brief from now on" → plain instruction (caveman removed/narrowed per OQ-1).

**Re-run record (2026-07-05, post-edit):** all 5 clauses applied; final lengths skill-maintenance 430 · skill-agent-pipeline 498 · multi-tool-bridge 494 · context-tree 460 · design-tokenization 493 (counted with `node -e`, all ≤500). skill-agent-pipeline was already 528 pre-edit, so its body triggers were tightened while adding the clause ("a content-accuracy audit verifying every ref and snippet against current source" → "ref/snippet accuracy audit vs current source"; agent-emission paths kept, parenthetical dropped; Not-target "AGENTS.md/CLAUDE.md nodes" → "AGENTS.md nodes"). multi-tool-bridge dropped "(./CLAUDE.md or ./.claude/CLAUDE.md)" and "+ others", and its TOML-porting Not now points at skill-agent-pipeline instead of "(format mismatch)". design-tokenization `metadata.updated` bumped (its only step-6-round change). Near-miss verdicts: #1 → skill-maintenance ("refresh after source changes"; pipeline now excludes single-skill refresh) ✓ · #2 split legible (bridge excludes AGENTS.md-node splitting → context-tree; tree excludes canonicalization → bridge) ✓ · #3 → test-coverage (tdd-workflow bullet reworded in step 4) ✓ · #4 → design-tokenization (dark-mode contrast; DT's new Not routes only spacing/motion/radius to MIFB; MIFB's existing Not routes color to DT) ✓ · #5 → no skill once step 7 lands (caveman removal) ✓. `node tests/skill-trigger-collision.mjs plugins/docks/skills` → "PASSED: 26 skills, 4 high-overlap pair(s) all routed."

### Structural drift surfaces (pointer notes only — no restructuring)

OWASP catalog ×2 (step 2 adds twin pointers) · SOLID rubric ×2 (refactor/references/solid-analyzer.md ↔ solid skill — add twin note) · TS class-gate ×3 (solid, refactor/solid-analyzer, type-safety-discipline — add twin notes) · plan hill-climb params ×4 (docs/plans/AGENTS.md, plan-manager, plan-review, plan-init template — extend the sync rule in plugins/docks/skills/AGENTS.md to name all four).

## Sources

- Six auditor reports, this session (2026-07-05), each grounded in files read + live fetches: code.claude.com/docs (settings, model-config, fast-mode, sub-agents, skills, env-vars, memory) · developers.openai.com/codex (config-reference, models, skills, sandbox, subagents, config-advanced) · owasp.org/Top10/2025 · vitest.dev/config/pool + vitest PR #5047 · docs.safetycli.com 2.x→3.x migration · pipenv.pypa.io commands · react.dev (eslint-plugin-react-hooks v6, 19.2 blog, use-client reference) · tailwindcss.com v4 docs · golangci-lint reference config · doc.rust-lang.org book ch20-03 · github.com/radix-ui/primitives (slot.tsx 200/404 checks) · mattpocock/skills tree (restructure).
- Repo ground truth read this session: docs/plans/AGENTS.md · docs/scaffold/{AGENTS.md,spec.yaml} · scripts/AGENTS.md · scripts/config/scoring.json · scripts/skills/codex-facts.mjs · plugins/docks/skills/AGENTS.md · root AGENTS.md.
- Baseline scorer run at `2e5ae8d` (Context table): all 16 except caveman 12, skill-agent-pipeline 15.
