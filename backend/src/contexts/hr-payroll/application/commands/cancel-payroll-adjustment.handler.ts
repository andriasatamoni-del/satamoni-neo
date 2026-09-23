import { Inject, Injectable } from "@nestjs/common";
import { PayrollAdjustment } from "../../domain/payroll-adjustment.aggregate";
import {
  PAYROLL_ADJUSTMENT_REPOSITORY,
  type PayrollAdjustmentRepositoryPort,
} from "../../domain/ports/payroll-adjustment-repository.port";
import { PayrollAdjustmentNotFoundError } from "../../domain/errors";

export interface CancelPayrollAdjustmentCommand {
  adjustmentId: string;
  reason: string;
  cancelledBy?: string | null;
}

@Injectable()
export class CancelPayrollAdjustmentHandler {
  constructor(@Inject(PAYROLL_ADJUSTMENT_REPOSITORY) private readonly adjustments: PayrollAdjustmentRepositoryPort) {}

  async execute(command: CancelPayrollAdjustmentCommand): Promise<PayrollAdjustment> {
    const adjustment = await this.adjustments.findById(command.adjustmentId);
    if (!adjustment) throw new PayrollAdjustmentNotFoundError();

    adjustment.cancel({ reason: command.reason, cancelledBy: command.cancelledBy });
    await this.adjustments.save(adjustment);
    return adjustment;
  }
}
