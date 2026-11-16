---
description: Keep repository hooks on, push without force, and do not discard work in bulk
condition:
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+clean(?=[\s;&|)`"''\\])(?!(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s(?:-[a-zA-Z]*n[a-zA-Z]*|--d[\w-]*)(?=[\s=;&|)`"''\\]))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*(?=[;&|"]|\\\\?n)'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+reset\b(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s--ha(?:rd?)?(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git\b(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s--no-veri(?:fy?)?(?=[\s=;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+(?:commit|am)\b(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s-[a-zA-Z]*n[a-zA-Z]*(?=[\s;&|)`"''\\])'
  - '(?i)(?<="(?:command|code)":"(?:\\.|[^"\\])*)\bcore\.hooksPath(?:\s*=|\s+[^\s;&|"''\\-])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+push\b(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s(?:--f(?!ol)[\w-]*|--m[\w-]*|--pru(?:ne?)?|-[a-zA-Z]*f[a-zA-Z]*)(?=[\s=;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+push\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s(?:\\*["''])?\+[\w/:.-]'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+push\b(?:\\[^n\\]|\\\\(?!n)|[^"\\`)])*?(?:\$|`(?=[\w/-]))'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+push\b(?:\\[^n\\]|\\\\(?!n)|[^"\\`)])*?(?:&&|\|\||;)'
  - '(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:&&|\|\||;)\s*(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*\s+)*git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+push(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+rm\b(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s(?:--f[\w-]*|-[a-zA-Z]*f[a-zA-Z]*)(?=[\s=;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+branch\b(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s-[a-zA-Z]*D[a-zA-Z]*(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+branch\b(?=(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s(?:-[a-zA-Z]*d[a-zA-Z]*|--d[\w-]*)(?=[\s=;&|)`"''\\]))(?=(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s(?:-[a-zA-Z]*f[a-zA-Z]*|--f(?!orm)[\w-]*)(?=[\s=;&|)`"''\\]))'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+checkout\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s(?:\\*["''])?(?:\./?|:/)(?:\\*["''])?(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+restore(?=[\s;&|)`"''\\])(?=(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s(?:\\*["''])?(?:\./?|:/)(?:\\*["''])?(?=[\s;&|)`"''\\]))(?:(?=(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s(?:--w[\w-]*|-[a-zA-Z]*W[a-zA-Z]*)(?=[\s=;&|)`"''\\]))|(?!(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s(?:--st[\w-]*|-[a-zA-Z]*S[a-zA-Z]*)(?=[\s=;&|)`"''\\])))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*(?=[;&|"]|\\\\?n)'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+stash(?:\s+-[\w-]+)*\s+(?:drop|clear)(?=[\s;&|)`"''\\])'
scope: "tool:bash, tool:eval"
repeatMode: always
---
Do not skip or turn off a repository hook. Do not use `--no-verify`, `git commit -n`, `git am -n`, or a `core.hooksPath` change.

- When a hook fails on a problem that your change did not cause, report the failure.
- In the main session, ask the user before you continue.
- With `git rm` or `git push`, do not use `-f`, a flag cluster that holds `f`, or a long option that starts with `--f`, such as `--force` or `--force-with-lease`. `git push --follow-tags` is correct.
- Do not put `+` before a ref of `git push`. `git push origin +<ref>` is a force push.
- Do not use `git push --mirror` or `git push --prune`.
- Write each ref of a `git push` command as literal text. Do not put `$` or a backtick in it.
- Run `git push` as its own command. Do not chain it with `&&`, `||`, or `;`.
- To push the current branch, run `git push -u origin HEAD`.
- To delete several remote branches, list them in one command: `git push origin --delete <branch-a> <branch-b>`.
- To delete a merged local branch, run `git branch -d <branch>`. Do not use `git branch -D` or `git branch -d --force`.
- To discard the changes in one file, run `git restore -- <path>`.
- Do not discard work in bulk (`git clean` without `-n`, `git reset --hard`, `git checkout .`, `git restore .`, `git stash drop`, `git stash clear`). In the main session, ask the user first.
- A word after ` -- ` is a path, not an option. For example, `git clean -fd -- -n` is not a dry run.
- In a subagent, do not run a bulk discard. Name the command in your report.
