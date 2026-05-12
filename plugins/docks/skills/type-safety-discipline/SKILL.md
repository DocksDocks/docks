---
name: type-safety-discipline
description: Use when designing identifier types that could be mixed up across entities (UserId vs OrderId), validating external input (form/API/env), switching over tagged unions and needing exhaustiveness, choosing between `any` / `unknown` / generic bounds, or `interface` vs `type` alias. Primary examples in TypeScript; equivalency callouts for Rust (newtype), Kotlin (value class), Python (NewType). Covers branded types, discriminated unions, exhaustiveness, parse-don't-validate.
user-invocable: false
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.rs"
  - "**/*.kt"
  - "**/*.kts"
  - "**/*.py"
metadata:
  pattern: tool-wrapper
  updated: "2026-05-12"
---

# Type-Safety Discipline

<constraint>
Type systems exist to make invalid states unrepresentable. Escape hatches — `any` (TS), `Box<dyn Any>` / `unsafe` casts (Rust), `Any` / unchecked `as` (Kotlin), `Any` / `cast()` (Python) — undo that work. Reach for them only when an irreducible reason exists, and document it on the same line.
</constraint>

Primary examples below are in TypeScript. Each concept has a brief equivalency callout for Rust, Kotlin, and Python; deep examples live in `references/rust-newtype.md`, `references/kotlin-value-class.md`, `references/python-typing.md`.

## When to Use

- Writing or modifying any `.ts` / `.tsx` / `.rs` / `.kt` / `.py` file with type annotations.
- Defining a function signature, struct/class, or exported API.
- Choosing between object-shape vs sum-type representations: `interface`/`type` (TS), `struct`/`enum` (Rust), `data class`/`sealed interface` (Kotlin), `@dataclass`/tagged union (Python).
- Tempted to widen with `any` / `Any` / `object`, leave a parameter untyped, or use an unchecked cast (`as Foo`, `unsafe`, `cast()`).
- A string or number literal appearing in 2+ places.
- Designing variant component props or an API response with multiple shapes.
- Two ID-shaped values flow through the same code path (`UserId`, `OrgId`, `InvoiceId`).
- Parsing external data: form input, API response, environment variables, JSON file.
- Writing a `switch` / `match` / `when` over a tagged union and wanting compile-time exhaustiveness.

## Quick Reference

| Smell | Replace with | Why |
|---|---|---|
| `any` (TS), `Any?` (Kotlin), `Any` (Python) | typed-but-opaque (`unknown` / sealed type / `object`) + narrowing | Opacity preserves type-checker work; widening kills it |
| Magic string literal in 2+ places | TS `type X = "a" \| "b"`; Rust `enum`; Kotlin `enum class`; Python `Literal["a", "b"]` | Single source of truth, rename-safe |
| Plain object shape via `type` (TS) | `interface` (TS); `struct` (Rust); `data class` (Kotlin); `@dataclass` (Python) | Idiomatic shape declaration per language |
| Optional-flag bag | Discriminated union (TS) / `enum` (Rust) / `sealed interface` (Kotlin) / tagged dataclasses + `match` (Python) | Invalid states unrepresentable |
| `string` for both `userId` and `orgId` | Branded type (TS); newtype (Rust); `@JvmInline value class` (Kotlin); `NewType` (Python) | Compiler catches cross-entity mix-ups |
| `JSON.parse(raw) as Foo` (TS) and equivalents | zod (TS) / serde (Rust) / kotlinx.serialization (Kotlin) / Pydantic (Python) | Casts lie; parsers prove |
| `switch` / `match` / `when` with no exhaustive arm | `never` arm (TS); native `match` (Rust); `sealed when` (Kotlin); `assert_never` (Python) | Compiler flags every new variant |

## 1. `any` is poison — use the typed-but-opaque equivalent

`any` removes the type from a value AND from every consumer. `unknown` keeps the value opaque until you narrow it.

```ts
// BAD — `data.user.id` is `any`, propagates through every consumer
function fromJson(raw: string) {
  const data: any = JSON.parse(raw)
  return data.user.id
}

// GOOD — `unknown` forces a parser/check at the boundary
import { z } from "zod"
const Payload = z.object({ user: z.object({ id: z.string() }) })

function fromJson(raw: string) {
  const data: unknown = JSON.parse(raw)
  return Payload.parse(data).user.id
}
```

When you don't have a parser handy, narrow with `typeof` / `in` / `instanceof` / type predicates — never with `as`.

**Equivalency:**
- **Rust:** `serde_json::Value` is the typed-but-unstructured opaque; downcast to a concrete struct via `serde::Deserialize`. `Box<dyn Any>` is the closest analog to `any` and requires explicit downcasting.
- **Kotlin:** `Any?` requires explicit cast or smart-cast via `is`. Never widen to `Any` to escape type errors.
- **Python:** prefer `object` over `Any`. `Any` is a no-op for `mypy`/`pyright`; `object` forces `isinstance()` narrowing.

### Indicators

- `: any` (TS), unbounded `Any` (Python), unconstrained `Any?` (Kotlin) in production code
- `as any` (TS) / `as Any` (Kotlin) / `cast(Any, x)` (Python) — silent widening
- Property chains like `obj.maybe?.deeply.nested` without a check

## 2. Object shapes vs unions

```ts
// GOOD — interface for an object you'll likely extend
interface User { id: string; email: string }
interface AdminUser extends User { permissions: Permission[] }

// GOOD — type for a union (interfaces can't express unions)
type Result<T> = { ok: true; value: T } | { ok: false; error: string }

// GOOD — type for a function alias
type Handler = (req: Request) => Promise<Response>
```

Interfaces support declaration merging and give clearer error messages on extension chains. For unions/intersections/mapped types, `type` is the only option.

**Equivalency:**
- **Rust:** `struct` for shapes, `enum` for sum types — separate language constructs, no idiom tension.
- **Kotlin:** `data class` for shapes (gets `equals`/`hashCode`/`copy` for free), `sealed interface` for sum types.
- **Python:** `@dataclass` for shapes, `X | Y` (3.10+) for unions, tagged dataclasses + `match` for sum types.

## 3. No magic literals — name them with a type

```ts
// BAD — "pending" / "active" / "cancelled" sprinkled across the codebase
function setStatus(s: string) { /* ... */ }
setStatus("activ")  // typo compiles

// GOOD — single source of truth, compiler-enforced
type SubscriptionStatus = "pending" | "active" | "cancelled"
function setStatus(s: SubscriptionStatus) { /* ... */ }
setStatus("activ")  // ✗ compile error

// GOOD — when values come from a runtime list, derive the union with `as const`
const STATUSES = ["pending", "active", "cancelled"] as const
type SubscriptionStatus = typeof STATUSES[number]
```

**Equivalency:**
- **Rust:** `enum SubscriptionStatus { Pending, Active, Cancelled }` is the idiomatic form.
- **Kotlin:** `enum class SubscriptionStatus { PENDING, ACTIVE, CANCELLED }`.
- **Python:** `from typing import Literal; SubscriptionStatus = Literal["pending", "active", "cancelled"]` or `class SubscriptionStatus(StrEnum): PENDING = "pending"; ...` (3.11+).

For numeric magic constants, gather them in a single config object — `as const` in TS, `const` in Rust/Kotlin, module-level `Final` in Python.

## 4. Discriminated unions over optional-flag bags

```ts
// BAD — invalid states are representable
type Invite = {
  mode: "user" | "guest"
  userId?: string       // required when mode === "user"
  guestEmail?: string   // required when mode === "guest"
}

// GOOD — invalid states are unrepresentable
type Invite =
  | { mode: "user"; userId: string }
  | { mode: "guest"; guestEmail: string; guestName: string }

function send(invite: Invite) {
  if (invite.mode === "user") return inviteUser(invite.userId)
  return inviteGuest(invite.guestEmail, invite.guestName)
}
```

This is the type-level version of the Liskov rule from `solid`: every variant satisfies the contract on its own terms.

**Equivalency:**
- **Rust:** `enum Invite { User { id: UserId }, Guest { email: String, name: String } }` — canonical idiom. `match` narrows automatically and is exhaustive by default.
- **Kotlin:** `sealed interface Invite { class User(val id: UserId): Invite; class Guest(val email: String, val name: String): Invite }`. `when (invite) { is User -> ...; is Guest -> ... }` narrows and is exhaustive when used as an expression.
- **Python:** tagged dataclasses + `match` — `Invite = UserInvite | GuestInvite`; `match invite: case UserInvite(id): ...; case GuestInvite(email, name): ...`.

## 5. Branded types for IDs

```ts
// BAD — caller can pass an OrgId where UserId is expected
function loadUser(id: string) { /* ... */ }

// GOOD — branded types catch the mix-up at compile time
type Brand<T, B> = T & { readonly __brand: B }
type UserId = Brand<string, "UserId">
type OrgId  = Brand<string, "OrgId">

function loadUser(id: UserId) { /* ... */ }

const orgId = "..." as OrgId
loadUser(orgId)  // ✗ Argument of type 'OrgId' is not assignable to parameter of type 'UserId'
```

Construct branded values at the boundary (DB query, parser, login flow) — once. From then on the type carries the proof.

**Equivalency:**
- **Rust:** newtype — `pub struct UserId(String);`. Zero-cost; compiler treats `UserId` and `String` as distinct.
- **Kotlin:** `@JvmInline value class UserId(val value: String)` — inline at JVM bytecode, distinct at the type level.
- **Python:** `from typing import NewType; UserId = NewType('UserId', str)`. Static checker enforces; runtime is plain `str`.

Deep examples in `references/rust-newtype.md`, `references/kotlin-value-class.md`, `references/python-typing.md`.

## 6. Don't assert — narrow, parse, or design

`as const` is the one TS assertion that's almost always safe — it narrows literal types and freezes structures. `as Foo` (and unchecked casts in other languages) is a smell: it tells the compiler to trust you in a place where narrowing or parsing would prove the claim.

<constraint>
`as Foo` (TS) / `as` unchecked cast (Kotlin) / `unsafe` cast (Rust) / `cast(T, x)` (Python) is forbidden except: (1) literal narrowing via `as const` or equivalent, (2) double-assertion through `unknown`/`Any` when interfacing with a known-broken third-party type — and only with a same-line comment naming the library + issue link. Everything else has a parser, a type guard, or a `satisfies` clause that does the job without lying.
</constraint>

```ts
// BAD — compiler now told to trust the JSON.parse result
const config = JSON.parse(raw) as Config  // wrong shape? you find out at runtime

// GOOD — schema parser proves the shape
const config = ConfigSchema.parse(JSON.parse(raw))

// GOOD — `satisfies` (TS 4.9+) checks conformance without widening literals
const palette = {
  primary: "#2b6cb0",
  danger:  "#c53030",
} satisfies Record<string, `#${string}`>
```

**Equivalency:**
- **Rust:** `unsafe` and `mem::transmute` are the analogs — reserve for FFI or layout-compatible coercions. For primitive numeric coercion, `as` is fine; for type widening, refactor or use `From`/`TryFrom`.
- **Kotlin:** `as` is an unchecked cast (raises `ClassCastException` at runtime). `as?` is safer (null on failure). Prefer smart-casts via `is` or sealed `when`.
- **Python:** `cast(T, x)` is a checker hint, not a runtime check. Use `isinstance()` for narrowing; Pydantic for parsing.

## 7. Exhaustive matching

```ts
type Event =
  | { kind: "click"; x: number; y: number }
  | { kind: "key"; code: string }
  | { kind: "scroll"; delta: number }

function handle(e: Event) {
  switch (e.kind) {
    case "click":  return onClick(e.x, e.y)
    case "key":    return onKey(e.code)
    case "scroll": return onScroll(e.delta)
    default: {
      const _exhaustive: never = e
      throw new Error(`unhandled event: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
// Add `{ kind: "drag"; ... }` to Event → compile error in `handle()`. Fix forced.
```

The runtime `throw` covers the off-chance the compiler is bypassed (data crossing a JSON boundary, `as` cast upstream).

**Equivalency:**
- **Rust:** `match` is exhaustive by default — the compiler errors on missing arms. No special idiom needed.
- **Kotlin:** `when` over a `sealed` class/interface is exhaustive when used as an expression: `val r = when (e) { is Click -> ...; is Key -> ...; is Scroll -> ... }`. Statement form (`when (e) { ... }`) is not checked — always assign or return.
- **Python:** `match` + `typing.assert_never(x)` in a wildcard arm (3.11+) forces `mypy --strict` to error on unhandled variants.

## 8. Parse, don't assert, at I/O boundaries

```ts
// BAD — env access typed as `string | undefined`, casted away
const apiKey = process.env.API_KEY as string  // crashes silently if unset

// GOOD — schema validates at startup
import { z } from "zod"

const Env = z.object({
  API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535),
})

export const env = Env.parse(process.env)  // throws on boot if misconfigured
```

Same pattern for: API request bodies (Server Actions, route handlers), `JSON.parse` results, database row reads if your driver doesn't already type them, message payloads.

**Equivalency:**
- **Rust:** `serde_json::from_str::<T>(raw)?` returns `Result<T, Error>`. For env, the `envy` or `figment` crates parse env vars into a typed struct.
- **Kotlin:** `kotlinx.serialization`: `Json.decodeFromString<Config>(raw)` — throws on shape mismatch. Jackson is the JVM-only alternative.
- **Python:** Pydantic v2 (`Model.model_validate(...)` for objects, `Model.model_validate_json(raw)` for JSON strings, `BaseSettings` for env vars).

<constraint>
Boundaries get parsers, not casts. Inside the typed core, never use `as` (or equivalents) to widen or to "tell the compiler this is fine" — narrow with type guards or refactor the type. The type system is only as honest as the boundary.
</constraint>

## Decision Tree — When You're Stuck

1. **Tempted to write `any` / `Any` / `object`?** → Use the typed-but-opaque equivalent and narrow. If the shape is dynamic, parse at the boundary.
2. **Tempted to write `as Foo` / unchecked cast?** → 99% chance there's a type guard, smart-cast, or parser that does it without lying.
3. **Same string literal in 2+ places?** → Extract to a type / enum / `Literal`.
4. **Optional fields with "required when X" rules?** → Discriminated union / sum type.
5. **Two ID-shaped values flowing through the same function?** → Brand them (TS branded, Rust newtype, Kotlin value class, Python `NewType`).
6. **`switch` / `match` / `when` over a union?** → Use the exhaustiveness mechanism for your language.

## Gotchas

- **TS:** Don't type `useState<string>("")` if only a few values are valid. Use the union: `useState<Status>("pending")`.
- **TS:** `enum` is mostly avoided in modern TS — it generates runtime objects and has narrowing quirks. Prefer `as const` arrays + `typeof X[number]` unions, or string literal unions.
- **TS:** `Record<string, X>` widens to "any string is a valid key". Prefer `Record<KnownKey, X>` or `Map<string, X>`.
- **Universal:** Don't over-brand. Brand IDs and security-critical strings. Branding every `email`/`name`/`title` is noise.
- **TS:** `satisfies` is not a replacement for explicit return types on exported functions — keep `export function fn(): ReturnType { ... }` for public APIs.
- **Rust:** Don't reach for `Box<dyn Any>` to escape type errors — it requires runtime downcasting and is rarely the right answer. Use traits or `enum` for polymorphism.
- **Kotlin:** `lateinit var` is an escape hatch with runtime cost (throws on access if unset). Prefer constructor injection or a nullable that you narrow.
- **Python:** Don't suppress type errors with `# type: ignore` without a same-line reason. The `lint-no-suppressions` skill applies.

## References

- Per-language deep-dives: `references/rust-newtype.md`, `references/kotlin-value-class.md`, `references/python-typing.md`.
- TypeScript handbook — `unknown` vs `any`: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#unknown
- TypeScript handbook — discriminated unions + `never`: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions
- TypeScript 4.9 — `satisfies` operator: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator
- Rust Book — newtype pattern: https://doc.rust-lang.org/book/ch20-04-advanced-types.html
- Kotlin value classes: https://kotlinlang.org/docs/inline-classes.html
- Python `typing.NewType`: https://docs.python.org/3/library/typing.html#newtype
