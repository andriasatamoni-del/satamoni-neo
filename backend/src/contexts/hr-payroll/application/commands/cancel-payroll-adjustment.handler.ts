import { Inject, Injectable } from "@nestjs/common";
import { PayrollAdjustment } from "../../domain/payroll-adjustment.aggregate";
import {
  PAYROLL_ADJUSTMENT_REPOSITORY,
  type PayrollAdjustmentRepositoryPort,
} from "../../domain/ports/payroll-adjustment-repository.port";
import { PayrollAdjustmentNotFoundError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";

export interface CancelPayrollAdjustmentCommand {
  adjustmentId: string;
  reason: string;
  cancelledBy?: string | null;
}

@Injectable()
export class CancelPayrollAdjustmentHandler {
  constructor(
    @Inject(PAYROLL_ADJUSTMENT_REPOSITORY) private readonly adjustments: PayrollAdjustmentRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  // BL-10: row lock + "linked to a payroll run" guard (a consumed adjustment can not be cancelled behind the run's back)
  async execute(command: CancelPayrollAdjustmentCommand): Promise<PayrollAdjustment> {
    return this.tx.run(async () => {
      if (!(await this.tx.lockRow("payroll_adjustments", command.adjustmentId))) throw new PayrollAdjustmentNotFoundError();
      const adjustment = await this.adjustments.findById(command.adjustmentId);
      if (!adjustment) throw new PayrollAdjustmentNotFoundError();
      auditDetail({ before: { status: adjustment.status, amount: adjustment.amount, type: adjustment.adjustmentType } });

      adjustment.cancel({ reason: command.reason, cancelledBy: command.cancelledBy });
      await this.adjustments.save(adjustment);
      auditDetail({ after: { status: adjustment.status, reason: adjustment.cancellationReason } });
      return adjustment;
    });
  }
}
