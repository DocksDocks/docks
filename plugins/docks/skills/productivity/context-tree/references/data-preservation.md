# Data preservation — root → nodes relocation

Self-contained algorithm for `init` / `refresh` so no root section is lost when content moves into nodes. This is context-tree's own copy of the kit pattern (the author-facing template lives in `write-skill/references/data-preservation.md`; per the self-sufficiency doctrine each skill keeps its own copy rather than cross-linking a sibling).

## Why per-section, not a byte-percentage

Relocation *adds* scaffolding — `@AGENTS.md` imports, a CLAUDE.md per node, node headings, the root breadcrumb table. So the total bytes written are normally **≥100%** of the original root. A "fail if output dropped > X%" check is therefore backwards: it's too lenient (a whole lost section hides under the added scaffolding) and triggers on the wrong cases. The real invariant is **every original section is accounted for**. Byte-delta is kept only as a coarse *net-shrink* tripwire.

## Step-by-step

### 1. Inventory (before any write)

Snapshot the root context file aside so the original survives the prune:

```bash
cp <root>/AGENTS.md /tmp/root.before
grep -nE '^#{1,3} ' /tmp/root.before        # the section list you must account for
wc -c < /tmp/root.before                     # baseline bytes
```

### 2. Per-section relocation table (the gate)

Render at the approval gate — alongside the node list — a row for EVERY section:

```text
| Section (root heading)        | Destination                  | Reason                         |
|-------------------------------|------------------------------|--------------------------------|
| ## Authoring skills           | plugins/docks/skills/AGENTS.md| folder-local authoring rules   |
| ## CI triggers                | .github/AGENTS.md            | CI config change axis          |
| ## Repository purpose         | KEEP in root                 | cross-cutting; not folder-local |
| ## Legacy notes               | DROP (user-confirmed)        | obsolete — explicit drop       |
```

Defaults: anything you cannot confidently route → **KEEP in root** (never silently move or drop). `DROP` requires an explicit user mark. MIXED sections (part stays, part moves) split paragraph-by-paragraph; the unclassified remainder stays in root.

Then **end the turn** and wait (the turn-ending approval gate). `--dry-run` stops here permanently.

### 3. Two-phase write

**Phase A — nodes first, root untouched.** Write each `<folder>/AGENTS.md` + `CLAUDE.md`, copying the routed sections **verbatim** (reformatting heading levels / list markers is fine; rewording is not). Run `bash scripts/tree/guard.sh`. If you halt now, the root still has everything — worst case is duplication, which is recoverable. Loss is not.

**Phase B — prune root last.** Show the exact lines to remove (the relocated sections), confirm, then delete them and insert the one-line breadcrumb per node. Never delete a section you cannot point to inside an already-written node.

### 4. Verification (fail loud)

```bash
# every original section heading must appear somewhere downstream
while IFS= read -r h; do
  grep -rqF "$h" <written-nodes> <root>/AGENTS.md || echo "LOST SECTION: $h"
done < <(grep -E '^#{1,3} ' /tmp/root.before)
# net-shrink tripwire (expect total >= original because scaffolding was added)
before=$(wc -c < /tmp/root.before)
after=$(cat <root>/AGENTS.md <every-written-node> | wc -c)
awk -v b="$before" -v a="$after" 'BEGIN{ if (a < b) print "NET SHRINK — investigate" }'
```

Any `LOST SECTION` (other than a user-confirmed `DROP`) or `NET SHRINK` line ⇒ restore `<root>/AGENTS.md` from `/tmp/root.before`, locate the content, and re-run. Do not report the tree complete with an open miss.

## Quick checklist

- [ ] Original root copied to `/tmp/root.before` before any write
- [ ] Relocation table covers every `^#{1,3}` section; unclassified → KEEP in root
- [ ] Turn ended at the gate; nothing written before the user replied
- [ ] Phase A wrote nodes + `tree/guard.sh` passed BEFORE any root deletion
- [ ] Phase B pruned root only after the second confirmation
- [ ] Verification: zero `LOST SECTION` / `NET SHRINK` lines (DROPs excepted)
