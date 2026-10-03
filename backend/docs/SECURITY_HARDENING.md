# Security hardening — Phase 3.1 (BL-14)

This document records what was changed in code and **what only the repository/organisation owner can do**.
Nothing here was executed against production by the engineering assistant.

## 1. What changed in the repository

| Item | Before | After |
|---|---|---|
| `backend/scripts/create-test-admin.ts` | Created/reset an **active admin** `admin-test@satamoni-neo.local` with the committed password `Test12345!` against whatever `DATABASE_URL` pointed to. | **Deleted.** There is no code path that creates a privileged account with a fixed password. |
| `.github/workflows/run-script.yml` | `workflow_dispatch` with a free-text `script_path`, interpolated into a shell command, run with `DATABASE_URL` + `LEGACY_DATABASE_URL` production secrets, no protected environment. | **Deleted** and replaced by `maintenance-operation.yml`: fixed `choice` list, mapped through a static `case`, `environment: production-maintenance`, `contents: read`, `main` only, serialized. |
| `backend/scripts/audit-test-account.ts` | n/a | New **read-only** owner tool (single `SELECT` in a `READ ONLY` transaction) that reports whether the compromised account exists. |
| Integration tests | Could be pointed at any `TEST_DATABASE_URL` and `DROP SCHEMA public CASCADE`. | `test/safety/assert-disposable-db.js` refuses non-local hosts and database names that do not contain `test`/`scratch`/`disposable`/`ci`. |
| Automated checks | none | `test/unit/security/workflow-security.spec.ts` fails the build if free-text script execution, shell interpolation of inputs, committed credentials, a privileged job without an environment, non-`actions/*` third-party actions, or missing least-privilege permissions are re-introduced. |

## 2. Treat the old credentials as compromised

`admin-test@satamoni-neo.local` / `Test12345!` was committed to a **public** repository and the old workflow ran
`create-test-admin.ts` successfully on `main` (Actions runs #1 and #2, 2026-09-16/17). The history of the git repository still
contains the password; removing the file does not remove it from history.

**Owner actions (production is never touched by the assistant):**

1. Check whether the account exists (read-only):
   ```bash
   cd backend
   DATABASE_URL='<production external URL>' PGSSL=true npx ts-node scripts/audit-test-account.ts
   ```
   Exit code `2` + a `FOUND:` line means it exists.
2. If it exists, disable it immediately and review its activity:
   ```sql
   UPDATE users SET is_active = false WHERE lower(email) = 'admin-test@satamoni-neo.local';
   SELECT created_at, action, entity_type, entity_id FROM audit_logs
    WHERE actor_user_id = (SELECT id FROM users WHERE lower(email) = 'admin-test@satamoni-neo.local')
    ORDER BY created_at;
   ```
   Delete it only after the audit review (deleting loses attribution).
3. Rotate everything that the old workflow could read: the Render database password (`DATABASE_URL`),
   `LEGACY_DATABASE_URL`, `JWT_SECRET` (this logs everyone out), and any admin password that was ever shared in chat.
4. Rewriting git history (`git filter-repo`) is optional once the account is disabled and the password is meaningless; do it only
   if you also want the string gone from forks/caches — it is a destructive, owner-level action.

## 3. Repository visibility (owner action — not performed)

The repository is **public**. The workflows, scripts and deployment documents are therefore world-readable, and (before this change)
backup artifacts would have been downloadable by any signed-in GitHub user. To make it private:

GitHub → repository → **Settings → General → Danger Zone → Change repository visibility → Make private**.

(`gh repo edit andriasatamoni-del/satamoni-neo --visibility private --accept-visibility-change-consequences` is the CLI equivalent.)
Even after it is private, keep `BACKUP_ENCRYPTION_KEY` set: backups are encrypted before upload regardless of visibility.

## 4. GitHub settings required for the new workflows (owner action)

1. **Settings → Environments → New environment** `production-maintenance`:
   * *Required reviewers*: at least one person other than the person who triggers the run.
   * *Deployment branches*: `main` only.
   * Add the secrets `DATABASE_URL` and `LEGACY_DATABASE_URL` **to this environment** and delete the repository-level copies.
2. **Environment** `production-backup` (same protections as above: required reviewer with *Prevent self-review*, deployment branches `main` only; the workflow additionally runs only from `main`, but that is a second layer, not a substitute) with the secrets `DATABASE_URL` (a read-only database role is strongly recommended),
   `BACKUP_ENCRYPTION_KEY` (≥ 32 random characters, stored also in your password manager — without it backups are unreadable)
   and, optionally, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_REGION`,
   `BACKUP_S3_ENDPOINT` for independent storage.
3. **Settings → Actions → General**: set *Workflow permissions* to "Read repository contents" and require approval for
   workflows from outside collaborators.
4. Enable **branch protection** on `main` (pull request + review required) so workflow files cannot be changed without review.

## 5. Residual risk

* Until the owner actions in §2–§4 are done, the production secrets are still reachable by anyone who can run workflows on the
  repository, and the old password is still public. **These cannot be closed from code.**
