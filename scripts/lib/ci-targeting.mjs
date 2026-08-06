import { byName, PLUGINS } from './plugins.mjs';

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
  if (eventName !== 'pull_request') return { lanes: everything(), reason: `event-is-not-a-pull-request:${eventName}` };
  if (baseResolved !== true) return { lanes: everything(), reason: 'base-sha-unresolved' };
  if (!Array.isArray(changedPaths)) throw new Error('changedPaths must be an array');
  const paths = changedPaths.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (paths.length === 0) return { lanes: everything(), reason: 'empty-diff' };
  const selected = new Set([REPO_WIDE_LANE]);
  for (const changedPath of paths) {
    const owner = pluginOwningPath(changedPath);
    if (owner === null) return { lanes: everything(), reason: `path-outside-every-plugin-root:${changedPath}` };
    selected.add(assertPluginCiLane(owner));
  }
  return { lanes: CI_LANES.filter((lane) => selected.has(lane)), reason: 'diff-scoped' };
}

// Every registry plugin must resolve to a shard the pull-request matrix can run,
// and the repo-wide shard must be in every selection. Derived from the registry so
// a fifth plugin added without a usable `ciLane` fails here instead of quietly
// riding into a release on a topology nothing gates.
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
  return [...CI_LANES];
}
