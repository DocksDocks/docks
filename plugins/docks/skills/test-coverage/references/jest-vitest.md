# Jest / Vitest Conventions

Per-framework expansion of the parent SKILL.md. Load when the project's test runner is Jest or Vitest. Pairs with the universal 6-step procedure and `<constraint>` rules in `../SKILL.md`.

## Detection

| Signal | Framework |
|---|---|
| `vitest.config.ts` / `vite.config.*` with a `test:` block | Vitest |
| `jest.config.js` / `jest.config.ts` / `"jest": {}` in package.json | Jest |
| `"test": "vitest run"` in `package.json` `scripts` | Vitest |
| `"test": "jest"` | Jest |
| Imports use `from "vitest"` (`vi.mock`, `vi.fn`) | Vitest |
| Imports use globals (`jest.fn()`, no `from "jest"`) | Jest |

The APIs are similar but not identical — Vitest uses `vi.*`, Jest uses `jest.*` and globals.

## File Naming Conventions

- Co-located: `parseDuration.ts` + `parseDuration.test.ts` in the same directory (most common, Vitest default)
- `__tests__/` folder: `src/utils/__tests__/parseDuration.test.ts` (Jest default with `testPathIgnorePatterns`)
- `.spec.ts` extension: some projects prefer for "spec" vs "unit"
- Read the project's existing files; match exactly.

## Assertion Idioms

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"; // or "@jest/globals"

describe("parseDuration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ms for '1h30m'", () => {
    expect(parseDuration("1h30m")).toBe(5_400_000);
  });

  it("throws on invalid input", () => {
    expect(() => parseDuration("furlongs")).toThrow(/invalid/i);
  });

  it("resolves async", async () => {
    await expect(asyncFn()).resolves.toEqual({ ok: true });
    await expect(asyncFails()).rejects.toThrow(/specific/);
  });
});
```

Common matchers (both): `toBe`, `toEqual` (deep), `toContain`, `toMatch`, `toHaveLength`, `toBeNull`, `toThrow`, `.resolves` / `.rejects`.

## Mocking

```ts
// Vitest — auto-mocked module
vi.mock("./api", () => ({
  fetchUser: vi.fn(() => Promise.resolve({ id: 1, name: "x" }))
}));

// Vitest — partial mock with importActual
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, fetchUser: vi.fn() };
});

// Jest equivalent
jest.mock("./api", () => ({
  fetchUser: jest.fn(() => Promise.resolve({ id: 1, name: "x" }))
}));
```

ES-modules gotcha: `vi.mock` / `jest.mock` are hoisted to the top of the file. Variables defined before the call aren't available inside the factory — use `vi.hoisted` (Vitest) or define mocks inside the factory.

## Common Mock-Shape Mismatches

| Real function returns | Easy-to-get-wrong mock |
|---|---|
| `Promise<User>` | Mock returning `User` (not wrapped) → `await` returns undefined |
| `{ data: User[] }` (axios-style) | Mock returning `User[]` directly |
| `[User, ...]` (tuple/array) | Mock returning `{ data: [...] }` |
| Default-exported function | `vi.mock("./api", () => ({ fetchUser: vi.fn() }))` — missing `default:` key |

Always read the real function's signature BEFORE writing the mock.

## React Testing Library (when React is in the project)

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

it("submits on click", async () => {
  const onSubmit = vi.fn();
  render(<Form onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText(/name/i), "Alice");
  await userEvent.click(screen.getByRole("button", { name: /submit/i }));
  expect(onSubmit).toHaveBeenCalledWith({ name: "Alice" });
});
```

Use `userEvent` (async) over `fireEvent` (sync) for anything user-facing — it dispatches the full event sequence (focus, keydown, keyup, input) rather than just one event.

## Coverage

```bash
# Vitest
pnpm vitest run --coverage                       # CLI
# or in vitest.config.ts:
# test: { coverage: { provider: 'v8', thresholds: { lines: 80 } } }

# Jest
pnpm jest --coverage --coverageThreshold='{"global":{"lines":80}}'
```

Both default to v8 / istanbul providers. Check `coverage/index.html` for line-level uncovered branches.

## See Also

- `../SKILL.md` — universal 6-step procedure + constraints
- Vitest docs: https://vitest.dev/
- Jest docs: https://jestjs.io/
- React Testing Library: https://testing-library.com/docs/react-testing-library/intro
