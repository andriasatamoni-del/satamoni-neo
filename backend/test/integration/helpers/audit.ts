import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../../../src/shared/database/database.token";
import { auditLogs } from "../../../src/shared/database/shared.tables";

// Phase 3.1: audit_logs is append-only (trigger) for every normal role, so test cleanup of the audit rows it created uses the
// superuser-only `session_replication_role = replica` inside a transaction (triggers do not fire). Production code never does this.
// set_config(..., true) is the transaction-local form of SET LOCAL; `where` omitted deletes every audit row.
export async function deleteAuditLogsForTest(db: Database, where?: SQL): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .select({ role: sql`set_config('session_replication_role', 'replica', true)` })
      .from(sql`(VALUES (1)) AS cfg`);
    await tx.delete(auditLogs).where(where);
  });
}
