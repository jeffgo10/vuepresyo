# Clean Code Guidelines

## Constants Over Magic Numbers

- Replace hard-coded values with named constants.
- Use descriptive constant names that explain the value's purpose.
- Keep constants at the top of the file or in a dedicated constants file.

## Meaningful Names

- Variables, functions, and classes should reveal their purpose.
- Names should explain why something exists and how it's used.
- Avoid abbreviations unless they're universally understood.

## Smart Comments

- Don't comment on what the code does — make the code self-documenting.
- Use comments to explain why something is done a certain way.
- Document APIs, complex algorithms, and non-obvious side effects.

## Single Responsibility

- Each function should do exactly one thing.
- Functions should be small and focused.
- If a function needs a comment to explain what it does, consider splitting it.

## DRY (Don't Repeat Yourself)

- Extract repeated code into reusable functions in `frontend/src/helpers/<topic>/`, `frontend/src/domain/`, or `backend/VuePresyo.Api/Domain/`.
- Share common logic through proper abstraction.
- Maintain single sources of truth.

## CSS — Mobile-First

- Base styles target the smallest viewport (phone, $\le 640\text{px}$). Add layout and spacing for larger screens with `min-width` media queries only — never desktop-first bases patched by `max-width` overrides.
- Use tokens from `frontend/src/style.css`.

## Testing & Quality

- Test edge cases and error conditions.
- Leave code cleaner than you found it.
- Run `dotnet test && cd frontend && npm run build` locally before pushing.

