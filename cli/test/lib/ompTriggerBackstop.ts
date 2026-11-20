/**
 * Bun backstop for the conditions of the kit's omp trigger rules (plan issue
 * #187). omp 19.0.0 tests every condition on the whole tool-call buffer at
 * each streamed delta, on its main thread, in JavaScriptCore. The unit suite
 * runs on V8, where a condition that froze omp for seconds took 56 ms against
 * 3 ms and still fired, so only a JavaScriptCore run shows that cost, and the
 * fail-open where JavaScriptCore stops a search at its match limit and reports
 * no match. `ompTriggerRules.test.ts` runs this script under Bun.
 *
 * Checks, each on the conditions of every `*.md` rule file:
 *
 * - budget, regex JIT on: one pass of all conditions over a 20 KB Python cell,
 *   a 20 KB bash command, and a 30 KB one-line `KEY=value` chain stays under
 *   `BUDGET_MS` per buffer. The rewritten rules take about 10 to 20 ms.
 * - fire, regex JIT on: `git reset --hard` at the end of the 20 KB Python cell
 *   fires git-safety, which catches the fail-open.
 * - scaling, regex JIT off: each condition alone, on each adversarial input
 *   shape, at 16 KB and 64 KB. The 64 KB time stays within `MAX_GROWTH_RATIO`
 *   times the 16 KB time plus `GROWTH_NOISE_MS`, and never passes
 *   `SCALING_CEILING_MS`. The JIT gives up past about 16 K backtrack frames
 *   and the interpreter takes over, so the interpreter time bounds what omp
 *   pays, and without the JIT the ratio does not depend on where that cliff
 *   falls. The ceiling catches the match-limit plateau, where the ratio stays
 *   near 1.
 * - dense scaling, regex JIT on: each condition alone, on one line that
 *   repeats one unit, such as `git restore `, to 16 KB and 64 KB, as a bash
 *   `command` and in a Python `sh("…")` cell. Each unit is the head of a real
 *   command that a condition starts to match, and the tail that completes
 *   the match is not there. The same limits apply. Code review round 1 found
 *   a quadratic scan of candidate starts on this input: each unit starts a
 *   candidate, and each candidate scans to the end of the line. The other
 *   shapes do not show it, because their trigger words, such as `git0`,
 *   match no condition. This pass keeps the JIT on, because omp pays the
 *   cost with the JIT on.
 * - head-then-run scaling, regex JIT on: each condition alone, on one line
 *   that holds one head, such as `aws ` or `docker -H x `, once, and then
 *   repeats one run, such as `x ` or `x\\`, to 16 KB and 64 KB. The shapes
 *   and the limits are the same as in the dense check. Audits found this
 *   cost: a group loop inside a lookaround drops out of the JavaScriptCore
 *   JIT, and the interpreter keeps the state of each iteration until the
 *   match attempt ends. One head with a long run thus gives one long
 *   attempt: remote-cleanup#0 took 0.9 ms at 16 KB and 82 ms at 64 KB. The
 *   dense check repeats the head, so each attempt is short there and the
 *   check does not see this cost. `HEAD_RUNS_FOUND` holds the heads and runs
 *   that the remote-cleanup audit found. Each other condition gets its first
 *   `HEAD_RUN_DERIVED_HEADS` dense units with a head word and its first
 *   `HEAD_RUN_GENERIC_HEADS` dense units as heads, each with each run of
 *   `HEAD_RUN_RUNS`.
 * - nested scaling, regex JIT on: each condition alone, on one line that
 *   repeats one unit of `NESTED_UNITS` to 16 KB and 64 KB. The shapes and
 *   the limits are the same as in the dense check. A nested unit puts a
 *   command start inside the option, value, or target region of an earlier
 *   start. Audits found quadratic scans on these lines that the dense and
 *   head-then-run checks missed: file-removal#0 took 4.3 s at 64 KB on
 *   `-u rm `, and git-safety#8 took 1.1 s on `git -p -p push `.
 * - open lines: the dense, head-then-run, and nested checks also put each line in a
 *   bash command that stops at the end of the line, before the closing `"`
 *   (`bash-open`). omp tests each condition on the partial buffer after each
 *   streamed delta, so most real scans see no end of the string.
 *
 * Usage: `bun cli/test/lib/ompTriggerBackstop.ts [--rules-dir=<dir>]`. The
 * default rules folder is `SoT/.omp/plugin/rules`. The script prints one line
 * that starts with `FAIL` per failed check and exits 1 when any check fails.
 * It runs the scaling checks in child processes, at most one per core at a
 * time: `--scaling=<shapes>` with `BUN_JSC_useRegExpJIT=0`, and
 * `--dense=<share>/<shares>` without that option. JavaScriptCore reads the
 * option only at start-up. The children split the shapes and the groups of
 * pairs of the dense, head-then-run, and nested checks, so the run stays short. The parallel
 * children slow each other down, so a pair that fails there under
 * `NOISE_LIMIT_MS` is only pending. After all of them exit, one serial
 * child per regex JIT mode (`--confirm=off` and `--confirm=on`, with the
 * pending pairs on stdin) times each pending pair again, alone. The pair
 * fails only when it fails there too.
 */
import { readFileSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, join } from "node:path";

import { REPO_DIR } from "./goldenResources";
import { parseTriggerRule } from "./ompTriggerRules";

const BUDGET_MS = 250;
const BUDGET_ATTEMPTS = 3;
const SCALING_SMALL_CHARS = 16_000;
const SCALING_LARGE_CHARS = 64_000;
/** Linear growth from 16 KB to 64 KB gives a ratio of about 4; quadratic growth gives 16. */
const MAX_GROWTH_RATIO = 8;
/**
 * Absolute allowance on top of the ratio for a busy machine: under a parallel
 * `bun run check`, a linear pair with 1.40 ms at 16 KB measured 13.9 ms at 64 KB.
 * Quadratic growth still fails once the 16 KB time passes about 2 ms, where
 * 16 times the 16 KB time exceeds 8 times plus this allowance, and the
 * ceiling bounds every 64 KB time.
 */
const GROWTH_NOISE_MS = 15;
/** About 3 times the slowest 64 KB time of the rewritten rules with the JIT off. */
const SCALING_CEILING_MS = 100;
/** A failing pair is timed this many times in all before it fails the check. */
const PAIR_ATTEMPTS = 3;
/**
 * A call at this time or more is no load noise: its pair fails without a
 * retry and without the serial confirm step. Under the parallel children, a
 * linear pair took 4 to 7 times its time alone, up to 313 ms. The old rules
 * take seconds per call, so they still fail at once.
 */
const NOISE_LIMIT_MS = 1000;
/** A 16 KB time under this does not set the worst ratio of the summary: it is timer noise. */
const RATIO_REPORT_MIN_MS = 0.05;
const REGEX_JIT_ENV = "BUN_JSC_useRegExpJIT";
const FAIL = "FAIL";

/** A short buffer that compiles each regex before any timed call. */
const WARM_UP_TEXT = '{"command":"ls"}';

interface Condition {
  /** File name and condition index, such as `git-safety.md#3`. */
  readonly label: string;
  readonly regex: RegExp;
}

interface LoadedRule {
  readonly name: string;
  readonly conditions: ReadonlyArray<Condition>;
}

function loadRules(rulesDir: string): Array<LoadedRule> {
  return readdirSync(rulesDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const rule = parseTriggerRule(
        basename(file, ".md"),
        readFileSync(join(rulesDir, file), "utf8"),
      );
      return {
        name: rule.name,
        conditions: rule.conditions.map((regex, index) => ({ label: `${file}#${index}`, regex })),
      };
    });
}

const bashCall = (command: string): string => JSON.stringify({ i: "Stress", command });
const pythonCall = (code: string): string => JSON.stringify({ i: "Stress", language: "py", code });

/** A Python line that prints escaped JSON, as hook test cells do. */
const PYTHON_JSON_LINE =
  'print("%s", f"{{\\"tool_name\\":\\"Edit\\",\\"tool_input\\":{{\\"file_path\\":\\"{PWD}/README.md\\"}}}}") | node hooks/x.mjs\n';
/** A bash line with many `\"` escapes once it is JSON text, as in the live freeze. */
const BASH_QUOTES_LINE =
  'jq -n --arg p "$PWD" \'{"tool_name":"Bash","tool_input":{"command":"echo \\"hi\\" > \\"$p/out.txt\\""}}\' | node hooks/x.mjs; echo "status=$?"\n';

/**
 * Appends `unit(0)`, `unit(1)`, ... until the argument JSON text reaches
 * `chars`. JSON escapes each character on its own, so the length grows by
 * the escaped length of each unit and the text is built only once.
 */
function fillTo(
  chars: number,
  unit: (index: number) => string,
  wrap: (body: string) => string,
  tail = "",
): string {
  const parts: Array<string> = [];
  let length = wrap(tail).length;
  for (let index = 0; length < chars; index++) {
    const part = unit(index);
    parts.push(part);
    length += JSON.stringify(part).length - 2;
  }
  return wrap(parts.join("") + tail);
}

const pythonJsonCell = (chars: number, tail = ""): string =>
  fillTo(chars, () => PYTHON_JSON_LINE, pythonCall, tail);
const bashQuotesScript = (chars: number): string => fillTo(chars, () => BASH_QUOTES_LINE, bashCall);
const quotedEnvChain = (chars: number): string =>
  fillTo(
    chars,
    (index) => `K${index}="{\\"a\\":\\"v${index}\\"}" `,
    (body) => bashCall(`env ${body}python3 x.py`),
  );

/**
 * Adversarial input shapes: escape-dense text for the key prefix, long
 * `KEY=value` chains and wrapper options for the heads that walk back over
 * them, and many trigger words and delimiters where a condition can start.
 */
const SHAPES: Record<string, (chars: number) => string> = {
  "py-escaped-json": (chars) => pythonJsonCell(chars),
  "bash-escaped-quotes": bashQuotesScript,
  "chain-plain": (chars) =>
    fillTo(
      chars,
      (n) => `A${n}=v${n} `,
      (body) => bashCall(`x ${body}y`),
    ),
  "chain-quoted": quotedEnvChain,
  "chain-then-trigger": (chars) =>
    fillTo(
      chars,
      (n) => `A${n}=v${n} `,
      (body) => bashCall(`x ${body}`),
      "nohup y; x rm y",
    ),
  "env-chain-then-trigger": (chars) =>
    fillTo(
      chars,
      (n) => `A${n}=v${n} `,
      (body) => bashCall(`env ${body}`),
      "nohup bun run dev",
    ),
  "wrapper-runs": (chars) =>
    fillTo(
      chars,
      (n) => `sudo -u u${n} env A${n}=1 xargs nice -n 5 timeout 9 `,
      (body) => bashCall(`${body}true`),
    ),
  "sudo-options": (chars) =>
    fillTo(
      chars,
      (n) => `-u u${n} A${n}=1 `,
      (body) => bashCall(`x sudo ${body}y`),
    ),
  "trigger-words": (chars) =>
    fillTo(
      chars,
      (n) =>
        `echo rm${n} nohup${n} tmux${n} git${n} push${n} docker${n} ssh${n} gh${n} kubectl${n} rclone${n} `,
      bashCall,
    ),
  "delimiter-runs": (chars) => fillTo(chars, (n) => `;&|({\\"'\`!${n % 10} `, bashCall),
  base64: (chars) =>
    fillTo(
      chars,
      (n) => `QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0NTY3ODkrLw${n % 10}`,
      (body) => pythonCall(`import base64\ndata = base64.b64decode("${body}")\nprint(len(data))`),
    ),
  "short-words": (chars) => fillTo(chars, (n) => `echo "item ${n}" 'x' (a) {b} `, bashCall),
};

/**
 * Units for the dense check. Each unit is the head of a real command, such as
 * `git restore `, that a condition starts to match. One line of one unit gives
 * a candidate start at each unit, and the tail that completes the match is not
 * there. The dense check gives `DENSE_COMMON_UNITS` to each condition, and the
 * units of `DENSE_UNITS` only to the condition of their key.
 */
const DENSE_COMMON_UNITS: ReadonlyArray<string> = [
  "x ",
  "echo a ",
  "a=1 ",
  "-x ",
  '\\"q\\" ',
  "; ",
  "(a) ",
  "a/b/c/",
];
const DENSE_UNITS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "file-removal.md#0": [
    "echo rm ",
    "rm=1 ",
    "sudo -u x ",
    "env A=1 ",
    "xargs -n 1 ",
    "( a/b/rm=",
    '\\"rm=\\" ',
    "a/b/c/ ",
    "/a",
    "; a/",
    "(a/b/",
    "a=b/",
    " ./",
    "~/x/",
    " a/rm ",
    "a/rm ",
    "./rm ",
  ],
  "file-removal.md#1": ["-exec a/b ", "-exec ", " -ok x/"],
  "file-removal.md#2": ["find . ", "find . -exec ", "find -x "],
  "file-removal.md#3": ["os.remove ", "os."],
  "file-removal.md#9": ["Bun.file(", "Bun.file(x ", "Bun.file(x).delete "],
  "file-removal.md#10": [
    "git worktree remove ",
    "git worktree remove x ",
    "git -C git worktree remove ",
    "git worktree remove -- x ",
    "git -C ",
  ],
  "file-removal.md#11": [
    "git rm ",
    "git rm x ",
    "git -C git rm ",
    "git rm -- x ",
    "git -C ",
    "git rm -- -x ",
    "git rm -x -- ",
    'git rm \\"-- \\" ',
    " -- git rm ",
    "git -c a=b rm ",
    "git --x=git rm ",
    "-r ",
    "git rm -r ",
    "git rm x -r ",
    "x -- -r ",
    '\\"-r\\" ',
  ],
  "git-safety.md#0": [
    "git clean ",
    "git clean -f ",
    "git clean -n ",
    "git clean -- x ",
    "git clean -f -- x ",
    "git -C ",
    "a\n",
    "git clean -n\n",
    'git clean "q" ',
    "git clean -n -- x ",
  ],
  "git-safety.md#1": [
    "git reset ",
    "git reset x ",
    "git -C ",
    "git --x=git reset ",
    "git -C git reset ",
    "git reset -- x ",
  ],
  "git-safety.md#2": ["git ", "git x ", "git --no-x ", "git -- x "],
  "git-safety.md#3": [
    "git commit ",
    "git commit -m x ",
    "git am ",
    "git commit -- x ",
    "git -C ",
    "git am -- -x ",
    "git am -x -- ",
    " -- git am ",
    "git --x=git am ",
    "git -C git commit ",
    "-n ",
    "git am -n ",
    "git commit -n ",
  ],
  "git-safety.md#4": ["core.hooksPath", "core.hookspath "],
  "git-safety.md#5": [
    "git push ",
    "git push origin x ",
    "git -C git push ",
    "git push -- x ",
    "git -C ",
  ],
  "git-safety.md#6": ["git push ", "git push x ", "git push x; ", "git -C "],
  "git-safety.md#7": ["git push ", "git push x; ", "git push origin x; ", "git -C "],
  "git-safety.md#8": ["git push ", "git push x ", "git push x)", "git -C "],
  "git-safety.md#9": ["; git x ", "&& A=1 git ", "; git -C x push=1 ", "; git -C git -C "],
  "git-safety.md#10": ["git rm ", "git rm x ", "git rm -- x ", "git -C "],
  "git-safety.md#11": ["git branch ", "git branch -d ", "git branch -- x ", "git -C "],
  "git-safety.md#12": [
    "git branch ",
    "git branch -d ",
    "git branch -f ",
    "git branch -d -- x ",
    "git branch -f -- x ",
    "git -C ",
  ],
  "git-safety.md#13": ["git checkout ", "git checkout x ", "git -C "],
  "git-safety.md#14": [
    "git restore ",
    "git restore x ",
    "git restore -S . ",
    "git restore . -S ",
    "git restore -W -- x ",
    "git restore -S -- x ",
    "git restore -- x ",
    "git -C ",
    "-S . ",
    "git restore -S . -- ",
    "git restore . -S -- . ",
    " . ",
    "git restore -S x -W ",
  ],
  "git-safety.md#15": ["git stash ", "git stash -x ", "git -C "],
  "literal-paths.md#0": ["~", " ~x"],
  "literal-paths.md#1": ["$HOMEx ", "$HOME"],
  "literal-paths.md#3": [" HOME", "HOMEx= "],
  "remote-cleanup.md#0": ["kubectl x ", "kubectl get ", "aws s3 ls ", "kubectl -x "],
  "remote-cleanup.md#1": ["psql x ", "psql x; ", "redis-cli x ", "mysql -e drop "],
  "remote-cleanup.md#2": [
    "docker x ",
    "docker -H x ",
    "docker --host x ",
    "docker -H x -- ",
    "docker -- -H x ",
    "-H x rm ",
    "docker -- -H x rm ",
    "docker x -- -H rm ",
    " rm ",
  ],
  "remote-cleanup.md#3": [
    "podman x ",
    "podman -r x ",
    "podman --url x ",
    "podman -r x -- ",
    "-r x rm ",
    "podman -- -r x rm ",
    " rm ",
  ],
  "remote-cleanup.md#4": ["DOCKER_HOST=x ", "DOCKER_HOST=x docker ", "DOCKER_HOST=x podman x "],
  "remote-cleanup.md#5": [
    "ssh x ",
    "ssh x; ",
    "ssh x 'a' ",
    "ssh x find ",
    "ssh x 'docker ",
    "ssh x ;find . ",
  ],
  "remote-cleanup.md#6": [
    "rsync x ",
    "rsync --delete x ",
    "rsync --delete ",
    "rsync --delete x -- ",
    "rsync -- x ",
    "rsync x\\\\",
    "rsync --delete x\\\\",
    "rsync x\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\",
    "rsync x\\t",
    'rsync "a" "b" "c" "d" "e" "f" ',
    "rsync\t--del\t",
    "rsync a:b) ",
    "rsync x a:b) ",
    "rsync -- a:b) ",
    "a:b) ",
    "rsync --delete a:b > c:d > e:f ",
    "rsync x\\\\\\\\ a:b) ",
    "\\\\rsync --delete x ",
    "x\\\\rsync ",
  ],
  "remote-cleanup.md#7": ["rclone x ", "rclone ls "],
  "remote-cleanup.md#8": ["rclone sync ", "rclone sync x ", "rclone x sync ", "rclone sync x:y z "],
  "remote-cleanup.md#9": ["gh x ", "gh x y "],
  "remote-cleanup.md#10": ["gh api ", "gh api x ", "gh api -X "],
  "temp-and-background.md#0": ["mkdir x ", "tee ", "touch -p "],
  "temp-and-background.md#1": ["cp x ", "mv ", "install -d "],
  "temp-and-background.md#2": ["git clone ", "git clone x ", "git -C "],
  "temp-and-background.md#3": ["> x ", ">"],
  "temp-and-background.md#4": [" -o ", " --output "],
  "temp-and-background.md#7": ["( A=1 ", "sudo A=1 ", '\\"nohup=1 '],
  "temp-and-background.md#8": ["( tmux -L x ", "( tmux -x "],
  "temp-and-background.md#9": ["( screen -ls "],
  "temp-and-background.md#10": [" --watch=false "],
  "temp-and-background.md#11": ["npm ", "npm install ", "npm x ", "npm install -- x ", "npm i x "],
  "temp-and-background.md#13": ["bun add ", "pnpm i x "],
  "temp-and-background.md#19": ["crontab -l "],
  "temp-and-background.md#20": ["systemctl -x ", "systemctl "],
  "worktree-location.md#0": ["git worktree ", "git -C git worktree ", "git -C "],
};

/**
 * Runs that the head-then-run check repeats after each head. As raw command
 * text: `x `, `x\\`, `\"q\" `, `a/b/`, and `-x `.
 */
const HEAD_RUN_RUNS: ReadonlyArray<string> = ["x ", "x\\\\", '\\"q\\" ', "a/b/", "-x "];
/**
 * The generic head-then-run family takes this many dense units of each
 * condition as heads, in the order of the dense check. It is only for the
 * conditions that have no entries in `HEAD_RUNS_FOUND`. More heads make the
 * run too long: all units of all conditions give about 8000 pairs.
 */
const HEAD_RUN_GENERIC_HEADS = 3;
/** A dense unit holds a head word when it has a word of 2 or more letters, such as `git` or `rm`. */
const HEAD_WORD = /[A-Za-z]{2}/;
/** For a condition with no entries in `HEAD_RUNS_FOUND`, this many dense units with a head word are heads. */
const HEAD_RUN_DERIVED_HEADS = 2;
/**
 * The slow head-then-run lines that the remote-cleanup audit found, by
 * condition label. These conditions do not get the generic family.
 */
const HEAD_RUNS_FOUND: Readonly<Record<string, ReadonlyArray<HeadRun>>> = {
  "remote-cleanup.md#0": [
    { head: "aws ", run: "x " },
    { head: "aws ", run: "x\\\\" },
    { head: "aws ", run: "\\tx" },
  ],
  "remote-cleanup.md#1": [
    { head: "psql ", run: "x " },
    { head: "psql ", run: "x\\\\" },
    { head: "redis-cli ", run: "x\\\\" },
  ],
  "remote-cleanup.md#2": [
    { head: "docker -H x ", run: "x\\\\" },
    { head: "docker ", run: "x\\\\" },
  ],
  "remote-cleanup.md#3": [
    { head: "podman -r x ", run: "x\\\\" },
    { head: "podman ", run: "x\\\\" },
  ],
  "remote-cleanup.md#4": [
    { head: "DOCKER_HOST=x ", run: "x " },
    { head: "DOCKER_HOST=x ", run: "x\\\\" },
    { head: "DOCKER_HOST=x docker ", run: "x\\\\" },
    { head: "DOCKER_HOST=x ", run: "\\tq" },
  ],
  "remote-cleanup.md#5": [
    { head: "ssh h ", run: "x " },
    { head: "ssh h ", run: "x\\\\" },
    { head: "ssh h find ", run: "x " },
    { head: "ssh h find ", run: "x\\\\" },
    { head: "ssh h find ", run: "\\tfind " },
    { head: "ssh h docker ", run: "x " },
  ],
  "remote-cleanup.md#7": [
    { head: "rclone ", run: "x " },
    { head: "rclone ", run: "x\\\\" },
  ],
  "remote-cleanup.md#8": [
    { head: "rclone ", run: "x\\\\" },
    { head: "rclone sync ", run: "x " },
    { head: "rclone sync ", run: "x\\\\" },
    { head: "rclone sync ", run: "\\tsync " },
  ],
  "remote-cleanup.md#10": [
    { head: "gh api ", run: "x " },
    { head: "gh api ", run: "x\\\\" },
  ],
};
/**
 * Heads and runs of the head-then-run check, by condition label: the entries
 * of `HEAD_RUNS_FOUND`, and for each other condition, its first
 * `HEAD_RUN_DERIVED_HEADS` dense units with a head word, each with each run
 * of `HEAD_RUN_RUNS`. No audit file gave entries for the other conditions.
 */
const HEAD_RUNS: Readonly<Record<string, ReadonlyArray<HeadRun>>> = {
  ...Object.fromEntries(
    Object.entries(DENSE_UNITS)
      .filter(([label]) => HEAD_RUNS_FOUND[label] === undefined)
      .map(([label, units]) => [
        label,
        units
          .filter((unit) => HEAD_WORD.test(unit))
          .slice(0, HEAD_RUN_DERIVED_HEADS)
          .flatMap((head) => HEAD_RUN_RUNS.map((run) => ({ head, run }))),
      ]),
  ),
  ...HEAD_RUNS_FOUND,
};

/**
 * Units for the nested check, by condition label. A nested unit puts a
 * command start inside the option, value, or target region of an earlier
 * start, such as `-u rm ` or `git -p -p push `, so each candidate start
 * scans across the later starts. Audits found quadratic scans on these
 * lines that the dense and head-then-run checks missed: file-removal#0 took
 * 4.3 s at 64 KB on `-u rm `, and git-safety#8 took 1.1 s on
 * `git -p -p push `. No unit repeats a dense unit of its condition.
 */
const NESTED_UNITS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "file-removal.md#0": [
    "sudo -u sudo -u ",
    "env a=env b=",
    '(sudo -n "$(sudo ',
    "-u rm ",
    "-u /bin/rm ",
    "-g\trm\t",
  ],
  "file-removal.md#1": [" -exec -exec ", ' -exec "-exec ', " -ok x -okdir ", " -exec rmx -exec "],
  "file-removal.md#2": [
    "find -name find ",
    'find "find ',
    "find $(find -o ",
    "find \\find ",
    "find x--delete find ",
    "find -delete=x find ",
  ],
  "file-removal.md#3": ["os.remove os.", "x(os.unlink x", "os.removedirsx(", '"os.rmdir\\('],
  "file-removal.md#4": ["shutil.rmtree_shutil.", "shutil.rmtree$shutil.rmtree$", '"shutil."'],
  "file-removal.md#5": [".unlink.rmdir ", ".unlink .unlink x", ".rmdir\\("],
  "file-removal.md#6": ["fs.promises.fs.rm_", "fs.rmSyncx fs.", "fs.promises.rmdir$"],
  "file-removal.md#7": ["rmSync_rmSync_", "xrmSync$", "unlinkSync1"],
  "file-removal.md#8": ["rm rmdir unlink ", ".rm(x.rm (", "$rm("],
  "file-removal.md#9": [
    "Bun.file(Bun.file(",
    'Bun.file("Bun.file(',
    "Bun.file(x).deletex Bun.file(",
    "Bun.file($(Bun.file(",
    "Bun.file(\\Bun.file(",
    "Bun.file(x).delete Bun.file(x).delete;",
  ],
  "file-removal.md#10": [
    "git worktree remove -- -f git worktree remove ",
    'git worktree remove "git worktree remove ',
    "git  worktree  remove ",
    "git -p -p worktree remove ",
    "git -C .x worktree remove ",
  ],
  "file-removal.md#11": [
    "git rm git rm ",
    "git rm -- -r git rm ",
    "git rm x$(git rm x-r ",
    "git  rm ",
    "git -p -p rm ",
    "git -C .x rm ",
  ],
  "git-safety.md#0": [
    "git clean git clean ",
    "git clean -- -n git clean ",
    'git clean "git clean ',
    "git  clean ",
    "git -p -p clean ",
    "git -C x -C y clean ",
  ],
  "git-safety.md#1": [
    "git reset git reset ",
    "git reset -- --hard git reset ",
    'git reset "git reset ',
    "git  reset ",
    "git -p -p reset ",
    "git -C .x reset ",
  ],
  "git-safety.md#2": [
    "git git ",
    "git -- --no-verify git ",
    "git x--no-verify git ",
    'git "git ',
    "git  git -p ",
    "git\tgit\t",
  ],
  "git-safety.md#3": [
    "git commit git commit ",
    "git am -- -n git am ",
    "git commit x-n git commit ",
    'git commit "git commit ',
    "git  commit ",
    "git -p -p commit ",
  ],
  "git-safety.md#4": [
    "core.hooksPath -core.hooksPath -",
    'core.hooksPath "core.hooksPath"',
    "core.hooksPath\t-core.",
    "core.hooksPath \\core.hooksPath '",
  ],
  "git-safety.md#5": [
    "git push git push ",
    "git push -- --force git push ",
    "git push x--force git push ",
    "git  push ",
    "git -p -p push ",
    "git -C x -C y push ",
  ],
  "git-safety.md#6": [
    "git push git push ",
    "git push x+y git push ",
    'git push "git push ',
    "git  push ",
    "git -p -p push ",
    "git -C .x push ",
  ],
  "git-safety.md#7": [
    "git push git push ",
    'git push "git push ',
    "git push `.git push ",
    "git push ) $ git push ",
    "git  push ",
    "git -p -p push ",
  ],
  "git-safety.md#8": [
    "git push git push ",
    "git push )&& git push ",
    "git -p -p push ",
    "git  push ",
    "git -C .x push ",
    "git -C x -C y push ",
  ],
  "git-safety.md#9": [
    "&& a=&& b=",
    "; git -C ; git -C ",
    "|| git --x=|| git ",
    '; a="; git ',
    "; git  push x",
    "; a=1  git -C .x ",
  ],
  "git-safety.md#10": [
    "git rm git rm ",
    "git rm -- -f git rm ",
    "git rm x-f git rm ",
    "git  rm ",
    "git -p -p rm ",
    "git -C .x rm ",
  ],
  "git-safety.md#11": [
    "git branch git branch ",
    "git branch -- -D git branch ",
    "git -p -p branch ",
    "git  branch ",
    "git -C .x branch ",
    "git -C -x branch ",
  ],
  "git-safety.md#12": [
    "git branch -d git branch ",
    "git branch -- -d -f git branch ",
    "git -p -p branch -d ",
    "git  branch -d ",
    "git -C .x branch ",
    "git -C x -C y branch -f ",
  ],
  "git-safety.md#13": [
    "git checkout git checkout ",
    "git checkout x. git checkout ",
    "git -p -p checkout ",
    "git  checkout ",
    "git -C .x checkout ",
    "git -C x -C y checkout ",
  ],
  "git-safety.md#14": [
    "git restore -S . git restore -S . ",
    'git restore "git restore ',
    "git -p restore ",
    "git -C x restore ",
    "git  restore ",
    "git --x=y restore . ",
  ],
  "git-safety.md#15": [
    "git stash git stash ",
    "git stash -x git stash -",
    "git stash dropx git stash ",
    "git  stash ",
    "git -p -p stash ",
    "git -C .x stash -x ",
  ],
  "literal-paths.md#0": ["x~/x~/", '"~x', ":~ =~"],
  "literal-paths.md#1": ["$HOMEx$HOMEx", "$HOM$HOM", "\\$HOME_"],
  "literal-paths.md#2": ["${HOME${HOME", "${HOMEx", '"${HOM\\${HOM', "$(${HOME_${"],
  "literal-paths.md#3": ["xHOME=xHOME=", "\\HOME=", "aHOME ="],
  "remote-cleanup.md#0": [
    "aws aws ",
    "kubectl -n kubectl ",
    "aws xdelete aws ",
    'gcloud "gcloud ',
    "fly $(fly ",
    "helm --x=helm deletex ",
  ],
  "remote-cleanup.md#1": [
    "psql psql ",
    "psql -c psql ",
    'mysql "mysql ',
    "psql dropx table psql ",
    "psql x.dropx( psql ",
    "redis-cli -x flushallx redis-cli ",
  ],
  "remote-cleanup.md#2": [
    "docker docker ",
    "docker -H docker -H ",
    "docker -H x rmx docker -H ",
    "docker --context=docker ",
    'docker "docker -c ',
    "docker -- -H docker ",
  ],
  "remote-cleanup.md#3": [
    "podman podman ",
    "podman --remote podman --remote ",
    "podman -r x rmx podman -r ",
    "podman --url=podman ",
    'podman "podman --connection ',
  ],
  "remote-cleanup.md#4": [
    "DOCKER_HOST=DOCKER_HOST=",
    "DOCKER_HOST=x DOCKER_HOST=x ",
    "DOCKER_HOST=x docker DOCKER_HOST=x ",
    "DOCKER_HOST=x docker rmx DOCKER_HOST=x docker ",
    'CONTAINER_HOST="x docker ',
  ],
  "remote-cleanup.md#5": [
    "ssh ssh ",
    "ssh x ssh -o ",
    "ssh x 'rmx ssh ",
    'ssh x "find ssh ',
    "ssh x 'find -deletex ssh ",
    "ssh 'systemctl -x ssh 'docker ",
  ],
  "remote-cleanup.md#6": [
    "rsync rsync ",
    "rsync --delete rsync --delete ",
    "rsync --delete x:y rsync --delete x:y ",
    "rsync -- --delete rsync ",
    'rsync "rsync --delete ',
    "rsync --delete $(rsync ",
  ],
  "remote-cleanup.md#7": [
    "rclone rclone ",
    "rclone xdelete rclone ",
    'rclone "rclone ',
    "rclone -- rclone ",
    "rclone deletex rclone ",
  ],
  "remote-cleanup.md#8": [
    "rclone sync rclone sync ",
    "rclone sync x:y rclone sync x:y ",
    'rclone "rclone sync ',
    "rclone sync -x rclone ",
    "rclone xsync rclone sync \\",
  ],
  "remote-cleanup.md#9": [
    "gh gh gh gh ",
    "gh repo gh repo ",
    "gh x y z w-delete gh ",
    "gh repo delete_ gh ",
  ],
  "remote-cleanup.md#10": [
    "gh api gh api ",
    "gh api -X gh api -X ",
    "gh api -X GETDELETE gh api ",
    "gh api -- -X DELETE gh api ",
    "gh  api ",
    "gh\tapi\t",
  ],
  "temp-and-background.md#0": [
    "mkdir mkdir ",
    "mkdir -p mkdir -p ",
    "tee x/tmp tee ",
    'touch "touch ',
    "mkdir \\mkdir ",
    "tee -- /tmpx tee ",
  ],
  "temp-and-background.md#1": [
    "cp x /tmp > ",
    "> /tmp ",
    "cp /tmp >/tmp ",
    "/tmp 2>/tmp ",
    "-x /tmp > ",
    "> /tmp -x ",
    "2>/tmp/a > /tmp ",
    "cp x /tmp -x > /tmp ",
    "'/tmp' > ",
    "-x /tmp ",
  ],
  "temp-and-background.md#2": [
    "git clone git clone ",
    "git clone x/tmp git clone ",
    "git  clone ",
    "git -p -p clone ",
    "git -C .x clone ",
    "git -C x -C y clone ",
  ],
  "temp-and-background.md#3": [">>>>", '> "> ', "> /tmpx > ", ">\t>\t"],
  "temp-and-background.md#4": [" -o -o -o", " --output= --output ", " -o /tmpx -o ", ' -o "-o "'],
  "temp-and-background.md#5": [
    "mktempx mktemp_",
    "\\mktemp1",
    "$(mktempx $(mktemp-",
    '"mktemp.mktemp=',
  ],
  "temp-and-background.md#6": ["TMPDIR=TMPDIR=", 'TMPDIR=/tmpx TMPDIR="', "TMPDIR=\\/tmp"],
  "temp-and-background.md#7": [
    "sudo sudo ",
    "; a=b ; a=",
    "sudo x=1 sudo -u ",
    "( sudo (sudo ",
    "sudo xnohup sudo ",
    "; a=1 b=2 xnohup ",
  ],
  "temp-and-background.md#8": [
    "-x(tmux ",
    "tmux -x(",
    "-L x(tmux ",
    "(tmux -L x ",
    "-x'tmux ",
    "-L (tmux -x ",
    "-x(A=x(tmux ",
    "-S x!tmux -f y ",
    "x tmux('tmux -x ",
    "-x(tmux -L ",
  ],
  "temp-and-background.md#9": [
    "screen -ls screen -ls ",
    "(screen -list (screen -ls ",
    "; a=b screen -ls ; ",
    "x=screen y=",
    "xscreen ",
  ],
  "temp-and-background.md#10": [
    " --watch=false --watch=0 ",
    " --watchx --watch=false",
    " --watchAllx",
  ],
  "temp-and-background.md#11": [
    "npm npm ",
    "npm x npm i ",
    "npm i -- -g npm i ",
    "npm i x-g npm i ",
    "npm  x ",
    "npm  i ",
  ],
  "temp-and-background.md#12": ["npm -g npm -g ", "npm -g ix npm ", "npm\t-g\t"],
  "temp-and-background.md#13": [
    "bun add bun add ",
    "pnpm i -- -g pnpm i ",
    "bun add x-g bun add ",
    'bun add "bun add ',
    "bun  add ",
    "pnpm\ti\t",
  ],
  "temp-and-background.md#14": [
    "bun -g bun -g ",
    "pnpm --global addx ",
    'bun -g "bun --global ',
    "pnpm -g $(pnpm -g -g ",
  ],
  "temp-and-background.md#15": [
    "yarn global yarn global ",
    "yarn global addx yarn ",
    'yarn "yarn global ',
    "yarn global $(yarn global -",
  ],
  "temp-and-background.md#16": [
    "pipx pipx install_",
    "pipx installx pipx ",
    'pipx "pipx ',
    "pipx $(pipx install=",
  ],
  "temp-and-background.md#17": [
    "cargo cargo installx ",
    'cargo "cargo ',
    "cargo $(cargo install-",
    "cargo\tcargo\tinstall=",
  ],
  "temp-and-background.md#18": [
    "uv tool uv tool ",
    "go gem uv installx ",
    'uv tool "uv tool ',
    "gem $(gem install-",
  ],
  "temp-and-background.md#19": ["crontab -l crontab -l ", "xcrontab ", "crontab -l\t"],
  "temp-and-background.md#20": [
    "systemctl systemctl ",
    "systemctl -x systemctl -x ",
    "systemctl --user xenable systemctl ",
    'systemctl "systemctl ',
    "systemctl -- enablex systemctl ",
  ],
  "temp-and-background.md#21": [
    "docker system docker system ",
    "docker system prunex ",
    'docker "docker system ',
    "docker system $(docker system -",
  ],
  "temp-and-background.md#22": [
    "docker volume docker image ",
    "docker volume rmx ",
    'docker image "docker volume ',
    "docker volume $(docker image -",
  ],
  "temp-and-background.md#23": [
    "docker docker rmix ",
    'docker "docker ',
    "docker $(docker rmi-",
    "docker\tdocker\trmi=",
  ],
  "temp-and-background.md#24": [
    "docker builder docker buildx prunex ",
    'docker builder "docker buildx ',
    "docker buildx $(docker builder -",
    "docker\tbuilder\tprune=",
  ],
  "worktree-location.md#0": [
    "git worktree git worktree ",
    'git -c "git worktree ',
    "git  worktree ",
    "git -p -p worktree ",
    "git -C .x worktree ",
  ],
};

/** How the dense, head-then-run, and nested checks put a line in a tool call. */
interface DenseShape {
  /** Escapes one unit for the string that holds the line. */
  readonly escape: (unit: string) => string;
  /** Puts the escaped line in the argument JSON text. */
  readonly wrap: (body: string) => string;
}

/**
 * The shapes of the dense, head-then-run, and nested checks. omp tests each condition
 * on the partial argument buffer after each streamed delta, so most real
 * scans stop inside the command string, with no closing `"` and `}`. A
 * condition that stops at the end of the string does not see that end
 * there, so `bash-open` drops the tail of the bash command. The Python cell
 * differs only in escaping, so it has no open shape, which keeps the run
 * short.
 */
const DENSE_SHAPES: Record<string, DenseShape> = {
  bash: { escape: (unit) => unit, wrap: bashCall },
  // Drops the `"}` that `JSON.stringify` puts after the command string.
  "bash-open": { escape: (unit) => unit, wrap: (body) => bashCall(body).slice(0, -2) },
  py: {
    // Escapes the line for a Python string in double quotes.
    escape: (unit) => unit.replaceAll("\\", "\\\\").replaceAll('"', '\\"'),
    wrap: (body) => pythonCall(`sh("${body}")`),
  },
};
/** Before each pair of the JIT-on pass, a line of this many runs compiles the regex for that input. */
const DENSE_WARM_UP_UNITS = 50;

const BUDGET_BUFFERS: ReadonlyArray<{ readonly name: string; readonly text: string }> = [
  { name: "20 KB Python cell", text: pythonJsonCell(20_000) },
  { name: "20 KB bash command", text: bashQuotesScript(20_000) },
  { name: "30 KB env chain", text: quotedEnvChain(30_000) },
];

function elapsedMs(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

const formatMs = (ms: number): string => `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;

interface PassTime {
  readonly ms: number;
  /** Conditions that ran; fewer than all when the pass stopped at the budget. */
  readonly ran: number;
}

/** One pass of every condition, as omp runs it on a buffer with no match; it stops past the budget. */
function timePass(conditions: ReadonlyArray<Condition>, text: string): PassTime {
  const start = performance.now();
  for (const [index, { regex }] of conditions.entries()) {
    regex.test(text);
    const ms = performance.now() - start;
    if (ms > BUDGET_MS) return { ms, ran: index + 1 };
  }
  return { ms: performance.now() - start, ran: conditions.length };
}

function checkBudget(conditions: ReadonlyArray<Condition>): Array<string> {
  return BUDGET_BUFFERS.map(({ name, text }) => {
    let pass = timePass(conditions, text);
    let attempts = 1;
    // A pass a little over the budget is retried, so one garbage collection
    // or busy core does not fail the run. A pass at twice the budget is no
    // noise, and the old rules spend seconds on each attempt.
    while (attempts < BUDGET_ATTEMPTS && pass.ms > BUDGET_MS && pass.ms < 2 * BUDGET_MS) {
      pass = timePass(conditions, text);
      attempts++;
    }
    const subject = `budget: ${name} (${text.length} chars)`;
    if (pass.ms <= BUDGET_MS) {
      return `${subject}: ${formatMs(pass.ms)} for ${conditions.length} conditions`;
    }
    const stoppedAt = conditions[pass.ran - 1]?.label ?? "";
    return `${FAIL} ${subject}: passed ${BUDGET_MS} ms after ${pass.ran} of ${conditions.length} conditions (${formatMs(pass.ms)}, stopped after ${stoppedAt}) in ${attempts} attempt(s)`;
  });
}

function checkFire(rules: ReadonlyArray<LoadedRule>): string {
  const gitSafety = rules.find((rule) => rule.name === "git-safety");
  if (gitSafety === undefined) return `${FAIL} fire: no git-safety rule file`;
  const text = pythonJsonCell(20_000, 'sh("git reset --hard HEAD")');
  let fired = false;
  const ms = elapsedMs(() => {
    fired = gitSafety.conditions.some(({ regex }) => regex.test(text));
  });
  const subject = `fire: git-safety on git reset --hard after a ${text.length}-char Python cell`;
  return fired
    ? `${subject}: fired in ${formatMs(ms)}`
    : `${FAIL} ${subject}: stayed quiet after ${formatMs(ms)}`;
}

interface PairTime {
  readonly smallMs: number;
  /** Undefined when the small call already passed the ceiling. */
  readonly largeMs: number | undefined;
}

const median = (runs: ReadonlyArray<number>): number =>
  [...runs].sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;

/**
 * The median of 3 calls per size, small and large in turn, so a busy moment
 * or a move to a slower core hits both sizes alike. It returns at the first
 * call past the ceiling: that call already fails the pair, and an old
 * condition takes seconds per call.
 */
function timePair(regex: RegExp, small: string, large: string): PairTime {
  const smallRuns: Array<number> = [];
  const largeRuns: Array<number> = [];
  for (let run = 0; run < 3; run++) {
    const smallMs = elapsedMs(() => regex.test(small));
    if (smallMs > SCALING_CEILING_MS) return { smallMs, largeMs: undefined };
    smallRuns.push(smallMs);
    const largeMs = elapsedMs(() => regex.test(large));
    if (largeMs > SCALING_CEILING_MS) return { smallMs: median(smallRuns), largeMs };
    largeRuns.push(largeMs);
  }
  return { smallMs: median(smallRuns), largeMs: median(largeRuns) };
}

function pairFault({ smallMs, largeMs }: PairTime): string | undefined {
  if (largeMs === undefined || largeMs > SCALING_CEILING_MS) {
    return `over the ${SCALING_CEILING_MS} ms ceiling`;
  }
  if (largeMs > MAX_GROWTH_RATIO * smallMs + GROWTH_NOISE_MS) {
    return `grew ${(largeMs / smallMs).toFixed(1)} times, over ${MAX_GROWTH_RATIO} times plus ${GROWTH_NOISE_MS} ms`;
  }
  return undefined;
}

interface Measured {
  readonly time: PairTime;
  readonly fault: string | undefined;
}

/**
 * Times a pair and finds its fault. A failing pair is timed again, so a busy
 * machine does not fail the run; a call at twice the ceiling is no noise and
 * fails at once.
 */
function measurePair(regex: RegExp, small: string, large: string): Measured {
  let time = timePair(regex, small, large);
  let fault = pairFault(time);
  for (
    let attempt = 1;
    fault !== undefined &&
    attempt < PAIR_ATTEMPTS &&
    Math.max(time.smallMs, time.largeMs ?? 0) < NOISE_LIMIT_MS;
    attempt++
  ) {
    time = timePair(regex, small, large);
    fault = pairFault(time);
  }
  return { time, fault };
}

/** Both sizes and both times of a pair, for the output lines. */
function sizesText(small: string, large: string, time: PairTime): string {
  const largeTime = time.largeMs === undefined ? "not timed" : formatMs(time.largeMs);
  return `${small.length} chars ${formatMs(time.smallMs)}, ${large.length} chars ${largeTime}`;
}

interface Worst {
  readonly value: number;
  readonly label: string;
}

/** The measured pairs of one child and the worst of them, for its summary line. */
class Tally {
  private pairs = 0;
  private worstRatio: Worst = { value: 0, label: "" };
  private worstLarge: Worst = { value: 0, label: "" };

  record(smallMs: number, largeMs: number, pair: string): void {
    this.pairs++;
    const ratio = largeMs / smallMs;
    if (smallMs >= RATIO_REPORT_MIN_MS && ratio > this.worstRatio.value) {
      this.worstRatio = { value: ratio, label: pair };
    }
    if (largeMs > this.worstLarge.value) this.worstLarge = { value: largeMs, label: pair };
  }

  line(subject: string): string {
    const { pairs, worstRatio, worstLarge } = this;
    return pairs === 0
      ? `scaling: ${subject}: no pair measured`
      : `scaling: ${subject}: ${pairs} pairs; worst ratio ${worstRatio.value.toFixed(1)}, ${worstRatio.label}; worst large time ${formatMs(worstLarge.value)}, ${worstLarge.label}`;
  }
}

/** The inputs of one pair. */
interface ProbeInputs {
  readonly small: string;
  readonly large: string;
  /** A short input that compiles the regex for this input before the timed calls. */
  readonly warmUp: string;
}

/** One pair of a scaling check: one condition on one input, at 16 KB and 64 KB. */
interface Probe {
  readonly regex: RegExp;
  /** The subject of the output lines, such as `git-safety.md#3 on base64`. */
  readonly subject: string;
  /** One slow pair skips the rest of its group: a shape, or a condition in a family. */
  readonly group: string;
  /** Gives the inputs. Many pairs share them, so each process builds them only once. */
  readonly inputs: () => ProbeInputs;
}

const probeInputs = new Map<string, ProbeInputs>();

/** Gives a function that builds the inputs of `key` at its first call and keeps them. */
function cachedInputs(key: string, build: () => ProbeInputs): () => ProbeInputs {
  return () => {
    let inputs = probeInputs.get(key);
    if (inputs === undefined) {
      inputs = build();
      probeInputs.set(key, inputs);
    }
    return inputs;
  };
}

/** The pairs of the scaling check, shape by shape. The group of a pair is its shape. */
function scalingProbes(conditions: ReadonlyArray<Condition>): Array<Probe> {
  return Object.entries(SHAPES).flatMap(([shapeName, shape]) => {
    const inputs = cachedInputs(`scaling ${shapeName}`, () => ({
      small: shape(SCALING_SMALL_CHARS),
      large: shape(SCALING_LARGE_CHARS),
      warmUp: WARM_UP_TEXT,
    }));
    return conditions.map(({ label, regex }) => ({
      regex,
      subject: `${label} on ${shapeName}`,
      group: shapeName,
      inputs,
    }));
  });
}

type JitFamily = "dense" | "head-run" | "nested";

interface HeadRun {
  readonly head: string;
  readonly run: string;
}

/**
 * The head-then-run lines of a condition. A condition with entries in
 * `HEAD_RUNS_FOUND` gets only those. Each other condition gets its
 * `HEAD_RUNS` entries and the generic family from its dense units, without
 * repeats.
 */
function headRuns(label: string, units: ReadonlyArray<string>): ReadonlyArray<HeadRun> {
  const found = HEAD_RUNS_FOUND[label];
  if (found !== undefined) return found;
  const generic = units
    .slice(0, HEAD_RUN_GENERIC_HEADS)
    .flatMap((head) => HEAD_RUN_RUNS.map((run) => ({ head, run })));
  const seen = new Set<string>();
  return [...(HEAD_RUNS[label] ?? []), ...generic].filter(({ head, run }) => {
    const key = JSON.stringify([head, run]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The pairs of the dense, head-then-run, and nested checks in a fixed order,
 * so each child finds its share by index. A head-then-run line holds the
 * head once and then repeats the run; the dense and nested families have no
 * head. The group of a pair is its condition in its family, and each child
 * takes whole groups.
 */
function jitProbes(conditions: ReadonlyArray<Condition>): Array<Probe> {
  const inShapes = (
    { label, regex }: Condition,
    family: JitFamily,
    lines: ReadonlyArray<HeadRun>,
  ): Array<Probe> =>
    lines.flatMap(({ head, run }) =>
      Object.entries(DENSE_SHAPES).map(([shapeName, shape]) => {
        const line =
          family === "head-run"
            ? `${JSON.stringify(head)} + ${JSON.stringify(run)}`
            : JSON.stringify(run);
        const escapedHead = shape.escape(head);
        const escapedRun = shape.escape(run);
        const lineOf = (chars: number): string =>
          fillTo(
            chars,
            (index) => (index === 0 ? escapedHead + escapedRun : escapedRun),
            shape.wrap,
          );
        return {
          regex,
          subject: `${label} on ${family} ${line} ${shapeName}`,
          // Each shape has its own group, so a slow pair in one shape does not hide another shape.
          group: `${label} on ${family} ${shapeName}`,
          inputs: cachedInputs(JSON.stringify([shapeName, head, run]), () => ({
            small: lineOf(SCALING_SMALL_CHARS),
            large: lineOf(SCALING_LARGE_CHARS),
            warmUp: shape.wrap(escapedHead + escapedRun.repeat(DENSE_WARM_UP_UNITS)),
          })),
        };
      }),
    );
  const withUnits = conditions.map((condition) => ({
    condition,
    units: [...(DENSE_UNITS[condition.label] ?? []), ...DENSE_COMMON_UNITS],
  }));
  return [
    ...withUnits.flatMap(({ condition, units }) =>
      inShapes(
        condition,
        "dense",
        units.map((run) => ({ head: "", run })),
      ),
    ),
    ...withUnits.flatMap(({ condition, units }) =>
      inShapes(condition, "head-run", headRuns(condition.label, units)),
    ),
    ...conditions.flatMap((condition) =>
      inShapes(
        condition,
        "nested",
        (NESTED_UNITS[condition.label] ?? []).map((run) => ({ head: "", run })),
      ),
    ),
  ];
}

/** A failing pair of a parallel child, which the serial confirm step times again. */
interface Pending {
  /** The index of the pair in its list of pairs. */
  readonly index: number;
  /** Both sizes and both times of the parallel run. */
  readonly parallel: string;
  /** The pairs of its group that the parallel child skipped after it. */
  readonly skipped: Array<number>;
}

/** A parallel child prints each pending pair on a line with this prefix, for the parent. */
const PENDING = "PENDING ";

interface ProbeRun {
  readonly lines: Array<string>;
  readonly pending: Array<Pending>;
}

function measureProbe({ regex, inputs }: Probe): Measured & { readonly sizes: string } {
  const { small, large, warmUp } = inputs();
  regex.test(warmUp);
  const { time, fault } = measurePair(regex, small, large);
  return { time, fault, sizes: sizesText(small, large, time) };
}

/**
 * Times the pairs at `indexes` in turn. In a parallel child (`screen`), a
 * failing pair under `NOISE_LIMIT_MS` is pending: the parallel children slow
 * each other down, so the confirm step times it again alone. Every other
 * failing pair fails at once. A pair past the ceiling skips the rest of its
 * group: one slow pair already fails the group, and a slow call can take
 * seconds.
 */
function runProbes(
  probes: ReadonlyArray<Probe>,
  indexes: Iterable<number>,
  screen: boolean,
  tally: Tally,
): ProbeRun {
  const lines: Array<string> = [];
  const pending: Array<Pending> = [];
  // Each slow group, with the skipped pairs of its pending pair if it has one.
  const slowGroups = new Map<string, Array<number> | undefined>();
  for (const index of indexes) {
    const probe = probes[index];
    if (probe === undefined) throw new Error(`no pair at index ${index}`);
    if (slowGroups.has(probe.group)) {
      slowGroups.get(probe.group)?.push(index);
      continue;
    }
    const { time, fault, sizes } = measureProbe(probe);
    let skipped: Array<number> | undefined;
    if (fault !== undefined) {
      if (screen && Math.max(time.smallMs, time.largeMs ?? 0) < NOISE_LIMIT_MS) {
        skipped = [];
        pending.push({ index, parallel: sizes, skipped });
      } else {
        lines.push(`${FAIL} scaling: ${probe.subject} (${sizes}): ${fault}`);
      }
    }
    if (time.largeMs === undefined || time.largeMs > SCALING_CEILING_MS) {
      lines.push(`scaling: skipped the rest of ${probe.group}`);
      slowGroups.set(probe.group, skipped);
      continue;
    }
    tally.record(time.smallMs, time.largeMs, `${probe.subject} (${sizes})`);
  }
  return { lines, pending };
}

/** A parallel child: its result lines, its pending pairs for the parent, and its summary line. */
function screenChild(
  probes: ReadonlyArray<Probe>,
  indexes: Iterable<number>,
  subject: string,
): Array<string> {
  const tally = new Tally();
  const { lines, pending } = runProbes(probes, indexes, true, tally);
  return [
    ...lines,
    ...pending.map((entry) => PENDING + JSON.stringify(entry)),
    tally.line(subject),
  ];
}

/**
 * The serial confirm step: times each pending pair again, alone. A pair
 * fails only when it fails here too, and its line gives the parallel and the
 * serial times. One failed pair already fails its group, and a failing pair
 * takes up to `PAIR_ATTEMPTS` slow timings, so the other pending pairs of a
 * failed group are skipped. A pair that passes here also gets the pairs of
 * its group that the parallel child skipped after it.
 */
function confirmChild(
  probes: ReadonlyArray<Probe>,
  pending: ReadonlyArray<Pending>,
  subject: string,
): Array<string> {
  const lines: Array<string> = [];
  const tally = new Tally();
  const failedGroups = new Map<string, number>();
  for (const { index, parallel, skipped } of pending) {
    const probe = probes[index];
    if (probe === undefined) throw new Error(`no pair at index ${index}`);
    const failedSkips = failedGroups.get(probe.group);
    if (failedSkips !== undefined) {
      failedGroups.set(probe.group, failedSkips + 1);
      continue;
    }
    const { time, fault, sizes } = measureProbe(probe);
    const both = `parallel ${parallel}; serial ${sizes}`;
    if (fault !== undefined) {
      lines.push(`${FAIL} scaling: ${probe.subject} (${both}): ${fault}`);
      failedGroups.set(probe.group, 0);
      continue;
    }
    lines.push(`scaling: confirm: ${probe.subject} passed alone (${both})`);
    if (time.largeMs !== undefined) {
      tally.record(time.smallMs, time.largeMs, `${probe.subject} (${sizes})`);
    }
    lines.push(...runProbes(probes, skipped, false, tally).lines);
  }
  for (const [group, skips] of failedGroups) {
    if (skips > 0) lines.push(`scaling: confirm: skipped ${skips} more pending pairs of ${group}`);
  }
  lines.push(tally.line(subject));
  return lines;
}

/** The line that fails a child in the wrong regex JIT mode, or undefined. */
function jitModeFault(regexJitOff: boolean): string | undefined {
  if ((process.env[REGEX_JIT_ENV] === "0") === regexJitOff) return undefined;
  return regexJitOff
    ? `${FAIL} scaling: ${REGEX_JIT_ENV} is not 0, so the regex JIT is on`
    : `${FAIL} scaling: ${REGEX_JIT_ENV} is 0, so the regex JIT is off`;
}

interface ChildJob {
  /** The option that gives the child its share, such as `--scaling=base64`. */
  readonly option: string;
  /** True for `BUN_JSC_useRegExpJIT=0`; false removes that option, so the JIT is on. */
  readonly regexJitOff: boolean;
}

async function runChild(
  rulesDir: string,
  { option, regexJitOff }: ChildJob,
  input = "",
): Promise<Array<string>> {
  const env = regexJitOff
    ? { ...process.env, [REGEX_JIT_ENV]: "0" }
    : Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== REGEX_JIT_ENV));
  const command = [process.execPath, import.meta.path, `--rules-dir=${rulesDir}`, option];
  const child = Bun.spawn(command, {
    env,
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const lines = stdout.split("\n").filter((line) => line.length > 0);
  const reported = lines.some((line) => line.startsWith(FAIL));
  if (exitCode !== 0 && !reported) {
    lines.push(`${FAIL} scaling: child for ${option} exited ${exitCode}: ${stderr.trim()}`);
  }
  return lines;
}

/**
 * Runs the scaling check with the regex JIT off, and the dense,
 * head-then-run, and nested checks with the JIT on, in child processes. Each child takes
 * one share of the shapes or of the JIT-on groups, and at most one child per
 * core runs at a time. After all of them exit, one serial child per regex
 * JIT mode, one after the other, times the pending pairs again.
 */
async function runScalingChildren(rulesDir: string): Promise<Array<string>> {
  const cores = availableParallelism();
  const shapeNames = Object.keys(SHAPES);
  const shapeShares = Math.min(shapeNames.length, cores);
  const jobs: Array<ChildJob> = [
    ...Array.from({ length: shapeShares }, (_, share) => ({
      option: `--scaling=${shapeNames.filter((_name, index) => index % shapeShares === share).join(",")}`,
      regexJitOff: true,
    })),
    ...Array.from({ length: cores }, (_, share) => ({
      option: `--dense=${share}/${cores}`,
      regexJitOff: false,
    })),
  ];
  const queue = [...jobs.entries()];
  const outputs: Array<Array<string>> = [];
  const runQueue = async (): Promise<void> => {
    for (let entry = queue.shift(); entry !== undefined; entry = queue.shift()) {
      const [index, job] = entry;
      outputs[index] = await runChild(rulesDir, job);
    }
  };
  await Promise.all(Array.from({ length: cores }, runQueue));
  const lines: Array<string> = [];
  const pendingJitOff: Array<string> = [];
  const pendingJitOn: Array<string> = [];
  for (const [index, { regexJitOff }] of jobs.entries()) {
    for (const line of outputs[index] ?? []) {
      if (!line.startsWith(PENDING)) lines.push(line);
      else (regexJitOff ? pendingJitOff : pendingJitOn).push(line.slice(PENDING.length));
    }
  }
  const confirms = [
    { regexJitOff: true, pending: pendingJitOff },
    { regexJitOff: false, pending: pendingJitOn },
  ];
  const confirmStarted = performance.now();
  for (const { regexJitOff, pending } of confirms) {
    if (pending.length === 0) continue;
    const option = `--confirm=${regexJitOff ? "off" : "on"}`;
    lines.push(...(await runChild(rulesDir, { option, regexJitOff }, `[${pending.join(",")}]`)));
  }
  const confirmSeconds = (performance.now() - confirmStarted) / 1000;
  lines.push(
    `scaling: confirm step: ${pendingJitOff.length + pendingJitOn.length} pending pairs, ${confirmSeconds.toFixed(1)} s`,
  );
  return lines;
}

function optionValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const rulesDir = optionValue("rules-dir") ?? join(REPO_DIR, "SoT", ".omp", "plugin", "rules");
const rules = loadRules(rulesDir);
const conditions = rules.flatMap((rule) => rule.conditions);
const scalingShare = optionValue("scaling");
const denseShare = optionValue("dense");
const confirmMode = optionValue("confirm");

let lines: Array<string>;
if (scalingShare !== undefined) {
  const shapeNames = new Set(scalingShare.split(","));
  const probes = scalingProbes(conditions);
  const indexes = probes.flatMap((probe, index) => (shapeNames.has(probe.group) ? [index] : []));
  const fault = jitModeFault(true);
  lines = fault !== undefined ? [fault] : screenChild(probes, indexes, scalingShare);
} else if (denseShare !== undefined) {
  const [share = 0, shares = 1] = denseShare.split("/").map(Number);
  const probes = jitProbes(conditions);
  // A child takes whole groups, so that one slow pair skips the rest of its group.
  const groups = [...new Set(probes.map((probe) => probe.group))];
  const ownGroups = new Set(groups.filter((_group, index) => index % shares === share));
  const indexes = probes.flatMap((probe, index) => (ownGroups.has(probe.group) ? [index] : []));
  const fault = jitModeFault(false);
  lines =
    fault !== undefined
      ? [fault]
      : screenChild(probes, indexes, `dense, head-run, and nested share ${share + 1}/${shares}`);
} else if (confirmMode !== undefined) {
  const regexJitOff = confirmMode === "off";
  const pending = JSON.parse(await Bun.stdin.text()) as Array<Pending>;
  const probes = regexJitOff ? scalingProbes(conditions) : jitProbes(conditions);
  const fault = jitModeFault(regexJitOff);
  lines =
    fault !== undefined
      ? [fault]
      : confirmChild(probes, pending, `confirm with the regex JIT ${confirmMode}`);
} else {
  for (const { regex } of conditions) regex.test(WARM_UP_TEXT);
  const started = performance.now();
  lines = [`${conditions.length} conditions from ${rulesDir}`];
  lines.push(...checkBudget(conditions), checkFire(rules));
  lines.push(...(await runScalingChildren(rulesDir)));
  lines.push(`ran in ${((performance.now() - started) / 1000).toFixed(1)} s`);
}
for (const line of lines) console.log(line);
process.exitCode = lines.some((line) => line.startsWith(FAIL)) ? 1 : 0;
