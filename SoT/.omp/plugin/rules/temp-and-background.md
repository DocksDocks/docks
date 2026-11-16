---
description: Keep temporary files in a scratch directory and do not leave detached processes, global installs, or scheduled jobs
condition:
  - '(?:\b|(?<=\\[nrt]))(?:mkdir|touch|tee)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?:cp|mv|ln|rsync|install)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s(?:\\*["''])?/tmp(?:/[^\s;&|"''\\`]*)?(?:\\*["''])*(?:\s+(?:-[^\s;&|"''\\`]+|&?\d*[<>]+&?\s*[^\s;&|"''\\`]*)(?:\\*["''])*)*\s*(?=[;&|)`"]|\\[nrt])'
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+clone\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '>\s*(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:\s-o\s*|\s--output[=\s]|\s--out-?dir[=\s])(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))mktemp(?=[\s;&|()`''"\\])'
  - '(?:\b|(?<=\\[nrt]))TMPDIR=(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:(?:[;&|({`''"!]|\\[nrt])\s*|(?:\b|(?<=\\[nrt]))sudo\s+)(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*\s+)*(?:nohup|setsid|disown)(?=[\s;&|)`''"\\])'
  - '(?:[;&|({`''"!]|\\[nrt])\s*(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*\s+)*tmux(?:\s+-[LSf]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-(?:\\[^nrt]|[^\s;&|"\\])+)*(?:\s+(?:new|new-session|new-window|neww|split-window|splitw|respawn-pane|respawn-window)(?=[\s;&|)`''"\\])|\s*(?=[;&|)`''"\\]))'
  - '(?:[;&|({`''"!]|\\[nrt])\s*(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*\s+)*screen(?:\s*(?=[;&|)`''"\\])|\s+(?!-(?:ls|list)(?=[\s;&|)`''"\\]))[^\s;&|)`''"\\]+(?=[\s;&|)`''"\\]))'
  - '\s--watch(?:All)?(?:=(?!(?:false|0)(?=[\s;&|)`''"\\]))[^\s;&|)`''"\\]*)?(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))npm\s+(?:(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s)?(?:i|install|add)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s(?:-g|--global)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))npm\s+(?:-g|--global)\s+(?:i|install|add)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?:bun|pnpm)\s+(?:add|install|i)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s(?:-g|--global)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?:bun|pnpm)\s+(?:-g|--global)\s+(?:add|install|i)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))yarn\s+global\s+add(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))pipx\s+install(?=[-\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))cargo\s+install(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?:go|gem|uv\s+tool)\s+install(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))crontab(?:\s*(?=[;&|)`''"\\])|\s+(?!-l(?=[\s;&|)`''"\\]))[^\s;&|)`''"\\]+(?=[\s;&|)`''"\\]))'
  - '(?:\b|(?<=\\[nrt]))systemctl(?:\s+-(?:\\[^nrt]|[^\s;&|"\\])+)*\s+enable(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))docker\s+system\s+prune(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))docker\s+(?:volume|image)\s+(?:rm|prune)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))docker\s+rmi(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))docker\s+(?:builder|buildx)\s+prune(?=[\s;&|)`"''\\])'
scope: "tool:bash, tool:eval"
---
Do not put a temporary file, a temporary directory, a package store, a cache, or a clone in `/tmp`.

- Create a temporary directory with the `scratch_new` tool or `docks-kit scratch new <label>`. Put each temporary file in that directory.
- A scratch directory is deleted after 7 idle days. Put evidence that you cite in the issue, the pull request, or the repository.
- Run a test suite in single-run mode.
- Start a server, a watcher, a tunnel, or a database only as a named bash service or an async job.
- Do not detach a process with `nohup`, `setsid`, `disown`, `tmux`, or `screen`.
- Do not install a package globally, add a scheduled job, or enable a service unless the user asks for it. `go install`, `gem install`, and `uv tool install` are global installs too.
- Do not remove a Docker volume, image, or build cache that you did not create.
- Do not run `docker system prune`.
