/**
 * Trigger oracle for the kit's omp Time Traveling Stream Rules (TTSR, trigger
 * rules) in `SoT/.omp/plugin/rules/`. It ports the regex `condition` path of
 * omp 18.21.0 as the upstream docs describe it and as plan issue #169
 * measured it with `omp ttsr test`:
 *
 * - https://github.com/can1357/oh-my-pi/blob/main/docs/rulebook-matching-pipeline.md
 *   (sections 3 and 6: frontmatter, `condition`, `scope`, `repeatMode`)
 * - https://github.com/can1357/oh-my-pi/blob/main/docs/ttsr-injection-lifecycle.md
 *   (section 2: the streaming monitor)
 *
 * Measured facts, omp 18.21.0:
 *
 * - The buffer is the tool-call argument JSON text, such as
 *   `{"command":"ls"}` for bash and `{"language":"py","code":"sh('ls')"}`
 *   for eval. A newline in a command is the two characters `\n`, and a quote
 *   is `\"`. omp's tool schemas put the intent field `i` first, so a live
 *   buffer can start with `{"i":"<intent>",`. The model is expected to write
 *   the keys in schema order. A condition must not read past the end of the
 *   command string into the intent or another field.
 * - A match is case-sensitive. omp compiles a condition with no flags, so
 *   there is no `u` flag and `\q` is an identity escape. `^` and `$` are the
 *   start and end of the buffer.
 * - One leading `(?i)`, `(?m)`, or `(?s)` group becomes the JavaScript flag.
 * - `scope` limits the stream surfaces. With `tool:<name>` tokens only, prose
 *   never matches. With no `scope`, omp watches prose and every tool.
 *
 * `ruleTriggers` checks the final argument text, which is what
 * `omp ttsr test --source tool` checks. omp also tests the partial buffer
 * after each streamed delta, and its incremental matching "gives the
 * full-scan result on every delta" (ttsr-injection-lifecycle.md section 2).
 * `ruleTriggersWhileStreaming` models that with every prefix of the text.
 *
 * The port leaves out what no kit rule uses: `globs`, `astCondition`,
 * `question`, `agents`, a `condition` that looks like a file glob, and the
 * per-tool path glob `tool:<name>(<glob>)`. The parser throws on the last two,
 * so a rule that starts to use them fails here and does not pass by mistake.
 */
import { parse } from "yaml";

import { payloadText } from "../../src/payload";

export const TRIGGER_RULE_NAMES = [
  "file-removal",
  "git-safety",
  "temp-and-background",
  "worktree-location",
  "literal-paths",
  "remote-cleanup",
] as const;

export type TriggerRuleName = (typeof TRIGGER_RULE_NAMES)[number];

export type RepeatMode = "once" | "after-gap" | "always";

/** The stream surfaces that a rule watches. */
export interface TriggerScope {
  readonly prose: boolean;
  readonly thinking: boolean;
  readonly everyTool: boolean;
  readonly tools: ReadonlySet<string>;
}

export interface TriggerRule {
  readonly name: string;
  readonly conditions: ReadonlyArray<RegExp>;
  readonly scope: TriggerScope;
  readonly repeatMode: RepeatMode | undefined;
}

/** One tool call. `intent` is the optional `i` field, which comes first in the argument JSON. */
export type TriggerToolCall =
  | { readonly tool: "bash"; readonly command: string; readonly intent?: string }
  | {
      readonly tool: "eval";
      readonly code: string;
      /** The eval language. The default is `py`. */
      readonly language?: "py" | "js";
      readonly intent?: string;
    };

const INLINE_FLAG_GROUP = /^\(\?([ims])\)/u;
const PER_TOOL_PATH_GLOB = /^tool:[\w-]+\(/u;
const FILE_GLOB_CONDITION = /^[\w./*-]*\*[\w./*-]*$/u;

function frontmatter(name: string, text: string): Record<string, unknown> {
  // omp parses frontmatter only when the text starts with `---` and has a closing `\n---`.
  const end = text.indexOf("\n---", 3);
  if (!text.startsWith("---\n") || end < 0) throw new Error(`${name}: no frontmatter`);
  const data: unknown = parse(text.slice(4, end));
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${name}: frontmatter is not a mapping`);
  }
  return Object.fromEntries(Object.entries(data));
}

function stringList(name: string, key: string, value: unknown): Array<string> {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item): item is string => typeof item === "string")) {
    return value;
  }
  throw new Error(`${name}: ${key} is not a string or a list of strings`);
}

function compileCondition(name: string, source: string): RegExp {
  if (FILE_GLOB_CONDITION.test(source)) {
    throw new Error(`${name}: condition ${JSON.stringify(source)} is a file glob, not ported`);
  }
  const flagGroup = INLINE_FLAG_GROUP.exec(source);
  const flag = flagGroup?.[1] ?? "";
  const pattern = flagGroup === null ? source : source.slice(flagGroup[0].length);
  try {
    return new RegExp(pattern, flag);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${name}: condition ${JSON.stringify(source)} does not compile: ${reason}`, {
      cause: error,
    });
  }
}

function parseScope(name: string, value: unknown): TriggerScope {
  if (value === undefined) {
    return { prose: true, thinking: false, everyTool: true, tools: new Set() };
  }
  const tokens = (typeof value === "string" ? value.split(",") : stringList(name, "scope", value))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  let prose = false;
  let thinking = false;
  let everyTool = false;
  const tools = new Set<string>();
  for (const token of tokens) {
    if (token === "text") prose = true;
    else if (token === "thinking") thinking = true;
    else if (token === "tool" || token === "toolcall") everyTool = true;
    else if (PER_TOOL_PATH_GLOB.test(token)) {
      throw new Error(`${name}: scope token ${JSON.stringify(token)} has a path glob, not ported`);
    } else if (token.startsWith("tool:")) tools.add(token.slice("tool:".length));
    else throw new Error(`${name}: unknown scope token ${JSON.stringify(token)}`);
  }
  return { prose, thinking, everyTool, tools };
}

function parseRepeatMode(name: string, value: unknown): RepeatMode | undefined {
  if (value === undefined || value === "once" || value === "after-gap" || value === "always") {
    return value;
  }
  throw new Error(`${name}: unknown repeatMode ${JSON.stringify(value)}`);
}

/** Parses the text of one rule file. `name` is the file name without `.md`, as in omp. */
export function parseTriggerRule(name: string, text: string): TriggerRule {
  const data = frontmatter(name, text);
  if (data.condition === undefined) throw new Error(`${name}: no condition`);
  return {
    name,
    conditions: stringList(name, "condition", data.condition).map((source) =>
      compileCondition(name, source),
    ),
    scope: parseScope(name, data.scope),
    repeatMode: parseRepeatMode(name, data.repeatMode),
  };
}

/** Loads a kit rule from the embedded payload, which sync deploys to the kit plugin. */
export function kitTriggerRule(name: TriggerRuleName): TriggerRule {
  return parseTriggerRule(name, payloadText(`SoT/.omp/plugin/rules/${name}.md`));
}

/** The argument JSON text that omp matches, with the key order of the measured snippets. */
export function toolArgumentText(call: TriggerToolCall): string {
  const intent = call.intent === undefined ? {} : { i: call.intent };
  return call.tool === "bash"
    ? JSON.stringify({ ...intent, command: call.command })
    : JSON.stringify({ ...intent, language: call.language ?? "py", code: call.code });
}

function matchesAny(rule: TriggerRule, text: string): boolean {
  return rule.conditions.some((condition) => condition.test(text));
}

/** True when the finished tool call fires the rule, as `omp ttsr test --source tool` reports. */
export function ruleTriggers(rule: TriggerRule, call: TriggerToolCall): boolean {
  const watched = rule.scope.everyTool || rule.scope.tools.has(call.tool);
  return watched && matchesAny(rule, toolArgumentText(call));
}

/**
 * True when some partial buffer of the streamed call fires the rule. omp can
 * cut a delta at any character, so each prefix is a buffer that omp can test.
 */
export function ruleTriggersWhileStreaming(rule: TriggerRule, call: TriggerToolCall): boolean {
  if (!rule.scope.everyTool && !rule.scope.tools.has(call.tool)) return false;
  const text = toolArgumentText(call);
  for (let end = 1; end <= text.length; end++) {
    if (matchesAny(rule, text.slice(0, end))) return true;
  }
  return false;
}
