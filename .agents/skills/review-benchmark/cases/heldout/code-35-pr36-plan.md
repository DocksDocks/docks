<!-- plan-contract: v3 -->

## Goal

Fix the stale-content defects and missing cross-reference routing found by the six-scout audit across `plugins/docks/skills/` (excluding the two advisory-withdrawn findings: code-review wrapper alignment and context-tree author-script anchors), re-vendor make-interfaces-feel-better from upstream, remove the okf-bundle skill, and fix the stale README caveman line.

Mode: plan-and-implement

## Research

- Six parallel read-only scouts audited all 24 shipped skills (SKILL.md + references/) against the repo, the plan-lifecycle contract, and upstream facts as of 2026-08. Zero broken `references/*.md` links kit-wide.
- okf-bundle: hard-codes OKF v0.1 while upstream SPEC.md is v0.2; internal contradiction (line 17 "every frontmatter block has `type`" vs lines 72-80 root pin carries only `okf_version`); link-policy claim inverted vs v0.2. User decided removal (recorded `ask`: "Remove okf-bundle + fix README"). Evidence framing: the skill is niche and recent (added 2026-07-03), not dead weight - zero *internal* references, but user-invocable skills dispatch from descriptions; user confirmed no consumer usage. Live surfaces: only `plugins/docks/skills/productivity/okf-bundle/` itself; all other mentions are frozen history (`docs/plans/finished/` - never migrated).
- `README.md:62` lists removed `caveman` skill under productivity; directory absent (glob-confirmed).
- security/SKILL.md:78-79 and refactor/SKILL.md:77-79 advertise untracked markdown plan fallbacks (`docs/security-audit-<date>.md`, `docs/refactor-plan-<date>.md`) contradicting the GitHub-issue-only lifecycle; both name only `plan:drafting`, omitting the full label set (drafting/planned/ongoing/blocked).
- fix-workflow/references/security-fix-templates.md:15,57 prescribes OWASP A03:2021 injection + 2021 URL; the kit's security catalogs use A05:2025 (review round 1 corrected the file's owner: it lives under fix-workflow, not security).
- fix-workflow/SKILL.md:107-122,175-177 consumes security/code-review findings without an input-field mapping and never names its lifecycle routing.
- dep-vuln-workflow/references/npm-pnpm-playbook.md:63 says "Commit once" contradicting the parent's mandatory two-commit security/hygiene split (SKILL.md:77-82).
- tdd-workflow/SKILL.md:3 routes ports to "the porting skill" - no such skill exists; :23-27 excludes refactoring without naming `refactor`. test-coverage/SKILL.md:36-38 same missing `refactor` route.
- commit-discipline/SKILL.md:31-34 permits force-with-lease on any own PR branch without a confirmation gate, and :154-177 generic merge guidance never defers to plan-manager landing rules. Session advisory broadened the fix: the GENERAL rewrite constraint gains an explicit user-confirmation gate (matching the repo security rule: no force-push/history rewrite without explicit user confirmation), and SEPARATELY lifecycle-branch landing defers to plan-manager (no rewrite without explicit request; fresh "Merge now").
- type-safety-discipline/SKILL.md:238 + references/kotlin-value-class.md:75-78: "Kotlin `when` statement form is not compile-checked" - stale since Kotlin 1.7 (sealed/enum/Boolean statement subjects are compile errors).
- solid/SKILL.md:73-83 GOOD example (`Record<string, Formatter>` + `unknown` fallback) contradicts its own :101 warning against default-swallowing; not finite-key exhaustive.
- Three-way boundary: code-clarity description (:3) routes ALL SOLID work to `refactor` while its body (:88-90,192-193) routes demonstrated structural patterns to `solid`; type-safety-discipline and solid omit reciprocal code-clarity clauses.
- accessibility/SKILL.md:201 grouping of 2.4.13 Focus Appearance as AAA is CORRECT per the final WCAG 2.2 Recommendation (advisory-corrected: the scout's AA claim matched only pre-Recommendation drafts; no level change ships). Surviving finding: :50 overclaims native `<dialog>` focus restoration (MDN-verified: initial focus/inert/Escape yes, restore-to-invoker not guaranteed).
- design-tokenization/SKILL.md:3,179 and react-component-patterns/SKILL.md:3 omit "Not for accessibility (use accessibility)" - accessibility already routes to all three UI siblings.
- make-interfaces-feel-better: vendored MIT from `https://github.com/jakubkrehel/make-interfaces-feel-better` (vendored_at 2026-04-20, one declared easing patch); upstream has since added icons/motion-restraint/stroke/currentColor/oklch content; SKILL.md:114,129,172 conflates a 40x40 heuristic with WCAG 2.2 Target Size AA (24x24). User decided: re-vendor + re-apply patch + enumerate divergences.
- zoom-out/SKILL.md:3 is the only description in the kit with no "Not for ..." routing clause.
- multi-tool-bridge/SKILL.md:124-129 recipe creates per-entry symlinks - which IS this repo's actual layout (`.claude/skills/` is a real directory; `.claude/skills/codex-plugin-mirror -> ../../.agents/skills/codex-plugin-mirror`, readlink-verified in review round 1; the audit scout's directory-level-symlink claim was wrong). Surviving improvement: the recipe lacks a readlink verification cue.
- skill-maintenance/SKILL.md:53 manual-bump wording predates the content-hash backfill contract.
- scaffold/SKILL.md:87 setup mode claims to "run the generated project's validators" but setup only writes spec + templates.
- Advisory-withdrawn (out of scope): code-review "Apply fixes?" is legitimate for direct use (wrapper overrides it at dispatch, codex-agent-templates.md:102-106); context-tree may not name `scripts/tree/guard.mjs` (author-script rule, only scaffold/write-skill allowlisted).
- Touched skills need `metadata.updated` bumps + content-hash re-sync (`node scripts/skills/content-hash.mjs --backfill`); floors: engineering 10, productivity 8; trigger-collision test re-runs on description changes.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | remove_okf | Delete the okf-bundle skill directory and the stale caveman README line | plugins/docks/skills/productivity/okf-bundle/, README.md | - | `local` | `done` | Directory gone; README productivity list matches the on-disk set; zero live okf-bundle references outside frozen history |
| 2 | lifecycle_wording | Remove markdown plan fallbacks and stale label wording from security + refactor (GitHub-issue-only record, full plan:<phase> set, concise six-manager-phase handoff); update fix-workflow's security fix templates to OWASP 2025 (A05 injection, 2025 URL); add lifecycle routing + input-field mapping (security/code-review emissions -> fix table fields) to fix-workflow | plugins/docks/skills/engineering/security/SKILL.md, plugins/docks/skills/engineering/refactor/SKILL.md, plugins/docks/skills/engineering/fix-workflow/SKILL.md, plugins/docks/skills/engineering/fix-workflow/references/security-fix-templates.md | - | `local` | `done` | No docs/*-plan fallback wording; label set complete; templates cite A05:2025; fix-workflow names its input schema and lifecycle route |
| 3 | workflow_fixes | Fix dep-vuln playbook single-commit contradiction (two independently revertible commits); replace tdd-workflow's nonexistent porting-skill route and add refactor xref; add refactor xref to test-coverage; in commit-discipline add an explicit user-confirmation gate to the general history-rewrite/force-with-lease constraint AND a separate plan-manager deferral for lifecycle-branch landing | plugins/docks/skills/engineering/dep-vuln-workflow/references/npm-pnpm-playbook.md, plugins/docks/skills/engineering/tdd-workflow/SKILL.md, plugins/docks/skills/engineering/test-coverage/SKILL.md, plugins/docks/skills/engineering/commit-discipline/SKILL.md | - | `local` | `done` | Playbook matches parent two-commit policy; no route to a nonexistent skill; both test skills name refactor; commit-discipline gates every rewrite on explicit confirmation and defers lifecycle landing to plan-manager |
| 4 | discipline_fixes | Qualify Kotlin when-exhaustiveness by subject/version in skill + reference; make solid's GOOD strategy map finite-key exhaustive (or explicit fail-closed) consistent with its :101 warning; make the code-clarity/solid/type-safety three-way boundary mutually explicit | plugins/docks/skills/engineering/type-safety-discipline/SKILL.md, plugins/docks/skills/engineering/type-safety-discipline/references/kotlin-value-class.md, plugins/docks/skills/engineering/solid/SKILL.md, plugins/docks/skills/engineering/code-clarity/SKILL.md | - | `local` | `done` | Kotlin claim version-qualified; solid example self-consistent; all three descriptions/bodies route each other explicitly |
| 5 | ui_fixes | Qualify the native dialog focus-restore claim in accessibility (keep 2.4.13 at AAA - advisory-corrected); add "Not for accessibility (use accessibility)" routing to design-tokenization and react-component-patterns | plugins/docks/skills/engineering/accessibility/SKILL.md, plugins/docks/skills/engineering/design-tokenization/SKILL.md, plugins/docks/skills/engineering/react-component-patterns/SKILL.md | - | `local` | `done` | Dialog claim qualified; 2.4.13 grouping unchanged; both siblings route accessibility |
| 6 | revendor | Re-vendor make-interfaces-feel-better from the pinned upstream (fetch is a read-only probe), re-apply the declared easing patch, enumerate every intentional divergence in metadata.patches, fix the 40x40/WCAG 24x24 conflation per current upstream, add accessibility routing, refresh vendored_at | plugins/docks/skills/engineering/make-interfaces-feel-better/ | - | `probe` | `done` | Vendored tree matches upstream + enumerated patches; target-size wording distinguishes WCAG AA minimum from heuristics; routing added |
| 7 | prod_fixes | Add zoom-out "Not for ..." routing clause; add a readlink verification cue for the per-entry symlink layout to multi-tool-bridge (the recipe already matches the repo's actual layout); update skill-maintenance manual-bump wording to the hash-backfill contract; fix scaffold setup-mode validator claim | plugins/docks/skills/productivity/zoom-out/SKILL.md, plugins/docks/skills/productivity/multi-tool-bridge/SKILL.md, plugins/docks/skills/productivity/skill-maintenance/SKILL.md, plugins/docks/skills/productivity/scaffold/SKILL.md | - | `local` | `done` | All four wordings match repo reality; zoom-out description carries routing |
| 8 | hash_gate | Bump metadata.updated on every touched skill, run content-hash backfill, then the full repo gate | plugins/docks/skills/, scripts/ | 1,2,3,4,5,6,7 | `local` | `in-flight` | `node scripts/ci.mjs` exit 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/ci.mjs` | Exit 0 (floors, trigger-collision, content-hash idempotency, durable-anchors, no-author-scripts all green) |
| A2 | `grep -rn "okf-bundle" plugins/ scripts/ README.md .agents/ .github/` | Zero hits (frozen history under docs/plans/finished/ excluded) |
| A3 | `grep -n "caveman" README.md plugins/docks/README.md` | Zero hits |
| A4 | `grep -n "porting skill" plugins/docks/skills/engineering/tdd-workflow/SKILL.md` | Zero hits |
| A5 | `grep -rn "2021" plugins/docks/skills/engineering/fix-workflow/references/security-fix-templates.md` | Zero OWASP-2021 citations |

## Do not touch

- `plugins/plan-lifecycle/` - lifecycle contract is the reference, not a target.
- `plugins/docks/skills/engineering/code-review/` - advisory-withdrawn; direct-use fix phase is legitimate.
- `plugins/docks/skills/productivity/context-tree/` - advisory-withdrawn; shipped bodies may not name author scripts.
- `docs/plans/finished/` - frozen history.
- `scripts/` validator logic and floors - wording fixes only, no gate changes.

## Open questions

None

## Review

_No review yet._

## Verification Results

- A1 full `node scripts/ci.mjs` - exit 0 (all checks passed, 3 plugins + repo-wide) with content-hash backfill applied to all 18 touched skills.
- A2 repository grep for effect-kit/Effect Kit/effect_kit/effectkit/effect-ts/effect-v4 - unchanged from plan #31 baseline (zero live hits outside frozen history).
- A3 `grep -n "caveman" README.md plugins/docks/README.md` - zero hits; README productivity line matches the 7-skill post-removal set.
- A4 `grep -n "porting skill" .../tdd-workflow/SKILL.md` - zero hits; ports route to test-coverage.
- A5 `grep -rn "2021" .../fix-workflow/references/security-fix-templates.md` - zero OWASP-2021 citations; A05:2025 in place.
- Re-vendor pinned upstream 5a4076ac611d6610b9cb4d67f5275cb4f869411b; injection review clean (README install-commands and openai.yaml deliberately not applied, declared in patches); scoped skill guard and refs-guard pass.
- okf-bundle directory removed from the index; okf-bundle grep across README.md and plugins/ returns zero.
