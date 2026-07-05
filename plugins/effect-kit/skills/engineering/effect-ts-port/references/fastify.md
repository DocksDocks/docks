# Fastify → Effect

Two tracks. **Wrap** keeps Fastify and runs Effects inside handlers — the low-risk incremental default. **Replace** swaps Fastify for `@effect/platform` HttpApi — more work, but you gain a typed client + OpenAPI + Schema validation for free. Most migrations do Wrap first and Replace later (per route group).

## Track A — Wrap (keep Fastify, run Effect inside)

```ts
import Fastify from "fastify"
import { Cause, Exit } from "effect"
import { runtime } from "./lib/runtime"     // one ManagedRuntime (see boundary-strategy.md)

const app = Fastify()

app.get("/users/:id", async (req, reply) => {
  const exit = await runtime.runPromiseExit(getUser((req.params as { id: string }).id))
  if (Exit.isSuccess(exit)) return reply.send(exit.value)

  const failure = Cause.failureOption(exit.cause)        // Option<UserNotFound | DbError>
  if (failure._tag === "Some") {
    switch (failure.value._tag) {
      case "UserNotFound": return reply.code(404).send({ error: "not found" })
      case "DbError":      return reply.code(503).send({ error: "unavailable" })
    }
  }
  reply.code(500).send({ error: "internal" })            // defect
  return reply
})

app.addHook("onClose", async () => { await runtime.dispose() })
```

One slice = one route. Validate the request body with Schema before handing it to the effect:

```ts
import { Schema } from "effect"
const CreateUser = Schema.Struct({ name: Schema.String, email: Schema.String })
app.post("/users", async (req, reply) => {
  const exit = await runtime.runPromiseExit(
    Schema.decodeUnknown(CreateUser)(req.body).pipe(Effect.flatMap(createUser))
  )
  // ParseError → 400; map as above
})
```

A small `respond(reply, exit)` helper centralizes the `Exit`/`Cause` → status mapping so each route stays a one-liner.

## Track B — Replace (Fastify → @effect/platform HttpApi)

`@effect/platform` HttpApi declares the API once (endpoints + Schema), then gives you a server implementation, a type-safe client, and an OpenAPI doc. Shape:

```ts
import { HttpApi, HttpApiGroup, HttpApiEndpoint, HttpApiBuilder } from "@effect/platform"
import { Schema } from "effect"

// 1. declare the spec (endpoints carry Schema for path/body/success/error)
const UsersApi = HttpApi.make("api").add(
  HttpApiGroup.make("users")
    .add(HttpApiEndpoint.get("getUser", "/users/:id")
      .setPath(Schema.Struct({ id: Schema.String }))   // gives the handler a typed `path.id`
      .addSuccess(User))
    .add(HttpApiEndpoint.post("createUser", "/users").setPayload(CreateUser).addSuccess(User)),
)

// 2. implement each group with HttpApiBuilder — handlers are Effects that use your services
const UsersLive = HttpApiBuilder.group(UsersApi, "users", (handlers) =>
  handlers
    .handle("getUser", ({ path }) => getUser(path.id))
    .handle("createUser", ({ payload }) => createUser(payload)),
)

// 3. serve (Node): HttpApiBuilder.api(UsersApi) + a platform HttpServer layer
```

> The exact HttpApi DSL (method chains, `HttpApiSchema.param`, error mapping) moves between `@effect/platform` minors — verify the current shape via context7 (`@effect/platform`) or the docs before writing it. Tagged errors added with `.addError(...)` map to HTTP status codes automatically.

`effect-http` (sukovanej) was the precursor and is **deprecated** (2024) in favor of HttpApi — don't target it. Migration of names: `Api`→`HttpApi`, `ApiGroup`→`HttpApiGroup`, `ApiEndpoint`→`HttpApiEndpoint`, `RouterBuilder`→`HttpApiBuilder`.

## Choosing per route group

- Hot path you can't risk → **Wrap**, ship, move on.
- A route group you're already reworking, or one that needs a typed client/OpenAPI → **Replace** with HttpApi.
- You can mix during a transition, but there is no official Fastify mount for platform web handlers (`(Request) => Promise<Response>` vs Fastify's Node req/reply) — run replaced groups on their own server/prefix, or write a small manual bridge.
