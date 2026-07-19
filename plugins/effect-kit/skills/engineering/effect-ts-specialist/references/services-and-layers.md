# Services & Layers

A *service* is an interface in the requirement (`R`) channel. A *layer* is a recipe that builds the service (and may require other services to do so). Wiring = composing layers and providing the composite once.

## Contents

- [Two ways to define a service](#two-ways-to-define-a-service)
- [Rules that keep `R` clean](#rules-that-keep-r-clean)
- [Building layers](#building-layers)
- [Composition](#composition)
- [Memoize parameterized layers](#memoize-parameterized-layers)
- [Provide once](#provide-once)

## Two ways to define a service

### `Effect.Service` — default when there's one obvious implementation

```ts
import { Effect } from "effect"

class Cache extends Effect.Service<Cache>()("app/Cache", {
  // `effect` builds the implementation; deps it needs go in `dependencies`
  effect: Effect.gen(function* () {
    const store = new Map<string, string>()
    const get = (k: string) => Effect.sync(() => store.get(k))
    const set = (k: string, v: string) => Effect.sync(() => void store.set(k, v))
    return { get, set } as const
  }),
  dependencies: [],            // other layers this service needs
}) {}

// access inside any Effect:
const program = Effect.gen(function* () {
  const cache = yield* Cache
  yield* cache.set("k", "v")
})
// provide the bundled default layer at the boundary:
Effect.runPromise(Effect.provide(program, Cache.Default))
```

`Effect.Service` auto-generates `Cache.Default` (a `Layer`) and the Tag. Use `{ sync: () => ... }` for a pure impl, `{ effect: ... }` for an effectful one, `{ scoped: ... }` when construction needs a finalizer.

### `Context.Tag` — interface-first, or many implementations

```ts
import { Context, Effect, Layer } from "effect"

class Clock extends Context.Tag("app/Clock")<Clock, {
  readonly now: Effect.Effect<number>
}>() {}

const SystemClockLive = Layer.succeed(Clock, { now: Effect.sync(() => Date.now()) })
const TestClockLive   = Layer.succeed(Clock, { now: Effect.succeed(0) })
```

Pick `Context.Tag` when you want to sketch the interface before any impl, or swap implementations (prod vs test, multiple backends). Pick `Effect.Service` for the common "one impl, give me a default layer" case. The `@effect/language-service` ships a refactor that converts between the two (list the current refactors with `pnpm exec effect-language-service overview`).

## Rules that keep `R` clean

- **Service ID is unique and namespaced**: `"app/Users"`, `"@org/Billing"`. Duplicate IDs silently collide.
- **Methods have `R = never`.** A method's type is `Effect<A, E>` — never `Effect<A, E, SomeDep>`. Dependencies are resolved when the *layer* is built, not when the method is called. Leaking a requirement into a method type is the `leakingRequirements` smell.
- **`readonly` props only.** No exposed mutable fields; encapsulate state behind methods.

## Building layers

```ts
import { Effect, Layer } from "effect"

// from an effect that yields the service shape, pulling its own deps:
const UsersLive = Layer.effect(
  Users,
  Effect.gen(function* () {
    const sql = yield* Sql           // Users layer now requires Sql
    return { getAll: sql.query("select * from users") }
  })
)

// from a constant:           Layer.succeed(Tag, impl)
// needing a finalizer:       Layer.scoped(Tag, Effect.acquireRelease(open, close))
```

## Composition

| Combinator | Meaning |
|---|---|
| `Layer.merge(a, b)` | Both services available; deps of each still required |
| `Layer.provide(a, b)` | `b` satisfies `a`'s requirements (wires `b` *into* `a`) |
| `Layer.provideMerge(a, b)` | Like `provide`, but keeps `b` in the output too |

```ts
const MainLive = UsersLive.pipe(
  Layer.provide(SqlLive),          // SqlLive satisfies Users' need for Sql
  Layer.provideMerge(ConfigLive)   // Config available to everything AND exported
)
```

## Memoize parameterized layers

```ts
// GOOD — one instance, reference identity dedupes the pool across repos
const pgLayer = Postgres.layer({ url: dbUrl })
const UserRepoLive  = UserRepo.Default.pipe(Layer.provide(pgLayer))
const OrderRepoLive = OrderRepo.Default.pipe(Layer.provide(pgLayer))   // same pgLayer

// BAD — two distinct layers → two connection pools
const UserRepoLive  = UserRepo.Default.pipe(Layer.provide(Postgres.layer({ url: dbUrl })))
const OrderRepoLive = OrderRepo.Default.pipe(Layer.provide(Postgres.layer({ url: dbUrl })))
```

## Provide once

Build `MainLive` at the composition root and provide it at the single entry point. Do not `Effect.provide` inside business logic — it rebuilds layers and hides what a function truly requires. The language service flags repeated provides as `multipleEffectProvide` / `strictEffectProvide`.
