#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const PLAN_STATUSES = new Set(['drafting', 'planned', 'ongoing', 'blocked', 'finished']);
const STEP_STATUSES = new Set(['planned', 'in-flight', 'done', 'blocked', 'skipped']);
const STEP_EFFECTS = new Set(['local', 'probe', 'production_access', 'publish', 'push', 'release', 'deploy']);
const BASE_KEYS = ['plan_contract', 'title', 'goal', 'status', 'created', 'updated', 'assignee'];
const SECTIONS = ['Goal', 'Research', 'Steps', 'Acceptance', 'Do not touch', 'Open questions', 'Review', 'Verification Results'];
const STEPS_HEADER = '| # | Id | Task | Files | Depends | Effect | Status | Done when |';
const STEPS_SEPARATOR = '|---:|---|---|---|---|---|---|---|';
const ACCEPTANCE_HEADER = '| ID | Command | Expected |';
const ACCEPTANCE_SEPARATOR = '|---|---|---|';
const STATUS_TRANSITIONS = {
  drafting: new Set(['planned', 'ongoing', 'blocked']),
  planned: new Set(['drafting', 'ongoing', 'blocked']),
  ongoing: new Set(['finished', 'blocked']),
  blocked: new Set(['drafting', 'planned', 'ongoing']),
  finished: new Set(),
};
const STEP_TRANSITIONS = {
  planned: new Set(['in-flight', 'done', 'blocked', 'skipped']),
  'in-flight': new Set(['done', 'blocked', 'skipped']),
  blocked: new Set(['in-flight', 'done', 'skipped']),
  done: new Set(),
  skipped: new Set(),
};
const SKIPPED_PLAN_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'QUEUE.md', '.gitkeep']);
function fail(message) {
  throw new Error(message);
}
function utcTimestamp() {
  return new Date().toISOString().replace('Z', '+00:00');
}
function parseFrontmatter(planText) {
  if (!planText.startsWith('---\n')) fail('frontmatter must open with ---');
  const end = planText.indexOf('\n---\n', 4);
  if (end === -1) fail('frontmatter must close with ---');
  const source = planText.slice(4, end);
  const lines = source.split('\n');
  const entries = [];
  const values = {};
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([a-z_]+):(?: (.*))?$/.exec(lines[index]);
    if (!match) fail(`invalid frontmatter line ${index + 2}`);
    const [, key, raw = ''] = match;
    if (Object.hasOwn(values, key)) fail(`duplicate frontmatter key ${key}`);
    let value = raw;
    if (raw === 'null') {
      value = null;
    } else if (/^".*"$/.test(raw)) {
      try {
        value = JSON.parse(raw);
      } catch {
        fail(`invalid quoted scalar for ${key}`);
      }
    }
    entries.push({ key, raw });
    values[key] = value;
  }
  return { body: planText.slice(end + 5), entries, values };
}
function blankFencedRegions(text) {
  let fence;
  return text
    .split('\n')
    .map((line) => {
      const openingFence = fence ? undefined : /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (openingFence) fence = openingFence[1];
      else if (!fence) return line;
      else if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`).test(line)) fence = undefined;
      return line.replace(/[^\r]/g, ' ');
    })
    .join('\n');
}
function parseRows(sectionText, header, separator, width) {
  const lines = blankFencedRegions(sectionText).split('\n');
  const headerIndex = lines.indexOf(header);
  const headerMatches = headerIndex !== -1 && lines[headerIndex + 1] === separator;
  if (!headerMatches) return { headerMatches, rowCount: 0, rows: [] };
  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].startsWith('|')) break;
    const cells = lines[index].slice(1, -1).split('|').map((cell) => cell.trim());
    rows.push({ cells, line: lines[index], lineIndex: index });
  }
  return { headerMatches: true, rowCount: rows.length, rows: rows.filter((row) => row.cells.length === width) };
}
function sectionMap(body) {
  const headings = [...blankFencedRegions(body).matchAll(/^## (.+)$/gm)];
  const sections = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = heading.index + heading[0].length + 1;
    sections.set(heading[1], body.slice(start, headings[index + 1]?.index ?? body.length).trimEnd());
  }
  return { headings: headings.map((match) => match[1]), sections };
}
function unquoteCode(value) {
  return /^`[^`]+`$/.test(value) ? value.slice(1, -1) : value;
}
function unquoteScalar(value) {
  return /^".*"$/.test(value) ? value.slice(1, -1) : value;
}
function pathsInFilesCell(value) {
  return value.split(',').map((entry) => unquoteCode(entry.trim())).filter(Boolean);
}
function comparablePlanPath(planPath) {
  const relative = path.isAbsolute(planPath) ? path.relative(process.cwd(), planPath) : planPath;
  return relative.replaceAll(path.sep, '/').replace(/^\.\//, '');
}
export function machinePathCitations(planText) {
  return planText
    .split('\n')
    .filter((line) => !/^[A-Z][A-Za-z0-9-]*: *\{/.test(line) && /\/home\/[a-z]|\/Users\/[A-Za-z]/.test(line));
}
export function checkPlan(planText, planPath) {
  const failures = [];
  let parsed;
  try {
    parsed = parseFrontmatter(planText);
  } catch (error) {
    return [`check 1: ${error.message}`];
  }
  const { body, entries, values } = parsed;
  const expectedKeys = values.status === 'blocked' ? BASE_KEYS.toSpliced(4, 0, 'blocked_reason') : BASE_KEYS;
  const actualKeys = entries.map(({ key }) => key);
  const actualKeySet = new Set(actualKeys);
  const keysMatch =
    actualKeys.length === expectedKeys.length && expectedKeys.every((key) => actualKeySet.has(key));
  if (!keysMatch || values.plan_contract !== 'v2' || values.assignee !== null) {
    failures.push('check 1: frontmatter keys and plan_contract must match the closed v2 map');
  }
  if (!PLAN_STATUSES.has(values.status)) failures.push('check 2: status is not recognized');
  if (values.status === 'blocked' && !String(values.blocked_reason ?? '').trim()) {
    failures.push('check 2: blocked status requires blocked_reason');
  }
  if (values.status !== 'blocked' && Object.hasOwn(values, 'blocked_reason')) {
    failures.push('check 2: blocked_reason is allowed only for blocked status');
  }
  if (typeof values.title !== 'string' || !values.title.trim() || values.title.length > 70) {
    failures.push('check 3: title must contain 1 to 70 characters');
  }
  if (typeof values.goal !== 'string' || !values.goal.trim() || values.goal.length > 200) {
    failures.push('check 3: goal must contain 1 to 200 characters');
  }
  const timestampPattern = /^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})"$/;
  const createdRaw = entries.find(({ key }) => key === 'created')?.raw ?? '';
  const updatedRaw = entries.find(({ key }) => key === 'updated')?.raw ?? '';
  if (
    !timestampPattern.test(createdRaw) ||
    !timestampPattern.test(updatedRaw) ||
    !Number.isFinite(Date.parse(values.created)) ||
    !Number.isFinite(Date.parse(values.updated)) ||
    Date.parse(values.updated) < Date.parse(values.created)
  ) {
    failures.push('check 4: created and updated must be quoted offset timestamps in chronological order');
  }
  const { headings, sections } = sectionMap(body);
  const requiredHeadings = headings.filter((heading) => heading !== 'Retirement');
  const retirementCount = headings.filter((heading) => heading === 'Retirement').length;
  const retirementValid = retirementCount <= 1 && (retirementCount === 0 || headings.at(-1) === 'Retirement');
  if (requiredHeadings.join('\0') !== SECTIONS.join('\0') || !retirementValid) {
    failures.push('check 5: required sections must appear once in contract order and Retirement must be last');
  }
  const stepsTable = parseRows(sections.get('Steps') ?? '', STEPS_HEADER, STEPS_SEPARATOR, 8);
  if (!stepsTable.headerMatches) failures.push('check 6: Steps table header must match the contract');
  if (stepsTable.headerMatches && stepsTable.rows.length === 0) failures.push('check 6: Steps table requires at least one row');
  const stepsHaveEightCells = stepsTable.rowCount === stepsTable.rows.length;
  if (stepsTable.headerMatches && !stepsHaveEightCells) failures.push('check 6: every Steps row must have eight cells');
  const stepIds = new Set();
  const displayNumbers = new Set();
  const stepFiles = new Set();
  for (const row of stepsTable.rows) {
    const [display, id, task, files, , effectCell, statusCell, doneWhen] = row.cells;
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(id) || stepIds.has(id)) failures.push(`check 6: invalid or duplicate step Id ${id || '(empty)'}`);
    else stepIds.add(id);
    if (!task || !files || !doneWhen) failures.push(`check 6: step ${id || display} has an empty required cell`);
    if (!STEP_EFFECTS.has(unquoteCode(effectCell))) failures.push(`check 6: step ${id || display} has an invalid Effect`);
    if (!STEP_STATUSES.has(unquoteCode(statusCell))) failures.push(`check 6: step ${id || display} has an invalid Status`);
    if (!/^[1-9]\d*$/.test(display) || displayNumbers.has(display)) failures.push(`check 8: invalid display number ${display}`);
    displayNumbers.add(display);
    for (const file of pathsInFilesCell(files)) stepFiles.add(file);
  }
  for (const citation of body.matchAll(/\bstep:([A-Za-z0-9_-]+)\b/g)) {
    if (!stepIds.has(citation[1])) failures.push(`check 7: unknown step citation step:${citation[1]}`);
  }
  if (/\bstep \d+\b/.test(body)) failures.push('check 7: bare numeric step citation is not allowed');
  for (const row of stepsTable.rows) {
    const display = Number(row.cells[0]);
    const dependencies = row.cells[4] === '—' ? [] : row.cells[4].split(',').map((value) => value.trim());
    for (const dependency of dependencies) {
      if (!displayNumbers.has(dependency) || !/^\d+$/.test(dependency) || Number(dependency) >= display) {
        failures.push(`check 8: step ${row.cells[1] || row.cells[0]} has invalid dependency ${dependency}`);
      }
    }
  }
  const acceptance = parseRows(sections.get('Acceptance') ?? '', ACCEPTANCE_HEADER, ACCEPTANCE_SEPARATOR, 3);
  if (!acceptance.headerMatches) failures.push('check 9: Acceptance table header must match the contract');
  if (acceptance.headerMatches && acceptance.rows.length === 0) failures.push('check 9: Acceptance table requires at least one row');
  const acceptanceCellsMatch = acceptance.rowCount === acceptance.rows.length;
  if (acceptance.headerMatches && !acceptanceCellsMatch) failures.push('check 9: every Acceptance row must have three cells');
  const acceptanceIds = new Set();
  for (const { cells } of acceptance.rows) {
    const [id, command, expected] = cells;
    if (!id || acceptanceIds.has(id)) failures.push(`check 9: invalid or duplicate acceptance ID ${id || '(empty)'}`);
    else acceptanceIds.add(id);
    if (!command || !expected) failures.push(`check 9: acceptance ${id || '(empty)'} has an empty required cell`);
  }
  if (machinePathCitations(body).length > 0) failures.push('check 10: body contains an absolute machine path');
  const researchIsPlaceholder = (sections.get('Research') ?? '').includes('_Not researched yet._');
  if (researchIsPlaceholder && values.status !== 'drafting') {
    failures.push('check 11: Research must be filled once the plan leaves drafting');
  }
  if (stepFiles.has(comparablePlanPath(planPath))) failures.push('check 12: Steps Files contains the plan file itself');
  const modes = [...(sections.get('Goal') ?? '').matchAll(/^Mode: (plan-and-implement|plan-only)$/gm)];
  if (modes.length !== 1) failures.push('check 13: Goal must contain exactly one valid Mode line');
  return failures;
}
function planTemplate(title, goal, mode) {
  const now = utcTimestamp();
  return `---\nplan_contract: v2\ntitle: ${title}\ngoal: ${goal}\nstatus: drafting\ncreated: "${now}"\nupdated: "${now}"\nassignee: null\n---\n\n## Goal\n\n${goal}\n\nMode: ${mode}\n\n## Research\n\n_Not researched yet._\n\n## Steps\n\n${STEPS_HEADER}\n${STEPS_SEPARATOR}\n\n## Acceptance\n\n${ACCEPTANCE_HEADER}\n${ACCEPTANCE_SEPARATOR}\n\n## Do not touch\n\nNone\n\n## Open questions\n\nNone\n\n## Review\n\n_No review yet._\n\n## Verification Results\n\n_Not implemented yet._\n`;
}
function activePlanPath(slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail(`invalid plan slug: ${slug}`);
  return path.join('docs/plans/active', `${slug}.md`);
}
function resolveCheckPath(value) {
  if (value.includes('/') || value.includes('\\') || value.endsWith('.md')) return value;
  return activePlanPath(value);
}
function replaceFrontmatterFields(planText, fields) {
  let updated = planText;
  for (const [key, value] of Object.entries(fields)) {
    const line = `${key}: ${value}`;
    const pattern = new RegExp(`^${key}:.*$`, 'm');
    if (pattern.test(updated)) updated = updated.replace(pattern, line);
    else if (key === 'blocked_reason') updated = updated.replace(/^status:.*$/m, (statusLine) => `${statusLine}\n${line}`);
  }
  if (fields.blocked_reason === undefined) updated = updated.replace(/^blocked_reason:.*\n/m, '');
  return updated;
}
function writePlanIfUnchanged(file, before, after) {
  if (fs.readFileSync(file, 'utf8') !== before) fail('plan file changed on disk; re-read and retry');
  const temporary = `${file}.tmp-${process.pid}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx');
    fs.writeFileSync(descriptor, after, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
}
function readActivePlan(slug) {
  const file = activePlanPath(slug);
  const before = fs.readFileSync(file, 'utf8');
  if (!/^plan_contract: v2$/m.test(before.slice(0, before.indexOf('\n---\n', 4)))) {
    fail(`not a v2 plan: ${file} (no plan_contract: v2)`);
  }
  return { before, file, parsed: parseFrontmatter(before) };
}
function createPlan(args) {
  const [slug, ...flags] = args;
  if (!slug) fail('new requires a slug');
  const file = activePlanPath(slug);
  const options = parseOptions(flags, new Set(['--title', '--goal', '--mode']));
  if (!options['--title'] || !options['--goal']) fail('new requires --title and --goal');
  const mode = options['--mode'] ?? 'plan-and-implement';
  if (!new Set(['plan-and-implement', 'plan-only']).has(mode)) fail(`invalid plan mode: ${mode}`);
  if (!fs.existsSync(path.dirname(file))) fail('docs/plans/active/ is absent');
  if (fs.existsSync(file)) fail(`plan already exists: ${file}`);
  if ([options['--title'], options['--goal']].some((value) => /[\r\n]/.test(value))) fail('title and goal must be single-line text');
  const temporary = `${file}.tmp-${process.pid}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx');
    fs.writeFileSync(descriptor, planTemplate(options['--title'], options['--goal'], mode), 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (fs.existsSync(file)) fail(`plan already exists: ${file}`);
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
  console.log(`plan created: ${file}`);
}
function parseOptions(args, allowed) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!allowed.has(flag) || args[index + 1] === undefined || Object.hasOwn(options, flag)) fail(`invalid option: ${flag ?? '(missing)'}`);
    options[flag] = args[index + 1];
  }
  return options;
}
function checkCommand(args) {
  if (args.length !== 1) fail('check requires one slug or path');
  const file = resolveCheckPath(args[0]);
  const planText = fs.readFileSync(file, 'utf8');
  if (!/^plan_contract: v2$/m.test(planText.slice(0, planText.indexOf('\n---\n', 4)))) {
    fail(`not a v2 plan: ${file} (no plan_contract: v2)`);
  }
  const failures = checkPlan(planText, file);
  if (failures.length > 0) fail(failures.map((message) => `${file}: ${message}`).join('\n'));
  console.log(`plan check passed: ${file}`);
}
function setPlanStatus(args) {
  const [slug, target, ...flags] = args;
  if (!slug || !target) fail('status requires a slug and status');
  const options = parseOptions(flags, new Set(['--reason']));
  if (target === 'blocked' && (!String(options['--reason'] ?? '').trim() || /[\r\n]/.test(options['--reason']))) fail('blocked status requires --reason as single-line text');
  if (target !== 'blocked' && options['--reason'] !== undefined) fail('--reason is allowed only for blocked status');
  const { before, file, parsed } = readActivePlan(slug);
  const current = parsed.values.status;
  if (!STATUS_TRANSITIONS[current]?.has(target)) fail(`illegal plan status transition: ${current} -> ${target}`);
  const after = replaceFrontmatterFields(before, {
    status: target,
    blocked_reason: target === 'blocked' ? options['--reason'] : undefined,
    updated: `"${utcTimestamp()}"`,
  });
  writePlanIfUnchanged(file, before, after);
  console.log(`${slug}: ${current} -> ${target}`);
}
function setStepStatus(args) {
  const [slug, stepId, target] = args;
  if (!slug || !stepId || !target || args.length !== 3) fail('step requires a slug, step id, and status');
  if (!STEP_STATUSES.has(target)) fail(`unknown step status: ${target}`);
  const { before, file, parsed } = readActivePlan(slug);
  if (parsed.values.status !== 'ongoing') fail(`plan status is ${parsed.values.status}; expected ongoing`);
  const { sections } = sectionMap(parsed.body);
  const table = parseRows(sections.get('Steps') ?? '', STEPS_HEADER, STEPS_SEPARATOR, 8);
  const row = table.rows.find(({ cells }) => cells[1] === stepId);
  if (!row) fail(`unknown step id: ${stepId}`);
  const current = unquoteCode(row.cells[6]);
  if (!STEP_TRANSITIONS[current]?.has(target)) fail(`illegal step status transition: ${current} -> ${target}`);
  if (new Set(['in-flight', 'done']).has(target) && row.cells[4] !== '—') {
    const byNumber = new Map(table.rows.map((entry) => [entry.cells[0], unquoteCode(entry.cells[6])]));
    const unfinished = row.cells[4]
      .split(',')
      .map((value) => value.trim())
      .filter((number) => !new Set(['done', 'skipped']).has(byNumber.get(number)));
    if (unfinished.length > 0) fail(`step:${stepId} has unfinished dependency ${unfinished.join(', ')}`);
  }
  const bodyLines = parsed.body.split('\n');
  const stepSectionStart = bodyLines.indexOf('## Steps') + 1;
  const rowIndex = bodyLines.findIndex((line, index) => index >= stepSectionStart && line === row.line);
  const parts = bodyLines[rowIndex].split('|');
  parts[7] = parts[7].replace(current, target);
  bodyLines[rowIndex] = parts.join('|');
  let after = `${before.slice(0, before.length - parsed.body.length)}${bodyLines.join('\n')}`;
  after = replaceFrontmatterFields(after, { updated: `"${utcTimestamp()}"` });
  writePlanIfUnchanged(file, before, after);
  console.log(`${slug} step:${stepId}: ${current} -> ${target}`);
}
function planFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !SKIPPED_PLAN_FILES.has(entry.name))
    .map((entry) => path.join(directory, entry.name));
}
function planSlug(file) {
  return path.basename(file, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '');
}
// Pre-v2 records are history, not corruption. Never parse them; reserve `unreadable` for malformed v2 plans.
function planListing(file) {
  const slug = planSlug(file);
  const planText = fs.readFileSync(file, 'utf8');
  if (!/^plan_contract: v2$/m.test(planText)) {
    const title = /^title: (.+)$/m.exec(planText.split('\n---')[0] ?? '')?.[1]?.trim();
    return { slug, status: 'v1', title: title ? unquoteScalar(title) : slug };
  }
  try {
    const { values } = parseFrontmatter(planText);
    return { slug, status: values.status, title: values.title };
  } catch (error) {
    return { slug, status: 'unreadable', title: error.message };
  }
}
function planListings(directory) {
  return planFiles(directory).map(planListing).sort((left, right) => left.slug.localeCompare(right.slug));
}
function listPlans(args) {
  if (!fs.existsSync('docs/plans')) fail('docs/plans/ is absent');
  const options = parseOptions(args, new Set(['--status']));
  const selectableStatuses = new Set([...PLAN_STATUSES, 'v1', 'unreadable']);
  if (options['--status'] && !selectableStatuses.has(options['--status'])) {
    fail(`unknown plan status: ${options['--status']}`);
  }
  for (const directory of ['docs/plans/active', 'docs/plans/finished']) {
    for (const plan of planListings(directory)) {
      if (!options['--status'] || plan.status === options['--status']) {
        console.log(`${plan.status}\t${plan.slug}\t${plan.title}`);
      }
    }
  }
}
function plannedSlugs() {
  return planListings('docs/plans/active').filter(({ status }) => status === 'planned').map(({ slug }) => slug);
}
function parseQueue(queueText) {
  const lines = queueText.split('\n');
  const headerIndex = lines.indexOf('| Stage | Plan | Depends on | Why |');
  if (headerIndex === -1 || lines[headerIndex + 1] !== '|---:|---|---|---|') fail('queue table header is invalid');
  const rows = [];
  for (let index = headerIndex + 2; index < lines.length && lines[index].startsWith('|'); index += 1) {
    const cells = lines[index].slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.length !== 4 || !/^\d+$/.test(cells[0]) || !cells[1] || !cells[3]) fail(`queue row ${index + 1} is invalid`);
    rows.push({ stage: Number(cells[0]), plan: cells[1], dependencies: cells[2] === '—' ? [] : cells[2].split(',').map((item) => item.trim()), order: rows.length });
  }
  return rows.sort((left, right) => left.stage - right.stage || left.order - right.order);
}
function nextPlans(args) {
  if (args.length > 0) fail('next takes no arguments');
  if (!fs.existsSync('docs/plans')) fail('docs/plans/ is absent');
  const queueFile = 'docs/plans/QUEUE.md';
  if (fs.existsSync(queueFile)) {
    try {
      const rows = parseQueue(fs.readFileSync(queueFile, 'utf8'));
      if (rows.length > 0) {
        const planned = new Set(plannedSlugs());
        // Presence in `finished/` settles legacy dependencies because v1 history has no v2 status.
        const finished = new Set(planFiles('docs/plans/finished').map(planSlug));
        const byPlan = new Map(rows.map((row) => [row.plan, row]));
        const finishedClosure = (slug, seen = new Set()) => {
          if (!finished.has(slug) || seen.has(slug)) return false;
          return (byPlan.get(slug)?.dependencies ?? []).every((dependency) => finishedClosure(dependency, new Set(seen).add(slug)));
        };
        for (const row of rows) if (planned.has(row.plan) && row.dependencies.every((slug) => finishedClosure(slug))) console.log(row.plan);
        return;
      }
    } catch (error) {
      console.error(`warning: malformed docs/plans/QUEUE.md: ${error.message}; falling back to planned plans`);
    }
  }
  for (const slug of plannedSlugs()) console.log(slug);
}
function archivePlan(args, retired = false) {
  const [slug, ...flags] = args;
  if (!slug) fail(`${retired ? 'retire' : 'archive'} requires a slug`);
  const options = parseOptions(flags, retired ? new Set(['--reason']) : new Set());
  if (retired && (!String(options['--reason'] ?? '').trim() || /[\r\n]/.test(options['--reason']))) fail('retire requires a single-line --reason');
  const { before, file, parsed } = readActivePlan(slug);
  if (retired && parsed.values.status === 'finished') fail('cannot retire a finished plan');
  if (!retired && parsed.values.status !== 'ongoing') fail(`archive requires ongoing status, found ${parsed.values.status}`);
  if (!retired) {
    const { sections } = sectionMap(parsed.body);
    const steps = parseRows(sections.get('Steps') ?? '', STEPS_HEADER, STEPS_SEPARATOR, 8).rows;
    const unfinished = steps.length === 0 ? { cells: ['', '(missing)'] } : steps.find(({ cells }) => !new Set(['done', 'skipped']).has(unquoteCode(cells[6])));
    if (unfinished) fail(`archive refused: non-terminal step ${unfinished.cells[1]}`);
    if (!/^Code-review: pass$/m.test(sections.get('Review') ?? '')) fail('archive requires Code-review: pass');
  }
  let after = replaceFrontmatterFields(before, { status: 'finished', blocked_reason: undefined, updated: `"${utcTimestamp()}"` });
  if (retired) {
    if (/^## Retirement$/m.test(parsed.body)) fail('plan already has a Retirement section');
    after = `${after.trimEnd()}\n\n## Retirement\n\n${options['--reason']}\n`;
  }
  const destination = path.join('docs/plans/finished', `${utcTimestamp().slice(0, 10)}-${slug}.md`);
  if (fs.existsSync(destination)) fail(`archive destination exists: ${destination}`);
  if (!fs.existsSync(path.dirname(destination))) fail('docs/plans/finished/ is absent');
  writePlanIfUnchanged(file, before, after);
  fs.renameSync(file, destination);
  console.log(destination);
}
function usage() {
  return 'usage: plan.mjs <new|check|status|step|list|next|archive|retire> ...';
}
function main(argv) {
  const [command, ...args] = argv;
  if (!command) fail(usage());
  const commands = {
    new: createPlan,
    check: checkCommand,
    status: setPlanStatus,
    step: setStepStatus,
    list: listPlans,
    next: nextPlans,
    archive: (values) => archivePlan(values),
    retire: (values) => archivePlan(values, true),
  };
  if (!commands[command]) fail(usage());
  commands[command](args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
