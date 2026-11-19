# Deploy-time modifiers

Modifiers change the **deployed** config for a specific machine profile —
the SoT is never touched. They all share one contract:

> A later flag-less sync reverts the modifier: the settings merge (Claude)
> re-asserts SoT values for kit-owned keys.
> Re-pass the flag on machines that should keep the override. Claude Code has
> no user-scope local settings file; a per-project Claude override belongs in
> that checkout's `.claude/settings.local.json`, which sync never reads or
> writes.

Claude's embedded SoT is `model: opus`, `effortLevel: high`, with advisor
off (`advisorModel` unset).

| Modifier | Deployed change | Typical use |
|----------|-----------------|-------------|
| `--claude-model=<m>` | `.model` in ~/.claude/settings.json (`default` deletes the key) | Override one machine while the SoT retains `opus` |
| `--claude-effort=<level>` | `.effortLevel` in ~/.claude/settings.json (`default` writes `high`) | Tune persisted Claude effort per machine; valid `low`, `medium`, `high`, `xhigh` |
| `--claude-advisor=<state>` | `on` sets `.advisorModel = "opus"`; `off`/`default` remove it | Enable Claude advisor only on machines that need it |
| `--claude-compact-window=<n>` | `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW` | Disposable containers running long autonomous work (e.g. `680k`) — not host machines |
| `--claude-permissive` | `permissions.ask = []`, `permissions.deny = []` | Sandboxes/containers where prompts stall unattended work. Never on a host — the deny list is the safety floor |

Bare effort/advisor flags print their verified catalog and exit 2. Invalid
values do the same with a clear error. Passing a tool-specific modifier without
selecting that positional target warns and ignores it.

A flag-less Claude sync also removes the formerly kit-owned `advisorModel`
from machines synced before advisor became opt-in. Any explicit advisor state
owns that key for the run: `on` writes `opus`; `off` and `default` delete it.

## Standalone get/set (no full sync)

```
docks-kit model claude            # show deployed + SoT + catalog (+ TTY picker)
docks-kit model claude opus       # set deployed model
docks-kit model claude default    # delete the key (account default applies)
```

The set path calls the same engine functions as the sync flags —
one implementation, two entry points.

## Sticky opt-ins are NOT modifiers

`--claude-plugin=<name>` installs+enables an optional plugin and it STAYS
(the SoT has no key to revert against). Only `--prune` removes it.
