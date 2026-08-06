import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { byName, PLUGINS } from './plugins.mjs';

// Resolved from this module's own location, never from `process.cwd()`: the
// release-preparation source-CI pin calls the topology assertion from wherever the
// release runs, and a cwd-relative root would silently enumerate nothing there.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLUGIN_TREE_ROOT = 'plugins';

const SEMVER = '(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)';
const RELEASE_TAG = new RegExp(`^([a-z0-9]+(?:-[a-z0-9]+)*)--v${SEMVER}$`);

// Shard identity used by both `ci.mjs --lane <name>` and the pull-request matrix.
// `repo` is the always-on shard: it carries every check that is not scoped to one
// plugin (workflow YAML, the marketplace catalogs, the context-tree guard,
// no-bespoke-gates, the test-contract registry, unit tests, the CI targeting
// contract), so a pull request that skips every plugin shard still runs all of
// them. `core` and `relay` are pure plugin shards; a plugin declares which one
// owns it through its `ciLane`, and no plugin may declare `repo`.
export const CI_LANES = Object.freeze(['repo', 'core', 'relay']);
export const REPO_WIDE_LANE = 'repo';
const PLUGIN_CI_LANES = new Set(['core', 'relay']);

const CI_LANE_DESCRIPTORS = Object.freeze({
  repo: Object.freeze({ repoWide: true }),
  core: Object.freeze({ repoWide: false }),
  relay: Object.freeze({ repoWide: false }),
});

function knownNames(plugins) {
  return plugins.map((plugin) => plugin.name).join(', ');
}

function assertPluginCiLane(plugin) {
  if (!Object.hasOwn(plugin, 'ciLane')) {
    throw new Error(`plugin ${plugin.name} is missing required ciLane`);
  }
  if (!PLUGIN_CI_LANES.has(plugin.ciLane)) {
    throw new Error(
      `plugin ${plugin.name} has unknown ciLane: ${String(plugin.ciLane)} (known: ${[...PLUGIN_CI_LANES].join(', ')})`,
    );
  }
  return plugin.ciLane;
}

function pluginNamesForCiLane(lane) {
  const names = [];
  for (const plugin of PLUGINS) {
    if (assertPluginCiLane(plugin) === lane) names.push(plugin.name);
  }
  return names;
}

export function resolveCiTargets(plugins, onlyPlugin) {
  if (!Array.isArray(plugins) || plugins.length === 0) throw new Error('plugin registry is empty');
  if (onlyPlugin === null) return [...plugins];
  const selected = plugins.find((plugin) => plugin.name === onlyPlugin);
  if (!selected) throw new Error(`unknown plugin: ${onlyPlugin} (known: ${knownNames(plugins)})`);
  return [selected];
}

export function resolveCiLane(presentPlugins, lane) {
  if (!Object.hasOwn(CI_LANE_DESCRIPTORS, lane)) {
    throw new Error(`unknown CI lane: ${lane} (known: ${CI_LANES.join(', ')})`);
  }
  const descriptor = CI_LANE_DESCRIPTORS[lane];
  const targets = pluginNamesForCiLane(lane).map((name) => resolveCiTargets(presentPlugins, name)[0]);
  return {
    name: lane,
    targets,
    repoWide: descriptor.repoWide,
  };
}

export function selectedAuthorChecks(targets) {
  const checks = new Set();
  for (const plugin of targets) {
    if (!Array.isArray(plugin.authorChecks)) throw new Error(`plugin ${plugin.name} authorChecks must be an array`);
    for (const check of plugin.authorChecks) checks.add(check);
  }
  return checks;
}

export function parseReleaseTag(tag) {
  const match = RELEASE_TAG.exec(tag);
  if (!match) throw new Error(`invalid release tag: ${tag}`);
  const plugin = byName(match[1]);
  if (!plugin) throw new Error(`unknown plugin in release tag: ${match[1]} (known: ${knownNames(PLUGINS)})`);
  return {
    plugin: plugin.name,
    version: `${match[2]}.${match[3]}.${match[4]}`,
    needsRust: plugin.rust !== null,
  };
}

export function releaseCiArgs(pluginName) {
  resolveCiTargets(PLUGINS, pluginName);
  return ['-q', '--plugin', pluginName];
}

export function workflowCiSelection(eventName, refName) {
  if (eventName === 'pull_request' || eventName === 'workflow_dispatch') {
    return { mode: 'full', plugin: null, needsRust: true };
  }
  if (eventName === 'push') {
    const tag = parseReleaseTag(refName);
    return { mode: 'targeted', plugin: tag.plugin, needsRust: tag.needsRust };
  }
  throw new Error(`unsupported workflow event: ${eventName}`);
}

// The plugin whose root owns `changedPath`, or null when no plugin does. The
// roots come from the registry in plugins.mjs, never from a list duplicated into
// YAML: adding a plugin must not require editing the workflow.
function pluginOwningPath(changedPath) {
  for (const plugin of PLUGINS) {
    if (changedPath === plugin.root || changedPath.startsWith(`${plugin.root}/`)) return plugin;
  }
  return null;
}

// Which shards a pull request must run.
//
// FAIL OPEN TO THE FULL GATE, NEVER TO NOTHING. Four situations return every
// shard: the event is not a pull request, the base SHA could not be resolved, the
// diff is empty, and any changed path falls outside every plugin root (a change to
// scripts/, .github/, or the lockfile implicates everything). A shard is dropped
// only after a positive, successful determination that nothing it owns changed,
// because the opposite default fails silently and severely: a green pull request
// that gated none of its own changes. `reason` is emitted into the job log so the
// determination is always auditable after the fact.
export function resolveShardSelection({ eventName, baseResolved, changedPaths }) {
  const everything = () => [...CI_LANES];
  // Last line of defence: no branch above may return a selection that gates
  // nothing. `fromJSON('[]')` produces zero matrix instances, GitHub reports the
  // shard job as `skipped`, and a skipped shard is only legitimate where the job's
  // own `if:` makes it so - so an empty or repo-less selection is a silent hole.
  // Throwing fails `resolve-shards`, which the `validate` join already rejects.
  const gated = (selection) => {
    const { lanes, reason } = selection;
    if (!Array.isArray(lanes) || lanes.length === 0)
      throw new Error(`shard selection (${reason}) gates nothing: it must never be empty`);
    if (!lanes.includes(REPO_WIDE_LANE))
      throw new Error(`shard selection (${reason}) omits the repo-wide shard ${REPO_WIDE_LANE}`);
    return selection;
  };
  if (eventName !== 'pull_request')
    return gated({ lanes: everything(), reason: `event-is-not-a-pull-request:${eventName}` });
  if (baseResolved !== true) return gated({ lanes: everything(), reason: 'base-sha-unresolved' });
  if (!Array.isArray(changedPaths)) throw new Error('changedPaths must be an array');
  const paths = changedPaths.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (paths.length === 0) return gated({ lanes: everything(), reason: 'empty-diff' });
  const selected = new Set([REPO_WIDE_LANE]);
  for (const changedPath of paths) {
    const owner = pluginOwningPath(changedPath);
    if (owner === null) return gated({ lanes: everything(), reason: `path-outside-every-plugin-root:${changedPath}` });
    selected.add(assertPluginCiLane(owner));
  }
  return gated({ lanes: CI_LANES.filter((lane) => selected.has(lane)), reason: 'diff-scoped' });
}

// Entries under `plugins/` that git does not consider repository content. Asked of
// git rather than hard-coded, because a denylist of "incidental" names is exactly
// how a real plugin tree gets waved through: it grows one plausible entry at a time
// and nobody re-reads it. `.gitignore` is the repository's own, reviewable answer to
// "is this content?", and an entry can only join it through a visible diff - one that
// also removes the tree from every pull-request diff, so it can smuggle nothing.
//
// Git unavailable or erroring is NOT evidence of absence: we then ignore nothing, so
// every entry present must be registered. Wrong answers there cost a loud failure,
// never a silent pass.
function gitIgnoredEntries(names, repoRoot) {
  if (names.length === 0) return new Set();
  const probe = spawnSync('git', ['-C', repoRoot, 'check-ignore', '--stdin'], {
    input: names.map((name) => `${PLUGIN_TREE_ROOT}/${name}\n`).join(''),
    encoding: 'utf8',
  });
  // 0 = some paths ignored, 1 = none ignored. Anything else (128, ENOENT, a signal)
  // is an unanswered question, not a clean sheet.
  if (probe.error || (probe.status !== 0 && probe.status !== 1)) return new Set();
  return new Set(
    probe.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.slice(`${PLUGIN_TREE_ROOT}/`.length)),
  );
}

// The direction the lane topology cannot see: disk to registry. A `plugins/<new>/`
// tree with no descriptor owns no shard, so every lane gates the plugins the registry
// lists and none of the new one - a green pull request that validated no part of the
// plugin it added. Both directions are asserted, because a descriptor left behind for
// a deleted tree is the same defect mirrored: the shard resolver keeps routing diffs
// to a root that no longer exists.
//
// Symlinks are neither followed nor skipped: any rule that skipped them would let
// `ln -s ../elsewhere plugins/foo` hide a whole tree from validation. Every entry,
// whatever its type, must be a registered plugin root.
export function assertPluginTreesAreRegistered(repoRoot = REPO_ROOT) {
  const entries = fs.readdirSync(path.join(repoRoot, PLUGIN_TREE_ROOT)).sort();
  const ignored = gitIgnoredEntries(entries, repoRoot);
  const registered = new Map(PLUGINS.map((plugin) => [plugin.root, plugin.name]));
  const content = entries.filter((entry) => !ignored.has(entry)).map((entry) => `${PLUGIN_TREE_ROOT}/${entry}`);
  for (const root of content) {
    if (!registered.has(root))
      throw new Error(
        `unregistered plugin tree ${root}: no shard gates it. Add a descriptor for it to ` +
          `scripts/lib/plugins.mjs (with a ciLane), or remove the directory.`,
      );
  }
  const present = new Set(entries.map((entry) => `${PLUGIN_TREE_ROOT}/${entry}`));
  for (const [root, name] of registered) {
    if (!present.has(root))
      throw new Error(
        `registry plugin ${name} declares root ${root}, which does not exist on disk: the shard ` +
          `resolver routes diffs to a tree that is gone. Remove the descriptor from scripts/lib/plugins.mjs.`,
      );
  }
  return content;
}

// Every registry plugin must resolve to a shard the pull-request matrix can run,
// the repo-wide shard must be in every selection, and the trees on disk must be
// exactly the trees the registry knows. Derived from the registry so a fifth plugin
// added without a usable `ciLane` - or with no descriptor at all - fails here
// instead of quietly riding into a release on a topology nothing gates.
export function assertShardTopologyCoversRegistry() {
  for (const plugin of PLUGINS) {
    const lane = assertPluginCiLane(plugin);
    if (lane === REPO_WIDE_LANE) throw new Error(`plugin ${plugin.name} may not claim the repo-wide shard`);
    const { lanes } = resolveShardSelection({
      eventName: 'pull_request',
      baseResolved: true,
      changedPaths: [`${plugin.root}/probe`],
    });
    if (!lanes.includes(lane)) throw new Error(`plugin ${plugin.name} resolves to no shard that runs it`);
    if (!lanes.includes(REPO_WIDE_LANE)) throw new Error(`plugin ${plugin.name} resolves without the repo-wide shard`);
  }
  // The reverse direction, and the last thing the old literal `lane: [core, relay]`
  // still covered: a shard nobody owns. Without this a phantom lane could be added
  // here and every pull request would pay for a shard that gates nothing.
  const claimed = new Set([REPO_WIDE_LANE, ...PLUGINS.map((plugin) => plugin.ciLane)]);
  for (const lane of CI_LANES) {
    if (!claimed.has(lane)) throw new Error(`shard ${lane} is claimed by no registry plugin`);
  }
  const failOpen = resolveShardSelection({ eventName: 'pull_request', baseResolved: false, changedPaths: [] });
  for (const lane of CI_LANES) {
    if (!failOpen.lanes.includes(lane)) throw new Error(`unresolved base does not fail open to shard ${lane}`);
  }
  // Every branch of the resolver, asserted here so a branch added later that
  // returns an empty or repo-less selection cannot reach the matrix. The `gated`
  // guard inside the resolver throws on violation; this walks the branch table so
  // the throw is exercised rather than merely available.
  const branches = [
    ['not-a-pull-request', { eventName: 'push', baseResolved: true, changedPaths: [] }],
    ['unresolved-base', { eventName: 'pull_request', baseResolved: false, changedPaths: [] }],
    ['empty-diff', { eventName: 'pull_request', baseResolved: true, changedPaths: [] }],
    [
      'path-outside-every-plugin-root',
      { eventName: 'pull_request', baseResolved: true, changedPaths: ['scripts/ci.mjs'] },
    ],
    ['diff-scoped', { eventName: 'pull_request', baseResolved: true, changedPaths: [`${PLUGINS[0].root}/probe`] }],
  ];
  for (const [label, input] of branches) {
    const { lanes } = resolveShardSelection(input);
    if (lanes.length === 0) throw new Error(`resolver branch ${label} gates nothing`);
    if (!lanes.includes(REPO_WIDE_LANE)) throw new Error(`resolver branch ${label} omits the repo-wide shard`);
  }
  // Last, so the lane-specific diagnostics above still name their own cause: the
  // registry-to-lane and lane-to-registry directions are closed, and this closes
  // disk-to-registry. Wired here rather than into a new gate phase because every
  // caller that already trusts this function - the `--unit` targeting contract the
  // always-on `repo` lane runs on every pull request, the hosted
  // `targeting-contracts` job, and the release-preparation source-CI pin - must get
  // the third direction too, and one entry point cannot be wired to two of them.
  assertPluginTreesAreRegistered();
  return [...CI_LANES];
}

// ===================== the prerequisite join contract =====================
// `validate` runs on `always()`, so the only thing standing between a pull request
// and a green check is one shell step. Both the workflow contract test and the
// release-preparation source-CI pin assert it through this module, so the two
// cannot drift into asserting different things.
export const PREREQUISITE_ASSERTION_STEP_NAME = 'assert successful prerequisite jobs';

// The required result per event, read off each prerequisite job's own `if:`.
// `resolve-shards` and `validation-shards` are pull-request-only; `targeting-contracts`
// runs on everything but push. Any observed result outside this table is a topology
// drift and must fail the build.
export const PREREQUISITE_REQUIRED_RESULTS = Object.freeze({
  pull_request: Object.freeze({
    'resolve-shards': 'success',
    'validation-shards': 'success',
    'targeting-contracts': 'success',
  }),
  push: Object.freeze({
    'resolve-shards': 'skipped',
    'validation-shards': 'skipped',
    'targeting-contracts': 'skipped',
  }),
  workflow_dispatch: Object.freeze({
    'resolve-shards': 'skipped',
    'validation-shards': 'skipped',
    'targeting-contracts': 'success',
  }),
});

// The step, its shell, and the env keys it reads - all located in the parsed
// workflow rather than restated, so renaming an env key cannot silently orphan a
// caller. Every prerequisite is derived from the workflow's own job graph: a
// fourth job added to `jobs:` that the join does not read fails here.
export function extractPrerequisiteAssertion(workflow) {
  const jobs = workflow?.jobs;
  if (jobs === null || typeof jobs !== 'object') throw new Error('the workflow declares no jobs');
  const validateJob = jobs.validate;
  if (validateJob === null || typeof validateJob !== 'object') throw new Error('the workflow declares no validate job');
  const steps = Array.isArray(validateJob.steps) ? validateJob.steps : [];
  const step = steps.find((row) => row?.name === PREREQUISITE_ASSERTION_STEP_NAME);
  if (step === undefined)
    throw new Error(`the validate job declares no step named ${PREREQUISITE_ASSERTION_STEP_NAME}`);
  const env = step.env;
  if (env === null || typeof env !== 'object' || Array.isArray(env) || Object.keys(env).length === 0)
    throw new Error(`${PREREQUISITE_ASSERTION_STEP_NAME} declares no env block`);
  const shell = step.run;
  if (typeof shell !== 'string' || shell.trim().length === 0)
    throw new Error(`${PREREQUISITE_ASSERTION_STEP_NAME} declares no run body`);
  const keyFor = (expression) => {
    const matches = Object.entries(env).filter(([, value]) => String(value).includes(expression));
    if (matches.length !== 1)
      throw new Error(
        `${PREREQUISITE_ASSERTION_STEP_NAME} must read ${expression} into exactly one env var (found ${matches.length})`,
      );
    return matches[0][0];
  };
  const eventKey = keyFor('github.event_name');
  const prerequisites = Object.keys(jobs).filter((name) => name !== 'validate');
  const declaredNeeds = Array.isArray(validateJob.needs) ? validateJob.needs : [validateJob.needs].filter(Boolean);
  const resultKeys = {};
  for (const name of prerequisites) {
    if (!declaredNeeds.includes(name))
      throw new Error(`job ${name} is not a declared prerequisite of validate, so the join cannot gate it`);
    resultKeys[name] = keyFor(`needs.${name}.result`);
  }
  return { step, shell, env, eventKey, resultKeys, prerequisites };
}

// Execute the extracted shell with injected job results. The join is shell, so it
// is asserted by running it; comparing its text only asserts that nobody reformatted
// what the last author pasted in.
export function runPrerequisiteAssertion(extracted, { event, results }) {
  const env = { PATH: process.env.PATH, [extracted.eventKey]: event };
  for (const [name, result] of Object.entries(results)) {
    const key = extracted.resultKeys[name];
    if (key === undefined) throw new Error(`the join reads no env var for prerequisite ${name}`);
    env[key] = result;
  }
  const outcome = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', extracted.shell], { encoding: 'utf8', env });
  if (outcome.error) throw new Error(`the join shell could not be executed: ${outcome.error.message}`);
  return { status: outcome.status, stderr: outcome.stderr ?? '' };
}

// The property the join must hold, asserted by behaviour: every required-result row
// passes, and the reported defect - a pull request whose shard job was skipped, which
// is what an empty resolver matrix produces - is rejected. A weakened assertion cannot
// satisfy this no matter how it is spelled.
export function assertPrerequisiteJoinGatesItsEvent(workflow) {
  const extracted = extractPrerequisiteAssertion(workflow);
  for (const [event, results] of Object.entries(PREREQUISITE_REQUIRED_RESULTS)) {
    const outcome = runPrerequisiteAssertion(extracted, { event, results });
    if (outcome.status !== 0)
      throw new Error(`the join rejects the required result row for ${event}: ${outcome.stderr.trim()}`);
  }
  const defect = {
    event: 'pull_request',
    results: { ...PREREQUISITE_REQUIRED_RESULTS.pull_request, 'validation-shards': 'skipped' },
  };
  if (runPrerequisiteAssertion(extracted, defect).status === 0)
    throw new Error('the join accepts a pull request whose validation-shards job was skipped, gating nothing');
  return extracted;
}

// ===================== the authoritative gate's coverage =====================
// A release-tag push is the only CI a version bump ever gets: the bump commit goes
// straight to `main`, which this workflow has no trigger for, and the tag run gates
// with `--plugin <name>`, which skips every repo-wide phase. The repo-wide
// `.claude-plugin/marketplace.json` the bump edits would therefore ship validated by
// nothing. What the push leg must hold is a property - the released bytes get
// repo-wide validation exactly once, and the targeted plugin gate still has the last
// word - so the invocations are parsed and asked what they cover. Pinning the argv
// string instead would accept any later edit that keeps the spelling while changing
// the meaning, and reject a correct refactor that changes the spelling.
export const AUTHORITATIVE_GATE_STEP_NAME = 'run the authoritative gate (scripts/ci.mjs)';

const PUSH_EVENT_TEST = /github\.event_name\s*\}\}"\s*=\s*"push"/;

// Every `node scripts/ci.mjs` invocation in the step's shell, each tagged with the
// event branch that reaches it. Conditions are tracked as a stack so an invocation
// added to the wrong leg - or to no leg at all - is visible rather than averaged away.
export function extractCiGateInvocations(runScript) {
  if (typeof runScript !== 'string' || runScript.trim() === '')
    throw new Error(`${AUTHORITATIVE_GATE_STEP_NAME} declares no run body`);
  const stack = [];
  const invocations = [];
  let frames = 0;
  for (const raw of runScript.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const opened = /^if\s+(.+);\s*then$/.exec(line);
    if (opened !== null) {
      frames += 1;
      stack.push({ id: frames, condition: opened[1], elseSide: false });
      continue;
    }
    if (line === 'else' || line === 'else;') {
      if (stack.length === 0) throw new Error(`${AUTHORITATIVE_GATE_STEP_NAME} has an \`else\` outside any \`if\``);
      stack.at(-1).elseSide = true;
      continue;
    }
    if (line === 'fi') {
      if (stack.length === 0) throw new Error(`${AUTHORITATIVE_GATE_STEP_NAME} has a \`fi\` outside any \`if\``);
      stack.pop();
      continue;
    }
    const invoked = /^(.*?)node\s+scripts\/ci\.mjs\b(.*)$/.exec(line);
    if (invoked === null) continue;
    // Only environment assignments may precede the command. Anything else - a `printf`
    // that merely prints the text, a wrapper that swallows the exit status - means the
    // line names the gate without running it, which is the whole failure mode here.
    if (!/^([A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s"']*)\s+)*$/.test(invoked[1]))
      throw new Error(
        `${AUTHORITATIVE_GATE_STEP_NAME} names scripts/ci.mjs behind \`${invoked[1].trim()}\`, which does not run it`,
      );
    const eventFrames = stack.filter((frame) => PUSH_EVENT_TEST.test(frame.condition));
    const pushFrames = eventFrames.filter((frame) => !frame.elseSide);
    let branch = 'unconditional';
    if (eventFrames.length > pushFrames.length) branch = 'non-push';
    else if (pushFrames.length > 0) branch = 'push';
    invocations.push({
      prefix: invoked[1].trim(),
      args: invoked[2].trim(),
      branch,
      branchId: pushFrames.length > 0 ? pushFrames.at(-1).id : null,
    });
  }
  if (stack.length !== 0) throw new Error(`${AUTHORITATIVE_GATE_STEP_NAME} leaves ${stack.length} \`if\` unclosed`);
  if (invocations.length === 0) throw new Error(`${AUTHORITATIVE_GATE_STEP_NAME} never invokes scripts/ci.mjs`);
  return invocations;
}

export function assertAuthoritativeGateCoversReleasedBytes(runScript) {
  const invocations = extractCiGateInvocations(runScript);
  const targeted = /(^|\s)--(plugin|lane)(\s|=)/;
  const pushLegs = new Map();
  const nonPush = [];
  for (const invocation of invocations) {
    if (invocation.branch === 'unconditional')
      throw new Error(
        `${AUTHORITATIVE_GATE_STEP_NAME} invokes scripts/ci.mjs outside any event branch: ${invocation.args}`,
      );
    if (invocation.branch === 'non-push') {
      // Manual dispatch runs the whole gate; a narrowing flag here would silently drop
      // repo-wide work from the only unfiltered run this job ever performs.
      if (targeted.test(` ${invocation.args}`))
        throw new Error(
          `${AUTHORITATIVE_GATE_STEP_NAME} narrows its non-push leg to \`${invocation.args}\`; that leg must run the untargeted gate`,
        );
      nonPush.push(invocation);
      continue;
    }
    pushLegs.set(invocation.branchId, [...(pushLegs.get(invocation.branchId) ?? []), invocation]);
  }
  if (nonPush.length !== 1)
    throw new Error(
      `${AUTHORITATIVE_GATE_STEP_NAME} must run the untargeted gate exactly once off the push path, found ${nonPush.length}`,
    );
  if (pushLegs.size === 0)
    throw new Error(`${AUTHORITATIVE_GATE_STEP_NAME} has no push leg, so a release tag would gate nothing`);
  for (const [, leg] of pushLegs) {
    const repoWide = leg.filter((row) => new RegExp(`(^|\\s)--lane(\\s|=)${REPO_WIDE_LANE}(\\s|$)`).test(row.args));
    const plugin = leg.filter((row) => /(^|\s)--plugin(\s|=)/.test(row.args));
    if (repoWide.length !== 1)
      throw new Error(
        `a release-tag push leg must run the repo-wide shard (--lane ${REPO_WIDE_LANE}) exactly once, found ${repoWide.length}: ` +
          'the version bump it carries edits repo-wide bytes that no other run ever gates, and running it twice pays for the same evidence twice',
      );
    if (plugin.length !== 1)
      throw new Error(`a release-tag push leg must run the targeted plugin gate exactly once, found ${plugin.length}`);
    if (!/--plugin(\s|=)"\$\{\{ steps\.target\.outputs\.plugin \}\}"/.test(plugin[0].args))
      throw new Error('the release-tag push leg must gate the plugin the target resolver named, not a literal');
    if (leg.at(-1) !== plugin[0])
      throw new Error('the targeted plugin gate must remain the last word of the release-tag push leg');
    // One timing report per leg, written by the gate that owns it. `--timings-json`
    // names a single path that ci.mjs overwrites, so two invocations sharing it would
    // leave an artifact describing only whichever ran last.
    const timed = leg.filter((row) => /(^|\s)--timings-json(\s|=)/.test(row.args));
    if (timed.length !== 1 || timed[0] !== plugin[0])
      throw new Error(
        'exactly one release-tag push invocation may write the timing report, and it must be the targeted plugin gate: ' +
          'a second writer overwrites the first and the published artifact then describes only one of them',
      );
    // The repo-wide leg is the only ci.mjs call in the workflow without
    // `--timings-json`, which is also the only thing that would make it memo-eligible.
    // Evidence for released bytes must come from work actually done, so it declines the
    // memo explicitly rather than depending on the ambient environment never setting it.
    if (!/(^|\s)DOCKS_CI_MEMO=0(\s|$)/.test(repoWide[0].prefix))
      throw new Error(
        'the repo-wide release-tag invocation must run with DOCKS_CI_MEMO=0: without it a cached memo hit could satisfy the only repo-wide validation the released bytes ever get',
      );
    if (/(^|\s)--memo(\s|$)/.test(repoWide[0].args))
      throw new Error('the repo-wide release-tag invocation must not request the gate memo');
  }
  return { invocations, pushLegs: pushLegs.size };
}
