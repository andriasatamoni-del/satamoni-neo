import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { CustomerFollowup } from "../../domain/customer-followup.aggregate";
import type { CustomerFollowupRepositoryPort } from "../../domain/ports/customer-followup-repository.port";
import { customerFollowups } from "./crm.tables";

@Injectable()
export class CustomerFollowupRepository implements CustomerFollowupRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(followup: CustomerFollowup): Promise<void> {
    const row = this.toRow(followup);
    await this.db
      .insert(customerFollowups)
      .values(row)
      .onConflictDoUpdate({
        target: customerFollowups.id,
        set: {
          order_id: row.order_id,
          legacy_order_id: row.legacy_order_id,
          branch_id: row.branch_id,
          customer_phone: row.customer_phone,
          call_result: row.call_result,
          satisfaction_rating: row.satisfaction_rating,
          notes: row.notes,
          has_complaint: row.has_complaint,
          called_by: row.called_by,
          called_at: row.called_at,
        },
      });
  }

  async findById(id: string): Promise<CustomerFollowup | null> {
    const [row] = await this.db.select().from(customerFollowups).where(eq(customerFollowups.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyOrderId(legacyOrderId: number): Promise<CustomerFollowup | null> {
    const [row] = await this.db.select().from(customerFollowups).where(eq(customerFollowups.legacy_order_id, legacyOrderId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<CustomerFollowup | null> {
    const [row] = await this.db.select().from(customerFollowups).where(eq(customerFollowups.order_id, orderId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyFollowupId(legacyFollowupId: number): Promise<CustomerFollowup | null> {
    const [row] = await this.db
      .select()
      .from(customerFollowups)
      .where(eq(customerFollowups.legacy_followup_id, legacyFollowupId))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  private toRow(followup: CustomerFollowup): typeof customerFollowups.$inferInsert {
    return {
      id: followup.id,
      order_id: followup.orderId,
      legacy_order_id: followup.legacyOrderId,
      branch_id: followup.branchId,
      customer_phone: followup.customerPhone,
      call_result: followup.callResult,
      satisfaction_rating: followup.satisfactionRating,
      notes: followup.notes,
      has_complaint: followup.hasComplaint,
      called_by: followup.calledBy,
      called_at: followup.calledAt,
      legacy_followup_id: followup.legacyFollowupId,
    };
  }

  private toDomain(row: typeof customerFollowups.$inferSelect): CustomerFollowup {
    return CustomerFollowup.reconstitute(row.id, {
      orderId: row.order_id,
      legacyOrderId: row.legacy_order_id,
      branchId: row.branch_id,
      customerPhone: row.customer_phone,
      callResult: row.call_result as CustomerFollowup["callResult"],
      satisfactionRating: row.satisfaction_rating as CustomerFollowup["satisfactionRating"],
      notes: row.notes,
      hasComplaint: row.has_complaint,
      calledBy: row.called_by,
      calledAt: row.called_at,
      legacyFollowupId: row.legacy_followup_id,
    });
  }
}
