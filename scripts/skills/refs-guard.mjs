#!/usr/bin/env node
// refs-guard.mjs — reference-hygiene guard for skills. Three checks the
// mechanical scorer and the YAML guards don't cover:
//
//   1. BROKEN local links   — a [](references/x) or [](assets/y) link target in
//      SKILL.md that doesn't resolve on disk. A dangling pointer tells the agent
//      to read a file that isn't there (agentskills.io: references one level
//      deep, all linked from SKILL.md — so a broken link is a silent dead end).
//   2. ORPHAN references    — a references/*.md file never mentioned by SKILL.md.
//      Level-3 content Claude never reaches is dead weight (Anthropic BP: "files
//      never accessed — cut them").
//   3. MISSING TOC          — a references/*.md over 100 lines with ≥3 doc-level
//      headings but no "## Contents" table (Anthropic BP: "For reference files
//      longer than 100 lines, include a table of contents" so Claude sees full
//      scope under partial reads). The ≥3-heading gate auto-exempts embedded
//      output templates, whose sections live inside a verbatim code fence.
//
// Cross-skill prose mentions (`solid/references/x.md`) and runtime/consumer paths
// (`docs/plans/_assets/…`) are NOT local links and are correctly ignored — only
// link targets relative to THIS skill's dir are checked.
//
// Usage: node scripts/skills/refs-guard.mjs [skills-root ...]
import fs from 'node:fs';
import path from 'node:path';
import { findSkillFiles } from '../lib/skills-walk.mjs';

const TOC_LINE_THRESHOLD = 100;
const TOC_HEADING_MIN = 3;

// Count doc-level (##/###) headings outside fences, with length-aware fence
// tracking (a fence closes only on a marker at least as long as its opener) and
// a TOC presence flag. Mirrors the kit's TOC generator so the guard and the
// author tool agree on what counts as a heading.
function analyzeReference(content) {
  const lines = content.split(/\r?\n/);
  let fenceLen = 0;
  let headings = 0;
  let hasToc = false;
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    const fm = l.match(/^(`{3,}|~{3,})/);
    if (fm) {
      const len = fm[1].length;
      if (fenceLen === 0) fenceLen = len;
      else if (len >= fenceLen) fenceLen = 0;
      continue;
    }
    if (fenceLen > 0) continue;
    if (i < 30 && /^##\s+(Contents|Table of contents)\b/i.test(l)) hasToc = true;
    if (/^#{2,3}\s+\S/.test(l)) headings += 1;
  }
  // count like `wc -l` (newline-terminated lines) so the ">100" boundary agrees
  // with the author tooling and a human's line count.
  const lineCount = content.endsWith('\n') ? lines.length - 1 : lines.length;
  return { lineCount, headings, hasToc };
}

function localLinkTargets(content) {
  const out = [];
  const re = /\]\(\s*(?:\.\/)?((?:references|assets)\/[^)\s#]+)(?:#[^)]*)?\s*\)/g;
  let m;
  while ((m = re.exec(content)) !== null) out.push(m[1]);
  return out;
}

const roots = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (roots.length === 0) {
  roots.push(path.resolve('plugins/docks/skills'));
  const local = path.resolve('.agents/skills');
  if (fs.existsSync(local)) roots.push(local);
}

const failures = [];
let skillCount = 0;
let refCount = 0;

for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const file of findSkillFiles(root)) {
    skillCount += 1;
    const dir = path.dirname(file);
    const rel = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, 'utf8');

    // 1. broken local links
    for (const tgt of new Set(localLinkTargets(content))) {
      if (!fs.existsSync(path.join(dir, tgt))) {
        failures.push(`${rel}: broken local link -> ${tgt}`);
      }
    }

    // 2 & 3. orphan + TOC, over references/
    const refDir = path.join(dir, 'references');
    if (fs.existsSync(refDir) && fs.statSync(refDir).isDirectory()) {
      for (const entry of fs.readdirSync(refDir)) {
        const refPath = path.join(refDir, entry);
        if (!fs.statSync(refPath).isFile()) continue;
        refCount += 1;
        if (!content.includes(entry)) {
          failures.push(`${rel}: orphan reference references/${entry} (never mentioned in SKILL.md)`);
        }
        if (entry.endsWith('.md')) {
          const a = analyzeReference(fs.readFileSync(refPath, 'utf8'));
          if (a.lineCount > TOC_LINE_THRESHOLD && a.headings >= TOC_HEADING_MIN && !a.hasToc) {
            failures.push(
              `references/${entry} (${path.relative(process.cwd(), refPath)}): ${a.lineCount} lines, ` +
                `${a.headings} headings, no "## Contents" TOC (Anthropic BP: TOC for reference files > 100 lines)`,
            );
          }
        }
      }
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  console.error(`\nrefs-guard FAILED: ${failures.length} issue(s) across ${skillCount} skills.`);
  process.exit(1);
}
console.log(`refs-guard PASSED: ${skillCount} skills, ${refCount} reference files — links resolve, no orphans, long refs have a TOC.`);
