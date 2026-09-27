import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { TerminationBlocker } from "../../domain/termination-blocker";

// بيرجّع كل حاجة معلّقة صراحة (مش بيخفيها) قبل إنهاء خدمة موظف - نفس فلسفة checkTerminationBlockers
// بالريبو القديم بالظبط (db/employee-termination.js). قرار نطاق موثّق: بندي "الموظف مديون للشركة"
// و"السائق المرتبط لسه شايل كاش/معاه طلب مُسند" مش منقولين هنا - الأول محتاج اتفاقية حساب محاسبي لكل
// موظف (1160-{id}) مش موجودة في neo، والتاني محتاج ربط drivers.employee_id مش موجود في schema neo
// أصلًا (Driver وEmployee كيانين منفصلين تمامًا هنا لسه)
@Injectable()
export class TerminationBlockersService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async check(input: { employeeId: string; userId: string | null }): Promise<TerminationBlocker[]> {
    const blockers: TerminationBlocker[] = [];

    if (input.userId) {
      const openShifts = await this.db
        .selectFrom("cashier_shifts")
        .select(["id", "status", "opened_at"])
        .where("user_id", "=", input.userId)
        .where("status", "in", ["ACTIVE", "PENDING_REVIEW"])
        .execute();
      if (openShifts.length > 0) {
        blockers.push({
          code: "OPEN_SHIFT",
          message: `الموظف ده لسه عنده ${openShifts.length} شيفت شغال أو محتاج مراجعة مدير`,
          shifts: openShifts.map((s) => ({ id: s.id, status: s.status, openedAt: s.opened_at.toISOString() })),
        });
      }
    }

    const unpaidRuns = await this.db
      .selectFrom("payroll_run_employees")
      .innerJoin("payroll_runs", "payroll_runs.id", "payroll_run_employees.payroll_run_id")
      .select(["payroll_runs.year as year", "payroll_runs.month as month", "payroll_run_employees.net_pay as net_pay"])
      .where("payroll_run_employees.employee_id", "=", input.employeeId)
      .where("payroll_runs.status", "=", "APPROVED")
      .where("payroll_run_employees.net_pay", ">", 0)
      .execute();
    if (unpaidRuns.length > 0) {
      const total = unpaidRuns.reduce((s, r) => s + Number(r.net_pay), 0);
      blockers.push({
        code: "UNPAID_PAYROLL",
        message: `فيه ${unpaidRuns.length} تشغيلة راتب معتمدة للموظف ده (${total.toFixed(2)} ج.م)`,
        runs: unpaidRuns.map((r) => ({ year: r.year, month: r.month, netPay: Number(r.net_pay) })),
      });
    }

    return blockers;
  }
}
