---
name: ship-pr
description: Commit the current work on a NEW branch, push it and open a pull request against main. It does NOT merge; the user merges. Before committing, sorts uncommitted changes into related (committed) and unrelated (stashed, then restored). Use when the user asks to "open a PR", "create a pull request", "commit and push for review", or runs /ship-pr. To merge straight into main without a PR, use the /ship command instead.
argument-hint: "[short description of the change]"
---

# Ship a PR: new branch → commit → push → open PR (no merge)

The `/ship` command reuses steps 1–5 of this skill (inspect, classify, stash, branch, commit). Keep those steps self-contained.

The argument (if any) describes the change being shipped. If it's empty, the change is the work done in this conversation.

Run the steps in order and stop at the first failure. Never force-push, never use `--no-verify`, and never commit directly on `main`.

## 1. Inspect the working tree

```bash
git status --porcelain=v1 -uall
git diff --stat; git diff --cached --stat
git rev-parse --abbrev-ref HEAD
```
If nothing has changed and the current branch has no commits ahead of `origin/main`, tell the user there is nothing to ship and stop.

## 2. Classify every changed file as RELATED or UNRELATED

A file is **RELATED** when any of these is true:
- you edited or created it in this conversation;
- it is clearly part of the change described in the argument (read its diff with `git diff -- <file>`);
- it is a direct consequence of a related change, such as a lockfile updated by a dependency you added, or a generated file.

Everything else is **UNRELATED**: leftovers from other work, crash dumps (`*.stackdump`), stray reports, lockfiles for a package manager the repo doesn't use, local `.env` files, and edits that have nothing to do with the described change.

If a file is ambiguous, for example one file mixes related and unrelated hunks or you can't tell what it's for, **ask the user** with AskUserQuestion. Don't guess. Never commit files that look like secrets (`.env`, `*.pem`, credentials, tokens), even if they seem related.

Show the user the two lists in one short line each before continuing.

## 3. Stash the UNRELATED files (only if there are any)

```bash
git stash push -u -m "ship-pr:unrelated:<branch-name>:<unix-time>" -- <unrelated paths...>
git stash list --format='%H %gs' | grep "ship-pr:unrelated:<branch-name>:<unix-time>"
```
Record the SHA. Other sessions share the stash stack, so always refer to your entry by its SHA, never by `stash@{0}`, and never use a bare `git stash pop`.

## 4. Create a NEW branch

Always create a new branch, even if you're already on a feature branch.
- Name: `<type>/<kebab-slug>`, where `<type>` is one of `feat|fix|docs|refactor|test|chore|ci`, taken from the change (e.g. `docs/add-claude-md`). If the name already exists locally or on `origin`, add `-2`, `-3`, and so on.
- `git fetch origin main` (see the push fallback in step 6 if it fails with an SSL error), then `git switch -c <branch>`. Your uncommitted related changes carry over.
- If the current HEAD is not `main` and has commits that aren't on `origin/main`, tell the user those commits will be included in the PR.

## 5. Commit the RELATED files

- Stage them explicitly: `git add -- <related paths...>`. Never use `git add -A` or `git add .`.
- Write a Conventional Commit message (`type(scope): summary`, at most 72 characters, imperative). Add a short body when the why isn't obvious. End with the attribution trailer from the current session's instructions, if one was given.
- If a commit hook fails, fix the cause and make a new commit. Don't bypass the hook.

## 6. Push

```bash
git push -u origin <branch>
```
If the push fails with `SSL certificate problem`, retry it once with Windows' certificate store. This still verifies certificates, so it is not a bypass:
```bash
git -c http.sslBackend=schannel push -u origin <branch>
```
Never set `http.sslVerify=false`.

## 7. Open the PR (base `main`)

Get the owner and repo from `git remote get-url origin`. Look for a PR template first (`.github/pull_request_template.md` or `.github/PULL_REQUEST_TEMPLATE/`) and use it if one exists. Otherwise the body is:
`## Summary` (bullets), then `## Test plan` (what you actually ran, as checkboxes), then the PR attribution line from the session's instructions, if any.

Try these in order and use the first one that works:
1. `gh pr create --base main --head <branch> --title ... --body-file ...`, if `gh` is installed and logged in.
2. The GitHub MCP tool `mcp__github__create_pull_request`. Load it with ToolSearch first.
3. The REST API from PowerShell, using the token stored in the GitHub MCP config. Never print the token. Add `Bearer ` if the stored value lacks it:
   ```powershell
   $raw = (Get-Content "$env:USERPROFILE\.claude.json" -Raw | ConvertFrom-Json).mcpServers.github.headers.Authorization.Trim()
   $auth = if ($raw -match '^(Bearer|token) ') { $raw } else { "Bearer $raw" }
   $h = @{ Authorization = $auth; Accept = "application/vnd.github+json"; "User-Agent" = "claude-code" }
   $r = Invoke-RestMethod -Method Post "https://api.github.com/repos/<owner>/<repo>/pulls" -Headers $h `
        -Body ([Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json))) -ContentType "application/json; charset=utf-8"
   ```

If all three fail with 401 or 403, stop. Give the user the compare URL `https://github.com/<owner>/<repo>/compare/main...<branch>?expand=1` and explain what the token is missing, then go to step 8.

Do **not** merge the PR. Merging is the user's call (or `/ship` if they want straight-to-main).

## 8. Restore

Stay on the new branch. If you stashed anything in step 3, run `git stash apply <sha>`. If it applies cleanly, drop that exact entry: find its current `stash@{n}` by the message tag, then `git stash drop stash@{n}`. If it conflicts, leave the stash in place and give the user its SHA and tag.

## 9. Report

Keep it short. Include:
- the branch name;
- the commit SHA and message;
- the PR URL and number;
- which unrelated files were stashed and whether they were restored.
