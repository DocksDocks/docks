/**
 * Conditions of the kit's omp trigger rules, checked by the ported omp
 * matcher in `../lib/ompTriggerRules`. Each rule has a table of wrong forms,
 * which must fire, and correct forms, which must stay quiet. Every shell row
 * runs through the bash tool and through eval `sh()` code, because eval runs
 * shell commands too (`cli/docs/command-guards.md`). A correct form must also
 * stay quiet on each partial buffer, because omp tests the buffer after each
 * streamed delta.
 */
import { describe, expect, it } from "vitest";

import {
  TRIGGER_RULE_NAMES,
  kitTriggerRule,
  ruleTriggers,
  ruleTriggersOnProse,
  ruleTriggersWhileStreaming,
  type TriggerRuleName,
  type TriggerToolCall,
} from "../lib/ompTriggerRules";

interface RuleCases {
  /** Shell commands that must fire the rule. */
  readonly wrong: ReadonlyArray<string>;
  /** Shell commands that must not fire the rule. */
  readonly correct: ReadonlyArray<string>;
  /** Eval code that must fire the rule without a shell command. */
  readonly wrongEvalCode?: ReadonlyArray<string>;
}

const CASES: Record<TriggerRuleName, RuleCases> = {
  "file-removal": {
    wrong: [
      "rm -rf build",
      "sudo rm -rf x",
      "/bin/rm -f x",
      "ls; rm x",
      "find . -name x -delete",
      "find . -exec rm {} +",
      "xargs rm",
      "git worktree remove --force -- /x",
      "git worktree remove -f -- /x",
      "git worktree remove -qf -- /x",
      "git worktree remove --fo -- /x",
      "unlink x",
      "shred x",
    ],
    correct: [
      "gio trash -- build",
      "git rm -- a.txt",
      "git worktree remove -- /x/y",
      "docks-kit scratch remove /x",
      "trash build",
      "docker run --rm img",
      "ls -la",
    ],
    wrongEvalCode: ["os.remove(p)", "shutil.rmtree(p)", "fs.rmSync(p)"],
  },
  "git-safety": {
    wrong: [
      "git clean -fdx",
      "git reset --hard",
      "git commit --no-verify -m x",
      "git commit -n -m x",
      "git -c core.hooksPath=/dev/null commit -m x",
      "git push --force origin main",
      "git push -f",
      "git push --force-with-lease",
      "git push --force-if-includes origin main",
      "git push --for origin main",
      "git push --forc origin main",
      "git push --fo origin main",
      "git push origin +main",
      "git push --mirror origin",
      "git push --mir origin",
      "git push --m origin",
      "git push --prune origin",
      "git push origin $BRANCH",
      "git commit -m x && git push",
      "git rm -f a",
      "git rm --for a",
      "git rm --fo a",
      "git branch -D feat",
      "git branch -qD feat",
      "git branch -df feat",
      "git branch --delete --force feat",
      "git checkout -- .",
      "git checkout .",
      "git checkout -- :/",
      "git restore .",
      "git restore :/",
      "git stash clear",
      "git stash drop",
    ],
    correct: [
      "git push -u origin HEAD",
      "git push origin --delete a b",
      "git push --follow-tags",
      "git rm -- a.txt",
      'git commit -m "fix tests"',
      "git clean -n",
      "git restore -- a.txt",
      "git checkout -- a.txt",
      "git branch -d feat",
      "git stash list",
    ],
  },
  "temp-and-background": {
    wrong: [
      "mkdir -p /tmp/build",
      "mktemp -d",
      "nohup bun run dev &",
      "tmux new -d -s x",
      "vitest --watch",
      "npm i -g x",
      "bun add -g x",
      "crontab -e",
      "systemctl --user enable x",
      "docker system prune",
    ],
    correct: ["cat /tmp/log", "bun test", "npm install", "crontab -l", "tmux ls", "docker ps"],
  },
  "worktree-location": {
    wrong: ["git worktree add ../x", "git worktree add /tmp/wt"],
    correct: [
      "git worktree add /home/user/.local/share/agent-worktrees/repo/x",
      "git worktree list",
    ],
  },
  "literal-paths": {
    wrong: ["cd ~/projects", "ls $HOME", "export HOME=/x"],
    correct: ["ls /home/user/projects", "echo $XDG_DATA_HOME"],
  },
  "remote-cleanup": {
    wrong: [
      "wrangler delete",
      "kubectl delete pod x",
      "terraform destroy",
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
      "ssh prod podman volume rm v",
      "ssh prod sudo systemctl stop nginx",
      "ssh prod systemctl disable nginx",
      "ssh prod systemctl mask nginx",
      "ssh prod kill 1234",
      "ssh prod pkill nginx",
      "ssh prod killall nginx",
      "rsync -a --delete src/ host:/srv/",
      "rclone delete remote:bucket",
      "rclone deletefile remote:bucket/a",
      "rclone purge remote:bucket",
      "rclone rmdir remote:dir",
      "rclone cleanup remote:",
      "oc delete pod x",
      "gh repo delete o/r",
      "gh release delete v1",
      "gh secret delete TOKEN",
      "gh variable delete NAME",
      "gh codespace delete -c x",
      "gh gist delete 123",
      "gh cache delete 123",
      "gh run delete 123",
      "gh api -X DELETE repos/o/r",
      "gh api --method DELETE repos/o/r",
      "docker -H ssh://prod rm c",
      "podman --remote rm c",
      "podman -r stop c",
      "podman --connection prod rm c",
    ],
    correct: [
      "wrangler deploy --env staging",
      "kubectl get pods",
      "ssh host uptime",
      "rsync -a src/ dst/",
      "rsync -a --delete src/ dst/",
      "rclone ls remote:bucket",
      "oc get pods",
      "gh repo view",
      "gh api repos/o/r",
    ],
  },
};

interface Row {
  readonly title: string;
  readonly call: TriggerToolCall;
}

/** The bash call and the eval `sh()` call that run one shell command. */
function shellRows(command: string): Array<Row> {
  const pythonString = command.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return [
    { title: `bash: ${command}`, call: { tool: "bash", command } },
    { title: `eval sh(): ${command}`, call: { tool: "eval", code: `sh("${pythonString}")` } },
  ];
}

describe.each(TRIGGER_RULE_NAMES)("omp trigger rule %s", (name) => {
  const rule = kitTriggerRule(name);
  const cases = CASES[name];
  const wrongRows = [
    ...cases.wrong.flatMap(shellRows),
    ...(cases.wrongEvalCode ?? []).map((code): Row => ({
      title: `eval code: ${code}`,
      call: { tool: "eval", code },
    })),
  ];

  it("watches only the bash and eval tools, never prose", () => {
    expect(rule.scope.everyTool).toBe(false);
    expect([...rule.scope.tools].sort()).toEqual(["bash", "eval"]);
    expect(rule.scope.prose).toBe(false);
    for (const command of cases.wrong) expect(ruleTriggersOnProse(rule, command)).toBe(false);
  });

  it.each(wrongRows)("fires on $title", ({ call }) => {
    expect(ruleTriggers(rule, call)).toBe(true);
  });

  it.each(cases.correct.flatMap(shellRows))("stays quiet on $title", ({ call }) => {
    expect(ruleTriggers(rule, call)).toBe(false);
    expect(ruleTriggersWhileStreaming(rule, call)).toBe(false);
  });
});
