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
const TAG_CI_RESULT_KEYS = Object.freeze(['ok', 'runId']);

function sameKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validateTagCiResult(result, tag) {
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    !sameKeys(result, TAG_CI_RESULT_KEYS) ||
    typeof result.ok !== 'boolean' ||
    typeof result.runId !== 'string' ||
    result.runId.trim() === ''
  ) {
    throw new Error(`tag CI result for ${tag} is malformed; an explicit green result is required`);
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

function parseGenericArgs(argv, plugins) {
  const dryRun = argv.includes('--dry-run');
  const pluginIndex = argv.indexOf('--plugin');
  const pluginName = pluginIndex >= 0 ? argv[pluginIndex + 1] : 'docks';
  const plugin = plugins.find((candidate) => candidate.name === pluginName);
  if (!plugin) throw new Error(`unknown plugin: ${pluginName} (known: ${plugins.map(({ name }) => name).join(', ')})`);
  if (plugin.release.kind === 'reviewed-session-relay') {
    throw new Error(
      'Session Relay uses its reviewed release flow; positional Session Relay releases are not supported',
    );
  }
  const positional = argv.filter(
    (argument, index) => argument !== '--dry-run' && argument !== '--plugin' && argv[index - 1] !== '--plugin',
  );
  return { dryRun, plugin, versionArgument: positional[0] };
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

export async function dispatchPluginRelease({ argv, repo, plugins, io, dispatchReviewed }) {
  validateReleaseRegistry(plugins);
  if (typeof dispatchReviewed !== 'function') {
    throw new Error('reviewed release dispatcher must be a function');
  }
  const reviewed = await dispatchReviewed(argv);
  if (reviewed !== null) return reviewed;
  return runGenericPluginRelease({ argv, repo, plugins, io });
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

  if (!versionArgument) throw new Error('missing version arg (use X.Y.Z, patch, minor, or major)');
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
  await io.createTag(tag);
  const tagCommit = await io.resolveTagCommit(tag);

  io.log(`\nWaiting for CI on tag ${tag} (commit ${tagCommit})...`);
  const ci = validateTagCiResult(await io.waitForTagCi(tag, tagCommit), tag);
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
      run('claude', ['plugin', 'tag', '--push', '--message', `${plugin.name} plugin %s`, `./${plugin.root}`]);
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
    waitForTagCi(tag, commit) {
      let runId = '';
      for (let index = 0; index < 30; index += 1) {
        runId =
          capture('gh', [
            'run',
            'list',
            '--workflow=ci.yml',
            '--json',
            'databaseId,headSha,event',
            '--jq',
            `.[] | select(.headSha == "${commit}" and .event == "push") | .databaseId`,
          ])
            .stdout.trim()
            .split('\n')[0] || '';
        if (runId) break;
        spawnSync('sleep', ['2']);
      }
      if (!runId) throw new Error(`no CI run appeared for ${tag} after 60s — check Actions manually before releasing`);
      console.log(`Watching CI run ${runId}...\n  https://github.com/DocksDocks/docks/actions/runs/${runId}`);
      const result = spawnSync('gh', ['run', 'watch', runId, '--exit-status'], { stdio: 'inherit', cwd: repo });
      return { ok: (result.status ?? 1) === 0, runId };
    },
    writeJson(file, value) {
      fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    },
  });
}
