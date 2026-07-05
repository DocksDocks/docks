# @effect/rpc — typed effectful RPC (the tRPC-replacement slice)

When the app carries a tRPC-style internal API layer, `@effect/rpc` gives the same end-to-end typing with Effect semantics: Schema-typed payload/success/error per procedure, streaming built in, and a derived client. Plan it as a structural (Tier-3) slice.

> Verified against `@effect/rpc` 0.75.1 (2026-07-05; peers `@effect/platform ^0.96.1` + `effect ^3.21.2` — the trio moves in lockstep, upgrade together). The canonical doc is the package README (`Effect-TS/effect` → `packages/rpc`) — effect.website has no rpc page; re-verify shapes there before writing code.

## Contract (shared between server & client)

```ts
import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"

export class UserRpcs extends RpcGroup.make(
  Rpc.make("UserList", { success: User, stream: true }),   // stream: true → client gets a Stream
  Rpc.make("UserById", {
    success: User,
    error: Schema.String,                 // typed error channel
    payload: { id: Schema.String },       // payload is a plain record of Schema fields
  }),
  Rpc.make("UserCreate", { success: User, payload: { name: Schema.String } }),
) {}
```

## Server — implement the group as a Layer

```ts
export const UsersLive = UserRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* UserRepository
    return {
      UserList: () => Stream.fromIterableEffect(db.findMany),   // stream rpc returns a Stream
      UserById: ({ id }) => db.findById(id),                    // unary rpc returns an Effect
      UserCreate: ({ name }) => db.create(name),
    }
  }),
).pipe(Layer.provide(UserRepository.Default))
```

## Serve over HTTP (Node)

```ts
import { HttpRouter } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { RpcSerialization, RpcServer } from "@effect/rpc"
import { createServer } from "node:http"

const RpcLayer = RpcServer.layer(UserRpcs).pipe(Layer.provide(UsersLive))
const HttpProtocol = RpcServer.layerProtocolHttp({ path: "/rpc" }).pipe(
  Layer.provide(RpcSerialization.layerNdjson),  // no-framing protocols; layerJson when framing exists
)
const Main = HttpRouter.Default.serve().pipe(
  Layer.provide(RpcLayer),
  Layer.provide(HttpProtocol),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
)
NodeRuntime.runMain(Layer.launch(Main))
```

(The README's own example serves on Bun — `BunHttpServer.layer({ port })` from `@effect/platform-bun`; the Node swap above reuses the platform README's `NodeHttpServer.layer(createServer, { port })` serve form.)

Next.js route handler: there is no official recipe yet. The source-verified building block is `RpcServer.toWebHandler(group, { layer }) → { handler: (Request) => Promise<Response>, dispose }` — mount `handler` as the route's `POST`. Treat as an adaptation and re-verify against the current README before shipping.

## Client

```ts
import { FetchHttpClient } from "@effect/platform"
import { RpcClient, RpcSerialization } from "@effect/rpc"

const ProtocolLive = RpcClient.layerProtocolHttp({ url: "http://localhost:3000/rpc" }).pipe(
  Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),  // must match the server
)
const program = Effect.gen(function* () {
  const client = yield* RpcClient.make(UserRpcs)          // typed client derived from the group
  yield* client.UserCreate({ name: "Charlie" })
  return yield* Stream.runCollect(client.UserList({}))
}).pipe(Effect.scoped)                                     // RpcClient.make is scoped
program.pipe(Effect.provide(ProtocolLive), Effect.runPromise)
```

## Middleware (auth)

`RpcMiddleware.Tag` classes attach per-RPC (`Rpc.make(…).middleware(AuthMiddleware)`) or group-wide; the server implementation provides e.g. `CurrentUser` from headers, and the client side (`RpcMiddleware.layerClient`) injects the auth header into outgoing requests. Full shapes: README §middleware.

## Gotchas

| Gotcha | Right move |
|---|---|
| Client/server serialization mismatch | Same `RpcSerialization.layer*` on both sides |
| Unscoped client usage | `RpcClient.make` is scoped — `Effect.scoped` the program, or wrap in an `Effect.Service` with `scoped:` |
| Writing `payload: Schema.Struct({…})` | The current form is a plain record of Schema fields |
| Bumping rpc alone | Peers pin `@effect/platform` — upgrade the trio together |
| Calling RPCs from React components | `AtomRpc.Tag` wraps the client as atoms — see `react.md` |
