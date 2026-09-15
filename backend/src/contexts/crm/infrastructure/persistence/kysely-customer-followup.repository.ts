import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { CustomerFollowup } from "../../domain/customer-followup.aggregate";
import type { CustomerFollowupRepositoryPort } from "../../domain/ports/customer-followup-repository.port";
import type { CustomerFollowupsTable } from "./customer-followup.schema";

@Injectable()
export class KyselyCustomerFollowupRepository implements CustomerFollowupRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(followup: CustomerFollowup): Promise<void> {
    const row = this.toRow(followup);
    await this.db
      .insertInto("customer_followups")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          legacy_order_id: row.legacy_order_id,
          branch_id: row.branch_id,
          customer_phone: row.customer_phone,
          call_result: row.call_result,
          satisfaction_rating: row.satisfaction_rating,
          notes: row.notes,
          has_complaint: row.has_complaint,
          called_by: row.called_by,
          called_at: row.called_at,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<CustomerFollowup | null> {
    const row = await this.db.selectFrom("customer_followups").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyOrderId(legacyOrderId: number): Promise<CustomerFollowup | null> {
    const row = await this.db
      .selectFrom("customer_followups")
      .selectAll()
      .where("legacy_order_id", "=", legacyOrderId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyFollowupId(legacyFollowupId: number): Promise<CustomerFollowup | null> {
    const row = await this.db
      .selectFrom("customer_followups")
      .selectAll()
      .where("legacy_followup_id", "=", legacyFollowupId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  private toRow(followup: CustomerFollowup) {
    return {
      id: followup.id,
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

  private toDomain(row: Selectable<CustomerFollowupsTable>): CustomerFollowup {
    return CustomerFollowup.reconstitute(row.id, {
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
