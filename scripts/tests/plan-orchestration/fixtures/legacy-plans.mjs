export const LEGACY_RECORD_KINDS = Object.freeze([
  'Bootstrap-review-record',
  'Review-receipt',
  'Completion-review-receipt',
  'Review-orchestration-state',
  'Review-orchestration-prepared-request',
  'Review-orchestration-dispatch-commitment',
  'Review-orchestration-controller-abort',
  'Review-orchestration-abandonment',
]);

export function legacyPlan(records = [], { status = 'planned' } = {}) {
  return Buffer.from(
    `---\ntitle: Legacy fixture\ngoal: Characterize target-local migration.\nstatus: ${status}\ncreated: "2026-07-20T00:00:00Z"\nupdated: "2026-07-20T00:00:00Z"\nstarted_at: null\naffected_paths:\n  - src/legacy.txt\n---\n\n# Legacy fixture\n\n## Goal\n\nCharacterize target-local migration.\n\n## Steps\n\n| # | Task | Files | Depends | Effect | Status |\n|---|---|---|---|---|---|\n| 1 | Change legacy fixture | \`src/legacy.txt\` | — | local | planned |\n\n## Acceptance criteria\n\n| ID | Command | Expected |\n|---|---|---|\n| A1 | \`node fixture.mjs\` | Exit 0 |\n\n${records.join('\n')}\n\n## Review\n\nLegacy review evidence.\n`,
  );
}

export function malformedLegacyCatalog() {
  const state = 'Review-orchestration-state: {"schema":2,"status":"active"}';
  const prepared = 'Review-orchestration-prepared-request: {"schema":1}';
  const commitment = 'Review-orchestration-dispatch-commitment: {"schema":1}';
  return [
    { name: 'active state', bytes: legacyPlan([state]) },
    { name: 'prepared request', bytes: legacyPlan([state, prepared]) },
    { name: 'dispatch commitment', bytes: legacyPlan([state, prepared, commitment]) },
    {
      name: 'cancelled terminal family',
      bytes: legacyPlan(['Review-orchestration-state: {"schema":2,"status":"stuck","stop_reason":"user_cancelled"}']),
    },
    {
      name: 'crossed state and receipt family',
      bytes: legacyPlan([state, 'Review-receipt: {"schema":6,"phase":"draft"}']),
    },
    {
      name: 'malformed JSON',
      bytes: legacyPlan(['Review-orchestration-state: {not-json}']),
    },
    {
      name: 'duplicate machine records',
      bytes: legacyPlan([state, state]),
    },
    {
      name: 'unknown schema',
      bytes: legacyPlan(['Review-receipt: {"schema":99}']),
    },
  ];
}
