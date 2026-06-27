---
name: design-tokenization
description: Use when working with colors, Tailwind classes, CSS custom properties, brand colors (WhatsApp / Stripe / Google / Spotify), dark mode setup, the bg-X / text-on-X paired-token contract, soft tints (X-tint family vs alpha-modifier), :root vs .dark token parity, or @source/@custom-variant in Tailwind v4. Also use when auditing for hex literals, migrating to tokens, or deciding if a new color is semantic, brand, or wrong.
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-06-27"
  content_hash: "7fe626ac9ec19bbd2ecc4d23fd8ba555d148aae05c1b05fb7d03fee84804879c"
---

# Design Tokenization

<constraint>
No hex color literals in application code. Every visible color routes through a token — either `var(--token)` or a Tailwind utility that resolves to one (`bg-primary`, `text-on-primary`, `bg-whatsapp`). Hex literals belong in exactly one place: the token DEFINITIONS in the canonical stylesheet (`:root` and `.dark` blocks). Anywhere else, hex is a bug.
</constraint>

<constraint>
Every token defined in `:root` must also be defined in `.dark`. A token defined in only one block silently breaks contrast in the other mode — utility resolves to `undefined` and falls back to inherited or transparent. Treat the two blocks as a contract: edit both in the same change.
</constraint>

<constraint>
Brand tokens and semantic tokens never mix. A token named after a third-party company (`whatsapp`, `stripe`, `google`) must never be used for a non-brand surface. A semantic token (`primary`, `destructive`, `success`) must never carry a vendor's official hex value. Mixing the two layers makes future redesigns drag third-party brands along, or causes brand drift on a future success-state recolor.
</constraint>

## When to Use

- Adding a new color anywhere — if your hand reaches for `#abcdef` outside the token stylesheet, stop here first
- Building a button / badge / surface that ties to a third-party brand (WhatsApp share, Stripe pay, Google sign-in)
- Setting up dark mode for a new project, or fixing dark-mode contrast bugs
- Auditing a project for hex literals, alpha-modifier soft tints, or missing paired tokens
- Reviewing a PR that touches `index.css`, `globals.css`, `tailwind.config.*`, or any styled component
- Migrating a project from hardcoded colors to a tokenized system
- Tailwind v4 questions about `@source`, `@custom-variant`, `@theme inline`, or class-purge regressions

## The Two-Layer Token System

Every color in the app falls into exactly one of two layers. Mixing them is the most common drift mode.

### Layer 1 — Semantic tokens (intent, not appearance)

Names describe *what the color means in the app*, not what it looks like.

| Token family | Intent | Examples |
|---|---|---|
| `background` / `on-background` | Default page surface | App body, modals, sheets |
| `primary` / `on-primary` | Main brand action color | Primary CTA, active nav |
| `secondary` / `on-secondary` | Subordinate action | Secondary buttons, chips |
| `destructive` / `on-destructive` | Dangerous/irreversible action | Delete, drop, force-cancel |
| `success` / `on-success` | Confirmed positive outcome | Save toast, "deployed" badge |
| `warning` / `on-warning` | Attention required, not error | Quota near, rate-limit advisory |
| `muted` / `on-muted` | Disabled or de-emphasized | Disabled buttons, secondary text |

Rule: **never use a generic visual name** (`bg-blue`, `bg-red`, `bg-green`) for a semantic role. If a button means "delete," it's `bg-destructive`, not `bg-red`.

### Layer 2 — Brand tokens (third-party identity)

When you display a third-party service's brand color, use a brand-named token. Brand tokens are still tokens — vendor-fixed values, defined in the canonical stylesheet, used through utilities.

| Brand token | Hex (def-only) | Use case |
|---|---|---|
| `whatsapp` / `on-whatsapp` | `#25D366` | Share-to-WhatsApp |
| `stripe` / `on-stripe` | `#635BFF` | Stripe-branded checkout |
| `google` / `on-google` | `#4285F4` | "Sign in with Google" |
| `github` / `on-github` | `#181717` | "Continue with GitHub" |
| `spotify` / `on-spotify` | `#1DB954` | "Listen on Spotify" |
| `discord` / `on-discord` | `#5865F2` | "Join our Discord" |

Why brand tokens, not generic `bg-green` for WhatsApp:

1. **Identity drift** — WhatsApp's brand green ≠ your `success` green. A future "success" recolor would silently rebrand WhatsApp.
2. **Searchability** — `grep "bg-whatsapp"` finds every WhatsApp surface. `grep "bg-green-500"` returns ambiguous noise.
3. **Vendor compliance** — many brand guidelines require the exact official hex; the brand token freezes it.
4. **Per-brand dark mode** — some brands publish dark-mode variants. The token gives you the slot.

## The Paired-Token Contract (`bg-X` ↔ `text-on-X`)

Every background token has a paired foreground guaranteed legible against it. This prevents the classic dark-mode contrast bug where `bg-primary` flips dark but the text on top doesn't.

```css
:root {
  --primary: 222 80% 50%;
  --on-primary: 0 0% 100%;        /* white on blue */
}
.dark {
  --primary: 222 70% 60%;
  --on-primary: 222 50% 10%;      /* dark text now reads */
}
```

In components: **never write `bg-primary` without `text-on-primary` next to it**, unless the surface has no text on it (decorative bar, divider, progress fill).

Two naming conventions exist — pick one per project, never mix:
- `bg-X` / `text-on-X` (no-foreground convention)
- `bg-X` / `text-X-foreground` (shadcn / Radix convention)

Mixing produces silent token-resolution gaps.

## Soft Tints — X-Tint Triple, Not Alpha Modifiers

```html
<!-- Wrong fix: alpha modifier produces unpredictable contrast in dark mode -->
<div class="bg-destructive/15 text-destructive border-destructive/30">…</div>

<!-- Right fix: triple of dedicated tokens, each with :root + .dark values -->
<div class="bg-destructive-tint text-on-destructive-tint border-destructive-tint-border">…</div>
```

`bg-destructive/15` collapses the destructive HSL with 15% alpha against whatever sits behind it — pink on a white card, near-invisible on a dark card. The X-tint triple gives full control over the *resolved* color in each mode.

Exception — alpha modifiers ARE allowed for hover/active states on the same base token (`bg-primary hover:bg-primary/90`). Same color, modulated transparency for state feedback — no contrast drift.

## Tailwind v4 — @source and Class-Purge

Tailwind v4 (`@tailwindcss/vite`) auto-detects sources but skips `.gitignore`'d paths, binary files, and anything outside the stylesheet's project root. Add `@source` for every directory the heuristic misses (monorepo siblings, `shared/`, gitignored build trees):

```css
/* Wrong fix: misses src/shared/ — classes there get purged */
@source "../../renderer";

/* Right fix: cover every directory with class names */
@source "../../renderer";
@source "../../shared";
```

Symptom of missing `@source`: layout/button "collapses" because `w-12` / `left-1/2` / `-translate-x-1/2` resolved at dev time but disappeared in prod. Always check `@source` coverage when a class works in dev but not prod.

## Decision Tree — Adding a New Color

```
Need a new color in a component →
  ├─ Is it a third-party brand (Google, Stripe, WhatsApp, etc.)?
  │   └─ YES → brand token. Define in :root (and .dark if vendor has dark variant).
  │           Use bg-{brand} / text-on-{brand}. Done.
  │   └─ NO → continue
  ├─ Does an existing semantic token cover the intent?
  │   └─ YES → use the existing token. Don't create a new one.
  │   └─ NO → continue
  ├─ Is the color genuinely new app intent that isn't already named?
  │   └─ YES → propose a new semantic token. Add to :root AND .dark.
  │           Add @theme inline entry. Pair with on-{token}.
  │   └─ NO → reuse existing.
```

## Audit & Migration Playbook

Four-step procedure. Don't skip the audit — proposing token names without seeing actual usage produces wrong abstractions.

1. **Audit (read-only)** — run the four greps in `references/audit-and-greps.md` against the project root. Categorize matches: hex-in-app, generic-palette-as-semantic, brand colors hidden as hex, alpha-modifier tints, unpaired backgrounds.
2. **Propose** — list every distinct hex, group near-duplicates (within ~3% HSL), propose a token per group classified as semantic or brand. Show the user the table BEFORE writing CSS. Wait for confirmation. Naming is the high-impact decision; rolling back is expensive once tokens land in components.
3. **Apply** — add tokens to BOTH `:root` and `.dark` in the canonical stylesheet (see `references/canonical-stylesheet.md` for the full shape). Update `@theme inline`. Replace hex in app code. Add paired foregrounds. Convert alpha tints to X-tint triples.
4. **Lock** — drop the audit greps into pre-commit / CI as an enforcement gate. Script in `references/audit-and-greps.md`.

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| "Save successful" toast | `bg-green-500` | `bg-success`, defined once with paired `text-on-success` |
| WhatsApp share button | `bg-green-500` (same color, but coincidence) | `bg-whatsapp` brand token — different identity |
| Inline brand color | `style={{ color: '#25D366' }}` | `text-whatsapp`, brand token in stylesheet |
| Token added to `:root` only | "I'll add the dark variant later" | Edit `:root` AND `.dark` in the same change |
| Soft "danger zone" panel | `bg-destructive/15` | `bg-destructive-tint` triple |
| Mixed `text-on-*` and `text-*-foreground` in one project | Add the missing one alongside | Pick one convention project-wide; grep + migrate the other |
| Class works in dev but disappears in prod | Re-add `bg-success` to a global stylesheet | Add `@source "../../shared";` for the missing directory |
| "Just for now, will tokenize later" | One hex literal in a component | Tokenize on first use. Cost is identical; later it's harder. |

## References

- `references/canonical-stylesheet.md` — full `:root` + `.dark` + `@theme inline` shape with both layers
- `references/audit-and-greps.md` — four audit greps + pre-commit lock script + CI variant
- Tailwind v4 `@source` (automatic source detection + explicit registration): https://tailwindcss.com/docs/detecting-classes-in-source-files
- shadcn/ui design tokens: https://ui.shadcn.com/docs/theming (uses the `*-foreground` convention)
- Brandfetch / logo.dev — verify official hex before adding a brand token
- Companion skills: `make-interfaces-feel-better` (visual polish), `lint-no-suppressions` (when CI greps feel "annoying" — fix the violation, don't disable)
