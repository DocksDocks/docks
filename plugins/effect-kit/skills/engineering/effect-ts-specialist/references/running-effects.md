# Running Effects & Resource Scopes

An `Effect` is a *description*; nothing happens until it's run. Where and how you run it is the boundary between Effect-land and the host (Node, a framework, the browser). This is the seam every `effect-ts-port` integration plugs into.

## The run functions (boundaries only)

```ts
import { Effect } from "effect"

Effect.runPromise(program)        // Promise<A>, rejects on failure
Effect.runPromiseExit(program)    // Promise<Exit<A, E>>  — inspect success/failure without throwing
Effect.runFork(program)           // RuntimeFiber — fire-and-forget, cancellable
Effect.runSync(program)           // A — only for fully-synchronous effects (throws otherwise)
```

Call these at the **edge** (top of `main`, a request handler, an event callback) — never inside business logic. A program you run usually has `R = never`; if `R` isn't `never`, you forgot to provide a layer.

## `ManagedRuntime` — the framework bridge

Most apps don't own their entry point (Next.js calls your route, React calls your handler). Build a runtime **once** from your layer, then run effects through it:

```ts
import { Effect, ManagedRuntime } from "effect"

// module scope — built once, reused across invocations
const runtime = ManagedRuntime.make(MainLive)

// at each entry point:
export async function handler(req: Request) {
  return runtime.runPromise(handleRequest(req))   // effect can use every service in MainLive
}

// on shutdown / HMR teardown:
await runtime.dispose()
```

`runtime.runPromise` / `runPromiseExit` / `runFork` mirror the `Effect.run*` family but carry the provided context, so handlers stay `R`-free. This is exactly what `effect-ts-port` wires into Fastify handlers, Next.js route handlers / server actions, and React.

> Caveat (serverless/edge): module-scope runtime is reused within a warm instance but rebuilt on cold start; awaiting `runtime.runtime()` at module top-level is fine for Node servers, but verify it against your deploy target (edge runtimes, HMR in dev).

## Resource management — `Scope` + `acquireRelease`

A `Scope` guarantees finalizers run (success, failure, or interruption). Acquire/release pairs are the building block:

```ts
import { Effect } from "effect"

const withFile = Effect.acquireRelease(
  Effect.sync(() => openSync(path)),          // acquire
  (fd) => Effect.sync(() => closeSync(fd)),   // release — always runs
)

// use within a scope; the file is closed when the scope closes:
const program = Effect.scoped(
  Effect.gen(function* () {
    const fd = yield* withFile
    return yield* read(fd)
  })
)
```

### Scoped layers

When a *service* owns a resource (pool, client, subscription), build it with `Layer.scoped` so its finalizer runs when the app's scope closes:

```ts
const DbLive = Layer.scoped(
  Db,
  Effect.acquireRelease(connect(url), (c) => c.close()),
)
// BAD: Layer.effect(Db, connect(url)) — connection never closed (LSP: scopeInLayerEffect)
```

## Checklist

- Run at the edge with `Effect.run*`; everywhere else, return Effects.
- Don't control the entry point? Build a `ManagedRuntime` once and `runtime.runPromise` per call; `dispose()` on teardown.
- A program you run should have `R = never` — a lingering requirement means a missing `provide`.
- Resource with cleanup → `acquireRelease`; resource owned by a service → `Layer.scoped`, never `Layer.effect`.
