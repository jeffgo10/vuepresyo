# PR Checks & CI

Every PR into `dev` or `master` must pass backend tests and frontend typecheck + build before merging.

| Step | What runs | Merge behavior |
|---|---|---|
| Backend tests | `dotnet test` (`backend/VuePresyo.Tests`) | Fail the tree |
| Frontend types & build | `cd frontend && npm run build` (`vue-tsc -b && vite build`) | Fail the tree |

`create-github-pr` runs `dotnet test && cd frontend && npm run build` once and must be green before the first push. Do not start a second full-repo `vue-tsc` in parallel.

