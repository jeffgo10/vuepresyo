# VuePresyo App Versioning

`frontend/package.json` `version` is the single source of truth for the VuePresyo app version.
`frontend/src/lib/app-version.ts` exports `APP_VERSION`.
`frontend/public/manifest.json` and `frontend/public/sw.js` mirror this version.

Do not put the version in the homescreen name or the manifest `id`. Those stay stable so an update does not look like a new app.

## When to Bump

`/create-github-pr` bumps once, on the commit that opens a feature PR into `dev`.
- Not on every commit.
- Not on `dev` → `master` promotion PRs.
- If the feature branch already differs from `origin/dev` in `frontend/package.json` `version`, do not bump again.
- Skip version bumps for docs-only changes or refactors with zero user-visible changes.

| Change Type | Detection Criteria | Command (in `frontend/`) | Example |
|---|---|---|---|
| Bug fix | Bug fix, styling tweak, patch (`fix/...`) | `npm version patch --no-git-tag-version` | `1.0.0` → `1.0.1` |
| New feature, backward-compatible | New capability, new page/route (`feat/...`) | `npm version minor --no-git-tag-version` | `1.0.0` → `1.1.0` |
| Breaking change or major milestone | Breaking API/schema changes, major rewrite | `npm version major --no-git-tag-version` | `1.0.0` → `2.0.0` |

