# VuePresyo — Antigravity Agent Guidelines

**Product:** VuePresyo — personal receipt-tracking PWA.
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
- **AI Model:** `gemini-2.5-flash` (configurable via `GEMINI_MODEL`).

## Critical Business & Data Rules

1. **VAT-Inclusive Calculations (Philippine Receipts):**
   - Prices are VAT-inclusive PHP.
   - For VATable lines, VAT portion is calculated as $\text{lineTotal} \times \frac{12}{112}$.
   - **Never assert `subtotal + VAT = total`** (US receipt formula).
   - Validation checks:
     1. Sum of `lineTotal` == `totals.total`.
     2. Sum of VATable line totals $\times \frac{12}{112} \approx$ printed `totals.vat`.
     3. `vatableNet + vatExemptSales + vat` $\approx$ `totals.total`.
2. **Key Sanitization:**
   - Item key is `{storeId}_{sanitizedSku}`. Keys must sanitize `. # $ [ ] /`.
3. **Receipt Writes via Backend Service Only:**
   - The client never writes directly to database tables; all receipt writes go through `/api/functions/saveReceipt` (`VuePresyoService.SaveReceiptAsync`).
4. **Privacy:**
   - Buyer name, address, and TIN are never extracted or stored.

## Workspace Customization: Skills & Commands

The project defines dedicated Antigravity skills in `.agents/skills/`:

| Skill | Purpose | Invocations |
|---|---|---|
| [`create-github-pr`](.agents/skills/create-github-pr/SKILL.md) | Branch promotion (`feature → dev → master`), local CI checks, PR opening, post-merge branch cleanup, hotfix pipeline | `/create-github-pr`, `/create-github-pr hotfix`, "open PR", "promote to master", "hotfix" |
| [`sync-obsidian-vuepresyo`](.agents/skills/sync-obsidian-vuepresyo/SKILL.md) | Dual-write updates to Obsidian `VuePresyo/` vault and agent rules via Docker MCP | `/sync-obsidian-vuepresyo`, "sync obsidian" |
| [`handoff`](.agents/skills/handoff/SKILL.md) | Compact session context into an external handoff document in `$TMPDIR` | `/handoff`, "create handoff" |
| [`vuepresyo-explore`](.agents/skills/vuepresyo-explore/SKILL.md) | Read-only codebase archaeology before implementation | "explore receipt scan flow", "trace auth" |
| [`vuepresyo-verifier`](.agents/skills/vuepresyo-verifier/SKILL.md) | Skeptical QA validating changes against conventions, rules, and tests | "verify implementation", "verify auth" |

## Workspace Rules

Detailed rules are located in [`.agents/rules/`](.agents/rules/):
- [`vuepresyo-project.md`](.agents/rules/vuepresyo-project.md): Overall roadmap, phase status, directory layout.
- [`vuepresyo-receipts.md`](.agents/rules/vuepresyo-receipts.md): Detailed receipt extraction, VAT rules, DB schema.
- [`vuepresyo-local-dev.md`](.agents/rules/vuepresyo-local-dev.md): Ports (`5143` backend, `5144` frontend), seeding, `.env` Gemini secret handling.
- [`vuepresyo-code-style.md`](.agents/rules/vuepresyo-code-style.md): Component naming, exports, phone layout.
- [`vuepresyo-auth.md`](.agents/rules/vuepresyo-auth.md): Login flow, group membership, JWT security rules.
- [`vuepresyo-ci.md`](.agents/rules/vuepresyo-ci.md): Build, test, and typecheck gate requirements.
- [`vuepresyo-typecheck.md`](.agents/rules/vuepresyo-typecheck.md): Memory protection: at most one `vue-tsc` running at a time.
- [`vuepresyo-version.md`](.agents/rules/vuepresyo-version.md): App semver source of truth, PR version bumping, and PWA manifest/service worker sync.
- [`clean-code.md`](.agents/rules/clean-code.md): Constants, naming, single responsibility, mobile-first CSS.
- [`UI-UX/`](.agents/rules/UI-UX/): Core design principles, accessibility, and navigation.

## CI & Verification

Before submitting changes or opening a PR:
```bash
dotnet test && cd frontend && npm run build
```
