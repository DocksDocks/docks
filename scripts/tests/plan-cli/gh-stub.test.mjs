import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { planCliContext } from './harness.mjs';

// These cases call the fake gh directly. A fixture field that the query does not select must not reach the
// helper, or a plan CLI test passes for a query that GitHub would answer without that field.
const GH_STUB = fileURLToPath(new URL('../fixtures/gh-stub/gh', import.meta.url));
const PR = 7;
const PR_URL = `https://github.com/DocksDocks/fixture/pull/${PR}`;
const MERGED_AT = '2026-08-21T00:00:00Z';
const OID = 'c0ffee0000000000000000000000000000000007';

// Run `gh api graphql` on the fake gh with the state file that `planCliContext` keeps in its scratch folder.
// A number variable goes with -F, as the helper sends it, and a string variable with -f.
function graphql({ scratch }, query, variables = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`, '-f', 'owner=DocksDocks', '-f', 'name=fixture'];
  for (const [key, value] of Object.entries(variables)) {
    args.push(typeof value === 'number' ? '-F' : '-f', `${key}=${value}`);
  }
  return spawnSync(GH_STUB, args, {
    cwd: scratch,
    encoding: 'utf8',
    env: { ...process.env, GH_STUB_STATE: path.join(scratch, 'gh-state.json') },
  });
}

function responseData(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).data;
}

// A merged pull request that stores every field that the fake gh can return.
function seedPullRequest({ updateState }) {
  updateState((state) => {
    state.prs.push({
      number: PR,
      url: PR_URL,
      state: 'MERGED',
      mergedAt: MERGED_AT,
      baseRefName: 'main',
      body: 'Closes #1',
      repository: 'DocksDocks/fixture',
      closingIssuesReferences: [1],
    });
  });
}

function pullRequest(context, fields) {
  const query = `query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){pullRequest(number:$pr){${fields}}}}`;
  return graphql(context, query, { pr: PR });
}

test('the fake gh returns only the selected fields of Repository.pullRequest', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  const data = responseData(pullRequest(context, 'number url'));
  assert.deepEqual(data.repository.pullRequest, { number: PR, url: PR_URL });
});

test('the fake gh returns only the selected fields of a pull request closer', (t) => {
  const context = planCliContext(t);
  // The stored closer has a URL, a state, a merge time, a base branch, a body, and a repository.
  const { number, closer } = context.closedPlan('closer fields');
  for (const [closerFields, expected] of [
    ['__typename ... on PullRequest{number} ... on Commit{oid}', { __typename: 'PullRequest', number: closer.number }],
    ['... on PullRequest{number}', { number: closer.number }],
  ]) {
    const query = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){timelineItems(last:1,itemTypes:[CLOSED_EVENT]){nodes{... on ClosedEvent{closer{${closerFields}}}}}}}}`;
    const data = responseData(graphql(context, query, { number }));
    assert.deepEqual(data.repository.issue.timelineItems, { nodes: [{ closer: expected }] }, closerFields);
  }
});

test('the fake gh returns only the selected fields of the pull requests associated with a commit', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  context.updateState((state) => {
    state.commits = [{ oid: OID, associatedPullRequests: [{ number: PR }] }];
  });
  const query = `query($owner:String!,$name:String!,$oid:String!){repository(owner:$owner,name:$name){commit:object(expression:$oid){... on Commit{associatedPullRequests(first:100){nodes{number}}}}}}`;
  const data = responseData(graphql(context, query, { oid: OID }));
  assert.deepEqual(data.repository.commit.associatedPullRequests.nodes, [{ number: PR }]);
});

test('the fake gh returns an aliased pull request field only under its alias', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  // GitHub returns `landed` with the merge time and no `mergedAt`, also for an alias in a nested selection.
  const data = responseData(pullRequest(context, 'landed: mergedAt number repo: repository{fullName: nameWithOwner}'));
  assert.deepEqual(data.repository.pullRequest, {
    landed: MERGED_AT,
    number: PR,
    repo: { fullName: 'DocksDocks/fixture' },
  });
});

test('the fake gh returns the value of the selected field for an alias that names another field', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  const data = responseData(pullRequest(context, 'mergedAt: url'));
  assert.deepEqual(data.repository.pullRequest, { mergedAt: PR_URL });
});

test('the fake gh refuses a response key that names two different fields', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  const result = pullRequest(context, 'number: url number');
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "Field 'number' has a field conflict: url or number?\n");
});
