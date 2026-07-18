import {
  PLUGIN,
  VERSION,
  assertReceiptOutputFree,
  fail,
} from './session-relay-release-core.mjs';
import {
  bindCompletion,
  checkPrepared,
  materialize,
  prepare,
  verifyEmbedded,
  verifySourceCi,
} from './session-relay-release-preparation.mjs';
import { finalizeReviewed, publishReviewed } from './session-relay-release-publication.mjs';
import {
  emitPublicRequest,
  promoteReviewed,
  validatePromotionReceiptForFinalization,
  verifyPublicRelease,
} from './session-relay-release-promotion.mjs';
import { positionalPlugin, runFixture } from './session-relay-release-fixture.mjs';

const MODE_SPECS = {
  prepare: { required: ['plugin', 'version'], boolean: ['dry-run'] },
  'materialize-tdd-red': { required: ['plugin', 'version', 'plan', 'docks-red-out', 'public-red-out'] },
  'verify-embedded-preparation': { required: ['plugin', 'version', 'plan'] },
  'verify-source-ci': { required: ['plugin', 'version', 'run-id', 'expected-commit', 'receipt-out'] },
  'check-prepared': { required: ['plugin', 'version', 'source-commit', 'docks-red', 'docks-red-sha256', 'public-red', 'public-red-sha256', 'preflight', 'preflight-sha256', 'source-ci', 'source-ci-sha256', 'receipt-out'] },
  'bind-completion': { required: ['plugin', 'version', 'finished-plan', 'embedded-candidate-sha256', 'receipt-out'] },
  'publish-reviewed': { required: ['plugin', 'version', 'source-proof', 'source-proof-sha256', 'receipt-out'], boolean: ['rebind-complete-publication'], pairs: [['resume-publication', 'resume-publication-sha256']] },
  'emit-public-request': { required: ['plugin', 'version', 'publication', 'publication-sha256', 'receipt-out'] },
  'verify-public-release': { required: ['plugin', 'version', 'request', 'request-sha256', 'publication', 'publication-sha256', 'public-finished-plan', 'public-release-commit', 'public-completion-sha256', 'receipt-out'] },
  'promote-reviewed': { required: ['plugin', 'version', 'source-proof', 'source-proof-sha256', 'publication', 'publication-sha256', 'public-release', 'public-release-sha256', 'docks-kit-release', 'expected-origin-main', 'receipt-out'], pairs: [['retry-failed', 'retry-failed-sha256']] },
  'resume-promotion': { required: ['plugin', 'version', 'transaction-ref', 'source-proof', 'source-proof-sha256', 'publication', 'publication-sha256', 'public-release', 'public-release-sha256', 'docks-kit-release', 'expected-origin-main', 'receipt-out'] },
  'finalize-reviewed': { required: ['plugin', 'version', 'source-proof', 'source-proof-sha256', 'publication', 'publication-sha256', 'promotion', 'promotion-sha256', 'receipt-out'], pairs: [['resume-finalization', 'resume-finalization-sha256']] },
};
const MODE_FLAGS = new Map(Object.keys(MODE_SPECS).map((mode) => [`--${mode}`, mode]));

function receiptPairs(required) {
  const pairs = [];
  for (const digestName of required.filter((name) => name.endsWith('-sha256'))) {
    const pathName = digestName.slice(0, -'-sha256'.length);
    if (required.includes(pathName)) pairs.push([pathName, digestName]);
  }
  return pairs;
}

function parseMode(argv) {
  const present = argv.filter((token) => MODE_FLAGS.has(token));
  if (present.length > 1 || new Set(present).size !== present.length) fail('exactly one release mode is allowed');
  if (present.length === 0) return null;
  const mode = MODE_FLAGS.get(present[0]);
  if (argv[0] !== `--${mode}`) fail('release mode must be the first argument');
  const spec = MODE_SPECS[mode];
  const booleans = new Set(spec.boolean ?? []);
  const allowed = new Set([...spec.required, ...booleans, ...(spec.pairs ?? []).flat()]);
  const options = new Map();
  const positional = [];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) { positional.push(token); continue; }
    const name = token.slice(2);
    if (!allowed.has(name)) fail(`unknown option for --${mode}: ${token}`);
    if (options.has(name)) fail(`duplicate option: ${token}`);
    if (booleans.has(name)) { options.set(name, true); continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`missing value for ${token}`);
    options.set(name, value);
    index += 1;
  }
  if (positional.length !== 1) fail(`--${mode} requires exactly one version argument`);
  options.set('version', positional[0]);
  for (const required of spec.required) if (!options.has(required)) fail(`missing required option: --${required}`);
  for (const [pathName, digestName] of spec.pairs ?? []) {
    if (options.has(pathName) !== options.has(digestName)) fail(`--${pathName} and --${digestName} must be adjacent receipt inputs`);
  }
  if (options.get('plugin') !== PLUGIN || options.get('version') !== VERSION) fail(`--${mode} is only valid for session-relay ${VERSION}`);
  for (const [pathName, digestName] of [...(spec.pairs ?? []), ...receiptPairs(spec.required)]) {
    if (options.has(pathName)) {
      const pathIndex = argv.indexOf(`--${pathName}`);
      if (argv[pathIndex + 2] !== `--${digestName}`) fail(`--${pathName} must be immediately followed by --${digestName}`);
    }
  }
  return { mode, options };
}

export async function dispatchSessionRelayRelease(argv = process.argv.slice(2)) {
  const fixture = process.env.SESSION_RELAY_RELEASE_FIXTURE || process.env.SESSION_RELAY_RELEASE_REPORT;
  if (Boolean(process.env.SESSION_RELAY_RELEASE_FIXTURE) !== Boolean(process.env.SESSION_RELAY_RELEASE_REPORT)) fail('fixture and report environment variables must be provided together');
  let parsed;
  let parseError;
  try { parsed = parseMode(argv); } catch (error) { parseError = error; }
  if (fixture) return runFixture(argv, parsed, parseError);
  if (parseError) throw parseError;
  if (!parsed) {
    if (positionalPlugin(argv) === PLUGIN) fail('Session Relay positional release syntax is disabled; use --prepare');
    return null;
  }
  if (parsed.mode !== 'resume-promotion') assertReceiptOutputFree(parsed.options);
  let result;
  switch (parsed.mode) {
    case 'prepare': result = prepare(parsed.options, []); break;
    case 'materialize-tdd-red': result = materialize(parsed.options); break;
    case 'verify-embedded-preparation': result = verifyEmbedded(parsed.options); break;
    case 'verify-source-ci': result = verifySourceCi(parsed.options); break;
    case 'check-prepared': result = checkPrepared(parsed.options); break;
    case 'bind-completion': result = bindCompletion(parsed.options); break;
    case 'publish-reviewed': result = publishReviewed(parsed.options); break;
    case 'emit-public-request': result = emitPublicRequest(parsed.options); break;
    case 'verify-public-release': result = verifyPublicRelease(parsed.options); break;
    case 'promote-reviewed': result = promoteReviewed(parsed.options, false); break;
    case 'resume-promotion': result = promoteReviewed(parsed.options, true); break;
    case 'finalize-reviewed': result = finalizeReviewed(parsed.options, undefined, validatePromotionReceiptForFinalization); break;
    default: fail(`unhandled release mode: ${parsed.mode}`);
  }
  return result ?? true;
}
