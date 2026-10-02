import { Inject, Injectable } from "@nestjs/common";
import { sql, type Kysely, type Selectable } from "kysely";
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
        payroll_run_id: adjustment.payrollRunId,
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

  async listUnlinkedActiveForMonth(year: number, month: number, employeeIds?: string[]): Promise<PayrollAdjustment[]> {
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    let query = this.db
      .selectFrom("payroll_adjustments")
      .selectAll()
      .where("status", "=", "ACTIVE")
      .where("payroll_run_id", "is", null)
      .where(sql<boolean>`entry_date >= ${first}::date AND entry_date < ${next}::date`);
    if (employeeIds) {
      if (employeeIds.length === 0) return [];
      query = query.where("employee_id", "in", employeeIds);
    }
    return (await query.orderBy("entry_date").forUpdate().execute()).map((r) => this.toDomain(r));
  }

  async linkToRun(adjustmentIds: string[], payrollRunId: string): Promise<void> {
    if (adjustmentIds.length === 0) return;
    await this.db.updateTable("payroll_adjustments").set({ payroll_run_id: payrollRunId }).where("id", "in", adjustmentIds).execute();
  }

  async unlinkFromRun(payrollRunId: string): Promise<void> {
    await this.db.updateTable("payroll_adjustments").set({ payroll_run_id: null }).where("payroll_run_id", "=", payrollRunId).execute();
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
      payrollRunId: row.payroll_run_id,
    });
  }
}
