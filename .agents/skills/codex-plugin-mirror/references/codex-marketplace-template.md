# Embedded Template — `.agents/plugins/marketplace.json`

## Contents

- [Field-by-field translation from Claude `marketplace.json`](#field-by-field-translation-from-claude-marketplacejson)
- [Fields the mirror DROPS](#fields-the-mirror-drops)
- [Worked example (docks)](#worked-example-docks)
- [Versioning policy](#versioning-policy)

Verbatim scaffold to write at `<repo-root>/.agents/plugins/marketplace.json` when mirroring a Claude marketplace catalog to Codex. The Codex marketplace catalog has a different shape from Claude's — `source` is an object (not a string), and per-plugin metadata is leaner (description/version/author live in the plugin manifest, not the marketplace entry).

```json
{
  "name": "{{MARKETPLACE_NAME}}",
  "interface": {
    "displayName": "{{MARKETPLACE_DISPLAY_NAME}}"
  },
  "plugins": [
    {
      "name": "{{PLUGIN_NAME}}",
      "source": {
        "source": "local",
        "path": "{{RELATIVE_PATH_TO_PLUGIN_DIR}}"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "{{CATEGORY}}"
    }
  ]
}
```

For monorepo marketplaces with multiple plugins, repeat the `plugins[]` object once per plugin.

## Field-by-field translation from Claude `marketplace.json`

| Codex field | Source (Claude marketplace.json) | Translation rule |
|---|---|---|
| `name` (marketplace) | `name` | Verbatim |
| `interface.displayName` | `description` (truncated) or `name` | Codex marketplace doesn't have a top-level description; use a short display label |
| `plugins[].name` | `plugins[].name` | Verbatim |
| `plugins[].source` | `plugins[].source` (string) | Wrap into `{ "source": "local", "path": <string> }` — Codex's source uses an object schema |
| `plugins[].category` | `plugins[].category` | Verbatim |
| `plugins[].policy.installation` | (derived) | Default `"AVAILABLE"`; documented set (verified 2026-06-10): `"AVAILABLE"` / `"NOT_AVAILABLE"` / `"INSTALLED_BY_DEFAULT"` |
| `plugins[].policy.authentication` | (derived) | Default `"ON_INSTALL"`; documented set: `"ON_INSTALL"` / `"ON_USE"` |

## Fields the mirror DROPS

| Source field | Reason |
|---|---|
| `plugins[].description` | Description lives in plugin.json on Codex side, not the marketplace entry |
| `plugins[].version` | Same — version is in plugin.json, single source of truth |
| `plugins[].author` | Same |
| `plugins[].license` | Same |
| `plugins[].homepage` | Same |
| `plugins[].repository` | Same |
| `plugins[].keywords` | Same |
| `plugins[].tags` | No Codex equivalent at marketplace level |
| `owner` (top-level) | No Codex equivalent — author info lives in each plugin.json |

## Worked example (docks)

Source `.claude-plugin/marketplace.json` snippet (simplified):

```json
{
  "name": "docks",
  "description": "Multi-agent pipeline kit marketplace — Builder-Verifier patterns + engineering-convention skills + tiered subagents",
  "owner": { "name": "Eduardo Marquez (DocksDocks)" },
  "plugins": [
    {
      "name": "docks",
      "source": "./plugins/docks",
      "description": "Multi-agent pipeline kit for Claude Code — …",
      "version": "X.Y.Z",
      "category": "engineering-workflows"
    }
  ]
}
```

Mirrored `.agents/plugins/marketplace.json`:

```json
{
  "name": "docks",
  "interface": {
    "displayName": "docks — skills only"
  },
  "plugins": [
    {
      "name": "docks",
      "source": {
        "source": "local",
        "path": "./plugins/docks"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "engineering-workflows"
    }
  ]
}
```

The marketplace `displayName` includes the "skills only" signal so Codex users browsing know what to expect before they install.

## Versioning policy

Versions live in `plugin.json` (Claude AND Codex), NOT in marketplace.json. When releasing:

1. Bump `plugins/<name>/.claude-plugin/plugin.json` version
2. Bump `plugins/<name>/.codex-plugin/plugin.json` to the same version
3. Both marketplace files stay version-free at the plugin-entry level; the catalog just lists what's available

The release script (`scripts/release.mjs` in this kit, or equivalent) should treat the four files (two plugin manifests, two marketplace catalogs) as one atomic group when bumping.
