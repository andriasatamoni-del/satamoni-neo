---
description: Commit related changes on a new branch and merge it straight into main (no PR). Unrelated changes are stashed, then restored.
argument-hint: "[short description of the change]"
---

Ship this change straight into `main`, without a pull request.

Change description: $ARGUMENTS
(If it's empty, the change is the work done in this conversation.)

Never force-push, never use `--no-verify`, and stop at the first failure.

## 1–5. Inspect, classify, stash, branch, commit

Read `.claude/skills/ship-pr/SKILL.md` (relative to the repo root) and follow its steps 1–5 exactly:
- inspect the working tree;
- classify each changed file as related or unrelated, and ask about ambiguous ones;
- stash the unrelated files and record the stash SHA;
- create a NEW `<type>/<slug>` branch;
- commit only the related files.

Do not run its later steps (push, PR).

## 6. Check before merging

Nothing gates this merge in CI, so run the repo's fast checks on the new branch first. Use the typecheck, build and unit-test commands from the repo's `CLAUDE.md`, or failing that from `package.json`. Only run the ones covering the parts you changed; skip this for docs-only changes. If any check fails, stop and report. Do not merge.

## 7. Merge into main and push

`main` may be checked out in another worktree, so merge on a detached HEAD instead of switching to `main`:
```bash
git fetch origin main          # on "SSL certificate problem", retry with: git -c http.sslBackend=schannel ...
git switch --detach origin/main
git merge --no-ff <branch> -m "Merge branch '<branch>'"
git push origin HEAD:main      # same SSL fallback; never --force
git switch <branch>
```
- On a **merge conflict**: run `git merge --abort`, then `git switch <branch>`. Report the conflicting files and stop.
- If the **push is rejected** because `main` moved: repeat this step once from `git fetch`. If it's rejected again, or rejected by branch protection, stop and report. Suggest `/ship-pr` instead.

## 8. Sync and restore

- If `main` isn't checked out in another worktree and you're in the main checkout, run `git switch main` and `git pull --ff-only`. Otherwise stay on the branch and tell the user to pull `main` in their main checkout.
- If you stashed anything, run `git stash apply <sha>`. If it applies cleanly, drop that exact entry: find its current `stash@{n}` by the message tag, then `git stash drop stash@{n}`. If it conflicts, leave the stash in place and report its SHA and tag.
- Keep the branch. Don't delete it unless the user asks.

## 9. Report

Keep it short. Include:
- the branch name;
- the commit SHA and message;
- the merge commit SHA now on `origin/main`;
- which checks ran;
- which unrelated files were stashed and whether they were restored.
