#!/usr/bin/env node
// durable-anchors.mjs — long-lived artifacts (shipped skill bodies/references,
// AGENTS.md context nodes) must not carry LIVE file:line anchors: a `path:NN`
// whose path resolves in this repo rots on the next edit above that line and
// then misleads. Fictional teaching paths (src/api/users.ts:87) don't resolve
// and pass by construction. Point-in-time artifacts (docs/plans/, findings)
// are out of scope — file:line is correct there.
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', '.claude', '.codex']);
// docs/plans is point-in-time by contract (plans cite file:line against a
// pinned commit); every OTHER AGENTS.md node — including docs/scaffold — is
// long-lived and in scope.
const SKIP_PATHS = [path.join('docs', 'plans')];

function walk(dir, filter, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(REPO_DIR, full);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !SKIP_PATHS.includes(rel)) walk(full, filter, out);
    } else if (filter(full)) out.push(full);
  }
  return out;
}

// Scope: every shipped skill body/reference under plugins/*/skills/, plus every
// AGENTS.md node outside docs/plans/.
const skillDocs = walk(path.join(REPO_DIR, 'plugins'), (f) =>
  /\/skills\/.*(SKILL\.md|\/references\/[^/]+\.md)$/.test(f),
);
const nodeDocs = walk(REPO_DIR, (f) => f.endsWith('/AGENTS.md') || f === path.join(REPO_DIR, 'AGENTS.md'));

const ANCHOR = /[A-Za-z0-9_./-]+\.[a-z]{1,5}:\d+/g;
const report = [];
for (const f of [...new Set([...skillDocs, ...nodeDocs])]) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const hit of line.match(ANCHOR) ?? []) {
      const p = hit.slice(0, hit.lastIndexOf(':'));
      if (fs.existsSync(path.resolve(REPO_DIR, p))) {
        report.push(`${path.relative(REPO_DIR, f)}:${i + 1}: live line anchor \`${hit}\``);
      }
    }
  });
}

if (report.length > 0) {
  for (const r of report) console.error(`FAIL: ${r}`);
  console.error(`durable-anchors FAILED: ${report.length} live file:line anchor(s) in long-lived artifacts.`);
  console.error(
    'Convert to the durable grammar: `path` — `symbol` — purpose (verify: `command`). See write-skill references/durable-anchors.md.',
  );
  process.exit(1);
}
console.log(
  `durable-anchors PASSED: ${skillDocs.length + nodeDocs.length} long-lived docs, no live file:line anchors (fictional example paths exempt by non-resolution)`,
);
