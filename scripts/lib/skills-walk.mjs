// Shared skill-tree traversal for the author-side validators. Scaffold specs may
// copy it into generated projects so their validators use the same traversal.
// NOTE: the bundled write-skill/scripts/skill-guard.mjs keeps its OWN copy — it
// ships standalone in consumer repos where this scripts/lib/ does not exist.
import fs from 'node:fs';
import path from 'node:path';

// Every SKILL.md under root, sorted, skipping node_modules/.git.
export function findSkillFiles(root) {
  const out = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      const absoluteDir = path.resolve(dir);
      throw new Error(`cannot read skills directory ${absoluteDir}: ${error.message}`, { cause: error });
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'SKILL.md') out.push(full);
    }
  })(root);
  return out.sort();
}

// Iterate <root>/<category>/<skill>/ dirs (sorted) whether or not they hold a
// SKILL.md, yielding { category, name, dir, file }. The scorer's own walk
// (plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs:161-168)
// silently skips a skill directory whose SKILL.md is missing, so a corroborating
// count keyed on SKILL.md files would agree with the scorer at the wrong number;
// this sees the directory regardless. `statSync` follows symlinks exactly as the
// scorer does, so a symlinked skill dir is visible to both.
export function* eachSkillCandidateDir(root) {
  if (!fs.existsSync(root)) return;
  for (const category of fs.readdirSync(root).sort()) {
    const cp = path.join(root, category);
    if (!fs.statSync(cp).isDirectory()) continue;
    for (const name of fs.readdirSync(cp).sort()) {
      const dir = path.join(cp, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      yield { category, name, dir, file: path.join(dir, 'SKILL.md') };
    }
  }
}

// Iterate <root>/<category>/<skill>/ dirs (sorted) that hold a SKILL.md,
// yielding { category, name, dir, file }.
export function* eachSkillDir(root) {
  for (const entry of eachSkillCandidateDir(root)) if (fs.existsSync(entry.file)) yield entry;
}

// First SKILL.md whose containing directory is named `name`, anywhere under root.
export function findSkillByName(root, name) {
  return findSkillFiles(root).find((f) => path.basename(path.dirname(f)) === name) || null;
}
