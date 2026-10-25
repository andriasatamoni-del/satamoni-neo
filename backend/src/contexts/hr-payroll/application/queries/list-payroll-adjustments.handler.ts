import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { PayrollAdjustment } from "../../domain/payroll-adjustment.aggregate";
import {
  PAYROLL_ADJUSTMENT_REPOSITORY,
  type PayrollAdjustmentRepositoryPort,
} from "../../domain/ports/payroll-adjustment-repository.port";

@Injectable()
export class ListPayrollAdjustmentsHandler {
  constructor(@Inject(PAYROLL_ADJUSTMENT_REPOSITORY) private readonly adjustments: PayrollAdjustmentRepositoryPort) {}

  execute(filter?: { employeeId?: string; fromDate?: Date; toDate?: Date; status?: string }, page?: PageRequest): Promise<{ rows: PayrollAdjustment[]; total: number }> {
    return this.adjustments.listPage(filter, page);
  }
}
