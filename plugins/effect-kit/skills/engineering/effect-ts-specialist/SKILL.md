---
name: effect-ts-specialist
description: "Use when writing or reviewing Effect-TS (`effect` 3.x) — services & layers (`Context.Tag`/`Effect.Service`, DI for a hard-coded SDK), tagged errors, `effect/Schema` data modeling (`Schema.brand` IDs, validating external input/env), `Config`, `ManagedRuntime`, `Scope` resources, `@effect/vitest` testing (`TestClock`, mock service layers), `@effect/language-service` diagnostics. Not for porting a Fastify/Next/React app (use effect-ts-port) or first-time repo bootstrap (use effect-ts-setup)."
user-invocable: false
metadata:
  pattern: patterns-reference
  updated: "2026-07-05"
  content_hash: "61ae9d86c3c9c4e16de7b5c71aa36b1c79e65abe9cbd54a4281567076f0f76f6"
---

# Effect-TS Specialist (idiomatic Effect 3.x)

Effect rewards a small set of idioms and punishes guessing — the type-level error and requirement channels mean a wrong pattern shows up as a confusing `R`/`E` mismatch, not a runtime bug. This skill is the decision layer: which idiom to reach for, and the two or three mistakes that cost the most. Depth per topic lives in `references/`.

<constraint>
Never guess an Effect API from memory — the surface is large and moves between minor versions. Target **Effect 3.x stable** (the `effect` package). `Schema` is imported from **`effect/Schema`**, never the deprecated `@effect/schema` (folded into core in 3.10). Before writing an unfamiliar combinator, verify it: `bunx effect-solutions@latest show <topic>`, context7 (`resolve-library-id effect` → `query-docs`), or grep a cloned `effect` source tree. A wrong API shape is worse than asking.
</constraint>

<constraint>
Errors live in the **typed error channel**, not in `throw`. Model expected domain failures (validation, not-found, permission-denied) as tagged errors so they appear in `E` and `catchTag` can recover them. Reserve `throw`/defects for genuine bugs and invariant violations — promote those with `Effect.orDie`. NEVER use `try/catch` inside `Effect.gen`; wrap promise-returning code with `Effect.tryPromise({ try, catch })` so the failure is typed.
</constraint>

<constraint>
Provide layers **once, at the application boundary** (`Effect.provide(program, MainLive)` or a single `ManagedRuntime`). Service method signatures carry `R = never` — push every dependency into the service's Layer, not the call site. Scattering `provide` calls or leaking requirements into method types is the most common structural smell (the language service flags it as `multipleEffectProvide` / `leakingRequirements`).
</constraint>

## Decision table — reach for X when you want Y

| You want | Reach for | Reference |
|---|---|---|
| A service with one obvious implementation | `Effect.Service` (bundles Tag + `Default` layer) | `services-and-layers.md` |
| A service defined interface-first / multiple impls | `Context.Tag` + a separate `Layer` | `services-and-layers.md` |
| A recoverable domain failure | `Data.TaggedError` (in-process) / `Schema.TaggedError` (crosses a boundary) | `error-handling.md` |
| To wrap an existing Promise | `Effect.tryPromise({ try, catch })` | `error-handling.md` |
| A product/record type with methods | `Schema.Class` | `data-modeling.md` |
| A sum/variant type | `Schema.TaggedClass` + `Schema.Union` | `data-modeling.md` |
| A primitive that must not be mixed up | `Schema.brand` (`UserId` ≠ `PostId`) | `data-modeling.md` |
| Typed env/secret access | `Config.*` (+ `Config.redacted` for secrets) | `config.md` |
| To run an Effect at a framework edge | `ManagedRuntime.make(layer)` then `runtime.runPromise` | `running-effects.md` |
| A resource with guaranteed cleanup | `Effect.acquireRelease` + `Layer.scoped` | `running-effects.md` |
| Deterministic tests (time, services) | `@effect/vitest` `it.effect` + `TestClock` | `testing.md` |

## Services & layers (the spine)

```ts
// GOOD — Effect.Service bundles the Tag and a Default layer; deps go in the layer, not the methods
class Users extends Effect.Service<Users>()("app/Users", {
  effect: Effect.gen(function* () {
    const sql = yield* Sql            // dependency resolved by the layer
    const getAll = sql.query("select * from users")   // R = never on the method
    return { getAll } as const
  }),
  dependencies: [SqlLive],
}) {}
// access:  const users = yield* Users
// provide: Effect.provide(program, Users.Default)
```

```ts
// BAD — dependency leaks into the method's requirement type, and provide is scattered per-call
const getAll = (sql: Sql) => Effect.provide(sql.query("..."), SqlLive) // R leaks; provided too deep
```

Layer naming is camelCase + `Layer`/`Default` suffix; compose with `Layer.merge` / `Layer.provide` / `Layer.provideMerge`. **Memoize parameterized layers** (store `const pgLayer = Postgres.layer({...})` once) so reference identity dedupes shared resources like connection pools. Full patterns: `references/services-and-layers.md`.

## Errors: typed channel vs defects

```ts
// GOOD — domain failure is tagged → shows up in E, recoverable with catchTag
class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
const find = (id: string) =>
  Effect.tryPromise({ try: () => db.user(id), catch: (e) => new DbError({ cause: e }) }).pipe(
    Effect.flatMap((u) => (u ? Effect.succeed(u) : new UserNotFound({ id })))
  )
find("7").pipe(Effect.catchTag("UserNotFound", () => Effect.succeed(guestUser)))
```

```ts
// BAD — throw inside gen becomes an untyped defect; try/catch defeats the error channel
const find = (id: string) => Effect.gen(function* () {
  try { const u = yield* Effect.promise(() => db.user(id)); if (!u) throw new Error("nope"); return u }
  catch (e) { throw e }   // ❌ language service: tryCatchInEffectGen
})
```

Use `Schema.TaggedError` (serializable) when the error crosses a network/DB boundary (e.g. `HttpApi`); `Data.TaggedError` when it stays in-process. Recover with `catchTag`/`catchTags`; promote unrecoverable failures with `Effect.orDie`. Detail: `references/error-handling.md`.

## Running at the boundary

You almost never call `Effect.runPromise` in app code — you build a runtime once and run effects through it at each framework entry point (route handler, server action, React event). `ManagedRuntime.make(MainLive)` is the bridge; see `references/running-effects.md`. This is the seam the **`effect-ts-port`** skill plugs every framework into.

## Hybrid knowledge source (opportunistic, never required)

The `references/` here are self-contained. When more depth is needed and the tools exist, prefer ground truth over memory:

```bash
bunx effect-solutions@latest list           # Kit Langton's idiomatic-Effect docs CLI (needs Bun; optional)
bunx effect-solutions@latest show <topic>   # run `list` first for the exact topic slugs
# else: context7 resolve-library-id `effect` → query-docs; or grep a cloned effect source tree
```

Topics roughly correspond to the reference files below. Absence of these tools is never a blocker — the references stand alone.

## Gotchas

| Gotcha | Consequence | Right move |
|---|---|---|
| `try/catch` inside `Effect.gen` | Failure escapes the typed channel | `Effect.tryPromise({ try, catch })` |
| `throw` for an expected failure | Becomes an unrecoverable defect | Tagged error in `E`; recover with `catchTag` |
| `provide` scattered through the call tree | Layers re-built, requirements leak | Provide once at the boundary |
| `Layer.effect` for a service needing cleanup | Finalizer never runs | `Layer.scoped` + `acquireRelease` (LSP: `scopeInLayerEffect`) |
| Re-creating a parameterized layer per use | Duplicate pools/connections | Memoize in a `const`; reference identity dedupes |
| `process.env` / `new Date()` / `Math.random()` inside an Effect | Untestable, impure | `Config.*` / `Clock` / `Random` (LSP flags each) |
| `installing @effect/schema` | Deprecated package, wrong types | Import from `effect/Schema` (core since 3.10) |
| Plain `JSON.parse` of external input | Unvalidated `any` | `Schema.decodeUnknown` / `Schema.parseJson` |

Install the **`@effect/language-service`** tsconfig plugin (the `effect-ts-setup` skill wires it) — it catches most of the above at edit time. Rule names here and in the references move with the plugin: exercise a claim by reproducing the anti-pattern in a scratch file and confirming the diagnostic appears (or run `pnpm exec effect-language-service check`).

## References

| Read for | File |
|---|---|
| `Context.Tag` vs `Effect.Service`, layer composition, memoization, provide-once | `references/services-and-layers.md` |
| Tagged errors, defects vs typed errors, `tryPromise`, `catchTag`/`catchTags` | `references/error-handling.md` |
| `Schema.Class`/`TaggedClass`/`Union`, brands, decode/encode, JSON | `references/data-modeling.md` |
| `Config.*`, `redacted`, defaults, `ConfigProvider`, config-as-service | `references/config.md` |
| `runPromise`/`runFork`, `ManagedRuntime`, `Scope`/`acquireRelease` | `references/running-effects.md` |
| `@effect/vitest` `it.effect`/`it.scoped`, `TestClock`, mocking layers | `references/testing.md` |

## When this skill does NOT apply

- Migrating an existing Fastify / Next.js / React codebase to Effect — use **`effect-ts-port`** (detect → plan → migrate).
- Bootstrapping `effect` deps, tsconfig, and the language service in a fresh repo — use **`effect-ts-setup`**.
