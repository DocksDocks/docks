---
name: solid
description: Use when designing a module / service / class with multiple concerns, refactoring a 300+ LOC file with mixed change axes, replacing a growing switch/if-else with a strategy map, converting runtime instanceof checks into discriminated unions, splitting a fat interface, or breaking a hard-coded dependency on a concrete SDK. Generic SOLID for TS / Python / Go — React-component composition lives in react-reuse-components.
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-05-06"
---

# SOLID — Single Responsibility, Open/Closed, Liskov, Interface Segregation, Dependency Inversion

Five design pressures for keeping modules cohesive, extensible, and substitutable. Originally framed for OO, but each one applies to function-based code (TypeScript modules, Python packages, Go interfaces) — only the implementations change.

<constraint>
SOLID describes design pressure, not a checklist. Don't apply a principle until the smell it addresses appears: file > 300 LOC with mixed change axes, switch with 5+ arms, runtime type checks gating behavior, fat interface, hard-coded SDK. Premature application is over-engineering. Wait for the second use-site or the third change axis before splitting.
</constraint>

<constraint>
Don't add classes / inheritance just to "make SOLID fit." If a codebase is function-first — pure functions, ESM modules, structural types — the principles still apply via discriminated unions, strategy maps, and module splits. Adding an `abstract class FormatterBase` to an otherwise-functional codebase is the opposite of SRP.
</constraint>

<constraint>
The Strategy Map (the Open/Closed pattern in this skill) is code, not config. Never move map entries to JSON / YAML — you trade type safety, exhaustiveness checks, and tree-shaking for a "data-driven" win that becomes parallel duplication the moment a variant needs custom logic.
</constraint>

## When to Use

- A module or file has crossed ~300 LOC and two change axes share the file.
- A switch / if-else chain has 5+ arms and is about to grow another.
- An interface or class has 10+ methods, with subsets only relevant in specific modes.
- Business logic instantiates a concrete SDK (`new StripeClient(...)`) directly.
- Runtime type checks (`instanceof`, `typeof`, duck-typed `if (x.method)`) gate behavior at multiple call sites.

## S — Single Responsibility

"A module has one reason to change."

| Smell | Fix |
|---|---|
| `userService.ts` covers CRUD + permissions + invitations + view-as | **Split by change axis**: `user-crud.ts`, `permissions.ts`, `invitations.ts`, `view-as.ts`. Different stakeholders, different change cadences. |
| One module both fetches and formats data for display | **Layer split**: data layer returns clean records; presentation layer formats. Changes that affect the API call differ from those that affect format. |
| `OrderProcessor.process()` validates, charges, emails, audits | **Extract step functions**: `validateOrder`, `chargeCard`, `sendConfirmation`, `recordAudit`. The orchestrator becomes a 4-line composition. |

The word "and" in a function or module name is an SRP red flag.

### Indicators

- File > 300 LOC with two unrelated concerns.
- Two pull requests touching the same file for unrelated reasons.
- Tests for one concern fail when the other is changed.

## O — Open/Closed (Strategy Map)

"Open for extension, closed for modification." Reach for a lookup table when a switch grows past four arms.

```ts
// BAD — every new event type means editing formatEvent()
function formatEvent(type: string, e: Event): string {
  switch (type) {
    case "user_invited":       return `${e.actor} invited ${e.target}`;
    case "role_changed":       return `${e.actor} changed role`;
    case "permission_granted": return `${e.actor} granted ${e.resource}`;
    // 13 more cases
  }
}

// GOOD — Strategy Map; new variants drop in without editing the dispatcher
type Formatter = (e: Event) => string;

const FORMATTERS: Record<string, Formatter> = {
  user_invited:       (e) => `${e.actor} invited ${e.target}`,
  role_changed:       (e) => `${e.actor} changed role`,
  permission_granted: (e) => `${e.actor} granted ${e.resource}`,
};

function formatEvent(type: string, e: Event): string {
  return (FORMATTERS[type] ?? ((evt) => `unknown: ${type}`))(e);
}
```

Split the map by domain when it grows further: `DASHBOARD_FORMATTERS` + `WORKFLOW_FORMATTERS`, merged via spread.

### Indicators

- switch with 5+ arms, with adds outpacing removes.
- A `default:` arm that swallows unknown variants instead of failing closed.
- Code review comments of the form "every time we add X we have to edit Y."

## L — Liskov Substitution

"Subtypes must be substitutable for the base contract." In function-first code this maps to discriminated unions over runtime type checks.

```ts
// BAD — runtime instanceof / duck-typing, ambiguous fallthrough
type Notification = {
  channel?: string;
  recipient?: string;
  webhookUrl?: string;
};

function send(n: Notification) {
  if (n.webhookUrl) return postWebhook(n.webhookUrl, n);
  if (n.channel === "email") return sendEmail(n.recipient!, n);
  if (n.channel === "sms")   return sendSms(n.recipient!, n);
  // silent no-op for unknown shapes
}

// GOOD — discriminated union, exhaustive narrowing
type Email   = { kind: "email";   recipient: string; subject: string; body: string };
type Sms     = { kind: "sms";     recipient: string; body: string };
type Webhook = { kind: "webhook"; url: string; payload: object };
type Notification = Email | Sms | Webhook;

function send(n: Notification) {
  switch (n.kind) {
    case "email":   return sendEmail(n.recipient, n.subject, n.body);
    case "sms":     return sendSms(n.recipient, n.body);
    case "webhook": return postWebhook(n.url, n.payload);
  }
}
```

The `kind` field is the contract; the compiler now flags every missing variant.

### Indicators

- Same field carrying different semantics depending on another field's value.
- Optional fields that are "required in some configurations" (documented in comments, not types).
- `?.` chains gating behavior at runtime instead of types narrowing it at compile time.

## I — Interface Segregation

"No client should depend on methods it does not use." Don't merge two callers' contracts into one fat interface.

```ts
// BAD — one Repository, three concerns
interface UserRepository {
  findById(id: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUser): Promise<User>;
  update(id: string, patch: Patch): Promise<User>;
  delete(id: string): Promise<void>;
  exportAll(): Promise<User[]>;
  bulkAnonymize(ids: string[]): Promise<void>;
  resetSchema(): Promise<void>;
}

// GOOD — split along the caller boundary
interface UserReader { findById(id: string): Promise<User>; findByEmail(email: string): Promise<User | null>; }
interface UserWriter { create(input: CreateUser): Promise<User>; update(id: string, patch: Patch): Promise<User>; delete(id: string): Promise<void>; }
interface UserAdmin  { exportAll(): Promise<User[]>; bulkAnonymize(ids: string[]): Promise<void>; resetSchema(): Promise<void>; }
```

A read-only request handler imports `UserReader` only; mocking it for tests doesn't require stubbing 8 admin methods.

### Indicators

- Interface has 10+ methods.
- Some methods are "only relevant in mode X" (documented in comments, not types).
- Tests need `jest.fn()` placeholders for methods the unit under test never calls.

## D — Dependency Inversion

"Depend on abstractions, not concretions." Pass dependencies as parameters; let the composition root pick the implementation.

```ts
// BAD — business logic instantiates the concrete SDK
import Stripe from "stripe";
export class CheckoutService {
  private stripe = new Stripe(process.env.STRIPE_KEY!);
  async charge(amount: number) {
    return this.stripe.charges.create({ amount });
  }
}

// GOOD — interface as port, SDK adapter behind it
interface PaymentGateway {
  charge(amount: number): Promise<{ id: string }>;
}
export class CheckoutService {
  constructor(private gateway: PaymentGateway) {}
  async charge(amount: number) {
    return this.gateway.charge(amount);
  }
}
// composition root wires the Stripe adapter; tests pass a fake gateway
```

In codebases without a DI container, function arguments are the abstraction:

```ts
export async function checkout(
  amount: number,
  charge: (n: number) => Promise<{ id: string }>,
) {
  return charge(amount);
}
```

Either form decouples the caller from `Stripe` so tests, swaps, and provider migrations don't ripple through every call site.

### Indicators

- A business-logic file imports a concrete SDK directly (`new StripeClient`, `new PrismaClient`, `redis.createClient`).
- "We can't run this in tests without a real database / API."
- "We can't swap providers without rewriting half the codebase."

## Decision Tree

| Smell | Fix | Principle |
|---|---|---|
| File > 300 LOC, multiple change axes | Split module along change axes | S |
| Switch with 5+ arms, growing | Strategy Map (`Record<key, fn>`) | O |
| `instanceof` / duck-type checks gating behavior | Discriminated union + exhaustive switch | L |
| Interface > 10 methods with mutually-exclusive subsets | Split interface along caller groups | I |
| Business logic imports concrete SDK | Inject via interface / function parameter | D |

## Common Traps

| Wrong fix | Right fix |
|---|---|
| Add an `abstract class Formatter` and a subclass per variant | Strategy Map (`Record<string, (x: T) => U>`) — same Open/Closed property, no inheritance tax |
| Move switch arms to `formatters.json` | Keep them as code; otherwise you lose exhaustiveness and tree-shaking |
| Wrap every dependency in an interface "for testability" | Wrap only at the boundary you actually want to swap (the SDK, the network, the clock) |
| Split a 200-line module into 4 × 50-line modules to "obey SRP" | Leave it; don't split until two genuinely independent change axes share the file |
| Use `extends` to share method implementations | Composition: extract a function, call it from both places |
| Add a `?` to every optional field "for flexibility" | Discriminated union — the variant carries which fields are required |

## References

- Companion skill: `react-reuse-components` for React component composition patterns (compound, polymorphic, headless, slots) — distinct from SOLID's structural concerns
- Companion skill: `typescript-typing` for discriminated-union ergonomics referenced in the L section
- Uncle Bob's original SOLID essays: https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html
- TypeScript discriminated unions: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions
