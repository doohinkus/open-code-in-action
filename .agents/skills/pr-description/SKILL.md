---
name: pr-description
description: Writes pull request descriptions. Use when creating a PR, writing a PR, or when the user asks to summarize changes for a pull request.
---

When writing a PR description:

1. Determine the base branch:
   ```bash
   BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo main)
   ```
2. Run `git diff $BASE...HEAD` to see all changes on this branch, and `git log --oneline $BASE..HEAD` for commit context (commit prefixes like `feat:`, `fix:`, `polish:` often map directly to change bullets).
3. Write a description following this format:

## What

One sentence explaining what this PR does.

## Why

Brief context on why this change is needed

## Changes

- Bullet points of specific changes made
- Group related changes together
- Mention any files deleted or renamed

## Testing

- Note which verification commands were run (e.g. `npm run lint`, `npm test -- --run`, `npx tsc --noEmit`)
- Mention manual or E2E verification steps if applicable
- If verification was not run, say so explicitly

4. Before creating the PR, bring the branch up to date with main:
   ```bash
   git sync-main && git rebase main
   ```
   (Rebase before the first push; force-push an already-pushed branch only when no one else relies on it.)
5. Create the PR with `gh pr create --title ... --body ...` using this description as the body. Title follows the conventional-commit style of the branch's commits (e.g. `feat: add Gemini free tier as primary AI provider`).
