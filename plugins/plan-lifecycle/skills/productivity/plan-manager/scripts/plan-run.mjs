// This file is the only public PlanRun surface. Its six modules are internal:
// plan-state, current-codec, live-review-records, git-preimage, transaction, and historical-adapter.
export {
  canonicalPlanView,
  canonicalVerificationResults,
  jcs,
  parsePlan,
  sha256,
  validatePlanRun,
} from './runtime/current-codec.mjs';
export {
  captureRepositoryPreimage,
  createAffectedPathManifest,
  validateAffectedPathManifest,
} from './runtime/git-preimage.mjs';
export { classifyLegacyPlan, migrateLegacyPlan } from './runtime/historical-adapter.mjs';
export {
  authorizeExternalEffect,
  validateCompletionReview,
  validateExternalAuthority,
} from './runtime/live-review-records.mjs';
export {
  reducePlanRun,
  validatePlanRunRecord,
  validateReviewInvalidInput,
  validateReviewPhase,
} from './runtime/plan-state.mjs';
export {
  acquirePlanLock,
  replacePlanRunInPlace,
  transactPlanRun,
  withRepositoryTransaction,
} from './runtime/transaction.mjs';
