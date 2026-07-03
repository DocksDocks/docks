# Config

`Config` reads environment/configuration as a typed, composable value with validation and secret-hiding built in. Replaces ad-hoc `process.env.FOO!` access (which the language service flags as `processEnvInEffect`).

## Primitives

```ts
import { Config, Effect } from "effect"

const port    = Config.integer("PORT")
const host    = Config.string("HOST")
const debug   = Config.boolean("DEBUG")
const timeout = Config.duration("REQUEST_TIMEOUT")   // "5 seconds" → Duration
const apiUrl  = Config.url("API_URL")
const apiKey  = Config.redacted("API_KEY")           // Redacted<string> — never printed in logs/errors
```

`Config.redacted` wraps the value so it renders as `<redacted>` everywhere; unwrap only at the point of use with `Redacted.value(key)`.

## Defaults, fallbacks, nesting

```ts
const port = Config.integer("PORT").pipe(Config.withDefault(3000))
const key  = Config.redacted("API_KEY").pipe(Config.orElse(() => Config.redacted("LEGACY_KEY")))

// group related keys under a prefix:  DB_HOST, DB_PORT
const db = Config.all({
  host: Config.string("HOST"),
  port: Config.integer("PORT").pipe(Config.withDefault(5432)),
}).pipe(Config.nested("DB"))
```

## Reading config

```ts
const program = Effect.gen(function* () {
  const cfg = yield* db          // Config is itself an Effect that fails with ConfigError
  return connect(cfg.host, cfg.port)
})
```

A missing/invalid key fails with `ConfigError` in the `E` channel — so config problems surface at layer construction, not as a `undefined` three calls deep.

## Config as a service (the idiom)

Wrap config in a service so the rest of the app depends on a typed value, and tests inject a fixed one:

```ts
class AppConfig extends Effect.Service<AppConfig>()("app/Config", {
  effect: Config.all({
    port: Config.integer("PORT").pipe(Config.withDefault(3000)),
    apiKey: Config.redacted("API_KEY"),
  }),
}) {}

// prod: AppConfig.Default reads from the environment
// test: a fixed layer
const TestConfig = Layer.succeed(AppConfig, { port: 0, apiKey: Redacted.make("test") } as any)
```

## Providers (where values come from)

```ts
import { ConfigProvider, Effect, Layer } from "effect"

// default provider reads process.env — nothing to wire for the common case.
// override for tests with an in-memory map:
const testProvider = ConfigProvider.fromMap(
  new Map([["PORT", "0"], ["API_KEY", "test-key"]])
)
program.pipe(Effect.withConfigProvider(testProvider))
// or as a layer:  Layer.setConfigProvider(testProvider)
```

## Checklist

- Never read `process.env` inside an Effect — use `Config.*`.
- Secrets → `Config.redacted`; unwrap with `Redacted.value` only at use.
- Wrap config in a service with a `Default` (env) layer and a fixed test layer.
- Tests inject values via `ConfigProvider.fromMap`, not by mutating `process.env`.
