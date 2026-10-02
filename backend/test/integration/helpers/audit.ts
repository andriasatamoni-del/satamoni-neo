import { sql, type Kysely, type RawBuilder } from "kysely";

// Phase 3.1: audit_logs is append-only (trigger) for every normal role, so test cleanup of the audit rows it created uses the
// superuser-only `session_replication_role = replica` inside a transaction (triggers do not fire). Production code never does this.
export async function deleteAuditLogsForTest(db: Kysely<any>, where: RawBuilder<unknown>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(trx);
    await sql`DELETE FROM audit_logs WHERE ${where}`.execute(trx);
  });
}
