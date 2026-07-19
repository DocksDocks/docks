#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { findSkillFiles } from './skills-walk.mjs';

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_RE = /^[a-z0-9-]+$/;
const HASH_RE = /^[0-9a-f]{64}$/;

const usage = 'usage: validate-skills.mjs --runtime codex|claude <skills-root>';

function parseArgs(argv) {
  let runtime = null;
  const roots = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runtime') {
      runtime = argv[i + 1];
      i += 1;
    } else {
      roots.push(arg);
    }
  }
  if (!runtime || !['codex', 'claude'].includes(runtime) || roots.length !== 1) {
    console.error(usage);
    process.exit(2);
  }
  return { runtime, root: path.resolve(roots[0]) };
}

function extractFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return { error: 'SKILL.md must start with YAML frontmatter fence `---`' };
  const end = lines.findIndex((line, index) => index > 0 && line === '---');
  if (end === -1) return { error: 'frontmatter fence is not closed' };
  return {
    text: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
  };
}

function parseFrontmatter(text) {
  const doc = parseDocument(text, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
    stringKeys: true,
  });
  if (doc.errors.length > 0) {
    return { error: doc.errors.map((error) => error.message).join('; ') };
  }
  const value = doc.toJS();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'frontmatter must be a YAML mapping/object' };
  }
  return { value };
}

function bodyLineCount(body) {
  if (!body) return 0;
  const trimmed = body.endsWith('\n') ? body.slice(0, -1) : body;
  return trimmed ? trimmed.split(/\r?\n/).length : 0;
}

function rawDescriptionLine(frontmatterText) {
  return frontmatterText.split(/\r?\n/).find((line) => /^description:/.test(line)) || '';
}

function hasPlainCommentHazard(frontmatterText) {
  const line = rawDescriptionLine(frontmatterText);
  if (!line) return false;
  const raw = line.replace(/^description:\s*/, '');
  if (!raw) return false;
  if (/^["'|>]/.test(raw)) return false;
  return /(^|[ \t])#/.test(raw);
}

function formatPath(file) {
  return path.relative(process.cwd(), file) || file;
}

function validateCommon(file, frontmatterText, fm, errors) {
  const name = fm.name;
  const description = fm.description;

  if (typeof name !== 'string' || name.trim() === '') {
    errors.push('frontmatter `name` must be a non-empty string');
  } else {
    if (!NAME_RE.test(name)) errors.push(`name ${JSON.stringify(name)} must be lowercase hyphen-case`);
    if (name.startsWith('-') || name.endsWith('-') || name.includes('--')) {
      errors.push(`name ${JSON.stringify(name)} cannot start/end with hyphen or contain consecutive hyphens`);
    }
    if (name.length > MAX_NAME_LENGTH) {
      errors.push(`name exceeds maximum length of ${MAX_NAME_LENGTH} characters (${name.length})`);
    }
    const dirName = path.basename(path.dirname(file));
    if (name !== dirName) errors.push(`name ${JSON.stringify(name)} must match directory ${JSON.stringify(dirName)}`);
  }

  if (typeof description !== 'string' || description.trim() === '') {
    errors.push('frontmatter `description` must be a non-empty string');
  } else {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`,
      );
    }
    if (description.includes('<') || description.includes('>')) {
      errors.push('description cannot contain angle brackets (`<` or `>`) for Codex compatibility');
    }
    if (hasPlainCommentHazard(frontmatterText)) {
      errors.push('plain YAML description contains `#`; quote it so Codex/Claude do not truncate it as a comment');
    }
  }
}

// agentskills.io UNIVERSAL structural rules — enforced on both runtimes (Codex
// truncates an over-length body too, and "avoid deeply nested reference chains"
// is a spec rule, not a Claude-only convention).
function validateStructure(file, body, errors) {
  const lines = bodyLineCount(body);
  if (lines > 500) {
    errors.push(`body is ${lines} lines (cap: 500); extract detail into references/`);
  }
  const refDir = path.join(path.dirname(file), 'references');
  if (fs.existsSync(refDir) && fs.statSync(refDir).isDirectory()) {
    for (const entry of fs.readdirSync(refDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        errors.push(
          `references/ must stay one level deep; nested directory ${JSON.stringify(entry.name)} is not allowed (agentskills.io: avoid deep reference chains)`,
        );
      }
    }
  }
}

function validateClaude(fm, errors) {
  const upstream = Boolean(fm.upstream);
  const description = fm.description;

  if (!upstream && typeof description === 'string' && !/^use when/i.test(description)) {
    errors.push('description must start with `Use when` unless the skill has an `upstream:` block');
  }

  if (!upstream && typeof fm['user-invocable'] !== 'boolean') {
    errors.push('frontmatter `user-invocable` must be present and boolean');
  }

  if (!upstream) {
    const updated = fm.metadata?.updated;
    if (typeof updated !== 'string' || !DATE_RE.test(updated)) {
      errors.push('metadata.updated must be present in YYYY-MM-DD format');
    }
  }

  const contentHash = fm.metadata?.content_hash;
  if (contentHash !== undefined && (typeof contentHash !== 'string' || !HASH_RE.test(contentHash))) {
    errors.push('metadata.content_hash must be a 64-character lowercase hex string when present');
  }
}

function main() {
  const { runtime, root } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`FAIL: skills root not found: ${root}`);
    process.exit(2);
  }

  const files = findSkillFiles(root);
  const failures = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const extracted = extractFrontmatter(content);
    const errors = [];
    if (extracted.error) {
      errors.push(extracted.error);
    } else {
      const parsed = parseFrontmatter(extracted.text);
      if (parsed.error) {
        errors.push(`invalid YAML frontmatter: ${parsed.error}`);
      } else {
        validateCommon(file, extracted.text, parsed.value, errors);
        validateStructure(file, extracted.body, errors);
        if (runtime === 'claude') validateClaude(parsed.value, errors);
      }
    }
    if (errors.length > 0) {
      failures.push({ file, errors });
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      for (const error of failure.errors) {
        console.error(`FAIL: ${formatPath(failure.file)}: ${error}`);
      }
    }
    console.error(`Guard FAILED: ${failures.length} skill file(s) failed ${runtime} compatibility`);
    process.exit(1);
  }

  console.log(`Guard PASSED: ${files.length} skill(s) match ${runtime} skill frontmatter expectations`);
}

main();
