/**
 * Prints the tool-argument JSON of one test call to stdout, for verify flow V5:
 *
 *   bun .agents/skills/verify/scripts/ttsr-snippet.ts big-reset \
 *     | omp ttsr test --rule SoT/.omp/plugin/rules/git-safety.md --source tool --tool eval --file -
 *
 * omp tests a trigger-rule condition on this raw JSON text, so the script
 * writes it with no trailing newline. The big snippets are 21 KB Python eval
 * cells with many `\"` escapes. Before plan issue #187, a leading lookbehind
 * scanned such a cell for seconds and then reported no match.
 */

/** One line of eval code: an f-string that holds escaped JSON, 24 escape pairs in the buffer. */
const ESCAPE_DENSE_LINE = String.raw`print("%s", f"{{\"tool_name\":\"Edit\",\"tool_input\":{{\"file_path\":\"{PWD}/README.md\"}}}}") | node hooks/x.mjs`;
const ESCAPE_DENSE_LINES = 150;
const RESET_LINE = 'sh("git reset --hard HEAD")';

function evalCell(code: string): object {
  return { i: "T", language: "py", code };
}

function bigCell(lastLines: readonly string[]): object {
  const lines = [...Array<string>(ESCAPE_DENSE_LINES).fill(ESCAPE_DENSE_LINE), ...lastLines];
  return evalCell(lines.map((line) => `${line}\n`).join(""));
}

const SNIPPETS = {
  /** Fires git-safety: `git reset --hard` after 21 KB of escape-dense code. */
  "big-reset": () => bigCell([RESET_LINE]),
  /** Stays quiet on every rule: the same cell with no trigger. */
  "big-quiet": () => bigCell([]),
  /** Fires git-safety on a short cell. */
  "small-reset": () => evalCell(RESET_LINE),
  /** Fires temp-and-background on a bash call. */
  "small-tmux": () => ({ command: "tmux new -d -s x" }),
  /** Fires file-removal through a `KEY=value` word before `rm`. */
  "small-env-rm": () => ({ i: "T", command: "LC_ALL=C rm old-file" }),
  /** Stays quiet: the trigger words appear only in the intent field. */
  "small-correct": () => ({ i: "Checking rm and git push --force", command: "git status" }),
} as const satisfies Record<string, () => object>;

type SnippetName = keyof typeof SNIPPETS;

function isSnippetName(name: string | undefined): name is SnippetName {
  return name !== undefined && Object.hasOwn(SNIPPETS, name);
}

const snippetName = process.argv[2];
if (!isSnippetName(snippetName)) {
  console.error(`usage: bun ttsr-snippet.ts <${Object.keys(SNIPPETS).join("|")}>`);
  process.exit(2);
}
process.stdout.write(JSON.stringify(SNIPPETS[snippetName]()));
