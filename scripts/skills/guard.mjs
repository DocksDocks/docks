#!/usr/bin/env bun
// guard.mjs — run the combined skill frontmatter validator, the Codex-fact
// drift guard, and the reference-hygiene guard, then check that every skill
// ends with the canonical Report section. Usage: guard.mjs [skills-dir]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { findSkillFiles } from '../lib/skills-walk.mjs';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
const DIR = process.argv[2] || '';
// One canonical copy, so that the copies in all plugins cannot drift apart unseen.
const REPORT_SECTION = 'scripts/config/report-section.md';

function run(args) {
  const result = spawnSync('bun', args, { stdio: 'inherit' });
  const command = `bun ${args.join(' ')}`;
  if (result.error) {
    // Lead with the errno code: it is the same on every runtime, while the message text is
    // not (Node prints `spawnSync bun ENOENT`; Bun prints `Executable not found in $PATH`).
    console.error(
      `FAIL: ${command} could not start: ${result.error.code ?? 'unknown error'} (${result.error.message})`,
    );
    process.exit(1);
  }
  if (result.signal !== null || result.status === null) {
    console.error(`FAIL: ${command} terminated by ${result.signal ?? 'unknown signal'}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status);
}

// Every shipped skill ends with the same Report section, so that an agent that uses any skill
// can find how to report a problem with it. Read the files as latin1 (one character per byte),
// so that the comparison is byte for byte, also for line endings and trailing newlines.
function reportSectionFailures(skillsRoot) {
  const canonicalFile = path.join(REPO_DIR, REPORT_SECTION);
  let canonical;
  try {
    canonical = fs.readFileSync(canonicalFile, 'latin1');
  } catch (error) {
    console.error(`FAIL: cannot read the canonical Report section ${canonicalFile}: ${error.message}`);
    process.exit(2);
  }
  const heading = canonical.split('\n', 1)[0];
  if (!heading.startsWith('## ')) {
    console.error(`FAIL: ${REPORT_SECTION}: the first line must be the \`## \` heading of the Report section`);
    process.exit(2);
  }
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingLine = new RegExp(`^${escapedHeading}$`, 'gm');
  const failures = [];
  for (const file of findSkillFiles(skillsRoot)) {
    const content = fs.readFileSync(file, 'latin1');
    // The last heading starts the section: a skill can quote the heading in its body.
    const start = [...content.matchAll(headingLine)].at(-1)?.index;
    const shown = path.relative(process.cwd(), file) || file;
    if (start === undefined) {
      failures.push(`${shown}: missing the Report section; end the file with the text of ${REPORT_SECTION}`);
    } else if (content.slice(start) !== canonical) {
      failures.push(`${shown}: the Report section differs from ${REPORT_SECTION}; copy that file's text over it`);
    }
  }
  return failures;
}

const lib = path.join(REPO_DIR, 'scripts/lib/validate-skills.mjs');
const target = DIR || path.join(REPO_DIR, 'plugins/docks/skills');
run([lib, '--runtime', 'all', target]);
run([path.join(REPO_DIR, 'scripts/skills/codex-facts.mjs')]);
run([path.join(REPO_DIR, 'scripts/skills/refs-guard.mjs'), ...(DIR ? [DIR] : [])]);

const reportFailures = reportSectionFailures(target);
if (reportFailures.length > 0) {
  for (const failure of reportFailures) console.error(`FAIL: ${failure}`);
  console.error(`Guard FAILED: ${reportFailures.length} skill file(s) do not end with the canonical Report section`);
  process.exit(1);
}

console.log('Guard PASSED: skills match Codex and Claude conventions and end with the canonical Report section');
