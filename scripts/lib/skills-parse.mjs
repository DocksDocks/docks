// Shared SKILL.md / agent-markdown parsing helpers for the author-side scorers
// and guards. Author-only (NOT seeded) — the bundled write-skill skill-guard.mjs
// keeps its own copies so it can ship standalone.
//
// The body-line method here is the score-calibrated one (the `c < 2` cap keeps a
// body `---` from closing the frontmatter early); it must stay identical to the
// bundled scorer's, or skill/agent scores shift.

export function splitLines(content) {
  return (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n');
}

export const countLines = (lines, re) => lines.reduce((n, l) => (re.test(l) ? n + 1 : n), 0);
export const anyLine = (lines, re) => lines.some((l) => re.test(l));

// Lines after the 2nd `---` (frontmatter close), fence-cap so body `---` counts as body.
export function bodyAfterFrontmatter(lines) {
  let c = 0;
  const out = [];
  for (const l of lines) {
    if (l === '---' && c < 2) { c += 1; continue; }
    if (c === 2) out.push(l);
  }
  return out;
}

const SLOP_RE = /\b(comprehensive|robust|elegant|seamless)\b/i;

// Slop-word lines (banned words in prose) — fences + inline code stripped first.
export function slopCount(lines) {
  let inFence = false;
  const prose = [];
  for (const l of lines) {
    if (/^```/.test(l)) { inFence = !inFence; continue; }
    if (!inFence) prose.push(l.replace(/`[^`]*`/g, ''));
  }
  return countLines(prose, SLOP_RE);
}

// metadata.updated date (YYYY-MM-DD) from the frontmatter `metadata:` block.
export function metaUpdated(lines) {
  let inMeta = false;
  for (const l of lines) {
    if (/^metadata:/.test(l)) { inMeta = true; continue; }
    if (inMeta && /^[a-z]/.test(l)) inMeta = false;
    if (inMeta && /updated:/.test(l)) { const m = l.match(/updated:\s*"?([0-9-]*)"?/); return m ? m[1] : ''; }
  }
  return '';
}

// `date -d "YYYY-MM-DD" +%s` in a UTC context.
export function dateToTs(d) {
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
}
