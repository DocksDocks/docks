#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import { validatePlanReview } from '../../../plan-reviewer/scripts/review-policy.mjs';

const MINIMUM_K = 3;
const HEX64 = /^[0-9a-f]{64}$/;
const SAMPLE_KEYS = ['schema', 'bundle_sha256', 'review'];

const USAGE = `Usage: node sample-review.mjs --bundle=<file> --results=<file> --k=<integer>

Aggregates caller-supplied PlanReviewV1 samples over one fixed bundle. It reads
only the bundle and result files. The results file is a JSON array of:
  {"schema":1,"bundle_sha256":"<lowercase sha256>","review":<PlanReviewV1>}

K has a minimum of ${MINIMUM_K}. The command prints one JSON result and exits 0
when the inputs are valid, whether or not the stopping rule reports clean.`;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertClosedObject(value, keys, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}`);
  }
}

function reviewBinding(review) {
  return {
    run_id: review.run_id,
    invocation: review.invocation,
    plan_sha256: review.plan_sha256,
    source_sha256: review.source_sha256,
  };
}

function findingKey(finding) {
  return JSON.stringify([finding.id, finding.kind, finding.locator, finding.defect, finding.fix]);
}

export function aggregateReviewSamples({ bundleBytes, k, samples }) {
  if (!(bundleBytes instanceof Uint8Array)) throw new Error('bundleBytes must be a Uint8Array');
  if (!Number.isSafeInteger(k)) throw new Error('configured K must be a safe integer');
  if (k < MINIMUM_K) throw new Error(`configured K ${k} is below the minimum of ${MINIMUM_K}`);
  if (!Array.isArray(samples)) throw new Error('samples must be an array');

  const bundleSha256 = createHash('sha256').update(bundleBytes).digest('hex');
  let suppliedBundleSha256 = null;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const label = `sample ${index + 1}`;
    assertClosedObject(sample, SAMPLE_KEYS, label);
    if (sample.schema !== 1) throw new Error(`${label} schema must be 1`);
    if (typeof sample.bundle_sha256 !== 'string' || !HEX64.test(sample.bundle_sha256)) {
      throw new Error(`${label} bundle_sha256 must be a lowercase sha256 digest`);
    }
    if (suppliedBundleSha256 === null) suppliedBundleSha256 = sample.bundle_sha256;
    else if (sample.bundle_sha256 !== suppliedBundleSha256) {
      throw new Error(
        `${label} bundle_sha256 mismatch: expected the shared digest ${suppliedBundleSha256}, got ${sample.bundle_sha256}`,
      );
    }
  }

  if (suppliedBundleSha256 !== null && suppliedBundleSha256 !== bundleSha256) {
    throw new Error(
      `sample bundle_sha256 mismatch: bundle bytes hash to ${bundleSha256}, results bind ${suppliedBundleSha256}`,
    );
  }

  let binding = null;
  const validatedReviews = samples.map((sample, index) => {
    try {
      if (binding === null) {
        const validated = validatePlanReview(sample.review, reviewBinding(sample.review));
        binding = reviewBinding(validated);
        return validated;
      }
      return validatePlanReview(sample.review, binding);
    } catch (error) {
      throw new Error(`sample ${index + 1} review is invalid: ${error.message}`);
    }
  });

  const findingUnion = [];
  const findingKeys = new Set();
  let passingSamples = 0;
  for (const review of validatedReviews) {
    if (review.findings.length === 0) passingSamples += 1;
    for (const finding of review.findings) {
      const key = findingKey(finding);
      if (findingKeys.has(key)) continue;
      findingKeys.add(key);
      findingUnion.push(finding);
    }
  }

  const sampleCount = validatedReviews.length;
  const cleanStop = sampleCount >= k && findingUnion.length === 0;
  const stopReason = findingUnion.length > 0 ? 'findings_present' : sampleCount < k ? 'insufficient_samples' : 'clean';

  return {
    schema: 1,
    bundle_sha256: bundleSha256,
    configured_k: k,
    sample_count: sampleCount,
    passing_samples: passingSamples,
    pass_rate: sampleCount === 0 ? 0 : passingSamples / sampleCount,
    finding_union: findingUnion,
    clean_stop: cleanStop,
    stop_reason: stopReason,
  };
}

class UsageError extends Error {}

function parseCli(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const values = new Map();
  for (const argument of argv) {
    const match = /^--(bundle|results|k)=(.+)$/.exec(argument);
    if (match === null) throw new UsageError(`unknown or malformed argument: ${argument}`);
    if (values.has(match[1])) throw new UsageError(`duplicate --${match[1]} option`);
    values.set(match[1], match[2]);
  }
  for (const name of ['bundle', 'results', 'k']) {
    if (!values.has(name)) throw new UsageError(`--${name} is required`);
  }
  const kText = values.get('k');
  if (!/^[1-9][0-9]*$/.test(kText)) throw new UsageError('--k must be a positive integer');
  const k = Number(kText);
  if (!Number.isSafeInteger(k)) throw new UsageError('--k must be a safe integer');
  if (k < MINIMUM_K) throw new UsageError(`configured K ${k} is below the minimum of ${MINIMUM_K}`);
  return { help: false, bundle: values.get('bundle'), results: values.get('results'), k };
}

function readSamples(file) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read results ${file}: ${error.message}`);
  }
  if (!Array.isArray(value)) throw new Error('results file must contain a JSON array');
  return value;
}

function main(argv) {
  let cli;
  try {
    cli = parseCli(argv);
  } catch (error) {
    console.error(`sample-review: ${error.message}\n`);
    console.error(USAGE);
    return 2;
  }
  if (cli.help) {
    console.log(USAGE);
    return 0;
  }

  try {
    const bundleBytes = fs.readFileSync(cli.bundle);
    const samples = readSamples(cli.results);
    const result = aggregateReviewSamples({ bundleBytes, k: cli.k, samples });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(`sample-review: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
