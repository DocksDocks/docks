#!/usr/bin/env node
// PostToolUse hook (Claude Code + Codex): after a file edit inside a
// context-tree node, nudge the agent to refresh that node. Deterministic, cheap,
// no LLM call. Reads the JSON payload from stdin and handles both shapes:
//   - Claude Code Edit/Write -> tool_input.file_path (absolute path)
//   - Codex apply_patch       -> `*** Add|Update|Delete File: <path>` headers
//                                inside tool_input.command (repo-relative)
// Emits hookSpecificOutput.additionalContext only when an edited path is inside
// a node (a non-root folder with AGENTS.md + CLAUDE.md). Always exits 0 — a hook
// must never break the session.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

const input = readStdin();
if (!input.trim()) process.exit(0);

let payload;
try { payload = JSON.parse(input); } catch { process.exit(0); }

// Repo root: Claude provides CLAUDE_PROJECT_DIR; Codex does not, so fall back to git.
let repoRoot = process.env.CLAUDE_PROJECT_DIR || '';
if (!repoRoot) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  repoRoot = (r.status === 0 ? r.stdout.trim() : '');
}
if (!repoRoot) process.exit(0);

// Collect candidate edited paths from both payload shapes.
const ti = payload.tool_input || {};
const paths = [];
if (typeof ti.file_path === 'string') paths.push(ti.file_path); // Claude Edit/Write
if (typeof ti.command === 'string') {                            // Codex apply_patch
  for (const m of ti.command.matchAll(/\*\*\* (?:Add|Update|Delete) File: (.+)/g)) {
    paths.push(m[1].trim());
  }
}

// Resolve each path to its nearest node; collect distinct node rel-paths (first-seen order).
const nodes = [];
for (const p of paths) {
  if (!p) continue;
  const abs = p.startsWith('/') ? p : path.join(repoRoot, p);
  let dir = path.dirname(abs);
  while (dir && dir !== '/') {
    if (dir === repoRoot) break; // nudge sub-folder nodes only, not root
    if (fs.existsSync(path.join(dir, 'AGENTS.md')) && fs.existsSync(path.join(dir, 'CLAUDE.md'))) {
      const rel = path.relative(repoRoot, dir);
      if (!nodes.includes(rel)) nodes.push(rel);
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

if (nodes.length === 0) process.exit(0);

const list = nodes.join(', ');
process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: `Edited files inside context-tree node(s): ${list}. If conventions in a listed folder changed, run context-tree refresh on it (no-op when nothing semantic changed).`,
  },
})}\n`);
