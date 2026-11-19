# Command guards

The kit ships one destructive-command policy to omp and Claude Code.
The short rule for agents: **to remove, use the trash**. Run
`gio trash -- <path>` on Linux or `trash <path>` on macOS. In omp, remove a
temporary file or directory with `docks-kit scratch remove <path>` instead.
To remove a path from the git index, run `git rm -- <path>`.

Claude Code follows one principle: **fail closed**. A command is
allowed only in a canonical form that is safe by construction, and every other
form that could force, empty, or delete asks. omp keeps only the deny part of
that principle. Where omp's critical-command check acts, the form is denied
instead of asked. omp also denies a `$` or a backtick after `git push`,
because the agent can always write the ref literally. A false positive in the
ask tier is accepted.

omp is the exception: by owner decision (0.22.8, #126), the kit ships no omp
prompt rule. The kit's `bash.patterns` holds only deny rules and the `trash *`
allow. Under omp's default `tools.approvalMode: yolo`, omp runs every
command that no deny matches without a question, in the main session and in
subagents. This includes any `rm` that omp does not deny, `git clean`,
`git reset --hard`, a force push that no deny matches, and a git command
that skips the repository's hooks. A prompt rule that the user adds to
`~/.omp/agent/config.yml` survives sync and still asks; a subagent rejects
it. The kit omp plugin trigger rule `git-safety.md` forbids these options with
`git push` and `git rm`: `-f`, a flag cluster that holds `f`, and a long
option that starts with `--f`. `git push --follow-tags` is correct. The rule
also forbids `git push origin +<ref>`, `git push --mirror`,
`git push --prune`, and each hook skip. It tells the agent to ask before a
bulk discard in the main session, for example `git clean` without `-n`,
`git reset --hard`, `git checkout .`, or `git stash clear`.
A subagent does not run a bulk discard and names it in its report. The omp
agent prompt lists a force push as a step that needs `ask`. The section
"omp trigger rules" below describes these rules.

The policy sorts shell commands into three tiers. omp uses two of them: deny
and allow.

- **Deny**: the command never runs, and nobody can approve it in the session.
- **Ask**: the command needs approval before it runs. The kit ships no omp
  rule in this tier.
  - Claude Code asks a person, even in auto mode.
- **Allow**: the agent may run the command alone. In omp, a command that no
  rule matches runs too. The table below calls this `run`.

The omp `eval` tool stays unrestricted: `bash.patterns` does not gate a shell
that `eval` starts.

## Tiers per tool

| Command | omp `bash.patterns` | Claude Code `permissions` |
| --- | --- | --- |
| `rm` of `/`, `~`, `~/`, `$HOME`, `${HOME}`, quoted or with a trailing `/` | deny | deny, also through `/bin/rm` and other `*/rm` paths |
| `rm` of `/*` | deny with an `r` or `f` option; plain `rm /*` runs | deny |
| `HOME=...`, `export HOME=...`, `env HOME=...` | deny | deny `export`, `env`, and a bare `HOME=...` line; `HOME=... cmd` goes to the classifier |
| `sudo` before `rm`, plain or by path (`/usr/bin/sudo`) | deny | deny (`sudo *`, `*/sudo *`) |
| `git push --force` or `-f` to `origin main` or `origin master` | deny | deny |
| Recursive `rm` (`-r`, `-R`, `-rf`, `-fr`, `-rfv`, `-ri`, `-ir`, `-Ri`, `-iR`, `--recursive`, other listed clusters) | deny, also behind any prefix (`env`, `xargs`, `nice`, `find -exec`, `git rm -r`) | ask |
| `rm` with an `r` or `f` option before an absolute path, `--no-preserve-root` | deny | ask if recursive, else classifier |
| Any other `rm`: one file, several files, a glob, `-f` | run | glob asks; the rest goes to the classifier |
| `find ... -delete`, `find ... -exec rm` (also `-execdir`, `-ok`, `-okdir`), `xargs rm` | deny, in every position and by path | ask for `-delete`, `-exec rm` and `-execdir rm`; `-ok`/`-okdir rm` and a non-recursive `xargs rm` go to the classifier |
| `git clean`, `git reset --hard` | run | ask |
| `git push` that could force: see below | run, unless a deny above matches | ask |
| A `$` or a backtick anywhere after `git push` in the same command | deny, also after a shell keyword, a wrapper, or a path before `git`: see below | ask for a word that starts with `$` or a backtick |
| A git command that skips the repository's hooks: see below | run | no rule; the classifier decides |
| `git rm -- <path>`, `git worktree remove -- <path>` | run | ask |
| `git worktree remove --force -- <path>` | run; the omp `file-removal.md` trigger rule fires on each `--force`, `-f`, or `--f` form and permits it once, after the commits are on the remote | ask |
| `docks-kit scratch remove <path>` | run; the command removes only a path inside the scratch root, the system temporary directory, or `/var/tmp` | no rule |
| Any other non-recursive `git rm` or `git worktree remove` | run | ask |
| `gio trash -- <path>` | run | allow |
| Any other `gio trash` | run | ask with `--empty` or `--restore`; the rest goes to the classifier |
| `trash <path>` (macOS) | allow | allow |

In Claude Code, a `git push` asks when it holds any of these words. omp runs
each of these forms. Its force-push deny matches only `git push --force` or
`git push -f` directly before `origin main` or `origin master`:

- a `+` refspec;
- any long option that starts with `--f`, such as `--force`,
  `--force-with-lease`, or an abbreviation like `--for`;
- `--mirror` or an abbreviation of it;
- `-f`, or a short-option cluster that starts with two of git push's
  no-argument flags (`v`, `q`, `d`, `n`, `u`, `4`, `6`, `f`), such as `-vf`,
  `-vvf`, or `-uvfq`;
- a word that starts with `$`, a backtick, a quote, or a backslash. omp
  denies a `$` or a backtick anywhere after `git push`.

Each of these must begin a word: `feat/cache-vf` is a branch name, not an
option. In Claude Code, `--follow-tags` also asks. This is an accepted false
positive, because it shares the `--f` prefix.

A `$` or a backtick hides the ref until the shell expands it, so the matcher
cannot tell `$b` from `+main` or `--force`. An unquoted value inside a word
also splits into more words: with `b="main --force"`, `HEAD:$b` becomes
`HEAD:main --force`. omp never applies an allow rule to a command that holds a
`$` that the shell expands. So the kit cannot add an exception for a plain
branch name.

omp therefore denies a `$` or a backtick anywhere after `git push` in the same
command. The agent reads a refusal such as
`Blocked by bash pattern: *git push *$*`, writes the ref literally, and runs
the push without a question. The omp `git-safety.md` trigger rule names the
literal forms: `git push -u origin HEAD` for the current branch, and
`git push origin --delete <branch-a> <branch-b>` for several branches. The two
omp deny rules start with `*`. So a shell keyword such as `do` in a loop, a
wrapper such as `env`, or a path such as `/usr/bin/git` does not hide the
push.

## Commands that skip the repository's hooks

A git command can skip the repository's hooks, for example with
`--no-verify`, `git commit -n`, `git am -n`, or a `core.hooksPath` change.
The kit ships no omp `bash.patterns` rule for these commands, so omp does not
block them. The omp `git-safety.md` trigger rule forbids each hook skip.
Claude Code has no rule either, so its classifier decides.

## Why the tools differ

| Topic | omp | Claude Code |
| --- | --- | --- |
| Rule order | First match wins | Deny, then ask, then allow, whatever the order |
| Exception for one form | The kit ships no omp prompt rule, so it needs no exception | An allow never beats a matching ask, so every `git rm` asks |
| Pattern | Glob on the whole line and on each quote-stripped segment; `*` crosses spaces; no literal `*` | Glob on each subcommand as written, quotes included; `\*` is a literal `*` |
| `rm` by path (`/bin/rm`) | Matched by `*/rm` forms | Matched by `*/rm` forms |
| Leading assignment `X=1 cmd` | Deny and prompt rules also match each segment without its leading assignments (omp 19.0.0) | Stripped before deny and ask rules |
| What an ask means | The kit ships no ask; a user prompt rule asks a person in the main session, and a subagent rejects it | A person |
| Critical-command check | Runs after deny and prompt rules and replaces only an allow or no match; yolo then runs the command, so the kit denies those shapes | Asks or denies for an `rm` of a critical path |

## How an agent removes files

1. In omp, remove a temporary file or directory with the `scratch_remove`
   tool or `docks-kit scratch remove <path>`. The command removes only a path
   inside the scratch root, the system temporary directory, or `/var/tmp`.
   `gio trash` does not trash on a system internal mount, such as a `tmpfs`
   `/tmp`.
2. Move every other file or directory to the trash with `gio trash -- <path>`
   on Linux or `trash <path>` on macOS. The `--` ends option parsing, so `gio`
   reads every later argument as a path, and a path such as `--empty` cannot
   empty the trash. In Claude Code, leave a temporary file in `/tmp`; the
   system clears it.
3. To remove a path from the git index, run `git rm -- <path>`. To remove a
   worktree, run `git worktree remove -- <path>`. In omp, when git refuses
   because the worktree has changes, the agent may pass `--force` once, after
   each commit is on the remote and `git status --porcelain` lists only
   generated files. Never pass `--force` two times.
4. In omp, do not use `rm`. omp denies a recursive `rm`, `find -delete`,
   `find -exec rm`, and `xargs rm`. It runs any other `rm` without a prompt.
5. In Claude Code, use `rm <file>` without flags only for one file that the
   agent created.
6. For a recursive or bulk deletion, ask the user in the main session. A
   subagent lists the paths in its final report. In omp, the user runs a
   recursive deletion by hand.
7. Write literal absolute paths. Never use `~` or `$HOME`, and never set or
   export `HOME`.

In omp, the kit plugin trigger rules `file-removal.md` and `literal-paths.md`
carry these rules. `~/.claude/CLAUDE.md` carries the same rules.

### What the git removals keep

- `git rm` without `--force` refuses a file whose content differs from the
  last commit. The removed content stays in the repository history.
- `git worktree remove` without `--force` refuses a worktree with untracked
  files or tracked changes. It does delete the files that `.gitignore` covers,
  such as `node_modules`, build output, or a local `.env`. Git keeps no copy of
  those files.
- Git accepts an abbreviated long option, such as `--for` for `--force`, and a
  short-option cluster, such as `-rff`. After `--`, git reads every argument as
  a path. So the `--` form is the only one that cannot force.

## omp trigger rules

omp loads `~/.omp/agent/AGENTS.md` only into main sessions and advisors,
never into task subagents (`omp://context-files.md`). So the kit puts the omp
command rules into six Time Traveling Stream Rules (TTSR, trigger rules). The
kit plugin `docks-kit-omp` ships them in `SoT/.omp/plugin/rules/`. Sync
materializes the plugin to `~/.docks-kit/omp-plugin` and links it. omp's
`omp-plugins` provider loads `rules/*.md` from the linked plugin root. Each
rule has the scope `tool:bash, tool:eval`, because eval code can run a shell
command through `sh()`.

| Rule | Scope | Correct form that the rule teaches |
| --- | --- | --- |
| `file-removal.md` | `tool:bash`, `tool:eval` | `scratch_remove` or `docks-kit scratch remove <path>` for a temporary path; `gio trash -- <path>` or `trash <path>` for another path; no `rm`, `unlink`, or `shred`, also after a `VAR=value` prefix; `git rm -- <path>`; for a folder, `git rm -- '<dir>/*'` or `git rm --cached -- '<dir>/*'`, because omp denies `git rm -r`; `git worktree remove -- <path>`, and `--force` only after the commit and status checks; no deletion through `eval` |
| `git-safety.md` | `tool:bash`, `tool:eval` | no hook skip, also through an abbreviation such as `--no-veri`; no `-f`, `f` cluster, or `--f` long option with `git push` or `git rm` (`--follow-tags` is correct); no `+<ref>` with `git push` (`git push origin +<ref>` is a force push); no `git push --mirror` or `--prune`; a literal push ref; `git push` as its own command, not chained with `&&`, `\|\|`, or `;`; `git push -u origin HEAD`; `git push origin --delete <branch-a> <branch-b>`; `git branch -d <branch>`, not `-D` or `-d --force`; `git restore -- <path>`; an ask before `git clean` without `-n` or `--dry-run` before ` -- `, `git reset --hard`, `git checkout .`, `git restore .` (`git restore --staged .` only unstages and is correct), `git stash drop`, or `git stash clear`. The git global options `-C`, `-c`, `-p`, `-P`, and `--<option>` do not hide the subcommand. A word after ` -- ` is a path, not an option |
| `temp-and-background.md` | `tool:bash`, `tool:eval` | `scratch_new` or `docks-kit scratch new <label>` instead of `/tmp`; a server or watcher only as a named bash service or an async job; no `nohup`, `setsid`, `disown`, `tmux`, or `screen`, also after a `VAR=value` prefix; no global install (`npm`, `bun`, `pnpm`, `yarn`, `pipx`, `cargo`, `go install`, `gem install`, `uv tool install`), scheduled job, or enabled service; no Docker cleanup of a resource that the agent did not create |
| `worktree-location.md` | `tool:bash`, `tool:eval` | a worktree only at the literal absolute path `<data>/agent-worktrees/<repository>/<name>`, with `agent-worktrees` as a whole directory name. The rule fires on each `git worktree add`, also at the correct path, because a condition cannot read `$XDG_DATA_HOME` or the home directory of the user. The retry after the reminder runs |
| `literal-paths.md` | `tool:bash`, `tool:eval` | a literal absolute path; no `~` or `$HOME`; no `HOME` assignment |
| `remote-cleanup.md` | `tool:bash`, `tool:eval` | a remote cleanup only on a non-production target; an `ask` immediately before a production cleanup, which must be rare. Remote means SSH, `rsync --delete` to a `host:` target, `rclone` (`delete` verbs, and `sync` to a `remote:` target), `gh` (`gh <noun> delete`, `gh <noun> <x>-delete`, and `gh api -X DELETE`), a remote `docker` or `podman` (also `docker -c <context>`), a database client (`DROP TABLE`, `DATABASE`, or `SCHEMA` in `psql`, `mysql`, `sqlite3`, or `mongosh`; `dropdb`; `redis-cli FLUSHALL` or `FLUSHDB`), or a provider CLI with a cleanup verb, such as `aws s3 rb` or `neonctl branches delete` |

Each rule has a regex `condition` that aims at the wrong form. When the
model streams a matching tool call, omp aborts the call before it runs,
injects the rule body, and retries (`omp://ttsr-injection-lifecycle.md`). A
rule costs no prompt tokens until it fires, and it reaches subagents too. The
trigger rules teach the correct form. The `bash.patterns` denies do not
change, and they still enforce. Each rule has `repeatMode: always`, so it
fires at each later wrong form in the session too. The retry that its own
reminder starts does not fire it again, so a correct command still runs.

After a session resume, omp restores each injected rule at message count
zero. So a rule that fired before the resume does not fire in the first turn
after the resume (section 7 of
[ttsr-injection-lifecycle.md](https://github.com/can1357/oh-my-pi/blob/main/docs/ttsr-injection-lifecycle.md)).
No repeat mode changes this. The `bash.patterns` denies and the main-session
`ask` rules still apply in that turn.

A condition reads text, not a parsed shell command. So these correct calls
also fire a rule:

- A quoted command word, such as `echo "rm x"` or a commit message that
  starts with `rm`, fires `file-removal.md`.
- In eval code, a scan can continue past the closing quote of the `sh()`
  string to the end of the statement. For example,
  `print(sh("kubectl get pods"), "pods to delete")` fires `remote-cleanup.md`.

omp tests each condition on the partial tool-call buffer after each streamed
delta, and again on the full arguments at the end of the call
(`omp://ttsr-injection-lifecycle.md`). So a condition must not match a prefix
of a correct command. Each condition must require a delimiter after the token
that it checks, and no condition uses the end anchor `$` as that delimiter.
A negative lookahead, such as `(?!ol)` in `--f(?!ol)`, passes at the end of
a partial buffer. So after a negative lookahead, the condition must read the
token to its delimiter. `git clean` and `git restore .` read the full
command before they decide, because `-n` or `--staged` can come last.

The buffer is the argument JSON text, and omp's schema puts the intent field
`i` before `command`. A call can also put `i` after `command`, and a provider
can stream JSON with white space, such as `{"command": "ls"}`. Each condition
has the lookbehind `(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)` before
its first command token, so a match starts only inside the `command` or
`code` string, with or without JSON white space around the colon. omp 18.21.0
accepts this variable-length lookbehind. A scan reads an escape pair, such as
`\"` or `\\`, as one unit. It stops at an unescaped `"`, which ends the
command string, and at a newline (`\n`), which ends the command line. So the
intent text and the next line do not fire a rule. A tab in a command is `\t`
in the buffer, so each condition reads `\t` as shell white space, as it reads
a space. A scan that looks for an option also stops at a ` -- ` word, also
with a tab, because each later word is a path. So `git clean -fd -- -n`
fires, and `git rm -- -f` stays quiet. In the `git push` conditions for `$`,
a backtick, and a chain, a scan also stops at `)` and at a backtick, which end
a JavaScript `` sh`…` `` or `sh("…")` call. A backtick counts as a command
substitution only when a word follows it.
`cli/test/unit/ompTriggerRules.test.ts` runs each shell row through bash,
Python `sh("…")`, JavaScript `` sh`…` ``, and JavaScript `sh("…");`. It runs
every row in the compact JSON layout (`{"command":"ls"}`) and in the spaced
layout (`{"command": "ls"}`), and some rows in the pretty layout, with a
newline and an indent. Other rows put trigger words in the intent field,
before or after the command, or put a tab in the command. The test checks
that each correct form stays quiet on each prefix, that each condition has a
wrong row that fires it, and that each rule has `repeatMode: always`.

## Why omp denies instead of asking

omp has a built-in check for critical commands. For example, it flags:

- an `rm` with an `r` or `f` option before an absolute path;
- `sudo rm`, also when `sudo` is called by its path.

omp 19.0.0 checks deny and prompt rules first, then its critical patterns, then
allow rules. A critical command that no deny or prompt rule matches gets a bare
safety override, which also replaces a matching allow. Under omp's default
`tools.approvalMode: yolo`, omp ignores a bare override, so the command runs.
This applies in subagents too. A prompt rule would ask a person in the main
session, but a subagent rejects every prompt, so the kit ships none. Only a
deny rule stops a critical command in every session (`BashTool.approval` in
the v19.0.0 source).

The kit therefore denies every `rm` shape that the check can flag:

- a recursive `rm`;
- an `rm` with an option that holds `r` or `f` before an absolute path;
- `sudo` anywhere before `rm`;
- `--no-preserve-root`.

The kit also denies bulk removal through `find -delete`, `find -exec rm`, and
`xargs rm`. omp's critical check does not flag these forms, but they can empty
the home directory, and no glob can express "inside the temporary directory".
`docks-kit scratch remove` checks the path in code instead.

## Matching rules per tool

- **omp**:
  - For a simple command, the rules are ordered, and the first match wins.
  - `*` matches any text, spaces included, and no escape spells a literal `*`.
  - Deny rules test the whole line and each segment between `;`, `&&`, `|`,
    and similar operators, with quotes and escapes removed. So
    `rm -rf "$HOME"` matches `rm * $HOME`. A segment also matches without its
    leading `NAME=value` words.
  - For a line with shell control, each segment takes its first matching deny
    or prompt rule. A deny chosen for one segment wins over a prompt chosen
    for another segment; within one segment, a prompt rule that comes first
    wins over a later deny.
  - Allow rules apply only to a simple command.
  - The kit ships no prompt rule. It lists rules as deny, then the `trash *`
    allow.
- **Claude Code**:
  - Deny beats ask, and ask beats allow, whatever the order.
  - The rules match the command text as written, quotes included, so the kit
    lists each quoted spelling. `\*` is a literal `*`.
  - Claude Code strips wrappers such as `timeout` and bare `xargs`. It matches
    deny and ask rules past a leading variable assignment, and it applies them
    to every subcommand.
  - A rule for `rm` does not match `/bin/rm`, so the kit adds `*/rm` forms.

## Gaps

- **omp, literal `*`**: omp cannot match a literal `*`, so it cannot tell a
  glob from a file name. The kit therefore runs every `rm` that it does not
  deny without a prompt. This includes `rm ~/*`, `rm $HOME/*`, and `rm /*`
  without an `r` or `f` option, because a deny rule for them would also deny
  `rm ~/notes.txt` (owner decision, 0.20.9).
- **omp, whole-line matching**: omp tests deny rules against the whole command
  line too, so a pattern can span commands. For example, `rm x && cd ~`,
  `rm -i a && ls -R /tmp`, and `sudo apt update && rm x` are denied. Run `rm`
  as its own command. In the same way, a `$` or a backtick after `git push`
  denies the whole command, such as `git push origin HEAD && echo $?`. omp
  joins the lines of a command first, so `echo $?` on a later line is denied
  too. Run `git push` as its own command.
- **omp, text arguments**: the critical-shape deny also matches text such as
  `git commit -m "rm -f /tmp/x"`. The `git push` deny matches text that names
  `git push` before a `$`, such as `git commit -m "git push $b fails"`. Write
  such a message with `git commit -F`.
- **omp, prefixed `rm`**: the kit denies a recursive `rm` behind any prefix,
  such as `env X=1 rm -rf b`, `xargs rm -rf`, `find . -exec rm -rf {} +`, or
  `git rm -r dir`. A `* rm ` rule also matches text, so a line such as
  `echo do not rm -rf b` is denied too.
- **omp, bulk-removal text**: the `* find *-delete*`, `*-exec rm *`, and
  `*xargs rm` rules also match text, so a line such as
  `echo use find with -delete` is denied. Write such text to a file instead.
- **Recursive `rm` clusters**: omp and Claude Code match only the listed
  recursive-`rm` clusters. In omp, these are `r` or `R` alone or with `f` and
  `v`, plus `-ri`, `-ir`, `-Ri`, and `-iR`. In Claude Code, they are `r` or `R`
  alone or with `f` and `v`. Another cluster falls back to the tool's next
  tier. In omp, the command runs. In Claude Code, the classifier decides.
- **`git push` beyond the listed words**: a configured `+` refspec in
  `remote.<name>.push` makes a plain `git push` force. No rule sees git
  configuration. `git push --delete` and `git push --prune` remove remote
  branches without force; no kit rule asks for them.
- **omp, force push to `main` in another spelling**: the force-push deny
  rules match only `git push --force` or `git push -f`, then
  `origin main` or `origin master`. Every other force push to `main` runs
  without a question, such as `git push origin main --force`,
  `git push -vf origin main`, `git push --force-with-lease origin main`,
  `git push origin +main`, `git push -f origin HEAD:main`, or
  `git push --mirror origin`. Until 0.22.8 these forms asked.
- **omp, force push after a prefix**: the force-push deny rules start with
  `git push`, not `*`. So a force push to `origin main` after a shell keyword,
  a wrapper, or a path runs without a check, such as
  `for r in a; do git push --force origin main; done`,
  `env git push --force origin main`, or `/usr/bin/git push --force origin main`.
- **`git -C`**: no tool matches a git subcommand that does not follow `git`
  directly, such as `git -C . push --force origin main` or
  `git -C . push origin $b`.
- **Claude Code, `HOME=` before a command**: Claude Code matches deny rules
  past a leading assignment. So `HOME=/tmp/x cmd` reaches the classifier.
  `export HOME=...`, `env HOME=...`, a bare `HOME=...` line, and any `rm` of
  `$HOME` stay denied.
- **Claude Code, unlisted `rm` forms**: a multi-file `rm` and an `rm -f` of
  one file go to the auto-mode classifier. Claude Code does not strip `env`, so
  `env X=1 rm -rf ~` also goes to the classifier.
- **Claude Code, `gio trash`**: a `gio trash` form other than `-- <path>` that
  holds neither `--empty` nor `--restore` goes to the classifier. GLib's
  `gio trash` supports no abbreviated long options.
- **All tools**: no rule covers a program that removes files itself, such as a
  Python or Node script, or a shell started by omp `eval`.

### How `gio trash` empties the trash

GLib's `gio trash` handles operands first. With at least one path, it trashes
or restores the paths, and `--empty` has no effect. Without a path, it empties
the trash when `--empty` is set. `-f` can repeat. So `gio trash -ff --empty`
empties the trash, while `gio trash build --empty` only trashes `build`.

In omp, every `gio trash` runs without a prompt. In Claude Code, any form with
`--empty` or `--restore` asks.

## Sync behavior

- **omp**:
  - The config merge keeps user `bash.patterns` rules and groups all rules in
    this order:
    1. kit deny;
    2. user deny;
    3. user prompt;
    4. kit prompt (the kit ships none since 0.22.8);
    5. the other user rules;
    6. kit allow.
  - A user deny or prompt thus precedes every kit allow, and no allow can
    loosen a deny or a prompt.
  - A repeat sync changes nothing.
  - After the merge, `ompRemovals.ts syncOmpRemovals, retired bash-rule
    inventory` removes the retired kit rules in `OMP_RETIRED_BASH_RULES` from
    the deployed `bash.patterns` on every sync. The inventory also holds the
    492 prompt rules that the kit retired in 0.22.8. It removes a rule only
    when its `match` and `approval` equal a retired pair, so a different user
    rule stays.
- **Claude Code**: sync unions each permissions array with the deployed one,
  so user rules stay. `--reconcile` replaces the arrays with the SoT arrays.

## Check the deployed rules

The check below is safe, because the shell never reaches `rm`.

- **omp and Claude Code**: ask the agent to run `true || rm -rf "$HOME"`. The
  `true ||` short-circuit stops the shell before `rm`. omp reports
  `Blocked by bash pattern: rm * $HOME`, and Claude Code reports a denial.

## Sources

- omp: `omp://tools/bash.md`, `omp://approval-mode.md`, and the
  `@oh-my-pi/pi-coding-agent` 19.0.0 source `src/tools/bash.ts`
  (`CRITICAL_BASH_PATTERNS`, `BashTool.approval`). `omp://approval-mode.md`
  still describes the 18.17.0 order; the source is what runs.
- Claude Code: https://code.claude.com/docs/en/permissions and
  https://code.claude.com/docs/en/permission-modes
- GLib `gio trash`: https://github.com/GNOME/glib/blob/main/gio/gio-tool-trash.c
- Git: https://git-scm.com/docs/gitcli (abbreviated and clustered options),
  https://git-scm.com/docs/git-rm, https://git-scm.com/docs/git-worktree,
  https://github.com/git/git/blob/master/builtin/push.c (short options), and
  https://github.com/git/git/blob/master/builtin/worktree.c
  (`remove_worktree` parses `--`; `check_clean_worktree` runs
  `git status --porcelain` without `--ignored`).
- Git hooks: https://git-scm.com/docs/githooks (`--no-verify`,
  `core.hooksPath`), https://git-scm.com/docs/git-commit and
  https://git-scm.com/docs/git-am (`-n`).
- macOS `trash`: https://keith.github.io/xcode-man-pages/trash.8.html
