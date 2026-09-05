---
name: git-workflow
description: Branching and sync workflow for this repo. Use when starting work on a new branch, before pushing, before creating a PR, or whenever git sync/rebase guidance is needed.
---

- **Keep `main` synced with remote**: run `git sync-main` (repo-local alias for `git fetch origin main:main`) — fast-forwards local `main` from remote without leaving the current branch; fast-forward only, so it fails safely on divergence. Run it before branching off `main` and before creating a PR.
- Always branch off freshly-synced `main`:
  ```bash
  git sync-main && git switch -c <branch> main
  ```
- Before pushing/creating a PR, bring the branch up to date:
  ```bash
  git sync-main && git rebase main
  ```
  Rebase before the first push; if the branch was already pushed, rebase + force-push only when no one else relies on it.
- Pair with the `verify-app` skill (manual verification) and the push gate: `npm run lint && npm test -- --run && npx tsc --noEmit`.
