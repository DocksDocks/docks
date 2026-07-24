import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bindPlan, HASHES, IDS, PLAN_PATH, REPOSITORY_ID, reviewPhase, tuple } from './fixtures/plan-run-v1.mjs';
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
}
