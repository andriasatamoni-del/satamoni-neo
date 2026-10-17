import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { PayrollRun, type PayrollRunStatus } from "../../domain/payroll-run.aggregate";
import type { PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { groupBy, inListChunks, paginate, totalOf } from "../../../../shared/database/pagination";
import { payrollRunEmployees, payrollRuns } from "./hr-payroll.tables";

@Injectable()
export class PayrollRunRepository implements PayrollRunRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // السطور بتتسجل مرة واحدة بس (وقت أول save() لصف جديد) وبعدين تفضل زي ما هي للأبد؛ save() بعد كده
  // (approve/cancel، أو استيراد قائمة تاريخية بحالتها النهائية من الأول) بيحدّث صف القائمة نفسها بس،
  // من غير ما يلمس السطور خالص. الصف الأول بيتسجّل بحالة DRAFT مؤقتًا دايمًا (بغض النظر عن حالة run
  // الفعلية) عشان الـtrigger اللي بيمنع تعديل سطور قائمة مش DRAFT يسمح بإدخال السطور نفسها وقت
  // الإنشاء - نفس سبب JournalEntryRepository بالظبط. مفيش trigger على جدول payroll_runs نفسه،
  // فتحديث عمود status بعد كده (حتى لنفس القيمة) آمن دايمًا.
  async save(run: PayrollRun): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.id, run.id)).limit(1);

      if (!existing) {
        await tx.insert(payrollRuns).values({
          id: run.id,
          year: run.year,
          month: run.month,
          status: "DRAFT",
          total_net_pay: run.totalNetPay,
          created_by: run.createdBy,
          created_at: run.createdAt,
          approved_by: run.approvedBy,
          approved_at: run.approvedAt,
          cancelled_by: run.cancelledBy,
          cancelled_at: run.cancelledAt,
          cancellation_reason: run.cancellationReason,
          legacy_payroll_run_id: run.legacyPayrollRunId,
        });

        for (const line of run.employees) {
          await tx.insert(payrollRunEmployees).values({
            id: line.id,
            payroll_run_id: run.id,
            employee_id: line.employeeId,
            employee_name: line.employeeName,
            branch_id: line.branchId,
            gross_pay: line.grossPay,
            advances: line.advances,
            penalties: line.penalties,
            bonuses: line.bonuses,
            net_pay: line.netPay,
          });
        }

        if (run.status === "DRAFT") return;
      }

      await tx
        .update(payrollRuns)
        .set({
          status: run.status,
          total_net_pay: run.totalNetPay,
          approved_by: run.approvedBy,
          approved_at: run.approvedAt,
          cancelled_by: run.cancelledBy,
          cancelled_at: run.cancelledAt,
          cancellation_reason: run.cancellationReason,
        })
        .where(eq(payrollRuns.id, run.id));
    });
  }

  async findById(id: string): Promise<PayrollRun | null> {
    const [row] = await this.db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async findByLegacyPayrollRunId(legacyId: number): Promise<PayrollRun | null> {
    const [row] = await this.db.select().from(payrollRuns).where(eq(payrollRuns.legacy_payroll_run_id, legacyId)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(row.id));
  }

  async findActiveByPeriod(year: number, month: number): Promise<PayrollRun | null> {
    const [row] = await this.db
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.year, year), eq(payrollRuns.month, month), ne(payrollRuns.status, "CANCELLED")))
      .limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(row.id));
  }

  async list(filter?: { status?: string; year?: number }, page?: PageRequest): Promise<{ runs: PayrollRun[]; total: number }> {
    const where = and(filter?.status ? eq(payrollRuns.status, filter.status) : undefined, filter?.year ? eq(payrollRuns.year, filter.year) : undefined);
    const query = this.db.select().from(payrollRuns).where(where).orderBy(desc(payrollRuns.year), desc(payrollRuns.month), desc(payrollRuns.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(payrollRuns).where(where)));
    // NEO-6: the employee lines of every run on the page in one query per 1000 runs instead of one per run
    const lines: (typeof payrollRunEmployees.$inferSelect)[] = [];
    for (const ids of inListChunks(rows.map((r) => r.id))) {
      lines.push(...(await this.db.select().from(payrollRunEmployees).where(inArray(payrollRunEmployees.payroll_run_id, ids))));
    }
    const byRun = groupBy(lines, (l) => l.payroll_run_id);
    return { runs: rows.map((row) => this.toDomain(row, byRun.get(row.id) ?? [])), total };
  }

  // بيمسح السطور الأول (وهي لسه DRAFT فمسموح بالتريجر) قبل ما يمسح القائمة نفسها - ترتيب متعمّد عشان
  // نتجنب أي غموض في توقيت ON DELETE CASCADE مع الـtrigger
  async deleteDraft(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(payrollRunEmployees).where(eq(payrollRunEmployees.payroll_run_id, id));
      await tx.delete(payrollRuns).where(and(eq(payrollRuns.id, id), eq(payrollRuns.status, "DRAFT")));
    });
  }

  private loadLines(runId: string): Promise<(typeof payrollRunEmployees.$inferSelect)[]> {
    return this.db.select().from(payrollRunEmployees).where(eq(payrollRunEmployees.payroll_run_id, runId));
  }

  private toDomain(row: typeof payrollRuns.$inferSelect, lineRows: (typeof payrollRunEmployees.$inferSelect)[]): PayrollRun {
    return PayrollRun.reconstitute(row.id, {
      year: row.year,
      month: row.month,
      status: row.status as PayrollRunStatus,
      employees: lineRows.map((l) => ({
        id: l.id,
        employeeId: l.employee_id,
        employeeName: l.employee_name,
        branchId: l.branch_id,
        grossPay: Number(l.gross_pay),
        advances: Number(l.advances),
        penalties: Number(l.penalties),
        bonuses: Number(l.bonuses),
        netPay: Number(l.net_pay),
      })),
      totalNetPay: Number(row.total_net_pay),
      createdBy: row.created_by,
      createdAt: row.created_at,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      legacyPayrollRunId: row.legacy_payroll_run_id,
    });
  }
}
