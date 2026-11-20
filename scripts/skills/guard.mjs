#!/usr/bin/env bun
// guard.mjs — run the skill frontmatter validator and the reference-hygiene
// guard, then check that every skill ends with the canonical Report section
// and that each shared file copy matches its canonical file.
// Usage: guard.mjs [skills-dir]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { findSkillFiles } from '../lib/skills-walk.mjs';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
const DIR = process.argv[2] || '';
// One canonical copy, so that the copies in all plugins cannot drift apart unseen.
const REPORT_SECTION = 'scripts/config/report-section.md';
// Files that more than one plugin ships with the same bytes, such as a reference or a bundled script,
// because a plugin cannot link into another plugin. The repository lists them in this file; a
// repository without it has none. Edit each canonical file, then copy it over each of its copies.
const SHARED_REFERENCES = 'scripts/config/shared-references.json';

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

// Read the shared-file list: `[{ "canonical": "<path>", "copies": ["<path>", ...] }]`, with
// paths relative to the repository root. An absent file is an empty list.
function loadSharedFiles() {
  const file = path.join(REPO_DIR, SHARED_REFERENCES);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    console.error(`FAIL: ${SHARED_REFERENCES}: cannot read the shared-file list: ${error.message}`);
    process.exit(2);
  }
  let list;
  try {
    list = JSON.parse(text);
  } catch (error) {
    console.error(`FAIL: ${SHARED_REFERENCES}: not valid JSON: ${error.message}`);
    process.exit(2);
  }
  const isPath = (value) => typeof value === 'string' && value !== '' && !path.isAbsolute(value);
  const valid =
    Array.isArray(list) &&
    list.every(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        isPath(entry.canonical) &&
        Array.isArray(entry.copies) &&
        entry.copies.length > 0 &&
        entry.copies.every(isPath),
    );
  if (!valid) {
    console.error(
      `FAIL: ${SHARED_REFERENCES}: must be a list of { "canonical": "<path>", "copies": ["<path>", ...] }, with relative paths`,
    );
    process.exit(2);
  }
  return list;
}

// Each copy of a shared file must equal its canonical file, byte for byte (latin1, as above).
// The check reads repository paths, so it runs whatever the target folder is.
function sharedFileFailures() {
  const failures = [];
  const read = (relative) => {
    try {
      return fs.readFileSync(path.join(REPO_DIR, relative), 'latin1');
    } catch (error) {
      failures.push(`${relative}: cannot read the shared file (${error.code ?? error.message})`);
      return undefined;
    }
  };
  for (const { canonical, copies } of loadSharedFiles()) {
    const canonicalText = read(canonical);
    for (const copy of copies) {
      const copyText = read(copy);
      if (canonicalText !== undefined && copyText !== undefined && copyText !== canonicalText)
        failures.push(`${copy}: differs from ${canonical}; copy that file over it`);
    }
  }
  return failures;
}

const lib = path.join(REPO_DIR, 'scripts/lib/validate-skills.mjs');
const target = DIR || path.join(REPO_DIR, 'plugins/docks/skills');
run([lib, target]);
run([path.join(REPO_DIR, 'scripts/skills/refs-guard.mjs'), ...(DIR ? [DIR] : [])]);

const sharedFailures = sharedFileFailures();
for (const failure of sharedFailures) console.error(`FAIL: ${failure}`);
if (sharedFailures.length > 0)
  console.error(`Guard FAILED: ${sharedFailures.length} shared file(s) do not match their canonical file`);

const reportFailures = reportSectionFailures(target);
if (reportFailures.length > 0) {
  for (const failure of reportFailures) console.error(`FAIL: ${failure}`);
  console.error(`Guard FAILED: ${reportFailures.length} skill file(s) do not end with the canonical Report section`);
}
if (sharedFailures.length > 0 || reportFailures.length > 0) process.exit(1);

console.log('Guard PASSED: skills match the skill frontmatter rules and end with the canonical Report section');
