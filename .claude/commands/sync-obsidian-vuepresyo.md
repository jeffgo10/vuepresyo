---
name: sync-obsidian-vuepresyo
description: Sync recent work to the Obsidian VuePresyo vault and optionally refresh Cursor rules.
argument-hint: "obsidian only | rules only | both | topic"
disable-model-invocation: true
---

# Sync Obsidian VuePresyo notes (+ optional Cursor rules)

Document recent changes in the Obsidian **VuePresyo** vault via MCP, and optionally refresh `.cursor/rules/` when agent guidance should match.

Follow `.cursor/rules/vuepresyo-knowledge-sync.mdc`.

## Mode — read trailing user text

| Trailing text | Mode |
|---|---|
| Empty, or "obsidian only" | **Obsidian** — update vault notes only |
| Contains "rules", "cursor rules", or "both" | **Obsidian + Rules** — vault first, then sync `.cursor/rules/*.mdc` |
| Starts with "rules only" | **Rules only** — skip Obsidian; update Cursor rules from repo/docs |
| Describes specific topic (e.g. "auth", "receipts") | Scope sync to that topic only |

If ambiguous, default to **Obsidian + Rules**.

---

## Step 0 — MCP pre-check (required before any Obsidian write)

1. **Probe:** `obsidian_list_files_in_dir` with `{ "dirpath": "VuePresyo" }`.
2. **If probe fails** — stop Obsidian work; report why; still run **Rules only** if requested. Do not call `obsidian_append_content` or `obsidian_patch_content`.

---

## Step 1 — Discover what changed

1. **Trailing user text**
2. **Git** — `git status`, `git diff`, `git log -5 --oneline` (skip if no repo)
3. **Conversation** — decisions and fixes from this session
4. **Repo docs** — `README.md`, `.cursor/rules/`

Skip trivial changes.

---

## Step 2 — Choose Obsidian targets

| Change type | Target note | Action |
|---|---|---|
| Phase / roadmap | `VuePresyo/Roadmap.md` | Patch heading or append dated section |
| Product rules | `VuePresyo/README.md`, `Tech Stack.md`, `Definition Flow.md`, `Gemini Prompt.md` | Patch the matching note |
| Resolved bug / gotcha | `VuePresyo/Notes — <title>.md` | Create or update |

---

## Step 3 — Update Cursor rules (when mode includes rules)

| Rule file | Update when |
|---|---|
| `vuepresyo-project.mdc` | Phase status, layout, stack |
| `vuepresyo-code-style.mdc` | Folder and component conventions |
| `vuepresyo-auth.mdc` | Login, membership, JWT rules |
| `vuepresyo-receipts.mdc` | VAT, keys, writes |
| `vuepresyo-local-dev.mdc` | Scripts, ports, Gemini secret |
| `vuepresyo-knowledge-sync.mdc` | Only if this workflow changes |
