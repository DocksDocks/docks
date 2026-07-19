# @effect/platform HttpApi (Track B target)

Declarative HTTP: define endpoints once with Schema and the same definition yields the server implementation, a typed client, and OpenAPI docs. This is the current-DSL companion to `fastify.md`'s Track B sketch — and works standalone for any Node HTTP surface.

> Verified against `@effect/platform` 0.96.2 (2026-07-05). The platform docs classify HttpApi as an **Unstable** module within Effect 3.x — the DSL moves between platform minors, so re-verify shapes against the package README (`Effect-TS/effect` → `packages/platform`) before writing code; effect.website deliberately defers HttpApi docs to that README.

## Contents

- [Declare — the spec is endpoints + Schema](#declare--the-spec-is-endpoints--schema)
- [Errors → status codes](#errors--status-codes)
- [Implement — handlers are Effects](#implement--handlers-are-effects)
- [Serve (Node)](#serve-node)
- [Typed client (free)](#typed-client-free)
- [Auth / middleware (sketch)](#auth--middleware-sketch)
- [Gotchas](#gotchas)

## Declare — the spec is endpoints + Schema

```ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

// path params, two equivalent styles:
const idParam = HttpApiSchema.param("id", Schema.NumberFromString)
const getUser = HttpApiEndpoint.get("getUser")`/users/${idParam}`.addSuccess(User)
// or a ":id" string path + an explicit path schema:
const getUserAlt = HttpApiEndpoint.get("getUser", "/users/:id")
  .setPath(Schema.Struct({ id: Schema.NumberFromString }))
  .addSuccess(User)

const createUser = HttpApiEndpoint.post("createUser", "/users")
  .setPayload(Schema.Struct({ name: Schema.String }))
  .addSuccess(User, { status: 201 })
  .addError(UserNotFound, { status: 404 })

const api = HttpApi.make("api").add(
  HttpApiGroup.make("users").add(getUser).add(createUser).prefix("/v1"),
)
```

Methods in the current README: `get` / `post` / `patch` / `del` (not `delete`); catch-all path `"*"`. Also `.setUrlParams(Schema.Struct({…}))` for query strings (repeated params via `Schema.Array`) and `.setHeaders(…)`. `.prefix()` exists at endpoint, group, and api level.

## Errors → status codes

```ts
class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized", {}, HttpApiSchema.annotations({ status: 401 })
) {}
// or bind at the endpoint:  .addError(UserNotFound, { status: 404 })
```

Defaults: success **200** (**204** for void), unannotated errors **500**, request-validation failures → `HttpApiDecodeError` (**400**). The `HttpApiError` module ships prebuilt classes (`NotFound`, `Unauthorized`, `Conflict`, …) usable as `.addError(HttpApiError.NotFound)`.

## Implement — handlers are Effects

```ts
import { HttpApiBuilder } from "@effect/platform"

const UsersLive = HttpApiBuilder.group(api, "users", (handlers) =>
  handlers
    .handle("getUser", ({ path: { id } }) => getUserById(id))
    .handle("createUser", ({ payload }) => createUserFn(payload)),
)
const ApiLive = HttpApiBuilder.api(api).pipe(Layer.provide(UsersLive))
```

The handler input carries only the keys whose schema you set (`path`, `payload`, `urlParams`, `headers`) plus always `request` (the raw `HttpServerRequest`). The group callback may be an `Effect.gen` that yields services before returning the handlers.

## Serve (Node)

```ts
import { HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { createServer } from "node:http"

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(HttpApiSwagger.layer({ path: "/docs" })),   // OpenAPI UI — "/docs" is the default path
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(ApiLive),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
)
Layer.launch(HttpLive).pipe(NodeRuntime.runMain)
```

For serverless / web-standard runtimes, `HttpApiBuilder.toWebHandler` yields a `(Request) => Promise<Response>` — the Next.js seam used in `nextjs.md`.

## Typed client (free)

```ts
import { FetchHttpClient, HttpApiClient } from "@effect/platform"

const users = Effect.gen(function* () {
  const client = yield* HttpApiClient.make(api, { baseUrl: "http://localhost:3000" })
  return yield* client.users.getUser({ path: { id: 1 } })
}).pipe(Effect.provide(FetchHttpClient.layer))
```

Call shape is `client.<group>.<endpoint>({ path, payload, urlParams, … })`; it needs an `HttpClient` layer (e.g. `FetchHttpClient.layer`).

## Auth / middleware (sketch)

`HttpApiMiddleware.Tag` classes attach with `.middleware(…)` at endpoint, group, or api level; `HttpApiSecurity.bearer` / `.apiKey` / `.basic` declare auth schemes — the bearer token arrives as a `Redacted` value, and `provides:` hands e.g. `CurrentUser` to downstream handlers. Full shapes: the platform README §Middleware.

## Gotchas

| Gotcha | Right move |
|---|---|
| `:id` path without `.setPath` | Handler gets no typed `path.id` — set the path schema, or use the template-literal + `HttpApiSchema.param` style |
| `HttpApiEndpoint.delete` | It's `del` |
| `PUT` endpoints | Not demonstrated in the current README — verify against the typings before using |
| Mixed-case keys in a headers schema | Headers are normalized to lowercase; use lowercase keys only |
| Calling the API from React components | `AtomHttpApi.Tag` wraps `HttpApiClient` as atoms — see `react.md` |
