# VuePresyo Code Style

One phone-first surface. No ops/admin split.

## Folder Layout

```
frontend/src/views/      # routes: login, home, scan, review, receipts, compare, items
frontend/src/components/ # AppShell, receipt rows, review editor, modals
frontend/src/helpers/    # kebab-case files; named exports
frontend/src/lib/        # API client, auth session, PWA offline queue
frontend/src/domain/     # pure receipt/VAT/comparison logic
backend/VuePresyo.Api/   # C# .NET 10 API, EF Core SQLite Data, Domain, Services
backend/VuePresyo.Tests/ # xUnit integration & domain tests
```

## Files and Exports

- **Vue Components / Views:** PascalCase `.vue` SFCs (`<script setup lang="ts">`).
- **Helpers and domain:** kebab-case or topic `.ts` file, **named exports**.
- **C# Backend:** PascalCase files and types in `VuePresyo.Api.*` namespaces.
- Constants at file top. True constants `SCREAMING_SNAKE`.
- Phone column max width is 640px.

## UI Conventions

- Use the CSS variables in `frontend/src/style.css`. Do not invent a second palette.
- Base styles are phone-first. Add `min-width` overrides only when a review layout needs the photo beside the form.
- Bottom nav: Home, Receipts, Compare, Items, plus Scan action.

