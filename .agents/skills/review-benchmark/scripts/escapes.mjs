#!/usr/bin/env node
// Freeze source data once; draw only from that snapshot. Restricted files never belong in a checkout.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fetchRepository, planOutcomes } from './outcomes.mjs';

const KINDS = ['code', 'code-delta', 'plan', 'plan-delta'];
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
  const root = fileURLToPath(new URL('../cases/', import.meta.url));
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
            modern: false,
          };
          sequence.push(block);
        }
        continue;
      }
      if (!block) continue;
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

function newFindings(round, earlier) {
  const repeats = round.previous.filter((status) => status.state === 'open');
  return round.findings.filter(
    (finding) =>
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

function confirmed(finding, round, later) {
  return later.some((next) => {
    if (!round.modern && !next.modern) return true; // Old format: a subsequent review is its fix check.
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

export function buildDraw(snapshot, seed, sourceBytes = frozenJson(snapshot)) {
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
  const data = cutoffData(snapshot);
  const units = [];
  const devPlans = new Set(snapshot.cases.filter((item) => item.split === 'dev').map((item) => item.issue));
  const outcomes = new Map(planOutcomes(data).map((row) => [row.plan, row]));
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
    // A follow-up can cite only the landing pull request. Reuse the outcomes rule, not an issue-only matcher.
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
    '```json',
    frozenJson(units.filter((unit) => unit.split === 'dev')).trimEnd(),
    '```',
    '',
  ].join('\n');
  return { record, manifest };
}

function writeRestricted(file, content) {
  // Resolve existing parents so a symlink cannot put restricted data back inside a checkout.
  const parent = fs.realpathSync(path.dirname(path.resolve(file)));
  for (let dir = parent; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) throw new Error('restricted files must stay outside a repository');
    if (dir === path.dirname(dir)) break;
  }
  fs.writeFileSync(file, content, { mode: 0o600, flag: 'wx' });
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
          }
        : null;
  if (!options) throw new Error('usage: escapes.mjs <snapshot|draw> [options]');
  const { values } = parseArgs({ args, options, strict: true });
  if (command === 'snapshot') {
    if (!values.out) throw new Error('snapshot needs --out <file>');
    let commit = values.commit;
    if (!commit) {
      const result = spawnSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        cwd: fileURLToPath(new URL('.', import.meta.url)),
      });
      if (result.error || result.status !== 0) throw new Error('cannot read script commit; use --commit');
      commit = result.stdout.trim();
    }
    const snapshot = captureSnapshot({ repo: values.repo, closedBefore: values['closed-before'], commit });
    writeRestricted(values.out, frozenJson(snapshot));
    return null;
  }
  if (!values.snapshot) throw new Error('draw needs --snapshot <file>');
  if (values.record && values.manifest && path.resolve(values.record) === path.resolve(values.manifest))
    throw new Error('record and manifest must be different files');
  const bytes = fs.readFileSync(values.snapshot, 'utf8');
  const { record, manifest } = buildDraw(JSON.parse(bytes), values.seed, bytes);
  if (values.record) writeRestricted(values.record, frozenJson(record));
  if (values.manifest) fs.writeFileSync(values.manifest, manifest);
  return manifest;
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
