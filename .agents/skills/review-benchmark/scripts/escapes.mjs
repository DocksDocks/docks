#!/usr/bin/env node
// Freeze source data once; draw only from that snapshot. Restricted files never belong in a checkout.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cites, fetchRepository, landedPulls, planOutcomes } from './outcomes.mjs';

const KINDS = ['code', 'code-delta', 'plan', 'plan-delta'];
// The case folders of this skill.
const SKILL_CASES = fileURLToPath(new URL('../cases/', import.meta.url));
const MAX_OUTPUT = 256 * 1024 * 1024;
const REVIEW = /^#{1,6}\s+(code|plan) review\b(.*)$/i;
const FINDING =
  /^-\s+(?:\[(critical|high|medium|low|goal_fit|research_gap|security_risk)\]\s*|(goal_fit|research_gap|security_risk)\s*[-:]\s*)(.+)$/i;
const PREVIOUS = /^-\s+Round-(\d+)\s+.*?finding on\s+(.+?):\s*(open|fixed|resolved)\b/i;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const time = (value) => Date.parse(value);
const before = (value, cutoff) => Number.isFinite(time(value)) && time(value) < time(cutoff);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const normalized = (text) => text.toLowerCase().replaceAll('`', '').replace(/\s+/g, ' ').trim();

// Canonical JSON, including its final newline, is the byte format of the frozen record and its hash.
export function frozenJson(value) {
  const ordered = (item) => {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, ordered(item[key])]),
      );
    return item;
  };
  return `${JSON.stringify(ordered(value), null, 2)}\n`;
}

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: MAX_OUTPUT });
  if (result.error || result.status !== 0)
    throw new Error(`gh failed: ${result.error?.message ?? result.stderr.trim()}`);
  return result.stdout;
}

function caseInventory() {
  const root = SKILL_CASES;
  return ['dev', 'heldout'].flatMap((split) =>
    fs
      .readdirSync(path.join(root, split))
      .sort()
      .filter((name) => name.endsWith('.json') && !name.endsWith('.key.json'))
      .map((name) => JSON.parse(fs.readFileSync(path.join(root, split, name), 'utf8')))
      .map(({ id, kind, issue, round }) => ({ id, kind, split, issue, round })),
  );
}

export function captureSnapshot({ repo, closedBefore, commit, cases = caseInventory() }, run = runGh) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('snapshot needs --repo <owner/repo>');
  if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(closedBefore ?? '') || !Number.isFinite(time(closedBefore)))
    throw new Error('snapshot needs --closed-before <ISO time with time zone>');
  if (!/^[0-9a-f]{40}$/i.test(commit ?? '')) throw new Error('snapshot needs a full script commit SHA');
  const repository = fetchRepository(repo, run);
  const comments = {};
  for (const plan of [...repository.plans].sort((a, b) => a.number - b.number)) {
    if (!before(plan.closedAt, closedBefore)) continue;
    comments[plan.number] = run([
      'api',
      '--paginate',
      `repos/${repo}/issues/${plan.number}/comments?per_page=100`,
      '--jq',
      '.[] | {id, body, createdAt: .created_at, url: .html_url}',
    ])
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  return {
    version: 1,
    repo,
    cutoff: new Date(closedBefore).toISOString(),
    script_commit: commit,
    repository,
    comments,
    cases,
  };
}

// GitHub can return comments in a different order. Sequence, rather than round number alone, distinguishes cycles.
function reviewRounds(comments, cutoff) {
  const rounds = { code: [], plan: [] };
  const firstRound = (comment) =>
    Number(comment.body.match(/^#{1,6}\s+(?:code|plan) review[^\n]*?\bround\s+(\d+)/im)?.[1] ?? 0);
  const ordered = comments
    .filter((comment) => before(comment.createdAt, cutoff))
    .sort(
      (a, b) =>
        time(a.createdAt) - time(b.createdAt) || firstRound(a) - firstRound(b) || compare(String(a.id), String(b.id)),
    );
  for (const comment of ordered) {
    let block = null;
    let fence = null;
    for (const line of comment.body.split(/\r?\n/)) {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1][0];
        else if (fence === marker[1][0]) fence = null;
        continue;
      }
      if (fence) continue;
      const heading = line.match(REVIEW);
      if (heading) {
        const reviewer = heading[1].toLowerCase();
        const sequence = rounds[reviewer];
        const previous = sequence.at(-1);
        const explicit = heading[2].match(/\bround\s+(\d+)/i);
        const round = explicit ? Number(explicit[1]) : (previous?.round ?? 0) + 1;
        const namedCycle = heading[2].match(/\bcycle\s+(\d+)/i);
        const cycle = namedCycle
          ? Number(namedCycle[1])
          : (previous?.cycle ?? 1) + (previous && round < previous.round ? 1 : 0);
        if (explicit && previous?.round === round && previous.cycle === cycle) block = previous;
        else {
          block = {
            round,
            cycle,
            sequence: sequence.length + 1,
            createdAt: comment.createdAt,
            kind: `${reviewer}${/\bdelta\b/i.test(heading[2]) ? '-delta' : ''}`,
            findings: [],
            previous: [],
            body: [],
            modern: false,
          };
          sequence.push(block);
        }
        continue;
      }
      if (!block) continue;
      block.body.push(normalized(line));
      if (/^(?:#{1,6}\s+)?Previous findings\s*:?\s*$/i.test(line.trim())) block.modern = true;
      const previous = line.match(PREVIOUS);
      if (previous) {
        block.previous.push({
          round: Number(previous[1]),
          locator: normalized(previous[2]),
          state: previous[3].toLowerCase(),
        });
        continue;
      }
      const finding = line.match(FINDING);
      if (!finding) continue;
      const rest = finding[3].replace(/^(?:Bug|Spec|Security|Performance|Maintainability)\s+-\s+/i, '');
      block.findings.push({
        text: line,
        locator: rest.split(/\s+-\s+/)[0].trim(),
        category: (finding[1] ?? finding[2]).toLowerCase(),
        class: normalized(line.match(/\bclass:\s*(.+)$/i)?.[1] ?? ''),
        source: { comment: comment.id, url: comment.url ?? null, createdAt: comment.createdAt },
      });
    }
  }
  return rounds;
}

function matchesStatus(finding, status) {
  return normalized(finding.text).includes(status.locator) || normalized(finding.locator).includes(status.locator);
}

// The findings of `round` that the round before it did not report. The format with Previous findings marks a repeat
// `open`; in the old format, a repeat has the text of a finding of the round before it in the same cycle.
function newFindings(round, earlier) {
  const repeats = round.previous.filter((status) => status.state === 'open');
  const prior = earlier.at(-1);
  const oldRepeat = (finding) =>
    !round.modern &&
    prior &&
    !prior.modern &&
    prior.cycle === round.cycle &&
    prior.findings.some((item) => findingCore(item) === findingCore(finding));
  return round.findings.filter(
    (finding) =>
      !oldRepeat(finding) &&
      !repeats.some((status) => {
        if (matchesStatus(finding, status)) return true;
        // A repair can move the locator. The review's defect class still identifies an open repeat.
        return (
          finding.class &&
          earlier.some(
            (old) =>
              old.cycle === round.cycle &&
              old.round === status.round &&
              old.findings.some((item) => matchesStatus(item, status) && item.class === finding.class),
          )
        );
      }),
  );
}

// The text of a finding without its list marker and its severity or kind tag.
const findingCore = (finding) => normalized(finding.text.match(FINDING)?.[3] ?? finding.text);

// A later round confirms the fix of `finding` of `round`. In the format with Previous findings, a later round of the
// same cycle marks it fixed or resolved. In the old format, a later old-format review no longer reports it: its text
// is absent from that review.
function confirmed(finding, round, later) {
  return later.some((next) => {
    if (!round.modern && !next.modern) {
      const core = findingCore(finding);
      return !next.body.some((line) => line.includes(core));
    }
    if (next.cycle !== round.cycle) return false;
    return next.previous.some(
      (status) =>
        status.round === round.round &&
        (status.state === 'fixed' || status.state === 'resolved') &&
        matchesStatus(finding, status),
    );
  });
}

function cutoffData(snapshot) {
  const { cutoff, repository } = snapshot;
  return {
    repo: snapshot.repo,
    plans: repository.plans.filter((plan) => before(plan.closedAt, cutoff)),
    issues: repository.issues.filter((item) => before(item.createdAt, cutoff)),
    pulls: repository.pulls
      .filter((item) => before(item.createdAt, cutoff))
      .map((item) => ({
        ...item,
        mergedAt: before(item.mergedAt, cutoff) ? item.mergedAt : null,
        mergeCommit: before(item.mergedAt, cutoff) ? item.mergeCommit : null,
      })),
    commits: repository.commits.filter((item) => before(item.date, cutoff)),
  };
}

// The one plan of each follow-up defect (C9). The follow-up rule of outcomes.mjs already leaves out plan work. An item
// goes to the plan whose landing pull request it cites, then to the highest-numbered cited plan that closed before the
// item was created, then to the highest-numbered plan whose follow-up rule took it. The order of the plans and of the
// items does not change an owner.
function followUpOwners(data, outcomes) {
  const pullByNumber = new Map(data.pulls.map((pull) => [pull.number, pull]));
  const items = new Map([...data.pulls, ...data.issues].map((item) => [item.number, item]));
  const plans = new Map(data.plans.map((plan) => [plan.number, plan]));
  const takers = new Map();
  for (const row of outcomes.values()) {
    for (const id of row.followUps) {
      const number = Number(id.slice(1));
      takers.set(number, [...(takers.get(number) ?? []), row.plan]);
    }
  }
  const owners = new Map();
  for (const [number, candidates] of takers) {
    const item = items.get(number);
    const text = `${item.title ?? ''}\n${item.body ?? ''}`;
    const highest = (list) => (list.length ? Math.max(...list) : null);
    // Every landing pull request of a plan counts, the same set that the follow-up rule of outcomes.mjs takes.
    const byLanding = candidates.filter((plan) =>
      landedPulls(plans.get(plan), data.repo, pullByNumber).some((pull) => cites(text, data.repo, pull.number)),
    );
    const byPlan = candidates.filter(
      (plan) => cites(text, data.repo, plan) && time(plans.get(plan).closedAt) < time(item.createdAt),
    );
    owners.set(number, highest(byLanding) ?? highest(byPlan) ?? highest(candidates));
  }
  return owners;
}

// `drawCommit` is the commit of the escapes.mjs that runs the draw, with `-dirty` when its draw code differs from that
// commit. The frozen part keeps it next to the commit of the snapshot, so a redraw of one snapshot with other code shows.
export function buildDraw(snapshot, seed, { drawCommit, sourceBytes = frozenJson(snapshot) } = {}) {
  if (
    snapshot.version !== 1 ||
    !snapshot.repo ||
    !Number.isFinite(time(snapshot.cutoff)) ||
    !snapshot.script_commit ||
    !snapshot.repository ||
    !snapshot.comments ||
    !Array.isArray(snapshot.cases)
  )
    throw new Error('invalid escape snapshot');
  if (typeof seed !== 'string' || !seed.length) throw new Error('draw needs --seed <seed>');
  if (!/^[0-9a-f]{40}(?:-dirty)?$/.test(drawCommit ?? '')) throw new Error('draw needs the commit of its script');
  const data = cutoffData(snapshot);
  const units = [];
  const devPlans = new Set(snapshot.cases.filter((item) => item.split === 'dev').map((item) => item.issue));
  const outcomes = new Map(planOutcomes(data).map((row) => [row.plan, row]));
  const owners = followUpOwners(data, outcomes);
  for (const plan of [...data.plans].sort((a, b) => a.number - b.number)) {
    const rounds = reviewRounds(snapshot.comments[plan.number] ?? [], snapshot.cutoff);
    const byRound = new Map();
    const add = (reviewer, missed, findings) => {
      const key = `${reviewer}:${missed.sequence}`;
      if (!byRound.has(key))
        byRound.set(key, {
          id: `${plan.number}-${reviewer}-${missed.sequence}`,
          issue: plan.number,
          reviewer,
          missed_round: missed.round,
          cycle: missed.cycle,
          sequence: missed.sequence,
          createdAt: missed.createdAt,
          kind: missed.kind,
          split: devPlans.has(plan.number) ? 'dev' : 'heldout',
          findings: [],
        });
      byRound.get(key).findings.push(...findings);
    };
    for (const reviewer of ['code', 'plan']) {
      const sequence = rounds[reviewer];
      for (let index = 1; index < sequence.length; index++) {
        const found = sequence[index];
        const missed = sequence[index - 1];
        // The first round of a new cycle reviews another sequence: it is no escape of the previous cycle.
        if (found.cycle !== missed.cycle) continue;
        const findings = newFindings(found, sequence.slice(0, index)).filter((finding) =>
          confirmed(finding, found, sequence.slice(index + 1)),
        );
        if (findings.length)
          add(
            reviewer,
            missed,
            findings.map((finding) => ({ ...finding, found_round: found.round, origin: 'review' })),
          );
      }
    }
    // A follow-up can cite only the landing pull request. The outcomes rule finds the defects; owners gives each one
    // plan.
    const row = outcomes.get(plan.number);
    const landingTime = row.merged ?? plan.closedAt;
    const missed = rounds.code.filter((round) => time(round.createdAt) <= time(landingTime)).at(-1) ?? {
      round: 1,
      cycle: 1,
      sequence: 1,
      createdAt: landingTime,
      kind: 'code',
    };
    for (const id of row.followUps) {
      const number = Number(id.slice(1));
      if (owners.get(number) !== plan.number) continue;
      const item =
        data.issues.find((issue) => issue.number === number) ?? data.pulls.find((pull) => pull.number === number);
      add('code', missed, [
        { origin: 'follow-up', item: number, text: `${item.title}\n${item.body ?? ''}`, createdAt: item.createdAt },
      ]);
    }
    units.push(...[...byRound.values()].sort((a, b) => compare(a.reviewer, b.reviewer) || a.sequence - b.sequence));
  }
  const seededPlans = data.plans
    .filter((plan) => !devPlans.has(plan.number))
    .map((plan) => ({
      issue: plan.number,
      hash: sha256(`${seed}:${plan.number}`),
    }))
    .sort((a, b) => compare(a.hash, b.hash) || a.issue - b.issue);
  const frozen = {
    version: 1,
    cutoff: snapshot.cutoff,
    script_commit: snapshot.script_commit,
    draw_commit: drawCommit,
    seed,
    snapshot_sha256: sha256(sourceBytes),
    units,
    seeded_plans: seededPlans,
  };
  const record = { frozen, outcomes: [] };
  const manifest = [
    '# Escape draw',
    '',
    '## Frozen',
    '',
    `- Cutoff (exclusive): ${frozen.cutoff}`,
    `- Script commit: ${frozen.script_commit}`,
    `- Draw script commit: ${frozen.draw_commit}`,
    `- Seed (JSON): ${JSON.stringify(seed)}`,
    `- Source snapshot SHA-256: ${frozen.snapshot_sha256}`,
    `- Restricted frozen record SHA-256: ${sha256(frozenJson(frozen))}`,
    '',
    '| Split | Kind | Units |',
    '|---|---|---:|',
    ...['dev', 'heldout'].flatMap((split) =>
      KINDS.map(
        (kind) =>
          `| ${split} | ${kind} | ${units.filter((unit) => unit.split === split && unit.kind === kind).length} |`,
      ),
    ),
    '',
    '### Dev units',
    '',
    'A commitment is the SHA-256 of the canonical JSON of the unit in the restricted record.',
    '',
    '| Issue | Reviewer | Missed round | Kind | Commitment |',
    '|---:|---|---:|---|---|',
    ...units
      .filter((unit) => unit.split === 'dev')
      .map(
        (unit) =>
          `| #${unit.issue} | ${unit.reviewer} | ${unit.missed_round} | ${unit.kind} | ${sha256(frozenJson(unit))} |`,
      ),
    '',
  ].join('\n');
  return { record, manifest };
}

// The rejection reasons of C3, by letter.
const REASONS = {
  a: 'the finding is on lines that the missed round did not see',
  b: 'no later round confirms the fix',
  c: 'the base, head, or plan body of the round cannot be rebuilt',
  d: 'a case for the round existed before the cutoff',
  e: 'a follow-up item that is no defect of this plan',
};
const OUTCOME_FIELDS = new Set([
  'unit',
  'issue',
  'reviewer',
  'kind',
  'missed_round',
  'split',
  'outcome',
  'case',
  'reason',
  'findings',
  'inputs',
  'decided',
  'note',
]);
const OUTCOMES_HEADING = '## Outcomes';
const FROZEN_HASH_LINE = /^- Restricted frozen record SHA-256: ([0-9a-f]{64})$/m;

// The frozen part of a manifest: the text before its `## Outcomes` section, or all of it.
function manifestFrozenPart(text) {
  const at = text.indexOf(`\n\n${OUTCOMES_HEADING}\n`);
  return at === -1 ? text : text.slice(0, at + 1);
}

// Checks one outcome file against its frozen unit: the same identity fields, `taken` with an existing case of the
// unit's issue and split, or `rejected` with a reason letter of C3.
function checkOutcome(name, outcome, unit, casesDir) {
  const where = `outcome ${name}`;
  if (outcome === null || typeof outcome !== 'object' || Array.isArray(outcome)) fail(`${where} holds no object`);
  const extra = Object.keys(outcome).filter((key) => !OUTCOME_FIELDS.has(key));
  if (extra.length) fail(`${where} has unknown fields: ${extra.join(', ')}`);
  for (const field of ['issue', 'reviewer', 'kind', 'missed_round', 'split']) {
    if (outcome[field] !== unit[field]) {
      fail(
        `${where}: ${field} is ${JSON.stringify(outcome[field])}, the frozen unit has ${JSON.stringify(unit[field])}`,
      );
    }
  }
  if (typeof outcome.decided !== 'string' || !Number.isFinite(time(outcome.decided)))
    fail(`${where}: decided must be an ISO time`);
  if (outcome.findings !== undefined && !Array.isArray(outcome.findings)) fail(`${where}: findings must be a list`);
  // A note explains a judgment call. It stays in the restricted record only: a held-out note can name a defect.
  if (outcome.note !== undefined && typeof outcome.note !== 'string') fail(`${where}: note must be a string`);
  if (outcome.outcome === 'taken') {
    if (outcome.reason !== undefined && outcome.reason !== null) fail(`${where}: a taken unit has no reason`);
    if (typeof outcome.case !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(outcome.case))
      fail(`${where}: a taken unit names its case id`);
    const file = path.join(casesDir, unit.split, `${outcome.case}.json`);
    if (!fs.existsSync(file)) fail(`${where}: case ${outcome.case} has no case file in ${unit.split}`);
    const caseData = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (caseData.id !== outcome.case || caseData.issue !== unit.issue || caseData.split !== unit.split)
      fail(`${where}: case ${outcome.case} is not a ${unit.split} case of issue #${unit.issue}`);
    // The case reviews the missed round of the unit: its kind, its round, and its cycle when the case records one.
    if (
      caseData.kind !== unit.kind ||
      caseData.round !== unit.missed_round ||
      (Object.hasOwn(caseData, 'cycle') && caseData.cycle !== unit.cycle)
    ) {
      fail(
        `${where}: case ${outcome.case} is a ${caseData.kind} case of round ${caseData.round}, not the ${unit.kind} round ${unit.missed_round} of the unit`,
      );
    }
  } else if (outcome.outcome === 'rejected') {
    if (outcome.case !== undefined && outcome.case !== null) fail(`${where}: a rejected unit has no case`);
    if (!Object.hasOwn(REASONS, outcome.reason)) fail(`${where}: a rejected unit needs a reason letter a to e`);
  } else {
    fail(`${where}: outcome must be taken or rejected`);
  }
}

// The outcome parts (C7). `files` are the outcome files as { name, text }, one per decided unit, named
// `<unit id>.json`. The record keeps its frozen part byte for byte and gets the outcomes in draw order. The manifest
// keeps its frozen part byte for byte and gets a new `## Outcomes` section: counts by split and reason, and the dev
// outcomes in full, with no held-out unit and no finding text. The same input gives the same output.
export function applyOutcomes({ recordText, manifestText, files, casesDir = SKILL_CASES }) {
  const record = JSON.parse(recordText);
  if (frozenJson(record) !== recordText) fail('the record is not in canonical form; it changed after draw');
  const frozenHash = sha256(frozenJson(record.frozen));
  const frozenManifest = manifestFrozenPart(manifestText);
  if (frozenManifest.match(FROZEN_HASH_LINE)?.[1] !== frozenHash)
    fail('the manifest names another frozen record than this record');
  const order = new Map(record.frozen.units.map((unit, index) => [unit.id, index]));
  const decided = new Map();
  // Each case stands for one unit, so no two units name one case.
  const cases = new Map();
  for (const { name, text } of files) {
    const outcome = JSON.parse(text);
    const id = outcome?.unit;
    if (!order.has(id)) fail(`outcome ${name} names no unit of the draw: ${JSON.stringify(id)}`);
    if (name !== `${id}.json`) fail(`outcome ${name} must be named ${id}.json`);
    if (decided.has(id)) fail(`unit ${id} has two outcome files`);
    checkOutcome(name, outcome, record.frozen.units[order.get(id)], casesDir);
    if (outcome.outcome === 'taken') {
      const key = `${outcome.split}/${outcome.case}`;
      if (cases.has(key)) fail(`case ${outcome.case} is named by units ${cases.get(key)} and ${id}`);
      cases.set(key, id);
    }
    decided.set(id, outcome);
  }
  const outcomes = [...decided.values()].sort((a, b) => order.get(a.unit) - order.get(b.unit));
  const recordOut = frozenJson({ ...record, outcomes });
  const count = (split, test) =>
    record.frozen.units.filter((unit) => unit.split === split && test(decided.get(unit.id))).length;
  const letters = Object.keys(REASONS);
  const section = [
    OUTCOMES_HEADING,
    '',
    `Reasons: ${letters.map((letter) => `(${letter}) ${REASONS[letter]}`).join('; ')}.`,
    '',
    `| Split | Units | Taken | ${letters.map((letter) => `Rejected (${letter})`).join(' | ')} | Pending |`,
    `|---|---:|---:|${letters.map(() => '---:|').join('')}---:|`,
    ...['dev', 'heldout']
      .map((split) =>
        [
          split,
          count(split, () => true),
          count(split, (item) => item?.outcome === 'taken'),
          ...letters.map((letter) => count(split, (item) => item?.outcome === 'rejected' && item.reason === letter)),
          count(split, (item) => item === undefined),
        ].join(' | '),
      )
      .map((line) => `| ${line} |`),
    '',
    '### Dev outcomes',
    '',
    '| Issue | Reviewer | Missed round | Kind | Commitment | Outcome | Case or reason |',
    '|---:|---|---:|---|---|---|---|',
    ...record.frozen.units
      .filter((unit) => unit.split === 'dev' && decided.has(unit.id))
      .map((unit) => {
        const item = decided.get(unit.id);
        const detail = item.outcome === 'taken' ? item.case : `(${item.reason})`;
        return `| #${unit.issue} | ${unit.reviewer} | ${unit.missed_round} | ${unit.kind} | ${sha256(frozenJson(unit))} | ${item.outcome} | ${detail} |`;
      }),
    '',
  ].join('\n');
  return { record: recordOut, manifest: `${frozenManifest}\n${section}`, outcomes };
}

function fail(message) {
  throw new Error(message);
}

// Refuses a restricted file inside a repository: existing parents resolve, so a symlink cannot put restricted data
// back inside a checkout. A new file is write-once; `replace` swaps an existing file through a temporary file.
function writeRestricted(file, content, { replace = false } = {}) {
  const parent = fs.realpathSync(path.dirname(path.resolve(file)));
  for (let dir = parent; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) throw new Error('restricted files must stay outside a repository');
    if (dir === path.dirname(dir)) break;
  }
  if (!replace) {
    fs.writeFileSync(file, content, { mode: 0o600, flag: 'wx' });
    return;
  }
  const temporary = path.join(parent, `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, file);
}

export function main(argv) {
  const [command, ...args] = argv;
  const options =
    command === 'snapshot'
      ? {
          repo: { type: 'string' },
          'closed-before': { type: 'string' },
          out: { type: 'string' },
          commit: { type: 'string' },
        }
      : command === 'draw'
        ? {
            snapshot: { type: 'string' },
            seed: { type: 'string' },
            record: { type: 'string' },
            manifest: { type: 'string' },
            commit: { type: 'string' },
          }
        : command === 'outcomes'
          ? {
              record: { type: 'string' },
              outcomes: { type: 'string' },
              manifest: { type: 'string' },
              cases: { type: 'string' },
            }
          : null;
  if (!options) throw new Error('usage: escapes.mjs <snapshot|draw|outcomes> [options]');
  const { values } = parseArgs({ args, options, strict: true });
  if (command === 'snapshot') {
    if (!values.out) throw new Error('snapshot needs --out <file>');
    const commit = values.commit ?? headCommit(SCRIPT_DIR);
    const snapshot = captureSnapshot({ repo: values.repo, closedBefore: values['closed-before'], commit });
    writeRestricted(values.out, frozenJson(snapshot));
    return null;
  }
  if (command === 'outcomes') {
    if (!values.record || !values.outcomes || !values.manifest)
      throw new Error('outcomes needs --record <file> --outcomes <dir> --manifest <file> [--cases <dir>]');
    const files = fs
      .readdirSync(values.outcomes)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => ({ name, text: fs.readFileSync(path.join(values.outcomes, name), 'utf8') }));
    const result = applyOutcomes({
      recordText: fs.readFileSync(values.record, 'utf8'),
      manifestText: fs.readFileSync(values.manifest, 'utf8'),
      files,
      ...(values.cases ? { casesDir: path.resolve(values.cases) } : {}),
    });
    writeRestricted(values.record, result.record, { replace: true });
    fs.writeFileSync(values.manifest, result.manifest);
    return `outcomes: ${result.outcomes.length} decided units written to ${values.record} and ${values.manifest}\n`;
  }
  if (!values.snapshot) throw new Error('draw needs --snapshot <file>');
  if (values.record && values.manifest && path.resolve(values.record) === path.resolve(values.manifest))
    throw new Error('record and manifest must be different files');
  const bytes = fs.readFileSync(values.snapshot, 'utf8');
  const drawCommit = drawCommitOf(values.commit);
  const { record, manifest } = buildDraw(JSON.parse(bytes), values.seed, { drawCommit, sourceBytes: bytes });
  if (values.record) writeRestricted(values.record, frozenJson(record));
  if (values.manifest) fs.writeFileSync(values.manifest, manifest);
  return manifest;
}

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
// The repository path of this folder, and the files of the draw code.
const REPOSITORY_SCRIPTS = '.agents/skills/review-benchmark/scripts';
const DRAW_CODE = ['escapes.mjs', 'outcomes.mjs'];

// The output of a git command in `cwd`, or null when it fails.
function git(args, cwd = process.cwd()) {
  const result = spawnSync('git', args, { encoding: 'utf8', cwd });
  return result.error || result.status !== 0 ? null : result.stdout.trim();
}

// The commit of the checkout of `cwd`.
function headCommit(cwd = process.cwd()) {
  const commit = git(['rev-parse', 'HEAD'], cwd);
  if (!commit) throw new Error('cannot read the script commit; use --commit');
  return commit;
}

// Tells whether the running draw code is the draw code of `commit` in the repository of the current folder: the blob
// of each running file (with the filters of its repository path) equals the blob of that path at `commit`. The files
// can run from a checkout or from a `git archive` of the commit.
function drawCodeMatches(commit) {
  return DRAW_CODE.every((name) => {
    const repositoryPath = `${REPOSITORY_SCRIPTS}/${name}`;
    const committed = git(['rev-parse', '--verify', '--quiet', `${commit}:${repositoryPath}`]);
    const running = git(['hash-object', `--path=${repositoryPath}`, path.join(SCRIPT_DIR, name)]);
    return committed !== null && running !== null && committed === running;
  });
}

// The draw commit of the frozen part. A given `--commit` must hold the running draw code, else the draw refuses. Without
// it, the draw takes the commit of the current checkout, marked `-dirty` when the running code differs from it.
function drawCommitOf(given) {
  if (given === undefined) {
    const head = headCommit();
    return drawCodeMatches(head) ? head : `${head}-dirty`;
  }
  if (!/^[0-9a-f]{40}$/.test(given)) throw new Error('draw needs the commit of its script');
  if (!drawCodeMatches(given)) {
    throw new Error(
      `the running escapes.mjs or outcomes.mjs differs from ${REPOSITORY_SCRIPTS} at ${given}; run the scripts of that commit`,
    );
  }
  return given;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = main(process.argv.slice(2));
    if (output !== null) process.stdout.write(output);
  } catch (error) {
    console.error(`escapes.mjs: ${error.message}`);
    process.exitCode = 1;
  }
}
