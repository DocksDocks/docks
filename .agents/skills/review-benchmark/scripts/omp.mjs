// omp.mjs holds every fact of omp (Oh My Pi) that the benchmark scripts rely on: the project files and settings, the
// agent frontmatter, the efforts, the service tiers, the tool names, the URI schemes, the installed-skill paths, the
// reply rule, the dispatch cap, and the transcript records. The facts are true for the omp releases from the floor to
// the `verified` pin of SoT/toolchain.json. When an omp release changes one of them, change it here: prepare.mjs and
// score.mjs import each fact from this module, and the preflight of `prepare.mjs agents` and the shape check of
// `score.mjs transcripts` stop on a change that they can see.

// The omp command. The scripts find it on PATH, so a test can put a fake `omp` first.
export const OMP_COMMAND = 'omp';
// `omp --version` prints `omp/<version>`.
export const OMP_VERSION_OUTPUT = /^omp\/(\d+\.\d+\.\d+[^\s]*)\s*$/;

// omp loads the project agents from this folder of the working folder of the session. A project agent wins over a
// user, plugin, or bundled agent with the same name.
export const AGENT_DIR = '.omp/agents';
// The canonical project config file. omp merges it over the legacy project file LEGACY_PROJECT_SETTINGS.
export const PROJECT_CONFIG = '.omp/config.yml';
// The legacy project settings file ("Project legacy" in the omp settings docs). The scripts only remove their old
// entries from it.
export const LEGACY_PROJECT_SETTINGS = '.omp/settings.json';
// The settings that the scripts write or check, as `omp config get <key>` names them.
export const SETTINGS = {
  // A map from an agent name to a service tier. An entry overrides `tier.subagent` for that agent.
  tierOverrides: 'task.agentServiceTierOverrides',
  // When true, the `effort` of a task replaces the `thinking-level` of the agent, so the pinned effort would not hold.
  enableEffort: 'task.enableEffort',
  // When false, a task agent without an output schema has no `yield` tool and replies with its last message.
  structured: 'task.structured',
};
// The path of SETTINGS.tierOverrides in a settings object.
export const TIER_OVERRIDES_PATH = SETTINGS.tierOverrides.split('.');

// The frontmatter key and the levels of omp that pin the effort of an agent.
export const EFFORT_KEY = 'thinking-level';
export const EFFORT_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
// An omp model selector can carry an effort suffix. The benchmark takes the effort from its own options only.
export const EFFORT_SUFFIX = /:(off|minimal|low|medium|high|xhigh|max|auto|inherit)$/;
// The frontmatter keys that set the model or the effort of an agent. A copied agent loses all of them.
export const MODEL_KEYS = ['model', 'thinking-level', 'thinking', 'effort'];
// The frontmatter key that loads a skill when the agent starts. omp resolves it to the installed skill.
export const AUTOLOAD_KEY = 'autoload-skills';

// The service tiers per provider family (`tier.<family>`). omp applies an agent tier override only when the family of
// the resolved model supports the value. A model selector names its provider before the first `/`, and the provider
// gives the family. A model of a provider outside these families takes no tier.
export const TIER_FAMILIES = {
  openai: { provider: /^openai/, tiers: ['none', 'auto', 'default', 'flex', 'scale', 'priority', 'ultrafast'] },
  anthropic: { provider: /^anthropic/, tiers: ['none', 'priority'] },
  google: { provider: /^google/, tiers: ['none', 'flex', 'priority'] },
};
// Every tier of a family, in the order of the families.
export const SERVICE_TIERS = [...new Set(Object.values(TIER_FAMILIES).flatMap((family) => family.tiers))];

// The tier family of a model selector, or null when its provider is in no family.
export function tierFamily(model) {
  const provider = model.split('/')[0];
  return Object.keys(TIER_FAMILIES).find((family) => TIER_FAMILIES[family].provider.test(provider)) ?? null;
}

// The tools of the generated agents, as lower-case omp tool names.
export const HELPER_TOOLS = ['read', 'glob', 'grep', 'write', 'bash'];
export const SELF_REVIEW_TOOLS = ['read', 'glob', 'grep'];
// The tools whose calls the read scope checks.
export const READ_TOOL = 'read';
export const WEB_SEARCH_TOOL = 'web_search';
// These tools search the working directory when a call names no path (omp://tools/<tool>.md).
export const SEARCH_TOOLS = new Set(['grep', 'glob', 'find', 'ast_grep']);
// The `path` of these tools takes a `;`-separated list of paths.
export const PATH_LIST_TOOLS = new Set(['grep', 'glob', 'ast_grep']);

// The reply rule: a task agent replies with the text of its last assistant message. An agent that has the tool
// REPLY_TOOL (an agent with an output schema, or `task.structured: true`) replies with the arguments of its last call
// of that tool instead.
export const REPLY_TOOL = 'yield';

// The internal URI schemes of the own output of an agent: `artifact://<id>` and the spill files `local://<N>.log`.
// A read of them shows no repository file.
export const SPILL_SCHEMES = new Set(['artifact', 'local']);
// `skill://<skill>[/<path>]` resolves to the installed copy of a skill.
export const SKILL_SCHEME = 'skill';
// The folders of the installed copy of a plugin skill, as regular expression sources that end at `skills/`: the old
// plugin cache `<omp home>/plugins/cache/plugins/<plugin dir>/skills/` and the package folder
// `<omp home>/plugins/node_modules/<package>/skills/` of omp 19 (for example `docks-kit-omp`).
export const INSTALLED_SKILL_ROOTS = [
  String.raw`/plugins/cache/plugins/[^/]+/skills/`,
  String.raw`/plugins/node_modules/(?:@[^/]+/)?[^/]+/skills/`,
];

// The most reviewer agents to dispatch at a time. From 9 concurrent agents on, omp moves runs to worker threads, so a
// cap of 8 runs every arm the same way.
export const DISPATCH_CAP = 8;

// A transcript file of a task agent is `<name>.jsonl`, `<parent>.<name>.jsonl` for a nested dispatch, or
// `<name>-<n>.jsonl` for a repeated name. Each line is one record with a `type`.

// The token fields of the `usage` of an assistant message and of a `model_usage` side call.
export const TOKEN_FIELDS = ['input', 'cacheRead', 'cacheWrite', 'output'];
// Every record but the session header carries the omp version that wrote it at this path.
export const RUNTIME_VERSION_PATH = ['runtime', 'version'];
const RUNTIME_VERSION = RUNTIME_VERSION_PATH.join('.');
// The records and fields that score.mjs reads, each with its JSON type ('string', 'number', 'boolean', 'object', or
// 'array'). `record` names the record in a message, `type` (and `role` for a message, `part` for a content part of a
// message) selects the values, and each key of `fields` is a path below the value. A `required` record must occur at
// least once in a transcript. `score.mjs transcripts` refuses a transcript in which a field of a selected value is
// missing or has another type, and names it as `<record>.<field>`. Each record that score.mjs reads, but the session
// header, must name the omp version that wrote it (RUNTIME_VERSION_PATH): `report` compares only runs of one version.
export const TRANSCRIPT_RECORDS = [
  { record: 'session', type: 'session', required: true, fields: { version: 'number' } },
  {
    record: 'model_change',
    type: 'model_change',
    required: true,
    fields: { model: 'string', [RUNTIME_VERSION]: 'string' },
  },
  {
    record: 'thinking_level_change',
    type: 'thinking_level_change',
    required: true,
    fields: { thinkingLevel: 'string', [RUNTIME_VERSION]: 'string' },
  },
  {
    record: 'assistant',
    type: 'message',
    role: 'assistant',
    required: true,
    fields: {
      timestamp: 'string',
      [RUNTIME_VERSION]: 'string',
      'message.provider': 'string',
      'message.model': 'string',
      ...Object.fromEntries(TOKEN_FIELDS.map((field) => [`message.usage.${field}`, 'number'])),
    },
  },
  {
    record: 'toolCall',
    type: 'message',
    role: 'assistant',
    part: 'toolCall',
    required: false,
    fields: { name: 'string', arguments: 'object' },
  },
  {
    record: 'toolResult',
    type: 'message',
    role: 'toolResult',
    required: false,
    fields: { 'message.toolCallId': 'string', 'message.isError': 'boolean', [RUNTIME_VERSION]: 'string' },
  },
];
