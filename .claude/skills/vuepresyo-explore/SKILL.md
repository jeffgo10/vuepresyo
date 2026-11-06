---
name: vuepresyo-explore
description: Deep codebase archaeology for VuePresyo. Use when tracing login, scan, review, save, or C# API endpoints before implementation. Operates read-only.
---

# VuePresyo Codebase Explorer

Map **how things work today** in the VuePresyo codebase so you can plan or implement with accurate file paths. Operate read-only during exploration — do not implement unless explicitly instructed.

If an expected path does not exist yet, state so and point to the intended location based on [vuepresyo-project.md](../../rules/vuepresyo-project.md).

## Context anchors

| Area | Start here | Rule |
|---|---|---|
| Layout & Stack | `.agents/rules/vuepresyo-project.md` | `vuepresyo-project.md` |
| UI & Tokens | `frontend/src/style.css`, `frontend/src/components/`, `frontend/src/views/` | `vuepresyo-code-style.md` |
| Code style | `frontend/src/helpers/`, `frontend/src/domain/`, `backend/VuePresyo.Api/Domain/` | `vuepresyo-code-style.md` |
| Auth & Group | `frontend/src/lib/auth-session.ts`, `backend/VuePresyo.Api/Services/JwtTokenService.cs`, `backend/VuePresyo.Api/Data/DbSeeder.cs` | `vuepresyo-auth.md` |
| Receipts & VAT | `frontend/src/domain/`, `backend/VuePresyo.Api/Domain/`, `backend/VuePresyo.Api/Services/VuePresyoService.cs` | `vuepresyo-receipts.md` |
| Local dev & Ports | `frontend/package.json`, `frontend/vite.config.ts`, `backend/VuePresyo.Api/Program.cs` | `vuepresyo-local-dev.md` |
| Product specs | Obsidian `VuePresyo/` (or repo docs) | — |

## Exploration workflow

1. **Restate the question or goal.**
2. **Search** — symbols, routes, models, C# API endpoints, and domain types.
3. **Trace** — Vue UI (`frontend/src/`) → API client (`frontend/src/lib/api.ts`) → C# ASP.NET Core endpoint (`Program.cs` / `VuePresyoService.cs`) → EF Core SQLite (`AppDbContext.cs`) or Storage.
4. **Document** — files with one-line roles; identified gaps; surprising dependencies.

## Report format

```markdown
## VuePresyo exploration — <topic>

### Question
…

### Entry points
| File | Role |
|---|---|
| `path/…` | … |

### Data / control flow
…

### Key symbols & env vars
- …

### Gaps / unknowns
- …

### Recommended implementation touch points
| Priority | File | Why |
|---|---|---|
| 1 | `…` | … |

### Suggested next step
- Proceed with implementation / refinement plan
```

Always cite real workspace paths.
