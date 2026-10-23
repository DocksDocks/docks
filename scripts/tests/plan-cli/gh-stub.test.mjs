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

// Repository.object for a commit that is associated with the seeded pull request, as the helper reads the pull
// requests of a commit closer. `fields` is the selection set of the associatedPullRequests connection.
function associatedPullRequests(context, fields) {
  context.updateState((state) => {
    state.commits = [{ oid: OID, associatedPullRequests: [{ number: PR }] }];
  });
  const query = `query($owner:String!,$name:String!,$oid:String!){repository(owner:$owner,name:$name){commit:object(expression:$oid){... on Commit{associatedPullRequests(first:100){${fields}}}}}}`;
  return graphql(context, query, { oid: OID });
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

test('the fake gh returns only the selected fields of a closer for each aliased timeline connection', (t) => {
  const context = planCliContext(t);
  const { number, closer } = context.closedPlan('aliased closers');
  // Each connection selects other fields of the same close, and GitHub answers each with its own selection.
  const closures = (fields) => `timelineItems(last:1,itemTypes:[CLOSED_EVENT]){nodes{... on ClosedEvent{${fields}}}}`;
  const query = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){a:${closures('closer{... on PullRequest{number}}')} b:${closures('createdAt closer{... on PullRequest{url}}')}}}}`;
  const { issue } = responseData(graphql(context, query, { number })).repository;
  assert.deepEqual(issue.a, { nodes: [{ closer: { number: closer.number } }] });
  // The stored close has no time, so the fake gh stamps it with the issue's last update.
  assert.deepEqual(issue.b, { nodes: [{ createdAt: issue.updatedAt, closer: { url: closer.url } }] });
});

test('the fake gh returns only the selected fields of the pull requests associated with a commit', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  const data = responseData(associatedPullRequests(context, 'nodes{number}'));
  assert.deepEqual(data.repository.commit.associatedPullRequests.nodes, [{ number: PR }]);
});

test('the fake gh merges the repeated node selections of a connection', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  const data = responseData(associatedPullRequests(context, 'nodes{number} nodes{url}'));
  assert.deepEqual(data.repository.commit.associatedPullRequests, { nodes: [{ number: PR, url: PR_URL }] });
});

test('the fake gh gives the repository of a pull request its type', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  const data = responseData(pullRequest(context, 'repository{__typename ... on Repository{nameWithOwner}}'));
  assert.deepEqual(data.repository.pullRequest, {
    repository: { __typename: 'Repository', nameWithOwner: 'DocksDocks/fixture' },
  });
});

test('the fake gh merges the repeated selections of an object field', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  const repository = { a: 'DocksDocks/fixture', b: 'DocksDocks/fixture' };
  const data = responseData(pullRequest(context, 'repository{a:nameWithOwner} repository{b:nameWithOwner}'));
  assert.deepEqual(data.repository.pullRequest, { repository });
  // The selections also merge when two selections of the parent field hold them.
  const nested = responseData(
    associatedPullRequests(context, 'nodes{repository{a:nameWithOwner}} nodes{repository{b:nameWithOwner}}'),
  );
  assert.deepEqual(nested.repository.commit.associatedPullRequests, { nodes: [{ repository }] });
});

test('the fake gh refuses an object field without subfields', (t) => {
  const context = planCliContext(t);
  seedPullRequest(context);
  // The bare field is in the selection set of the pull request, and also in the second of two `nodes` selections.
  for (const result of [
    pullRequest(context, 'number repository'),
    associatedPullRequests(context, 'nodes{number} nodes{repository}'),
  ]) {
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      "Field must have selections (field 'repository' has no selections. Did you mean 'repository { ... }'?)\n",
    );
  }
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
