#!/usr/bin/env node

// plan-review.mjs - bookkeeping for a unit-gated plan review. It judges nothing.
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
//   plan-review.mjs units    <plan.md>
//   plan-review.mjs check    <plan.md>            run the deterministic script-checked properties
//   plan-review.mjs sections <plan.md>
//   plan-review.mjs prompt   <plan.md> [--hunt]
//   plan-review.mjs validate <result.json> <plan.md>
//   plan-review.mjs ledger   <result.json> <ledger.json> <plan.md> [--reviewer <label>]
//   plan-review.mjs waive    <ledger.json> <unit-key> <property> --reason <text> --by <who>
//   plan-review.mjs gate     <ledger.json> <plan.md>
//   plan-review.mjs apply    <result.json> <plan.md> [--commit]
//
// Exit 0 on success or a clear gate, 1 on a refusal or a blocked gate, 2 on usage error.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const RUBRIC = JSON.parse(fs.readFileSync(path.join(HERE, 'plan-properties.json'), 'utf8'));
const VERDICTS = new Set(RUBRIC.gate.verdicts);
const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

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

function main() {
  const [op, ...rest] = process.argv.slice(2);
  const read = (f) => fs.readFileSync(f, 'utf8');
  const json = (f) => JSON.parse(read(f));
  const flag = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i < 0 ? null : rest[i + 1];
  };
  try {
    if (op === 'units' && rest[0]) {
      const u = enumerateUnits(read(rest[0]));
      for (const [set, list] of Object.entries(u)) {
        process.stdout.write(`${set} (${list.length})\n`);
        for (const x of list)
          process.stdout.write(`  ${x.id.padEnd(34)} line ${String(x.line).padStart(4)}  ${x.label}\n`);
      }
      return 0;
    }
    if (op === 'check' && rest[0]) {
      const res = scriptChecks(read(rest[0]));
      let bad = 0;
      for (const [id, v] of Object.entries(res)) {
        if (v.verdict !== 'pass') bad++;
        process.stdout.write(`${id} ${v.verdict.padEnd(11)} ${v.reason}\n`);
      }
      return bad ? 1 : 0;
    }
    if (op === 'sections' && rest[0]) {
      for (const [id, sha] of Object.entries(sectionDigests(read(rest[0]), { strict: true }))) {
        process.stdout.write(`${id.padEnd(34)} ${sha}\n`);
      }
      return 0;
    }
    if (op === 'prompt' && rest[0]) {
      process.stdout.write(`${buildPrompt(read(rest[0]), { hunt: rest.includes('--hunt') })}\n`);
      return 0;
    }
    if (op === 'validate' && rest[1]) {
      const problems = validateReturn(json(rest[0]), read(rest[1]));
      if (!problems.length) {
        process.stdout.write('return is coherent\n');
        return 0;
      }
      for (const p of problems) process.stdout.write(`REFUSED: ${p}\n`);
      return 1;
    }
    if (op === 'ledger' && rest[2]) {
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
    }
    if (op === 'waive' && rest[2]) {
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
    }
    if (op === 'gate' && rest[1]) {
      const { clear, blocking, reviewers } = gate(json(rest[0]), read(rest[1]));
      const labels = Object.entries(reviewers);
      if (labels.length) {
        process.stdout.write(`passing units by reviewer: ${labels.map(([k, v]) => `${k}=${v}`).join(', ')}\n`);
        if (labels.length === 1) {
          process.stdout.write(
            `  note: every passing unit was judged by one reviewer; see the protocol on judge independence\n`,
          );
        }
      }
      if (clear) {
        process.stdout.write('GATE CLEAR - every gating unit passes, is waived, or is not applicable\n');
        return 0;
      }
      process.stdout.write(`GATE BLOCKED - ${blocking.length} item(s):\n`);
      for (const b of blocking) process.stdout.write(`  ${b}\n`);
      return 1;
    }
    if (op === 'apply' && rest[1]) {
      const result = json(rest[0]);
      const planText = read(rest[1]);
      const problems = validateReturn(result, planText);
      if (problems.length) {
        for (const p of problems) process.stdout.write(`REFUSED: ${p}\n`);
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
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  process.stderr.write('usage: plan-review.mjs units|check|sections|prompt|validate|ledger|waive|gate|apply <args>\n');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
