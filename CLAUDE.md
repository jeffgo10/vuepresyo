# VuePresyo — Claude Code Guidelines

**Product:** VuePresyo — personal receipt-tracking PWA for the GO family group.
**Product Knowledge Base:** Obsidian vault folder `VuePresyo/` (accessed via Docker MCP server `MCP_DOCKER`).

## Architecture & Tech Stack

- **Frontend:** Vue 3 + TypeScript + Vite + Vue Router (`frontend/`, phone-first, max-width 640px), running locally on port `5144`.
- **Design System:** Vanilla CSS in `frontend/src/style.css`. **No Tailwind, Bootstrap, or MUI.**
- **Backend API:** C# ASP.NET Core (.NET 10) minimal API (`backend/VuePresyo.Api`), running locally on port `5143`.
- **Auth:** JWT Bearer Auth (Email/Password via `/api/auth/login` and `/api/auth/me`) — **login only**, no registration UI. Accounts seeded automatically on startup via `DbSeeder`.
- **Database:** SQLite via Entity Framework Core (`backend/VuePresyo.Api/vuepresyo.db`, gitignored). Drop-in portable to PostgreSQL or SQL Server via EF Core.
- **Storage:** Local file storage under `backend/VuePresyo.Api/App_Data/storage/receipts/{groupId}/` (and `products/{groupId}/`), served via `/api/storage/`.
- **API Functions:** Endpoints in `VuePresyoService` (`/api/functions/scanReceipt`, `/api/functions/saveReceipt`, `/api/functions/describeProduct`, `/api/functions/saveProductPhoto`, `/api/functions/declineProductLink`, `/api/functions/updateProductDetails`, `/api/functions/deleteProduct`).
- **Secrets:** Loaded automatically from `.env` (or `backend/VuePresyo.Api/.env`) via `GEMINI_API_KEY` and `VUEPRESYO_SEED_PASSWORD`.

## Critical Business & Data Rules

1. **VAT-Inclusive Calculations (Philippine Receipts):**
   - Prices are VAT-inclusive PHP.
   - For VATable lines, VAT portion is calculated as `lineTotal * 12 / 112`.
   - **Never assert `subtotal + VAT = total`** (US receipt formula).
   - Validation checks:
     1. Sum of `lineTotal` == `totals.total`.
     2. Sum of VATable line totals `* 12 / 112` ≈ printed `totals.vat`.
     3. `vatableNet + vatExemptSales + vat` ≈ `totals.total`.
2. **Key Sanitization:**
   - Item key is `{storeId}_{sanitizedSku}`. Keys must sanitize `. # $ [ ] /`.
3. **Receipt Writes via Backend Service Only:**
   - All receipt writes go through `/api/functions/saveReceipt` (`VuePresyoService.SaveReceiptAsync`).
4. **Privacy:**
   - Buyer name, address, and TIN are never extracted or stored.

## Commands & Skills

Slash commands and skills are available in `.claude/commands/`, `.agents/skills/`, and `.cursor/commands/`:
- `/create-github-pr` — Branch promotion (`feature → dev → master`), local checks, PR opening, post-merge cleanup, hotfix pipeline
- `/sync-obsidian-vuepresyo` — Dual-write updates to Obsidian `VuePresyo/` vault and agent rules
- `/handoff` — Compact session context into an external handoff document in `$TMPDIR`
- `/vuepresyo-explore` — Read-only codebase archaeology before implementation
- `/vuepresyo-verifier` — Skeptical QA validating changes against conventions, rules, and tests

## Verification

Before submitting changes or opening a PR:
```bash
dotnet test && cd frontend && npm run build
```

