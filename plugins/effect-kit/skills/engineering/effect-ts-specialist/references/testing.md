# Testing with `@effect/vitest`

`@effect/vitest` runs Effects as tests with the test context wired in — including a **`TestClock` frozen at zero**, so time-dependent code is deterministic. Install `@effect/vitest` as a dev dependency and import `it` from it.

## The test entry points

```ts
import { it, expect } from "@effect/vitest"
import { Effect } from "effect"

// it.effect — auto-provides TestContext + TestClock (time starts at 0, advances only when you say)
it.effect("adds users", () =>
  Effect.gen(function* () {
    const users = yield* Users
    const all = yield* users.getAll
    expect(all).toHaveLength(0)
  }).pipe(Effect.provide(Users.Default)))

// it.live — real clock / real services (use when you actually need wall-clock or real delays)
it.live("hits the network", () => Effect.gen(function* () { /* ... */ }))

// it.scoped — for effects that acquire scoped resources; the scope closes at test end
it.scoped("opens and closes a connection", () => Effect.gen(function* () { /* ... */ }))
```

Modifiers compose as in vitest: `it.effect.skip`, `it.effect.only`, `it.effect.fails` (asserts the effect fails).

## Controlling time with `TestClock`

```ts
import { it, expect } from "@effect/vitest"
import { Effect, TestClock, Fiber } from "effect"

it.effect("times out after 5s without blocking the test", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(slowOp.pipe(Effect.timeout("5 seconds")))
    yield* TestClock.adjust("5 seconds")        // virtual time jump — test runs instantly
    const exit = yield* Fiber.await(fiber)      // Exit — Fiber.join would re-raise the failure
    expect(exit._tag).toBe("Failure")
  }))
```

`TestClock.adjust` advances virtual time, firing any scheduled effects (timeouts, `Effect.sleep`, `Schedule`) without real waiting.

## Mocking services with layers

Swap a real layer for a fake by providing a different `Layer` — no mocking framework:

```ts
const FakeUsers = Layer.succeed(Users, {
  getAll: Effect.succeed([{ id: "1", name: "Test" }]),
})

it.effect("uses the fake", () =>
  Effect.gen(function* () {
    const users = yield* Users
    expect(yield* users.getAll).toHaveLength(1)
  }).pipe(Effect.provide(FakeUsers)))
```

Define a static `testLayer` next to a service's real `layer` for reuse. **Provide per-test** (inside each `it.effect`) for isolation, unless a resource is expensive enough to share via a suite-level layer.

## Notes

- Logging is suppressed by default under `it.effect` (verify: `Effect.log` prints nothing there, but does under `it.live`); re-enable with a `Logger` layer or switch to `it.live`.
- Assert on `Exit` (`Effect.runPromiseExit` / `Fiber.await` / `Effect.exit`) when testing the failure channel — `Fiber.join` re-raises the failure instead of yielding an Exit.
- The test script should run `vitest` (not `bun test`); pin `@effect/vitest` to match your `effect` version.
