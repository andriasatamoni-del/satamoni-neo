import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, inArray } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { cashierShifts } from "../../../shifts/infrastructure/persistence/shifts.tables";
import type { TerminationBlocker } from "../../domain/termination-blocker";
import { payrollRunEmployees, payrollRuns } from "../../infrastructure/persistence/hr-payroll.tables";

// بيرجّع كل حاجة معلّقة صراحة (مش بيخفيها) قبل إنهاء خدمة موظف - نفس فلسفة checkTerminationBlockers
// بالريبو القديم بالظبط (db/employee-termination.js). قرار نطاق موثّق: بندي "الموظف مديون للشركة"
// و"السائق المرتبط لسه شايل كاش/معاه طلب مُسند" مش منقولين هنا - الأول محتاج اتفاقية حساب محاسبي لكل
// موظف (1160-{id}) مش موجودة في neo، والتاني محتاج ربط drivers.employee_id مش موجود في schema neo
// أصلًا (Driver وEmployee كيانين منفصلين تمامًا هنا لسه)
@Injectable()
export class TerminationBlockersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async check(input: { employeeId: string; userId: string | null }): Promise<TerminationBlocker[]> {
    const blockers: TerminationBlocker[] = [];

    if (input.userId) {
      const openShifts = await this.db
        .select({ id: cashierShifts.id, status: cashierShifts.status, opened_at: cashierShifts.opened_at })
        .from(cashierShifts)
        .where(and(eq(cashierShifts.user_id, input.userId), inArray(cashierShifts.status, ["ACTIVE", "PENDING_REVIEW"])));
      if (openShifts.length > 0) {
        blockers.push({
          code: "OPEN_SHIFT",
          message: `الموظف ده لسه عنده ${openShifts.length} شيفت شغال أو محتاج مراجعة مدير`,
          shifts: openShifts.map((s) => ({ id: s.id, status: s.status, openedAt: s.opened_at.toISOString() })),
        });
      }
    }

    const unpaidRuns = await this.db
      .select({ year: payrollRuns.year, month: payrollRuns.month, net_pay: payrollRunEmployees.net_pay })
      .from(payrollRunEmployees)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunEmployees.payroll_run_id))
      .where(
        and(
          eq(payrollRunEmployees.employee_id, input.employeeId),
          eq(payrollRuns.status, "APPROVED"),
          gt(payrollRunEmployees.net_pay, 0)
        )
      );
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
