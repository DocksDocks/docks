import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const IO_KEYS = Object.freeze([
  'commit',
  'createRelease',
  'createTag',
  'ensureCleanTree',
  'ensureTool',
  'fileExists',
  'log',
  'push',
  'readJson',
  'readReleaseNotes',
  'resolveTagCommit',
  'runSelectedCi',
  'waitForTagCi',
  'writeJson',
]);

const RELEASE_POLICY_KEYS = Object.freeze({
  generic: Object.freeze(['install', 'kind']),
  'reviewed-session-relay': Object.freeze(['assets', 'install', 'kind', 'prereleaseBody']),
});
// The tag-CI result is the only evidence a release is published on, so it carries the
// identity of the run that produced it — not just a status. `runId` alone cannot be
// checked against anything; tag, commit, event, and creation time can.
const TAG_CI_RESULT_KEYS = Object.freeze(['commit', 'createdAt', 'event', 'ok', 'runId', 'tag']);

function sameKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

// GitHub stamps run creation with whole-second precision, so a run created in the same
// second as the push can report a timestamp milliseconds behind it. Compare at the
// second both clocks agree on; a stale run from an earlier push of the same tag is
// minutes away, never one second.
function createdAtOrAfter(createdAt, pushedAt) {
  const created = Date.parse(createdAt);
  const pushed = Date.parse(pushedAt);
  if (!Number.isFinite(created) || !Number.isFinite(pushed)) return false;
  return Math.floor(created / 1000) >= Math.floor(pushed / 1000);
}

function validatePushTimestamp(pushedAt, tag) {
  if (typeof pushedAt !== 'string' || !Number.isFinite(Date.parse(pushedAt))) {
    throw new Error(`tag push for ${tag} reported no usable push timestamp; a CI run cannot be bound to this push`);
  }
  return pushedAt;
}

// Deleting and re-pushing a tag (the recovery this script itself advises) leaves two push
// runs at one commit. A result that only proves "some run was green" would let the older
// one authorize the release, so every identity field is re-checked here against what this
// release pushed: same tag, same commit, a push event, and created no earlier than the
// push. Anything short of that is malformed, not merely unusual.
function validateTagCiResult(result, { tag, commit, pushedAt }) {
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    !sameKeys(result, TAG_CI_RESULT_KEYS) ||
    typeof result.ok !== 'boolean' ||
    typeof result.runId !== 'string' ||
    !/^[1-9][0-9]*$/.test(result.runId) ||
    result.tag !== tag ||
    result.commit !== commit ||
    result.event !== 'push' ||
    typeof result.createdAt !== 'string' ||
    !createdAtOrAfter(result.createdAt, pushedAt)
  ) {
    throw new Error(
      `tag CI result for ${tag} is malformed; an explicit green result from the run this push created is required`,
    );
  }
  return result;
}

function validateReleasePolicy(plugin) {
  const release = plugin?.release;
  if (!release || typeof release !== 'object' || Array.isArray(release)) {
    throw new Error(`plugin ${plugin?.name ?? '<unknown>'} is missing a closed release policy`);
  }
  if (!Object.hasOwn(RELEASE_POLICY_KEYS, release.kind)) {
    throw new Error(`plugin ${plugin?.name ?? '<unknown>'} has unknown release policy kind: ${String(release.kind)}`);
  }
  if (typeof release.install !== 'string' || release.install.trim() === '') {
    throw new Error(`plugin ${plugin?.name ?? '<unknown>'} release install must be a non-empty string`);
  }
  if (release.kind === 'reviewed-session-relay') {
    if (
      !Array.isArray(release.assets) ||
      release.assets.length === 0 ||
      release.assets.some((asset) => typeof asset !== 'string' || asset === '')
    ) {
      throw new Error(`plugin ${plugin?.name ?? '<unknown>'} reviewed release assets must be a non-empty string array`);
    }
    if (typeof release.prereleaseBody !== 'string' || release.prereleaseBody.trim() === '') {
      throw new Error(`plugin ${plugin?.name ?? '<unknown>'} reviewed prerelease body must be a non-empty string`);
    }
  }
  if (!sameKeys(release, RELEASE_POLICY_KEYS[release.kind])) {
    const unexpected = Object.keys(release).find((key) => !RELEASE_POLICY_KEYS[release.kind].includes(key));
    const missing = RELEASE_POLICY_KEYS[release.kind].find((key) => !Object.hasOwn(release, key));
    throw new Error(
      `plugin ${plugin?.name ?? '<unknown>'} must use a closed release policy; ${
        unexpected ? `unexpected release policy field: ${unexpected}` : `missing release policy field: ${missing}`
      }`,
    );
  }
}

export function validateReleaseRegistry(plugins) {
  if (!Array.isArray(plugins) || plugins.length === 0) throw new Error('plugin registry is empty');
  for (const plugin of plugins) validateReleasePolicy(plugin);
}

function validateIo(io) {
  if (!io || typeof io !== 'object' || !sameKeys(io, IO_KEYS)) {
    throw new Error(`generic release IO must be the exact closed adapter: ${IO_KEYS.join(', ')}`);
  }
  for (const operation of IO_KEYS) {
    if (typeof io[operation] !== 'function')
      throw new Error(`generic release IO operation must be a function: ${operation}`);
  }
}

export function resolveGenericReleaseIo({ fixtureConfigured, createIo }) {
  if (typeof fixtureConfigured !== 'boolean') throw new Error('fixtureConfigured must be a boolean');
  if (typeof createIo !== 'function') throw new Error('generic release IO factory must be a function');
  return fixtureConfigured ? undefined : createIo();
}

export function resolveReleaseFixtureConfiguration({ fixturePath, reportPath }) {
  const fixturePresent = fixturePath !== undefined;
  const reportPresent = reportPath !== undefined;
  if (!fixturePresent && !reportPresent) return false;
  if (
    !fixturePresent ||
    !reportPresent ||
    typeof fixturePath !== 'string' ||
    fixturePath.length === 0 ||
    typeof reportPath !== 'string' ||
    reportPath.length === 0
  ) {
    throw new Error('fixture and report environment variables must both be non-empty');
  }
  return true;
}

function resolvePlugin(pluginName, plugins) {
  const plugin = plugins.find((candidate) => candidate.name === pluginName);
  if (!plugin) throw new Error(`unknown plugin: ${pluginName} (known: ${plugins.map(({ name }) => name).join(', ')})`);
  return plugin;
}

function fixturePlugin(argv, plugins) {
  if (!Array.isArray(argv)) throw new Error('release argv must be an array');
  const pluginIndex = argv.indexOf('--plugin');
  const pluginName = pluginIndex < 0 ? 'docks' : argv[pluginIndex + 1];
  return plugins.find((candidate) => candidate.name === pluginName);
}

function selectedPlugin(argv, plugins) {
  if (!Array.isArray(argv)) throw new Error('release argv must be an array');
  let pluginName = 'docks';
  let pluginSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--plugin') continue;
    if (pluginSeen) throw new Error('duplicate generic release option: --plugin');
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) {
      throw new Error('generic release option --plugin requires a plugin name');
    }
    pluginSeen = true;
    pluginName = value;
    index += 1;
  }
  return resolvePlugin(pluginName, plugins);
}

function parseGenericArgs(argv, plugins) {
  if (!Array.isArray(argv)) throw new Error('generic release argv must be an array');
  let dryRun = false;
  let dryRunSeen = false;
  let pluginName = 'docks';
  let pluginSeen = false;
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--plugin') {
      if (pluginSeen) throw new Error('duplicate generic release option: --plugin');
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.startsWith('--')) {
        throw new Error('generic release option --plugin requires a plugin name');
      }
      pluginSeen = true;
      pluginName = value;
      index += 1;
    } else if (argument === '--dry-run') {
      if (dryRunSeen) throw new Error('duplicate generic release option: --dry-run');
      dryRunSeen = true;
      dryRun = true;
    } else if (argument.startsWith('--')) {
      throw new Error(`unknown generic release option: ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  const plugin = resolvePlugin(pluginName, plugins);
  if (plugin.release.kind === 'reviewed-session-relay') {
    throw new Error(
      'Session Relay uses its reviewed release flow; positional Session Relay releases are not supported',
    );
  }
  if (positional.length > 1)
    throw new Error(`generic release accepts one version argument, received ${positional.length}`);
  const versionArgument = positional[0];
  if (!versionArgument) throw new Error('missing version arg (use X.Y.Z, patch, minor, or major)');
  if (!['patch', 'minor', 'major'].includes(versionArgument) && !/^\d+\.\d+\.\d+$/.test(versionArgument)) {
    throw new Error(`version must be X.Y.Z, patch, minor, or major (got: ${versionArgument})`);
  }
  return { dryRun, plugin, versionArgument };
}

function nextVersion(current, requested) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current || '');
  if (!match) throw new Error(`current version not semver: ${current}`);
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  let version;
  if (requested === 'major') version = `${major + 1}.0.0`;
  else if (requested === 'minor') version = `${major}.${minor + 1}.0`;
  else if (requested === 'patch') version = `${major}.${minor}.${patch + 1}`;
  else if (/^\d+\.\d+\.\d+$/.test(requested)) version = requested;
  else throw new Error(`version must be X.Y.Z, patch, minor, or major (got: ${requested})`);
  if (version === current) throw new Error(`new version equals current (${current})`);
  return version;
}

function formattedJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function previewJsonWrite({ original, after, file, repo, io }) {
  const originalLines = original.split('\n');
  const output = formattedJson(after);
  const changed = output
    .split('\n')
    .filter((line, index) => line !== originalLines[index])
    .map((line) => line.trim());
  io.log(
    `  [dry-run] would write ${path.relative(repo, file)} (changed: ${changed.join(' | ') || 'none — formatting drift!'})`,
  );
}

function reportedFailure(message) {
  const error = new Error(message);
  error.releaseFailureReported = true;
  return error;
}

export async function dispatchPluginRelease({ argv, repo, plugins, io, dispatchFixture, dispatchReviewed }) {
  validateReleaseRegistry(plugins);
  if (dispatchFixture !== undefined) {
    if (typeof dispatchFixture !== 'function') throw new Error('release fixture dispatcher must be a function');
    const candidate = fixturePlugin(argv, plugins);
    if (candidate?.release.kind === 'generic') parseGenericArgs(argv, plugins);
    const fixture = await dispatchFixture(argv);
    if (fixture !== null) return fixture;
  }
  const plugin = selectedPlugin(argv, plugins);
  if (plugin.release.kind !== 'reviewed-session-relay') {
    return runGenericPluginRelease({ argv, repo, plugins, io });
  }
  if (typeof dispatchReviewed !== 'function') {
    throw new Error('reviewed release dispatcher must be a function');
  }
  const reviewed = await dispatchReviewed(argv);
  if (reviewed === null) {
    throw new Error(`reviewed release dispatcher did not handle plugin ${plugin.name}`);
  }
  return reviewed;
}

export async function runGenericPluginRelease({ argv, repo, plugins, io }) {
  validateReleaseRegistry(plugins);
  if (!Array.isArray(argv)) throw new Error('generic release argv must be an array');
  const { dryRun, plugin, versionArgument } = parseGenericArgs(argv, plugins);
  validateIo(io);

  const pluginJson = path.join(repo, `${plugin.root}/.claude-plugin/plugin.json`);
  const marketplaceJson = path.join(repo, '.claude-plugin/marketplace.json');
  const codexPluginJson = path.join(repo, `${plugin.root}/.codex-plugin/plugin.json`);
  const pluginPath = `./${plugin.root}`;

  if (!dryRun && !io.ensureTool('gh')) throw new Error('gh is required');
  if (!dryRun && !io.ensureTool('claude')) throw new Error('claude is required');
  if (!io.fileExists(pluginJson)) throw new Error(`plugin.json not found at ${pluginJson}`);
  if (!io.fileExists(marketplaceJson)) throw new Error(`marketplace.json not found at ${marketplaceJson}`);
  if (!dryRun && !io.ensureCleanTree()) throw new Error('working tree dirty — commit/stash first');

  io.log(`Running local ci.mjs for ${plugin.name}...`);
  const ciResult = await io.runSelectedCi(plugin, ['-q', '--plugin', plugin.name]);
  if ((ciResult?.status ?? 1) !== 0) {
    throw new Error(`scripts/ci.mjs --plugin ${plugin.name} failed — fix issues before releasing (see ci.mjs output)`);
  }
  io.log('');

  const pluginManifest = await io.readJson(pluginJson);
  const currentVersion = pluginManifest.version;
  const newVersion = nextVersion(currentVersion, versionArgument);
  io.log(`Bumping ${plugin.name}: ${currentVersion} → ${newVersion}`);

  const pluginOriginal = dryRun ? formattedJson(pluginManifest) : null;
  pluginManifest.version = newVersion;
  if (dryRun) previewJsonWrite({ original: pluginOriginal, after: pluginManifest, file: pluginJson, repo, io });
  else await io.writeJson(pluginJson, pluginManifest);

  const marketplace = await io.readJson(marketplaceJson);
  const marketplaceOriginal = dryRun ? formattedJson(marketplace) : null;
  const marketplacePlugin = marketplace.plugins.find((candidate) => candidate.name === plugin.name);
  if (marketplacePlugin) marketplacePlugin.version = newVersion;
  if (dryRun) previewJsonWrite({ original: marketplaceOriginal, after: marketplace, file: marketplaceJson, repo, io });
  else await io.writeJson(marketplaceJson, marketplace);

  const codexFiles = [];
  if (plugin.codex && io.fileExists(codexPluginJson)) {
    const codexManifest = await io.readJson(codexPluginJson);
    const codexOriginal = dryRun ? formattedJson(codexManifest) : null;
    codexManifest.version = newVersion;
    if (dryRun) previewJsonWrite({ original: codexOriginal, after: codexManifest, file: codexPluginJson, repo, io });
    else await io.writeJson(codexPluginJson, codexManifest);
    codexFiles.push(path.relative(repo, codexPluginJson));
  }

  const addFiles = [`${plugin.root}/.claude-plugin/plugin.json`, '.claude-plugin/marketplace.json', ...codexFiles];
  const tag = `${plugin.name}--v${newVersion}`;
  if (dryRun) {
    io.log(`  [dry-run] git add ${addFiles.join(' ')}`);
    io.log(`  [dry-run] git commit -m "chore(release): ${plugin.name} v${newVersion}"`);
    io.log('  [dry-run] git push origin HEAD');
    io.log(`  [dry-run] claude plugin tag --push --message "${plugin.name} plugin %s" ${pluginPath}`);
    io.log(`  [dry-run] wait for tag-CI on ${tag}, then gh release create (gated on CI green)`);
    io.log('\n[dry-run] OK — no changes written, no tag, no release.');
    return true;
  }

  await io.commit(addFiles, `chore(release): ${plugin.name} v${newVersion}`);
  await io.push();
  // The tag push reports when it happened; the CI run this release waits on must be the
  // one that push created, so the timestamp travels with the tag rather than being
  // inferred from whatever run happens to be listed first.
  const pushedAt = validatePushTimestamp(await io.createTag(tag), tag);
  const tagCommit = await io.resolveTagCommit(tag);

  io.log(`\nWaiting for CI on tag ${tag} (commit ${tagCommit}, pushed ${pushedAt})...`);
  const ci = validateTagCiResult(await io.waitForTagCi(tag, tagCommit, pushedAt), {
    tag,
    commit: tagCommit,
    pushedAt,
  });
  if (ci.ok !== true) {
    const runId = ci.runId;
    io.log(`\n✘ CI failed for ${tag} — NOT creating GitHub Release.\n`);
    io.log('To recover:');
    io.log(`  1. Investigate: gh run view ${runId} --log-failed`);
    io.log('  2. Fix on a follow-up commit, then either:');
    io.log(`       a) bump version again: node scripts/release.mjs --plugin ${plugin.name} patch`);
    io.log('       b) or move the tag (loses immutability):');
    io.log(
      `            git tag -d ${tag} && git push origin :refs/tags/${tag} && node scripts/release.mjs --plugin ${plugin.name} ${newVersion}`,
    );
    throw reportedFailure(`CI failed for ${tag}`);
  }

  const releaseNotes = await io.readReleaseNotes(plugin);
  const previousTag = typeof releaseNotes === 'string' ? '' : releaseNotes.previousTag;
  const notes = typeof releaseNotes === 'string' ? releaseNotes : releaseNotes.notes;
  const header = previousTag ? `Changes since \`${previousTag}\`:` : '';
  await io.createRelease({
    tag,
    title: `${plugin.name} v${newVersion}`,
    notes: `${header}\n\n${notes}\n\n## Install\n\n\`\`\`\n${plugin.release.install}\n\`\`\``,
  });

  io.log(
    `\n✔ Released ${plugin.name} v${newVersion} (CI green)\n  Tag:    ${tag}\n  Github: https://github.com/DocksDocks/docks/releases/tag/${tag}`,
  );
  return true;
}

export function createGenericPluginReleaseIo({ repo, plugins }) {
  const capture = (command, args) => spawnSync(command, args, { encoding: 'utf8', cwd: repo });
  const run = (command, args) => {
    const result = spawnSync(command, args, { stdio: 'inherit', cwd: repo });
    if ((result.status ?? 1) !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
  };
  const pluginForTag = (tag) => {
    const plugin = plugins.find((candidate) => tag.startsWith(`${candidate.name}--v`));
    if (!plugin) throw new Error(`release tag has no plugin descriptor: ${tag}`);
    return plugin;
  };
  // GitHub's own clock, read immediately before the push, is what run creation times are
  // stamped against, so binding the wait to it removes local clock skew from the
  // comparison entirely. When the header cannot be read, local time stands in: it can
  // only be late, which makes the poll wait for a run it will not accept and time out —
  // never early enough to accept a run some earlier push of this tag produced.
  const githubNow = () => {
    const response = capture('gh', ['api', 'rate_limit', '--include']);
    if ((response.status ?? 1) !== 0) return null;
    const header = /^date:[ \t]*(.+)$/im.exec(response.stdout ?? '');
    const parsed = header ? Date.parse(header[1].trim()) : Number.NaN;
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  };

  return Object.freeze({
    commit(files, message) {
      run('git', ['add', ...files]);
      run('git', ['commit', '-m', message]);
    },
    createRelease({ tag, title, notes }) {
      run('gh', ['release', 'create', tag, '--title', title, '--notes', notes]);
    },
    createTag(tag) {
      const plugin = pluginForTag(tag);
      const pushedAt = githubNow() ?? new Date().toISOString();
      run('claude', ['plugin', 'tag', '--push', '--message', `${plugin.name} plugin %s`, `./${plugin.root}`]);
      return pushedAt;
    },
    ensureCleanTree() {
      return capture('git', ['status', '--porcelain']).stdout.trim() === '';
    },
    ensureTool(tool) {
      return !spawnSync(tool, ['--version'], { stdio: 'ignore' }).error;
    },
    fileExists(file) {
      return fs.existsSync(file);
    },
    log(message) {
      console.log(message);
    },
    push() {
      run('git', ['push', 'origin', 'HEAD']);
    },
    readJson(file) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    },
    readReleaseNotes(plugin) {
      const previousTag =
        capture('git', ['tag', '--list', `${plugin.name}--v*`, '--sort=-version:refname'])
          .stdout.trim()
          .split('\n')[1] || '';
      const notes = previousTag
        ? capture('git', ['log', `${previousTag}..HEAD`, '--pretty=format:- %s', '--no-merges']).stdout
        : 'Initial release.';
      return { previousTag, notes };
    },
    resolveTagCommit(tag) {
      return capture('git', ['rev-parse', `${tag}^{commit}`]).stdout.trim();
    },
    runSelectedCi(_plugin, ciArgs) {
      return spawnSync('node', [path.join(repo, 'scripts/ci.mjs'), ...ciArgs], { stdio: 'inherit' });
    },
    // `headBranch` carries the pushed ref's short name, so for a tag push it is the tag
    // itself (verified against `gh run list --json headBranch` on this repository: every
    // push run reports its `<plugin>--v<version>` tag). Commit plus event alone cannot
    // distinguish the run this push created from the one an earlier push of the same tag
    // left behind, and that older run is usually already complete and green.
    //
    // So: match on tag, commit, event, AND creation at or after this push, and require
    // the match to be unique. No match keeps polling; several matches is an ambiguity a
    // release may not resolve by guessing, so it stops. `--limit` is raised because a
    // busy repository can push the run off the default page — with identity this exact,
    // a wider page can only find the right run, never the wrong one.
    waitForTagCi(tag, commit, pushedAt) {
      validatePushTimestamp(pushedAt, tag);
      let identified = null;
      for (let index = 0; index < 30; index += 1) {
        const listed = capture('gh', [
          'run',
          'list',
          '--workflow=ci.yml',
          '--limit',
          '100',
          '--json',
          'databaseId,headSha,headBranch,event,createdAt',
        ]);
        if ((listed.status ?? 1) !== 0) {
          throw new Error(
            `gh run list failed while identifying the CI run for ${tag}: ${(listed.stderr ?? '').trim()}`,
          );
        }
        let runs;
        try {
          runs = JSON.parse(listed.stdout || 'null');
        } catch {
          runs = null;
        }
        if (!Array.isArray(runs)) {
          throw new Error(`gh run list returned no run list while identifying the CI run for ${tag}`);
        }
        const matches = runs.filter(
          (candidate) =>
            candidate?.event === 'push' &&
            candidate?.headSha === commit &&
            candidate?.headBranch === tag &&
            typeof candidate?.createdAt === 'string' &&
            createdAtOrAfter(candidate.createdAt, pushedAt),
        );
        if (matches.length > 1) {
          throw new Error(
            `${matches.length} CI runs match tag ${tag} at ${commit} since ${pushedAt} (${matches
              .map((candidate) => candidate.databaseId)
              .join(', ')}) — identify which run gates this tag before releasing`,
          );
        }
        if (matches.length === 1) {
          identified = matches[0];
          break;
        }
        spawnSync('sleep', ['2']);
      }
      if (!identified) {
        throw new Error(`no CI run appeared for ${tag} after 60s — check Actions manually before releasing`);
      }
      const runId = String(identified.databaseId);
      console.log(`Watching CI run ${runId}...\n  https://github.com/DocksDocks/docks/actions/runs/${runId}`);
      const result = spawnSync('gh', ['run', 'watch', runId, '--exit-status'], { stdio: 'inherit', cwd: repo });
      return {
        ok: (result.status ?? 1) === 0,
        runId,
        tag: identified.headBranch,
        commit: identified.headSha,
        event: identified.event,
        createdAt: identified.createdAt,
      };
    },
    writeJson(file, value) {
      fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    },
  });
}
