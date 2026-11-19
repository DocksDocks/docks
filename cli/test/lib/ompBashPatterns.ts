/**
 * Approval oracle for the kit's omp `bash.patterns`, ported from
 * `@oh-my-pi/pi-coding-agent` 19.0.0 rather than guessed: `src/tools/bash.ts`
 * (`bashApprovalPatternToRegExp`, `bashCommandSegments`,
 * `bashApprovalRuleMatches`, `findNonCompoundBashRestrictionRule`,
 * `findBashApprovalPatternRule`, `hasBashApprovalShellControl`,
 * `CRITICAL_BASH_PATTERNS`, `BashTool.approval`) and `src/tools/shell-tokenize.ts`
 * (`tokenizeShellSegments`, `isShellEnvironmentAssignment`), plus the yolo
 * resolver of `src/tools/approval.ts`. The upstream doc `omp://approval-mode.md`
 * still describes the 18.17.0 order; the code is what runs.
 *
 * - Whitespace runs in the rule and the command collapse to one space.
 * - `*` matches any text, spaces included. No escape spells a literal `*`.
 *   The match is anchored and case-sensitive.
 * - A segment is the words between `;`, `&`, `|`, `(`, `)`, or a newline, with
 *   quotes and escapes removed, joined by one space. A segment that starts
 *   with `NAME=value` words also matches without them.
 * - A command without shell control takes the first rule that matches. A deny
 *   or prompt rule matches the whole command or any one segment; an allow rule
 *   matches only the whole command.
 * - A command with shell control, such as `;`, `|`, `$`, or a redirection,
 *   never matches an allow rule. A deny that matches only the whole command
 *   wins first; next, each segment takes its first matching deny or prompt
 *   rule, and a deny in any segment wins over a prompt.
 * - Order: deny, then prompt, then the critical patterns, then allow. A
 *   critical command gets a bare safety override, which replaces only an
 *   allow or no match. In `yolo` mode, omp ignores a bare override, so that
 *   command runs. A prompt rule on a critical command still asks.
 *
 * The port covers the default `bash.allowCompoundCommands: false` path. It
 * leaves out these parts, because the kit does not turn them on or reads one
 * flat rule list:
 *
 * - the interceptor deny at the start of `BashTool.approval`
 *   (`bashInterceptor.enabled`, default `false`);
 * - the `tools.restrictedFolders` prompt (default empty);
 * - the allow-rule stripping of `bash.allowedEnvVars` and of a per-rule `env`
 *   (the kit sets neither; default `[]`);
 * - the separate operator layer of `Settings.grantAuthority()`.
 */

export type OmpApproval = "allow" | "prompt" | "deny";

export interface OmpBashRule {
  readonly match: string;
  readonly approval: OmpApproval;
}

const SHELL_CONTROL = /[\n\r;&|<>`$()]/u;
const REINTERPRETED_ARGUMENT = /(?:^|[ \t])(?:-[^-]*[ce]|--(?:command|eval))(?:[= \t]|$)/u;

function patternRegExp(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .replace(/\s+/gu, " ")
    .split("*")
    .map((part) => part.replace(/[\\^$+?.()|[\]{}]/gu, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "u");
}

/** `tokenizeShellSegments`: the quote-stripped words of each segment. */
function segmentWords(command: string): Array<Array<string>> {
  const segments: Array<Array<string>> = [];
  let words: Array<string> = [];
  let word = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote === "'") {
      if (ch === "'") quote = undefined;
      else word += ch;
      continue;
    }
    if (quote === '"') {
      const next = command[i + 1];
      if (ch === "\\" && next !== undefined && '"\\$`'.includes(next)) {
        word += next;
        i++;
      } else if (ch === '"') quote = undefined;
      else word += ch;
      continue;
    }
    if (" \t\n;&|()".includes(ch)) {
      if (word.length > 0) words.push(word);
      word = "";
      if (ch !== " " && ch !== "\t" && words.length > 0) {
        segments.push(words);
        words = [];
      }
      continue;
    }
    const next = command[i + 1];
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "\\" && next !== undefined) {
      word += next;
      i++;
    } else word += ch;
  }
  if (word.length > 0) words.push(word);
  if (words.length > 0) segments.push(words);
  return segments;
}

/** `isShellEnvironmentAssignment` in omp 19.0.0 `src/tools/shell-tokenize.ts`. */
const SHELL_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=/u;

/**
 * `bashCommandSegments`: each segment joined by one space, followed by the same
 * segment without its leading environment assignments when it has any.
 */
function commandSegments(command: string): Array<string> {
  const candidates: Array<string> = [];
  for (const words of segmentWords(command)) {
    candidates.push(words.join(" "));
    const firstCommand = words.findIndex((word) => !SHELL_ASSIGNMENT.test(word));
    if (firstCommand > 0) candidates.push(words.slice(firstCommand).join(" "));
  }
  return candidates;
}

/** `hasBashApprovalShellControl`: does the command hold shell syntax an allow rule must not vouch for? */
function hasShellControl(command: string): boolean {
  let quote: "'" | '"' | undefined;
  let reinterpretable = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote === "'") {
      if (ch === "'") quote = undefined;
      else if (SHELL_CONTROL.test(ch)) reinterpretable = true;
      continue;
    }
    if (ch === "\\") {
      const escaped = command[i + 1];
      if (escaped !== undefined && SHELL_CONTROL.test(escaped)) reinterpretable = true;
      i++;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = undefined;
      else if (ch === "`" || ch === "$") return true;
      else if (SHELL_CONTROL.test(ch)) reinterpretable = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (SHELL_CONTROL.test(ch)) return true;
  }
  return reinterpretable && REINTERPRETED_ARGUMENT.test(command);
}

/** `findNonCompoundBashRestrictionRule`: the deny or prompt rule of a command with shell control. */
function restrictionRule(
  rules: ReadonlyArray<OmpBashRule>,
  whole: string,
  segments: ReadonlyArray<string>,
): OmpBashRule | undefined {
  const restrictions = rules.filter(({ approval }) => approval !== "allow");
  // `commandMatchesBashApprovalPattern` normalizes each candidate before it matches.
  const matches = (rule: OmpBashRule, text: string): boolean => {
    const candidate = text.trim().replace(/\s+/gu, " ");
    return candidate.length > 0 && patternRegExp(rule.match).test(candidate);
  };
  let promptRule: OmpBashRule | undefined;
  for (const rule of restrictions) {
    if (!matches(rule, whole) || segments.some((segment) => matches(rule, segment))) continue;
    if (rule.approval === "deny") return rule;
    promptRule ??= rule;
  }
  for (const segment of segments) {
    const segmentRule = restrictions.find((rule) => matches(rule, segment));
    if (segmentRule?.approval === "deny") return segmentRule;
    if (segmentRule !== undefined) promptRule ??= segmentRule;
  }
  return promptRule;
}

/**
 * `findBashApprovalPatternRule`: the approval of the rule that decides
 * `command`, or undefined when no rule matches and the approval mode decides
 * (the kit ships `yolo`).
 */
export function ompApproval(
  rules: ReadonlyArray<OmpBashRule>,
  command: string,
): OmpApproval | undefined {
  const whole = command.trim().replace(/\s+/gu, " ");
  if (whole.length === 0) return undefined;
  const segments = commandSegments(command);
  if (hasShellControl(command)) return restrictionRule(rules, whole, segments)?.approval;
  const rule = rules.find(({ match, approval }) => {
    const regex = patternRegExp(match);
    if (regex.test(whole)) return true;
    return approval !== "allow" && segments.some((segment) => regex.test(segment));
  });
  return rule?.approval;
}

/** `CRITICAL_BASH_PATTERNS` in omp 19.0.0 `src/tools/bash.ts`, verbatim (unchanged since 18.17.0). */
const CRITICAL_BASH_PATTERNS: ReadonlyArray<RegExp> = [
  /\brm\s+(?:-\S+\s+)*(?:-[a-z]*[rRfF][a-z]*|--recursive|--force)\s+(?:-\S+\s+)*\//i,
  /\brm\s+(?:-\S+\s+)*--no-preserve-root\b/i,
  /\bsudo\s+rm\b/i,
  /\bchmod\s+-R\s+[0-7]+\s+\//i,
  /\bchmod\s+-R\s+[ugoa+\-=rwxXst,]+\s+\//,
  /\bchown\s+-R\s+\S+\s+\//i,
  /:\(\)\s*\{\s*:\s*\|\s*:/i,
  />\s*\/dev\/sd[a-z]/i,
  /\bmkfs(\.|\b)/i,
  /\bdd\s+if=.+of=\/dev\/(?!(?:null|zero|stdout|stderr|tty|fd\/\d+)(?:[\s;&|)<>]|$))/i,
  /\bshred\s+\/dev\//i,
  /\bcryptsetup\b/i,
  />\s*\/etc\/(?:passwd|shadow|sudoers)\b/i,
  /\btee\s+(?:-a\s+)?\/etc\/(?:passwd|shadow|sudoers)\b/i,
  /\b(?:curl|wget|fetch)\b[^|]*\|\s*(?:bash|sh|zsh|fish)\b/i,
  /(?:^|[\s;&|(])(?:bash|sh|zsh|source|\.)\s+<\(\s*(?:curl|wget|fetch)\b/i,
  /\beval\s+["'`]?\$\(\s*(?:curl|wget|fetch)\b|\beval\s+`\s*(?:curl|wget|fetch)\b/i,
  /\bkill\s+-9\s+1\b/,
  /(?:^|[\s;&|(])(?:shutdown|poweroff|reboot|halt)(?:\s|$|[;|&])/i,
  /(?:^|[\s;&|(])init\s+0\b/i,
  /\bnc\b[^|;]*\s-[a-zA-Z]*[ec][a-zA-Z]*\s/i,
];

/** Does omp's critical-command check flag `command`? */
export function isOmpCritical(command: string): boolean {
  return command !== "" && CRITICAL_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * What omp does with `command` under the kit's `tools.approvalMode: yolo` and no
 * `tools.approval.bash` policy: `BashTool.approval`, then the generic resolver.
 * `prompt` asks a person in the main session; a headless subagent rejects it.
 */
export function ompYoloOutcome(rules: ReadonlyArray<OmpBashRule>, command: string): OmpApproval {
  const approval = ompApproval(rules, command);
  if (approval === "deny" || approval === "prompt") return approval;
  // A bare override carries no policy, and yolo ignores it.
  if (isOmpCritical(command)) return "allow";
  return approval ?? "allow";
}
