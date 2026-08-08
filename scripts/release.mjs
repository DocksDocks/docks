#!/usr/bin/env node
// release.mjs — dispatch the generic plugin release lane.
//
// Generic positional lane (Docks, Effect Kit, and Plan Lifecycle):
//   node scripts/release.mjs [--dry-run] [--plugin <name>] patch|minor|major|<X.Y.Z>
//   (--plugin defaults to "docks")
//
// The shared dispatcher validates every closed release policy before running a
// release. This file only composes production adapters and reports failures.
import path from 'node:path';
import { createGenericPluginReleaseIo, dispatchPluginRelease } from './lib/plugin-release.mjs';
import { PLUGINS } from './lib/plugins.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);

try {
  const succeeded = await dispatchPluginRelease({
    argv,
    repo: REPO,
    plugins: PLUGINS,
    io: createGenericPluginReleaseIo({ repo: REPO, plugins: PLUGINS }),
  });
  if (!succeeded) process.exit(1);
} catch (error) {
  if (!error.releaseFailureReported) console.error(`error: ${error.message}`);
  process.exit(1);
}
