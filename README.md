# VuePresyo (Vue 3 + C# .NET 10)

Philippine grocery & receipt price tracker, built with **Vue 3 + TypeScript + Vite** on the frontend and **C# ASP.NET Core (.NET 10) + Entity Framework Core + SQLite** on the backend.

## Database Architecture & Recommendation

### Primary Database: **SQLite via Entity Framework Core (`Microsoft.EntityFrameworkCore.Sqlite`)**
- **Why SQLite + EF Core fits best**:
  - **Zero external server setup**: Runs embedded in the .NET 10 process (`vuepresyo.db`) with ACID transactions, foreign keys, and indexes out-of-the-box.
  - **Relational replacement for Firebase RTDB**: Maps all collections (`groups`, `users`, `stores`, `products`, `receipts`, `receiptItems`, `priceHistory`, `priceChanges`, `productLinkDeclines`, and `receiptDuplicateIndex` via a unique index on `Receipts.DuplicateKey`) into strongly typed C# entities in [`AppDbContext`](backend/VuePresyo.Api/Data/AppDbContext.cs).
  - **Drop-in PostgreSQL / SQL Server portability**: Because all data access uses standard LINQ and Entity Framework Core in [`AppDbContext`](backend/VuePresyo.Api/Data/AppDbContext.cs), switching to **PostgreSQL** (`Npgsql.EntityFrameworkCore.PostgreSQL`) or **SQL Server** (`Microsoft.EntityFrameworkCore.SqlServer`) for multi-instance cloud hosting requires only a 1-line provider swap in [`Program.cs`](backend/VuePresyo.Api/Program.cs).

## Running Locally

### Quick Start: Run Both Backend + Frontend Together (Consolidated Logs)
1. Copy `.env.example` to `.env` (or `backend/VuePresyo.Api/.env`) and set `GEMINI_API_KEY`.
2. From `frontend/`, run:
```bash
cd frontend
npm run dev:all
# or: npm start
```
- Starts the C# .NET 10 API on `http://localhost:5143` (`[backend]`) and Vite dev server on `http://localhost:5144` (`[frontend]`) in a single terminal with color-coded logs.

### Or Run Separately

#### 1. Start the C# .NET 10 API (`http://localhost:5143`)
```bash
dotnet run --project backend/VuePresyo.Api
```
- Automatically loads `.env`, creates `backend/VuePresyo.Api/vuepresyo.db`, and seeds Group `GO`, users **Aidee** (`abdinglasa@gmail.com`) and **Jeff** (`jeffrey.t.go@gmail.com`) with password `local-only` (configurable via `VUEPRESYO_SEED_PASSWORD` in `.env`), and demo stores/products.

#### 2. Start the Vue 3 + Vite Frontend (`http://localhost:5144`)
```bash
cd frontend
npm run dev
```
- Proxies `/api/*` requests to `http://localhost:5143`.

### 3. Run Tests & Production Build
```bash
dotnet test
cd frontend && npm run build
```

