#!/usr/bin/env node

// plan-self-check.mjs - bookkeeping for a unit-gated plan review. It judges nothing.
//
// WHY THERE IS NO SCORE. A predecessor scored plans on six weighted axes out of 100 and gated at
// 90. Measured: eleven rounds of real repair on one plan produced mean 55.1, sd 9.3. Seven
// independent scorings of ONE byte-identical document produced mean 55.1, sd 8.1, range 38-64.
// The means agree to one decimal, so the scalar measured the judge and not the plan, and a
// threshold on it was a coin. It also could not be reached: the cheapest defect kind cost 2
// points, so 90 required at most five findings, and the fewest ever returned in eighteen passes
// was twelve.
//
// WHAT REPLACED IT. Properties are judged per UNIT over script-enumerated, bounded sets. A
// property universally quantified over an unbounded set - "every numeric claim in a 40 KB
// document" - returned fail or unverified on every document tested, including a corrected one,
// so it discriminated nothing; such properties advise and never gate. Measured on the binary bit
// the gate consumes, 16 of 17 mandatory properties returned an identical verdict across 7 fresh
// contexts, and where replicates named concrete units they agreed far better than on any
// document-level boolean.
//
// A unit either passes, is fixed, or carries a recorded waiver. There is no ratio and no
// threshold, so the gate terminates on a finite set and names exactly what remains.
//
// TRANSPORT AND EGRESS. No network access; no reviewer is dispatched. This formats state and
// validates returns, so the transport is the caller's. Sending plan text to a third party ships
// whatever the plan describes to that party - a decision only the repository's owner can make,
// under their own authorization. Nothing here grants it and no vendor is named.
//
// Usage - paths may be repository-relative or absolute:
//   plan-self-check.mjs units    <plan.md>
//   plan-self-check.mjs check    <plan.md>            run deterministic checks and the falsifiability gate
//   plan-self-check.mjs report   <plan.md>            print one falsifiability record line per acceptance row
//   plan-self-check.mjs coverage <directory>          count falsifiability records without blocking
//   plan-self-check.mjs rules    <plan.md>            run construct-conditional structural rules
//   plan-self-check.mjs sections <plan.md>
//   plan-self-check.mjs prompt   <plan.md> [--hunt]
//   plan-self-check.mjs validate <result.json> <plan.md>
//   plan-self-check.mjs ledger   <result.json> <ledger.json> <plan.md> [--reviewer <label>]
//   plan-self-check.mjs waive    <ledger.json> <unit-key> <property> --reason <text> --by <who>
//   plan-self-check.mjs gate     <ledger.json> <plan.md>
//   plan-self-check.mjs apply    <result.json> <plan.md> [--commit]
//
// Exit 0 on success or a clear gate, 1 on a refusal or a blocked gate, 2 on usage error.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { checkPlanMeasurements } from './plan-measurements.mjs';
import {
  canonicalPlanView,
  canonicalVerificationResults,
  jcs,
  parsePlan,
  reducePlanRun,
  sha256,
  transactPlanRun,
  validatePlanRun,
} from '../plan-run.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const RUBRIC = JSON.parse(fs.readFileSync(path.join(HERE, 'plan-properties.json'), 'utf8'));
const VERDICTS = new Set(RUBRIC.gate.verdicts);
const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const fullDigest = (text) => createHash('sha256').update(text).digest('hex');
const STATUS_MODES = Object.freeze({
  drafting: 'enforcing',
  planned: 'counting-only',
  scheduled: 'counting-only',
  ongoing: 'counting-only',
  finished: 'counting-only',
  blocked: 'counting-only',
});


export function statusMode(status) {
  if (!Object.hasOwn(STATUS_MODES, status)) throw new Error(`unknown plan status: ${String(status)}`);
  return STATUS_MODES[status];
}

const REQUIRED_HEADINGS = Object.freeze([
  'Goal',
  'Context & rationale',
  'Environment & how-to-run',
  'Steps',
  'Acceptance criteria',
  'Out of scope / do-NOT-touch',
  'STOP conditions',
  'Open questions',
  'Review',
  'Verification Results',
]);

const slug = (h) =>
  h
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Walk the document once, yielding unfenced headings and unfenced table rows with their line. */
function* scan(planText) {
  let fence = null;
  const lines = planText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(/^\s*(```+|~~~+)/);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = lines[i].match(/^(#{2,6}) +(.+?)\s*$/);
    if (h) {
      const mechanism = /\{mechanism\}\s*$/.test(h[2]);
      yield {
        kind: 'heading',
        level: h[1].length,
        text: h[2].replace(/\s*\{mechanism\}\s*$/, ''),
        mechanism,
        line: i + 1,
        raw: lines[i],
      };
      continue;
    }
    if (/^\s*\|/.test(lines[i])) yield { kind: 'row', line: i + 1, raw: lines[i] };
  }
}
function splitMarkdownRow(raw) {
  const cells = [];
  let cell = '';
  let ticks = 0;
  for (let index = 1; index < raw.length; index++) {
    const character = raw[index];
    if (character === '`') {
      let run = 1;
      while (raw[index + run] === '`') run++;
      ticks = ticks === 0 ? run : ticks === run ? 0 : ticks;
      cell += '`'.repeat(run);
      index += run - 1;
      continue;
    }
    if (character === '|' && ticks === 0) {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += character;
  }
  if (cell !== '') cells.push(cell);
  return cells;
}

function acceptanceRows(planText) {
  const lines = planText.split('\n');
  const heading = lines.findIndex((line) => /^## Acceptance criteria\s*$/.test(line));
  if (heading < 0) return [];
  const end = lines.findIndex((line, index) => index > heading && /^##\s+/.test(line));
  const limit = end < 0 ? lines.length : end;
  const starts = [];
  for (let index = heading + 1; index < limit; index++) {
    if (/^\|\s*[A-Z]\d{1,3}[a-z]?\s*\|/.test(lines[index])) starts.push(index);
  }
  return starts.map((start, rowIndex) => {
    const next = starts[rowIndex + 1] ?? limit;
    const rowLines = lines.slice(start, next);
    while (rowLines.length > 1 && rowLines.at(-1).trim() === '') rowLines.pop();
    const raw = rowLines.join('\n');
    const cells = splitMarkdownRow(raw);
    const rowId = cells[0]?.trim().replace(/`/g, '') ?? '';
    return {
      row_id: rowId,
      step_id: cells[1]?.trim().replace(/`/g, '') ?? '',
      command: cells[2] ?? '',
      expected: cells[3] ?? '',
      line: start + 1,
      raw,
    };
  });
}

function planRecord(planText) {
  const parsed = parsePlan(Buffer.from(planText));
  const line = parsed.body.split('\n').find((candidate) => candidate.startsWith('Plan-run: '));
  return {
    record: line ? JSON.parse(line.slice('Plan-run: '.length)) : null,
    status: parsed.frontmatter.status,
  };
}

function acceptanceBindings(planText) {
  const bindings = new Map();
  for (const line of planText.split('\n')) {
    const cells = /^\|\s*`?(exit|match)`?\s*\|[^|]*\|([^|]+)\|\s*$/.exec(line);
    if (!cells) continue;
    for (const rowId of cells[2].match(/[A-Z]\d{1,3}[a-z]?/g) ?? []) bindings.set(rowId, cells[1]);
  }
  return bindings;
}

function proofRecords(planText) {
  const records = new Map();
  const parsed = parsePlan(Buffer.from(planText));
  const lines = parsed.body.split('\n');
  const start = lines.findIndex((line) => line === '## Verification Results');
  if (start < 0) return records;
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  for (const line of lines.slice(start + 1, end < 0 ? lines.length : end)) {
    if (!line.startsWith('Falsifiability-proof: ')) continue;
    const record = JSON.parse(line.slice('Falsifiability-proof: '.length));
    const prior = records.get(record.row_id);
    records.set(record.row_id, prior ? { duplicate: true, record } : { duplicate: false, record });
  }
  return records;
}

export function acceptanceProofReport(planText) {
  const { record: run, status } = planRecord(planText);
  const mode = statusMode(status);
  const bindings = acceptanceBindings(planText);
  const records = proofRecords(planText);
  const rows = acceptanceRows(planText).map((row) => {
    const expectedKeys = {
      command_sha256: fullDigest(row.command),
      expected_sha256: fullDigest(row.expected),
      source_base: run?.source_base ?? null,
      step_id: row.step_id,
    };
    const stored = records.get(row.row_id);
    const driftedKeys = stored
      ? Object.entries(expectedKeys)
          .filter(([key, value]) => stored.record[key] !== value)
          .map(([key]) => key)
      : Object.keys(expectedKeys);
    if (stored?.duplicate) driftedKeys.push('record');
    const proven = Boolean(stored) && driftedKeys.length === 0;
    return {
      row_id: row.row_id,
      step_id: row.step_id,
      binds: bindings.get(row.row_id) ?? null,
      proven,
      record_present: proven,
      stored_record_present: Boolean(stored),
      drifted_keys: driftedKeys,
      expected_keys: expectedKeys,
      record: proven ? stored.record : null,
    };
  });
  return {
    status,
    mode,
    rows,
    proven: rows.filter((row) => row.proven).length,
    unproven: rows.filter((row) => !row.proven).length,
  };
}

export function verifyFalsifiabilityProofs(planText) {
  const report = acceptanceProofReport(planText);
  return {
    ...report,
    clear: report.mode !== 'enforcing' || report.unproven === 0,
  };
}
function observationFor(observations, rowId) {
  return observations instanceof Map ? observations.get(rowId) : observations?.[rowId];
}

function buildProofRecords(planText, observations) {
  const { record: run } = planRecord(planText);
  if (run === null) throw new Error('falsifiability proofs require a current Plan-run record');
  const bindings = acceptanceBindings(planText);
  return acceptanceRows(planText).map((row) => {
    const binds = bindings.get(row.row_id);
    if (!['exit', 'match'].includes(binds)) throw new Error(`${row.row_id}: binds must be exit or match`);
    const observation = observationFor(observations, row.row_id);
    if (observation === null || typeof observation !== 'object' || Array.isArray(observation)) {
      throw new Error(`${row.row_id}: observation is required`);
    }
    if (!Object.hasOwn(observation, 'observed') || !Object.hasOwn(observation, 'probe')) {
      throw new Error(`${row.row_id}: observation requires observed and probe`);
    }
    if (typeof observation.probe !== 'string' || observation.probe.trim() === '') {
      throw new Error(`${row.row_id}: probe must be a non-empty string`);
    }
    if (binds === 'exit' && !Number.isInteger(observation.observed)) {
      throw new Error(`${row.row_id}: exit observation must be an integer status`);
    }
    if (
      binds === 'match' &&
      (observation.observed === null ||
        typeof observation.observed !== 'object' ||
        Array.isArray(observation.observed) ||
        typeof observation.observed.matcher !== 'string' ||
        observation.observed.matcher === '' ||
        !Object.hasOwn(observation.observed, 'result') ||
        observation.observed.result === undefined)
    ) {
      throw new Error(`${row.row_id}: match observation must be {matcher, result}`);
    }
    return {
      row_id: row.row_id,
      step_id: row.step_id,
      command_sha256: fullDigest(row.command),
      expected_sha256: fullDigest(row.expected),
      source_base: run.source_base,
      binds,
      observed: observation.observed,
      probe: observation.probe,
    };
  });
}

/**
 * `narrative` exists because the section has exactly ONE writable moment. A prose-only write is
 * refused with "persisted PlanRun bytes cannot change without a legal state event" (measured), and
 * once the reserve mints `acceptance` the section is bound by `verification_sha256`, so any later
 * edit is refused too. Operator prose that belongs beside the records therefore has to be composed
 * in the same call, or it can never be recorded at all.
 */
function installProofRecords(planText, records, narrative = []) {
  const lines = planText.split('\n');
  const start = lines.findIndex((line) => line === '## Verification Results');
  if (start < 0) throw new Error('plan is missing its Verification Results section');
  const following = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  const end = following < 0 ? lines.length : following;
  const retained = lines
    .slice(start + 1, end)
    .filter((line) => !line.startsWith('Falsifiability-proof: '));
  while (retained.length > 0 && retained.at(-1) === '') retained.pop();
  while (retained.length > 0 && retained[0] === '') retained.shift();
  // Leading blanks are stripped BEFORE this check because every plan template puts a blank line
  // under the heading, so the placeholder is never the only line - it is the second. Testing
  // `length === 1` against the unstripped slice silently kept "Not yet started." above the real
  // evidence, which is how a section claims nothing was done while carrying eleven proofs.
  if (retained.length === 1 && retained[0] === 'Not yet started.') retained.length = 0;
  if (narrative.length > 0) {
    if (retained.length > 0) retained.push('');
    retained.push(...narrative);
  }
  if (retained.length > 0) retained.push('');
  retained.push(...records.map((record) => `Falsifiability-proof: ${jcs(record)}`), '');
  lines.splice(start + 1, end - start - 1, ...retained);
  return Buffer.from(lines.join('\n'));
}

/**
 * Compose the finished `## Verification Results` bytes WITHOUT touching the record or the
 * repository. Composition is separated from the transaction because the two live paths need
 * opposite things from it.
 *
 * `writeFalsifiabilityProofs` below both composes and reserves, which suits a scratch fixture
 * (A10's probe) where spending a permit costs nothing. A real completion review must not use it:
 * the review dispatch driver performs its OWN reserve and seals a bundle digest over the plan plus
 * the affected-path manifest, so a reserve here would either burn the second of two permits or be
 * refused outright, and the verdict would bind `input_sha256` over plan bytes alone rather than
 * over the evidence the reviewer actually saw. The live path therefore composes with this function
 * and hands the result to that driver's `--body`, which installs it inside the single reserve.
 */
export function composeProofSection({ planText, observations, narrative = [] }) {
  const records = buildProofRecords(planText, observations);
  return { bytes: installProofRecords(planText, records, narrative), records };
}

function installRunRecord(bytes, run) {
  const lines = bytes.toString().split('\n');
  const index = lines.findIndex((line) => line.startsWith('Plan-run: '));
  if (index < 0) throw new Error('plan is missing its Plan-run record');
  lines[index] = `Plan-run: ${jcs(run)}`;
  return Buffer.from(lines.join('\n'));
}

export async function writeFalsifiabilityProofs({
  file,
  identity,
  observations,
  narrative = [],
  implementationCommit,
  acceptanceManifest,
  acceptanceManifestExpectation,
}) {
  const liveBytes = fs.readFileSync(file);
  const current = validatePlanRun(liveBytes, { ...identity, acceptanceProof: 'recorded' });
  if (current.status !== 'ongoing') throw new Error(`proof writer requires ongoing status, found ${current.status}`);
  if (current.run.completion_review.state !== 'not_started') {
    throw new Error(
      `proof writer requires completion_review not_started, found ${current.run.completion_review.state}`,
    );
  }
  const { bytes: withProofs, records } = composeProofSection({
    narrative,
    observations,
    planText: liveBytes.toString(),
  });
  const planSha256Before = sha256(canonicalPlanView(liveBytes));
  const planSha256After = sha256(canonicalPlanView(withProofs));
  if (planSha256Before !== planSha256After || planSha256After !== current.run.plan_sha256) {
    throw new Error('installing falsifiability proofs moved plan_sha256');
  }
  const verificationSha256 = sha256(canonicalVerificationResults(withProofs));
  const acceptance = {
    source_sha256: acceptanceManifest?.source_sha256,
    verification_sha256: verificationSha256,
  };
  const reserved = reducePlanRun({
    current: { status: current.status, run: current.run },
    event: {
      type: 'reserve_review',
      phase: 'completion_review',
      input_sha256: sha256(withProofs),
      implementation_commit: implementationCommit,
      acceptance,
    },
  });
  const nextBytes = installRunRecord(withProofs, reserved.run);
  validatePlanRun(nextBytes, {
    ...identity,
    acceptanceManifest,
    acceptanceManifestExpectation,
  });
  const transaction = await transactPlanRun({
    acceptanceManifest,
    acceptanceManifestExpectation,
    file,
    identity,
    expectedBytesSha256: sha256(liveBytes),
    nextBytes,
  });
  return {
    ...transaction,
    records,
    plan_sha256: planSha256After,
    verification_sha256: verificationSha256,
  };
}

/**
 * Sections are derived from the document's own headings, never from a table of prose anchors: an
 * earlier version carried such a table and drifted twice in two rounds, silently omitting a
 * section and leaving the reviewer bound to a map that no longer described the document.
 */
export function sectionDigests(planText, { strict = false } = {}) {
  const lines = planText.split('\n');
  const seen = new Map();
  const bounds = [];
  for (const ev of scan(planText)) {
    if (ev.kind !== 'heading') continue;
    let id = slug(ev.text);
    const dup = (seen.get(id) ?? 0) + 1;
    seen.set(id, dup);
    if (dup > 1) id = `${id}-${dup}`;
    bounds.push({ id, heading: ev.text, start: ev.line - 1 });
  }
  const bodies = {};
  for (let b = 0; b < bounds.length; b++) {
    const end = b + 1 < bounds.length ? bounds[b + 1].start : lines.length;
    bodies[bounds[b].id] = lines.slice(bounds[b].start, end).join('\n');
  }
  const present = new Set(bounds.map((b) => b.heading));
  const missing = REQUIRED_HEADINGS.filter((h) => !present.has(h));
  if (missing.length && strict) throw new Error(`plan is missing required sections: ${missing.join(', ')}`);
  const map = Object.fromEntries(
    Object.entries(bodies)
      .filter(([, v]) => v.trim().length)
      .map(([k, v]) => [k, digest(v)])
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
  if (missing.length) map.__missing_required = missing.join(',');
  return map;
}

/**
 * The gate's denominator. Enumeration is deterministic and needs no model, which is why these
 * sets can gate at all: every member is individually fixable or waivable, so the work terminates.
 *
 * Mechanisms are DECLARED with a `{mechanism}` heading marker, not inferred from heading depth.
 * Inference was tried and mis-enumerated at once: of five h3 headings in a real plan only two were
 * mechanisms, so the probe properties would have demanded executable evidence for a facts table
 * and a path list, forcing waivers on units never in scope. Depth also encodes freeze granularity,
 * so formatting changes would silently alter the mechanism set. An opt-in marker introduces the
 * opposite hazard - declare nothing and every probe property passes vacuously - which P19 closes.
 */
export function enumerateUnits(planText) {
  const lines = planText.split('\n');
  const units = { acceptance_rows: [], steps_rows: [], named_mechanisms: [] };
  const mechStarts = [];
  let section = null;
  for (const ev of scan(planText)) {
    if (ev.kind === 'heading') {
      if (ev.level === 2) section = slug(ev.text);
      // Close every still-open mechanism this heading terminates, BEFORE opening a new one, so a
      // mechanism cannot close itself and an earlier one cannot run to end of file.
      for (const m of mechStarts) {
        if (!m.closed && ev.line > m.unit.line && ev.level <= m.level) {
          m.unit.text = lines.slice(m.unit.line - 1, ev.line - 1).join('\n');
          m.closed = true;
        }
      }
      if (ev.mechanism) {
        units.named_mechanisms.push({ id: slug(ev.text), line: ev.line, label: ev.text, section });
        mechStarts.push({ unit: units.named_mechanisms.at(-1), level: ev.level, closed: false });
      }
      continue;
    }
    const cells = ev.raw
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (!cells.length || /^-{2,}$|^:?-+:?$/.test(cells[0])) continue;
    const first = cells[0].replace(/`/g, '');
    if (section === 'acceptance-criteria' && /^[A-Z]\d{1,3}[a-z]?$/.test(first)) {
      units.acceptance_rows.push({
        id: first,
        line: ev.line,
        label: cells[1]?.slice(0, 60) ?? '',
        section,
        text: ev.raw,
      });
    } else if (section === 'steps' && /^\d{1,3}$/.test(first)) {
      units.steps_rows.push({ id: first, line: ev.line, label: cells[1]?.slice(0, 60) ?? '', section, text: ev.raw });
    }
  }
  for (const m of mechStarts) if (!m.closed) m.unit.text = lines.slice(m.unit.line - 1).join('\n');
  for (const list of Object.values(units)) for (const u of list) u.sha256 = digest(u.text ?? '');
  return units;
}

const unitKeys = (units) => Object.entries(units).flatMap(([set, list]) => list.map((u) => `${set}:${u.id}`));

/** Properties that gate, split by how they are quantified. */
const gating = () => RUBRIC.properties.filter((p) => p.gates);
const unitScoped = () => gating().filter((p) => p.scope.startsWith('unit:'));
const docScoped = () => gating().filter((p) => !p.scope.startsWith('unit:'));
// Prompt and acceptance surfaces exclude whatever the script decides. Asking a model to judge a
// decided property buys variance for nothing and invites contradiction: a real round returned fail
// for the step-ordering property whose script check passes.
const judged = () => gating().filter((p) => p.checked_by !== 'script');
const unitAsked = () => judged().filter((p) => p.scope.startsWith('unit:'));
const docAsked = () => judged().filter((p) => !p.scope.startsWith('unit:'));

export function scriptChecks(planText) {
  const units = enumerateUnits(planText);
  const out = {};
  out.P19 = units.named_mechanisms.length
    ? { verdict: 'pass', reason: `${units.named_mechanisms.length} mechanism(s) declared` }
    : {
        verdict: 'fail',
        reason: 'no {mechanism} heading is declared, so every probe property would pass over an empty set',
      };

  const fm = planText.match(/^---\n([\s\S]*?)\n---/);
  const block = fm?.[1].match(/^affected_paths:\n((?:[ \t]+-[ \t]+.*(?:\n|$))+)/m);
  const declared = new Set(
    (block?.[1] ?? '')
      .split('\n')
      .map((l) => l.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean),
  );
  const used = new Set();
  for (const row of stepRows(planText))
    for (const m of (row.cells[2] ?? '').matchAll(/`([^`]+)`/g)) used.add(m[1].trim());
  const undeclared = [...used].filter((p) => !declared.has(p));
  const untouched = [...declared].filter((p) => !used.has(p));
  out.P13 =
    undeclared.length || untouched.length
      ? {
          verdict: 'fail',
          reason: `${undeclared.length} path(s) used but undeclared${undeclared.length ? ` (${undeclared.slice(0, 3).join(', ')})` : ''}; ${untouched.length} declared but untouched${untouched.length ? ` (${untouched.slice(0, 3).join(', ')})` : ''}`,
        }
      : { verdict: 'pass', reason: `${declared.size} declared path(s) match the steps exactly` };

  const rows = stepRows(planText);
  const ids = rows.map((r) => r.cells[0].replace(/`/g, ''));
  const bad = [];
  for (const r of rows) {
    const self = Number(r.cells[0].replace(/`/g, ''));
    for (const d of (r.cells[3] ?? '')
      .split(/[,\s]+/)
      .map((x) => x.replace(/[^0-9]/g, ''))
      .filter(Boolean)) {
      if (!ids.includes(d)) bad.push(`step ${self} depends on ${d}, which does not exist`);
      else if (Number(d) >= self) bad.push(`step ${self} depends on ${d}, which is not earlier`);
    }
  }
  out.P16 = bad.length
    ? { verdict: 'fail', reason: bad.slice(0, 4).join('; ') }
    : { verdict: 'pass', reason: `${rows.length} step(s) in a valid order` };
  return out;
}

function stepRows(planText) {
  const rows = [];
  let section = null;
  for (const ev of scan(planText)) {
    if (ev.kind === 'heading') {
      if (ev.level === 2) section = slug(ev.text);
      continue;
    }
    if (section !== 'steps') continue;
    const cells = ev.raw
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length && /^\d{1,3}$/.test(cells[0].replace(/`/g, ''))) rows.push({ cells });
  }
  return rows;
}

const NUMBER_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
});

const cleanCell = (cell) => cell.trim().replace(/^`|`$/g, '');
const markdownCells = (line) => splitMarkdownRow(line).map((cell) => cell.trim());

function structuralScope(planText) {
  const lines = planText.split('\n');
  let start = 0;
  if (lines[0] === '---') {
    const closing = lines.indexOf('---', 1);
    if (closing >= 0) start = closing + 1;
  }
  const end = lines.findIndex(
    (line, index) => index >= start && /^## (?:Review|Verification Results)\s*$/.test(line),
  );
  return lines
    .slice(start, end < 0 ? lines.length : end)
    .filter((line) => !/^\|\s*R\d+\s*\|/.test(line));
}

const producerOutputCommandPattern =
  /^(?:git|node|grep|rg|wc|sed|find|awk|python\d*|pnpm|npm|corepack|bash|sh|printf|cat|jq|curl|make|cargo|go|pytest|npx|bun|deno)\b/;
const producerCommandPattern = /^(?:[A-Z_][A-Z0-9_]*=)/;

function structuralLineModel(lines) {
  const classified = [];
  let measurement = null;
  let measurementLevel = 0;
  let fence = null;
  let producerFence = false;
  let pendingProducerFence = false;

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const heading = /^(#{2,6})\s+(.+)$/.exec(raw);
    if (heading !== null) {
      const level = heading[1].length;
      if (measurement !== null && level <= measurementLevel) measurement = null;
      const marker = /\{measurement:(committed|snapshot|operator)\}\s*$/.exec(heading[2]);
      if (marker !== null) {
        measurement = marker[1];
        measurementLevel = level;
      }
      pendingProducerFence = false;
    }

    const fenceMarker = /^\s*(`{3,}|~{3,})/.exec(raw)?.[1] ?? null;
    if (fence !== null) {
      classified.push({ index, kind: producerFence ? 'producer' : 'fenced', measurement, raw });
      if (fenceMarker !== null && fenceMarker[0] === fence[0]) {
        fence = null;
        producerFence = false;
      }
      continue;
    }
    if (fenceMarker !== null) {
      fence = fenceMarker;
      producerFence = measurement !== null && measurement !== 'operator' && pendingProducerFence;
      pendingProducerFence = false;
      classified.push({ index, kind: producerFence ? 'producer' : 'fenced', measurement, raw });
      continue;
    }

    if (/^Producer[.,:]/i.test(raw.trim())) pendingProducerFence = true;
    let kind = 'prose';
    if (/^\s*\|/.test(raw)) kind = 'table';
    else if (
      measurement !== null &&
      measurement !== 'operator' &&
      (producerCommandPattern.test(raw.trim()) || producerOutputCommandPattern.test(raw.trim()))
    ) {
      kind = 'producer';
    }
    classified.push({ index, kind, measurement, raw });
  }
  return classified;
}

function tablesInSection(lines, firstHeader) {
  const tables = [];
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*\|/.test(lines[index])) continue;
    if (cleanCell(markdownCells(lines[index])[0] ?? '').toLowerCase() !== firstHeader.toLowerCase()) continue;
    const table = tableInSection(lines.slice(index), firstHeader);
    if (table === null) continue;
    tables.push({
      ...table,
      headerIndex: table.headerIndex + index,
      rows: table.rows.map((row) => ({ ...row, index: row.index + index })),
    });
    index += Math.max(table.rows.at(-1)?.index ?? 0, 0);
  }
  return tables;
}

function runnableAcceptanceCommand(cell) {
  const match = /^\s*`([^`\n]+)`\s*$/.exec(cell);
  if (match === null) return false;
  return /^(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S+)\s+)*(?:[A-Za-z0-9_./~-]+)(?:\s+.*)?$/.test(
    match[1].trim(),
  );
}

function acceptanceSubcommands(cell) {
  const subcommands = [];
  for (const span of cell.matchAll(/`([^`\n]+)`/g)) {
    const tokens = span[1].trim().split(/\s+/);
    if (tokens.length < 2) continue;
    let scriptIndex = -1;
    if (/^(?:node|bun|deno|python\d*|bash|sh)$/.test(tokens[0])) {
      if (tokens.slice(1).some((token) => /^(?:-e|--eval|-p|--print)$/.test(token))) continue;
      scriptIndex = tokens.findIndex(
        (token, index) => index > 0 && /\.(?:mjs|cjs|js|ts|py|sh)$/.test(token),
      );
    } else if (/\.(?:mjs|cjs|js|ts|py|sh)$/.test(tokens[0])) {
      scriptIndex = 0;
    }
    if (scriptIndex < 0) continue;
    const subcommand = tokens[scriptIndex + 1];
    if (/^[a-z][a-z0-9-]*$/.test(subcommand ?? '')) subcommands.push(subcommand);
  }
  return subcommands;
}

function namedSubcommands(task, declarationEnd) {
  const tail = task.slice(declarationEnd).split(/[.;]/, 1)[0];
  const quoted = [...tail.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((match) => match[1]);
  if (quoted.length > 0) return quoted;
  return (tail.match(/\b[a-z][a-z0-9-]*\b/g) ?? []).filter(
    (word) => !['and', 'or', 'named', 'called'].includes(word.toLowerCase()),
  );
}

function headingSections(lines, marker) {
  const sections = [];
  for (let start = 0; start < lines.length; start++) {
    const heading = /^(#{2,6})\s+(.+)$/.exec(lines[start]);
    if (!heading || !marker.test(heading[2])) continue;
    const level = heading[1].length;
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index++) {
      const next = /^(#{2,6})\s+/.exec(lines[index]);
      if (next && next[1].length <= level) {
        end = index;
        break;
      }
    }
    sections.push(lines.slice(start, end));
  }
  return sections;
}

function tableInSection(lines, firstHeader) {
  const headerIndex = lines.findIndex((line) => {
    if (!/^\s*\|/.test(line)) return false;
    return cleanCell(markdownCells(line)[0] ?? '').toLowerCase() === firstHeader.toLowerCase();
  });
  if (headerIndex < 0) return null;
  const headers = markdownCells(lines[headerIndex]).map((cell) => cleanCell(cell).toLowerCase());
  const rows = [];
  for (let index = headerIndex + 1; index < lines.length; index++) {
    if (!/^\s*\|/.test(lines[index])) {
      if (rows.length > 0) break;
      continue;
    }
    const cells = markdownCells(lines[index]);
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    rows.push({ cells, line: lines[index], index });
  }
  return { headerIndex, headers, rows };
}

function structuralContext(planText) {
  const lines = structuralScope(planText);
  const classified = structuralLineModel(lines);
  const text = lines.join('\n');
  const stepsSections = headingSections(lines, /^Steps\s*$/);
  const stepsTables = stepsSections.flatMap((section) => tablesInSection(section, '#'));
  const acceptanceSection = headingSections(lines, /^Acceptance criteria\s*$/)[0] ?? [];
  const stepsTable = stepsTables[0] ?? null;
  const acceptanceHeader = tableInSection(acceptanceSection, 'ID');
  const acceptanceRows = acceptanceSection
    .map((line, index) => ({ cells: /^\s*\|/.test(line) ? markdownCells(line) : [], line, index }))
    .filter((row) => /^[A-Z]\d{1,3}[a-z]?$/.test(cleanCell(row.cells[0] ?? '')));
  const acceptanceTable = acceptanceHeader === null ? null : { ...acceptanceHeader, rows: acceptanceRows };
  const steps = stepsTables.flatMap(
    (table) =>
      table.rows
        .filter((row) => /^\d{1,3}$/.test(cleanCell(row.cells[0] ?? '')))
        .map((row) => ({ ...row, id: cleanCell(row.cells[0]), cells: row.cells })),
  );
  const acceptance = acceptanceRows.map((row) => ({
    ...row,
    id: cleanCell(row.cells[0]),
    cells: row.cells,
  }));
  const committedSections = headingSections(lines, /\{measurement:committed\}\s*$/);
  const producerSections = [
    ...headingSections(lines, /\{measurement:committed\}\s*$/).map((section) => ({
      className: 'committed',
      lines: section,
    })),
    ...headingSections(lines, /\{measurement:snapshot\}\s*$/).map((section) => ({
      className: 'snapshot',
      lines: section,
    })),
  ];
  const bindsTables = [];
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*\|/.test(lines[index])) continue;
    const first = cleanCell(markdownCells(lines[index])[0] ?? '').toLowerCase();
    if (!['binds', 'binding'].includes(first)) continue;
    const table = tableInSection(lines.slice(index), first);
    if (table !== null) bindsTables.push(table);
  }
  const recordLine = lines.find((line) => line.startsWith('Plan-run: '));
  const record = recordLine === undefined ? null : JSON.parse(recordLine.slice('Plan-run: '.length));
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(planText)?.[1] ?? '';
  const status = /^status:\s*(\S+)\s*$/m.exec(frontmatter)?.[1] ?? null;
  return {
    acceptance,
    acceptanceTable,
    bindsTables,
    classified,
    committedSections,
    fencedLines: classified.filter((line) => line.kind === 'fenced').map((line) => line.raw),
    lines,
    producerLines: classified.filter((line) => line.kind === 'producer').map((line) => line.raw),
    producerSections,
    proseLines: classified.filter((line) => line.kind === 'prose').map((line) => line.raw),
    record,
    status,
    steps,
    stepsTable,
    stepsTables,
    tableLines: classified.filter((line) => line.kind === 'table').map((line) => line.raw),
    text,
  };
}

const structuralRule = (id, check) => Object.freeze({ id, check });

export const STRUCTURAL_RULES = Object.freeze([
  structuralRule('R1', (context, fire) => {
    const labels = new Set(
      context.committedSections.flatMap((section) => {
        const table = tableInSection(section, 'Enforced quantity');
        return table?.rows.map((row) => row.cells[0].trim()) ?? [];
      }),
    );
    if (labels.size === 0) return;
    const prose = context.proseLines.join('\n');
    for (const match of prose.matchAll(/\b(?:committed-producer|enforced-quantity)\s+row\s+"([^"]+)"/gi)) {
      if (!labels.has(match[1])) fire(`quoted row label ${JSON.stringify(match[1])} is not enforced`);
    }
  }),
  structuralRule('R2', (context, fire) => {
    const commandColumn = context.acceptanceTable?.headers.indexOf('command') ?? -1;
    const expectedColumn = context.acceptanceTable?.headers.indexOf('expected') ?? -1;
    if (commandColumn < 0) return;
    for (const row of context.acceptance) {
      const command = row.cells[commandColumn] ?? '';
      const expected = row.cells[expectedColumn] ?? '';
      if (runnableAcceptanceCommand(command)) continue;
      if (/\bnon-command observable\b|\bobservable:\s*\S/i.test(`${command} ${expected}`)) continue;
      fire(`${row.id} is neither runnable nor declares a non-command observable`);
    }
  }),
  structuralRule('R3', (context, fire) => {
    for (const section of context.committedSections) {
      const table = tableInSection(section, 'Enforced quantity');
      if (table === null) continue;
      const producers = structuralLineModel(section)
        .filter((line) => line.kind === 'producer' && producerOutputCommandPattern.test(line.raw.trim()))
        .map((line) => ({ index: line.index }));
      const quantities = table.rows.length;
      if (producers.length !== quantities) {
        fire(`${producers.length} producer(s) do not map 1:1 to ${quantities} enforced quantity row(s)`);
      } else if (producers.some((producer) => producer.index >= table.headerIndex)) {
        fire('producer commands and enforced quantities are not in producer-first order');
      }
    }
  }),
  structuralRule('R4', (context, fire) => {
    for (const match of context.text.matchAll(/__[A-Z][A-Z0-9_]*__/g)) {
      fire(`unsubstituted placeholder ${match[0]}`);
    }
  }),
  structuralRule('R5', (context, fire) => {
    for (const line of context.producerLines) {
      for (const match of line.matchAll(/\b[0-9a-f]{40}\b/gi)) {
        fire(`producer uses commit literal ${match[0]}`);
      }
    }
  }),
  structuralRule('R6', (context, fire) => {
    if (context.acceptanceTable === null) return;
    const rowIds = new Set(context.acceptance.map((row) => row.id));
    const prose = context.proseLines.join('\n');
    for (const id of new Set([...prose.matchAll(/\b(A\d{1,3}[a-z]?)\b/g)].map((match) => match[1]))) {
      if (!rowIds.has(id)) fire(`prose names ${id}, which is not an acceptance row`);
    }
  }),
  structuralRule('R7', (context, fire) => {
    // STATUS_MODES already decides whether findings fail. Testing status inside a rule suppresses
    // the report instead, allowing an archived plan with a vanished active path to report clean.
    for (const line of context.producerLines) {
      for (const match of line.matchAll(/docs\/plans\/active\/[A-Za-z0-9._-]+\.md/g)) {
        const prefix = line.slice(0, match.index);
        if (/(?:\S*:\/\/\S*|[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+:)$/.test(prefix)) continue;
        if (!fs.existsSync(path.resolve(process.cwd(), match[0]))) fire(`unresolved active path ${match[0]}`);
      }
    }
  }),
  structuralRule('R8', (context, fire) => {
    if (context.producerSections.length === 0) return;
    const derived = new Set(
      [...context.text.matchAll(/(?:^|[\s;])([A-Z_][A-Z0-9_]*)=/gm)].map((match) => match[1]),
    );
    const cited = new Set(
      context.producerSections.flatMap((section) =>
        [...section.lines.join('\n').matchAll(/\$(?:\{([A-Z_][A-Z0-9_]*)\}|([A-Z_][A-Z0-9_]*))/g)].map(
          (match) => match[1] ?? match[2],
        ),
      ),
    );
    for (const variable of cited) if (!derived.has(variable)) fire(`producer cites $${variable} without deriving it`);
  }),
  structuralRule('R9', (context, fire) => {
    if (context.bindsTables.length === 0) return;
    const counts = new Map(context.acceptance.map((row) => [row.id, 0]));
    for (const table of context.bindsTables) {
      const rowsColumn = table.headers.indexOf('rows');
      if (rowsColumn < 0) {
        fire('binds table has no Rows column');
        continue;
      }
      for (const row of table.rows) {
        for (const id of row.cells[rowsColumn]?.match(/[A-Z]\d{1,3}[a-z]?/g) ?? []) {
          if (!counts.has(id)) fire(`binds table names unknown acceptance row ${id}`);
          else counts.set(id, counts.get(id) + 1);
        }
      }
    }
    for (const [id, count] of counts) if (count !== 1) fire(`${id} appears ${count} times in the binds partition`);
  }),
  structuralRule('R10', (context, fire) => {
    if (context.stepsTables.length === 0) return;
    const stepIds = new Set(context.steps.map((row) => row.id));
    const prose = context.proseLines.join('\n');
    for (const id of new Set([...prose.matchAll(/\bstep (\d{1,3})\b/gi)].map((match) => match[1]))) {
      if (!stepIds.has(id)) fire(`prose names step ${id}, which is not a Steps row`);
    }
  }),
  structuralRule('R11', (context, fire) => {
    if (context.bindsTables.length === 0) return;
    const values = new Set(
      context.bindsTables.flatMap((table) => table.rows.map((row) => cleanCell(row.cells[0] ?? ''))),
    );
    const prose = context.proseLines.join('\n');
    for (const match of prose.matchAll(/\bbinds:\s*`?([a-z][a-z0-9_-]*)`?/gi)) {
      if (!values.has(match[1])) fire(`prose names binds: ${match[1]}, which is absent from the binds table`);
    }
  }),
  structuralRule('R12', (context, fire) => {
    const commandColumn = context.acceptanceTable?.headers.indexOf('command') ?? -1;
    if (commandColumn < 0 || context.steps.length === 0) return;
    const stepsText = context.steps.map((row) => row.cells.join(' ')).join('\n');
    for (const row of context.acceptance) {
      const command = row.cells[commandColumn] ?? '';
      for (const subcommand of acceptanceSubcommands(command)) {
        if (!new RegExp(`\\b${subcommand}\\b`).test(stepsText)) {
          fire(`${row.id} invokes subcommand ${subcommand}, which no step names`);
        }
      }
    }
  }),
  structuralRule('R13', (context, fire) => {
    if (context.record === null) return;
    for (const line of context.producerLines) {
      const match = /^P=(\S+)/.exec(line.trim());
      if (match !== null && match[1] !== context.record.plan_path) {
        fire(`producer P=${match[1]} but plan_path is ${context.record.plan_path}`);
      }
    }
  }),
  structuralRule('R14', (context, fire) => {
    if (context.record === null) return;
    const repositoryId = context.record.repository_id;
    if (/[/\\]/.test(repositoryId) && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repositoryId)) {
      fire(`repository_id ${repositoryId} is shaped like a filesystem path`);
    }
  }),
  structuralRule('R15', (context, fire) => {
    const words = Object.keys(NUMBER_WORDS).join('|');
    const countPattern = new RegExp(`\\b(${words})\\s+subcommands?\\b`, 'i');
    for (const table of context.stepsTables) {
      const taskColumn = table.headers.indexOf('task');
      if (taskColumn < 0) continue;
      for (const row of table.rows.filter((candidate) => /^\d{1,3}$/.test(cleanCell(candidate.cells[0] ?? '')))) {
        const task = row.cells[taskColumn] ?? '';
        const count = countPattern.exec(task);
        if (count === null) continue;
        const names = namedSubcommands(task, count.index + count[0].length);
        if (names.length !== NUMBER_WORDS[count[1].toLowerCase()]) {
          fire(`step ${cleanCell(row.cells[0])} says ${count[1]} but names ${names.length} subcommands`);
        }
      }
    }
  }),
  structuralRule('R16', (context, fire) => {
    for (const table of context.stepsTables) {
      const steps = table.rows
        .filter((row) => /^\d{1,3}$/.test(cleanCell(row.cells[0] ?? '')))
        .map((row) => cleanCell(row.cells[0]));
      for (let index = 1; index < steps.length; index++) {
        if (!(Number(steps[index]) > Number(steps[index - 1]))) {
          fire(`Steps row ${steps[index]} does not increase after ${steps[index - 1]}`);
        }
      }
    }
  }),
  structuralRule('R17', (context, fire) => {
    for (let index = 1; index < context.acceptance.length; index++) {
      const current = Number(context.acceptance[index].id.match(/\d+/)?.[0]);
      const prior = Number(context.acceptance[index - 1].id.match(/\d+/)?.[0]);
      if (!(current > prior)) fire(`acceptance id ${context.acceptance[index].id} does not increase after ${context.acceptance[index - 1].id}`);
    }
  }),
  structuralRule('R18', (context, fire) => {
    const stepColumn = context.acceptanceTable?.headers.indexOf('step') ?? -1;
    if (stepColumn < 0) return;
    const stepIds = new Set(context.steps.map((row) => row.id));
    for (const row of context.acceptance) {
      const named = row.cells[stepColumn]?.match(/\d+/g) ?? [];
      if (named.length === 0) fire(`${row.id} names no step`);
      else if (named.length > 1) fire(`${row.id} names more than one step: ${named.join(', ')}`);
      else if (!stepIds.has(named[0])) fire(`${row.id} names unknown step ${named[0]}`);
    }
  }),
]);

export function structuralPlanRules(planText, rules = STRUCTURAL_RULES) {
  const context = structuralContext(planText);
  const findings = [];
  for (const rule of rules) {
    rule.check(context, (detail) => findings.push({ rule: rule.id, detail }));
  }
  return findings;
}

export function buildPrompt(planText, { hunt = false } = {}) {
  if (hunt) {
    return [
      'Find every defect you can in this engineering plan. There is no rubric and no score.',
      'Report each defect with its location, why it is wrong, and the evidence that establishes that.',
      'Judge nothing against a checklist: the point of this pass is to find what a checklist would miss.',
      '',
      '--- PLAN ---',
      planText,
    ].join('\n');
  }
  const units = enumerateUnits(planText);
  const out = [
    'Judge this engineering plan against a closed property rubric. Return one verdict per judged item.',
    `Verdicts: ${[...VERDICTS].join(', ')}. Absence of the required evidence is "unverified", never "pass".`,
    '"not_applicable" requires a reason. Do NOT return a score, a rating, or an overall assessment.',
    '',
    'UNIT-SCOPED properties are judged once per listed unit. Return one verdict per (property, unit) pair.',
  ];
  for (const p of unitAsked()) {
    const set = p.scope.slice('unit:'.length);
    out.push(`\n${p.id} [${p.mandatory ? 'MANDATORY' : 'optional'}] over ${set}: ${p.statement}`);
    out.push(`   Evidence required: ${p.evidence}`);
    out.push(`   Units: ${(units[set] ?? []).map((u) => u.id).join(', ') || '(none enumerated)'}`);
  }
  out.push('', 'DOCUMENT-SCOPED properties are judged once for the whole plan.');
  for (const p of docAsked()) out.push(`\n${p.id} [MANDATORY] ${p.statement}\n   Evidence required: ${p.evidence}`);
  out.push('', 'For every failing item, supply replaced_text (the exact existing bytes, appearing exactly once)');
  out.push('and replacement_text (the exact bytes to substitute). Prefix replacement_text with DELETE: to remove.');
  out.push('', '--- PLAN ---', planText);
  return out.join('\n');
}

/** Every way a return can be incoherent enough that acting on it would mislead. */
export function validateReturn(result, planText) {
  const problems = [];
  if (result.score !== undefined || result.axes !== undefined) {
    problems.push(
      'return carries a score or axes: this protocol has no scalar, and a threshold on one was measured to be a coin',
    );
  }
  const units = enumerateUnits(planText);
  const keys = new Set(unitKeys(units));
  const sections = sectionDigests(planText);
  const byProp = new Map(RUBRIC.properties.map((p) => [p.id, p]));
  const seen = new Set();

  for (const v of result.verdicts ?? []) {
    const p = byProp.get(v.property ?? v.id);
    if (!p) {
      problems.push(`unknown property ${v.property ?? v.id}`);
      continue;
    }
    if (p.checked_by === 'script') {
      problems.push(`${p.id} is decided by script; a model verdict for it is not accepted`);
      continue;
    }
    if (!VERDICTS.has(v.verdict)) problems.push(`${p.id}: unknown verdict ${v.verdict}`);
    if (v.verdict === 'not_applicable' && !(v.reason ?? '').trim()) {
      problems.push(`${p.id}${v.unit ? ` ${v.unit}` : ''}: not_applicable requires a reason`);
    }
    if (p.scope.startsWith('unit:')) {
      const key = v.unit?.includes(':') ? v.unit : `${p.scope.slice(5)}:${v.unit}`;
      if (!v.unit) problems.push(`${p.id} is unit-scoped but no unit was named`);
      else if (!keys.has(key)) problems.push(`${p.id}: ${key} is not an enumerated unit`);
      else seen.add(`${p.id}|${key}`);
    } else seen.add(`${p.id}|`);
    if (v.verdict === 'fail' && v.replaced_text !== undefined) {
      const hits = planText.split(v.replaced_text).length - 1;
      if (hits !== 1) {
        problems.push(
          `${p.id}${v.unit ? ` ${v.unit}` : ''}: replaced_text matches ${hits} times, must be exactly 1 (${hits === 0 ? 'stale quote' : 'ambiguous'})`,
        );
      }
    }
  }
  for (const p of unitAsked()) {
    for (const u of units[p.scope.slice(5)] ?? []) {
      if (!seen.has(`${p.id}|${p.scope.slice(5)}:${u.id}`)) problems.push(`${p.id} was not judged for unit ${u.id}`);
    }
  }
  for (const p of docAsked()) if (!seen.has(`${p.id}|`)) problems.push(`${p.id} was not judged`);
  // An entry with no note blocks the gate permanently while naming no work to do.
  for (const h of result.hunt ?? []) {
    if (!(h.note ?? '').trim()) {
      problems.push(`hunt ${h.id ?? '?'}: empty note - an entry naming no defect cannot be triaged`);
    }
  }
  for (const a of result.approvals ?? []) {
    if (!Object.hasOwn(sections, a.section)) problems.push(`approval names unknown section ${a.section}`);
    else if (sections[a.section] !== a.sha256)
      problems.push(`approval ${a.section} digest does not match the reviewed text`);
  }
  return problems;
}

/**
 * An approval survives only while everything it depended on is unchanged. Keying on section bytes
 * alone was measured insufficient: one round re-scored eight byte-identical sections because
 * evidence appeared ELSEWHERE in the document, which is a dependency change, not a section change.
 */
export function liveDependencies(planText, { repo = process.cwd(), probes = [] } = {}) {
  const deps = { sections: sectionDigests(planText) };
  try {
    deps.repository_head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  } catch {
    deps.repository_head = null;
  }
  deps.probes = Object.fromEntries(
    probes.map((p) => {
      const abs = path.resolve(repo, p);
      return [p, fs.existsSync(abs) ? digest(fs.readFileSync(abs, 'utf8')) : null];
    }),
  );
  return deps;
}

export function carryForward(ledger, planText, opts = {}) {
  const live = liveDependencies(planText, opts);
  const kept = [];
  const expired = [];
  for (const a of ledger.approvals ?? []) {
    const sectionOk = live.sections[a.section] === a.sha256;
    const headOk = a.deps?.repository_head === undefined || a.deps.repository_head === live.repository_head;
    const probesOk = Object.entries(a.deps?.probes ?? {}).every(([k, v]) => live.probes[k] === v);
    (sectionOk && headOk && probesOk ? kept : expired).push(a.section);
  }
  return { kept, expired, live };
}

/**
 * A verdict is bound to the bytes it judged. Without that, a ledger from an earlier revision can
 * clear a gate on a document it never saw - the same staleness that made byte-keyed approvals
 * necessary, applied one level down to individual unit verdicts.
 */
/**
 * `reviewer` is an opaque caller-supplied label. The tool never learns or names a vendor: policy
 * about WHO should judge belongs in the protocol document, because a consumer with one provider
 * configured must still be able to clear this gate. Recording the label is what makes "judged by
 * someone other than the author" a checkable claim rather than an assertion about a dispatch that
 * happened outside the tool.
 */
export function mergeLedger(ledger, result, planText, { reviewer = null } = {}) {
  const sections = sectionDigests(planText);
  const unitDigest = new Map(
    Object.entries(enumerateUnits(planText)).flatMap(([set, list]) => list.map((u) => [`${set}:${u.id}`, u.sha256])),
  );
  const next = {
    schema: 'PlanReviewLedgerV1',
    rubric_version: RUBRIC.rubric_version,
    plan_path: ledger.plan_path ?? null,
    units: { ...(ledger.units ?? {}) },
    hunt: [...(ledger.hunt ?? [])],
    approvals: [...(result.approvals ?? ledger.approvals ?? [])],
  };
  for (const v of result.verdicts ?? []) {
    const p = RUBRIC.properties.find((x) => x.id === (v.property ?? v.id));
    if (!p) continue;
    const key = p.scope.startsWith('unit:')
      ? `${p.id}|${v.unit?.includes(':') ? v.unit : `${p.scope.slice(5)}:${v.unit}`}`
      : `${p.id}|document`;
    const prior = next.units[key];
    const unitPart = key.split('|')[1];
    next.units[key] = {
      property: p.id,
      mandatory: Boolean(p.mandatory),
      gates: Boolean(p.gates),
      verdict: v.verdict,
      reason: v.reason ?? null,
      reviewer: reviewer ?? v.reviewer ?? null,
      // Document-scoped properties genuinely depend on the whole plan, so they bind the section map.
      unit_sha256: unitPart === 'document' ? null : (unitDigest.get(unitPart) ?? null),
      document_sha256: unitPart === 'document' ? digest(JSON.stringify(sections)) : null,
      waiver: prior?.waiver ?? null,
    };
  }
  for (const h of result.hunt ?? []) {
    if (!next.hunt.some((x) => x.note === h.note)) {
      next.hunt.push({ ...h, state: h.state ?? 'untriaged', reviewer: reviewer ?? h.reviewer ?? null });
    }
  }
  return next;
}

export function gate(ledger, planText, opts = {}) {
  const blocking = [];
  const units = enumerateUnits(planText);
  const liveSections = sectionDigests(planText);
  const liveDigests = new Map(
    Object.entries(units).flatMap(([set, list]) => list.map((u) => [`${set}:${u.id}`, u.sha256])),
  );
  const keys = new Set(unitKeys(units));
  const scripted = new Set(RUBRIC.properties.filter((p) => p.checked_by === 'script').map((p) => p.id));
  for (const [key, u] of Object.entries(ledger.units ?? {})) {
    if (!u.gates || !u.mandatory) continue;
    // A script-checked property is recomputed below from the live document, so a carried verdict
    // for it is never authoritative and must not be reported stale.
    if (scripted.has(u.property)) continue;
    const unitPart = key.split('|')[1];
    if (unitPart !== 'document' && !keys.has(unitPart)) continue; // unit no longer exists
    const liveUnit = unitPart === 'document' ? digest(JSON.stringify(liveSections)) : liveDigests.get(unitPart);
    const judged = u.unit_sha256 ?? u.document_sha256;
    if (judged && liveUnit !== judged) {
      blocking.push(`${key}: judged against ${judged}, now ${liveUnit ?? 'absent'} - re-judge`);
      continue;
    }
    if (u.verdict === 'pass' || u.verdict === 'not_applicable') continue;
    if (u.waiver) continue;
    blocking.push(`${key}: ${u.verdict}${u.reason ? ` - ${u.reason.slice(0, 90)}` : ''}`);
  }
  for (const p of unitScoped().filter((x) => x.mandatory)) {
    for (const u of units[p.scope.slice(5)] ?? []) {
      if (!Object.hasOwn(ledger.units ?? {}, `${p.id}|${p.scope.slice(5)}:${u.id}`)) {
        blocking.push(`${p.id}|${p.scope.slice(5)}:${u.id}: never judged`);
      }
    }
  }
  const auto = scriptChecks(planText);
  for (const p of docScoped().filter((x) => x.mandatory)) {
    if (p.checked_by === 'script') {
      const res = auto[p.id];
      if (res && res.verdict !== 'pass' && !ledger.units?.[`${p.id}|document`]?.waiver) {
        blocking.push(`${p.id}|document: ${res.verdict} - ${res.reason}`);
      }
      continue;
    }
    if (!Object.hasOwn(ledger.units ?? {}, `${p.id}|document`)) blocking.push(`${p.id}|document: never judged`);
  }
  for (const h of ledger.hunt ?? []) {
    if (h.state === 'untriaged') blocking.push(`hunt ${h.id ?? '?'}: untriaged`);
    else if (['critical', 'high'].includes(h.severity) && !['resolved', 'waived'].includes(h.state)) {
      blocking.push(`hunt ${h.id ?? '?'}: ${h.severity} and ${h.state}`);
    }
  }
  // A probe a cold implementer cannot run is not evidence. This check exists because a real plan
  // cited a probe suite living outside the repository, and eleven rounds of prose review never
  // noticed; the property rubric refused it on the first pass.
  for (const p of ledger.probes ?? []) {
    if (path.isAbsolute(p) || p.startsWith('~')) blocking.push(`probe ${p}: not repository-relative`);
    else if (!fs.existsSync(path.resolve(opts.repo ?? process.cwd(), p))) blocking.push(`probe ${p}: missing`);
  }
  const reviewers = {};
  for (const u of Object.values(ledger.units ?? {})) {
    if (u.verdict === 'pass')
      reviewers[u.reviewer ?? '(unlabelled)'] = (reviewers[u.reviewer ?? '(unlabelled)'] ?? 0) + 1;
  }
  return { clear: blocking.length === 0, blocking, reviewers };
}

export function applyFixes(result, planText) {
  let text = planText;
  const applied = [];
  const order =
    result.apply_order ?? (result.verdicts ?? []).filter((v) => v.replaced_text).map((v, i) => v.id ?? String(i));
  const find = (id) => (result.verdicts ?? []).find((v, i) => (v.id ?? String(i)) === id);
  for (const id of order) {
    const v = find(id);
    if (!v?.replaced_text) continue;
    const hits = text.split(v.replaced_text).length - 1;
    if (hits !== 1)
      throw new Error(
        `${id}: replaced_text matches ${hits} times after ${applied.length} earlier fixes, expected exactly 1`,
      );
    const del = /^DELETE\b/.test((v.replacement_text ?? '').trim());
    const next = del ? '' : v.replacement_text;
    text = text.replace(v.replaced_text, () => next);
    applied.push(`${id} (${del ? 'deleted' : 'replaced'} ${v.replaced_text.split('\n').length} line(s))`);
  }
  return { text, applied };
}

function markdownFilesIn(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
    }
  };
  visit(directory);
  return files.sort();
}

const COMMANDS = {
  units({ rest, read }) {
    if (!rest[0]) return null;
    const units = enumerateUnits(read(rest[0]));
    for (const [set, list] of Object.entries(units)) {
      process.stdout.write(`${set} (${list.length})\n`);
      for (const unit of list) {
        process.stdout.write(`  ${unit.id.padEnd(34)} line ${String(unit.line).padStart(4)}  ${unit.label}\n`);
      }
    }
    return 0;
  },
  check({ rest, read }) {
    if (!rest[0]) return null;
    const planText = read(rest[0]);
    const checks = scriptChecks(planText);
    let bad = 0;
    for (const [id, result] of Object.entries(checks)) {
      if (result.verdict !== 'pass') bad++;
      process.stdout.write(`${id} ${result.verdict.padEnd(11)} ${result.reason}\n`);
    }
    try {
      for (const result of checkPlanMeasurements(planText)) {
        if (result.className === 'snapshot') {
          process.stdout.write(`MEASUREMENT snapshot reported ${result.heading}; producer=${result.producer}\n`);
        } else {
          if (result.verdict !== 'pass') bad++;
          process.stdout.write(
            `MEASUREMENT committed ${result.verdict.padEnd(8)} ${result.claim}: ${result.reason}\n`,
          );
        }
      }
    } catch (error) {
      bad++;
      process.stdout.write(`MEASUREMENT committed fail     ${error.message}\n`);
    }
    const falsifiability = verifyFalsifiabilityProofs(planText);
    process.stdout.write(
      `FALSIFIABILITY ${falsifiability.mode} ${falsifiability.proven}/${falsifiability.rows.length} proven, ` +
        `${falsifiability.unproven} unproven\n`,
    );
    if (!falsifiability.clear) {
      bad++;
      for (const row of falsifiability.rows.filter((candidate) => !candidate.proven)) {
        process.stdout.write(`  ${row.row_id} unproven: ${row.drifted_keys.join(', ')}\n`);
      }
    }
    return bad ? 1 : 0;
  },
  rules({ rest, read }) {
    if (!rest[0]) return null;
    if (fs.statSync(rest[0]).isDirectory()) {
      const files = markdownFilesIn(rest[0]);
      let findingsCount = 0;
      let unclassified = 0;
      for (const file of files) {
        try {
          const planText = fs.readFileSync(file, 'utf8');
          const findings = structuralPlanRules(planText);
          findingsCount += findings.length;
          process.stdout.write(
            `RULES-PLAN ${path.relative(process.cwd(), file)} report-only ${STRUCTURAL_RULES.length} checked, ${findings.length} finding(s)\n`,
          );
          for (const finding of findings) {
            process.stdout.write(`${finding.rule} fail ${path.relative(process.cwd(), file)}: ${finding.detail}\n`);
          }
        } catch (error) {
          unclassified++;
          process.stdout.write(
            `RULES-PLAN ${path.relative(process.cwd(), file)} unclassified ${error instanceof Error ? error.message : String(error)}\n`,
          );
        }
      }
      process.stdout.write(
        `RULES-DIRECTORY plans=${files.length} rules=${STRUCTURAL_RULES.length} findings=${findingsCount} unclassified=${unclassified}\n`,
      );
      return 0;
    }
    const planText = read(rest[0]);
    const mode = statusMode(planRecord(planText).status);
    const findings = structuralPlanRules(planText);
    process.stdout.write(`RULES ${mode} ${STRUCTURAL_RULES.length} checked, ${findings.length} finding(s)\n`);
    for (const finding of findings) process.stdout.write(`${finding.rule} fail ${finding.detail}\n`);
    return mode === 'enforcing' && findings.length > 0 ? 1 : 0;
  },
  report({ rest, read }) {
    if (!rest[0]) return null;
    const report = acceptanceProofReport(read(rest[0]));
    for (const row of report.rows) {
      process.stdout.write(
        `PROOF ${row.row_id} ${row.proven ? 'proven' : 'unproven'} mode=${report.mode} ` +
          `drifted=${row.drifted_keys.join(',') || '-'}\n`,
      );
    }
    return 0;
  },
  coverage({ rest }) {
    if (!rest[0]) return null;
    const files = markdownFilesIn(rest[0]);
    let rows = 0;
    let proven = 0;
    let errors = 0;
    for (const file of files.sort()) {
      const planText = fs.readFileSync(file, 'utf8');
      try {
        const report = acceptanceProofReport(planText);
        rows += report.rows.length;
        proven += report.proven;
      } catch {
        rows += acceptanceRows(planText).length;
        errors++;
      }
    }
    process.stdout.write(
      `COVERAGE plans=${files.length} rows=${rows} proven=${proven} unproven=${rows - proven} unclassified=${errors}\n`,
    );
    return 0;
  },
  sections({ rest, read }) {
    if (!rest[0]) return null;
    for (const [id, sha] of Object.entries(sectionDigests(read(rest[0]), { strict: true }))) {
      process.stdout.write(`${id.padEnd(34)} ${sha}\n`);
    }
    return 0;
  },
  prompt({ rest, read }) {
    if (!rest[0]) return null;
    process.stdout.write(`${buildPrompt(read(rest[0]), { hunt: rest.includes('--hunt') })}\n`);
    return 0;
  },
  validate({ rest, read, json }) {
    if (!rest[1]) return null;
    const problems = validateReturn(json(rest[0]), read(rest[1]));
    if (!problems.length) {
      process.stdout.write('return is coherent\n');
      return 0;
    }
    for (const problem of problems) process.stdout.write(`REFUSED: ${problem}\n`);
    return 1;
  },
  ledger({ rest, read, json, flag }) {
    if (!rest[2]) return null;
    const merged = mergeLedger(fs.existsSync(rest[1]) ? json(rest[1]) : {}, json(rest[0]), read(rest[2]), {
      reviewer: flag('reviewer'),
    });
    fs.writeFileSync(rest[1], `${JSON.stringify(merged, null, 2)}\n`);
    const { kept, expired } = carryForward(merged, read(rest[2]));
    process.stdout.write(
      `ledger: ${Object.keys(merged.units).length} judged item(s), ${merged.hunt.length} hunt entr(ies)\n`,
    );
    process.stdout.write(
      `approvals kept ${kept.length}, expired ${expired.length}${expired.length ? ` (${expired.join(', ')})` : ''}\n`,
    );
    return 0;
  },
  waive({ rest, json, flag }) {
    if (!rest[2]) return null;
    const reason = flag('reason');
    const by = flag('by');
    if (!reason || !by) {
      process.stderr.write('waive requires --reason <text> and --by <who>\n');
      return 2;
    }
    const ledger = json(rest[0]);
    const key = rest[1].includes('|') ? rest[1] : `${rest[2]}|${rest[1]}`;
    if (!ledger.units?.[key]) {
      process.stderr.write(`no judged item ${key}\n`);
      return 2;
    }
    ledger.units[key].waiver = { reason, by, at: new Date().toISOString() };
    fs.writeFileSync(rest[0], `${JSON.stringify(ledger, null, 2)}\n`);
    process.stdout.write(`waived ${key}\n`);
    return 0;
  },
  gate({ rest, read, json }) {
    if (!rest[1]) return null;
    const { clear, blocking, reviewers } = gate(json(rest[0]), read(rest[1]));
    const labels = Object.entries(reviewers);
    if (labels.length) {
      process.stdout.write(
        `passing units by reviewer: ${labels.map(([key, value]) => `${key}=${value}`).join(', ')}\n`,
      );
      if (labels.length === 1) {
        process.stdout.write(
          '  note: every passing unit was judged by one reviewer; see the protocol on judge independence\n',
        );
      }
    }
    if (clear) {
      process.stdout.write('GATE CLEAR - every gating unit passes, is waived, or is not applicable\n');
      return 0;
    }
    process.stdout.write(`GATE BLOCKED - ${blocking.length} item(s):\n`);
    for (const item of blocking) process.stdout.write(`  ${item}\n`);
    return 1;
  },
  apply({ rest, read, json }) {
    if (!rest[1]) return null;
    const result = json(rest[0]);
    const planText = read(rest[1]);
    const problems = validateReturn(result, planText);
    if (problems.length) {
      for (const problem of problems) process.stdout.write(`REFUSED: ${problem}\n`);
      return 1;
    }
    const { text, applied } = applyFixes(result, planText);
    for (const line of applied) process.stdout.write(`  ${line}\n`);
    if (!rest.includes('--commit')) {
      process.stdout.write(`DRY RUN - ${applied.length} fix(es) apply cleanly, plan untouched.\n`);
      return 0;
    }
    fs.writeFileSync(rest[1], text);
    process.stdout.write(`APPLIED ${applied.length} fix(es) to ${rest[1]}\n`);
    return 0;
  },
};

function main() {
  const [op, ...rest] = process.argv.slice(2);
  const read = (file) => fs.readFileSync(file, 'utf8');
  const json = (file) => JSON.parse(read(file));
  const flag = (name) => {
    const index = rest.indexOf(`--${name}`);
    return index < 0 ? null : rest[index + 1];
  };
  const command = COMMANDS[op];
  if (!command) {
    process.stderr.write(
      `usage: plan-self-check.mjs ${Object.keys(COMMANDS).join('|')} <args>\n`,
    );
    return 2;
  }
  try {
    const result = command({ rest, read, json, flag });
    if (result !== null) return result;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  process.stderr.write(`usage: plan-self-check.mjs ${Object.keys(COMMANDS).join('|')} <args>\n`);
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
