# Data Modeling with Schema

`Schema` (from **`effect/Schema`** — not `@effect/schema`) is one declaration that gives you a runtime decoder/encoder *and* a static type. Model your domain in Schema and validation, serialization, and types stay in sync.

## Records / product types → `Schema.Class`

```ts
import { Schema } from "effect"

class User extends Schema.Class<User>("User")({
  id: UserId,                       // a branded primitive (below)
  name: Schema.String,
  email: Schema.String,
  createdAt: Schema.DateFromString, // decodes ISO string → Date, encodes back
}) {
  get displayName() { return `${this.name} <${this.email}>` }
}

User.make({ id, name, email, createdAt: new Date() })   // construct (validates)
```

`Schema.Class` gives an opaque class type, a constructor, and getters/methods — preferred over a bare `Schema.Struct` when the type is a domain entity.

## Variants / sum types → `Schema.TaggedClass` + `Schema.Union`

```ts
class Pending  extends Schema.TaggedClass<Pending>()("Pending", {}) {}
class Shipped  extends Schema.TaggedClass<Shipped>()("Shipped", { trackingNo: Schema.String }) {}
class Delivered extends Schema.TaggedClass<Delivered>()("Delivered", { at: Schema.DateFromString }) {}

const OrderStatus = Schema.Union(Pending, Shipped, Delivered)
type OrderStatus = Schema.Schema.Type<typeof OrderStatus>

// exhaustive match on the _tag:
import { Match } from "effect"
const label = Match.type<OrderStatus>().pipe(
  Match.tag("Pending", () => "waiting"),
  Match.tag("Shipped", (s) => `tracking ${s.trackingNo}`),
  Match.tag("Delivered", () => "done"),
  Match.exhaustive,
)
```

## Brand primitives — stop ID mix-ups

```ts
const UserId = Schema.String.pipe(Schema.brand("UserId"))
const PostId = Schema.String.pipe(Schema.brand("PostId"))
type UserId = Schema.Schema.Type<typeof UserId>     // string & Brand<"UserId">

declare function getUser(id: UserId): void
getUser(somePostId)   // ❌ compile error — PostId is not assignable to UserId
```

Brand nearly every domain primitive (ids, emails, slugs, money). It's the cheapest bug-prevention Schema gives you.

## Decode external input — never trust `JSON.parse`

```ts
// from unknown (HTTP body, queue message):
const user = yield* Schema.decodeUnknown(User)(payload)        // Effect<User, ParseError>
// sync variant — plain value, throws ParseError; NOT an Effect (no yield*), trusted input only:
const user2 = Schema.decodeUnknownSync(User)(payload)
// from a JSON string in one step:
const cfg  = yield* Schema.decode(Schema.parseJson(Settings))(rawString)
// encode back to the wire shape:
const wire = yield* Schema.encode(User)(user)
```

`decodeUnknown` returns an `Effect` whose error is `ParseError` — pipe it straight into your tagged-error handling.

## Refinements, transforms, optional fields

```ts
const Age   = Schema.Number.pipe(Schema.int(), Schema.between(0, 150))
const Email = Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+$/), Schema.brand("Email"))

const Settings = Schema.Struct({
  theme: Schema.Literal("light", "dark"),
  retries: Schema.optionalWith(Schema.Number, { default: () => 3 }),  // default on decode
  nickname: Schema.optional(Schema.String),                           // may be absent
})

// custom bidirectional transform:
const Trimmed = Schema.transform(Schema.String, Schema.String, {
  decode: (s) => s.trim(),
  encode: (s) => s,
})
```

## Gotchas

- Import from `effect/Schema`. `@effect/schema` is deprecated (folded into core in Effect 3.10).
- `Schema.Struct` is the plain record; reach for `Schema.Class` when you want a nominal domain type with methods.
- Decoding is effectful (`ParseError` in `E`) — handle it, don't `decodeUnknownSync` on untrusted input in a request path.
- For a discriminated union, give each member a distinct tag via `Schema.TaggedClass`/`Schema.TaggedStruct` so `Match.tag` + `Match.exhaustive` can prove totality.
