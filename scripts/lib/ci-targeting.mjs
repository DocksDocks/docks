import { byName, PLUGINS } from './plugins.mjs';

const SEMVER = '(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)';
const RELEASE_TAG = new RegExp(`^([a-z0-9]+(?:-[a-z0-9]+)*)--v${SEMVER}$`);

function knownNames(plugins) {
  return plugins.map((plugin) => plugin.name).join(', ');
}

export function resolveCiTargets(plugins, onlyPlugin) {
  if (!Array.isArray(plugins) || plugins.length === 0) throw new Error('plugin registry is empty');
  if (onlyPlugin === null) return [...plugins];
  const selected = plugins.find((plugin) => plugin.name === onlyPlugin);
  if (!selected) throw new Error(`unknown plugin: ${onlyPlugin} (known: ${knownNames(plugins)})`);
  return [selected];
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
