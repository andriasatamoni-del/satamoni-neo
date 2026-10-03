# Design proposal: restoring into a REMOTE PostgreSQL (NOT implemented)

**Status: proposal for review. Nothing in this document is enabled or coded.** Today `restore-drill.ts` accepts a **local**
(loopback) throw-away server only (see `BACKUP_AND_RECOVERY.md`). This note records what would have to be true before a remote
target is ever allowed, so the decision can be reviewed separately from the security remediation.

## When would a remote target be needed?

Only if a throw-away local server is impossible, for example a drill run from a locked-down CI runner that cannot start Docker, or a
disaster-recovery rehearsal on a managed "staging" server. The current GitHub workflow already uses a local service container, and a
laptop can use Docker, so **the default answer is: do not add remote support**.

## Requirements if it is ever added

1. **Off by default, opt-in per run.** Two explicit switches, both read from the process environment only (never from `.env`):
   `RESTORE_DRILL_ALLOW_REMOTE=true` and `RESTORE_DRILL_REMOTE_ALLOWLIST=<exact host:port list>`. A host that is not on the allowlist is
   refused even when the switch is on. No wildcards, no suffix matching.
2. **A server dedicated to drills.** The allowlisted server must hold nothing but throw-away restore databases. The drill refuses to run
   when the server lists any database outside `postgres`, `template*` and names starting with `satamoni_neo_restore_drill_`.
3. **Never the same server as a source.** Keep every current check (normalised host and port against `DATABASE_URL`,
   `LEGACY_DATABASE_URL`, the compare source) and the connection-time server fingerprint. For remote targets the fingerprint check
   becomes mandatory and fails closed when the source cannot be fingerprinted.
4. **Least-privilege role.** A dedicated role with `CREATEDB` only (no superuser, no other login rights), restricted by `pg_hba.conf` to the
   runner or office IP. Its password is generated per rehearsal.
5. **TLS with certificate verification** (`sslmode=verify-full` and a pinned CA), not `require`.
6. **Names that cannot hit anything real.** The scratch database name keeps the fixed prefix and a random suffix; `DROP DATABASE` is only
   ever issued for a name the same process created.
7. **Never wired into a workflow that holds production secrets.** A remote-target run is a manual, reviewed action, in a separate
   environment (for example `restore-rehearsal`) with its own secrets and its own required reviewer. It must not share an environment with
   `production-backup` or `production-maintenance`.
8. **Logs stay clean.** No URL, host, port or password in any message (the current guard already behaves this way) and a run summary
   that records only: allowlist entry used, scratch database name, pass/fail per step.
9. **Tests before enabling**: the existing guard test matrix (loopback aliases, `?host=`/`?hostaddr=` overrides, same-server aliases,
   conflicting variables, `.env` isolation) must still pass with the switches off, and new tests must prove that with the switches on,
   a host outside the allowlist, a non-empty server and a same-server source are all refused.

## Decision requested

Approve or reject adding remote-target support. Until approved, the guard stays as it is: **local targets only**.
