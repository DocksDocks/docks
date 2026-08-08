---
title: Consolidate Plan Lifecycle authority and bound reviews
goal: Consolidate current PlanRun authority, freeze historical readers, move deterministic checks before review, and allow only one repair plus mandatory verification.
plan_hash_mode: status-excluded-v1
status: blocked
created: "2026-08-05T03:40:58.144Z"
updated: "2026-08-06T13:54:33.568+00:00"
started_at: "2026-08-06T04:43:27.184+00:00"
finished_at: null
assignee: null
tags: [plan-lifecycle, review, authority, refactor]
affected_paths:
  - .codex/agents/plan-reviewer.toml
  - AGENTS.md
  - docs/plans/AGENTS.md
  - plugins/docks/skills/engineering/refactor/SKILL.md
  - plugins/docks/skills/engineering/security/SKILL.md
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md
  - plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md
  - plugins/effect-kit/skills/engineering/effect-ts-setup/SKILL.md
  - plugins/plan-lifecycle/.claude-plugin/plugin.json
  - plugins/plan-lifecycle/.codex-plugin/plugin.json
  - plugins/plan-lifecycle/agents/plan-reviewer.md
  - plugins/plan-lifecycle/compatibility.json
  - plugins/plan-lifecycle/skills/AGENTS.md
  - plugins/plan-lifecycle/skills/CLAUDE.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-self-check-protocol.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/planqueuev1-schema.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/planrunv1-schema.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-measurements.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-properties.json
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/sample-review.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-queue.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/current-codec.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/git-preimage.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/historical-adapter.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/live-review-records.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/plan-state.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/transaction.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts/review-policy.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - plugins/plan-lifecycle/test/selftest.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/remediation-contract.mjs
  - scripts/AGENTS.md
  - scripts/ci.mjs
  - scripts/config/plan-scope-waivers/plan-lifecycle-review-and-authority-modules.json
  - scripts/config/test-contracts.json
  - scripts/lib/plugins.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/tests/plan-dispatch-probes.mjs
  - scripts/tests/plan-evidence-probes.mjs
  - scripts/tests/plan-orchestration.mjs
  - scripts/tests/plan-orchestration/external-authority.mjs
  - scripts/tests/plan-orchestration/fixtures/historical-inventory.json
  - scripts/tests/plan-orchestration/fixtures/historical-records.mjs
  - scripts/tests/plan-orchestration/fixtures/legacy-plans.mjs
  - scripts/tests/plan-orchestration/fixtures/plan-run-v1.mjs
  - scripts/tests/plan-orchestration/harness.mjs
  - scripts/tests/plan-orchestration/hashing-manifests.mjs
  - scripts/tests/plan-orchestration/historical-characterization.mjs
  - scripts/tests/plan-orchestration/historical-malformed-corpus.mjs
  - scripts/tests/plan-orchestration/legacy-quarantine.mjs
  - scripts/tests/plan-orchestration/locks-cas.mjs
  - scripts/tests/plan-orchestration/mutations.mjs
  - scripts/tests/plan-orchestration/plan-self-check.mjs
  - scripts/tests/plan-orchestration/review-budget.mjs
  - scripts/tests/plan-orchestration/session-relay-terminal-correction-successor.mjs
  - scripts/tests/plan-orchestration/state-matrix.mjs
  - scripts/tests/plan-queue.mjs
  - scripts/tests/plan-skill-phases.mjs
  - scripts/tests/test-contracts.mjs
related_plans:
  - docs/plans/finished/2026-08-05-ci-observability-and-test-contracts.md
---

# Consolidate Plan Lifecycle authority and bound reviews

Plan-run: {"acceptance":{"source_sha256":"f9607ab6dc0e235c3a50a95b01dca5263571f67123cc76a3b487bb9fea3ee5a9","verification_sha256":"be868fb0c878e75caf48d8ba20fbf0c617f33b055d63cad0d9acb3bcf41d15c7"},"blocker":{"evidence_sha256":"4190814aea808ba9a748007e8b9a64d30476a5a0fb4128caef49dd1adcb81373","kind":"review_failed"},"completion_review":{"input_sha256":"3c8671db3db6a9b1f8fc27e6fd25ed6222a8fbd75b2bd32d7dab7de6cf01405b","invocations":2,"result_sha256":"4190814aea808ba9a748007e8b9a64d30476a5a0fb4128caef49dd1adcb81373","state":"blocked"},"draft_review":{"input_sha256":"60fd2d8106d3c1575dbd8ff1b86e263c06f1e097c0bd26eb378ba50db72e0163","invocations":2,"result_sha256":"6499c17cd91952d4060781aa9283ec0dc39813947e4cd5974b7a3561d2a93b8e","state":"passed"},"execution_parent":"dc42814a34d516b945924359c7dbf3bd00818276","goal_id":"248e3f50-2528-4dd3-b92c-d0373f702d65","implementation_commit":"28135d3ec20ea0592d3e7584099d5a071b13cd49","plan_path":"docs/plans/active/plan-lifecycle-review-and-authority-modules.md","plan_sha256":"61360d700fdba2dcecbae0b4cb38b63213fa7c4bacfa2bc97b51aa121d685d8d","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"b602145d-3edc-4859-af1a-66b7f3da3bcb","schema":1,"source_base":"dc42814a34d516b945924359c7dbf3bd00818276","source_sha256":"8a1efe55f73c4c14b05b759871ed86634167659a7213f690bff7e324b8eccd89"}

## Goal

Reduce Plan Lifecycle review time and state-machine drift without a Rust rewrite: one current Node authority, one frozen historical adapter, deterministic pre-permit checks, one substantive repair followed by mandatory fresh verification, and a direct transport controller that remains independent of Session Relay.

## Context & rationale

Historical plans show review work taking roughly 32 minutes, 1h19m, 1h53m, and 10h25m. Most findings were real, including repair-introduced defects, path identity errors, dead fixtures, scope omissions, and invalid evidence handling. The problem is renewable and mechanically repetitive review, not review itself. Current PlanRun state, validation, reducer, and persisted-edge rules are repeated within one large module; live and historical review families share codecs and ambient drift modes. No measured Node transaction bottleneck, correctness failure, or non-Node consumer justifies a Rust CLI now. A clean initial review may pass; any accepted repair must receive one fresh verification because historical second passes caught real defects.

## Environment & how-to-run

Run from the repository root with Node 24 and the installed Plan Lifecycle plugin machinery. Keep canonical Markdown, Git checkpoints, filesystem CAS, private reviewer bundles, and direct `omp|claude|codex` subprocess transport. Update every contract copy named by the plan-lifecycle authoring rules in one cutover.

*Public surface stays one module.* `plan-run.mjs` remains the sole public entry point and becomes a facade that re-exports the same 22 symbols from `scripts/runtime/*.mjs`; the six runtime modules are internal and no external caller imports them directly. Eleven files outside the plugin import `plan-run.mjs` today, `plan-manager/SKILL.md` names it as the contract surface, and step 4’s done condition is an internal policy/mechanics boundary, not a new public API. Keeping one entry point leaves those importers untouched and keeps the completion-review diff to the extraction itself. This is a deliberate facade, not a compatibility alias: no old symbol survives under a second name, and no second live transition table remains.

*The new deterministic scope check.* Step 5’s scope defect is this, concretely: add one property to `lifecycle/plan-properties.json` and one deterministic check to `scriptChecks` (`plan-self-check.mjs:568-628`), beside the existing P13 declared-paths-versus-Steps comparison, which reads only frontmatter and Step rows at `:578-613` and therefore cannot fail on an omission. The new check takes an explicit repository root, and for each declared path P, it scans tracked files whose extension is one of `.mjs`, `.js`, `.cjs`, `.ts`, `.json`, `.toml`, `.yml`, `.yaml`, `.sh`, `.rs`, excluding `.git/`, `node_modules/`, `docs/plans/`, any `target/`, and `fixtures/legacy-regression-tree/`, and matches only inside quoted string literals: a literal containing the full declared path, or — only when that path’s basename is unique across tracked files — a literal equal to the basename or ending in `/` plus the basename. Any matching file not itself in `affected_paths` is an undeclared coupling. Markdown is out of scope, so a normative sentence naming a path is never a coupling; `references/plan-self-check-protocol.md` carries this same description. A non-empty set fails non-zero unless the author records an explicit waiver keyed to the exact `(offending file, declared path)` pair, each carrying a reason; a waiver keyed to a declared path alone is deliberately not available, because one coarse waiver would suppress every coupling of a widely-referenced module including a genuine first-order caller. The record for this plan is the declared, tracked file `scripts/config/plan-scope-waivers/plan-lifecycle-review-and-authority-modules.json`, which sits with the other author-side configuration rather than beside the plan, because the Markdown plan is the only tracked artifact under `docs/plans/`. It is per-plan by construction: a waiver naming a path the plan under check does not declare is refused. Wire it into the `dispatch-review.mjs` preflight block (`:317-345`), before bundle creation and before the reserve transaction, so a failure spends no permit. Stated limit, which belongs in the protocol reference: it detects only couplings expressed as a literal path, so a coupling carried by a symbol or tool name — for example a plugin manifest description enumerating MCP tool names — still needs judgment.

*The bounded review budget.* Step 6 replaces the renewable class budget with one comprehensive review plus, only after an accepted repair, one mandatory fresh verification. Mechanically, cited by symbol because the split moved these out of `plan-run.mjs`: `DRAFT_REVIEW_INVOCATION_LIMIT` in `runtime/plan-state.mjs` is already 2 in the bytes this run binds, so step 6 verifies that ceiling rather than editing it; draft `accepted_classes` progression is removed, so the draft arm of `assertPersistedReviewTransition` no longer unions classes and `repairing` to `reserved` is legal exactly once; the completion ceiling of two is unchanged; the transport refund path is unchanged. `accepted_classes` stays a valid field on read for historical records and is no longer written by any current transition. The accepted-class repair sweep is removed with the class budget rather than left in place: it required a `clear` verdict per accepted class, so once no transition writes that set its clearance loop ranges over nothing and only an empty ledger validates, which is a guarantee in name only. One repair plus one mandatory fresh verification discharges its purpose, because the verification re-reviews the whole plan; the `--class-sweep-ledger` input and its contract sentences go with it, while the closed finding-class vocabulary stays, since findings are still classified.

*Line and byte budgets for step 8.* Measured against the bytes this run binds, bodies are `plan-manager/SKILL.md` 277, `plan-reviewer/SKILL.md` 173, `plan-workspace/SKILL.md` 242 — combined 692. The per-file hard cap is 500 (`skill-guard.mjs:129-131`, `scripts/lib/validate-skills.mjs:128-132`) with a warn band of 80–310, so `plan-manager` has 33 lines before it warns and 223 before it fails. No validator enforcing a 700-line combined budget exists; that figure is documentary. `docs/plans/AGENTS.md` is 488 lines and is capped by `scripts/tree/guard.mjs:73-75`. It must stay byte-identical to the fenced body of the workspace template: `scripts/tests/plan-skill-phases.mjs:342-353` slices the template between its fenced markdown opener and the matching terminal fence, appends one newline, and asserts equality — the template header, preamble and fences are excluded and no indentation is added, so the template, at 496 lines, is always exactly 8 lines longer. Every edit is therefore two edits. Replacing the 12-permit sentences with one-plus-one wording is expected to be net-neutral or shorter; if any file would exceed a cap, move detail into `plan-manager/references/` — flat only, filename mentioned in `SKILL.md`, and a `## Contents` heading if the file exceeds 100 lines with three or more headings (`refs-guard.mjs:27-28`, `:95-110`); nested reference directories fail (`skill-guard.mjs:133-136`).

## Current authority and bounded review {mechanism}

One current PlanRun state Module owns the closed status and review-state vocabularies, tuple validity, substantive permit count, transport refund, reducer transitions, and persisted-edge legality. Separate Modules own current codecs, Git/source preimages, filesystem locks and compare-and-swap transactions, live review records, and read-only historical adaptation. Policy calls mechanics with already-authorized successor bytes; mechanics never decide lifecycle transitions.

Before any permit reservation, deterministic checks validate syntax, paths, manifests, step references, fixture registration, and bundle bindings. The reviewer receives one sealed bundle for judgment-only checks. A clean first result can pass. An accepted repair installs exact candidate bytes, then requires one fresh sealed-bundle verification. Any finding after that verification records terminal evidence and requires a new user-authorized successor rather than another automatic repair.

Review transport remains a direct subprocess Adapter. Reserve, dispatch, complete stdout capture, schema validation, result binding, and settle occur in one crash-aware controller. A transport-only failure can refund according to the closed state machine. Session Relay may carry an optional reference later, but no Relay row or receipt can become plan authority or review evidence.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | freeze_historical_corpus | Inventory every supported historical family and drift exception with immutable input bytes and expected codec, hash, classification, and validation outcomes. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs`; `scripts/tests/plan-orchestration/historical-characterization.mjs`; `scripts/tests/plan-orchestration.mjs` | — | `local` | `done` | Schemas 1–6 and the five known drifted records have explicit golden outcomes; any byte/hash/classification delta fails before module extraction. |
| 2 | consolidate_current_state | Create one current PlanRun state Module that owns state names, phase ceilings, reducer edges, persisted transition legality, and tuple validation. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/plan-state.mjs`; `scripts/tests/plan-orchestration/state-matrix.mjs`; `scripts/tests/plan-orchestration/review-budget.mjs` | 1 | `local` | `done` | One exported authority decides current transitions and persistence edges; deletion or mutation of an edge is detected in one state-matrix suite; no second live transition table remains. |
| 3 | version_codecs_and_history | Extract shared byte/frontmatter scanning, explicit current codec, live review records, and a closed read-only historical adapter with no ambient classification mode. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/current-codec.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/historical-adapter.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/live-review-records.mjs` | 1, 2 | `local` | `done` | Current validation is context-free; historical drift exceptions are reachable only through the adapter; finished bytes are never rewritten; golden corpus output is identical. |
| 4 | extract_transaction_mechanics | Separate Git preimages, affected manifests, lock/CAS/fsync/readback, and immutable bundle mechanics from lifecycle policy and reviewer subprocess control. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/git-preimage.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/transaction.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs` | 2, 3 | `local` | `done` | Mechanics accept already-authorized successor bytes and return evidence; policy owns when and why; exact locks, preimages, fsync, atomic rename, readback, and private raw output remain unchanged. |
| 5 | frontload_deterministic_checks | Move every script-decidable schema, path, step-reference, manifest, fixture-registration, and bundle-binding property before permit reservation and remove it from model prompts. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `scripts/tests/plan-orchestration.mjs`; `plugins/plan-lifecycle/test/selftest.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-self-check-protocol.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-properties.json` | 2, 3, 4 | `local` | `done` | Known path, dead-fixture, record-placement, scope, and binding defects fail deterministically before reserve; reviewer input contains only judgment work and a sealed bundle reference. |
| 6 | bound_repair_verification | Replace the renewable draft class budget with one comprehensive review and, only after an accepted repair, one mandatory fresh sealed-bundle verification; preserve transport refunds. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/plan-state.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planrunv1-schema.md`; `scripts/tests/plan-orchestration/review-budget.mjs`; `scripts/tests/plan-orchestration/state-matrix.mjs`; `scripts/tests/plan-orchestration/mutations.mjs`; `scripts/tests/plan-orchestration/fixtures/plan-run-v1.mjs`; `scripts/tests/plan-dispatch-probes.mjs`; `scripts/tests/plan-queue.mjs` | 5 | `local` | `done` | A clean first pass plans; an accepted repair consumes one fresh verification; any repeated or new finding after repair terminally records evidence and requires a successor; transport failure refunds without spending either substantive invocation. |
| 7 | keep_direct_transport | Keep direct reviewer subprocess dispatch normative and formalize a transport Adapter contract without adding a Relay dependency. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md`; `plugins/plan-lifecycle/agents/plan-reviewer.md`; `.codex/agents/plan-reviewer.toml` | 4, 5, 6 | `local` | `done` | Reserve→dispatch→capture→validate→settle works without Relay; raw output is persisted and re-read; no transport status can mutate PlanRun without validated bound bytes. |
| 8 | synchronize_public_contract | Update the three skills, workspace template, repository plan contract, wrappers, root routing, and validators as one byte-consistent review-budget cutover. | `AGENTS.md`; `docs/plans/AGENTS.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md`; `plugins/plan-lifecycle/agents/plan-reviewer.md`; `.codex/agents/plan-reviewer.toml`; `scripts/AGENTS.md`; `scripts/tests/plan-skill-phases.mjs` | 6, 7 | `local` | `done` | Every normative copy states one initial review plus one repair verification, transport-only retry, historical isolation, and direct transport; validators fail on any copy drift. |
| 9 | repair_scope_closure_and_waiver_key | Verify and record the two remedial edits already present in the working tree, and remove the sweep that removing the class budget left vacuous: a directory read replaces the hand-maintained PlanRun copy closure in the Session Relay release-evidence contract, the scope-waiver key is the exact `(offending file, declared path)` pair, and the accepted-class repair sweep and its ledger input are gone. | `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-properties.json`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-self-check-protocol.md`; `scripts/tests/plan-orchestration/plan-self-check.mjs`; `scripts/tests/plan-evidence-probes.mjs`; `plugins/session-relay/test/remediation-contract.mjs`; `plugins/session-relay/test/release-promotion-contract.mjs`; `scripts/config/plan-scope-waivers/plan-lifecycle-review-and-authority-modules.json` | 8 | `local` | `done` | A fixture tree that copies the PlanRun facade resolves every `runtime/` module, so a seventh module cannot silently break it; one waiver clears exactly one file/path coupling and leaves every sibling coupling of the same declared path reported; the declared waiver record makes `scriptChecks` P21 return pass for this plan with every entry carrying a reason, so the plan does not block its own dispatch; `node scripts/ci.mjs` exits 0. Failure: STOP and record terminal evidence rather than widening a waiver. |
| 10 | prove_plan_lifecycle | Run historical, current-state, dispatch, self-check, wrapper, plugin, and full shared-tooling gates against the final bytes. |  `.codex/agents/plan-reviewer.toml`; `AGENTS.md`; `docs/plans/AGENTS.md`; `plugins/docks/skills/engineering/refactor/SKILL.md`; `plugins/docks/skills/engineering/security/SKILL.md`; `plugins/docks/skills/productivity/context-tree/SKILL.md`; `plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md`; `plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md`; `plugins/effect-kit/skills/engineering/effect-ts-setup/SKILL.md`; `plugins/plan-lifecycle/.claude-plugin/plugin.json`; `plugins/plan-lifecycle/.codex-plugin/plugin.json`; `plugins/plan-lifecycle/agents/plan-reviewer.md`; `plugins/plan-lifecycle/compatibility.json`; `plugins/plan-lifecycle/skills/AGENTS.md`; `plugins/plan-lifecycle/skills/CLAUDE.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-self-check-protocol.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planqueuev1-schema.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planrunv1-schema.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-measurements.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-properties.json`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/sample-review.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-queue.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/current-codec.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/git-preimage.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/historical-adapter.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/live-review-records.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/plan-state.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/transaction.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts/review-policy.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md`; `plugins/plan-lifecycle/test/selftest.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/session-relay/test/release-promotion-contract.mjs`; `plugins/session-relay/test/remediation-contract.mjs`; `scripts/AGENTS.md`; `scripts/ci.mjs`; `scripts/config/plan-scope-waivers/plan-lifecycle-review-and-authority-modules.json`; `scripts/config/test-contracts.json`; `scripts/lib/plugins.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/tests/plan-dispatch-probes.mjs`; `scripts/tests/plan-evidence-probes.mjs`; `scripts/tests/plan-orchestration.mjs`; `scripts/tests/plan-orchestration/external-authority.mjs`; `scripts/tests/plan-orchestration/fixtures/historical-inventory.json`; `scripts/tests/plan-orchestration/fixtures/historical-records.mjs`; `scripts/tests/plan-orchestration/fixtures/legacy-plans.mjs`; `scripts/tests/plan-orchestration/fixtures/plan-run-v1.mjs`; `scripts/tests/plan-orchestration/harness.mjs`; `scripts/tests/plan-orchestration/hashing-manifests.mjs`; `scripts/tests/plan-orchestration/historical-characterization.mjs`; `scripts/tests/plan-orchestration/historical-malformed-corpus.mjs`; `scripts/tests/plan-orchestration/legacy-quarantine.mjs`; `scripts/tests/plan-orchestration/locks-cas.mjs`; `scripts/tests/plan-orchestration/mutations.mjs`; `scripts/tests/plan-orchestration/plan-self-check.mjs`; `scripts/tests/plan-orchestration/review-budget.mjs`; `scripts/tests/plan-orchestration/session-relay-terminal-correction-successor.mjs`; `scripts/tests/plan-orchestration/state-matrix.mjs`; `scripts/tests/plan-queue.mjs`; `scripts/tests/plan-skill-phases.mjs`; `scripts/tests/test-contracts.mjs`  | 9 | `local` | `planned` | All named acceptance commands pass; a golden historical delta, duplicate live authority, unverified repair, dead fixture, or hidden Relay dependency makes its owner test fail. |

## Acceptance criteria

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs --case historical` | Exit 0; every supported historical family and drift exception retains exact codec, hash, classification, and validation outcomes. |
| A2 | `node scripts/tests/plan-orchestration.mjs --case review-budget` | Exit 0; clean pass, one repair plus mandatory verification, repeated/new post-repair findings, and transport refunds follow the new closed state matrix. |
| A3 | `node scripts/tests/plan-orchestration.mjs --case plan-self-check && node scripts/tests/plan-orchestration.mjs --case dispatch-driver` | Exit 0; deterministic properties fail before reserve, judgment-only bundles remain private, direct dispatch captures complete raw output, and the `dispatch-driver` case that scans the shipped payload for a Session Relay import specifier or manifest dependency entry reports none, so the independence claim is observed rather than asserted. |
| A4 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows && node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0; all skill/template/wrapper copies and shipped PlanRun machinery agree on the closed review and historical contracts. |
| A5 | `node scripts/ci.mjs` | Exit 0; repository-wide plan tooling, all four plugins, format, lint, and routing contracts pass after the public-contract cutover. |

## Out of scope / do-NOT-touch

- Do not implement or distribute a Rust `planctl` CLI in this plan.
- Do not add a Session Relay dependency or accept Relay state as review evidence.
- Do not rewrite, auto-canonicalize, or delete finished historical plan bytes.
- Do not remove fresh verification after any accepted repair.
- Do not relax filesystem lock, CAS, fsync, atomic rename, Git preimage, authority, or private-output guarantees.
- Do not add review scores, finding quotas, automatic provider fallbacks, or renewable successor loops.

## STOP conditions

1. The historical golden corpus is incomplete or any supported byte/hash/classification outcome changes.
2. More than one current Module can authorize the same PlanRun transition or persisted edge.
3. A script-decidable defect can still spend a reviewer permit or a model check duplicates deterministic output.
4. An accepted repair can pass without a fresh sealed-bundle verification or a post-repair finding can renew automatically.
5. Direct subprocess review fails when Relay is unavailable or any unvalidated transport status can settle PlanRun.
6. Full CI fails after focused plan-lifecycle checks pass.

## Open questions

None. Rust remains a future pilot only after a reproducible Node contention/correctness defect or committed non-Node consumer; any optional Relay transport requires a separate plan after Relay vNext.

## Review

N/A — manager-written after draft review.

Plan-attempt-history: {"authorization_source_sha256":"663e99f4ee66d3874c6ae840db77aa6b4d119ae21106f0ba8f58332a339704e1","plan_bytes_sha256":"03fc520a1e301dde2d5d66fe72d7bb10b96e3f2f1dcb8f5b6a2e13c31185af94","replacement_run_id":"3a776ee7-0e0a-4001-80f8-eed4cc1ea65e","run":{"acceptance":null,"blocker":{"evidence_sha256":"b7f154462c0b940f49d22c537f629c2641a46a6882cb56966ea218e3f4d0f743","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"ad499dab126c39ca5969494cd2fa5d9dad6a502d3c4657bcd5438304a3bc40d5","invocations":1,"result_sha256":"654e7d293ee0a07a2407232695262809dd0dddb06841539532d35e08de9bd819","state":"passed"},"execution_parent":null,"goal_id":"248e3f50-2528-4dd3-b92c-d0373f702d65","implementation_commit":null,"plan_path":"docs/plans/active/plan-lifecycle-review-and-authority-modules.md","plan_sha256":"489b1c50d933843c0314eb3989a6c95066b866c11ea1ee9acf163ef7993f830e","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"2ac1d5f2-4bf1-4185-a911-7d087c357a42","schema":1,"source_base":"672246bd388d3f34475be70857e3ec0dcb222b23","source_sha256":"9535302dca0e75019ab39b611cc3a1290eb9c7b52aecc435fef30f9a89ba9a59"},"schema":1,"status":"blocked","successor_run_sha256":"e032ee611446a68d392e467089079e759fd678cd89065883522647505b4acf03"}

The predecessor passed draft review but under-declared its scope: `affected_paths` named the modules the extraction creates and none of the eleven callers and contract mirrors that import `plan-run.mjs`, resolve it by path, or restate the `accepted_classes` progression steps 2–6 remove. Because `affected_paths` sits inside `canonicalPlanView` and a passed draft review has no outgoing transition, no in-place amendment was legal. This successor owns the complete plan-lifecycle plugin, the whole plan-orchestration test tree, every plan-* test entry point and the named external couplings — 69 paths — and its step 5 makes exactly this class of omission fail deterministically before a permit is reserved.

Plan-attempt-history: {"authorization_source_sha256":"c773d2aa87e6a8333c7e0e988d37dd72f3fbdd3de29c5038b28205d183472537","plan_bytes_sha256":"eac96c097daa0c9260b001eaf008e2c3945babe279f0b5190d8880fff2c9b85d","replacement_run_id":"5d52a4a0-26a3-45a8-84b6-dafc940d6a93","run":{"acceptance":null,"blocker":{"evidence_sha256":"98930f60906ead1cc51f7eee48e78a7f06aa6a76b5a006f801a0a42f1067ea53","kind":"verification_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"4585ab21067b697d700dbad8493cd028334a650d5b9687d4e57f35e735edfd70","invocations":1,"result_sha256":"aa7605e75bd21fdc5731744286fb35f23f356bba97c5efe130478aadcdf6a5a6","state":"passed"},"execution_parent":"d037cbf704bb73d31e320dd139a57147c2554959","goal_id":"248e3f50-2528-4dd3-b92c-d0373f702d65","implementation_commit":null,"plan_path":"docs/plans/active/plan-lifecycle-review-and-authority-modules.md","plan_sha256":"11cd61c44fbba36fc11a3652382e24ddc6676f2ac46b986a4ab1adfcc7cde86a","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"3a776ee7-0e0a-4001-80f8-eed4cc1ea65e","schema":1,"source_base":"d037cbf704bb73d31e320dd139a57147c2554959","source_sha256":"6a9096546a7375113d66bf46b540818bc1f5a6cfd4b79e8ce17018e44059effa"},"schema":1,"status":"blocked","successor_run_sha256":"899cde34077ba77faeb276fff51daebaf16bb28fed8fa67241c338180a8d6b8f"}

The second predecessor implemented all nine steps and passed A1–A4, but A5 failed: `plugins/session-relay/test/release-evidence-contract.mjs` carries a hand-maintained copy closure naming `plan-run.mjs` alone, so the extracted facade could not resolve its six `runtime/` modules inside that fixture tree. The file was a first-order caller and was undeclared. This plan’s own step-5 check reported it; a scope waiver keyed by declared path suppressed it along with two genuine second-order hits. The successor declares that path, replaces the hand-listed closure with a directory read, and narrows waivers to an exact `(file, declared path)` pair so a coarse waiver can never hide a true positive again.

Plan-attempt-history: {"authorization_source_sha256":"c34bfe566da7400d9946b19e325139f92eadc881650b0bfb3daeb2b95a8b099d","plan_bytes_sha256":"29f443b1a376a4908487b6f1d751dc5974a0f7fbe507dd7b6811329f73ed3baf","replacement_run_id":"b602145d-3edc-4859-af1a-66b7f3da3bcb","run":{"acceptance":null,"blocker":{"evidence_sha256":"3ba9ae85dfd365ba0f6711cd2497f7fe04a2fd7b625574b84d2314c2d5db06d8","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"cf345863bff32d4bac1c5cda28ace640944b72592f725743a76e4eb0edd4ff73","invocations":1,"result_sha256":"3ba9ae85dfd365ba0f6711cd2497f7fe04a2fd7b625574b84d2314c2d5db06d8","state":"blocked"},"execution_parent":null,"goal_id":"248e3f50-2528-4dd3-b92c-d0373f702d65","implementation_commit":null,"plan_path":"docs/plans/active/plan-lifecycle-review-and-authority-modules.md","plan_sha256":"45cfbe9b03572df3e9bdb560d6e056aabd35c37fa3e9f3f881e880f3d2bd7fb3","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"5d52a4a0-26a3-45a8-84b6-dafc940d6a93","schema":1,"source_base":"dc42814a34d516b945924359c7dbf3bd00818276","source_sha256":"3eb1fb7d0b76c2c594c0cd0e74017057586d759f4cc71f08b2e144e6b74c2c88"},"schema":1,"status":"blocked","successor_run_sha256":"e3b02e191daa9da252c9f9169d527f540b9fe631f1e14c1819f3c91c3592f4f1"}

The third predecessor was blocked by review transport, not by a verdict: the shipped reviewer route returned `usage_limit_reached`, and a second route replied off-contract without the bound `run_id`, which is a terminal second transport failure at sensitive risk. An offline review over the same sealed bundle, spending no permit, then returned two findings and both were accepted. The step-5 mechanism paragraph authorised a per-declared-path waiver while this section required an exact pair, so an executor following the paragraph would have rebuilt the suppression that terminated the previous run; one waiver form is now stated in both places. No step owned the two remedial edits, so they were not executable work; step 9 now owns them and the gate step is 10. The bytes for steps 1–9 are already present and uncommitted in the working tree at `source_base` `dc42814a34d516b945924359c7dbf3bd00818276`, inherited from the predecessor runs: steps 1–8 from `3a776ee7-0e0a-4001-80f8-eed4cc1ea65e`, and step 9’s two remedial edits from the work that followed its terminal block. Step 9 therefore verifies and records bytes that exist rather than writing them from nothing, and its done condition is written that way. The Status column is reset to `planned` because it records progress under this run, not under its predecessors, and `implementation_commit` stays null until this run binds it at its own implementation checkpoint. The one repair round this budget allows also removed the accepted-class sweep, which removing the class budget had left vacuous.

## Verification Results

Observed on this host, Node 24, from the repository root against the final implementation bytes.

| ID | Command | Observed result |
|---|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs --case historical` | Exit 0; 11/11. Schemas 1-6 stay explicitly enumerated in the golden matrix, and step 1 added 25 SHA-256 oracles: 20 tracked machine-record plans plus the five named drift exceptions asserted as a closed set. |
| A2 | `node scripts/tests/plan-orchestration.mjs --case review-budget` | Exit 0; 23/23, from a baseline of 25: four cases proving class-vocabulary renewal were deleted as obsolete, two were added for the new ceiling and the persisted refund. A clean first pass plans, one repair is accepted, a second terminal-blocks, and a transport failure refunds without spending a substantive invocation. |
| A3 | `node scripts/tests/plan-orchestration.mjs --case plan-self-check && node scripts/tests/plan-orchestration.mjs --case dispatch-driver` | Exit 0; 36/36 then 13/13. P21 fails a scope defect before bundle creation and before reserve, the sealed prompt carries only bundle identity and the judgment contract, and the payload is scanned for a Session Relay import specifier or manifest dependency entry with none found. |
| A4 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows && node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 for both. Ten normative copies agree on one initial review plus one mandatory post-repair verification, and `docs/plans/AGENTS.md` at 488 lines is byte-identical to the fenced body of the 496-line workspace template. |
| A5 | `node scripts/ci.mjs` | Exit 0 on commit 28135d3ec20ea0592d3e7584099d5a071b13cd49, all four plugins plus repo-wide, format and lint. Three failures it surfaced are all fixed and are why this row is the authoritative gate: a fixture tree copying the facade without its runtime modules, a committed measurement producer pinned to the pre-split `plan-run.mjs` path, and a stale index entry after an amend. |

The new pre-reserve scope check, proven end to end outside this repository: a plan declaring
`src/lib.mjs` while `src/mirror.mjs` names it literally exits 1 naming the exact coupling, and
adding the coupling to `affected_paths` exits 0. Driving `dispatch-review.mjs` at the defective
plan exits 2 with the preflight message, leaves `draft_review.invocations` at 0, and creates no
bundle directory, so no permit is spent. Against this plan's own 73 declared paths it reports 0
unwaived couplings with 65 reasoned waivers, each keyed to an exact offending-file and
declared-path pair.

Measured limits, recorded rather than overclaimed: on the predecessor's 26-path declaration the
check catches 7 of the 11 real omissions. It misses couplings expressed through a symbol rather
than a path, an import of a module that is itself undeclared, and Markdown contract mirrors, which
are out of scope so that the independence and budget sentences steps 7 and 8 synchronize are never
their own violations.

The completion review returned `repair` at invocation 1 with three findings, all reproduced and all
accepted. Two were contract copies still naming the discarded waiver key: the P21 property
statement in `lifecycle/plan-properties.json` and the `--scope-waivers` help text in
`dispatch-review.mjs` both said the waiver is keyed to a declared path alone, while the enforced key
is the exact offending-file and declared-path pair. The third was six header comments in
`dispatch-review.mjs` citing `plan-run.mjs` line numbers that this commit itself erased when that
file became a 33-line facade; each now names the module that owns the code instead of a line. All
three are the symbol-carried and prose-carried coupling class P21 cannot detect, which is why the
plan assigns them to review judgment. The implementation checkpoint was amended in place rather
than followed by a fourth commit, `replace_implementation` rebound the run to the replacement SHA
and cleared the stale acceptance, and every invalidated check was re-run before acceptance was
re-minted for invocation 2.

| Mechanism | Mutation that must fail the suite |
|---|---|
| Schema 1-6 golden matrix | drop `6` from `schema_matrix.policy`, so A1 fails the deepEqual |
| Tracked classification golden | invert the `RECORD` condition in `trackedRecordOutcomes`, so A1 fails naming the plan |
| Per-record byte oracle | flip one byte of a tracked historical plan, so A1 fails naming the record and both digests |
| Ambient historical mode confined to the adapter | set the `legacyClassificationDepth` initialiser to 1, so legacy-quarantine fails the outside-scope and depth-restore cases |
| Finished bytes never rewritten | make `migrateLegacyPlan` return `bytes` instead of the migrated buffer, so legacy-quarantine fails four cases |
| Successor mode guard | neutralise the `plan_hash_mode` guard in `replacePlanRunInPlace`, so locks-cas fails unmarked-successor rejection |
| Plan compare-and-swap preimage | neutralise the preimage comparison in `transactPlanRun`, so locks-cas fails |
| Repository preimage | neutralise the comparison in `withRepositoryTransaction`, so locks-cas fails |
| Review transition edge | delete the `REVIEW_TRANSITIONS` entry for `reserved`, so state-matrix fails the persisted edge |
| Lifecycle transition edge | delete the `LIFECYCLE_TRANSITIONS` entry for `ongoing`, so state-matrix fails two persisted edges |
| Closed review edge set | widen `passed` to include `reserved`, so state-matrix fails the closed-edge-set case |
| Clean first pass | make `review_passed` persist `repairing`, so A2 fails |
| Draft ceiling of exactly two | change `DRAFT_REVIEW_INVOCATION_LIMIT` from 2 to 3, so A2 fails because a third reserve is accepted |
| Post-repair terminal block | remove the ceiling comparison in the draft repair arm, so A2 fails |
| Persisted transport refund | change the refund predicate to `before.invocations`, so A2 fails inside `assertPersistedReviewTransition` rather than only in the reducer |
| Declared-path property P13 | force P13's untouched set empty, so A3 plan-self-check fails |
| Undeclared-coupling property P21 | make the unwaived condition never fire, so A3 plan-self-check fails |
| Settlement branch | invert the pass-verdict settlement condition, so `settle-binding` fails |
| Raw output persistence | write an empty buffer to the raw stdout file, so `stdout-persistence` fails |
| Session Relay independence | add a lazy unexecuted `session-relay` import specifier, or a manifest dependency entry, so A3 dispatch-driver fails |

Every row was applied in place, observed red, restored from a byte-for-byte backup verified by
SHA-256 comparison, and observed green again at the same count. After the whole pass all 73
declared paths hashed identical to their pre-mutation snapshot, and
`git status --porcelain -- scripts/tests/plan-orchestration/fixtures/legacy-regression-tree`
printed nothing, so the 28 frozen historical files are untouched.

Nine `Done when` nouns had no covering assertion before this work and were recorded as such rather
than assumed: the byte and hash oracle, four transition-authority nouns, fsync, atomic rename,
readback, and five of the eight public-contract copy nouns. Step 1 closed the oracle, step 2's
suite closed all four transition nouns, and steps 7 and 8 closed the copy nouns. Fsync, atomic
rename and readback remain unobserved by any assertion and are named here as limits, not as
guarantees.

## Retirement

The v2 plan-lifecycle redesign in `plan-lifecycle-redesign` supersedes this goal.
The goal is unreachable because the redesign deletes the modules this plan targets.
The frontmatter status remains deliberately unsettled because this run never completed.
