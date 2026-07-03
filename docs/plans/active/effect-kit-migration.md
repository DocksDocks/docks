---
title: Migrate effect-kit into the docks multi-plugin repo
goal: Move the effect-kit plugin payload from ~/projects/effect-kit into plugins/effect-kit/ here, wire it into the registry-driven CI/release/marketplace machinery, and retire the standalone repo.
status: in_review
created: "2026-07-03T17:07:03-03:00"
updated: "2026-07-03T17:57:31-03:00"
started_at: "2026-07-03T17:35:57-03:00"
in_review_since: "2026-07-03T17:57:31-03:00"
assignee: claude
tags: [effect-kit, multi-plugin, marketplace, migration]
affected_paths:
  - plugins/effect-kit/
  - scripts/lib/plugins.mjs
  - .claude-plugin/marketplace.json
  - .agents/plugins/marketplace.json
  - AGENTS.md
  - scripts/AGENTS.md
related_plans: [effect-kit-upgrade-review]
review_status: null
planned_at_commit: "2fb11fab830bce13a5940e00bfc553f808ae9f2e"
---

# Migrate effect-kit into the docks multi-plugin repo

## Goal

`effect-kit` (github DocksDocks/effect-kit, v0.1.1) predates this repo's multi-plugin model — it was forked off the old docks scaffold as a standalone marketplace because a multi-plugin repo wasn't understood yet. Now that `scripts/lib/plugins.mjs` makes "adding a plugin = adding one descriptor", effect-kit belongs here as the third plugin under the one `docks` marketplace. Migrate the payload, wire the registry, retire the standalone repo, and make the add-a-plugin path an explicit checklist so plugin N+1 is routine (maintainer requirement, verbatim intent: *"i want to make this repo very modular so we can potentially add how much plugins we want for the 'docks' marketplace"*).

## Context & rationale

Pre-audit facts (all verified against `~/projects/effect-kit` this session):

- **Payload**: `plugins/effect-kit/` = `.claude-plugin/plugin.json` (v0.1.1) + `.codex-plugin/plugin.json` + `skills/engineering/` — 3 skills (`effect-ts-setup` 2 refs, `effect-ts-specialist` 6 refs, `effect-ts-port` 4 refs) + a `skills/AGENTS.md`+`CLAUDE.md` node pair. No agents, no hooks, no rust, no selftest.
- **Already green against docks gates** (pre-verified): docks' bundled scorer gives 16/14/16 (engineering floor 10); zero live `path:NN` anchors in skill bodies; no author-script names in SKILL.md/references (the one stale `bash scripts/skills/guard.sh` ref sits in the skills AGENTS.md node, which no-author-scripts does NOT scan — but it's wrong anyway and gets rewritten in step 4).
- **What does NOT migrate**: the standalone repo's own marketplace catalogs (this repo's catalogs gain entries instead), its stale bash author scripts (`ci.sh`, `release.sh` — superseded by the registry-driven `.mjs` machinery here), its `docs/plans/` (a legacy v1 five-folder layout — `planned/ongoing/blocked/scheduled/finished/`, each holding only a `.gitkeep`, zero real plans), its `package.json`/lockfile (docks has its own).
- **Dependency declaration**: effect-kit's plugin.json declares a dependency on the docks plugin. It currently points cross-marketplace (`allowCrossMarketplaceDependenciesOn`); after migration both live in the SAME `docks` marketplace, so the dependency entry stays but the cross-marketplace allowance is dropped with the old catalog.
- **Per-plugin gates are already scoped**: `gatePlugin` passes `p.skills` to content-hash, trigger-collision, no-author-scripts, and the scorer — no script changes needed for CI. Release is `node scripts/release.mjs --plugin effect-kit <bump>` (tag `effect-kit--vX.Y.Z`), already generic.
- **Trigger-collision is per-plugin only** — cross-plugin near-misses (effect-ts-* vs docks engineering skills) are a manual check; deferred to [[effect-kit-upgrade-review]] which audits descriptions.

## Environment & how-to-run

Source repo: `~/projects/effect-kit` (clean tree, HEAD e908747, v0.1.1). Target: this repo. Gates: `node scripts/ci.mjs` (full, ~2 min) · `node scripts/ci.mjs --plugin effect-kit` (narrow) · hash sync `node scripts/skills/content-hash.mjs --backfill plugins/effect-kit/skills` · release `node scripts/release.mjs --plugin effect-kit <bump>` (user-gated).

Do the migration on a feature branch (`plan/effect-kit-migration`) and open a PR to `main`; never commit the migration directly to `main` (repo convention: PR-CI is the merge gate — see `scripts/AGENTS.md` "Edit → release workflow"). Step 7's release runs only after the PR merges.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Copy the payload: `cp -r ~/projects/effect-kit/plugins/effect-kit plugins/` (plain copy — DECIDED OQ1; history stays in the archived repo; payload = both plugin manifests + `skills/` incl. the node pair). Verify file count matches source (`find ... \| wc -l` both sides) | `plugins/effect-kit/` (new) | — | done |
| 2 | Registry descriptor in `scripts/lib/plugins.mjs`: `{ name: 'effect-kit', root: 'plugins/effect-kit', skills: 'plugins/effect-kit/skills', agents: null, codex: true, selftest: null, rust: null, extraJson: [], transformGuard: false, install: '/plugin marketplace update docks\n/plugin install effect-kit@docks' }` | `scripts/lib/plugins.mjs` | 1 | done |
| 3 | Marketplace entries: `.claude-plugin/marketplace.json` gains the effect-kit plugin entry (source `./plugins/effect-kit`, version matching both plugin.jsons — lockstep gate); `.agents/plugins/marketplace.json` gains the Codex entry (local source path + policy block, mirroring the session-relay entry shape via the `codex-plugin-mirror` project skill) | both catalogs | 2 | done |
| 4 | Rewrite `plugins/effect-kit/skills/AGENTS.md`: (a) replace `bash scripts/skills/guard.sh plugins/effect-kit/skills` → `node scripts/ci.mjs --plugin effect-kit`; (b) append one line — `Full authoring contract (frontmatter, CSO, scoring, content-hash idempotency, durable-anchors grammar): see plugins/docks/skills/AGENTS.md`; (c) add NO `path:NN` live anchor (durable-anchors is repo-wide). Root `AGENTS.md`: add a `plugins/effect-kit/` block to the Repository-scope tree, and the row `\| plugins/effect-kit/skills/AGENTS.md \| effect-kit skill authoring — Effect 3.x version-pinned conventions \|` to the Context-tree table | `plugins/effect-kit/skills/AGENTS.md`, `AGENTS.md` | 1 | done |
| 5 | Modularity checklist (maintainer requirement): `scripts/AGENTS.md` multi-plugin section gains the concrete "adding plugin N+1" checklist — descriptor fields → two catalog entries → optional context node → `--plugin` release; each item naming its gate | `scripts/AGENTS.md` | 2,3 | done |
| 6 | Gates: `node scripts/skills/content-hash.mjs --check-only plugins/effect-kit/skills` (backfill if the old repo's hash algorithm drifted); full `node scripts/ci.mjs` exit 0; exercise the lockstep cue once for effect-kit (bump one manifest alone → `--plugin effect-kit` must fail; revert); commit | — | 1–5 | done |
| 7 | Release + retire (DECIDED OQ2/OQ3): after the PR merges, release `effect-kit--v0.2.0` (`node scripts/release.mjs --plugin effect-kit minor`, user-gated picker as always); then retire the old repo — final commit there rewriting its README to point at the docks marketplace (`/plugin marketplace add DocksDocks/docks` → `/plugin install effect-kit@docks`), then `gh repo archive DocksDocks/effect-kit --yes` (read-only, reversible; old tags/releases stay visible) | manifests; DocksDocks/effect-kit | 6 | done |

## Interfaces & data shapes

- **Descriptor contract**: the step-2 object literal above IS the interface — `scripts/lib/plugins.mjs` `PLUGINS` array; capability-driven gates self-skip on `null` fields.
- **Lockstep triple**: `plugins/effect-kit/.claude-plugin/plugin.json` `version` = `.codex-plugin/plugin.json` `version` = the marketplace entry `version` (starts 0.1.1; step 7's release bumps all three).
- **Tag format**: `effect-kit--vX.Y.Z` (from `claude plugin tag`); the old repo's `v0.1.x` tags stay there untouched.
- **Claude catalog entry (verbatim — append to `.claude-plugin/marketplace.json` `plugins[]`; full field set matching the docks/session-relay entries, `author.name` "Eduardo Marquez" for catalog consistency):**

```json
{
  "name": "effect-kit",
  "source": "./plugins/effect-kit",
  "description": "Cross-tool Effect-TS skill kit: repo setup (effect-ts-setup), idiomatic Effect 3.x patterns (effect-ts-specialist), and Fastify/Next.js/React → Effect porting (effect-ts-port).",
  "version": "0.1.1",
  "author": { "name": "Eduardo Marquez" },
  "license": "MIT",
  "homepage": "https://github.com/DocksDocks/docks",
  "repository": "https://github.com/DocksDocks/docks",
  "keywords": ["effect", "effect-ts", "typescript", "skills", "cross-tool", "codex"],
  "category": "engineering-workflows",
  "tags": ["effect", "typescript", "cross-tool", "skills", "codex"]
}
```

- **Codex catalog entry (verbatim — append to `.agents/plugins/marketplace.json` `plugins[]`):**

```json
{
  "name": "effect-kit",
  "source": { "source": "local", "path": "./plugins/effect-kit" },
  "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
  "category": "Productivity"
}
```

## Acceptance criteria

- `node scripts/ci.mjs --list` → shows 3 plugins incl. effect-kit, all present.
- `node scripts/ci.mjs` → exit 0 (effect-kit gated: manifests, validate, skills guard, content-hash, collision, no-author-scripts, scorer floors, durable-anchors repo-wide now covering its node + bodies).
- Lockstep probe run once: bump `plugins/effect-kit/.claude-plugin/plugin.json` version alone → `node scripts/ci.mjs --plugin effect-kit -q` exits non-zero naming the drift; revert → clean (`git status --porcelain` empty).
- `grep -c "effect-kit" .claude-plugin/marketplace.json .agents/plugins/marketplace.json` → ≥1 each.
- `grep -n "guard.sh" plugins/effect-kit/skills/AGENTS.md` → no match (exit 1).
- `grep -n "effect-kit" AGENTS.md` → Repository scope + Context tree rows present.
- Payload parity: `diff -rq ~/projects/effect-kit/plugins/effect-kit/skills plugins/effect-kit/skills` → differences ONLY in files this plan edits (the AGENTS.md node; content-hash frontmatter if backfilled).
- Scorer: `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/effect-kit/skills` → 3 skills, each ≥10 (pre-verified 16/14/16).

## Out of scope / do-NOT-touch

- Skill CONTENT changes (Effect 3.x API currency, description tuning, score uplift, new skills) — that is [[effect-kit-upgrade-review]], deliberately separate so the migration diff stays reviewable.
- The standalone repo's git history rewriting — whatever OQ1 decides, the old repo itself is never force-pushed or deleted.
- `scripts/ci.mjs` / `scripts/release.mjs` logic — the registry model means NO orchestrator edits; if a step seems to need one, STOP and re-read the descriptor contract (that's the modularity claim this migration proves).
- docks / session-relay version numbers — untouched.

## Known gotchas

- The old repo's `content_hash` values may have been produced by the retired bash hasher — run `--check-only` first; backfill (and bump nothing else) if it reports drift.
- `claude plugin validate` lints every `*.md` under an `agents/` dir — effect-kit ships none, so the skills node pair is safe (same precedent as session-relay's root node).
- The Claude catalog is order-sensitive for humans, not machines — append the entry after session-relay; the per-plugin gate matches by `name`.
- effect-kit's plugin.json `dependencies` on docks: keep it (same-marketplace dependency); do NOT carry over `allowCrossMarketplaceDependenciesOn` (that lived in the OLD marketplace catalog, which dies with the standalone repo).
- The docks-marketplace effect-kit entry carries **NO** `dependencies` and **NO** `allowCrossMarketplaceDependenciesOn` field — the docks dependency is declared exactly once, in `plugins/effect-kit/.claude-plugin/plugin.json`. Do not copy the source catalog entry's `dependencies` array into the docks catalog.

## Cold-handoff checklist

1–9: file manifest ✓ · environment & commands ✓ · contracts ✓ (descriptor literal, both catalog entries verbatim, lockstep triple, tag format) · executable acceptance ✓ · out-of-scope ✓ · rationale ✓ (audit facts + what-doesn't-migrate reasoning) · gotchas ✓ · constraints verbatim ✓ (modularity quote in Goal) · no TBDs (OQ1–3 decided and encoded above) ✓.

## Decisions (open questions resolved 2026-07-03, via picker)

- **OQ1 copy method → plain `cp -r`** — one migration commit here; the old repo (4 commits) remains the history archive; docks' plan/release records are the durable trail forward.
- **OQ2 old repo fate → archive + pointer README** — final commit redirects to the docks marketplace, then `gh repo archive` (read-only, reversible; tags/releases stay visible).
- **OQ3 first release → `effect-kit--v0.2.0`** — minor bump immediately after the migration PR merges, so consumers get the new marketplace coordinates.

## Notes — execution record (2026-07-03)

- Steps 1–6 executed on branch `plan/effect-kit-migration`. File-count parity 19=19; hashes were already in sync (`--check-only`: 3× unchanged — same hasher lineage).
- **On-goal deviation:** docks' refs-guard TOC rule (added after the fork) failed two references >100 lines (`effect-ts-port/references/react.md`, `effect-ts-specialist/references/services-and-layers.md`) — added `## Contents` TOCs, bumped both skills' `metadata.updated`, re-backfilled hashes. Payload-parity diff therefore shows exactly: the AGENTS.md node (planned), 2 reference TOCs + 2 SKILL.md hash/updated bumps (this deviation).
- Cue exercises: lockstep probe fired on BOTH axes (`plugin.json=0.1.2 marketplace.json=0.1.1` AND `codex=0.1.1 claude=0.1.2`), reverted clean. Full `node scripts/ci.mjs` → "All ci.mjs checks passed — 3 plugin(s) + repo-wide". Scorer 16/14/16.
- Step 7 executed: PR #9 merged (PR-CI success, merge dd17e4e) → released `effect-kit--v0.2.0` (tag-CI green, GitHub Release created) → old repo retired (pointer README pushed, `gh repo archive DocksDocks/effect-kit` → `isArchived: true`).
- Consumer follow-through (maintainer request, beyond plan scope): spawned relay session `public-effect-kit-repoint` in `~/projects/public` to repoint that repo's effect-kit coordinates (Codex marketplace git URL, `effect-kit@effect-kit` enable key, known-marketplace entry) to the docks marketplace; it reports back on the bus.

## Self-review

Score: 86→93/100 · trajectory 86→93 · stopped: plateau after applying the fresh-context draft review (big-plan tier). The reviewer independently re-verified the audit claims against the source repo (descriptor fields exact, trigger-collision per-plugin confirmed, dependency-field placement semantics confirmed) and caught 5 defects, all applied verbatim: D1 both catalog entries now verbatim in Interfaces (full field set matching repo convention; `author.name` "Eduardo Marquez" for catalog consistency); D2 the no-`dependencies`-in-catalog rule added as a gotcha; D3 step 4 rewritten paste-ready; D4 feature-branch + PR flow made explicit in Environment; D5 the source docs/plans correctly described as a legacy v1 five-folder layout. OQ1–3 were subsequently answered via the picker and encoded under `## Decisions` — no residual guesses remain.

## Review

(filled by plan-review on completion)

## Sources

- `~/projects/effect-kit/plugins/effect-kit/.claude-plugin/plugin.json` — v0.1.1, skills-only payload, docks dependency (read this session).
- `~/projects/effect-kit/plugins/effect-kit/skills/AGENTS.md` — the stale `bash scripts/skills/guard.sh` line step 4 removes (read this session).
- `scripts/lib/plugins.mjs` — `PLUGINS` — the descriptor contract; docks + session-relay entries are the two shapes to mirror (read this session).
- Scorer pre-check: `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file ~/projects/effect-kit/plugins/effect-kit/skills` → 16/14/16 (run this session).
- Anchor/author-script pre-check: repo-root-style grep over the source skills → zero live `path:NN`, zero author-script names in shipped bodies (run this session).
