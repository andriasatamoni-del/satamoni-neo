import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, isNull, or } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { deliveryAssignments } from "../../../delivery/infrastructure/persistence/delivery.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import type { FollowupQueueReaderPort, FollowupQueueRow } from "../../domain/ports/followup-queue-reader.port";
import { customerFollowups } from "./crm.tables";

@Injectable()
export class FollowupQueueReader implements FollowupQueueReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listQueue(branchId?: string, page?: PageRequest): Promise<{ rows: FollowupQueueRow[]; total: number }> {
    const where = and(
      eq(deliveryAssignments.status, "DELIVERED"),
      or(isNull(customerFollowups.id), eq(customerFollowups.call_result, "no_answer")),
      branchId ? eq(orders.branch_id, branchId) : undefined
    );
    const query = this.db
      .select({
        order_id: orders.id,
        branch_id: orders.branch_id,
        branch_name: branches.name,
        customer_name: orders.customer_name,
        customer_phone: orders.customer_phone,
        address_details: orders.address_details,
        total: orders.total,
        delivered_at: deliveryAssignments.delivered_at,
        followup_id: customerFollowups.id,
        last_call_result: customerFollowups.call_result,
        last_notes: customerFollowups.notes,
        last_called_at: customerFollowups.called_at,
      })
      .from(orders)
      .innerJoin(deliveryAssignments, eq(deliveryAssignments.order_id, orders.id))
      .innerJoin(branches, eq(branches.id, orders.branch_id))
      .leftJoin(customerFollowups, eq(customerFollowups.order_id, orders.id))
      .where(where)
      .orderBy(asc(deliveryAssignments.delivered_at), asc(orders.id))
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () =>
      totalOf(
        await this.db
          .select({ total: count() })
          .from(orders)
          .innerJoin(deliveryAssignments, eq(deliveryAssignments.order_id, orders.id))
          .innerJoin(branches, eq(branches.id, orders.branch_id))
          .leftJoin(customerFollowups, eq(customerFollowups.order_id, orders.id))
          .where(where)
      )
    );

    return { total, rows: rows.map((r) => ({
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
    })) };
  }
}
