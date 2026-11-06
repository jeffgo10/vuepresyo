# VuePresyo Local Development

| Process | Command | Port |
|---|---|---|
| Both Backend + Frontend (consolidated logs) | `cd frontend && npm run dev:all` (or `npm start`) | `5143` + `5144` |
| C# .NET 10 API Backend | `dotnet run --project backend/VuePresyo.Api` | `5143` |
| Vue 3 + Vite Frontend | `cd frontend && npm run dev` | `5144` |

Vite (`5144`) proxies `/api/*` requests to `http://localhost:5143`.

## Database & Seed

`backend/VuePresyo.Api` uses SQLite (`backend/VuePresyo.Api/vuepresyo.db`) via Entity Framework Core.
On startup, `DbSeeder.SeedAsync` automatically creates the database tables and seeds Group `GO`, users **Aidee** (`abdinglasa@gmail.com`) and **Jeff** (`jeffrey.t.go@gmail.com`), and initial demo stores/products. The seed password comes from `VUEPRESYO_SEED_PASSWORD` in `.env` (defaults to `local-only`).

## Gemini & `.env`

`Program.cs` automatically loads `.env` from the workspace root or `backend/VuePresyo.Api/.env`.
`scanReceipt` and `describeProduct` read `GEMINI_API_KEY` from `.env` and call `gemini-2.5-flash` (or `GEMINI_MODEL`). **Use sample receipt** does not call Gemini.

## Git Ignore Rules

Do not commit `.env`, `.env.local`, `*.db`, `*.db-shm`, `*.db-wal`, or `backend/VuePresyo.Api/App_Data/`.

