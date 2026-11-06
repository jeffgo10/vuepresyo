---
name: handoff
description: Compact the current Antigravity session into a structured handoff document for the next agent session (rules, skills, git, env), saved to the OS temp directory.
---

# Handoff — compact session for the next Agent

Summarize the current chat into a **handoff document** a fresh agent can use to continue without re-discovering context. Save the file **outside the repo** (OS temp directory), not in the workspace.

## Mode — read trailing user text

| Trailing text | Mode |
|---|---|
| Empty | **Full handoff** — goal, progress, blockers, env, suggested next steps |
| Describes next focus (e.g. "finish scan fix", "open PR only") | **Tailored** — same structure, prioritize that focus |
| "minimal" or "short" | **Minimal** — Goal, Current state, Next 3 steps, Critical paths only |
| "with transcript" | **Full + transcript ref** — include path to this session's agent transcript |

If ambiguous, default to **Full handoff**.

---

## Step 1 — Gather context

1. **User intent** — what was asked; what evolved mid-session.
2. **Trailing text** — next-session focus from the mode table.
3. **Git** (when a repo exists):
   ```bash
   git branch --show-current
   git status --short
   git log -5 --oneline
   ```
4. **Changed files** — list paths; do not paste full diffs.
5. **Terminals & servers** — if C# backend (port `5143`) or Vite frontend (port `5144`) matter, note them.
6. **Agent artifacts & rules** — `.agents/rules/`, `.agents/skills/`, MCP servers that matter.
7. **External refs** — PRs, Obsidian notes (`VuePresyo/`) — path or URL only.

**Do not duplicate** PRDs, roadmaps, or diffs. **Reference by path.** **Redact** secrets and PII.

---

## Step 2 — Write the handoff file

| OS | Directory |
|---|---|
| macOS / Linux | `$TMPDIR` or `/tmp` |
| Windows | `%TEMP%` |

**Filename:** `vuepresyo-handoff-<repo-basename>-<YYYYMMDD-HHMM>.md`
Example: `/tmp/vuepresyo-handoff-20261106-0930.md`

Tell the user the **full absolute path** when done.

### Document template

```markdown
# Agent handoff — <short title>

**Generated:** <ISO date/time>
**Repo:** <absolute workspace path>
**Branch:** <branch> (<clean | dirty | no git>)
**Next session focus:** <from user trailing text or "continue current task">

## Goal
<1–3 sentences>

## Current state
<Bullets: done / in progress / unverified>

## Key decisions & constraints
<Non-obvious choices>

## Files & artifacts (reference only)
| Path | Relevance |
|---|---|
| `path/to/file` | <one line> |

## Environment & dev notes
<Ports, env var names only>

## Blockers & open questions
…

## Suggested next steps
1. …

## Agent continuation guide

### Rules to read first
- `.agents/rules/<file>.md` — <why>

### Suggested skills
| Skill | When |
|---|---|
| `create-github-pr` | Push, CI validation, and open PR |
| `sync-obsidian-vuepresyo` | Sync noteworthy decisions to vault |
| `vuepresyo-verifier` | QA changes against constraints |
| `vuepresyo-explore` | Trace flow before implementation |

### MCP / tools
- Obsidian `VuePresyo/` via `MCP_DOCKER`

### Recommended mode
<Architect | Code | Debug | Review>
```

---

## Step 3 — Quality bar

- [ ] Next agent can act in **≤2 minutes** without re-reading the whole conversation.
- [ ] Every file mention is a clickable **path**, not a pasted blob.
- [ ] **Next steps** are actionable (verb + target).
- [ ] No secrets or sensitive keys in the saved file.
- [ ] Output provides the user with the **absolute path**.

Do **not** commit the handoff file to version control unless the user explicitly requests it.
