---
name: create-github-pr
description: Analyze branch commits, draft a PR, and open it with gh. Cleanup syncs the base after a merge.
argument-hint: "draft only | to master | cleanup | title: …"
disable-model-invocation: true
---

# Create GitHub PR from branch commits

Analyze commits and diffs on the current branch, draft a PR title and description, push if needed, and open a pull request with `gh`. **Cleanup mode** syncs the default branch after a merged PR.

**Branch strategy:** Promotion flow is `feature → dev → master`.

- **`dev`** — integration branch. Open everyday **feature PRs into `dev`**.
- **`master`** — release branch. Promote with a **`dev` → `master`** PR (release).

`dev` and `master` are both **long-lived branches** — never delete them, and never create or retarget a `main` branch. Release PRs (`dev`→`master`) use `dev` as head, **not** a feature branch.

## Mode — read trailing user text

| Trailing text | Mode |
|---|---|
| Empty | **Create** — analyze, push if needed, open PR **into `dev`** |
| `dev`, `to dev`, or `integration` | **Create** — base **`dev`** (same as default) |
| `master`, `to master`, `main`, `to main`, `release`, or `promote` | **Create (release)** — base **`master`**, head **`dev`** |
| `cleanup` or `post-merge` | **Cleanup** — sync default branch, switch to it, delete merged feature branch |
| `draft only`, `preview`, or `dry run` | **Draft only** — show proposed title/body; do not push or create PR |
| `draft pr` or `as draft` | **Create draft PR** — `gh pr create --draft` |
| Contains `base:` or `into:` | Override base branch |
| Contains `title:` | Use as title hint |
| Describes scope | Narrow summary to that scope; still list all commits |

**Default base branch:** `dev`. Cleanup after a feature PR syncs `dev`; after a release PR (base `master`) syncs `master` and `dev`.

**Release PRs (`dev`→`master`)** diff two long-lived branches, so **do not create or commit a feature branch** — check out `dev`, make sure it's up to date, then open the PR with `--base master --head dev`. If the working tree is dirty, that dirty work belongs on a feature branch into `dev` first — stop and say so.

If trailing text is **cleanup**, skip Create — run **Cleanup mode** only.

### Uncommitted changes (feature Create into `dev`)

When creating a feature PR and the working tree has changes **outside** ignored local state:

1. **Do not ask** whether to commit only, commit + PR, or cancel.
2. Create a feature branch if currently on `main` / `master` / `dev`.
3. Stage relevant files (exclude `.env*`, `*.db*`, `App_Data/`, credentials, and secrets).
4. Commit with a concise message.
5. Continue Create: run `dotnet test && cd frontend && npm run build`, push + open PR.

---

## Step 1 — Gather git context

```bash
git status
git branch -vv
git remote -v
git log --oneline -15
git fetch origin <base> 2>/dev/null || true
git log origin/<base>..HEAD --oneline
git diff origin/<base>...HEAD --stat
git diff origin/<base>...HEAD
```

---

## Step 2 — Draft PR title & description

```markdown
## Summary
<2–4 sentences>

## Changes

### Frontend (Vue 3)
- …

### Backend (C# .NET 10)
- …

### Docs / tooling
- …

## Commits
| SHA | Message |
|-----|---------|
| `abc1234` | … |

## Test plan
- [ ] `dotnet test`
- [ ] `cd frontend && npm run build`
```

---

## Step 3 — Branch, test, commit (if dirty), and push

1. Feature branch `feat/` / `fix/` / `chore/` if on `master`/`dev`.
2. Commit product changes. Never stage `.env*`, `*.db*`, or `App_Data/`.
3. Run `dotnet test && cd frontend && npm run build` once and wait for it to pass. Do not push if it fails.
4. `git push -u origin HEAD` — never force-push to `main`/`master`/`dev`.
5. Open PR with `gh pr create --base dev ...` (or `--base master --head dev` for release).

