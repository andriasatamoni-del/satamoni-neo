import { Inject, Injectable } from "@nestjs/common";
import { PayrollAdjustment } from "../../domain/payroll-adjustment.aggregate";
import {
  PAYROLL_ADJUSTMENT_REPOSITORY,
  type PayrollAdjustmentRepositoryPort,
} from "../../domain/ports/payroll-adjustment-repository.port";

@Injectable()
export class ListPayrollAdjustmentsHandler {
  constructor(@Inject(PAYROLL_ADJUSTMENT_REPOSITORY) private readonly adjustments: PayrollAdjustmentRepositoryPort) {}

  execute(filter?: { employeeId?: string; fromDate?: Date; toDate?: Date; status?: string }): Promise<PayrollAdjustment[]> {
    return this.adjustments.list(filter);
  }
}
