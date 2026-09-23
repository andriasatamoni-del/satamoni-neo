import type { PayrollAdjustment } from "../payroll-adjustment.aggregate";

export interface PayrollAdjustmentRepositoryPort {
  save(adjustment: PayrollAdjustment): Promise<void>;
  findById(id: string): Promise<PayrollAdjustment | null>;
  list(filter?: { employeeId?: string; fromDate?: Date; toDate?: Date; status?: string }): Promise<PayrollAdjustment[]>;
}

export const PAYROLL_ADJUSTMENT_REPOSITORY = Symbol("PAYROLL_ADJUSTMENT_REPOSITORY");
