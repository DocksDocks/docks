#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = 'scripts/tests/plan-review-policy.mjs';
const REQUIRED_SURFACES = [
  'docs/plans/AGENTS.md',
  'plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md',
  'plugins/docks/skills/productivity/plan-init/SKILL.md',
  'plugins/docks/skills/productivity/plan-manager/SKILL.md',
  'plugins/docks/skills/productivity/plan-review/SKILL.md',
  'plugins/docks/agents/plan-manager.md',
  'plugins/docks/agents/plan-review.md',
  '.codex/agents/plan-manager.toml',
  '.codex/agents/plan-review.toml',
  'plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md',
  'docs/scaffold/templates/codex-plan-manager.toml.template',
  'docs/scaffold/templates/codex-plan-review.toml.template',
  'docs/scaffold/templates/root-AGENTS.md.template',
  'AGENTS.md', 'README.md', 'plugins/docks/README.md', 'plugins/docks/skills/AGENTS.md',
  'plugins/session-relay/skills/productivity/session-relay/SKILL.md',
  'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
  'scripts/tests/fixtures/plan-review-policy/sample-plan.md',
  HARNESS,
];

function copyRoot(target) {
  for (const relative of REQUIRED_SURFACES) {
    const source = path.join(ROOT, relative); const dest = path.join(target, relative);
    assert.ok(fs.existsSync(source), `omitted-surface oracle: ${relative}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(source, dest);
  }
}

function run(root, args) {
  return spawnSync(process.execPath, [path.join(root, HARNESS), ...args], { cwd: root, encoding: 'utf8' });
}

function requirePass(label, result, pattern) {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`); assert.match(result.stdout, pattern, `${label}: named proof missing`); console.log(`${label} passed`);
}

function applyVariant(relative, before, after) {
  return (root) => {
    const file = path.join(root, relative); const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.split(before).length - 1, 1, `regression anchor must be unique: ${relative}`);
    fs.writeFileSync(file, text.replace(before, after));
  };
}

function applyVariantAll(relative, before, after, expectedCount) {
  return (root) => {
    const file = path.join(root, relative); const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.split(before).length - 1, expectedCount, `regression anchor count: ${relative}`);
    fs.writeFileSync(file, text.replaceAll(before, after));
  };
}

function applyVariantLast(relative, before, after) {
  return (root) => {
    const file = path.join(root, relative); const text = fs.readFileSync(file, 'utf8'); const at = text.lastIndexOf(before); assert.ok(at >= 0, `regression anchor missing: ${relative}`);
    fs.writeFileSync(file, `${text.slice(0, at)}${after}${text.slice(at + before.length)}`);
  };
}

function combine(...variants) {
  return (root) => { for (const apply of variants) apply(root); };
}

const REGRESSIONS = [
  ['passed not_ready regression', ['--case', 'validation-matrix'], /not_ready|completion verdict|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if ([X, S].some((leg) => leg?.result === 'passed' && leg.reviewer_output?.verdict === 'not_ready')) return 'regressed';",
    "if (false) return 'regressed';",
  )],
  ['vacuous acceptance inventory', ['--case', 'validation-matrix'], /acceptance inventory|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (value.schema !== 1 || !Array.isArray(value.criteria) || value.criteria.length === 0) throw new Error('acceptance inventory must be nonempty');",
    "if (value.schema !== 1 || !Array.isArray(value.criteria)) throw new Error('acceptance inventory must be nonempty');",
  )],
  ['acceptance command substitution', ['--case', 'validation-matrix'], /altered acceptance command|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (row.criterion_id !== criterion.id || row.command !== criterion.command || row.expected !== criterion.expected) throw new Error('acceptance evidence order or criterion mismatch');",
    "if (row.criterion_id !== criterion.id || row.expected !== criterion.expected) throw new Error('acceptance evidence order or criterion mismatch');",
  )],
  ['raw source plan ancestor defenses', [], /raw plan requested ancestor|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (unique.some((logical) => sameOrAncestor(logical, safePlan))) throw new Error('raw plan path or ancestor is forbidden in requested paths');",
      "if (false) throw new Error('raw plan path or ancestor is forbidden in requested paths');",
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (entries.slice(start).some((entry) => entry.path === safePlan)) throw new Error('raw plan path was emitted by requested path expansion');",
      "if (false) throw new Error('raw plan path was emitted by requested path expansion');",
    ),
  )],
  ['sealed plan-view semantic binding', [], /plan-B substitution|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (!planView || planView.mode !== '100444' || sha256(planView.bytes) !== manifest.input_sha256) throw new Error('bundle plan view input hash mismatch');",
    "if (!planView || planView.mode !== '100444') throw new Error('bundle plan view input hash mismatch');",
  )],
  ['sealed reviewer-schema semantic binding', [], /reviewer schema substitution|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (!schema || schema.mode !== '100444' || schema.bytes.toString() !== expected) throw new Error(`bundle reviewer schema mismatch: ${leg}`);",
    "if (!schema || schema.mode !== '100444') throw new Error(`bundle reviewer schema mismatch: ${leg}`);",
  )],
  ['requested-row coverage binding', [], /requested-state substitution|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (row.state === 'file' && (matches.length !== 1 || matches[0] !== logical)) throw new Error('file requested path coverage mismatch');",
    "if (false) throw new Error('file requested path coverage mismatch');",
  )],
  ['sealed file hash regression', [], /post-seal bundle regression|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (sha256(bytes) !== row.sha256) throw new Error(`bundle file hash mismatch: ${logical}`);",
    "if (false) throw new Error(`bundle file hash mismatch: ${logical}`);",
  )],
  ['execution range validator regression', ['--case', 'lifecycle'], /non-start execution base|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    'validateExecutionRange({ repo, planPath: safePlan, plannedAtCommit, executionBaseCommit, reviewedHead: reviewedCommit });',
    '({ repo, planPath: safePlan, plannedAtCommit, executionBaseCommit, reviewedHead: reviewedCommit });',
  )],
  ['planned-base completion diff regression', ['--case', 'lifecycle'], /pre-start concurrent work|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    'const diffBytes = completionDiff(repo, executionBaseCommit, reviewedCommit);',
    'const diffBytes = completionDiff(repo, plannedAtCommit, reviewedCommit);',
  )],
  ['read-only wrapper claims primary writes', [], /primary work|write boundary|Assertion/, applyVariant(
    '.codex/agents/plan-review.toml',
    '- Never run or claim CI, acceptance, clone, cleanup, or lifecycle work.',
    '- CI/acceptance claims require fresh disposable-checkout command evidence.',
  )],
  ['Claude evidence wrapper regains Bash', [], /regression-capable reviewer tools|Assertion/, applyVariant(
    'plugins/docks/agents/plan-review.md',
    'tools: Read, Glob, Grep',
    'tools: Read, Glob, Grep, Bash',
  )],
  ['JCS lone-surrogate value regression', [], /lone-surrogate value|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "assertUnicodeScalarString(value, 'JCS string');",
    "void value; // variant string validation",
  )],
  ['JCS lone-surrogate key regression', [], /lone-surrogate property key|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "for (const key of keys) assertUnicodeScalarString(key, 'JCS property key');",
    "for (const key of keys) void key; // variant property-key validation",
  )],
  ['GitHub publishing contract loss', [], /publishing operation|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-manager/SKILL.md',
    '## Publishing a plan as a GitHub issue (`--issues`)',
    '## Removed external operation',
  )],
  ['compatibility owner confirmation regression', ['--case', 'execution-compatibility'], /wrong owner confirmation|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "export function buildExecutionBaseCompatibilityApplication({ repo, reviewedHead, planPath, plannedAtCommit, executionBaseCommit, authorizationId, ownerMessageSha256 }) {\n  if (authorizationId !== COMPATIBILITY_AUTHORIZATION_ID || ownerMessageSha256 !== COMPATIBILITY_AUTHORIZATION_SHA256) throw new Error('execution compatibility owner confirmation mismatch');",
      'export function buildExecutionBaseCompatibilityApplication({ repo, reviewedHead, planPath, plannedAtCommit, executionBaseCommit, authorizationId, ownerMessageSha256 }) {\n  void authorizationId; void ownerMessageSha256;',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (authorizationId !== COMPATIBILITY_AUTHORIZATION_ID || ownerMessageSha256 !== COMPATIBILITY_AUTHORIZATION_SHA256) throw new Error('execution compatibility owner confirmation mismatch');",
      'void authorizationId; void ownerMessageSha256; // variant internal owner check',
    ),
  )],
  ['prerequisite failed-child regression', ['--case', 'execution-compatibility'], /nonzero child status|signaled child|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (result.error !== null || result.signal !== null || result.status !== 0) throw new Error(`${label} child failed`);",
    "if (result.error !== null) throw new Error(`${label} child failed`);",
  )],
  ['canonical cache file regression', ['--case', 'execution-compatibility'], /cache symlink|cache directory|cache realpath|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (stat.kind !== 'file' || stat.symbolicLink || dependencies.realpath(absolutePath) !== absolutePath) throw new Error(`${label} must be a canonical non-symlink file`);",
    "if (false) throw new Error(`${label} must be a canonical non-symlink file`);",
  )],
  ['remote main exact-row regression', ['--case', 'execution-compatibility'], /remote main extra row|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (text !== expected) throw new Error('remote main stdout mismatch');",
    "if (!text.startsWith(expected)) throw new Error('remote main stdout mismatch');",
  )],
  ['remote tag exact-row regression', ['--case', 'execution-compatibility'], /remote tag row order|remote tag unpeeled|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "throw new Error('remote tag stdout mismatch');\n}",
    "return { ref, annotated: true, tag_object: rows[0]?.[0] ?? releaseCommit, peeled_commit: releaseCommit };\n}",
  )],
  ['release projection regression', ['--case', 'execution-compatibility'], /release draft|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (jcs(parsed) !== jcs(expected)) throw new Error('GitHub Release projection mismatch');",
    "void parsed; // variant GitHub Release projection",
  )],
  ['Codex plugin uniqueness regression', ['--case', 'execution-compatibility'], /duplicate Codex plugin|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (matches.length !== 1) throw new Error('Codex plugin selection must be unique');",
    "if (matches.length === 0) throw new Error('Codex plugin selection must be unique');",
  )],
  ['observation self-hash regression', ['--case', 'execution-compatibility'], /stale stored stderr|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (observations.observations_sha256 !== sha256(jcs(preimage))) throw new Error('Docks prerequisite observations hash mismatch');",
    "void preimage; // variant observations self-hash",
  )],
  ['prerequisite receipt self-hash regression', ['--case', 'execution-compatibility'], /partially rehashed stored stderr|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (receipt.receipt_sha256 !== sha256(jcs(preimage))) throw new Error('Docks prerequisite receipt hash mismatch');",
    "void preimage; // variant prerequisite receipt self-hash",
  )],
  ['canonical remote config count regression', ['--case', 'execution-compatibility'], /GIT_CONFIG_COUNT|Assertion|child failed/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "env.GIT_CONFIG_COUNT = '0';",
    "env.GIT_CONFIG_COUNT = '1';",
  )],
  ['canonical remote tag loses peeled pattern', ['--case', 'execution-compatibility'], /two canonical remote children|deep-equal|Assertion|remote tag/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "return ['git', 'ls-remote', '--exit-code', '--tags', CANONICAL_REPOSITORY_URL, ref, `${ref}^{}`];",
    "return ['git', 'ls-remote', '--exit-code', '--tags', CANONICAL_REPOSITORY_URL, ref];",
  )],
  ['Completion Review accepted-order regression', ['--case', 'execution-compatibility'], /accepted X1,X2|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    'accepted: receipt[leg].reconciliation.accepted.slice().sort(compareUtf16),',
    'accepted: receipt[leg].reconciliation.accepted.slice(),',
  )],
  ['Completion Review rejected-order regression', ['--case', 'execution-compatibility'], /rejected S1|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    'rejected: receipt[leg].reconciliation.rejected.map(({ id, reason }) => ({ id, reason })).sort((a, b) => compareUtf16(a.id, b.id)),',
    'rejected: receipt[leg].reconciliation.rejected.map(({ id, reason }) => ({ id, reason })),',
  )],
  ['Completion Review reproduced-order regression', ['--case', 'execution-compatibility'], /verified X1,X2|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "reproduced_ids: receipt.reproduced.filter((row) => row.source === 'X' || row.source === 'S').map((row) => row.id).sort(compareUtf16),",
    "reproduced_ids: receipt.reproduced.filter((row) => row.source === 'X' || row.source === 'S').map((row) => row.id),",
  )],
  ['Completion Review special-character quoting regression', ['--case', 'execution-compatibility'], /specialCharacter|injected|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "} else rendered += `\\\\u${first.toString(16).padStart(4, '0')}`;",
    '} else rendered += value[index];',
  )],
  ['completion-stable Review removal regression', ['--case', 'execution-compatibility'], /stable|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    'return canonicalPlanView(withoutReview);',
    'return canonicalPlanView(bytes);',
  )],
  ['execution scope transient-path regression', ['--case', 'execution-compatibility'], /per-commit outside scope|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "for (const changedPath of changed) if (!allowed.has(changedPath)) throw new Error(`execution scope path is not allowed: ${changedPath}`);",
    'for (const changedPath of changed) void changedPath;',
  )],
  ['legacy creation and start shape regression', ['--case', 'execution-compatibility'], /planned path already existed|creation parent drift|creation extra path|start extra path|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (pathExistsAt(repo, plannedAtCommit, plan_path)) throw new Error('plan path existed at planned_at_commit');",
      'void plan_path; // variant legacy creation absence check',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (commitParent(repo, plan_creation_commit, 'plan creation commit') !== plannedAtCommit) throw new Error('plan creation parent mismatch');",
      'void plan_creation_commit; // variant creation parent check',
    ),
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (creationPaths.length !== 1 || creationPaths[0] !== plan_path) throw new Error('plan creation must be plan-only');",
      'void creationPaths; // variant creation path check', 2,
    ),
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (startPaths.length !== 1 || startPaths[0] !== plan_path) throw new Error('legacy start must change only the plan');",
      'void startPaths; // variant start path check', 2,
    ),
  )],
  ['legacy section-vector and transition-diff regression', ['--case', 'execution-compatibility'], /protected section changed|heading vector changed|transition diff|Assertion/, combine(
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (jcs(parentPartitions.map((row) => row.name)) !== jcs(basePartitions.map((row) => row.name))) throw new Error('execution compatibility heading vector changed');",
      'void parentPartitions; void basePartitions; // variant heading vector check', 2,
    ),
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      'for (const row of partitions) if (row.changed && protectedNames.has(row.name)) throw new Error(`execution compatibility protected section changed: ${row.name}`);',
      'for (const row of partitions) void row; // variant protected-section check', 2,
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "'--diff-algorithm=myers', '--unified=3', '--inter-hunk-context=0'",
      "'--diff-algorithm=myers', '--unified=4', '--inter-hunk-context=0'",
    ),
  )],
  ['compatibility attribute determinism regression', ['--case', 'execution-compatibility'], /attributes preserve|historical reconstruction|transition diff|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "'diff', '--text', '--binary'",
    "'diff', '--binary'",
  )],
  ['compatibility E reconstruction regression', ['--case', 'execution-compatibility'], /historical application|E historical reconstruction|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (application.markdown !== expectedApplication.markdown || receipt.receipt_sha256 !== expectedApplication.receipt_sha256) throw new Error('execution compatibility application mismatch');",
      'void expectedApplication; // variant direct historical reconstruction',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      'return { ...application, receipt, application: expectedApplication };',
      'return { ...application, receipt, application }; // variant canonical historical substitution',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (application.markdown !== reconstructed.markdown) throw new Error('compatibility evidence historical application mismatch');",
      'void reconstructed; // variant repository historical reconstruction',
    ),
  )],
  ['compatibility findings-free regression', ['--case', 'execution-compatibility'], /R not_ready|R finding|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (passed.length < 1 || passed.some((raw) => raw.reviewer_output?.verdict !== 'ready' || raw.findings.length !== 0)) throw new Error('execution compatibility review must be findings-free ready');",
      "if (passed.length < 1) throw new Error('execution compatibility review must be findings-free ready');",
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (!['dual', 'single'].includes(receipt.outcome) || receipt.pre_execution_eligible !== true) throw new Error('execution compatibility review outcome is ineligible');",
      "if (!['dual', 'single'].includes(receipt.outcome)) throw new Error('execution compatibility review outcome is ineligible');",
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (leg.raw.result === 'waived' || leg.raw.waiver !== null || leg.raw.findings.length !== 0 || leg.reconciliation.accepted.length !== 0 || leg.reconciliation.rejected.length !== 0) throw new Error('execution compatibility review waiver/finding is forbidden');",
      "if (leg.raw.result === 'waived' || leg.raw.waiver !== null) throw new Error('execution compatibility review waiver/finding is forbidden');",
    ),
  )],
  ['compatibility adjacency and plan-only regression', ['--case', 'execution-compatibility'], /E adjacency|R adjacency|B extra path|Q extra path|Q adjacency|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (commitParent(repo, commit, label) !== parent) throw new Error(`${label} parent mismatch`);",
      'void parent; // variant direct adjacency check',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (repository.parent(commit, label) !== parent) throw new Error(`${label} parent mismatch`);",
      'void parent; // variant prerequisite adjacency check',
    ),
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (paths.length !== 1 || paths[0] !== planPath) throw new Error(`${label} must change only the plan`);",
      'void paths; // variant plan-only check', 2,
    ),
  )],
  ['compatibility binding record regression', ['--case', 'execution-compatibility'], /B binding record|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (extracted.markdown !== `Execution-base-compatibility-binding: ${jcs(binding)}\\n`) throw new Error('compatibility binding application mismatch');",
    'void extracted; // variant binding application check',
  )],
  ['prerequisite Q marker and delta regression', ['--case', 'execution-compatibility'], /Q pending marker|Q Step-P|Q extra prose|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (markerCount !== 1 || plannedCount !== 1 || doneCount !== 0) throw new Error('Docks prerequisite marker or Step-P row mismatch');",
      'void markerCount; void plannedCount; void doneCount; // variant Q marker check',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "requirePlanDelta(bindingState.bindingBytes, prerequisiteBytes, expectedPrerequisite, 'Docks prerequisite closure');",
      'void expectedPrerequisite; // variant Q exact delta check',
    ),
  )],
  ['final F receipt and delta regression', ['--case', 'execution-compatibility'], /F extra prose|F attribution|R not_ready|R finding|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (committedFinal.payload !== finalReview.payload) throw new Error('execution review receipt was not retained');",
      'void committedFinal; // variant final receipt retention',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "requirePlanDelta(prerequisiteBytes, executionReviewBytes, expectedFinal, 'execution final review');",
      'void expectedFinal; // variant final review delta',
    ),
  )],
  ['stored prerequisite closure regression', ['--case', 'execution-compatibility'], /stored observation missing field|stored observation extra field|stored main projection|stored argv order|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "assertClosed(row, ['schema', 'argv', 'exit_code', 'stdout_sha256', 'stderr_sha256', 'projection'], label);",
      'void row; // variant stored observation closure',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (row.schema !== 1 || row.exit_code !== 0 || jcs(row.argv) !== jcs(expectedArgv)) throw new Error(`${label} identity mismatch`);",
      'void expectedArgv; // variant stored observation identity',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (jcs(observations.remote_main.projection) !== jcs({ commit: receipt.release_commit, ref: 'refs/heads/main' })) throw new Error('stored remote main projection mismatch');",
      'void receipt; // variant stored main projection',
    ),
  )],
  ['completion Review reuse byte checks regression', ['--case', 'execution-compatibility'], /completion reuse|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (record.payload !== jcs(receipt)) throw new Error('completion Review receipt payload mismatch');",
      'void record; // variant completion receipt payload',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (completionStablePlanViewV1(beforeBytes) !== completionStablePlanViewV1(afterBytes)) throw new Error('completion stable plan view mismatch');",
      'void beforeBytes; void afterBytes; // variant completion stable view',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "requirePlanDelta(beforeBytes, afterBytes, expected, 'completion Review apply', ['updated', 'review_status']);",
      'void expected; // variant completion Review exact apply',
    ),
  )],
  ['execution scope chronological empty-ledger regression', ['--case', 'execution-compatibility'], /scope ledger|empty commits|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      'const commits = newestFirst.reverse();',
      'const commits = newestFirst; // variant chronological order',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      'const changed = changedPaths(repo, row.parent, row.commit).slice().sort(compareUtf16);',
      'const changed = changedPaths(repo, row.parent, row.commit).slice();',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      'const ledger = commits.map((row, index) => {',
      'const ledger = commits.filter((row) => changedPaths(repo, row.parent, row.commit).length > 0).map((row, index) => {',
    ),
  )],
  ['strict corpus identity regression', [], /strict corpus|Assertion/, applyVariant(
    HARNESS,
    "'strict-success', 'path-escape'",
    "'path-escape', 'strict-success'",
  )],
  ['strict raw result comparison regression', [], /strict differential retains raw comparison|Assertion/, combine(
    applyVariantLast(HARNESS, 'assert.equal(newResult.status, oldResult.status', 'assert.equal(oldResult.status, oldResult.status'),
    applyVariantLast(HARNESS, 'assert.deepEqual(newResult.stdout, oldResult.stdout', 'assert.deepEqual(oldResult.stdout, oldResult.stdout'),
    applyVariantLast(HARNESS, 'assert.deepEqual(newResult.stderr, oldResult.stderr', 'assert.deepEqual(oldResult.stderr, oldResult.stderr'),
  )],
  ['closed selector fallback regression', [], /selector|Expected|Assertion|unknown or malformed/, applyVariant(
    HARNESS,
    "else throw new Error('unknown or malformed plan-review-policy test selector');",
    'else {}',
  )],
  ['malformed acceptance source table', [], /acceptance inventory|criterion id|Assertion/, applyVariant(
    'scripts/tests/fixtures/plan-review-policy/sample-plan.md',
    '| A2 | `node --check fixture.js` | exit 0 |',
    '| A1 | `node --check fixture.js` | exit 0 |',
  )],
];

try {
  const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(self, /from ['"].*review-policy\.mjs['"]/);
  assert.doesNotMatch(self, /from ['"].*plan-review-policy\.mjs['"]/);
  assert.equal((self.match(/spawnSync\(/g) || []).length, 1, 'driver has one black-box spawn site');
  console.log('regression driver imports no helper/harness/inventory and spawns only the copied harness');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-black-box-')); copyRoot(temp);
  console.log(`omitted-surface oracle copied ${REQUIRED_SURFACES.length} live/generated/helper surfaces`);
  const semantic = run(temp, ['--case', 'validation-matrix']);
  requirePass('semantic attempt/ledger/raw/run/receipt validation matrix', semantic, /semantic validation matrix passed/);
  assert.match(semantic.stdout, /not_ready verdict and structured-output hash cannot authorize execution/);
  assert.match(semantic.stdout, /derived completion verdict rejects failing primary evidence and mismatched review_status/);
  requirePass('distinct X\/S schema and request leg matrix', run(temp, ['--case', 'legs']), /direct argv.*consent separation passed/);
  const lifecycle = run(temp, ['--case', 'lifecycle']);
  requirePass('shipped completion clone\/snapshot\/cleanup matrix', lifecycle, /git clone --no-local.*digest passed/);
  assert.match(lifecycle.stdout, /canonical root and prepare identity reject arbitrary roots and forged tokens/);
  const full = run(temp, []);
  requirePass('canonical bundle, fence, consumer, and surface matrix', full, /plan-review-policy contract passed/);
  assert.match(full.stdout, /GitHub issue publishing operation preservation passed/);
  fs.rmSync(temp, { recursive: true, force: true });
  for (const [label, args, pattern, apply] of REGRESSIONS) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-regression-')); copyRoot(root); apply(root);
    const result = run(root, args); assert.notEqual(result.status, 0, `${label}: variant copied artifact unexpectedly passed`);
    assert.match(`${result.stdout}\n${result.stderr}`, pattern, `${label}: independent failure oracle did not fire`);
    fs.rmSync(root, { recursive: true, force: true }); console.log(`regression fixture detected: ${label}`);
  }
  console.log('plan-review-policy regressions passed');
} catch (error) {
  console.error(error.stack || error.message); process.exitCode = 1;
}
