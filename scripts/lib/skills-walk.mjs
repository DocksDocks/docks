// Shared skill-tree traversal for the author-side validators. Seeded into new
// projects (see docs/scaffold/spec.yaml) so the seeded validators share it too.
// NOTE: the bundled write-skill/scripts/skill-guard.mjs keeps its OWN copy — it
// ships standalone in consumer repos where this scripts/lib/ does not exist.
import fs from 'node:fs';
import path from 'node:path';

// Every SKILL.md under root, sorted, skipping node_modules/.git.
export function findSkillFiles(root) {
  const out = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'SKILL.md') out.push(full);
    }
  })(root);
  return out.sort();
}

// Iterate <root>/<category>/<skill>/ dirs (sorted) that hold a SKILL.md,
// yielding { category, name, dir, file }.
export function* eachSkillDir(root) {
  if (!fs.existsSync(root)) return;
  for (const category of fs.readdirSync(root).sort()) {
    const cp = path.join(root, category);
    if (!fs.statSync(cp).isDirectory()) continue;
    for (const name of fs.readdirSync(cp).sort()) {
      const dir = path.join(cp, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const file = path.join(dir, 'SKILL.md');
      if (fs.existsSync(file)) yield { category, name, dir, file };
    }
  }
}

// First SKILL.md whose containing directory is named `name`, anywhere under root.
export function findSkillByName(root, name) {
  return findSkillFiles(root).find((f) => path.basename(path.dirname(f)) === name) || null;
}
