import { Inject, Injectable } from "@nestjs/common";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import {
  PAYROLL_ADJUSTMENT_REPOSITORY,
  type PayrollAdjustmentRepositoryPort,
} from "../../domain/ports/payroll-adjustment-repository.port";
import { PayrollRunNotFoundError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";

// نفس القسم التاني من إصلاح الباج الموروث (راجع migration 012) - مسار حذف صريح لقائمة DRAFT بدل ما
// تفضل عالقة للأبد لو غلط فيها من الأول. Phase 3.1: حذف المسودة بيفك ارتباط التسويات (سلف/جزاءات/مكافآت)
// عشان تتحسب في القائمة الجاية (BL-10)
@Injectable()
export class DeleteDraftPayrollRunHandler {
  constructor(
    @Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort,
    @Inject(PAYROLL_ADJUSTMENT_REPOSITORY) private readonly adjustments: PayrollAdjustmentRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(payrollRunId: string): Promise<void> {
    await this.tx.run(async () => {
      if (!(await this.tx.lockRow("payroll_runs", payrollRunId))) throw new PayrollRunNotFoundError();
      const run = await this.payrollRuns.findById(payrollRunId);
      if (!run) throw new PayrollRunNotFoundError();
      run.assertDraft();
      auditDetail({ before: { year: run.year, month: run.month, status: run.status, totalNetPay: run.totalNetPay } });
      await this.adjustments.unlinkFromRun(payrollRunId);
      await this.payrollRuns.deleteDraft(payrollRunId);
    });
  }
}
