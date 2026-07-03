# Next.js App Router → Effect

The App Router calls your code (route handlers, server actions) — you don't own the entry point, so the `ManagedRuntime`-at-module-scope pattern is exactly right. Two integration depths: run effects *inside* a handler (simple), or hand a whole `HttpApp` to a web handler (full platform).

## The shared runtime (once)

```ts
// lib/runtime.ts
import { ManagedRuntime } from "effect"
import { MainLive } from "./layers"
export const runtime = ManagedRuntime.make(MainLive)
```

Import this from every route/action. It's reused across invocations within a warm server instance.

## Route handler — run inside (simple)

```ts
// app/api/users/[id]/route.ts
import { Cause, Exit } from "effect"
import { runtime } from "@/lib/runtime"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const exit = await runtime.runPromiseExit(getUser(params.id))
  if (Exit.isSuccess(exit)) return Response.json(exit.value)
  const f = Cause.failureOption(exit.cause)
  const status = f._tag === "Some" && f.value._tag === "UserNotFound" ? 404 : 500
  return Response.json({ error: f._tag === "Some" ? f.value._tag : "internal" }, { status })
}
```

Validate the body with Schema before the effect runs:

```ts
import { Schema } from "effect"
export async function POST(req: Request) {
  const body = await req.json()
  const exit = await runtime.runPromiseExit(
    Schema.decodeUnknown(CreateUser)(body).pipe(Effect.flatMap(createUser)),
  )
  // ParseError → 400 ; success → 201
}
```

## Route handler — web handler (full platform)

When the route is a whole `HttpApp` (built from `@effect/platform` `HttpApiBuilder` or `HttpRouter`), convert it to a runtime-bound web handler:

```ts
import { HttpApp } from "@effect/platform"
import { runtime } from "@/lib/runtime"

const handler = HttpApp.toWebHandlerRuntime(runtime)(httpApp)   // (req: Request) => Promise<Response>
export const POST = (req: Request) => handler(req)
// inside httpApp: HttpServerRequest.schemaBodyJson(CreateUser) parses+validates the body,
// HttpServerResponse.json(...) responds; tagged errors map to status automatically.
```

## Server actions

```ts
"use server"
import { runtime } from "@/lib/runtime"

export async function createUserAction(form: FormData) {
  return runtime.runPromise(handleCreateUser(form))   // throws → Next surfaces it; or runPromiseExit to handle
}
```

Same runtime, same pattern — the action body is an Effect run through `runtime`.

## Caveats (state in Phase 2 scope)

- **Serverless / cold starts**: the module-scope runtime is reused within a warm lambda but rebuilt on cold start. Keep `MainLive` construction cheap; lazy-init expensive resources inside services.
- **Edge runtime**: not all Node platform layers run on the edge — use `@effect/platform` (web) layers, not `@effect/platform-node`, for edge routes.
- **Dev HMR**: a module-scope runtime can survive HMR and leak; guard with a `globalThis` singleton in dev, and `runtime.dispose()` on teardown.
- **RPC alternative**: `@effect/rpc` can replace a tRPC layer in the App Router (a typed effectful RPC client) — a Track-B-style move, plan it as a structural slice.

## Slicing

One route file or one server action = one slice. Build `lib/runtime.ts` + `MainLive` first (Tier 1), then convert leaf routes one at a time, each guarded by its test (or a request smoke test).
