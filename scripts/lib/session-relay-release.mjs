import {
  ASSETS,
  PLUGIN,
  PRERELEASE_BODY,
  STABLE_BODY,
  TAG,
  TRANSACTION_REF,
  VERSION,
} from './session-relay-release-core.mjs';

export {
  SessionRelayReleaseError,
  canonicalize,
  writeCanonicalExclusive,
} from './session-relay-release-core.mjs';
export { dispatchSessionRelayRelease } from './session-relay-release-cli.mjs';

export const SESSION_RELAY_RELEASE = Object.freeze({
  plugin: PLUGIN, version: VERSION, tag: TAG, transactionRef: TRANSACTION_REF,
  assets: Object.freeze([...ASSETS]), prereleaseBody: PRERELEASE_BODY, stableBody: STABLE_BODY,
});
