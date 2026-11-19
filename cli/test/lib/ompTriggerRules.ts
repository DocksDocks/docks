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
 *   for eval. A newline in a command is the two characters `\n`, a tab is
 *   `\t`, and a quote is `\"`. omp's tool schemas put the intent field `i`
 *   first, so a live buffer can start with `{"i":"<intent>",`. The model is
 *   expected to write the keys in schema order, but a call can also put `i`
 *   last. A provider can also stream JSON with white space, such as
 *   `{"command": "ls"}`. So each condition starts with the forward key
 *   prefix: the `command` or `code` key, optional JSON white space around the
 *   colon, and a lazy walk over the string body that steps over each `\`
 *   escape and never over an unescaped `"`. The match therefore starts at the
 *   key and stays inside that string. `conditionShapeFaults` enforces it.
 * - omp 19.0.0 tests every condition on the whole buffer at each streamed
 *   delta, on its main thread, in JavaScriptCore. A leading variable-length
 *   lookbehind, the earlier form of the key anchor, walks back from every
 *   buffer position there: seconds per scan on a 20 KB call, which froze omp
 *   sessions, and past JavaScriptCore's match limit the scan reports no match
 *   (plan issue #187). `ompTriggerBackstop.ts` measures that cost under Bun.
 * - A match is case-sensitive. omp compiles a condition with no flags, so
 *   there is no `u` flag and `\q` is an identity escape. `^` and `$` are the
 *   start and end of the buffer.
 * - A leading inline flag group with one or more of `i`, `m`, and `s`, such
 *   as `(?i)` or `(?is)`, becomes the JavaScript flags, as in omp 19.0.0.
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
  /** The condition texts as the rule file writes them, inline flag group included. */
  readonly conditionSources: ReadonlyArray<string>;
  readonly scope: TriggerScope;
  readonly repeatMode: RepeatMode | undefined;
}

/**
 * How the argument JSON text is written: `compact` as `JSON.stringify`,
 * `spaced` with a space after each colon and comma, and `pretty` with a
 * newline and a two-space indent before each field.
 */
export type JsonLayout = "compact" | "spaced" | "pretty";

/** The form of the argument JSON text. */
interface TriggerArgumentForm {
  /** The intent field `i`. omp's schema puts it first; `intentLast` puts it after the other fields. */
  readonly intent?: string;
  readonly intentLast?: boolean;
  /** The default is `compact`. */
  readonly layout?: JsonLayout;
}

/** One tool call, as its argument JSON fields. */
export type TriggerToolCall = TriggerArgumentForm &
  (
    | { readonly tool: "bash"; readonly command: string }
    | {
        readonly tool: "eval";
        readonly code: string;
        /** The eval language. The default is `py`. */
        readonly language?: "py" | "js";
      }
  );

const INLINE_FLAG_GROUP = /^\(\?([ims]+)\)/u;
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
  const flags = flagGroup?.[1] ?? "";
  const pattern = flagGroup === null ? source : source.slice(flagGroup[0].length);
  try {
    return new RegExp(pattern, flags);
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
  const conditionSources = stringList(name, "condition", data.condition);
  return {
    name,
    conditions: conditionSources.map((source) => compileCondition(name, source)),
    conditionSources,
    scope: parseScope(name, data.scope),
    repeatMode: parseRepeatMode(name, data.repeatMode),
  };
}

/** Loads a kit rule from the embedded payload, which sync deploys to the kit plugin. */
export function kitTriggerRule(name: TriggerRuleName): TriggerRule {
  return parseTriggerRule(name, payloadText(`SoT/.omp/plugin/rules/${name}.md`));
}

// The key, then the first run of plain characters; each escape step that
// follows consumes one `\` escape and the plain run after it, so the walk
// never passes an unescaped `"` and stays inside the string.
const KEY_PREFIX_START = String.raw`"(?:command|code)"\s*:\s*"[^"\\]*?`;
const ESCAPE_STEP = String.raw`\\.[^"\\]*?`;
const UNROLLED_ESCAPES = 8;

/** The forward key prefix `P0` of plan #187: one loop step per escape. */
export const FORWARD_KEY_PREFIX = `${KEY_PREFIX_START}(?:${ESCAPE_STEP})*?`;

/**
 * `P0` with 8 escapes per loop step, the form the kit rules use. It matches
 * the same positions as `P0`. JavaScriptCore's regex JIT keeps one backtrack
 * frame per loop step and falls back to its 25 times slower interpreter past
 * about 16 K frames, which `P0` reaches at about 50 KB of escape-dense text.
 * 8 escapes per step move that point 8 times further out.
 */
export const UNROLLED_KEY_PREFIX =
  `${KEY_PREFIX_START}(?:${ESCAPE_STEP.repeat(UNROLLED_ESCAPES)})*?` +
  `(?:${ESCAPE_STEP}){0,${UNROLLED_ESCAPES - 1}}?`;

interface RegexGroup {
  /** Offset of the opening `(`. */
  readonly start: number;
  /** Offset just past the closing `)`. */
  readonly end: number;
  /** Number of groups that enclose this one. */
  readonly depth: number;
}

/** The parenthesized groups of a regex pattern, skipping escapes and character classes. */
function regexGroups(pattern: string): Array<RegexGroup> {
  const groups: Array<RegexGroup> = [];
  const openings: Array<number> = [];
  let inClass = false;
  for (let at = 0; at < pattern.length; at++) {
    const char = pattern[at];
    if (char === "\\") {
      at++;
    } else if (inClass) {
      if (char === "]") inClass = false;
    } else if (char === "[") {
      inClass = true;
    } else if (char === "(") {
      openings.push(at);
    } else if (char === ")") {
      const start = openings.pop();
      if (start !== undefined) groups.push({ start, end: at + 1, depth: openings.length });
    }
  }
  return groups;
}

const UNBOUNDED_BRACE = /^\{\d+,\}/u;

/** True when a regex fragment holds `*`, `+`, or `{n,}` outside a character class. */
function hasUnboundedQuantifier(fragment: string): boolean {
  let inClass = false;
  for (let at = 0; at < fragment.length; at++) {
    const char = fragment[at];
    if (char === "\\") {
      at++;
    } else if (inClass) {
      if (char === "]") inClass = false;
    } else if (char === "[") {
      inClass = true;
    } else if (char === "*" || char === "+") {
      return true;
    } else if (char === "{" && UNBOUNDED_BRACE.test(fragment.slice(at))) {
      return true;
    }
  }
  return false;
}

/**
 * Why a condition breaks the shape that keeps omp's scans linear, or an empty
 * list. After an optional inline flag group the condition must start with the
 * forward key prefix, so each scan walks the buffer forward once. An unbounded
 * lookbehind may appear only as the last element, right after a `(?=...)`
 * trigger lookahead: it then walks back only where the trigger matched, and it
 * stops at the word before the trigger.
 */
export function conditionShapeFaults(source: string): Array<string> {
  const flagGroup = INLINE_FLAG_GROUP.exec(source);
  const pattern = flagGroup === null ? source : source.slice(flagGroup[0].length);
  const faults: Array<string> = [];
  if (!pattern.startsWith(FORWARD_KEY_PREFIX) && !pattern.startsWith(UNROLLED_KEY_PREFIX)) {
    faults.push("does not start with the forward key prefix");
  }
  const groups = regexGroups(pattern);
  for (const lookbehind of groups) {
    const opener = pattern.slice(lookbehind.start, lookbehind.start + 4);
    if (opener !== "(?<=" && opener !== "(?<!") continue;
    if (!hasUnboundedQuantifier(pattern.slice(lookbehind.start + 4, lookbehind.end - 1))) continue;
    const trailsTriggerLookahead =
      lookbehind.depth === 0 &&
      lookbehind.end === pattern.length &&
      groups.some(
        (group) =>
          group.depth === 0 &&
          group.end === lookbehind.start &&
          pattern.startsWith("(?=", group.start),
      );
    if (!trailsTriggerLookahead) {
      faults.push(
        `has an unbounded lookbehind at offset ${lookbehind.start} that is not the last element after a trigger lookahead`,
      );
    }
  }
  return faults;
}

/** The argument JSON text that omp matches, with the key order of the measured snippets. */
export function toolArgumentText(call: TriggerToolCall): string {
  const fields =
    call.tool === "bash"
      ? { command: call.command }
      : { language: call.language ?? "py", code: call.code };
  const intent = call.intent === undefined ? {} : { i: call.intent };
  const value = call.intentLast === true ? { ...fields, ...intent } : { ...intent, ...fields };
  switch (call.layout ?? "compact") {
    case "compact":
      return JSON.stringify(value);
    case "pretty":
      return JSON.stringify(value, null, 2);
    case "spaced": {
      const entries = Object.entries(value).map(
        ([key, text]) => `${JSON.stringify(key)}: ${JSON.stringify(text)}`,
      );
      return `{${entries.join(", ")}}`;
    }
  }
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
