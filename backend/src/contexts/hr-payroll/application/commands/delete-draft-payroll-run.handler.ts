import { Inject, Injectable } from "@nestjs/common";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import { PayrollRunNotFoundError } from "../../domain/errors";

// نفس القسم التاني من إصلاح الباج الموروث (راجع migration 012) - مسار حذف صريح لقائمة DRAFT بدل ما
// تفضل عالقة للأبد لو غلط فيها من الأول
@Injectable()
export class DeleteDraftPayrollRunHandler {
  constructor(@Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort) {}

  async execute(payrollRunId: string): Promise<void> {
    const run = await this.payrollRuns.findById(payrollRunId);
    if (!run) throw new PayrollRunNotFoundError();
    run.assertDraft();
    await this.payrollRuns.deleteDraft(payrollRunId);
  }
}
