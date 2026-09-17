import type { Generated, JSONColumnType } from "kysely";

export interface AuditLogsTable {
  id: Generated<string>;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  branch_id: string | null;
  metadata: JSONColumnType<Record<string, unknown>> | null;
  created_at: Generated<Date>;
}
