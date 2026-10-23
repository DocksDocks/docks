import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { body, expectSuccess, planCliContext, refuse } from './harness.mjs';

test('a mutating command refuses a plan owned by another agent, also when the owner is on a later page', (t) => {
  const { run, issue, updateIssue, createPlan } = planCliContext(t);
  // Ownership is checked before a mutating command can change the record.
  const foreign = createPlan('foreign owner');
  updateIssue(foreign, (entry) => {
    entry.assignees = ['other-agent'];
  });
  refuse(run('status', String(foreign), 'ongoing'), `plan #${foreign} is owned by other-agent`);
  assert.deepEqual(issue(foreign).labels, ['plan', 'plan:drafting']);
  const pagedOwner = createPlan('owner beyond first page');
  updateIssue(pagedOwner, (entry) => {
    entry.assignees = [...Array(100).fill('plan-agent'), 'other-agent'];
  });
  refuse(run('status', String(pagedOwner), 'ongoing'), `plan #${pagedOwner} is owned by other-agent`);
  assert.deepEqual(issue(pagedOwner).labels, ['plan', 'plan:drafting'], 'foreign owner on page two prevents writes');
});

test('edit refuses a body that changed remotely after the provenance check passed', (t) => {
  const { run, updateState, issue, createPlan, exported } = planCliContext(t);
  // A second read catches a writer that races the edit after provenance passes.
  const raced = createPlan('raced body');
  const raceFile = exported(raced);
  fs.writeFileSync(raceFile, issue(raced).body.replace('Fix parser', 'Repair parser'));
  const remoteBody = issue(raced).body.replace('Fix parser', 'Remote task');
  updateState((state) => {
    state.remoteChange = { issue: raced, viewsBeforeChange: 1, body: remoteBody };
  });
  refuse(run('edit', String(raced), '--file', raceFile), 'plan issue changed remotely; re-read and retry');
  assert.equal(issue(raced).body, remoteBody);
});

test('partial or missing GraphQL data fails closed and writes nothing', (t) => {
  const { run, updateState, issue, createPlan } = planCliContext(t);
  // GraphQL may report HTTP-successful partial data; neither that nor missing data authorizes a write.
  const graphqlFailure = createPlan('graphql failure');
  updateState((state) => {
    state.graphqlError = [{ message: 'partial snapshot' }];
  });
  const partial = run('status', String(graphqlFailure), 'ongoing');
  assert.equal(partial.status, 1, 'GraphQL errors fail closed even with usable data');
  assert.match(partial.stderr, /graphql/i);
  assert.deepEqual(issue(graphqlFailure).labels, ['plan', 'plan:drafting']);
  updateState((state) => {
    state.graphqlMissingData = true;
  });
  const missingData = run('status', String(graphqlFailure), 'ongoing');
  assert.equal(missingData.status, 1, 'missing GraphQL data fails closed');
  assert.match(missingData.stderr, /graphql/i);
  assert.equal(issue(graphqlFailure).body, body(), 'neither partial nor missing GraphQL data writes a body');
});

test('edit refuses a file whose export provenance is missing, stale, or unreadable', (t) => {
  const { scratch, run, issue, updateIssue, createPlan, exported } = planCliContext(t);
  // An arbitrary file cannot bypass export provenance.
  const provenance = createPlan('provenance');
  const missingFile = path.join(scratch, 'missing.md');
  fs.writeFileSync(missingFile, issue(provenance).body);
  refuse(
    run('edit', String(provenance), '--file', missingFile),
    `missing export provenance: ${missingFile}.origin does not exist; run \`plan.mjs export ${provenance}\` and re-apply the edit`,
  );
  const staleFile = exported(provenance);
  updateIssue(provenance, (entry) => {
    entry.body = entry.body.replace('Fix parser', 'Remote task');
  });
  refuse(
    run('edit', String(provenance), '--file', staleFile),
    `stale export: ${staleFile} was exported from a superseded body; run \`plan.mjs export ${provenance}\` and re-apply the edit`,
  );
  assert.match(issue(provenance).body, /Remote task/);
  const unreadableFile = exported(provenance);
  fs.writeFileSync(`${unreadableFile}.origin`, 'not a digest\n');
  refuse(
    run('edit', String(provenance), '--file', unreadableFile),
    `unreadable export provenance: ${unreadableFile}.origin`,
  );
});

test('a failed remote edit keeps the export valid, so a retry with the same file succeeds (#78)', (t) => {
  const { run, updateState, issue, createPlan, exported } = planCliContext(t);
  // A failed remote edit keeps the export valid, so the same file can be sent again (#78).
  const retried = createPlan('retried edit');
  const retryFile = exported(retried);
  fs.writeFileSync(retryFile, fs.readFileSync(retryFile, 'utf8').replace('Not run.', 'Smoke passed.'));
  const transientError = 'GraphQL: Something went wrong while executing your query';
  updateState((state) => {
    state.issueEditError = transientError;
  });
  const failedEdit = run('edit', String(retried), '--file', retryFile);
  refuse(failedEdit, `gh issue edit failed: ${transientError}`);
  assert.equal(failedEdit.stdout, '', 'a failed edit prints no result');
  updateState((state) => {
    delete state.issueEditError;
  });
  expectSuccess(run('edit', String(retried), '--file', retryFile), 'retry with the same export');
  assert.match(issue(retried).body, /Smoke passed\./, 'the retry writes the edited body');
});
