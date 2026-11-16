---
description: Keep repository hooks on, push without force, and do not discard work in bulk
condition:
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+clean\b(?:(?!\\n)[^;&|])*?\s(?:--f[\w-]*|-[a-zA-Z]*f[a-zA-Z]*)(?=[\s=;&|)"''\\])'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+reset\b(?:(?!\\n)[^;&|])*?\s--ha(?:rd?)?(?=[\s;&|)"''\\])'
  - '(?:\b|(?<=\\[nrt]))git\b(?:(?!\\n)[^;&|])*?\s--no-verify(?=[\s=;&|)"''\\])'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+(?:commit|am)\b(?:(?!\\n)[^;&|])*?\s-[a-zA-Z]*n[a-zA-Z]*(?=[\s;&|)"''\\])'
  - '(?i)\bcore\.hooksPath(?:\s*=|\s+[^\s;&|"''\\-])'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+push\b(?:(?!\\n)[^;&|])*?\s(?:(?:--f(?!ol)[\w-]*|--m[\w-]*|--pru(?:ne?)?|-[a-zA-Z]*f[a-zA-Z]*)(?=[\s=;&|)"''\\])|\+[\w/:.-])'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+push\b(?:(?!\\n).)*?[$`]'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+push\b(?:(?!\\n).)*?(?:&&|\|\||;)'
  - '(?:&&|\|\||;)\s*git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+push(?=[\s;&|)"''\\])'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+rm\b(?:(?!\\n)[^;&|])*?\s(?:--f[\w-]*|-[a-zA-Z]*f[a-zA-Z]*)(?=[\s=;&|)"''\\])'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+branch\b(?:(?!\\n)[^;&|])*?\s-[a-zA-Z]*D[a-zA-Z]*(?=[\s;&|)"''\\])'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+branch\b(?=(?:(?!\\n)[^;&|])*?\s(?:-[a-zA-Z]*d[a-zA-Z]*|--d[\w-]*)(?=[\s=;&|)"''\\]))(?=(?:(?!\\n)[^;&|])*?\s(?:-[a-zA-Z]*f[a-zA-Z]*|--f(?!orm)[\w-]*)(?=[\s=;&|)"''\\]))'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+(?:checkout|restore)\b(?:(?!\\n)[^;&|])*?\s(?:\\?["''])?(?:\./?|:/)(?:\\?["''])?(?=[\s;&|)"''\\])'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+stash(?:\s+-[\w-]+)*\s+(?:drop|clear)(?=[\s;&|)"''\\])'
scope: "tool:bash, tool:eval"
repeatMode: always
---
Do not skip or turn off a repository hook. Do not use `--no-verify`, `git commit -n`, `git am -n`, or a `core.hooksPath` change.

- When a hook fails on a problem that your change did not cause, report the failure.
- In the main session, ask the user before you continue.
- With `git rm` or `git push`, do not use `-f`, a flag cluster that holds `f`, or a long option that starts with `--f`, such as `--force` or `--force-with-lease`. `git push --follow-tags` is correct.
- Do not use `git push --mirror` or `git push --prune`.
- Write each ref of a `git push` command as literal text. Do not put `$` or a backtick in it.
- Run `git push` as its own command. Do not chain it with `&&`, `||`, or `;`.
- To push the current branch, run `git push -u origin HEAD`.
- To delete several remote branches, list them in one command: `git push origin --delete <branch-a> <branch-b>`.
- To delete a merged local branch, run `git branch -d <branch>`. Do not use `git branch -D` or `git branch -d --force`.
- To discard the changes in one file, run `git restore -- <path>`.
- Do not discard work in bulk (`git clean -f`, `git reset --hard`, `git checkout .`, `git restore .`, `git stash drop`, `git stash clear`). In the main session, ask the user first.
- In a subagent, do not run a bulk discard. Name the command in your report.
