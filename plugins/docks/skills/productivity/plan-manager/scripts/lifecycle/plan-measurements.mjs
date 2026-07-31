import { execFileSync, spawnSync } from 'node:child_process';

const PRODUCER_KEYS = Object.freeze(['op', 'path', 'matcher', 'timeout_ms', 'max_bytes']);
const SAFE_FIELD = /^[A-Za-z0-9_./ :=-]+$/;
const COMMIT = /^[0-9a-f]{40}$/;

const COMMITTED_PRODUCERS = Object.freeze([
  Object.freeze({
    heading: 'Measured: the exclusion precedent is one line',
    claim: 'lines declaring `EXCLUDED_SECTIONS`',
    producer: Object.freeze({
      op: 'show-count',
      path: 'plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs',
      matcher: 'EXCLUDED_SECTIONS = new Set',
      timeout_ms: 1_000,
      max_bytes: 1_048_576,
    }),
  }),
]);

function assertProducer(producer) {
  if (producer === null || typeof producer !== 'object' || Array.isArray(producer)) {
    throw new Error('measurement producer must be an object');
  }
  const keys = Object.keys(producer).sort();
  const expected = [...PRODUCER_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    const extra = keys.filter((key) => !expected.includes(key));
    const missing = expected.filter((key) => !keys.includes(key));
    const details = [
      extra.length ? `; extra key(s): ${extra.join(', ')}` : '',
      missing.length ? `; missing key(s): ${missing.join(', ')}` : '',
    ].join('');
    throw new Error(`measurement producer keys are closed${details}`);
  }
  if (producer.op !== 'show-count') throw new Error(`unknown measurement producer op: ${String(producer.op)}`);
  for (const field of ['op', 'path', 'matcher']) {
    if (typeof producer[field] !== 'string' || producer[field] === '' || !SAFE_FIELD.test(producer[field])) {
      throw new Error(`measurement producer ${field} contains shell syntax or invalid bytes`);
    }
  }
  if (
    producer.path.startsWith('/') ||
    producer.path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error('measurement producer path must be normalized and repository-relative');
  }
  if (!Number.isInteger(producer.timeout_ms) || producer.timeout_ms < 1 || producer.timeout_ms > 30_000) {
    throw new Error('measurement producer timeout_ms must be an integer from 1 through 30000');
  }
  if (!Number.isInteger(producer.max_bytes) || producer.max_bytes < 1 || producer.max_bytes > 16 * 1024 * 1024) {
    throw new Error('measurement producer max_bytes must be an integer from 1 through 16777216');
  }
}

export function runMeasurementProducer(producer, { repo = process.cwd(), sourceBase } = {}) {
  assertProducer(producer);
  if (!COMMIT.test(sourceBase ?? '')) throw new Error('measurement producer requires a 40-hex source_base');
  let blob;
  try {
    blob = execFileSync('git', ['show', `${sourceBase}:${producer.path}`], {
      cwd: repo,
      encoding: 'utf8',
      timeout: producer.timeout_ms,
      maxBuffer: producer.max_bytes,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // A measurement names the commit it was taken against, and a clone need not contain that
    // commit: a shallow checkout holds only its own tip. Git reports the absent commit and a
    // wrong producer path with near-identical wording, so say which one happened. Without this
    // the two are indistinguishable, and an unreachable commit reads like genuine drift.
    const reachable = spawnSync('git', ['cat-file', '-e', `${sourceBase}^{commit}`], { cwd: repo }).status === 0;
    if (reachable) throw error;
    throw new Error(
      `measurement source_base ${sourceBase} is not present in this clone, so the producer cannot be measured`,
    );
  }
  return blob.split('\n').reduce((count, line) => count + Number(line.includes(producer.matcher)), 0);
}

function measurementSections(planText) {
  const lines = planText.split('\n');
  const sections = [];
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(lines[index]);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^(#{2,6})\s+(.+?)\s+\{measurement:(committed|snapshot|operator)\}\s*$/.exec(lines[index]);
    if (!heading) continue;
    let end = lines.length;
    for (let cursor = index + 1, innerFence = null; cursor < lines.length; cursor++) {
      const marker = /^\s*(```+|~~~+)/.exec(lines[cursor]);
      if (marker) {
        if (innerFence === null) innerFence = marker[1][0];
        else if (marker[1][0] === innerFence) innerFence = null;
        continue;
      }
      if (innerFence !== null) continue;
      const next = /^(#{2,6})\s+/.exec(lines[cursor]);
      if (next && next[1].length <= heading[1].length) {
        end = cursor;
        break;
      }
    }
    sections.push({ className: heading[3], heading: heading[2], text: lines.slice(index + 1, end).join('\n') });
  }
  return sections;
}

function snapshotProducer(sectionText) {
  const fence = /(?:^|\n)(?:Producer[^\n]*\n+)?```\n([\s\S]*?)\n```/.exec(sectionText);
  const rendered = fence?.[1] ?? sectionText.split('\n').find((line) => line.trim() !== '') ?? '(not rendered)';
  return rendered
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ; ');
}

function committedQuantities(sectionText) {
  const quantities = [];
  for (const line of sectionText.split('\n')) {
    const match = /^\|([^|]+)\|\s*(-?\d+)\s*\|\s*$/.exec(line);
    if (!match || /Enforced quantity|^-+$/.test(match[1].trim())) continue;
    quantities.push({ claim: match[1].trim(), value: Number(match[2]) });
  }
  return quantities;
}
function sourceBaseFromRecord(planText) {
  const line = planText.split('\n').find((candidate) => candidate.startsWith('Plan-run: '));
  if (!line) throw new Error('committed measurement requires a Plan-run record');
  return JSON.parse(line.slice('Plan-run: '.length)).source_base;
}

export function checkPlanMeasurements(planText, { repo = process.cwd() } = {}) {
  let sourceBase = null;
  const results = [];
  for (const section of measurementSections(planText)) {
    if (section.className === 'operator') continue;
    if (section.className === 'snapshot') {
      results.push({
        className: 'snapshot',
        heading: section.heading,
        producer: snapshotProducer(section.text),
        verdict: 'reported',
      });
      continue;
    }
    const definition = COMMITTED_PRODUCERS.find(({ heading }) => heading === section.heading);
    if (!definition) {
      results.push({
        className: 'committed',
        heading: section.heading,
        claim: section.heading,
        verdict: 'fail',
        reason: 'no committed producer is registered',
      });
      continue;
    }
    const quantities = committedQuantities(section.text);
    const quantity = quantities.find(({ claim }) => claim === definition.claim);
    if (!quantity) {
      results.push({
        className: 'committed',
        heading: section.heading,
        claim: definition.claim,
        producer: definition.producer,
        verdict: 'fail',
        reason: 'enforced quantity is missing',
      });
      continue;
    }
    sourceBase ??= sourceBaseFromRecord(planText);
    const observed = runMeasurementProducer(definition.producer, { repo, sourceBase });
    results.push({
      className: 'committed',
      heading: section.heading,
      claim: definition.claim,
      expected: quantity.value,
      observed,
      producer: definition.producer,
      verdict: observed === quantity.value ? 'pass' : 'fail',
      reason: `recorded ${quantity.value}, producer observed ${observed}`,
    });
  }
  return results;
}
