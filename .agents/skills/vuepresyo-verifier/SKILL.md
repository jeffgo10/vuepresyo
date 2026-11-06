---
name: vuepresyo-verifier
description: Skeptical QA and verification for VuePresyo changes. Use after implementing auth, scan, review, save, or C# API endpoints to verify claims against the repo.
---

# VuePresyo Verification Specialist

Perform skeptical QA on changes in the VuePresyo codebase. **Challenge completion claims** — do not mark a task verified unless all conventions, tests, and constraints pass without errors.

## Context anchors

| Topic | Rule |
|---|---|
| Project Structure | [vuepresyo-project.md](../../rules/vuepresyo-project.md) |
| Code Conventions | [vuepresyo-code-style.md](../../rules/vuepresyo-code-style.md) |
| Auth & Security | [vuepresyo-auth.md](../../rules/vuepresyo-auth.md) |
| Receipt & VAT Logic | [vuepresyo-receipts.md](../../rules/vuepresyo-receipts.md) |
| Local Dev & Testing | [vuepresyo-local-dev.md](../../rules/vuepresyo-local-dev.md) |

## Verification workflow

1. **Scope** — list what was claimed done.
2. **Diff** — run `git diff` / `git status`; flag files outside stated scope.
3. **Conventions checklist**:
   - [ ] No external UI framework (no Tailwind, Bootstrap, or MUI).
   - [ ] Uses CSS variables from `frontend/src/style.css`.
   - [ ] Domain logic isolated in `frontend/src/domain/` and `backend/VuePresyo.Api/Domain/`; UI helpers in `frontend/src/helpers/<topic>/`.
   - [ ] Login only — no registration UI or client user creation.
   - [ ] Receipt writes go through `/api/functions/saveReceipt` (`VuePresyoService.SaveReceiptAsync`).
   - [ ] Buyer name, address, and TIN are never extracted or stored.
   - [ ] Prices stay VAT-inclusive PHP ($\frac{12}{112}$ portion); never assert `subtotal + VAT = total`.
4. **CI & Types verification**:
   - Run `dotnet test` and `cd frontend && npm run build`.
5. **Gaps & Risks** — identify unhandled edge cases, TODOs, or missing test coverage.

## Report format

```markdown
## VuePresyo verification — <short title>

**Verdict:** Verified | Gaps found | Blocked

### What was checked
- …

### Confirmed
- …

### Gaps / risks (priority order)
1. **Critical** — …
2. **Should fix** — …
3. **Nice to have** — …

### Suggested verification commands
- [ ] `dotnet test && cd frontend && npm run build`
- [ ] …

### Follow-ups
- Run `create-github-pr` if verified green.
- Run `sync-obsidian-vuepresyo` if significant architecture changes occurred.
```

