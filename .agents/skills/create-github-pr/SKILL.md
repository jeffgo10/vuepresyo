---
name: create-github-pr
description: Analyze branch commits, draft a PR, and open it with gh. Also handles post-merge cleanup and full end-to-end hotfix promotion (feature → dev → master).
---

# Create GitHub PR from branch commits

Analyze commits and diffs on the current branch, draft a PR title and description, push if needed, and open a pull request with `gh`. **Cleanup mode** syncs the default branch after a merged PR. **Hotfix mode** automates the entire lifecycle (branch → PR to dev → approve/merge → cleanup → PR to master → approve/merge).

**Default Behavior:**
When invoked (even with empty trailing text), analyze git state, run local CI checks, create/switch to a feature branch if on `dev`, stage changes (excluding secrets/env/db files), commit, push, and open the pull request immediately with `gh pr create`.

**Branch strategy:** Promotion flow is `feature → dev → master`.

- **`dev`** — integration branch. Open everyday **feature PRs into `dev`**.
- **`master`** — release branch. Promote with a **`dev` → `master`** PR (release).

`dev` and `master` are both **long-lived branches** — never delete them, and never create or retarget a `main` branch. Release PRs (`dev`→`master`) use `dev` as head, **not** a feature branch.

## Mode — read trailing user text

| Trailing text | Mode |
|---|---|
| Empty or `now` / `proceed` | **Create** — commit (if dirty), push, and open PR **into `dev`** immediately |
| `dev`, `to dev`, or `integration` | **Create** — base **`dev`** (same as default) |
| `master`, `to master`, `main`, `to main`, `release`, or `promote` | **Create (release)** — base **`master`**, head **`dev`** (opens release PR immediately) |
| `hotfix`, `hotfix promote`, or `emergency` | **Hotfix (end-to-end)** — commit, push, PR to `dev`, immediately approve & merge, clean up, promote `dev` → `master`, and immediately approve & merge |
| `cleanup` or `post-merge` | **Cleanup** — sync default branch, switch to it, delete merged feature branch |
| `draft only`, `preview`, or `dry run` | **Draft only** — show proposed title/body; do not push or create PR |
| `draft pr` or `as draft` | **Create draft PR** — `gh pr create --draft` |
| Contains `base:` or `into:` | Override base branch |
| Contains `title:` | Use as title hint |
| Describes scope | Narrow summary to that scope; still list all commits |

**Default base branch:** `dev`. Cleanup after a feature PR syncs `dev`; after a release PR (base `master`) syncs `master` and `dev`.

**Release PRs (`dev`→`master`)** diff two long-lived branches, so **do not create or commit a feature branch** — check out `dev`, make sure it's up to date, then open the PR with `--base master --head dev`. If the working tree is dirty, that dirty work belongs on a feature branch into `dev` first — stop and report this.

If trailing text is **cleanup**, skip Create — run **Cleanup mode** only.

### Uncommitted changes (feature Create into `dev`)

When the working tree has changes **outside** ignored local state:

1. Inspect the uncommitted changes and determine an appropriate feature branch name (`feat/...` or `fix/...`).
2. Identify files to stage (strictly exclude `.env*`, `*.db`, `*.db-wal`, `*.db-shm`, `App_Data/`, credentials, and secrets).
3. Switch to the feature branch (`git checkout -b <branch>`), stage files, commit, push, and open the PR with `gh pr create`.

---

## Cleanup mode (after PR merged)

**Default:** delete merged local + remote feature branch. Use **keep branch** or **no delete** to skip.

### C1 — Pre-check

```bash
git status
git branch --show-current
git remote -v
```

| Situation | Action |
|---|---|
| Uncommitted changes | **Stop** — ask user to commit, stash, or discard |
| Already on base | Skip checkout; still fetch + pull; skip branch delete |
| On a feature branch | Remember name for delete |

### C2 — Sync

```bash
git fetch origin
git checkout <base>
git pull origin <base>
```

Never force-pull or `reset --hard` unless the user asks.

### C3 — Remove merged feature branch

Confirm merge (`git branch --merged` or `gh pr list --state merged --head <branch>`). Run `git branch -d <branch>`; `git push origin --delete <branch>` if remote remains. Never delete `main` / `master` / `dev`.

**Release cleanup:** after a `dev`→`master` PR merges, there is no feature branch — just sync `master`, switch to `dev`, and pull (C2) without deleting long-lived branches.

### C4 — Report base, previous branch, deletions, and `git log -3`.

---

## Step 0 — `gh` pre-check (Create only)

```bash
command -v gh && gh auth status
```

If `gh` is missing or unauthed: after push, print `https://github.com/<owner>/<repo>/compare/<base>...<branch>` plus install hint (`brew install gh` → `gh auth login`). Do not fail the flow.

If this workspace is **not a git repo yet**, stop and notify the user — initialize only if requested.

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

Analyze **ALL** commits since diverging from base.

---

## Step 2 — Draft PR title

- One line, **≤ 72 characters** when possible
- **Imperative mood** — "Add …", "Fix …", "Update …"
- Lead with the user-facing or architectural outcome

---

## Step 3 — Draft PR description

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

## Notes / follow-ups
…
```

Do **not** include secrets, `.env`, or the Gemini key. Do **not** paste huge diffs.

## Version bump (feature PRs into `dev` only)

Follow `.agents/rules/vuepresyo-version.md`. One bump per feature PR, on the commit that opens it. Do not bump again on later commits on the same branch. Do not bump promotion or release PRs (`dev` → `master`).

Skip when the diff is only docs, agent rules, or a refactor with no user-visible change, or when `frontend/package.json` `version` already differs from `origin/dev`.

| PR Findings / Scope | Detection Criteria | Command (in `frontend/`) |
|---|---|---|
| **Breaking / Major** | Breaking API or DB schema changes, major rewrite, or explicit user request | `npm version major --no-git-tag-version` |
| **New Feature / Minor** | New user-facing capabilities, new pages/routes, new domain features, or `feat/...` branch | `npm version minor --no-git-tag-version` |
| **Bug Fix / Patch** | Bug fixes, UI/CSS alignment fixes, error handling improvements, or `fix/...` branch | `npm version patch --no-git-tag-version` |

---

## Step 4 — Branch, commit (if dirty), and push
 
1. Feature branch `feat/` / `fix/` / `chore/` if on `master`/`dev`.
2. Version bump (if applicable), then stage and commit product changes. Never stage `.env*`, `*.db*`, or `App_Data/`.
3. Run local checks and wait for them to pass:
   ```bash
   dotnet test && cd frontend && npm run build
   ```
   Do not push if checks fail.
4. `git push -u origin HEAD` — never force-push to `main`/`master`/`dev`.

---

## Step 5 — Create PR

```bash
# Feature PR (default): current feature branch → dev
gh pr create --base dev --title "…" --body "$(cat <<'EOF'
## Summary
…
EOF
)"

# Release PR: dev → master
gh pr create --base master --head dev --title "Release dev to master (…)" --body "…"
```

Add `--draft` when requested. If a PR already exists: `gh pr view --json url,title,baseRefName` and report the URL.

---

## Hotfix pipeline mode (`create-github-pr hotfix`)

When invoked with `hotfix`, `hotfix promote`, or `emergency`, automate the full lifecycle from branch creation through `dev` and into `master` without pausing for manual approvals:

```
[Local work] → [fix branch] → [PR into dev] → [Approve & Merge into dev]
                                                        ↓
                                            [Sync dev & delete fix branch]
                                                        ↓
[Local master & dev synced] ← [Approve & Merge into master] ← [PR dev → master]
```

### H1 — Prepare & commit hotfix
1. Ensure `origin/dev` exists (if not, create `dev` from `master` and push `origin/dev`).
2. If on `dev` or `master` with uncommitted changes:
   - Create fix branch: `git checkout -b fix/<short-topic>`
3. Bump patch version in `frontend/` if user-facing product code changed (skip for docs/rules-only changes):
   ```bash
   cd frontend && npm version patch --no-git-tag-version
   ```
4. Run local CI once:
   ```bash
   dotnet test && cd frontend && npm run build
   ```
   (Must be green before pushing).
5. Stage changes (strictly exclude `.env`, `.env.local`, `*.db*`, `App_Data/`, credentials):
   ```bash
   git add <files>
   git commit -m "fix: <summary>"
   ```
6. Push branch:
   ```bash
   git push -u origin HEAD
   ```

### H2 — Create, approve & merge PR into `dev`
1. Create PR into `dev`:
   ```bash
   DEV_PR_URL=$(gh pr create --base dev --title "…" --body "…")
   ```
2. Attempt approval (ignore errors if GitHub disallows self-approval by author):
   ```bash
   gh pr review "$DEV_PR_URL" --approve -b "Approved hotfix" 2>/dev/null || true
   ```
3. Immediately merge and delete the remote branch:
   ```bash
   gh pr merge "$DEV_PR_URL" --squash --delete-branch --admin || gh pr merge "$DEV_PR_URL" --squash --delete-branch
   ```

### H3 — Cleanup & sync `dev`
1. Switch to `dev` and pull the newly merged squash commit:
   ```bash
   git fetch origin dev
   git checkout dev
   git pull origin dev
   ```
2. Delete the local fix branch:
   ```bash
   git branch -D fix/<short-topic> 2>/dev/null || true
   ```

### H4 — Create, approve & merge Release PR (`dev` → `master`)
1. Create release PR:
   ```bash
   MASTER_PR_URL=$(gh pr create --base master --head dev --title "Release: <summary>" --body "…")
   ```
2. Attempt approval (ignore error if self-approval):
   ```bash
   gh pr review "$MASTER_PR_URL" --approve -b "Approved hotfix release to master" 2>/dev/null || true
   ```
3. Immediately merge release PR into `master` (**NEVER pass `--delete-branch`** because head is `dev`!):
   ```bash
   gh pr merge "$MASTER_PR_URL" --merge --admin || gh pr merge "$MASTER_PR_URL" --merge
   ```

### H5 — Final sync & report
1. Fetch and sync `master`:
   ```bash
   git fetch origin master
   git checkout master
   git pull origin master
   ```
2. Switch back to `dev` and sync:
   ```bash
   git checkout dev
   git pull origin dev
   ```
3. Report summary to user (Dev PR URL, Release PR URL, branch cleanup, and current version).

---

## Guardrails

- When invoked, execute branch creation, staging, commit, push, and `gh pr create` directly without asking for confirmation modals unless the user requested `draft only` / `dry run`.
- Immediately return the PR URL, title, and summary once `gh pr create` completes; do not block or poll for remote GitHub Actions CI to finish.
- Never open a feature PR from `dev` into `dev` (or `master` into `master`) without a feature branch.
- Never commit or create a feature branch on a release PR (`dev`→`master`).
- Never push or open a PR before `dotnet test && cd frontend && npm run build` is green.
- Never delete or force-update the long-lived `dev` or `master` branches.

