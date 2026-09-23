---
name: skill-maintenance
description: "Use when project-local SKILL.md files need validation or refresh after source changes, Codex skipped a skill due to invalid YAML or description over 1024 chars, .agents/skills and .claude/skills drift, stale source_files/metadata.updated/content_hash require no-op maintenance, or a skill rewrite needs a blind old-vs-new comparison. Not for authoring new Docks plugin skills (use write-skill), whole-set bootstrap/audit with agent emission (use skill-agent-pipeline), or prose docs."
user-invocable: false
metadata:
  pattern: reviewer
  updated: "2026-09-23"
  content_hash: "30fc7e2eb50af406186757182480a203eb49178920107e2edaa1412dde9534ab"
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
6. **Refresh metadata only on meaning change.** When the project provides
   content-hash tooling, use it to re-sync `metadata.content_hash` and
   `metadata.updated` after normalized body or reference content changes.
   Otherwise, bump `metadata.updated` manually. Do not update metadata for a
   pure formatting no-op.
7. **Verify loading.** Re-run the narrow validator or startup command available
   in the project, then list any residual risk.

## Is the Rewrite Better? (optional)

Use this step when a refresh rewrote instructions and the user asks whether
the new version works better. A diff shows what changed; only agent runs show
whether the change helps.

1. Snapshot the old skill folder as the baseline, outside every skill root.
2. Run the same 2-3 realistic prompts with the old and the new version, each
   in a fresh agent or session (the write-skill "baseline check").
3. Label the outputs A and B at random. A fresh judge agent that sees only the
   prompt and the two outputs scores content and structure against a short
   rubric and picks a winner. Ties are rare, because a tie gives no signal.
4. An analyzer agent then sees both skills, both transcripts, and the mapping.
   It explains why the winner won and lists ranked suggestions.
5. Keep, revert, or revise from the result. Do not tune the skill to the test
   prompts only.

Judge and analyzer prompts, the rubric, and the decision table are in
`references/blind-comparison.md`.

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
| Frontmatter keys for Claude.ai `.skill` upload | n/a | n/a | Packaging and skill-creator `quick_validate` accept only `name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`; strip every other key (in Docks skills, `user-invocable` and `paths`) from the packaged copy |

The `.skill` row applies only to a copy made for upload. Keep `user-invocable`
and `paths` in the source skill, because Docks-style tooling and Claude Code
read them. Key allowlist source:
https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/quick_validate.py
(Apache-2.0).

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
| Wrong sibling skill fires for a task | Compare both descriptions with near-miss prompts that share keywords | Sharpen triggers; route the near-miss via a "Not ..." clause |
| Two body rules contradict each other | Read the full body (and its references) once end-to-end; list rule pairs giving incompatible instructions for the same case | Reconcile: keep the stricter or newer rule, scope or delete the other — never leave both |
| Claim superseded by a newer source | Re-open each cited source/URL/doc; compare the claim against current behavior, not the version remembered at writing time | Update the claim and bump `metadata.updated`; drop citations that no longer support it |
| Pressure language without a reason (caps MUST/NEVER, "CRITICAL") | Search the body for caps-lock imperatives; check each has a stated reason | State the rule once, plainly, with its reason |
| History narrative (incident, PR, or session story) | Search for incident IDs, PR numbers, dates, "this caught" stories | Keep the rule, drop the story |
| Enumerated trigger list in the description | Check whether the description grew one missed query at a time | Name categories of intent; confirm with the write-skill trigger check |
| One-incident rule (a single stumble made permanent) | Ask whether the rule still prevents a repeat failure in current use | Generalize it or delete it; removal is a hypothesis, so re-run a baseline check |
| Local maintenance skill exists | Compare to Docks plugin skill | Keep only if it adds project-specific rules |

The four prompt-style rows above are spot checks for a skill already being
maintained. For a sweep across the whole skill set, use skill-agent-pipeline's
content audit. These rows adapt the prompt-audit guide of Anthropic's
claude-api skill (Apache-2.0):
https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/prompt-audit.md

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
# if the project ships a skill validator/loader-check, run it

# if the docks plugin is installed, write-skill bundles a portable validator —
# frontmatter guard + 16-pt score, no kit tooling needed (--strict for kit conventions):
node <docks-plugin>/skills/productivity/write-skill/scripts/skill-guard.mjs validate .agents/skills

# generic Codex loader check (debug subcommands move between releases —
# confirm the surface first: codex debug --help)
codex debug prompt-input | sed -n '/Skipped loading/,/Available skills/p'

# Generic filesystem check
find .agents/skills .claude/skills -name SKILL.md -maxdepth 3 -print 2>/dev/null
```

If the bundled validator is absent (docks not installed), fall back to the
generic checks — never hard-depend on it.

## References

Read `references/REFERENCES.md` when a maintenance run involves multi-tool
skill roots, source-file targeting, local `skill-maintenance` cleanup, or a
loader warning that is not fixed by quoting the description.

Read `references/blind-comparison.md` when running the optional old-vs-new
comparison.
