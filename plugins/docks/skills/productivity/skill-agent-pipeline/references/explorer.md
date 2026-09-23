# Phase 1 — Exploration

Map the project profile and enumerate everything that already exists. This feeds the categorizer (2a), pattern scanner (2b), and the role mapper (4a).

<constraint>
Enumerate, don't diagnose. Record what exists (files, frontmatter, structure). Do NOT judge quality or propose changes — that is Phase 2a/2b. List concerns as located facts only.
</constraint>

## Project profile

Stack + package manager (check `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pyproject.toml`), rough size, key directories, and existing docs: `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/**/*.md`, `.env.example`. AGENTS.md is the cross-tool source of truth. Record every `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` as a legacy file with one located fact: import stub (only `@AGENTS.md` / `@../AGENTS.md`; redundant, content still loads) or content without an import (a defect: Claude reads it instead of AGENTS.md). Both route to `multi-tool-bridge`; this pipeline does not edit them.

## Existing skills

For each `.agents/skills/*/SKILL.md` AND `.claude/skills/*/SKILL.md`, parse frontmatter and list the fields below. A `.claude/skills/<name>` entry that is a symlink into `.agents/skills` is the same skill: list it once, under its `.agents/skills` path (`readlink` shows the target).

| Field | Source |
|---|---|
| name | frontmatter `name` |
| description | first ~120 chars AND full char-count — flag if >1024 (Codex hard-skips an over-cap skill) |
| source_files count | `metadata.source_files` length |
| references/ | files under the skill's `references/` |
| updated | `metadata.updated` |

## Existing agents

For each `.claude/agents/*.md` AND `.codex/agents/*.toml` (exclude `*.bak`): `name` · `description` (first ~120 chars) · `tools` / `sandbox_mode` · `model` · every skill path (`.agents/skills/…` or `.claude/skills/…`) referenced in the body. Note any agent present in only ONE of the two formats (cross-format drift to reconcile in Phase 5).

## Knowledge areas

Candidate skill domains: source directories or subsystems NOT yet covered by any existing skill's `source_files`. One per line, with a representative path.

## Output (write under `### Phase 1: Exploration Results`)

Write this subheading inside `## Research`. Use `####` or lower for every block inside it; never write a `##` heading (the plan helper rejects it).

`Project Profile` · `Existing Skills` · `Existing Agents` · `Knowledge Areas Identified`.

## Gotcha

| Gotcha | Fix |
|---|---|
| Reading skill *content* here | That's Phase 2a's job — here just parse frontmatter + count references |
| Treating a scoped run as "only scan this dir" for enumeration | Skill/agent enumeration always covers all of `.agents/skills/`, `.claude/`, and `.codex/agents/`; only knowledge-area discovery respects scope |
