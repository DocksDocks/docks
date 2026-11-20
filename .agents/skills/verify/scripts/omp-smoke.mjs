#!/usr/bin/env bun
// Smoke test for the native omp packages of this repository.
// It installs the repository marketplace into isolated omp state in a docks-kit scratch folder, runs the command,
// and removes the folder. It uses a fake local OpenAI-compatible model, so no real model credential is used.
// Commands:
//   (default)  Read what omp loads: plugin versions, skills, task-tool agents, and warnings.
//   hooks      Drive the docks omp extensions (verify-gate and context-tree-nudge) in `omp -p` sessions in a
//              scratch git repository. The fake model plays scripted tool calls. Prints `ok <name>` or
//              `FAIL <name>: <reason>` for each check.
// Usage: bun .agents/skills/verify/scripts/omp-smoke.mjs [hooks] [--repo <path>]

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const MARKETPLACE = "docks";
const PLUGINS = ["docks", "plan-lifecycle"];
const CATALOG_PATH = ".omp-plugin/marketplace.json";
const EXPECTED_SKILLS = 32;
const REQUIRED_AGENTS = ["code-reviewer", "plan-reviewer"];
const COMMAND_TIMEOUT_MS = 120_000;
const MODEL_PROVIDER = "omp-smoke";
const MODEL_ID = "smoke-model";
const SESSION_PROMPT = "Reply with ok.";
const SCRIPTED_PROMPT = "Do the scripted steps.";
const SCRATCH_LABEL = "omp-smoke";
// Registry files of the real omp state; the smoke run must not touch them.
const REAL_REGISTRY_FILES = ["marketplaces.json", "plugins/installed_plugins.json", "plugins/omp-plugins.lock.json"];
// The real user log of the verify-gate. Other omp sessions can add lines to it during a smoke run;
// a new line with a `cwd` inside the smoke scratch folder shows that the smoke run wrote to it.
const REAL_GATE_LOG = join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "docks", "verify-gate.jsonl");
const COMMANDS = ["hooks"];

const { values: args, positionals } = parseArgs({
  options: { repo: { type: "string" }, help: { type: "boolean", short: "h" } },
  allowPositionals: true,
  strict: true,
});
const command = positionals[0] ?? null;
if (args.help || positionals.length > 1 || (command !== null && !COMMANDS.includes(command))) {
  console.log("usage: omp-smoke.mjs [hooks] [--repo <path>]");
  process.exit(args.help ? 0 : 2);
}
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(args.repo ?? join(scriptDir, "../../../.."));

const children = new Set();
let scratch = null;
let server = null;

// Stops children and the fake model, and removes the scratch folder.
// Returns the path of a scratch folder that it could not remove, else null.
function cleanup() {
  for (const child of children) child.kill("SIGKILL");
  children.clear();
  server?.closeAllConnections?.();
  server?.close();
  server = null;
  if (!scratch) return null;
  const path = scratch;
  scratch = null;
  const result = spawnSync("docks-kit", ["scratch", "remove", path], { encoding: "utf8" });
  if (result.status === 0 && !existsSync(path)) return null;
  const detail = (result.stderr || result.error || "").toString().trim();
  if (detail) console.error(detail);
  return path;
}

function reportCleanup() {
  const kept = cleanup();
  if (kept) console.log(`FAIL could not remove scratch folder ${kept}`);
  return kept === null;
}

for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.on(signal, () => {
    reportCleanup();
    process.exit(code);
  });
}

function createScratch() {
  const result = spawnSync("docks-kit", ["scratch", "new", SCRATCH_LABEL], { encoding: "utf8" });
  const path = result.stdout?.trim().split("\n").pop();
  if (result.status !== 0 || !path || !existsSync(path)) {
    throw new Error(`docks-kit scratch new failed: ${result.stderr || result.error}`);
  }
  return path;
}

// Environment for omp: only the allowed parent variables, so no omp session variable, no docks variable,
// and no credential reaches omp, plus the isolated config root and an isolated state folder, so the
// docks extensions write no line into the user log.
const ENV_ALLOWLIST = ["PATH", "HOME", "USER", "LANG", "TERM", "TMPDIR"];
function isolatedEnv(configDir, stateHome) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && (ENV_ALLOWLIST.includes(key) || key.startsWith("LC_"))) env[key] = value;
  }
  env.PI_CONFIG_DIR = configDir;
  env.XDG_STATE_HOME = stateHome;
  return env;
}

function runOmp(argv, { cwd, env }) {
  return new Promise((done) => {
    const child = spawn("omp", argv, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, COMMAND_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      stderr += String(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      children.delete(child);
      done({ argv, code: timedOut ? "timeout" : code, stdout, stderr });
    });
  });
}

function sseChunk(model, choice, extra = {}) {
  return `data: ${JSON.stringify({ id: "omp-smoke", object: "chat.completion.chunk", created: 0, model, choices: [choice], ...extra })}\n\n`;
}

// The tool calls of the scripted turn for one request, or null for a plain "ok" answer.
// `script.turns[n]` answers a request that holds n assistant messages. A turn is a list of
// { id, name, arguments } or a function of the request that returns such a list.
function scriptedCalls(script, request) {
  const index = (request.messages ?? []).filter((message) => message.role === "assistant").length;
  const turn = script.turns[index];
  const calls = typeof turn === "function" ? turn(request) : turn;
  return calls?.length ? calls : null;
}

// Fake OpenAI-compatible model: records each request body and answers with the scripted tool calls,
// else with "ok" and a stop.
function startFakeModel(requests, script) {
  const fake = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
        res.writeHead(404).end();
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400).end();
        return;
      }
      requests.push(parsed);
      const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
      if (parsed.stream) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const calls = scriptedCalls(script, parsed);
        if (calls) {
          const toolCalls = calls.map((call, index) => ({
            index,
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
          }));
          res.write(sseChunk(parsed.model, { index: 0, delta: { role: "assistant", tool_calls: toolCalls }, finish_reason: null }));
          res.write(sseChunk(parsed.model, { index: 0, delta: {}, finish_reason: "tool_calls" }, { usage }));
        } else {
          res.write(sseChunk(parsed.model, { index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null }));
          res.write(sseChunk(parsed.model, { index: 0, delta: {}, finish_reason: "stop" }, { usage }));
        }
        res.end("data: [DONE]\n\n");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "omp-smoke",
          object: "chat.completion",
          created: 0,
          model: parsed.model,
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage,
        }),
      );
    });
  });
  return new Promise((ready, fail) => {
    fake.once("error", fail);
    fake.listen(0, "127.0.0.1", () => ready(fake));
  });
}

function modelsYaml(port) {
  return [
    "providers:",
    `  ${MODEL_PROVIDER}:`,
    `    baseUrl: http://127.0.0.1:${port}/v1`,
    "    api: openai-completions",
    "    auth: none",
    "    models:",
    `      - id: ${MODEL_ID}`,
    "        name: omp smoke fake model",
    "        reasoning: false",
    "        input: [text]",
    "        contextWindow: 128000",
    "        maxTokens: 4096",
    "        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }",
    "",
  ].join("\n");
}

function readCatalog(failures) {
  const path = join(repo, CATALOG_PATH);
  if (!existsSync(path)) {
    failures.push(`catalog ${CATALOG_PATH} not found in ${repo}`);
    return null;
  }
  try {
    const catalog = JSON.parse(readFileSync(path, "utf8"));
    return new Map((catalog.plugins ?? []).map((entry) => [entry.name, entry.version]));
  } catch (error) {
    failures.push(`catalog ${CATALOG_PATH} does not parse: ${error.message}`);
    return null;
  }
}

// A snapshot of the real state: the modification times of the real omp registry files, and the size of the
// real verify-gate log, so that the check reads only the lines that come after it.
function realStateSnapshot() {
  const root = join(homedir(), process.env.PI_CONFIG_DIR || ".omp");
  const registry = new Map(REAL_REGISTRY_FILES.map((file) => join(root, file)).map((file) => [file, existsSync(file) ? statSync(file).mtimeMs : null]));
  return { registry, gateLogSize: existsSync(REAL_GATE_LOG) ? statSync(REAL_GATE_LOG).size : 0 };
}

// The lines added to the real verify-gate log after a size. If the file is now shorter, a different file
// replaced it, and all its lines count as new.
function newGateLogLines(size) {
  if (!existsSync(REAL_GATE_LOG)) return [];
  const bytes = readFileSync(REAL_GATE_LOG);
  return (bytes.length >= size ? bytes.subarray(size) : bytes).toString("utf8").split("\n").filter(Boolean);
}

function realStateChanges(before) {
  const changes = [];
  for (const [file, mtime] of before.registry) {
    const after = existsSync(file) ? statSync(file).mtimeMs : null;
    if (after !== mtime) changes.push(`real state changed: ${file}`);
  }
  if (!scratch) return changes;
  const roots = [...new Set([scratch, realpathSync(scratch)])];
  const inScratch = (cwd) => typeof cwd === "string" && roots.some((root) => cwd === root || cwd.startsWith(root + sep));
  const smokeLines = newGateLogLines(before.gateLogSize).filter((line) => {
    try {
      return inScratch(JSON.parse(line).cwd);
    } catch {
      return false;
    }
  });
  if (smokeLines.length) changes.push(`real state changed: ${REAL_GATE_LOG} has ${smokeLines.length} new line(s) with a cwd in the scratch folder`);
  return changes;
}

function parseJson(text, label, failures) {
  try {
    return JSON.parse(text);
  } catch {
    failures.push(`${label} did not print JSON`);
    return null;
  }
}

function frontmatterName(file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, "utf8"));
  const name = match && /^name:\s*(.+?)\s*$/m.exec(match[1]);
  return name ? name[1].replace(/^["']|["']$/g, "") : null;
}

function pluginAgentNames(installPaths) {
  const names = new Set();
  for (const root of installPaths) {
    const agentsDir = join(root, "agents");
    if (!existsSync(agentsDir)) continue;
    for (const file of readdirSync(agentsDir)) {
      if (!file.endsWith(".md")) continue;
      const name = frontmatterName(join(agentsDir, file));
      if (name) names.add(name);
    }
  }
  return names;
}

// Agent names in the "Available Agents" list of the task tool that the model receives.
function taskToolAgents(requests) {
  for (const request of requests) {
    const task = (request.tools ?? []).find((tool) => (tool.function?.name ?? tool.name) === "task");
    const description = task?.function?.description ?? task?.description;
    if (description) return [...description.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);
  }
  return null;
}

function stateLogLines(stateDir) {
  const logsDir = join(stateDir, "logs");
  if (!existsSync(logsDir)) return [];
  return readdirSync(logsDir)
    .filter((file) => file.endsWith(".log"))
    .flatMap((file) => readFileSync(join(logsDir, file), "utf8").split("\n"));
}

// Text that marks an omp message as one about the two plugins: their install paths, the package links that
// omp loads the extensions from (`<state>/plugins/node_modules/<plugin>/`), the repository, the marketplace
// cache, and the plugin ids.
function pluginMarkers(stateDir, installPaths) {
  return [
    ...installPaths,
    ...PLUGINS.map((plugin) => join(stateDir, "plugins", "node_modules", plugin) + sep),
    repo,
    join(stateDir, "plugins", "cache", "marketplaces"),
    ...PLUGINS.map((plugin) => `${plugin}@${MARKETPLACE}`),
  ];
}

// omp warnings about the two plugins: skill list warnings, warning lines on stderr, and warn/error log records.
// A "Failed to load extension" record is an error record, so an extension that throws at load counts.
function countWarnings({ skillWarnings, results, stateDir, markers }) {
  const mentions = (text) => markers.some((marker) => text.includes(marker));
  const warnings = new Set();
  for (const warning of skillWarnings) {
    const text = typeof warning === "string" ? warning : JSON.stringify(warning);
    if (mentions(text)) warnings.add(text);
  }
  for (const result of results) {
    for (const line of result.stderr.split("\n")) {
      if (/warn|error|fail/i.test(line) && mentions(line)) warnings.add(line.trim());
    }
  }
  for (const line of stateLogLines(stateDir)) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!["warn", "warning", "error"].includes(record.level)) continue;
    const { timestamp: _timestamp, pid: _pid, ...rest } = record;
    const text = JSON.stringify(rest);
    if (mentions(text)) warnings.add(text);
  }
  return [...warnings];
}

// Creates the scratch folder with isolated omp state, starts the fake model, adds this checkout as the
// marketplace, installs both plugins, and lists them. Each omp command that exits non-zero adds a failure.
async function install(failures) {
  scratch = createScratch();
  const stateDir = join(scratch, "omp");
  const workDir = join(scratch, "work");
  mkdirSync(join(stateDir, "agent"), { recursive: true });
  mkdirSync(workDir, { recursive: true });
  // omp joins PI_CONFIG_DIR to the home folder, so it must be a path relative to home.
  const configDir = relative(homedir(), stateDir);
  if (!configDir || configDir.startsWith("..") || isAbsolute(configDir)) {
    throw new Error(`scratch folder ${scratch} is not inside the home folder`);
  }
  const env = isolatedEnv(configDir, join(scratch, "state"));

  const requests = [];
  const script = { turns: [] };
  server = await startFakeModel(requests, script);
  writeFileSync(join(stateDir, "agent", "models.yml"), modelsYaml(server.address().port));

  const results = [];
  const omp = async (argv, options = {}) => {
    const result = await runOmp(argv, { cwd: options.cwd ?? workDir, env: options.env ?? env });
    results.push(result);
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout).trim().split("\n")[0] ?? "";
      failures.push(`omp ${argv.join(" ")} exited ${result.code}${detail ? `: ${detail}` : ""}`);
    }
    return result;
  };

  await omp(["plugin", "marketplace", "add", repo]);
  for (const plugin of PLUGINS) await omp(["plugin", "install", `${plugin}@${MARKETPLACE}`]);
  const pluginList = parseJson((await omp(["plugin", "list", "--json"])).stdout, "omp plugin list --json", failures);
  const installPaths = [];
  const versions = new Map();
  for (const plugin of PLUGINS) {
    const entry = (pluginList?.marketplace ?? []).find((item) => item.id === `${plugin}@${MARKETPLACE}`)?.entries?.[0];
    if (entry?.installPath) installPaths.push(entry.installPath);
    versions.set(plugin, entry?.version ?? "missing");
  }
  return { stateDir, env, requests, script, results, omp, installPaths, versions };
}

async function smoke() {
  const failures = [];
  if (!existsSync(repo)) {
    failures.push(`repository ${repo} does not exist`);
    return { lines: [], failures };
  }
  const catalog = readCatalog(failures);
  const realBefore = realStateSnapshot();
  const run = await install(failures);
  const skillList = parseJson((await run.omp(["skill", "list", "--json"])).stdout, "omp skill list --json", failures);
  await run.omp(["-p", "--mode", "json", "--model", `${MODEL_PROVIDER}/${MODEL_ID}`, "--no-title", "--no-session", SESSION_PROMPT]);

  const lines = [];
  for (const [plugin, version] of run.versions) {
    const id = `${plugin}@${MARKETPLACE}`;
    lines.push(`${id} ${version}`);
    const expected = catalog?.get(plugin);
    if (catalog && version !== expected) failures.push(`${id} version ${version} does not equal catalog version ${expected ?? "missing"}`);
  }

  const skills = (skillList?.skills ?? []).filter((skill) => run.installPaths.some((root) => skill.filePath?.startsWith(root + sep)));
  lines.push(`skills: ${skills.length}`);
  if (skills.length !== EXPECTED_SKILLS) failures.push(`skills: ${skills.length}, expected ${EXPECTED_SKILLS}`);

  const offered = taskToolAgents(run.requests);
  const ownAgents = pluginAgentNames(run.installPaths);
  const agents = (offered ?? []).filter((name) => ownAgents.has(name)).sort();
  lines.push(`agents: ${agents.join(",")}`);
  if (run.requests.length === 0) failures.push("the fake model received no request from the omp session");
  else if (!offered) failures.push("the model request has no task tool with an agent list");
  const missingAgents = REQUIRED_AGENTS.filter((name) => !agents.includes(name));
  if (missingAgents.length) failures.push(`agents missing from the task tool: ${missingAgents.join(",")}`);

  const markers = pluginMarkers(run.stateDir, run.installPaths);
  const warnings = countWarnings({ skillWarnings: skillList?.warnings ?? [], results: run.results, stateDir: run.stateDir, markers });
  lines.push(`warnings: ${warnings.length}`);
  if (warnings.length > 0) failures.push(`omp reported ${warnings.length} warning(s) about the plugins: ${warnings.join(" | ")}`);

  failures.push(...realStateChanges(realBefore));
  return { lines, failures };
}

// ---------- hooks ----------

const GATE_REASON = "no Verified: trailer";
const NUDGE_TEXT = "Edited files inside context-tree node(s): scripts";
const NUDGE_PREFIX = "Edited files inside context-tree node(s)";
const BARE_COMMIT = "git commit -m 'docs: fix typo'";
const BARE_SUBJECT = "docs: fix typo";
const TRAILER_COMMIT = "git commit --allow-empty -m 'x' -m 'Verified: none - probe'";
const TRAILER = "Verified: none - probe";
// The log keeps metadata only; none of these texts of the commands may appear in it.
const SECRET_TEXTS = ["git commit", "fix typo", "Verified", "probe"];
const LOG_FIELDS = ["cwd", "message_sources", "mode", "session_id", "time"];

// The files of the scratch git repository: a root README.md and a nested `scripts` context-tree node.
const FIXTURE_FILES = {
  "AGENTS.md": "# Rules\n",
  "README.md": "# Smoke repository\n",
  "notes.txt": "notes\n",
  "scripts/AGENTS.md": "# scripts\n",
  "scripts/ci.mjs": "export const ok = true;\n",
};

function bash(id, commandText) {
  return [{ id, name: "bash", arguments: { command: commandText } }];
}

function textOf(content) {
  if (typeof content === "string") return content;
  return (content ?? []).map((part) => (typeof part === "string" ? part : (part.text ?? ""))).join("");
}

// The snapshot tag of `path` in the result of the read call `readId`, as the model sees it in the request.
function snapshotTag(request, readId, path) {
  const result = (request.messages ?? []).find((message) => message.role === "tool" && message.tool_call_id === readId);
  const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`\\[${escaped}#([0-9A-Za-z]+)\\]`).exec(textOf(result?.content))?.[1] ?? "none";
}

function hashlineEdit(id, path, tag, line) {
  return [{ id, name: "edit", arguments: { input: `[${path}#${tag}]\nPUT 1.=1:\n+${line}\n` } }];
}

// The messages of an `omp --mode json` event stream, in order.
function streamMessages(stdout) {
  const messages = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "message_end" && event.message) messages.push(event.message);
    } catch {
      // A line that is not JSON is no event.
    }
  }
  return messages;
}

// The result of the tool call `id`, and the texts of the added-context messages that follow it before the next
// assistant message.
function callOutcome(messages, id) {
  const index = messages.findIndex((message) => message.role === "toolResult" && message.toolCallId === id);
  if (index === -1) return null;
  const result = messages[index];
  const context = [];
  for (const message of messages.slice(index + 1)) {
    if (message.role === "assistant") break;
    if (message.role === "developer") context.push(textOf(message.content));
  }
  return { isError: Boolean(result.isError), text: textOf(result.content), context };
}

function short(text) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 160 ? `${line.slice(0, 160)}...` : line;
}

function gitIn(cwd, env, gitArgs) {
  const result = spawnSync("git", gitArgs, { cwd, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${gitArgs.join(" ")} failed: ${(result.stderr || result.error || "").toString().trim()}`);
  return result.stdout;
}

function logLines(file) {
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter((line) => line.trim()) : [];
}

async function hooks() {
  const checks = [];
  const check = (name, problem) => checks.push(problem ? `FAIL ${name}: ${problem}` : `ok ${name}`);
  if (!existsSync(repo)) {
    check("install", `repository ${repo} does not exist`);
    return checks;
  }
  const realBefore = realStateSnapshot();
  const installFailures = [];
  const run = await install(installFailures);
  check("install", installFailures.join("; "));

  // A scratch git repository with its own git config, so no global git setting (signing, hooks) applies.
  const repoDir = join(scratch, "repo");
  const gitConfig = join(scratch, "gitconfig");
  writeFileSync(gitConfig, "[user]\n\tname = omp smoke\n\temail = omp-smoke@example.invalid\n[commit]\n\tgpgsign = false\n");
  const gitEnv = { ...run.env, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: "1" };
  for (const [file, text] of Object.entries(FIXTURE_FILES)) {
    mkdirSync(dirname(join(repoDir, file)), { recursive: true });
    writeFileSync(join(repoDir, file), text);
  }
  const git = (...gitArgs) => gitIn(repoDir, gitEnv, gitArgs);
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "chore: start", "-m", "Verified: none - smoke fixture");
  let change = 0;
  const stageChange = () => {
    change += 1;
    writeFileSync(join(repoDir, "notes.txt"), `notes ${change}\n`);
    git("add", "notes.txt");
  };
  const bareCommits = () => git("log", "--format=%s").split("\n").filter((subject) => subject === BARE_SUBJECT).length;

  const sessionFailures = [];
  const session = async (name, { turns, mode, extraArgv = [] }) => {
    const env = { ...gitEnv, XDG_STATE_HOME: join(scratch, "state", name) };
    if (mode) env.DOCKS_VERIFY_GATE = mode;
    run.script.turns = turns;
    const result = await run.omp(
      ["-p", "--mode", "json", "--model", `${MODEL_PROVIDER}/${MODEL_ID}`, "--no-title", ...extraArgv, SCRIPTED_PROMPT],
      { cwd: repoDir, env },
    );
    run.script.turns = [];
    if (result.code !== 0) sessionFailures.push(`${name} session exited ${result.code}: ${short(result.stderr || result.stdout)}`);
    return { messages: streamMessages(result.stdout), log: join(env.XDG_STATE_HOME, "docks", "verify-gate.jsonl") };
  };

  // Gate, enforce: two bare commits are blocked, the third runs, and a commit with the trailer runs.
  stageChange();
  const bareBefore = bareCommits();
  const enforce = await session("enforce", {
    mode: "enforce",
    turns: [bash("enforce-1", BARE_COMMIT), bash("enforce-2", BARE_COMMIT), bash("enforce-3", BARE_COMMIT), bash("enforce-trailer", TRAILER_COMMIT)],
  });
  for (const id of ["enforce-1", "enforce-2"]) {
    const outcome = callOutcome(enforce.messages, id);
    if (!outcome) check(`gate-${id}-blocked`, "no tool result in the event stream");
    else if (!outcome.isError || !outcome.text.includes(GATE_REASON)) check(`gate-${id}-blocked`, `not blocked with the Verified: reason: ${short(outcome.text)}`);
    else check(`gate-${id}-blocked`, null);
  }
  const third = callOutcome(enforce.messages, "enforce-3");
  const bareAfterEnforce = bareCommits();
  if (!third) check("gate-enforce-3-allowed", "no tool result in the event stream");
  else if (third.isError || third.text.includes(GATE_REASON)) check("gate-enforce-3-allowed", `the call failed: ${short(third.text)}`);
  else if (bareAfterEnforce !== bareBefore + 1) check("gate-enforce-3-allowed", `git log holds ${bareAfterEnforce - bareBefore} new '${BARE_SUBJECT}' commit(s), expected 1`);
  else check("gate-enforce-3-allowed", null);
  const trailer = callOutcome(enforce.messages, "enforce-trailer");
  if (!trailer) check("gate-enforce-trailer-allowed", "no tool result in the event stream");
  else if (trailer.isError || trailer.text.includes(GATE_REASON)) check("gate-enforce-trailer-allowed", `the call failed: ${short(trailer.text)}`);
  else if (!git("log", "-1", "--format=%B").includes(TRAILER)) check("gate-enforce-trailer-allowed", `the last commit has no '${TRAILER}' trailer`);
  else check("gate-enforce-trailer-allowed", null);

  // Gate, observe (DOCKS_VERIFY_GATE unset): the bare commit runs and the log gets one metadata line.
  stageChange();
  const observe = await session("observe", { turns: [bash("observe-1", BARE_COMMIT)] });
  const observed = callOutcome(observe.messages, "observe-1");
  const bareAfterObserve = bareCommits();
  if (!observed) check("gate-observe-commit-runs", "no tool result in the event stream");
  else if (observed.isError) check("gate-observe-commit-runs", `the call failed: ${short(observed.text)}`);
  else if (bareAfterObserve !== bareAfterEnforce + 1) check("gate-observe-commit-runs", "git log holds no new commit");
  else check("gate-observe-commit-runs", null);
  const observeLines = logLines(observe.log);
  let observeRecord = null;
  try {
    observeRecord = observeLines.length === 1 ? JSON.parse(observeLines[0]) : null;
  } catch {
    observeRecord = null;
  }
  const observeFields = observeRecord ? Object.keys(observeRecord).sort().join(",") : "";
  if (observeLines.length !== 1) check("gate-observe-log", `the log holds ${observeLines.length} line(s), expected 1`);
  else if (observeFields !== LOG_FIELDS.join(",")) check("gate-observe-log", `the line has the fields ${observeFields || "(not JSON)"}, expected ${LOG_FIELDS.join(",")}`);
  else if (observeRecord.mode !== "observe" || JSON.stringify(observeRecord.message_sources) !== '["-m"]') check("gate-observe-log", `unexpected line ${observeLines[0]}`);
  else check("gate-observe-log", null);

  // Gate, off: the bare commit runs and the log gets no line.
  stageChange();
  const off = await session("off", { mode: "off", turns: [bash("off-1", BARE_COMMIT)] });
  const offOutcome = callOutcome(off.messages, "off-1");
  if (!offOutcome) check("gate-off-commit-runs", "no tool result in the event stream");
  else if (offOutcome.isError) check("gate-off-commit-runs", `the call failed: ${short(offOutcome.text)}`);
  else if (bareCommits() !== bareAfterObserve + 1) check("gate-off-commit-runs", "git log holds no new commit");
  else check("gate-off-commit-runs", null);
  const offLines = logLines(off.log);
  check("gate-off-no-log", offLines.length ? `the log holds ${offLines.length} line(s), expected none` : null);

  const allLines = [enforce.log, observe.log, off.log].flatMap(logLines);
  const leaks = allLines.filter((line) => SECRET_TEXTS.some((text) => line.includes(text)));
  if (allLines.length === 0) check("gate-log-no-text", "no log line to check");
  else check("gate-log-no-text", leaks.length ? `a log line holds command or message text: ${leaks[0]}` : null);

  // Nudge: an edit in the `scripts` node adds a context message; an edit of the root README.md, a failed edit,
  // and a write to a URL add none. The session folder lies inside the `scripts` node, so a `local://` write
  // resolves to a file inside the node, and only the URL rule keeps the nudge away.
  const nudge = await session("nudge", {
    extraArgv: ["--session-dir", join(repoDir, "scripts", ".sessions")],
    turns: [
      [{ id: "nudge-read-node", name: "read", arguments: { path: "scripts/ci.mjs" } }],
      (request) => hashlineEdit("nudge-node", "scripts/ci.mjs", snapshotTag(request, "nudge-read-node", "scripts/ci.mjs"), "export const ok = false;"),
      [{ id: "nudge-read-root", name: "read", arguments: { path: "README.md" } }],
      (request) => hashlineEdit("nudge-root", "README.md", snapshotTag(request, "nudge-read-root", "README.md"), "# Smoke repository (edited)"),
      // The tag of the first read is stale after the first edit, so this edit fails.
      (request) => hashlineEdit("nudge-failed", "scripts/ci.mjs", snapshotTag(request, "nudge-read-node", "scripts/ci.mjs"), "export const ok = 0;"),
      [{ id: "nudge-url", name: "write", arguments: { path: "local://notes.md", content: "notes\n" } }],
    ],
  });
  const node = callOutcome(nudge.messages, "nudge-node");
  if (!node) check("nudge-node-edit", "no tool result in the event stream");
  else if (node.isError) check("nudge-node-edit", `the edit failed: ${short(node.text)}`);
  else if (node.context.some((text) => text.includes(NUDGE_TEXT)) && !node.text.includes(NUDGE_PREFIX)) check("nudge-node-edit", null);
  else check("nudge-node-edit", `no separate added-context message with '${NUDGE_TEXT}' after the tool result`);
  const quiet = (name, id, { expectError }) => {
    const outcome = callOutcome(nudge.messages, id);
    if (!outcome) return check(name, "no tool result in the event stream");
    if (outcome.isError !== expectError) return check(name, `the call ${expectError ? "did not fail" : "failed"}: ${short(outcome.text)}`);
    const nudged = outcome.context.find((text) => text.includes(NUDGE_PREFIX));
    return check(name, nudged ? `an added-context message follows: ${short(nudged)}` : null);
  };
  quiet("nudge-root-edit-none", "nudge-root", { expectError: false });
  quiet("nudge-failed-edit-none", "nudge-failed", { expectError: true });
  quiet("nudge-url-write-none", "nudge-url", { expectError: false });

  const warnings = countWarnings({ skillWarnings: [], results: run.results, stateDir: run.stateDir, markers: pluginMarkers(run.stateDir, run.installPaths) });
  check("extensions-loaded", warnings.length ? `omp reported ${warnings.length} warning(s) about the plugins: ${warnings.join(" | ")}` : null);
  check("sessions", sessionFailures.join("; "));
  check("real-state", realStateChanges(realBefore).join("; "));
  return checks;
}

let exitCode = 1;
try {
  if (command === "hooks") {
    const checks = await hooks();
    for (const line of checks) console.log(line);
    exitCode = checks.some((line) => line.startsWith("FAIL")) ? 1 : 0;
  } else {
    const { lines, failures } = await smoke();
    for (const line of lines) console.log(line);
    for (const failure of failures) console.log(`FAIL ${failure}`);
    exitCode = failures.length ? 1 : 0;
  }
} catch (error) {
  console.log(`FAIL ${error.message}`);
} finally {
  if (!reportCleanup()) exitCode = 1;
}
process.exit(exitCode);
