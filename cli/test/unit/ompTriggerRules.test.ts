/**
 * Conditions of the kit's omp trigger rules, checked by the ported omp
 * matcher in `../lib/ompTriggerRules`. Each rule has a table of wrong forms,
 * which must fire, and correct forms, which must stay quiet. Every shell row
 * runs through the bash tool and through eval `sh()` code in Python and in
 * JavaScript, because eval runs shell commands too
 * (`cli/docs/command-guards.md`). Every row runs in the compact and the
 * spaced JSON layout, and some rows use the pretty layout. A correct form
 * must also stay quiet on each partial buffer, because omp tests the buffer
 * after each streamed delta.
 *
 * Two guards keep the conditions from freezing omp, which tests every
 * condition on the whole buffer at each delta, on its main thread (plan
 * DocksDocks/public#187). The shape case here rejects a condition that does
 * not start with the forward key prefix or that has a `|` outside every group;
 * it cannot prove linear time. The backstop, `ompTriggerBackstop.test.ts`,
 * tests the measured input families for linear time. A condition can still
 * backtrack on a run that no generator holds, so a new condition needs a new
 * family when its shape is new.
 */
import { basename } from "node:path";
import { describe, expect, it } from "vitest";

import { payloadPaths } from "../../src/payload";
import {
  TRIGGER_RULE_NAMES,
  UNROLLED_KEY_PREFIX,
  conditionShapeFaults,
  kitTriggerRule,
  ruleTriggers,
  ruleTriggersWhileStreaming,
  toolArgumentText,
  type TriggerRuleName,
  type TriggerToolCall,
} from "../lib/ompTriggerRules";

interface RuleCases {
  /** Shell commands that must fire the rule. */
  readonly wrong: ReadonlyArray<string>;
  /** Shell commands that must not fire the rule. */
  readonly correct: ReadonlyArray<string>;
  /** Other tool calls that must fire the rule, such as eval code without a shell command. */
  readonly wrongCalls?: ReadonlyArray<TriggerToolCall>;
  /** Other tool calls that must not fire the rule, such as a call with an intent field. */
  readonly correctCalls?: ReadonlyArray<TriggerToolCall>;
}

const CASES: Record<TriggerRuleName, RuleCases> = {
  "file-removal": {
    wrong: [
      "rm -rf build",
      "rm\t-rf x",
      "sudo rm -rf x",
      "/bin/rm -f x",
      "ls; rm x",
      "cd build\nrm x",
      "LC_ALL=C rm old-file",
      "LC_ALL=C unlink old-file",
      "A=1 B=2 shred old-file",
      "sudo LC_ALL=C rm x",
      "find . -name x -delete",
      "find . -exec rm {} +",
      "find . -execdir rm {} +",
      "xargs rm",
      "git worktree remove --force -- /x",
      "git worktree remove -f -- /x",
      "git worktree remove -qf -- /x",
      "git worktree remove --fo -- /x",
      "git -P worktree remove --force -- /x",
      "unlink x",
      "shred x",
      "git rm -r -- old-dir",
      "git rm -r --cached old-dir",
      "git rm --cached -r -- old-dir",
      "git rm -rq -- old-dir",
      "git -C repo rm -r -- old-dir",
      "git\trm\t-r old-dir",
    ],
    correct: [
      "gio trash -- build",
      "git rm -- a.txt",
      "git worktree remove -- /x/y",
      "docks-kit scratch remove /x",
      "trash build",
      "docker run --rm img",
      "ls -la",
      "echo\trm x",
      "ls\ngio trash -- build",
      "git worktree remove -- -f",
      "git rm -- 'old-dir/*'",
      "git rm --cached -- 'old-dir/*'",
      'git rm --cached -q -- "old-dir/*"',
      "git rm -- -r",
      "git rm --cached -- -r",
    ],
    wrongCalls: [
      { tool: "bash", command: "rm -rf build", layout: "pretty" },
      { tool: "eval", code: "os.remove(p)" },
      { tool: "eval", code: "shutil.rmtree(p)" },
      { tool: "eval", code: "Path(p).unlink()" },
      { tool: "eval", language: "js", code: "fs.promises.rm(p)" },
      { tool: "eval", language: "js", code: "fs.rmSync(p)" },
      { tool: "eval", language: "js", code: "unlinkSync(p)" },
      { tool: "eval", language: "js", code: "await rm(p, { recursive: true })" },
      { tool: "eval", language: "js", code: "await Bun.file(p).delete()" },
    ],
    correctCalls: [
      {
        tool: "bash",
        intent: "rm the temp files",
        command: "gio trash -- build",
        layout: "pretty",
      },
      { tool: "bash", intent: "Checking the rm usage", command: "git rm -- old.yaml" },
      { tool: "bash", intent: "rm the temp files", command: "gio trash -- build" },
      { tool: "eval", intent: "rm the temp files", code: 'sh("gio trash -- build")' },
      { tool: "bash", command: "ls", intent: "rm old files next", intentLast: true },
      { tool: "eval", code: "Path(p).exists()" },
    ],
  },
  "git-safety": {
    wrong: [
      "git clean -fdx",
      "git clean -d",
      "git clean",
      "git clean -fd -- -n",
      "git clean -fd --\t-n",
      "git clean\t-fd",
      "git\tpush --force",
      "git -C repo clean -x",
      "git reset --hard",
      "git commit --no-verify -m x",
      "git commit --no-veri -m x",
      "git commit --no-verif -m x",
      "git commit -n -m x",
      "git -c core.hooksPath=/dev/null commit -m x",
      "git -c core.hookspath=/dev/null commit -m x",
      "git config core.hookspath x",
      "git push --force origin main",
      "git push -f",
      "git -P push --force",
      "git -p push -f",
      "git push --force-with-lease",
      "git push --force-if-includes origin main",
      "git push --for origin main",
      "git push --forc origin main",
      "git push --fo origin main",
      "git push origin +main",
      "git push origin -- +main",
      'git push origin "+main"',
      "git push --mirror origin",
      "git push --mir origin",
      "git push --m origin",
      "git push --prune origin",
      "git push origin $BRANCH",
      "git push origin $(git branch --show-current)",
      "git push origin `git branch --show-current`",
      "git push -u origin HEAD && echo ok",
      "git commit -m x && git push",
      "git fetch; GIT_TRACE=1 git push",
      "git status\ngit push --force",
      "git rm -f a",
      "git rm --for a",
      "git rm --fo a",
      "git branch -D feat",
      "git branch -qD feat",
      "git branch -df feat",
      "git branch --delete --force feat",
      "git checkout -- .",
      "git checkout .",
      'git checkout -- "."',
      "git checkout -- :/",
      "git restore .",
      "git restore :/",
      'git restore ":/"',
      "git restore --staged --worktree .",
      "git restore -SW .",
      "git restore . --staged -W",
      "git restore -- --staged .",
      "git stash clear",
      "git stash drop",
    ],
    correct: [
      "git push -u origin HEAD",
      "git push -u origin HEAD 2>&1 | tail -3",
      "git push -u origin HEAD\ngit status",
      "git push origin --delete a b",
      "git push --follow-tags",
      "git rm -- a.txt",
      'git commit -m "fix tests"',
      "git commit --no-verbose -m x",
      "git commit -m x -- --no-verify",
      "git commit -m x -- -n",
      "git rm -- -f",
      "git reset -q -- --hard",
      "git push origin -- -f",
      "git clean -n",
      "git clean -nd",
      "git clean -d -n",
      "git clean --dry-run -d",
      "git clean -n -- x",
      "git clean -n\t-d",
      "git restore -- a.txt",
      "git restore --staged .",
      "git restore -S .",
      "git restore . --staged",
      "git restore --staged -- .",
      "git restore --staged -- -W .",
      "git checkout -- a.txt",
      "git branch -d feat",
      "git branch -d x --format=y",
      "git branch -d -- -D",
      "git branch -d x -- -f",
      "git stash list",
    ],
    wrongCalls: [{ tool: "eval", language: "js", code: "await sh`git push origin ${branch}`" }],
    correctCalls: [
      { tool: "bash", intent: "Run git clean", command: "git clean -n", layout: "pretty" },
      { tool: "bash", intent: "Checking git push result", command: "git status; git log -1" },
      { tool: "bash", intent: "Run git clean", command: "git clean -n" },
      { tool: "bash", intent: "git push --force check", command: "git push -u origin HEAD" },
      { tool: "bash", command: "git status", intent: "Then git push --force", intentLast: true },
      {
        tool: "eval",
        language: "js",
        code: "const out = await sh`git push -u origin HEAD`;\nconsole.log(out);",
      },
      { tool: "eval", code: 'sh("git push -u origin HEAD")\nprint("done; ok")' },
    ],
  },
  "temp-and-background": {
    wrong: [
      "mkdir -p /tmp/build",
      'mkdir -p "/tmp/x"',
      "cd x\nmkdir /tmp/y",
      "cp ./a /tmp/b",
      'cp ./a "/tmp/b"',
      "cp -r src /tmp/x 2>/dev/null",
      "git clone https://example.com/r.git /tmp/r",
      "ls > /tmp/x",
      'ls > "/tmp/x"',
      "curl -o /tmp/x https://example.com",
      "TMPDIR=/tmp/x bun test",
      "mktemp -d",
      "nohup bun run dev &",
      "PORT=3000 nohup bun run dev &",
      "setsid bun run dev",
      "bun run dev & disown",
      "tmux new -d -s x",
      "tmux -L sock new -d",
      "tmux",
      "screen -dmS x bun run dev",
      "TERM=xterm screen -S x",
      "vitest --watch",
      "npm i -g x",
      "npm -g i x",
      "bun add -g x",
      "pnpm -g add x",
      "yarn global add x",
      "pipx install ruff",
      "cargo install ripgrep",
      "go install golang.org/x/tools/gopls@latest",
      "gem install rails",
      "uv tool install ruff",
      "crontab -e",
      "systemctl --user enable x",
      "docker system prune",
      "docker volume rm v",
      "docker rmi img",
      "docker builder prune",
    ],
    correct: [
      "cat /tmp/log",
      "cp /tmp/a ./b",
      "cp /tmp/a\t./b",
      'cp "/tmp/a" ./b',
      'rsync -a "/tmp/x/" dst/',
      "mkdir -p build\ncat /tmp/log",
      "bun test",
      "vitest --watch=false",
      "npm install",
      "go build ./...",
      "uv pip install -r req.txt",
      "crontab -l",
      "tmux ls",
      "tmux -L sock ls",
      "screen -ls",
      "docker ps",
      "npm install x -- -g",
      "bun add x -- -g",
    ],
    correctCalls: [
      { tool: "bash", intent: "mkdir /tmp/x plan", command: "mkdir -p build" },
      { tool: "bash", command: "ls", intent: "Then mktemp -d", intentLast: true },
    ],
  },
  "worktree-location": {
    wrong: [
      "git worktree add /home/user/.local/share/agent-worktrees/repo/wt",
      "git worktree add ../x",
      'git worktree add "../x"',
      "git -C r worktree add -b f /tmp/wt main",
      "git -p worktree add ../x",
    ],
    correct: ["git worktree list", "git worktree remove -- /x", "git worktree prune"],
    correctCalls: [{ tool: "bash", intent: "git worktree add ../x", command: "git worktree list" }],
  },
  "literal-paths": {
    wrong: ["cd ~/projects", "ls $HOME", "ls ${HOME}/x", "export HOME=/x"],
    correct: ["ls /home/user/projects", "echo $XDG_DATA_HOME"],
    correctCalls: [
      { tool: "bash", intent: "cd ~/x note", command: "ls /home/user/x" },
      { tool: "bash", command: "ls /home/user", intent: "Then cd ~/x", intentLast: true },
    ],
  },
  "remote-cleanup": {
    wrong: [
      "wrangler delete",
      "kubectl delete pod x",
      "kubectl\tdelete pod x",
      "ssh prod\trm -rf /srv",
      "terraform destroy",
      "helm list -A\nhelm uninstall x",
      "aws s3 rb s3://bucket --force",
      "aws ec2 terminate-instances --instance-ids i-1",
      "neonctl branches delete br",
      "neon databases drop app",
      "pscale branch delete db br",
      "turso db destroy app",
      "firebase functions:delete fn",
      "gsutil rm gs://b/x",
      "s3cmd del s3://b/x",
      "s3cmd rmdir s3://b/dir",
      "hcloud server delete x",
      "linode-cli linodes delete 1",
      "scw object bucket purge b",
      "oci db autonomous-database deprovision --id x",
      "ibmcloud resource service-instance-delete x",
      "nomad job stop x",
      "eksctl delete cluster x",
      "render services teardown x",
      "mc rb --force minio/bucket",
      "fly volumes wipe x",
      "kubectl apply --prune -l app=x -f dir/",
      'psql -h prod -c "DROP TABLE users"',
      'mysql -e "drop database app"',
      'sqlite3 app.db "drop schema x"',
      'mongosh --eval "db.dropDatabase()"',
      "dropdb app",
      "redis-cli -h prod FLUSHALL",
      "redis-cli flushdb",
      "ssh prod rm -rf /srv",
      "ssh prod 'gio trash -- /srv/data'",
      "ssh prod trash /srv/data",
      "ssh prod find /srv -name x -delete",
      "ssh prod shred /srv/x",
      "ssh prod unlink /srv/x",
      "ssh prod truncate -s 0 /srv/log",
      "ssh prod docker rm c",
      "ssh prod docker rmi img",
      "ssh prod docker stop c",
      "ssh prod docker kill c",
      "ssh prod 'docker volume rm v'",
      "ssh prod docker system prune",
      "ssh prod docker compose down",
      "ssh prod podman rm c",
      "ssh prod podman rmi img",
      "ssh prod podman stop c",
      "ssh prod podman kill c",
      "ssh prod podman volume rm v",
      "ssh prod podman system prune",
      "ssh prod podman compose down",
      "ssh prod sudo systemctl stop nginx",
      "ssh prod systemctl disable nginx",
      "ssh prod systemctl mask nginx",
      "ssh prod kill 1234",
      "ssh prod pkill nginx",
      "ssh prod killall nginx",
      "rsync -a --delete src/ host:/srv/",
      'rsync -a --delete src/ "host:/srv/"',
      "rsync -a --delete src/ host:/srv/ 2>&1 | tail -5",
      "rsync -a --delete src/ host:/srv/ > /dev/null",
      "rclone delete remote:bucket",
      "rclone deletefile remote:bucket/a",
      "rclone purge remote:bucket",
      "rclone rmdir remote:dir",
      "rclone cleanup remote:",
      "rclone sync src remote:bucket",
      "rclone sync ./site remote:bucket/path --progress",
      "oc delete pod x",
      "gh repo delete o/r",
      "gh repo deploy-key delete 1",
      "gh release delete v1",
      "gh secret delete TOKEN",
      "gh variable delete NAME",
      "gh codespace delete -c x",
      "gh gist delete 123",
      "gh cache delete 123",
      "gh run delete 123",
      "gh issue delete 1",
      "gh label delete bug",
      "gh project delete 1",
      "gh project item-delete 1 --id x",
      "gh ssh-key delete 1",
      "gh api -X DELETE repos/o/r",
      'gh api -X "DELETE" repos/o/r',
      "gh api --method DELETE repos/o/r",
      "docker -H ssh://prod rm c",
      "docker -c prod rm c",
      "docker --context prod stop c",
      "DOCKER_HOST=ssh://prod docker rm c",
      "CONTAINER_HOST=ssh://prod podman rm c",
      "podman --remote rm c",
      "podman -r stop c",
      "podman --connection prod rm c",
      "podman --url ssh://prod rm c",
    ],
    correct: [
      "wrangler deploy --env staging",
      "kubectl get pods",
      "helm list -A\ndocker compose down",
      "aws s3 ls",
      "neonctl branches list",
      "gsutil ls",
      'psql -c "select 1"',
      "ssh host uptime",
      "rsync -a src/ dst/",
      "rsync -a --delete src/ dst/",
      "rsync -a src/ host:/srv/",
      "rsync -a --delete host:/srv/ ./local",
      "rsync -a --delete host:/srv/\t./local",
      "rclone ls remote:bucket",
      "rclone sync a b",
      "rclone sync remote:a ./b",
      "oc get pods",
      "gh repo view",
      "gh issue list",
      "gh api repos/o/r",
      "rsync -a src/ host:/srv/ -- --delete",
      "gh api repos/o/r -- -X DELETE",
      "docker run --rm img -- -H x rm c",
      "podman run img -- --remote rm c",
      "docker ps",
    ],
    correctCalls: [
      {
        tool: "bash",
        command: "kubectl get pods",
        intent: "Listing pods to delete",
        intentLast: true,
        layout: "pretty",
      },
      { tool: "bash", intent: "Comparing kubectl manifests", command: "git rm -- old.yaml" },
      { tool: "bash", intent: "Checking ssh access", command: "pkill -f vite" },
      { tool: "bash", intent: "Check aws s3 rb", command: "aws s3 ls" },
      {
        tool: "bash",
        command: "kubectl get pods",
        intent: "Listing pods to delete",
        intentLast: true,
      },
      {
        tool: "bash",
        command: "ssh prod uptime",
        intent: "Checking load before kill",
        intentLast: true,
      },
    ],
  },
};

interface Row {
  readonly title: string;
  readonly call: TriggerToolCall;
}

/** The text of a double-quoted Python or JavaScript string that holds `command`. */
function quotedString(command: string): string {
  return command.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

/** The bash call and the eval `sh()` calls, in Python and JavaScript, that run one shell command. */
function shellCalls(command: string): Array<TriggerToolCall> {
  const template = command.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
  return [
    { tool: "bash", command },
    { tool: "eval", code: `sh("${quotedString(command)}")` },
    { tool: "eval", language: "js", code: `await sh\`${template}\`` },
    { tool: "eval", language: "js", code: `await sh("${quotedString(command)}");` },
  ];
}

/** The rows of one call: its own layout, or else the compact and the spaced layouts. */
function layoutRows(call: TriggerToolCall): Array<Row> {
  const calls =
    call.layout === undefined
      ? (["compact", "spaced"] as const).map((layout): TriggerToolCall => ({ ...call, layout }))
      : [call];
  return calls.map((each) => ({ title: toolArgumentText(each), call: each }));
}

it("lists every rule file of the kit plugin", () => {
  const files = payloadPaths("SoT/.omp/plugin/rules/").map((path) => basename(path, ".md"));
  expect([...TRIGGER_RULE_NAMES].sort()).toEqual([...files].sort());
});

it("starts each condition at the forward key prefix, with no | outside every group", () => {
  const faults = TRIGGER_RULE_NAMES.flatMap((name) =>
    kitTriggerRule(name).conditionSources.flatMap((source, index) => {
      const conditionFaults = conditionShapeFaults(source);
      return conditionFaults.length === 0
        ? []
        : [`${name}.md#${index}: ${conditionFaults.join("; ")}`];
    }),
  );
  expect(faults).toEqual([]);
});

describe("conditionShapeFaults", () => {
  it("rejects a | outside every group, because its next alternative needs no key prefix", () => {
    expect(conditionShapeFaults(`${UNROLLED_KEY_PREFIX}foo|bar`)).toEqual([
      expect.stringMatching(/has a "\|" outside every group/u),
    ]);
  });

  it("accepts a | inside a group or a character class", () => {
    expect(conditionShapeFaults(`${UNROLLED_KEY_PREFIX}(?:foo|bar)[|]`)).toEqual([]);
  });

  it("rejects a leading unbounded lookbehind, the form that froze omp, because it does not start at the key", () => {
    const leadingLookbehind = String.raw`(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)rm\b`;
    expect(conditionShapeFaults(leadingLookbehind)).toEqual([
      "does not start with the forward key prefix",
    ]);
  });
});

describe.each(TRIGGER_RULE_NAMES)("omp trigger rule %s", (name) => {
  const rule = kitTriggerRule(name);
  const cases = CASES[name];
  const wrongRows = [...cases.wrong.flatMap(shellCalls), ...(cases.wrongCalls ?? [])].flatMap(
    layoutRows,
  );
  const correctRows = [...cases.correct.flatMap(shellCalls), ...(cases.correctCalls ?? [])].flatMap(
    layoutRows,
  );

  it("watches only the bash and eval tools, never prose or thinking", () => {
    expect(rule.scope.everyTool).toBe(false);
    expect([...rule.scope.tools].sort()).toEqual(["bash", "eval"]);
    expect(rule.scope.prose).toBe(false);
    expect(rule.scope.thinking).toBe(false);
  });

  it("fires again on each later wrong form, with repeatMode always", () => {
    expect(rule.repeatMode).toBe("always");
  });

  it("has a wrong row that fires each condition", () => {
    const texts = wrongRows.map((row) => toolArgumentText(row.call));
    const unfired = rule.conditions.flatMap((condition, index) =>
      texts.some((text) => condition.test(text)) ? [] : [`${index}: ${condition.source}`],
    );
    expect(unfired).toEqual([]);
  });

  it.each(wrongRows)("fires on $title", ({ call }) => {
    expect(ruleTriggers(rule, call)).toBe(true);
  });

  it.each(correctRows)("stays quiet on $title", ({ call }) => {
    expect(ruleTriggers(rule, call)).toBe(false);
    expect(ruleTriggersWhileStreaming(rule, call)).toBe(false);
  });
});
