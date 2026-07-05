---
name: effect-ts-port
description: "Use when porting an existing TypeScript codebase to Effect-TS (3.x) — Fastify routes, Next.js App Router handlers / server actions, or React components (`useState`/`useEffect` state → `@effect-atom/atom-react`). Detects the framework, asks scope, writes a tiered migration plan to docs/plans/, then migrates one boundary at a time (`Effect.tryPromise` + `ManagedRuntime`), test-gated. Not for first-time Effect setup (use effect-ts-setup) or writing fresh Effect patterns (use effect-ts-specialist)."
user-invocable: true
metadata:
  pattern: pipeline
  updated: "2026-07-05"
  content_hash: "ac4932cbed5f27be21f68248c84ac7652f39edea598ef667a68f19d9a64b2b39"
---

# Effect-TS Port (cross-tool pipeline)

Migrate an existing Fastify / Next.js / React codebase to Effect 3.x as one sequential pass: detect the framework, map the surface, agree the scope, write a tiered plan, gate on approval, then port one boundary at a time with tests as the ratchet. Single-agent and cross-tool — no slash command, no subagent dispatch, no Plan Mode. Framework specifics live in `references/`; this body is the orchestration. Pattern mirrors the `security` / `refactor` pipelines.

<constraint>
Single-agent sequential, gated on the plan lifecycle — NOT Plan Mode. Run the phases IN ORDER, in THIS context. Phases 0–3 are read-only analysis; the deliverable is a plan file under `docs/plans/`. Do NOT call `ExitPlanMode` (Claude-only) and do NOT edit source until the user approves via `start <slug>`. If `docs/plans/` is absent, run `plan-init` first; hand the written plan to `plan-manager` and tell the user "review and say `start <slug>` to migrate." Append each phase's output to the plan file under its exact heading so a mid-run compaction resumes by re-reading the file.
</constraint>

<constraint>
Boundary-first, incremental — never a big-bang rewrite. Wrap existing Promise/throwing code with `Effect.tryPromise({ try, catch })`, run it through a single `ManagedRuntime` at the framework edge, and migrate the highest-value slice first, expanding outward (strangler-fig). Port ONE slice at a time: change it, run the type-checker + tests, and on failure REVERT immediately (`git restore`) and log `REVERTED: <reason>` — do not try to "fix forward". The app stays green and shippable after every slice.
</constraint>

<constraint>
Don't guess Effect APIs — defer to the `effect-ts-specialist` skill and verify against current docs (context7 `effect`, or `bunx effect-solutions@latest show <topic>`). Target **Effect 3.x stable**: `Schema` is `effect/Schema`; for HTTP prefer **`@effect/platform` HttpApi** (NOT the deprecated `effect-http`); for React use **`@effect-atom/atom-react`** (the renamed successor to `@effect-rx/rx-react`). A wrong API in a migration is worse than asking.
</constraint>

## When to use

- A service or app on Fastify / Next.js App Router / React that you want on Effect, incrementally.
- You want a reviewable, tiered migration plan before any code changes — and tests guarding every slice.

## When NOT to use

| Situation | Use instead |
|---|---|
| Effect not installed / no tsconfig yet | `effect-ts-setup` (this pipeline runs its detection as Phase 0) |
| Writing new Effect code (no migration) | `effect-ts-specialist` |
| Generic dead-code / SOLID cleanup | `refactor` |
| Security review | `security` |

## Pipeline

Run in order. Each phase reads its reference (where listed), then writes output to the plan file under the exact heading (the resume anchor — keep it verbatim).

| # | Phase | Reference | Output heading |
|---|---|---|---|
| 0 | Detection (framework, package manager, Effect present?) | — (inline) | `## Phase 0: Detection` |
| 1 | Surface map (entry points, async edges, shared deps) | `references/boundary-strategy.md` | `## Phase 1: Surface Map` |
| 2 | Scope interview (which surfaces, depth, pilot) | — (inline, ask → STOP) | `## Phase 2: Scope` |
| 3 | Migration plan (tiered slices + test strategy) | framework reference(s) | `## Phase 3: Migration Plan` |
| — | **GATE** — write plan to `docs/plans/`, await `start <slug>` | — | — |
| 4 | Implementation (one slice at a time, boundary-first) | framework reference(s) | `## Phase 4: Implementation Log` |
| 5 | Verification (type-check, tests, no scope bleed) | — (inline) | `## Phase 5: Verification` |

## How to run each phase

1. Anchor the date once (`date "+%Y-%m-%d"`); record scope (a path arg, or the whole project).
2. Create/open the plan file (below). Run Phases 0→3, writing each under its heading; confirm the prior heading landed before the next. A phase with nothing to report writes "none" — never silently skip.
3. At the GATE, hand off (below). Resume at Phase 4 only after `start <slug>`.

## The plan file (IPC + deliverable)

```text
docs/plans/active/effect-port-<scope>.md   (preferred — tracked by plan-manager; status lives in
                                            frontmatter, not the path — confirm the layout against
                                            the project's docs/plans/AGENTS.md)
docs/effect-port-<YYYYMMDD>.md             (fallback when docs/plans/ is absent)
```

Write as you go — never hold all phase output in context and dump at the end. The plan's `## Steps` table is the slice list; `## Mistakes & Dead Ends` records every `REVERTED:` slice so a resumed run skips known dead ends.

## Phase 0 — Detection (inline)

```bash
ls package.json tsconfig.json pnpm-lock.yaml bun.lock package-lock.json 2>/dev/null
```

Identify the framework(s) and whether Effect is already present (`grep '"effect"' package.json`). If Effect is absent, run **`effect-ts-setup`** first (deps + tsconfig + language service), then return. Record framework, package manager, and Effect presence under `## Phase 0: Detection`.

| Signal | Framework | Primary reference |
|---|---|---|
| `fastify` in deps, `*.route.ts`, `fastify()` | Fastify | `references/fastify.md` |
| `next` in deps, `app/**/route.ts`, `"use server"` | Next.js App Router | `references/nextjs.md` |
| `react`/`react-dom`, `.tsx` components, hooks | React | `references/react.md` |

## Phase 1 — Surface map

Read `references/boundary-strategy.md`. Enumerate the edges where async/impure work happens — route handlers, server actions, data loaders, React event handlers/effects, external API/DB calls. For each, note the current error handling and what it depends on. This is the candidate slice list. Pick the **run boundary** (one `ManagedRuntime`) and the first pilot slice (highest value, lowest blast radius).

## Phase 2 — Scope interview (ask → STOP)

Ask the user, then STOP (end the turn; on Claude, `AskUserQuestion` may collect these):

1. **Which surfaces** to port now — all detected, one framework, or a single route group / component tree?
2. **Depth** — *wrap* (keep the framework, run Effect inside handlers) or *replace* (e.g. Fastify routes → `@effect/platform` HttpApi)?
3. **Pilot** — start with one slice end-to-end, or convert a whole module?
4. **Constraints** — must tests stay green throughout (default yes)? deploy target (serverless/edge changes the `ManagedRuntime` lifecycle — see the references)?

Record answers under `## Phase 2: Scope`. Do not proceed to the plan until the user replies.

## Phase 3 — Migration plan → GATE

Read the relevant framework reference(s). Write `## Phase 3: Migration Plan` and populate the plan's `## Steps` table with ordered slices (each: file:line, wrap-or-replace, the Effect shape it becomes, test command, risk). Tier them: **(1)** shared boundary (the `ManagedRuntime` + base layers), **(2)** leaf slices (one handler/component), **(3)** structural (replace a router, lift state to atoms). Then STOP: "Migration plan written to `<path>`; review and say `start <slug>` to begin." Approval flows through the plan lifecycle — never `ExitPlanMode`.

## Phase 4 — Implementation (after `start <slug>`)

1. Establish a baseline: run the type-checker + test suite. Note any pre-existing failures.
2. Build the **shared boundary first** (Tier 1): the `ManagedRuntime` from your `MainLive` layer, and the base services. Verify it compiles before touching any handler.
3. For each slice in tier order: read the framework reference, apply the boundary pattern, then run the type-checker + tests. On green, log `APPLIED: <slice>`; on failure, `git restore` the slice and log `REVERTED: <reason>` in `## Mistakes & Dead Ends`, then continue. ONE slice per test cycle — never batch.
4. Keep ephemeral UI-local state in `useState`; lift shared/async/server state into Effect/atoms (React). Wrap, don't rewrite, until a slice is fully green.

## Phase 5 — Verification (inline)

Write `## Phase 5: Verification`: type-check clean, tests green (vs the Phase 4 baseline), and a scope check — every changed file must trace to a planned slice (`git diff --name-only` ⊆ the plan's `affected_paths`). An out-of-scope change ⇒ `git restore` it. Report slices applied vs reverted, and any follow-up slices deferred to a new plan.

## Framework references

| Read for | File |
|---|---|
| Incremental strategy, the run boundary, what to port first, `Effect.tryPromise` | `references/boundary-strategy.md` |
| Fastify handlers (wrap) and `@effect/platform` HttpApi (replace) | `references/fastify.md` |
| HttpApi current DSL — declare / implement / serve / client / error-status mapping | `references/http-api.md` |
| `@effect/rpc` typed RPC (tRPC replacement): contract, HTTP serve, client | `references/effect-rpc.md` |
| Next.js App Router route handlers, server actions, module-scope runtime | `references/nextjs.md` |
| React via `@effect-atom/atom-react` (atoms, `Result`, `Atom.runtime`, SSR/lifecycle) | `references/react.md` |

## Boundary pattern — the mistake that breaks ports

```ts
// BAD — a fresh runtime per request: every layer (pools, clients) is rebuilt and leaked
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params                      // Next 15+: params is a Promise
  return Response.json(await Effect.runPromise(getUser(id).pipe(Effect.provide(MainLive))))
}
// GOOD — one module-scope ManagedRuntime; handlers run through it and stay R-free
import { runtime } from "@/lib/runtime"            // ManagedRuntime.make(MainLive), built once
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return Response.json(await runtime.runPromise(getUser(id)))
}
```

## Gotchas

| Gotcha | Consequence | Right move |
|---|---|---|
| Big-bang rewrite of all handlers at once | Can't tell which slice broke; app un-shippable | One slice → type-check + test → keep/revert |
| `Effect.runPromise` inside every handler (new runtime each call) | Layers rebuilt per request; pools leak | One module-scope `ManagedRuntime`; `runtime.runPromise` per call |
| Targeting `effect-http` for HTTP | Deprecated since 2024 | `@effect/platform` HttpApi |
| Using `@effect-rx/rx-react` for React | Renamed/superseded | `@effect-atom/atom-react` |
| Editing code during Phases 0–3 | Breaks the read-only-then-approve gate | Analysis only until `start <slug>` |
| Module-scope runtime on edge/serverless without a caveat | Cold-start surprises | Note the deploy target in Phase 2; see the references |
| `docs/plans/` assumed to exist in a consumer repo | Plan write lands nowhere | Check first; `plan-init`, or use the fallback path |

## When this skill does NOT apply

- Effect isn't set up yet — run **`effect-ts-setup`** (Phase 0 will send you there).
- You're authoring new Effect code, not migrating — use **`effect-ts-specialist`**.
