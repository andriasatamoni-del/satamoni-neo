import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { PayrollAdjustment, type AdjustmentStatus, type AdjustmentType } from "../../domain/payroll-adjustment.aggregate";
import type { PayrollAdjustmentRepositoryPort } from "../../domain/ports/payroll-adjustment-repository.port";
import { payrollAdjustments } from "./hr-payroll.tables";

@Injectable()
export class PayrollAdjustmentRepository implements PayrollAdjustmentRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(adjustment: PayrollAdjustment): Promise<void> {
    await this.db
      .insert(payrollAdjustments)
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
      .onConflictDoUpdate({
        target: payrollAdjustments.id,
        set: {
          status: adjustment.status,
          cancelled_by: adjustment.cancelledBy,
          cancelled_at: adjustment.cancelledAt,
          cancellation_reason: adjustment.cancellationReason,
        },
      });
  }

  async findById(id: string): Promise<PayrollAdjustment | null> {
    const [row] = await this.db.select().from(payrollAdjustments).where(eq(payrollAdjustments.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { employeeId?: string; fromDate?: Date; toDate?: Date; status?: string }): Promise<PayrollAdjustment[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { employeeId?: string; fromDate?: Date; toDate?: Date; status?: string }, page?: PageRequest): Promise<{ rows: PayrollAdjustment[]; total: number }> {
    const where = and(
      filter?.employeeId ? eq(payrollAdjustments.employee_id, filter.employeeId) : undefined,
      filter?.status ? eq(payrollAdjustments.status, filter.status) : undefined,
      filter?.fromDate ? gte(payrollAdjustments.entry_date, filter.fromDate) : undefined,
      filter?.toDate ? lte(payrollAdjustments.entry_date, filter.toDate) : undefined
    );
    const query = this.db.select().from(payrollAdjustments).where(where).orderBy(desc(payrollAdjustments.entry_date), desc(payrollAdjustments.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(payrollAdjustments).where(where)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
  }

  async listUnlinkedActiveForMonth(year: number, month: number, employeeIds?: string[]): Promise<PayrollAdjustment[]> {
    if (employeeIds && employeeIds.length === 0) return [];
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const rows = await this.db
      .select()
      .from(payrollAdjustments)
      .where(
        and(
          eq(payrollAdjustments.status, "ACTIVE"),
          isNull(payrollAdjustments.payroll_run_id),
          gte(payrollAdjustments.entry_date, sql`${first}::date`),
          lt(payrollAdjustments.entry_date, sql`${next}::date`),
          employeeIds ? inArray(payrollAdjustments.employee_id, employeeIds) : undefined
        )
      )
      .orderBy(asc(payrollAdjustments.entry_date))
      .for("update");
    return rows.map((r) => this.toDomain(r));
  }

  async linkToRun(adjustmentIds: string[], payrollRunId: string): Promise<void> {
    if (adjustmentIds.length === 0) return;
    await this.db.update(payrollAdjustments).set({ payroll_run_id: payrollRunId }).where(inArray(payrollAdjustments.id, adjustmentIds));
  }

  async unlinkFromRun(payrollRunId: string): Promise<void> {
    await this.db.update(payrollAdjustments).set({ payroll_run_id: null }).where(eq(payrollAdjustments.payroll_run_id, payrollRunId));
  }

  private toDomain(row: typeof payrollAdjustments.$inferSelect): PayrollAdjustment {
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
