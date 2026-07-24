#!/usr/bin/env node
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
import { registerReviewBudget } from './plan-orchestration/review-budget.mjs';
import { registerStateMatrix } from './plan-orchestration/state-matrix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN_RUN_PATH = path.join(ROOT, 'plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs');
const REVIEW_POLICY_PATH = path.join(ROOT, 'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs');
const LEGACY_POLICY_PATH = path.join(
  ROOT,
  'plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs',
);

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
}

const passed = await suite.run(selected);
process.stdout.write(`plan-orchestration: ${passed}/${passed} passed\n`);
