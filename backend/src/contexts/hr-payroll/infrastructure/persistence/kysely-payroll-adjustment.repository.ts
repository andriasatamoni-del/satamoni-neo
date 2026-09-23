import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { PayrollAdjustment, type AdjustmentStatus, type AdjustmentType } from "../../domain/payroll-adjustment.aggregate";
import type { PayrollAdjustmentRepositoryPort } from "../../domain/ports/payroll-adjustment-repository.port";
import type { PayrollAdjustmentsTable } from "./hr-payroll.schema";

@Injectable()
export class KyselyPayrollAdjustmentRepository implements PayrollAdjustmentRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(adjustment: PayrollAdjustment): Promise<void> {
    await this.db
      .insertInto("payroll_adjustments")
      .values({
        id: adjustment.id,
        employee_id: adjustment.employeeId,
        entry_date: adjustment.entryDate,
        adjustment_type: adjustment.adjustmentType,
        amount: adjustment.amount,
        notes: adjustment.notes,
        status: adjustment.status,
        created_by: adjustment.createdBy,
        created_at: adjustment.createdAt,
        cancelled_by: adjustment.cancelledBy,
        cancelled_at: adjustment.cancelledAt,
        cancellation_reason: adjustment.cancellationReason,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          status: adjustment.status,
          cancelled_by: adjustment.cancelledBy,
          cancelled_at: adjustment.cancelledAt,
          cancellation_reason: adjustment.cancellationReason,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<PayrollAdjustment | null> {
    const row = await this.db.selectFrom("payroll_adjustments").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { employeeId?: string; fromDate?: Date; toDate?: Date; status?: string }): Promise<PayrollAdjustment[]> {
    let query = this.db.selectFrom("payroll_adjustments").selectAll();
    if (filter?.employeeId) query = query.where("employee_id", "=", filter.employeeId);
    if (filter?.status) query = query.where("status", "=", filter.status);
    if (filter?.fromDate) query = query.where("entry_date", ">=", filter.fromDate);
    if (filter?.toDate) query = query.where("entry_date", "<=", filter.toDate);
    const rows = await query.orderBy("entry_date", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<PayrollAdjustmentsTable>): PayrollAdjustment {
    return PayrollAdjustment.reconstitute(row.id, {
      employeeId: row.employee_id,
      entryDate: row.entry_date,
      adjustmentType: row.adjustment_type as AdjustmentType,
      amount: Number(row.amount),
      notes: row.notes,
      status: row.status as AdjustmentStatus,
      createdBy: row.created_by,
      createdAt: row.created_at,
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
    });
  }
}
