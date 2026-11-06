---
name: handoff
description: Compact the current Cursor session into a handoff doc for the next agent (rules, skills, git, env).
argument-hint: "Next session focus (optional): e.g. finish auth fix, open PR, minimal"
disable-model-invocation: true
---

# Handoff — compact session for the next Cursor agent

Summarize the current chat into a **handoff document** a fresh Cursor agent can use to continue without re-discovering context. Save the file **outside the repo** (OS temp directory), not in the workspace.

## Mode — read trailing user text

| Trailing text | Mode |
|---|---|
| Empty | **Full handoff** — goal, progress, blockers, env, suggested next steps |
| Describes next focus (e.g. "finish scan fix", "open PR only") | **Tailored** — same structure, prioritize that focus |
| "minimal" or "short" | **Minimal** — Goal, Current state, Next 3 steps, Critical paths only |
| "with transcript" | **Full + transcript ref** — include path to this session's agent transcript if discoverable |

If ambiguous, default to **Full handoff**.

---

## Step 1 — Gather context (do not guess)

1. **User intent** — what they asked for; what changed mid-session.
2. **Trailing text** — next-session focus from the mode table.
3. **Git** (when a repo exists):
   ```bash
   git branch --show-current
   git status --short
   git log -5 --oneline
   ```
4. **Changed files** — list paths; do not paste full diffs.
5. **Terminals** — if C# backend (`5143`) or Vite frontend (`5144`) matter, note ports.
6. **Cursor artifacts** — rules, commands, skills, MCP servers that matter.
7. **External refs** — PRs, Obsidian notes — path or URL only.

**Do not duplicate** PRDs, roadmaps, or diffs. **Reference by path.** **Redact** secrets and PII.

---

## Step 2 — Write the handoff file

| OS | Directory |
|---|---|
| macOS / Linux | `$TMPDIR` or `/tmp` |
| Windows | `%TEMP%` |

**Filename:** `cursor-handoff-<repo-basename>-<YYYYMMDD-HHMM>.md`
Example: `/tmp/cursor-handoff-vuepresyo-20261106-0930.md`

Tell the user the **full absolute path** when done.

---

## Step 3 — VuePresyo defaults

| Topic | Read first |
|---|---|
| Project overview | `.cursor/rules/vuepresyo-project.mdc` |
| Code style | `.cursor/rules/vuepresyo-code-style.mdc` |
| Auth | `.cursor/rules/vuepresyo-auth.mdc` |
| Receipts | `.cursor/rules/vuepresyo-receipts.mdc` |
| Local dev | `.cursor/rules/vuepresyo-local-dev.mdc` |
| Knowledge sync | `.cursor/rules/vuepresyo-knowledge-sync.mdc`, `/sync-obsidian-vuepresyo` |
| Open PR | `/create-github-pr` |

