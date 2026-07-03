# Error Handling

Effect splits failures into two kinds:

- **Typed errors** (the `E` channel) — *expected* domain failures: validation, not-found, permission-denied, a 4xx from an upstream API. Recoverable, enumerated in the type.
- **Defects** — *unexpected* bugs and broken invariants. Not in `E`; they bubble as `Cause.Die`. You usually let them crash (and log), not `catch` them.

The skill is choosing the right channel and never letting a `throw` silently become a defect.

## Defining tagged errors

```ts
import { Data, Schema } from "effect"

// in-process only (cheapest):
class UserNotFound extends Data.TaggedError("UserNotFound")<{ id: string }> {}
class DbError      extends Data.TaggedError("DbError")<{ cause: unknown }> {}

// crosses a boundary (HTTP/RPC/queue) → serializable, schema-validated:
class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  field: Schema.String,
  message: Schema.String,
}) {}
```

Rule of thumb: **`Data.TaggedError` until the error has to leave the process**, then `Schema.TaggedError` (it encodes/decodes and integrates with `HttpApi` status mapping). The `_tag` field is what `catchTag` matches on.

## Wrapping promise / throwing code

```ts
import { Effect } from "effect"

// GOOD — failure is typed as DbError, never a defect
const query = (id: string) =>
  Effect.tryPromise({
    try: () => db.user(id),
    catch: (cause) => new DbError({ cause }),
  })

// no `catch` → fails with the untyped UnknownException (fine for throwaway scripts, not domain code)
const loose = Effect.tryPromise(() => fetch(url))
// synchronous throwing code → Effect.try({ try, catch })
```

Never `try/catch` inside `Effect.gen` — the language service flags `tryCatchInEffectGen`, and the caught error escapes the `E` channel.

## Recovering

```ts
program.pipe(
  Effect.catchTag("UserNotFound", (e) => Effect.succeed(guestFor(e.id))),
  Effect.catchTags({
    DbError: (e) => Effect.logError(e.cause).pipe(Effect.zipRight(Effect.fail(new ServiceUnavailable()))),
    ValidationError: (e) => Effect.fail(new BadRequest({ field: e.field })),
  }),
)

// map/translate without recovering:
program.pipe(Effect.mapError((e) => new PublicError({ cause: e })))
// recover by value:  Effect.catchAll / Effect.orElse / Effect.catchAllCause (sees defects too)
```

## Typed error → defect (and back)

```ts
// at the composition root, an unrecoverable config failure should crash, not be a typed error:
const config = loadConfig.pipe(Effect.orDie)            // E becomes a defect
const configMsg = loadConfig.pipe(Effect.orDieWith((e) => new Error(`bad config: ${e}`)))

// inspect the full failure (typed errors + defects + interruptions):
program.pipe(Effect.catchAllCause((cause) => Effect.logError(cause)))
```

## Retry & timeouts (typed errors are ret-riable)

```ts
import { Effect, Schedule } from "effect"
query(id).pipe(
  Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3)))),
  Effect.timeout("5 seconds"),     // adds TimeoutException to E
)
```

## Checklist

- Expected failure → tagged error in `E`. Bug/invariant → defect (`orDie`, or just let it throw outside Effect).
- `Data.TaggedError` in-process; `Schema.TaggedError` across a boundary.
- Wrap every Promise with `Effect.tryPromise({ try, catch })`; wrap sync throwers with `Effect.try`.
- Recover with `catchTag`/`catchTags`; translate with `mapError`; see everything with `catchAllCause`.
