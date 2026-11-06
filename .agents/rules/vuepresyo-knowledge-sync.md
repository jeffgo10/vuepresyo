# VuePresyo Knowledge Sync (Agent Rules + Obsidian)

When you learn or decide something worth keeping — architecture, coding patterns, resolved bugs, dev workflow — capture it in **both** places below.

## When to Capture

- Non-obvious conventions or constraints discovered while coding
- Resolved bugs with a non-trivial root cause or fix
- Architecture or data-flow decisions
- Backend API, EF Core SQLite, or Vue frontend quirks
- New models, endpoints, or routes

Skip trivial one-off fixes, typos, and anything already documented.

## Destination 1 — Agent Rules & Skills (always)

**Rules** in `.agents/rules/` and `.cursor/rules/`:
- One concern per file; keep under ~80 lines.
- Prefer updating an existing rule over creating duplicates.

**Skills** in `.agents/skills/`:
- Multi-step procedures and specialized runbooks.

## Destination 2 — Obsidian VuePresyo Vault (when MCP is up)

**MCP Server:** `MCP_DOCKER`
**Vault Folder:** `VuePresyo/` (relative to vault root)

| Content type | Obsidian target |
|---|---|
| Phase status, deliverables | `VuePresyo/Roadmap.md` |
| Product rules | `VuePresyo/README.md`, `Tech Stack.md`, `Definition Flow.md` |
| Resolved issues, gotchas | `VuePresyo/Notes — <short title>.md` |

Use `obsidian_patch_content` to update a heading; `obsidian_append_content` for dated log entries. Read first with `obsidian_get_file_contents`.

## Pre-Check (required before any Obsidian write)

1. **Connection probe:** `obsidian_list_files_in_dir` with `{ "dirpath": "VuePresyo" }`.
2. **If probe succeeds:** proceed with Obsidian read/write.
3. **If probe fails:** still write/update agent rules and repo docs; notify the user that Obsidian sync was skipped; do **not** block the primary task.

Never call `obsidian_append_content` or `obsidian_patch_content` without a successful pre-check in the same session.

