import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { PayrollRun, type PayrollRunStatus } from "../../domain/payroll-run.aggregate";
import type { PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import type { PayrollRunsTable, PayrollRunEmployeesTable } from "./hr-payroll.schema";

@Injectable()
export class KyselyPayrollRunRepository implements PayrollRunRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  // السطور بتتسجل مرة واحدة بس (وقت أول save() لصف جديد) وبعدين تفضل زي ما هي للأبد؛ save() بعد كده
  // (approve/cancel، أو استيراد قائمة تاريخية بحالتها النهائية من الأول) بيحدّث صف القائمة نفسها بس،
  // من غير ما يلمس السطور خالص. الصف الأول بيتسجّل بحالة DRAFT مؤقتًا دايمًا (بغض النظر عن حالة run
  // الفعلية) عشان الـtrigger اللي بيمنع تعديل سطور قائمة مش DRAFT يسمح بإدخال السطور نفسها وقت
  // الإنشاء - نفس سبب KyselyJournalEntryRepository بالظبط. مفيش trigger على جدول payroll_runs نفسه،
  // فتحديث عمود status بعد كده (حتى لنفس القيمة) آمن دايمًا.
  async save(run: PayrollRun): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const existing = await trx.selectFrom("payroll_runs").select("id").where("id", "=", run.id).executeTakeFirst();

      if (!existing) {
        await trx
          .insertInto("payroll_runs")
          .values({
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
          })
          .execute();

        for (const line of run.employees) {
          await trx
            .insertInto("payroll_run_employees")
            .values({
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
            })
            .execute();
        }

        if (run.status === "DRAFT") return;
      }

      await trx
        .updateTable("payroll_runs")
        .set({
          status: run.status,
          total_net_pay: run.totalNetPay,
          approved_by: run.approvedBy,
          approved_at: run.approvedAt,
          cancelled_by: run.cancelledBy,
          cancelled_at: run.cancelledAt,
          cancellation_reason: run.cancellationReason,
        })
        .where("id", "=", run.id)
        .execute();
    });
  }

  async findById(id: string): Promise<PayrollRun | null> {
    const row = await this.db.selectFrom("payroll_runs").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async findByLegacyPayrollRunId(legacyId: number): Promise<PayrollRun | null> {
    const row = await this.db.selectFrom("payroll_runs").selectAll().where("legacy_payroll_run_id", "=", legacyId).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(row.id));
  }

  async findActiveByPeriod(year: number, month: number): Promise<PayrollRun | null> {
    const row = await this.db
      .selectFrom("payroll_runs")
      .selectAll()
      .where("year", "=", year)
      .where("month", "=", month)
      .where("status", "<>", "CANCELLED")
      .executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(row.id));
  }

  async list(filter?: { status?: string }): Promise<PayrollRun[]> {
    let query = this.db.selectFrom("payroll_runs").selectAll();
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("year", "desc").orderBy("month", "desc").execute();
    const runs: PayrollRun[] = [];
    for (const row of rows) runs.push(this.toDomain(row, await this.loadLines(row.id)));
    return runs;
  }

  // بيمسح السطور الأول (وهي لسه DRAFT فمسموح بالتريجر) قبل ما يمسح القائمة نفسها - ترتيب متعمّد عشان
  // نتجنب أي غموض في توقيت ON DELETE CASCADE مع الـtrigger
  async deleteDraft(id: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`DELETE FROM payroll_run_employees WHERE payroll_run_id = ${id}`.execute(trx);
      await trx.deleteFrom("payroll_runs").where("id", "=", id).where("status", "=", "DRAFT").execute();
    });
  }

  private loadLines(runId: string): Promise<Selectable<PayrollRunEmployeesTable>[]> {
    return this.db.selectFrom("payroll_run_employees").selectAll().where("payroll_run_id", "=", runId).execute();
  }

  private toDomain(row: Selectable<PayrollRunsTable>, lineRows: Selectable<PayrollRunEmployeesTable>[]): PayrollRun {
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
