#!/usr/bin/env node
// Guard: no bespoke per-plan verification gate.
//
// A plan invented an "accepted-class sweep": a gate with its own ledger schema, digest
// helpers and CLI subcommand, built for a review budget a later change removed. It then sat
// silently vacuous — its clearance loop ran over `expectedClasses`, nothing required that set
// to be non-empty, so an empty-verdict ledger validated and the gate asserted nothing while
// looking like a gate. It was deleted at net gain, the second plan-specific verification
// mechanism to be invented, go stale and be removed.
//
// This scans shipped code for the shape that hid it, measured rather than named. A candidate
// is any exported function that accumulates findings into a local array and returns it — the
// verdict-by-accumulator shape. Four measurements must all hold before it is reported:
//
//   1. empty-tolerant coverage — at least one accumulator push sits inside a loop over a set
//      derived from the function's own parameters, and no check outside the loops requires
//      that set to be non-empty. Empty set in, clean verdict out, nothing certified.
//   2. its own artifact — the body validates against a versioned schema identity it declares,
//      the way the sweep validated ledgers against `AcceptedClassSweepV1`.
//   3. at most one shipped consumer — no other module, or exactly one, names the export.
//      Two or more consumers is shared infrastructure, not a per-plan gate.
//   4. plan-scoped — a plan body under docs/plans/ names the export.
//
// A legitimate shared gate fails measurement 3; a validator over values its callers already
// own fails 2; a general-purpose one fails 4. What remains is a gate that mints a format,
// certifies a set that may be empty, answers to one caller, and exists because one plan said
// so. The boundary is measured, not complete: a bespoke gate that mints no schema, or that
// one plan invented without naming, is outside it.
//
// Usage: plans/no-bespoke-gates.mjs [repo-root]
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(process.argv[2] || path.join(SCRIPT_DIR, '../..'));
try {
  if (!fs.statSync(ROOT).isDirectory()) throw new Error('not a directory');
  fs.accessSync(ROOT, fs.constants.R_OK);
} catch {
  console.error(`FAIL: repository root not found or unreadable: ${ROOT}`);
  process.exit(2);
}

// Tests and fixtures are excluded from the scanned set on purpose: a test asserting a gate is
// vacuous must be able to build one, and a fixture tree is frozen evidence, not shipped code.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'fixtures', 'test', 'tests']);
const PLAN_DIR = path.join(ROOT, 'docs/plans');

const codeFiles = [];
const planFiles = [];
(function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.error(`FAIL: cannot read directory ${path.resolve(dir)}: ${error.message}`);
    process.exit(2);
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (full.startsWith(`${PLAN_DIR}${path.sep}`) || path.dirname(full) === PLAN_DIR) {
      // AGENTS.md and CLAUDE.md are the workspace's standing contract, not a plan body: a
      // mechanism named there is repository policy, which is the opposite of per-plan.
      if (entry.name.endsWith('.md') && !['AGENTS.md', 'CLAUDE.md'].includes(entry.name)) planFiles.push(full);
      continue;
    }
    if (/\.(mjs|js|cjs)$/.test(entry.name) && !/\.test\.(mjs|js|cjs)$/.test(entry.name)) codeFiles.push(full);
  }
})(ROOT);
codeFiles.sort();
planFiles.sort();

let errors = 0;
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  errors += 1;
};

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    console.error(`FAIL: cannot read ${path.resolve(file)}: ${error.message}`);
    process.exit(2);
  }
}

// Same-length blanking of comments, string/template contents and regex bodies, so every index
// into the skeleton still addresses the original source. Brace matching over raw source is
// wrong: `/^[0-9a-f]{64}$/` and `'}'` both close a block that was never opened.
const REGEX_PRECEDING = new Set([...'(,=:[!&|?{};+-*%^<>~\n']);
function skeleton(source) {
  const out = source.split('');
  const blank = (start, end) => {
    for (let i = start; i < end; i += 1) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  let lastCode = '';
  while (i < source.length) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === c) break;
        j += 1;
      }
      blank(i + 1, Math.min(j, source.length));
      i = Math.min(j, source.length) + 1;
      lastCode = c;
      continue;
    }
    if (c === '/' && REGEX_PRECEDING.has(lastCode)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        else if (source[j] === '/' && !inClass) {
          closed = true;
          break;
        }
        j += 1;
      }
      if (closed) {
        blank(i + 1, j);
        i = j + 1;
        lastCode = '/';
        continue;
      }
    }
    if (!/\s/.test(c)) lastCode = c;
    i += 1;
  }
  return out.join('');
}

function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const identifiersIn = (text) => [...text.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)].map((m) => m[0]);

// `for (const x of Object.entries(units))` walks `units`, not `Object`.
const COLLECTION_WRAPPERS = new Set(['Object', 'entries', 'keys', 'values', 'Array', 'from', 'new', 'Set', 'Map']);

// Every loop body inside `body`, as [start, end) ranges over the skeleton, each with the root
// identifier of the collection it walks (null when the shape is not recognised).
function loopRanges(body) {
  const ranges = [];
  const addBody = (afterHeader, root) => {
    let k = afterHeader;
    while (k < body.length && /\s/.test(body[k])) k += 1;
    if (body[k] === '{') {
      const close = matchBrace(body, k);
      if (close !== -1) ranges.push({ start: k, end: close, root });
      return;
    }
    const semi = body.indexOf(';', k);
    ranges.push({ start: k, end: semi === -1 ? body.length : semi, root });
  };
  for (const m of body.matchAll(/\b(for|while)\s*\(/g)) {
    const open = body.indexOf('(', m.index);
    const close = matchParen(body, open);
    if (close === -1) continue;
    const header = body.slice(open + 1, close);
    const ofIn = /\b(?:of|in)\b(.*)$/s.exec(header)?.[1];
    const counted = /([A-Za-z_$][A-Za-z0-9_$.]*)\s*\.\s*length/.exec(header)?.[1];
    const ids = identifiersIn(ofIn ?? counted ?? '').filter((id) => !COLLECTION_WRAPPERS.has(id));
    addBody(close + 1, ids[0] ?? null);
  }
  for (const m of body.matchAll(/\.(?:forEach|map|flatMap|filter|some|every|find|findIndex|reduce)\s*\(/g)) {
    const open = body.indexOf('(', m.index);
    const close = matchParen(body, open);
    if (close === -1) continue;
    const receiver = /([A-Za-z_$][A-Za-z0-9_$.]*)\s*$/.exec(body.slice(0, m.index))?.[1] ?? '';
    ranges.push({ start: open, end: close, root: identifiersIn(receiver)[0] ?? null });
  }
  return ranges;
}

const insideAny = (ranges, index) => ranges.filter((r) => index > r.start && index < r.end);

// Text of `body` with every loop body removed: what the function checks unconditionally.
function outsideLoops(body, ranges) {
  const chars = body.split('');
  for (const r of ranges) {
    for (let i = r.start; i <= r.end && i < chars.length; i += 1) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

const wordRe = (name) => new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`);

// A check that the certified set is not empty, wherever the author chose to write it: a size
// comparison against a literal, or a bare `!set.length`.
function requiresNonEmpty(text, names) {
  for (const name of names) {
    const word = `\\b${name.replace(/[$]/g, '\\$')}\\b`;
    const sized = `${word}[^;\\n]{0,60}?\\.(?:length|size)\\s*(?:===?|!==?|<=?|>=?)\\s*\\d`;
    const negated = `!\\s*${word}(?:\\.\\w+)*\\.(?:length|size)\\b`;
    if (new RegExp(sized).test(text) || new RegExp(negated).test(text)) return true;
  }
  return false;
}

const gates = [];
for (const file of codeFiles) {
  const source = readFile(file);
  if (!source.includes('export function')) continue;
  const skel = skeleton(source);
  for (const m of skel.matchAll(/\bexport\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
    const name = m[1];
    const paramOpen = skel.indexOf('(', m.index);
    const paramClose = matchParen(skel, paramOpen);
    if (paramClose === -1) {
      fail(`${path.relative(ROOT, file)} — unbalanced parameters for export ${name}; the guard cannot measure it`);
      continue;
    }
    const bodyOpen = skel.indexOf('{', paramClose);
    const bodyClose = bodyOpen === -1 ? -1 : matchBrace(skel, bodyOpen);
    if (bodyClose === -1) {
      fail(`${path.relative(ROOT, file)} — unbalanced body for export ${name}; the guard cannot measure it`);
      continue;
    }
    const body = skel.slice(bodyOpen, bodyClose + 1);
    // A bespoke gate arrives with an artifact of its own: the sweep declared
    // `AcceptedClassSweepV1` and validated ledgers against it. A gate that judges only values
    // its callers already own has minted no format and is not the shape being hunted.
    const artifact = /['"`]([A-Za-z][A-Za-z0-9_]*V\d+)['"`]/.exec(source.slice(bodyOpen, bodyClose + 1))?.[1] ?? null;

    // The verdict-by-accumulator shape: a local array collected into and handed back.
    const declared = body.matchAll(/\b(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\[\s*\]/g);
    const accumulators = [...declared].map((a) => a[1]);
    const accumulator = accumulators.find(
      (id) => wordRe(`${id}\\.push`).test(body) && new RegExp(`return\\s+${id}\\s*;`).test(body),
    );
    if (accumulator === undefined) continue;

    const params = new Set(identifiersIn(skel.slice(paramOpen + 1, paramClose)));
    const tainted = new Set(params);
    for (let pass = 0; pass < 4; pass += 1) {
      for (const d of body.matchAll(/\b(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=([^;]*);/g)) {
        if (identifiersIn(d[2]).some((id) => tainted.has(id))) tainted.add(d[1]);
      }
    }

    const ranges = loopRanges(body);
    const pushes = [...body.matchAll(new RegExp(`\\b${accumulator}\\s*\\.\\s*push\\s*\\(`, 'g'))].map((p) => p.index);
    if (pushes.length === 0) continue;

    const certifying = new Set();
    for (const index of pushes) {
      for (const r of insideAny(ranges, index)) if (r.root && tainted.has(r.root)) certifying.add(r.root);
    }
    if (certifying.size === 0) continue;
    if (requiresNonEmpty(outsideLoops(body, ranges), certifying)) continue;

    if (artifact === null) continue;

    gates.push({ file, name, artifact, certifying: [...certifying].sort() });
  }
}

for (const gate of gates) {
  const rel = path.relative(ROOT, gate.file);
  const re = wordRe(gate.name);
  const consumers = codeFiles.filter((f) => f !== gate.file && re.test(readFile(f))).map((f) => path.relative(ROOT, f));
  if (consumers.length > 1) continue;
  const plans = planFiles.filter((f) => re.test(readFile(f))).map((f) => path.relative(ROOT, f));
  if (plans.length === 0) continue;
  fail(
    `${rel} — ${gate.name} is a bespoke per-plan gate over its own ${gate.artifact} artifact. It clears one member ` +
      `at a time of ${gate.certifying.join(', ')}; nothing outside its loops requires ` +
      `${gate.certifying.length > 1 ? 'those sets' : 'that set'} to be non-empty, so an empty set clears it while ` +
      `it certifies nothing. Shipped consumers: ${consumers.length === 0 ? 'none' : consumers.join(', ')}. ` +
      `Named by plan ${plans.join(', ')}. Fold the check into a mechanism more than one caller depends on, or ` +
      'require the certified set to be non-empty.',
  );
}

if (errors > 0) {
  console.error(`plans/no-bespoke-gates FAILED: ${errors} error(s) across ${codeFiles.length} shipped module(s)`);
  process.exit(1);
}
console.log(`plans/no-bespoke-gates PASSED: ${codeFiles.length} shipped module(s), ${planFiles.length} plan body(ies)`);
