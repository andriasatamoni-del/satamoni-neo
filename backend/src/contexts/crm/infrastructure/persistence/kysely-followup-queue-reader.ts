import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { FollowupQueueReaderPort, FollowupQueueRow } from "../../domain/ports/followup-queue-reader.port";

@Injectable()
export class KyselyFollowupQueueReader implements FollowupQueueReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async listQueue(branchId?: string): Promise<FollowupQueueRow[]> {
    let query = this.db
      .selectFrom("orders")
      .innerJoin("delivery_assignments", "delivery_assignments.order_id", "orders.id")
      .innerJoin("branches", "branches.id", "orders.branch_id")
      .leftJoin("customer_followups", "customer_followups.order_id", "orders.id")
      .select([
        "orders.id as order_id",
        "orders.branch_id as branch_id",
        "branches.name as branch_name",
        "orders.customer_name as customer_name",
        "orders.customer_phone as customer_phone",
        "orders.address_details as address_details",
        "orders.total as total",
        "delivery_assignments.delivered_at as delivered_at",
        "customer_followups.id as followup_id",
        "customer_followups.call_result as last_call_result",
        "customer_followups.notes as last_notes",
        "customer_followups.called_at as last_called_at",
      ])
      .where("delivery_assignments.status", "=", "DELIVERED")
      .where((eb) => eb.or([eb("customer_followups.id", "is", null), eb("customer_followups.call_result", "=", "no_answer")]));
    if (branchId) query = query.where("orders.branch_id", "=", branchId);
    const rows = await query.orderBy("delivery_assignments.delivered_at", "asc").execute();

    return rows.map((r) => ({
      orderId: r.order_id,
      branchId: r.branch_id,
      branchName: r.branch_name,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      addressDetails: r.address_details,
      total: Number(r.total),
      deliveredAt: r.delivered_at as Date,
      lastCallResult: r.last_call_result,
      lastNotes: r.last_notes,
      lastCalledAt: r.last_called_at,
    }));
  }
}
