import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  bindPlan,
  blocker,
  HASHES,
  IDS,
  PLAN_PATH,
  planRun,
  REPOSITORY_ID,
  renderPlan,
  reviewPhase,
  SOURCE_BASE,
  tuple,
  withStamps,
} from './fixtures/plan-run-v1.mjs';
import { expectReject, git, initializeRepository, withTempDirectory, writeFile } from './harness.mjs';

function transactionInput(file, current, next) {
  return {
    file,
    identity: {
      planPath: PLAN_PATH,
      repositoryId: REPOSITORY_ID,
      runId: IDS.run,
    },
    expectedBytesSha256: current.api.sha256(current.fixture.bytes),
    nextBytes: next.bytes,
  };
}

function transitionFixtures(api, inputSha256 = HASHES.input) {
  const current = bindPlan(api, tuple('drafting'));
  const next = bindPlan(
    api,
    tuple('drafting', {
      draft_review: reviewPhase('reserved', { input_sha256: inputSha256 }),
    }),
  );
  return { current: { api, fixture: current }, next };
}

const REPLACEMENT_AUTH_SOURCE = '6'.repeat(64);
const NEXT_REPLACEMENT_RUN = '44444444-4444-4444-8444-444444444444';

function replacementAuthority(api, successorRun, overrides = {}) {
  return {
    schema: 1,
    goal_id: IDS.goal,
    repository_id: REPOSITORY_ID,
    plan_path: PLAN_PATH,
    run_id: IDS.run,
    source_sha256: REPLACEMENT_AUTH_SOURCE,
    successor_run_sha256: api.sha256(api.jcs(successorRun)),
    ...overrides,
  };
}

function replacementFile(root) {
  const file = path.join(root, PLAN_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function historyFixture(api, { attemptHistory, marked = true, run, status }) {
  const historyRecords = attemptHistory.map((attempt) => `Plan-attempt-history: ${api.jcs(attempt)}`).join('\n');
  const review = ['Fresh reviewer output that is excluded from plan identity.', historyRecords]
    .filter(Boolean)
    .join('\n\n');
  let source = renderPlan({ status, run, jcs: api.jcs }).toString('utf8');
  if (marked) {
    source = source
      .replace(/^status: .*$/m, '$&\nplan_hash_mode: status-excluded-v1')
      .replace(
        '| # | Task | Files | Depends | Effect | Status |',
        '| # | Task | Files | Depends | Effect | Status | Done when / failure action |',
      )
      .replace('|---|---|---|---|---|---|', '|---|---|---|---|---|---|---|')
      .replace(
        '| 1 | Change fixture | `src/tracked.txt` | — | local | planned |',
        '| 1 | Change fixture | `src/tracked.txt` | — | local | planned | Observable proof |',
      );
  }
  const unbound = Buffer.from(source.replace('Fresh reviewer output that is excluded from plan identity.', review));
  const boundRun = { ...run, plan_sha256: api.sha256(api.canonicalPlanView(unbound)) };
  return {
    attempt_history: attemptHistory,
    bytes: Buffer.from(unbound.toString('utf8').replace(/^Plan-run: .*$/m, `Plan-run: ${api.jcs(boundRun)}`)),
    run: boundRun,
    status,
  };
}

function replacementFixture(api, current, { includeAttempt = true, marked = true, nextRunId = IDS.otherRun } = {}) {
  const replacement = historyFixture(api, {
    attemptHistory: [],
    marked,
    run: planRun({ run_id: nextRunId }),
    status: 'drafting',
  });
  const attempt = {
    schema: 1,
    authorization_source_sha256: REPLACEMENT_AUTH_SOURCE,
    plan_bytes_sha256: api.sha256(current.bytes),
    replacement_run_id: nextRunId,
    successor_run_sha256: api.sha256(api.jcs(replacement.run)),
    run: current.run,
    status: current.status,
  };
  const attemptHistory = [...(current.attempt_history ?? []), ...(includeAttempt ? [attempt] : [])];
  return {
    attempt,
    ...historyFixture(api, { attemptHistory, marked, run: replacement.run, status: 'drafting' }),
  };
}

function amendReplacementPlan(api, fixture) {
  const amendedText = fixture.bytes
    .toString('utf8')
    .replace(
      '## Goal\n\nImplement and verify one bounded local change.',
      '## Goal\n\nImplement and verify the corrected bounded local change.',
    );
  const run = { ...fixture.run, plan_sha256: api.sha256(api.canonicalPlanView(Buffer.from(amendedText))) };
  const attempt = {
    ...fixture.attempt,
    successor_run_sha256: api.sha256(api.jcs(run)),
  };
  const bytes = Buffer.from(
    amendedText
      .replace(`Plan-run: ${api.jcs(fixture.run)}`, `Plan-run: ${api.jcs(run)}`)
      .replace(`Plan-attempt-history: ${api.jcs(fixture.attempt)}`, `Plan-attempt-history: ${api.jcs(attempt)}`),
  );
  return {
    ...fixture,
    attempt,
    attempt_history: [...fixture.attempt_history.slice(0, -1), attempt],
    bytes,
    run,
  };
}

async function waitForLine(child, pattern) {
  let buffer = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('lock-holder child did not become ready')), 5_000);
    child.once('error', reject);
    child.once('exit', (code, signal) => reject(new Error(`lock-holder exited early: ${code}/${signal}`)));
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      if (pattern.test(buffer)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// A checkpoint-shaped repository: the plan and its two declared paths committed,
// plus one changed path drafting never declared.
function checkpointFixture(api, root) {
  const repo = path.join(root, 'repo');
  initializeRepository(repo);
  const fixture = bindPlan(
    api,
    tuple('ongoing', { draft_review: reviewPhase('passed'), execution_parent: SOURCE_BASE }),
  );
  const planFile = writeFile(repo, PLAN_PATH, fixture.bytes);
  for (const logical of ['src/tracked.txt', 'src/untracked.txt']) {
    writeFile(repo, logical, `${logical} committed bytes\n`);
  }
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'plan and declared paths']);
  writeFile(repo, 'src/undeclared.txt', 'undeclared implementation bytes\n');
  const ownedPaths = [PLAN_PATH, 'src/tracked.txt', 'src/undeclared.txt', 'src/untracked.txt'];
  return {
    // A preimage over only the source paths. The amendment rewrites the plan
    // file, so a contender that owned it too would be turned away by preimage
    // drift and could not observe whether the repository lock was held at all.
    contenderExpected: api.captureRepositoryPreimage({
      repo,
      ownedPaths: ['src/tracked.txt', 'src/undeclared.txt', 'src/untracked.txt'],
    }),
    commitContents: () =>
      git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD']).stdout.split('\n').filter(Boolean).sort(),
    fixture,
    input: {
      changedPaths: ['src/undeclared.txt'],
      expected: api.captureRepositoryPreimage({ repo, ownedPaths }),
      expectedBytesSha256: api.sha256(fixture.bytes),
      file: planFile,
      identity: { planPath: PLAN_PATH, repositoryId: REPOSITORY_ID, runId: IDS.run },
      ownedPaths,
      repo,
    },
    planFile,
    repo,
  };
}

export function registerLocksAndCas(suite, api, { planRunPath }) {
  suite.test('locks-cas', 'plan transaction compare-and-swap permits exactly one stale-preimage contender', () =>
    withTempDirectory('plan-run-cas-', async (root) => {
      const file = path.join(root, 'plan.md');
      const { current, next } = transitionFixtures(api);
      const alternate = bindPlan(
        api,
        tuple('drafting', {
          draft_review: reviewPhase('reserved', { input_sha256: HASHES.input2 }),
        }),
      );
      fs.writeFileSync(file, current.fixture.bytes);
      const attempts = await Promise.allSettled([
        api.transactPlanRun(transactionInput(file, current, next)),
        api.transactPlanRun(transactionInput(file, current, alternate)),
      ]);
      assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
      assert.equal(attempts.filter(({ status }) => status === 'rejected').length, 1);
      assert.match(String(attempts.find(({ status }) => status === 'rejected')?.reason), /preimage|stale|CAS|lock/i);
      const persisted = fs.readFileSync(file);
      assert.ok(persisted.equals(next.bytes) || persisted.equals(alternate.bytes));
    }),
  );

  suite.test('locks-cas', 'plan transaction verifies the exact preimage before callback or write', () =>
    withTempDirectory('plan-run-stale-', async (root) => {
      const file = path.join(root, 'plan.md');
      const { current, next } = transitionFixtures(api);
      fs.writeFileSync(file, current.fixture.bytes);
      fs.appendFileSync(file, '\nconcurrent user bytes\n');
      await expectReject(() => api.transactPlanRun(transactionInput(file, current, next)), /preimage|stale|CAS/i);
      assert.match(fs.readFileSync(file, 'utf8'), /concurrent user bytes/);
      assert.deepEqual(
        fs.readdirSync(root).sort(),
        ['plan.md'],
        'failed transaction leaves no sibling or temporary write behind',
      );
    }),
  );

  suite.test('locks-cas', 'foreign live plan lock blocks rather than being reclaimed', () =>
    withTempDirectory('plan-run-live-lock-', async (root) => {
      const file = path.join(root, 'plan.md');
      const lockRoot = path.join(root, 'locks');
      const { current, next } = transitionFixtures(api);
      fs.writeFileSync(file, current.fixture.bytes);
      const lockInput = {
        expectedBytesSha256: api.sha256(current.fixture.bytes),
        file,
        lockRoot,
        planPath: PLAN_PATH,
        repositoryId: REPOSITORY_ID,
        runId: IDS.run,
      };
      const moduleUrl = pathToFileURL(planRunPath).href;
      const child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const api=await import(${JSON.stringify(moduleUrl)}); await api.acquirePlanLock(JSON.parse(process.env.LOCK_INPUT)); process.stdout.write('ready\\n'); setInterval(()=>{},1000); await new Promise(()=>{});`,
        ],
        {
          cwd: root,
          env: { ...process.env, LOCK_INPUT: JSON.stringify(lockInput) },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      try {
        await waitForLine(child, /ready/);
        await expectReject(
          () =>
            api.transactPlanRun({
              ...transactionInput(file, current, next),
              lockRoot,
              lockTimeoutMs: 50,
            }),
          /lock|owner|busy|timeout/i,
        );
        assert.ok(fs.readFileSync(file).equals(current.fixture.bytes));
      } finally {
        await stopChild(child);
      }
    }),
  );

  suite.test('locks-cas', 'same-host dead-owner lock is reclaimed only with unchanged preimage', () =>
    withTempDirectory('plan-run-dead-lock-', async (root) => {
      const file = path.join(root, 'plan.md');
      const lockRoot = path.join(root, 'locks');
      const { current, next } = transitionFixtures(api);
      fs.writeFileSync(file, current.fixture.bytes);
      const lockInput = {
        expectedBytesSha256: api.sha256(current.fixture.bytes),
        file,
        lockRoot,
        planPath: PLAN_PATH,
        repositoryId: REPOSITORY_ID,
        runId: IDS.run,
      };
      const moduleUrl = pathToFileURL(planRunPath).href;
      const holder = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const api=await import(${JSON.stringify(moduleUrl)}); await api.acquirePlanLock(JSON.parse(process.env.LOCK_INPUT)); process.stdout.write('ready\\n'); process.exit(0);`,
        ],
        {
          cwd: root,
          env: { ...process.env, LOCK_INPUT: JSON.stringify(lockInput) },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      await waitForLine(holder, /ready/);
      await new Promise((resolve) => holder.once('exit', resolve));
      await api.transactPlanRun({ ...transactionInput(file, current, next), lockRoot });
      assert.ok(fs.readFileSync(file).equals(next.bytes));

      const second = transitionFixtures(api, HASHES.input2);
      fs.writeFileSync(file, second.current.fixture.bytes);
      const staleHolder = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const api=await import(${JSON.stringify(moduleUrl)}); await api.acquirePlanLock(JSON.parse(process.env.LOCK_INPUT)); process.stdout.write('ready\\n'); process.exit(0);`,
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            LOCK_INPUT: JSON.stringify({
              ...lockInput,
              expectedBytesSha256: api.sha256(second.current.fixture.bytes),
            }),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      await waitForLine(staleHolder, /ready/);
      await new Promise((resolve) => staleHolder.once('exit', resolve));
      fs.appendFileSync(file, '\nconcurrent bytes\n');
      await expectReject(
        () =>
          api.transactPlanRun({
            ...transactionInput(file, second.current, second.next),
            lockRoot,
          }),
        /preimage|stale|dead|lock/i,
      );
      assert.match(fs.readFileSync(file, 'utf8'), /concurrent bytes/);
    }),
  );

  suite.test(
    'locks-cas',
    'repository transaction rejects HEAD, index, and owned-path preimage drift before operation',
    () =>
      withTempDirectory('plan-run-repo-preimage-', async (root) => {
        const createRepo = (name) => {
          const repo = path.join(root, name);
          initializeRepository(repo);
          writeFile(repo, 'owned.txt', 'owned base\n');
          git(repo, ['add', 'owned.txt']);
          git(repo, ['commit', '-qm', 'owned base']);
          return repo;
        };
        const cases = [
          {
            name: 'HEAD',
            mutate(repo) {
              writeFile(repo, 'other.txt', 'other\n');
              git(repo, ['add', 'other.txt']);
              git(repo, ['commit', '-qm', 'head drift']);
            },
          },
          {
            name: 'index',
            mutate(repo) {
              writeFile(repo, 'other.txt', 'staged\n');
              git(repo, ['add', 'other.txt']);
            },
          },
          {
            name: 'owned path',
            mutate(repo) {
              writeFile(repo, 'owned.txt', 'dirty owned bytes\n');
            },
          },
        ];
        for (const testCase of cases) {
          const repo = createRepo(testCase.name.toLowerCase().replace(' ', '-'));
          const expected = api.captureRepositoryPreimage({ repo, ownedPaths: ['owned.txt'] });
          testCase.mutate(repo);
          let entered = false;
          await expectReject(
            () =>
              api.withRepositoryTransaction({ expected, ownedPaths: ['owned.txt'], repo, runId: IDS.run }, () => {
                entered = true;
              }),
            new RegExp(`${testCase.name}|preimage|concurrent`, 'i'),
          );
          assert.equal(entered, false, `${testCase.name} drift must fail before operation`);
        }
      }),
  );

  suite.test('locks-cas', 'repository lock serializes contenders and preserves unrelated user bytes', () =>
    withTempDirectory('plan-run-repo-lock-', async (root) => {
      const repo = path.join(root, 'repo');
      initializeRepository(repo);
      writeFile(repo, 'owned.txt', 'owned base\n');
      writeFile(repo, 'user.txt', 'user base\n');
      git(repo, ['add', 'owned.txt', 'user.txt']);
      git(repo, ['commit', '-qm', 'fixture paths']);
      const expected = api.captureRepositoryPreimage({ repo, ownedPaths: ['owned.txt'] });
      writeFile(repo, 'user.txt', 'unexpected user bytes\n');
      const first = api.withRepositoryTransaction({ expected, ownedPaths: ['owned.txt'], repo, runId: IDS.run }, () =>
        writeFile(repo, 'owned.txt', 'first controller\n'),
      );
      const second = api.withRepositoryTransaction({ expected, ownedPaths: ['owned.txt'], repo, runId: IDS.run }, () =>
        writeFile(repo, 'owned.txt', 'second controller\n'),
      );
      const attempts = await Promise.allSettled([first, second]);
      assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
      assert.equal(attempts.filter(({ status }) => status === 'rejected').length, 1);
      assert.equal(fs.readFileSync(path.join(repo, 'user.txt'), 'utf8'), 'unexpected user bytes\n');
    }),
  );

  // The amendment lives inside the checkpoint's own exclusive, preimage-checked
  // repository transaction. Two consequences are worth pinning separately:
  // drift refuses before the record is touched, and the lock is genuinely held
  // across amend-then-commit rather than reacquired between them.
  suite.test('locks-cas', 'a drifted repository preimage refuses the checkpoint before the record is amended', () =>
    withTempDirectory('plan-run-checkpoint-drift-', async (root) => {
      const context = checkpointFixture(api, root);
      writeFile(context.repo, 'src/tracked.txt', 'concurrent third-party bytes\n');
      let entered = false;
      await expectReject(
        () =>
          api.checkpointPlanRun(context.input, () => {
            entered = true;
            return [];
          }),
        /preimage|concurrent/i,
      );
      assert.equal(entered, false, 'drift must fail before the commit');
      assert.ok(
        fs.readFileSync(context.planFile).equals(context.fixture.bytes),
        'drift must fail before the record is amended',
      );
    }),
  );

  suite.test('locks-cas', 'the checkpoint holds the repository lock across amendment and commit', () =>
    withTempDirectory('plan-run-checkpoint-lock-', async (root) => {
      const context = checkpointFixture(api, root);
      let contender = null;
      await api.checkpointPlanRun(context.input, async ({ paths }) => {
        // Observed from INSIDE the commit callback: the record is already amended
        // and no second controller can enter until this checkpoint releases.
        assert.deepEqual(api.parsePlan(fs.readFileSync(context.planFile)).frontmatter.affected_paths, [
          'src/tracked.txt',
          'src/undeclared.txt',
          'src/untracked.txt',
        ]);
        contender = await api
          .withRepositoryTransaction(
            {
              expected: context.contenderExpected,
              lockTimeoutMs: 50,
              ownedPaths: context.contenderExpected.owned_paths.map((entry) => entry.path),
              repo: context.repo,
              runId: IDS.otherRun,
            },
            () => 'entered',
          )
          .then(
            (value) => value,
            (error) => String(error),
          );
        git(context.repo, ['add', '--', ...paths]);
        git(context.repo, ['commit', '-qm', 'checkpoint']);
        return context.commitContents();
      });
      // Not merely "the contender failed": it failed ON THE LOCK, which is the
      // only obstacle left once its preimage excludes the amended plan file.
      assert.match(String(contender), /busy|timed out/i);
    }),
  );

  suite.test('locks-cas', 'terminal same-goal recovery replaces the current run in the same plan file', () =>
    withTempDirectory('plan-run-replacement-', async (root) => {
      const file = replacementFile(root);
      const current = bindPlan(
        api,
        tuple('blocked', {
          blocker: blocker('review_failed'),
          draft_review: reviewPhase('blocked'),
        }),
      );
      const next = amendReplacementPlan(api, replacementFixture(api, current));
      assert.match(next.bytes.toString('utf8'), /^plan_hash_mode: status-excluded-v1$/m);
      fs.writeFileSync(file, current.bytes);

      const result = await api.replacePlanRunInPlace({
        authority: replacementAuthority(api, next.run),
        currentIdentity: {
          goalId: IDS.goal,
          planPath: PLAN_PATH,
          repositoryId: REPOSITORY_ID,
          runId: IDS.run,
        },
        expectedBytesSha256: api.sha256(current.bytes),
        file,
        repo: root,
        liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
        nextBytes: next.bytes,
      });

      assert.equal(result.run.run_id, IDS.otherRun);
      assert.deepEqual(result.attempt_history, [next.attempt]);
      assert.ok(fs.readFileSync(file).equals(next.bytes));
      assert.match(fs.readFileSync(file, 'utf8'), /corrected bounded local change/);
      assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
    }),
  );

  suite.test(
    'locks-cas',
    'same-file replacement rejects an unmarked successor without changing predecessor bytes',
    () =>
      withTempDirectory('plan-run-replacement-unmarked-', async (root) => {
        const file = replacementFile(root);
        const current = bindPlan(
          api,
          tuple('blocked', {
            blocker: blocker('review_failed'),
            draft_review: reviewPhase('blocked'),
          }),
        );
        const next = replacementFixture(api, current, { marked: false });
        assert.equal(api.validatePlanRun(next.bytes).run.run_id, IDS.otherRun);
        assert.doesNotMatch(next.bytes.toString('utf8'), /^plan_hash_mode:/m);
        fs.writeFileSync(file, current.bytes);

        await expectReject(
          () =>
            api.replacePlanRunInPlace({
              authority: replacementAuthority(api, next.run),
              currentIdentity: {
                goalId: IDS.goal,
                planPath: PLAN_PATH,
                repositoryId: REPOSITORY_ID,
                runId: IDS.run,
              },
              expectedBytesSha256: api.sha256(current.bytes),
              file,
              repo: root,
              liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
              nextBytes: next.bytes,
            }),
          /successor frontmatter plan_hash_mode must be status-excluded-v1/,
          'unmarked successor must reject at the replacement boundary',
        );
        assert.ok(fs.readFileSync(file).equals(current.bytes));
      }),
  );

  suite.test('locks-cas', 'replacement rejects a file outside current plan_path', () =>
    withTempDirectory('plan-run-replacement-path-', async (root) => {
      const currentFile = replacementFile(root);
      const otherFile = path.join(path.dirname(currentFile), 'other-plan.md');
      const current = bindPlan(
        api,
        tuple('blocked', {
          blocker: blocker('review_failed'),
          draft_review: reviewPhase('blocked'),
        }),
      );
      const next = replacementFixture(api, current);
      fs.writeFileSync(currentFile, current.bytes);
      fs.writeFileSync(otherFile, current.bytes);

      await expectReject(
        () =>
          api.replacePlanRunInPlace({
            authority: replacementAuthority(api, next.run),
            currentIdentity: {
              goalId: IDS.goal,
              planPath: PLAN_PATH,
              repositoryId: REPOSITORY_ID,
              runId: IDS.run,
            },
            expectedBytesSha256: api.sha256(current.bytes),
            file: otherFile,
            liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
            nextBytes: next.bytes,
            repo: root,
          }),
        /replacement file path does not match current PlanRun plan_path/,
        'replacement file/path mismatch must reject',
      );
      assert.ok(fs.readFileSync(currentFile).equals(current.bytes));
      assert.ok(fs.readFileSync(otherFile).equals(current.bytes));
      assert.equal(api.validatePlanRun(fs.readFileSync(otherFile)).run.draft_review.state, 'blocked');
    }),
  );

  // An alias whose realpath IS the plan passes a path guard that only compares `realpath(file)`.
  // The write must land on the same resolved path the guard approved, or the successor is renamed
  // onto the alias entry and the real record survives untouched - a replacement that reports
  // success while replacing nothing.
  suite.test('locks-cas', 'replacement writes the resolved plan path, not the alias it was given', () =>
    withTempDirectory('plan-run-replacement-alias-', async (root) => {
      const currentFile = replacementFile(root);
      const aliasFile = path.join(path.dirname(currentFile), 'alias-plan.md');
      const current = bindPlan(
        api,
        tuple('blocked', {
          blocker: blocker('review_failed'),
          draft_review: reviewPhase('blocked'),
        }),
      );
      const next = replacementFixture(api, current);
      fs.writeFileSync(currentFile, current.bytes);
      fs.symlinkSync(path.basename(currentFile), aliasFile);

      await api.replacePlanRunInPlace({
        authority: replacementAuthority(api, next.run),
        currentIdentity: {
          goalId: IDS.goal,
          planPath: PLAN_PATH,
          repositoryId: REPOSITORY_ID,
          runId: IDS.run,
        },
        expectedBytesSha256: api.sha256(current.bytes),
        file: aliasFile,
        liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
        nextBytes: next.bytes,
        repo: root,
      });

      assert.ok(
        fs.readFileSync(currentFile).equals(Buffer.from(next.bytes)),
        'the successor must be written to the resolved plan path',
      );
      assert.ok(fs.lstatSync(aliasFile).isSymbolicLink(), 'the alias must remain a symlink, not be replaced by a file');
    }),
  );

  // The lock key is the plan's identity. Two callers naming the SAME record through different
  // paths must contend for one lock; if an alias and its target take separate locks they enter the
  // same transaction together and the mutual exclusion is gone.
  suite.test('locks-cas', 'an alias and its target contend for the same plan lock', () =>
    withTempDirectory('plan-run-alias-lock-', async (root) => {
      const currentFile = replacementFile(root);
      const aliasFile = path.join(path.dirname(currentFile), 'alias-lock-plan.md');
      const current = bindPlan(api, tuple('drafting'));
      fs.writeFileSync(currentFile, current.bytes);
      fs.symlinkSync(path.basename(currentFile), aliasFile);

      const held = await api.acquirePlanLock({
        file: currentFile,
        repositoryId: REPOSITORY_ID,
        planPath: PLAN_PATH,
        runId: IDS.run,
        expectedBytesSha256: api.sha256(current.bytes),
        lockRoot: path.join(root, 'locks'),
        lockTimeoutMs: 50,
      });
      try {
        await expectReject(
          () =>
            api.acquirePlanLock({
              file: aliasFile,
              repositoryId: REPOSITORY_ID,
              planPath: PLAN_PATH,
              runId: IDS.run,
              expectedBytesSha256: api.sha256(current.bytes),
              lockRoot: path.join(root, 'locks'),
              lockTimeoutMs: 50,
            }),
          /lock/i,
          'an alias must not take a second lock on a plan that is already locked',
        );
      } finally {
        held.release();
      }
    }),
  );

  // `transactPlanRun` is the hot path: every start, reserve, record and finish goes through it, so
  // the alias rule matters more here than in replacement. The lock resolves symlinks to build its
  // key, so a write on the caller's raw path would lock the target and write the alias.
  suite.test('locks-cas', 'a transaction through an alias writes the resolved plan path', () =>
    withTempDirectory('plan-run-transact-alias-', async (root) => {
      const currentFile = path.join(root, 'plan.md');
      const aliasFile = path.join(root, 'transact-alias-plan.md');
      const { current, next } = transitionFixtures(api);
      fs.writeFileSync(currentFile, current.fixture.bytes);
      fs.symlinkSync(path.basename(currentFile), aliasFile);

      await api.transactPlanRun(transactionInput(aliasFile, current, next));

      assert.ok(
        fs.readFileSync(currentFile).equals(next.bytes),
        'the transaction must be written to the resolved plan path',
      );
      assert.ok(fs.lstatSync(aliasFile).isSymbolicLink(), 'the alias must remain a symlink, not be replaced by a file');
    }),
  );

  suite.test('locks-cas', 'same-file recovery requires current-user authority and exact append-only history', () =>
    withTempDirectory('plan-run-replacement-guard-', async (root) => {
      const file = replacementFile(root);
      const current = bindPlan(
        api,
        tuple('blocked', {
          blocker: blocker('review_failed'),
          draft_review: reviewPhase('blocked'),
        }),
      );
      const next = replacementFixture(api, current);
      const spentRun = { ...next.run, draft_review: reviewPhase('passed') };
      const spentBytes = Buffer.from(
        next.bytes.toString('utf8').replace(/^Plan-run: .*$/m, `Plan-run: ${api.jcs(spentRun)}`),
      );
      assert.equal(api.validatePlanRun(spentBytes).run.draft_review.state, 'passed');
      const brokenChainBytes = Buffer.from(
        next.bytes
          .toString('utf8')
          .replace(`"replacement_run_id":"${IDS.otherRun}"`, `"replacement_run_id":"${NEXT_REPLACEMENT_RUN}"`),
      );
      const widenedRun = {
        ...next.run,
        completion_review: reviewPhase('not_started'),
        requested_effects: ['local', 'release'],
        risk: 'external',
      };
      const widenedBytes = Buffer.from(
        next.bytes.toString('utf8').replace(/^Plan-run: .*$/m, `Plan-run: ${api.jcs(widenedRun)}`),
      );
      assert.equal(api.validatePlanRun(widenedBytes).run.risk, 'external');
      const input = {
        authority: replacementAuthority(api, next.run),
        currentIdentity: {
          goalId: IDS.goal,
          planPath: PLAN_PATH,
          repositoryId: REPOSITORY_ID,
          runId: IDS.run,
        },
        expectedBytesSha256: api.sha256(current.bytes),
        file,
        repo: root,
        liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
        nextBytes: next.bytes,
      };
      for (const testCase of [
        { name: 'missing authority', mutation: { authority: null }, pattern: /authority|plain object/i },
        {
          name: 'wrong successor digest',
          mutation: { authority: { ...input.authority, successor_run_sha256: HASHES.input } },
          pattern: /successor/i,
        },
        {
          name: 'stale user source',
          mutation: { liveSourceSha256: HASHES.input },
          pattern: /live current-user source/i,
        },
        {
          name: 'missing attempt history',
          mutation: { nextBytes: replacementFixture(api, current, { includeAttempt: false }).bytes },
          pattern: /history|attempt/i,
        },
        {
          name: 'broken successor chain',
          mutation: { nextBytes: brokenChainBytes },
          pattern: /chain/i,
        },
        {
          name: 'unauthorized successor scope widening',
          mutation: { nextBytes: widenedBytes },
          pattern: /successor/i,
        },
        {
          name: 'spent successor review budget',
          mutation: {
            authority: replacementAuthority(api, spentRun),
            nextBytes: spentBytes,
          },
          pattern: /budget|baseline/i,
        },
      ]) {
        fs.writeFileSync(file, current.bytes);
        await expectReject(
          () => api.replacePlanRunInPlace({ ...input, ...testCase.mutation }),
          testCase.pattern,
          `${testCase.name} must reject`,
        );
        assert.ok(fs.readFileSync(file).equals(current.bytes));
      }
    }),
  );

  suite.test('locks-cas', 'reviewer-blocked user answers replace the run without creating a new plan file', () =>
    withTempDirectory('plan-run-user-answer-', async (root) => {
      const file = replacementFile(root);
      const current = bindPlan(
        api,
        tuple('blocked', {
          blocker: blocker('user_decision'),
          draft_review: reviewPhase('blocked'),
        }),
      );
      const next = replacementFixture(api, current);
      fs.writeFileSync(file, current.bytes);

      await api.replacePlanRunInPlace({
        authority: replacementAuthority(api, next.run),
        currentIdentity: {
          goalId: IDS.goal,
          planPath: PLAN_PATH,
          repositoryId: REPOSITORY_ID,
          runId: IDS.run,
        },
        expectedBytesSha256: api.sha256(current.bytes),
        file,
        repo: root,
        liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
        nextBytes: next.bytes,
      });

      assert.ok(fs.readFileSync(file).equals(next.bytes));
      assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
    }),
  );

  suite.test('locks-cas', 'attempt history chains across repeated authorized runs at one stable path', () =>
    withTempDirectory('plan-run-history-chain-', async (root) => {
      const file = replacementFile(root);
      const predecessor = bindPlan(
        api,
        tuple('blocked', {
          blocker: blocker('review_failed'),
          draft_review: reviewPhase('blocked'),
        }),
      );
      const firstSuccessor = replacementFixture(api, predecessor);
      const secondPredecessor = historyFixture(api, {
        attemptHistory: firstSuccessor.attempt_history,
        run: planRun({
          blocker: blocker('review_failed'),
          draft_review: reviewPhase('blocked'),
          run_id: IDS.otherRun,
        }),
        status: 'blocked',
      });
      const secondSuccessor = replacementFixture(api, secondPredecessor, {
        nextRunId: NEXT_REPLACEMENT_RUN,
      });
      fs.writeFileSync(file, secondPredecessor.bytes);

      const result = await api.replacePlanRunInPlace({
        authority: replacementAuthority(api, secondSuccessor.run, { run_id: IDS.otherRun }),
        currentIdentity: {
          goalId: IDS.goal,
          planPath: PLAN_PATH,
          repositoryId: REPOSITORY_ID,
          runId: IDS.otherRun,
        },
        expectedBytesSha256: api.sha256(secondPredecessor.bytes),
        file,
        repo: root,
        liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
        nextBytes: secondSuccessor.bytes,
      });

      assert.deepEqual(result.attempt_history, secondSuccessor.attempt_history);
      assert.equal(result.attempt_history[0].replacement_run_id, IDS.otherRun);
      assert.equal(result.attempt_history[1].replacement_run_id, NEXT_REPLACEMENT_RUN);
    }),
  );

  suite.test('locks-cas', 'resumable blockers and finished plans cannot start replacement runs', () =>
    withTempDirectory('plan-run-replacement-terminal-guards-', async (root) => {
      const file = replacementFile(root);
      const fixtures = [
        bindPlan(
          api,
          tuple('blocked', {
            blocker: blocker('user_decision'),
            completion_review: reviewPhase('not_started'),
            risk: 'sensitive',
          }),
        ),
        bindPlan(
          api,
          tuple('finished', {
            acceptance: { source_sha256: HASHES.acceptanceSource, verification_sha256: HASHES.verification },
            draft_review: reviewPhase('passed'),
          }),
        ),
      ];
      for (const current of fixtures) {
        const next = replacementFixture(api, current);
        fs.writeFileSync(file, current.bytes);
        await expectReject(
          () =>
            api.replacePlanRunInPlace({
              authority: replacementAuthority(api, next.run),
              currentIdentity: {
                goalId: IDS.goal,
                planPath: PLAN_PATH,
                repositoryId: REPOSITORY_ID,
                runId: IDS.run,
              },
              expectedBytesSha256: api.sha256(current.bytes),
              file,
              repo: root,
              liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
              nextBytes: next.bytes,
            }),
          /blocked|finished|predecessor|reopen|resumable|status/i,
        );
        assert.ok(fs.readFileSync(file).equals(current.bytes));
      }
    }),
  );

  suite.test('locks-cas', 'ordinary run transitions preserve and cannot remove attempt history', () =>
    withTempDirectory('plan-run-history-immutable-', async (root) => {
      const file = path.join(root, 'plan.md');
      const predecessor = bindPlan(
        api,
        tuple('blocked', {
          blocker: blocker('review_failed'),
          draft_review: reviewPhase('blocked'),
        }),
      );
      const current = replacementFixture(api, predecessor);
      const identity = {
        planPath: PLAN_PATH,
        repositoryId: REPOSITORY_ID,
        runId: IDS.otherRun,
      };
      const reserved = historyFixture(api, {
        attemptHistory: current.attempt_history,
        run: { ...current.run, draft_review: reviewPhase('reserved') },
        status: 'drafting',
      });
      const withoutHistory = bindPlan(
        api,
        tuple('drafting', {
          draft_review: reviewPhase('reserved'),
          run_id: IDS.otherRun,
        }),
      );
      fs.writeFileSync(file, current.bytes);
      await api.transactPlanRun({
        file,
        identity,
        expectedBytesSha256: api.sha256(current.bytes),
        nextBytes: reserved.bytes,
      });
      assert.equal(api.validatePlanRun(fs.readFileSync(file)).attempt_history.length, 1);
      fs.writeFileSync(file, current.bytes);
      await expectReject(
        () =>
          api.transactPlanRun({
            file,
            identity,
            expectedBytesSha256: api.sha256(current.bytes),
            nextBytes: withoutHistory.bytes,
          }),
        /attempt history|mutate/i,
      );
      assert.ok(fs.readFileSync(file).equals(current.bytes));
    }),
  );

  suite.test('locks-cas', 'concurrent replacements admit exactly one successor', () =>
    withTempDirectory('plan-run-replacement-race-', async (root) => {
      const file = replacementFile(root);
      const current = bindPlan(
        api,
        tuple('blocked', {
          blocker: blocker('review_failed'),
          draft_review: reviewPhase('blocked'),
        }),
      );
      const next = replacementFixture(api, current);
      fs.writeFileSync(file, current.bytes);
      const input = {
        authority: replacementAuthority(api, next.run),
        currentIdentity: {
          goalId: IDS.goal,
          planPath: PLAN_PATH,
          repositoryId: REPOSITORY_ID,
          runId: IDS.run,
        },
        expectedBytesSha256: api.sha256(current.bytes),
        file,
        repo: root,
        liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
        nextBytes: next.bytes,
      };

      const attempts = await Promise.allSettled([api.replacePlanRunInPlace(input), api.replacePlanRunInPlace(input)]);
      assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
      assert.equal(attempts.filter(({ status }) => status === 'rejected').length, 1);
      assert.ok(fs.readFileSync(file).equals(next.bytes));
    }),
  );

  suite.test('locks-cas', 'repository preimage owns an exact normalized path set', () =>
    withTempDirectory('plan-run-owned-paths-', (root) => {
      const repo = path.join(root, 'repo');
      initializeRepository(repo);
      for (const ownedPaths of [['../escape'], ['/absolute'], ['tracked.txt', './tracked.txt']]) {
        assert.throws(
          () => api.captureRepositoryPreimage({ repo, ownedPaths }),
          /path|relative|duplicate|escape|normalized/i,
        );
      }
    }),
  );

  // The replacement path is a second, independent route to the same bytes, and
  // the driver-shaped replacement is what produced the one inversion on record.
  suite.test('locks-cas', 'chronology: replacement authority cannot install finished_at before started_at', () =>
    withTempDirectory('plan-run-replacement-chronology-', async (root) => {
      const file = replacementFile(root);
      const current = bindPlan(
        api,
        tuple('blocked', {
          blocker: blocker('review_failed'),
          draft_review: reviewPhase('blocked'),
        }),
      );
      const next = amendReplacementPlan(api, replacementFixture(api, current));
      fs.writeFileSync(file, current.bytes);
      const input = {
        authority: replacementAuthority(api, next.run),
        currentIdentity: {
          goalId: IDS.goal,
          planPath: PLAN_PATH,
          repositoryId: REPOSITORY_ID,
          runId: IDS.run,
        },
        expectedBytesSha256: api.sha256(current.bytes),
        file,
        repo: root,
        liveSourceSha256: REPLACEMENT_AUTH_SOURCE,
      };
      await expectReject(
        () =>
          api.replacePlanRunInPlace({
            ...input,
            nextBytes: withStamps(next.bytes, '"2026-07-24T05:00:00Z"', '"2026-07-24T02:00:00Z"'),
          }),
        /finished_at cannot precede started_at/,
      );
      assert.equal(fs.readFileSync(file, 'utf8'), current.bytes.toString());
      const ordered = await api.replacePlanRunInPlace({
        ...input,
        nextBytes: withStamps(next.bytes, '"2026-07-24T02:00:00Z"', '"2026-07-24T05:00:00Z"'),
      });
      assert.equal(ordered.run.run_id, IDS.otherRun);
    }),
  );
}
