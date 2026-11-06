---
name: sync-obsidian-vuepresyo
description: Sync recent work and architectural decisions to the Obsidian VuePresyo vault via Docker MCP and optionally refresh Antigravity/Cursor rules.
---

# Sync Obsidian VuePresyo notes (+ optional Antigravity & Cursor rules)

Document recent changes in the Obsidian **VuePresyo** vault via Docker MCP (`MCP_DOCKER`), and optionally refresh `.agents/rules/` and `.cursor/rules/` when agent guidance should match.

Follow the guidelines in [vuepresyo-knowledge-sync.md](../../rules/vuepresyo-knowledge-sync.md).

## Mode — read trailing user text

| Trailing text | Mode |
|---|---|
| Empty, or "obsidian only" | **Obsidian** — update vault notes only |
| Contains "rules", "cursor rules", "antigravity rules", or "both" | **Obsidian + Rules** — vault first, then sync rules |
| Starts with "rules only" | **Rules only** — skip Obsidian; update agent rules from repo/docs |
| Describes specific topic (e.g. "auth", "receipts") | Scope sync to that topic only |

If ambiguous, default to **Obsidian + Rules**.

---

## Step 0 — MCP pre-check (required before any Obsidian write)

1. **Probe:** Call `obsidian_list_files_in_dir` with `{ "dirpath": "VuePresyo" }` via `MCP_DOCKER`.
2. **If probe fails** — stop Obsidian work; report the connection issue; still run **Rules only** if requested. Do not call `obsidian_append_content` or `obsidian_patch_content`.

---

## Step 1 — Discover what changed

1. **Trailing user text**
2. **Git** — `git status`, `git diff`, `git log -5 --oneline` (skip if no repo)
3. **Conversation** — decisions and fixes from this session
4. **Repo docs** — `README.md`, `.agents/rules/`, `.cursor/rules/`

Skip trivial changes.

---

## Step 2 — Choose Obsidian targets

| Change type | Target note | Action |
|---|---|---|
| Phase / roadmap | `VuePresyo/Roadmap.md` | Patch heading or append dated section |
| Product rules | `VuePresyo/README.md`, `Tech Stack.md`, `Definition Flow.md`, `Gemini Prompt.md` | Patch the matching note |
| Resolved bug / gotcha | `VuePresyo/Notes — <title>.md` | Create or update |

**Noteworthy naming:** `Notes — <Topic>.md`

**Always read before write.**

### Note template

```markdown
# Notes — <Topic>

**When:** <month year>
**Context:** <one line>

## Symptom / goal
…

## Cause
…

## Fix
…

## Files touched
- `path/to/file.ts`

## Related
- [[Roadmap]]
- Repo: `.agents/rules/…`
```

Keep notes under ~60 lines.

---

## Step 3 — Update Obsidian

| Tool | Use for |
|---|---|
| `obsidian_get_file_contents` | Read first |
| `obsidian_patch_content` | Update a heading |
| `obsidian_append_content` | New note or dated changelog |
| `obsidian_list_files_in_dir` | Avoid duplicate note titles |

---

## Step 4 — Update Agent rules (when mode includes rules)

Sync corresponding rules in `.agents/rules/` (and `.cursor/rules/`):

| Rule file | Update when |
|---|---|
| `vuepresyo-project.md` | Phase status, layout, stack |
| `vuepresyo-code-style.md` | Folder and component conventions |
| `vuepresyo-auth.md` | Login, membership, JWT rules |
| `vuepresyo-receipts.md` | VAT, keys, writes |
| `vuepresyo-local-dev.md` | Scripts, ports, Gemini secret |
| `vuepresyo-knowledge-sync.md` | Only if this workflow changes |

Rules stay under ~80 lines. **Source of truth order:** repo code > Obsidian > conversation.

---

## Step 5 — Report

```markdown
## Obsidian sync report

### MCP
- Pre-check: ok / failed

### Notes updated
| Note | Action |
|---|---|
| VuePresyo/… | Created / Patched / Appended |

### Rules updated (if any)
- `vuepresyo-….md` — …

### Skipped (with reason)
- …
```

---

## Guardrails

- Never duplicate an existing note — search `VuePresyo/` first.
- Never put secrets or `.env` values in Obsidian.
- Never update Obsidian when MCP pre-check fails.
- Avoid long narrative docs — details live in the codebase and rules.
