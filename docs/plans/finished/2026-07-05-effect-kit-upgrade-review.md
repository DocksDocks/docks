---
title: effect-kit post-migration review + upgrade roadmap
goal: After the migration lands, audit the three Effect skills' current state (API currency, descriptions, conventions) against live Effect 3.x docs and docks conventions, then propose and ship an agreed upgrade round.
status: finished
created: "2026-07-03T17:07:03-03:00"
updated: "2026-07-05T19:55:00-03:00"
started_at: "2026-07-05T16:36:25-03:00"
in_review_since: "2026-07-05T17:40:17-03:00"
ship_commit: "2e5ae8d6e0e0a74b4fb0e0cd90f3c4f2ac52cc0d"
assignee: claude
tags: [effect-kit, audit, effect-ts, upgrade]
affected_paths:
  - plugins/effect-kit/skills/engineering/effect-ts-setup/
  - plugins/effect-kit/skills/engineering/effect-ts-specialist/
  - plugins/effect-kit/skills/engineering/effect-ts-port/
  - plugins/effect-kit/skills/AGENTS.md
related_plans: [effect-kit-migration]
review_status: passed
planned_at_commit: "08c8e06c6a3b18e255c7bb702366738051fb11fd"
---

# effect-kit post-migration review + upgrade roadmap

## Goal

The migration plan deliberately moves the payload byte-faithfully — content quality is THIS plan's job. effect-kit's skills were authored ~June 2026 against Effect 3.x and haven't been audited since; they also predate the docks conventions that landed after (durable anchors, behavior-claim exercising cues, the near-miss description pass against docks siblings). Audit first, then propose an upgrade round the user picks from, then ship it as an effect-kit release.

**Blocked-by-design on [[effect-kit-migration]]**: do not start until that plan is `finished` — every path below assumes `plugins/effect-kit/` exists in this repo and is CI-green.

## Context & rationale

- **Why a separate plan** (maintainer decision, 2026-07-03): migration diff stays mechanical/reviewable; content changes get their own review cycle and release.
- **Effect-only scope** (maintainer decision, 2026-07-03): effect-kit is and stays an Effect-TS-only plugin. Every audit finding, fix, and step-4 roadmap candidate must target the Effect ecosystem (the `effect` package and official `Effect-TS`-org `@effect/*` / `@effect-atom/*` packages). Anything non-Effect that surfaces during the audit routes to docks (or a future plugin of its own) as a follow-up — it is never added here.
- **No pre-researched claims in this draft**: the version-specific package names cited here are quoted from effect-kit's own `skills/AGENTS.md` grounding rule, not from memory. ALL currency judgments happen in step 1 against live docs (context7 / effect.website) — nothing in this plan pre-decides what is stale or what is missing.
- **Known deferred item inherited from migration**: cross-plugin trigger near-misses — the mechanical collision test is per-plugin only, so effect-ts-* descriptions were never checked against docks' engineering siblings (typescript/react/test skills share vocabulary).
- **Known starting scores**: effect-ts-port 16, effect-ts-setup 14, effect-ts-specialist 16 (docks bundled scorer, engineering floor 10) — headroom exists on setup.
- **The skills' own grounding rule** (from their node): version-specific API claims (`effect/Schema`, `@effect/platform` HttpApi, `@effect-atom/atom-react`) must be verified against current docs before changing — this plan's audit step IS that verification, run via context7/official docs, never from training data.
- **Step-4 selections** (user via picker, 2026-07-05): all three audit-grounded additions — `http-api` reference + `effect-rpc` reference (effect-ts-port), `atom-lifecycle` expansion of react.md; **release**: ship effect-kit minor once they land. Content grounded in fresh research (platform 0.96.2, rpc 0.75.1, atom-react 0.5.0 — README/source-verified 2026-07-05).

## Environment & how-to-run

Requires [[effect-kit-migration]] shipped. Gates: `node scripts/ci.mjs --plugin effect-kit` · scorer `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/effect-kit/skills` · hash sync `node scripts/skills/content-hash.mjs --backfill plugins/effect-kit/skills` · docs research via context7 (`resolve-library-id` → `query-docs` for effect, @effect/platform, @effect-atom/atom-react) with WebFetch on effect.website as fallback · release `node scripts/release.mjs --plugin effect-kit minor` (user-gated).

Review-base note: scaffolded at `2fb11fab` (pre-migration, by design — the plugin didn't exist in-repo yet). On Start, `planned_at_commit` was re-baselined to the HEAD current at start: the completion review diffs `planned_at_commit..HEAD`, and the pre-migration base would wrongly ingest the entire effect-kit migration diff as this plan's work.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | API-currency audit: for each of the 3 skills + 12 references, verify every version-specific claim against CURRENT Effect 3.x docs (context7 first); classify findings per the content-audit taxonomy (confirmed / drifted / stale-snippet / fictional-api) with the claim text + the doc evidence | audit notes in this plan's `## Notes` | — | done |
| 2 | Conventions audit: durable-anchors pass (guard already enforces `path:NN`; manually check for uncued volatile facts + behavior claims without exercising probes), description CSO + manual near-miss pass against docks engineering siblings (3 near-miss prompts each, routing via "Not for…" clauses) | same | — | done |
| 3 | Fix round: apply every `drifted`/`stale-snippet`/`fictional-api` finding + convention gaps; lift effect-ts-setup toward 16 only if the rubric points are honest content (never padding); bump `metadata.updated` + hash backfill | the 3 skill dirs | 1,2 | done |
| 4 | Upgrade roadmap (Effect-only): propose candidate additions grounded in audit gaps — Effect-ecosystem surfaces the skills don't cover, derived from step-1 evidence against live docs, never assumed from memory; each candidate names its official package + the doc page proving it exists. Present via the open-questions picker; implement ONLY what the user selects; non-Effect ideas are recorded as follow-ups elsewhere, never implemented here | proposal in `## Open questions`, then chosen dirs | 1,2 | done |
| 5 | Gates + release: `node scripts/ci.mjs` exit 0; release `effect-kit` minor (user-gated picker) | manifests via release.mjs | 3,4 | done |

## Acceptance criteria

- Every version-specific API claim in the 3 skills carries either a confirmation (evidence in `## Notes`: claim → doc source) or a fix commit — zero unchecked claims (count them in step 1; the audit table in `## Notes` is the record).
- `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/effect-kit/skills` → all ≥ pre-audit scores (no regressions; setup's uplift is optional, honest-only).
- Near-miss table (≥3 prompts per skill vs docks siblings) recorded in `## Notes`; any unrouted pair fixed via a "Not for…" clause in the description.
- `node scripts/ci.mjs` → exit 0.
- Step-4 additions: each shipped item was explicitly picked by the user; nothing implemented from the proposal silently.

## Out of scope / do-NOT-touch

- The migration mechanics (registry, catalogs, node wiring) — [[effect-kit-migration]]'s territory; if the audit finds a migration defect, file it back as a finding, don't fix silently here.
- docks / session-relay skills — even where a near-miss fix could also be made on the docks side, prefer the effect-kit description; touching a docks skill triggers its own release cycle (flag it as a follow-up instead).
- Rewriting skills to new Effect MAJORS (4.x if it exists by then) — that's a rewrite plan, not an audit; this plan tracks 3.x currency only.
- Anything outside the Effect ecosystem — no general-TypeScript, framework, or tooling skills land in effect-kit; the plugin's scope is Effect-TS, full stop. Non-Effect candidates the audit surfaces become follow-up notes for docks or a new plugin.

## Known gotchas

- context7 may resolve multiple effect libraries — pin to the official Effect-TS org libraries; cross-check surprising claims against effect.website before editing.
- The skills' example code blocks are teaching artifacts — verify the APIs they call exist, but don't churn style; surgical fixes only.
- Every content edit needs `metadata.updated` + hash backfill or the idempotency gate fails.

## STOP conditions

- If a content fix drops any skill below its baseline (port 16 / setup 14 / specialist 16) or breaks `node scripts/ci.mjs`, revert that specific edit and re-audit the claim before re-applying — never lower a baseline or loosen a validator to pass.

## Cold-handoff checklist

1–9: file manifest ✓ · environment & commands ✓ (incl. research tooling) · contracts ✓ (audit taxonomy + evidence-table shape) · executable acceptance ✓ · out-of-scope ✓ · rationale ✓ · gotchas ✓ · constraints ✓ (user-picked additions only; blocked on migration) · no TBDs — step 4's candidates are derived at execution time by design, recorded as such ✓.

## Self-review

Score: 87/100 (normal tier, one pass — first score ≥85, no hill-climb). Strongest: executable acceptance (audit-evidence table + scorer non-regression + user-picked-only additions) and the explicit blocked-on-migration gate. Known softness, accepted by design: step 4's upgrade candidates are derived from step-1 evidence at execution time rather than pre-enumerated — pre-guessing Effect surface gaps from memory would violate the research-before-implementation rule the skills themselves mandate.

Fresh-context draft review (plan-review Mode 0, 2026-07-05, at start): 88/100 — verdict "start after edits". Applied: `planned_at_commit` re-baselined to post-migration HEAD (completion-review diff integrity), baseline scorer source made in-repo/re-runnable, STOP condition added for the mutating steps.

## Review

- **Goal met:** yes — all 5 acceptance criteria verified against the `08c8e06..HEAD` diff: 167-claim audit recorded in `## Notes` with zero unchecked; all 10 defects (4 drifted + 6 stale-snippet) reproduced-fixed in the fix round (85b5e78); scorer holds baselines port 16 / setup 14 / specialist 16 (ran this turn, no regression); step-4 additions (http-api.md, effect-rpc.md, react.md lifecycle/SSR) match the user picker recorded in `## Context & rationale`, nothing extra; `node scripts/ci.mjs` exit 0.
- **Regressions:** none — every changed file is under `plugins/effect-kit/` + the 3 release manifests + this plan file; no docks/session-relay skill touched (Out-of-scope honored). `affected_paths` lists `plugins/effect-kit/skills/AGENTS.md` but it was not modified — a benign planned-but-unneeded touch, not drift.
- **CI:** pass — `node scripts/ci.mjs` exit 0 (3 plugins + repo-wide; "effect-kit no unrouted high-overlap skill pair" and "effect-kit skill content_hash in sync" both green).
- **Follow-ups:** none required to ship — routed items already recorded in `## Notes` (docks `tdd-workflow` migration-exclusion clause; docks-side Next.js sync-`params` currency sweep; TypeScript-currency checks). Suggested slugs if adopted: `docks-tdd-migration-exclusion`, `docks-nextjs-params-currency-sweep`.
- Filed by: plan-review · 2026-07-05T17:41:00-03:00

## Notes

### Step 1 — API-currency audit record (2026-07-05; 4 parallel fresh-context auditors; evidence fetched that session via context7, effect.website, Effect-TS GitHub, npm registry)

**Totals: 167 claims checked — 157 confirmed · 4 drifted · 6 stale-snippet · 0 fictional-api. Zero unchecked.**
Ecosystem status at audit: npm `effect@latest` = 3.21.4; v4 exists only under the `beta` dist-tag (4.0.0-beta.93; codebase `Effect-TS/effect-smol`) → the kit's "Effect 3.x stable" stance holds unchanged.

#### effect-ts-setup — 36 claims, 36 confirmed, 0 defects

| file:lines | claims (n) | verified against |
|---|---|---|
| SKILL.md:20 | 3.x-unpinned install resolves 3.x; `effect/Schema` not `@effect/schema` (folded 3.10); clone `Effect-TS/effect` not `effect-smol` (3) | npm dist-tags; Effect 3.10 release blog; effect-smol repo description |
| SKILL.md:64-72 | dep matrix — `effect` always; CLI `+@effect/cli @effect/platform-node`; HTTP `+@effect/platform`; React `+@effect-atom/atom-react`; tests `-D @effect/vitest vitest`; install cmd (6) | installation docs; @effect/cli README; platform introduction; npm registry (atom-react v0.5.0, effect-atom org — allowed by kit rule) |
| SKILL.md:79,104,106,124,143-146 | LS edit+build diagnostics; agent-block API names; `effect-solutions` CLI (3rd-party, exists, `show` verb); clone cmd; `prepare` patch rationale; `typescript.tsdk`; effect-smol warning (7) | language-service README; runtime/configuration/creating-effects/requirements docs; kitlangton/effect-solutions npm+repo |
| language-service.md:3-70 | install; `$schema` URL (fetched, parses); plugin entry; 9 options (subset — README documents ~17 more, file's "start bare" framing tolerates); tsdk settings; patch enables `tsc` diagnostics incl. `noEmit`; `patch` verb; prepare script; 10 CLI verbs (all present); `@effect-diagnostics` comment forms; 22 diagnostic rule names (all present; `globalRandom` exact); refactors/codegens list (16) | Effect-TS/language-service README + effect.website devtools page |
| tsconfig.md:7-72 + SKILL.md:91-93 | baseline flags (Effect mandates `strict`, recommends `exactOptionalPropertyTypes` + TS ≥5.4; rest valid generic TS opinion); EOPT load-bearing for Schema optionals; editor recap; monorepo composite + shared-base plugin (4) | installation + schema introduction docs; devtools page (`tsc --build --noEmit` flag combo → TypeScript follow-up below) |

#### effect-ts-specialist — 66 claims: 62 confirmed · 2 drifted · 2 stale-snippet

Confirmed (62), condensed claim → doc source:

| file:lines | claims (n) | verified against |
|---|---|---|
| SKILL.md:16-128 | Schema-in-core (3.10); effect-solutions `list`/`show`; `Effect.tryPromise({try,catch})` typed failure; `Effect.orDie`; LSP `multipleEffectProvide`/`leakingRequirements`/`strictEffectProvide`; `Effect.Service` shape (Tag + `Default`, `dependencies`); `ManagedRuntime.make`+`runPromise`; `acquireRelease`+`Layer.scoped`; `it.effect`+TestClock; `Layer.merge/provide/provideMerge` + ref-identity memoization; `Data.TaggedError` form; error-instance-as-failing-Effect; `catchTag`/`catchTags`; `tryCatchInEffectGen`; `Schema.TaggedError`+HttpApi status mapping; `scopeInLayerEffect`; `processEnvInEffect`; `decodeUnknown`/`parseJson`; LS plugin install (19) | 3.10 blog; kitlangton repo; creating-effects/batching; Effect/Layer/ManagedRuntime API refs; layers + layer-memoization docs; yieldable-errors; expected-errors; schema/classes; HttpApi docs; language-service README |
| config.md:10-73 | `Config.integer/string/boolean/duration/url/redacted`; `Redacted` never printed + `Redacted.value`; `withDefault`; `orElse`; `all`+`nested`; Config extends Effect failing `ConfigError`; Service+`Config.all` idiom; `Layer.succeed`+`Redacted.make`; `fromEnv` default; `fromMap`+`withConfigProvider`; `Layer.setConfigProvider` (11) | Config/Redacted/Layer/Effect API refs + configuration docs |
| data-modeling.md:3-95 (less :63) | Schema-in-core; `Schema.Class` (`make` validates); `DateFromString` (lenient nuance — no drift, file doesn't claim rejection); `TaggedClass`+`Union`; `Schema.Schema.Type`; `Match.type/tag/exhaustive`; `brand` → `string & Brand<…>`; `decodeUnknown` → `Effect<A, ParseError>`; `parseJson` decode; `encode`; `int/between/pattern`; `Struct`/`Literal`/`optionalWith{default}`/`optional`; `transform`; effectful-decode warning; `TaggedStruct` (15) | Schema API ref; schema basic-usage/advanced-usage/filters/transformations; pattern-matching docs |
| error-handling.md:6-88 (less :78-79) | defects bubble as `Cause.Die`; both TaggedError forms; no-catch → `UnknownException`; `Effect.try`; `catchTag`/`catchTags`; `zipRight` (weak — API module only); `mapError`; `catchAll`/`orElse`/`catchAllCause`; `orDie`/`orDieWith`; `timeout` → TimeoutException + duration strings (10) | cause/yieldable-errors/expected-errors/fallback docs; Effect API ref; timing-out docs |
| running-effects.md:12-71 | `runPromise`/`runPromiseExit`/`runFork`/`runSync` semantics; ManagedRuntime mirrors run* + `dispose`; `runtime()` → Promise; `acquireRelease`+`Effect.scoped`; `Layer.effect`-vs-`Layer.scoped` finalizers (5) | runtime/queue/cause docs; ManagedRuntime/Runtime API refs |
| services-and-layers.md + testing.md | Service `{sync|effect|scoped}` + auto `Default`; `Context.Tag` class + `Layer.succeed` + LS Tag↔Service refactor; unique IDs + methods `R = never` (`leakingRequirements`); Layer constructors + composition semantics; ref-identity memoization; vitest import + clock-frozen-at-0; `it.effect` auto TestContext; `it.live`/`it.scoped`; `skip`/`only`/`fails`; `adjust` fires scheduled effects; `Layer.succeed` mocking; log suppression under `it.effect` (12) | Effect/Layer API; resource-management/scope; language-service README; @effect/vitest README; TestClock API |

Defects (fixed in step 3):

| file:line | claim | class | evidence |
|---|---|---|---|
| data-modeling.md:63 | `const user = yield* Schema.decodeUnknownSync` | stale-snippet | `decodeUnknownSync` returns a plain value / throws — not an Effect; the line also never applies schema+input, and the comment above it describes the `parseJson` line |
| error-handling.md:78-79 | `Schedule.exponential(…).pipe(Schedule.compose(Schedule.recurs(3)))` | drifted (PLAUSIBLE — API-doc semantics, not executed) | `Schedule.compose` chains output→input "selecting the shorter delay" → zero-delay `recurs(3)` defeats the backoff; documented idioms: `Schedule.intersect(Schedule.recurs(3))` or `Effect.retry(policy, { times: 3 })` |
| testing.md:34-40 | `const exit = yield* Fiber.join(fiber); expect(exit._tag).toBe("Failure")` | stale-snippet | TestClock docs: joining an erred fiber re-raises the error — `Fiber.join` never yields an Exit; use `Fiber.await` / `Effect.exit` |
| testing.md:66 | "Assert on Exit (`Effect.runPromiseExit` / `Fiber.join`)" | drifted | `Fiber.join` propagates failure; the Exit-producing APIs are `Fiber.await` / `Effect.exit` |

Advisory (practice claims, no doc evidence obtainable — left as-is): testing.md:67 "pin `@effect/vitest` to match `effect`"; services-and-layers.md:60 "duplicate IDs silently collide" (uniqueness requirement confirmed; collision behavior undemonstrated).

#### effect-ts-port — 65 claims: 59 confirmed · 2 drifted · 4 stale-snippet

Confirmed (59), condensed claim → doc source:

| file:lines | claims (n) | verified against |
|---|---|---|
| SKILL.md:20-24,128-144 | 3.x stable; `effect/Schema`; HttpApi over `effect-http` (deprecated 2024-08-30 in favor of platform 0.63.0+); `@effect-atom/atom-react` = renamed `@effect-rx/rx-react` (repo redirect; npm old pkg carries no deprecated flag — caveat); effect-solutions; `tryPromise`; single ManagedRuntime at the edge; fresh-runtime-per-handler leak claim (8) | npm dist-tags; effect-http README; effect-rx → effect-atom repo redirect; running-effects/runtime docs |
| boundary-strategy.md:11-61 | ManagedRuntime import/`make`/`dispose`; `runPromise`/`runPromiseExit` carry layer services; never `Effect.runPromise` per request; `Data.TaggedError`+`tryPromise`; `Effect.gen`; `Exit.isSuccess`/`Cause.failureOption`/`Cause.isDie` (6 — file fully clean) | ManagedRuntime/Exit/Cause API refs; error-management docs |
| fastify.md:8-74 (less :58-59,:80) | Fastify ESM import/factory; async handler + `reply.code().send()` + return-reply; `onClose` hook for `dispose`; `Schema.Struct`; `decodeUnknown`-as-Effect; ParseError→400 (app policy); HttpApi/Group/Endpoint/Builder imports; `HttpApi.make().add()`; `Group.make().add()`; `.setPayload`; `Builder.group`+`handle`; serve via `api()`+server layer; `HttpApiSchema.param`; `.addError` status mapping (annotation-driven); effect-http name-migration table (15) | Fastify Routes/TypeScript/Hooks docs; schema docs; platform API refs + README |
| nextjs.md:8-77 (less :23-29,:50-56) | module-scope runtime; Exit/Cause mapping + `Response.json`; POST decode via `runPromiseExit`; `schemaBodyJson`; `HttpServerResponse.json`; `"use server"` FormData action; edge → web layers not platform-node; `@effect/rpc` exists (npm 0.75.1); serverless/HMR caveats correctly framed as caveats (10) | ManagedRuntime API; Next.js route-handler/server-action docs; HttpServerRequest/Response API; platform introduction; npm |
| react.md:3-123 | atom lineage/MIT; `Result` Initial/Success/Failure; peers `effect ^3.19, react >=18 <20` (exact); no-provider default + `RegistryProvider initialValues`; re-exports; `useAtom`/`useAtomValue`/`useAtomSet`; `Atom.make`; derived `make((get))`/`map`; Effect-backed atom → Result + dep re-run; `Result.match`; `success.waiting`; `Result.builder` incl. `onErrorTag`; `Atom.runtime` + `runtimeAtom.atom`; `addGlobalLayer`; `runtimeAtom.fn`+`Effect.fnUntraced`; `promiseExit` mode → Exit; `Atom.family`; `withReactivity`; `reactivityKeys` invalidation; `optimistic`/`optimisticFn`; pre-1.0 (0.5.x); atom.kitlangton.com live (20) | effect-atom README + Result/Atom API docs + npm peerDependencies |

Defects (fixed in step 3):

| file:line | claim | class | evidence |
|---|---|---|---|
| SKILL.md:127,132 | route handler `{ params }: { params: { id: string } }` (both BAD & GOOD snippets) | stale-snippet | Next.js 15+ route-handler `params` is a `Promise` and must be awaited (upgrade guide + route.mdx) |
| nextjs.md:23-29 | same sync-`params` signature | stale-snippet | same |
| nextjs.md:50-54 | `HttpApp.toWebHandlerRuntime(runtime)(httpApp)` fed a ManagedRuntime | stale-snippet | API takes `Runtime.Runtime<R>`; ManagedRuntime must be unwrapped via `runtime()` (a Promise) — won't type-check as written |
| nextjs.md:56 | "tagged errors map to status automatically" (plain HttpApp) | drifted | automatic mapping is an HttpApi feature requiring `.addError(E, {status})`; plain HttpRouter/HttpApp doesn't map |
| fastify.md:58-59 | `HttpApiEndpoint.get("getUser", "/users/:id")` handler reads `path.id` | stale-snippet | typed `path.id` requires `.setPath(Schema.Struct({ id: … }))` (platform README shows both forms) |
| fastify.md:80 | "Fastify mounts the platform web handler for some groups" | drifted | no documented mount: web handlers are `(Request)=>Promise<Response>` vs Fastify's Node req/reply — manual bridge or separate server needed |

### Step 2 — Conventions audit record (2026-07-05)

**PASS B (description CSO): 0 defects** — all 3 start "Use when", carry a "Not …" clause, lengths 482/465/471, concrete triggers, no slop.

**PASS A (durable anchors): 17 findings** (resolution applied in step 3 unless noted):

| file:line | finding | resolution |
|---|---|---|
| port/SKILL.md:64 | cites legacy `docs/plans/planned/<YYYYMMDD>-…` layout (v1) — current model is `active/` + status-in-frontmatter | fix path + confirm-against-project cue (highest severity) |
| specialist SKILL.md:24,111,113,117 + services-and-layers.md:112, error-handling.md:45, config.md:3, running-effects.md:71 | 8 "LSP flags X" behavior claims without an exercising probe | one shared probe cue at SKILL.md:117 (auditor: a SKILL-body cue the refs inherit satisfies the convention) |
| services-and-layers.md:56 | LS Tag↔Service refactor claim, no cue | `overview` verb cue |
| setup SKILL.md:79 + language-service.md:40 | edit/build-time diagnostics + tsc-patch behavior claims, no probe | patch-verification probe in language-service.md |
| language-service.md:22,51,61-70 | volatile enumerations (options subset, CLI verbs, diagnostics catalog) without re-derive cues | connect `$schema` / `--help` / `diagnostics` verb as re-derive cues |
| setup SKILL.md:20 | `effect-smol` = v4 beta — live ecosystem fact, rots when v4 ships | `npm info effect dist-tags` cue |
| react.md:18 | peer range `effect ^3.19, react >=18 <20` uncued | `npm info @effect-atom/atom-react peerDependencies` cue |
| tsconfig.md:43,:72; testing.md:65 | low-severity behavior claims uncued | short cues |
| react.md:3 lineage/license; specialist SKILL.md:16 "3.10" | low — historical facts / file-level cues suffice | no change |

Model in-place cues already present (pattern replicated): fastify.md:72, react.md:123.

**PASS C (near-miss vs docks engineering siblings): 13 prompts — 6 route correctly, 7 ambiguous/wrong.** Fixing clauses applied to effect-kit descriptions in step 3 (docks-side edits out of scope):

| # | prompt (gist) | should-win | routes? | fix |
|---|---|---|---|---|
| 1 | strict tsconfig, no Effect mention | none of the three | yes | — |
| 2 | pnpm audit failing after installing effect | docks dep-vuln-workflow | yes | — |
| 3 | bump effect + peer-dep conflicts | docks dep-vuln-workflow | yes | — |
| 4 | wire the LS plugin in a long-standing Effect repo | effect-ts-setup | yes | — |
| 5 | branded UserId vs OrderId in an Effect service layer | effect-ts-specialist | ambiguous — type-safety-discipline names it verbatim | specialist desc: `Schema.brand` clause |
| 6 | validate API payload + env vars in an Effect app | effect-ts-specialist | ambiguous — t-s-d "form/API/env" verbatim | specialist desc: external-input/env validation clause |
| 7 | LS flags `leakingRequirements` — seems wrong, disable it? | effect-ts-specialist | wrong/ambiguous — lint-no-suppressions + setup match | specialist desc: LS-diagnostics clause |
| 8 | hard-coded Stripe SDK + mixed concerns, restructure with DI (Effect codebase) | effect-ts-specialist | ambiguous — docks solid names it verbatim | specialist desc: hard-coded-SDK DI clause |
| 9 | backfill vitest tests for existing Effect services, mock the Db layer | effect-ts-specialist | ambiguous — test-coverage's verbatim triggers | specialist desc: mock-via-test-layers clause |
| 10 | move React useEffect+useState data fetching into Effect | effect-ts-port | ambiguous — react-component-patterns owns the tokens | port desc: `useState`/`useEffect` → atom-react clause |
| 11 | server action throws "Functions cannot be passed to Client Components" | docks react-component-patterns | yes | — |
| 12 | TDD the migration: failing test per Fastify route before porting | effect-ts-port | ambiguous — tdd-workflow's literal trigger, no migration exclusion | clean fix lives on docks tdd-workflow → follow-up below |
| 13 | modernization pass over legacy Fastify, ending on Effect | effect-ts-port | yes | — |

### Follow-ups routed elsewhere (out of effect-kit scope — per the Effect-only rule)

- docks `tdd-workflow` description: add a migration-ask exclusion clause (near-miss #12).
- Next.js sync-`params` staleness may recur in docks skills (react-component-patterns, any Next recipes) — a Next-currency sweep on the docks side.
- TypeScript-currency checks (not Effect): `rewriteRelativeImportExtensions` (TS 5.7+), `module: "preserve"`/`moduleResolution: "bundler"` floors, `tsc --build --noEmit` flag combo, `skipLibCheck` semantics, VS Code tsdk settings.
- Package-manager `prepare`-script execution differences (pnpm vs bun) for the LS patch.
- Third-party currency: `effect-solutions` CLI (kitlangton — exists today, outside Effect-TS org); Bun-compat claims (`bunx`, vitest-not-`bun test`).
- Serverless/edge/HMR runtime-lifecycle claims (deploy-platform behavior, not Effect API).

## Sources

- Baseline scorer run (in-repo, verified at start): effect-ts-port 16 / effect-ts-setup 14 / effect-ts-specialist 16 via `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/effect-kit/skills`.
- `~/projects/effect-kit/plugins/effect-kit/skills/AGENTS.md` — the grounding rule for version-specific claims (read this session).
- `docs/plans/active/effect-kit-migration.md` — the deferred cross-plugin near-miss item this plan inherits.
