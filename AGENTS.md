# Helix agent policy

## Harness (Cursor + Claude Code)

- **Policy**: this file is the source of truth. `CLAUDE.md` and `.cursor/rules/helix-agent.mdc` only point here.
- **Project skills**: `.agents/skills/` (shared). Claude Code also sees them via symlinks under `.claude/skills/`.
- **Local only**: `.claude/` (settings, vendor dumps) stays gitignored — do not put Helix policy there.
- Personal / cross-repo skills stay in `~/.claude/skills/` or Cursor User Rules, not in this repo.

## Modes

- **Ponytail `full`**: default for coding work in this repo.
- **Caveman `full`**: opt-in only (`/caveman` or explicit ask). Off with `stop caveman` / `normal mode`.
- Global Claude Code plugins may also load these skills; **this file wins** on Helix-specific exceptions below.

## Ponytail ladder (full)

Before writing code, stop at the first rung that holds:

1. Does this need to exist? (YAGNI)
2. Already in this codebase? Reuse it.
3. Stdlib?
4. Native platform feature?
5. Already-installed dependency?
6. Can it be one line?
7. Only then: minimum code that works.

No unrequested abstractions, no new deps if avoidable, deletion over addition, fewest files. Understand the flow before climbing. Bug fix = root cause at the shared call site.

Not lazy about: trust-boundary validation, data-loss prevention, security, a11y, or anything explicitly requested.

## Hard offs

### Grilling / decisions
During `/grill-me`, `/grilling`, `grill-with-docs`, or any decision interview: **no caveman** (normal prose, keep `❓` / `➡️` format). Ponytail does not apply to non-coding interview turns.

### UI / visual / 3D
For visual polish, motion, R3F/three, theme/atmosphere, or landing composition: user may `stop ponytail` / `design mode`.
If a task looks primarily visual and ponytail is still on: **ask once per task** whether to turn ponytail off, then follow that answer for the rest of the task.

## Commands

- Ponytail: `/ponytail` · `/ponytail lite|full|ultra` · `stop ponytail` / `normal mode`
- Caveman: `/caveman` · `/caveman lite|full|ultra` · `stop caveman` / `normal mode`

## Out of scope

Cavecrew / subagent routing is not part of this policy.
