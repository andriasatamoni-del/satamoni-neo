import type { Generated } from "kysely";

export interface OrderNotificationsTable {
  id: Generated<string>;
  order_id: string;
  kind: string;
  channel: string;
  recipient: string;
  message: string;
  status: string;
  error: string | null;
  created_at: Generated<Date>;
}
