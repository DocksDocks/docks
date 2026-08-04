#!/usr/bin/env node
// release.mjs — dispatch one of two plugin release lanes.
//
// Generic positional lane (Docks, Effect Kit, and Plan Lifecycle):
//   node scripts/release.mjs [--dry-run] [--plugin <name>] patch|minor|major|<X.Y.Z>
//   (--plugin defaults to "docks")
//
// Session Relay reviewed lane:
//   node scripts/release.mjs --prepare --plugin session-relay <reviewed-version> [--dry-run]
//
// Session Relay dispatches first and rejects positional Relay bumps. Ordinary
// plugins then use the closed generic release engine; this file only composes
// its production IO and reports failures.
import path from 'node:path';
import { createGenericPluginReleaseIo, runGenericPluginRelease } from './lib/plugin-release.mjs';
import { PLUGINS } from './lib/plugins.mjs';
import { dispatchSessionRelayRelease } from './lib/session-relay-release.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);

try {
  const dispatched = await dispatchSessionRelayRelease(argv);
  if (dispatched !== null) process.exit(dispatched ? 0 : 1);

  await runGenericPluginRelease({
    argv,
    repo: REPO,
    plugins: PLUGINS,
    io: createGenericPluginReleaseIo({ repo: REPO, plugins: PLUGINS }),
  });
} catch (error) {
  if (!error.releaseFailureReported) console.error(`error: ${error.message}`);
  process.exit(1);
}
