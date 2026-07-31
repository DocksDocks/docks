#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { registerExternalAuthority } from './plan-orchestration/external-authority.mjs';
import { FocusedSuite } from './plan-orchestration/harness.mjs';
import { registerHashingAndManifest } from './plan-orchestration/hashing-manifests.mjs';
import { registerHistoricalCharacterization } from './plan-orchestration/historical-characterization.mjs';
import { registerLegacyQuarantine } from './plan-orchestration/legacy-quarantine.mjs';
import { registerLocksAndCas } from './plan-orchestration/locks-cas.mjs';
import { registerMutations } from './plan-orchestration/mutations.mjs';
import { registerPlanSelfCheck } from './plan-orchestration/plan-self-check.mjs';
import { registerReviewBudget } from './plan-orchestration/review-budget.mjs';
import { registerStateMatrix } from './plan-orchestration/state-matrix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN_RUN_PATH = path.join(ROOT, 'plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs');
const REVIEW_POLICY_PATH = path.join(ROOT, 'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs');
const LEGACY_POLICY_PATH = path.join(
  ROOT,
  'plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs',
);
const PLAN_SELF_CHECK_PATH = path.join(
  ROOT,
  'plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs',
);

// Registered inline rather than as a sibling module: the dispatch-driver plan
// declares `scripts/tests/plan-orchestration.mjs` as its registration site, and
// `affected_paths` freezes when a run leaves `drafting`, so a new file here would
// fall outside the path set the run binds.
//
// Each probe owns its fixtures - a disposable plan in a disposable repository -
// so a case costs one child process and touches no real run's permits. They run
// inside the gate rather than beside it, which is what keeps the driver's guards
// regression-protected instead of hand-checked.
const DISPATCH_PROBES = [
  ['crash-refund', 'every catchable signal refunds the permit'],
  ['sigkill-control', 'SIGKILL leaves a bare reserved, keeping crash-refund honest'],
  ['stale-preimage', 'the reserve binds the bytes it sealed'],
  ['head-drift', 'HEAD moving inside the dispatch window refunds'],
  ['dry-run', 'a dry run reserves nothing and reports the sealed digest'],
  ['settle-binding', 'pass settles, repair is withheld, invalid input is terminal'],
  ['retry-block', 'a second transport failure blocks or degrades by risk'],
  // The four repair cases. Registered here so the gate runs them rather than
  // trusting a hand-run; each fails when its defect is re-introduced into a copy.
  ['preflight-before-reserve', 'the route and raw-stdout target are proven before a permit is at stake'],
  ['invalid-input-verbatim', 'a malformed invalid-input reply refunds instead of settling terminally'],
  ['dirty-drift', 'uncommitted affected-path drift refunds with HEAD unmoved'],
  ['stdout-persistence', 'the complete reviewer stdout is persisted byte-for-byte before interpretation'],
];

function registerDispatchDriver(target) {
  const probeFile = path.join(ROOT, 'scripts/tests/plan-dispatch-probes.mjs');
  for (const [probe, claim] of DISPATCH_PROBES) {
    target.test('dispatch-driver', `${probe}: ${claim}`, () => {
      const result = spawnSync(process.execPath, [probeFile, probe], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 300_000,
      });
      assert.equal(result.error, undefined, `${probe} failed to start`);
      assert.equal(result.signal, null, `${probe} was signalled`);
      assert.equal(result.status, 0, `${probe} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
    });
  }
}

function parseGroups(argv) {
  if (argv.length === 0) return null;
  if (argv.length === 2 && argv[0] === '--case' && /^[a-z][a-z0-9-]*$/.test(argv[1])) {
    return new Set([argv[1]]);
  }
  throw new Error('usage: plan-orchestration.mjs [--case <group>]');
}

async function loadModule(file) {
  return import(pathToFileURL(file).href);
}

const selected = parseGroups(process.argv.slice(2));
const suite = new FocusedSuite();

const historicalPath = fs.existsSync(LEGACY_POLICY_PATH) ? LEGACY_POLICY_PATH : REVIEW_POLICY_PATH;
registerHistoricalCharacterization(suite, await loadModule(historicalPath), { root: ROOT });
if (!selected?.has('historical')) {
  const planRun = await loadModule(PLAN_RUN_PATH);
  const reviewer = await loadModule(REVIEW_POLICY_PATH);
  registerStateMatrix(suite, planRun);
  registerHashingAndManifest(suite, planRun);
  registerLocksAndCas(suite, planRun, { planRunPath: PLAN_RUN_PATH });
  registerReviewBudget(suite, planRun, reviewer);
  registerExternalAuthority(suite, planRun);
  registerLegacyQuarantine(suite, planRun, { root: ROOT });
  registerMutations(suite, planRun);
  registerPlanSelfCheck(suite, await loadModule(PLAN_SELF_CHECK_PATH));
  registerDispatchDriver(suite);
}

const passed = await suite.run(selected);
process.stdout.write(`plan-orchestration: ${passed}/${passed} passed\n`);
