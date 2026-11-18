# Verify skill template

## Contents

| Section | What it holds |
|---|---|
| [Purpose](#purpose) | What a project `verify` skill does and when to create it |
| [Rules for each command](#rules-for-each-command) | Speed, readiness, expected results, cleanup |
| [Template](#template) | The fill-in `SKILL.md` |
| [Surface recipes](#surface-recipes) | Start, drive, inspect, and stop for each kind of surface |
| [Worked example](#worked-example) | A filled skill for a small HTTP service |
| [Sources](#sources) | Official documentation for the tools that the recipes name |

## Purpose

A project `verify` skill tells an agent how to run the real product the way a user or another program does. It names the commands that start the surface, drive its main flows, inspect the observable results, and stop it. A unit test checks one part. The `verify` skill checks the whole surface after a change.

Create the skill when the project has a runnable surface: a web app, a mobile app, a desktop app, a CLI, a service with an API, or a hook or plugin that a host program calls. Do not create it for a repository that holds only documents, configuration, or a library without a runnable entry point.

The skill lives at `.agents/skills/verify/SKILL.md`. The symlink `.claude/skills/verify` points to `../../.agents/skills/verify`, so Claude Code finds it too.

## Rules for each command

- Make each command fast. Prefer a command that finishes in seconds over a full test suite.
- Wait on a readiness signal: an open port, a health URL that returns 200, or a log line. Do not wait with a fixed `sleep`.
- Name the expected observable result: an exit code, an output line, an HTTP status and body field, element text, or a screenshot detail.
- Write each expected result as `not observed: expect <result>` until a run shows it. This covers each Prerequisites row, `Ready when:`, each Drive and inspect row, and `Clean when:`.
- After you write the skill, run the check command of each Prerequisites row, then Start, every flow in order, and Stop. Compare each output with the `expect <result>` part of its mark, and remove the mark only after the command shows that result. A failed command keeps its expected result and gets the failure after it: `not observed: expect <result>; got <first line of the failure>`. The commands after it keep their marks.
- A `not observed:` line is a command that has not shown its expected result: it failed, or no run finished it. Before a later run, write `not observed: expect <result>` again on each result that holds no mark. Then run every command again in order, not only the marked rows, because a flow can depend on an earlier flow.
- Use test data, test accounts, and local ports only. Never point a command at production.
- Name each secret by its environment variable. Do not write a secret value into the skill, and do not print it.
- Stop every process that a command starts. Remove temporary files and free the ports.
- Put the log, the PID file, and other temporary files in a private folder that `mktemp -d` makes. Do not use a fixed path such as `/tmp/<project>.log`: on a shared host, another user can create that path first as a symlink to a file that you can write.
- Use only commands that the project root `AGENTS.md` or its build files already define, or the tools in [Surface recipes](#surface-recipes).

## Template

Replace each `<...>` value. Delete a row or a section that does not apply to the project. Keep each `not observed: expect` mark until a run of the command shows that result.

````markdown
---
name: verify
description: "Use when checking a change to <project> end to end: start <surface>, drive <main flows>, inspect <observable results>, and stop it. Not for unit tests (run <unit test command>), lint, or a release."
metadata:
  updated: "<YYYY-MM-DD>"
---

# Verify <project>

<One sentence: what the surface is and who drives it.>

## Prerequisites

| Need | Check command | Expected result |
|---|---|---|
| <tool and minimum version> | `<command>` | not observed: expect <output> |
| <environment variable> holds <what> | `test -n "$<VAR>" && echo set` | not observed: expect `set` |

## Start

```bash
run=$(mktemp -d)
echo "verify folder: $run"
<start command> > "$run/verify.log" 2>&1 &
echo $! > "$run/verify.pid"
<readiness command>
```

The Stop block reads `$run`. If the shell does not keep variables between blocks, set `run` to the printed folder before you stop.

Ready when: not observed: expect <the readiness command exits 0 | the log shows "<line>">.

## Drive and inspect

| Id | Flow | Command or tool action | Expected result |
|---|---|---|---|
| V1 | <main flow> | `<command>` | not observed: expect <observable result> |
| V2 | <error path> | `<command>` | not observed: expect <observable result> |

## Stop and clean up

```bash
kill "$(cat "$run/verify.pid")"
rm -r "$run"
```

Clean when: not observed: expect `<command>` shows no process and no open port.

## Failure signs

| Sign | Meaning | Next step |
|---|---|---|
| <output> | <cause> | <action> |
````

## Surface recipes

Pick the row for each surface that the project has. Copy its commands into Start, Drive and inspect, and Stop.

| Surface | Start | Drive | Inspect | Stop |
|---|---|---|---|---|
| Web app | Start the dev server in the background. Wait with `curl --silent --fail --retry 30 --retry-delay 1 --retry-connrefused <url>`. | Use the browser tool of the harness, for example Chrome DevTools MCP (`navigate_page`, `click`, `fill`, `wait_for`) or Playwright MCP. With no tool, start Chrome with `--remote-debugging-port=9222` and send Chrome DevTools Protocol commands. | Page text from `take_snapshot`, errors from `list_console_messages`, status codes from `list_network_requests`, a `take_screenshot` image. | Kill the server process and close the page. |
| iOS simulator | `xcrun simctl boot "<device>"`, then `xcrun simctl install booted <app path>`. | `xcrun simctl launch booted <bundle id>`; `xcrun simctl openurl booted <deep link>`. | `xcrun simctl io booted screenshot <file>.png`; app logs from `xcrun simctl spawn booted log show --last 1m`. | `xcrun simctl terminate booted <bundle id>`, then `xcrun simctl shutdown booted`. |
| Android emulator | `emulator -avd <name> -no-window &`, then `adb wait-for-device` and `adb install -r <apk>`. | `adb shell am start -n <package>/<activity>`; `adb shell input tap <x> <y>`; `adb shell input text <text>`. | `adb exec-out screencap -p > <file>.png`; `adb shell uiautomator dump`; `adb logcat -d`. | `adb emu kill`. |
| Desktop app | Launch the built app in the background. For an Electron app, add `--remote-debugging-port=9222`. | Electron: Chrome DevTools Protocol, as for a web app. Native: the accessibility automation of the operating system. | A screenshot, the app log, and the files that the app writes. | Kill the app process. |
| CLI | Build the binary. Make a temporary folder with `mktemp -d`. | Run the command with sample arguments inside the temporary folder. | The exit code, standard output, standard error, and the files that the command writes. | Remove the temporary folder. |
| Service with an API | Start the service with test configuration. Wait on its health URL with `curl --retry`. | Send requests with `curl --silent --show-error --fail-with-body`. | The HTTP status and the body fields, read with `jq`. | Kill the process, or run `docker compose down` for a container stack. |
| Hook or plugin | No start step. | Pipe a sample JSON payload to the hook on standard input. | The exit code and the JSON on standard output. | Remove any state file that the hook writes. |

## Worked example

A project `notes-api` is a Node HTTP service. Its `package.json` defines `npm start`, and it listens on the port in `PORT`. The filled skill after a full run, in which each command showed its expected result, so it holds no `not observed:` mark:

````markdown
---
name: verify
description: "Use when checking a change to notes-api end to end: start the service, create and read a note over HTTP, check the error path, and stop it. Not for unit tests (run npm test), lint, or a release."
metadata:
  updated: "2026-11-17"
---

# Verify notes-api

notes-api is an HTTP service. Client programs create and read notes through its JSON API.

## Prerequisites

| Need | Check command | Expected result |
|---|---|---|
| Node 22 or later | `node --version` | `v22.` or a later major |
| Dependencies | `npm ci` | exit 0 |

## Start

```bash
run=$(mktemp -d)
echo "verify folder: $run"
PORT=4010 DATABASE_URL=sqlite::memory: npm start > "$run/verify.log" 2>&1 &
echo $! > "$run/verify.pid"
curl --silent --fail --retry 30 --retry-delay 1 --retry-connrefused http://127.0.0.1:4010/health
```

The Stop block reads `$run`. If the shell does not keep variables between blocks, set `run` to the printed folder before you stop.

Ready when: the `curl` command prints `{"status":"ok"}` and exits 0.

## Drive and inspect

| Id | Flow | Command or tool action | Expected result |
|---|---|---|---|
| V1 | Create a note | `curl --silent --show-error --fail-with-body -X POST -H 'content-type: application/json' -d '{"text":"hello"}' http://127.0.0.1:4010/notes \| jq -r .id` | A note id, for example `n_1` |
| V2 | Read the note | `curl --silent --show-error --fail-with-body http://127.0.0.1:4010/notes/n_1 \| jq -r .text` | `hello` |
| V3 | Reject an empty note | `curl --silent -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"text":""}' http://127.0.0.1:4010/notes` | `400` |

## Stop and clean up

```bash
kill "$(cat "$run/verify.pid")"
rm -r "$run"
```

Clean when: `curl --silent http://127.0.0.1:4010/health` exits with code 7 (connection refused).

## Failure signs

| Sign | Meaning | Next step |
|---|---|---|
| `curl: (7)` after all retries | The service did not start | Read `$run/verify.log` |
| V3 prints `201` | The input check is missing | Fix the validation, then run V1 to V3 again |
````

## Sources

- Chrome DevTools MCP tool reference: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- iOS Simulator command line (`simctl`): https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device
- Android Debug Bridge: https://developer.android.com/tools/adb
- Android emulator command line: https://developer.android.com/studio/run/emulator-commandline
- curl options (`--retry-connrefused`, `--fail-with-body`): https://curl.se/docs/manpage.html
