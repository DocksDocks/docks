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
// The shared dispatcher validates every closed release policy before selecting a
// lane. This file only composes production adapters and reports failures.
import path from 'node:path';
import {
  createGenericPluginReleaseIo,
  dispatchPluginRelease,
  resolveGenericReleaseIo,
  resolveReleaseFixtureConfiguration,
} from './lib/plugin-release.mjs';
import { PLUGINS } from './lib/plugins.mjs';
import { dispatchSessionRelayRelease } from './lib/session-relay-release.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const fixturePath = process.env.SESSION_RELAY_RELEASE_FIXTURE;
const reportPath = process.env.SESSION_RELAY_RELEASE_REPORT;

try {
  const fixtureConfigured = resolveReleaseFixtureConfiguration({ fixturePath, reportPath });
  const dispatchFixture = fixtureConfigured ? dispatchSessionRelayRelease : undefined;

  const succeeded = await dispatchPluginRelease({
    argv,
    repo: REPO,
    plugins: PLUGINS,
    io: resolveGenericReleaseIo({
      fixtureConfigured,
      createIo: () => createGenericPluginReleaseIo({ repo: REPO, plugins: PLUGINS }),
    }),
    dispatchFixture,
    dispatchReviewed: dispatchSessionRelayRelease,
  });
  if (!succeeded) process.exit(1);
} catch (error) {
  if (!error.releaseFailureReported) console.error(`error: ${error.message}`);
  process.exit(1);
}
