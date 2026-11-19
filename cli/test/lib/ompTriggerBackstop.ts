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
 *
 * Usage: `bun cli/test/lib/ompTriggerBackstop.ts [--rules-dir=<dir>]`. The
 * default rules folder is `SoT/.omp/plugin/rules`. The script prints one line
 * that starts with `FAIL` per failed check and exits 1 when any check fails.
 * It runs the scaling check in child processes, with `--scaling=<shapes>` and
 * `BUN_JSC_useRegExpJIT=0`, because JavaScriptCore reads that option only at
 * start-up; the children split the shapes so the run stays short.
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

interface Worst {
  readonly value: number;
  readonly label: string;
}

function checkScaling(
  conditions: ReadonlyArray<Condition>,
  shapeNames: ReadonlyArray<string>,
): Array<string> {
  const lines: Array<string> = [];
  if (process.env[REGEX_JIT_ENV] !== "0") {
    return [`${FAIL} scaling: ${REGEX_JIT_ENV} is not 0, so the regex JIT is on`];
  }
  let pairs = 0;
  let worstRatio: Worst = { value: 0, label: "" };
  let worstLarge: Worst = { value: 0, label: "" };
  for (const shapeName of shapeNames) {
    const shape = SHAPES[shapeName];
    if (shape === undefined) throw new Error(`unknown input shape ${shapeName}`);
    const small = shape(SCALING_SMALL_CHARS);
    const large = shape(SCALING_LARGE_CHARS);
    for (const { label, regex } of conditions) {
      regex.test(WARM_UP_TEXT);
      let time = timePair(regex, small, large);
      let fault = pairFault(time);
      // A failing pair is timed again, so a busy machine does not fail the
      // run; a call at twice the ceiling is no noise and fails at once.
      for (
        let attempt = 1;
        fault !== undefined &&
        attempt < PAIR_ATTEMPTS &&
        Math.max(time.smallMs, time.largeMs ?? 0) < 2 * SCALING_CEILING_MS;
        attempt++
      ) {
        time = timePair(regex, small, large);
        fault = pairFault(time);
      }
      const largeTime = time.largeMs === undefined ? "not timed" : formatMs(time.largeMs);
      const pair = `${label} on ${shapeName} (${small.length} chars ${formatMs(time.smallMs)}, ${large.length} chars ${largeTime})`;
      if (fault !== undefined) lines.push(`${FAIL} scaling: ${pair}: ${fault}`);
      if (time.largeMs === undefined || time.largeMs > SCALING_CEILING_MS) {
        // The old rules take seconds per call on every shape, and one slow
        // condition already fails the check, so the rest of the shape is skipped.
        lines.push(`scaling: skipped the rest of ${shapeName}`);
        break;
      }
      pairs++;
      const ratio = time.largeMs / time.smallMs;
      if (time.smallMs >= RATIO_REPORT_MIN_MS && ratio > worstRatio.value) {
        worstRatio = { value: ratio, label: pair };
      }
      if (time.largeMs > worstLarge.value) worstLarge = { value: time.largeMs, label: pair };
    }
  }
  const shapes = shapeNames.join(", ");
  lines.push(
    pairs === 0
      ? `scaling: ${shapes}: no pair measured`
      : `scaling: ${shapes}: ${pairs} pairs; worst ratio ${worstRatio.value.toFixed(1)}, ${worstRatio.label}; worst large time ${formatMs(worstLarge.value)}, ${worstLarge.label}`,
  );
  return lines;
}

/** Runs the scaling check in child processes with the regex JIT off, one share of the shapes each. */
async function runScalingChildren(rulesDir: string): Promise<Array<string>> {
  const shapeNames = Object.keys(SHAPES);
  const childCount = Math.min(shapeNames.length, availableParallelism());
  const shares = Array.from({ length: childCount }, (_, child) =>
    shapeNames.filter((_name, index) => index % childCount === child),
  );
  const outputs = await Promise.all(
    shares.map(async (share) => {
      const child = Bun.spawn(
        [
          process.execPath,
          import.meta.path,
          `--rules-dir=${rulesDir}`,
          `--scaling=${share.join(",")}`,
        ],
        { env: { ...process.env, [REGEX_JIT_ENV]: "0" }, stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      const lines = stdout.split("\n").filter((line) => line.length > 0);
      const reported = lines.some((line) => line.startsWith(FAIL));
      if (exitCode !== 0 && !reported) {
        lines.push(
          `${FAIL} scaling: child for ${share.join(", ")} exited ${exitCode}: ${stderr.trim()}`,
        );
      }
      return lines;
    }),
  );
  return outputs.flat();
}

function optionValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const rulesDir = optionValue("rules-dir") ?? join(REPO_DIR, "SoT", ".omp", "plugin", "rules");
const rules = loadRules(rulesDir);
const conditions = rules.flatMap((rule) => rule.conditions);
const scalingShare = optionValue("scaling");

let lines: Array<string>;
if (scalingShare === undefined) {
  for (const { regex } of conditions) regex.test(WARM_UP_TEXT);
  const started = performance.now();
  lines = [`${conditions.length} conditions from ${rulesDir}`];
  lines.push(...checkBudget(conditions), checkFire(rules));
  lines.push(...(await runScalingChildren(rulesDir)));
  lines.push(`ran in ${((performance.now() - started) / 1000).toFixed(1)} s`);
} else {
  lines = checkScaling(conditions, scalingShare.split(","));
}
for (const line of lines) console.log(line);
process.exitCode = lines.some((line) => line.startsWith(FAIL)) ? 1 : 0;
