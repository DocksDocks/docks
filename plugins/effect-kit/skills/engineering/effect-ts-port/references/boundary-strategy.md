# Boundary Strategy — incremental adoption

You don't rewrite an app into Effect; you grow Effect outward from the edges. The whole strategy is three ideas: **wrap impure code at the boundary**, **run through one runtime**, and **migrate one slice at a time** so the app is green after every step (strangler-fig).

## 1. The run boundary — one `ManagedRuntime`

Build a single runtime from your composed layer at module scope, and run every Effect through it at each framework entry point. This is the seam every framework reference plugs into.

```ts
// lib/runtime.ts  — built once, reused
import { ManagedRuntime } from "effect"
import { MainLive } from "./layers"     // Layer composing your services (Db, Config, etc.)

export const runtime = ManagedRuntime.make(MainLive)
// on shutdown / HMR teardown:  await runtime.dispose()
```

`runtime.runPromise(effect)` / `runtime.runPromiseExit(effect)` run an effect with every service in `MainLive` already provided — so handlers and components stay `R`-free. NEVER call `Effect.runPromise` (a fresh runtime) per request: it rebuilds layers and leaks pooled resources.

## 2. Wrap impure code — `Effect.tryPromise`

Existing Promise/throwing code becomes an Effect at the boundary, with the failure typed:

```ts
import { Effect, Data } from "effect"
class DbError extends Data.TaggedError("DbError")<{ cause: unknown }> {}

// existing:  async function getUser(id) { return db.user(id) }
const getUser = (id: string) =>
  Effect.tryPromise({ try: () => db.user(id), catch: (cause) => new DbError({ cause }) })
```

Start by wrapping the leaf calls (DB, HTTP, fs), then compose them with `Effect.gen`. You don't have to convert the whole call tree at once — an Effect that calls a still-Promise function via `tryPromise` is perfectly valid.

## 3. What to port first

| Order | Target | Why |
|---|---|---|
| 1 | The shared boundary: `ManagedRuntime` + base layers (Config, Db, Logger) | Everything else depends on it; get it compiling alone |
| 2 | One leaf slice end-to-end (a single handler/loader + its services) | Proves the pattern with minimal blast radius — the pilot |
| 3 | Remaining leaf slices, one at a time | Each is independent; tests guard each |
| 4 | Structural moves (replace a router with HttpApi, lift state to atoms) | Higher risk; do after the leaves are stable |

Prefer the highest-complexity/highest-value leaf as the pilot — that's where Effect's error/dependency typing pays off first.

## 4. Stay green

- One slice per test cycle: change → type-check → test → keep or `git restore`.
- Map typed errors to the framework's response at the boundary (status code, error shape) — see each framework reference.
- Keep ephemeral UI/local state as-is; only lift shared/async/server state into Effect (or atoms in React).
- A slice that fights you for more than one revert is a sign the boundary is wrong — re-map it in the plan rather than forcing it.

## 5. Map errors at the edge

```ts
import { Cause, Exit } from "effect"
const exit = await runtime.runPromiseExit(getUser(id))
if (Exit.isSuccess(exit)) return ok(exit.value)
// inspect the typed failure to choose a status:
const failure = Cause.failureOption(exit.cause)   // Option<YourTaggedError>
// match on failure.value._tag → 404 / 400 / 503 ; defects (Cause.isDie) → 500 + log
```

This `runPromiseExit` + `Cause`/`Exit` inspection is the portable error-mapping idiom reused by the Fastify and Next.js references.
