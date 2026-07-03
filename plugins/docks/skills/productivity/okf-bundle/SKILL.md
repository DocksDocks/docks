---
name: okf-bundle
description: "Use when project facts — datasets, tables, API endpoints, services, metrics, runbooks — need an agent-readable home as an LLM-wiki: seeds and maintains a knowledge/ bundle in Google's Open Knowledge Format (OKF v0.1, typed markdown concepts with YAML frontmatter). Ops: seed / add concept / audit conformance. Not for per-area conventions (use context-tree), plugin skeletons (use scaffold), or adding OKF frontmatter to skills or AGENTS.md files."
user-invocable: true
metadata:
  pattern: meta-skill
  updated: "2026-07-03"
  content_hash: "e70dc6d5bb89480f6f81152c5375f4e468533ab816a3578eea571b3540e96bcf"
---

# OKF knowledge bundle — project facts as an LLM-wiki

The context tree organizes **conventions** (how to work here); an OKF bundle organizes **knowledge** (what is true here — the facts an agent would otherwise re-derive from raw documents every session). Google's Open Knowledge Format v0.1 formalizes Karpathy's LLM-wiki pattern into a portable spec: a directory of markdown files with YAML frontmatter, no schema registry, no required tooling. This skill seeds and maintains a `knowledge/` bundle that any OKF consumer (and any agent) can read.

<constraint>
The whole conformance surface is three rules (spec §9) — hold all three on every write: (1) every non-reserved `.md` file inside the bundle tree carries a parseable YAML frontmatter block, (2) every frontmatter block has a non-empty `type` field, (3) the reserved filenames `index.md` and `log.md` follow their defined structures. Consequence: never place an `AGENTS.md`, `CLAUDE.md`, or `SKILL.md` inside the bundle tree — they are not reserved names, so they become frontmatter-less "concept documents" and break rules 1–2. Document the bundle from the PARENT context node instead.
</constraint>

<constraint>
Use RELATIVE markdown links between concepts (`[blocks](../tables/blocks.md)`), not the spec-recommended bundle-absolute form (`/tables/blocks.md`) — absolute links render broken on GitHub and in repo-rooted tooling (upstream issue #157), and Google's own sample bundles use relative links. Pin the spec version with `okf_version: "0.1"` in the bundle-root `index.md` frontmatter — the spec is a Draft with rename proposals open against its required field and reserved filenames, and the pin is the only forward-compat signal it defines.
</constraint>

<constraint>
Concepts record VERIFIED facts, not aspirations: every claim sourced from outside the repo gets a `# Citations` entry, and a fact you cannot verify is omitted or explicitly marked unverified — an LLM-wiki that mints plausible-but-wrong facts is worse than no wiki, because agents downstream trust it over raw sources. Conventions, workflows, and style rules stay OUT of the bundle (they belong in AGENTS.md nodes and skills); a bundle entry answers "what is X?", never "how should I work?".
</constraint>

## Ops

| Op | Trigger | What it does |
|---|---|---|
| **seed** | "set up a knowledge bundle", "create an OKF wiki" | Create the bundle (default root `knowledge/` at the project root; honor a user-chosen location), mine first concepts from real sources (READMEs, configs, schemas — confirm with the user; constraint 3 applies to seeds too), wire the parent context node |
| **add concept** | "document the payments API in the knowledge base" | New `<area>/<concept>.md` with frontmatter, linked per the reachability rule below; append a `log.md` entry when the file exists |
| **audit** | "check the bundle", after any bulk edit | Run the conformance loop below; fix findings |

## Bundle shape

```text
knowledge/
├── index.md            # root listing; frontmatter = okf_version: "0.1" ONLY
├── log.md              # optional history; ISO YYYY-MM-DD date headings
├── services/
│   ├── index.md        # per-directory listing (NO frontmatter here)
│   └── billing-api.md  # a concept document
└── datasets/
    └── events.md
```

Concept frontmatter (spec §4.1) — `type` is the only required field:

| Field | Status | Content |
|---|---|---|
| `type` | **required** | Short kind string (`API Endpoint`, `Dataset`, `Service`, `Metric`, `Playbook`, `Reference`) — free vocabulary, pick descriptive values |
| `title` | recommended | Display name (falls back to filename) |
| `description` | recommended | One sentence; index generators and previews use it |
| `resource` | recommended | URI of the underlying asset; omit for abstract concepts |
| `tags` | optional | YAML list of short strings |
| `timestamp` | optional | ISO 8601 datetime of last meaningful change |

Extra keys are allowed (consumers must tolerate them); don't import vocabularies from other systems — no `name:`/`user-invocable:` here, no OKF `type:` on skill files.

## Seeding

Root `index.md` — the one place frontmatter is permitted in an index, and only for the version pin:

```markdown
---
okf_version: "0.1"
---

# Project knowledge

* [Services](./services/index.md) - Service and API endpoint concepts.
* [Events dataset](./datasets/events.md) - Append-only product analytics events table.
```

**Reachability rule (indexes):** every concept is listed in the NEAREST `index.md` above it, and every non-root `index.md` is itself listed in its parent's index — so the root reaches everything transitively. Per-directory indexes are optional (consumers may synthesize one); create one when a directory holds 2+ concepts, and when you do, move that directory's per-concept entries out of the root into it, leaving one directory entry at the root. Adding a concept never leaves it invisible from the root chain.

**Reserved-file structures (what rule 3 means concretely):**

- `index.md` (any level): NO frontmatter (sole exception: the root pin above). Body = optional `#`/`##` headings + bullet entries `* [Title](./relative-link.md) - one-line description` (mirror the target's frontmatter `description`).
- `log.md`: no frontmatter; newest-first entries grouped under ISO `YYYY-MM-DD` date headings (the ISO form is the MUST; heading level is free). Entry shape by convention:

```markdown
## 2026-07-03

- **Update**: documented rate limits on services/billing-api.
- **Creation**: added datasets/events.
```

A concept document:

```markdown
---
type: API Endpoint
title: Billing API
description: Internal REST API for invoicing and payment state.
resource: https://billing.internal.example.com/v2
tags:
  - payments
  - internal
timestamp: "2026-07-03T14:30:00+00:00"
---

Owned by the payments team. Auth is service-to-service JWT; tokens mint via
the identity sidecar, never per-user. Rate limit 50 rps per caller.

# Examples

`GET /v2/invoices/{id}` returns the invoice envelope; 404 means never-issued,
410 means voided.

# Citations

[1] [payments team runbook](https://wiki.example.com/payments-runbook)
```

(In-bundle citation targets are fine too — but any `references/*.md` file inside the bundle is a concept document like any other and needs `type` frontmatter.)

Body sections are free-form; `# Schema`, `# Examples`, `# Citations` are the spec's conventional headings — use them when they apply. Concept identity is the path minus `.md` (`services/billing-api`), so renames are link-breaking: update inbound links when moving a file (broken links are *conformant* — the spec treats them as not-yet-written knowledge — but they're still rot).

## Wiring into the context tree

The bundle is documented from OUTSIDE itself. Add one row to the root `AGENTS.md` (or the nearest parent node):

```markdown
| `knowledge/` | OKF v0.1 knowledge bundle — project facts as linked, typed markdown concepts; start at `knowledge/index.md` |
```

### BAD

```text
knowledge/AGENTS.md      # non-reserved .md without type → bundle no longer conformant
knowledge/CLAUDE.md      # same violation; also drags conventions into the facts tree
```

### GOOD

```text
AGENTS.md                # parent node: one table row pointing at knowledge/
knowledge/index.md       # bundle-root listing, okf_version pinned
```

## Conformance audit (self-contained — no tooling required)

Run from the bundle's PARENT directory; set `B` to the bundle root:

```bash
B=knowledge   # adjust if the bundle lives elsewhere (e.g. docs/knowledge)
find "$B" -name '*.md' ! -name index.md ! -name log.md | while read -r f; do
  head -n1 "$f" | grep -qx -- '---' || { echo "9.1 no frontmatter: $f"; continue; }
  awk '/^---$/{c++; next} c==1 && /^type:[[:space:]]*[^[:space:]]/{ok=1} END{exit !ok}' "$f" \
    || echo "9.2 missing/empty type: $f"
done
find "$B" \( -name index.md ! -path "$B/index.md" -o -name log.md \) \
  -exec sh -c 'head -n1 "$1" | grep -qx -- "---" && echo "9.3 frontmatter in reserved file: $1"' _ {} \;
grep -qx 'okf_version: "0.1"' "$B/index.md" 2>/dev/null || echo "pin: okf_version missing in $B/index.md"
```

Silent output = no rule-1/2 violations, no frontmatter in reserved files, version pin present. Two rule-3 aspects stay a manual read: `log.md` date headings are ISO-dated, and index entries follow the bullet-link shape. Then fix → re-run → repeat until silent. If the project has its own CI or validators, wire the loop there; the check needs only `find`, `grep`, and `awk`.

## Gotchas

| Gotcha | Rule |
|---|---|
| `index.md`/`log.md` are reserved at EVERY level | Never write a concept into those names; non-root `index.md` gets no frontmatter at all |
| A pre-existing `index.md`/`log.md` under the chosen root | It's claimed by the reserved-file rules — audit before declaring conformance |
| `log.md` date headings | MUST be ISO `YYYY-MM-DD`; the leading `**Update**`/`**Creation**` bold word is convention only |
| Non-`.md` files in the bundle | Out of conformance scope entirely — assets and data files are fine |
| Spec churn (v0.1 Draft) | Open upstream proposals rename `type`→`kind` (#154) and the reserved files (#146/#164); the `okf_version` pin is the hedge — don't chase unmerged proposals |
| OKF `timestamp` vs skill `metadata.updated` | Parallel staleness fields in different vocabularies — never unify them |

## When NOT to use

- Per-area conventions, lazy-loading rules → **context-tree**
- New plugin/project skeleton → **scaffold**
- Authoring or restructuring skills → **write-skill** (and never put OKF frontmatter on a SKILL.md)

## Sources

- Spec: <https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf> (`SPEC.md`, v0.1 Draft, Apache-2.0)
- Announcement: <https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing> (Google Cloud, 2026-06-12)
- Pattern: Karpathy's LLM-wiki gist <https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>
