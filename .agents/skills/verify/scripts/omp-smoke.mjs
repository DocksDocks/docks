#!/usr/bin/env bun
// Smoke test for the native omp packages of this repository.
// It installs the repository marketplace into isolated omp state in a docks-kit scratch folder,
// reads what omp loads (plugin versions, skills, task-tool agents, warnings), and removes the folder.
// It uses a fake local OpenAI-compatible model, so no real model credential is used.
// Usage: bun .agents/skills/verify/scripts/omp-smoke.mjs [--repo <path>]

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const MARKETPLACE = "docks";
const PLUGINS = ["docks", "plan-lifecycle"];
const CATALOG_PATH = ".omp-plugin/marketplace.json";
const EXPECTED_SKILLS = 33;
const REQUIRED_AGENTS = ["code-reviewer", "plan-reviewer"];
const COMMAND_TIMEOUT_MS = 120_000;
const MODEL_PROVIDER = "omp-smoke";
const MODEL_ID = "smoke-model";
const SESSION_PROMPT = "Reply with ok.";
const SCRATCH_LABEL = "omp-smoke";
// Registry files of the real omp state; the smoke run must not touch them.
const REAL_REGISTRY_FILES = ["marketplaces.json", "plugins/installed_plugins.json", "plugins/omp-plugins.lock.json"];

const { values: args } = parseArgs({
  options: { repo: { type: "string" }, help: { type: "boolean", short: "h" } },
  strict: true,
});
if (args.help) {
  console.log("usage: omp-smoke.mjs [--repo <path>]");
  process.exit(0);
}
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(args.repo ?? join(scriptDir, "../../../.."));

const children = new Set();
let scratch = null;
let server = null;

function cleanup() {
  for (const child of children) child.kill("SIGKILL");
  children.clear();
  server?.closeAllConnections?.();
  server?.close();
  server = null;
  if (scratch) {
    const result = spawnSync("docks-kit", ["scratch", "remove", scratch], { encoding: "utf8" });
    if (result.status !== 0) console.error(`could not remove scratch folder ${scratch}: ${result.stderr || result.error}`);
    scratch = null;
  }
}

for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.on(signal, () => {
    cleanup();
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

// Environment for omp: no parent omp session variables, no model credentials, isolated config root.
function isolatedEnv(configDir) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(PI_|OMP_)/.test(key) || /(API_KEY|TOKEN|SECRET)/.test(key) || /^XDG_(DATA|STATE|CACHE|CONFIG)_HOME$/.test(key)) {
      delete env[key];
    }
  }
  env.PI_CONFIG_DIR = configDir;
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

// Fake OpenAI-compatible model: records each request body and answers "ok" with a stop.
function startFakeModel(requests) {
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
        res.write(sseChunk(parsed.model, { index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null }));
        res.write(sseChunk(parsed.model, { index: 0, delta: {}, finish_reason: "stop" }, { usage }));
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

function registryMtimes() {
  const root = join(homedir(), process.env.PI_CONFIG_DIR || ".omp");
  return new Map(REAL_REGISTRY_FILES.map((file) => [join(root, file), existsSync(join(root, file)) ? statSync(join(root, file)).mtimeMs : null]));
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

// omp warnings about the two plugins: skill list warnings, warning lines on stderr, and warn/error log records.
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
  return warnings.size;
}

async function smoke() {
  const failures = [];
  if (!existsSync(repo)) {
    failures.push(`repository ${repo} does not exist`);
    return { lines: [], failures };
  }
  const catalog = readCatalog(failures);
  const realBefore = registryMtimes();

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
  const options = { cwd: workDir, env: isolatedEnv(configDir) };

  const requests = [];
  server = await startFakeModel(requests);
  writeFileSync(join(stateDir, "agent", "models.yml"), modelsYaml(server.address().port));

  const results = [];
  const omp = async (argv) => {
    const result = await runOmp(argv, options);
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
  const skillList = parseJson((await omp(["skill", "list", "--json"])).stdout, "omp skill list --json", failures);
  await omp(["-p", "--mode", "json", "--model", `${MODEL_PROVIDER}/${MODEL_ID}`, "--no-title", "--no-session", SESSION_PROMPT]);

  const lines = [];
  const installPaths = [];
  for (const plugin of PLUGINS) {
    const id = `${plugin}@${MARKETPLACE}`;
    const entry = (pluginList?.marketplace ?? []).find((item) => item.id === id)?.entries?.[0];
    if (entry?.installPath) installPaths.push(entry.installPath);
    const version = entry?.version ?? "missing";
    lines.push(`${id} ${version}`);
    const expected = catalog?.get(plugin);
    if (catalog && version !== expected) failures.push(`${id} version ${version} does not equal catalog version ${expected ?? "missing"}`);
  }

  const skills = (skillList?.skills ?? []).filter((skill) => installPaths.some((root) => skill.filePath?.startsWith(root + sep)));
  lines.push(`skills: ${skills.length}`);
  if (skills.length !== EXPECTED_SKILLS) failures.push(`skills: ${skills.length}, expected ${EXPECTED_SKILLS}`);

  const offered = taskToolAgents(requests);
  const ownAgents = pluginAgentNames(installPaths);
  const agents = (offered ?? []).filter((name) => ownAgents.has(name)).sort();
  lines.push(`agents: ${agents.join(",")}`);
  if (requests.length === 0) failures.push("the fake model received no request from the omp session");
  else if (!offered) failures.push("the model request has no task tool with an agent list");
  const missingAgents = REQUIRED_AGENTS.filter((name) => !agents.includes(name));
  if (missingAgents.length) failures.push(`agents missing from the task tool: ${missingAgents.join(",")}`);

  const markers = [...installPaths, repo, join(stateDir, "plugins", "cache", "marketplaces"), ...PLUGINS.map((plugin) => `${plugin}@${MARKETPLACE}`)];
  lines.push(`warnings: ${countWarnings({ skillWarnings: skillList?.warnings ?? [], results, stateDir, markers })}`);

  for (const [file, before] of realBefore) {
    const after = existsSync(file) ? statSync(file).mtimeMs : null;
    if (after !== before) failures.push(`real omp state changed: ${file}`);
  }
  return { lines, failures };
}

let exitCode = 1;
try {
  const { lines, failures } = await smoke();
  for (const line of lines) console.log(line);
  for (const failure of failures) console.log(`FAIL ${failure}`);
  exitCode = failures.length ? 1 : 0;
} catch (error) {
  console.log(`FAIL ${error.message}`);
} finally {
  cleanup();
}
process.exit(exitCode);
