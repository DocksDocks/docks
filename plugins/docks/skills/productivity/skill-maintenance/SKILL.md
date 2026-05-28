---
name: skill-maintenance
description: "Use when project-local SKILL.md files need validation or refresh after source changes, Codex skipped a skill due to invalid YAML or description over 1024 chars, .agents/skills and .claude/skills drift, or stale source_files/metadata.updated/content_hash require no-op maintenance. Not for authoring new Docks plugin skills (use write-skill) or prose docs."
user-invocable: false
metadata:
  pattern: reviewer
  updated: "2026-05-28"
  content_hash: "67f6bb4d360f53b0c26480d4ee582552abdbeb9eb52dcc03cef334126c70bfd7"
---

# Skill Maintenance

Maintain project-local skills as living, loadable artifacts. The job is not to
invent new skills; it is to keep existing `SKILL.md` files accurate, valid for
Codex and Claude Code, and idempotent when re-run on unchanged content.

<constraint>
Do not rewrite a skill just because it exists. First identify the source change,
frontmatter failure, broken reference, or loader warning that makes maintenance
necessary. A no-op scan must report "no changes" and leave files untouched.
</constraint>

<constraint>
Codex compatibility is a hard gate. Every maintained `SKILL.md` needs valid YAML
frontmatter, `name`, `description`, a hyphen-case name no longer than 64 chars,
and a description string no longer than 1024 chars. Quote descriptions that
contain `: `, `#`, brackets, quotes, or code-like punctuation.
</constraint>

<constraint>
Project-local `skill-maintenance` copies are disposable only after inspection.
If the Docks plugin already provides `docks:skill-maintenance`, compare the
local skill for project-specific rules. Propose removal only when it adds no
local behavior, and wait for explicit user approval before deleting files.
</constraint>

## Workflow

1. **Locate skill roots.** Prefer `.agents/skills/`; also inspect
   `.claude/skills/` for symlinks or legacy copies. In plugin repos, inspect
   `plugins/*/skills/` when the user asks about shipped skills.
2. **Read the warning or diff.** Capture exact loader errors, changed source
   paths, or user-reported drift. If there is no trigger, run a read-only audit.
3. **Parse frontmatter.** Validate YAML before judging content. A line like
   `description: Use when editing routes: checkout` is invalid YAML because of
   the unquoted colon-space.
4. **Map changes to skills.** Use each skill's `metadata.source_files` when
   present. If absent, search the skill body and `references/` for paths,
   exported names, CLI commands, env vars, routes, table names, and error names.
5. **Update only affected skills.** Refresh claims, references, examples, and
   trigger descriptions that changed. Leave unrelated skills alone. When a
   refresh would **rewrite a prose section** (not just fix a path, count, or
   typo), show the before/after as a diff and get explicit confirmation before
   writing — silently auto-rewriting prose can drop authored intent. Relocate
   verbatim; reword only on approval.
6. **Bump metadata only on meaning change.** Change `metadata.updated` when the
   normalized body or any reference content changed. Do not bump it for a pure
   formatting no-op.
7. **Verify loading.** Re-run the narrow validator or startup command available
   in the project, then list any residual risk.

## Compatibility Matrix

| Check | Codex | Claude Code | Fix |
|---|---|---|---|
| Frontmatter parses as YAML | required | required | Quote risky scalars; use block scalars for long text |
| `name` is lowercase hyphen-case | required | required | Rename folder or frontmatter so they match |
| Description length | max 1024 | max 1024 | Move detail to body or `references/` |
| Description trigger quality | strongly needed | strongly needed | Start with concrete "Use when..." triggers |
| `user-invocable` | tolerated metadata | useful convention | Keep boolean in Docks-style project skills |
| `metadata.source_files` | optional | optional | Use for maintenance targeting when available |
| Body length | keep lean | keep under 500 lines | Split detailed material into `references/` |

## Frontmatter Rules

Use quoted descriptions by default. This avoids the two most common Codex skip
warnings: invalid YAML from colon-space and accidental comment truncation from
`#`.

```yaml
# BAD - invalid YAML because "routes:" starts a mapping value
description: Use when editing routes: checkout, account, webhook.

# BAD - YAML treats everything after # as a comment
description: Use when fixing eslint-disable / # noqa / # type: ignore.

# GOOD - same text is one string
description: "Use when editing routes: checkout, account, webhook, or fixing eslint-disable / # noqa / # type: ignore."
```

## Drift Detection

| Signal | Read/search step | Maintenance action |
|---|---|---|
| Loader says invalid YAML | Read `SKILL.md` frontmatter | Quote/fix frontmatter, then re-validate |
| Description over 1024 chars | Count parsed description chars | Move enumerations to body or references |
| Source path changed | Compare `metadata.source_files` with filesystem | Update paths and claims |
| Reference file missing | List `references/` and links from body | Restore file or remove pointer |
| Skill no longer triggers | Inspect first 150 chars of description | Put concrete trigger words first |
| Local maintenance skill exists | Compare to Docks plugin skill | Keep only if it adds project-specific rules |

## Idempotency Rules

- Normalize before deciding a skill changed: ignore trailing spaces, repeated
  blank lines, and bookkeeping-only timestamp edits.
- If a project uses `metadata.content_hash`, recompute it from the same content
  surface the project documents. Do not invent a hash contract without telling
  the user.
- If there is no hash contract, use a plain diff: no semantic diff means no
  write.
- If a skill's `references/` changed, treat that as a skill meaning change even
  when `SKILL.md` itself is unchanged.

## Local Skill-Maintenance Cleanup

When `.agents/skills/skill-maintenance/` or `.claude/skills/skill-maintenance/`
already exists:

1. Read its `SKILL.md` and references.
2. Classify each rule as generic maintenance, project-specific, or stale.
3. If every rule is generic or stale and `docks:skill-maintenance` is available,
   propose deleting the local copy.
4. If project-specific rules exist, either keep the local skill or move those
   rules into a project-specific skill such as `project-skill-maintenance`.
5. Never delete the local copy without explicit approval.

## BAD / GOOD

| BAD | GOOD |
|---|---|
| Rewrite all skills after touching one source file | Update only skills whose `source_files` or references mention the changed area |
| Shorten a long description by deleting trigger words | Move secondary detail to `references/`, keep the first trigger concrete |
| Fix Codex YAML by removing `# noqa` from the trigger list | Quote the YAML string so the trigger remains visible |
| Delete local `skill-maintenance` because the plugin ships one | Compare first; preserve project-specific rules or ask before deleting |

## Verification

Use the narrowest available command:

```bash
# Docks repo
bash scripts/skills/guard.sh

# Generic Codex project
codex debug prompt-input | sed -n '/Skipped loading/,/Available skills/p'

# Generic filesystem check
find .agents/skills .claude/skills -name SKILL.md -maxdepth 3 -print 2>/dev/null
```

## References

Read `references/REFERENCES.md` when a maintenance run involves multi-tool
skill roots, source-file targeting, local `skill-maintenance` cleanup, or a
loader warning that is not fixed by quoting the description.
